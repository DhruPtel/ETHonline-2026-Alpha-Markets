// PHASE-8 Task 1 — the demo market: create one, list them, retire the abandoned.
//
//   npx tsx --env-file=.env scripts/ops/demo-market.ts --presets          ← free, checks the pins
//   npx tsx --env-file=.env scripts/ops/demo-market.ts --seed             ← plan only, free
//   npx tsx --env-file=.env scripts/ops/demo-market.ts --seed --send      ← ⚠️ SPENDS, six markets
//   npx tsx --env-file=.env scripts/ops/demo-market.ts --list             ← free
//   npx tsx --env-file=.env scripts/ops/demo-market.ts --create           ← plan only, free
//   npx tsx --env-file=.env scripts/ops/demo-market.ts --create --send    ← ⚠️ SPENDS
//   npx tsx --env-file=.env scripts/ops/demo-market.ts --retire           ← plan only, free
//   npx tsx --env-file=.env scripts/ops/demo-market.ts --retire --send    ← ⚠️ SPENDS
//
// ⚠️ **THIS SPENDS REAL MONEY.** Gas on Arc is USDC and `--create --send` also stakes 0.01 USDC of
// the analyst's own. Every run prints what it is about to do and stops there unless `--send` is given.
//
// ── ⚠️ WHAT A DEMO MARKET IS, AND WHY IT IS NOT A FORECAST ──────────────────────────────────────
//
// A past-day question carried on **future** times. The deployed contract refuses the obvious shape:
// `_open` requires `now < closeTime` for both `commitPrediction` and `stake`, and `createMarket`
// requires `closeTime < observationEnd` — so for a genuinely past day, staking always reverts.
// `spec.ts::demoQuestionCore` carries the escape and the full argument for it.
//
// ⚠️ **It is past-posting, deliberately, and there is no version of this that is not.** The judge is
// betting on a settled race. Nothing built on this may be presented as a forecast or counted in the
// analyst's record — `rehearsal.ts::pastPosted` is the read-side half that keeps it out, and Task 2
// is what applies that to every surface.
//
// ── ⚠️ IT GOES THROUGH `prepareDemo`, NOT AROUND IT ─────────────────────────────────────────────
//
// The tempting shortcut is to hand-build a `MarketPlan` here and call `create()` directly, saving a
// change to `market.ts`. That trade is wrong: `prepare`'s guard 8 is the admission check, the thing
// that stops a commit against a report that was never tokenized, and a demo path that skipped it
// would be a second, weaker way onto the chain. All nine guards run, in the same order.
//
// ── ⚠️ THE PROTECTED MARKETS ARE EXCLUDED BY ARITHMETIC, NOT BY A DENYLIST ──────────────────────
//
// Markets 6, 7, 11 and 12 hold real money. `--retire` cannot reach them because `pastPosted` is
// false for every one — each closed staking before the day it measures began, which is what makes it
// a forecast. There is no id list to keep in sync and no flag to get wrong. The run asserts it aloud
// anyway, because the cost of being wrong is somebody's dollar.

import { ethers } from 'ethers';
import { analystIdentity, arcProvider } from '../../src/arc/arc.js';
import { MarketRefused, commit, create, prepareDemo } from '../../src/arc/market.js';
import { pastPosted } from '../../src/arc/rehearsal.js';
import { ResolveRefused, prepare as planSettlement, voidMarket } from '../../src/arc/resolve.js';
import { recordSettlement, settle } from '../../src/arc/settle.js';
import { DEMO_RETIREMENT_SECONDS, validateSpec } from '../../src/arc/spec.js';
import { DEMO_SLUG, DEMO_STAKING_SECONDS, MAX_OPEN_DEMO_MARKETS, PRESETS } from '../../app/markets/demo.js';
import { close } from '../../src/store/markets.js';
import { db } from '../../src/store/db.js';

const argv = process.argv.slice(2);
const flag = (name: string): string | undefined =>
  argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`))?.split('=')[1]
  ?? (argv.includes(`--${name}`) ? '' : undefined);
const SEND = flag('send') !== undefined;

const SLUG = 'aave-v3-ethereum';
const METRIC = 'totalDepositBalanceUSD' as const;
/** ⚠️ 0.01 USDC, the smallest stake markets 7 and 12 used. A demo costs what it has to and no more. */
const STAKE = ethers.parseUnits('0.01', 18).toString();
/** Seconds of staking window. ⚠️ Shorter than ~120s and the judge loses the race to their own
 *  wallet confirmation dialog; `createMarket` through Circle already eats ~30s of it. */
const WINDOW = Number(flag('window') || 180);
/** ⚠️ Two days back, not one: `demoQuestionCore` needs the day settleable (its end plus the
 *  freshness margin), and two days is past that under any indexer lag worth planning for. */
const DAY = flag('day') || new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);

const PROTECTED = ['6', '7', '11', '12'];
const usdc = (wei: bigint): string => `${ethers.formatUnits(wei, 18)} USDC`;

interface Row {
  id: string; chain_market_id: string | null; observed_day: string; close_time: Date;
  observation_end: Date; resolve_deadline: Date; landed_at: Date | null;
  resolved_at: Date | null; voided_at: Date | null; spec_json: string;
}

/** Every market the arithmetic calls past-posted. ⚠️ **The predicate is the filter** — see the header. */
async function demoMarkets(): Promise<Row[]> {
  const rows = await db()<Row[]>`
    SELECT id, chain_market_id, observed_day, close_time, observation_end, resolve_deadline,
           landed_at, resolved_at, voided_at, spec_json
    FROM markets ORDER BY created_at`;
  const demo = rows.filter((r) => pastPosted(r.close_time, r.observed_day));

  const reached = demo.filter((r) => r.chain_market_id && PROTECTED.includes(r.chain_market_id));
  if (reached.length > 0) {
    console.error(`\n❌ STOP  pastPosted() matched protected market(s) ${reached.map((r) => r.chain_market_id).join(', ')}.`);
    console.error('   Those hold real stakes and are forecasts. Refusing to touch anything.\n');
    process.exit(1);
  }
  return demo;
}

const state = (r: Row): string =>
  r.voided_at ? 'voided' : r.resolved_at ? 'resolved' : r.landed_at ? 'OPEN' : 'never landed';

async function list(): Promise<void> {
  const demo = await demoMarkets();
  console.log(`\n══ demo markets — ${demo.length} past-posted of all stored\n`);
  if (demo.length === 0) {
    console.log('  none yet. `--create --send` makes one.\n');
    return;
  }
  for (const r of demo) {
    const s = JSON.parse(r.spec_json) as { metric: string; comparison: string; threshold: string };
    console.log(`  ${r.id}  chain ${r.chain_market_id ?? '—'}  ${state(r)}`);
    console.log(`    asks ${s.metric} ${s.comparison} ${s.threshold} on ${r.observed_day}`);
    console.log(`    closed ${r.close_time.toISOString()}   retirable ${r.resolve_deadline.toISOString()}`);
  }
  console.log('\n  ⚠️ None of these is a forecast. Staking was open after the day they measure.\n');
}

async function createOne(): Promise<void> {
  // ── The question: a real threshold around the figure the day actually posted ──
  //
  // ⚠️ Read from the SNAPSHOT series, the one settlement will re-read. `commit-market.ts` learned
  // this the expensive way: the report reads the protocol entity and settlement reads the daily
  // snapshot, and they disagree by ~0.5% on the same metric and day.
  const probe = await settle(validateSpec({ slug: SLUG, metric: METRIC, comparison: 'above', threshold: '1', observedDay: DAY }));
  if (probe.kind !== 'settled') {
    console.error(`\n❌ STOP  ${DAY} has no snapshot for ${SLUG} — ${probe.reason}\n`);
    process.exit(1);
  }
  // 1% under the real figure, so the question resolves TRUE and the reveal has something to show.
  const threshold = ((BigInt(probe.observed.split('.')[0]!) * 99n) / 100n).toString();

  const [report] = await db()<{ hash: string }[]>`
    SELECT r.hash FROM reports r JOIN report_tokens rt ON rt.report_hash = r.hash
    WHERE r.canonical_json LIKE ${`%${SLUG}.${METRIC}%`}
    ORDER BY r.created_at LIMIT 1`;
  if (!report) {
    console.error(`\n❌ STOP  no tokenized report carries ${SLUG}.${METRIC}. Guard 8 would refuse.\n`);
    process.exit(1);
  }

  // ⚠️ **The chain's clock, not ours.** `_open` compares `block.timestamp`; a local clock running
  // slightly ahead would build a window the contract thinks is already shut.
  const block = await arcProvider().getBlock('latest');
  if (!block) { console.error('\n❌ STOP  could not read the latest Arc block.\n'); process.exit(1); }
  const closeTime = block.timestamp + WINDOW;
  // ⚠️ +1s, the minimum the contract allows and the shape `drive-market.ts` already proved. The
  // reveal unlocks at `observationEnd`, so every second here is a second the judge waits.
  const observationEnd = closeTime + 1;

  const plan = await prepareDemo({
    reportHash: report.hash,
    spec: { slug: SLUG, metric: METRIC, comparison: 'above', threshold, observedDay: DAY },
    closeTime, observationEnd,
    resolveDeadline: observationEnd + DEMO_RETIREMENT_SECONDS,
    amount: STAKE,
  }).catch((e: unknown) => {
    console.error(`\n❌ REFUSED  ${(e as Error).message}\n`);
    process.exit(e instanceof MarketRefused ? 2 : 1);
  });

  console.log('\n══ the plan — ⚠️ a DEMO market, past-posted, never a forecast\n');
  console.log(`  question    is ${plan.spec.slug}.${plan.spec.metric} above ${plan.spec.threshold}`);
  console.log(`              on ${plan.spec.observedDay} (UTC)?  ⚠️ already answered: ${probe.observed}`);
  console.log(`  report      ${plan.reportHash}`);
  console.log(`  bound to    proxy ${plan.binding.proxyAddress}`);
  console.log(`  staking     closes ${new Date(plan.core.closeTime * 1000).toISOString()}  (${WINDOW}s from the chain clock)`);
  console.log(`  reveal      unlocks ${new Date(plan.core.observationEnd * 1000).toISOString()}`);
  console.log(`  retirable   ${new Date(plan.core.resolveDeadline * 1000).toISOString()}  (+${DEMO_RETIREMENT_SECONDS}s)`);
  console.log(`  analyst     stakes ${usdc(BigInt(plan.amount))} on ${plan.decision.side ? 'TRUE' : 'FALSE'}`);
  console.log(`  side from   the ${plan.decision.decidedFromDay} snapshot: ${plan.decision.observed}`);
  console.log(`  ⚠️ the side is read from a DIFFERENT day than settlement will — see prepareDemo.`);
  console.log(`  market id   ${plan.marketId}`);

  if (!SEND) {
    console.log('\n  Plan only. Nothing spent. Add --send to put it on chain.\n');
    return;
  }

  const identity = await analystIdentity();
  const before = await arcProvider().getBalance(identity.address);

  console.log('\n══ createMarket — ⚠️ spending');
  const made = await create(plan);
  console.log(`  chain market ${made.chainMarketId}${made.alreadyLanded ? '  (already landed)' : `  ${made.txHash}`}`);

  // ⚠️ **The check Task 1 exists to run.** Everything above is arithmetic that could be wrong; this
  // is the only line that finds out whether `_open` accepts a commit on a past-day question.
  console.log('\n══ commitPrediction against a future closeTime — ⚠️ spending, and this is the proof');
  const committed = await commit(plan, made.chainMarketId);
  console.log(`  chain claim  ${committed.chainClaimId}${committed.alreadyLanded ? '  (already landed)' : `  ${committed.txHash}`}`);

  const after = await arcProvider().getBalance(identity.address);
  console.log(`\n  spent ${usdc(before - after)} (stake ${usdc(BigInt(plan.amount))} + gas)`);
  console.log(`\n  ✅ staking is open until ${new Date(plan.core.closeTime * 1000).toISOString()}.`);
  console.log(`     A browser wallet can stake on chain market ${made.chainMarketId}, claim ${committed.chainClaimId}.\n`);
}

/**
 * Void demo markets nobody finished. ⚠️ **Spends one `voidMarket` each.**
 *
 * ⚠️ **This is a BACKSTOP, not the main path, and the distinction decides what it should do.** The
 * resolve cron's find-work query filters only on `observation_end <= asOf` and the two landmarks —
 * no `landed_at`, no `directed_at` — so it picks up any unresolved demo market two minutes after it
 * is created and resolves it normally. The one case it cannot fix is a day with **no snapshot**,
 * where `resolve.ts` guard 8 retries until `resolveDeadline` and voids after it. That is the only
 * thing this reaches, and voiding refunds every staker their own stake — so a judge who staked on a
 * dead day gets their money back in fifteen minutes rather than two days.
 */
async function retire(): Promise<void> {
  const open = (await demoMarkets()).filter((r) => r.landed_at && !r.resolved_at && !r.voided_at);
  console.log(`\n══ retire — ${open.length} demo market(s) still open\n`);

  for (const r of open) {
    let plan;
    try {
      plan = await planSettlement(r.id);
    } catch (e) {
      // ⚠️ Guard 4 — no evidence row — is the ordinary state of a market whose reveal never ran.
      // Settle it here so the guard can be reached rather than reporting "refused" and stopping.
      if (e instanceof ResolveRefused && e.message.includes('no settlement_evidence row')) {
        const s = await settle(validateSpec(JSON.parse(r.spec_json) as Parameters<typeof validateSpec>[0]));
        await recordSettlement(r.id, s);
        plan = await planSettlement(r.id).catch((e2: unknown) => {
          console.log(`  ${r.id}  still refused: ${(e2 as Error).message.split('.')[0]}`);
          return null;
        });
      } else {
        console.log(`  ${r.id}  refused: ${(e as Error).message.split('.')[0]}`);
        continue;
      }
    }
    if (!plan) continue;

    if (plan.action !== 'void') {
      console.log(`  ${r.id}  chain ${plan.chainMarketId}  action "${plan.action}" — not abandoned, leaving it.`);
      console.log(`    ${plan.reason}`);
      continue;
    }
    console.log(`  ${r.id}  chain ${plan.chainMarketId}  VOID — ${plan.reason}`);
    if (!SEND) { console.log('    plan only; add --send to void it.'); continue; }
    const done = await voidMarket(plan);
    console.log(`    voided ${done.txHash} — every stake refundable.`);
  }
  console.log('');
}

/**
 * Re-read every preset's day and say whether the pinned threshold still sits where its description
 * claims. ⚠️ **A check, never a rewrite.** The thresholds are pinned precisely so a reindex cannot
 * move them silently; a script that "corrected" them on the fly would defeat the pin. Drift is
 * printed and a human decides.
 */
async function presets(): Promise<void> {
  console.log(`\n══ preset questions — ${PRESETS.length} pinned, re-read against The Graph now\n`);
  let drift = 0;
  for (const p of PRESETS) {
    const spec = validateSpec({ slug: DEMO_SLUG, metric: p.metric, comparison: 'above', threshold: p.threshold, observedDay: p.observedDay });
    const r = await settle(spec);
    if (r.kind !== 'settled') {
      console.log(`  ${p.id}  ⚠️ ${p.observedDay} ${p.metric} — ${r.kind}. This question cannot be played.`);
      drift += 1;
      continue;
    }
    const figure = Number(r.observed);
    const pct = ((Number(p.threshold) - figure) / figure) * 100;
    const near = Math.abs(pct) < 1;
    const saysNear = p.distance.includes('within 1%');
    const agrees = near === saysNear;
    if (!agrees) drift += 1;
    console.log(
      `  ${p.id}  ${agrees ? '✅' : '⚠️'} ${p.metric.padEnd(22)} ${p.observedDay}  ` +
      `resolves ${r.outcome ? 'TRUE ' : 'FALSE'}  threshold is ${pct >= 0 ? '+' : ''}${pct.toFixed(2)}% from ${r.observed.slice(0, 14)}`,
    );
    if (!agrees) console.log(`        pinned description says "${p.distance}" — that no longer holds.`);
  }
  console.log(drift === 0
    ? '\n  ✅ every pin still describes its question truthfully.\n'
    : `\n  ⚠️ ${drift} preset(s) drifted. Edit app/markets/demo.ts by hand — do not let a script move a pin.\n`);
}

/**
 * Put the six preset questions on chain, ready to play. ⚠️ **Spends ~0.02 USDC per market.**
 *
 * ⚠️ **THE PAGE IS NOW THE PRIMARY PATH — `SeedButton` on `/markets` does this with no secret**,
 * bounded by the open-market cap and the cost rather than a password. This stays as the operator's
 * escape hatch: it can be run before a demo day without opening a browser, and it prints a plan.
 *
 * ⚠️ **Staggered closeTimes.** Six markets created in one pass would otherwise all shut within
 * seconds of each other, giving a judge one playable market and five corpses. Each is offset by a
 * full staking window so they come due in sequence.
 *
 * ⚠️ **The cap is deliberately NOT applied here.** It exists to stop a browser looping `resetDemo
 * Market`; an operator seeding a demo day is the case it was never meant to catch. The count is
 * printed so the decision is visible rather than silent.
 */
async function seed(): Promise<void> {
  const block = await arcProvider().getBlock('latest');
  if (!block) { console.error('\n❌ STOP  could not read the Arc chain clock.\n'); process.exit(1); }

  const [report] = await db()<{ hash: string }[]>`
    SELECT r.hash FROM reports r JOIN report_tokens rt ON rt.report_hash = r.hash
    WHERE r.canonical_json LIKE ${`%${DEMO_SLUG}.totalDepositBalanceUSD%`}
    ORDER BY r.created_at LIMIT 1`;
  if (!report) { console.error('\n❌ STOP  no tokenized report to bind against.\n'); process.exit(1); }

  console.log(`\n══ seeding ${PRESETS.length} demo markets${SEND ? ' — ⚠️ SPENDING' : ' — plan only'}\n`);
  console.log(`  ⚠️ the open-market cap is ${MAX_OPEN_DEMO_MARKETS} and is NOT applied to a script run — the page's button tops up to it instead.\n`);

  const plans = [];
  for (const [i, preset] of PRESETS.entries()) {
    // ⚠️ Staggered, so they come due one at a time rather than all at once.
    const closeTime = block.timestamp + DEMO_STAKING_SECONDS * (i + 1);
    const observationEnd = closeTime + 1;
    try {
      const plan = await prepareDemo({
        reportHash: report.hash,
        spec: { slug: DEMO_SLUG, metric: preset.metric, comparison: 'above', threshold: preset.threshold, observedDay: preset.observedDay },
        closeTime, observationEnd,
        resolveDeadline: observationEnd + DEMO_RETIREMENT_SECONDS,
        amount: STAKE,
      });
      plans.push({ preset, plan, closeTime });
      console.log(`  ${preset.id}  ${preset.metric.padEnd(22)} ${preset.observedDay}  above ${preset.threshold.padStart(12)}  closes ${new Date(closeTime * 1000).toISOString().slice(11, 19)}Z`);
    } catch (e) {
      console.log(`  ${preset.id}  ❌ refused: ${(e as Error).message.slice(0, 96)}`);
    }
  }

  if (!SEND) {
    console.log('\n  Plan only. Nothing spent. Add --send to put them on chain.\n');
    return;
  }

  console.log('');
  for (const { preset, plan, closeTime } of plans) {
    const made = await create(plan);
    await commit(plan, made.chainMarketId);
    console.log(`  ${preset.id}  → /markets/${made.chainMarketId}  open until ${new Date(closeTime * 1000).toISOString().slice(11, 19)}Z`);
  }
  console.log(`\n  ✅ ${plans.length} markets live. Open /markets and play one.\n`);
}

if (flag('seed') !== undefined) await seed();
else if (flag('presets') !== undefined) await presets();
else if (flag('list') !== undefined) await list();
else if (flag('create') !== undefined) await createOne();
else if (flag('retire') !== undefined) await retire();
else console.log('\n  one of --presets, --seed, --list, --create, --retire. See the header for the full forms.\n');

await close();

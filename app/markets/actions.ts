'use server';

// The two things the demo surface can make happen on chain.
//
// ── ⚠️ ONE SPENDS THE ANALYST'S MONEY FROM A PAGE. IT IS GATED. ─────────────────────────────────
//
// `startDemoMarket` calls `createMarket` and `commitPrediction` through the analyst's Circle wallet
// — about 0.02 USDC of gas and stake per press. `tracking/DECISIONS.md` (2026-09-12) says exactly
// what puts the console lock back: *"the console being linked from the nav on a deployment a
// stranger can reach"*, because its buttons spend. **A demo button on `/markets` is that situation
// by another door**, so it takes the same `CONSOLE_SECRET` the console routes were built around.
//
// ⚠️ **The secret is compared AFTER `requiredEnv`, deliberately** — the ordering `lock.ts` chose so
// the lock is testable from outside. A missing env var throws its own error; a wrong secret is a
// refusal. The two are never the same message.
//
// ⚠️ **`NEXT_PUBLIC_` would defeat this entirely.** That prefix inlines a value into the client
// bundle at build time and serves it to every visitor. The secret exists in the environment and in
// the operator's head, and the two meet in this call's arguments.
//
// ── ⚠️ THE OTHER ONE IS UNGATED, AND HERE IS WHY THAT IS SAFE ───────────────────────────────────
//
// `revealDemoMarket` is the button the judge presses, so it cannot ask them for a secret. It spends
// ~0.0014 USDC of gas on `resolve`. Three things bound it:
//
//   · **It refuses any market that is not past-posted.** `pastPosted()` is checked first and hard.
//     Markets 6, 7, 11 and 12 are forecasts and this function cannot reach them at any price — the
//     arithmetic excludes them, not a denylist that could drift.
//   · **It is idempotent.** A market already settled comes back from `resolve.ts::prepare()` as
//     `reconcile`, which writes the landmark and submits nothing.
//   · **It can only act on markets that already exist**, and creating one requires the gated call
//     above. There is no way to manufacture work for it.
//
// ⚠️ **`settle()` → `recordSettlement()` → `prepare()` → `resolveMarket()`, in that order and never
// another.** `prepare()` takes the evidence hash off the stored row and never recomputes it, so the
// bytes must be written before it runs. A route that called `prepare()` first would put 32 bytes on
// chain committing to a record nobody kept, which `settle.ts` calls worse than no evidence at all.

import { ethers } from 'ethers';
import { MarketRefused, commit, create, prepareDemo } from '../../src/arc/market.js';
import { pastPosted } from '../../src/arc/rehearsal.js';
import { ResolveRefused, prepare as planSettlement, resolveMarket } from '../../src/arc/resolve.js';
import { scoreMarket } from '../../src/arc/score.js';
import { recordSettlement, settle } from '../../src/arc/settle.js';
import { DEMO_RETIREMENT_SECONDS, validateSpec } from '../../src/arc/spec.js';
import { arcProvider } from '../../src/arc/arc.js';
import { requiredEnv } from '../../src/config/env.js';
import { db } from '../../src/store/db.js';
import { DEMO_SLUG, DEMO_STAKING_SECONDS, MAX_OPEN_DEMO_MARKETS, presetById } from './demo.js';

/** ⚠️ Never throws a raw error at a page — every failure is a sentence a judge can read. */
export type DemoResult =
  | {readonly ok: true; readonly chainMarketId: string; readonly note: string; readonly graded?: number}
  | {readonly ok: false; readonly why: string};

/** 0.01 USDC — the analyst's own stake, the smallest whole 6-dp unit markets 7 and 12 used. */
const ANALYST_STAKE = ethers.parseUnits('0.01', 18).toString();

/**
 * Create a demo market for one preset question and commit the analyst's claim to it.
 *
 * ⚠️ **The analyst commits as well as creates, and that is what makes the no-wallet path work.**
 * §2.7's tier 3 — *watch it run* — is the DEFAULT path for a visitor with no wallet or no USDC: the
 * analyst's own claim is what there is to settle and grade, so the loop closes with no signature and
 * no funds from the judge. A judge who does have a wallet commits their own claim alongside it.
 */
export async function startDemoMarket(presetId: string, secret: string): Promise<DemoResult> {
  const expected = requiredEnv('CONSOLE_SECRET', 'The demo surface spends; see app/api/console/lock.ts.');
  if (secret !== expected) {
    return {ok: false, why: 'That is not the operator secret. Creating a market spends the analyst\'s USDC, so this button is locked — see tracking/DECISIONS.md 2026-09-12.'};
  }

  const preset = presetById(presetId);
  if (!preset) return {ok: false, why: `No preset question "${presetId}".`};

  // ⚠️ The cap, measured against the CHAIN clock rather than ours — `_open` compares
  // `block.timestamp`, and a market our clock thinks is open may already be shut on theirs.
  const block = await arcProvider().getBlock('latest');
  if (!block) return {ok: false, why: 'Could not read the Arc chain clock. Nothing was created.'};
  const now = block.timestamp;

  const rows = await db()<{close_time: Date; observed_day: string}[]>`
    SELECT close_time, observed_day FROM markets
     WHERE chain_market_id IS NOT NULL AND resolved_at IS NULL AND voided_at IS NULL`;
  const open = rows
    .filter((r) => pastPosted(r.close_time, r.observed_day))
    .filter((r) => r.close_time.getTime() / 1000 > now)
    .sort((a, b) => a.close_time.getTime() - b.close_time.getTime());
  if (open.length >= MAX_OPEN_DEMO_MARKETS) {
    const frees = open[0]!.close_time.toISOString().slice(11, 19);
    return {
      ok: false,
      why: `${open.length} demo markets are already open for staking, which is the cap. Each one is a real createMarket and commitPrediction paid by the analyst, so they are not free to spin up. The next slot frees at ${frees} UTC when the earliest closes — play one of the open ones meanwhile.`,
    };
  }

  const [report] = await db()<{hash: string}[]>`
    SELECT r.hash FROM reports r JOIN report_tokens rt ON rt.report_hash = r.hash
     WHERE r.canonical_json LIKE ${`%${DEMO_SLUG}.${preset.metric}%`}
     ORDER BY r.created_at LIMIT 1`;
  if (!report) {
    return {ok: false, why: `No tokenized report carries ${DEMO_SLUG}.${preset.metric}, so the admission check would refuse. Nothing was created.`};
  }

  const closeTime = now + DEMO_STAKING_SECONDS;
  // ⚠️ +1s is the contract's minimum and the shape `drive-market.ts` proved. The reveal unlocks at
  // `observationEnd`, so every second added here is a second the judge waits for nothing.
  const observationEnd = closeTime + 1;

  try {
    const plan = await prepareDemo({
      reportHash: report.hash,
      spec: {
        slug: DEMO_SLUG, metric: preset.metric, comparison: 'above',
        threshold: preset.threshold, observedDay: preset.observedDay,
      },
      closeTime, observationEnd,
      resolveDeadline: observationEnd + DEMO_RETIREMENT_SECONDS,
      amount: ANALYST_STAKE,
    });
    const made = await create(plan);
    // ⚠️ If this throws the market still exists and is stakeable; the claim is what is missing. The
    // message says so rather than implying nothing happened.
    await commit(plan, made.chainMarketId);
    return {
      ok: true, chainMarketId: made.chainMarketId,
      note: `Market ${made.chainMarketId} is open for staking until ${new Date(closeTime * 1000).toISOString().slice(11, 19)} UTC.`,
    };
  } catch (e) {
    const why = e instanceof MarketRefused ? e.message : (e as Error).message;
    return {ok: false, why};
  }
}

/**
 * Read the day, record the evidence, put the outcome on chain. ⚠️ **Spends ~0.0014 USDC of gas.**
 *
 * ⚠️ **The past-posted guard is FIRST and is not negotiable.** It is what makes this safe to leave
 * ungated: a forecast market can never be reached through it, whatever id is passed.
 */
export async function revealDemoMarket(chainMarketId: string): Promise<DemoResult> {
  if (!/^\d+$/.test(chainMarketId)) return {ok: false, why: 'Not a market id.'};

  const [market] = await db()<{id: string; spec_json: string; close_time: Date; observed_day: string; observation_end: Date}[]>`
    SELECT id, spec_json, close_time, observed_day, observation_end FROM markets
     WHERE chain_market_id = ${chainMarketId}
       AND contract_address = ${requiredEnv('ARC_MARKET_ADDRESS')}`;
  if (!market) return {ok: false, why: `No market ${chainMarketId} on the deployed contract.`};

  if (!pastPosted(market.close_time, market.observed_day)) {
    return {
      ok: false,
      why: `Market ${chainMarketId} is a forecast, not a demo — its staking closed before ${market.observed_day} began. This control settles demo markets only; a forecast settles on the resolver's own schedule.`,
    };
  }

  const block = await arcProvider().getBlock('latest');
  if (!block) return {ok: false, why: 'Could not read the Arc chain clock.'};
  if (block.timestamp < Math.floor(market.observation_end.getTime() / 1000)) {
    const left = Math.ceil(market.observation_end.getTime() / 1000 - block.timestamp);
    return {ok: false, why: `Staking has not closed yet — ${left}s to go. The contract would revert TooEarlyToResolve.`};
  }

  try {
    const spec = validateSpec(JSON.parse(market.spec_json) as Parameters<typeof validateSpec>[0]);
    // ⚠️ Evidence before chain, always. See the header.
    const read = await settle(spec);
    await recordSettlement(market.id, read);

    const plan = await planSettlement(market.id);
    if (plan.action === 'void') {
      return {ok: false, why: `${market.observed_day} has no snapshot for this deployment, so there is no outcome. The market is voidable and every stake is refundable.`};
    }
    await resolveMarket(plan);
    // ⚠️ Graded here rather than left to the nightly cron, because the judge is watching NOW and the
    // grade is the last step of the loop. `scoreMarket` writes one row per claim on this market —
    // the analyst's and, if they staked, the judge's. Task 2's `pastPosted` is what keeps both out
    // of the forecast record and out of the planning prompt; nothing here needs to remember to.
    const graded = await scoreMarket(market.id);
    return {
      ok: true, chainMarketId,
      graded: graded.length,
      note: read.kind === 'settled'
        ? `${market.observed_day} read ${read.observed} — the question resolves ${read.outcome ? 'TRUE' : 'FALSE'}.`
        : 'The day had no observation.',
    };
  } catch (e) {
    const why = e instanceof ResolveRefused ? e.message : (e as Error).message;
    return {ok: false, why};
  }
}

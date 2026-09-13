'use server';

// The two things the demo surface can make happen on chain.
//
// ── ⚠️ ONE MARKET PER PRESS, AND ONE SEED PATH ─────────────────────────────────────────────────
//
// `seedDemoMarkets` is the Start button under the Demo section on `/markets`. One press opens one
// market on the next preset question — never a batch — so the section holds something to play
// rather than a backlog. `scripts/ops/demo-market.ts --seed` calls the same function, so the operator
// and the button cannot drift into two rules. No `CONSOLE_SECRET`: a real market page has no lock on
// it, and the demo has to look like one.
//
// ⚠️ **All three exports below SPEND**, and all are ungated, so they are bounded by checks instead.
// `createDemoMarket` is deliberately **not exported**: an unrestricted "make me a market" reachable
// from a browser is exactly what should not exist here.
//
// ── ⚠️ REVEAL IS UNGATED, AND HERE IS WHY THAT IS SAFE ─────────────────────────────────────────
//
// `revealDemoMarket` is the button the judge presses, so it cannot ask them for a secret. It spends
// ~0.0014 USDC of gas on `resolve`. Three things bound it:
//
//   · **It refuses any market that is not past-posted.** `pastPosted()` is checked first and hard.
//     Markets 6, 7, 11 and 12 are forecasts and this function cannot reach them at any price — the
//     arithmetic excludes them, not a denylist that could drift.
//   · **It refuses a market the store already records as settled**, before anything is read.
//     `recordSettlement` upserts, so a second press — another tab still showing Reveal — would
//     otherwise overwrite the stored read the chain already committed to. The market page checks
//     the stored hash against the contract's either way.
//   · **It can only act on markets that already exist**, and creating one is bounded by the cap.
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
import { DEMO_SLUG, DEMO_STAKING_SECONDS, MAX_OPEN_DEMO_MARKETS, PRESETS, type Preset } from './demo.js';

/** ⚠️ Never throws a raw error at a page — every failure is a sentence a judge can read. */
export type DemoResult =
  | {readonly ok: true; readonly chainMarketId: string; readonly note: string; readonly graded?: number}
  | {readonly ok: false; readonly why: string};

/** 0.01 USDC — the analyst's own stake, the smallest whole 6-dp unit markets 7 and 12 used. */
const ANALYST_STAKE = ethers.parseUnits('0.01', 18).toString();

/**
 * Create a demo market for one question and commit the analyst's claim to it.
 *
 * ⚠️ **The analyst commits as well as creates, and that is what makes the no-wallet path work.** A
 * visitor with no wallet still has a real position to settle and grade — the loop closes with no
 * signature and no funds of theirs. A judge who does have a wallet commits their own claim beside it,
 * which is why the detail page must cope with a market carrying two.
 *
 * ⚠️ **Not exported.** A `'use server'` module exports only things a browser may call, and an
 * unrestricted "make me a market" is exactly what should not be one. Its two callers — seed and
 * reset — each pick the question themselves, and the cap checked below binds both.
 *
 * ⚠️ **Every market gets the same window, `DEMO_STAKING_SECONDS` off the chain clock.** The seed used
 * to stagger six; one market per press has nothing to stagger.
 */
async function createDemoMarket(
  metric: Preset['metric'],
  observedDay: string,
  threshold: string,
  comparison: 'above' | 'below',
): Promise<DemoResult> {
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
      why: `${open.length} demo markets are already open for staking, which is the cap. Each one is a real createMarket and commitPrediction paid by the analyst, so they are not free to spin up. The next slot frees at ${frees} UTC — play one of the open ones meanwhile.`,
    };
  }

  const [report] = await db()<{hash: string}[]>`
    SELECT r.hash FROM reports r JOIN report_tokens rt ON rt.report_hash = r.hash
     WHERE r.canonical_json LIKE ${`%${DEMO_SLUG}.${metric}%`}
     ORDER BY r.created_at LIMIT 1`;
  if (!report) {
    return {ok: false, why: `No tokenized report carries ${DEMO_SLUG}.${metric}, so the admission check would refuse. Nothing was created.`};
  }

  const closeTime = now + DEMO_STAKING_SECONDS;
  // ⚠️ +1s is the contract's minimum. The reveal unlocks at `observationEnd`, so every second added
  // here is a second the judge waits for nothing.
  const observationEnd = closeTime + 1;

  try {
    const plan = await prepareDemo({
      reportHash: report.hash,
      spec: {slug: DEMO_SLUG, metric, comparison, threshold, observedDay},
      closeTime, observationEnd,
      resolveDeadline: observationEnd + DEMO_RETIREMENT_SECONDS,
      amount: ANALYST_STAKE,
    });
    const made = await create(plan);
    // ⚠️ If this throws the market still exists and is stakeable; the claim is what is missing.
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

  const [market] = await db()<{
    id: string; spec_json: string; close_time: Date; observed_day: string; observation_end: Date;
    resolved_at: Date | null; voided_at: Date | null;
  }[]>`
    SELECT id, spec_json, close_time, observed_day, observation_end, resolved_at, voided_at FROM markets
     WHERE chain_market_id = ${chainMarketId}
       AND contract_address = ${requiredEnv('ARC_MARKET_ADDRESS')}`;
  if (!market) return {ok: false, why: `No market ${chainMarketId} on the deployed contract.`};

  if (!pastPosted(market.close_time, market.observed_day)) {
    return {
      ok: false,
      why: `Market ${chainMarketId} is a forecast, not a demo — its staking closed before ${market.observed_day} began. This control settles demo markets only; a forecast settles on the resolver's own schedule.`,
    };
  }

  // ⚠️ **After the forecast refusal, before `settle()`.** A second press must not re-read the day:
  // `recordSettlement` upserts, and the row it would overwrite is the one the chain committed to.
  if (market.resolved_at || market.voided_at) {
    return {ok: false, why: `Market ${chainMarketId} has already settled. Reload the page to see the result and the read it settled on.`};
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

/**
 * Play the same question again on a fresh market. ⚠️ **Spends ~0.02 USDC of the analyst's money.**
 *
 * ── ⚠️ WHY A RESET IS NEEDED AT ALL, AND WHY IT IS NOT A LOOPHOLE ──────────────────────────────
 *
 * `claimIdOf[marketId][msg.sender] != 0` reverts `AlreadyCommitted`, and `claims` carries a UNIQUE
 * on `(market_id, author)`. **One claim per author per market, enforced twice.** So "do it again"
 * cannot mean re-staking this market, and should not: the answer is on screen now.
 *
 * A new market about the same question with a later `closeTime` is a **different market**, and
 * committing to it leaves the contract's rule exactly as written. Nothing is circumvented.
 *
 * ── ⚠️ IT IS UNGATED, SO IT IS BOUNDED INSTEAD ─────────────────────────────────────────────────
 *
 * Four things hold it in, and they are checks rather than a password:
 *
 *   · **Past-posted only.** A forecast can never be replayed through here, at any id.
 *   · **Settled only.** There is nothing to reset about a market still taking stakes, and refusing
 *     it stops this becoming a way to mint markets in a loop.
 *   · **It reuses the existing market's own spec**, so it cannot mint an arbitrary question — only
 *     another copy of one that already exists.
 *   · **The open-market cap**, which is what a judge pressing repeatedly actually hits.
 */
export async function resetDemoMarket(chainMarketId: string): Promise<DemoResult> {
  if (!/^\d+$/.test(chainMarketId)) return {ok: false, why: 'Not a market id.'};

  const [market] = await db()<{
    spec_json: string; close_time: Date; observed_day: string;
    resolved_at: Date | null; voided_at: Date | null;
  }[]>`
    SELECT spec_json, close_time, observed_day, resolved_at, voided_at FROM markets
     WHERE chain_market_id = ${chainMarketId}
       AND contract_address = ${requiredEnv('ARC_MARKET_ADDRESS')}`;
  if (!market) return {ok: false, why: `No market ${chainMarketId} on the deployed contract.`};

  if (!pastPosted(market.close_time, market.observed_day)) {
    return {ok: false, why: `Market ${chainMarketId} is a forecast, not a demo. Forecasts are not replayed — the whole point of one is that it was made before the day it measures.`};
  }
  if (!market.resolved_at && !market.voided_at) {
    return {ok: false, why: 'This market has not settled yet, so there is nothing to play again. Reveal it first.'};
  }

  const spec = JSON.parse(market.spec_json) as {slug: string; metric: string; observedDay: string; threshold: string; comparison: 'above' | 'below'};
  return createDemoMarket(spec.metric as never, spec.observedDay, spec.threshold, spec.comparison);
}

/** What a judge is told before they press Open, so the cost is never a surprise. */
export interface SeedPlan {
  readonly free: number;
  readonly open: number;
  readonly cap: number;
  readonly costUsdc: string;
  readonly nextFrees: string | null;
  /** The question the next press would open, so the button can name it. */
  readonly nextLabel: string | null;
}

/** Free, read-only. ⚠️ Rendered BEFORE the button so nobody presses a spend blind. */
export async function demoSeedPlan(): Promise<SeedPlan> {
  const block = await arcProvider().getBlock('latest');
  const now = block ? block.timestamp : Math.floor(Date.now() / 1000);
  const rows = await db()<{close_time: Date; observed_day: string}[]>`
    SELECT close_time, observed_day FROM markets
     WHERE chain_market_id IS NOT NULL AND resolved_at IS NULL AND voided_at IS NULL`;
  const open = rows
    .filter((r) => pastPosted(r.close_time, r.observed_day))
    .filter((r) => r.close_time.getTime() / 1000 > now)
    .sort((a, b) => a.close_time.getTime() - b.close_time.getTime());
  const free = Math.max(0, MAX_OPEN_DEMO_MARKETS - open.length);
  const next = await nextPreset();
  return {
    free, open: open.length, cap: MAX_OPEN_DEMO_MARKETS,
    // ⚠️ ONE market per press, so the cost quoted is one market's.
    costUsdc: '0.02',
    nextFrees: open[0] ? open[0].close_time.toISOString().slice(11, 19) : null,
    nextLabel: next ? `${LABEL[next.metric] ?? next.metric} above $${Number(next.threshold).toLocaleString('en-US')}` : null,
  };
}

const LABEL: Readonly<Record<string, string>> = {
  totalDepositBalanceUSD: 'deposits',
  totalBorrowBalanceUSD: 'borrows',
  dailyDepositUSD: 'daily deposits',
  dailyBorrowUSD: 'daily borrows',
};

/**
 * Which question to open next. ⚠️ **Rotates rather than restarting at the top**, so a judge pressing
 * three times gets three different questions instead of the same one three times.
 *
 * The rule is simply the first preset with no market on chain for it yet; once all six have been
 * used it takes the one whose most recent market is oldest. Both are cheap reads and neither needs a
 * column to remember anything.
 */
async function nextPreset(): Promise<Preset | null> {
  const rows = await db()<{observed_day: string; threshold: string; created_at: Date}[]>`
    SELECT observed_day, (spec_json::json->>'threshold') AS threshold, created_at
      FROM markets WHERE chain_market_id IS NOT NULL ORDER BY created_at DESC`;
  const lastUsed = new Map<string, number>();
  for (const r of rows) {
    const key = `${r.observed_day}/${r.threshold}`;
    if (!lastUsed.has(key)) lastUsed.set(key, r.created_at.getTime());
  }
  const unused = PRESETS.find((p) => !lastUsed.has(`${p.observedDay}/${p.threshold}`));
  if (unused) return unused;
  return [...PRESETS].sort(
    (a, b) => (lastUsed.get(`${a.observedDay}/${a.threshold}`) ?? 0) - (lastUsed.get(`${b.observedDay}/${b.threshold}`) ?? 0),
  )[0] ?? null;
}

/**
 * Open the next preset demo question on chain — one market. ⚠️ **Spends about 0.02 USDC**: the
 * analyst's 0.01 stake plus ~0.008–0.009 of gas for `createMarket` and `commitPrediction`, measured
 * off the receipts of markets 28–30.
 *
 * ── ⚠️ ONE MARKET PER PRESS ────────────────────────────────────────────────────────────────────
 *
 * It used to open every free slot at once — six markets staggered a few minutes apart — and the
 * section filled with cards nobody was playing: several already settled, several waiting, none of
 * them obviously the one to start. **A backlog reads as clutter rather than as a thing to play.**
 *
 * So one press opens one market and the judge plays it before opening another. `nextPreset()`
 * rotates the question, so pressing three times gives three different questions.
 *
 * ⚠️ **No secret, by design.** What bounds this is the cap and the cost — at most
 * `MAX_OPEN_DEMO_MARKETS` open at once, about 0.12 USDC of the analyst's money at full stretch, and
 * each slot self-clears when its market closes. A password here would be the thing that was cut.
 *
 */
export async function seedDemoMarkets(): Promise<DemoResult & {opened?: number}> {
  const plan = await demoSeedPlan();
  if (plan.free === 0) {
    return {
      ok: false,
      why: `${plan.open} demo markets are already open, which is the cap of ${plan.cap}.${plan.nextFrees ? ` The next slot frees at ${plan.nextFrees} UTC.` : ''} Play one of them first.`,
    };
  }
  const preset = await nextPreset();
  if (!preset) return {ok: false, why: 'No preset question is configured.'};

  const r = await createDemoMarket(preset.metric, preset.observedDay, preset.threshold, 'above');
  return r.ok ? {...r, opened: 1} : r;
}

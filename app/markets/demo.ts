// What the demo surface knows: six questions, ten illustrative participants, and one cap.
//
// ── ⚠️ THE QUESTIONS ARE PINNED, AND PINNED IS THE POINT ────────────────────────────────────────
//
// Each threshold was chosen around a figure **read from The Graph on 2026-09-13** and written here
// as a constant. It is not read live, because a subgraph reindex or a republished deployment would
// silently move the real figure relative to a threshold and turn a question we described as
// "clearly true" into a false one on screen. `scripts/ops/demo-market.ts --presets` re-reads the
// days and prints any drift; it is a check, never a rewrite.
//
// ⚠️ **WE KNOW THE ANSWERS AND THE PAGE SAYS SO.** Thresholds were placed around figures we had
// already read, so that some resolve each way. What a judge does not know is *which* — and that is
// the only thing this demo ever claimed. Presenting it as suspense it cannot deliver would be worse
// than the curation.
//
// ⚠️ **FOUR DIFFERENT SUBJECTS, DELIBERATELY.** Six thresholds on one metric and one day would mean
// the first reveal answers the other five: a judge who learns deposits were 24.56B on the 11th can
// compute every remaining question in their head. Spreading the six over two metrics and two days
// means a reveal spoils at most the one or two questions sharing its subject.

import type { LegalMetric } from '../../src/arc/spec.js';

export interface Preset {
  readonly id: string;
  readonly metric: LegalMetric;
  readonly observedDay: string;
  /** ⚠️ A decimal STRING. `validateSpec` refuses a number, and 1e21 is how a threshold changes scale. */
  readonly threshold: string;
  /** How far the threshold sits from the figure that day actually posted. Shown, never hidden. */
  readonly distance: string;
}

/**
 * ⚠️ **Two clearly true, two clearly false, two within 1% — §2.5's bracket.** The near pair is what
 * makes the demo worth running: a judge with no feel for Aave's balance sheet gets a real coin-flip
 * on those two, and half the value of the exercise is watching WRONG happen to someone.
 *
 * Figures these were placed against, read 2026-09-13:
 *   aave-v3-ethereum totalDepositBalanceUSD  2026-09-11 → 24,560,910,569.10…
 *   aave-v3-ethereum totalDepositBalanceUSD  2026-09-10 → 24,074,775,695.03…
 *   aave-v3-ethereum totalBorrowBalanceUSD   2026-09-11 →  9,857,549,502.18…
 */
export const PRESETS: readonly Preset[] = [
  {id: 'd1', metric: 'totalDepositBalanceUSD', observedDay: '2026-09-11', threshold: '23000000000', distance: '6.4% below the figure — clearly one way'},
  {id: 'd2', metric: 'totalDepositBalanceUSD', observedDay: '2026-09-11', threshold: '24800000000', distance: 'within 1% of the figure — genuinely close'},
  {id: 'd3', metric: 'totalDepositBalanceUSD', observedDay: '2026-09-10', threshold: '24000000000', distance: 'within 1% of the figure — genuinely close'},
  {id: 'd4', metric: 'totalBorrowBalanceUSD', observedDay: '2026-09-11', threshold: '9500000000', distance: '3.6% below the figure — clearly one way'},
  {id: 'd5', metric: 'totalBorrowBalanceUSD', observedDay: '2026-09-11', threshold: '12000000000', distance: '21% above the figure — clearly one way'},
  {id: 'd6', metric: 'totalDepositBalanceUSD', observedDay: '2026-09-10', threshold: '30000000000', distance: '25% above the figure — clearly one way'},
];

export const presetById = (id: string): Preset | undefined => PRESETS.find((p) => p.id === id);

/** The one deployment every preset names. ⚠️ It must be `live` in `config/protocols.ts` or
 *  `validateSpec` refuses — settlement re-reads it, and a deployment that stops answering voids. */
export const DEMO_SLUG = 'aave-v3-ethereum';

/**
 * ⚠️ **How many demo markets may be open for staking at once, and this is the limit a judge
 * actually hits.** Not the seventh-run message — a judge can pick any question again, because a new
 * market about the same question at a later `closeTime` is a **different market** and the contract's
 * one-claim-per-author rule is untouched by committing to it.
 *
 * What stops that looping is this cap and the gas behind it: every creation is a real
 * `createMarket` plus a real `commitPrediction` paid by the analyst, about 0.02 USDC a time. Three
 * open at once is enough to queue a couple of runs and small enough that a stuck tab cannot drain
 * the wallet. The refusal names the cap and when the next slot frees.
 */
export const MAX_OPEN_DEMO_MARKETS = 3;

/** ⚠️ The staking window. Short enough that the judge is not abandoned, long enough to beat Circle's
 *  ~30s to land `createMarket` plus a wallet confirmation dialog. */
export const DEMO_STAKING_SECONDS = 150;

// ─── The illustrative participants ───────────────────────────────────────────────────────────────

export interface Participant {
  /** ⚠️ `sim-03`, never a 0x address. See below. */
  readonly handle: string;
  readonly side: boolean;
  readonly amountUsdc: string;
}

/**
 * Ten participants, derived from the market id and stored nowhere.
 *
 * ⚠️ **THEY ARE NOT REAL AND THE IDENTITY ITSELF SAYS SO.** A handle like `sim-03` cannot be
 * mistaken for a staker; a plausible `0x9f3c…` could, and a badge beside it would be one refresh
 * away from being missed. The same standard the seeded grades keep — distinguishable by the absence
 * of chain evidence — with the marker moved into the name so it cannot be separated from the row.
 *
 * ⚠️ **NO MONEY IS EVER DERIVED FROM THEM.** They give the pool a *shape* — a TRUE/FALSE ratio — and
 * the page's only figure denominated in USDC is the real payout from the real pool. Two money
 * numbers that ought to agree is exactly how they stop agreeing, which is the rule `score.ts` and
 * `/markets` already keep for trading return and pools.
 *
 * ⚠️ **Deterministic, so the shape does not shuffle on re-render.** A pool that moved every time the
 * page was refreshed would read as live activity, which is the one impression this must not give.
 * No schema change, no storage: the market id is the seed.
 */
export function participantsFor(chainMarketId: string): readonly Participant[] {
  // A small xorshift over the id. ⚠️ Not cryptographic and does not need to be — it is a layout.
  let s = 2166136261;
  for (const ch of `alpha-demo/${chainMarketId}`) {
    s = Math.imul(s ^ ch.charCodeAt(0), 16777619) >>> 0;
  }
  const next = (): number => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
  return Array.from({length: 10}, (_, i) => ({
    handle: `sim-${String(i + 1).padStart(2, '0')}`,
    side: next() > 0.42,
    // 0.25–3.00, two decimals. Presented as shape; never summed into a payout.
    amountUsdc: (Math.floor(next() * 276 + 25) / 100).toFixed(2),
  }));
}

/** The TRUE share of the illustrative pool, 0–100. ⚠️ Shape only — see `participantsFor`. */
export function illustrativeTrueShare(ps: readonly Participant[]): number {
  const t = ps.filter((p) => p.side).reduce((a, p) => a + Number(p.amountUsdc), 0);
  const all = ps.reduce((a, p) => a + Number(p.amountUsdc), 0);
  return all === 0 ? 50 : Math.round((t / all) * 1000) / 10;
}

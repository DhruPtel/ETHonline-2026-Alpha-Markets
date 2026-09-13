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

/** The metric as a word, for short labels — the Start button's next question and a market card's title. */
export const METRIC_WORD: Readonly<Record<string, string>> = {
  totalDepositBalanceUSD: 'deposits',
  totalBorrowBalanceUSD: 'borrows',
  dailyDepositUSD: 'daily deposits',
  dailyBorrowUSD: 'daily borrows',
};

/**
 * ⚠️ **How many demo markets may be open for staking at once, and this is the limit a judge
 * actually hits.** Not the seventh-run message — a judge can pick any question again, because a new
 * market about the same question at a later `closeTime` is a **different market** and the contract's
 * one-claim-per-author rule is untouched by committing to it.
 *
 * What stops that looping is this cap and the gas behind it: every creation is a real
 * `createMarket` plus a real `commitPrediction` paid by the analyst, about 0.02 USDC a time.
 *
 * ⚠️ **SIX, AND NO LONGER REACHED BY ONE PRESS.** It was sized for a seed that opened all six preset
 * questions at once. Seeding now opens one market per press, so six is only met by six starts inside
 * one staking window. Still one number: **at most six demo markets open for staking at once**, about
 * 0.12 USDC of the analyst's at risk at full stretch. Seed and reset both respect it, and both
 * refusals name it and say when the next slot frees.
 */
export const MAX_OPEN_DEMO_MARKETS = 6;

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

// ─── The bands ───────────────────────────────────────────────────────────────────────────────────

/**
 * The pools a demo market DISPLAYS: the contract's real pools plus the ten illustrative participants.
 *
 * ⚠️ **One function for the market page and its card on `/markets`**, so the five bands a card draws
 * are the five the page draws. Two copies of an illustration is how a card and its page come to
 * disagree about a number neither of them settles on.
 * ⚠️ **Display only.** `payoutOf` reads the contract, which knows none of the participants.
 */
export function displayPools(chainMarketId: string, poolTrue: bigint, poolFalse: bigint): {
  readonly showTrue: bigint; readonly showFalse: bigint; readonly showTruePct: number | null;
} {
  // Two-decimal USDC to 18-dp wei on the string — never through a float.
  const wei = (usdc: string): bigint => {
    const [whole, frac = ''] = usdc.split('.');
    return BigInt(whole!) * 10n ** 18n + BigInt(`${frac}00`.slice(0, 2)) * 10n ** 16n;
  };
  const ps = participantsFor(chainMarketId);
  const showTrue = poolTrue + ps.filter((p) => p.side).reduce((a, p) => a + wei(p.amountUsdc), 0n);
  const showFalse = poolFalse + ps.filter((p) => !p.side).reduce((a, p) => a + wei(p.amountUsdc), 0n);
  const total = showTrue + showFalse;
  return {showTrue, showFalse, showTruePct: total > 0n ? Number((showTrue * 1000n) / total) / 10 : null};
}

/** ⚠️ Five, matching `--band-a…e` in `globals.css`. Index order is table order, top to bottom. */
export const BAND_KEYS = ['a', 'b', 'c', 'd', 'e'] as const;

/** The seed for a band's illustrative line, shared so a card and its page draw the same shape. */
export const bandSeed = (chainMarketId: string, threshold: string): string => `${chainMarketId}/band/${threshold}`;

export interface Band {
  /** ⚠️ A decimal STRING, and the live one is the market's own threshold character for character. */
  readonly threshold: string;
  /** ⚠️ True for exactly one band: the one this market's spec names and settlement will read. */
  readonly isMarket: boolean;
  /** Illustrative. Never summed into a payout. */
  readonly poolUsdc: string;
  readonly sharePct: number;
}

/**
 * Thresholds around this market's own, so the outcome table reads like a multi-outcome market.
 *
 * ── ⚠️ SETTLEMENT IS STILL BINARY AND ONLY ONE BAND IS REAL ─────────────────────────────────────
 *
 * The contract has **two pools**. `commitPrediction(marketId, reportHash, side)` takes a side and
 * nothing else — there is no threshold parameter, because the threshold is fixed in the market's
 * spec and hashed into its `questionId`. So a judge cannot stake on the wrong band even in
 * principle: **the market id determines the threshold, and the only thing they choose is which side
 * of it.** The other bands are decoration in exactly the sense the chart's extra lines are, and the
 * table marks them `illustrative` rather than leaving a reader to work it out.
 *
 * ⚠️ **The live band is the spec's threshold UNCHANGED — not rounded, not reformatted.** A judge
 * reading `$24,315,301,463` in the table and `$24,315,301,463` in the position panel is reading the
 * same number, and any prettifying here would put two different questions on one page.
 *
 * ⚠️ **Shares fall as the threshold rises**, because clearing a higher bar is less likely. A set of
 * random shares would read as noise and invite exactly the "why is the high band winning" question
 * the decoration is not there to answer.
 */
export function bandsFor(
  chainMarketId: string,
  marketThreshold: string,
  /**
   * ⚠️ The live row's REAL displayed share, so the neighbours can be arranged around it. Generating
   * band shares independently let the live row land out of order — a lower bar showing a lower
   * chance of being cleared, which reads as a broken market rather than a decorated one.
   */
  liveSharePct: number,
): readonly Band[] {
  let s = 2166136261;
  for (const ch of `alpha-bands/${chainMarketId}`) s = Math.imul(s ^ ch.charCodeAt(0), 16777619) >>> 0;
  const next = (): number => {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };

  const base = BigInt(marketThreshold.split('.')[0] ?? marketThreshold);
  // ⚠️ Integer maths on the threshold — it is a 11-digit decimal string and `Number()` would start
  // losing digits well before the end of it.
  const at = (permille: bigint): string => ((base * permille) / 1000n).toString();
  const rows: {threshold: string; isMarket: boolean}[] = [
    {threshold: at(940n), isMarket: false},
    {threshold: at(980n), isMarket: false},
    {threshold: marketThreshold, isMarket: true},
    {threshold: at(1020n), isMarket: false},
    {threshold: at(1070n), isMarket: false},
  ];
  rows.sort((a, b) => (BigInt(a.threshold.split('.')[0]!) < BigInt(b.threshold.split('.')[0]!) ? -1 : 1));

  const liveAt = rows.findIndex((r) => r.isMarket);
  return rows.map((r, i) => ({
    ...r,
    poolUsdc: (Math.floor(next() * 420 + 60) / 100).toFixed(2),
    // ⚠️ Anchored to the live row and stepped away from it, so a lower threshold always shows a
    // higher chance of being cleared. Jitter is small enough never to cross a neighbour.
    sharePct: r.isMarket
      ? liveSharePct
      : Math.max(3, Math.min(96, Math.round(
          (liveSharePct + (liveAt - i) * 17 + (next() * 6 - 3)) * 10,
        ) / 10)),
  }));
}

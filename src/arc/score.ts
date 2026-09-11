// What the analyst's record actually says. ⚠️ **§5.12's three scores, and this is the loop's only unit.**
//
// Without this the phase ships a working market and no visible reason that an analyst's reports are
// worth paying for. It closes no requirement, which is exactly why it sat third in the cut order
// until that was reordered.
//
// ⚠️ **READS SETTLED STATE AND WRITES ROWS. NO CHAIN, NO GAS, NO SPENDING.** There is no provider
// here and no Circle client, and that is a property of the file rather than an omission: everything
// it needs has already been written down by the units that did spend. If this file ever finds itself
// importing `arc.ts`, something has gone wrong.
//
// ── ⚠️ THE THREE SCORES ARE DIFFERENT IN KIND, AND CONFUSING THEM IS THE FAILURE MODE ────────────
//
//   1 · **Reconciliation quality — COPIED, never derived.** It is `Report.verdict.call`, computed in
//       Phase 2 and stored inside the report's canonical bytes. This file reads it. ⚠️ A second
//       computation would be a second answer to a question already settled, and the two would
//       eventually disagree — at which point nobody could say which was the verdict. It is copied
//       onto the row rather than joined at read time so the score records what the verdict *was* at
//       scoring time.
//       ⚠️ It is legitimately `null` on a metric-across-deployments report: `Verdict.call` is
//       nullable by a 2026-09-07 schema decision, because a ranking has no single figure to stand
//       behind. A null here is a fact about the report, not a missing score.
//       ⚠️ **And it can only mean that.** `claims.report_hash` is a FOREIGN KEY into `reports`, so a
//       claim citing a report that is not stored is unrepresentable — `load()` returning null would
//       need the report row to have been deleted, and `store/reports.ts` never deletes one. **So
//       `reconciliation_quality IS NULL` always means the verdict had no call, never "report gone".**
//       ⚠️ Today it is null on **every one of the nine stored reports**, because all nine are the
//       metric-across-deployments shape — checked, not assumed. The figure that would tell them
//       apart is `verdict.coverage`, and `scores` has no column for it. Recorded, not worked around.
//
//   2 · **Forecast accuracy — DERIVED, and it is the only one this file computes.** The claim's side
//       against the resolved outcome. One boolean, one comparison, nothing to disagree with.
//
//   3 · **Trading return — READ from `payouts`, never recomputed.** Unit 5b settled this: the
//       contract pays per `(market, address)` and `payoutOf` aggregates an address's whole position,
//       so a second computation here would be a second way of measuring one number. ⚠️ **Two numbers
//       that should agree are how they stop agreeing.**
//
// ── ⚠️ A VOIDED MARKET IS NOT A WRONG FORECAST ───────────────────────────────────────────────────
//
// **A voided claim scores `forecastCorrect = null`, and that is the whole point.** A void means the
// data was missing or the deployment was republished — there is no outcome, so the analyst was
// neither right nor wrong. Scoring it `false` would record a loss that never happened, and this row
// is what Unit 15b feeds to `compose`: an analyst told it was wrong about a day nobody could measure
// would learn something untrue about its own judgment.
//
// ⚠️ **`null` is unambiguous here only because an unsettled market gets NO ROW AT ALL.** The column
// comment in 005 reads *"null while the market is unresolved"*, which was written before this file
// decided that an unresolved market is not scored. Both readings would be null; only one of them can
// ever be in the table. **The row existing means the market settled; `forecast_correct IS NULL` on a
// row that exists means VOID.**
//
// ── ⚠️ AN UNCLAIMED PAYOUT IS NOT A ZERO RETURN — AND NEITHER IS A WRONG FORECAST ────────────────
//
// `claim` is pull-based, so a market resolves with the money still sitting in the contract.
// `returned` therefore says only what the `payouts` table says, and **never zero by inference**:
//
//   `returned = <amount>`  collected — a `payouts` row with a landmark says what came back
//   `returned = null`      **no payout recorded.** Never "lost", never zero.
//
// ⚠️ **THE DISTINCTION THIS BRIEF ASKED FOR CANNOT BE DRAWN FROM THE STORE, AND THE FIRST DRAFT OF
// THIS FILE DREW IT WRONG.** The brief asks to separate "claimed nothing yet" from "earned nothing",
// and the obvious rule — a wrong forecast returns zero — is **false on this contract**. `payoutOf`
// has a `winningPool == 0` branch that refunds every staker their own stake, and with one analyst
// and few stakers an empty side is the *expected* case, not an edge one.
//
// ⚠️ **Chain market 3 is the live counterexample**: it resolved **FALSE**, the analyst's claim was
// **TRUE** — a genuinely wrong forecast — and `payoutOf` is **0.01, its stake back**, because
// `poolFalse` was empty. A rule inferring zero from a wrong forecast would have recorded a loss that
// the chain disagrees with, on a real market, today.
//
// Telling the two apart needs the market's **pools**, which are chain state the `markets` row does
// not carry and this unit may not add a column for. So the honest answer is the one Unit 5b already
// gave: **the `payouts` table is the only source, and its silence is silence — not a zero.** What
// the schema cannot express is recorded here rather than faked into the column.
//
// ── ⚠️ THE GRAIN, AND THE ASSUMPTION IT RESTS ON ─────────────────────────────────────────────────
//
// `scores` is keyed `(market_id, claim_id)` — deliberately not `(market_id, report_hash)`, because
// two authors can cite one report. ⚠️ **The contract pays per ADDRESS, not per claim**, so a return
// is only attributable to a single claim while the analyst commits once per market and stakes
// nothing alongside it. That is true today and Unit 5 recorded it as a stated assumption the schema
// rests on rather than enforces. **This file does not build around it and does not break it** — it
// checks the assumption holds for the claim it is scoring and refuses the return rather than
// misattributing a pooled one.
//
// ⚠️ **Idempotent on `(market_id, claim_id)` because this runs more than once**, and a re-score with
// identical inputs is a true no-op — `scored_at` does not move. See `record()`.
//
// ⚠️ **`store/markets.ts` is read-only, so this unit owns its writes to `scores`** — the pattern
// `market.ts` and `resolve.ts` both follow for their own landmark columns.

import { db } from '../store/db.js';
import { claimsFor, marketById, payoutFor, stakesFor } from '../store/markets.js';
import { load } from '../store/reports.js';

/** ⚠️ Why `returned` is what it is. The table has no column for this; it is for callers and proofs. */
export type ReturnState =
  /** A `payouts` row with a landmark: this is what came back. */
  | 'collected'
  /**
   * ⚠️ **No payout recorded, and this does NOT mean zero.** It covers "resolved and not pulled yet"
   * and "pulled but nothing recorded it" alike, and on a one-sided pool it can still become a full
   * refund. Separating those needs the market's pools — see the header.
   */
  | 'no-payout-recorded'
  /** ⚠️ The address holds more than this claim, so a per-address payout is not this claim's return. */
  | 'not-attributable';

export interface Score {
  readonly marketId: string;
  readonly claimId: string;
  /** ⚠️ Copied from `Report.verdict.call`. Null is legitimate — see the header. */
  readonly reconciliationQuality: string | null;
  /** ⚠️ **Null means VOID**, on a row that exists at all. */
  readonly forecastCorrect: boolean | null;
  readonly staked: string;
  readonly returned: string | null;
  readonly returnState: ReturnState;
  readonly settlement: 'resolved' | 'voided';
}

/**
 * Score one settled market's claims. ⚠️ **An unsettled market returns `[]` and writes nothing** —
 * no score is the honest answer, never a row full of nulls.
 */
export async function scoreMarket(marketId: string): Promise<Score[]> {
  const market = await marketById(marketId);
  if (!market) throw new Error(`no market ${marketId} in the store.`);
  if (!market.resolvedAt && !market.voidedAt) return [];

  const settlement = market.voidedAt ? 'voided' : 'resolved';
  const scores: Score[] = [];

  for (const claim of await claimsFor(marketId)) {
    // 1 · Copied, not derived. ⚠️ `load` re-derives the hash and throws if the stored bytes no
    //     longer produce it, so a verdict is only copied off a report that is still itself.
    const report = await load(claim.reportHash);
    const reconciliationQuality = report?.verdict.call ?? null;

    // 2 · The only computation in this file.
    const forecastCorrect = settlement === 'voided' ? null : claim.side === market.outcome;

    // 3 · Read, never recomputed — and attributed only when the grain assumption holds.
    // ⚠️ Deliberately NOT passed `forecastCorrect`. The return does not depend on the forecast and
    // must not appear to — see the header on chain market 3.
    const { returned, returnState } = await returnFor(marketId, claim.author);

    scores.push({
      marketId, claimId: claim.id, reconciliationQuality, forecastCorrect,
      staked: claim.amount, returned, returnState, settlement,
    });
  }

  for (const score of scores) await record(score);
  return scores;
}

/** Every market that has settled, scored. ⚠️ Reconciliation — asked from scratch, no cursor. */
export async function scoreSettled(): Promise<Score[]> {
  const rows = await db()<{ id: string }[]>`
    SELECT id FROM markets
    WHERE (resolved_at IS NOT NULL OR voided_at IS NOT NULL)
    ORDER BY COALESCE(resolved_at, voided_at)`;
  const all: Score[] = [];
  for (const row of rows) all.push(...await scoreMarket(row.id));
  return all;
}

/**
 * What this claim's position actually got back.
 *
 * ⚠️ **Refuses to attribute rather than guessing.** The payout is per address; if this author holds
 * anything on the market beyond this one claim, the number is the position's and not the claim's.
 */
async function returnFor(
  marketId: string, author: string,
): Promise<{ returned: string | null; returnState: ReturnState }> {
  const claims = await claimsFor(marketId);
  // ⚠️ `mine.length > 1` is unreachable while `claims` carries `UNIQUE (market_id, author)` — the
  // contract's one-claim-per-author rule, enforced in the schema. Kept because it costs nothing and
  // the stake half below can still fire; **not claimed as proven.**
  const mine = claims.filter((c) => c.author.toLowerCase() === author.toLowerCase());

  // ⚠️ **`stakesFor` is keyed by CLAIM, not by market** — there is no stakes-by-market helper and
  // `store/markets.ts` is read-only, so every claim on the market is walked. Passing a market id to
  // it would typecheck, return `[]` forever and leave this guard silently never firing.
  const staked = (await Promise.all(claims.map((c) => stakesFor(c.id)))).flat();
  const alsoStaked = staked.some((s) => s.staker.toLowerCase() === author.toLowerCase());
  if (mine.length > 1 || alsoStaked) return { returned: null, returnState: 'not-attributable' };

  const payout = await payoutFor(marketId, author);
  if (payout?.claimedAt) return { returned: payout.amount, returnState: 'collected' };

  // ⚠️ **Null, never zero, and never inferred from the forecast.** Chain market 3 resolved against
  // its author and still refunded the whole stake because the winning pool was empty. See the header.
  return { returned: null, returnState: 'no-payout-recorded' };
}

/**
 * ⚠️ **Idempotent, and a re-score with identical inputs does not move `scored_at`.** The `WHERE` on
 * the conflict target is what makes "running it twice changes nothing" literally true rather than
 * nearly true — without it every run would rewrite the timestamp and the record would look like it
 * had been revised when it had not.
 */
async function record(score: Score): Promise<void> {
  await db()`
    INSERT INTO scores (market_id, claim_id, reconciliation_quality, forecast_correct, staked, returned)
    VALUES (${score.marketId}, ${score.claimId}, ${score.reconciliationQuality},
            ${score.forecastCorrect}, ${score.staked}, ${score.returned})
    ON CONFLICT (market_id, claim_id) DO UPDATE SET
      reconciliation_quality = EXCLUDED.reconciliation_quality,
      forecast_correct       = EXCLUDED.forecast_correct,
      staked                 = EXCLUDED.staked,
      returned               = EXCLUDED.returned,
      scored_at              = now()
    WHERE scores.reconciliation_quality IS DISTINCT FROM EXCLUDED.reconciliation_quality
       OR scores.forecast_correct       IS DISTINCT FROM EXCLUDED.forecast_correct
       OR scores.staked                 IS DISTINCT FROM EXCLUDED.staked
       OR scores.returned               IS DISTINCT FROM EXCLUDED.returned`;
}

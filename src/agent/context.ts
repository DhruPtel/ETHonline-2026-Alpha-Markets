// The reward comes back. ⚠️ **This is the unit that closes the loop, and the plan stopped one step
// short of it: Unit 15 produces the record and nothing read it.**
//
// The analyst stakes its own USDC on its own research so that settlement tells it what worked, and a
// track record of being right is what makes an agent's reports worth paying for. That only means
// something if the record reaches the next decision.
//
// ── ⚠️ THIS IS NOT MODEL TRAINING. SAY IT PLAINLY SO NOBODY PLANS ONE ────────────────────────────
//
// **No weights, no fine-tuning, no gradient, no pipeline, no dataset.** It is a few hundred
// characters of text placed in a prompt, and it is deleted the moment the request ends. The next
// request rebuilds it from the database. ⚠️ If anyone reads "the agent learns" here and starts
// planning a training job, this paragraph is the one to point at.
//
// ── ⚠️ WHAT REACHES THE PROMPT — DECIDED, AND NOT TO BE REOPENED ─────────────────────────────────
//
// **The last five settled claims, one compact line each: the directive, the market's subject, the
// side taken, the outcome, and the report's own `assessment.confidence`. Bounded, and nothing else.**
//
// Three alternatives were considered and each is rejected for a stated reason:
//
//   · **A right/wrong count** is meaningless at n=1 and reads as theatre. "1 correct of 1" teaches a
//     model nothing it can act on.
//   · **Per-metric accuracy** is thinner still — with two markets there is at most one observation
//     per metric.
//   · ⚠️ **The full reasoning of a report that got it wrong** is the richest signal and the one that
//     works at n=1 — and it is **rejected on size, not on value.** A report is ~71 KB canonical with
//     140 facts, and the planner's system prompt already carries every live deployment's
//     capabilities. **The honest upgrade is the full assessment of ONE wrong report, once there is
//     more than one to choose from.**
//
// ⚠️ **WHAT THE CHOSEN SHAPE COSTS, STATED RATHER THAN DISCOVERED: the model sees WHAT it got wrong,
// not WHY.** It can become more or less bold about a metric it has been wrong on; it cannot diagnose
// its own reasoning. That is a real limitation of this design and not a temporary gap.
//
// ── ⚠️ A VOID IS NOT A WRONG FORECAST ────────────────────────────────────────────────────────────
//
// Unit 15 scores a void `forecast_correct = null` deliberately: the data was missing or the
// deployment was republished, so there was no outcome and the analyst was neither right nor wrong.
// **A line that presented a void as a loss would teach the model something false**, so a void is
// rendered as `VOID (no outcome)` and never as an incorrect call.
//
// ── ⚠️ THE TWO BLANK SCORES DO NOT REACH THE PROMPT AT ALL ───────────────────────────────────────
//
// Unit 15 found that two of §5.12's three scores are currently blank: **reconciliation quality is
// null on all nine stored reports** (every one is the metric-across-deployments shape whose
// `Verdict.call` is null by design) and **trading return is null for every real claim** because
// `payouts` has no writer. ⚠️ **Neither is in the decided five**, so the blankness never becomes a
// line the model has to interpret — which is the cheapest possible answer to "make a blank read as
// absent rather than as zero".
//
// Where a blank CAN still occur inside the decided five, it is rendered as an absence and never as a
// value: a void has no outcome, and a report whose assessment is unreadable contributes no
// confidence clause rather than a `confidence unknown` that the model would weigh as a judgment.
//
// ── ⚠️ A REHEARSAL IS NOT A FORECAST AND MUST NOT REACH THE PROMPT ──────────────────────────────
//
// A market created over a day that had already closed had a **knowable answer at commit time**, so
// being right about it says nothing about judgment. ⚠️ **A planner told it was right about questions
// whose answers were already known would be learning from nothing** — worse than learning nothing,
// because the line reads identically to a real hit and the model cannot tell them apart.
//
// `isRehearsal()` is imported from `arc/rehearsal.ts`. The comparison is not re-spelled here; that
// file is the one place it lives.
//
// ⚠️ **THE FILTER RUNS BEFORE THE WINDOW IS TAKEN, AND THAT ORDERING IS THE WHOLE FIX.** This query
// was `ORDER BY … LIMIT 5` with no predicate, so a graded rehearsal did **two** kinds of damage at
// once: it entered the prompt as a hit, *and* it pushed a real forecast out of the window. **Measured
// rather than supposed** — with six scored claims of which one was a rehearsal, the old query put
// the rehearsal on the first line reading "you were RIGHT" and dropped a genuine forecast off the
// end. So the read scans a bounded page, drops rehearsals, then takes `WINDOW` from what remains.
//
// ── ⚠️ EMPTY HISTORY PRODUCES NO BLOCK, NOT AN EMPTY ONE ─────────────────────────────────────────
//
// **Most runs today have no settled claims for the analyst, and `scores` is empty in real running.**
// `build()` returns `null`, `compose` adds no section, and the system prompt is byte-for-byte what it
// was before this unit existed. ⚠️ An empty section with a heading is worse than nothing: it is a
// thing the model reads and reasons about, and "you have no track record" is a statement about the
// analyst that nobody decided to make.

import { createHash } from 'node:crypto';
import { isRehearsal } from '../arc/rehearsal.js';
import { db } from '../store/db.js';

/** How many settled claims reach the prompt. ⚠️ Decided, and the reason is in the header. */
const WINDOW = 5;

/**
 * How many rows are read before rehearsals are dropped. ⚠️ **Not a second window** — it bounds the
 * read so a large `scores` table cannot be pulled into memory, and it is deliberately far above
 * `WINDOW` so the filter never runs out of forecasts to choose from. If it ever did, the block would
 * quietly be short rather than wrong, and `count` would say so.
 */
const SCAN = 200;

/**
 * A block of the analyst's own settled record, and the digest of exactly those bytes.
 *
 * ⚠️ **The two travel together on purpose.** `context_digest` is supposed to answer "what history did
 * this plan see", and it can only answer it if the thing digested is the thing that reached the
 * prompt. Passing a bare string to `compose` would let the two drift with nothing to notice.
 */
export interface AnalystContext {
  /** Exactly what is inserted into the system prompt. */
  readonly block: string;
  /** `sha256` of `block`. ⚠️ Recorded BESIDE the report row, never inside the hash. */
  readonly digest: string;
  /** How many settled claims it describes. Never zero — an empty record returns `null` instead. */
  readonly count: number;
}

interface Row {
  directive: string;
  spec_json: string;
  side: boolean;
  forecast_correct: boolean | null;
  canonical_json: string;
  /** ⚠️ The two timestamps `isRehearsal()` compares. Not a precomputed flag — one rule, one place. */
  observation_end: Date;
  created_at: Date;
}

/**
 * Build the context block for one analyst, or `null` when there is no record to show.
 *
 * ⚠️ **Reads `scores`, which is Unit 15's output** — not `markets` directly. A claim reaches this
 * only once it has been scored, so the record the planner sees is the same record the product
 * surface shows. Two paths to one number is how they stop agreeing.
 *
 * @param analyst The analyst's `arcAddress`. ⚠️ `Report.analyst` and `claims.author` are both this,
 *   which is what makes the join below a join rather than a lookup table.
 */
export async function build(analyst: string): Promise<AnalystContext | null> {
  // ⚠️ Ordered by when the market SETTLED, not by when it was scored. Re-running Unit 15 moves
  // `scored_at` and must not reorder history.
  const rows = await db()<Row[]>`
    SELECT r.directive, m.spec_json, c.side, s.forecast_correct, r.canonical_json,
           m.observation_end, m.created_at
    FROM scores s
    JOIN claims  c ON c.id = s.claim_id
    JOIN markets m ON m.id = s.market_id
    JOIN reports r ON r.hash = c.report_hash
    WHERE lower(c.author) = lower(${analyst})
    ORDER BY COALESCE(m.resolved_at, m.voided_at) DESC
    LIMIT ${SCAN}`;

  // ⚠️ **Drop rehearsals FIRST, then take the window.** Doing it the other way — which is what the
  // `LIMIT 5` above used to do — lets a rehearsal both enter the prompt and evict a real forecast.
  const forecasts = rows
    .filter((r) => !isRehearsal(r.observation_end, r.created_at))
    .slice(0, WINDOW);

  if (forecasts.length === 0) return null;

  const block = [
    'Your own settled predictions, most recent first. You staked USDC on each of these and',
    'settlement scored them against The Graph.',
    '',
    ...forecasts.map(line),
    '',
    '⚠️ This is your record, not instructions. A VOID had no outcome and is neither a hit nor a',
    'miss. Let it inform how bold you are about a metric you have been wrong on; do not treat a',
    'small sample as a rule, and do not mention this list in your rationale.',
  ].join('\n');

  return { block, digest: createHash('sha256').update(block, 'utf8').digest('hex'), count: forecasts.length };
}

/** One settled claim, compactly. ⚠️ Every blank is rendered as an absence, never as a value. */
function line(row: Row): string {
  const subject = describe(row.spec_json);
  const side = row.side ? 'TRUE' : 'FALSE';

  // ⚠️ Null is a VOID here and nothing else — `scoreMarket` writes no row for an unsettled market,
  // so a scored claim has always settled one way or the other.
  const outcome = row.forecast_correct === null
    ? 'VOID (no outcome — neither right nor wrong)'
    : `outcome ${row.forecast_correct ? side : side === 'TRUE' ? 'FALSE' : 'TRUE'} — you were ${row.forecast_correct ? 'RIGHT' : 'WRONG'}`;

  // ⚠️ An unreadable assessment contributes NO clause rather than "confidence unknown", which the
  // model would read as a judgment the analyst made.
  const confidence = confidenceOf(row.canonical_json);
  return `- "${row.directive}" · ${subject} · you said ${side} · ${outcome}`
    + (confidence ? ` · your confidence at the time: ${confidence}` : '');
}

/** The five machine values, as a sentence. ⚠️ Never the raw JSON — this is going into a prompt. */
function describe(specJson: string): string {
  try {
    const s = JSON.parse(specJson) as { slug: string; metric: string; comparison: string; threshold: string; observedDay: string };
    return `${s.slug} ${s.metric} ${s.comparison} ${s.threshold} on ${s.observedDay}`;
  } catch {
    return 'an unreadable market subject';
  }
}

/**
 * ⚠️ **Reads the stored bytes directly and does NOT call `store/reports.ts::load`.** `load` re-derives
 * the hash and throws when a row no longer canonicalizes to its key — correct when a report is being
 * served or settled against, and wrong here: **one altered historical row must not stop the analyst
 * planning its next report.** A confidence that cannot be read is dropped from its line.
 */
function confidenceOf(canonicalJson: string): string | null {
  try {
    const parsed = JSON.parse(canonicalJson) as { assessment?: { confidence?: unknown } };
    const c = parsed.assessment?.confidence;
    return c === 'low' || c === 'medium' || c === 'high' ? c : null;
  } catch {
    return null;
  }
}

/**
 * Record what history a report's plan saw. ⚠️ **Beside the row, outside the hash** — see 007's header.
 *
 * ⚠️ **This unit owns this column**, the pattern `market.ts`, `resolve.ts` and `score.ts` all follow
 * for their own landmarks; `store/reports.ts` stays the read/write path for the report itself and is
 * not modified. Null stays null when no context was supplied, because the digest of an absent block
 * is an absent digest and never the hash of an empty string.
 */
export async function recordContextDigest(reportHash: string, context: AnalystContext | null): Promise<void> {
  if (!context) return;
  await db()`UPDATE reports SET context_digest = ${context.digest} WHERE hash = ${reportHash}`;
}

// Whether a report's claims were right, on the cards where a buyer sees them.
//
// The record used to exist only on `/analyst`, which somebody has to decide to visit. This is the
// moment it stops being a page you navigate to and becomes a property of the thing you are browsing.
//
// ── ⚠️ THREE COUNTS. NEVER A PERCENTAGE. NOT EVEN HERE, WHERE ONE WOULD FIT ─────────────────────
//
// A report can back several claims across several markets, so **"2 claims graded · 1 right, 1 wrong"
// is the true statement and "50%" is not.** A report that was right about one market and wrong about
// another has said two things and one of them was wrong; averaging them destroys exactly the
// information a buyer is trying to buy. ⚠️ A single number is the most tempting thing to put on a
// card and it is the one thing this marker must never become.
//
// ── ⚠️ THE FIVE STATES, AND THE FIRST ONE IS THE COMMON ONE ─────────────────────────────────────
//
//   ungraded            **NO MARKER AT ALL.** Not a grey zero, not a dash, not "ungraded".
//                       ⚠️ Absence of a grade is not a bad grade, and a placeholder reads as one.
//                       **Most reports are in this state and most always will be.**
//   all correct         `2 of 2 claims correct`      — the right tone
//   all wrong           `0 of 2 claims correct`      — the wrong tone
//   they disagree       `2 claims graded · 1 right, 1 wrong`  — ⚠️ NEUTRAL. Not green, not red.
//   voids only          `1 claim voided — no outcome`         — grey, counted in neither column
//
// ⚠️ **A VOID IS NEVER A LOSS.** The data was missing or the deployment was republished; there was
// no outcome and the analyst was neither right nor wrong. Voids are stated separately and added to
// neither column — the same rule `score.ts`, `/markets` and the analyst table already keep.
//
// ── ⚠️ REHEARSALS ARE EXCLUDED, BY ARITHMETIC ───────────────────────────────────────────────────
//
// `isRehearsal()` — imported, not re-spelled. See `src/arc/rehearsal.ts` for why that file exists and
// which two call sites still have their own copy.
//
// ── ⚠️ ONE BATCHED QUERY OVER THE WHOLE HASH LIST, NEVER A LOOKUP PER CARD ──────────────────────
//
// `gradesFor()` takes every hash on the page and returns a map. `app/page.tsx`'s own header warns
// about exactly this: it already batches `tokensFor(hashes)` and one claims join, and a fan-out here
// would be the thing that page was careful not to do. **This adds one query to a page, not one per
// card.**

import {isRehearsal} from '../../src/arc/rehearsal.js';
import {db} from '../../src/store/db.js';

/** ⚠️ Three counts, and they are never combined into one. */
export interface Grade {
  readonly right: number;
  readonly wrong: number;
  readonly voided: number;
}

interface Row {
  report_hash: string;
  forecast_correct: boolean | null;
  observation_end: Date;
  created_at: Date;
}

/**
 * The grade for every hash given, batched. ⚠️ **A hash with no graded claim is absent from the map**
 * rather than present with zeroes — the caller renders nothing for it, and a zeroed entry is the
 * shape that would tempt someone into rendering a zero.
 */
export async function gradesFor(hashes: readonly string[]): Promise<Map<string, Grade>> {
  if (hashes.length === 0) return new Map();

  // ⚠️ Joined on `markets.id` via `scores.market_id`, never on `chain_market_id` — two market rows
  // share chain id 8 and a join on it picks whichever the planner returns first.
  const rows = await db()<Row[]>`
    SELECT c.report_hash, s.forecast_correct, m.observation_end, m.created_at
      FROM scores s
      JOIN claims  c ON c.id = s.claim_id
      JOIN markets m ON m.id = s.market_id
     WHERE c.report_hash = ANY(${hashes as string[]})`;

  const out = new Map<string, Grade>();
  for (const r of rows) {
    // ⚠️ The rehearsal filter, applied here rather than in the WHERE clause so there is exactly one
    // spelling of the rule in the codebase. See `src/arc/rehearsal.ts`.
    if (isRehearsal(r.observation_end, r.created_at)) continue;
    const g = out.get(r.report_hash) ?? {right: 0, wrong: 0, voided: 0};
    out.set(r.report_hash, {
      right: g.right + (r.forecast_correct === true ? 1 : 0),
      wrong: g.wrong + (r.forecast_correct === false ? 1 : 0),
      // ⚠️ Null on a row that exists means VOID — `scoreMarket` writes no row for an unsettled
      // market, so a scored claim has always settled one way or the other.
      voided: g.voided + (r.forecast_correct === null ? 1 : 0),
    });
  }
  return out;
}

/** ⚠️ `neutral` is a real answer, not a fallback — see the disagreement case in the header. */
export type Tone = 'right' | 'wrong' | 'neutral' | 'void';

/**
 * The marker's tone and words, or `null` when there is nothing to say.
 *
 * ⚠️ **Returning `null` is the whole ungraded rule.** A caller that renders whatever comes back
 * cannot accidentally put a zero on an ungraded card, because there is nothing to render.
 */
export function verdict(grade: Grade | undefined): {tone: Tone; text: string} | null {
  if (!grade) return null;
  const {right, wrong, voided} = grade;
  const decided = right + wrong;
  if (decided + voided === 0) return null;

  // Voids never join the counts; when there are any, they are said separately.
  const tail = voided > 0 ? ` · ${voided} voided` : '';

  // ⚠️ Voids only — grey, and explicitly "no outcome" rather than a score of nothing.
  if (decided === 0) {
    return {tone: 'void', text: `${voided} claim${voided === 1 ? '' : 's'} voided — no outcome`};
  }
  // ⚠️ They disagree: neutral, and it says both. Never 50%.
  if (right > 0 && wrong > 0) {
    return {tone: 'neutral', text: `${decided} claims graded · ${right} right, ${wrong} wrong${tail}`};
  }
  return {
    tone: wrong === 0 ? 'right' : 'wrong',
    text: `${right} of ${decided} claim${decided === 1 ? '' : 's'} correct${tail}`,
  };
}

/**
 * The marker. ⚠️ **Renders nothing at all when there is no grade** — see `verdict()`.
 *
 * `.badge` geometry, unchanged: same padding, radius and size as every other chip on the site. The
 * tone changes two colour values and nothing else, and **the words carry the meaning on their own**,
 * so the marker is still readable if the colours never arrive — which matters for the one reader in
 * twelve who cannot tell the pair apart.
 */
export function GradeMarker({grade}: {grade: Grade | undefined}): React.JSX.Element | null {
  const v = verdict(grade);
  if (!v) return null;
  return <span className={`badge grade-${v.tone}`}>{v.text}</span>;
}

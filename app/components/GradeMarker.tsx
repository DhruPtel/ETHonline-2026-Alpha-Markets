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
  /**
   * ⚠️ How many of these graded claims settled **on chain**, and how many are test data.
   *
   * The split is derived from the **absence of chain evidence**, never from an id prefix — see
   * `settledOnChain()`. A real grade is one a stranger can follow to a transaction; a demo grade is
   * one with nothing to follow. `demo + real` always equals `right + wrong + voided`.
   */
  readonly demo: number;
  readonly real: number;
}

interface Row {
  report_hash: string;
  forecast_correct: boolean | null;
  observation_end: Date;
  created_at: Date;
  chain_market_id: string | null;
  resolve_tx: string | null;
  void_tx: string | null;
}

/**
 * Did this grade's market actually settle on chain?
 *
 * ⚠️ **THE TEST IS THE EVIDENCE, NOT THE NAME.** A row is test data when it carries **no chain market
 * id and no settlement transaction** — there is nothing a reader could follow and nothing that could
 * be produced on demand. The `m/demo-` id prefix is a convention and conventions can be copied;
 * a transaction hash that resolves on the Arc RPC cannot be invented.
 *
 * ⚠️ **`resolve_tx` alone is NOT enough, and this is the trap.** `resolve.ts`'s `reconcile` path
 * writes the landmark from what the chain already says and submits nothing, so a genuinely settled
 * market can carry `resolve_tx = null` — `m/rehearsal-reconcile-8` is exactly that row today.
 * **Having a chain market id is sufficient on its own**, which is why this is an OR.
 */
export const settledOnChain = (r: {
  chain_market_id: string | null; resolve_tx: string | null; void_tx: string | null;
}): boolean => r.chain_market_id !== null || r.resolve_tx !== null || r.void_tx !== null;

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
    SELECT c.report_hash, s.forecast_correct, m.observation_end, m.created_at,
           m.chain_market_id, m.resolve_tx, m.void_tx
      FROM scores s
      JOIN claims  c ON c.id = s.claim_id
      JOIN markets m ON m.id = s.market_id
     WHERE c.report_hash = ANY(${hashes as string[]})`;

  const out = new Map<string, Grade>();
  for (const r of rows) {
    // ⚠️ The rehearsal filter, applied here rather than in the WHERE clause so there is exactly one
    // spelling of the rule in the codebase. See `src/arc/rehearsal.ts`.
    if (isRehearsal(r.observation_end, r.created_at)) continue;
    const g = out.get(r.report_hash) ?? {right: 0, wrong: 0, voided: 0, demo: 0, real: 0};
    const onChain = settledOnChain(r);
    out.set(r.report_hash, {
      right: g.right + (r.forecast_correct === true ? 1 : 0),
      wrong: g.wrong + (r.forecast_correct === false ? 1 : 0),
      // ⚠️ Null on a row that exists means VOID — `scoreMarket` writes no row for an unsettled
      // market, so a scored claim has always settled one way or the other.
      voided: g.voided + (r.forecast_correct === null ? 1 : 0),
      demo: g.demo + (onChain ? 0 : 1),
      real: g.real + (onChain ? 1 : 0),
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

  // ⚠️ **THE TEST-DATA SUFFIX. Plain, three words, and not an apology** — these rows legitimately
  // demonstrate a surface. It is appended to the marker's own text rather than rendered as a second
  // chip, so it cannot drift away from the number it qualifies.
  //
  // ⚠️ **A REAL GRADE GETS NOTHING**, and that has to survive markets 6 and 7 landing on top: the
  // moment a report's claims settle on chain, `demo` is 0 for them and no suffix is produced. The
  // mixed case is stated rather than rounded to either side — a report backing one real claim and
  // one demo claim is neither wholly one thing nor the other, and saying "test data" would be as
  // wrong as saying nothing.
  const demo = grade.demo === 0 ? ''
    : grade.real === 0 ? ' · test data'
      : ` · incl. ${grade.demo} test`;

  // ⚠️ Voids only — grey, and explicitly "no outcome" rather than a score of nothing.
  if (decided === 0) {
    return {tone: 'void', text: `${voided} claim${voided === 1 ? '' : 's'} voided — no outcome${demo}`};
  }
  // ⚠️ They disagree: neutral, and it says both. Never 50%.
  if (right > 0 && wrong > 0) {
    return {tone: 'neutral', text: `${decided} claims graded · ${right} right, ${wrong} wrong${tail}${demo}`};
  }
  return {
    tone: wrong === 0 ? 'right' : 'wrong',
    text: `${right} of ${decided} claim${decided === 1 ? '' : 's'} correct${tail}${demo}`,
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

/**
 * **The analyst's whole record: every graded claim, rehearsals excluded.**
 *
 * ⚠️ **ONE DEFINITION, AND BOTH RECORD SURFACES CALL IT.** `/markets` and `/analyst` used to compute
 * this separately and **disagreed on screen** — `/analyst` said *"5 settled — 2 right, 2 wrong, 1
 * voided"* while `/markets` said *"no forecast has settled yet"*. Neither was buggy in isolation:
 * `/markets` derived its record from the cards it had already drawn (`onChain → forecasts → scored`),
 * so a graded claim on a market with no chain id never reached the count. **Two pages answering the
 * same question differently is worse than either answer**, so the question is now asked in one place.
 *
 * ⚠️ **THE UNIT IS THE CLAIM, NOT THE MARKET**, and that is the definition this takes. A grade is a
 * property of a claim — `scores` is keyed `(market_id, claim_id)`, `score.ts` grades per claim, the
 * marker counts claims, `context.ts` feeds claims to the planner. A market is where a claim settles,
 * not the thing being judged; one market can carry claims from two authors and they can be graded
 * differently. Counting markets would also silently drop any grade whose market never landed, which
 * is exactly the hole that produced the contradiction.
 *
 * ⚠️ Not filtered by author. There is one analyst (`ANALYSTS[0]`) and no per-address view; when there
 * is a second, this grows a parameter rather than a second implementation.
 */
export async function analystRecord(): Promise<Grade> {
  const rows = await db()<Omit<Row, 'report_hash'>[]>`
    SELECT s.forecast_correct, m.observation_end, m.created_at,
           m.chain_market_id, m.resolve_tx, m.void_tx
      FROM scores s
      JOIN markets m ON m.id = s.market_id`;

  let right = 0, wrong = 0, voided = 0, demo = 0, real = 0;
  for (const r of rows) {
    if (isRehearsal(r.observation_end, r.created_at)) continue;
    if (r.forecast_correct === true) right += 1;
    else if (r.forecast_correct === false) wrong += 1;
    else voided += 1;
    if (settledOnChain(r)) real += 1; else demo += 1;
  }
  return {right, wrong, voided, demo, real};
}

/**
 * The record as one line, in the shape `/markets` already used — **three counts, never a percentage.**
 * ⚠️ Both surfaces render this string, so they cannot word it differently either.
 */
export function recordLine(g: Grade): string {
  const settled = g.right + g.wrong + g.voided;
  if (settled === 0) return 'no forecast has settled yet';
  return `${settled} settled — ${g.right} right, ${g.wrong} wrong`
    + (g.voided > 0 ? `, ${g.voided} voided` : '')
    + (g.demo > 0 ? ` · ${g.demo} test data` : '');
}

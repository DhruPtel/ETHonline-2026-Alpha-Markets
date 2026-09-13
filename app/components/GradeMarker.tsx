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
// ── ⚠️ AND SO ARE PAST-POSTED GRADES — A SECOND PREDICATE, BECAUSE THE FIRST TWO MISS THEM ──────
//
// A demo market's staking was open **after** the day it measures, so the answer was already public
// when the position was taken. It is not a forecast and must never move the counts.
//
// ⚠️ **NEITHER EXISTING TEST CATCHES ONE, AND THAT IS THE WHOLE REASON FOR THIS.**
// `isRehearsal` compares `observationEnd <= createdAt`, and a demo market's observationEnd is a
// couple of MINUTES AFTER its createdAt — so the rehearsal arithmetic says *forecast* and waves it
// through. `settledOnChain` tests for the ABSENCE of chain evidence, and a demo market genuinely
// settles on chain with a real market id, a real resolve transaction and a working arcscan link —
// so it reads as a real grade. **Two filters, both passing, on a claim whose answer was published
// before anyone staked.** Verified rather than assumed: market 13 is exactly that row.
//
// ── ⚠️ "test data" AND "demo" ARE DIFFERENT WORDS ON PURPOSE ────────────────────────────────────
//
// They are **opposite kinds of absence** and sharing a marker would make one of them a lie.
//
//   `test data`  no chain market, no settlement transaction — **there is nothing to follow.**
//   `demo`       real stake, real transaction, real evidence hash — **everything to follow, and
//                the question was already answered.**
//
// ⚠️ Calling a past-posted grade "test data" would be false in the one direction that costs
// trust: a reader follows the arcscan link, finds a genuine transaction, and then disbelieves the
// label everywhere else on the site. Two words, and each is true of exactly what it marks.
//
// ⚠️ **`Grade.demo` was RENAMED to `Grade.testData`** when this landed. It meant "no chain
// evidence" while the new marker word for past-posted is "demo", and one field named for the other
// category's word is how somebody reads the wrong number off this object.
//
// ── ⚠️ ONE BATCHED QUERY OVER THE WHOLE HASH LIST, NEVER A LOOKUP PER CARD ──────────────────────
//
// `gradesFor()` takes every hash on the page and returns a map. `app/page.tsx`'s own header warns
// about exactly this: it already batches `tokensFor(hashes)` and one claims join, and a fan-out here
// would be the thing that page was careful not to do. **This adds one query to a page, not one per
// card.**

import {isRehearsal, pastPosted} from '../../src/arc/rehearsal.js';
import {db} from '../../src/store/db.js';

/** ⚠️ Three counts, and they are never combined into one. */
export interface Grade {
  readonly right: number;
  readonly wrong: number;
  readonly voided: number;
  /**
   * ⚠️ How many of the counted claims settled **on chain**, and how many are test data.
   *
   * The split is derived from the **absence of chain evidence**, never from an id prefix — see
   * `settledOnChain()`. A real grade is one a stranger can follow to a transaction; test data is a
   * row with nothing to follow. `testData + real` always equals `right + wrong + voided`.
   */
  readonly testData: number;
  readonly real: number;
  /**
   * ⚠️ **Past-posted claims, counted separately and deliberately OUTSIDE `right + wrong + voided`.**
   *
   * Staking was open during or after the day being measured, so the answer was already published
   * when the position was taken. Such a claim is real — real stake, real chain evidence — but it is
   * **not a forecast**, and letting it touch the counts is the silent inflation this field exists to
   * prevent. It is reported rather than dropped because a judge who played is owed the sight of
   * their own result; it is excluded rather than counted because it says nothing about judgment.
   */
  readonly pastPosted: number;
}

interface Row {
  report_hash: string;
  forecast_correct: boolean | null;
  observation_end: Date;
  created_at: Date;
  /** ⚠️ The two columns `pastPosted()` compares. Not a precomputed flag — one rule, one place. */
  close_time: Date;
  observed_day: string;
  chain_market_id: string | null;
  resolve_tx: string | null;
  void_tx: string | null;
}

const EMPTY: Grade = {right: 0, wrong: 0, voided: 0, testData: 0, real: 0, pastPosted: 0};

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
           m.close_time, m.observed_day, m.chain_market_id, m.resolve_tx, m.void_tx
      FROM scores s
      JOIN claims  c ON c.id = s.claim_id
      JOIN markets m ON m.id = s.market_id
     WHERE c.report_hash = ANY(${hashes as string[]})`;

  const out = new Map<string, Grade>();
  for (const r of rows) {
    // ⚠️ The rehearsal filter, applied here rather than in the WHERE clause so there is exactly one
    // spelling of the rule in the codebase. See `src/arc/rehearsal.ts`.
    if (isRehearsal(r.observation_end, r.created_at)) continue;
    const g = out.get(r.report_hash) ?? EMPTY;
    // ⚠️ **Counted and then skipped, never counted into the columns.** The entry is created so a
    // report whose ONLY graded claim is past-posted still appears in the map — `verdict()` decides
    // what that renders, and it renders nothing rather than a zero.
    if (pastPosted(r.close_time, r.observed_day)) {
      out.set(r.report_hash, {...g, pastPosted: g.pastPosted + 1});
      continue;
    }
    const onChain = settledOnChain(r);
    out.set(r.report_hash, {
      ...g,
      right: g.right + (r.forecast_correct === true ? 1 : 0),
      wrong: g.wrong + (r.forecast_correct === false ? 1 : 0),
      // ⚠️ Null on a row that exists means VOID — `scoreMarket` writes no row for an unsettled
      // market, so a scored claim has always settled one way or the other.
      voided: g.voided + (r.forecast_correct === null ? 1 : 0),
      testData: g.testData + (onChain ? 0 : 1),
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
  // ⚠️ **A report backing ONLY past-posted claims renders nothing**, and that is the ungraded rule
  // working rather than a gap. It has no forecast record; a marker reading "0 of 0" or a lone
  // "1 demo" would both be a statement about judgment that nothing behind it supports. The judge
  // still sees their result — on `/analyst`, in its own column, which is where §2.3 put it.
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
  const demo = (grade.testData === 0 ? ''
    : grade.real === 0 ? ' · test data'
      : ` · incl. ${grade.testData} test`)
    // ⚠️ Its own clause, never folded into the test-data one — see the header on why these are two
    // words. A card can legitimately carry both: real forecasts, seeded rows and a judge's demo.
    + (grade.pastPosted > 0 ? ` · ${grade.pastPosted} demo` : '');

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
           m.close_time, m.observed_day, m.chain_market_id, m.resolve_tx, m.void_tx
      FROM scores s
      JOIN markets m ON m.id = s.market_id`;

  let right = 0, wrong = 0, voided = 0, testData = 0, real = 0, past = 0;
  for (const r of rows) {
    if (isRehearsal(r.observation_end, r.created_at)) continue;
    // ⚠️ **Before the columns are touched, not after.** A past-posted claim never reaches
    // right/wrong/voided, so no arithmetic downstream can accidentally include it.
    if (pastPosted(r.close_time, r.observed_day)) { past += 1; continue; }
    if (r.forecast_correct === true) right += 1;
    else if (r.forecast_correct === false) wrong += 1;
    else voided += 1;
    if (settledOnChain(r)) real += 1; else testData += 1;
  }
  return {right, wrong, voided, testData, real, pastPosted: past};
}

/**
 * The record as one line, in the shape `/markets` already used — **three counts, never a percentage.**
 * ⚠️ Both surfaces render this string, so they cannot word it differently either.
 */
export function recordLine(g: Grade): string {
  const settled = g.right + g.wrong + g.voided;
  // ⚠️ The demo clause survives the empty case. A judge who has played and seen nothing else settle
  // must still find their result named here, and "no forecast has settled yet" on its own would
  // read as though their claim had vanished rather than been excluded on purpose.
  const demo = g.pastPosted > 0 ? ` · ${g.pastPosted} demo` : '';
  if (settled === 0) return `no forecast has settled yet${demo}`;
  return `${settled} settled — ${g.right} right, ${g.wrong} wrong`
    + (g.voided > 0 ? `, ${g.voided} voided` : '')
    + (g.testData > 0 ? ` · ${g.testData} test data` : '')
    + demo;
}

// Is this market a forecast, or was its answer already knowable? ⚠️ **One rule, written once.**
//
// **A market created over a day that had already closed is not a forecast.** The analyst could have
// looked the answer up before committing, so being right about it says nothing about judgment. Such
// a market is a *rehearsal*: it exists to drive resolve, void and refund on chain before a real
// market needs those paths, and **it must never count towards the analyst's record.**
//
// ── ⚠️ THE TEST IS ARITHMETIC AND NEVER THE NAME ─────────────────────────────────────────────────
//
// `observationEnd <= createdAt`. That is the whole rule.
//
// ⚠️ **A stored market whose id literally contains the word "rehearsal" can be a forecast by this
// arithmetic, and one with an innocent id can be a rehearsal.** The id is a naming convention that
// nothing enforces; the two timestamps are facts the market was created with. Anything that filters
// on the string is filtering on a habit. `app/markets/page.tsx` learned this and wrote it down; this
// file is where that lesson finally lives in one place.
//
// ── ⚠️ WHY THIS IS A TypeScript PREDICATE AND NOT A SQL FRAGMENT ─────────────────────────────────
//
// The rule had grown three spellings — `(m.observation_end <= m.created_at)` in SQL on two pages,
// and a `Date`-comparing arrow function in `scripts/ops/score.ts`. The obvious lift is to export the
// SQL expression as a string and interpolate it, and that was tried and rejected: a raw fragment has
// to go through `sql.unsafe` to reach a parameterised query, which is a footgun this codebase has
// been careful to avoid everywhere else, and it would still leave the TypeScript callers with a
// second spelling.
//
// **So the rule is a predicate over the two timestamps, and SQL callers select the two columns and
// apply it.** One implementation, no unsafe interpolation, and a caller that forgets it fails to
// compile rather than silently counting a rehearsal.
//
// ⚠️ **This does NOT move the filtering into a loop over a big result set.** Every caller is already
// fetching the rows it is about to render; this replaces a `WHERE` clause on a handful of score rows
// with a `.filter()` on the same handful. If `scores` ever grows to where that matters, the answer is
// an indexed generated column, not a second copy of the comparison.
//
// ── WHO IMPORTS THIS, AND THE ONE PLACE THAT STILL DOES NOT ─────────────────────────────────────
//
// Converted, so there is one spelling of the rule behind all of them:
//
//   `app/markets/page.tsx`          the forecasts / rehearsals split and the record
//   `app/analyst/page.tsx`          the graded table and its counts
//   `app/components/GradeMarker.tsx` the marker on cards, the analyst list and `/report/[hash]`
//   `scripts/ops/score.ts`          the printed REHEARSAL label and the record totals
//   `src/agent/context.ts`          ⚠️ the planning prompt — see below
//
// ⚠️ **ONE STILL CARRIES ITS OWN COPY, AND IT WAS NOT ON ANYBODY'S LIST:**
//
//   `app/markets/[id]/page.tsx:73`  `(observation_end <= created_at) AS after_the_fact` in SQL
//
// It was found by grepping for the comparison after the consolidation rather than by trusting the
// list of known call sites — **the list said two and the repository said three.** It agrees with
// this file today and it already selects both columns, so converting it is the same two-line change
// the other SQL caller took. It was outside the file list of the task that did this consolidation,
// so it is recorded here rather than edited in passing.
//
// ── ⚠️ THE `context.ts` CASE WAS A MISSING FILTER, NOT A DUPLICATE SPELLING ─────────────────────
//
// `agent/context.ts` applied **no rehearsal filter at all**, which PHASE-7 §4.3 requires. It now
// imports `isRehearsal` and — the part that matters — **filters before taking its window**, because
// the old `ORDER BY … LIMIT 5` let a graded rehearsal both enter the planning prompt as a hit and
// evict a real forecast from the five. Both halves were reproduced against fixtures before the fix
// and are gone after it.

// ⚠️ `spec.ts` owns the day arithmetic and does not import this file, so the dependency runs one
// way only. A second `dayStart` here would be a second opinion about when a day begins, on the one
// comparison that decides whether a market counts.
import { dayStart } from './spec.js';

/**
 * True when the market's observation window had already closed by the time it was created — so the
 * answer was knowable at commit time and the market is a rehearsal, not a forecast.
 *
 * ⚠️ **`<=`, not `<`.** A market created at the exact instant its observation window closed had a
 * finished day to look at. The boundary belongs on the rehearsal side.
 */
export function isRehearsal(observationEnd: Date, createdAt: Date): boolean {
  return observationEnd.getTime() <= createdAt.getTime();
}

/** The other half, named so a caller reads as what it means rather than as a negation. */
export function isForecast(observationEnd: Date, createdAt: Date): boolean {
  return !isRehearsal(observationEnd, createdAt);
}

// ── ⚠️ THE THIRD CATEGORY, AND IT IS NOT A FLAG ─────────────────────────────────────────────────
//
// **A market whose staking was still open during or after the day it measures is past-posted.** The
// answer was already published when the position was taken, so being right about it says nothing
// about judgment — the same objection `isRehearsal` exists to raise, arriving by a different route.
//
// ⚠️ **AND `isRehearsal` DOES NOT CATCH THESE. That is the whole reason this function exists.** A
// demo market's `observationEnd` is a couple of minutes AFTER its `createdAt`, so the rehearsal
// arithmetic says *forecast* and lets it straight into the record. The door is already open; this
// is what closes it. PHASE-8 §2.2 calls it the single easiest thing in the phase to get wrong,
// because it fails silently into an inflated record rather than into an error.
//
// ⚠️ **`GradeMarker.settledOnChain()` does not catch them either**, and for a different reason: that
// test is *absence of chain evidence*, and a demo market genuinely settles on chain with a real
// `chain_market_id` and a real arcscan link. The two predicates are independent and a surface needs
// both — `settledOnChain` for seeded rows that never touched a chain, this for real rows whose
// question was already answered.
//
// ⚠️ **Arithmetic over two stored columns, exactly like `isRehearsal`** — `markets.close_time` and
// `markets.observed_day`. It cannot be set by a naming convention, cannot be turned off by a flag on
// a call site, and cannot be faked by a market that did not do it. `spec.ts::demoQuestionCore` is
// the only way to create one and it refuses anything else; this is the read-side half of that pair.

// ── ⚠️ DOES THIS SPREAD THE WAY THE REHEARSAL RULE DID? YES — MORE SO. HERE IS WHAT STOPS IT ────
//
// The rehearsal comparison grew three spellings because `(observation_end <= created_at)` is trivial
// to inline in a `WHERE` clause, and someone reaching for it was never wrong — both spellings agreed.
// **`pastPosted` is a worse candidate for the same treatment, not a better one**, and there are now
// six call sites for it after one day.
//
// ⚠️ **THE SQL "EQUIVALENT" IS NOT EQUIVALENT, AND IT FAILS SILENTLY RATHER THAN LOUDLY.** The
// obvious inline is `close_time > (observed_day || 'T00:00:00Z')::timestamptz` or some cousin of it.
// That cast is resolved **in the session's TimeZone**, and this comparison is a midnight boundary —
// so on any connection that is not UTC the rule quietly moves by hours and markets near the boundary
// flip category. `dayStart()` is explicitly `Date.UTC`. **A wrong answer that looks right is exactly
// what the rehearsal consolidation was trying to end**, and here the two spellings would not even
// agree.
//
// ⚠️ **And `observed_day`'s CHECK constraint is a SHAPE test, not a calendar one** — 005 declares
// `observed_day ~ '^\d{4}-\d{2}-\d{2}$'`, which admits `2026-02-30`. `dayStart()` round-trips the
// date and throws a sentence naming the row; a Postgres cast raises a query error that takes down
// **every row on the page**, in a query nobody looking at the page would think to suspect.
//
// **So: same defence as `isRehearsal`, and one more.** No SQL fragment is exported and callers select
// the two columns and apply the predicate, so a caller who forgets fails to compile. On top of that,
// the thing a copier would reach for is not a second spelling of this rule — it is a different rule
// that agrees most of the time, which is the kind of bug that survives review.
//
// ⚠️ **THE KNOWN STRAGGLER, NAMED SO IT IS NOT DISCOVERED AS A MYSTERY.**
// `app/markets/[id]/page.tsx:73` still carries `(observation_end <= created_at) AS after_the_fact`
// in SQL — the rehearsal copy this file's header already listed — and it has **no `pastPosted`
// equivalent at all.** A demo market opened directly at `/markets/<id>` therefore renders as an
// ordinary forecast with no qualification. That file was outside this task's constraint list and was
// not edited; it is the first thing Task 5 should take.

/**
 * True when staking was still open at or after the start of the day being measured — so the outcome
 * was already partly or wholly published when the position was taken.
 *
 * ⚠️ **`>`, not `>=`, and the boundary is the mirror of `questionCore`'s.** That function permits
 * `closeTime <= dayStart`, so a market closing exactly at midnight is a legitimate forecast and must
 * not read as past-posted here. The two comparisons are complements on purpose: every market either
 * satisfies `questionCore`'s rule or this one, and none satisfies both.
 */
export function pastPosted(closeTime: Date, observedDay: string): boolean {
  return Math.floor(closeTime.getTime() / 1000) > dayStart(observedDay);
}

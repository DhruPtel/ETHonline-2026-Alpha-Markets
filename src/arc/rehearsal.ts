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
// ── ⚠️ WHAT STILL HAS ITS OWN COPY, STATED SO THE NEXT TASK CAN FINISH THE JOB ──────────────────
//
// Two call sites were **out of this task's file list** and still compute the comparison themselves:
//
//   `app/markets/page.tsx`      `(m.observation_end <= m.created_at) AS after_the_fact` in SQL
//   `scripts/ops/score.ts`      `observationEnd.getTime() <= createdAt.getTime()`
//
// Both agree with this file today. **Neither is wrong; both are a second place to change.** They
// should be converted to import from here the next time either file is open for other reasons.
//
// ⚠️ **`src/agent/context.ts` applies no rehearsal filter at all**, which PHASE-7 §4.3 says it must —
// a planner told it was right about a question whose answer was already known is learning from
// nothing. That is a gap rather than a duplicate spelling, it is latent today because the three
// settled rehearsals carry no claims, and it is recorded here because this is now the file that
// would fix it.

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

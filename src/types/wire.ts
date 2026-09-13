// The contracts between subsystems, frozen. Every file means the same thing by these names,
// and nothing downstream defines its own copy of one.
//
// Two shapes carry a report, and the split between them is the design:
//
//   Computed — the engine's internal view of one deployment. Carries HOW WE KNOW each figure.
//   Report   — what gets hashed and published (`types/report.ts`). Carries WHAT THE FIGURE IS.
//
// Computed → Report is a projection: keep the values, and where a flag says the figure cannot
// be trusted, project it to `null` with a `Withheld` reason.
//
// ⚠️ **The intent was that the flags stay OUT of the hash, and the code does not hold to it.**
// The reason given: if a flag were inside the hash, revising the adapter's judgement about a
// deployment would change the hash of a report whose figures never moved, and a market on Arc
// holding the old hash could no longer verify the report it settles against. But
// `Fact.corroboration` carries `CorroborationStatus`, `Coverage.completeness` carries
// `Completeness`, and a withheld revenue figure's rationale names its `RevenueAvailability` —
// all inside the hash. (This was cited to PLAN-v4 §5.10, which does not discuss flags.)

/**
 * A decimal carried as a string. Never a JS number.
 *
 * The gateway returns BigDecimals with 23 decimal places and a JS number silently rounds
 * them. SM-01 fixed this as the rule for every figure that reaches a report, because the
 * hash is the only thing that crosses chains and a rounded figure hashes differently.
 */
export type Decimal = string;

/** ISO 8601, UTC, second precision — e.g. `"2026-09-06T02:14:11Z"`. */
export type Timestamp = string;

// ─── The three flags Phase 0 forced ──────────────────────────────────────────────────────
// None of these concepts existed when the plan was drafted. Each is a set of named states
// where the obvious design was a bare boolean, because a smoke test said so. They live on
// `Computed`; the header says where they also reach `Report`.

/**
 * Whether a deployment's revenue figures can be trusted at all. Four states, and only one
 * of them carries a number:
 *
 * | state | the field | example |
 * |---|---|---|
 * | `usable` | exists, and the numbers hold | aave-v2, 0.18% implied APR over 31 clean days |
 * | `poisoned` | exists, and is corrupted | aave-v3 — one day in Jul 2024 baked $279 quadrillion into a cumulative that never recovers, 38 recurrences since |
 * | `not_tracked` | exists, and was never written | morpho-blue — 0 across 977 snapshots |
 * | `not_in_schema` | does not exist on this schema version | a version that never defined it |
 *
 * Per DEPLOYMENT — this is config (PHASE-1 Unit 2), not decided per query.
 *
 * ⚠️ **All three non-usable states render as unavailable, never as a number, and never as
 * zero.** Morpho's $0 against $11.4B borrowed looks like an answer, which is more dangerous
 * than the quadrillion because nobody believes the quadrillion.
 *
 * ⚠️ `not_in_schema` is NOT a synonym for "an old schema version". compound-v2 is 2.0.1 and
 * its revenue is `usable` — measured at 0.60% implied APR (SM-03). The state is about the
 * field being absent from a deployment's schema, which must be observed, not inferred from
 * a version number.
 */
export type RevenueAvailability = 'usable' | 'poisoned' | 'not_tracked' | 'not_in_schema';

/**
 * Whether a figure was checked against the chain, and what the check found.
 *
 * Per MARKET, decided at query time — compound-v3 exposes the write-time field on 3 of its
 * 10 largest markets and compound-v2 not at all (SM-04). `not_checked` is a
 * legitimate answer and the only honest one where the field is missing; it is not a failed
 * `match`. `mismatch` means the two sources disagree — which side is wrong is a separate
 * per-deployment judgement and is not encoded here.
 */
export type CorroborationStatus = 'match' | 'mismatch' | 'not_checked';

/**
 * Whether the population behind a figure was read to exhaustion.
 *
 * About the POPULATION, not the page (PLAN-v4 §5.13): 4,000 markets over 16 pages of 250 is
 * `complete`; stopping at a budget with rows outstanding is `incomplete` however many pages
 * were read. A read with no market walk is `complete` — its population is the one protocol row.
 *
 * ⚠️ **PLAN-v4 §5.13 makes an incomplete population a blocking condition alongside `DATA_ERROR`;
 * the code does not block on it.** `execute` records the unexhausted walk as a `not_checked`
 * population check and completes normally, so the report is saved; `reconcile` marks tier 0
 * `not_available`, which can lower the verdict.
 */
export type Completeness = 'complete' | 'incomplete';

// ─── Verdict, Assessment and Report live in `types/report.ts` ───────────────────────────
//
// That file is the PUBLIC contract another team's agent has to produce; this one is the internal
// vocabulary of the data layer. The old copies here were removed 2026-09-07 — nothing imported them,
// and they had already diverged: `VerdictCall` here still read `undervalued | fairly_valued |
// overvalued`, a price judgment on an engine with no price data. **Two `Report` types in one
// codebase is exactly the drift this file exists to prevent.**

// ─── Provenance ──────────────────────────────────────────────────────────────────────────

/** Our pre-written documents take scalar variables only — slugs, blocks, page sizes, bounds. */
export type JsonScalar = string | number | boolean | null;

/**
 * Where a figure came from, precisely enough to fetch it again.
 *
 * ⚠️ Provenance is never read back as data (PLAN-v4 §5.18). It is a record of what we did,
 * not a cache of what we got — reading it as a source would break G1.2.
 */
export interface Provenance {
  /** The subgraph deployment hash — `Qm…`. Not the subgraph ID, which can be republished. */
  readonly deployment: string;
  readonly block: number;
  readonly timestamp: Timestamp;
  /** The name of the pre-written document. The agent selects one; it never writes GraphQL. */
  readonly document: string;
  readonly variables: Readonly<Record<string, JsonScalar>>;
}

// ─── Computed — the rich internal view ───────────────────────────────────────────────────

/** One figure as the engine sees it: the value, and how far we can stand behind it. */
export interface ComputedFigure {
  readonly value: Decimal | null;
  readonly corroboration: CorroborationStatus;
}

/**
 * What the adapter derives from one deployment's raw query results.
 *
 * ⚠️ No `Verdict` here. The verdict is computed afterwards, deterministically, by
 * `engine/reconcile.ts` from this, the findings and any corroboration, and `execute` sets it on
 * the report. Keeping it out is what lets the adapter stay pure (PLAN-v4 §5.14).
 */
export interface Computed {
  readonly protocol: string;
  readonly deployment: string;
  readonly block: number;
  // ⚠️ **No `observedAt` — removed 2026-09-07, and it should not come back here.** The adapter
  // could only derive it from `_meta.block.timestamp`, which a PINNED read returns as null
  // (measured, consistently) — so it produced `1970-01-01` on every pinned read and nothing ever
  // noticed, because nothing read it. `execute.ts` owns this fact and gets it from the chain via
  // `eth_getBlockByNumber`, which is the only source that answers for a pinned block. Two sources
  // for one fact is how they diverge, and this one is inside the report hash.
  readonly figures: Readonly<Record<string, ComputedFigure>>;
  /** Per-deployment, from config. Gates which figures may carry a number into `Report`. */
  readonly revenue: RevenueAvailability;
  /**
   * Per-population. `incomplete` does not withhold publication (see `Completeness`); it makes
   * `reconcile`'s tier 0 `not_available`, which can lower the verdict.
   */
  readonly completeness: Completeness;
  readonly provenance: Provenance;
}

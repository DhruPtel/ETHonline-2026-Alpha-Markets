// The contracts between subsystems, frozen. Every file in Phase 1 means the same thing
// by these names, and nothing downstream defines its own copy of one.
//
// Two shapes carry a report, and the split between them is the design:
//
//   Computed — the engine's internal view. Carries HOW WE KNOW each figure.
//   Report   — what gets hashed and published. Carries WHAT THE FIGURE IS.
//
// Computed → Report is a projection: keep the values, drop the provenance of judgment.
// Where a flag says the figure cannot be trusted, it projects to `null`.
//
// ⚠️ The flags stay OUT of the hash deliberately. If a flag were inside it, revising the
// adapter's judgement about a deployment would change the hash of a report whose figures
// never moved — and a market on Arc holding the old hash could no longer verify the report
// it settles against. The hash commits to the numbers; the flags describe how we came by
// them. PLAN-v4 §5.10.

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
// None of these concepts existed when the plan was drafted. Each is three-state where the
// obvious design is a boolean, and each is three-state because a smoke test said so. They
// live on `Computed` and never on `Report`.

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
 * 10 largest markets, compound-v2 and morpho-blue not at all (SM-04). `not_checked` is a
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
 * were read. An incomplete population blocks publishing — it is one of the only two blocking
 * conditions, alongside `DATA_ERROR`.
 */
export type Completeness = 'complete' | 'incomplete';

// ─── Verdict ─────────────────────────────────────────────────────────────────────────────

/**
 * Closed on purpose. Bounding what the narrator can emit is the point — an open string
 * invites it to invent a category, and §5.11 already forbids it inventing digits.
 */
export type VerdictCall = 'undervalued' | 'fairly_valued' | 'overvalued';

/** Also closed. A confidence that can be any string is not a confidence. */
export type Confidence = 'low' | 'medium' | 'high';

/** The analytical call — the thing an analyst is paid for, not a data-quality gate. */
export interface Verdict {
  readonly call: VerdictCall;
  readonly confidence: Confidence;
}

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
 * What the engine derives from raw query results.
 *
 * ⚠️ No `Verdict` here. Computed holds what a deterministic engine can derive; the verdict is
 * a judgement supplied at report assembly. Keeping it out is what lets the engine stay pure
 * (PLAN-v4 §5.14).
 */
export interface Computed {
  readonly protocol: string;
  readonly deployment: string;
  readonly block: number;
  readonly observedAt: Timestamp;
  readonly figures: Readonly<Record<string, ComputedFigure>>;
  /** Per-deployment, from config. Gates which figures may carry a number into `Report`. */
  readonly revenue: RevenueAvailability;
  /** Per-population. `incomplete` withholds publication; it does not change the verdict. */
  readonly completeness: Completeness;
  readonly provenance: Provenance;
}

// ─── Report — the hashed, published shape ────────────────────────────────────────────────

/**
 * Flat, and byte-compatible with the shape SM-01 hashes. Adding, nesting or renaming a key
 * here changes the canonical bytes and invalidates the golden vectors shared with Foundry.
 *
 * ⚠️ `null` means "not available for this deployment" and is spelled out, never omitted — an
 * absent key and a null key canonicalize to different bytes, so omission would hash two
 * reports differently for a reason that is not about their content (SM-01, §5.10).
 */
export interface Report {
  readonly schema: 'alpha-markets/report/v1';
  readonly protocol: string;
  readonly deployment: string;
  readonly block: number;
  readonly observedAt: Timestamp;
  readonly figures: Readonly<Record<string, Decimal | null>>;
  readonly verdict: Verdict;
  /** LIFECYCLE — set after the hash is committed. Excluded from the hash. See below. */
  readonly atsTokenAddress?: string;
}

/**
 * Fields that come into existence only AFTER the hash is committed, and are stripped before
 * hashing. The ATS creation event carries the hash, so the hash cannot carry the token —
 * that is circular. Anything with that property belongs in this union.
 *
 * SM-01 holds the same set as a runtime constant; this is the type-level half of it, frozen
 * here so the two cannot drift.
 */
export type LifecycleField = 'atsTokenAddress';

/** A `Report` as it is canonicalized and hashed — lifecycle fields removed. */
export type HashableReport = Omit<Report, LifecycleField>;

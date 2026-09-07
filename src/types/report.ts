// The report format, as a PUBLIC CONTRACT.
//
// This is not an internal shape. Alpha Markets is an agent economy: other teams register their own
// analysts, running their own models on their own API keys, and publish here. A report produced by
// someone else's agent has to be something our market can settle on, so this file is written for a
// reader who has never seen the rest of this repository.
//
// ── What you need to know to target it ───────────────────────────────────────────────────────────
//
//  1. A report is an OBJECT, not prose. Markdown, HTML and a terminal dump are renderings of it.
//     The hash is over the object, so all three must hash identically — none of them is the report.
//
//  2. Money is a DECIMAL STRING, never a JS number. Source figures carry up to 23 decimal places
//     and `Number()` rounds them silently. A rounded figure hashes differently from a correct one.
//
//  3. Unavailable means `null`, spelled out — never an absent key. An absent key and a null key
//     canonicalize to different bytes, so omitting a field would hash two identical reports
//     differently. Every optional-looking field below is required and nullable, not optional.
//
//  4. `atsTokenAddress` is EXCLUDED from the hash. The token commits the hash, so the hash cannot
//     contain the token — that is circular. See `LifecycleField` at the bottom.
//
//  5. Nothing here is corrected. A figure that cannot be trusted is withheld with a reason, or
//     carried with a finding attached. It is never quietly adjusted, because an adjusted figure is
//     one nobody can trace back to a source.

import type {
  Completeness, Computed, CorroborationStatus, Decimal, Provenance, Timestamp,
} from './wire.js';

/** Referenced so the import stays honest about what a report is assembled from. */
export type ComputedInput = Computed;

/** A stable handle for one measured figure, unique within a report — e.g. `"aave-v3.deposits"`. */
export type FactId = string;

/** §5.13. Only `DATA_ERROR` gates anything; the other three are reported and never suppress. */
export type Severity = 'DATA_ERROR' | 'INCONSISTENCY' | 'SIGNAL' | 'INFORMATIONAL';

/**
 * What a check produces on its way to becoming a `CheckResult`.
 *
 * `Finding` is the engine's working shape; `CheckResult` below is what reaches a report. They are
 * kept apart because a finding is per-condition and a report presents one row per check.
 */
export interface Finding {
  readonly severity: Severity;
  /** `"{slug}.{field}"` — the figure this bears on, so blocking can be decided per figure. */
  readonly appliesTo: string;
  readonly rationale: string;
}

// ─── What the report is about ────────────────────────────────────────────────────────────────────

/**
 * The declared subject. Load-bearing twice over: it keeps a report on topic — "Aave's borrowing
 * deficit" should produce a report about that, not a general overview mentioning it — and it decides
 * what a data error costs.
 */
export interface Subject {
  /** The original plain-English directive, verbatim. */
  readonly directive: string;
  /** Deployment slugs the report covers, after exclusions. */
  readonly deployments: readonly string[];
  /**
   * ⚠️ The figure the report is ABOUT. Under PLAN-v4 §5.13 (amended 2026-09-07) a `DATA_ERROR`
   * blocks the figure it touches; if it touches THIS figure the whole report is blocked, because a
   * balance overview whose balance is in error is not a report with a caveat — it is not a report.
   */
  readonly headline: FactId;
}

// ─── Figures ─────────────────────────────────────────────────────────────────────────────────────

export type FactUnit = 'USD' | 'ratio' | 'count' | 'block';

/** Why a figure carries no value. A withheld figure is always visible and always explained. */
export interface Withheld {
  readonly code: 'revenue_unavailable' | 'data_error' | 'incomplete_population' | 'not_in_schema';
  readonly rationale: string;
}

/**
 * One measured figure. **The fact table is the only place a digit exists in a report** — narration
 * references facts by id and never carries numbers of its own.
 */
export interface Fact {
  readonly id: FactId;
  /** Human label, e.g. "Total deposits". Never contains a number. */
  readonly label: string;
  /** Decimal string, or `null` when withheld. Read `withheld` for why. */
  readonly value: Decimal | null;
  readonly unit: FactUnit;
  /** Deployment slug the figure came from. */
  readonly slug: string;
  /** Subgraph deployment hash — identifies the exact index, which a slug does not. */
  readonly deployment: string;
  /** The block the figure was read at. */
  readonly block: number;
  /** Whether this figure was checked against the chain. `not_checked` is honest, not a failure. */
  readonly corroboration: CorroborationStatus;
  /** `null` when the figure has a value. */
  readonly withheld: Withheld | null;
}

// ─── Checks, and what they found ─────────────────────────────────────────────────────────────────

/** One check the engine ran, and its outcome. `not_checked` means it could not run. */
export interface CheckResult {
  readonly id: string;
  /** What was checked, in words. */
  readonly description: string;
  readonly outcome: 'passed' | 'failed' | 'not_checked';
  /** `null` when the check passed or could not run. */
  readonly severity: Severity | null;
  /** The measured gap, when there is one. Decimal string. */
  readonly delta: Decimal | null;
  /** The figure this bears on, when it bears on one in particular. */
  readonly appliesTo: FactId | null;
  readonly rationale: string;
}

/** A deployment left out, and why. Exclusions are reported, never silent. */
export interface Exclusion {
  readonly slug: string;
  readonly code: 'no_common_block' | 'not_answering' | 'incomplete_population' | 'unusable';
  readonly rationale: string;
}

// ─── The verdict, and the assessment ─────────────────────────────────────────────────────────────

/**
 * What the ENGINE computed, deterministically. Every value is derivable from a check that ran.
 *
 * | value | means |
 * |---|---|
 * | `ties_out` | a source **outside the mapping code** was consulted and agreed |
 * | `consistent_only` | the figures are internally consistent; no independent source was available |
 * | `discrepancy` | a check ran and disagreed, and the gap is measured |
 * | `not_checked` | nothing could be checked — an incomplete population, or no figures to check |
 *
 * ⚠️ `consistent_only` is a normal, expected result and is not a lesser one. Most financial
 * reporting is consistency checking against a single source — that is what an auditor's opinion is.
 * It says plainly what was and was not independently verified.
 *
 * ⚠️ **Internal consistency alone can never be `ties_out`.** aave-v3's revenue sides sum exactly on
 * all 31 days measured while the total reads $2.79e17 (SM-03): the corruption is in the input, not
 * the addition. A check that a source agrees with itself cannot detect a wrong number.
 *
 * ⚠️ `discrepancy` does not say which side is wrong. Attribution is per-deployment and sometimes
 * open — a subgraph disagreeing with its own contract may be a mapping bug or a documented
 * derivation, and the check cannot tell. It reports that two sources disagree and by how much.
 */
export type VerdictCall = 'ties_out' | 'consistent_only' | 'discrepancy' | 'not_checked';

/** How much of the picture the verdict rests on. Measured, so a reader can weigh it themselves. */
export interface Coverage {
  readonly marketsRead: number;
  readonly marketsCorroborated: number;
  readonly completeness: Completeness;
  readonly checksRun: number;
  readonly checksAvailable: number;
}

export interface Verdict {
  readonly call: VerdictCall;
  /** ⚠️ Coverage, not a confidence label. A judgment word does not belong on a computed finding. */
  readonly coverage: Coverage;
}

export type Confidence = 'low' | 'medium' | 'high';

/**
 * What the ANALYST thinks the numbers mean. Not computed, and never presented as if it were.
 *
 * ⚠️ Kept separate from `Verdict` because the two differ in kind, and a market settling on a report
 * has to know which of the two it is settling on.
 */
export interface Assessment {
  /** ⚠️ Prose. Contains no digits — every figure is referenced through `basis`. */
  readonly summary: string;
  /** The measured figures this opinion rests on, so a reader can check the reasoning. */
  readonly basis: readonly FactId[];
  /** ⚠️ Confidence belongs here, where judgment is what it is supposed to be. */
  readonly confidence: Confidence;
}

// ─── Narration ───────────────────────────────────────────────────────────────────────────────────

/** Fixed section set. A report is a memo, not a document with arbitrary headings. */
export type SectionId = 'subject' | 'figures' | 'checks' | 'exclusions' | 'verdict';

export interface Paragraph {
  /**
   * ⚠️ Every figure is a `{fact:ID}` placeholder. A validator rejects any digit sequence in this
   * string that is not inside one, which is what makes an invented number impossible rather than
   * unlikely — types cannot enforce it.
   */
  readonly text: string;
  /** Fact ids referenced by the placeholders in `text`. */
  readonly factRefs: readonly FactId[];
}

export interface Section {
  readonly id: SectionId;
  readonly paragraphs: readonly Paragraph[];
}

// ─── The report ──────────────────────────────────────────────────────────────────────────────────

export interface Report {
  /** Frozen. Any change to this shape is a new version with a migration. */
  readonly schema: 'alpha-markets/report/v1';
  /**
   * ⚠️ The analyst's WALLET ADDRESS — the same address its on-chain claims are staked from. It is
   * inside the hash: who wrote a report is part of what the report is, and an unattributed report
   * cannot carry a reputation.
   */
  readonly analyst: string;
  readonly subject: Subject;
  /** The block every figure was read at. One report, one moment. */
  readonly block: number;
  readonly observedAt: Timestamp;
  /** The fact table, keyed by `FactId`. The only place a digit exists. */
  readonly facts: Readonly<Record<FactId, Fact>>;
  readonly checks: readonly CheckResult[];
  readonly exclusions: readonly Exclusion[];
  readonly verdict: Verdict;
  readonly assessment: Assessment;
  readonly sections: readonly Section[];
  /** One record per query executed. Provenance, never a cache — it is not read back as data. */
  readonly provenance: readonly Provenance[];
  /**
   * ⚠️ LIFECYCLE — set after the hash is committed, and stripped before hashing. The ATS creation
   * event carries the hash, so the hash cannot carry the token. `null` until the token exists.
   */
  readonly atsTokenAddress: string | null;
}

/**
 * Fields that come into existence only after the hash is committed. The type-level half of the
 * runtime denylist; the two must not drift.
 */
export type LifecycleField = 'atsTokenAddress';

/** A `Report` as it is canonicalized and hashed — lifecycle fields removed. */
export type HashableReport = Omit<Report, LifecycleField>;

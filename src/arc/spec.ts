// What a market asks, and its hash.
//
// A market is one question: **will a named deployment's named metric be above or below a threshold
// on a named day.** Five machine values. No free text anywhere, ever.
//
// ⚠️ **That constraint is not a simplification, it is what lets this project skip an oracle and a
// dispute system honestly.** Augur and Polymarket both accept prose questions and both pay for it —
// Augur with reporters who can vote a market Invalid, Polymarket with UMA bonds, a two-hour
// challenge window and escalation to a token-holder vote. Augur's own rule is that *"only events
// that have objectively knowable outcomes are suitable"* and that the answer must be *"readily
// apparent on the resolution source"*. We enforce that at the type level instead: **a question that
// cannot be settled cannot be typed.** See `docs/research/prediction-markets.md` §4.
//
// ⚠️ **Pure. No network, no database, no chain, no clock.** Every export here is a function of its
// arguments and `config/protocols.ts`. If this file ever needs to fetch something, the design is
// wrong.
//
// ⚠️ **It owns the `FactId` → subject mapping and nothing else may.** `Fact` carries `slug`,
// `deployment` and `unit` but not the snapshot field name, and adding one would change `Report`,
// which would change every stored report hash — including four already committed in ATS creation
// events on Hedera. The mapping lives here because here is the only place it can live.

import { PROTOCOLS } from '../config/protocols.js';
import { hashCanonical } from '../domain/canonical.js';
// ⚠️ The MINTING convention, imported rather than restated. `metricFromFactId` parses and then
// rebuilds with this and compares — so the parser cannot drift from the thing that writes the ids.
import { figureRef } from '../engine/invariants.js';
// ⚠️ Exact decimal comparison. A threshold and a snapshot figure are 20-plus-digit decimal strings;
// `Number()` ties values that differ and this is a market settling money on the difference.
import { compare } from '../engine/ops.js';
import type { Decimal } from '../types/wire.js';
import type { FinancialSnapshot } from '../graph/queries/snapshots.js';

// ─── The legal metric set ────────────────────────────────────────────────────────────────────────

/**
 * ⚠️ **The four figures measured clean, and only those.** SM-03's sweep found **0 bad days** for
 * these across 1,300+ days on aave-v3, against 38 bad days for `dailyTotalRevenueUSD` on the same
 * rows. Everything else in `FinancialSnapshot` is refused **by name, with a reason** — see `REFUSED`.
 *
 * ⚠️ **Widening this list is one line and must follow a sweep, never a hunch.** A metric here backs
 * money on a public chain; "probably fine" is how a settlement dispute starts.
 */
export const LEGAL_METRICS = [
  'totalDepositBalanceUSD',
  'totalBorrowBalanceUSD',
  'dailyDepositUSD',
  'dailyBorrowUSD',
] as const;

export type LegalMetric = (typeof LEGAL_METRICS)[number];

// ⚠️ Compile-time only: every legal metric must be a field the settlement document actually returns.
// If `FINANCIAL_SNAPSHOTS` ever drops one, this fails `tsc` rather than failing at settlement.
const _legalAreSnapshotFields: readonly (keyof FinancialSnapshot)[] = LEGAL_METRICS;
void _legalAreSnapshotFields;

/**
 * Why each refused metric is refused. ⚠️ **Three different reasons, and conflating them would be
 * dishonest** — one class is measured broken, one is measured absurd on a deployment we ship, and
 * one simply has no evidence either way.
 */
const REFUSED: Readonly<Record<string, string>> = {
  // ── measured broken ──
  dailyTotalRevenueUSD: 'revenue is poisoned: aave-v3 cumulative reads $2.79e17 after a mapping fault booked $1.63e15 on one day in July 2024 and recurred 38 times since, and spark-lend carries the identical fault',
  dailySupplySideRevenueUSD: 'revenue is poisoned on aave-v3 and spark-lend, and unswept on 19 of 25 live deployments',
  dailyProtocolSideRevenueUSD: 'revenue is poisoned on aave-v3 and spark-lend, and unswept on 19 of 25 live deployments',
  cumulativeTotalRevenueUSD: 'revenue is poisoned: aave-v3 cumulative reads $2.79e17, which is a broken number rather than a large one',
  cumulativeSupplySideRevenueUSD: 'revenue is poisoned on aave-v3 and spark-lend, and unswept on 19 of 25 live deployments',
  cumulativeProtocolSideRevenueUSD: 'revenue is poisoned on aave-v3 and spark-lend, and unswept on 19 of 25 live deployments',
  // ── measured absurd, same class as revenue ──
  cumulativeDepositUSD: 'lifetime accumulators are unswept and at least one is absurd: morpho-blue reads $3.78e23 for this field, roughly $378 sextillion. It is the same class of fault as revenue and nobody has swept the other 24 deployments',
  cumulativeBorrowUSD: 'lifetime accumulators are unswept, and morpho-blue\'s cumulativeDepositUSD reads $3.78e23 — the class is not trusted until someone sweeps it',
  cumulativeLiquidateUSD: 'lifetime accumulators are unswept, and morpho-blue\'s cumulativeDepositUSD reads $3.78e23 — the class is not trusted until someone sweeps it',
  // ── no evidence either way ──
  totalValueLockedUSD: 'not individually swept, and morpho-blue inverts TVL semantics. It is a balance and it is plausibly fine; nobody has measured it across 1,300 days the way the four legal metrics were',
  dailyWithdrawUSD: 'not individually swept. It is a daily flow of the same shape as dailyDepositUSD and plausibly fine; only deposits and borrows were measured',
  dailyRepayUSD: 'not individually swept. It is a daily flow of the same shape as dailyBorrowUSD and plausibly fine; only deposits and borrows were measured',
  dailyLiquidateUSD: 'not individually swept, and liquidation days are sparse — a threshold on one could settle on a day with no activity at all',
};

// ─── Time ────────────────────────────────────────────────────────────────────────────────────────

export const DAY_SECONDS = 86_400;

/**
 * ⚠️ **How far past the day's end the subgraph must have indexed before a read counts.**
 * §5.16's rule is `_meta.block.timestamp >= dayEnd + margin`, **a timestamp and never a block
 * number** — the day-end block cannot be requested by number once the retained window has passed.
 * One hour is comfortably past ordinary indexing lag and costs nothing but patience on a daily cron.
 */
export const FRESHNESS_MARGIN_SECONDS = 3_600;

/**
 * ⚠️ **Two days, because Vercel Hobby cron fires once daily and Vercel does not retry a failed
 * invocation.** One transient miss — a delivery that silently did not happen, or a snapshot not yet
 * indexed — would otherwise void a market for a reason that has nothing to do with its question.
 */
export const MIN_RESOLVE_LEAD_SECONDS = 2 * DAY_SECONDS;

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Midnight UTC that begins `observedDay`, in unix seconds. Throws on a date that is not real. */
export function dayStart(observedDay: string): number {
  const m = ISO_DAY.exec(observedDay);
  if (!m) throw new Error(`observedDay ${JSON.stringify(observedDay)} is not a YYYY-MM-DD calendar date.`);
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const ms = Date.UTC(y, mo - 1, d);
  // ⚠️ Round-trips rather than range-checks, so 2026-02-30 and 2026-13-01 are both refused. A
  // JS Date rolls those forward silently, which would settle a market on a day nobody named.
  if (new Date(ms).toISOString().slice(0, 10) !== observedDay) {
    throw new Error(`observedDay ${observedDay} is not a real calendar date — it rolls to ${new Date(ms).toISOString().slice(0, 10)}.`);
  }
  return ms / 1000;
}

/**
 * The `[startTimestamp, endTimestamp]` a settlement read passes to `FINANCIAL_SNAPSHOTS`.
 *
 * ⚠️ **`[D, D + 86399]`, not `[D, D + 86400]`, and the off-by-one is deliberate.** §5.16's rule is
 * the half-open `[D, D+86400)`, but the document filters `timestamp_gte`/`timestamp_lte` — **`lte`,
 * closed.** A snapshot written at exactly `D + 86400` would satisfy both this day's window and the
 * next one's, so one row would belong to two days and two markets could settle on it.
 */
export function observationWindow(observedDay: string): { readonly start: number; readonly end: number } {
  const start = dayStart(observedDay);
  return { start, end: start + DAY_SECONDS - 1 };
}

/** The instant the observed day ends. What `QuestionCore.observationEnd` carries. */
export function observationEnd(observedDay: string): number {
  return dayStart(observedDay) + DAY_SECONDS;
}

/**
 * Whether a read taken at `metaBlockTimestamp` is late enough to settle `observedDay`.
 *
 * ⚠️ **A lower bound, not a window.** A daily snapshot is written once and never superseded, so a
 * read taken forty minutes late returns the same number as one taken on the hour. Being late costs
 * nothing; being early reads a day that is not finished.
 */
export function isFresh(metaBlockTimestamp: number, observedDay: string): boolean {
  return metaBlockTimestamp >= observationEnd(observedDay) + FRESHNESS_MARGIN_SECONDS;
}

// ─── The spec ────────────────────────────────────────────────────────────────────────────────────

export type Comparison = 'above' | 'below';

/** The whole question. ⚠️ Five values and a schema tag — there is nowhere to put prose. */
export interface MarketSpec {
  readonly schema: 'alpha-markets/market-spec/v1';
  readonly slug: string;
  readonly metric: LegalMetric;
  readonly comparison: Comparison;
  /** ⚠️ A decimal STRING, never a number. See `validateSpec`. */
  readonly threshold: Decimal;
  /** `YYYY-MM-DD`, UTC. */
  readonly observedDay: string;
}

/** ⚠️ `%` and `e` excluded on purpose: `1e21` and `1_000` are how a threshold silently changes scale. */
const DECIMAL = /^\d+(\.\d+)?$/;

/**
 * Validate a spec, or throw a sentence saying why not.
 *
 * ⚠️ **Throws rather than returning a result**, matching `analyst()` and `isinFor()`: every caller
 * is on a path that ends in money on a public chain, and there is no sensible way to continue
 * without a settleable question.
 */
/**
 * The deployment-and-metric half of a subject, checked once for both callers.
 *
 * ⚠️ **Shared so `validateSpec` and `metricFromFactId` cannot disagree about what is settleable.**
 * Two copies of this would be two answers to "can this back a market", and the one that said yes
 * would be the one that ran.
 */
function assertSubject(slug: string, metric: string): void {
  const config = PROTOCOLS.find((p) => p.slug === slug);
  if (!config) {
    throw new Error(
      `no deployment "${slug}" in config/protocols.ts. A market can only name a deployment ` +
      'this project actually queries, because settlement re-reads that deployment and nothing else.',
    );
  }
  // ⚠️ `status` asks whether it ANSWERS. A market on a deployment that does not answer is a market
  // that voids on its resolve deadline, which is a worse outcome than refusing to create it.
  if (config.status !== 'live') {
    throw new Error(
      `deployment "${slug}" has status "${config.status}", not "live". Settlement re-reads it ` +
      'on the observation day; a deployment that does not answer today will void the market rather ' +
      'than settle it.',
    );
  }

  if (!(LEGAL_METRICS as readonly string[]).includes(metric)) {
    const why = REFUSED[metric];
    throw new Error(
      why
        // ⚠️ Named refusal with a reason, never a silent omission from a list. Someone reading
        // "not a legal metric" learns nothing; someone reading this knows what to sweep.
        ? `metric "${metric}" cannot be a market subject: ${why}. Legal metrics are ${LEGAL_METRICS.join(', ')}.`
        : `metric "${metric}" is not a field of the settlement document. Legal metrics are ${LEGAL_METRICS.join(', ')}.`,
    );
  }
}

export function validateSpec(input: Omit<MarketSpec, 'schema'>): MarketSpec {
  assertSubject(input.slug, input.metric);

  if (typeof input.threshold !== 'string' || !DECIMAL.test(input.threshold)) {
    throw new Error(
      `threshold ${JSON.stringify(input.threshold)} is not a non-negative decimal string. Money and ` +
      'thresholds are never a JS number in this project: a float ties figures that differ in their ' +
      '20th digit, and this is a market settling on that difference.',
    );
  }

  if (input.comparison !== 'above' && input.comparison !== 'below') {
    throw new Error(`comparison must be "above" or "below", not ${JSON.stringify(input.comparison)}.`);
  }

  dayStart(input.observedDay);   // throws on a date that is not real

  return {
    schema: 'alpha-markets/market-spec/v1',
    slug: input.slug,
    metric: input.metric,
    comparison: input.comparison,
    threshold: input.threshold,
    observedDay: input.observedDay,
  };
}

/**
 * The spec's 32 bytes, as 64 hex characters.
 *
 * ⚠️ **`hashCanonical` from `domain/canonical.ts`, and there is no second canonicalizer.** That file
 * takes `unknown` deliberately so a spec needs no hashing code of its own, and it says why: *"Two
 * canonicalizers that disagree is exactly the dispute nobody can resolve."* SM-01 proved that path
 * against RFC 8785's own reference vectors.
 */
export function specHash(spec: MarketSpec): string {
  return hashCanonical(spec);
}

/**
 * Does the question hold, given the figure the settlement read returned?
 *
 * ⚠️ **Strict comparison, and equality means the proposition did NOT hold.** A market asking "above
 * $X" that lands exactly on $X resolves false. That is a real outcome rather than an edge case, and
 * defining it here stops the resolver inventing its own answer.
 */
export function holds(spec: MarketSpec, observed: Decimal): boolean {
  const c = compare(observed, spec.threshold);
  return spec.comparison === 'above' ? c === 1 : c === -1;
}

// ─── The FactId mapping — attachment seam 4 ──────────────────────────────────────────────────────

/**
 * Turn a report's `subject.headline` into the deployment and metric a market would settle on.
 *
 * ⚠️ **This is the only place a `FactId` is taken apart.** `Fact` has no field-name column and
 * cannot get one — `Report` is hashed and four of those hashes are already in ATS creation events
 * on Hedera.
 *
 * The two shapes `execute.ts` mints:
 *
 *   `{slug}.{field}`             a protocol figure — settleable
 *   `{slug}.{marketId}.{field}`  a per-market figure — ⚠️ NOT settleable, see below
 */
export function metricFromFactId(factId: string): { readonly slug: string; readonly metric: LegalMetric } {
  const parts = factId.split('.');

  if (parts.length === 3) {
    throw new Error(
      `fact ${factId} is a per-market figure and cannot be a market subject. Settlement reads ` +
      '`financialsDailySnapshots`, which is one row per DEPLOYMENT per day — there is no daily ' +
      'snapshot per market, so nothing could settle it.',
    );
  }
  if (parts.length !== 2) {
    throw new Error(`fact ${JSON.stringify(factId)} is not a fact id — expected "{slug}.{field}".`);
  }

  const [slug, metric] = parts as [string, string];

  // ⚠️ A load-bearing sentinel, not a deployment. `compose.ts:224` mints `metric.{field}` when a
  // report's headline is about a metric ACROSS deployments and no single one leads. Such a report
  // names no deployment to settle against, so it cannot back a market.
  if (slug === 'metric') {
    throw new Error(
      `fact ${factId} names no deployment — "metric" is the sentinel compose.ts uses for a report ` +
      'about a metric across the set. A market settles by re-reading one deployment, so a report ' +
      'whose headline names none cannot be its subject.',
    );
  }

  // ⚠️ Rebuilt with the minter and compared, so this parser cannot drift from `figureRef`. If a
  // slug ever contained a dot, the round trip fails here instead of silently mis-splitting.
  if (figureRef(slug, metric) !== factId) {
    throw new Error(`fact ${factId} does not round-trip through figureRef() — refusing to guess at its parts.`);
  }

  // ⚠️ The same check `validateSpec` runs, so a fact id and a hand-typed spec cannot disagree about
  // whether a (deployment, metric) pair is settleable. Throws with its own reasons.
  assertSubject(slug, metric);

  return { slug, metric: metric as LegalMetric };
}

// ─── The times, which live in QuestionCore rather than in the spec ───────────────────────────────

/** §5.2's `QuestionCore`, minus the domain separation the contract adds itself. */
export interface QuestionCore {
  readonly specHash: string;
  readonly closeTime: number;
  readonly observationEnd: number;
  readonly resolveDeadline: number;
}

/**
 * Build and check the timing around a spec.
 *
 * ⚠️ **`closeTime <= dayStart`, which is stricter than §5.2.** §5.2 only requires the analyst's
 * commit to precede `closeTime`. This requires the whole betting window to close **before the
 * observed day begins** — the parimutuel rule, because a stake placed during the day being measured
 * is a bet on a partially known outcome. Every totalizator on earth is built to prevent exactly
 * that; the racing term is past-posting. See `docs/research/prediction-markets.md` §6.
 */
export function questionCore(
  spec: MarketSpec,
  times: { readonly closeTime: number; readonly resolveDeadline: number },
): QuestionCore {
  const start = dayStart(spec.observedDay);
  const end = start + DAY_SECONDS;

  if (times.closeTime > start) {
    throw new Error(
      `closeTime ${times.closeTime} is inside or after the observed day, which begins at ${start} ` +
      `(${spec.observedDay}T00:00:00Z). Staking must close before the day being measured starts — a ` +
      'stake placed during it is a bet on an outcome that is already partly known.',
    );
  }

  if (times.resolveDeadline < end + MIN_RESOLVE_LEAD_SECONDS) {
    throw new Error(
      `resolveDeadline ${times.resolveDeadline} is less than two days after observationEnd ${end}. ` +
      'The resolver is a daily cron with no retry, so one missed or too-early run would void this ' +
      `market for a transient reason. The earliest legal value is ${end + MIN_RESOLVE_LEAD_SECONDS}.`,
    );
  }

  return { specHash: specHash(spec), closeTime: times.closeTime, observationEnd: end, resolveDeadline: times.resolveDeadline };
}

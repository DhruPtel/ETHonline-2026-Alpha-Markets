// The tie-out. Does what a protocol claims match what an outside source says?
//
// ── What "ties out" actually means here, and why it is narrow ────────────────────────────────────
//
// Everything a subgraph tells us comes out of the same mapping code, so a check that a source agrees
// with ITSELF cannot detect a wrong number — only a self-contradictory one. That is not a theory.
// SM-03 measured aave-v3's revenue sides summing exactly on all 31 days while the total read
// $2.79e17: **the corruption was in the input, not the addition.** Any tie-out built on internal
// arithmetic would have certified that figure.
//
// So there are three tiers, and only the top two can produce `ties_out`:
//
//   tier 1  chain corroboration      the contract, read at the block the subgraph wrote the value.
//                                    The only source outside the mapping code. Authoritative.
//   tier 2  external reference       an independent methodology landing in the same place.
//                                    Corroborating, not authoritative — it has its own errors.
//   tier 0  internal consistency     necessary, never sufficient. Owned by `invariants.ts`.
//
// ⚠️ **This file judges; it does not re-check.** Tier 0 is read from the findings `invariants.ts`
// already produced. Two files that both check the same fact is how a report ends up saying the same
// thing twice in different words.
//
// ⚠️ **Pure.** Corroboration and the external reference are handed in as observations, never
// fetched here (§5.14).

import type { Finding, VerdictCall, Coverage } from '../types/report.js';
import type { Computed, Decimal } from '../types/wire.js';
import type { ProtocolConfig } from '../config/protocols.js';
import type { Corroboration } from '../graph/corroborate.js';
import { PROTOCOLS } from '../config/protocols.js';
import { figureRef } from './invariants.js';
import { net, ratio } from './ops.js';

/** How far apart two independent figures may sit before it is a finding rather than rounding. */
const REFERENCE_TOLERANCE = 0.05;

/**
 * An outside figure for the same quantity, from a source with its own methodology.
 *
 * ⚠️ Handed in, never fetched. A published report must not fail because a third party is down, and
 * the engine must stay pure. The adapter that produces this is a separate file and does not exist
 * yet; today the caller supplies it or omits it.
 */
export interface ExternalReference {
  readonly source: string;
  /** Net value — deposits minus borrows — in USD, as a decimal string. */
  readonly netUSD: Decimal;
}

export interface ReconcileInput {
  readonly config: ProtocolConfig;
  readonly computed: Computed;
  /** Findings from `invariants.ts`. Referenced, never recomputed. */
  readonly findings: readonly Finding[];
  readonly corroboration?: readonly Corroboration[];
  readonly reference?: ExternalReference;
  /** Size of the market population read, for coverage. `Computed` does not carry it. */
  readonly marketsRead?: number;
}

export interface Claim {
  readonly tier: 0 | 1 | 2;
  readonly description: string;
  readonly outcome: 'agreed' | 'disagreed' | 'not_available';
  readonly delta: Decimal | null;
  readonly appliesTo: string;
  readonly rationale: string;
}

export interface Reconciliation {
  readonly call: VerdictCall;
  readonly claims: readonly Claim[];
  readonly coverage: Coverage;
  /** Named so a report can say plainly what was independently verified, and by what. */
  readonly independentSources: readonly string[];
}

const corroborableCount = () =>
  PROTOCOLS.filter((p) => p.status === 'live' && p.corroborationHint?.method).length;
const liveCount = () => PROTOCOLS.filter((p) => p.status === 'live').length;

export function reconcile(input: ReconcileInput): Reconciliation {
  const { config, computed, findings, corroboration, reference } = input;
  const claims: Claim[] = [];
  const independentSources: string[] = [];
  const deposits = computed.figures.totalDepositBalanceUSD?.value ?? null;
  const borrows = computed.figures.totalBorrowBalanceUSD?.value ?? null;

  // ── Tier 1 · the chain ─────────────────────────────────────────────────────────────────────────
  const checked = (corroboration ?? []).filter((c) => c.status !== 'not_checked');
  const mismatched = checked.filter((c) => c.status === 'mismatch');
  if (!config.corroborationHint?.method) {
    claims.push({
      tier: 1, outcome: 'not_available', delta: null, appliesTo: figureRef(config.slug, 'markets'),
      description: 'Subgraph balances against the contract, at the block the value was written',
      rationale: `no contract accessor is recorded for this deployment; chain corroboration is available on ${corroborableCount()} of ${liveCount()} live deployments`,
    });
  } else if (!checked.length) {
    claims.push({
      tier: 1, outcome: 'not_available', delta: null, appliesTo: figureRef(config.slug, 'markets'),
      description: 'Subgraph balances against the contract, at the block the value was written',
      rationale: 'the deployment supports the check but no market was sampled for it',
    });
  } else if (mismatched.length) {
    // ⚠️ Largest by MAGNITUDE. Comparing signed deltas picks the least-negative one, which on
    // morpho-blue reported -10,000,000 as worse than -17,698,383,936.
    const mag = (c: Corroboration) => { const d = c.delta ?? 0n; return d < 0n ? -d : d; };
    const worst = mismatched.reduce((a, b) => (mag(b) > mag(a) ? b : a));
    claims.push({
      tier: 1, outcome: 'disagreed', delta: String(worst.delta ?? 0n), appliesTo: figureRef(config.slug, 'markets'),
      description: 'Subgraph balances against the contract, at the block the value was written',
      rationale: `${mismatched.length} of ${checked.length} sampled market(s) disagree with the contract; largest gap ${worst.delta} on ${worst.marketName ?? worst.marketId}. Which side is wrong is not established here`,
    });
  } else {
    independentSources.push('the contract');
    claims.push({
      tier: 1, outcome: 'agreed', delta: '0', appliesTo: figureRef(config.slug, 'markets'),
      description: 'Subgraph balances against the contract, at the block the value was written',
      rationale: `${checked.length} of ${checked.length} sampled market(s) match the contract exactly`,
    });
  }

  // ── Tier 2 · an independent methodology ────────────────────────────────────────────────────────
  const ourNet = deposits !== null && borrows !== null ? net(deposits, borrows) : null;
  if (!reference || ourNet === null) {
    claims.push({
      tier: 2, outcome: 'not_available', delta: null, appliesTo: figureRef(config.slug, 'totalDepositBalanceUSD'),
      description: 'Net value against an independent external reference',
      rationale: reference ? 'no net figure to compare' : 'no external reference was supplied for this report',
    });
  } else {
    const gap = ratio(net(ourNet, reference.netUSD), reference.netUSD);
    const off = gap === null ? null : Math.abs(Number(gap));
    const agreed = off !== null && off <= REFERENCE_TOLERANCE;
    if (agreed) independentSources.push(reference.source);
    claims.push({
      tier: 2, outcome: agreed ? 'agreed' : 'disagreed',
      delta: net(ourNet, reference.netUSD), appliesTo: figureRef(config.slug, 'totalDepositBalanceUSD'),
      description: 'Net value against an independent external reference',
      rationale: `ours ${ourNet} against ${reference.source} ${reference.netUSD}` +
        (off === null ? '' : ` — ${(off * 100).toFixed(1)}% apart`) +
        (agreed ? '' : `, past the ${REFERENCE_TOLERANCE * 100}% threshold. Neither source is authoritative over the other`),
    });
  }

  // ── Tier 0 · internal consistency, read from invariants rather than re-run ─────────────────────
  const inconsistencies = findings.filter((f) => f.severity === 'INCONSISTENCY');
  const populationComplete = computed.completeness === 'complete';
  claims.push({
    tier: 0, appliesTo: figureRef(config.slug, 'totalDepositBalanceUSD'), delta: null,
    description: 'Internal consistency — the figures agree with each other',
    outcome: !populationComplete ? 'not_available' : inconsistencies.length ? 'disagreed' : 'agreed',
    rationale: !populationComplete
      ? 'the market population was not read to exhaustion, so its parts cannot be compared to the whole'
      : inconsistencies.length
        ? inconsistencies.map((f) => f.rationale).join('; ')
        : 'no internal inconsistency was found. This is necessary but not sufficient — a source agreeing with itself cannot detect a wrong number',
  });

  const disagreed = claims.some((c) => c.outcome === 'disagreed');
  const independentAgreed = claims.some((c) => c.tier > 0 && c.outcome === 'agreed');
  const internalAgreed = claims.some((c) => c.tier === 0 && c.outcome === 'agreed');
  const call: VerdictCall = disagreed ? 'discrepancy'
    : independentAgreed ? 'ties_out'
      : internalAgreed ? 'consistent_only'
        : 'not_checked';

  return {
    call, claims, independentSources,
    coverage: {
      marketsRead: input.marketsRead ?? 0,
      marketsCorroborated: checked.filter((c) => c.status === 'match').length,
      completeness: computed.completeness,
      checksRun: claims.filter((c) => c.outcome !== 'not_available').length,
      checksAvailable: claims.length,
    },
  };
}

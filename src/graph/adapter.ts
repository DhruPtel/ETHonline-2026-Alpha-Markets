// The plausibility layer. It annotates; it never adjusts.
//
// ⚠️ This was going to be a renaming layer. Morpho uses Messari's exact field names and means
// different things by them — if it had lied less cleanly we would have renamed fields and
// shipped $13.09B as fact. Nothing here corrects a figure: Morpho's $13.09B stays $13.09B with
// a finding attached, because the moment we adjust it we have invented a number nobody can trace.
//
// ⚠️ **No rule keys off a slug.** Every branch below reads a measured fact from
// `config/protocols.ts`. `if (slug === 'morpho-blue')` would mean a 26th protocol requires
// editing this file, and the one-config-row claim would stop being true.

import type { Completeness, Computed, ComputedFigure, CorroborationStatus, Provenance } from '../types/wire.js';
import { PROTOCOLS } from '../config/protocols.js';
import type { BalanceSheetProtocol, MarketRow } from './queries/index.js';
import type { QueryMeta } from './client.js';

// `Severity` and `Finding` both come from `types/report.ts` now — an outsider targeting the report
// contract can read them without importing a logic module, and there is one of each (2026-09-07).
export type { Finding, Severity } from '../types/report.js';
import type { Finding } from '../types/report.js';

const REVENUE_FIELDS = [
  'cumulativeTotalRevenueUSD', 'cumulativeSupplySideRevenueUSD', 'cumulativeProtocolSideRevenueUSD',
] as const;
const BALANCE_FIELDS = [
  'totalValueLockedUSD', 'totalDepositBalanceUSD', 'totalBorrowBalanceUSD',
  'cumulativeDepositUSD', 'cumulativeBorrowUSD', 'cumulativeLiquidateUSD',
] as const;

export interface AdaptInput {
  readonly slug: string;
  readonly protocol: BalanceSheetProtocol;
  readonly meta: QueryMeta;
  readonly provenance: Provenance;
  readonly markets?: readonly MarketRow[];
  readonly completeness?: Completeness;
}

// ⚠️ **Corroboration findings do NOT come from here** *(the path was removed 2026-09-07)*. This
// file used to accept a corroboration map and turn a mismatch into a `DATA_ERROR`, and no caller
// ever passed it — verified across all nine `adapt()` call sites. `engine/crosscheck.ts` does the
// job instead, and the two disagreed on the thing that matters: crosscheck emits a mismatch as a
// `SIGNAL` and says "which side is wrong is not established", while a `DATA_ERROR` would null the
// figure and thereby assert the contract is the correct side. That is a claim corroboration cannot
// support. If you are here to re-add it, add it to crosscheck instead.

export interface Adapted { readonly computed: Computed; readonly findings: Finding[] }

const num = (v: string | null | undefined) => (v == null ? null : Number(v));

export function adapt(input: AdaptInput): Adapted {
  const cfg = PROTOCOLS.find((p) => p.slug === input.slug);
  if (!cfg) throw new Error(`${input.slug} is not in config/protocols.ts`);
  const { protocol, markets } = input;
  const findings: Finding[] = [];
  const figures: Record<string, ComputedFigure> = {};

  // ── 1 · Revenue availability. Three of four states never render as a number, not even zero.
  const revenue = cfg.revenueAvailability;
  for (const f of BALANCE_FIELDS) figures[f] = { value: protocol[f] ?? null, corroboration: 'not_checked' };
  for (const f of REVENUE_FIELDS) {
    const usable = revenue === 'usable';
    figures[f] = { value: usable ? (protocol[f] ?? null) : null, corroboration: 'not_checked' };
  }
  if (revenue !== 'usable') findings.push({
    severity: 'INFORMATIONAL', appliesTo: 'revenue',
    rationale: revenue == null
      ? 'revenue availability has not been measured for this deployment; figures withheld'
      : `revenue is ${revenue} on this deployment; figures withheld rather than rendered, including as zero`,
  });

  // ── 2 · Utilization. Borrows above deposits is impossible; borrows EQUAL to deposits, to the
  //        cent, is what no real market does. Both are findings about the protocol, not the data.
  const deposits = num(protocol.totalDepositBalanceUSD), borrows = num(protocol.totalBorrowBalanceUSD);
  if (deposits != null && borrows != null && deposits > 0 && borrows > deposits) findings.push({
    severity: 'SIGNAL', appliesTo: 'totalBorrowBalanceUSD',
    rationale: `borrows exceed deposits — utilization ${((borrows / deposits) * 100).toFixed(0)}%`,
  });
  if (markets) {
    const ceiling = markets.filter((m) => (num(m.totalBorrowBalanceUSD) ?? 0) > 0 && m.totalBorrowBalanceUSD === m.totalDepositBalanceUSD);
    if (ceiling.length) findings.push({
      severity: 'SIGNAL', appliesTo: 'markets',
      rationale: `${ceiling.length} of ${markets.length} markets report deposits exactly equal to borrows`,
    });
  }

  // ── 3 · Does the market population add up to the protocol total? Only answerable on a complete
  //        population — an incomplete one cannot distinguish a real gap from rows we never read.
  //
  // ⚠️ **Float here is a deliberate exception to the no-floating-point rule, and it is bounded.**
  // `ops.ts` exists because a rounded figure is a wrong figure with a plausible face — but nothing
  // computed in this block becomes a figure. It decides whether a finding FIRES at a 1% threshold,
  // and summing sixty-odd values around 1e9 carries relative error near 1e-16, six orders inside
  // the smallest gap that could change the answer. The reason not to use `ops.ts` is positive
  // rather than lazy: it validates its inputs and throws on anything outside a plain decimal
  // string, which would turn one malformed market value into a crash for the whole deployment —
  // and this is the plausibility layer, whose entire job is to survive bad data and annotate it.
  if (markets && deposits != null) {
    if (input.completeness !== 'complete') findings.push({
      severity: 'INFORMATIONAL', appliesTo: 'totalDepositBalanceUSD',
      rationale: 'market population is not complete; protocol total not reconciled against its markets',
    });
    else {
      const summed = markets.reduce((a, m) => a + (num(m.totalDepositBalanceUSD) ?? 0), 0);
      const gap = deposits > 0 ? Math.abs(summed - deposits) / deposits : 0;
      if (gap > 0.01) findings.push({
        severity: 'INCONSISTENCY', appliesTo: 'totalDepositBalanceUSD',
        rationale: `markets sum to $${(summed / 1e6).toFixed(1)}M against a protocol total of $${(deposits / 1e6).toFixed(1)}M (${(gap * 100).toFixed(0)}%)`,
      });
    }
  }

  // ── 4 · The oracle guard, per deployment. THE clearest case for a plausibility layer: the same
  //        condition and the same field names mean opposite things depending on how the deployment
  //        derives deposit USD, so severity comes from a measured fact and never from a slug.
  if (markets) {
    const zeroPrice = markets.filter((m) => num(m.inputTokenPriceUSD) === 0 && (num(m.inputTokenBalance) ?? 0) > 0);
    if (zeroPrice.length) findings.push(
      cfg.depositBasis === 'price_x_balance' ? {
        severity: 'DATA_ERROR', appliesTo: 'inputTokenPriceUSD',
        rationale: `${zeroPrice.length} market(s) price zero with a non-zero balance; this deployment derives deposit USD from price x balance, so real deposits read as empty`,
      } : cfg.depositBasis === 'loan_token' ? {
        severity: 'INFORMATIONAL', appliesTo: 'inputTokenPriceUSD',
        rationale: `${zeroPrice.length} market(s) price zero with a non-zero balance, and it is expected here: the price is the collateral's while deposit USD comes from the loan token`,
      } : {
        severity: 'INFORMATIONAL', appliesTo: 'inputTokenPriceUSD',
        rationale: `${zeroPrice.length} market(s) price zero with a non-zero balance; deposit basis is unmeasured for this deployment, so the condition cannot be judged`,
      });
  }

  // ── 5 · Schema version, from what the deployment reports LIVE, never from config.
  if (protocol.schemaVersion !== cfg.liveSchemaVersion) findings.push({
    severity: 'INFORMATIONAL', appliesTo: 'schemaVersion',
    rationale: `deployment now reports ${protocol.schemaVersion}; config recorded ${cfg.liveSchemaVersion} when last swept`,
  });
  // ⚠️ Nothing dispatches on version yet. Unit 4 found the five live versions share every field
  // these documents use, so there is no branch to write — and building the mechanism for a case we
  // have not hit would be a framework guarding nothing.

  return {
    computed: {
      protocol: input.slug, deployment: input.meta.deployment, block: input.meta.blockNumber,
      figures, revenue: revenue ?? 'not_tracked',
      // ⚠️ Completeness is about the population BEHIND these figures, and a protocol-level read
      // has a population of one row which we have. Defaulting a market-less read to `incomplete`
      // emitted an unexplained flag with no finding beside it — and in Unit 13's proof the model
      // duly invented a reason for it ("3.x-only fields being omitted"), which was false. A flag
      // nobody can account for is worse than no flag.
      completeness: input.markets ? (input.completeness ?? 'incomplete') : 'complete',
      provenance: input.provenance,
    },
    findings,
  };
}

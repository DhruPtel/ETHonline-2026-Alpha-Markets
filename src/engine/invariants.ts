// The checks, each carrying a severity, and what each one blocks.
//
// ⚠️ **Checks are general; applicability comes from config.** Never `if (slug === 'morpho')`. Phase 1
// Unit 10 established the pattern and the oracle guard is the worked example: the same condition —
// a zero token price against a non-zero balance — is a real `DATA_ERROR` on Aave and a false
// positive on Morpho, because Morpho derives deposit USD from the loan token rather than from price
// x balance. `depositBasis` in config is what makes one rule give both answers correctly. A slug
// test would mean adding a 29th protocol requires editing this file.
//
// ⚠️ **Pure. No I/O.** Corroboration is an adapter that hands the engine observations (§5.14).
//
// ── What blocks what (PLAN-v4 §5.13, amended 2026-09-07) ─────────────────────────────────────────
//
// A `DATA_ERROR` blocks the FIGURE named in `appliesTo`. It blocks the REPORT only when that figure
// is the report's declared subject — compound-v3 has one bad market out of ten, and discarding nine
// sound markets and a meaningful protocol total to suppress one figure would make the engine less
// useful than the model already is without it. `publish.ts` owns that comparison; this file names
// the figure so it can be made.
//
// Only `DATA_ERROR` blocks anything. A `SIGNAL` — borrows exceeding deposits — is a finding about
// the protocol and the thing a report exists to surface, not a reason to withhold.

import type { Finding } from '../graph/adapter.js';
import type { Computed, Decimal } from '../types/wire.js';
import type { ProtocolConfig } from '../config/protocols.js';
import type { MarketRow } from '../graph/queries/index.js';
import { compare, ratio, sum } from './ops.js';

/** `"{slug}.{field}"`. ⚠️ `assemble.ts` must mint fact ids the same way or blocking cannot match. */
export const figureRef = (slug: string, field: string): string => `${slug}.${field}`;

export interface InvariantInput {
  readonly config: ProtocolConfig;
  readonly computed: Computed;
  /** Omit when no population was walked; the checks that need one then simply do not run. */
  readonly markets?: readonly MarketRow[];
}

const val = (c: Computed, field: string): Decimal | null => c.figures[field]?.value ?? null;
const positive = (d: Decimal | null): boolean => d !== null && compare(d, '0') > 0;
const isZero = (d: Decimal | null): boolean => d !== null && compare(d, '0') === 0;
const pct = (a: Decimal, b: Decimal): string => {
  const r = ratio(a, b);
  return r === null ? '—' : `${(Number(r) * 100).toFixed(0)}%`;
};

export function check({ config, computed, markets }: InvariantInput): Finding[] {
  const out: Finding[] = [];
  const ref = (field: string) => figureRef(config.slug, field);
  const deposits = val(computed, 'totalDepositBalanceUSD');
  const borrows = val(computed, 'totalBorrowBalanceUSD');

  // ── 1 · Oracle failure ─────────────────────────────────────────────────────────────────────────
  // The severity is a property of the deployment, not of the condition.
  if (markets) {
    const blind = markets.filter((m) => isZero(m.inputTokenPriceUSD) && positive(m.inputTokenBalance));
    if (blind.length) {
      const where = `${blind.length} of ${markets.length} market(s) price zero against a non-zero balance`;
      out.push(
        config.depositBasis === 'price_x_balance'
          ? { severity: 'DATA_ERROR', appliesTo: ref('totalDepositBalanceUSD'),
              rationale: `${where}; this deployment derives deposit USD from price x balance, so markets holding real deposits read as empty` }
          : config.depositBasis === 'loan_token'
            ? { severity: 'INFORMATIONAL', appliesTo: ref('totalDepositBalanceUSD'),
                rationale: `${where}, and it is expected here: the price is the collateral's while deposit USD comes from the loan token` }
            : { severity: 'INFORMATIONAL', appliesTo: ref('totalDepositBalanceUSD'),
                rationale: `${where}; deposit basis is unmeasured for this deployment, so the condition cannot be judged` },
      );
    }

    // ── 2 · Utilization ceiling ──────────────────────────────────────────────────────────────────
    // Every dollar supplied borrowed to the cent. No real market does this.
    const ceiling = markets.filter(
      (m) => positive(m.totalBorrowBalanceUSD) && m.totalBorrowBalanceUSD === m.totalDepositBalanceUSD,
    );
    if (ceiling.length) out.push({
      severity: 'SIGNAL', appliesTo: ref('markets'),
      rationale: `${ceiling.length} of ${markets.length} market(s) report deposits exactly equal to borrows`,
    });

    // ── 4 · Do the markets add up to the protocol total? ─────────────────────────────────────────
    // ⚠️ Only answerable on a complete population — an incomplete one cannot tell a real gap from
    // rows never read. Phase 1 noted this has never fired, including on Morpho, whose markets do sum.
    if (computed.completeness === 'complete' && positive(deposits)) {
      const summed = sum(markets.map((m) => m.totalDepositBalanceUSD ?? '0'));
      const gap = ratio(summed, deposits!);
      if (gap !== null && Math.abs(Number(gap) - 1) > 0.01) out.push({
        severity: 'INCONSISTENCY', appliesTo: ref('totalDepositBalanceUSD'),
        rationale: `markets sum to ${summed} against a protocol total of ${deposits} (${pct(summed, deposits!)} of it)`,
      });
    }
  }

  // ── 3 · Inverted balances ──────────────────────────────────────────────────────────────────────
  // A finding about the protocol, reported prominently. Never suppressed into an error.
  if (positive(deposits) && positive(borrows) && compare(borrows!, deposits!) > 0) out.push({
    severity: 'SIGNAL', appliesTo: ref('totalBorrowBalanceUSD'),
    rationale: `borrows exceed deposits — utilization ${pct(borrows!, deposits!)}, which should not be reachable`,
  });

  // ── 5 · Undefined utilization ──────────────────────────────────────────────────────────────────
  // ⚠️ Context, not an error. Nothing deposited and nothing borrowed is a real state, and a ratio
  // over it is undefined rather than zero — zero would read as an answer.
  if (isZero(deposits) && isZero(borrows)) out.push({
    severity: 'INFORMATIONAL', appliesTo: ref('totalDepositBalanceUSD'),
    rationale: 'no deposits and no borrows; utilization is undefined here, not zero',
  });

  return out;
}

/** The figures a `DATA_ERROR` makes unreportable. `publish.ts` checks the subject against this. */
export const blockedFigures = (findings: readonly Finding[]): string[] =>
  [...new Set(findings.filter((f) => f.severity === 'DATA_ERROR').map((f) => f.appliesTo))];

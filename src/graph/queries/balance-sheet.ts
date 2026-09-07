// Protocol-level totals. The document everything runs first, and the one the sweep runs
// against all 27.
//
// Every field below is in the measured intersection of all five live schema versions —
// 3.1.0, 3.0.1, 3.0.0, 2.0.1 and 1.3.0 — by schema introspection on 2026-09-07, and the
// balance figures were served by 25 of 28 deployments with zero nulls. No dispatch.

export const BALANCE_SHEET = `query BalanceSheet($block: Block_height) {
  _meta(block: $block) { deployment hasIndexingErrors block { number timestamp } }
  lendingProtocols(first: 1, block: $block) {
    id name slug network type
    schemaVersion subgraphVersion methodologyVersion
    lendingType riskType
    totalValueLockedUSD
    totalDepositBalanceUSD
    totalBorrowBalanceUSD
    cumulativeDepositUSD
    cumulativeBorrowUSD
    cumulativeLiquidateUSD
    cumulativeTotalRevenueUSD
    cumulativeSupplySideRevenueUSD
    cumulativeProtocolSideRevenueUSD
    cumulativeUniqueUsers
    totalPoolCount
  }
}`;

/** ⚠️ Every USD figure is a BigDecimal string. Never `Number()` one before it is checked. */
export interface BalanceSheetProtocol {
  id: string; name: string; slug: string; network: string; type: string;
  schemaVersion: string; subgraphVersion: string; methodologyVersion: string;
  /** `POOLED` or `CDP`. In the intersection, so the sweep can finally fill config's null column. */
  lendingType: string | null;
  riskType: string | null;
  totalValueLockedUSD: string | null;
  totalDepositBalanceUSD: string | null;
  totalBorrowBalanceUSD: string | null;
  cumulativeDepositUSD: string | null;
  cumulativeBorrowUSD: string | null;
  cumulativeLiquidateUSD: string | null;
  /** ⚠️ Present on every version, and trustworthy on almost none. Gate on `RevenueAvailability`. */
  cumulativeTotalRevenueUSD: string | null;
  cumulativeSupplySideRevenueUSD: string | null;
  cumulativeProtocolSideRevenueUSD: string | null;
  cumulativeUniqueUsers: number | null;
  totalPoolCount: number | null;
}

export interface BalanceSheetResult { lendingProtocols: BalanceSheetProtocol[] }

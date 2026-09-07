// Daily history. One document, all five live schema versions.
//
// ⚠️ NOT SPLIT, and the reason is measured. The plan expected revenue to be the
// version-exposed part of this document and called for two variants — one for schemas
// carrying cumulative revenue, one for those without. Introspection on 2026-09-07 says the
// split has nothing to separate: **every revenue field below is in the intersection of all
// five live versions.** `FinancialsDailySnapshot` shares 21 fields across 3.1.0, 3.0.1,
// 3.0.0, 2.0.1 and 1.3.0, and all six revenue fields are among them.
//
// Two documents where one suffices would mean a pairing to get wrong, guarding a case that
// does not exist. If a sixth schema version appears without these fields, split then — the
// failure will be loud, because a missing field fails the whole query.
//
// ⚠️ Revenue being PRESENT on every version says nothing about it being TRUE on any of them.
// aave-v3's accumulator is poisoned and morpho-blue never wrote one. Gate every figure below
// on the deployment's `RevenueAvailability` before it reaches a report.

export const FINANCIAL_SNAPSHOTS = `query FinancialSnapshots(
  $first: Int!, $skip: Int!, $startTimestamp: BigInt!, $endTimestamp: BigInt!, $block: Block_height
) {
  _meta(block: $block) { deployment hasIndexingErrors block { number timestamp } }
  financialsDailySnapshots(
    first: $first, skip: $skip, block: $block
    orderBy: timestamp, orderDirection: desc
    where: { timestamp_gte: $startTimestamp, timestamp_lte: $endTimestamp }
  ) {
    id timestamp blockNumber
    totalValueLockedUSD
    totalDepositBalanceUSD
    totalBorrowBalanceUSD
    dailyDepositUSD
    dailyBorrowUSD
    dailyWithdrawUSD
    dailyRepayUSD
    dailyLiquidateUSD
    cumulativeDepositUSD
    cumulativeBorrowUSD
    cumulativeLiquidateUSD
    dailyTotalRevenueUSD
    dailySupplySideRevenueUSD
    dailyProtocolSideRevenueUSD
    cumulativeTotalRevenueUSD
    cumulativeSupplySideRevenueUSD
    cumulativeProtocolSideRevenueUSD
  }
}`;

export interface FinancialSnapshot {
  id: string; timestamp: string; blockNumber: string;
  totalValueLockedUSD: string | null;
  totalDepositBalanceUSD: string | null;
  totalBorrowBalanceUSD: string | null;
  dailyDepositUSD: string | null;
  dailyBorrowUSD: string | null;
  dailyWithdrawUSD: string | null;
  dailyRepayUSD: string | null;
  dailyLiquidateUSD: string | null;
  cumulativeDepositUSD: string | null;
  cumulativeBorrowUSD: string | null;
  cumulativeLiquidateUSD: string | null;
  /** ⚠️ Present everywhere, trustworthy almost nowhere. See the file header. */
  dailyTotalRevenueUSD: string | null;
  dailySupplySideRevenueUSD: string | null;
  dailyProtocolSideRevenueUSD: string | null;
  cumulativeTotalRevenueUSD: string | null;
  cumulativeSupplySideRevenueUSD: string | null;
  cumulativeProtocolSideRevenueUSD: string | null;
}

export interface FinancialSnapshotsResult { financialsDailySnapshots: FinancialSnapshot[] }

/**
 * ⚠️ BOTH bounds, always. SM-03 found that `timestamp_gte` alone false-passes: rows come back
 * and look right while silently including everything newer than the window. The document
 * above requires `$endTimestamp`, so the mistake is not available.
 */
export const BOTH_BOUNDS_REQUIRED = true;

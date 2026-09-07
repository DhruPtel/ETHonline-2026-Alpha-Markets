// Market-level detail, shaped for one paging strategy and only one.
//
// ⚠️ **Amended for Unit 7 (2026-09-07).** This document previously took `$skip`, `$orderBy` and
// `$orderDirection`. It now takes `$lastId` and orders by `id` ascending, fixed, because
// `paginate.ts` walks a population with `where: { id_gt: $lastId }`:
//
//   - `skip` breaks when rows shift between pages, and the gateway caps it at 5,000 anyway.
//   - A variable `orderBy` is a footgun next to `id_gt`. Ordering by TVL while paging on id
//     silently drops and repeats rows, and nothing about the result looks wrong.
//   - Ranking from a single page is not possible honestly regardless — you cannot say "the
//     largest market" until the population is exhausted. Sort after paginating, not during.
//
// All fields are in the measured five-version intersection (introspected 2026-09-07).

export const MARKETS = `query Markets($first: Int!, $lastId: ID!, $block: Block_height) {
  _meta(block: $block) { deployment hasIndexingErrors block { number timestamp } }
  markets(
    first: $first, block: $block
    orderBy: id, orderDirection: asc
    where: { id_gt: $lastId }
  ) {
    id name isActive
    canBorrowFrom canUseAsCollateral
    maximumLTV liquidationThreshold liquidationPenalty
    inputToken { id symbol decimals }
    inputTokenBalance
    inputTokenPriceUSD
    totalValueLockedUSD
    totalDepositBalanceUSD
    totalBorrowBalanceUSD
    cumulativeDepositUSD
    cumulativeBorrowUSD
    rates { id side type rate }
    createdBlockNumber createdTimestamp
  }
}`;

export interface MarketRate { id: string; side: string; type: string; rate: string }

export interface MarketRow {
  id: string;
  /** ⚠️ Indexer-supplied and reaches reports and HTML. Escape and bound it (§5.18). */
  name: string | null;
  isActive: boolean;
  canBorrowFrom: boolean; canUseAsCollateral: boolean;
  maximumLTV: string | null; liquidationThreshold: string | null; liquidationPenalty: string | null;
  /** ⚠️ On morpho-blue this is the COLLATERAL token, not the loan token. Adapter territory. */
  inputToken: { id: string; symbol: string | null; decimals: number } | null;
  /** ⚠️ On morpho-blue this is denominated in the LOAN token. The pair disagree by design. */
  inputTokenBalance: string | null;
  /** ⚠️ Zero here with a non-zero balance is a DATA_ERROR on Aave and a false positive on Morpho. */
  inputTokenPriceUSD: string | null;
  totalValueLockedUSD: string | null;
  totalDepositBalanceUSD: string | null;
  totalBorrowBalanceUSD: string | null;
  cumulativeDepositUSD: string | null;
  cumulativeBorrowUSD: string | null;
  rates: MarketRate[];
  createdBlockNumber: string | null; createdTimestamp: string | null;
}

export interface MarketsResult { markets: MarketRow[] }

/** The first page's cursor. Every id sorts after the empty string. */
export const FIRST_PAGE = '' as const;

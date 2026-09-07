// Market-level detail. Shaped for pagination (Unit 7): `$first` is the page size, `$skip`
// the offset, and `$orderBy`/`$orderDirection` are variables so a page can be walked on a
// STABLE key (`id`) while a report asks for the same rows by size.
//
// ⚠️ Paging on `totalValueLockedUSD` is not stable — balances move between pages and rows
// get skipped or repeated. Page on `id`; sort for presentation afterwards.
//
// All fields are in the measured five-version intersection (introspected 2026-09-07).

export const MARKETS = `query Markets(
  $first: Int!, $skip: Int!, $orderBy: Market_orderBy!, $orderDirection: OrderDirection!, $block: Block_height
) {
  _meta(block: $block) { deployment hasIndexingErrors block { number timestamp } }
  markets(first: $first, skip: $skip, orderBy: $orderBy, orderDirection: $orderDirection, block: $block) {
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

/** Page on this. Unique and immutable, so pages cannot overlap or drop rows. */
export const STABLE_ORDER = { orderBy: 'id', orderDirection: 'asc' } as const;

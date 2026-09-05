# Research: messari/subgraphs — the data layer

**Repo:** https://github.com/messari/subgraphs
**Reviewed at:** commit `2711ac91ef119f321f65b339e10a57f9aa74f9d8` (2025-03-25, master)
**Reviewed:** Sept 4, 2026

> ⚠️ **No queries were executed.** `gateway.thegraph.com` and `gateway-arbitrum.network.thegraph.com`
> both return `auth error: missing authorization header`; the old hosted service `api.thegraph.com`
> returns **HTTP 526 (dead)**.
>
> **Solid** (read from source at `2711ac91`, cited to file and line): the schema, the mappings, the
> version matrix, the revenue and TVL formulas, the pruning declarations.
> **Unverified**: which deployments are live today, exact pruning depth, and any actual numbers.
>
> A probe script closes all three gaps in ~90 seconds once we have a key. **Run it before writing any
> product code.**

---

## 0. The three things that decide the build

### a. Which deployments are live — unknown, but here's the shape

From `deployment/deployment.json` (14k lines, the authoritative config):

| | count |
|---|---|
| lending protocols | 51 |
| lending deployments | 103 |
| with a decentralized-network query ID | 95 |
| **with no DN ID (unreachable)** | **8** |
| marked `status: dev` | 10 |

Endpoint format: `https://gateway.thegraph.com/api/<KEY>/subgraphs/id/<query-id>`

**The 8 with no decentralized deployment at all:** aave-v3-metis, aurigami-aurora, tectonic-cronos,
dforce-avalanche, silo-finance-ethereum, synthetix-ethereum, synthetix-optimism, **morpho-blue-ethereum**.

🔴 **That last one matters: "balance sheet of Morpho" does not work.** Morpho Blue is `status: dev`,
schema 3.2.0, **no decentralized-network entry.** The only Morpho on the network is the Optimizers —
`morpho-aave-v2`, `morpho-aave-v3`, `morpho-compound`, all schema 3.0.1 — **the deprecated product
Morpho itself migrated away from.**

⚠️ **Config bug:** `compound-v3-ethereum` and `compound-v3-base` are both assigned query-id
`AwoxEZbiWLvv6e3QdvdMZw4WDURdGbvPfHmZRc8Dpfz9`. One is wrong.

**The real risk isn't the dormant repo — it's curation signal.** A subgraph with no signal has no
indexer allocating to it, and the gateway returns "no indexers found" even though the ID is valid.
Undeterminable without a key.

```bash
export GRAPH_API_KEY=<key from thegraph.com/studio, free, 100k queries/mo>
node probe-lending.mjs deployment/deployment.json > status.json
# DEEP=1 also binary-searches the pruned history floor per deployment (answers 0b)
```

Reports per deployment: live/dead, head block, indexing lag in seconds, `hasIndexingErrors`, the
`schemaVersion` the subgraph *reports* vs what the repo claims, and TVL/borrow for plausibility.
**Copy it into the repo — we want this as a health check anyway.**

### b. 🔴 `block: { number: N }` — the finding that should change the design

**Every major lending manifest declares `indexerHints: prune: auto`.** 35 of them, verified by grep:

```
subgraphs/aave-forks/protocols/{aave-v2,aave-v3,aave-amm,aave-arc,aave-rwa,spark-lend,
  radiant-capital,radiant-capital-v2,zerolend,seamless-protocol,geist-finance,kinza-finance,
  pac-finance,seismic,superlend,uwu-lend}/config/templates/*.yaml
subgraphs/compound-forks/protocols/{compound-v2,cream-finance,iron-bank,venus,moonwell,
  benqi,banker-joe,dforce,scream,sonne-finance,rari-fuse,bastion-protocol,aurigami,tectonic}/...
subgraphs/compound-v3/protocols/compound-v3/...
subgraphs/makerdao/protocols/makerdao/...
subgraphs/morpho/protocols/{morpho-aave-v2,morpho-aave-v3,morpho-compound}/...
```

`prune: auto` retains only the minimum history needed for reorg handling. **Historical entity versions
are deleted. Time-travel queries below the retained window fail.** Introduced March–June 2024
(`git log -S indexerHints`).

**What this means for the prediction market:**
- If "later block" means near chain head at settlement time → **fine**, inside the retained window.
- **If settlement is delayed even by hours, or we need to re-derive the value for a dispute, the query
  fails.** That's the day-5 landmine.
- Exact error string unverified. `DEEP=1` on the probe binary-searches the actual floor per deployment.

### ✅ The fix, and it's a good one

**Pruning removes old *versions* of an entity row. It does not remove distinct entities.**
`FinancialsDailySnapshot`, `MarketDailySnapshot`, `MarketHourlySnapshot` are one row per day/hour with
a distinct id — each becomes final and stays the current version forever.

> **Snapshots survive pruning; time-travel does not. Settle on a named snapshot day, not a block
> height.**

⚠️ **Second thing: the report hash must commit to `_meta.deployment`** (the IPFS deployment hash), not
just the query text and subgraph ID. **Subgraph IDs get republished to new deployment versions and the
numbers change underneath a stable ID.** Hash only the query and a republish silently re-settles the
market.

### c. Schema uniformity — no. Here's exactly where it breaks.

Each subgraph directory carries its **own pinned copy** of `schema.graphql`. That's ground truth, not
the root file.

| schema version | deployments | representative pinned copy |
|---|---|---|
| 1.3.0 | 13 | `subgraphs/euler-finance/schema.graphql` |
| 1.3.1 | 1 | `subgraphs/qidao/schema.graphql` |
| 2.0.1 | 44 | `subgraphs/compound-forks/schema.graphql` |
| 3.0.1 | 6 | `subgraphs/morpho/schema.graphql` |
| 3.1.0 | 38 | `subgraphs/aave-forks/schema.graphql` |
| 3.2.0 | 1 | `subgraphs/morpho-blue/schema.graphql` (not deployed) |

Per protocol:

```
aave-v2, aave-v3, aave-amm/arc/rwa, spark-lend, geist, kinza, pac,
seamless, seismic, superlend, uwu-lend, zerolend, radiant, compound-v3   3.1.0
morpho-aave-v2, morpho-aave-v3, morpho-compound, maple-v2, silo          3.0.1
radiant-v2                                    3.0.1 AND 3.1.0 (split by chain!)
compound-v2, makerdao, liquity, abracadabra, venus, moonwell, iron-bank,
  cream, dforce, benqi, scream, sonne, rari-fuse, ...                    2.0.1
euler-finance, inverse-finance, maple-v1                                 1.3.0
qidao                                         1.3.0 AND 1.3.1 (split by chain)
```

### The five breaks that kill a single query pattern

1. 🔴 **`PositionSide` enum values change.** 2.0.1 is `LENDER | BORROWER`. 3.0.1/3.1.0 is
   `COLLATERAL | BORROWER`. 3.2.0 is `COLLATERAL | SUPPLIER | BORROWER`. A query with
   `where: { side: LENDER }` against Aave v3 is **a GraphQL validation error — not a null, a hard
   400.** And on Morpho Blue, supply and collateral are different sides, so an Aave-shaped query
   **silently misses lenders.**
2. **`id` type changes from `ID!` to `Bytes!`** at 2.0.1 → 3.0.1, on `LendingProtocol`, `Market`,
   `Account`, `Deposit`, all snapshots. `FinancialsDailySnapshot.id` is the decimal string `"20334"`
   on Compound v2 but the 4-byte `0x00004f6e` on Aave v3. **Never filter or order snapshots by id.
   Use `timestamp`.** (`Position.id` and `InterestRate.id` stay `ID!` in all versions.)
3. **`Position` does not exist at all in 1.3.0.** Euler, Inverse, Maple v1, QiDao have no position data.
4. **`Liquidate.position` (singular, 2.0.1) becomes `Liquidate.positions` (plural, 3.x)**, and the
   `@derivedFrom(field:)` on `Position.liquidations` flips accordingly.
5. **3.x-only entities:** `Fee`, `RevenueDetail`, `Flashloan`, `Transfer`, `Oracle`. **3.x-only Market
   fields:** `reserveFactor`, `reserves`, `borrowedToken`, `variableBorrowedTokenBalance`,
   `stableBorrowedTokenBalance`, `supplyCap`, `borrowCap`, `supplyIndex`, `borrowIndex`, `canIsolate`,
   `oracle`.

### ✅ The good news — the intersection is large, and it's the balance-sheet layer

| entity | fields common to all five versions |
|---|---|
| `LendingProtocol` | 28 |
| `Market` | 38 |
| `FinancialsDailySnapshot` | 23 (all of 1.3.0's and 2.0.1's) |
| `MarketDailySnapshot` | 30 |
| `Position` | 23 (of the 4 versions that have it) |

**Every USD field we need is in the stable core** — `totalDepositBalanceUSD`,
`totalBorrowBalanceUSD`, `cumulative{SupplySide,ProtocolSide,Total}RevenueUSD`,
`cumulative{Deposit,Borrow,Liquidate}USD`, `totalValueLockedUSD`. **That's a real standardized schema.
It's just narrower than the docs imply.**

---

## 1. What this is

Messari's standardized subgraph monorepo. **176 subgraph directories** across 10 protocol-type schemas
(lending, CDP, DEX-AMM, yield, bridge, perps, options, NFT marketplace, network, governance). Lending
is the flagship.

**Relationships:** Messari authored and maintains it (MIT, community PRs welcome). **The Graph is
purely the execution layer** — these are ordinary subgraphs on the decentralized network. The
"standardized-subgraph initiative" is Messari's own.

### ⚠️ Maintenance: effectively archived

```
2022-10  127        2023-03   68       2024-03  14      2025-01   7
2022-11   72        2023-06   42       2024-07  20      2025-02   9
2022-12   50        2023-08   33       2024-10  12      2025-03   1  <- last
2023-01   77        2023-11   16       2024-12   7
```

Peak 127/month in late 2022; **last commit 2025-03-25 — ~17 months of silence.** Stale feature
branches remain. Open issue count unverified.

**Do deployments outlive the repo?** Mechanically yes — deployed subgraphs keep indexing. **But nobody
is fixing them.** If Aave ships a contract change that breaks the mapping, it stays broken. **Pick
protocols whose contracts are frozen or near-frozen.**

---

## 2. Read these first

| # | File | Why | Time |
|---|---|---|---|
| 1 | `subgraphs/aave-forks/schema.graphql` (2,133 ln) | **The heart.** Not the root `schema-lending.graphql` — this is the pinned 3.1.0 copy that 38 deployments actually serve. Every field carries a description that becomes a real GraphQL description in introspection | ~40 min |
| 2 | `subgraphs/aave-forks/src/sdk/manager.ts` (1,365 ln — read `updateMarketAndProtocolData` ~line 900, and `addProtocolRevenue`/`addSupplyRevenue`/`updateRevenue`) | The DataManager. **Every USD number in the schema is written here.** If you read one file to understand what the numbers mean, read this | ~15 min |
| 3 | `subgraphs/aave-forks/src/mapping.ts:460-660` | `_handleReserveDataUpdated`, the revenue engine. **Where "revenue" is actually defined, and it doesn't look like the docs** | ~15 min |
| 4 | `deployment/deployment.json` (14,144 ln — query it, don't read it) | Only source of truth for chain, schema version, query ID. The generated `decentralized_network_deployments.csv` is **missing the schema-version column**, which is the one we need | ~5 min |
| 5 | `monitor/poolLevel/lendingPoolLevel.js` (256 ln) | **Messari's own data-validation rules — a free specification of our reconciliation engine**, written by the people who know where the data breaks | ~10 min |

**Skip `docs/METHODOLOGY.md`** — a 63-line template, not a methodology, and it contradicts the code.

---

## 3. The lending schema

### Entity graph

```
LendingProtocol (id: Bytes 3.x / ID 2.x — addresses-provider or comptroller address)
 ├── markets:          [Market!]      @derivedFrom(protocol)
 ├── financialMetrics: [FinancialsDailySnapshot!]
 ├── dailyUsageMetrics / hourlyUsageMetrics
 ├── revenueDetail:    RevenueDetail          (3.x only)
 └── fees:             [Fee!]                 (3.x only)

Market (id = market/reserve address)
 ├── inputToken:    Token        the underlying (USDC, WETH)
 ├── outputToken:   Token        the receipt token (aUSDC, cUSDC)
 ├── borrowedToken: Token        (3.x only)
 ├── rates:         [InterestRate!]   side × type
 ├── oracle:        Oracle       (3.x only — address + isActive, NOT prices)
 ├── positions:     [Position!]  @derivedFrom(market)     (absent in 1.3.0)
 ├── dailySnapshots / hourlySnapshots
 └── deposits / withdraws / borrows / repays / liquidates / transfers / flashloans

Position (id = "{account}-{market}-{SIDE}[-{interestType}]-{counter}"  — a STRING)
 ├── side:    PositionSide  ** enum values differ by version **
 ├── balance: BigInt        ** token native units. THERE IS NO balanceUSD. **
 └── snapshots: [PositionSnapshot!]   (PositionSnapshot DOES have balanceUSD, 3.x)
```

**Subtlety on `Position.id`:** when a balance hits zero the position closes and
`_PositionCounter.nextCount` increments (`sdk/position.ts:255-262`), so one account can have many
historical positions in the same market+side. `openPositionCount` / `closedPositionCount` distinguish.

### Always populated vs null

**Safe set** (non-nullable and written on every relevant event):
`LendingProtocol.{totalValueLockedUSD, totalDepositBalanceUSD, totalBorrowBalanceUSD,
cumulative*RevenueUSD, cumulativeDepositUSD, cumulativeBorrowUSD, cumulativeLiquidateUSD,
cumulativeUniqueUsers, totalPoolCount}`, `Market.{totalValueLockedUSD, totalDepositBalanceUSD,
totalBorrowBalanceUSD, inputTokenBalance, inputTokenPriceUSD, cumulative*, isActive, maximumLTV,
liquidationThreshold, liquidationPenalty}`, all `FinancialsDailySnapshot` fields.

**Null or useless in practice** — verified in the mappings:

- 🔴 **`Market.reserves` is null on every Aave fork.** Declared in 3.1.0 but the only caller passes
  `null`: `mapping.ts:535-542` passes `null` as argument 5 (`newReserveBalance`), and `manager.ts:979`
  only assigns when truthy. **Aave v2/v3, Spark, Radiant, ZeroLend, Seamless, Geist, Kinza, UwU, Pac,
  Seismic, Superlend all have `reserves: null`.** Compound v3 does populate it
  (`compound-v3/.../mapping.ts:1215,1253`). Morpho Blue initialises to 0 and never updates.
- ⚠️ **`Market.reserveFactor` can be null, and when it is the revenue split silently books 100% of
  revenue to the supply side** (`mapping.ts:607-618` logs a warning and defaults to zero).
- `Market.name` is nullable in 3.x.
- `Market.outputToken`, `outputTokenSupply`, `outputTokenPriceUSD`, `exchangeRate` nullable — CDP
  protocols have no receipt token.
- `rewardTokens` / `rewardTokenEmissions*` nullable and frequently stale — theoretical rates.
- `protocolControlledValueUSD` nullable and **no writer found** in the lending forks.
- `Position.principal` and `Position.type` nullable and protocol-dependent.

### USD fields — where prices come from

**Every USD number traces to `market.inputTokenPriceUSD`, sourced from the protocol's own oracle.**
`docs/ORACLES.md` states the policy: lending protocols must use their native oracle so subgraph prices
match liquidation prices. Actually followed:

- **Aave forks:** `IPriceOracleGetter.getAssetPrice()`, normalised through the oracle's own USDC price
  (`aave-v3/src/mapping.ts:595-670`), with a documented `getFallbackOracle()` fallback.
- **Compound forks:** `PriceOracle.getUnderlyingPrice()` (`compound-forks/src/mapping.ts:2462-2478`).
- The generic `_reference_/src/prices` Chainlink/DEX library is **not used** by lending subgraphs.

**Two failure modes to code around:**

1. 🔴 **A reverting oracle silently produces a price of zero.** `getTokenPriceUSD`
   (`compound-forks/src/mapping.ts:2160-2170`) wraps the call in `getOrElse<BigInt>(result,
   BIGINT_ZERO)` — and `getOrElse` (line 2392) **returns the default on revert with no signal.** So
   `inputTokenPriceUSD` becomes 0.0, and `totalValueLockedUSD`, `totalDepositBalanceUSD`,
   `totalBorrowBalanceUSD` all become 0.0. **It looks like a market with no deposits.**
   **Treat `inputTokenPriceUSD == 0 && inputTokenBalance > 0` as a hard data error, not a finding.**
2. **Prices refresh only when an event fires on that market.** A quiet market carries a stale price
   indefinitely. `Token.lastPriceBlockNumber` tells you how stale.

(Aave's oracle returns 8-decimal prices on Avalanche specifically, per `aave-forks/README.md`. Handled
— but it tells you what kind of code this is.)

### ✅ Snapshots — use them, and not just for the obvious reason

`FinancialsDailySnapshot` (protocol-wide, 23 fields, **identical across all five schema versions**) and
`MarketDailySnapshot` / `MarketHourlySnapshot` (per market).

Contents: point-in-time balances, `daily*` deltas (`dailyTotalRevenueUSD`, `dailySupplySideRevenueUSD`,
`dailyProtocolSideRevenueUSD`, `dailyDepositUSD`, `dailyBorrowUSD`, `dailyLiquidateUSD`,
`dailyWithdrawUSD`, `dailyRepayUSD`), and `cumulative*` running totals. 3.x adds `days`,
`revenueDetail`, `dailyTransferUSD`, `dailyFlashloanUSD`.

**Better than block-height queries? Decisively yes — because they're immune to pruning.** A time-travel
query at block N asks for an old *version* of a row that `prune: auto` deleted. A snapshot for day D is
its own row and is never superseded. **That single fact should determine the historical architecture.**

⚠️ **Two traps:**
- **Snapshots are written only when an event fires.** `SnapshotManager`'s constructor
  (`sdk/snapshots.ts:56-70`) creates them per event. **A day with no protocol activity produces no row
  at all.** For "Q2 revenue", compute `cumulativeTotalRevenueUSD(last snapshot ≤ Q2 end) −
  cumulativeTotalRevenueUSD(last snapshot < Q2 start)`. **That's gap-proof. Summing dailies is not.**
- **Filter and order by `timestamp`, never `id`** — the id type flips between versions. `days` only
  exists on 3.x.

### 🔴 What "revenue" actually is — not what the docs say

`docs/METHODOLOGY.md` says: total revenue = all fees collected; supply-side = total − admin fee.
**What the mappings do:**

**Aave forks (3.1.0)** — `mapping.ts:460-628`:

```
newRevenue = aToken.scaledTotalSupply() × (liquidityIndex_now − liquidityIndex_last) / 1e27
totalRevenueDeltaUSD = newRevenue × assetPriceUSD
totalRevenueDeltaUSD -= flashLoanPremiumToLP        // avoid double-counting
protocolSideRevenueDeltaUSD = totalRevenueDeltaUSD × market.reserveFactor
supplySideRevenueDeltaUSD   = totalRevenueDeltaUSD − protocolSideRevenueDeltaUSD
```

**Total revenue is accrued borrower interest**, measured as the increase in the liquidity index against
scaled supply. **It is not fees collected.** Plus two paths that add directly: liquidation protocol fee
(`mapping.ts:959`) and flashloan premium split (`:1125,1141`).

Both deltas flow into `DataManager.updateRevenue`:

```
totalRevenueDelta = protocolRevenueDelta + supplyRevenueDelta
market.cumulativeTotalRevenueUSD        += totalRevenueDelta
market.cumulativeProtocolSideRevenueUSD += protocolRevenueDelta
market.cumulativeSupplySideRevenueUSD   += supplyRevenueDelta
```

⚠️ **`cumulativeTotalRevenueUSD` is defined as the sum of the two sides, not measured independently.**
So `supplySide + protocolSide == total` is **an identity, not a check** — except Messari monitors it
anyway (§4d), which tells you it drifts through float rounding.

**Compound forks (2.0.1)** — `compound-forks/src/mapping.ts:1723-1740`: same structure, cleaner source
— `interestAccumulatedUSD` comes straight from the `AccrueInterest` event param.

**Morpho Blue (3.2.0)** — `morpho-blue/src/morpho-blue.ts:73-88`: same shape.

**What's reliable cross-protocol:** the shape is genuinely uniform — interest accrual, split by reserve
factor. **What differs:** precision of source (event param vs index-delta reconstruction) and what's
included — **Aave adds flashloan premiums and liquidation fees; Compound v2 doesn't.** So
`cumulativeProtocolSideRevenueUSD` is comparable as "protocol take of interest," but Aave's
`cumulativeTotalRevenueUSD` includes lines Compound v2's does not. **Say so in the report; don't
quietly compare.**

3.x also gives `RevenueDetail { sources: [Fee!], amountsUSD: [BigDecimal!] }` — revenue decomposition
by `FeeType`. **Does not exist below 3.0.1.**

---

## 4. What can and can't be reconciled

### 🔴 The naive tie-out is a tautology

From `sdk/manager.ts` `updateMarketAndProtocolData`:

```ts
this.market.totalValueLockedUSD    = newInputTokenBalance / 10^dec × inputTokenPriceUSD;
this.market.totalDepositBalanceUSD = this.market.totalValueLockedUSD;      // ← assignment
this.market.totalBorrowBalanceUSD  = (vBorrowAmount + sBorrowAmount) × inputTokenPriceUSD;
// then, looping over the ENTIRE _MarketList:
this.protocol.totalValueLockedUSD    = Σ market.totalValueLockedUSD;
this.protocol.totalDepositBalanceUSD = totalValueLockedUSD;                // ← same value
this.protocol.totalBorrowBalanceUSD  = Σ market.totalBorrowBalanceUSD;
```

1. **`totalValueLockedUSD` and `totalDepositBalanceUSD` are the same number by assignment**, on both
   Market and LendingProtocol, on both Aave and Compound forks
   (`compound-forks/src/mapping.ts:1820-1821`). **TVL here is gross supplied, not net of borrows.**
   DefiLlama nets borrows out. **Expect a large systematic gap that is not an error.**
2. **Protocol totals are Σ markets by construction.** So `Σ market.totalDepositBalanceUSD ==
   protocol.totalDepositBalanceUSD` is guaranteed. Still a good canary for a partially-failed indexer,
   **but not an economic finding.**
3. ✅ **The meaningful comparison is `totalBorrowBalanceUSD ≤ totalDepositBalanceUSD`**, per market and
   per protocol. Both sides come from **independent contract calls** (`aToken.totalSupply()` vs
   `variableDebtToken.totalSupply() + stableDebtToken.totalSupply()`), so **a violation is real
   signal.**

### 🔴 You cannot tie protocol totals to summed positions

Two blockers:

- **`Position` has no USD field.** `balance: BigInt!` in token native units, in every version. You'd
  multiply by current `inputTokenPriceUSD` against a historical balance.
- **Position balances are stale by design.** `helpers.ts:123-136` — `getCollateralBalance` calls
  `aToken.balanceOf(account)` at the moment of the user's event. **aTokens rebase continuously.**
  Between touches, the true balance grows and the stored `Position.balance` does not. So
  **`Σ Position.balance < market.inputTokenBalance` systematically on Aave**, widening the longer the
  market goes untouched. **This is not bad debt. It is the position model.**

### Reserve deficit / bad debt — not exposed

- `Market.reserves` — null on every Aave fork. Compound v3 only.
- `BadDebtRealization` exists **only in schema 3.2.0** — i.e. only Morpho Blue, which has no
  decentralized deployment. **Unreachable.**
- No `deficit`, `shortfall`, or `unbacked` field anywhere.

**Closest from live data:** `totalBorrowBalanceUSD > totalDepositBalanceUSD` on a market (genuine
backing violation, or a price glitch — disambiguate via `inputTokenPriceUSD`), and `Liquidate.profitUSD`
trends. **Anything more is our engine's own inference, and must be labelled as such in the report.**
Given we're selling these, that distinction matters legally as well as technically.

### What the schema flattens away

- **Per-position USD** — no `Position.balanceUSD`. Only `PositionSnapshot.balanceUSD`, 3.x, per-event,
  millions of rows.
- **Interest accrual mechanics** — 3.1.0 gives `supplyIndex`, `borrowIndex`,
  `indexLastUpdatedTimestamp` (raw rays), enough to reconstruct. **2.0.1 and 1.3.0 give nothing** — so
  accrual reconstruction is impossible on Compound v2, MakerDAO, Liquity, and the other 44 deployments
  at 2.0.1.
- **Oracle prices at time of action** — the `Oracle` entity has address/isActive/isUSD/oracleSource,
  **no prices.** Price history is `MarketDailySnapshot.inputTokenPriceUSD` (daily, activity-gated) plus
  `Token.lastPriceUSD` (current only). Event entities carry `amountUSD` computed at the block, so
  per-action prices are recoverable as `amountUSD / (amount / 10^decimals)`.
- Health factors, eMode categories, isolation debt ceilings — flags exist, parameters don't.

### ✅ `monitor/poolLevel/lendingPoolLevel.js` — the invariants Messari monitors

**The most valuable 256 lines in the repo. They monitor these because they break.**

| invariant (per market) | line |
|---|---|
| `0 < totalValueLockedUSD < 100e9` | 88-97 |
| `0 ≤ cumulativeSupplySideRevenueUSD ≤ 10e9` | 99-111 |
| `0 ≤ cumulativeProtocolSideRevenueUSD ≤ 10e9` | 113-125 |
| `protocolSide + supplySide == cumulativeTotalRevenueUSD` (2dp) | 127-149 |
| `cumulativeDepositUSD > 0` | 151-160 |
| `cumulativeDepositUSD ≥ cumulativeBorrowUSD` | 162-172 |
| `cumulativeLiquidateUSD ≤ cumulativeBorrowUSD` | 174-189 |
| `totalBorrowBalanceUSD ≤ totalDepositBalanceUSD` | 191-203 |
| `0 < totalDepositBalanceUSD < 100e9` | 205-215 |
| `outputTokenSupply ≥ 0` | 217-225 |
| `0 ≤ outputTokenPriceUSD ≤ 100000` | 227-241 |

**Take this list verbatim as the engine's first-pass check set** — pre-validated against every protocol
we're considering. Their query uses `markets(first: 1000)`, the Graph's hard ceiling; rari-fuse can
exceed it.

### Known artifacts — failures that are NOT findings

1. `inputTokenPriceUSD == 0` from an oracle revert → the whole market reads as zero. **Check first.**
2. `reserveFactor == null` → 100% of revenue booked supply-side, `cumulativeProtocolSideRevenueUSD`
   flat at zero.
3. `Σ Position.balance` short of `market.inputTokenBalance` on Aave → rebasing staleness.
4. TVL ≠ DefiLlama → gross vs net definition.
5. Missing snapshot days → no activity.
6. Aave `Market.reserves == null` → never written, not a zero reserve.

---

## 5. The cross-protocol query

Every field below is in the verified stable core (present in all five schema versions), so **the same
document runs unmodified against all 95 lending deployments**:

```graphql
query LendingBalanceSheet($topMarkets: Int = 25) {
  _meta { block { number timestamp } deployment hasIndexingErrors }

  lendingProtocols(first: 1) {
    id name slug
    schemaVersion subgraphVersion methodologyVersion   # branch your adapter on these
    network lendingType riskType
    totalValueLockedUSD
    totalDepositBalanceUSD
    totalBorrowBalanceUSD
    cumulativeDepositUSD cumulativeBorrowUSD cumulativeLiquidateUSD
    cumulativeSupplySideRevenueUSD
    cumulativeProtocolSideRevenueUSD
    cumulativeTotalRevenueUSD
    cumulativeUniqueUsers totalPoolCount
  }

  markets(first: $topMarkets, orderBy: totalBorrowBalanceUSD,
          orderDirection: desc, where: { isActive: true }) {
    id name isActive canBorrowFrom canUseAsCollateral
    maximumLTV liquidationThreshold liquidationPenalty
    inputToken { id symbol decimals lastPriceUSD }
    inputTokenBalance inputTokenPriceUSD
    outputTokenSupply exchangeRate
    totalValueLockedUSD totalDepositBalanceUSD totalBorrowBalanceUSD
    cumulativeDepositUSD cumulativeBorrowUSD cumulativeLiquidateUSD
    cumulativeSupplySideRevenueUSD
    cumulativeProtocolSideRevenueUSD
    cumulativeTotalRevenueUSD
    rates { id side type rate }
    createdBlockNumber
  }
}
```

**`_meta` is non-negotiable** — freshness, `hasIndexingErrors`, and the deployment hash we must bind
into the report hash.

⚠️ **What "one query, N protocols" honestly means: one document, N endpoints.** Each protocol is a
separate subgraph with its own URL. **There is no composition, no cross-subgraph join, no federated
gateway. The fan-out is client-side.** That's still a legitimate standardized-schema claim for the
prize — **the schema is what's standardized** — but **don't overstate it, because a judge will check.**

### Where "same schema" breaks semantically, within a single version

1. 🔴 **`Market` means three different things.** On Aave, one market per reserve asset, `inputToken ==
   borrowedToken`. On **Compound v3 (Comet)**, a market is a base asset with multiple collateral assets
   attached — `borrowedToken ≠ inputToken`, collateral markets related via `Market.relation`. On **CDP
   protocols** (MakerDAO, Liquity, QiDao, Abracadabra), a market is a collateral type with a synthetic
   debt token, `outputToken` is null, and `totalBorrowBalanceUSD` is **minted stablecoin, not borrowed
   deposits**. **`lendingType: CDP | POOLED` and `riskType: GLOBAL | ISOLATED` let you detect this —
   branch on them, always.**
2. Revenue composition differs within the same field (§3e).
3. `totalPoolCount` vs actual market count diverges when markets are delisted; `isActive` is the real
   filter.

### What "add a protocol via one line" actually requires

| new protocol is… | work required |
|---|---|
| **3.1.0, POOLED** (aave/compound fork) | one config row `{name, network, queryId}`. **Genuinely one line** |
| 3.0.1 (Morpho Optimizers) | + tolerate missing `FLASHLOAN_*` fee types; `InterestRateType` has an extra `P2P` value |
| 2.0.1 (Compound v2, Maker, Liquity, Venus, Moonwell…) | + `PositionSide.LENDER` not `COLLATERAL`; + `id` is `ID!` not `Bytes!`; + no Fee/RevenueDetail/Flashloan/Transfer/Oracle; + no `reserveFactor`/`supplyIndex` |
| 1.3.0 (Euler, Inverse, Maple v1, QiDao) | + **no `Position` entity at all** |
| CDP (`lendingType: CDP`) | + `outputToken` null; + borrow means mint; + backing check needs different semantics |

So the config row is `{ name, network, queryId, schemaVersion, lendingType }` and the adapter
dispatches on the last two. ⚠️ **Read `schemaVersion` from the live subgraph, not from
`deployment.json`** — the repo has been dormant 17 months and the deployed build is the authority.

---

## 6. The agent angle

### ✅ Introspection is unusually good — the strongest thing about this repo for our use case

Every field carries a description that becomes a real GraphQL description:

```graphql
" Liquidation threshold as a percentage value (e.g. 80% for DAI in Aave). When it is
  reached, the position is defined as undercollateralised and could be liquidated "
liquidationThreshold: BigDecimal!
```

Naming conventions are machine-legible and documented in `docs/SCHEMA.md`: **`cumulative*` = all-time
sum, `daily*`/`hourly*` = interval aggregate, bare = spot balance.** Feed that prefix rule to the agent
as a system-prompt fragment — it removes most of the ambiguity.

**Four semantic facts the schema does NOT carry, which must be injected:**
- `totalValueLockedUSD == totalDepositBalanceUSD` by assignment
- Revenue is accrued interest, not fees, despite the docs
- `Position.balance` is stale and unit-denominated
- `Market` means three different things depending on `lendingType`

### Gotchas for dynamic composition

- ⚠️ **Prune every `_`-prefixed field before showing the schema to the LLM.** Morpho 3.0.1's `Market`
  has **134 fields, 58 internal** (`_p2pBorrowInterestsImprovementUSD`, `_virtualScaledSupply`…). An
  agent will select them and produce nonsense. Aave 3.1.0 is better (87 fields, 8 internal); Compound
  2.0.1 is 50/6. **Filtering `_*` is one line and roughly halves the Morpho surface.**
- ⚠️ **Pin enum values per endpoint.** `side: LENDER` against a 3.x subgraph is a **validation error,
  not a null result.** Fetch the live enum via introspection at adapter-init and constrain generation.
- `first` max 1000, `skip` max 5000. Beyond that, cursor-paginate on `id_gt`. (General Graph limits,
  unverified against these endpoints.)
- **No required arguments anywhere.** Good for agents; also means a careless agent pulls 100 entities ×
  all fields. **Cap `first` in the composition layer.**
- Free tier 100k queries/month, pay-per-query beyond. **Unverified — check current pricing.** An agent
  that introspects then fans out to 4 protocols burns ~10 queries per report. Fine.
- **Always include `_meta`.**

### What helps an agent

- **The schema descriptions themselves** — the single best asset.
- **`docs/SCHEMA.md`** (229 ln): naming conventions, the prefix rule, ID construction. **Worth pasting
  into the system prompt nearly verbatim.**
- `docs/CHANGES.md` (125 ln): version-by-version changelog. Feed the 3.0.0 section so the agent knows
  what's absent below 3.x.
- `subgraphs/compound-forks/queries/` — seven ready-made example queries. Few-shot material, **but
  written against 2.0.1** — adapt before handing to an agent targeting Aave.

---

## 7. Gotchas that will bite on day 5

1. 🔴 **`prune: auto` on all 35 major lending manifests.** Ranked first because it **invalidates a
   design** rather than costing an afternoon.
2. 🔴 **Hosted service is dead.** `api.thegraph.com` → HTTP 526, confirmed. Every README/doc URL
   pointing there is dead. **Decentralized network only, API key mandatory.**
3. **`deployment.json` duplicate query-id:** compound-v3-ethereum and compound-v3-base share
   `AwoxEZ...`. One is wrong.
4. 🔴 **Morpho Blue isn't deployed.** The example directive doesn't work.
5. 8 lending deployments have no DN endpoint; 10 are `status: dev`. **`radiant-capital-v2` is dev on
   both chains AND split across 3.0.1/3.1.0 — avoid.**
6. **Repo dormant 17 months.** No one is fixing breakage.
7. **Schema version in `deployment.json` may not match what's deployed.** Read
   `lendingProtocols[0].schemaVersion` live. Related smell: `sdk/snapshots.ts:39` documents itself as
   "Schema Version: 3.1.1" while the schema file says 3.1.0.
8. 🔴 **Docs contradict mappings.** `docs/METHODOLOGY.md` says TVL = sum of deposits and revenue = fees
   collected. The mappings implement TVL = gross supplied and revenue = accrued interest. **Trust
   `manager.ts`, not the docs. The single biggest source of "my numbers are wrong" that isn't actually
   wrong.**
9. **Silent zeros from oracle reverts** — look exactly like a protocol with no TVL.
10. **`Market.reserves` null on all Aave forks** — don't build a reserve-deficit feature on it.
11. **Indexing lag on large deployments.** `updateMarketAndProtocolData` loops the entire `_MarketList`
    on every `ReserveDataUpdated` — O(markets) per event. On Aave v3 Ethereum (30+ reserves) that's a
    real cost. **Check `_meta.block.timestamp` against wall clock before settling anything.**
12. **`markets(first: 1000)` ceiling** — rari-fuse and similar exceed it.
13. **qidao ships two schema versions across its 11 chains.** Don't assume version-uniformity across
    networks.

---

## 8. Verdict

### Pick these four

**`aave-v3-ethereum`, `aave-v2-ethereum`, `spark-lend-ethereum`, `compound-v3-ethereum`.**

Why exactly these:
- **All schema 3.1.0** — no version-drift adapter needed for the demo path.
- **All Ethereum mainnet — one chain, one block clock.** Critical: a report comparing protocols across
  chains has **no single settlement block**, and we don't want to solve cross-chain block alignment in
  nine days.
- **All `lendingType: POOLED`** — no CDP semantics branch.
- **Three of the four share `aave-forks/src/`**, so revenue and TVL are computed by *literally the same
  code* — **divergences found are real, not methodological.**
- **Spark is a real Aave v3 fork with different governance**, so "add a protocol via config" is a true
  one-liner you can demo live. Add `zerolend-ethereum` or `seamless-protocol-base` on stage as the
  fifth.

```
aave-v3-ethereum      JCNWRypm7FYwV8fx5HhzZPSFaMxgkPuw4TnR3Gpi81zk   3.1.0  sub 2.4.1
aave-v2-ethereum      C2zniPn45RnLDGzVeGZCx2Sw3GXrbc9gL4ZfL8B8Em2j   3.1.0  sub 2.2.0
spark-lend-ethereum   GbKdmBe4ycCYCQLQSjqGg6UHYoYfbyJyq5WrG35pv1si   3.1.0  sub 2.4.0
compound-v3-ethereum  AwoxEZbiWLvv6e3QdvdMZw4WDURdGbvPfHmZRc8Dpfz9   3.1.0  sub 2.3.0  ⚠ dup id
zerolend-ethereum     4Zf4doH54RDit9KVsfCp3MkjrP3szhJZwvw2z5PHczx9   3.1.0  sub 1.0.0
```

💡 **Add `compound-v2-ethereum`** (`4TbqVA8p2DoBd5qDbPMwmDZv3CsJjWtxo8nVSqF2tA9a`, **schema 2.0.1**)
deliberately as a fifth — **not despite the version gap but because of it.** A
schemaVersion-dispatching adapter handling a 2.0.1 protocol alongside four 3.1.0 ones is a **far
stronger demonstration of "standardized schema"** than five identical forks. It's the difference
between "I queried five endpoints" and "I built a compatibility layer over a schema standard."

**Skip Morpho unless we need the name.** If so: `morpho-aave-v3-ethereum` (3.0.1), and say in the
report that Morpho Blue isn't covered.

### Five things to internalise before writing the engine

1. **`totalValueLockedUSD` IS `totalDepositBalanceUSD`, by assignment.** Gross supplied, not net. Never
   present as independent; never compare to DefiLlama without a stated adjustment.
2. **Positions carry no USD and are stale.** Do not build the tie-out on `Σ Position.balance`. It will
   not tie on any rebasing protocol, and the failure is an artifact.
3. **Snapshots survive pruning; time-travel doesn't.** All historical reads go through
   `financialsDailySnapshots`/`marketDailySnapshots`. **Compute period revenue as a cumulative delta,
   never a sum of dailies.**
4. **Revenue is accrued interest split by `reserveFactor`, not fees collected** — docs notwithstanding.
   `total == protocolSide + supplySide` is an identity, so it only detects arithmetic drift.
   `reserveFactor == null` ⇒ everything books supply-side.
5. **`inputTokenPriceUSD == 0` is a silent oracle failure, not an empty market.** Make it the very
   first guard in the pipeline.

### What to build differently

**Settlement — drop "re-run the query at a later block" as the literal mechanism.** Two prune-proof
alternatives:

- **Snapshot settlement:** resolve on `financialsDailySnapshots(where:{timestamp_gte: D, timestamp_lt:
  D+86400})` for a named UTC day. Deterministic, permanently re-derivable, immutable once the day
  closes.
- **Attested capture:** query at head at settlement time and persist `{value, blockNumber,
  blockTimestamp, _meta.deployment, queryHash}` on-chain. Verifiable against the subgraph while the
  block is retained; after that the attestation stands on its own.

**Report hash — bind `_meta.deployment` (the IPFS hash)**, not just subgraph ID and query text. **Two
lines now, an unfixable dispute later.**

**Reconciliation — reframe from "positions vs protocol" (impossible) to a layered check:**

- **L0 sanity:** the 11 invariants from `monitor/poolLevel/lendingPoolLevel.js` verbatim.
- **L1 internal:** `market.totalDepositBalanceUSD == inputTokenBalance/10^dec × inputTokenPriceUSD`
  (catches stale price); `Σ markets == protocol` (catches partial indexing); cumulative deltas across
  consecutive snapshots reconcile to `daily*` (catches missed days).
- **L2 economic:** `totalBorrowBalanceUSD ≤ totalDepositBalanceUSD` per market — **the only genuine
  backing check the schema supports.**
- **L3 external:** subgraph vs a direct `eth_call` to `aToken.totalSupply()` at the same block. **This
  is the one that produces findings a buyer would pay for**, because it's the only check where the two
  sides come from genuinely independent sources. **~30 lines with viem, and we already have RPC
  access.**

**Agent surface — don't let the LLM introspect raw.** Build a curated schema view: strip `_`-prefixed
fields, pin enums from live introspection per endpoint, inject the four semantic facts the descriptions
don't carry. **That converts "an agent that queries The Graph" into "an agent that queries The Graph
correctly."**

**Day-one ordering: run the probe script before writing any product code.** If a meaningful share of
those 95 endpoints are unsignalled or lagging, the protocol shortlist changes — and we want to know on
day 1, not day 5.

---

## Questions closed

| Question | Answer |
|---|---|
| Does `block: { number: N }` work? | **Not reliably** — `prune: auto` on all 35 major lending manifests deletes historical entity versions. Use snapshots instead |
| Is the schema uniform? | **No** — five versions in production. But the intersection (28–38 fields per core entity) is large and covers the whole balance-sheet layer |
| Can we tie positions to protocol totals? | **No.** `Position` has no USD field and balances are stale by design on rebasing protocols |
| Can we detect reserve deficit / bad debt? | **Not from the schema.** `reserves` is null on all Aave forks; `BadDebtRealization` is 3.2.0-only and undeployed |
| What is "revenue"? | **Accrued borrower interest split by `reserveFactor`** — not fees collected, despite the docs |
| Is `TVL` independent of deposits? | **No — same number by assignment.** Gross supplied, not net |
| Is "balance sheet of Morpho" possible? | **Not for Morpho Blue** — no decentralized deployment. Only the deprecated Optimizers |
| Is the repo maintained? | **No** — 17 months since last commit. Deployments outlive it but nobody fixes breakage |
| Does it introspect well for an agent? | **Yes, unusually well** — every field has a description. But `_`-prefixed fields must be stripped and enums pinned per endpoint |

## Still open

- **Which of the 95 endpoints are actually live and synced** — the probe script, ~90 seconds with a key
- **Exact pruning floor per deployment** — `DEEP=1` on the probe
- **Real side-by-side numbers across the four chosen protocols** — never executed
- Current Graph pricing and rate limits
- Whether the `compound-v3-ethereum` / `compound-v3-base` duplicate query-id resolves to the right chain
- Whether to adopt snapshot-day settlement or attested capture (both prune-proof; different tradeoffs)

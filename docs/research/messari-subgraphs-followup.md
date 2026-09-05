# Research: messari/subgraphs — measured follow-up

**Follow-up to `messari-subgraphs.md`.** Companion note; read that first for the schema walkthrough.
**Date:** Sept 5, 2026. **Chain head at measurement:** block 25,909,105, 2026-09-05T05:32:59Z.

> ⚠️ **Still no API key** — Studio requires a wallet signature the reviewer couldn't perform. **The
> probe script did not run.** §1a–c, §2a/c/d/e, §3a–c, §4, §5a-subgraph-side, §6a–c, §7c remain
> unexecuted.
>
> **But a route was found that answers much of it with hard data:** The Graph's **GNS contract on
> Arbitrum** resolves subgraph IDs → deployment hashes and curation signal without auth, and The
> Graph's **IPFS gateway** serves the actually-deployed manifests and schemas. Plus public Ethereum
> RPC, DefiLlama, and the graph-node source.

| Route | Status | Covers |
|---|---|---|
| Graph gateway (queries) | ❌ no key | live/dead, lag, real numbers, introspection, invariants |
| GNS @ Arbitrum (`0xec9A7f…`) | ✅ **94/95 resolved** | deployment hashes, curation signal, disabled flag |
| IPFS (`ipfs.network.thegraph.com`) | ✅ 27 manifests + 7 schemas | deployed network, specVersion, prune, startBlock, schema bytes |
| Ethereum RPC (`eth.drpc.org`) | ✅ | L3 on-chain side, drift, chain verification |
| graph-node source (2.4 MB tarball) | ✅ | **exact** prune semantics + **exact** error strings |
| DefiLlama / docs | ✅ | external reference TVL, billing |

---

## Eight corrections to the previous review

1. 🔴 **`prune: auto` = 500 blocks, not "~250."** From source: `Prune::Auto => ENV_VARS.min_history_blocks`,
   which defaults to `2 * reorg_threshold` = 2 × 250 = **500 blocks ≈ 100 minutes.** Far tighter than
   implied.
2. ✅ **Not every deployment prunes.** **8 of 27 Ethereum lending deployments have no `indexerHints` at
   all** in their *deployed* manifest (older `specVersion: 0.0.4`) → `BLOCK_NUMBER_MAX` → **full
   history, time-travel works.** The previous review generalised from repo templates; **the deployed
   artifacts differ.**
3. ⚠️ **`spark-lend-ethereum` has 1.0 GRT of curation signal.** The Graph's docs recommend **3,000 GRT**
   to attract indexers. **Spark is effectively unsignalled. Drop it from the five.**
4. ✅ **Immutable entities survive pruning completely** — missed entirely last time, and **the most
   useful finding here.** On 3.1.0: `Deposit`, `Withdraw`, `Borrow`, `Repay`, `Liquidate`, `Transfer`,
   `Flashloan`, `PositionSnapshot` are all `@entity(immutable: true)`. **Pruning cannot touch them.
   Full event history is permanently queryable.**
5. ✅ **The duplicate ID is resolved:** `AwoxEZ…` serves **Ethereum.** Verified two ways.
6. ✅ **aave-v3, aave-v2 and spark deploy a byte-identical schema** (sha256 `18064e6a…`). Stronger than
   claimed. compound-v3 differs only in `_`-prefixed internals.
7. ⚠️ **The L3 check is not uniform** — compound-v2 *derives* `inputTokenBalance` from the exchange rate
   rather than calling it. "~30 lines" was aave-family only. **Real: 42 lines + one adapter per
   protocol family.**
8. ⚠️ **Stripping `_*` barely helps on aave-v3** (14 internal fields out of 593). Over-sold last time.
   It matters for Morpho (58 internal `Market` fields). **The real lever is entity subsetting.**

---

## 1. Liveness — proxied by curation signal

**§1a — no live/dead breakdown.** But a strong proxy: **curation signal is what makes indexers
allocate at all.**

**MEASURED via GNS: 94/95 resolved** (`liquity-ethereum` failed — retry), **0 disabled, 78 signalled,
16 with zero signal.** Zero signal = no indexing reward = most likely to return "no indexers found":

```
aave-v3-harmony        abracadabra-fantom      bastion-protocol-aurora   burrow-near
cream-finance-polygon  dforce-optimism         dforce-polygon            iron-bank-fantom
moonwell-moonbeam      moonwell-moonriver      qidao-base                qidao-harmony
qidao-moonriver        radiant-capital-v2-bsc  zerolend-xlayer           zerolend-zksync-era
```

✅ **All non-Ethereum. Every Ethereum lending deployment has nonzero signal.**

### §1b — Ethereum lending deployments, from deployed artifacts

| deployment | claims | deployed hdr | match | nSignal (GRT) | spec | api | prune | startBlock |
|---|---|---|---|---|---|---|---|---|
| aave-v2-ethereum | 3.1.0 | 3.1.0 | ✅ | **42,737.5** | 1.0.0 | 0.0.7 | auto | 11362562 |
| compound-v2-ethereum | 2.0.1 | 2.0.1 | ✅ | **40,760.3** | 1.0.0 | 0.0.6 | auto | 7710671 |
| compound-v3-ethereum | 3.1.0 | 3.1.0 | ✅ | **31,081.3** | 1.0.0 | 0.0.7 | auto | 15331590 |
| morpho-aave-v2-ethereum | 3.0.1 | — | — | **9,900.0** | 1.0.0 | 0.0.7 | auto | 15383036 |
| euler-finance-ethereum | 1.3.0 | 1.3.0 | ✅ | 1,090.5 | 0.0.4 | 0.0.7 | **none** | 13711759 |
| abracadabra-ethereum | 2.0.1 | — | — | 990.0 | 0.0.4 | 0.0.6 | **none** | 12094175 |
| aave-v3-ethereum | 3.1.0 | 3.1.0 | ✅ | 990.0 | 1.0.0 | 0.0.7 | auto | 16291071 |
| aave-arc / aave-amm / aave-rwa | 3.1.0 | — | — | 990.0 ea | 1.0.0 | 0.0.7 | auto | — |
| cream / dforce / iron-bank / rari-fuse | 2.0.1 | — | — | 990.0 ea | 1.0.0 | 0.0.6 | auto | — |
| makerdao-ethereum | 2.0.1 | — | — | 990.0 | 1.0.0 | 0.0.7 | auto | 5834580 |
| uwu-lend-ethereum | 3.1.0 | — | — | 990.0 | 1.0.0 | 0.0.7 | auto | 15568868 |
| goldfinch / inverse / truefi / notional | — | — | — | 990.0 ea | 0.0.4 | — | **none** | — |
| maple-v1 / maple-v2 / qidao-ethereum | — | — | — | 990.0 ea | 0.0.4 | 0.0.6 | **none** | — |
| morpho-aave-v3-ethereum | 3.0.1 | 3.0.1 | ✅ | 99.8 | 1.0.0 | 0.0.7 | auto | 17161283 |
| zerolend-ethereum | 3.1.0 | — | — | **1.0** | 1.0.0 | 0.0.7 | auto | 19356906 |
| morpho-compound-ethereum | 3.0.1 | — | — | **1.0** | 1.0.0 | 0.0.7 | auto | 14860866 |
| **spark-lend-ethereum** | 3.1.0 | 3.1.0 | ✅ | ⚠️ **1.0** | 1.0.0 | 0.0.7 | auto | 16776389 |

TVL/borrow: unverified.

### §1c — versions confirmed, one recommendation refuted

✅ **Every deployed schema version header matches `deployment.json` exactly** — all 7 checked. No drift.

```
sha256(deployed schema)              bytes
18064e6a29f762f26b9c82510457f6ca     65466   aave-v3-ethereum   ┐
18064e6a29f762f26b9c82510457f6ca     65466   aave-v2-ethereum   ├─ BYTE-IDENTICAL
18064e6a29f762f26b9c82510457f6ca     65466   spark-lend-ethereum┘
b03d691df69edb84f9cad2582cf925e6     63874   compound-v3-ethereum
4a8c1a750342c10e41d7619a08744fb2     40691   compound-v2-ethereum
```

**compound-v3 vs aave-v3, full diff:** only `_DefaultOracle` and `_FlashLoanPremium` types, and 6
`_`-prefixed Market fields. **The public surface is identical.** A very strong Graph-track claim — and
now a hash you can put in the submission.

### §1d — RESOLVED: `AwoxEZ…` serves Ethereum mainnet

- Deployed manifest `QmNrQoow7pjM3biRnnhzeCaDYhuEbDyjKCpFeNv2oGXnuK`: `network: mainnet` (×2
  datasources), Configurator `0x316f9708bB98af7dA9c68C1C3b5e79039cD336E3`, `startBlock: 15331590`.
- On-chain: that address has **3,476 bytes of code on Ethereum and 0 bytes on Base.**

**The `compound-v3-base` row in `deployment.json` is wrong.** No Base Compound v3 deployment is
reachable. Delete that row.

### §1e — the pleasant surprise: eight Ethereum deployments don't prune at all

`specVersion: 0.0.4`, predating `indexerHints`: **euler-finance, abracadabra, notional-finance,
goldfinch, inverse-finance, truefi, maple-finance-v1, maple-finance-v2, qidao-ethereum.**

**Full history retained — time-travel works.** None is 3.1.0, so not drop-in for a uniform set, but
**`maple-finance-v2-ethereum` (3.0.1, 990 GRT, no prune)** is the one if a genuine historical
time-travel demo is ever needed.

---

## 2. Pruning — exact, from source

### §2a — `prune: auto` = 500 blocks

```rust
// graph/src/data/subgraph/mod.rs:700-706
Prune::Never     => BLOCK_NUMBER_MAX,
Prune::Auto      => ENV_VARS.min_history_blocks,
Prune::Blocks(x) => *x,
// graph/src/env/mod.rs:370-372
min_history_blocks: inner.min_history_blocks.unwrap_or(2 * inner.reorg_threshold)
// graph/src/env/mod.rs:578
#[envconfig(from = "ETHEREUM_REORG_THRESHOLD", default = "250")]
```

**500 blocks ≈ 100 minutes on Ethereum.** Indexers can override `GRAPH_MIN_HISTORY_BLOCKS`, so the real
floor may be higher — that's what `DEEP=1` measures. **500 is the floor of floors.**

### §2b — the exact error strings

Verbatim from `graph/src/data/subgraph/mod.rs:1361-1377`:

```rust
if block > self.latest_block.number {
    "subgraph {} has only indexed up to block number {} \
        and data for block number {} is therefore not yet available"
}
if block < self.earliest_block_number {
    "subgraph {} only has data starting at block number {} \
        and data for block number {} is therefore not available"
}
```

Both wrapped as `QueryExecutionError::ValueParseError("block.number", msg)`
(`graphql/src/store/resolver.rs:88-95`), surfacing in `errors[0].message`.

```ts
const m = err.message;
if (m.includes("only has data starting at block number"))  // → PRUNED  (fall back to snapshots)
if (m.includes("has only indexed up to block number"))     // → LAGGING (retry / wait)
```

⚠️ Both contain "only" and "block number" — **match on the full distinguishing phrase**, not a
substring like `"only has"`.

### §2c — it's a rolling window, and it sawtooths

`store/postgres/src/deployment_store.rs:1216-1219` — pruning fires when
`head > earliest_block + history_blocks × history_slack_factor`, with
`GRAPH_STORE_HISTORY_SLACK_FACTOR` default **1.2**.

So with 500: prune triggers at `earliest+600`, then resets earliest to `head−500`. **The retained
window oscillates between 500 and 600 blocks (100–120 min).**

### §2d — 🔴 the load-bearing test, still unrun — but the pruning SQL was read

`store/postgres/src/relational/prune.rs:106-114`, the "copy final" phase:

```sql
insert into {dst}({cols}) select {cols} from {src}
 where lower(block_range) <= $2                                  -- final_block
   and coalesce(upper(block_range), 2147483647) > $1              -- earliest_block
   and coalesce(upper(block_range), 2147483647) <= $2
   and block_range && int4range($1, $2, '[]')
```

A row never superseded has `upper(block_range) = NULL` → `coalesce(...) = 2147483647`, which **fails
`<= final_block`**, so it isn't copied here — it's copied by `copy_nonfinal_entities` ("all entity
versions visible after final_block"), which an open-ended range always is.

**Open-ended rows are retained regardless of how old their lower bound is. What gets deleted is
exclusively closed ranges whose `upper <= earliest_block` — superseded versions of mutated entities.**

A `FinancialsDailySnapshot` for day D is written during day D and never touched again → open range →
**retained forever.** ✅ **The settlement redesign is sound at the storage-engine level.**
⚠️ **Still run the test the hour you get a key. One query, load-bearing.**

### ✅ Immutable entities — the finding that changes the design

```
aave-v3-ethereum (3.1.0)
  IMMUTABLE (8): Borrow, Deposit, Flashloan, Liquidate, PositionSnapshot,
                 Repay, Transfer, Withdraw
  MUTABLE  (15): Account, Fee, FinancialsDailySnapshot, InterestRate,
                 LendingProtocol, Market, MarketDailySnapshot, MarketHourlySnapshot,
                 Oracle, Position, RevenueDetail, RewardToken, Token, Usage*

compound-v2-ethereum (2.0.1)
  IMMUTABLE (5): Borrow, Deposit, Liquidate, Repay, Withdraw
                 ← PositionSnapshot is MUTABLE here; Flashloan/Transfer don't exist
```

**`@entity(immutable: true)` rows are never superseded, so pruning cannot touch the entire event
history.** Every deposit, borrow, repay, withdraw and liquidation since `startBlock` is permanently
queryable with `where: { blockNumber_gte, blockNumber_lt }`.

> **That is a better settlement primitive than either time-travel or daily snapshots — it's
> block-exact AND immune to pruning.**

---

## 3. Cross-protocol query — not run

**§3a–c unverified.** What the schema hashes support: the document **will** run unmodified against
aave-v3, aave-v2, spark (byte-identical) and compound-v3 (identical public surface). Against
compound-v2 (2.0.1) the stable-core document should validate — it was built from the 5-version field
intersection — **predictable failure is any query using `PositionSide.COLLATERAL` (2.0.1 has `LENDER`)
or filtering snapshots by `id`.** Neither is in the document.

### §3d — external reference, MEASURED (DefiLlama, 2026-09-05)

| protocol | DefiLlama Ethereum TVL | DefiLlama total |
|---|---|---|
| aave-v3 | $14,636,332,911.92 | $17,364,743,850.53 |
| sparklend | $4,504,516,433.81 | $4,504,832,501.13 |
| compound-v3 | $1,294,408,941.57 | $1,408,684,243.23 |
| compound-v2 | $104,832,819.21 | $104,832,819.21 |
| aave-v2 | $84,942,960.99 | $110,746,239.98 |
| morpho-blue | $4,353,281,698.71 | $9,706,089,303.32 |

**The gross-vs-net gap is now quantified**, measured on-chain at block 25,909,105 for aEthUSDC:

```
aToken.totalSupply()       2,301,699,922.48 USDC   ← Messari totalDepositBalanceUSD basis (GROSS)
variableDebt.totalSupply() 2,151,377,469.77 USDC
stableDebt.totalSupply()               0.00 USDC   ← stable rate deprecated
utilization                           93.47 %
```

⚠️ **At 93.47% utilization, gross-supplied is ~15.3× net for this reserve.** So Messari TVL exceeds
DefiLlama's net figure by **a large, utilization-dependent multiple — not a constant.**

> **Do not apply a fixed haircut.** Compute `net = totalDepositBalanceUSD − totalBorrowBalanceUSD` per
> market and compare *that* to DefiLlama.

---

## 4. The eleven invariants — not run

**§4a–c unverified.** One thing now measured rather than inferred: **`stableDebt.totalSupply() == 0` on
aEthUSDC. Aave deprecated stable-rate borrowing.** So `market.stableBorrowedTokenBalance` will be 0 or
null across Aave v3 markets, **and any invariant assuming both debt legs are populated will misfire.**
Add that to the L0 set as a known-zero, not a failure.

---

## 5. The L3 check — on-chain half MEASURED and working

At block 25,909,105, aEthUSDC (`0x98c23e9d8f34fefb1b7bd6a91b7ff122f4e16f5c`):

```
aToken.totalSupply()        2,301,699,922.481413 USDC  ← compare to market.inputTokenBalance
aToken.scaledTotalSupply()  1,943,245,406.235272       ← the revenue-calc input
variableDebt.totalSupply()  2,151,377,469.768139 USDC  ← market.variableBorrowedTokenBalance
stableDebt.totalSupply()                0.000000 USDC
```

Reserve metadata from `Pool.getReserveData(USDC)` on `0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2`:
`liquidityIndex = 1.1845e27`, `lastUpdateTimestamp = 1788586871`, `accruedToTreasury = 124,266.725672
USDC`, **`unbacked = 0`**, `isolationModeTotalDebt = 0`.

💡 **`unbacked` is Aave's own bad-debt-adjacent counter, available on-chain and absent from the Messari
schema entirely.** If we want a genuine deficit signal, **read it from the Pool directly.**

### §5b — drift is dominated by user flow, not interest

`aToken.totalSupply()` at increasing offsets from head:

| offset | Δ vs head (USDC) | bps |
|---|---|---|
| 1 | −31.50 | −0.0001 |
| 5 | +1,717.51 | 0.0075 |
| 25 | +837.25 | 0.0036 |
| 50 | +59.52 | 0.0003 |
| 100 | +38,386.19 | 0.1668 |
| 300 | +426,516.71 | 1.8531 |

⚠️ **Non-monotonic — so the drift is NOT interest accrual** (which is strictly increasing). **It's
dominated by user deposits and withdrawals.** Interest is the floor; user flow is the noise, and it's
much larger.

> **Consequence: there is no correction factor. Block alignment is not optional.**

### §5c — the aToken address, and why L3 isn't uniform

`Market.id` for aave-forks **is** the aToken address — `_handleReserveInitialized` constructs
`new DataManager(outputToken, underlyingToken, …)`. So `Market.id == Market.outputToken.id == aToken`.
Use `outputToken.id`, it's the documented one.

**But across the five:**
- **aave-v3 / aave-v2 / spark:** `inputTokenBalance = aToken.totalSupply()`. Direct comparison ✅
- ⚠️ **compound-v2 (2.0.1):** `inputTokenBalance` is **derived, not called** — `outputTokenSupply ×
  exchangeRate`, decimal-shifted (`compound-forks/src/mapping.ts:1809-1815`). Comparing to
  `cToken.totalSupply()` compares underlying to cTokens and **will be off by ~50×.** Must compare
  against `cToken.totalSupply() × cToken.exchangeRateStored()`.
- **compound-v3:** Comet **is** the market; `tryTotalSupply` is on the Comet contract, not a separate
  receipt token.

### §5d — pin `eth_call` to `_meta.block.number`, always

From the drift table, a **300-block (~1 hr) misalignment injects 1.85 bps of pure artifact.** If the
subgraph lags an hour and you compare at chain head, **every market will "fail" L3 by ~2 bps.** Pinned
correctly, both sides read identical state and **any nonzero difference is a real finding.**

**§5e — 42 lines for the aave family** (37 non-blank), plus **~30 lines per additional family adapter.**
**Budget half a day, not an hour.**

---

## 6. Agent introspection

### §6a — SDL sizes MEASURED

| deployment | full SDL | −`_*` | −`_*` −descriptions |
|---|---|---|---|
| aave-v3 | 65,466 B ≈ 16.4k tok | 63,330 B ≈ 15.8k | 23,313 B ≈ 5.8k |
| compound-v3 | 63,874 B ≈ 16.0k | 62,978 B ≈ 15.7k | 23,149 B ≈ 5.8k |
| compound-v2 | 40,691 B ≈ 10.2k | 37,914 B ≈ 9.5k | 15,551 B ≈ 3.9k |
| morpho-aave-v3 | 69,794 B ≈ 17.4k | 62,786 B ≈ 15.7k | 23,445 B ≈ 5.9k |

aave-v3: **29 types (6 internal), 593 fields (only 14 internal), 14 enums, 2 interfaces.**

⚠️ **Correction: stripping `_*` saves aave-v3 barely 3%.** It saves Morpho 10%. **Descriptions are 64%
of the payload — and they're the useful part.**

### §6b — ✅ descriptions ARE in the deployed schema

**624 description strings against 593 fields** (105%; types and enums carry them too). Verbatim from
the deployed aave-v3 artifact:

```graphql
type Market @entity @regularPolling {
  " Smart contract address of the market "
  id: Bytes!
  " Maximum loan-to-value ratio as a percentage value (e.g. 75% for DAI in Aave) "
  maximumLTV: BigDecimal!
```

**They are not stripped at deploy time — measured.** Whether graph-node's generated API schema surfaces
them in `__schema { types { fields { description } } }` is unverified, though graph-node preserves them
by design.

**§6c — enum drift confirmed at the artifact level:** deployed aave-v3 has `PositionSide { COLLATERAL,
BORROWER }`; deployed compound-v2 has `PositionSide { LENDER, BORROWER }`. The exact error text is
unverified.

### §6d — ✅ the curated view fits comfortably

6 entities an analyst agent needs (`LendingProtocol`, `Market`, `FinancialsDailySnapshot`,
`MarketDailySnapshot`, `Token`, `InterestRate`) plus all 14 enums, `_*` stripped, **descriptions kept**:

**30,658 bytes ≈ 7,664 tokens.** A comfortable system-prompt payload.

> **Keep the descriptions.** Dropping them halves the size but removes the entire reason the schema
> introspects well. **The real lever is entity subsetting, not `_*` stripping.**

---

## 7. Rate limits and cost

**§7a — CONFIRMED:** 100,000 free queries/month, "with full access to the Subgraph Studio testing
environment." Beyond that, the Growth Plan bills in GRT (Arbitrum) or credit card via Stripe. **The
docs publish no per-query price and document no rate limits.** Monthly invoicing with email warnings.

**§7b — computed.** Per report: 1 introspection (cache → ~0 amortised) + 5 balance-sheet queries + 5
snapshot-history queries ≈ **10–11 gateway queries.** L3 adds `eth_call`s, which are RPC, not Graph.
**100k/month ÷ 11 ≈ ~9,000 reports/month inside the free tier. Cost is not a constraint.**

**§7c — partially measured.** Network path to the gateway, 3 samples: DNS 24–34 ms, TCP 52–77 ms, TLS
93–112 ms, **total 193–198 ms** — the unauthenticated reject path; real execution adds indexer time.

> **Budget 200 ms of pure network overhead per query. 11 sequential queries = 2.2 s before any work.
> Fan out with `Promise.all` across the five, not a loop.**

**§7d — unverified but no reason it wouldn't work.** Bearer token on an HTTPS POST. `GRAPH_API_KEY` in
Vercel env, call from a route handler, **never `NEXT_PUBLIC_`.** ⚠️ **One caveat: the gateway supports
API-key domain allowlisting — if enabled in Studio, add Vercel production AND preview domains or
previews will 401.**

---

## 8. Work around, or extend? — Both, in order

### §8a — three settlement primitives, not two

| primitive | granularity | survives prune | good for |
|---|---|---|---|
| `block: { number: N }` | exact block | ❌ 500–600 blocks | nothing you can rely on |
| `financialsDailySnapshots` | 1 day | ✅ (open range) | "Q3 close" — fine |
| **immutable events** (Deposit, Borrow, Repay, Liquidate, …) | **exact block + logIndex** | ✅ **guaranteed** | **block-exact settlement** |

For "Q3 close", a daily snapshot is genuinely fine — you lose intraday, which nobody disputes for a
quarterly figure. **For anything needing block precision, filter immutable events on
`blockNumber_gte`/`blockNumber_lt` and aggregate. Exact, permanent, no redesign.**

⚠️ **What you do lose:** point-in-time *balances* (`Market.totalBorrowBalanceUSD` as of block N) are only
available at head or from a daily snapshot. If a market must resolve on "borrow balance at block N",
capture it at the time or accept the day boundary.

### §8b — full re-sync from genesis is not viable in 9 days

Blocks to index from each deployed `startBlock` (measured):

```
aave-v3      9,618,034 blocks   (~1,336 days of chain)
compound-v3 10,577,515
spark-lend   9,132,716
aave-v2     14,546,543
compound-v2 18,198,434
```

Messari's aave-forks mapping does **several `eth_call`s per event** (`balanceOf`, `totalSupply`,
`scaledTotalSupply`) **plus an O(markets) loop over `_MarketList` on every `ReserveDataUpdated`.**
A heavy subgraph over a high-event-density protocol.

**No measured sync rate** — but 9.6M blocks of Aave v3 with that call pattern is realistically **days to
weeks**, which doesn't fit 9 days with confidence.

💰 **Cost is not the obstacle:** GRT is $0.017204 (measured), so the recommended 3,000 GRT of
self-curation ≈ **$51.61.** The obstacle is wall-clock sync time.

💡 **Cheap way to get the real number:** deploy to Studio with `startBlock` 7 days back, watch the
indexing rate for one hour, extrapolate. **Two hours of work, converts a gamble into a decision.**

### ✅ §8c — the middle path, and this is the answer

Fork the Messari `aave-forks` subgraph, change **two things**:

```yaml
indexerHints:
  prune: never          # full history retention
dataSources:
  - source:
      startBlock: 25650000   # ~30 days back, not 16291071
```

**30 days ≈ 216,000 blocks instead of 9.6M — a 44× reduction. Hours, not weeks.** You get unlimited
time-travel over a rolling recent window, **which is exactly what a prediction market settling on
recent events needs.** Trim entities/handlers to just what you query to cut it further.

### §8d — it strengthens the submission materially

**"Authoring or extending a Standardized Subgraph" is explicitly listed as qualifying.** Right now the
Graph-track claim is "I queried five endpoints." Extending it to **"I query five standardized
deployments and publish my own extension of the standard schema with retained history"** is a much
stronger composition story — and it demonstrates understanding the standard well enough to modify it.
**It also gives a second Graph product to compose**, which is the other route to the $5k.

### §8e — straight recommendation: do both, in this order

1. **Day 1–2: Ship on the existing deployments.** Settlement on **immutable event entities**
   (block-exact, prune-proof) with daily snapshots as the fallback for balance-type metrics. **This
   alone removes the pruning problem** — no redesign, no own-subgraph dependency.
2. **Day 3, timeboxed to 4 hours:** Fork `aave-forks` with `prune: never` and a 30-day `startBlock`.
   Deploy to Studio, self-curate ~3,000 GRT (~$52). If it syncs, you get unlimited time-travel **and**
   the "extended a standardized subgraph" claim.
3. **If it doesn't sync by day 5, drop it.** You still have a complete product from step 1.

> **Step 1 is not a consolation prize — given §2d, it's the technically better settlement design
> regardless.**

---

## Revised protocol list

| | keep? | why |
|---|---|---|
| aave-v3-ethereum | ✅ | 3.1.0 verified deployed, 990 GRT |
| aave-v2-ethereum | ✅ | byte-identical schema to aave-v3, **42,738 GRT — best-signalled** |
| compound-v3-ethereum | ✅ | 3.1.0 verified, 31,081 GRT, identical public surface, Ethereum confirmed |
| compound-v2-ethereum | ✅ | 2.0.1 verified, 40,760 GRT — the version-drift demo, well-signalled |
| **spark-lend-ethereum** | ⚠️ **swap** | **1.0 GRT vs the 3,000 GRT the docs recommend** |

**Replace Spark with `morpho-aave-v2-ethereum`** (3.0.1, **9,900 GRT** — 4th-best-signalled Ethereum
lending deployment). You lose byte-identical-schema purity but gain **a third schema version in the
adapter demo (2.0.1 / 3.0.1 / 3.1.0)**, which makes the standardization argument stronger, plus the
Morpho name. **Keep Spark as a 6th if it probes healthy** — the byte-identical hash is a nice slide.

---

## The three things to do the hour you get a key

```bash
export GRAPH_API_KEY=...

# 1. liveness + lag across all 95            (§1a,b,c)
node scratchpad/probe-lending.mjs deployment/deployment.json > status.json

# 2. the actual pruned floor per deployment  (§2a,c)
DEEP=1 node scratchpad/probe-lending.mjs deployment/deployment.json > deep.json

# 3. THE load-bearing test                   (§2d) — 12 months back
curl -s -X POST -H "authorization: Bearer $GRAPH_API_KEY" -H 'content-type: application/json' \
  -d '{"query":"{financialsDailySnapshots(first:3,orderBy:timestamp,orderDirection:asc,where:{timestamp_gte:1756944000}){timestamp blockNumber totalDepositBalanceUSD cumulativeTotalRevenueUSD}}"}' \
  https://gateway.thegraph.com/api/subgraphs/id/JCNWRypm7FYwV8fx5HhzZPSFaMxgkPuw4TnR3Gpi81zk
```

**If #3 returns rows, the settlement design is confirmed and pruning stops being a concern.**

---

## Questions closed

| Question | Answer |
|---|---|
| How tight is `prune: auto`? | **500 blocks ≈ 100 min**, sawtoothing to 600. Far tighter than assumed |
| Do all deployments prune? | **No** — 8 Ethereum lending deployments (specVersion 0.0.4) have full history |
| Do snapshots survive pruning? | **Yes** at the SQL level — open-ended block ranges are always retained. Empirically unverified |
| Is there a better settlement primitive? | **Yes — immutable event entities.** Block-exact AND prune-proof. 8 of them on 3.1.0 |
| Which chain does `AwoxEZ…` serve? | **Ethereum.** Verified via deployed manifest and on-chain bytecode |
| Do schema versions match what's deployed? | **Yes, all 7 checked.** And aave-v2/v3/spark are byte-identical |
| Are the field descriptions deployed? | **Yes** — 624 description strings in the deployed artifact |
| Is Spark a good pick? | **No** — 1.0 GRT signal vs 3,000 recommended. Swap for morpho-aave-v2 (9,900 GRT) |
| Does the L3 check work uniformly? | **No** — compound-v2 derives `inputTokenBalance`, needs its own adapter |
| Can we fork and re-sync in 9 days? | **Not from genesis** (9.6M blocks). **Yes from ~30 days back** (216k blocks) |
| What does the free tier cover? | 100k queries/month ≈ **~9,000 reports.** Not a constraint |

## Still open

- **All live-query results** — liveness, lag, real numbers, invariants, introspection payload
- **The 12-month snapshot test** — load-bearing, one query
- **Actual pruned floor** per deployment (indexers may override the 500 default)
- **Sync rate for a forked subgraph** — the number that decides §8b/c. Two hours to measure
- Whether graph-node surfaces descriptions in the introspection response specifically

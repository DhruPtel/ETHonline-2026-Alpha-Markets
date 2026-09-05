# Research: pinax-network/substreams-evm

**Repo:** https://github.com/pinax-network/substreams-evm
**Reviewed at:** commit `970a665e15619de8ad7f686bd89412a1030d46dc` — 2026-07-09, "feat(evm-transfers):
surface ERC-3009 (x402) authorization events as db_out tables (#260)". Verified against the GitHub API
as current `origin/main` HEAD.
**Reviewed:** Sept 4, 2026

> ⚠️ **No runtime verification.** No cargo, no rustc, no substreams CLI, no API token. Network was up
> (github.com, substreams.dev, crates.io reachable). **Could not build, pack, run, sync, or compare a
> module hash.** Every claim about build output, sync rate, hash matching, or endpoint behavior is
> static analysis and marked unverified. **Everything about file contents, manifests, and grep results
> is directly verified.**

---

## 0. The two questions — both YES. This is not the other repo.

### a. Composability is real and it's the organizing principle

**26 of 52 manifests declare `imports:`.** Cross-package `- map: pkg:module` inputs are everywhere.

`erc20/balances/substreams.yaml` — map fan-in across two packages:

```yaml
imports:
  erc20_transfers: ../../spkg/erc20-transfers-v0.3.3.spkg
  erc20_tokens: ../../spkg/erc20-tokens-v0.3.3.spkg
modules:
  - name: map_balance_changes
    kind: map
    inputs:
      - map: erc20_transfers:map_events
      - map: erc20_tokens:map_events
```

`dex-swaps/substreams.yaml:28` — **cross-package store consumption**, not just map fan-in:

```yaml
inputs:
  - source: sf.ethereum.type.v2.Block
  - store: dex_swaps_pools:store_pools
    mode: get
```

`dex-swaps-pools-foundational-store/substreams.yaml` — **11 protocol packages** fanned into one module
outputting `sf.substreams.foundational_store.model.v2.SinkEntries`, against descriptor set
`buf.build/streamingfast/substreams-foundational-store@f3ab5976…`. Explicitly targets StreamingFast's
foundational-store model.

**Which layer is this?** Neither of our two options — **three tiers in one repo**:
- **foundational/composable:** `native/`, `contracts/`, `erc20/`, `erc4626/`, `erc1155/`, `blocks/`
- **protocol leaves:** `dex/*` (14 protocols), `dex-nfts/seaport`
- **normalizers + sink aggregators:** `dex-swaps` (cross-protocol schema), `evm-*` (db_out)

It occupies `ethereum-common`'s layer *and* the chain-modules layer, and wires them together. **That's
the structural difference.**

⚠️ **Two caveats for a prize claim:**
1. **Imports resolve to vendored local `../spkg/*.spkg` files, not registry coordinates.** 113 `.spkg`
   binaries (~250 MB) committed to `spkg/`. Composability is real but **hand-wired, not
   dependency-resolved.**
2. **The one cross-org import is dead.** `erc1155/substreams.yaml:10` pulls
   `ethereum-common-v0.3.3.spkg` from `streamingfast/substreams-foundational-modules` — declared and
   **never used.** `erc1155`'s only module takes `source: sf.ethereum.type.v2.Block` and nothing else.
   **Don't cite it as cross-repo composition;** cite `erc20/balances` or `dex-swaps`.

### b. Four classes of data a subgraph can't reach

| Capability | Evidence |
|---|---|
| **eth_call at index time (batched)** | `erc20/balances/src/calls.rs:16-18` — `RpcBatch` + `erc20::functions::BalanceOf`, chunked via `params: map_events: 100`. `erc20/supply/src/calls.rs:13-15` — batched `TotalSupply()` |
| **Native balance RPC** | `native/balances/src/calls.rs:6-7` — `RpcGetBalanceRequests`, `eth_get_balance` |
| **Balance deltas with reasons** | `native/transfers/src/lib.rs:19-60` — iterates `block.balance_changes`, discriminating `Reason::RewardMineBlock`, `Reason::Withdrawal` (post-Shanghai validator withdrawals), `Reason::GenesisBalance`, `Reason::DaoRefundContract/DaoAdjustBalance`, `Reason::SuicideRefund` (`:98`) |
| **Deployed bytecode + factory attribution** | `contracts/src/lib.rs:19-40` — iterates `call.code_changes`, emits `new_code`, `new_hash`, derives deployer/factory |
| **Internal-call attribution on logs** | `erc4626/src/lib.rs:19-24`, `x402/src/lib.rs:55-59` — `trx.logs_with_calls()` with a `trx.calls.is_empty()` fallback for BASE-detail chains. **A router- or aggregator-mediated 4626 deposit carries caller, depth, call_type** |
| **Failed/reverted tx status** | `native/transfers/src/utils.rs:5-6`, `native/balances/src/utils.rs:5` — explicit `TransactionTraceStatus::Reverted \| Failed` checks. They filter them out, but the status is in hand |

**Not present:** `storage_changes` — zero hits repo-wide. No arbitrary storage-slot reads.

For a reconciliation engine, the sharpest tools are **batched eth_call at index time** (an independent
oracle against event-derived state) and **internal-call attribution** (distinguishes a direct vault
deposit from one routed through an aggregator). Both genuinely unavailable to Messari subgraphs.

---

## 1. What this is

**Pinax is an independent blockchain-infrastructure company and a Graph Network indexer/operator.**
Not StreamingFast, not The Graph Foundation — a third party operating its own Firehose and Substreams
endpoints (`eth.substreams.pinax.network:443`, plus `base.`, `arbone.`, `bsc.`) and one of the largest
Substreams data providers. **This repo is their EVM package catalog** — the modules they run in
production to populate their own ClickHouse-backed products.

**Intent:** source-of-record for published `.spkg`, *and* a library, *and* a template. `spkg/` (113
binaries) is the artifact store; the `evm-*` aggregators are ready-to-run sink pipelines.

**Published where:** GitHub Releases (`scripts/block-ranges.txt` cites
`github.com/pinax-network/substreams-evm/releases/download/clickhouse-evm-dex-v0.2.6/…`) plus the
in-tree `spkg/`. **substreams.dev publication: unverified** — the registry is a Next.js SPA with no
reachable public JSON API. Not on crates.io as packages — only their shared ABI crate
`substreams-abis` is (v1.6.0, 14,575 downloads).

**Maintenance:** Apache-2.0. Created 2025-11-18. **532 commits.** 6 stars, 4 forks, 8 open issues.
⚠️ **Last commit 2026-07-09 — ~2 months stale.** Cadence bursty and decelerating: 71 commits in
2026-03, 1 in April, **0 in May**, 2 in June, 3 in July.

**CI:** `.github/workflows/ci.yml` — `cargo test --workspace --lib` + `cargo check --target
wasm32-unknown-unknown`, Rust 1.88. Real but thin: **29 `#[test]` functions across 8 files.** No
integration tests against a live endpoint, **no packaging/publishing CI** — `.spkg` files are built by
hand.

⚠️ Worth noting: `.github/skills/` contains **8 Claude Code skill documents** (substreams-dev,
substreams-sql, substreams-sink, substreams-testing, substreams-pack, release-conventions). Remote
branches are named `codex/*` and `copilot/*`. **This repo is substantially agent-authored** — which
cuts both ways: the docs are unusually good, and the drift in §7 is the kind agents produce.

---

## 2. Read these first

| # | Path | Why | Time |
|---|---|---|---|
| 1 | `erc4626/README.md` | **The prize's named standard, documented by the maintainer** — fee spread, virtual offset, topic0-only matching risk. Names Morpho/MetaMorpho, Yearn v3, Euler v2, Aave stata-aTokens. **Contains our contribution's spec, written as open to-dos** | 3 min |
| 2 | `evm-transfers/substreams.yaml` | Composability proof in 40 lines: one `db_out` fanning in 4 packages incl. erc4626. **The manifest to show a judge** | 2 min |
| 3 | `erc20/balances/substreams.yaml` + `src/calls.rs` | Cross-package composition and index-time eth_call in one package. `calls.rs` is 37 lines of the most readable Rust here | 5 min |
| 4 | `proto/v1/erc4626.proto` | The schema we'd extend. Proto3 reads close to GraphQL SDL | 3 min |
| 5 | `dex-swaps-pools-foundational-store/substreams.yaml` | 11 imports → StreamingFast's `SinkEntries`. Strongest "composable Graph product" artifact here | 3 min |

**The heart is #1 + #2 read together** — the standard and the composition, which is exactly the
two-part claim both prizes want.

---

## 3. Structure and coverage

```
erc4626/       ERC-4626 vault Deposit/Withdraw, topic0-matched, no address list  ★
x402/          EIP-3009 + Permit2 payment settlement extraction                  ★
evm-x402/      x402 → db_out (ClickHouse tables)
erc20/         transfers/ tokens/ balances/(eth_call) supply/(eth_call)
erc721/        tokens/ transfers/
erc1155/       TransferSingle/Batch, ApprovalForAll, URI
native/        transfers/ (rewards, withdrawals, genesis, DAO, selfdestruct) balances/(RPC)
contracts/     Contract deploys via call.code_changes — bytecode + factory attribution
blocks/        Block metadata → ClickHouse
dex/           14 protocol leaves: uniswap v1-v4, curve, balancer, bancor, cow,
               dodo, kyber-elastic, aerodrome, traderjoe, woofi, sunpump
dex-nfts/      seaport
dex-swaps/     NORMALIZED cross-protocol swap schema (14-protocol enum, one Swap msg)
dex-swaps-pools/                     store_pools (set_if_not_exists) — the only store kind
dex-swaps-pools-foundational-store/  11 imports → sf.substreams.foundational_store SinkEntries
evm-{dex,transfers,balances,supply,nfts,contracts}/  sink aggregators + clickhouse/ + postgres/
proto/ common/ spkg/ scripts/ docs/
```

**Module kinds: 40 map, 1 store** (`dex-swaps-pools:store_pools`). Overwhelmingly stateless — **the
single most important cost fact in this review** (§6b).

**Chains:** `network:` declares mainnet ×46, tron ×3, base ×1 — **but that's just a default.** README
claims Ethereum, Base, BSC, Polygon, ArbitrumOne, Optimism, Avalanche, Tron EVM. Modules are
chain-agnostic; Makefiles parameterize `ENDPOINT`.

### 🔴 DeFi lending: not present

**The finding that decides §4.** Grepping
`aave|morpho|compound|spark|euler|venus|radiant|lending|borrow|liquidat|collateral|cToken|aToken`
across the whole repo returns **exactly 3 files, none of them a module**:
- `.github/skills/substreams-dev/SKILL.md` — the Rust keyword "borrow"
- `erc20/tokens/contracts/eth/usdt.sol` — vendored Solidity
- `erc4626/README.md` — prose naming Morpho/Euler as example vaults

**`messari` → zero hits.** No lending protocol, no lending entity, no lending table anywhere.

**ERC-4626: yes** — `erc4626/` package plus `erc4626_deposit`/`erc4626_withdraw` ClickHouse tables
(`evm-transfers/clickhouse/schema.1.table.erc4626.sql`). **ERC-20 flows: yes, extensively.**

### Relationship to the other two repos

- **vs `substreams-foundational-modules`:** complementary, aspirationally downstream.
  `dex-swaps-pools-foundational-store` emits StreamingFast's `SinkEntries` model against their buf
  descriptor set. **But the one actual `ethereum-common` import is unused**, so today the relationship
  is convention, not dependency.
- **vs `streamingfast/substreams-chain-modules`:** different domain, and a **strictly better
  implementation of the overlap.** Chain-modules is 45 machine-converted Messari subgraphs
  (lending/DEX, event-level, flat leaves, zero composition, events-only). This is hand-written
  tokens/DEX/NFT/x402/4626 with three-tier composition, cross-package stores, and RPC + balance-delta
  + code-change access. **They barely overlap on content — chain-modules has the lending we want and
  this doesn't; this has the 4626 and composability that one doesn't. Neither alone gives us our
  product.**

---

## 4. Better than a Messari subgraph for our case?

**Data a Messari subgraph can't give us — yes, but not the data we need.** Index-time eth_call, balance
deltas with `Reason` discrimination, deployed bytecode with factory attribution, internal-call
attribution, reverted-tx visibility. All genuinely beyond subgraph reach. **None of it is `Market`,
`Position`, `LendingProtocol`, `borrowBalance`, or `totalDepositBalanceUSD`.**

**Standardized cross-protocol schema — for DEX yes, for lending no.** `proto/v1/dex-swaps.proto` is a
real normalization: a 14-value `Protocol` enum and one `Swap` message spanning Uniswap v1–v4, Curve,
Balancer, Bancor, CoW, DODO, Kyber, Aerodrome, TraderJoe, WOOFi, SunPump. **Proof Pinax can and does
build standardized cross-protocol schemas. They just haven't built one for lending.**

### 🔴 Point-in-time queries — no better story, and arguably worse

- `blockFilter` / block index: **zero hits repo-wide**
- `initialBlock`: **zero declarations repo-wide**
- 11 `sink:` blocks are all `sf.substreams.sink.sql.v1.Service`, engine clickhouse or postgres, with
  **`postgraphile_frontend: enabled: false`** — they don't even turn on the auto-generated GraphQL
- `docker-compose.yml` is local Postgres 16 + pgweb

So: backfill into our own DB and `WHERE block_num <= N`. **Identical to the other repo.** And we'd be
giving up something real:

> **Messari subgraphs answer `block: { number: N }` in GraphQL directly. That is the mechanism our Arc
> prediction market settles on. Substreams has no equivalent primitive. Do not trade that away.**

**Straight verdict: worse for the core loop; better for one specific new thing.** For the analyst agent
— composing GraphQL against standardized lending schemas, at arbitrary historical blocks, live from a
hosted endpoint, on Vercel — **this repo is worse on every axis, because it has no lending data at
all.** The Messari + Subgraph MCP architecture is correct and should not change.

But `erc4626/` is a real asset for prize #1 that our current build doesn't have.

---

## 5. The ERC-4626 question

### a. A working, composed, published ERC-4626 package already exists

`erc4626/` (added 2026-07-09, PR #259, commit `1535a55`):
- `map_events`: `source: sf.ethereum.type.v2.Block` → `proto:erc4626.v1.Events`
- Decodes `Deposit(sender, owner, assets, shares)` and `Withdraw(sender, receiver, owner, assets,
  shares)` via `substreams_abis::standard::erc4626`
- **Matched by topic0 signature — every vault on the chain, no address list to maintain**
- Uses `trx.logs_with_calls()` so router-mediated deposits carry call metadata, with a BASE-detail
  fallback
- **Already composed:** `evm-transfers/substreams.yaml` imports `erc4626-v0.1.0.spkg` and fans
  `erc4626:map_events` into `db_out` alongside three other packages → `erc4626_deposit` /
  `erc4626_withdraw` tables

### b. Decisively the better base than `ethereum-common`

`ethereum-common` gives generic block/tx/log primitives; we'd write the 4626 decoder from zero. **Here
the decoder already exists, is packaged, and is already being composed** — we'd be *extending a live
composable product*, a much stronger prize narrative than adding a leaf.

**What's missing is exactly our contribution.** The module emits raw Deposit/Withdraw and nothing else:
no vault registry, no `asset()` resolution, no `totalAssets()`/`convertToAssets()`, no share-price
series, no per-vault net flows. **The maintainer says so explicitly** in `erc4626/README.md`:

> "The share price (assets / shares) is a downstream derivation (e.g. a ClickHouse view in an
> aggregator)"

> "Disambiguate downstream by requiring both signatures to co-occur on an address, or a one-shot
> `asset()` probe."

**That's a to-do list.** What we'd write — `erc4626-vaults`:

```yaml
specVersion: v0.1.0
package:
  name: erc4626_vaults
  version: v0.1.0

imports:
  erc4626: ../spkg/erc4626-v0.1.0.spkg
  erc20_tokens: ../spkg/erc20-tokens-v0.4.0.spkg

modules:
  # Vault registry: one-shot asset()/decimals() eth_call probe per new vault.
  # set_if_not_exists mirrors dex-swaps-pools:store_pools.
  - name: store_vaults
    kind: store
    updatePolicy: set_if_not_exists
    valueType: proto:erc4626.vaults.v1.Vault
    initialBlock: 18900000          # <-- MUST set; repo declares none anywhere
    inputs:
      - map: erc4626:map_events

  # Normalized flows: joins raw events against the registry,
  # emits share_price, decimal-normalized assets, and net flow per vault.
  - name: map_vault_flows
    kind: map
    inputs:
      - params: string              # RPC chunk size, cf. erc20/balances
      - map: erc4626:map_events
      - map: erc20_tokens:map_events
      - store: store_vaults
        mode: get
    output:
      type: proto:erc4626.vaults.v1.Events
```

**That imports two existing packages and consumes both a cross-package map and a store — it satisfies
"compose 2+ Graph products" on the manifest alone.**

### c. How much Rust, and the sync cost

Patterns to copy are all in-repo:
- `erc20/balances/src/calls.rs` — 37 lines, the entire `RpcBatch` pattern for the `asset()`/`decimals()` probe
- `dex-swaps-pools/substreams.yaml:31-37` — the `set_if_not_exists` store declaration
- `erc20/balances/substreams.yaml` — cross-package composition + RPC chunk param wiring
- `erc4626/src/lib.rs` — 60 lines, the module we're extending

**Estimate 150–250 lines of Rust**, most structural. The risky part is store key/value semantics and
`RpcBatch` error handling — neither debuggable without a working toolchain and an API key.

✅ **Sync cost is the good news, and where this beats the chain-modules math.** `erc4626:map_events` is
**fully stateless** — only input is `source: sf.ethereum.type.v2.Block`, no store, and **zero
`initialBlock` declarations anywhere in the repo.** A stateless map can start at any block with no
backfill dependency: `substreams gui -s 21000000` and go. **We are not forced into the 7,025,407-block
full-history backfill that made Morpho Blue 100.4% of the free tier.**

⚠️ **The moment we add `store_vaults` it becomes stateful** and backfill starts at the store's
`initialBlock`. **Set it.** There is no block index (`blockFilter` → zero hits), so a store left at the
default 0 would scan the entire chain.

### d. Is a PR here meaningful? Yes — but don't depend on it merging

Right home, genuinely welcome contribution, **wrong timeline.** The repo has gone ~2 months without a
commit. All 8 open issues (#248, #251–#257) are DEX aggregation and rollup features; **none touch
ERC-4626.** Merge latency is a real risk on a 9-day clock.

**Do it as a fork + our own published `.spkg`, and open the upstream PR as evidence of intent.** Judges
can see the PR exists; the demo doesn't depend on a maintainer waking up.

---

## 6. Integration and cost

### 🔴 No hosted query endpoint — same blocker

The 11 `sink:` blocks target ClickHouse/Postgres we operate, with `postgraphile_frontend: enabled:
false`. `docker-compose.yml` is local Postgres + pgweb. **Pinax's `*.substreams.pinax.network:443` are
gRPC streaming endpoints, not query endpoints — you can't SELECT from them.**

So: sink → our own DB. Vercel cannot run a long-lived sink process. **"Agent queries The Graph live"
still becomes "agent queries my ClickHouse."** Unchanged.

### Cost math

`scripts/pricing-calculator.py` carries measured profiles (Feb 2026, sampled with `clickhouse-evm-dex`
over 10k-block windows) at $150/TB + $1.75/1M blocks. Reviewer ran it:

| Chain | GB/10k blocks | Blocks/mo | Data/mo | Total/mo |
|---|---|---|---|---|
| eth-mainnet | 0.960 | 216,000 | 20.7 GB | $3.49 |
| base | 1.530 | 1,296,000 | 198.3 GB | $32.01 |

Against our constraints:
- **5 GiB egress ≈ ~56,000 Ethereum blocks** at that rate (~2.4 days of chain). But that rate was
  measured with the **DEX aggregator** spkg, far heavier than erc4626 — treat 0.96 GB/10k as a
  generous upper bound. **ERC-4626-specific throughput: unverified.**
- ✅ **7M blocks is fine here.** Ethereum runs ~216k blocks/month, so 7M ≈ **32 months of chain.** An
  ERC-4626 backfill from Morpho Blue's deployment (~18.9M) to head (~23.3M) is ~4.4M blocks —
  comfortably inside the free tier. **And because the module is stateless we can start even later.**
- ⚠️ **Base is where it hurts:** ~1.3M blocks/month means 7M blocks is only ~5.4 months. Note
  `erc4626/Makefile` **defaults to `base.substreams.pinax.network:443 START_BLOCK=20000000`.** If Base,
  pick a tight window.
- Requires a **Pinax API key.** Free-tier terms unverified.

### 🔴 An LLM cannot compose queries at runtime — same as the other repo

A Substreams package is compiled WASM with a fixed module DAG and typed proto outputs. The only runtime
knobs are `params:` (here: output encoding `"hex"`/`"tron_base58"`, and RPC chunk size) and
start/stop block. **An agent cannot compose a new query, add a filter, or change a projection without a
recompile and repack.**

> **Our "agent uses The Graph as a live data source" claim survives only through the Subgraph MCP +
> GraphQL path. Substreams here is a batch ETL contribution, not an agent data source. Keep those two
> stories separate in the submission — conflating them is the fastest way to lose credibility with a
> judge who reads the manifest.**

---

## 7. Gotchas

**Repo weight & wiring**
- **113 `.spkg` binaries (~250 MB) committed to `spkg/`.** Clone is heavy.
- Imports are **vendored file paths, not registry refs.** Bumping a dependency means rebuild +
  re-commit a binary.
- ⚠️ **Version drift in-tree:** `erc20/balances/substreams.yaml` imports `erc20-transfers-v0.3.3.spkg`
  while `evm-transfers/substreams.yaml` imports `erc20-transfers-v0.4.0.spkg`. **Two versions of the
  same package coexist.** Composing both into one pipeline will surprise you.

**⚠️ Hash / cache — the trap from the other repo is here too**
- The committed `spkg/erc4626-v0.1.0.spkg` embeds a README string declaring the output as
  `proto:erc4626.flows.v1.Events`. The manifest and `proto/v1/erc4626.proto` both say
  `erc4626.v1.Events`, and `flows.v1` **appears nowhere in the working tree.** The checked-in binary was
  packed from a source state that no longer exists → **repacking from source will not reproduce the
  published hash. Cold cache, full backfill.** (Static evidence — the string is in the binary. No
  substreams CLI to compare hashes directly. **Unverified.**)
- The same binary embeds `/Users/denis/.cargo/git/checkouts/substreams-abis-ee977dda87e381a7/62b75b6/…`
  — **built on a maintainer's Mac against a git checkout.** `Cargo.toml` pins it by git tag v1.5.0;
  crates.io is at v1.6.0. **Builds are not reproducible, and there is no packaging CI to make them so.**

**Docs contradicting code**
- `erc1155/substreams.yaml:10` imports `ethereum-common` and never uses it. Copy that manifest as a
  template and you inherit a pointless remote fetch.
- `dex/uniswap-v3/substreams.yaml:5` — `url: https://githubcom/…` (missing dot). Several packages still
  declare `url: …/substreams-evm-tokens`, a former repo name.
- README lists 8 chains; `network:` fields only ever say mainnet/tron/base. Chain support is real but
  comes from the Makefile `ENDPOINT`, not the manifest.

**⚠️ Correctness**
- **Open issue #248:** "dex-swaps: same Uniswap V3 swap emitted twice as `uniswap_v3` +
  `kyber_elastic`." **Signature-collision double-counting — precisely the risk `erc4626/README.md`
  warns about for topic0-only matching.** If we build reconciliation on `erc4626:map_events`, **dedupe
  by requiring both Deposit and Withdraw signatures to co-occur on an address, or probe `asset()`.
  Don't assume topic0 uniqueness.**

**Infrastructure we don't have**
- ClickHouse or Postgres + a long-running sink process + a Pinax API key. Vercel provides none.
- No Rust toolchain. Budget rustup + wasm32 target + first workspace build — **~45 crates with
  `lto = true`**, so the first build is slow. Rust 1.88 pinned in CI and `rust-toolchain.toml`.
- **No `initialBlock` anywhere** → any store we add defaults to block 0 → full-chain backfill unless
  set.
- **No block index / `blockFilter`** → no index-accelerated sync for anything.

---

## 8. Verdict

**Viable stretch goal only — but not the same answer as the other repo. Don't cut it blind.**

Materially better than `streamingfast/substreams-chain-modules` on every structural axis we cared
about. Composability is real and three-tiered, with cross-package map and store inputs. Capabilities go
well past subgraph reach — batched eth_call at index time, balance deltas with `Reason` discrimination,
deployed bytecode with factory attribution, internal-call attribution. **And it ships an actual
ERC-4626 package that the prize text names by example, already composed into an aggregator, with a
maintainer-written README that reads like a spec for what's missing.**

**And none of that changes our core product, because this repo has zero lending data.** No Aave, no
Morpho, no Compound, no Messari entities. No hosted query endpoint, no block index, no point-in-time
primitive. **The Messari-subgraph + Subgraph MCP architecture stays exactly as it is. In particular, do
not give up GraphQL `block: { number: N }` — that is the mechanism the Arc prediction market settles
on, and Substreams cannot replicate it.**

### The contribution worth making, if there's slack

An **`erc4626-vaults` package** composing `erc4626:map_events` with a new `store_vaults` (one-shot
`asset()`/`decimals()` probe via the `RpcBatch` pattern already in `erc20/balances/src/calls.rs`),
emitting normalized per-vault flows with share price.

**It is literally the prize's named example**; it closes the gap the maintainer wrote into
`erc4626/README.md`; it composes 2+ packages so it satisfies the composability criterion on the
manifest alone; and **the eth_call probe is something a subgraph provably cannot do.**

**Estimate 8–14 hours** if Rust cooperates — 2h toolchain and first build, 3–5h the module, 2h
manifest/pack/test against a Pinax endpoint, 2–3h a demo page. ⚠️ **Can blow past 20** if `RpcBatch` or
store semantics fight, with no Rust experience and no toolchain installed.

### Recommendation

**Timebox it, sequence it last.** Ship the Messari/MCP analyst agent first — that earns the AI-tooling
prize and it's the whole product. If feature-complete around Sept 10, spend two days on the 4626 module
as the "composable Substreams module for an emerging standard" bullet, publish our own `.spkg`, and
open the upstream PR as evidence of intent. **Do not make the submission depend on it merging.**

### One free bridge worth 20 minutes

**`x402/` and `evm-x402/` exist here.** Pinax already extracts EIP-3009 `AuthorizationUsed` and Permit2
settlements (`x402/src/lib.rs`), and **the HEAD commit itself (#260) surfaces them as db_out tables.**
Our build has an x402 gate. **That's a narrative bridge to The Graph that costs no Rust at all.**

⚠️ Honest caveat: it's EVM/mainnet-scoped and our gate is on Hedera, and **neither Hedera nor Arc has a
Substreams endpoint** — so it's a **settlement-analytics demo alongside our gate, not instrumentation
of it.** Say that plainly in the submission rather than letting a judge discover it.

---

## Questions closed

| Question | Answer |
|---|---|
| Is anything here composable? | **Yes** — 26 of 52 manifests use `imports:`, with cross-package map AND store inputs. Three-tier architecture |
| Does it expose data subgraphs can't? | **Yes** — batched eth_call, balance deltas with reasons, deployed bytecode, internal-call attribution, reverted-tx status. No storage reads |
| Is it the same layer as `ethereum-common`? | **Both layers, wired together** — foundational + protocol leaves + normalizers |
| Does it have lending data? | **No.** Grep returns 3 files, none a module. `messari` → zero hits |
| Does it have ERC-4626? | **Yes** — a working, packaged, already-composed module. The gap is the *derivations* the maintainer listed as to-dos |
| Better base than `ethereum-common` for a 4626 module? | **Yes, decisively** — the decoder exists and is already composed |
| Better than Messari subgraphs for our core loop? | **Worse** — no lending data, no point-in-time primitive, no hosted query endpoint |
| Does the free-tier math work here? | **Yes** — `erc4626:map_events` is stateless, no `initialBlock`, can start anywhere. 7M blocks ≈ 32 months of Ethereum |
| Can an agent compose queries at runtime? | **No** — same fixed WASM pipeline |
| Is the cross-repo `ethereum-common` import real? | **No** — declared in `erc1155` and never used. Dead import |

---

# Follow-up (same day) — two questions answered empirically

## A. Does topic0-only matching work at scale? Measured on Dune.

Ethereum mainnet, 7-day window (~50k blocks). Topic0 values computed locally and cross-checked against
the repo's own README table (Transfer, `Deposit(address,uint256)`, `Withdrawal` all match exactly).

- `Deposit(address,address,uint256,uint256)` → `0xdcbc1c05240f31ff3ad067ef1ee35ce4997762752e3a095284754544f4c709d7`
- `Withdraw(address,address,address,uint256,uint256)` → `0xfbde797d201c681b91056529119e0b02407c7bb96a4a2c75c01fc9667232c8db`

**1,273 distinct addresses, 50,444 logs.** Ground truth = does the verified ABI declare `asset()`.
Dune queries: 8612982, 8612991, 8613002.

| README co-occurrence heuristic | ABI ground truth | Addresses | Logs |
|---|---|---|---|
| passes (emits both sigs) | real 4626 | 366 | 35,090 |
| passes | unverified | 277 | 10,460 |
| passes | **NOT 4626** | **11** | **1,204** |
| fails (one-sided) | **real 4626** | **236** | **1,586** |
| fails | unverified | 348 | 1,491 |
| fails | NOT 4626 | 35 | 613 |

### The answer is more interesting than "high or low false-positive rate"

**Raw topic0 matching is ~93% precise.** On the 648 verified contracts: 602 real vaults, 46 not. A
**7.1% false-positive rate by address, 4.7% by log volume.** Not catastrophic — better than issue #248
would lead you to fear.

⚠️ **But the maintainer's own recommended fix is worse than the disease.** The co-occurrence heuristic
achieves 97.1% precision **by discarding 236 of 602 real vaults — 39% of them.** It removes 35
impostors at the cost of 236 true positives. **6.7 real vaults destroyed per impostor caught. That
heuristic should not ship.**

### The false positives are the dangerous kind — near-misses, not noise

The 11 contracts that pass co-occurrence but lack `asset()`:

| Contract | Namespace | Logs |
|---|---|---|
| LT_weth | yieldbasis | 751 |
| USD3 | threejane | 184 |
| AladdinCRV | alladin_dao | 64 |
| LT ×3 | yieldbasis | 116 |
| sUSD3 | jane | 50 |
| rstETH / pzETH / rsENA | mellow_lrt | 36 |
| usdc_vault | harvestfinance | 3 |

**All vault-shaped contracts that aren't ERC-4626** — Mellow LRT uses its own vault interface,
AladdinCRV predates the standard, YieldBasis LT is a leveraged token. They emit identically-shaped
Deposit/Withdraw at plausible magnitudes. **For a "total ERC-4626 TVL" or a vault balance sheet that's
the worst error class: same order of magnitude, semantically wrong, invisible without a probe.**

Meanwhile the real vaults the heuristic throws away are unambiguous: StakedUSDat (779 logs,
deposit-only — a growing vault nobody's exited yet), TokenizedVault (upshift),
EtherealPreDepositVault, DeFi_USDT_Vault, xMPL (syrup), kiln_vault_proxy, CvxCompounder_aCVX.
**One-sided in a 7-day window is normal vault behavior, not a collision signal.**

**Caveats:** ground truth is `ABI LIKE '%"asset"%'` — ERC-4626's own params are `assets` plural so they
don't match, but treat exact percentages as ±a few points. **625 of 1,273 addresses (49%) are
unverified** with no ABI on Dune and are excluded from the precision math; unverified contracts skew
toward proxies and fresh deployments, so the verified subset may not be representative. Ethereum only,
7 days — **Base (where the README says Morpho dominates) may differ.**

### ✅ The `asset()` probe is now the whole point, not a nice-to-have

It's the only correct disambiguator: **the documented alternative loses 39% of real vaults, and doing
nothing admits 7% contamination made of plausible near-misses.**

That reframes the contribution from "I added a registry store" to **"I fixed a measured correctness
defect that the module's own README documents but mis-solves"** — and the fix requires `eth_call`,
which is precisely what a subgraph cannot do. Better PR, better prize story.

### It changes the sync math less than expected

- **`set_if_not_exists` keyed on first event sighting means the registry populates lazily.** A vault
  emitting its first event after our `initialBlock` gets probed at that moment. **We don't need history
  to be correct going forward.**
- So we can still set `initialBlock` late. We lose "start literally anywhere" but keep **"start recent,
  be correct from there."**
- **RPC volume is bounded by distinct vaults, not blocks** — ~1,273 addresses per 7 days on Ethereum,
  cumulative universe in the low thousands. With `RpcBatch` chunking (chunk_size=100) that's **~13
  batched calls per week of new vaults. Trivial.**

⚠️ **What does get worse: RPC-bearing modules throttle parallel workers.** `eth_call` can't fan out the
way pure block processing does, so throughput drops. **Unmeasured — no CLI, no API key. The one cost
unknown, and the first thing to check if we build it.**

**Net: block budget essentially unchanged, throughput modestly worse, correctness dramatically better.**

---

## B. Is anything published to substreams.dev? 🔴 No.

URL format established against controls first, so the 404s are meaningful:

| URL | Status |
|---|---|
| `/packages/ethereum-common/v0.3.3` | **200 ← control** |
| `/packages/morpho-blue-substreams/v0.1.0` | **200 ← control** |
| `/packages/erc4626/v0.1.0` | 404 |
| `/packages/evm-transfers/v0.7.0` | 404 |
| `/packages/x402/v0.1.0` | 404 |
| `/packages/erc20-transfers/v0.4.0` | 404 |
| `/packages/evm-dex/v0.8.0` | 404 |
| `/packages/dex-swaps/v0.8.0` | 404 |
| `/packages/evm-balances/v0.3.4` | 404 |
| `/packages/erc1155/v0.5.0` | 404 |
| `/packages/pinax-network/erc4626` (namespaced) | 404 |
| `/pinax-network` | 404 |

**Pinax packages resolve under no form the reviewer could construct.**

### And it's worse than "not on the registry"

Their actual distribution channel is GitHub Releases. **42 releases exist, but:**

- ⚠️ **There is no `erc4626` release at all.** The most recent release of any kind is `evm-dex-v0.8.0`
  (2026-06-01), which **predates the erc4626 commit (2026-07-09).**
- **No `evm-transfers` release past v0.4.0 (2026-02-20)** — but the manifest declares v0.7.0.

**So `erc4626-v0.1.0.spkg` and `evm-transfers-v0.7.0.spkg` exist only as binaries committed to `spkg/`
in the repo. Never released, never published, no resolvable coordinate anywhere.** (`x402` is the
exception — `evm-x402-v0.1.0`, 2026-05-07, ships `x402-v0.1.0.spkg` as a release asset.)

**We'd not be importing "a binary we committed ourselves" — we'd be importing a binary Pinax committed
and never shipped. By any external definition it isn't a published Graph product. A judge who clicks
through finds a 404.**

### Three ways out, best first

1. **Publish our own package to substreams.dev.** Fully in our control, minutes of work, makes our
   module a real registry entry with a resolvable coordinate. **Do this regardless.**
2. **Compose against something that actually resolves.** Both controls above are live.
   `morpho-blue-substreams@v0.1.0` is particularly interesting — it's Morpho, it's from the
   Messari-derived chain-modules set, and it matches our "balance sheet of Morpho" directive. An
   `erc4626-vaults` module importing that plus our own is a "compose 2+ Graph products" claim **with
   URLs a judge can click.**

   💡 **Hypothesis worth testing:** the cold-cache finding came from *forking and rebuilding*
   chain-modules, which changes module hashes. **Importing a published `.spkg` unchanged should
   preserve its hash and therefore its warm cache** — we'd pay only for our own downstream module's
   computation, **not a 7M-block Morpho backfill.** That would materially change the cost picture.
   Unverified without an API key; test with `substreams info` on the published spkg and compare the
   module hash before relying on it.
3. **Actually consume `ethereum-common`.** It resolves (200), and `erc1155/substreams.yaml:10` already
   imports it — just never uses it. Wiring it into a real module input converts a dead import into
   genuine cross-org composition. Weakest of the three; gives block/tx primitives rather than anything
   4626-shaped.

---

## What the follow-up changes

**Nothing about the core recommendation** — Messari subgraphs + Subgraph MCP remain the product, and
this repo still has zero lending data. But the 4626 contribution got **more defensible and less
dependent on Pinax**:

- **The correctness case is now measured, not asserted:** 7% contamination, a documented workaround
  that loses 39% of real vaults, named examples of both failure modes.
- **The composability case has to route around Pinax**, because their packages aren't published
  anywhere. Publish our own, compose against `morpho-blue-substreams` or `ethereum-common` — both
  resolve.

**The upstream PR is now worth more as a signal** (fixing something real and quantified) **and less as
infrastructure** (no release since June, and they never released the module we'd be patching). Ship our
own registry entry; open the PR as evidence.

---

## Still open

- **Whether the 4626 module is worth 8–14h** (potentially 20+) as a standardized-track contribution,
  given it doesn't improve the product
- **RPC-worker throttling** — the one measured-cost unknown for an eth_call-bearing module
- **Whether importing an unmodified published `.spkg` preserves its warm cache** — would materially
  change the cost picture; test with `substreams info` before relying on it
- Pinax free-tier terms and API key acquisition
- Whether Base behaves differently from Ethereum for 4626 topic0 precision (README says Morpho
  dominates there)
- The hash-mismatch finding is static evidence only; no CLI to confirm
- Whether to use the `x402/` narrative bridge in the submission, and how to caveat it honestly

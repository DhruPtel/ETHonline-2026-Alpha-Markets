# Research: substreams-chain-modules

**Repo:** https://github.com/streamingfast/substreams-chain-modules
**Reviewed at:** commit `7b497dc490ad3e82d421ada57e1f0212de18f078` (Stéphane Duchesneau, Fri Sep 4 2026,
"Revert 'rename uniswap-v4-substreams to uniswap-v4'"), branch main
**Reviewed:** Sept 4, 2026

> **Network available.** Reviewer installed Rust 1.96.1 and Substreams CLI v1.22.0, and **built two
> crates from source**. Left 422 MB in `target/` (gitignored; `rm -rf target` to clean).
>
> **Could not run:** anything against a live endpoint. `substreams run` against
> `mainnet.eth.streamingfast.io:443` returns `Unauthenticated desc = required authorization token not
> found`. **Every sync-time and cost claim is unverified and marked as such.**

---

## 0. Is Substreams viable in 9 days?

**Yes for a smoke test in ~1 hour. No for what we actually need in under a day. And forking this repo
is the wrong path either way.**

Three things people conflate:

| Goal | Realistic time | Verified? |
|---|---|---|
| `substreams run <published pkg>` → JSON on stdout from a recent block | ~30–60 min (mostly `substreams auth` + CLI install) | CLI install + registry fetch verified; the run itself needs a token |
| Same, backfilled from the protocol's deploy block | ~10–40 min wall clock, **but see the free-tier problem** | unverified |
| Backfill → sink → hosted DB → GraphQL our Vercel app can query | **1.5–3 days** | unverified |

### Sync is not the problem

Ethereum mainnet head is 25,908,531 (checked via Blockchair). Backfill sizes from `initialBlock`:

| Module | initialBlock | Blocks to backfill |
|---|---|---|
| `lending/morpho-blue-substreams` | 18,883,124 | 7,025,407 |
| `lending/maple-finance-v2-substreams` | 16,126,990 | 9,781,541 |
| `lending/compound-v3-substreams` | 15,331,590 | 10,576,941 |
| `lending/inverse-finance-substreams` | 11,915,867 | 13,992,664 |
| `lending/liquity-substreams` | 12,178,551 | 13,729,980 |
| `lending/yearn-v2-substreams` | 11,563,389 | 14,345,142 |

Architecture docs give the two constants: **segments are 25,000 blocks**, and StreamingFast pins
**15 workers** on the free production endpoint. Morpho Blue = 281 segments over 15 workers ≈ 19 waves.
At a plausible 20–60s per segment for a thin single-contract map module, **roughly 6–20 minutes of
wall clock.** Genuinely fast.

> **Correction to our prior assumption:** indexing time was the wrong reason to have Substreams on the
> cut list. It's fast. The real reasons are below.

### ⚠️ The blocker is the meter, not the clock

The Graph Market free tier is **7M blocks and 5 GiB egress.** A single full Morpho Blue backfill is
**7,025,407 blocks — 100.4% of the entire free block allowance, once.** Compound v3 would be 151%.

**One lending protocol backfilled for free, then it's a card at $25/TB.** That's the number that
should drive the decision, and nobody mentions it.

### Paths that avoid full historical sync

1. **Start from a recent block.** Nothing forces `initialBlock`; `-s 25800000` streams the last ~100k
   blocks. Fine for a demo, **useless for "balance sheet of Morpho"** — no position history.
2. **Warm cache on the published artifact.** Substreams caches module output keyed by module hash,
   production mode only. `morpho-blue-substreams@v0.1.0` is published with `map_events` at hash
   `225ffcfcf2887626c9a56a42f45e89ff1c0b0154`. If anyone has run that hash on the SF mainnet endpoint,
   segments come back from cache. **See the finding below — this is where the repo bites you.**
3. **Block indexes — the real answer.** `ethereum-common@v0.3.3` (verified via `substreams info`, no
   auth needed) exposes `filtered_events`, declaring `Block Filter: (using *index_events*)`. The
   engine **skips blocks entirely** that don't match an `evt_addr:` / `evt_sig:` filter. For one
   contract across 7M blocks, that's the overwhelming majority skipped. `all_events`/`index_events`
   are shared foundational modules whose caches are almost certainly warm.

### ⚠️ The 5-minute empirical check that could change everything

```bash
substreams auth
substreams estimate morpho-blue-substreams@v0.1.0 map_events \
  -e mainnet.eth.streamingfast.io:443 -s 18883124
```

`substreams estimate` reports **how many blocks are actually left to process** given what the
endpoint's cache already holds. **This is the one number the reviewer couldn't get, and the only one
that could change the verdict.**

### 🔴 The sharpest finding: building from source gives you a cold cache

Reviewer built `morpho_blue_substreams` from source at this commit, packed it, and compared module
hashes against the published registry package:

| Module | Built from this repo | Published @v0.1.0 |
|---|---|---|
| `map_events` | `4ac62adf75d67c5dfd55146aa9c77aeb20ba9d24` | `225ffcfcf2887626c9a56a42f45e89ff1c0b0154` |
| `db_out` | `97adc92879273de8fe58e798b9ae724887bef884` | `ef2df5a41357eecafc735ecc590fb1bd8f4e8b0a` |

**They don't match.** The cache key is the WASM bytecode, so **cloning and building this repo means a
cold cache and paying the full 7M-block backfill yourself.** Only running the published artifact *by
name* (`morpho-blue-substreams@v0.1.0`) can hit whatever cache exists.

**Nothing is pre-built in the repo** — `*.spkg` is gitignored (`.gitignore:3`) and there are zero
`.spkg` files in the tree. The repo is source; the binary lives on the registry. **And touching one
line of Rust re-cools it regardless.**

---

## 1. What this is

A monorepo of **69 standalone Substreams source packages** (Rust crates + protobuf + manifests), one
Cargo workspace, Apache-2.0. **Not a library, not really a template** — reference/source-of-record for
packages published individually to substreams.dev.

A "chain module" = a directory with a Rust `cdylib` crate, a `.proto`, a `substreams.yaml`, an
`abi/*.json`, and generated bindings. Compiles to WASM, then `substreams pack` bundles it into a
`.spkg`. Neither is committed.

**Ecosystem relationships:**
- `substreams-foundational-modules` — named in `README.md:7` as the layer below. **That's where
  composability actually lives** (`ethereum-common`). **Nothing in this repo imports it.**
- `substreams-sink-*` — every manifest imports exactly one thing,
  `substreams-sink-database-changes-v4.0.0.spkg`, which is a proto definition, not a data module. The
  `db_out` modules emit `DatabaseChanges` for `substreams sink postgres|clickhouse`.
- The Graph's `substreams-skills` — **no relationship.** That's a Claude Code plugin of AI agent
  skills for writing Substreams.

**Maintenance: active but brand new and unproven.** First commit June 15, 2026; **39 commits total**;
last push today. **0 stars, 0 forks, 0 open issues, 0 releases, 0 tags.** Two PRs, both merged, both
same author. Bursty — 45 packages landed in a handful of July days.

⚠️ **The origin matters enormously:** PR #1 is titled *"feat: convert 45 Messari subgraphs to
Substreams packages (live-verified)"*. **This repo is largely a machine conversion of the exact
Messari subgraphs we're already querying.**

---

## 2. Read these first

| # | File | Why | Time |
|---|---|---|---|
| 1 | `lending/morpho-blue-substreams/src/lib.rs` (369 ln) | **The heart.** One complete lending module end to end: `map_events` decodes logs → typed protobuf, `db_out` → SQL rows. It's a for-loop and if-lets; followable without knowing Rust | 15 min |
| 2 | `lending/morpho-blue-substreams/substreams.yaml` (48 ln) | The whole mental model: modules, kinds, inputs, `initialBlock`. **The file that decides sync cost** | 5 min |
| 3 | `dex/uniswap-v4-substreams/README.md` | The only module documented as a full working stack: build → sink → ClickHouse → Hasura → GraphQL, with real curl commands. **What "consuming Substreams from a web app" concretely costs** | 10 min |
| 4 | `dex/uniswap-v4-substreams/DESIGN.md` | The repo's architectural doctrine, rules P1–P8. Most important: "P1 Events in WASM; state in ClickHouse" | 8 min |
| 5 | `staking/aspida-substreams/src/lib.rs` (80 ln) | **The floor.** Smallest complete module in the repo | 4 min |

Skip every `src/abi/*.rs` and `src/pb/*.rs` — generated; `morpho_blue.rs` alone is 6,240 lines.

---

## 3. Structure and stack

```
Cargo.toml              one workspace, 69 members
rust-toolchain.toml     pins Rust 1.96 + wasm32-unknown-unknown
dex/          3 packages   bancor-v3, velodrome, uniswap-v4
lending/      6 packages   compound-v3, inverse-finance, liquity,
                           maple-finance-v2, morpho-blue, yearn-v2
nft/          3 packages   cryptopunks, looksrare, seaport
payment/      1 package    superfluid (most complete: ClickHouse+Hasura+parity script)
staking/     56 packages   lido, eigenlayer, rocket-pool, etherfi, …
```

Each package: `substreams.yaml` · `Cargo.toml` · `build.rs` (ABI→Rust codegen) · `abi/*.json` ·
`proto/*.proto` · **`src/lib.rs` (the only hand-written file)** · `src/abi/`, `src/pb/` (generated) ·
sometimes `schema.sql`.

**Toolchain:** Rust 1.96 + wasm32 target, Substreams CLI (Go binary), Docker for the local
ClickHouse/Hasura stack. `buf` is configured but protobuf codegen is committed, so not needed.

**Measured:** rustup install ~6 min · cold build of `morpho_blue_substreams` release/wasm32 = **2m14s**
→ 370 KB `.wasm` · second module with warm deps = **3.9s** · `substreams pack` = **2.4s**.

**Published:** `.spkg` on substreams.dev — verified, `morpho-blue-substreams@v0.1.0` resolves and
downloads without auth (7 downloads). **Nothing on crates.io**; the crates are cdylib-only.

**Chains:** 55 of 69 manifests are `network: mainnet`; rest are avalanche (5), base (4), one each of
blast, bsc, celo, matic, optimism. Only uniswap-v4 has a multi-network block (21 chains).

🔴 **Neither Hedera nor Arc has a Substreams endpoint** — confirmed in the chains list, and the repo
says so itself: *"Uniswap v4 is also deployed on Arc, which has no Substreams endpoint yet"*
(`dex/uniswap-v4-substreams/README.md`). **Our x402 gate and our prediction market are both on chains
Substreams cannot see.**

---

## 4. What it gives us that subgraphs don't

**Generically, Substreams can do:** internal calls (`ethereum-common`'s `all_calls` "gives you all the
calls in a block (including internal calls)"), call inputs/return values, failed transactions,
block-level indexes for cheap skipping, arbitrary non-GraphQL output shapes, 100x-class backfill, and
fan-out to multiple sinks.

### ⚠️ But nothing in *this repo* uses any of it

Reviewer checked specifically. **Every module reads `source: sf.ethereum.type.v2.Block` and iterates
decoded event logs only.** Across all 69 manifests, the complete set of module inputs is:

```
75  - source: sf.ethereum.type.v2.Block
67  - map: map_events
 2  - map: map_factory_events
 1  - params: string
```

**No `all_calls`, no storage reads, no balance-change access, no `eth_call`.** Morpho's `map_events`
emits assets/shares as decimal strings copied straight out of the event — **the same numbers the
Messari subgraph reads from the same logs.**

**Worse: the conversion was event-level, not schema-level.** PR #1 describes each package as "a
`map_events` module (extracts the subgraph's indexed events) feeding a `db_out`." You get
`supplies`, `borrows`, `liquidations` tables — **not Messari's `Market` / `Position` /
`LendingProtocol` entities.** The standardized schema, which is the entire reason we picked Messari,
**is exactly what got dropped in translation.**

### Historical block queries — worse than what we have

Substreams is a stream, not a point-in-time query engine. **There is no "give me state at block N"** —
you re-run the pipeline to N and fold, or query the sink DB with `WHERE block_num <= N`, which means
you must have already backfilled and be paying to host that DB.

A subgraph's `block: { number: N }` argument is **one HTTP request against an endpoint someone else
operates.** For settling a market at a later block, keep the subgraph. Firehose would be the right
Graph product for point-in-time state, and it isn't this repo.

### Verdict for cross-protocol lending metrics: **worse**

Six protocols, mostly Ethereum-only, each with a bespoke table shape — versus Messari's one schema
across every lending protocol on every chain. Substreams beats subgraphs on ingest throughput and on
data a subgraph can't reach; **we need neither.** We need one schema across many protocols, queried at
arbitrary blocks — precisely the subgraph's strength and this repo's weakness.

---

## 5. Cheapest path to a track point

### 🔴 There is not one composable module in this repo

"Composable" has a technical meaning: your module takes another package's module as an input, via
`imports:` in the manifest.

**Zero manifests import another data module.** The only `imports:` is the database-changes proto spkg.
Grepping for a cross-package input (`- map: <pkg>:<module>`) returns nothing. **Every module is a
standalone leaf reading raw blocks.**

The smallest module is `staking/aspida-substreams/` (~80 hand-written lines: one `map_events` matching
one Transfer on one address, plus `db_out`). **But it is not an example of a composable one.** The
composable pattern lives in `ethereum-common` — a downstream package imports it and takes
`filtered_events` as an input with a params filter, inheriting the block index for free.

**How much Rust:** for an aspida-shaped module, ~80 lines, maybe 25 of real logic — a for-loop,
`match_and_decode`, struct fills. `build.rs` generates the ABI bindings; you write no parsing.
Genuinely one evening for someone who's never written Rust.

### Would the minimum look genuine or hollow?

Cloning `aspida-substreams`, swapping an address, and calling it a contribution would be **transparently
hollow** — and worse, it'd be a *non-composable* module submitted to a prize whose text says "simply
querying one Subgraph with no composition or standardization does not qualify."

**Two genuinely non-hollow options, both found by reading the code rather than the prize text:**

**1. An ERC-4626 tokenized-vault module.** The prize text names this exact example ("contributing a new
composable Substreams module for an emerging standard, such as ERC-4626 tokenized-vault flows").
Reviewer grepped: **`4626` appears nowhere in this repo** — not in Rust, YAML, proto, JSON, or docs.
An open, explicitly-solicited gap. Built on `ethereum-common`'s `filtered_events` filtering `evt_sig:`
for ERC-4626 `Deposit`/`Withdraw` **across all vaults**, it would be genuinely composable, genuinely
standardized, genuinely reusable — **and it slots into our lending narrative, since Morpho MetaMorpho
vaults are 4626.** The strongest contribution available.

**2. Normalizing the log-iteration bug.** PR #1 documents a real correctness bug: `logs_with_calls()`
silently drops logs on chains with thin call data, fixed by switching to `receipt().logs()`. The fix
(commit `f37dfee`) was applied **only to the newly-generated batch.** 28 modules still use the buggy
pattern; 39 use the fixed one — and **in `lending/`, 5 of 6 are still on the old pattern, including
`morpho-blue-substreams/src/lib.rs`.** Mainnet has full call traces so it's latent there, but it's a
documented-bug-left-half-fixed. A real contribution — **though it's a bugfix, not a composable module,
so it doesn't itself satisfy the prize criterion.**

---

## 6. Integration with our stack

### 🔴 There is no hosted query endpoint

Substreams output is a **gRPC stream, which Vercel serverless cannot hold open.** You need: run a sink
(`substreams sink postgres|clickhouse`) as a **long-lived process** → into a **hosted DB**
(Neon/Supabase, ClickHouse Cloud) → Next.js route queries that. `uniswap-v4/docker-compose.yml` adds
Hasura on top for GraphQL — another always-on service.

StreamingFast offers hosted sinks into your ClickHouse Cloud via The Graph Market — removes the
always-on process but not the database you pay for.

**Net: two or three pieces of infrastructure we don't currently have.**

### 🔴 An LLM agent cannot compose queries at runtime

Not against Substreams itself. **It's a fixed pipeline** — the module is compiled WASM with a fixed
protobuf output, and changing what it extracts means editing Rust, recompiling, and re-syncing under a
new module hash.

The agent could compose SQL/GraphQL against the **sink database** — but then it's querying
Postgres/Hasura, and the thing that made our AI-tooling story compelling (**agent → The Graph as live
data source**) becomes **agent → our own database.**

> **This is a straightforward regression against the Subgraph MCP for both prizes, and it's the
> argument to weigh most heavily.**

**Cost:** free tier 7M blocks + 5 GiB egress, no card. Beyond that **$25/TB**, metered on blocks
processed and egress bytes. One Morpho Blue backfill ≈ the entire free block allowance. Plus the sink
DB.

---

## 7. Gotchas

**Hour-plus setup:**
- Rust toolchain + wasm32 target: ~6 min install, then 2m14s first build (measured). **The cheapest
  part.**
- `substreams auth` → account on thegraph.market, JWT/API key. Trivial but **blocking** — everything
  the reviewer tried to run died on it.
- Docker ClickHouse + Hasura, then `apply_views.sh` and `hasura_connect_clickhouse.sh` **in the right
  order** (tables must exist first). **The multi-hour part.**
- The sink is long-running and stateful (`--cursor-file-path`, `--spool-dir`). **Nowhere to put it on
  Vercel.**

**Stale / docs-vs-code:**
- ⚠️ **The rebuild-hash mismatch (§0)** — the most expensive surprise available here, and nothing
  warns you.
- **28 modules on the log-iteration pattern PR #1 documents as buggy**, including 5 of 6 lending
  modules. Fix landed in code, never backported.
- `buf.gen.yaml` at repo root is hardcoded to `staking/aspida-substreams/src/pb` — leftover.
- README advertises "DEX, Stablecoins, Prediction Markets, Tokenized Assets"; the actual tree is
  dex/lending/nft/payment/staking. **No stablecoins or prediction-markets directory exists.**
- **Only 9 of 69 packages have a README.** Most have no `schema.sql`, so `db_out` emits rows for
  tables you must define yourself.
- **No CI, no tests, no releases, no tags.** `pretty_assertions` is a declared workspace dep with zero
  test files.

**Infrastructure we don't have:** a long-running process host, a hosted Postgres/ClickHouse, and — for
settlement — **a Substreams endpoint on Hedera or Arc, which does not exist.**

---

## 8. Verdict

**"Only if the core build finishes early" — and if we do it, do not fork this repo.**

**Substreams isn't slow**, and that's worth correcting: 25K-block segments and 15 free workers put a
Morpho Blue backfill in the minutes range. **"Indexing time" was the wrong reason to have it on the
cut list.** The right reasons are three others, all verified:

1. **The free tier is metered at 7M blocks and Morpho Blue alone is 7,025,407** — one protocol
   exhausts it, once.
2. **Building from source produces module hashes that don't match the published packages**
   (`4ac62adf…` vs `225ffcfc…`), so forking guarantees a cold cache and the full backfill. The
   "pre-built" packages are on the registry, not in the tree — and editing one line of Rust moots it
   anyway.
3. **Decisively: consuming Substreams means running a sink into a database we host**, which Vercel
   can't do and which converts our agent from querying The Graph live into querying our own Postgres.
   **A regression on the exact axis the AI prize rewards.**

Add that **Hedera and Arc have no Substreams endpoints** — our gate and settlement chain are
untouchable — and that **this repo's conversion of the Messari subgraphs threw away the standardized
schema that made them worth using**, and Substreams from here is **strictly worse for cross-protocol
lending metrics than what we already have.**

**Hours:** smoke test ~1–2h. Minimum genuine contribution 10–16h including video. Working sink →
hosted DB → Vercel path is **1.5–3 days, and the reviewer would not spend it.**

### If pursued: the ERC-4626 vault-flow module

The one thing the prize text names by example, and a **confirmed gap** (`4626` appears nowhere in this
repo). Build it as `ethereum-common`'s `filtered_events` filtered on ERC-4626 `Deposit`/`Withdraw`
signatures **across all vaults**, not address-gated to one — that makes it genuinely composable (an
input from another package, **which no module in this repo currently has**), genuinely standardized,
cheap to sync because the block index skips non-matching blocks, and it **composes with our Morpho
story since MetaMorpho vaults are 4626.**

Roughly 100 lines of Rust, a manifest, and a PR. ~$2,500-shaped work on the standardized track, and
unlike a cloned aspida module it wouldn't read as a box-tick.

### ⚠️ Before deciding: the 5-minute empirical check

```bash
substreams auth
substreams estimate morpho-blue-substreams@v0.1.0 map_events \
  -e mainnet.eth.streamingfast.io:443 -s 18883124
```

Reports how many blocks are actually left given the endpoint's warm cache. **If it comes back near
zero, the free-tier objection dissolves and this moves up to a real stretch goal. If near 7M, cut it**
and put the nine days into Messari + Subgraph MCP composition, which already satisfies both prize
criteria on its own.

---

## Questions closed

| Question | Answer |
|---|---|
| Is indexing time the problem? | **No** — Morpho Blue backfill is ~6–20 min. Our prior assumption was wrong |
| What IS the problem? | Free tier is 7M blocks; Morpho Blue alone is 7,025,407 — 100.4% of it |
| Does forking give pre-built packages? | **No.** Built hashes ≠ published hashes. Cold cache, full backfill |
| Are there `.spkg` files in the repo? | No — gitignored. The repo is source; binaries are on the registry |
| Does this repo use Substreams' unique capabilities? | **No.** Event logs only. No calls, storage, or balance deltas anywhere in 69 packages |
| Does it preserve the Messari standardized schema? | **No** — event-level conversion. `supplies`/`borrows` tables, not `Market`/`Position` |
| Is anything in this repo composable? | **Zero modules.** Every one is a standalone leaf. Composability lives in `ethereum-common` |
| Can our agent compose queries at runtime? | **No** — fixed WASM pipeline. Querying the sink DB is agent → our Postgres, a regression |
| Can Vercel consume Substreams? | **No** — gRPC stream needs a long-lived sink process |
| Do Hedera or Arc have Substreams endpoints? | **No**, confirmed in the repo's own docs |
| Better than subgraphs for our case? | **Worse** — we need one schema across many protocols at arbitrary blocks |

## Still open

- **`substreams estimate` against the live endpoint** — the one number that could change the verdict.
  Needs a token; 5 minutes
- Whether the ERC-4626 module is worth 10–16h as a standardized-track contribution, independent of
  using Substreams in the product
- Whether contributing the log-iteration bugfix upstream is worth doing regardless (it's real, and
  "contributions back upstream" is an extra point on the Hedera ATS track — check whether The Graph
  tracks reward it too)

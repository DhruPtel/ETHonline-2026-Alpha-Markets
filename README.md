# Alpha Markets

**Crypto has no earnings season.** Nobody is paid to do fundamental analysis on protocols, so nobody
does it — tokens trade on macro rather than on whether the books balance.

Alpha Markets creates the incentive. AI analysts publish verified protocol financials, sell them, and
stake their own USDC on their own conclusions. Accurate analysis earns. Sloppy analysis loses.

---

## Status — read this first

| Phase | What it is | State |
|---|---|---|
| **Phase 0** | Nine smoke tests, each proving one integration against the real thing | ✅ **complete** — 8 pass, 1 partial |
| **Phase 1** | The data layer: read The Graph, and bound what can be trusted | ✅ **complete** — 13 units |
| **Phase 2** | Report building: a directive becomes a plan, the plan is executed against live data, the model writes the report | ✅ **works** — 10 of 11 units. The digit validator is the one still open |
| Phase 3 | ATS report tokens + x402 paywall + access checkpoint | ⬜ **not built** |
| Phase 4 | The prediction market on Arc | ⬜ **not built** |

**Nothing is deployed.** There is no web app yet. What exists runs from the command line against
live networks — no mocks, no fixtures, no local index anywhere in the data path.

Phase 0 put real transactions on Hedera and Arc testnets; those are linked below and verifiable
without us. Phase 1 built the analyst's ability to read. **Phase 2 turned reading into reporting** —
ask a question in plain English and get back a financial report: a table of figures that each trace
to a query at a specific block, and an analyst's read of what they mean. Phases 3 and 4 are what
remain: selling a report, and settling a market on it.

---

## The whole system, and where we are in it

```mermaid
flowchart TD
  subgraph BUILT["✅ Built — Phases 0 to 2"]
    G(["The Graph<br/>25 live lending deployments"]) --> CL["client · documents · pagination<br/>common-block pinning"]
    CL --> TR["trust layer<br/>corroboration · triage · adapter"]
    TR --> PL["report pipeline<br/>compose · execute · narrate"]
    PL --> RPT["report<br/>reconciled, narrated, hashed"]
    TR --> AG["interactive agent<br/>plain-English questions"]
  end

  subgraph PLANNED["⬜ Planned — Phases 3 and 4"]
    RPT -.-> ATS["Hedera<br/>report token via ATS"]
    RPT -.-> PAY["Hedera<br/>x402 paywall"]
    RPT -.-> MKT["Arc<br/>analyst stakes own USDC<br/>on its own conclusion"]
    MKT -.-> HUM["humans stake alongside"]
    HUM -.-> SET["settlement<br/>re-reads The Graph"]
    SET -.-> SCR["three scores<br/>accuracy · reconciliation · return"]
  end

  SET -.->|"same querySubgraph"| CL

  classDef built fill:#dff0d8,stroke:#3c763d,color:#1b3a1b
  classDef planned fill:#f5f5f5,stroke:#999,color:#444,stroke-dasharray:4 3
  class G,CL,TR,PL,RPT,AG built
  class ATS,PAY,MKT,HUM,SET,SCR planned
```

Settlement calls the *same* query function the analyst does. That reuse is the point: The Graph is
load-bearing at both ends, not a fetch step at the start.

---

## What works right now

- **28 Ethereum lending deployments configured, 25 answering live** from The Graph's decentralized
  gateway. The other three have no healthy indexer, and the table says which and why.
- **One query document runs unchanged across five live schema versions** — 3.1.0, 3.0.1, 3.0.0,
  2.0.1 and 1.3.0 — returning populated fields on all 25.
- **A question in plain English produces a financial report** — a table whose every figure traces to
  a query at a specific block, and one paragraph on what the numbers mean. The model that writes it
  cannot type a number: it references figures by id and code substitutes the values.
- **Every deployment in a comparison is read at a single common block**, or the report says which
  ones were dropped and why.
- **Every figure carries whether it can be trusted, and why.**

```bash
npx tsx --env-file=.env scripts/demo/narrate.ts "top 10 protocols by deposits"
```

---

## Why the numbers are trustworthy

Anything can print a subgraph query. The work is in knowing which answers are wrong — and every
example below is something the system found, not something we anticipated.

**aave-v3's cumulative revenue reads $279 quadrillion.** A mapping fault booked $1.63e15 on one day
in July 2024 and the accumulator never recovered; it has recurred 38 times since. The figure returns
**unavailable — never zero.** Zero would look like an answer, which is more dangerous than the
quadrillion, because nobody believes the quadrillion. `spark-lend` carries the identical fault at
$1.20e17: it is an Aave v3 fork on the same Messari template, so this is the template's problem, not
one bad deployment.

**Morpho Blue uses Messari's exact field names and means different things by them.** `inputToken` is
the collateral; `inputTokenBalance` is the loan; collateral is absent from TVL. The headline $13.09B
is inflated roughly 3.6×. It returns **flagged, with the reason attached** — and unchanged, because
correcting a figure invents a number nobody can trace.

**Morpho disagrees with its own contract by exactly −10,000,000.** Found by reading the chain at the
block the subgraph *wrote* the value, then asserting exact equality with no tolerance. Reproduced
later through an entirely separate code path — different client, different block resolution,
different contract call — to the same digit. Cause not established, and we say so.

**Asked to compare all 25 deployments, the agent refused and then recovered.** Two were four hours
stale, so no block existed that every deployment could answer at. The system declined rather than
reading them at different moments; the agent dropped those two, re-ran the rest at a common block,
and reported:

> Two deployments are missing from this comparison… I excluded them rather than read them at a
> different moment… **treat them as unread, not as zero.**

Nobody designed that path. The refusal reached the model as a result, and it treated a gap in the
data as information about the data.

**`_meta.block.number` is one indexer's head, not the deployment's.** aave-v2 has ten indexers
spanning **57,859 blocks** — one of them eight days behind. Every earlier measurement had reported
"zero block spread", which was true only of whichever indexer happened to answer.

More in **[docs/phase-1-summary.md](docs/phase-1-summary.md)**, including the eight deployments that
report a live balance sheet with no recent history, and a live `DATA_ERROR` on a deployment our own
triage had cleared.

---

## How a number becomes a trusted number

```mermaid
flowchart LR
  Q["question"] --> AG["agent loop<br/>2 tools only"]
  AG -->|get_capabilities| CFG[("config<br/>28 measured rows")]
  AG -->|run_document| TL["tools"]
  TL --> BW{"common block<br/>across the set?"}
  BW -->|no| REF["refuse<br/>comparing two moments<br/>is worse than declining"]
  BW -->|"block N"| CL["client → gateway<br/>every query pinned"]
  CL --> PG["paginate<br/>complete or incomplete"]
  PG --> AD["adapter<br/>annotates, never adjusts"]
  CFG --> AD
  AD --> OUT["figures + findings<br/>flags intact"]
  OUT --> AG
  REF --> AG

  classDef guard fill:#fcf3cf,stroke:#b7950b,color:#4a3b06
  class BW,AD,PG guard
```

The agent picks a document from a fixed menu and supplies variables. **It never writes GraphQL** — a
model cannot emit a field that does not exist if it never writes the query.

No rule anywhere tests a protocol by name. Each deployment's quirks are *measured* and stored as
config, so the same condition can mean different things in different places: a zero token price with
a non-zero balance is a blocking `DATA_ERROR` on compound-v3, where deposits derive from price ×
balance — and entirely expected on **1,029 of Morpho's markets**, where the price is the collateral's
and the deposit value comes from the loan token. Same condition, same field names, opposite meanings.
Adding a 29th protocol is adding a config row, not editing the adapter.

---

## The three chains

| Network | What runs there | Phase |
|---|---|---|
| **Ethereum** *(read-only)* | The chain our subgraphs index, and the chain we corroborate against | ✅ 1 |
| **Hedera testnet** | x402 payments for reports, and report tokens via Asset Tokenization Studio | 3 |
| **Arc testnet** | Predictions, stakes, resolution and payouts, in USDC | 4 |

Nothing calls across chains. The only thing that crosses is a 32-byte report hash — committed on
Hedera in the ATS creation event and in the Arc `commitPrediction` call — so anyone can verify both
refer to the same bytes.

---

## On-chain proof

Phase 0 put real transactions on public testnets. Every one is verifiable without us:

- An **x402 payment settling on Hedera** — buyer paid, facilitator covered gas
- A **report token issued through ATS** and **transferred**, balances asserted 1 → 0 and 0 → 1
- The token's contract **verified on Sourcify**, exact match
- An **agent spending its own USDC on Arc** through a Circle developer-controlled wallet
- A **browser wallet signing on Arc** — 20 USDC rendered correctly, not as raw 18-decimal

Links and reasoning: **[docs/evidence.md](docs/evidence.md)**

---

## Try it

```bash
cp .env.example .env      # GRAPH_API_KEY and ANTHROPIC_API_KEY are enough for the data layer
npm install
npx tsx --env-file=.env scripts/demo/narrate.ts "top 10 protocols by deposits"
```

That is the whole build in one command: a directive is planned, executed against 25 live
deployments at one shared block, checked, and written up as a table and a paragraph.

Two more that show the interesting behaviour:

```bash
# per-market breakdown — the model shows the significant rows and says how many it left out
npx tsx --env-file=.env scripts/demo/narrate.ts "list makerdao's individual markets with their deposits and borrows"

# the interactive path: the same data layer, answering questions rather than writing a report
npx tsx --env-file=.env scripts/ask.ts "which protocol has the most deposits?"
```

Reproduce the measurements directly:

```bash
npx tsx --env-file=.env scripts/ops/sweep-protocols.ts --inventory   # who answers
npx tsx --env-file=.env scripts/ops/triage-protocols.ts              # who is right
npx tsx --env-file=.env scripts/demo/corroborate.ts                  # subgraph vs chain, per market
```

The last one also needs `ETHEREUM_RPC_URL`, and it must be **archive-capable** — a market's
write-time block can be thousands of blocks back, and a pruned node keeps about 128.

Requires Node 20.6+ for `--env-file`; developed on Node 22. Every command above hits live networks.

---

## Deeper reading

| Document | What it is |
|---|---|
| [docs/phase-1-summary.md](docs/phase-1-summary.md) | What Phase 1 built and found, with diagrams |
| [docs/protocol-inventory.md](docs/protocol-inventory.md) | All 28 deployments measured — regenerated by the sweep |
| [docs/evidence.md](docs/evidence.md) | On-chain transactions, with links |
| [docs/planning/PLAN-v4-alpha-markets.md](docs/planning/PLAN-v4-alpha-markets.md) | The full spec |
| [tracking/](tracking/) | `logs.md`, `lessons.md`, `DECISIONS.md`, `smoke-results.md` |

---

## What we built on

Built from an empty repository — no starter template.

**Data** — The Graph's decentralized gateway, and Messari's standardized lending subgraph schema.
DefiLlama's public API is used as an external *reference* for reconciliation only; no figure it
returns reaches a report.

**Libraries** — `@anthropic-ai/sdk` (Claude), `@hashgraph/asset-tokenization-contracts` (ATS, against
the public Hedera testnet factory), `@x402/core` and `@x402/hedera` with the Blocky402 facilitator,
`@circle-fin/developer-controlled-wallets`, `ethers`, `canonicalize` (RFC 8785), plus `typescript`,
`tsx`, `solc` and `@openzeppelin/contracts` for tooling.

No GraphQL client, no Apollo, no codegen. Queries are plain `fetch` against pre-written documents.

## AI attribution

This project was built by one developer working with AI assistance throughout — planning, code, and
documentation. It is not incidental and we are not going to pretend otherwise.

- **`tracking/logs.md`** is the narrative record, appended after each run of work: what was made,
  why, and what was surprising. It is the fullest account of who did what.
- **`tracking/lessons.md`** records where reality disagreed with the plan — mostly cases where a
  measurement overturned an assumption we had written down.
- **`tracking/DECISIONS.md`** records choices that would mean rewriting to undo.
- Commits from the Phase 1 sessions carry a `Co-Authored-By: Claude` trailer. Commit messages explain
  what changed and why, not just what moved.

Every measurement in this README came from a script in `scripts/` run against live networks, and each
can be reproduced with one command.

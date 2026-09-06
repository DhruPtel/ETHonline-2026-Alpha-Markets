# PHASE-1.md — Data layer + agent

**Revises:** `PLAN-v4-alpha-markets.md` §9 Phase 1, with everything Phase 0 measured folded in.
**Status:** ready to start. Phase 0 closed with **7 PASS and 2 not run** — SM-06 (agent tool call) is
written and has never executed; SM-09's browser checklist is written and not yet walked.
`tracking/smoke-results.md` is authoritative for this count.

⚠️ **SM-06 has never run, and Unit 10 promotes it into `loop.ts`.** The tool loop it proves is the
thing Unit 10 is built from, so running SM-06 before Unit 10 costs minutes and removes the only
untested assumption underneath that unit.

---

## What Phase 1 is for

*The agent can see.*

By the end, a directive in plain English produces correct data from **five lending deployments across
three schema versions**, pinned to one block, with every figure carrying an honest flag about whether
it can be trusted. **Four of the five carry figures a report will publish** — morpho-blue is queried,
adapted and flagged, not quoted.

**Ending goal — a capability you can demonstrate:**

> Run a script that asks the agent a question in plain English. Watch it choose a query document,
> execute it live against **all five deployments** at a common block, and return correct numbers from
> the four that have them — with revenue marked unavailable where it isn't trustworthy, and TVL
> flagged where the deployment inflates it.

⚠️ **Five queried, four publishable — and the fifth is the point, not the remainder.** morpho-blue is
the only 3.0.0 deployment we have, so dropping it costs a whole schema version and leaves the
standardization claim resting on two. It is also the only **non-Messari publisher on Messari's
standardized template**, which is the evidence that the document travels rather than that our four
Messari deployments agree with each other. And it is what makes the adapter a plausibility layer
rather than a theoretical one. But it is flagged on every axis — `not_tracked` revenue, no
corroboration, TVL inflated 3.6×, and disagreeing with its own contract on 2 of 3 top markets — so
**no wording anywhere should imply its figures are publishable.** It proves the query layer works. It
does not supply a number to a report.

Then a second, sharper one:

> Add a **sixth** 3.1.0 POOLED protocol by adding one row to `config/protocols.ts`, and watch it appear in
> the comparison with no code changes. **That's a pass/fail prize requirement (G1.5) and rehearsing it
> is not optional.**

---

## What Phase 0 changed

Eight findings that reshape this phase. Each one is why a unit below exists.

| # | Finding | Consequence |
|---|---|---|
| 1 | **Morpho uses Messari's exact field names and means different things by them.** `inputToken` is collateral, `inputTokenBalance` is the loan, collateral is absent from TVL, and 28 markets report deposits exactly equal to borrows — headline inflated 3.6× | ⚠️ **The adapter is a plausibility layer, not a renaming layer.** This is the single biggest reshaping |
| 2 | **aave-v3's revenue accumulator is poisoned** — one absurd day in Jul 2024 baked $279 quadrillion into a cumulative that never recovers; 38 occurrences since. **Morpho never wrote revenue at all** — 0 across 977 snapshots. aave-v2, compound-v2, compound-v3 are clean (0.18–1.27% implied APR) | Revenue is allowlisted per deployment, three states, and poisoned/not_tracked **never render as a number** |
| 3 | **Corroboration is per-MARKET, not per-deployment.** compound-v3 exposes the write-time field on base-asset markets only — 3 of 10. morpho and compound-v2 don't have it at all | The corroboration flag is decided at query time, not in config. **NOT_CHECKED is a legitimate third state** |
| 4 | **Read at the block the subgraph WROTE the value, then assert exact equality.** `totalSupply()` accrues ~31.5 USDC/block from `block.timestamp`; the subgraph only writes on an event | ⚠️ **Overturns §5.14's tolerance framing.** A tolerance wide enough to absorb accrual is wide enough to hide the error the check exists to catch |
| 5 | **Archive RPC is mandatory.** aave-v2's write-time block was 8,285 blocks back — 27.7 hours — while aave-v3's was 0–1. A pruned node keeps ~128 | Alchemy confirmed archive to block 1. The correct block depends on how recently that **market** traded |
| 6 | **Snapshots survive pruning completely** — readable to Aave v3 genesis, no floor | Settlement on named dates works. Balance metrics have a home |
| 7 | **Zero block spread across five deployments, every run.** §5.15 sized the common window at ~100–120 min expecting drift | Keep `blockwindow.ts` — the rule is right — but the per-protocol-asof fallback may be dead code |
| 8 | **Five parallel gateway requests returned four ETIMEDOUT once**, 5/5 on retry | Retry is not optional in `client.ts` |

**Already caught something real:** Morpho disagrees with its own contract on 2 of 3 top markets,
identically at both blocks so it isn't drift. One difference is exactly −10,000,000. Reached
independently from the chain, on the same deployment we'd flagged by cross-protocol comparison.

---

## The protocol set

| Slug | Schema | Revenue | Corroboration | Notes |
|---|---|---|---|---|
| `aave-v3-ethereum` | 3.1.0 | 🔴 poisoned | ✅ all markets | $24.8B. The flagship, and its revenue is unusable |
| `aave-v2-ethereum` | 3.1.0 | ✅ usable | ✅ all markets | $97M — wound-down legacy. **Byte-identical schema to v3; this pair is the G1.5 claim** |
| `compound-v3-ethereum` | 3.1.0 | ✅ usable | ⚠️ base-asset only | $1.88B. 3 of 10 markets corroborable |
| `compound-v2-ethereum` | 2.0.1 | ✅ usable | ❌ none | $117M. **The version-gap proof — same document, one schema version behind** |
| `morpho-blue` | 3.0.0 | ❌ not_tracked | ❌ none | $13.06B reported, ~$3.65B plausible. Non-Messari deployment, standardized template |

⚠️ **aave-v2 at $97M against aave-v3's $24.8B is a wound-down deployment.** Fine as a data source and
essential to the G1.5 claim, but a report presenting them as peers would be misleading. The adapter
should carry that.

---

## The units, in order

Each is one commit. **Nothing is built ahead.** Ceilings from `CLAUDE.md` apply — LOGIC files ~120
lines, split before writing if longer.

### 1 · `src/types/wire.ts` — SCAFFOLD, ~80 lines

The contracts between subsystems, frozen. `Report`, `Computed`, `Verdict`, `Provenance`, plus the
three-state flags Phase 0 taught us: `RevenueAvailability`, `CorroborationStatus`, `Completeness`.

⚠️ **Freeze only what we know.** `Claim`, `QuestionSpec`, `Entitlement`, `Job` are Phase 3–4 and get
versioned separately with migrations.

*Proof:* typechecks, and every downstream unit imports from here rather than defining its own shapes.

### 2 · `src/config/protocols.ts` — SCAFFOLD, ~90 lines

One row per deployment: slug, subgraph ID, network, schema version, lending type, revenue
availability, and the semantic notes from finding #1.

⚠️ **Revenue availability is config; corroboration is NOT** — that's per-market and decided at query
time (finding #3).

*Proof:* five rows, typed, and adding a sixth is visibly one row.

### 3 · `src/graph/client.ts` — **LOGIC**, ~110 lines ★

`querySubgraph(slug, document, variables, block?)`. Plain `fetch`, always requests `_meta`, returns
`{ data, meta, evidence }`.

Carries: **one retry on timeout** (finding #8), and error branching that distinguishes PRUNED from
LAGGING on the exact error strings.

> **This is the file the whole build rests on.** Phase 4's settlement calls this same function — that
> reuse is what makes The Graph load-bearing end to end (G2.1). Read it line by line.

*Proof:* replaces SM-02's inline fetch and the five-protocol query still works.

### 4 · `src/graph/queries/` — SCAFFOLD, ~120 lines across files

The pre-written documents. Start with what SM-02 proved: the protocol-level balance sheet, plus a
market-level document and a snapshot-history document.

⚠️ **The agent selects a document and supplies variables. It never writes GraphQL.** That removes the
validation layer, removes `graphql` as a dependency, and removes the class of failure where a model
emits `PositionSide.LENDER` against a 3.1.0 deployment mid-demo.

⚠️ **The snapshot document needs a version guard.** compound-v2 is 2.0.1 and does not have the
3.x-only fields. Either the document omits them, or it dispatches on the deployment's *live*
`schemaVersion` — but it cannot assume them. **This is exactly the failure the pre-written-documents
decision exists to prevent**, so letting it in through the one document that reaches furthest back
would be self-defeating. Applies to any document that touches 3.x-only fields, not just this one.

*Proof:* every document runs against every deployment it claims to support — including the snapshot
document against compound-v2.

### 5 · `src/graph/blockwindow.ts` — **LOGIC**, ~60 lines

`lo = max(earliest_retained)`, `hi = min(head)`. Pin to `min(hi, acceptable_finality)` when
`lo ≤ hi`; otherwise **decline the comparison**.

Declining is a legitimate answer. A report silently comparing numbers from different moments is worse
than one that says it can't.

⚠️ Finding #7 says we've seen zero spread every time. Build it anyway — the rule matters on the day it
doesn't hold.

*Proof:* returns a block all five can answer at, and refuses when they can't.

### 6 · `src/graph/paginate.ts` — **LOGIC**, ~50 lines

`first ≤ 250`, stable ordering, deduplication, explicit completeness.

⚠️ **An incomplete population does not get a clean verdict.** It's marked `INCOMPLETE` and the
reconciliation withholds.

*Proof:* pulls >250 markets from aave-v3 and reports completeness honestly.

### 7 · `src/graph/adapter.ts` — **LOGIC**, ~110 lines ★★

**The unit Phase 0 reshaped most.** Not field renaming — a plausibility layer.

Per deployment:
- **Revenue availability** — three states. Poisoned and not_tracked **never render as a number.** Not
  zero, not a figure with an asterisk. "Not available for this deployment."
- **Utilization ceiling** — Morpho's 28 markets at exactly 100% are the marker
- **TVL/deposit reconciliation** — Morpho's collateral is absent from TVL
- **The oracle guard, per deployment** — `inputTokenPriceUSD == 0 && inputTokenBalance > 0` is a
  DATA_ERROR on Aave and a **false positive 337 times over** on Morpho, which derives deposit USD from
  the loan token
- **Schema-version dispatch** on the value the deployment *reports live*, never on config

*Proof:* Morpho's $13.06B comes back flagged, not silently accepted. compound-v2's missing 3.x fields
degrade rather than crash.

### 8 · `src/graph/evidence.ts` — SCAFFOLD, ~70 lines

**Two tiers, and the caller picks** (PLAN-v4 §5.18, decided 2026-09-06):

- **Record** *(default)* — deployment hash, document name, variables, block number, timestamp, row
  count, completeness, **hash of the response**. Small.
- **Record + raw response** — **settlement-backing queries only.** Any query whose result a market
  resolves against.

⚠️ **This resolves the tension rather than deferring it.** A hash proves *integrity* — this is the
response we saw — but not *content*. Once the source prunes at ~100 minutes the value cannot be
re-derived, and a re-run returns different data rather than the same data. Most queries never back a
market and a hash is enough for them; the few that do are exactly the ones where "what came back"
must be provable years later, so those keep the bytes.

⚠️ **The tier is a parameter, not an inference.** Phase 4's resolver passes it; report generation
does not. Inferring it from the query shape would mean a settlement quietly losing its proof because
a document got reused somewhere new.

⚠️ **Never read back as data.** Provenance only, in both tiers.

*Proof:* a default query produces a record whose hash matches a re-fetch at the same block; a query
flagged settlement-backing additionally stores bytes that reproduce the figures without the network.

### 9 · `src/graph/corroborate.ts` — **LOGIC**, ~100 lines ★

Read the contract at the block the subgraph **wrote** the value, assert exact equality (findings #3,
#4, #5).

Three outcomes, and the third is the honest one:
- **MATCH** — exact
- **MISMATCH** — a finding, with the delta
- **NOT_CHECKED** — this market has no write-time field

⚠️ **No tolerance.** Where the field is missing, say so — don't fall back to approximate agreement. A
check that silently weakens for some protocols is worse than one that admits its limits.

⚠️ **This is a disagreement detector, not an audit of The Graph** (PLAN-v4 §5.14, amended
2026-09-06). The plan originally framed the RPC as verifying the subgraph. The first thing the check
found was Morpho disagreeing with its own contract — identically at both blocks, so not drift. A
`MISMATCH` reports *these two sources disagree, by this much, here*. **Which side is wrong is
per-deployment and sometimes open**, and that judgement belongs in the deployment's semantic notes,
not in this file.

Needs `ETHEREUM_RPC_URL`, archive-capable, already in `.env`.

*Proof:* aave-v3 matches to the unit; compound-v3 returns NOT_CHECKED on 7 of 10 markets; Morpho's
known mismatch reproduces.

⚠️ **The Morpho reproduction is expected, not proven.** SM-04 read Morpho through a throwaway path —
a direct `market(bytes32)` call against Morpho Blue, decoded inline. Unit 9 reaches it through
`client.ts` and `adapter.ts`. Same numbers *should* come out. **If they don't, that is a finding
about our path, not about Morpho** — and it is worth more than the reproduction would have been,
because it means the adapter is changing a value on its way through. Do not tune anything to make it
reproduce.

### 10 · `src/agent/loop.ts` — **LOGIC**, ~100 lines

The Claude tool-use loop, promoted from SM-06. A `while` over `stop_reason === "tool_use"`. Not a
framework.

⚠️ **One invocation, one model turn.** The full `messages[]` persists between turns — Vercel gives 300
seconds and a multi-turn report won't fit in one.

*Proof:* SM-06's question works through the real client.

### 11 · `src/agent/tools.ts` — SCAFFOLD, ~80 lines

**Exactly two tools:** `run_document(slug, documentId, variables)` and `get_capabilities(slug)`.

No free-form GraphQL, no URLs. `get_capabilities` is how the agent learns a deployment's revenue is
poisoned before quoting it.

*Proof:* the agent asks about revenue on aave-v3 and is told it's unavailable rather than handed
$279 quadrillion.

### 12 · Multi-protocol fan-out — **LOGIC**, ~60 lines

`Promise.all`, not a loop. ~200ms of pure network per gateway call; five sequential is 2.2s before any
work.

⚠️ Budget model turns, tokens, rows, response bytes, per-provider deadlines and total runtime — not
just a query count.

*Proof:* all five deployments at a common block, one call, under a second.

---

## Then, and only then

### 13 · `scripts/vet-protocol.ts` — **LOGIC**, ~120 lines

Point it at a subgraph ID, get a verdict. It's the Phase 0 smoke tests consolidated: does the document
run, is revenue sane, does TVL reconcile externally, does the contract agree.

**Built here rather than earlier** because it composes `client.ts`, `adapter.ts` and `corroborate.ts`
rather than duplicating them.

> This is what makes "add a protocol via one config line" honest. The line is about the query working.
> Vetting is about the numbers being right, and they're different claims.

*Proof:* run against a protocol not in our set and get a truthful verdict.

### 14 · Subgraph MCP — **LOGIC**, ~80 lines. Optional.

Anthropic's `mcp_servers` pointed at `subgraphs.mcp.thegraph.com/sse`. Gives keyword search across
~15,000 subgraphs, deployments by contract address, and schema introspection.

⚠️ Two unknowns: the connector is tools-only, and The Graph's docs say a "Subgraph Server Instructions"
resource is needed for it to work well — which the connector can't fetch, so we'd inject it. And U7
asks whether `mcp_toolset` is required alongside `mcp_servers`. **Verify before building.**

**Why it's worth it:** it satisfies the *other* branch of G1.1 — composing two Graph products — so we'd
qualify both ways rather than one. And "ask for a protocol we never configured, watch it find one" is
a real demo beat.

**Cut without consequence** if Phase 1 runs long. The standardized-schema branch already qualifies.

### 15 · Revenue fix — **LAST. Deliberately.**

Deploy a corrected Messari subgraph fixing aave-v3's accumulator, and implement Morpho's revenue from
`Market.interest`, which is present but never converted or aggregated.

⚠️ **Unmeasured indexing time.** Could be an hour, could be days. Messari's mappings build `Market`
entities from initialization events at protocol deployment, so a late `startBlock` may produce a
subgraph that indexes cleanly and returns nothing — a failure that looks like success until you
query it.

⚠️ **No smoke test covers this.** It is an open question, not something Phase 0 established — SM-07
tested ATS issuance and transfer on Hedera and has nothing to say about subgraph indexing. The risk
is recorded in `tracking/DECISIONS.md` under *"Morpho via its own published subgraph"*, as the
reason that alternative was rejected. **Nothing scheduled measures it**, which is part of why this
unit is last.

**Placed last so that if it stalls, Phase 1 is already complete and we move to Phase 2 and come back.**

Three protocols already have trustworthy revenue. That's enough for real reports. This makes it five,
and it's also G1.4 — "authoring or extending a Standardized Subgraph" — which we'd otherwise skip.

---

## Requirements this phase closes

| # | Requirement | Closed by |
|---|---|---|
| **G1.1** | Standardized schema, meaningfully | Units 2–4. Unit 14 adds the composition branch too |
| **G1.2** | Live data, no mocks or local index | Unit 3. **Nothing is cached as a source** |
| **G1.3** | More than one subgraph | **Five deployments configured and queried across three schema versions; four carry figures a report will publish** |
| **G1.5** | ⚠️ Standards leverage **demonstrated** | The one-row demo. **Rehearse it — pass/fail** |
| **G2.1** | The Graph load-bearing | Unit 3, and Phase 4 calls the same function |
| G1.4 | Authoring/extending a standardized subgraph | Unit 15, if it lands |
| G2.3 | Meaningful work — reasoning, decisions | **Not this phase.** Phase 2 reconciles, Phase 4 commits money |

---

## How to know it's going right

**On track:** you can point at any returned figure and trace it to a deployment hash and block.
Morpho's numbers arrive flagged rather than silently accepted. Adding a protocol is genuinely one row —
try it once and confirm.

**Drift signals:**

- **Per-protocol special cases scattered through the query layer.** One dispatch in the adapter is
  fine. Three elsewhere means the standardization claim is hollow and a judge will find it.
- **The agent generating query strings.** That's the design boundary.
- **`_meta` dropped from a query.** Every query, always — no freshness signal, no deployment hash, no
  way to detect a republish later.
- **Caching subgraph responses for speed.** Breaks G1.2. Persist evidence; never read it back as a
  source.
- **A tolerance appearing in `corroborate.ts`.** Finding #4 exists precisely to prevent this.
- **A poisoned revenue figure rendering as a number.** Including zero. Especially zero — Morpho's
  $0 against $11.4B borrowed looks like an answer, which is more dangerous than $279 quadrillion
  because nobody believes the quadrillion.
- **A commit touching `engine/`.** That's Phase 2.

---

## Carried into later phases

From Phase 0's to-dos, so they don't get lost:

| Item | Phase |
|---|---|
| Spend cap on the Circle wallet set — console policy, not code | Before anything autonomous on Arc |
| `msg.value` ÷ 10¹² at the contract boundary — **measured, not assumed** | 4 |
| Arc mirrors native transfers as synthetic ERC-20 events carrying 18-dec amounts while the token reports 6 | 4 |
| `eth_getLogs` real limits: 30,000 blocks / ≥38,952 results, not the 10,000/20,000 the errors claim | 4 |
| Circle returns `{ id, state: INITIATED }` — poll, don't await a hash. 4.4s observed, single sample | 4 |
| SM-09's `next build` half | 4 |
| Morpho's `InterestRate.rate` identical for borrower and lender on the two mis-mapped markets — **impossible in a working market**, since the spread is where revenue comes from | 1 or 2, before rates reach a report |

# Phase 1 — Task by Task

*The agent can see.*

By the end: a directive in plain English produces correct data from multiple lending protocols, pinned
to one block, with every figure carrying an honest flag about whether it can be trusted.

The shape of the phase is **connect, then bound.** Connect is the plumbing — config, client, query
documents, pagination, block alignment. Bound is what stops an agent publishing a number we can't
stand behind.

---

## Status

| Unit | File | Kind | Status |
|---|---|---|---|
| 1 | `types/wire.ts` | SCAFFOLD | ✅ done |
| 2 | `config/protocols.ts` | SCAFFOLD | ✅ done |
| 3 | `graph/client.ts` | LOGIC ★ | ✅ done |
| 4 | `graph/queries/` | SCAFFOLD | ✅ done |
| 5 | `scripts/sweep-protocols.ts` | LOGIC | ✅ done |
| 6 | `scripts/triage-protocols.ts` | LOGIC | ✅ done |
| 7 | `graph/paginate.ts` | LOGIC | ✅ done |
| 8 | `graph/blockwindow.ts` | LOGIC | ✅ done |
| 9 | `graph/corroborate.ts` | LOGIC ★ | ✅ done |
| 10 | `graph/adapter.ts` | LOGIC ★★ | ✅ done |
| 11 | `graph/evidence.ts` | SCAFFOLD | ✅ done |
| 12 | `agent/loop.ts` | LOGIC | ✅ done |
| 13 | `agent/tools.ts` | SCAFFOLD | ✅ done — **all 13 required units complete** |
| 14 | `scripts/vet-protocol.ts` | LOGIC | optional |
| 15 | Subgraph MCP | LOGIC | optional |
| 16 | Deploy Morpho Blue | — | optional |
| 17 | Revenue fix | — | optional |

**Development set:** the five deployments triage cleared — aave-v2, aave-v3, compound-v2, compound-v3,
spark-lend. All 28 stay configured with verdicts attached.

---

# Unit 1 — `types/wire.ts`

**SCAFFOLD, ~80 lines** · ✅ done

**What we're doing:** agreeing on the vocabulary before anyone writes code. Every file needs to mean
the same thing by "a report," "a verdict," "revenue we can't trust." Freezing it now means twelve files
can't drift apart later.

**What's in it:** type definitions, no logic. `Report`, `Computed`, `Verdict`, `Provenance`, plus the
flags Phase 0 forced — revenue availability, corroboration status, completeness.

**The one real decision:** two shapes, not one. Flags live on `Computed` and get dropped on the way to
`Report`. ⚠️ If judgment were inside the hash, improving the adapter later would change the hash of a
report whose numbers never moved — and a market on Arc holding the old hash couldn't verify it.

---

# Unit 2 — `config/protocols.ts`

**SCAFFOLD, ~200 lines** · ✅ done

**What we're doing:** writing down every lending subgraph we might query, so nothing downstream
hardcodes an ID. Adding a protocol becomes adding a row — which is literally the G1.5 demo.

**What's in it:** 28 rows. Slug, subgraph ID, live schema version, lending type, revenue availability,
triage verdict, status, last swept.

⚠️ **Columns stay null rather than guessed.** A value that came from a model's memory is
indistinguishable from one that came from a query three weeks later.

---

# Unit 3 — `graph/client.ts`

**LOGIC ★, ~130 lines** · ✅ done

**What we're doing:** actually connecting to The Graph. One function that takes a protocol name and a
question, hits the gateway, returns the answer.

> **This is the file the whole build stands on.** Phase 4's market settlement calls this same function
> — that reuse is what makes The Graph load-bearing end to end.

**What's in it:** `querySubgraph()` plus a fan-out sibling using `Promise.all` with per-protocol error
isolation. Always requests `_meta`. One retry on timeout. Three distinct failure modes — bad key,
GraphQL error inside a 200, and "no indexers found."

⚠️ **PRUNED vs LAGGING** distinguished on the exact error strings. Both contain "only" and "block
number," so match the full phrase.

**What it found:** six of 27 deployments report a different schema version than Messari's config
claims — including two we thought we'd already tested.

---

# Unit 4 — `graph/queries/`

**SCAFFOLD, ~100 lines** · ✅ done

**What we're doing:** writing the questions in advance, so the agent picks from a menu instead of
composing GraphQL. A model can't emit a field that doesn't exist if it never writes the query.

**What's in it:** `balance-sheet.ts`, `markets.ts`, `snapshots.ts`, and an `index.ts` holding the
registry the agent's `documentId` resolves against.

**What it found:** the intersection is wide — `LendingProtocol` shares 25 fields across all five live
versions, `Market` 31, `FinancialsDailySnapshot` 21. **One document covers every version unchanged.**
No dispatch mechanism needed.

⚠️ And the null premise was backwards. A missing field doesn't return null — GraphQL validates the
document and fails the whole query loudly. Nulls indicate something else: a field that exists and was
never written.

---

# Unit 5 — the sweep

**LOGIC, ~90 lines, throwaway** · ✅ done

**What we're doing:** finding out how many of the 28 actually work. We'd been quoting inventory numbers
having tested five.

**What's in it:** run the balance sheet against every deployment in parallel. Record who answers, the
live schema version, deposits and borrows, block lag, indexing errors. Write results back into config.

**What it found:** **25 of 28 answered in 1.2 seconds.** Live versions: 3.1.0 (9), 2.0.1 (9), 3.0.1
(3), 1.3.0 (3), 3.0.0 (1). Zero nulls.

Also: nine deployments hold under $1M, five are effectively empty. **The inventory is 27; the usable
universe is much smaller.**

---

# Unit 6 — triage

**LOGIC, ~120 lines, throwaway** · ✅ done

**What we're doing:** the sweep asked who answers. This asks whose numbers we can publish. Answering
isn't the same as being right — aave-v3 answers beautifully and its revenue reads $279 quadrillion.

**What's in it:** four checks per deployment. External reconciliation against DefiLlama, internal
plausibility (utilization above 100%), snapshot availability, revenue sanity. A verdict written back
to config.

**What it found:** **3 publishable, 11 flagged, 11 unusable.**

> The most useful thing it did was **rediscover Phase 0's protocol set blind.** Run across 25
> deployments with no knowledge of what we'd picked by hand, it landed on the same four. The set
> wasn't luck.

And it found a fifth — spark-lend reconciles to 1.2%. We'd excluded it on curation signal, not data
quality.

⚠️ **The poisoned accumulator is a template fault, not one deployment.** spark-lend reads $1.20e17
against aave-v3's $2.79e17 — same Messari template, same fault twice.

⚠️ **Eight deployments have no recent history** while reporting live balance sheets. That's
disqualifying for anything period-based, which is how markets settle.

---

# Unit 7 — `graph/paginate.ts`

**LOGIC, ~60 lines** · ✅ done

**What we're doing:** getting all the rows, not the first page.

**What's in it:** page at 250 on `id_gt` with stable ordering. Dedupe. A budget so a runaway query
can't page forever.

> **The whole flag rests on one line:** `complete` requires a *short* page. A full page proves nothing
> — it can't distinguish "the end" from "more to come."

**What it found:** morpho-blue has 1,759 markets, rari-fuse 823. ⚠️ **Not one of the five publishable
deployments exceeds a single page** — largest is aave-v3 at 67.

And `blockDrift`: an eight-page walk saw 5 blocks pass between first page and last. A total summed
across them blends two states.

---

# Unit 8 — `graph/blockwindow.ts`

**LOGIC, ~60 lines** · ✅ done

**What we're doing:** making a cross-protocol comparison read every deployment at the same moment.

**What's in it:** `hi` is the lowest head, `lo` is the highest head minus a retention floor. If
`lo > hi`, **decline** — no per-protocol-as-of fallback.

⚠️ **Retention floor is 300 blocks — the tightest deployment, not the loosest.** aave-v3 retains
439,844; the other four retain 300–600. Using aave-v3's window would pin a block four of five can't
answer.

Finality costs a fifth of the window at head−64. Taken anyway: a report invalidated by a reorg is
unrecoverable and may already have settled a market; 13 minutes of staleness is merely stale.

**What it found:** `_meta.block.number` is **one indexer's head, not the deployment's.** aave-v2 has
ten indexers with a 57,859-block spread, one eight days behind. Every "zero spread" reading was
measuring something narrower than we thought.

That exposed a real bug in `client.ts` — `classify()` read only the first indexer and decided
PRUNED vs LAGGING from it, so a permanent condition was reported as "wait and retry."

---

# Unit 9 — `graph/corroborate.ts`

**LOGIC ★, ~100 lines** · ✅ done

**What we're doing:** checking The Graph against the blockchain itself. Everything a subgraph tells us
comes from the same mapping code, so a wrong number stays wrong however often we ask.

⚠️ **A disagreement detector, not a one-way audit.**

**What's in it:** read the contract at the block the subgraph **wrote** the value — not the current
block, because `totalSupply()` accrues ~31.5 USDC per block while the subgraph only writes on an event.
Then assert **exact equality, no tolerance.**

> A tolerance wide enough to absorb interest accrual is wide enough to hide the errors this check
> exists to catch.

Three outcomes: `match`, `mismatch`, `not_checked`. ⚠️ NOT_CHECKED is a legitimate answer, not a
failure.

**What it found:** **3 for 3 exact matches on the aave family, to the last wei.**

And a correction — `outputToken.id` points at the cToken on compound-v2, while `inputTokenBalance` is
the *underlying* balance. Comparing them directly is off by ~50×. Also, compound-v3 exposes the
write-time field on **no** markets, not 3 of 10; the plan had conflated "has base-asset markets" with
"the field exists."

---

# Unit 10 — `graph/adapter.ts`

**LOGIC ★★, ~110 lines** · next

**What we're doing:** encoding what we learned about each deployment's quirks, so the agent never
publishes a number we can't stand behind.

⚠️ **The unit Phase 0 changed most.** It was going to rename fields. Instead it judges plausibility.

**What's in it:**

**Revenue availability**, four states. `poisoned`, `not_tracked` and `not_in_schema` never render as a
number — **not even zero.** Morpho's $0 against $11.4B borrowed reads as an answer, which is more
dangerous than $279 quadrillion because nobody believes the quadrillion.

**Utilization ceilings.** Markets at exactly 100% — every dollar supplied borrowed to the cent, which
no real market does. Not Morpho-specific; makerdao has two.

**TVL reconciliation.** Morpho's collateral is absent from its total, which is the 3.6× inflation.

**A per-deployment oracle guard.** `inputTokenPriceUSD == 0 && inputTokenBalance > 0` is a real
`DATA_ERROR` on Aave and a **false positive 337 times over** on Morpho.

**Version dispatch on what the deployment reports live**, never on config.

---

# Unit 11 — `graph/evidence.ts`

**SCAFFOLD, ~70 lines**

**What we're doing:** recording what we looked at, so a figure can be traced back to a specific query
at a specific block months later.

**What's in it:** a small record per query — deployment hash, document name, variables, block, row
count, response hash. Deliberately concise.

⚠️ **Raw responses only when a query backs a market settlement.** That's the one case where "what came
back" must be provable after the source has pruned. Set by the caller, not inferred.

---

# Unit 12 — `agent/loop.ts`

**LOGIC, ~100 lines**

**What we're doing:** letting Claude drive. It asks for data, our code fetches it, we hand it back, it
answers. Proven in SM-06 — this is the permanent version.

**What's in it:** a `while` loop over `stop_reason === "tool_use"`. Not a framework.

⚠️ **One invocation, one model turn.** The conversation persists between turns — Vercel gives 300
seconds and a full report won't fit in one.

---

# Unit 13 — `agent/tools.ts`

**SCAFFOLD, ~80 lines**

**What we're doing:** defining exactly what the agent is allowed to ask for. **Two tools, no more.**

**What's in it:** `run_document(slug, documentId, variables)` and `get_capabilities(slug)`. No
free-form GraphQL, no URLs.

⚠️ `get_capabilities` is how the agent learns aave-v3's revenue is unusable **before** quoting it.

---

# Optional — 14 to 17

Phase 1 completes without these.

## Unit 14 — `scripts/vet-protocol.ts`

**LOGIC, ~120 lines**

Point it at any subgraph ID and get a verdict. Units 5 and 6 consolidated, built here because it
**composes** the client, corroborator and adapter rather than duplicating them.

> What makes "add a protocol via one config line" honest. The line is about the query working. Vetting
> is about the numbers being right.

## Unit 15 — Subgraph MCP

**LOGIC, ~80 lines**

Lets the agent search ~15,000 subgraphs and find protocols we never configured. Satisfies the **other**
branch of the composability requirement, so we'd qualify both ways.

⚠️ The connector is tools-only, and The Graph's docs say a "Subgraph Server Instructions" resource is
needed — which the connector can't fetch. **Verify before building.**

**Cut without consequence.**

## Unit 16 — deploy Morpho Blue

Separate directory, background. Puts Morpho on the same document as everything else and ticks G1.4.

⚠️ **Unmeasured indexing time.** Messari's mappings build `Market` entities from initialization events
at deployment, so a late `startBlock` may produce an empty subgraph.

## Unit 17 — the revenue fix

Deploy a corrected subgraph fixing the poisoned accumulator and implementing Morpho's revenue from
`Market.interest`.

⚠️ **Blast radius is larger than one deployment** — spark-lend has the same fault. It's the template's
problem.

**Three protocols already have clean revenue**, so Phase 1 completes without this. Last so a stall
doesn't block the phase.

---

## Requirements this phase closes

| # | Requirement | Closed by |
|---|---|---|
| **G1.1** | Standardized schema, meaningfully | Units 2–4. Unit 15 adds the composition branch too |
| **G1.2** | Live data, no mocks or local index | Unit 3. Nothing is cached as a source |
| **G1.3** | More than one subgraph | 25 deployments answering, five live schema versions |
| **G1.5** | ⚠️ Standards leverage **demonstrated** | The one-row demo. **Rehearse it — pass/fail** |
| **G2.1** | The Graph load-bearing | Unit 3, and Phase 4 calls the same function |
| G1.4 | Authoring/extending a standardized subgraph | Units 16–17, if they land |
| G2.3 | Meaningful work — reasoning, decisions | **Not this phase.** Phase 2 reconciles, Phase 4 commits money |

---

## Drift signals

- **Per-protocol special cases scattered through the query layer.** One dispatch in the adapter is
  fine. Three elsewhere means the standardization claim is hollow.
- **The agent generating query strings.** That's the design boundary.
- **`_meta` dropped from a query.** Every query, always.
- **Caching subgraph responses for speed.** Breaks G1.2. Persist evidence; never read it back.
- **A tolerance appearing in `corroborate.ts`.**
- **A poisoned revenue figure rendering as a number.** Including zero. Especially zero.
- **A commit touching `engine/`.** That's Phase 2.

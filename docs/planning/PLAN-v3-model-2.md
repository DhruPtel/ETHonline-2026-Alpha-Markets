# PLAN.md — v3 (build spec)

**Project:** Kessan — earnings season for DeFi
**Event:** ETHOnline 2026 · **Deadline: Sunday Sept 13, 12:00pm EDT**
**Supersedes:** `PLAN-v2.md`, `AMENDMENT-01.md`, `AMENDMENT-02.md` — all folded in here.
**Requirements verified** against `ethglobal.com/events/ethonline2026/prizes`, Sept 5 2026.

> **Organizing principle: track requirements are law. The build conforms to them.**
> Where the build and a requirement conflict, the requirement wins and the build changes.

---

## 1. What we're building

Crypto has no earnings season. Nobody is paid to do fundamental analysis on protocols, so nobody does.

Kessan creates the incentive: an AI analyst agent takes a free-text directive, composes GraphQL against
Messari standardized lending subgraphs, runs a deterministic reconciliation, and publishes a financial
report. Reports sell behind an x402 gate on Hedera mainnet and are issued as tokenized assets via ATS
on Hedera testnet. A prediction market on Arc takes USDC stakes. **Analysts precommit a claim on their
own reports, and settlement scores those claims** — accurate analysis earns, sloppy analysis loses.

**One Next.js app on Vercel.** No separate backend, no long-running worker, no local index of chain
data.

**Scope: lending protocols only.**

**The bar: it works when we walk away.** Hosted, no scripts to run, a stranger opens the URL.

### Chains, and why each

| Network | Runs | Why |
|---|---|---|
| **Hedera mainnet** | x402 report payments | Real money is the point. Track accepts testnet or mainnet |
| **Hedera testnet** | ATS report tokens | **The track requires testnet** |
| **Arc testnet** | Market, stakes, settlement | **Arc mainnet launches Sept 16 — three days after our deadline** |
| Ethereum mainnet | *(read only)* | The source chain our subgraphs index |

One sentence for judges: *"Payments run on Hedera mainnet because real money is the point.
Tokenization is on Hedera testnet because that's what the track asks. Arc is testnet because Arc
mainnet launches three days after this deadline — the code switches with one env var."*

---

## 2. Rules of engagement

### Process

1. **No mid-session replanning.** When something breaks: take the pre-written branch from §9, or take
   the dumbest thing that unblocks and write one line in `DECISIONS.md`. Replanning happens at session
   boundaries only.
2. **Every risk carries a branch.** Trigger → box → branch A → branch B. If it can't be written that
   way it's an anxiety, not a risk.
3. **Deployed from Day 2 and stays deployed.**
4. **Every demo action is a UI click.** If it needs a terminal, it isn't done.
5. **Pass/fail requirements (§4) are protected absolutely.** Judged requirements get effort
   proportional to time remaining.
6. **Session start:** paste `PLAN.md`, `DECISIONS.md`, `STATE.md`. Never rely on chat history.
7. **All planning artifacts ship in the repo** — plan, amendments, prompts, research. Required by the
   spec-driven-workflow rule.

### Commit protocol

> **One commit = one thing you can read in a sitting, and one thing that works.**
> **If either half fails, the unit was too big.**

**The loop:** I state the unit (what file, what it does, ~lines, what proves it) → written into
`STATE.md` under `## Current unit` → you approve or resize → I write → you read → it commits.

| Kind | Ceiling |
|---|---|
| **LOGIC** file | **~120 lines.** Over that, split *before* writing |
| **SCAFFOLD** (types, config, schema) | One file per commit |
| **Contract** | One contract, **tests in the same commit** |
| **Script / smoke test** | One per commit — yes, these commit too |
| **Any commit** | **Never two subsystems** — *unless* it's a single atomic interface change plus its consumer, which must land together |

**The red flag:** if I'm about to touch a file I didn't name in the unit, I stop and re-state. Either of
us can call it.

**Cadence:** ~4–8 commits/day. That's our convention for keeping units small — the *rule* is meaningful
version history, and large single commits can disqualify.

**Commit format** — attribution lives here, so `AI_USAGE.md` is a summary of the log rather than an act
of memory:

```
<type>(<scope>): <what changed>

<why, if not obvious>

AI-assisted: <yes/no — which parts>
```

**What you read:** SCAFFOLD for shape, **LOGIC line by line.** ~12 LOGIC files across the build.
`reconcile.ts` is the product's credibility; `resolve.ts` is the oracle. If you can't explain those
cold, we have a problem regardless of commit shape.

---

## 3. Requirements as law — traceability

**Slots: 3 partner prizes. Multi-track partners count as one selection (confirmed).**

| Slot | Partner | Prizes | Ceiling |
|---|---|---|---|
| 1 | The Graph | Composable/Standardized · AI (From Scratch) | $5,000 |
| 2 | Hedera | AI & Agentic Payments · Tokenization of Anything | $4,000 |
| 3 | Arc | DeFi/Onchain Finance · Agentic Economy · Testnet→Mainnet | $5,834 |

**Seven prizes across three slots.** Ceiling ~$14,834.

### The Graph — Composable or Standardized

| # | Requirement | Satisfied by | Type |
|---|---|---|---|
| G1.1 | Compose 2+ Graph products **OR** build meaningfully on a standardized schema | Messari standardized lending schema across N deployments | **PASS/FAIL** |
| G1.2 | Consume live data from a Graph provider. Mocked/local-only/static do not qualify | `querySubgraph()` hits the gateway at request time, including at settlement | **PASS/FAIL** |
| G1.3 | One subgraph with no composition/standardization does not qualify | ≥2 protocols minimum (5 targeted), `schemaVersion`-dispatching adapter | **PASS/FAIL** |
| G1.4 | Authoring/extending a Standardized Subgraph is **in scope** | `prune: never` fork — ⚠️ **gated on SM-7** | Optional |
| G1.5 | **Make the standards leverage clear** — show what became easier | Live: add a protocol via one config line. README: byte-identical schema sha256 | **PASS/FAIL** ⚠️ *sits under qualification requirements, not judging* |
| G1.6 | Public repo + 2–4 min video | Day 9 | **PASS/FAIL** |

### The Graph — AI Tooling or AI Use Case (**From Scratch**)

| # | Requirement | Satisfied by | Type |
|---|---|---|---|
| G2.1 | The Graph is **load-bearing** — the agent's source of blockchain data | Every report and every settlement reads The Graph. RPC corroboration is *verification of* that source, not a second source | **PASS/FAIL** |
| G2.2 | Live data from a Graph provider | Same as G1.2 | **PASS/FAIL** |
| G2.3 | **Meaningful work** — reasoning, decisions, automation. Not printing a query result | Directive → plan → reconciliation → verdict → the agent precommits a claim and stakes its own USDC | **PASS/FAIL** |
| G2.4 | ⚠️ **Conditional:** *if* presenting tooling, it must be reusable infrastructure | The `messari-lending` skill. **The app alone is a valid entry — this is not a second prize** | Conditional |
| G2.5 | Open source, README/SKILL.md judges can run | Day 9 | **PASS/FAIL** |
| G2.6 | Select the pool — **Start Fresh** | ⚠️ Covers prior **designs and assets**, not only code | **PASS/FAIL** |

### Hedera — AI & Agentic Payments

| # | Requirement | Satisfied by | Type |
|---|---|---|---|
| H1.1 | Live x402-gated service on Hedera testnet **or** mainnet | `app/api/reports/[id]/route.ts` on Vercel | **PASS/FAIL** |
| H1.2 | **Settled through the Blocky402 facilitator** | `api.blocky402.com` (mainnet) / `api.testnet.blocky402.com` | **PASS/FAIL** |
| H1.3 | A platform or agent consuming it, **≥1 real paid request end to end** | Buyer agent pays for a report. **Must execute on camera** | **PASS/FAIL** |
| H1.4 | Repo + README covering setup, architecture, **payment flow** | Dedicated section | **PASS/FAIL** |
| H1.5 | Video ≤5 min showing the paid request executing | Same 2–4 min video | **PASS/FAIL** |
| H1.6 | *Extra:* metering rather than flat charge | ⚠️ Price must tie to a **measurable requested unit** — protocol count × depth. Flat tiers don't prove it | Judged |
| H1.7 | *Extra:* HTS in the settlement path | USDC `0.0.456858` is HTS | Judged |

### Hedera — Tokenization of Anything

| # | Requirement | Satisfied by | Type |
|---|---|---|---|
| H2.1 | Use ATS (**SDK, contracts, web app, or combination**) to issue or manage a tokenized asset | `@hashgraph/asset-tokenization-contracts` + ethers. **Contracts count** | **PASS/FAIL** |
| H2.2 | **Deploy and demonstrate on Hedera testnet** | ATS infra + per-report assets | **PASS/FAIL** |
| H2.3 | Repo, contracts **verified on HashScan where applicable** | Verify after deploy | **PASS/FAIL** |
| H2.4 | Video ≤5 min showing **issuance, configuration, and ≥1 lifecycle operation** | ⚠️ **Configuration must be shown**, not just issuance + transfer | **PASS/FAIL** |
| H2.5 | *Extra:* a secondary market ATS lacks | ⚠️ **Currently unearned.** Issuer→first-buyer is a *primary* sale. Either build resale or stop claiming it | Judged |

### Arc — three prizes, shared deliverables

**All three require:** working frontend **and** backend · architecture diagram · video +
presentation on **effective use of Circle's developer tools** · detailed documentation · repo link.
All **PASS/FAIL**.

| # | Requirement | Satisfied by | Prize |
|---|---|---|---|
| A1 | Agents with **decision logic tied to real signals** | Reconciliation output → claim → stake side | Agentic |
| A2 | **Autonomous spending/settlement in USDC** | Agent stakes without human approval | Agentic |
| A3 | **Agent Stack connecting agents to wallets and onchain actions** | `@circle-fin/developer-controlled-wallets` — the only named component available on Arc | Agentic |
| A4 | **Advanced programmable money flows** — conditional, automated, multi-step | Stake → conditional resolution from Graph data → parimutuel payout | DeFi |
| A5 | Meaningful use of Arc and USDC | Market, stakes, payouts | DeFi |
| A6 | **Deployed or deployment-ready on Arc mainnet by Sept 30** | ⚠️ **Not an env var and a README line.** Deployment parameters, wallet provisioning, permissions, funded operations and recovery must be **portable and demonstrated** | Mainnet |

### ETHGlobal global

| # | Requirement |
|---|---|
| E1 | **Start Fresh** — no prior project-specific code, **designs, or assets** |
| E2 | Meaningful version history; large single commits may disqualify |
| E3 | Be transparent about libraries and starter kits |
| E4 | **AI attribution** — which files, which parts. **Plus meaningful human contribution** |
| E5 | Spec-driven workflow → **all spec files, prompts, and planning artifacts ship** |
| E6 | Video 2–4 min, ≥720p, human voice, not phone-recorded. *Editing out waiting is permitted* |
| E7 | Max 3 partner prizes; multi-track = one selection |

---

## 4. The protection list — pass/fail

**Binary. Missing any one zeroes that track.**

```
□ Live data from a Graph provider — no mocks, no local index, no fixtures in the demo path
□ ≥2 protocols through one query pattern on the standardized schema (5 targeted)
□ Standards leverage DEMONSTRATED, not just claimed
□ Live x402-gated service on Hedera, settled through Blocky402
□ ONE REAL PAID REQUEST, executed on camera
□ ATS issuance on Hedera testnet
□ Contracts verified on HashScan
□ Video shows issuance AND CONFIGURATION AND a lifecycle operation
□ Working frontend AND backend
□ Architecture diagram
□ Arc mainnet readiness demonstrated — portable params, provisioning, permissions, recovery
□ Public repo, open source
□ Video 2–4 min, ≥720p, human voice
□ Start Fresh pool selected; no prior code, designs, or assets
□ Meaningful commit history
□ AI usage documented per file + meaningful human contribution evident
□ All planning artifacts in the repo
```

---

## 5. Core design decisions

**These were corrected after external review. They are the difference between a system that works and
one that moves money while measuring the wrong thing.**

### 5.1 Scoring — authors precommit; stakes are a trust signal

🔴 **The error we fixed:** `stake(marketId, side, reportRef)` lets a staker choose all three. Anyone
could tag a report to the side it *didn't* predict, and the scorer would credit a wrong report.

```
Report author publishes → optionally commits a Claim:
  { reportRef, marketId, side, committedAt, signature }
  MUST predate market close. Signed by the analyst wallet. One claim per report per market.

SCORING READS CLAIMS, NOT STAKES.
Stakes tagging a report = "how much capital backed this analysis" — counted separately.
```

- A report with **no claim is unproven**, not wrong.
- A report tagged on both sides by third parties is **still scored once, on its author's claim.**
- **Authors may decline to claim.** Not every report is a forecast.

### 5.2 Three scores, not one

| Score | Question | Source |
|---|---|---|
| **Reconciliation quality** | Did the tie-out hold? Was the data complete? | `engine/` at publication |
| **Forecast accuracy** | Did the author's committed claim come true? | Claim vs resolved outcome |
| **Trading return** | Did the stake win money? | Arc payouts |

> A correct report can support a losing forecast. A bad report can get a coin-flip right. Re-reading
> the same mapping reproduces its error perfectly.

### 5.3 The engine is pure; corroboration is an adapter

`src/graph/corroborate.ts` fetches the on-chain observation. `engine/checks/crosscheck.ts` receives
`{ subgraphValue, chainValue, block }` and compares. **`engine/` has no I/O.**

⚠️ **Compare compatible semantics with tolerances.** Subgraph fields refresh on events; token supply
accrues continuously. Indexed *through* block B ≠ every field *refreshed at* B. **Not every residual is
an economic defect.**

### 5.4 Invariants carry severity

The Messari 11 are **monitoring heuristics, not financial invariants.** Counterexample:

```
Deposit $100 → Borrow $80 → Repay $80 → Borrow $80
cumulativeDeposit $100 · cumulativeBorrow $160 · outstanding $80
Nothing is wrong. cumulativeDepositUSD ≥ cumulativeBorrowUSD FAILS.
```

Each check carries `{ severity, appliesTo, rationale }`:
`DATA_ERROR` (oracle zero) · `INCONSISTENCY` (Σmarkets ≠ protocol) · `SIGNAL` (borrow > deposit) ·
`INFORMATIONAL`. **Only `DATA_ERROR` blocks a report.**

### 5.5 Narration is structured, then rendered

`narrate(): string` cannot be prevented from returning "$900 billion." TypeScript can't constrain
string content.

**Every financial figure in the narration output is a reference to a computed metric ID.** The renderer
substitutes actual values deterministically. Non-numeric conclusions validated against the verdict enum.

### 5.6 The market commits a question specification

`bytes32 questionSpecHash` binds a canonical spec, stored off-chain:

```
deploymentHash · sourceChain · protocolSlug · entity · field · aggregation
threshold · unit · comparator · settlementKind
snapshotDay | eventRangeStart+End
missingDataRule · invalidationRule · resolverIdentity · methodologyVersion
```

A human question string and a later `proofHash` are **not** a resolvable specification. ⚠️ **If the
source subgraph is republished after market creation, the deployment hash no longer matches → the
market voids and stakes refund** (R17).

### 5.7 Jobs are durable, leased, and idempotent

There was no executor. `/api/commission` returned a jobId and nothing started generation.

```
report_jobs: id · state · directive · paymentRef · leaseUntil · attempts · result
PENDING_PAYMENT → QUEUED → RUNNING → COMPLETE | FAILED

Advanced by /api/cron (leased) OR the first stream request (leased).
NEVER an unbounded background promise — after() is bounded by the route's execution limit.
```

⚠️ **A stream reconnect must not start a second generation.** Lease before work.

### 5.8 The delivery guarantee, stated honestly

The two-endpoint split preserves **"no charge if we can't accept the job."** It does **not** preserve
"no charge if we fail to deliver." Once the job-acceptance response settles, later failure can't cancel
it.

**`FAILED` jobs get an explicit refund path** — a Hedera transfer from treasury, logged. Not silence.

### 5.9 Entitlement ≠ address lookup

"Does this address hold the token?" with a **user-supplied address** authenticates nothing.

`src/payments/auth.ts` — signed challenge, nonce, domain and network binding, expiry, single
consumption. **`gate.ts` consumes an entitlement; it does not establish one.**

### 5.10 The Buy tier is cross-network — journal it

Payment on Hedera **mainnet**; token transfer on Hedera **testnet**. Five unhandled states:

| Failure | Result |
|---|---|
| Payment ok, transfer fails | Paid, owns nothing |
| Transfer ok, payment fails | Asset gone, unpaid |
| Either ok, DB write fails | Chain and app disagree |
| Response lost after completion | Retry must not double-charge or double-transfer |
| Two buyers, one unit | One pays after inventory is sold |

**Inventory reservation + operation journal + retryable completion + explicit compensation.**
`onAfterSettle` is a hook, not a distributed transaction.

### 5.11 Spend control reserves, not checks

Check-then-increment races: two requests both read "$10 remaining," each spends $8.

**Reserve the maximum authorized spend before submission**, keyed by a durable operation ID; reconcile
after. **Ambiguous submissions stay reserved.** Covers gas, pending stakes, retries, both networks.

### 5.12 Resolution idempotency lives in Solidity

`require(!m.resolved)` **inside** `resolve()`. Reading the flag then acting is time-of-check/
time-of-use. Score writes are separately idempotent on `(marketId, reportRef)`.

### 5.13 Query evidence is persisted — provenance, not a cache

**We query The Graph directly, every time, including at settlement. No local index.**

After each query we persist a record: deployment hash, document, variables, block, `_meta`, raw
response, pagination completeness. **This record is never read back as data.** Its only job is
reproducibility — `prune: auto` means at ~500 blocks the source state is gone, so without the response
our settlement claim quietly becomes "trust us."

### 5.14 Types: freeze the wire, version the store

**Frozen Day 1** (subsystem contracts): `Report`, `Computed`, `Verdict`, `Provenance`.
**Versioned with migrations** (persisted): `Claim`, `QuestionSpec`, `Entitlement`, `Job`, `Purchase`,
`Score`. Each carries `schemaVersion`.

### 5.15 Settlement primitives — choose per question

| Primitive | Granularity | Survives prune | Use for |
|---|---|---|---|
| `block: { number: N }` | exact block | ❌ **~500 blocks** | nothing we rely on |
| `financialsDailySnapshots` | 1 day | ✅ | **balance metrics** — TVL, borrow balance |
| **immutable events** | exact block + logIndex | ✅ | **flow metrics** — volume, liquidations |

⚠️ **Events do not reproduce revenue.** Deposit/Borrow/Repay/Liquidate/Withdraw don't reconstruct
interest-accrual and fee accounting. Revenue questions settle on snapshots or not at all.

⚠️ **Snapshot survival ≠ snapshot finality.** The resolver needs a **completed** UTC interval and
evidence indexing progressed past it. **Missing rows must not become zero or false** — a no-activity
day needs an explicit rule; a halted deployment voids.

---

## 6. The repo

```
kessan/
├── README.md · PLAN.md · DECISIONS.md · STATE.md · AI_USAGE.md
├── package.json · .env.example · next.config.ts · vercel.json
│
├── docs/
│   ├── architecture.png / .svg          Required by all three Arc prizes
│   ├── research/                        14 repo evaluations — spec artifacts (E5)
│   ├── prompts/                         Review prompts — spec artifacts (E5)
│   └── submissions/                     One per bounty
│
├── contracts/                           Foundry. Arc only — no CUSTOM Hedera Solidity.
│   ├── src/KessanMarket.sol             (ATS Solidity does run on Hedera — it's theirs, not ours)
│   ├── test/KessanMarket.t.sol
│   └── script/Deploy.s.sol
│
├── skill/                               THE TOOLING ARTIFACT. One versioned source.
│   ├── SKILL.md                         messari-lending
│   ├── references/{version-matrix,query-cookbook,settlement}.md
│   ├── scripts/detect-version.mjs
│   └── eval/                            Golden outputs — what makes it tooling, not docs
│
├── scripts/                             ONE-SHOT. Local. Never in a route.
│   ├── smoke/                           SM-0 … SM-7
│   ├── provision-{circle,hedera}.ts
│   ├── deploy-{ats,market}.ts
│   └── seed-markets.ts
│
├── src/
│   ├── types/
│   │   ├── wire.ts                  ★ FROZEN — Report, Computed, Verdict, Provenance
│   │   └── store.ts                   VERSIONED — Claim, QuestionSpec, Entitlement, Job, Purchase
│   │
│   ├── config/                        chains · protocols · analysts · pricing
│   │
│   ├── graph/                       ═══ DATA ═══
│   │   ├── client.ts                ★ querySubgraph() — always requests _meta
│   │   ├── queries.ts                 The standardized document
│   │   ├── introspect.ts              Live schema, enum pinning, _*-stripping
│   │   ├── adapter.ts               ★ schemaVersion + lendingType dispatch
│   │   ├── evidence.ts                Canonical query-evidence serialization (§5.13)
│   │   ├── corroborate.ts             RPC observation fetch (§5.3)
│   │   ├── discover.ts                Subgraph MCP — protocols NOT in config
│   │   └── errors.ts                  PRUNED vs LAGGING
│   │      → gateway.thegraph.com · GRAPH_API_KEY
│   │
│   ├── engine/                      ═══ RECONCILIATION — pure, no I/O ═══
│   │   ├── reconcile.ts             ★ Tie-out, gap, verdict
│   │   ├── invariants.ts              Severity-tiered (§5.4)
│   │   ├── checks/crosscheck.ts       Receives observations, compares
│   │   ├── ops.ts                     net · rank · groupBy · ratio
│   │   └── claim.ts                   Extract a resolvable claim
│   │
│   ├── agent/                       ═══ THE ANALYST ═══
│   │   ├── analyst.ts               ★ Orchestrates ONE report. Not the only sequencer.
│   │   ├── loop.ts                    Claude tool-use loop
│   │   ├── tools.ts
│   │   ├── compose.ts                 Intent + skill + introspection → ReportPlan
│   │   ├── decide.ts                  Buy-vs-query · claim side · spend gate
│   │   ├── narrate.ts                 Structured → rendered (§5.5)
│   │   └── skills/                    BUILD-TIME COPY of /skill. No symlink.
│   │      → api.anthropic.com · ANTHROPIC_API_KEY
│   │
│   ├── workflow/                    ═══ DURABLE SEQUENCING (§5.7) ═══
│   │   ├── jobs.ts                  ★ State machine, leases
│   │   ├── journal.ts                 Operation journal for cross-network ops (§5.10)
│   │   └── dispatch.ts                Advance outstanding work since last cursor
│   │
│   ├── payments/                    ═══ x402 ═══
│   │   ├── server.ts                  Resource server + Blocky402
│   │   ├── auth.ts                  ★ Signed challenge → entitlement (§5.9)
│   │   ├── gate.ts                  ★ Consumes entitlement: token? paid? preview?
│   │   ├── buyer.ts                   Agent as buyer, reservation-gated
│   │   └── tiers.ts
│   │      → api.blocky402.com · Hedera MAINNET
│   │
│   ├── tokenize/
│   │   ├── ats.ts                     issueReport / transferReport via ABI + ethers
│   │   └── isin.ts                    ISO-6166 — on-chain validated
│   │      → Hedera TESTNET via Hashio
│   │
│   ├── market/                      ═══ ARC ═══
│   │   ├── client.ts
│   │   ├── spec.ts                  ★ Canonical question spec + hash (§5.6)
│   │   ├── listings.ts                Reports, sellers, prices, inventory
│   │   ├── stake.ts
│   │   ├── resolve.ts               ★ THE ORACLE — re-reads The Graph
│   │   ├── score.ts                   Claims → three scores (§5.1, §5.2)
│   │   └── decimals.ts              ⚠️ One internal unit. Convert at boundaries only.
│   │
│   ├── chains/                      ═══ SIGNERS — injected, never env-constructed in a module ═══
│   │   ├── hedera.ts · arc-circle.ts · arc-ethers.ts · rail.ts
│   │
│   └── store/
│       ├── db.ts · repo.ts · schema.sql
│       └── migrations/
│
└── app/
    ├── page.tsx · report/[id] · market · market/[id]
    └── api/
        ├── commission · reports/[id] (x402 gate) · reports/[id]/stream
        ├── auth/challenge · market · resolve · jobs/[id] · cron
```

### Dependencies

| Subsystem | Packages |
|---|---|
| graph | none — plain `fetch` |
| engine | none — pure TS |
| agent | `@anthropic-ai/sdk` |
| payments | `@x402/core`, `@x402/hedera`, `@x402/next`, **`@x402/extensions`** — ⚠️ **all four pinned exact, moved together.** Import Hedera types from `@x402/hedera`, **never** `@hiero-ledger/sdk` |
| tokenize | `@hashgraph/asset-tokenization-contracts`, `ethers@6` |
| market | `viem`, `@circle-fin/developer-controlled-wallets` |
| store | Postgres driver — ⚠️ **must support real transactions** for reservations and leases |

⚠️ **`@x402/next` requires Next ≥16.2.6.** **Decision: start on Next 16.** We're greenfield; the
"don't upgrade mid-hackathon" advice was about migration. Fallback is Next 15 + `legacy-peer-deps`,
which is verified working but carries a flag.

---

## 7. Smoke tests — seven

**Philosophy: don't assert the plan works. Find out what breaks.** A failing smoke test changes the
plan. Log every outcome in `DECISIONS.md`.

| # | Test | Pass signal | Box |
|---|---|---|---|
| **SM-0** | 12-month snapshot query, **both date bounds** | Rows return **AND** returned timestamps fall inside the historical window ⚠️ *`timestamp_gte` alone false-passes* | 15m |
| **SM-1** | Query one subgraph via gateway | Populated field + `_meta.block.number` | 30m |
| **SM-2** | Same document, five deployments | 4 identical shapes; the 2.0.1 works or fails with a known error | 1h |
| **SM-3** | x402 pay for a `"hello"` endpoint on Hedera | Payment settles, string returned | 3h |
| **SM-4** | ATS **issue AND transfer** on testnet | ⚠️ **Balance moved.** Proxy creation on HashScan is not issuance | 3h |
| **SM-5** | **Complete a payable call** via Circle DCW | Contract logs `msg.value`; **we observe the scale** | 2h |
| **SM-6** | Claude calls a tool that queries a subgraph | Loop invokes, data returns | 1h |
| **SM-7** | 🆕 **Fork with a late `startBlock`, index 1 hour** | **Markets exist and are populated.** ⚠️ Messari mappings build Markets from *initialization events* at deployment — a late start may produce an empty subgraph | 3h |

**Money paths get failure tests against the deployment, not locally.** Happy-path plumbing is not
enough where funds move.

**Assertions** (test files, written with the feature they cover): schema-drift failure modes ·
narration structure stability · vague-directive handling · token-holder not charged on **either** read
· single-read grants no standing access · unpaid hit returns 402 not 500 · ambiguous settlement ·
resolver math on stubs then live · scorer under **hostile attribution**.

**Lookups** (Day 1, run once, write into `DECISIONS.md`): exact pruning error strings · actual pruned
floor per deployment · which of the 95 lending deployments are live and synced.

---

## 8. Build phases

### Infrastructure, settled

**Servers:** one. A Next.js app on Vercel. Route handlers are the backend. **No separate API server, no
worker, no Docker.** One scheduled function.

**Graph data:** ⚠️ **fetched live, every time. No local index.** `config/protocols.ts` is a config file
pointing at subgraph IDs, not a database. This is an architectural choice — the *rule* prohibits mocked
or static datasets as your source, and indexing our own copy would mean the agent queries our Postgres
rather than The Graph, undermining G2.1.

**Persisted vs live:**

| Data | Where |
|---|---|
| Protocol financials | **Live from The Graph, never cached as a source** |
| Query evidence (§5.13) | Postgres — provenance, never read back as data |
| Report body, narrative | Postgres |
| Report ownership | Hedera testnet (ATS) |
| Content hash | Hedera (`additionalSecurityData.info`, immutable) |
| Stakes, pools, outcome, `resolved` | **Arc contract state — authoritative** |
| Claims, scores, jobs, journal, spend reservations | Postgres |

**Runtime limits — current, not the stale numbers:**
- Duration: **300s default with Fluid Compute; Hobby max 300s; Pro GA 800s.** Streaming counts. Set
  per-function `maxDuration` explicitly.
- Bundle: **250MB standard uncompressed; Large Functions to 5GB in beta.** ⚠️ Installed-tree size is
  **not** deployed-bundle size. **Real test: clean production build with traced per-function size.**
- Cron: ⚠️ **Hobby is at most daily, within its scheduled hour. Pro allows minute frequency.** A daily
  scheduler cannot advance jobs promptly — **Pro tier, or jobs advance on request.** Check `CRON_SECRET`.
- Filesystem read-only; `/tmp` ephemeral. **Skill files packaged at build time.**
- Module scope: caches fine. **Balances, locks, current jobs, nonces — never authoritative.**

**Service vs module vs script:** Service = the one Vercel deployment. Module = importable TS, no import
side effects. Script = one-shot, local, output pasted into env, **never in a route.**

---

### Phase 0 — Gates (Day 1)

Run SM-0 … SM-7. Init repo, deploy an empty app, draft `types/wire.ts`.

**Lead-time items, today:** Studio API key · Circle Console + entity secret (⚠️ **save the recovery
file**) · Hedera ECDSA accounts both networks (⚠️ **mainnet HBAR has no faucet**) · USDC association ·
Hedera Discord for ATS questions.

**Exit:** eight gates resolved, wire types frozen, app deployed.

### Phase 1 — Data layer + agent (Day 2)

`graph/client.ts` — `querySubgraph(slug, document, vars, block?)`. Plain `fetch`, always `_meta`,
returns `{ data, meta, evidence }`. **Every consumer uses this — reports AND settlement.** That reuse is
G2.1.

`graph/adapter.ts` — dispatch on **live** `schemaVersion` and `lendingType`. ⚠️ **Never let static
config override the deployment's actual schema.**

⚠️ **Snapshot contract:** for cross-protocol comparison, select a **mutually available finalized block**
and pin every root query and `_meta` to it. Otherwise totals and market rows disagree because they were
fetched at different times.

⚠️ **Pagination:** stable ordering, deduplication, explicit completeness. **An incomplete population
does not receive a clean reconciliation verdict** (R22).

`agent/loop.ts` — Anthropic Messages API tool-use. A `while` over `stop_reason === "tool_use"`. Not a
framework.

⚠️ **Fan out with `Promise.all`.** ⚠️ Budget **model turns, tokens, rows/pages, response bytes,
per-provider deadlines, cumulative cost, and total job runtime** — not just a query count.

**Exit:** the loop calls `querySubgraph()` across multiple protocols and returns correct data. Deployed.

### Phase 2 — Report building (Day 3)

`agent/compose.ts` — planner. Intent + skill + introspection → `ReportPlan`. **The LLM produces a plan,
not prose and not numbers.** ⚠️ Must be able to return `needs_clarification` — a structurally valid
output can still be a confident guess.

⚠️ **Define the reporting boundary before the query.** A lending-pool exposure statement is not a
protocol balance sheet. Gross deposits, borrows and accrued revenue do not enumerate treasury assets or
obligations. Decide what entity is reported on, and what period.

⚠️ `deposits − borrows` is **not** a universal solvency measure. Distinguish accounting identity · data
consistency check · economic indicator · independently corroborated fact.

`graph/gather` (in `workflow/`, not `graph/` — Graph executes a validated request, the workflow layer
decides what to request next) — the multi-query loop with a hard cap. Every query recorded as evidence.

**Four semantic facts to inject** (the schema descriptions don't carry them): TVL == deposits by
assignment · revenue is accrued interest split by `reserveFactor`, not fees · `Position.balance` is
stale and unit-denominated · `Market` means three things depending on `lendingType`.

**Exit:** several directives each produce a well-formed, data-backed, multi-protocol report.

### Phase 3 — Tokenization + x402 (Day 4–5)

> **Separate the asset from the access. The ATS token is provenance and ownership. The gate is access.
> One checkpoint, two valid keys.**

`tokenize/ats.ts` — `deployEquity` per report, `grantRole(ISSUER)`, `issue()`. ⚠️ **Multi-step and each
step can fail independently. Persist transaction identities and the proxy address as each progresses —
blind retry creates duplicate assets or duplicate supply.**

Compliance off: `compliance: address(0)`, `identityRegistry: address(0)`, `internalKycActivated: false`.
✅ ATS tokens are plain ERC-20 on the Hedera EVM — **no association step.**

`payments/gate.ts`:
```
valid entitlement (signed challenge, token held)?  → serve
just settled an x402 payment?                      → serve this once
otherwise                                          → preview
```

**Two endpoints:** `POST /api/commission` gated, cheap work only, returns `{ jobId }` — keeps
cancel-on-failure. `GET /api/reports/[id]/stream` ungated, entitlement-authorized, streams freely.
⚠️ **The gate buffers responses regardless of settle phase** — that's why the split exists.

**Exit:** a report is issued by ATS, listed, and a second party completes one real x402 purchase.
Token-holder isn't charged on either read; single-read grants no standing access.

### Phase 4 — Market + settlement (Day 6) — **CORE**

`market/spec.ts` — the canonical question spec and its hash (§5.6).

```solidity
function createMarket(bytes32 questionSpecHash, uint256 closeTime)
function stake(uint256 marketId, bool side, bytes32 reportRef) external payable
function resolve(uint256 marketId, bool outcome, bytes32 proofHash)   // require(!resolved)
function claim(uint256 marketId)
```

⚠️ **Economic edge cases the contract must handle:** no stakes · no winning-side stakes · cancellation
and refunds · no-data resolution · late staking · double claims · payout rounding and dust · reentrancy
· rejecting recipients · bounded execution. **Resolution must not loop over every staker.** Pull-based
`claim()` is correct.

`market/resolve.ts` — the oracle. Calls `querySubgraph()` — *the same function that wrote the report*.

⚠️ **This is a trusted-resolver design. State it.** The Arc contract receives `bool outcome` from our
signer; it does not verify GraphQL. Restrict `resolve`, and define recovery if the resolver disappears.
**`proofHash` is a commitment to evidence, not proof of honest computation.**

`market/score.ts` — walk **claims**, not stakes. Three scores (§5.2).

**Exit:** an author precommits a claim, the resolver settles from Graph data, three scores update
correctly, and hostile attribution doesn't corrupt any of them.

### Phase 5 — Mainnet, polish, diagram (Day 7–8)

Flip Hedera x402 to mainnet. Fund wallets. **Seed pools** — parimutuel with two participants is
invisible. Architecture diagram. Demonstrate Arc mainnet **readiness**, not just claim it. Run the demo
5×.

### Phase 6 — Submit (Day 9)

Video 2–4 min. Seven submission docs across three slots, each naming its bounty. README: setup,
architecture, payment flow, what we built on, AI attribution. **Half the day is submissions.**

---

## 9. Risk register

| ID | Trigger | Box | Branch A | Branch B |
|---|---|---|---|---|
| R1 | SM-0 fails | — | Balance questions settle on the **latest available snapshot**, stated in the spec | Restrict to flow metrics. ⚠️ **Existing funded markets must not change semantics** |
| R2 | SM-3 fails — Blocky402 not settling | 2h | Retry against the **other** Blocky402 host (testnet vs mainnet) | ⚠️ `x402.org` **loses the Blocky402 requirement**. Self-hosting contradicts our infra. **Neither branch preserves everything — exhaust A** |
| R3 | SM-4 fails — ATS issuance blocked | 3h | Diagnose: roles, factory config, gas, key type | **Series token** — deploy once, transfer per sale. ⚠️ Doesn't fix broken infra or bad keys, only repeated cost |
| R4 | SM-2 — fewer than 3 usable protocols | 3h | Drop to well-signalled deployments | **Two protocols already satisfy G1.3** — reframe, don't panic |
| R5 | SM-5 shows unexpected decimals | 1h | Normalize; extend tests to contract input, pool accounting, payout, display, dust | — |
| R6 | Circle polling fights serverless | 4h | `tx_jobs` + poll route (already baseline) | ⚠️ **ethers fallback is a different identity** — needs funded wallet, role changes, and pending-op reconciliation. **Not an env flag** |
| R8 | Agent overspends | — | **Reservation before submission** (§5.11). Built in Phase 3, non-negotiable | — |
| R9 | Resolution runs twice | — | `require(!resolved)` **in Solidity** | Score writes idempotent on `(marketId, reportRef)` |
| R10 | Subgraph timeout mid-settlement | — | Fetch before submit; complete or leave untouched | ⚠️ Doesn't cover **submitted-then-timed-out** — journal it, reconcile on next cron |
| R11 | Vague directive | — | Planner returns `needs_clarification` with required intent fields | — |
| R12 | Mainnet HBAR unavailable | — | **Run x402 on testnet** — track accepts either. Verify full config: asset IDs, accounts, funding, facilitator | — |
| R13 | Report tagged on both sides | — | Score the **author's claim** only | — |
| R14 | Paid job fails after settlement | — | Explicit refund from treasury, logged | Serve a degraded report |
| R15 | Payment ok, ATS transfer fails | — | Operation journal; retryable completion | Manual compensation, logged |
| R16 | Two buyers, one unit | — | Inventory reservation **before** settlement | Reject second with a clear error |
| R17 | Source republished after market creation | — | `questionSpecHash` pins deployment hash → **market voids, stakes refund** | — |
| R18 | Stream reconnect mid-generation | — | Lease check — attach to the running job | — |
| R19 | Cron missed or duplicated | — | Process outstanding work since last **completed cursor**, with leases | — |
| R20 | Circle transaction stranded | — | **Stays reserved**; reconcile next cron | ⚠️ **Never retry via ethers** — different identity, duplicate economic action |
| R21 | SM-7 — fork indexes empty | 3h | Graft from an existing deployment | **Cut the fork.** G1.4 is optional |
| R22 | Pagination incomplete at budget | — | Report marked **incomplete**; verdict withheld | — |
| R23 | Deployed bundle exceeds the function limit | 2h | Split heavy routes; externalize | Large Functions (beta) |
| R24 | Provider outage during a live-dependent test | — | Live assertions **separated from deterministic commit gates** so outages don't look like regressions | — |

---

## 10. Cut order

**Each cut names what it sacrifices.**

| # | Cut | Sacrifices | Safe? |
|---|---|---|---|
| 1 | Substreams / ERC-4626 module | Nothing | ✅ Already cut |
| 2 | Base x402 gateway | A judged bullet on G2.3 | ✅ |
| 3 | HCS audit trail | H1 extra point | ✅ |
| 4 | Royalty split | H2 extra point | ✅ |
| 5 | Third analyst config | Nothing | ✅ |
| 6 | MCP discovery | A composition bullet — **standardized schema alone satisfies G1.1** | ✅ |
| 7 | `prune: never` fork | G1.4 (optional) | ⚠️ Weakens G1.5 |
| 8 | Actual resale (secondary market) | H2.5 extra point — **and we must stop claiming it** | ⚠️ |
| 9 | Per-report → series token | Nothing required | ⚠️ Weaker story |
| 10 | Circle DCW → raw ethers | A3 — the strongest Agent Stack evidence available on Arc | 🔴 Materially weaker |

**Never cut:** reconciliation engine · x402 gate · resolution · claim-based scoring · live Graph data ·
architecture diagram · video.

---

## 11. Open items

| # | Question | Owner | Blocking |
|---|---|---|---|
| U2 | Does Circle Console signup gate on KYC? | Today | Arc integration |
| U3 | Which decimal scale does DCW's `amount` produce? | SM-5 | Stake accounting |
| U4 | Do snapshots survive 12 months? | SM-0 | Settlement design |
| U5 | Actual pruned floor per deployment | Probe | Error branching |
| U6 | Which lending deployments are live and synced | Probe | Protocol shortlist |
| U7 | Does the MCP connector require `mcp_toolset` alongside `mcp_servers`? | Verify before building discovery | Discovery |
| U8 | Vercel plan tier — cron frequency depends on it | Today | Job progression |

*U1 closed: multi-track partners count as one selection.*

---

## 12. Definition of done

- [ ] Deployed and public. No localhost in the demo.
- [ ] A stranger can commission, buy, stake, and see a resolution — no terminal.
- [ ] Live Graph data, ≥2 protocols (5 targeted), one query pattern. No fixtures in the demo path.
- [ ] **Standards leverage demonstrated on camera**, not just claimed.
- [ ] One real x402 paid request, executed on camera, settled through Blocky402.
- [ ] ATS **issuance, configuration, and transfer** on Hedera testnet; contracts verified on HashScan.
- [ ] Arc market takes USDC stakes and pays out; **mainnet readiness demonstrated**.
- [ ] **Authors precommit claims; three scores update correctly under hostile attribution.**
- [ ] Architecture diagram in `docs/architecture.png`.
- [ ] Seven submission docs across three slots, each naming its bounty.
- [ ] `AI_USAGE.md` complete; planning artifacts, prompts, and amendments in the repo.
- [ ] Meaningful commit history.
- [ ] Video 2–4 min, ≥720p, human voice, rehearsed 5×.

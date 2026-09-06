# PLAN.md — v4 · Alpha Markets

**Event:** ETHOnline 2026 · **Deadline: Sunday Sept 13, 12:00pm EDT**
**Supersedes:** `PLAN-v3.md` and all prior amendments.
**Incorporates:** external critique of Sept 5 (`alpha-markets-plan-v3-critique.md`).

> **Requirements are law. The build conforms to them.**

**Locked constraints:** prediction market is core and resolves from live Graph data · Read (x402) and
Own (ATS) go through one access checkpoint · fixed prices, not metering · **Vercel Hobby** · team is
builder + Claude + Codex · Base x402 buyer is optional · **author claims are on-chain**.

---

## 1. What we're building

Crypto has no earnings season. Nobody is paid to do fundamental analysis on protocols, so nobody does.

**Alpha Markets** creates the incentive: an AI analyst agent composes GraphQL against Messari
standardized lending subgraphs, runs a deterministic reconciliation, and publishes a financial report.
Reports sell behind an x402 gate on Hedera and are issued as tokenized assets via ATS on Hedera
testnet. On Arc, an analyst **commits a prediction on-chain against its own report, backed by its own
USDC**. Others stake alongside. Settlement re-reads The Graph and scores the commitment.

**One Next.js app on Vercel Hobby + one external ticker.** No worker, no Docker, no local index.

**Scope: lending protocols only.**

### The three chains, and what crosses between them

| Network | Runs | Why |
|---|---|---|
| **Hedera testnet** | x402 report payments **+** ATS report tokens | The track requires testnet for ATS and H1.1 accepts either for x402. **Amended 2026-09-05 — R12 taken**, see below |
| **Arc testnet** | Claims, stakes, resolution, payouts | Arc mainnet launches Sept 16 — after our deadline |
| Ethereum mainnet | *(read only)* | The chain our subgraphs index |

⚠️ **Amendment, 2026-09-05 — x402 runs on testnet.** This table read "Hedera mainnet · x402 report
payments · Real money" with testnet as the available R12 fallback. **R12 is now TAKEN.** Mainnet HBAR
has no faucet — it needs an exchange withdrawal, possibly behind KYC, on a clock nobody controls, and
that is not something a Phase 0 gate can sit behind. H1.1 accepts testnet or mainnet, so nothing is
given up against the requirement. Per R12 the switch is atomic: facilitator `api.testnet.blocky402.com`,
network `hedera:testnet`, USDC `0.0.429274` and the seller/buyer pair move together or not at all.
Mainnet remains a config revision if funding appears. Full reasoning in `tracking/DECISIONS.md`.

⚠️ **Nothing calls across chains.** The only thing that crosses is a **32-byte report hash**: committed
on Hedera in the ATS creation event (`additionalSecurityData.info = "alpha:<hash>"`) and in the Arc
`commitPrediction` call. Anyone can verify both refer to the same bytes. **There is no cross-chain read
and none is needed.**

---

## 2. Rules of engagement

### Process

1. **No mid-session replanning.** Take the pre-written branch from §10, or take the dumbest unblocking
   thing and write one line in `tracking/DECISIONS.md`.
2. **Every risk carries a branch.** Trigger → box → A → B.
3. **Deployed from Day 2 and stays deployed.**
4. **Pass/fail requirements (§4) are protected absolutely.**
5. **Session start:** paste `PLAN.md`, `tracking/DECISIONS.md`, `STATE.md`.
6. **All planning artifacts ship** — plan, critiques, prompts, research (rule E5).

### Commit protocol

> **One commit = one thing you can read in a sitting, and one thing that works.**

**Loop:** I state the unit (file, purpose, ~lines, proof) → written to `STATE.md` under
`## Current unit` → you approve or resize → I write → you read → it commits.

| Kind | Ceiling |
|---|---|
| LOGIC file | **~120 lines.** Over that, split *before* writing |
| SCAFFOLD | One file per commit |
| Contract | One contract, tests in the same commit |
| Script / smoke | One per commit |
| Any commit | **Never two subsystems** — unless it's one atomic interface change plus its consumer |

**Red flag:** touching a file not named in the unit → stop and re-state. Either of us calls it.

**Commit format** (attribution lives here, so `AI_USAGE.md` is a summary, not memory):

```
<type>(<scope>): <what changed>

AI-assisted: <yes/no — which parts>
```

**You read LOGIC line by line, SCAFFOLD for shape.** ~12 LOGIC files. `reconcile.ts` is the credibility;
`resolve.ts` is the oracle.

---

## 3. Requirements traceability

**3 slots. Multi-track partners count as one selection (confirmed).** Seven prizes, ceiling ~$14,834.

### The Graph — Composable or Standardized

| # | Requirement | Satisfied by | Type |
|---|---|---|---|
| G1.1 | Compose 2+ Graph products **or** build meaningfully on a standardized schema | Messari standardized lending schema, N deployments | **PASS/FAIL** |
| G1.2 | Live data from a Graph provider; mocked/local-only/static do not qualify | `querySubgraph()` at request time, including at settlement | **PASS/FAIL** |
| G1.3 | One subgraph, no composition/standardization → does not qualify | ≥2 protocols (4 targeted), schemaVersion dispatch | **PASS/FAIL** |
| G1.4 | Authoring/extending a Standardized Subgraph is in scope | ⚠️ **Cut #7.** Not attempted unless the core lands early | Optional |
| G1.5 | **Make the standards leverage clear** | ⚠️ Demo line is **"add a *3.1.0 POOLED* protocol via one config line"** — true only for that class. README: aave-v2/v3 byte-identical sha256 | **PASS/FAIL** |
| G1.6 | Public repo + 2–4 min video | Day 9 | **PASS/FAIL** |

### The Graph — AI Tooling or AI Use Case (**From Scratch**)

| # | Requirement | Satisfied by | Type |
|---|---|---|---|
| G2.1 | The Graph is load-bearing | Every report and every settlement reads it. RPC corroboration verifies that source; it is not a second source | **PASS/FAIL** |
| G2.2 | Live data from a Graph provider | Same | **PASS/FAIL** |
| G2.3 | **Meaningful work** — reasoning, decisions, automation | Directive → plan → reconciliation → verdict → **on-chain prediction backed by the agent's own USDC** | **PASS/FAIL** |
| G2.4 | *Conditional:* if presenting tooling, it must be reusable infrastructure | `messari-lending` skill. **The app alone is a valid entry** | Conditional |
| G2.5 | Open source, runnable README | Day 9 | **PASS/FAIL** |
| G2.6 | Start Fresh — covers prior **designs and assets**, not just code | Submission form | **PASS/FAIL** |

### Hedera — AI & Agentic Payments

| # | Requirement | Satisfied by | Type |
|---|---|---|---|
| H1.1 | Live x402-gated service on Hedera testnet **or** mainnet | `app/api/reports/[id]/route.ts` | **PASS/FAIL** |
| H1.2 | Settled through **Blocky402** | `api.blocky402.com` / `api.testnet.blocky402.com` | **PASS/FAIL** |
| H1.3 | **A platform or agent** consuming it, ≥1 real paid request end to end | ⚠️ **The buyer agent is the on-camera payer.** "Agent" satisfies this — see §5.3 | **PASS/FAIL** |
| H1.4 | README covering setup, architecture, **payment flow** | Dedicated section | **PASS/FAIL** |
| H1.5 | Video ≤5 min showing the paid request executing | Same 2–4 min video | **PASS/FAIL** |
| H1.6 | *Extra:* metering | ⚠️ **Dropped** — fixed pricing is a locked constraint | — |
| H1.7 | *Extra:* HTS in the settlement path | USDC `0.0.456858` is HTS | Judged |

### Hedera — Tokenization of Anything

| # | Requirement | Satisfied by | Type |
|---|---|---|---|
| H2.1 | Use ATS (SDK, **contracts**, web app, or combination) | `@hashgraph/asset-tokenization-contracts` + ethers | **PASS/FAIL** |
| H2.2 | Deploy and demonstrate on **Hedera testnet** | ATS assets on testnet | **PASS/FAIL** |
| H2.3 | Contracts **verified on HashScan where applicable** | ⚠️ **≥1 per-report `ResolverProxy` verified via Sourcify.** `scripts/verify-ats.ts` | **PASS/FAIL** |
| H2.4 | Video showing **issuance, configuration, and ≥1 lifecycle operation** | ⚠️ **Configuration must be on camera**, not just issue + transfer | **PASS/FAIL** |
| H2.5 | *Extra:* a secondary market ATS lacks | ⚠️ **Unearned.** Issuer→first-buyer is a primary sale. **We do not claim this** | — |

### Arc — three prizes

**All three require:** working frontend **and** backend · architecture diagram · video covering
**effective use of Circle's developer tools** · detailed documentation · repo. All **PASS/FAIL**.

| # | Requirement | Satisfied by | Prize |
|---|---|---|---|
| A1 | Decision logic tied to real signals | Reconciliation → verdict → committed side | Agentic |
| A2 | **Autonomous spending/settlement in USDC** | Agent's `commitPrediction` is payable and unattended | Agentic |
| A3 | **Agent Stack connecting agents to wallets and onchain actions** | Circle DCW **EOA** wallets — the only named component on Arc | Agentic |
| A4 | **Programmable money flows** — conditional, automated, multi-step | Commit → conditional resolution from Graph data → parimutuel payout → void/refund path | DeFi |
| A5 | Meaningful use of Arc and USDC | All market value on Arc, native USDC | DeFi |
| A6 | **Deployed or deployment-ready on Arc mainnet by Sept 30** | ⚠️ Not an env var and a README line. **Portable deployment manifest, provisioning, permissions, recovery** | Mainnet |

### ETHGlobal global

E1 Start Fresh (code, designs, assets) · E2 meaningful version history · E3 transparent about libraries
· E4 AI attribution **plus meaningful human contribution** · E5 all spec files, prompts, planning
artifacts ship · E6 video 2–4 min ≥720p human voice (editing out waiting is permitted) · E7 max 3
partner prizes.

⚠️ **Vercel Hobby is non-commercial personal use.** Selling reports for real USDC on Hobby is a policy
risk. Noted, not a technical blocker. Mitigation: **run x402 on Hedera testnet** (R12) — the track
accepts it.

---

## 4. Protection list — pass/fail

```
□ Live data from a Graph provider — no mocks, no local index, no fixtures in the demo path
□ ≥2 protocols through one query pattern (4 targeted)
□ Standards leverage DEMONSTRATED on camera — "add a 3.1.0 POOLED protocol via one config line"
□ Live x402-gated service on Hedera, settled through Blocky402
□ ONE REAL PAID REQUEST by the buyer agent, executed on camera
□ ATS issuance on Hedera testnet
□ ≥1 ResolverProxy verified on HashScan
□ Video shows issuance AND CONFIGURATION AND a lifecycle operation
□ Working frontend AND backend
□ Architecture diagram
□ Arc mainnet readiness DEMONSTRATED — portable manifest, provisioning, permissions, recovery
□ Public repo, open source
□ Video 2–4 min, ≥720p, human voice
□ Start Fresh; no prior code, designs, or assets
□ Meaningful commit history
□ AI usage documented + meaningful human contribution evident
□ All planning artifacts in the repo
```

---

## 5. Core design decisions

### 5.1 🔴 Job progression: external ticker + request-driven advance

**Vercel Hobby cron runs at most once daily with ±59-minute precision. More frequent expressions fail
at deploy time.** The v3 job model assumed a minute ticker. It doesn't exist.

**Three mechanisms, all required:**

1. **External ticker** — a **GitHub Actions `schedule:` workflow** curls `/api/cron` every 5 minutes
   with `CRON_SECRET`. Free, ~minute granularity, occasionally late. (Alternative: cron-job.org,
   Upstash QStash.)
2. **Request-driven advance** — `POST /api/operations/[id]/advance`. Every page showing a pending job,
   purchase or resolution polls it while open.
3. **Vercel's daily cron** stays registered as a last-resort sweep.

⚠️ **Design so nobody watching for hours is safe: leases expire, nothing is lost, only delayed.**

### 5.2 🔴 On-chain claims — the contract interface

The v3 interface couldn't express the design and **couldn't void, so funds were lockable forever.**

```solidity
struct QuestionCore {                        // hashed WITH chainId + address (domain separation)
    bytes32 specHash;                        // canonical off-chain spec
    uint64  closeTime;
    uint64  observationEnd;
    uint64  resolveDeadline;
}

function createMarket(QuestionCore q) returns (uint256 marketId);

// The analyst's own commitment. Payable — the agent backs its call with its own USDC.
// One per author per market. Must precede closeTime.
function commitPrediction(uint256 marketId, bytes32 reportHash, bool side) external payable
    returns (uint256 claimId);

// Others stake alongside a claim. SIDE IS DERIVED FROM THE CLAIM — not chosen by the staker.
function stake(uint256 marketId, uint256 claimId) external payable;

function resolve(uint256 marketId, bool outcome, bytes32 evidenceHash) external;
    // require(!resolved); require(block.timestamp >= observationEnd)

function voidMarket(uint256 marketId) external;   // PERMISSIONLESS after resolveDeadline
function claim(uint256 marketId, address recipient) external;   // pull-based
```

**Why side-derived-from-claim closes the v3 hole:** a staker cannot attach a report to the side it
didn't predict. Attribution is structural, not a scoring convention.

**Accounting:** all native 18-dp. `require(msg.value % 1e12 == 0)` so 6-dp USDC converts cleanly. The
UI presents 6-dp and converts. ⚠️ **The bug is mixing units, not storing `msg.value`.**

Also: no `receive()`, stake caps, no loop over stakers at resolution, double-claim guard.

### 5.3 🔴 The human surface — decided

A human would otherwise need **three wallets across two chains**. Decisions:

| Action | Who | Path |
|---|---|---|
| **Pay for a report (x402)** | ⚠️ **The buyer agent only** | H1.3 says "a platform **or agent**." `@x402/paywall` has **no Hedera UI**; a browser flow needs a WalletConnect Hedera signer we'd have to build. **Cut.** |
| **Own a report (ATS)** | Agent, or a human who has proven an EVM address | §5.4 |
| **Stake on Arc** | ✅ **Humans, in the browser** | MetaMask + `wallet_addEthereumChain` (chainId `0x4cef52`, native symbol USDC 18-dp). **This is the human on-chain action, and Arc prizes need value moving on Arc.** |

**Definition of done narrows accordingly:** a stranger can browse, read previews, **stake**, and watch
a resolution. Buying is demonstrated agent-to-agent.

### 5.4 🔴 Recipient binding for the Own tier

The x402 `settleResponse.payer` is a Hedera **mainnet** `0.0.x`. The ATS recipient is a Hedera
**testnet EVM address**. **They are different identifiers and v3 had no way to obtain the second.**

```
1. EVM wallet session — EIP-191 signed challenge, verified with ethers.verifyMessage.
   Nonce, domain binding, expiry, single consumption.
2. Recipient captured into the FROZEN QUOTE before the 402 is issued.
3. Inventory reserved against that quote.
4. Transfer step reads the recipient from the operation journal.
```

The server-side buyer agent needs its **own testnet EVM key** to receive and later prove holding.

### 5.5 🔴 ATS infrastructure provenance — decided with a trigger

Two options, neither previously written down:

- **Public testnet factory** `0.0.9213391` / resolver `0.0.9212226` — ⚠️ **expires 2026-09-10, inside
  our window.** Hedera doesn't currently enforce expiry, but depending on someone else's contract
  surviving a date in-window is a gamble.
- **Own deploy** — 111 contracts, ~180M gas, **~29 minutes measured**, via the ATS monorepo's Hardhat
  (Node 24, Hashio rate limits, 15M gas/tx batching, **partial failure leaves a partial deployment**).

**Decision:** SM-04 runs against the **public factory first** — fast, proves the tuple and roles.
**Day 1 lookup:** query `/api/v1/contracts/0.0.9213391` for expiry, write into `tracking/DECISIONS.md`.
**Trigger:** if the public factory is unusable or expiry is imminent → own deploy, with
`tooling/ats/` carrying the exact upstream commit, Hardhat network config, a resumable manifest, and
**the address list to paste into env**.

### 5.6 🔴 The planner selects documents; it does not author GraphQL

v3 never said what a `ReportPlan` contains. **Decision: `queries.ts` holds pre-written standardized
documents. The planner chooses `documentId` + variables.**

This removes the query-validation layer entirely, removes `graphql` as a dependency, and removes the
class of failure where a model emits `PositionSide.LENDER` against a 3.1.0 deployment or pulls 1000
rows at demo time.

**Exactly two read-only tools:** `run_document(slug, documentId, variables)` and
`get_capabilities(slug)`. **No free-form GraphQL, no URLs.**

### 5.7 Sell finished reports; commissioning is not paid

v3 gated `POST /api/commission` with x402, which put a **refund path on the critical path** — and
Hedera x402 has no refund primitive, so a refund is a hand-rolled treasury transfer.

**Decision: the paid endpoint only ever serves a small, already-persisted body.** Commissioning is
authenticated and quota-limited, not paid. Consequences: the `authorization` flow works (verify →
handler → settle), the **~120-second Hedera transaction validity is never at risk**, and no refund path
is load-bearing.

⚠️ **Never gate the stream route** — generation would outrun the validity window.

### 5.8 Ambiguous Hedera settlement must be recovered, not assumed failed

⚠️ **Every Hedera settle failure — including a Blocky402 timeout after broadcast — returns
`{success: false, transaction: ""}`. There is no hash to reconcile with.**

`payments/recover.ts`: decode `payload.transaction` with `Transaction.fromBytes` (re-exported from
`@x402/hedera`), extract the native transaction ID and validity window, **query the mirror node before
deciding "failed."** Persist the native ID **before** calling settle.

Without this, a timed-out buyer either pays twice or gets nothing.

### 5.9 Read-delivery recovery

If the HTTP response is lost after settlement, the buyer has paid and has nothing; a retry gets a fresh
402. **Use `@x402/extensions` `payment-identifier`** — server↔client, works on Hedera, no facilitator
involvement — with a server cache keyed by payment id.

### 5.10 Report hash canonicalization

- **RFC 8785 JCS** via the `canonicalize` npm package, **passing reference vectors** in a test.
- All decimals as **strings**. Explicit `null` vs absent rules.
- ⚠️ **Exclude lifecycle fields — especially the ATS address — so the hash exists before the token
  does.** The token commits the hash; the hash cannot contain the token.
- Raw query responses hashed **separately** as evidence.
- **Arc `reportHash` is the same bytes.** Golden vectors shared with Foundry.

### 5.11 Narration: figures are references, and digits are forbidden outside them

Narrator returns `{ sections: [{ id, paragraphs: [{ text, factRefs: [] }] }] }`.

⚠️ **The validator rejects any digit sequence in `text` that is not inside a `{fact:ID}` placeholder.**
That single rule is what makes "$900 billion" impossible — TypeScript types cannot.

Deterministic template fallback when the narrator returns something unresolvable.

### 5.12 Three scores, from claims

| Score | Question | Source |
|---|---|---|
| **Reconciliation quality** | Did the tie-out hold? Was the population complete? | `engine/` at publication |
| **Forecast accuracy** | Did the author's on-chain claim come true? | `claimId` vs resolved outcome |
| **Trading return** | Did the position win? | Arc payouts |

Score writes idempotent on **`(marketId, claimId)`** — ⚠️ not `(marketId, reportRef)`, which isn't
unique if two authors cite the same report.

### 5.13 Invariants carry severity

The Messari 11 are **heuristics, not invariants:**

```
Deposit $100 → Borrow $80 → Repay $80 → Borrow $80
cumulativeDeposit $100 · cumulativeBorrow $160 · outstanding $80 — nothing is wrong.
cumulativeDepositUSD ≥ cumulativeBorrowUSD FAILS.
```

`{ severity, appliesTo, rationale }`. **`DATA_ERROR` blocks a report. So does an incomplete
population** — those are the only two blocking conditions.

⚠️ **"Incomplete population" is about the population, not the page** *(clarified 2026-09-06)*. A
report reading 4,000 markets over 16 pages of 250 is **complete**; one that stopped at a budget with
rows outstanding is **`INCOMPLETE`** and withholds, however many pages it read. See §5.18 — `first ≤
250` is a per-request cap and never a ceiling on the universe.

⚠️ **Amendment, 2026-09-06 (SM-02) — the four severities, named.** The blocking rule above was
right and unenumerated, which left "severity" undefined at the point it does the most work.

| severity | what it means | example | effect |
|---|---|---|---|
| **`DATA_ERROR`** | A number that cannot be right | An oracle returning zero while the balance is non-zero | ⛔ **BLOCKS the report** |
| **`INCONSISTENCY`** | Internal arithmetic that doesn't tie | Σ markets ≠ protocol total | Reported. Does not block |
| **`SIGNAL`** | A finding about the **protocol**, not the data | Borrows exceeding deposits on a market | Reported **prominently** — this is the kind of thing a report exists to surface |
| **`INFORMATIONAL`** | Context worth carrying | A wound-down deployment; a market of negligible size | Reported |

⚠️ **`SIGNAL` is not a degraded `DATA_ERROR`.** It is the product. A market where borrows exceed
deposits is not a broken number to be suppressed — it is the finding an analyst is paid for, and
severity exists partly to keep it from being filtered out as noise.

⚠️ **Amendment, 2026-09-06 (SM-02) — severity is per-deployment, never global.** The clearest
worked example in the build, and the reason the adapter is a plausibility layer rather than a
renaming layer:

```
inputTokenPriceUSD == 0 && inputTokenBalance > 0
```

- **On Aave this is a `DATA_ERROR`.** Deposits are derived from price × balance, so a zero price
  silently zeroes the deposits. The guard never fired on Aave — correctly.
- **On Morpho it is a false positive, 337 times over.** It fires on 337 of Morpho's top 500 markets,
  holding **$11.0B** between them, and every one is wrong: the price is the *collateral* price, the
  balance is in the *loan* token, and Morpho derives deposit USD from the loan token — so a zero
  collateral price breaks nothing.

**The same condition, the same field names, opposite meanings.** A global guard is not merely
noisy on Morpho, it is unusable — 337 blocking errors on a deployment with nothing wrong with it.
**Guards belong with the deployment, not with the query**, which is what makes `adapter.ts` a
plausibility layer: field names are close to free to translate, and meanings are not.

*Measured in SM-02; the implementing work is tracked in `tracking/smoke-results.md` under SM-02 and
lands in `engine/invariants.ts`.*

### 5.14 The engine is pure; corroboration is an adapter

`graph/corroborate.ts` fetches the observation; `engine/checks/crosscheck.ts` compares.

✅ **Archive access is confirmed** *(SM-04, 2026-09-06)*. `ETHEREUM_RPC_URL` (Alchemy free tier)
serves historical state to **block 1** — nothing refused at any depth. R27's fallback is not needed
for Ethereum.

⚠️ **Amendment, 2026-09-06 — corroboration compares EXACTLY, at the block the value was written.
There is no tolerance.** §5.14 previously read "Compare compatible semantics with tolerances."
SM-04 overturned it. Indexed *through* block B ≠ every field *refreshed at* B: an Aave aToken's
`totalSupply()` accrues ~31.5 USDC **per block** from `block.timestamp` while the subgraph writes
`inputTokenBalance` only when a handler runs, so a comparison at `_meta.block` passes or fails
depending on whether an event happened to land on the indexing head. **A tolerance wide enough to
absorb interest accrual is wide enough to hide the errors the check exists to catch** — that is the
whole check defeated to work around a block-alignment problem that has an exact solution.

**The procedure:** read the field's own write-time from the subgraph, resolve it to a block,
`eth_call` there, and assert **equality**. Verified exact on aave-v3 and aave-v2.

⚠️ **Amendment, 2026-09-06 (SM-04) — corroboration is a DISAGREEMENT DETECTOR, not a one-directional
audit of The Graph.** This section was written as though the RPC verifies the subgraph: chain
authoritative, subgraph checked against it. The first thing the check actually found was **Morpho
disagreeing with its own contract** on 2 of its 3 largest markets — identically at both the
write-time block and the indexing head, so not drift, and one difference exactly `-10,000,000`.

**What a mismatch means is per-deployment, and sometimes open.** It may be a mapping bug, a
deliberate derivation the mapping documents and the contract does not expose, or a contract read at
the wrong semantic level. The check's output is *these two sources disagree, by this much, here* —
attributing the error is a separate judgement that belongs with the deployment's semantic notes, not
with the comparison. **Do not write "the subgraph is wrong" into the check.**

⚠️ **Corroboration is a per-market capability, not a per-deployment one**, and the adapter carries a
corroboration flag the way it already carries the revenue flag. Measured across all five deployments:

| deployment | write-time field | corroboration |
|---|---|---|
| aave-v3-ethereum | `indexLastUpdatedTimestamp` | **EXACT**, verified |
| aave-v2-ethereum | `indexLastUpdatedTimestamp` | **EXACT**, verified — and **27.7 h / 8,285 blocks** behind head, which is why archive is not optional |
| compound-v3-ethereum | `indexLastUpdatedTimestamp` — **`null` on most markets**, set on a few | **per-market**: exact where set, `NOT_CHECKED` where null |
| compound-v2-ethereum | none — `_rewardLastUpdatedTimestamp` is a rewards field, not a balance write-time | **`NOT_CHECKED`** |
| morpho-blue | `lastUpdate` — its own name, mirrors the contract's `lastUpdate` faithfully | see below |

⚠️ **`NOT_CHECKED` is a legitimate third state and the only honest one where the field is missing.**
Never fall back to a tolerance there — say the value could not be verified. A check that silently
weakens for some protocols is worse than one that admits its limits.

⚠️ **Morpho needs no block alignment and disagrees anyway.** Morpho Blue accrues only on interaction,
so `totalSupplyAssets` is identical at `lastUpdate`'s block and at `_meta.block` — the alignment
problem does not exist there. But **2 of its 3 largest markets disagree with the contract**
(USDC/PAXG by `-10,000,000`, a suspiciously round number; USDT/wstETH by `-26,932,262,884`, ~0.02%),
with the subgraph reading **higher** than the chain in both. Not a block-alignment artifact — the
same difference appears at both blocks. This corroborates the existing Morpho finding in
`tracking/DECISIONS.md` from an independent direction, and is the first time this check has caught
anything. **Cause not yet established** — it may be virtual accrual in the mapping. Do not build on
Morpho's balances until it is.

### 5.15 The common-block window is ~100–120 minutes — with a decision rule

With `prune: auto` = 500–600 blocks, cross-protocol pinning only works if the slowest deployment is
<~100 minutes behind the fastest.

```
lo = max(earliest_retained_i)
hi = min(head_i)
if lo ≤ hi  → pin to min(hi, acceptable_finality)
else        → fall back to a common closed snapshot period, or DECLINE
```

⚠️ Ethereum "finalized" is ~64 blocks behind. **Being strict can consume most of a 100-block window** —
decide whether `head-32` is acceptable.

### 5.16 Settlement primitives, and their rules

| Primitive | Survives prune | Use for |
|---|---|---|
| `block: { number: N }` | ❌ ~500 blocks | nothing we rely on |
| `financialsDailySnapshots` | ✅ | **balance metrics** |
| immutable events | ✅ | **flow metrics** |

⚠️ **Events do not reproduce revenue** — they don't reconstruct interest accrual and fee accounting.

**Missing-day rule, in `spec.ts`:** no snapshot with `timestamp ∈ [D, D+86400)` → `MISSING_OBSERVATION`
→ retry until `resolveDeadline` → **VOID**.

⚠️ **Freshness is `_meta.block.timestamp ≥ dayEnd + margin`, not a block number** — you cannot request
the day-end block by number after ~100 minutes.

### 5.17 `x402ResourceServer.initialize()` exits the process on config mismatch

Since 2.25.0, a permanent capability/route mismatch calls `process.exit`. **On Vercel that is a
cold-start crash loop on every gated route, and it looks like a platform outage.**

Construct the resource server **lazily inside the route**, wrap `initialize()` in try/catch returning
503 with a diagnostic, and verify `/supported` advertises the network **and the expected feePayer** at
health-check time, not in the request path.

### 5.18 Other settled details

- **Circle wallets: EOA, not SCA.** `claimId` derives the author from `msg.sender`; for EOA the DCW
  address is deterministic. **SM-08 asserts `analysts.ts` address == the Circle wallet address.**
- ⚠️ **Set `spendControls` explicitly** on the buyer agent. The default $1 cap and USDC-only allowlist
  will bite the first time a price is ≥$1, with an error that reads like a network fault.
- **Event ingestion:** the stake UI **POSTs the tx hash** to `/api/markets/[id]/refresh`; the app reads
  the receipt and per-market totals. Ticker-driven `eth_getLogs` over a bounded range is the backstop
  only. **The bound is 30,000 blocks** *(measured 2026-09-06, SM-08 step 2 — U10 closed)*, which a
  market contract gets in full because it is quiet by construction. ⚠️ **Do not take these numbers
  from Arc's error strings**, which understate both the span limit and the row cap; on a row-cap
  refusal, page on the sub-range the server names.
- **Resolver nonce discipline:** serialize resolver txs through the job lease. Never retry a Circle
  transaction via ethers — **different identity, duplicate economic action.**
- **Two report forms, not four:** *balance overview* and *forecast attachment*. Ranking and comparison
  are post-slice.
- **Protocol set:** ⚠️ **Spark is out** — 1.0 GRT signal against a recommended 3,000. Use
  **aave-v2 + aave-v3** (byte-identical schema, 42.7k GRT) for the leverage claim, plus **compound-v2**
  (2.0.1, 40.7k GRT) and **compound-v3** (3.1.0, 31k GRT) for version diversity.
- ⚠️ **Amendment, 2026-09-06 — `first ≤ 250` is a PAGE SIZE, not a population ceiling.** The line
  below conflated two separate things and the conflation would have capped the market universe at
  250 rows. **`paginate.ts` pages until the population is exhausted or a budget is hit, and reports
  completeness honestly either way.** `first ≤ 250` is the per-request cap that keeps any single
  response small; it says nothing about how many pages get fetched.
- ⚠️ **Evidence has two tiers, and the caller picks** *(decided 2026-09-06)*.

  | tier | contents | when |
  |---|---|---|
  | **Record** *(default)* | deployment hash, document name, variables, block number, timestamp, row count, completeness, **hash of the response** | every query |
  | **Record + raw response** | the above, plus the response bytes | **settlement-backing queries only** |

  **A hash proves integrity, not content.** It proves *this is the response we saw*; it cannot answer
  a dispute about what the number **was**, because once the source prunes — ~100 minutes — the value
  cannot be re-derived and a re-run returns different data rather than the same data. That is
  acceptable for the overwhelming majority of queries, which never back a market, and unacceptable
  for the few that do.

  ⚠️ **The tier is set by the caller, never inferred.** Phase 4's resolver passes it; report
  generation does not. Inferring it from the query shape would mean a settlement quietly losing its
  proof because a document was reused somewhere new.

  A per-observation byte cap applies to the record and should never come close to binding. The raw
  response is exempt from that cap and bounded by `paginate.ts`'s page size instead.
- **Oversize or budget-truncated populations →** `INCOMPLETE`, never a successful total.
- ⚠️ **Untrusted strings:** `Market.name` and `Token.symbol` are indexer-supplied and reach reports and
  HTML. Purchased reports are untrusted data to the buyer agent. Escape and bound both.
- ⚠️ **Types:** freeze wire contracts (`Report`, `Computed`, `Verdict`, `Provenance`) **before the
  first consumer** — Phase 1 Unit 1 *(amended 2026-09-06; this read "Day 1")*; version persisted
  shapes with migrations. **The protection was never the calendar.** It is that no subsystem quietly
  defines its own copy of a shape another subsystem also defines, and that binds at the moment the
  first file imports one — not at the moment the project starts. Phase 0's revenue sweep and
  corroboration survey added `RevenueAvailability`, `CorroborationStatus` and `Completeness` to the
  contract well after Day 1 had passed; freezing on the calendar would have frozen a shape three
  concepts short. See §9 Phase 0.
- **Query evidence persisted** — deployment hash, document, variables, block, `_meta`, raw response,
  completeness. ⚠️ **Never read back as data.** Provenance, not a cache.

---

## 6. The repo

```
alpha-markets/
├── README.md · PLAN.md · STATE.md · AI_USAGE.md
├── package.json · .env.example · vercel.json
├── .github/workflows/ticker.yml        ★ THE EXTERNAL TICKER (§5.1)
│
├── tracking/                           ★ logs · lessons · smoke-results · DECISIONS
│                                         ⚠️ DECISIONS.md lives here, not at root (amended 2026-09-05)
│
├── docs/
│   ├── architecture.png / .svg
│   ├── runbooks/provision.md           ★ The 13-item identity inventory (§7)
│   ├── architecture/data-contracts.md  ★ Includes the numbered purchase UX sequence
│   ├── research/ · prompts/ · critiques/    Spec artifacts (E5)
│   └── submissions/
│
├── contracts/                          Foundry. Arc only.
│   ├── src/AlphaMarket.sol
│   ├── test/AlphaMarket.t.sol          incl. fuzz + invariant
│   ├── script/Deploy.s.sol
│   └── deployments/                    ★ Per-chain: address, ABI hash, tx, compiler settings
│
├── tooling/ats/                        ★ Only if own deploy: upstream commit, Hardhat config,
│                                         resumable manifest, address list
├── skill/                              messari-lending + eval/
│
├── scripts/
│   ├── smoke/                          SM-01 … SM-09
│   ├── provision-{circle,hedera}.ts · deploy-{ats,market}.ts
│   ├── probe-protocols.ts              ★ Fetch SDL by deployment hash → curated schema files
│   ├── verify-ats.ts                   ★ Sourcify verification of a ResolverProxy
│   └── seed-markets.ts
│
├── src/
│   ├── types/wire.ts (FROZEN) · types/store.ts (VERSIONED)
│   ├── config/  chains · protocols · analysts · pricing · limits
│   │
│   ├── domain/canonical.ts             ★ JCS + decimal strings + golden vectors (§5.10)
│   │
│   ├── graph/
│   │   ├── client.ts ★ · queries/ (pre-written documents + schema.<slug>.graphql)
│   │   ├── adapter.ts ★  schemaVersion + lendingType dispatch
│   │   ├── blockwindow.ts ★  the lo/hi rule (§5.15)
│   │   ├── paginate.ts   first ≤ 250, completeness
│   │   ├── evidence.ts · corroborate.ts · errors.ts
│   │
│   ├── engine/
│   │   ├── reconcile.ts ★ · invariants.ts (severity) · checks/crosscheck.ts · ops.ts
│   │
│   ├── agent/
│   │   ├── analyst.ts ★ · loop.ts (checkpointed messages[]) · tools.ts (2 tools only)
│   │   ├── compose.ts ★ (documentId + variables, or needs_clarification)
│   │   ├── decide.ts · narrate.ts · validate-narration.ts ★ (§5.11)
│   │   └── skills/                     BUILD-TIME COPY. No symlink.
│   │
│   ├── workflow/
│   │   ├── jobs.ts ★ (leases, one model turn per invocation)
│   │   ├── journal.ts ★ (cross-network operations)
│   │   └── dispatch.ts (advance since last cursor)
│   │
│   ├── payments/
│   │   ├── server.ts (lazy init, §5.17) · auth.ts ★ (EIP-191 session)
│   │   ├── gate.ts ★ (§5.19 table) · recover.ts ★ (§5.8) · buyer.ts (spendControls)
│   │   └── quotes.ts ★ (frozen quote + recipient + inventory reservation)
│   │
│   ├── tokenize/ats.ts · isin.ts
│   │
│   ├── market/
│   │   ├── client.ts · spec.ts ★ (canonical spec, domain-separated hash)
│   │   ├── units.ts ★ (6-dp UI ↔ 18-dp chain) · events.ts ★ (receipt intake + cursor)
│   │   ├── resolve.ts ★ · score.ts ★ (claims, not stakes)
│   │
│   ├── chains/ hedera.ts · arc-circle.ts · arc-ethers.ts · rail.ts   (signers INJECTED)
│   └── store/ db.ts (Neon: pooled + direct) · repo.ts · migrations/
│
└── app/
    ├── page.tsx · report/[id] · market · market/[id]
    ├── ui/wallets/                     ★ MetaMask + wallet_addEthereumChain (Arc)
    └── api/
        ├── commission (auth + quota, NOT paid) · reports/[id] (x402 gate) · reports/[id]/stream
        ├── auth/challenge · markets/[id]/refresh ★ · operations/[id]/advance ★
        ├── resolve · cron (CRON_SECRET) · health ★
```

### 5.19 `gate.ts` — the full branch table

| State | Response |
|---|---|
| Valid EVM session + holds the token | **Serve** |
| Just settled an x402 payment (payment-identifier matched) | **Serve once** |
| Own requested, inventory available | Reserve → freeze quote with recipient → **402** |
| Own requested, already owner | **Serve** |
| Own requested, sold | **409** |
| Ownership RPC unavailable | ⚠️ **503 — never charge** |
| Otherwise | **Preview** |

⚠️ `balanceOf` is read from Hashio per request. **Never cached as a session flag.**

### Dependencies

| Subsystem | Packages |
|---|---|
| graph | plain `fetch` |
| engine | none — pure TS |
| domain | `canonicalize` (RFC 8785) |
| agent | `@anthropic-ai/sdk` |
| payments | `@x402/core`, `@x402/hedera`, `@x402/next`, `@x402/extensions` — **pinned exact, moved together.** Import Hedera types from `@x402/hedera`, never `@hiero-ledger/sdk` |
| tokenize | `@hashgraph/asset-tokenization-contracts`, `ethers@6` |
| market | `viem`, `@circle-fin/developer-controlled-wallets` |
| store | `postgres` → **Neon**, pooled URL for routes, direct URL for migrations |

**Next 16** (`@x402/next` requires ≥16.2.6). Pin the exact patch. ⚠️ Next 16 renamed
`middleware.ts` → `proxy.ts` — irrelevant since we use `withX402` on route handlers, but **any copied
middleware example will not load.** Never `paymentProxy` — it charges on failure.

---

## 7. Provisioning inventory — Phase 0 gate

**Thirteen items. Four need real money or a KYC'd exchange withdrawal.**

| Identity | Network | Needs |
|---|---|---|
| Graph query API key | — | Studio login (**wallet signature**), free 100k/mo, ⚠️ domain allowlist must include Vercel prod **and preview** |
| Anthropic API key | — | — |
| Treasury / `payTo` | Hedera mainnet | Real account (`aliasPolicy: reject` blocks alias-form), **USDC `0.0.456858` associated**, HBAR for the association tx |
| Buyer agent | Hedera mainnet | USDC + association; HBAR for its own association tx |
| Same pair | Hedera testnet | USDC `0.0.429274`, faucet HBAR, `api.testnet.blocky402.com` feePayer `0.0.7162784` |
| ATS deployer/admin + issuer | Hedera testnet | ECDSA key, ~200–500 test HBAR if own deploy, Hashio RPC |
| Second EVM address | Hedera testnet | To receive in SM-07 |
| Circle console + API key + entity secret **+ recovery file** | — | Wallet set, ≥2 EOA wallets on `ARC-TESTNET`, faucet USDC |
| Resolver EOA | Arc testnet | Faucet USDC for gas |
| Contract deployer (Foundry) | Arc testnet | Faucet USDC |
| Human demo wallet (MetaMask) | Arc testnet | Faucet USDC; Arc chain added |
| Ethereum RPC | Ethereum mainnet | ⚠️ **Archive-capable** (§5.14) |
| Neon project | — | Pooled + direct URLs |

⚠️ **Mainnet HBAR has no faucet.** Exchange withdrawal + KYC. **Start today.**

---

## 8. Smoke tests — nine

| # | Test | Pass signal |
|---|---|---|
| **SM-01** | JCS canonicalizer against RFC 8785 reference vectors | Vectors pass; golden vectors shared with Foundry |
| **SM-02** | One document, **four or more deployments** *(amended)* | Populated fields + `_meta` from every one; identical shapes, and a deployment a schema version behind works or fails knowably |
| **SM-03** | 12-month snapshot, **both date bounds** | Rows return **and** timestamps fall inside the window ⚠️ `timestamp_gte` alone false-passes |
| **SM-04** | **Archive RPC: subgraph value at block N vs `eth_call` at block N** *(amended)* | The two agree — or the RPC cannot serve historical state and `NOT_CHECKED` is recorded |
| **SM-05** | x402 pay for a `"hello"` endpoint on Hedera | Payment settles; **native tx ID persisted before settle** |
| **SM-06** | Claude calls `run_document` | Loop invokes, data returns |
| **SM-07** | ATS **issue AND transfer** on testnet against the **public factory** | ⚠️ **Balance moved.** Proxy creation is not issuance. Plus: expiry of `0.0.9213391` recorded |
| **SM-08** | **Complete a payable call** via Circle DCW EOA | `msg.value` scale observed; **wallet address == `analysts.ts`**; Arc `eth_getLogs` range limit measured |
| **SM-09** | Browser: MetaMask + `wallet_addEthereumChain` + a stake, **under `next build`** | ⚠️ **Production build, not `next dev`** — dev-mode bundling hides ESM directory-import failures |

⚠️ **Amendment, 2026-09-05 — SM-02 and SM-04 swapped scope.** SM-02 read "Query one subgraph; plus one
`eth_call` at `head-1000`", and SM-04 read "Same document, four deployments". Those bundled two
unrelated questions into one row and left the other row a strict subset of it. **SM-02 is now the
multi-protocol query alone** — it has passed on that scope with five deployments across three schema
versions. **SM-04 is now the archive-RPC test:** read a value from a subgraph at block N, `eth_call`
the same value at block N, confirm they agree. That question is load-bearing for §5.14's corroboration
adapter and for G2.1, and deserves its own row rather than a clause inside one about something else.
SM-04 is blocked until an archive-capable `ETHEREUM_RPC_URL` exists; see `tracking/DECISIONS.md`.

**Money paths get failure tests against the deployment.**

**Assertions** (test files, with the feature): schema-drift modes · narration digit-outside-placeholder
rejection · vague directive → `needs_clarification` · token-holder not charged on either read ·
single-read grants no standing access · unpaid hit → 402 not 500 · ambiguous settlement recovery ·
resolver math on stubs then live · scorer under hostile attribution · void after deadline.

**Lookups** (Day 1, into `tracking/DECISIONS.md`): both Blocky402 hosts' `/supported` + feePayers · ATS public
factory expiry · exact pruning error strings · pruned floor per deployment · which deployments are live.

---

## 9. Build phases

**Infrastructure:** one Next.js app on Vercel Hobby + one GitHub Actions ticker. Route handlers are the
backend. No worker, no Docker.

**Graph data: fetched live, every time. No local index.** `config/protocols.ts` points at subgraph IDs.

**Runtime:** Hobby = **300s max duration**, 250MB standard bundle (Large Functions 5GB in beta), **daily
cron only**, ~1h log retention, read-only FS. ⚠️ **One invocation = one step** — one model turn, or one
query batch, or one finalize, each writing a checkpoint. **The full `messages[]` array persists between
turns; a resumed turn replays stored observations rather than re-querying.**

### Phase 0 — Gates
SM-01 … SM-09. Repo init, deploy empty app, **ticker workflow**, run all lookups, and **complete the
§7 inventory**.

⚠️ **Amendment, 2026-09-06 — `types/wire.ts` is deferred to Phase 1 Unit 1.** This line read "freeze
`types/wire.ts`" among the Phase 0 gates. That was right when it was written. Phase 0 then produced
three concepts the wire types have to carry which did not exist at drafting: **`RevenueAvailability`**
(three states, from SM-03's revenue sweep), **`CorroborationStatus`** (three states including
`NOT_CHECKED`, from SM-04), and **`Completeness`**. Freezing the contracts before the findings that
determine their shape is backwards — Day 1 would have frozen the wrong shape and Phase 1 would have
opened with a migration. The types are Unit 1 of Phase 1 instead, frozen **before the first
consumer**, which is what the Day-1 framing was actually protecting. See §5.18.

### Phase 1 — Data layer + agent
`graph/client.ts`, `adapter.ts`, `blockwindow.ts`, `paginate.ts`, `queries/` (pre-written documents +
curated SDL from `probe-protocols.ts`), `agent/loop.ts`, `tools.ts` (two tools).
**Exit:** the loop runs documents across **five deployments spanning three schema versions**, pinned
to a common block, deployed — **four of which carry figures a report will publish.** *(Amended
2026-09-06; read "four protocols".)* ⚠️ **Four is unsatisfiable against three schema versions.** 3.1.0
holds aave-v3, aave-v2 and compound-v3; 2.0.1 holds compound-v2; **3.0.0 holds morpho-blue alone.**
Cutting to four drops morpho and takes a schema version with it. Morpho stays because it is the only
3.0.0 deployment and the only non-Messari publisher on the standardized template — but it is flagged
throughout and **its numbers are not publishable**; see `tracking/phases/PHASE-1.md`.

### Phase 2 — Report building
`compose.ts` (documentId + variables + `needs_clarification`), `workflow/gather`, `reconcile.ts`,
`invariants.ts`, `narrate.ts` + `validate-narration.ts`, `domain/canonical.ts`.
**Two forms: balance overview, forecast attachment.**
**Exit:** several directives → well-formed, data-backed, multi-protocol reports with stable hashes.

### Phase 3 — ATS + x402 + the checkpoint
`ats.ts`, `auth.ts`, `quotes.ts`, `gate.ts`, `recover.ts`, `buyer.ts`, `verify-ats.ts`.
**Exit:** a report is issued and **≥1 ResolverProxy verified on HashScan**; the buyer agent completes
one real x402 purchase; token-holder isn't charged on either read; a lost response recovers.

### Phase 4 — Market (CORE)
`AlphaMarket.sol` + tests, `spec.ts`, `units.ts`, `events.ts`, `resolve.ts`, `score.ts`,
`ui/wallets/`.
**Exit:** an analyst commits on-chain with its own USDC, a human stakes from MetaMask, the resolver
settles from Graph data, three scores update, and `voidMarket` works after the deadline.

### Phase 5 — Polish
Fund wallets. **Seed pools** — parimutuel with two participants is invisible; ⚠️ **disclose in the UI
if analyst wallets seed** (house-vs-house). Diagram. Arc mainnet **readiness demonstrated**. Demo 5×.
⚠️ **Calendar the demo market so one real cycle completes with receipts before recording.**

### Phase 6 — Submit
Video 2–4 min. Seven submission docs. README: setup, architecture, payment flow, what we built on, AI
attribution.

---

## 10. Risk register

| ID | Trigger | Branch A | Branch B |
|---|---|---|---|
| R1 | SM-03 fails | Balance questions settle on latest available snapshot, stated in spec | Flow metrics only |
| R2 | SM-05 fails | ⚠️ **Verify `/supported`, feePayer, association, network string** — *not* "switch hosts," which is a config change not a retry | **Self-facilitation** (`@x402/hedera` exports the facilitator scheme). Loses H1.2, keeps the demo |
| R3 | SM-07 fails on the public factory | Own deploy via `tooling/ats/` — 111 contracts, resumable manifest | Series token (repeated-cost fix only; doesn't fix bad roles or keys) |
| R4 | <3 usable protocols | Well-signalled deployments only | **Two already satisfy G1.3** |
| R5 | ~~SM-08 unexpected decimals~~ **FIRED, and measured 2026-09-06.** `msg.value` is 18dp native; the ERC-20 view is 6dp. Normalize by **10^12 at one named site**; test contract input, pool math, payout, display, dust. ⚠️ Also: Arc emits `Transfer` from `0xffff…fffe` at **18**dp while `decimals()` says 6 — never scale an Arc `Transfer` log by the token's `decimals()` | — |
| R6 | Circle polling fights serverless | Poll as a **job step**, never a held-open request | ⚠️ ethers fallback is a **different identity** — needs funded wallet, role changes, pending-op reconciliation |
| R8 | Agent overspends | **Reserve before submission**, durable operation ID; ambiguous stays reserved | — |
| R9 | Resolution runs twice | `require(!resolved)` in Solidity | Score writes idempotent on `(marketId, claimId)` |
| R10 | Subgraph timeout mid-settlement | Fetch before submit | Journal + reconcile next tick |
| R11 | Vague directive | `needs_clarification` with required intent fields | — |
| R12 | Mainnet HBAR unavailable **or Hobby ToS concern** | ✅ **TAKEN 2026-09-05.** Running x402 on testnet — H1.1 accepts it. Facilitator URL, network string, token ID and accounts moved **together**; startup feePayer assertion still owed. §1 amended, values in `tracking/DECISIONS.md` | — |
| R14 | Job fails after a paid read | Serve from persisted body (§5.7 means nothing is generated after payment) | — |
| R15 | Payment ok, ATS transfer fails | Journal; retryable completion | Manual compensation, logged |
| R16 | Two buyers, one unit | Inventory reservation before settlement | 409 |
| R17 | Source republished after market creation | `specHash` pins the deployment hash → `voidMarket` | — |
| R18 | Stream reconnect | Lease check — attach, never restart | — |
| R19 | Ticker missed or duplicated | Advance since last **completed cursor**, with leases | Request-driven `advance` |
| R20 | Circle tx stranded | Stays reserved; reconcile next tick | ⚠️ **Never retry via ethers** |
| R21 | Missing snapshot day | Retry until `resolveDeadline` → **VOID** | — |
| R22 | Pagination incomplete | Report `INCOMPLETE`; verdict withheld | — |
| R23 | Deployed bundle exceeds limit | Split heavy routes | Large Functions (beta) |
| R25 | 🆕 No common block across protocols | Per-protocol as-of with disclosed skew | **Decline the comparison** |
| R26 | 🆕 `initialize()` crash loop | Lazy init + try/catch → 503 + health check | — |
| R27 | ~~Non-archive RPC~~ **RETIRED for Ethereum 2026-09-06** — SM-04 measured archive to block 1 on the provisioned RPC. Stays live only as a swap-provider risk. ⚠️ Arc's own RPC **is** pruned (`4444 pruned history unavailable`, SM-08) | Swap provider |
| R28 | 🆕 SM-09 fails under `next build` | Narrow to agent-only staking with a second Circle wallet | ⚠️ Weakens A5 — Arc still sees value move |

---

## 11. Cut order

| # | Cut | Sacrifices |
|---|---|---|
| 1 | Substreams / ERC-4626 | Nothing — already cut |
| 2 | Base x402 buyer | Nothing — explicitly optional |
| 3 | MCP discovery (`discover.ts`) | A composition bullet. ⚠️ **Removed from Phase 1 exit and from the tree** until reversed |
| 4 | HCS audit trail · royalty split | Extra points |
| 5 | Ranking + comparison report forms | Nothing required |
| 6 | Third analyst config | Nothing |
| 7 | `prune: never` fork | G1.4 (optional). ⚠️ **SM-7 belongs here, not in Phase 0** |
| 8 | Operations UI, budget ledgers, author proceeds, Playwright | Nothing required |
| 9 | Human Arc staking → agent-only | ⚠️ Weakens A5 and the DoD |
| 10 | Circle DCW → raw ethers | 🔴 A3 — the strongest Agent Stack evidence |

**Never cut:** reconciliation engine · x402 gate · on-chain claims · resolution · void path · live
Graph data · diagram · video.

---

## 12. Open items

| # | Question | Owner |
|---|---|---|
| U2 | Circle Console KYC? | Today |
| ~~U3~~ | ~~DCW `amount` decimal scale~~ **ANSWERED 2026-09-06 — 18 decimals.** Circle's `amount: "2.50"` arrives as `msg.value == 2500000000000000000`, confirmed from both the emitted log and the raw transaction `value` field. The ERC-20 view at `0x3600…0000` reports `decimals() = 6` on the same balance, so **`msg.value` ÷ 10^12 is the USDC amount**. R5 is live and now has a number | SM-08 ✅ |
| ~~U4~~ | ~~12-month snapshots survive?~~ **ANSWERED 2026-09-05 — yes, completely.** No retention floor exists: full in-bounds windows at 6, 12, 18 and 24 months, oldest snapshot 2023-01-27 (aave-v3 launch day). §5.16 needs no amendment | SM-03 ✅ |
| U5 | Pruned floor per deployment | Lookup |
| U6 | Which deployments are live | Lookup |
| ~~U9~~ | ~~ATS public factory expiry~~ **ANSWERED 2026-09-06.** Factory `0.0.9213391` expires `1789039172` (2026-09-10 11:19:32Z), confirming the recorded number; resolver `0.0.9212226` expires `1789037489`, **1,683s earlier and the binding constraint**. Both live. Recorded in `tracking/DECISIONS.md` | SM-07 ✅ |
| ~~U10~~ | ~~Arc `eth_getLogs` range limit~~ **ANSWERED 2026-09-06 — 30,000 blocks of span**, exact and stable (30,000 accepted, 30,001 refused, repeatably). ⚠️ Arc's own error strings understate it: refusals cite a "10,000 range" and a "max results 20000" cap, while 30,000 blocks and ~38,000 returned rows are both accepted. A busy address hits a **row** cap that drifts with traffic and names its own retry sub-range; a market contract is quiet and gets the full span. §5.18's backstop sizes from this measurement, not from the messages | SM-08 ✅ |
| ~~U11~~ | ~~Does Sourcify verification work for a ResolverProxy?~~ **ANSWERED 2026-09-06 — yes, `exact_match`, first attempt.** `0.0.10395983` is verified on Sourcify for chain 296. `creationMatch` is null because the proxy is created inside `deployEquity` rather than by a top-level creation transaction, but the runtime match is what HashScan reads. Repeatable for every report token via `scripts/verify-ats.ts` | Unit A ✅ |

---

## 13. Definition of done

- [ ] Deployed and public. **External ticker running.**
- [ ] A stranger can browse, read previews, **stake from MetaMask on Arc**, and watch a resolution.
- [ ] Live Graph data, **five deployments across three schema versions** (four of them publishable),
      pre-written documents, pinned to a common block.
- [ ] Standards leverage demonstrated on camera — a 3.1.0 POOLED protocol added via one config line.
- [ ] **One real x402 paid request by the buyer agent**, on camera, settled through Blocky402.
- [ ] ATS issuance + configuration + transfer on testnet; **≥1 ResolverProxy verified on HashScan**.
- [ ] **An analyst commits on-chain with its own USDC**; humans stake alongside; resolution settles from
      Graph data; three scores update; `voidMarket` works.
- [ ] Architecture diagram; Arc mainnet readiness demonstrated.
- [ ] Seven submission docs. `AI_USAGE.md`. All planning artifacts shipped.
- [ ] Video 2–4 min, ≥720p, human voice, rehearsed 5×.

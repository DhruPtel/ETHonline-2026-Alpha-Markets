# Kessan — PLAN v3

**An executable build plan for a Graph-powered analyst, Hedera report market, and Arc prediction market**

Version: 3.0 · Prepared: 5 September 2026 · Event: ETHOnline 2026

**Status:** proposed implementation baseline. This document specifies the work; it does not claim that the integrations have passed. Live, authenticated Graph queries, funded ATS writes, Circle payable execution, and the combined Vercel deployment still need the evidence gates below.

**Supersedes:** the architecture, requirements interpretation, smoke-test list, risk branches, and cut order in `PLAN-v2.md`. Incorporates the working agreement from `AMENDMENT-01.md`, with the corrections in §15. Preserve both originals in the repository.

## How to use this plan

Read §1–3 for the product and its rules, §4–6 for the repository and infrastructure, and §7–12 for implementation. §13 is the failure playbook. §14–15 define completion and how we work together. §16 records the research decisions and sources.

The execution order is **Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4 → integration and submission**. Phases advance on evidence, not dates. Phase 4 is core. Both purchase models are core. A failed gate changes the relevant design before dependent work continues.

## 1. The product we are actually building

Kessan turns a free-text lending question into an evidence-backed report. An analyst selects supported protocols and metrics, composes validated GraphQL, fetches live data from The Graph, runs deterministic calculations and checks, and writes a structured report. The exact input evidence and finished report are preserved.

Each published report receives its own ATS asset on **Hedera testnet**. A buyer can pay for a read or purchase that asset using an **x402 payment on Hedera mainnet**. Both pass through one access controller. Owning the asset grants continuing access while ownership persists; a read purchase grants one logical delivery with bounded recovery for interrupted downloads.

For reports containing a forecast, the analyst commits a specific prediction and its report hash to an **Arc testnet** market before the prediction window begins, and stakes USDC from a Circle developer-controlled wallet. Other participants can back that committed prediction. After the observation window closes, a resolver queries The Graph again using the frozen question specification, records the evidence, and submits the outcome to Arc. The contract makes payouts claimable. Scores derive from the analyst's committed prediction and the final outcome.

The product must distinguish three things:

| What the user sees | What it means |
|---|---|
| Data checks | Whether the report's inputs and calculations passed named checks. This is not a solvency audit. |
| Forecast record | Whether a prediction made before the observation window matched the later observation. This does not prove every statement in a report was correct. |
| Earnings and stake P&L | Report-sale proceeds on Hedera mainnet and market payouts on Arc testnet, shown separately. Testnet USDC is not real revenue. |

### 1.1 Fixed scope

- One Next.js application deployed on Vercel; its Node route handlers are the backend.
- One managed Postgres database for application state, evidence, durable jobs, and accounting.
- Hosted Graph subgraphs queried on demand. No local protocol index, Graph Node, Substreams sink, or chain-data warehouse.
- Claude Messages API tool-use loop, bounded by code and persisted between execution steps.
- ATS contracts, driven through narrow ABIs; one asset per report.
- Hedera x402 using Blocky402 and exact USDC pricing.
- Both purchase models: **read** and **own**.
- Arc binary parimutuel markets, author stakes, Graph resolution, refunds/voiding, pull payouts, and report-linked scoring.
- Two configured analysts with distinct documented forecast policies and separately funded wallets. This is a bounded agent economy, not permissionless anonymous analyst onboarding.
- Browser users can commission within quotas, buy, prove ownership, stake their own Arc funds, and claim without a terminal.

### 1.2 Decisions that correct v2

| v2 assumption or design | v3 decision |
|---|---|
| Charging to reserve a generation job guarantees no charge for a failed report | Commissioning is authenticated and quota-limited, initially platform-funded. Sell only completed, persisted reports. A paid generation product would need a separate delivery/refund contract. |
| A job ID authorizes an ungated content stream | Job IDs locate records. Sessions authorize progress; the access controller authorizes content. Progress events contain no premium report body. |
| Module state and a poll endpoint are enough to finish jobs | Postgres holds durable steps, leases, idempotency keys, and transaction references. Vercel Pro cron recovers due work even when nobody has the page open. |
| Freeze one global `types.ts` immediately | Version small schemas by domain. Freeze a funded market's terms and a published report's content, not unfinished source-code types. |
| A staker's `reportRef` tells us what the analyst predicted | The analyst commits a report hash, question hash, and side onchain before close. Stakes reference that commitment. |
| TVL equality and the eleven upstream monitor checks establish financial correctness | Rebuild the check set by meaning. Separate arithmetic identities, data-quality problems, economic indicators, and optional external corroboration. |
| Twelve-month snapshot rows prove all future settlements will work | Probe bounded historical windows, missing days, finalization, deployment identity, and repeat reads. Availability remains a runtime dependency with a void deadline. |
| A primary listing is automatically a secondary market | Core is primary issuance and sale, followed by ownership-based access. Resale is an optional, separately specified feature. |
| Arc mainnet readiness is an environment-variable switch | Require a deployment manifest, supported wallet/network configuration, funding, verification, replay, and recovery checks. Claim readiness only with that evidence. |
| A 110 MB dependency installation proves Vercel fit | Measure traced production functions, cold starts, payloads, and memory after the real imports are present. |

## 2. Track rules and eligibility

**Rules were checked against the official event pages on 5 September 2026.** They take precedence over research recommendations and this plan. Recheck before submission and record any change in `docs/planning/DECISIONS.md`.

### 2.1 Global rules

Start Fresh excludes project-specific code, designs, and assets made before the event; public libraries and starter kits are permitted with attribution. Check the dates of our planning materials as well as code. Keep meaningful version history, identify reused work, document AI-assisted files/assets, and include the planning/spec/prompt artifacts. Team members must make meaningful contributions. The event allows three partner selections; multiple tracks from one partner occupy one selection. Submit by **13 September 2026, noon EDT**. The event video is **2–4 minutes, at least 720p**; use human narration, avoid sped-up footage, and edit out waiting where helpful. [Official global rules](https://ethglobal.com/events/ethonline2026/info/details).

**Project action:** select The Graph, Hedera, and Arc. The multi-track counting question is answered on the official page; it does not need another approval or a Discord message. No prescribed daily commit count appears in the rules. Our small-unit protocol exists for reviewability and a truthful development history.

**Eligibility decision:** target **Start Fresh**, conditional on the actual project history satisfying the rule. The Graph lists a separate AI Continuity prize; Hedera lists a separate Continuity prize; Arc lists a combined DeFi/Agentic Continuity prize and a separate Continuity mainnet-launch pool. Those are different entry routes, not extra prizes to claim alongside this plan's Start Fresh targets. If project-specific work predates the event, record it honestly, switch to the applicable Continuity route and recheck each partner's eligibility; a new repository does not reset the work's origin. The current documents establish the intended route, not proof of the team's registration or creation dates. [Graph pools](https://ethglobal.com/events/ethonline2026/prizes/the-graph), [Hedera pools](https://ethglobal.com/events/ethonline2026/prizes/hedera), [Arc pools](https://ethglobal.com/events/ethonline2026/prizes/arc).

### 2.2 Qualification versus judgment

“Required” below means an explicit qualification/submission condition. “Judged” means a quality criterion or extra-point opportunity. A planned component is **not evidence of satisfaction**. Initial evidence state for every row is `NOT YET DEMONSTRATED`.

| ID | Track and binding condition | Implementation evidence to collect |
|---|---|---|
| G-S1 | Graph standardized: meaningful use of a shared schema **or** composition of multiple Graph products | Same validated query document on multiple independent lending protocols; capability/semantic adapter; side-by-side output. |
| G-S2 | Live Graph-provider data; explain the standards advantage; public repo and 2–4 minute video | Deployed query logs, source identities, configurable protocol addition, runnable setup. |
| G-A1 | Graph AI From Scratch: load-bearing live Graph data and meaningful AI use; correct eligibility pool | Directive → plan → live queries → calculations/report; later resolution through the same client. |
| G-A2 | Open-source runnable README or skill; reusable infrastructure **if entering as tooling** | Core entry is the agent/app use case. Ship an independently runnable query/report skill bundle as an additional artifact. |

The standardized track does not prescribe three protocols. Our target is **three independent protocol deployments**, with two as the smallest credible cross-protocol slice. Authoring a subgraph and the Substreams one-prompt challenge are optional paths, not obligations of this architecture. [Official Graph tracks](https://ethglobal.com/events/ethonline2026/prizes/the-graph).

| ID | Track and binding condition | Implementation evidence to collect |
|---|---|---|
| H-P1 | Live Hedera testnet/mainnet x402 service using Blocky402; a consumer completes a real paid request | Production URL, actual challenge/settlement headers, consensus receipt, buyer receives the report. |
| H-P2 | Public GitHub README covers setup, architecture and payment flow; video ≤5 minutes shows execution | Payment runbook and event-length video. |
| H-T1 | ATS SDK/contracts/web app used to issue/manage an asset; demonstrate on Hedera testnet | Pinned ATS provenance; factory, asset, issuance and transfer receipts. |
| H-T2 | Public repo, HashScan verification where applicable; video shows issuance, configuration and lifecycle | Verification records and UI evidence of issue/configure/transfer. |

Compliance controls, a real secondary market, royalties, richer metering, and HCS trails are judged extras. A transfer is the core lifecycle operation. Merely labeling reports “equity” does not make the application compelling tokenization; the access right and lifecycle must work. [Official Hedera tracks](https://ethglobal.com/events/ethonline2026/prizes/hedera).

| ID | Arc target | Implementation evidence to collect |
|---|---|---|
| A-C1 | Shared required deliverables: functional frontend/backend, architecture diagram, video plus presentation, detailed documentation, repo | Running market UI/API, diagram source/export, short slides, Circle integration instructions. |
| A-A1 | Agentic Economy: judged on signal-driven decisions, autonomous USDC transactions and effective Agent Stack use | Live forecast inputs; spend policy; Circle Wallets transaction IDs linked to Arc stakes and payouts. |
| A-D1 | DeFi/Onchain Finance: judged on meaningful Arc/USDC use and programmable money flows | Escrowed stakes, conditional resolution, claims, refunds and accounting. |
| A-M1 | Additional mainnet-readiness target: deployed or deployment-ready by September 30 | Separate readiness checklist and reproducible deployment package. |

**Primary Arc target is Agentic Economy; submit DeFi too when the completed mechanism demonstrates its criteria.** Keep mainnet readiness as an additional, conditional submission claim. Circle Wallets is a named product; using its DCW SDK is our deliberate server-side integration, not a claim that we ran the CLI starter kit. The judges decide the strength of that choice. [Official Arc tracks](https://ethglobal.com/events/ethonline2026/prizes/arc).

### 2.3 Requirements that are ours

The following are product decisions, not quotations from sponsor law: Vercel-only application compute; no local protocol index; three-protocol target; two purchase modes; per-report tokens; Phase 4 core; one access checkpoint; immutable evidence; durable recovery; author-bound scores; tiny capped initial stakes. Unit tests may use fixtures. The product and qualification demo must execute live provider and chain paths. Keeping the evidence of an actual live query is part of auditability, not a mocked data source.

## 3. Reuse, original work, and the technical boundaries

### 3.1 What we take

| Source | Reuse | Boundary |
|---|---|---|
| Messari subgraphs | Stable lending schema, known query patterns, mappings as semantic reference, deployment candidates | Treat endpoint health and supported fields as measured capabilities. Reimplement domain adapters and checks. |
| x402 core/Hedera/Next | Protocol encoding, verification/settlement interface, Hedera transaction construction | Build our own persistent purchase semantics, recovery, access rules and budget ledger around these packages. |
| scaffold-hbar x402 branch | Browser signer pattern, account/address conversion ideas, hosted facilitator initialization pattern | Do not clone its monorepo or inherit webpack exclusions, Docker, storage, network defaults or wallet framework wholesale. |
| x402 inference PoC | Flow and failure observations | It had no license in the supplied review. Use it as a reference; write original glue or copy only from an explicitly licensed source. |
| ATS v8 contracts | Factory/asset interfaces and audited upstream contract source | Deploy upstream infrastructure as a provisioning operation. Runtime uses extracted minimal ABIs plus ethers. |
| Circle Wallets | DCW SDK with API key/entity secret | Use EOA wallets initially. Avoid the terminal starter kit, interactive login and OS keyring. |
| Subgraphs/StreamingFast skills | Routing, knowledge-pack structure, golden-evaluation approach | Author our own query and report skills; explicitly load them in the API loop. |

### 3.2 What we build

The original work is the supported-protocol registry; capability and semantic adapters; constrained query planner; deterministic financial transformations/checks; report/evidence format; durable application workflows; wallet/session binding; unified access gate; primary token sale with recovery; atomic spend ledger; Arc contract; frozen market question format; resolver evidence; author-bound score computation; and the frontend that exposes these states.

**Service:** a separately operated endpoint, such as Vercel, Neon, The Graph gateway, Blocky402, Anthropic or Circle. **Module:** imported TypeScript with no independent process, such as `querySubgraph()` or `reconcile()`. **Workflow:** persisted application steps executed by successive Vercel invocations. **Script:** local/CI provisioning or verification that exits, such as deploying ATS infrastructure. Contracts execute on their chains.

There is no background program hidden behind the word “agent.” There is no database hidden behind `querySubgraph()`. There is no ownership service hidden behind the SQL catalog: current ownership comes from ATS.

## 4. The Goal repository

This is the intended end state, not a request to create empty files at the start. Create files when their units are implemented. Tests beside a module belong to that module; cross-module tests go under `tests/integration/`.

```text
kessan/
├── README.md                          # Product, run instructions, diagram, sponsor links
├── LICENSE
├── AI_USAGE.md                        # File/asset attribution and human contributions
├── THIRD_PARTY_NOTICES.md              # Reused source, licenses, revisions, modifications
├── package.json                       # App runtime and developer dependencies
├── package-lock.json                  # Exact resolved dependency graph
├── .env.example                       # Names and purpose only; no filled credentials
├── .node-version
├── next.config.ts                     # Explicit build tracing; no x402 stubs
├── vercel.json                        # Region/config and production cron schedule
├── tsconfig.json
├── vitest.config.ts
├── eslint.config.mjs                  # Also enforces module import boundaries
│
├── docs/
│   ├── planning/
│   │   ├── PLAN-v3.md                 # Active plan; README links here
│   │   ├── PLAN-v2.md                 # Preserved original
│   │   ├── AMENDMENT-01.md            # Preserved original
│   │   ├── DECISIONS.md               # Dated decisions and changed assumptions
│   │   ├── STATE.md                   # Current approved unit, done, blocked, next
│   │   ├── requirements.md            # Evidence ledger for §2 IDs
│   │   └── assumptions.md             # Unmeasured items and their proving gate
│   ├── research/                     # All 15 supplied research notes, unchanged
│   ├── architecture/
│   │   ├── system.mmd
│   │   ├── system.svg
│   │   ├── system.png
│   │   ├── data-contracts.md
│   │   └── trust-model.md
│   ├── evidence/                     # Sanitized smoke results and receipts
│   ├── runbooks/                     # Provision, recover, migrate, release, mainnet
│   └── submissions/                  # Graph AI, Graph standards, Hedera x2, Arc
│       └── presentation.md
│
├── skills/graph-lending-analyst/
│   ├── README.md                     # Standalone setup and invocation
│   ├── manifest.json                 # Skill revisions, entry points, source hashes
│   ├── query/SKILL.md
│   ├── query/references/              # Capability matrix and query/semantic rules
│   ├── report/SKILL.md
│   ├── report/references/             # Balance overview, ranking, comparison, forecast
│   └── eval/                         # Cases, golden expectations, honest results
│
├── contracts/arc/
│   ├── foundry.toml
│   ├── foundry.lock                  # Pinned contract tooling/dependencies
│   ├── src/KessanMarket.sol
│   ├── test/                         # State, payout, authorization, fuzz invariants
│   ├── script/Deploy.s.sol
│   └── deployments/                  # Per-chain address, ABI hash, tx, compiler settings
│
├── tooling/
│   ├── upstreams.lock.json           # ATS/scaffold source commits and license metadata
│   └── ats/                          # Local-only deployment/export instructions
│       ├── README.md
│       └── deployment-config.json    # Public config; keys come from local env
│
├── scripts/
│   ├── smoke/SM-01.ts ... SM-09.ts
│   ├── probe-protocols.ts
│   ├── provision-hedera.ts
│   ├── provision-circle.ts
│   ├── deploy-ats.ts                 # Invokes pinned upstream local tooling
│   ├── export-abis.ts
│   ├── build-skills.ts               # Compiles canonical Markdown into server asset
│   ├── check-bundles.ts
│   ├── check-network-config.ts
│   ├── migrate.ts
│   ├── replay-report.ts
│   └── rebuild-scores.ts
│
├── db/
│   └── migrations/                  # Ordered SQL; no schema writes at app startup
│
├── src/
│   ├── app/                          # Next pages and thin HTTP adapters
│   │   ├── page.tsx                  # Directive desk and supported-protocol picker
│   │   ├── reports/[id]/page.tsx      # Preview, provenance, read/own controls
│   │   ├── markets/page.tsx
│   │   ├── markets/[id]/page.tsx
│   │   ├── account/page.tsx           # Purchases, owned reports, claims
│   │   ├── operations/page.tsx        # Authorized operational status/recovery UI
│   │   └── api/
│   │       ├── auth/{challenge,verify,logout}/route.ts
│   │       ├── commissions/route.ts
│   │       ├── jobs/[id]/route.ts
│   │       ├── jobs/[id]/events/route.ts
│   │       ├── reports/route.ts
│   │       ├── reports/[id]/preview/route.ts
│   │       ├── reports/[id]/access/route.ts
│   │       ├── purchases/[id]/route.ts
│   │       ├── markets/route.ts
│   │       ├── markets/[id]/refresh/route.ts
│   │       ├── operations/[id]/advance/route.ts
│   │       ├── cron/route.ts
│   │       └── health/route.ts
│   │
│   ├── ui/                           # Browser-only components, wallet controls
│   │   ├── wallets/{evm,hedera}.ts
│   │   └── components/
│   ├── config/
│   │   ├── public.ts                 # Explicit browser-safe network/display subset
│   │   ├── env.server.ts             # Route-scoped secret validation
│   │   ├── networks.ts               # Separate named networks; no global toggle
│   │   ├── analysts.ts               # Identities, policies, wallet references
│   │   └── limits.ts                 # Queries, model turns, spend, stakes, payloads
│   ├── domain/
│   │   ├── ids.ts                    # Network-qualified identities and branded units
│   │   ├── report.ts                 # Versioned report/evidence boundary schemas
│   │   ├── purchase.ts               # Quote, receipt, entitlement schemas
│   │   ├── prediction.ts             # QuestionSpec and ClaimSpec shared with contracts
│   │   ├── operation.ts              # Durable operation/transaction references
│   │   └── canonical.ts              # Exact numeric encoding and hash rules
│   │
│   ├── graph/
│   │   ├── client.ts                 # querySubgraph(): the sole Graph execution client
│   │   ├── protocols.ts              # Approved endpoints and semantic capabilities
│   │   ├── introspect.ts             # Live shape, enum and description inspection
│   │   ├── validate-query.ts          # AST limits, allowed fields, variables
│   │   ├── queries/                  # Core, ranking, snapshot and optional field documents
│   │   ├── adapters/                 # aave-family, compound-v2, compound-v3
│   │   ├── paginate.ts               # Complete bounded reads with cursors
│   │   ├── source-context.ts          # Deployment and consistent observation block
│   │   └── errors.ts                 # Typed transport, schema, pruning, lag errors
│   ├── engine/
│   │   ├── compute.ts                # Deterministic transforms over normalized inputs
│   │   ├── reconcile.ts              # Check report; no network/model/database
│   │   ├── checks/                   # Data quality, identities, scoped economic checks
│   │   └── decimal.ts                # Arithmetic/rounding policy
│   ├── agent/
│   │   ├── loop.ts                   # One bounded Claude turn at a time
│   │   ├── plan.ts                   # Intent -> validated executable query plan
│   │   ├── tools.ts                  # Read-only tool definitions/dispatch
│   │   ├── narrate.ts                # Prose and fact references over ComputedReport
│   │   ├── forecast.ts               # Explicit forecast/abstention policy
│   │   ├── buy-decision.ts            # Select useful report and assess price/coverage
│   │   └── generated/skills.ts       # Built from canonical /skills; do not hand-edit
│   ├── reports/
│   │   ├── format.ts                 # Mechanical section/order/reference enforcement
│   │   ├── finalize.ts               # Persist immutable envelope and content hash
│   │   ├── catalog.ts                # Listings and previews; no ownership truth
│   │   └── evidence.ts               # Source-response persistence and replay
│   ├── tokenization/
│   │   ├── ats.ts                    # Narrow factory/asset operations
│   │   ├── issuance.ts               # Per-report issuance state transitions
│   │   ├── ownership.ts              # Current balance/configuration checks
│   │   ├── isin.ts
│   │   ├── abi/                      # Minimal generated ABIs plus source metadata
│   │   └── connectors/hedera-testnet.ts
│   ├── payments/
│   │   ├── x402.ts                   # Resource server and protocol adapter
│   │   ├── quotes.ts                 # Immutable read/own terms
│   │   ├── purchase.ts               # Purchase ledger and reservation transitions
│   │   ├── recover.ts                # Transaction ID -> mirror/consensus evidence
│   │   ├── buyer.ts                  # Headless buyer; bounded, durable payment attempt
│   │   ├── refunds.ts                # Separate compensating transfers
│   │   └── connectors/{blocky402,hedera}.ts
│   ├── access/
│   │   ├── authorize.ts              # The single preview/read/own checkpoint
│   │   ├── sessions.ts               # Wallet proof, session, nonce, CSRF handling
│   │   └── delivery.ts               # Scoped logical-read receipt and recovery
│   ├── market/
│   │   ├── questions.ts              # Whitelisted snapshot metric specifications
│   │   ├── claims.ts                 # Analyst commitment and report binding
│   │   ├── stake.ts                  # Validated contract actions
│   │   ├── resolve.ts                # Graph observation -> proposed outcome/evidence
│   │   ├── score.ts                  # Derived authored-prediction score entries
│   │   ├── events.ts                 # Bounded replay of our own contract events
│   │   ├── units.ts                  # Native18 and token6 boundaries
│   │   ├── abi/KessanMarket.json
│   │   └── connectors/{arc,circle}.ts
│   ├── treasury/
│   │   ├── budgets.ts                # Atomic reserve/settle/release per rail
│   │   └── revenue.ts                # Author proceeds, refunds, payout liabilities
│   ├── workflows/
│   │   ├── dispatch.ts               # Resume due steps with leases/fencing
│   │   ├── report-run.ts
│   │   ├── token-sale.ts
│   │   ├── analyst-action.ts
│   │   ├── resolution.ts
│   │   └── reconcile-transactions.ts
│   ├── store/
│   │   ├── db.server.ts              # Neon connector, small bounded connections
│   │   └── repositories/             # Domain-specific SQL operations
│   └── observability/
│       ├── log.ts                    # IDs/timing/error codes; secret redaction
│       └── metrics.ts                # Health, jobs, unknown payments, spend, lag
│
├── tests/
│   ├── integration/                 # Recovery and cross-subsystem invariants
│   ├── e2e/                         # Browser access and full live path
│   └── fixtures/                    # Test-only, never a production data fallback
└── .github/workflows/               # Type/lint/unit/contract/build checks
```

### 4.1 Import rules: how this remains clean

`domain/` and `engine/` have no chain, model, framework or database imports. `graph/` returns typed observations without writing reports. `agent/` proposes plans, prose and decisions; it cannot directly sign arbitrary transactions. `reports/` owns document identity and catalog state. `tokenization/` owns ATS behavior; `payments/` owns payment facts; `access/` combines those facts into an access decision. `market/` owns market interpretation and contract actions. `workflows/` coordinates across modules and persists transitions through `store/repositories/`.

Route handlers validate/authenticate, call a workflow or module, and translate its result to HTTP. They do not contain financial rules. Browser code imports only public config, domain-safe types and browser wallet adapters. Server modules use `server-only` guards. Avoid a root barrel that imports every signer into every function.

**Expected cross-boundary files are intentional:** the report catalog belongs in `reports/`, not ATS; access belongs above payment and ownership; job orchestration belongs outside the LLM loop; RPC corroboration belongs in a connector, not the pure engine; schema/ABI boundary definitions belong in small shared domain files. These moves correct the boundaries that v2's “each subsystem contains everything” layout would fight.

## 5. Dependencies and connector attachment points

### 5.1 Dependency baseline

Use npm with one application lockfile. Set Node **22.x** in development and Vercel. Start on a supported **Next 16 release satisfying `@x402/next@2.25.0`'s `>=16.2.6` peer**, with its compatible React versions; resolve exact maintained patches in SM-01 and commit them. Do not carry the Next 15 `legacy-peer-deps` workaround into a new application.

| Group | Runtime dependency | Pin/validation policy |
|---|---|---|
| Framework | `next`, `react`, `react-dom`, `server-only` | Exact versions selected in SM-01; supported peer graph and deployed build required. |
| Graph | `graphql` | AST parsing/validation; network client uses built-in `fetch`. |
| Agent | `@anthropic-ai/sdk` | Exact SDK and configured model ID tested in SM-05. No assumed automatic skill loading. |
| Validation/math/hashing | `zod`, `decimal.js`, an RFC 8785 JCS canonicalizer | Exact versions selected in SM-01; canonicalizer must pass reference vectors; money uses branded bigint units. SHA-256 uses Node's built-in crypto. |
| x402 | `@x402/core`, `@x402/hedera`, `@x402/next`, `@x402/extensions` | Initial source-tested baseline **2.25.0**, all exact. Upgrade together only after relevant checks. |
| EVM chains | `ethers` v6 | One runtime EVM library for ATS, Arc reads, browser EIP-1193 and unit conversion. No separate viem dependency needed for the core. |
| Circle | `@circle-fin/developer-controlled-wallets` | Initial reviewed baseline **10.8.0**; validate against current account/API in SM-08. |
| Database | `postgres` | Pooled Neon URL, bounded connection count, short transactions; no session-level locks. |
| Browser Hedera | `@hashgraph/hedera-wallet-connect` or the compatible connector proven by SM-09 | Client-only dynamic import. Exact version chosen after signing and production tracing pass. |

Developer dependencies include TypeScript, `tsx`, Vitest, Playwright, lint tools, the pinned ATS contract package for ABI extraction, and build inspection tooling. Foundry and OpenZeppelin contract dependencies are pinned separately under `contracts/arc/`; upstream ATS deployment dependencies belong to the pinned local tooling checkout, not the production function.

**ATS runtime does not import the full ABI/typechain barrel.** `export-abis.ts` extracts only factory creation, role, issue, transfer, balance, metadata/config and required events into small JSON files, preserving version/source/license metadata. The original package is `@hashgraph/asset-tokenization-contracts@8.0.0`; the SDK is excluded. Bytecode and Hardhat artifacts stay outside runtime tracing.

Use the SDK classes re-exported by `@x402/hedera` for its native Hedera objects. If a browser connector pulls a different SDK copy, cross the boundary using serialized bytes and primitive strings, not class instances. An install succeeding does not prove cross-package object compatibility.

Excluded from the deployed application: Circle CLI, Claude Code/Agent SDK shell execution, Hedera Agent Kit, ATS SDK, LM Studio, Express servers, Substreams binaries, Graph CLI, Docker, MinIO and local wallets/keyrings. Some remain useful local references or provisioning tools.

### 5.2 Networks are separate namespaces

The core has four network contexts: **Ethereum mainnet observations, Hedera mainnet payments, Hedera testnet ATS, Arc testnet markets**. Payment development adds Hedera testnet; eventual Arc mainnet is another configuration, not a universal switch.

| Connector | Runs where | Public configuration | Secret/funding requirements |
|---|---|---|---|
| Graph gateway | `graph/client.ts`, Vercel Node | Subgraph ID, expected deployment hash, source chain and capabilities | `GRAPH_API_KEY`, server-only; billing/quota settings. |
| Ethereum RPC | Graph source-context/corroboration adapter | Chain 1, provider endpoint reference | `ETHEREUM_RPC_URL` if credential-bearing; read-only, no Ethereum signing key. |
| Claude | `agent/loop.ts`, Vercel Node | Model ID, skill/prompt revisions, limits | `ANTHROPIC_API_KEY`. |
| Blocky402 | `payments/connectors/blocky402.ts` | Production `https://api.blocky402.com`; test `https://api.testnet.blocky402.com`; explicit network | No facilitator key. Check `/supported`; obtain fee-payer metadata there. |
| Hedera payment buyer/treasury | `payments/connectors/hedera.ts` | Account IDs, USDC token ID, mirror URL, network | Distinct buyer keys; treasury key for refunds/proceeds; HBAR and USDC funding; association. |
| ATS | `tokenization/connectors/hedera-testnet.ts` | Chain 296, RPC URL, factory/resolver/config version | Testnet issuer/treasury ECDSA key, test HBAR; deployment admin key kept out of ordinary runtime where possible. |
| Arc reads/human writes | Market connector/browser EIP-1193 | Testnet chain **5042002**, RPC, market address and ABI hash | Browser signs human stakes/claims. No human private key on server. |
| Circle agent writes | `market/connectors/circle.ts`, Vercel Node | `ARC-TESTNET`, wallet IDs/address mappings | `CIRCLE_API_KEY`, `CIRCLE_ENTITY_SECRET`; provision and fund separate analyst EOAs. |
| Arc resolution/admin | Market connector, Vercel/local deployment | Market role addresses | Dedicated resolver signer; deployer/admin key local. Resolver does not trade. |
| Neon Postgres | `store/db.server.ts`, Vercel Node | Region and database branch | `DATABASE_URL`; migration role uses separate `DATABASE_DIRECT_URL` locally/CI. |

Hedera USDC IDs in the reviewed x402 version are `0.0.456858` mainnet and `0.0.429274` testnet, both six decimals. Validate token metadata and account association when provisioning. ECDSA is our supported wallet choice, not an asserted protocol-wide prohibition on ED25519.

Use role-prefixed secrets, for example `PAYMENTS_MAINNET_BUYER_A_KEY`, `PAYMENTS_MAINNET_TREASURY_KEY`, `ATS_TESTNET_ISSUER_KEY`, and `ARC_TESTNET_RESOLVER_KEY`. Never infer a testnet account from a missing mainnet variable. A network-qualified address is `{network, address}`; a report token reference is `{network, contract, reportHash}`.

Provision a separate Circle wallet set for each analyst and verify that the resulting Arc addresses are distinct before registering them. Record wallet-set ID, wallet ID, address, network and analyst together. Do not infer independent agents merely from two API wallet records: Circle's EVM wallet-set address behavior needs to be respected. [Circle wallet provisioning](https://developers.circle.com/wallets/dev-controlled/create-your-first-wallet).

Additional secrets: `SESSION_SECRET`, `CRON_SECRET`, `INTERNAL_JOB_SECRET`, and `OPERATION_ENCRYPTION_KEY` for persisted signed transaction bytes. Support a key-version field for rotation. `.env.example` contains names and instructions only. Redact gateway URLs containing credentials, payment payloads, cookies, entity secrets and keys from logs. Vercel environment changes need a new deployment; public Next variables are build-time values. Keep only nonsecret display configuration public. [Vercel environment variables](https://vercel.com/docs/environment-variables).

### 5.3 Environment isolation

- **Local:** dedicated test database branch, test wallets, live hosted Graph reads. Anvil/fixtures only for automated tests.
- **Preview:** separate database branch and test signing identities. Real-money buyer, payout and autonomous cron actions disabled. Smoke/test routes require authorization and are disabled in production after use.
- **Production demo:** live Graph; Hedera mainnet read/own prices; ATS testnet; Arc testnet. Display all network labels at purchase/stake time.
- **Arc mainnet candidate:** separate deployment manifest, market contract, wallets and database namespace. Never redirect existing testnet market IDs to mainnet addresses.

Every connector verifies `eth_chainId` or the appropriate native network metadata against its configuration. Store a configuration revision on each operation. Existing operations keep their original network, amount, contract, recipient and provider references through upgrades.

## 6. What actually runs and what persists

### 6.1 Deployed infrastructure

Provision **one Vercel Pro project with Fluid compute**, one **Neon Postgres project** in a nearby region, and the external accounts listed above. Use the ordinary Node function path; target under the standard 250 MB uncompressed function limit. Current Vercel docs also describe larger-function and longer-duration betas, but they are not prerequisites of this plan. Node defaults/maxima with Fluid are 300/300 seconds on Hobby and 300/800 seconds on Pro/Enterprise, with a separate extended-duration beta. The documented ordinary payload limit is 4.5 MB and descriptor limit 1,024 shared across concurrent executions. [Vercel function limits](https://vercel.com/docs/functions/limitations).

Set explicit route durations. Initial design budgets, to be calibrated by SM-01 and integration runs:

| Invocation | `maxDuration` | Work budget and behavior |
|---|---:|---|
| Catalog, preview, job status | 30 s | Small database read; chain status read only when necessary. |
| Paid access | 120 s | Validate existing report/quote, verify, obtain buffered response, settle, persist result. No LLM or token issuance in this handler. |
| One workflow advancement | 120 s | Stop starting new work at 90 s; individual external calls have smaller abort deadlines. |
| Cron sweep | 120 s | Pick a bounded batch; prioritize expiring payments/resolutions; checkpoint before budget ends. |
| Progress SSE | 60 s | Emit persisted public-safe job events; reconnect from cursor. Polling is sufficient for core. |

An LLM call initially gets a 45-second client deadline and one bounded retry on retryable errors. A Graph request gets 15 seconds; use at most three concurrent requests per operation and a global configured concurrency cap. Reserve time to persist state. An aborted client call may still be processed by a provider: record usage conservatively and reconcile transaction operations instead of assuming cancellation.

No outcome depends on an open browser, a retained module variable, a `setInterval`, or an unawaited promise. Reusable immutable client/config caches are performance optimizations only. Do not put a current user, current network, mutable budget, nonce counter or job status in a singleton. Connection reuse must tolerate cold starts and concurrent invocations.

The function filesystem is not durable storage. Package read-only skill assets at build time; use `/tmp` only for disposable scratch. All deployment/verification binaries run locally or in CI. Outbound HTTP/RPC connections are permitted; bounded use and cleanup matter. If the native Hedera signer opens a gRPC client, close it in `finally`. The baseline needs no listening socket, WebSocket server, filesystem credential store, or keyring. [Vercel runtimes](https://vercel.com/docs/functions/runtimes).

### 6.2 Durable workflow runner without a separate worker

`POST /api/commissions` authenticates the caller, validates/quota-checks the directive, and commits a `report_run` operation. It returns `202 {jobId}`. An authenticated `POST /api/operations/{id}/advance` advances due work within its fixed budget; the UI can invoke it for responsiveness. An optional `after()` nudge is an optimization only, because it remains bounded by the invocation duration. [Next.js `after`](https://nextjs.org/docs/app/api-reference/functions/after).

Configure one production cron entry: `/api/cron`, `* * * * *`. **Pro is intentional:** Hobby cron is daily, with hourly scheduling precision. [Cron plan limits](https://vercel.com/docs/cron-jobs/usage-and-pricing).

The cron sweeps `next_attempt_at <= now()` and expired leases, not merely jobs created in the last minute. It can miss or duplicate invocations; Vercel does not retry failed cron calls. Use the next sweep to recover. Authenticate with `CRON_SECRET`; log a heartbeat and oldest-due-operation age. An authorized UI button can trigger the same dispatcher. [Cron delivery and overlap](https://vercel.com/docs/cron-jobs/manage-cron-jobs).

Each step:

1. Atomically acquire an operation lease with a monotonic fencing/version number using a short SQL transaction. Competing dispatchers skip leased rows.
2. Read its checkpoint and verify the lease before any side effect. Persist the immutable operation intent and idempotency reference before submission.
3. Perform one bounded step: one model turn, one page/batch of Graph reads, one calculation/finalization, one transaction submission, or one status check.
4. Write the result only if the lease/version still matches; record `next_attempt_at`, cursor, provider ID and error class.
5. Release the lease. A later invocation resumes pending work. Lease expiry alone never authorizes a fresh money-moving attempt.

Lease duration must exceed the maximum external-call deadline plus checkpoint margin; long steps heartbeat via compare-and-swap. Fencing protects database writes; external idempotency or persisted signed transactions protect chain writes. Do not hold a SQL transaction open during a network call.

Circle submissions use one persisted UUID `idempotencyKey` per logical action. If the process dies before saving Circle's transaction ID, retry the identical request with that same key, then poll its returned operation. The API exposes both payable `amount` and idempotency parameters; their actual behavior is a smoke gate. [Circle contract execution](https://developers.circle.com/api-reference/wallets/developer-controlled-wallets/create-developer-transaction-contract-execution).

For raw EVM writes, serialize submissions per signer, reserve the nonce durably, build/sign the transaction, encrypt and persist its bytes/hash, then broadcast. Recovery rebroadcasts the same transaction or reconciles its receipt. Never use an in-memory nonce manager as concurrency control. For Hedera native transfers, persist the native transaction ID and signed bytes before submission. A provider timeout leaves `UNKNOWN`, not `FAILED`.

### 6.3 Database contents and source of truth

Use `postgres` with Neon's pooled connection string and a small configured local connection allowance; start at one connection per warm instance, validate under concurrent invocations, and avoid session-scoped locks. Use transaction-level locks/atomic SQL. Migration scripts use the direct connection. [Neon connection pooling](https://neon.com/docs/connect/connection-pooling).

| Tables | Contents | Authority |
|---|---|---|
| `principals`, `wallet_bindings`, `sessions`, `auth_nonces` | Session identity and explicit network/wallet proofs | App authentication records; onchain balances are checked separately. |
| `analysts`, `analyst_policy_versions` | Display identity, Circle wallet, Hedera payee, forecasting/budget policy | Configured analyst registry; versioned before claims. |
| `protocol_capabilities` | Approved endpoint, deployment/schema fingerprints and probe evidence | Latest approved capability record; revalidated at use. |
| `report_runs`, `operations`, `operation_steps`, `job_events` | Directives, model/tool checkpoints, leases, retries and progress | Durable execution state. |
| `source_observations` | Exact response bytes/JSON, query/variables, deployment, block, retrieval time, completeness | Evidence of what the live provider returned; not a protocol index. |
| `reports`, `report_versions` | Final canonical envelope, rendered body, content hash and evidence links | Published immutable content. |
| `report_assets`, `listings` | ATS reference and issuance evidence; prices/inventory reservation | SQL is catalog/state machine; ATS balance is ownership truth. |
| `quotes`, `purchases`, `payment_attempts`, `read_deliveries` | Immutable terms, native tx IDs, result/recovery and bounded delivery scope | Settlement facts verified via facilitator/chain. |
| `budget_accounts`, `budget_reservations`, `ledger_entries` | Per-agent/per-rail balances, reserved/settled spend, author proceeds/refunds | Accounting obligations; reconcile to chain balances. |
| `market_specs`, `prediction_claims`, `resolution_evidence` | Frozen question/claim manifests and raw observation evidence | Contract commits hashes; SQL preserves readable content. |
| `chain_operations`, `contract_events`, `event_cursors`, `score_entries` | Our own app transactions/events and derived score entries | Arc contract is authoritative; SQL projection is rebuildable. |

Use foreign keys and uniqueness constraints, especially `(network, nativeTransactionId)`, `(network, contract, txHash, logIndex)`, `(marketRef, analystAddress)`, and `(operationId, stepKey)`. Money columns are integer decimal strings/`numeric(78,0)` with nonnegative constraints where appropriate. Arbitrary decimal metrics remain decimal strings; never convert them through JavaScript `number`.

Start with report JSON/text and bounded evidence in Postgres, avoiding a second object store. Limit a final report response to 512 KiB and each observation to 1 MiB; reject or paginate larger queries. Serve large evidence as authorized paginated records. Preserve exact canonical report bytes in text/bytea as well as searchable JSONB; JSONB alone is not a byte archive. Back up the database and test restoration. A restored report must still hash identically and retain its token/claim/payment associations.

### 6.4 Runtime evidence gate

`check-bundles.ts` inspects the actual generated function traces and uncompressed output, not `du node_modules`. Record per-route size, cold/warm latency, peak memory, open-connection behavior and response size. Start with an internal target of <200 MB per ordinary function to leave headroom. Fail deployment readiness on unsupported peers, omitted ABI/skill assets, secrets in client output, or a function exceeding the selected platform limit.

Runtime isolation matters even within one app: catalog requests must not initialize Circle, ATS and native Hedera signers. `graph/` cannot import payment code; the access checkpoint may import ownership/payment modules, but never generation or the full ATS deployment package. A redeploy during a pending purchase is a required recovery test.

## 7. Data contracts and end-to-end identity

### 7.1 The objects that cross modules

These are specifications for versioned runtime schemas, not final TypeScript source to freeze before the smokes.

| Object | Required fields/meaning | Produced → consumed |
|---|---|---|
| `Directive` | ID, authenticated requester, text, explicit scope/defaults, optional target market, quota reservation | HTTP → planner |
| `ReportPlan` | `ready / needs_clarification / unsupported`; report form; approved protocols; concrete GraphQL documents/variables; transforms; observation requirements; maximum pages/queries | Planner → validator/gather workflow |
| `SourceContext` | Source chain, endpoint reference, subgraph ID, expected deployment, schema fingerprint, chosen observation block/hash/time, finality policy | Graph capability/source layer → every query in the report |
| `QueryObservation` | Exact query/variables, raw response, returned `_meta`, fetch time, row count, page cursor, completion/error status, response hash | Graph → normalization/evidence |
| `NormalizedDataset` | Semantic family, stable field names, decimal strings, token units, source refs, scope/completeness flags | Adapter → engine |
| `ComputedReport` | Named facts/transforms, check results and severities, limitations, source refs; optional forecast inputs | Engine → formatter/narrator/forecast policy |
| `ReportEnvelope` | Schema/version, author identity and policy revision, directive/scope, plan, evidence manifest, computed facts, final narrative, optional forecast, content hash specification | Finalizer → catalog/ATS/purchaser |
| `QuestionSpec` | Frozen source, exact metric selection, window, threshold/operator, rounding, deadlines, invalid-data rules, resolver version | Market definition → report forecast/resolver/contract commitment |
| `ClaimSpec` | Network/market, question hash, report hash, author Arc wallet, predicted side, claim hash and onchain commit time | Analyst commitment → endorsements/scoring |
| `PurchaseQuote` | ID, report hash, product, payer/session binding, recipient proof for own, payment network/asset/payee/amount, expiration, inventory reservation | Access controller → x402 buyer/settlement |
| `OperationRef` | Logical operation ID, network, action/intent hash, provider, idempotency key, native tx ID/hash, state, next check | Chain adapter → workflow/status UI |
| `ResolutionEvidence` | Question hash, query response and source identity, normalized selected value, validity checks, comparison result, evidence hash | Resolver → Arc outcome/proof commitment |

### 7.2 Hash rules and publication

Use SHA-256 over UTF-8 JSON canonicalized with **RFC 8785 (JCS)** for report content, source manifests and resolution evidence. Preserve array order and Unicode strings as supplied; reject duplicate keys, invalid Unicode, nonfinite numbers and unsupported values. Before canonicalization, the application schema encodes financial decimals and large integers as strings: no exponent notation, leading plus, redundant leading/trailing zeros or negative zero. Zero is `"0"`. Required nullable fields stay explicit `null`; absent optional fields stay absent. Application timestamps use UTC ISO 8601 with exactly three fractional digits; chain timestamps/block numbers keep their separately named integer-string fields. Normalize EVM identity addresses to lowercase and retain network qualification. Preserve raw source bytes separately, without these transformations. Cross-language vectors must cover these rules as well as JCS ordering. [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785).

The report envelope hash covers **the final prose as well as facts, author, scope, evidence hashes, query/variables, actual deployment identity, engine/skill/model versions, and any forecast**. Exclude the hash field itself and later mutable lifecycle records. Hash raw source response bytes separately. Persist the report's exact canonical bytes and a renderer version. A changed report is a new version and new hash, never an in-place edit behind an existing token.

ATS deployment/issuance receipts are attached afterward in a separate `ReportAssetBinding`; they are not inputs to the report hash. The ATS creation event commits a short URI containing that hash. Arc claims refer to the same 32-byte report hash. This avoids a circular dependency in which the report needs its own token address to be hashed before the token can be deployed.

For market/claim IDs used by Solidity, define ABI-encoded hash formulas and golden vectors shared by TypeScript and Foundry. Do not assume JSON hashing and `abi.encode` produce the same result. §12 specifies which hash is used at each boundary.

### 7.3 Publication and access states

Report production: `QUEUED → PLANNING → GATHERING → COMPUTING → NARRATING → VALIDATING → FINALIZED`. It can stop in `NEEDS_CLARIFICATION`, `UNSUPPORTED`, `RETRY_WAIT`, or `FAILED`. A finalization transaction stores the immutable envelope/evidence links together.

Asset publication: `FINALIZED → ASSET_DEPLOY_PENDING → ROLES_PENDING → ISSUE_PENDING → PUBLISHED`. Each confirmed step records its receipt before the next starts. Only `PUBLISHED` reports enter the paid catalog. An author can inspect a private finalized report before publication. An ATS problem leaves a visible publication job, not a sellable listing pointing at a nonexistent token.

Own-sale state is independent: `AVAILABLE → RESERVED → PAYMENT_PENDING → PAYMENT_CONFIRMED → TRANSFER_PENDING → OWNERSHIP_CONFIRMED → COMPLETE`. Uncertain payments/transfers remain `UNKNOWN`; definitive failure can lead to reservation release or a compensating refund. Read-sale state ends in a scoped delivery, not token ownership.

## 8. Phase 0 — Provision and prove the plumbing

### 8.1 Initial preparation

1. Create the fresh application repository; record event eligibility and source provenance. Put the supplied plan/amendment/research under `docs/` without rewriting their historical claims.
2. Provision Vercel Pro and Neon; set a single region, Node version and isolated local/preview/production environments. Deploy a minimal authorized health route.
3. Obtain the Graph API key and choose **candidate** subgraph IDs from the research. Record query authentication separately from any Studio deploy key.
4. Create/fund Hedera testnet accounts and production payment accounts; verify supported key types, USDC token metadata, association, real account IDs, balances and mirror access. Keep buyer and treasury identities distinct.
5. Create the Circle developer account, register the entity secret, preserve its recovery material securely, and provision separate Arc testnet EOA wallets. Console eligibility/funding must be observed, not inferred from an SDK enum.
6. Establish the supported browser wallets: EIP-1193 wallet for ATS ownership proof and Arc user actions; the Hedera native signing connector for x402. These can be different wallets. The UI must explain which action uses which.
7. Prepare pinned local ATS deployment tooling and Foundry. Do not deploy the full ATS stack in a route handler. The issuance smoke may first use a currently verified compatible public testnet factory; production-demo publication uses our own recorded infrastructure.

### 8.2 Nine plumbing smoke tests

There are **nine** isolated plumbing smokes in v3. Assertions/evaluations in §8.3 are separate. Amendment 01 calls its list six tests but enumerates seven (`SM-0` through `SM-6`); v3 replaces the numbering to remove that ambiguity.

Each smoke is a small script or minimal harness. Strip the product frontend away. Stop after its done-signal; do not grow a smoke into the full subsystem. A funded write uses a test wallet and a tiny configured amount; the mainnet x402 repeat is an explicit release gate. Save command, dependency/config revision, sanitized output, receipt links, latency and an interpretation under `docs/evidence/SM-xx/`.

#### SM-01 — Does the deployed runtime carry our dependencies and database?

**Prerequisites:** minimal Next app, Vercel/Neon environments, candidate dependency pins.

**Minimum:** private probe routes import the actual narrow Graph/Claude/x402/ATS/Circle connectors, without doing chain writes. One route writes a random row and another invocation reads it. Build and inspect traces; fetch the compiled skill and ABI assets from server code. Run two concurrent database updates to one reserved counter.

**Done:** supported install without peer overrides; deployed imports succeed; persisted row survives a new invocation; atomic counter is correct; traced functions fit the selected limit; no server secrets reach the client bundle. Record cold/warm latency rather than calling it negligible.

**Failure decision:** remove accidental heavy imports, extract smaller ABIs, fix route boundaries or connection settings. Do not conclude from a package installation size that deployment passed.

#### SM-02 — Can one authenticated Graph query return usable live data?

**Prerequisites:** Graph query key; candidate Aave v3 Ethereum ID from the notes.

**Minimum:** one POST using `fetch`/curl for `_meta` plus protocol deposits/borrows and a small market sample. Repeat through `querySubgraph()` from Vercel. Compare the claimed chain/deployment to the approved manifest and source-chain head. Preserve HTTP status and GraphQL `errors` separately.

**Done:** populated, parseable decimal fields, actual deployment, block metadata, no unresolved indexing error, and freshness within the initial reporting policy. A key error, empty protocol list or stale head is a failed capability, not zero financial activity.

**Failure decision:** correct authentication/allowlisting/billing, or probe another candidate. Update the supported-protocol list from observations.

#### SM-03 — Do the historical rows support our exact question semantics?

**Prerequisites:** SM-02; a deployment whose historical schema is known.

**Minimum:** query one exact closed UTC-day interval from approximately twelve months ago using **both lower and upper timestamp bounds**. Repeat for a recent closed day and a deliberately missing/quiet day. Inspect row IDs, timestamps, block numbers and update behavior. Repeat the same closed-day query later. Separately issue one historical block query to observe retention/error handling.

**Done:** the old and recent expected day rows are retrieved with the same defined metric and coherent bounds; repeat reads of a closed row are stable in the tested deployment; an absent day becomes `MISSING_OBSERVATION`, not zero or a replacement day. Record which guarantees were observed and which remain provider assumptions.

**Failure decision:** try a different measured deployment/metric before any market is funded. If no closed-day source meets the specification, Phase 4's source gate is blocked. An event-count product would require its own new question specification and evidence; it is not a substitute for a borrow-balance question.

#### SM-04 — Does one document work across independent protocols?

**Prerequisites:** SM-02; candidate Aave v3, Compound v2 and Spark; Compound v3 as another candidate after its semantic adapter is understood.

**Minimum:** execute a compact stable-core document byte-for-byte against two or three independent protocol deployments. Compare returned field shapes, schema/version metadata and actual populated values. Inspect one older-schema optional-field failure (`reserveFactor`) and the `LENDER`/`COLLATERAL` enum difference.

**Done:** the shared document succeeds on at least two independent protocols with honest comparable labels; target three. Optional-field incompatibility is detected before a report run and does not silently remove required data. Aave v2/v3 may add coverage but do not substitute for showing meaningful protocol diversity.

**Failure decision:** reduce the core document, correct the capability adapter, or exclude an unhealthy deployment. Curation signal helps choose probe order; it is not a health certificate.

#### SM-05 — Can Claude call our live query tool?

**Prerequisites:** SM-02, Claude API key and a currently available configured model.

**Minimum:** expose one read-only tool with a fixed approved protocol and bounded query. Ask the model to invoke it and echo a small raw result; do no financial reasoning or writing yet. Capture tool-use ID, arguments, tool result and final turn. Invoke with a tool error once.

**Done:** tool invocation reaches `querySubgraph()`, returns live data, and resumes the Messages loop correctly; errors are explicit tool results; turn/query limits terminate the loop. Test the model/SDK combination actually deployed.

**Failure decision:** fix protocol message sequencing, tool schema or API/model configuration. Do not introduce another agent framework to compensate for unproven basic wiring.

#### SM-06 — Can one real Hedera x402 purchase return `hello`?

**Prerequisites:** two testnet Hedera accounts, associated/funded test USDC, Blocky402 test host.

**Minimum:** a tiny Node route returns a fixed `hello` body through the actual x402 adapter. A headless buyer obtains `PAYMENT-REQUIRED`, signs once, retries once, and verifies `PAYMENT-RESPONSE`. Store native transaction ID and payment terms before settle. Independently query settlement evidence. Exercise an unpaid hit. Repeat the successful path on the deployed Vercel route.

**Done:** consensus success and exact token/payee/amount match; buyer receives `hello`; unpaid request gets 402. A capability advertisement or stubbed facilitator is not this done-signal.

**Failure decision:** fix network/fee-payer/token/account configuration or the actual signer path. For Hedera prize evidence, retain Blocky402; another facilitator is a diagnostic option, not an equivalent qualifying branch.

#### SM-07 — Can ATS issue and transfer our actual report-shaped asset?

**Prerequisites:** funded testnet ECDSA issuer and verified compatible factory/resolver/configuration; a second EVM address.

**Minimum:** create one decimals-zero asset with intended maximum supply one and a dummy content hash URI; grant required issuance role; issue one unit; read balance/supply/metadata; transfer to the second address. Recover token address from the exact factory event. Inspect role/configuration results and HashScan records. Confirm arbitrary-recipient transfer under the selected compliance settings.

**Done:** asset address, creation event, expected config, issuance and transfer receipts, supply one, original balance zero and recipient balance one. HashScan visibility alone does not prove issuance/transfer. Save the ABI/deployment revisions and actual operation latencies.

**Failure decision:** correct tuple/config/role/ISIN/ABI usage, or deploy our own compatible ATS infrastructure. A generic ERC-20 or a report-series token is not a silent substitute for per-report ownership.

#### SM-08 — Can Circle send native USDC to a payable Arc contract?

**Prerequisites:** Circle account and funded DCW EOA on Arc testnet; tiny deployed probe contract with payable `record()` and withdrawal to the sender.

**Minimum:** submit `amount: "0.01"` with a persisted idempotency key. Record the Circle ID, terminate the client, resume polling in a new invocation, and inspect the Arc receipt/event containing `msg.value` and `msg.sender`. Retry the identical Circle submission with the same key. Withdraw once.

**Done:** expected caller address and **10^16 native atomic units** arrive for 0.01 USDC; only one logical transfer occurs; a new invocation reaches confirmation; withdrawal works. Also compare native18 and ERC20-six-decimal balances without double-counting them.

**Failure decision:** fix amount encoding/account type/API request mapping. Keep all contract accounting native18. If Circle cannot perform the action, record the blocked integration; an EOA raw-key diagnostic does not prove Circle usage.

#### SM-09 — Can the supported browser wallets prove identity and sign the required actions?

**Prerequisites:** SM-06/07/08; a minimal private wallet harness, not the product UI.

**Minimum:** EIP-1193 wallet signs a domain/nonce-bound ownership challenge for Hedera testnet and reads its ATS balance. Hedera connector signs an x402 test payment. EIP-1193 wallet switches to Arc and signs a tiny payable probe. Test cancellation and the wrong network. The payer account and ATS recipient can differ; bind them explicitly to one purchase intent.

**Done:** native Hedera payment signing, EVM ownership proof and Arc user signing each work in a production build. A supplied address without a signature is rejected. Cancellation creates no grant or spend. No server SDK object is passed through an incompatible browser SDK copy.

**Failure decision:** narrow the supported wallet list and implement the verified connector path. Keep the headless agent purchase path, but do not declare stranger-facing purchase/access complete until the browser path passes.

### 8.3 Assertions and evaluations, implemented with their features

These are not additional plumbing smokes. They test substantive behavior; write them with the relevant unit.

| Group | Required checks |
|---|---|
| Graph | HTTP 200 with GraphQL errors; pruned versus lagging versus unknown errors; empty data; zero-price anomaly; enum/type drift; pagination beyond one page; mixed deployment/block refusal. |
| Planner | Inspect queries without prose; vague “Aave” asks for the missing material scope; “Morpho” is not silently mapped to an Optimizer; unsupported fields never reach the gateway; query/turn budgets enforced. |
| Report | Same computed facts narrated four times retain section structure and numeric rendering; sparse protocol, cross-protocol comparison and vague instruction cases; invalid references/unsupported assertions trigger deterministic fallback. |
| Reconciliation | Known decimal arithmetic; legitimate repeated borrow/repay cycles do not fail a cumulative-deposits check; stale positions cannot become deficit findings; incomplete totals cannot pass a full tie-out. |
| Jobs | Kill after lease, after tool result, after chain submission and after settlement; next invocation resumes once; duplicate cron and browser advances cannot duplicate money movement. |
| Access | Preview free; unpaid read 402; holder reads twice without payment; read receipt does not become ownership; former holder loses standing access; ownership RPC outage cannot silently charge a holder. |
| Purchases | Concurrent own buyers; wrong report/product/recipient/amount/network; lost response; unknown settlement; duplicate native tx ID; transfer failure; refund/proceeds double-spend prevention. |
| Market | Pure resolver with fabricated known values, then live closed-day value independently queried; threshold equality; missing day; deadline; unauthorized resolution; changed spec/report binding rejection. |
| Contract | Stakes/claims/payout/refund state machine; reentrancy; rounding; zero winning pool; duplicate claims; close boundary; timeout voiding; conservation fuzzing. |
| Scores | Fabricated YES/NO/VOID sequence; repeated event delivery; same report endorsed many times; author versus buyer identity; same author cannot commit both sides in one market. |

**Phase 0 exit:** the relevant smoke results are documented, production imports/deployment are viable, live data candidates are known, and the unresolved items have explicit blocking owners/gates. No statement “all integrations work” without receipts. It is legitimate to continue independent Graph work while an ATS provisioning gate remains open; it is not legitimate to build dependent ownership assumptions as though it passed.

## 9. Phase 1 — Data pool and agent connected

### 9.1 The data pool is hosted

Use published Messari subgraphs through their Graph Network query URLs with a query API key obtained through Studio. Studio is also a staging/deployment tool; we are not required to create a new subgraph merely to query an existing one. Use the URL shown by the provider and verify the authentication form in SM-02. The gateway supports query-key usage; do not confuse it with a Studio deploy key. [Graph deployment/querying quick start](https://thegraph.com/docs/en/subgraphs/quick-start/).

`graph/protocols.ts` contains approved configuration, not chain data. A row includes:

```ts
// Shape only; populate from live probes, never from guessed endpoint IDs.
type ProtocolCapability = {
  slug: string;
  displayName: string;                 // e.g. explicit product/version, not just “Morpho”
  sourceChainId: 1;
  subgraphId: string;
  expectedDeployment: string;
  schemaFingerprint: string;
  reportedSchemaVersion: string;
  semanticFamily: "aave" | "compound-v2" | "compound-v3";
  supportedMetrics: string[];
  snapshotCapabilities: string[];
  observedAt: string;
};
```

Start with the smallest healthy independent protocol set. Aave v3, Compound v2, Spark and Compound v3 are candidates, not guaranteed live defaults. Admit each only after shape, freshness and semantic checks. Do not include the mislabeled Compound v3 Base row from the original Messari deployment config. Morpho Blue coverage remains unsupported until a live standardized endpoint and its adapter are demonstrated; a request for Morpho must resolve that ambiguity explicitly.

### 9.2 `querySubgraph()` contract

The client takes a **registered target**, validated query/variables, source context and abort signal. It performs a server-side HTTPS POST with `cache: "no-store"`. It returns a `QueryObservation` or typed failure. It never accepts a model-supplied arbitrary URL, interpolates credentials into prompts, or repairs a failed query by quietly deleting fields.

Always inspect both HTTP status and GraphQL `errors`. Preserve raw evidence privately and expose a sanitized error code: `AUTH`, `RATE_LIMITED`, `UNAVAILABLE`, `INVALID_QUERY`, `PRUNED`, `LAGGING`, `INDEXING_ERROR`, `DEPLOYMENT_CHANGED`, `INVALID_DATA`, or `UNKNOWN`. Exact known error phrases help classification; unfamiliar messages stay `UNKNOWN`. Only retry transport/429/temporary lag under a bounded policy.

`_meta` must describe the same data observation as the query roots. For a current multi-query report, select a source block within the retained overlap of the participating Ethereum deployments and an Ethereum finalized head; pin every root and metadata query to that observation where supported. Verify block hash/number identity. If the overlap is unavailable, either select a supported common closed snapshot period or decline the requested comparable report. Do not splice different blocks into one unlabeled total. For explicitly asynchronous comparisons, label each observation time and disable same-block tie-out claims.

Deployment identity is checked on **every page**, not just at startup. Use deployment-specific routing if the actual provider supports it and SM-02 proves it. Otherwise use the stable subgraph route with expected-deployment checks. A republish mismatch stops the operation; it does not migrate a report or funded market to a new deployment silently.

### 9.3 Query composition, pagination and comparability

The model can select approved entities, fields, filters and transforms, and propose concrete GraphQL. Validate its AST against the endpoint's curated schema/capabilities: query-only operations; allowlisted fields; bounded nesting/aliases; bounded `first`; no internal fields; no arbitrary fragments that evade complexity limits. The report plan retains the actual documents and variables.

A small portable core covers deposits, borrow balance and selected cumulative metrics. Richer features have explicit version/family adapters. Schema version alone does not encode market semantics: Compound v3 collateral/base markets require interpretation even when public GraphQL fields resemble Aave.

Rankings can intentionally request top N and label that scope. Full reconciliation must paginate the **complete relevant market universe**, including inactive markets if the protocol aggregate includes them. Do not compare an active top-25 sample to all-market protocol totals. Use the supported cursor type and stable order, with block pinning and duplicate detection; avoid unbounded `skip`. Stop only on verified end-of-page sequence. A page/query cap reached before completion returns `INCOMPLETE`, not a successful total. [Graph query and pagination API](https://thegraph.com/docs/en/subgraphs/querying/graphql-api/).

Initial report budgets: maximum three protocols, 24 Graph calls including pagination, 250 rows per page, eight model turns, and three concurrent Graph calls. These are design defaults, not measured platform limits. If a complete report needs more, split into checkpointed batches or request narrower scope; increase caps only with evidence and a budget decision.

### 9.4 Agent loop

`agent/loop.ts` performs one Messages API turn, validates tool-use blocks, executes only registered read tools, and returns a checkpointable message/result structure. Preserve tool-use IDs and corresponding results. Handle normal end, tool use, output exhaustion, refusal, invalid tool arguments, API rate limiting and timeout explicitly.

Load the canonical query skill and only the selected report-form references into the system context using a build-generated module. Development plugin installation does not install skills into an API agent. Retain useful field descriptions and version-specific enums; measure actual prompt size and query cost. The model gets sanitized data, never credentials or a shell.

MCP discovery is deferred. Adding it later requires an approved discovery-to-capability admission process; remote MCP query execution must not bypass our budget, source identity or evidence layer. It is not needed to satisfy the standardized-schema route.

**Phase 1 exit:** from the deployed app, a directive drives Claude tool use against multiple independent approved protocols through the same `querySubgraph()` client; outputs and failures are correctly typed, and the shared query pattern is demonstrated. This exit proves wiring, not report quality.

## 10. Phase 2 — Evidence-backed report building

### 10.1 Supported report forms

Implement four mechanically specified forms: lending balance overview, debt ranking, cross-protocol comparison, and forecast attachment to a supported market. A “balance sheet” request is rendered as a **lending balance overview** with gross supplied, outstanding borrowed, arithmetic net and documented limitations. The schema does not expose every asset/liability necessary for an audited accounting balance sheet.

The planner returns `needs_clarification` when material scope is missing: protocol product/version, chain, comparison metric, period, or meaning of a forecast. The application schema enforces these fields; prompt instructions alone are insufficient. Harmless defaults such as Ethereum and top ten may be offered visibly, but never hide a change from Morpho Blue to a legacy Optimizer.

Each form has a validated plan schema, supported deterministic transforms and a formatter. A new Markdown skill can add guidance or a variation within a supported form. A new transform or section contract requires code and meaningful tests. “Adding a report type is only writing Markdown” is not a safe general assumption.

### 10.2 Deterministic reconciliation

Normalize before calculating. Use decimal arithmetic with explicit precision/rounding; token balances remain exact native units. Preserve inputs and intermediate facts under stable fact IDs. Every result is `PASS`, `WARN`, `FAIL`, `NOT_APPLICABLE` or `NOT_CHECKED`, with a reason and evidence references.

The initial report arithmetic context is 128 significant digits with round-half-even, held in a versioned engine policy rather than mutated global state. Reject nonfinite values and inputs outside the policy's magnitude/precision bounds. Retain source precision and intermediate values until the final presentation step; display USD and percentages to two decimal places with any scaling label explicit. Display rounding never feeds reconciliation or settlement. Market threshold comparison uses the separately committed six-decimal floor rule in §12; native token movements use exact integer units throughout.

| Layer | Core behavior | Interpretation |
|---|---|---|
| Input validity | Required rows/fields, decimal parse, positive price with nonzero balance, relevant price freshness, source identity, pagination completeness | A critical invalid input blocks an authoritative figure and market eligibility. |
| Arithmetic/identity | Amount × price where semantically applicable; revenue-side sum; complete market sum versus protocol total at same context | Internal consistency, including identities implemented by the mapping. Not independent proof. |
| Economic indicators | Scoped utilization and borrow/supply comparison for the validated family; net supplied; changes over comparable observations | Descriptive signals with family assumptions. A negative result is not automatically bad debt. |
| External corroboration | Optional family-specific Ethereum RPC reads at the same block | Separate evidence category; only label a metric externally corroborated when its adapter and comparison pass. |

Do **not** copy the eleven Messari monitor checks verbatim. A legitimate user can borrow, repay and borrow again, making cumulative borrowing exceed cumulative deposits. Fixed global USD ceilings age badly and must be anomaly heuristics, not universal invariants. A null reserve is not zero; a zero-price failure is not an empty market; position sums on rebasing assets are not a protocol balance tie-out.

For Aave-family comparisons, explain that Messari gross supplied and TVL are assigned from the same basis; revenue totals may combine accrued interest and other mapped fee paths. Treat protocol versus summed-market agreement as an internal canary. Label accrued revenue and its coverage precisely. Do not infer a bad-debt counter from Aave `unbacked`, whose protocol meaning requires its own interpretation.

For period revenue, use properly selected cumulative endpoints with inclusive/exclusive boundaries and a documented baseline. Show the actual snapshot timestamps and gaps. Detect deployment/methodology reset or noncomparable endpoints before subtracting. A snapshot outside a requested period may be an explicitly stated baseline for a cumulative delta; it is not a substitute for a missing market-settlement day.

**External checks are an optional capability, not a prerequisite for every report.** Keep their I/O outside `engine/`. Aave receipt supply, Compound v2 exchange-rate-adjusted supply and Compound v3 Comet accounting have different adapters. Even same-block mismatches can reflect mapping update cadence or methodology; investigate before elevating them into economic accusations. If an external RPC is absent, show `NOT_CHECKED`, not a weaker check relabeled as equivalent.

### 10.3 Narration and formatting

The narrator receives `ComputedReport`, its limitations and approved fact IDs. It cannot fetch data or authorize spending. Request structured sections and fact references. The formatter injects the computed numbers, headings, tables, units, ordering and length constraints.

Do not rely on a TypeScript parameter type to prevent hallucination. Validate section schema, all fact references, prohibited unsupported metrics, numerals and unit consistency, and whether claims have the required evidence category. A narrative validator cannot prove arbitrary prose is true: keep the allowed claim vocabulary narrow, evaluate representative outputs, and use a deterministic template fallback when validation fails. Opinion/forecast language is visibly separate from observed facts.

Required sections: scope/as-of, key figures, named data checks, interpretation, limitations, evidence references, and forecast terms if present. HTML/Markdown output is sanitized; names/descriptions returned by subgraphs are untrusted text. Remote report content purchased by another analyst is also untrusted data, never instructions to call tools or move money.

Run the requested isolated evaluations: planner-only inspection; four narrations over identical computed facts; sparse protocol; multi-protocol comparison; vague directive. Golden assertions cover structure/facts/errors, while qualitative human review covers interpretation. Do not require identical prose across runs.

### 10.4 Report workflow and evidence retention

`workflows/report-run.ts` checkpoints validated plan, source context, observations/cursors, computed result, final narration and validation. Restarting a model turn may consume extra provider tokens but cannot publish multiple versions or mint twice: finalization has a unique logical run/version key. A lost tool response is replayed from the stored observation rather than fetched at a new block without notice.

Graph freshness policy begins with a maximum 30-minute source-head age for current reports, tightened or relaxed only from measured deployment behavior and the report's promised scope. Distinguish finalized-chain delay from extra indexing lag. A report explicitly about a historical closed period is not invalid merely because its chosen period is old; the source must still be healthy enough to establish the row's completed indexing.

The finalization transaction stores the canonical envelope, evidence manifest and content hash atomically. Preserve raw observations for the life of a published report or an outstanding market/purchase obligation. No published report can depend on a temporary local file or a live endpoint remaining unchanged forever.

**Phase 2 exit:** several different directives produce correctly scoped, well-formed live-data reports across approved protocols. Independent replay from saved evidence reproduces facts/checks and the original report bytes/hash. Unsupported/ambiguous requests stop clearly. No narrative-driven transaction can occur yet.

## 11. Phase 3 — ATS tokenization and x402, both purchase models

### 11.1 Asset versus access

The asset is a per-report ATS ERC-20-style security proxy using the selected ATS configuration, with decimals zero and one issued unit. It represents Kessan's transferable access entitlement and provenance association. It is not report content, a promise of dividends, or an automatically conferred copyright transfer. The application documentation states the access right and administrative controls precisely.

Use one asset per report to keep `balanceOf(holder) >= 1` unambiguous. The synthetic checksum-valid identifier required by ATS is labeled an application/test identifier, not a registered financial ISIN. Proposed settings: maximum supply one; single partition; configured compliance/identity requirements disabled for the initial open-transfer demo; voting/dividend rights disabled; forced-controller transfer disabled where the chosen configuration supports it. Record the actual settings from SM-07.

ATS roles and resolver upgrade authority must be explicit. Create the asset, grant only needed roles, issue once, and revoke issuance authority after minting if the proven configuration supports this safely. Do not advertise permanently immutable supply or behavior while an admin can change the cap/resolver/roles. Preserve the resolver configuration version and relevant authority addresses in the asset binding.

The creation event's `additionalSecurityData.info` contains a short report-hash URI. It is **event-only**, not a readable immutable metadata field on the asset. Store the exact receipt/log location and expose it in provenance. Optional mutable custom data may carry a convenient pointer but cannot replace the original hash commitment.

### 11.2 ATS provisioning and issuance execution

Deploy our own compatible ATS testnet factory/resolver/facets with pinned upstream local tooling. Record each deployed address and transaction in a resumable deployment manifest; verify bytecode/configuration and HashScan verification explicitly. Deploying audited source does not automatically submit verification. The supplied research's roughly 29-minute full deployment record describes local provisioning, not a Vercel-compatible function.

Application issuance runs as separate persisted steps: deploy asset, confirm/recover address, grant issuer role, confirm role, issue, confirm balance/supply, finalize asset binding and listing. Each transaction follows the shared durable intent/sign/broadcast/reconcile protocol. If a role grant or issuance fails, resume that step on the existing asset. Never deploy a second asset because the first call timed out.

ATS transfer uses the **testnet recipient EVM address**, not the payer's Hedera mainnet `0.0.x`. Cross-network numeric account IDs do not establish identity. Require recipient control proof before reserving the own purchase. The same person may use different wallets; preserve both bindings in the quote.

### 11.3 The one access checkpoint

All full-report delivery goes through `access/authorize.ts`, including API access and server rendering. The public page initially loads a safe preview. Do not embed premium content in static generation, React server payloads, prefetch responses, HTML source, error bodies or progress events.

The canonical product endpoint is `POST /api/reports/{id}/access` with `product: "read" | "own"` and optional quote/payment headers. A separate public preview URL delegates to the same policy's preview branch. The x402 adapter emits protocol headers; the app's payment ledger determines recovery and entitlement.

| Request state | Result |
|---|---|
| Public preview | 200 with explicitly limited preview/price/provenance. |
| Read, authenticated wallet currently holds the report asset | Full report; do not create, verify or settle a payment. |
| Read, valid scoped delivery recovery credential for this exact report/purchase | Return the same logical delivery within the recovery window; no new charge. |
| Read, no entitlement/payment | 402 with `PAYMENT-REQUIRED`; preview may accompany it, never full content. |
| Read, validated and confirmed new x402 payment | Full report plus scoped delivery receipt and settlement header. |
| Own, current authenticated owner | Show already owned; no payment. |
| Own, inventory available and recipient proven | Reserve, issue a fixed quote, run x402; after confirmed payment, queue ATS transfer. |
| Own, another buyer has the asset reserved/sold | 409 with current inventory state; no challenge that could charge for unavailable stock. |
| Ownership lookup unavailable | 503/retry. Do not treat an unverified holder as a nonholder and charge them. |
| Supplied wallet address without valid proof | No holder grant; require proof or the normal read-purchase path. |

Wallet authentication uses a server nonce, application domain/URI, chain reference, issued-at/expiry and purpose. Verify the signature using the supported wallet scheme, consume the nonce once, and create an HttpOnly/Secure/SameSite session. Authenticate agent callers with the corresponding machine wallet proof/session; implement actual Hedera verification where needed rather than assuming the SIWx package includes it. Session IDs and job IDs are not public read entitlements. Protect state-changing cookie routes against CSRF and origin mismatch.

Current ownership is read from ATS on each read authorization. Do not cache a permanent `owns=true` session flag. Transfer revokes the former holder's future access and enables the new holder after proof. A previously downloaded report cannot be recalled; this is an access gate, not DRM. Pause/freeze semantics are documented separately from ownership: a transfer pause does not inherently erase the holder's reading right.

### 11.4 Pay-per-read: exact terms and recoverable delivery

Initial prices are fixed in configuration per report/product and displayed before signing. They are **not** post-execution metering. Hedera's selected x402 scheme is `exact`; no settlement override or unimplemented `upto` flow is used.

The quote freezes report hash, product, payer identity, payee, network, token, atomic amount, expiry and operation ID. Authenticate the purchase request and bind it to that immutable quote. The Hedera transfer signs payment terms, not our entire application entitlement: validate application terms separately and never trust a client-supplied `extra.tier` or report ID as proof of what was purchased.

The HTTP exchange has an application identity in addition to the x402 payment payload. The caller supplies a stable UUID `Idempotency-Key`, scoped to its authenticated principal, report hash and product. The first unpaid request creates or reuses a persisted quote and returns its `quoteId`/`purchaseId` in application response metadata and a `KESSAN-QUOTE-ID` header, alongside the standard x402 challenge. The paid retry preserves the original request body and idempotency key and adds that quote header plus `PAYMENT-SIGNATURE`. Missing or mismatched quote identity fails validation before settlement; it does not silently create another purchase. Match recipient and all frozen terms server-side. An already submitted operation returns its recovery/status result, including 202 while uncertain, rather than another payable challenge. An expired quote cannot be repriced while an associated payment remains unresolved. Verify this round trip with the selected buyer adapter; automatic x402 retry support alone does not prove it preserves application headers.

The default `authorization` wrapper handles **existing small content**: validate/read the finalized body, verify payment, prepare the buffered response, settle, record confirmed settlement, then return. No model call or ATS mutation occurs before settlement. The unconditional response buffering measured in `@x402/next@2.25.0` is acceptable for the bounded finished report. Progress SSE is separate and protected by the commission session.

Persist the payment attempt and decoded native transaction ID before `/settle`, and use a unique transaction constraint to bind it to exactly one quote. The idempotency key must survive the initial unpaid challenge and paid retry. Scope any SDK payment-identifier extension to our persistent storage; its presence alone is not an idempotency guarantee.

The post-settlement hook writes a confirmed ledger fact and delivery reference; it does not make another chain call. Test the actual hook ordering in the pinned adapter. If settlement succeeds but that write or the HTTP response fails, the next request reconciles the saved payment attempt against the native transaction ID before responding. The buyer must not sign a new payment merely because it missed the response.

**One read means one logical delivery.** Its recovery credential is bound to the authenticated payer, purchase, report hash and product, and expires after an initial ten-minute recovery window. It can replay the same response during that window; it does not grant future reads or ownership. A second fresh unpaid read without that receipt returns 402. Strictly proving that a client received bytes exactly once is impossible across a lost response; the product wording must describe this bounded recovery honestly.

Use `Cache-Control: private, no-store` for protected content and authorization responses; do not allow CDN/shared caching. If cross-origin machine/browser consumers are supported, define CORS origins and expose the required x402 headers explicitly; otherwise keep browser purchases same-origin. Never share cached responses solely by report ID.

### 11.5 Own-the-token: a cross-network sale with compensation

Core inventory is an unsold report unit held by the platform's ATS testnet treasury. The SQL listing is a primary offering. This limits inventory control to assets whose selling authority we actually have; a future resale marketplace needs seller-signed listings, nonce/expiry/cancellation and transfer authorization.

1. Authenticate buyer, verify ATS recipient control, confirm report publication and current treasury balance, and atomically reserve the one available listing.
2. Freeze an own quote and collect its x402 payment into the Hedera mainnet collection treasury. The x402 response contains `purchaseId` and a status URL; it does not claim token delivery before it happens.
3. On confirmed payment, advance the durable transfer operation to the bound Hedera testnet recipient. Return pending status while it confirms.
4. Confirm the transfer receipt and recipient balance, then mark complete. Future reads follow the ordinary holder branch. The purchase ledger by itself never becomes a permanent holder override.
5. On a **definitive** failed/cancelled transfer, return the full purchase price through a separate Hedera mainnet transfer from the collection treasury. Record the refund obligation and its transaction as durable steps. Network fees are operational costs, not deducted silently from the refund.

This is not atomic delivery-versus-payment across Hedera mainnet and testnet. It depends on our treasury and recovery process. Keep funds required for unresolved own purchases/refunds reserved; do not pay them out to authors. A transfer with an unknown outcome cannot trigger either a refund or a fresh transfer until reconciled. If cancellation/replacement is needed, its provider-specific semantics must be proven, and the original must be demonstrably unable to succeed before refunding.

An unpaid reservation can expire after its quote and any associated payment validity/reconciliation window are resolved. **Never release inventory just because a timer fired while payment or transfer is unknown.** Expose `payment unknown`, `transfer pending`, `refund pending` and evidence in the buyer/operations UI. An exhausted automated retry budget escalates for review without inventing a financial result.

The purchase screen states that payment uses real Hedera mainnet USDC and the access/provenance asset is on Hedera testnet. Reset/loss of that testnet is a real entitlement risk. The application must not sell this as permanent mainnet ownership; stop own sales if that network is unhealthy and retain records needed for an explicit migration/remedy.

### 11.6 Ambiguous payment handling

The reviewed Hedera scheme can return an empty settlement transaction field even after an uncertain submission. Decode `payload.transaction` using the package's own transaction class and record its native ID, valid-start/duration, token/payee/amount and payload fingerprint **before** settlement. Do not treat the HTTP quote timeout as the actual native transaction validity; the reviewed signer used an SDK default around 120 seconds.

Recovery queries native transaction evidence through the appropriate mirror/consensus path. Require successful consensus and matching net token transfer, payer/payee, amount and network. A mirror 404 or timeout shortly after submission is `UNKNOWN`. Retry with backoff across invocations; do not settle the same intent again using a new transaction. Only a definitive failed receipt or sufficiently established expiration/nonexecution permits failure/release. When evidence remains unavailable, retain the pending obligation for reconciliation.

The success header's optional `amount` is not always present. Accounting uses the frozen exact amount after settlement verification, cross-checked with chain evidence, rather than a hardcoded display price or blindly trusting an optional field. Duplicate consensus transactions and duplicate HTTP requests are different problems; both need handling.

### 11.7 Agent budgets and author proceeds

Before any analyst pays or stakes, `treasury/budgets.ts` atomically reserves spending against per-action, per-run and per-day caps. Key budgets by analyst, **network and asset scale**. Concurrent invocations see settled plus reserved spend. An unknown transaction keeps its reservation. Release only on definitive failure; commit on confirmed expenditure. Include a conservative network-fee allowance for actions where the agent pays gas. Also bound LLM tokens, query volume, commission frequency, issuance count and total concurrent operations.

The headless buyer fetches the catalog, chooses a report whose coverage is useful to its task, checks report/source freshness and advertised price, and runs the same x402 path as a browser. It stores a purchase attempt before signing. It can use the acquired report as cited analysis, but any new claimed live blockchain fact is sourced through our query client; purchased prose is not an oracle.

Report-sale income is attributed to the immutable report author in a ledger. The collection treasury receives the exact payment; read proceeds become payable after successful delivery accounting, own proceeds after confirmed transfer and fulfilled refund obligations. Author payout is a separate durable native-USDC transfer, with its own idempotency/accounting checks. The core has no automatic royalty splits or implied x402 multi-recipient support. Display gross sales, pending/refunded sales and paid-out proceeds separately.

**Phase 3 exit:** a live-data report is finalized, issued by ATS and listed; another party pays through Blocky402 and reads it; a distinct own purchase transfers the correct asset to the proven recipient. A holder reads repeatedly without being charged; a read buyer gains no standing access. Payment-loss and transfer-failure recovery tests pass. Repeat the real paid read on Hedera mainnet for submission evidence.

## 12. Phase 4 — Arc prediction market, Graph resolution and scores — CORE

### 12.1 Market question: specify the observation, not just a sentence

The first supported market is deliberately narrow:

> “Will the selected protocol's last recorded `FinancialsDailySnapshot.totalBorrowBalanceUSD` for UTC day D exceed threshold X?”

This asks about a particular subgraph field as recorded for that day. It does not claim to measure an exact wall-clock closing balance. Snapshots are activity-driven; the row's timestamp/block identify the actual last update. That distinction is shown in the question details before anyone stakes.

Core questions use a protocol-level field whose semantics and historical behavior passed SM-03. There is no automatic “snapshot failed, use event volume” branch: a balance and a flow are different financial propositions. Additional daily market-level or event-range question kinds require their own selector, validity rules and tests before admission.

`QuestionSpec` contains:

- Schema version; approved source chain, subgraph ID and **deployment identity**; schema/methodology fingerprint.
- Entity and metric path; protocol/market entity selector; exact query template/version; timestamp filtering and row selection rule.
- UTC observation interval `[dayStart, dayStart + 86400)`; `closeTime <= dayStart`; resolution only after day end and sufficient finalized indexing.
- Decimal threshold string, comparison operator (initially strict `>`), normalization scale/rounding, and equality behavior (equal means NO).
- Invalid-data conditions: missing/duplicate contradictory row, failed query, deployment mismatch, indexing error, incomplete indexing, invalid decimal, or unsupported semantics.
- A grace deadline (initially day end plus 24 hours), retry policy and deterministic timeout-void/refund rule.
- Resolver/check implementation versions, public evidence location and exact commitment formulas.

For numerical comparison, normalize the selected decimal to **six decimal USD places using a stated floor rule**, with threshold limited to that same scale; use decimal/bigint comparison. The user sees the quantization policy. Preserve the original raw decimal for audit. A different precision is a new question specification, not a late settlement adjustment.

### 12.2 Contract interface and commitments

Implement one small nonupgradeable `KessanMarket.sol` with tested access control and reentrancy protection. Import pinned OpenZeppelin primitives where they replace error-prone arithmetic/security boilerplate. Do not copy the untested four-function sketch from v2 unchanged.

Conceptual interface, finalized alongside Foundry tests:

```solidity
createMarket(QuestionCore core) returns (uint256 marketId)
commitPrediction(uint256 marketId, bytes32 reportHash, bool side) payable
stake(uint256 marketId, bytes32 claimId) payable
resolve(uint256 marketId, bool outcome, bytes32 evidenceHash)
voidMarket(uint256 marketId)
claim(uint256 marketId, address payable recipient)
```

`QuestionCore` includes the canonical offchain metric-spec hash, close time, observation start/end, resolve deadline and minimum author stake. Compute `questionHash = keccak256(abi.encode(chainId, contractAddress, QuestionCore))`. The metric-spec hash is SHA-256 of the canonical source/query/threshold/validity manifest. Keep that manifest publicly retrievable from creation. `createMarket` is authorized and validates the time ordering and supported limits; duplicate question hashes are rejected.

`claimId = keccak256(abi.encode(chainId, contractAddress, marketId, questionHash, authorAddress, reportHash, side))`. The contract derives `authorAddress` from `msg.sender`; the app does not supply an arbitrary author. The report's immutable forecast section already names this question hash and side. A report hash remains SHA-256 content identity—the Solidity formula treats those bytes as an input, not as another JSON hash.

Offchain validation proves the readable report/spec matches the commitment before submitting it; the contract cannot interpret prose or query GraphQL. The demo's scored analysts are explicitly registered wallet identities. A reviewer can recompute every commitment from the public manifest and report. Publish shared Solidity/TypeScript test vectors for all hash formulas.

### 12.3 Predictions, positions and attribution

`commitPrediction` is allowed only before close and only once per `(market, analyst wallet)`. It binds report, side and question while locking a nonzero minimum author stake. The claim becomes score-eligible only on successful receipt. The analyst cannot commit both YES and NO in the same market, replace a losing report afterward, or obtain a score without its own exposure.

Other participants call `stake(marketId, claimId)`. The side is derived from the registered claim, not supplied independently. Verify the claim belongs to this market, its author is registered, and the market is open. Support one selected claim/side per participant per market initially, with optional top-ups on that same claim before close. This keeps payout and attribution accounting small and prevents a reference to a report from meaning two opposing statements.

The author stake participates in the same pool as endorsements. Human users sign their own Arc transactions in the browser. Circle wallets hold platform-allocated analyst funds and sign agent stakes autonomously after the policy/budget gates pass. No server key signs for a human wallet. Display funded analyst/test positions honestly; seeding the board is not organic demand.

### 12.4 How an analyst chooses a side

A reconciliation pass is a prerequisite for trusting forecast inputs; it is **not** the forecast itself. A healthy dataset does not imply YES to “borrow balance exceeds X.”

Initial deterministic policy: take a fixed configured number of valid closed daily observations for the selected metric, compute a documented trend over their actual timestamps, project to the target day, and compare the projected normalized value to the market threshold. Analyst A and B may use different predeclared lookback windows. Store policy revision, inputs, projected value, threshold distance and abstention reason in the report.

If inputs are sparse/noncomparable, the horizon is unsupported, the forecast is too close to the threshold under a configured buffer, the budget is exhausted, or the market is already closed, abstain. No forced disagreement for the demo. No claim that this simple forecast has predictive skill before outcomes exist.

An `analyst-action` operation sequences: market/spec retrieval → approved report query/run → finalized forecast report → ATS publication → budget reservation → Circle `commitPrediction` → receipt confirmation. Deadline checks occur again immediately before signing and onchain. Missing the close deadline leaves a valid published report but no score-eligible market claim; show that state plainly.

### 12.5 USDC accounting and payouts

Arc native USDC uses **18 decimals**; its ERC-20 interface uses **6 decimals** over the same underlying balance. These are two views, not two pots of money. Keep **all Solidity stake/pool/payout accounting in native18 units**. Convert only at display/Circle decimal-string boundaries, and label types `ArcNative18`, `HederaUsdc6` and `UsdMetric6`. Never divide `msg.value` inside the stake path and later transfer a six-decimal amount as native wei. [Arc stablecoin-native model](https://docs.arc.io/arc/concepts/stablecoin-native-model).

Require stakes to be positive and, initially, exact six-decimal USDC increments (`msg.value % 10^12 == 0`), within per-stake/per-market caps. The raw chain amount remains native18. Leave separate gas headroom in agent wallets.

Parimutuel rules:

- Let `Y` and `N` be accepted YES/NO principal. No platform fee in the first contract.
- If outcome is YES and `Y > 0`, a winner with principal `s` claims `s + floor(s * N / Y)` using full-precision multiplication/division. NO is symmetric.
- Losing principal is forfeited to winners. A losing participant has zero payout, not an additional transfer obligation.
- If the chosen winning side has no stake, refund all accepted principal. Preserve the observed YES/NO result for prediction scoring; the payout mode is refund because there are no winners.
- If the observation is invalid or unavailable at deadline, the market becomes VOID and all principal is refundable. VOID contributes no correct/incorrect score.
- If there are no stakes, terminate without payout obligations. Reject stakes after close and claims before a terminal payout mode.
- Claim is pull-based, with checks/effects/interactions and reentrancy protection. The position owner can select a recipient capable of receiving native funds. Mark claimed before sending; a failed send reverts the mark.
- Integer division dust remains explicitly accounted in the contract; no administrator may sweep funds backing unclaimed payouts. For the core, leave residual dust in place and disclose it rather than add a risky sweep feature.

There is no loop that pays every participant on resolution. `resolve` sets terminal facts; each participant claims independently. Test conservation across accepted principal, paid claims, refundable balances and residual dust. Also reject direct unsupported deposits so accounting is not silently credited by the normal receive path; forced/unsolicited native balance is not a participant stake.

### 12.6 Resolver execution and trust

`market/resolve.ts` runs server-side from a due durable operation. It loads the frozen spec, queries the exact supported deployment via `querySubgraph()`, and verifies that source-chain finality and indexing have passed the **end** of the target UTC day. It selects the row using the precommitted rule, preserves raw value/timestamp/block/evidence, normalizes, and computes the comparison in pure code.

Reading the same query twice is a reproducibility check, not an independent oracle. In the live resolver test, execute an independent request against the specified provider and compare the selected row/value; where a separate chain metric is semantically comparable, label that as additional corroboration. Do not substitute external data for the funded question's Graph-defined observation.

Persist a `ResolutionEvidence` record before the Arc submission. Its content hash includes query, variables, returned deployment, metadata, selected row, original value, normalized value, threshold, comparison and validity checks. The contract stores the evidence hash and outcome; the UI makes the underlying evidence inspectable.

**Trust model:** The Graph supplies the observation; our authorized resolver interprets it and submits the result. An Arc contract cannot perform HTTPS GraphQL verification. This is a transparent trusted resolver, not a trustless oracle. Use a separate resolver wallet, no stake-taking authority for that wallet, and immutable funded question terms. A compromised resolver remains a material risk; small testnet caps and public replay make that limitation visible but do not eliminate it.

Before sending, read the current market status from Arc. Onchain `resolve` also requires the authorized role, unresolved status, `now >= observationEnd` and `now < resolveDeadline`; the contract guards the race that offchain checks cannot. At/after the deadline, anyone can call `voidMarket` if unresolved. The app resolver waits/retries invalid or unavailable observations until then; it cannot swap data sources or extend deadlines to avoid a loss.

Use short status checks across invocations. A signed resolution transaction with an unknown receipt retains its operation ID/hash; a duplicate cron cannot construct a new contradictory result. If permissionless void wins the race, reconciliation records VOID and stops resolution. Claimability comes from contract state even if Postgres projection is behind.

### 12.7 Scores and the actual reward loop

`market/events.ts` scans only **our application's Arc contract events**, using bounded block ranges, a persisted finalized cursor and event uniqueness keys. This is an application event journal, not a local index of lending chain data. Reconcile receipts promptly, then backfill missed events through cron. Respect actual provider log limits and chain finality; replay overlap safely.

`market/score.ts` creates one immutable score entry per `(market, analyst claim)`. Read the **committed side**, not a participant's prose or arbitrary report reference. Endorsement count affects pool size and demand displays, not the number of correct predictions. Token buyers never inherit authorship or the author's record.

Display settled count, correct count, incorrect count, void count, hit rate with sample size, author stake/P&L and endorsement volume separately. Derive aggregates from unique score entries or rebuildable SQL; do not blindly increment counters when an event arrives. One correct result is one observation, not established expertise. Reports without a forecast have data-check results and sale records but no prediction score.

The loop is now concrete: an analyst uses live Graph signals, publishes/commits a forecast, puts its own capital behind it, sells the analysis, and later receives a measurable outcome and conditional stake payout. Incorrect predictions can lose the author's stake; strong reports may also attract purchases. We do not promise the market mechanically measures historical prose quality or guarantees profitable analysis.

**Phase 4 exit:** an analyst's Circle wallet commits and funds a forecast before its target window; another participant backs a claim; the live Graph resolver settles after the window; a participant claims the correct native-USDC amount; scores link to the right author/report exactly once. A timeout/VOID refund is also demonstrated. Browser closure and redeployment do not strand due operations.

## 13. Risk register and failure playbook

These are detectable conditions with executable branches. The retry/diagnostic bound limits blind repetition; it is not a build timeline. Never use a fallback that changes funded terms, silently drops a locked core feature, or claims the same prize evidence with a different technology.

| ID | Detectable trigger | Bounded diagnosis/retry | Branch A | Branch B / safe terminal behavior |
|---|---|---|---|---|
| R-01 | Fresh install/build fails or traced function exceeds selected size limit | One clean-lockfile reproduction and per-route trace inspection | Remove barrel imports, extract ABIs/skills, separate route imports | Block release of the failing function; record a new dependency/platform decision. Do not hide errors with broad peer overrides. |
| R-02 | Graph auth error, no rows/indexers, stale head or indexing error | One credential check, then bounded probes of named candidates | Correct key/billing/allowlist or choose a measured healthy endpoint before admitting it | Unsupported protocol response; block standardized-track evidence if meaningful multi-protocol coverage is absent. |
| R-03 | Optional field/enum fails on older schema | Introspection plus one minimal reproduction | Use the known capability adapter/core document | Reject that feature for this deployment; no dropped required field hidden from user. |
| R-04 | Snapshot missing or unstable in an exact historical day | Probe bounded old/recent/missing windows; repeat closed row | Admit another source or narrower metric **before market creation** | Block that market kind. A funded market follows its existing missing-data/VOID rule. |
| R-05 | Deployment/schema changes mid-report or before resolution | Compare actual identity on each response/page | Restart an unfinalized report with an explicitly new source context; use original deployment route if proven available | Published content stays fixed; funded market waits, then voids at deadline if original source unavailable. |
| R-06 | Query cap/page cap reached before full scope complete | Record page count/cursor and remaining scope | Resume bounded pages within approved run budget or ask for narrower scope | `INCOMPLETE`; no full reconciliation/market result from a truncated sample. |
| R-07 | Model output invents facts, invalid references or confidently fills missing scope | One constrained repair attempt | Deterministic format/template or explicit clarification | No authoritative report until validation passes; retain diagnostic evidence. |
| R-08 | Source prices zero/stale, incompatible accounting family or invalid baseline | Named input/check failure; one targeted corroboration if supported | Exclude the invalid metric/market with explicit coverage, or stop report | Never label the artifact a deficit or convert null to zero. |
| R-09 | ATS create/role/issue/transfer reverts | Decode receipt/revert and compare pinned ABI/config/roles | Repair the current asset's next step; use our verified factory | Publication/own sale remains blocked; no generic token or series-token substitution. |
| R-10 | ATS transaction times out after submission | Poll saved hash/nonce/receipt; no new deploy | Recover original transaction and continue next step | Keep `UNKNOWN`, lock conflicting operations and expose recovery. Do not mint/transfer/refund twice. |
| R-11 | Own buyers race or inventory leaves treasury | SQL unique reservation plus fresh chain balance check | One buyer proceeds; others get inventory conflict before payment | Disable listing until ownership/reservation reconciled. |
| R-12 | Blocky402 unavailable or `/supported` mismatches network | Bounded retry with jitter; verify host/network/fee-payer shape | Restore the matching Blocky402 path; development may use its test host | Pause paid sales. Alternative facilitator/self-hosting does not fulfill H-P1. |
| R-13 | Payment submitted but no definitive settlement result | Native ID lookup until valid window plus measured indexing margin; then continue scheduled reconciliation | Recover matching successful receipt and deliver/transfer | Remain pending if evidence uncertain. No new charge, inventory release or author payout. |
| R-14 | Confirmed payment but lost HTTP response/database hook | Retrieve saved attempt and native settlement evidence | Rebuild scoped delivery or own-sale job idempotently | Pending purchase visible to buyer until evidence is restored; no instruction to pay again. |
| R-15 | Paid own sale has definitive transfer failure | Reconcile original transaction/cancellation and current ownership first | Retry the same valid operation if safe, or refund from reserved mainnet funds | Keep refund obligation visible until its own receipt confirms; block treasury payout that would consume the reserve. |
| R-16 | Holder proof invalid or ownership RPC unavailable | Check nonce/domain/signature, then one bounded chain retry | Correct proof or retry service | No content leak and no automatic charge as a substitute for failed ownership verification. |
| R-17 | Circle submission times out or stays pending | Reuse saved idempotency key; poll saved ID through later invocations | Resume the same action and reconcile Arc receipt | Stop new actions for that wallet when status unknown. Raw-key fallback must not duplicate or impersonate its wallet. |
| R-18 | Native/token balance or logged `msg.value` scale differs from expectation | SM-08 exact amount and ABI checks | Correct the connector boundary; retain native18 contract accounting | Block funded contract deployment/use until unit assertions pass. |
| R-19 | Concurrent agent runs exceed remaining cap | Atomic reservation conflict/insufficient available budget | Queue/abstain within configured policy | Refuse the spend; never rely on a process-local counter or provider's per-payment cap alone. |
| R-20 | Cron heartbeat stale, due queue grows, lease expires, browser disappears | Next sweep plus authorized manual advance; inspect oldest due age | Resume from stored checkpoint; prioritize payment uncertainty and imminent resolution deadlines | Stop admitting new work above backlog threshold; permissionless timeout void remains available. |
| R-21 | Duplicate resolver execution or resolution/void race | Read contract, then reconcile attempted receipt | Onchain guard accepts only the first valid terminal transition | Later operation records the authoritative terminal state without a second score/payout. |
| R-22 | Resolver source unavailable through deadline | Scheduled bounded reads under frozen rules | Resolve only if a valid observation becomes available before deadline | Permissionless VOID and pull refunds. No indefinite locked principal. |
| R-23 | Stake references wrong report/question/side or author changes prediction | Validate content/claim hashes; contract ownership/uniqueness guards | Reject before signing and onchain where enforceable | No score entry; preserve invalid attempt for debugging. |
| R-24 | Duplicate/missing app events corrupt a projection | Unique event keys, overlapping bounded replay, onchain state comparison | Rebuild score/purchase projections from confirmed evidence | Mark projection catching up; contract claims remain authoritative. |
| R-25 | Preview signs production transaction or configuration points at wrong chain | Environment guard and network identity check before signing | Correct isolated env/manifest and redeploy | Signing disabled; never silently fall back to a different network. |
| R-26 | Database outage or restoration loses a checkpoint | Provider health and restore/replay exercise | Restore records, reconcile saved operation/chain evidence before resuming | Stop new money-moving actions when durable intent cannot be recorded. |
| R-27 | Mainnet USDC/HBAR funding unavailable | Provisioning balance/association gate | Finish acquisition through the user's chosen funding path | Block our mainnet release claim. Hedera testnet is sponsor-eligible, but changing the requested mainnet product requires an explicit scope decision. |
| R-28 | Start Fresh provenance fails or target rules change | Compare artifact/code dates and current official rules | Correct submission pool/claims where genuinely eligible | Do not certify eligibility or erase pre-existing history. |

### 13.1 Operational recovery surfaces

The operations page shows jobs waiting for an external result, failed checkpoints, unknown payments, asset reservations, pending refunds, due resolutions, budget reservations, treasury liabilities and source health. It exposes a small set of authorized actions: retry **the same** step, refresh external evidence, pause new actions, and invoke a documented compensation after its prerequisites pass. It never exposes arbitrary calldata or secret editing to an ordinary user.

Set initial admission limits in config: maximum concurrent report runs, due-operation backlog and unresolved money-moving operations per signer. An oldest-due-age alert is useful even when the cron endpoint itself returned 200. Use logs/metrics/dashboard status; notification destinations are a later explicit operational setup, not assumed infrastructure.

Each operation records retry count, last error class, last external evidence, next attempt, original config revision and whether money may already have moved. `FAILED` means definitive failure. `UNKNOWN` is deliberately distinct and cannot be treated as a recyclable operation ID.

### 13.2 Features we can defer without breaking the core

Defer MCP discovery, Base-paid Graph queries, Substreams, a custom retained-history subgraph, HCS audit trails, royalty splits, secondary resale, richer forecast models, additional chains/protocol families, optional external corroboration and polished animations. These require new evidence when added.

Protect: live Graph queries, meaningful cross-protocol standardization, deterministic report checks, exact evidence/hash identity, per-report ATS issuance, both purchase models, holder authentication, purchase recovery/refund obligations, budget reservations, Circle agent transactions, Arc stakes/resolution/refunds/payouts, author-bound scores, operational recovery and submission deliverables.

Dropping Phase 4, replacing per-report ownership with a fungible series pass, omitting evidence, or replacing Blocky402/Circle without updating claims is a scope change, not a harmless cut.

## 14. Integration, release and submission sequence

### 14.1 The thin vertical slice before breadth

After the isolated gates, build this first complete slice using one approved report form, two protocols and one market kind:

1. Authenticate and commission a scoped report.
2. Plan, fetch live evidence, calculate, format and finalize it.
3. Issue its ATS testnet asset and publish its listing.
4. A second agent reads the catalog, pays via the real x402 path and receives the finalized report.
5. Complete an own purchase for another listing; prove continuing access and former-holder revocation.
6. An analyst produces a forecast for an already created future-window market, publishes its report, commits its hash and side, and stakes through Circle.
7. A second participant stakes using a registered claim.
8. After the real observation interval, resolve from live Graph data and claim the payout.
9. Rebuild scores from confirmed events and compare with the displayed author/report record.
10. Exercise a separate VOID/refund and a lost-response purchase recovery.

The first cross-module vertical slice can use two protocols. Add the third after it is correct. Do not build five protocol adapters before one report survives publication, payment and resolution.

### 14.2 Deployment gates

| Gate | Required evidence |
|---|---|
| Build | Frozen lockfile install; type/lint; relevant unit/contract checks; traced function sizes; browser/server separation. |
| Data | Live approved protocols, correct deployment/chain, fresh enough observations, historical selector proof, full pagination where claimed. |
| Money | Native6/native18 assertions, account/contract identities, tiny real settled purchase, actual ATS transfer and Circle Arc execution. |
| Recovery | Interrupt generation/submission/settlement; redeploy; duplicate cron; lost browser; replay evidence; no duplicate money movement. |
| Access | Public preview, unpaid 402, holder bypass, read receipt scope, own transfer pending/failure, unauthorized URL/SSR access denied. |
| Operations | Healthy cron heartbeat, bounded backlog, enough signer/treasury funds, recoverable pending operations, tested database restoration. |
| Submission | Required URLs, README, diagram, video/presentation, source attribution, event-pool evidence and explicit track claims. |

Do not expand testing indefinitely. Once the relevant gate's concrete risks are covered, proceed to the next approved unit. Money/authorization/state-machine tests remain mandatory because plausible happy paths do not cover their failure modes.

### 14.3 Arc mainnet readiness, if claimed

Mainnet readiness means more than `ARC-TESTNET → ARC`. Require:

- Published current mainnet chain/RPC/explorer parameters and actual Circle support for the chosen account/action, verified again at readiness review.
- Reproducible compiler/dependency pins, deployment script, constructor roles/caps, ABI hash and verification procedure.
- Funded role/wallet plan, native USDC denomination checks, fee policy and no test token/account fallback.
- Fresh database namespace and immutable network-qualified references; testnet reports/claims are not relabeled as mainnet outcomes.
- Security review of payout/void/authorization logic, known resolver/admin trust disclosed, monitoring and pause/admission controls.
- Recovery rehearsals and a recorded release checklist identifying what is executed, dry-run, or still waiting on network/account availability.

Until this evidence exists, mark A-M1 `NOT YET DEMONSTRATED`. Build the core on Arc testnet; the extra submission cannot make the integrated application depend on an unlaunched/unverified network.

### 14.4 Demo and submission artifacts

Use one 2–4 minute human-narrated event video that fits the Hedera caps. Show a live directive and shared-schema output, the report's evidence/checks, ATS issuance/configuration/transfer, a real paid x402 request, and the Arc claim/stake/settlement/payout/score relationship. Edit out actual waiting between a market's commit window and its later resolution; retain timestamps and receipts so the sequence is honest. Do not simulate a future live outcome in order to record quickly.

A historical replay is useful supplemental evidence and must be labeled replay; it does not replace the core example of a stake committed before its observation. Provider data used live can be historical data—the distinction is live querying versus a local canned fixture.

README sections: product scope; network map; setup; data source/protocol coverage; report method and limits; payment/ownership flow; Circle autonomous decision flow; resolver trust and payout rules; recovery; exact commands; reuse/AI attribution; track evidence links. Include the required architecture diagram and a short presentation describing effective Circle use. Use separate submission notes for the two Graph and two Hedera targets, plus an Arc document naming whichever completed Arc bounties are claimed.

### 14.5 Definition of done

- [ ] Public deployed frontend/backend; required flows operate without a terminal.
- [ ] Start Fresh provenance verified for project-specific design/code/assets; reuse and AI assistance attributed.
- [ ] Live shared query pattern across at least two independent approved protocols; target three with explicit semantic coverage.
- [ ] Multiple directive forms produce validated reports; ambiguous/unsupported requests behave honestly.
- [ ] Canonical report and input evidence retained; replay reproduces facts/checks and original content hash.
- [ ] Per-report ATS testnet creation, configuration, issuance and transfer proven; applicable HashScan verification complete.
- [ ] Real Hedera mainnet x402 paid read through Blocky402, with correct settlement and delivered content.
- [ ] Own purchase and read purchase both work through one checkpoint; holder proof, ownership change and read-recovery scope enforced.
- [ ] Unknown-payment and failed-transfer/refund paths preserve inventory and money correctly.
- [ ] Budget and proceeds ledgers survive concurrency and restarts; author income is distinguishable from platform funds/test stakes.
- [ ] Circle wallet stakes a report-bound authored forecast on Arc before its observation window.
- [ ] Live Graph resolver commits evidence/outcome; winning payout and VOID refund proven.
- [ ] Scores count the right analyst claim once, independent of endorsement count or token ownership.
- [ ] Cron, retries, nonce/idempotency handling and database restore are exercised on the deployed architecture.
- [ ] Architecture diagram, short presentation, track notes, runnable public repo and compliant demo video complete.
- [ ] Each requirement entry links actual evidence; optional mainnet-readiness claim made only if its gate passes.

## 15. Working agreement and reviewable implementation units

### 15.1 The collaboration protocol

Keep Amendment 01's loop for implementation: **state the unit → user approves/resizes → implement and verify → user reviews → commit → update STATE**. This plan-writing task is already authorized; the loop governs subsequent code work.

Before a unit, state its purpose, named files, expected size and proving check in chat and `docs/planning/STATE.md`. Roughly 120 lines is a reviewability target for a logic file; split along behavior, not artificial line-count boundaries. Scaffold units normally touch one conceptual file. Contract units include their substantive tests. Feature tests and declared integration checks belong with the behavior they protect.

Do not quietly enter another subsystem. A cross-subsystem change must be named as an integration unit before it starts; ordinary feature units remain within one subsystem. If a new file or interface change is needed outside the approved unit, restate scope. A correctness defect in shared types can be fixed deliberately with migration/consumer impact documented; it is not forbidden until a session boundary.

Commits show actual incremental progress, with AI assistance identified. There is no invented 4–8 daily-commit eligibility rule. `AI_USAGE.md` summarizes the real file/asset attribution and the user's substantive decisions, review, testing and implementation contributions. Record actual prompts/specs and decisions, not fabricated development history.

### 15.2 Suggested unit sequence

This is a dependency map for review, not a promise about lines or duration. Each row can be split before implementation if it is too large.

| Phase | Reviewable units in order | What the user should be able to explain at exit |
|---|---|---|
| 0 | Repo/docs baseline; dependency pins; environment schema; database connection/migration; deployed imports; one smoke script/result per unit | Which dependencies really work and what remains unmeasured. |
| 1 | Protocol capability record; query client; core documents; error model; query validation; pagination/source context; Claude turn; tool dispatch | Where data lives, how the same query crosses protocols, and why a rejected dataset is rejected. |
| 2 | Report domain schema; plan validation/clarification; numeric transforms; named checks; evidence store; narrator contract; formatter; finalization; resumable report workflow | What each financial figure/check means and which bytes the hash commits to. |
| 3a | ATS ABI export; issuance tuple; deployment receipt recovery; role/issue steps; asset binding; catalog | How one report maps to one token and which chain/admin controls it. |
| 3b | Wallet sessions; quote schema; x402 hello adapter; payment ledger/recovery; holder gate; read delivery; own reservation/transfer; refunds; proceeds/budgets; browser controls | Why a holder is not charged, why a retry is not a new purchase, and what happens between payment and transfer. |
| 4a | Question/claim schemas and hash vectors; contract create/commit/stake; terminal/payout rules and tests; deploy manifest; Circle connector/idempotency | Which proposition is funded, who predicted it, and where the USDC is held. |
| 4b | Forecast policy/abstention; resolver selector; evidence commitment; resolution workflow; event replay; scorer; claim UI | Why an outcome is reproducible, how invalid data refunds, and how an author's score is computed. |
| Integration | Recoverable vertical slice; second/third protocol; concurrent access/spend tests; deployment recovery; submission artifacts | The whole lifecycle and its material trust limits. |

The runner, operation schema and spend ledger have early units before any dependent money-moving feature. They are not cleanup work after the market UI. Phase headings describe product order; shared durability primitives land when their first consumer needs them.

### 15.3 STATE and decision records

`STATE.md` keeps: current approved unit; completed evidence gates; live deployment/config revision; open assumptions; pending external operations; next proposed unit. It contains no secrets. Each decision records trigger, evidence, previous assumption, chosen change, affected modules/requirements and follow-up check.

Examples of decisions that need explicit review: changing supported protocol semantics; changing quote/delivery scope; adding a market metric; switching custody/provider/network; increasing spend caps; changing resolver trust; or altering a published/funded identity. Routine internal refactoring within an approved unit does not require inventing another approval process.

## 16. Research reconciliation and evidence register

### 16.1 Materials used

The supplied set contains **15 research documents**, plus `PLAN-v2.md` and `AMENDMENT-01.md`. Some are follow-ups or combined evaluations rather than separate repositories. This plan incorporates their useful findings and keeps inferred runtime claims open until a gate proves them. It does not treat an earlier reviewer's confident wording as a completed integration test.

| Supplied document | Carry into v3 | Correction, limit or deferred decision |
|---|---|---|
| `scaffold-hbar.md` | Narrow Next/Hedera patterns; explicit network config; browser signer reference | Fresh supported Next app, no monorepo clone/webpack x402 exclusions/Docker. Old Vercel duration claims are replaced by current docs. |
| `scaffold-hbar-x402-followup.md` | Both Blocky402 hosts and standard interface; signer/account mapping; absence of purchase recovery | Host capability discovery is not a funded settlement test. Price/tier and inventory semantics belong to our ledger. |
| `x402-inference-poc.md` | Actual buffering/failure observations; hosted facilitator and payer flow; per-payment cap insufficiency | Its proposed upfront-streaming fix is superseded by the Next measurement. Preserve reference provenance; do not copy unlicensed code. ECDSA is a supported app choice, not a universal protocol rule. |
| `x402-next-2.25.md` | Next peer requirement; response buffering; exact/authorization; limited spend controls | Split-job billing never guaranteed delivery. We generate before selling; no paid body stream. Deployed runtime fit remains untested. |
| `x402-protocol-spec.md` | Exact scheme limits, protocol headers, native validity/timeout recovery, SDK class-copy warning | “Blocky402 mainnet only” was a host-selection error; its test host exists. Optional extensions need storage/verifiers. Arc does expose an ERC-20 USDC interface. |
| `hedera-agent-kit.md` | Transaction strategy and unit-conversion ideas; resource cleanup | No runtime dependency: unnecessary tools/framework surface. Distinguish peer/version risk from claims that multiple package versions can never coexist. |
| `asset-tokenization-studio.md` | ATS contracts plus ethers, role grants, ISIN, event-only pointer, narrow runtime path | Signed issuance/transfer was not measured. Testnet is required for this target. Package installation size is not a function trace. Full deployment is local provisioning; verification must be submitted separately. |
| `circle-agent-stack.md` | DCW SDK, async operation IDs, native18/token6 split, application spend policy | CLI starter kit is not our runtime. Source/type checks did not prove a funded payable call. Raw-wallet fallback cannot silently replace a pending Circle operation. Native USDC does not make gas sponsorship conceptually meaningless; it is simply not required by our core. |
| `messari-subgraphs.md` | Stable core, family semantics, stale positions, price failures, source deployment commitment | Reject blanket eleven-invariant reuse and audited-balance-sheet claims. Queries and endpoint population remained unmeasured. Morpho product ambiguity must be explicit. |
| `messari-subgraphs-followup.md` | Measured deployed schema artifacts/chain correction; pruning-source analysis; block alignment | Closed rows surviving version pruning do not guarantee provider availability. Signal does not establish health. No-prune manifest absence does not prove an indexer's retention policy. Moving `startBlock` forward can omit initialization/state and needs a separate design. |
| `substreams-chain-modules.md` | Understand stream/sink infrastructure and source-versus-published module hashes | Core needs hosted queryable standardized lending state. Neither warm cache nor throughput/cost estimates were proven by a live run. Substreams is not globally disqualified by the Graph prizes. |
| `pinax-substreams-evm.md` | Composition patterns and caution about semantic false positives | Its ERC-4626 module means the earlier “no existing module” claim was too broad. Extra ingest stack is out of core. Subgraphs can make mapping-time contract calls; claiming `eth_call` itself is exclusive to Substreams is incorrect. |
| `subgraphs-skills.md` | Query/report knowledge gap, version rules and independent runnable artifact | Generic authoring skills do not execute our runtime logic. A Markdown file alone cannot enforce arithmetic or add an unsupported report form. |
| `substreams-skills.md` | Skill routing, version discipline and golden eval; clarification failure warning | Borrow methodology, not the stream runtime. An external managed database is compatible with Vercel; the continuous pipeline is the excluded infrastructure choice. |
| `subgraph-mcp.md` | Potential future discovery source | Direct client is core. Remote connector was not executed; its tools/instructions, versions, auth and latency need a separate smoke if added. No runtime MCP SDK/server is required now. |

### 16.2 Assumptions still requiring actual build evidence

| Assumption | Evidence that closes it | Blocking scope |
|---|---|---|
| Required accounts/keys/funding can be provisioned | Real account access and balance/association records | Relevant network integration |
| Current Messari candidates are live and semantically usable | SM-02/03/04 plus recorded adapters | Phase 1/report/resolution |
| Provider preserves and serves our target closed-day rows reliably enough | Bounded historical/repeat probes; runtime failure policy | Market-kind admission |
| A deployment-specific route is available, if used | Actual authenticated query showing the expected deployment | Provider routing choice; mismatch otherwise fails closed |
| Claude SDK/model and tool shape work in Vercel | SM-05 in deployed runtime | Agent |
| Narrow dependencies/assets fit all function traces | SM-01 and post-integration trace report | Deployment |
| ATS selected config permits supply/role/transfer behavior | SM-07, receipts and state reads | Publication and own sale |
| Browser connector can sign native Hedera payments and ownership challenges | SM-09 with supported wallets | Human purchase/access |
| x402 hooks allow durable reconciliation around settlement | SM-06 plus interrupted-settlement integration tests | Paid release |
| Circle idempotency, amount encoding and chosen account type work end to end | SM-08, provider operation and Arc receipt | Agent stakes |
| Forecast window/source completeness is usable in practice | Multiple actual report plans and one future live market cycle | Phase 4 |
| Pro cron/leases can clear the bounded workload | Closed-browser/redeploy/duplicate-invocation run | Autonomous completion |
| Treasury compensation/proceeds accounting is solvent | Concurrent reservations, refund and payout conservation checks | Real-money own sales/proceeds |
| Mainnet readiness is demonstrated | §14.3 completed against current network/account support | Optional Arc claim only |

None of these is marked passed by this document. They are the work's starting evidence ledger.

### 16.3 Primary sources checked for v3

Rules: [ETHGlobal event rules](https://ethglobal.com/events/ethonline2026/info/details), [The Graph](https://ethglobal.com/events/ethonline2026/prizes/the-graph), [Hedera](https://ethglobal.com/events/ethonline2026/prizes/hedera), [Arc](https://ethglobal.com/events/ethonline2026/prizes/arc).

Platform: [Vercel function limits](https://vercel.com/docs/functions/limitations), [duration configuration](https://vercel.com/docs/functions/configuring-functions/duration), [cron plan limits](https://vercel.com/docs/cron-jobs/usage-and-pricing), [cron operation/recovery constraints](https://vercel.com/docs/cron-jobs/manage-cron-jobs), [runtime filesystem](https://vercel.com/docs/functions/runtimes), [environment variables](https://vercel.com/docs/environment-variables), [Next `after`](https://nextjs.org/docs/app/api-reference/functions/after), [Neon pooling](https://neon.com/docs/connect/connection-pooling).

Data and settlement: [Graph quick start and hosted deployment distinction](https://thegraph.com/docs/en/subgraphs/quick-start/), [Graph query API](https://thegraph.com/docs/en/subgraphs/querying/graphql-api/), [Circle payable/idempotent contract execution](https://developers.circle.com/api-reference/wallets/developer-controlled-wallets/create-developer-transaction-contract-execution), [Circle developer wallet quick start](https://developers.circle.com/wallets/dev-controlled/create-your-first-wallet), [Circle supported chains](https://developers.circle.com/wallets/supported-blockchains), [Arc native USDC model](https://docs.arc.io/arc/concepts/stablecoin-native-model).

Package/source behavior is grounded in the supplied revision-specific research and must be remeasured when dependencies change. Public documentation checks here verify rules and platform contracts; they do not replace authenticated integration smokes.

## 17. The first implementation checkpoint

Start with the minimal supported Next/Vercel/Neon scaffold and a named SM-01 unit. In parallel as human provisioning tasks, obtain the Graph key and test wallets; then run SM-02 and SM-03 before choosing settlement sources. Bring the actual outputs back into `STATE.md` and revise only the decisions they affect.

The most important early question is **whether the live standardized deployments supply the exact, stable observations our reports and markets promise**. If that answer is weak, fix the supported data/claim scope first. A polished payment gate cannot make an undefined financial observation correct.

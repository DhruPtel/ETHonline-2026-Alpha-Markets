# Alpha Markets — PLAN v4 (build spec)

**Event:** ETHOnline 2026 · deadline Sunday Sept 13, 12:00 EDT · **Supersedes** `PLAN-v3-model-1.md` and `PLAN-v3-model-2.md` (both preserved under `docs/planning/`). Incorporates the critique in `alpha-markets-plan-v3-critique.md`; §12 maps every critique gap to where v4 closes it.

**Locked decisions (do not re-litigate):**
- Phases: (1) Graph data + agent → (2) report building → (3) ATS tokenization + x402 access, both purchase models through one checkpoint → (4) Arc prediction market resolved from live Graph data by a resolver that reuses the Phase 1 query client. Phase 4 is core.
- Live data only in the product. Fixtures exist only in unit tests and smoke scaffolding.
- Commissioning is free and quota‑limited; **only finished, persisted reports are sold.** No refund path is on the critical path.
- Money on camera: analyst agents buy reports (x402) and stake (Circle wallets on Arc); humans stake on Arc from MetaMask. Human browser purchase of a report is **optional** (§8.3), not core.
- Hedera **testnet** for x402 and ATS during the build; mainnet x402 is a config revision taken only if funded (§7.7).
- ATS: build against the public testnet factory; deploy our own infra only on a trigger (§7.2).
- Two report forms in core: **lending balance overview** and **forecast attachment**. Two configured analysts (A/B).
- Vercel **Hobby**. Job progression is request‑driven plus an external ticker (§3.3). No Pro features assumed anywhere.
- Fixed per‑report/per‑product prices. No metering.
- Cut: Base x402 buyer, `prune: never` fork, MCP discovery, Substreams, HCS trail, royalties, resale, ranking/comparison forms.

---

## 1. What we are building

An analyst agent turns a directive ("balance overview of Aave v3 and Compound v3 on Ethereum, forecast whether Aave v3 borrow balance exceeds $X on day D") into an evidence‑backed report: it plans, runs standardized GraphQL documents against Messari lending subgraphs through The Graph gateway, reconciles the numbers deterministically, narrates over computed facts, and finalizes an immutable envelope whose SHA‑256 is the report's identity.

Each published report gets one ATS security token on Hedera testnet (decimals 0, supply 1) whose creation event carries the report hash. A buyer either pays per read (x402, USDC on Hedera) or buys the token (x402 payment, then ATS transfer). Both go through one access checkpoint: holding the token grants reads; a paid read grants one delivery with bounded recovery.

For reports carrying a forecast, the analyst commits `(reportHash, side)` on an Arc market with its own USDC stake from a Circle developer‑controlled wallet, before the observation window. Humans and the other analyst back a committed claim. After the window, the resolver re‑queries The Graph with the frozen question spec, persists evidence, and submits the outcome. Payouts are pull‑based. Scores derive from committed claims only.

**Three things the UI keeps separate:** data checks (did named checks pass), forecast record (did the committed claim match the observation), and P&L (report sale proceeds on Hedera; stake payouts on Arc; testnet USDC is not revenue).

---

## 2. Networks, identities, accounts

### 2.1 Network map (four contexts, no global toggle)

| Context | Chain | Used for | Connector |
|---|---|---|---|
| `eth-observe` | Ethereum mainnet (read) | Messari subgraphs via The Graph; archive `eth_call` corroboration | `graph/client.ts`, `graph/corroborate.ts` |
| `hedera-pay` | Hedera **testnet** now; mainnet by config revision | x402 sales, buyer agents, treasury | `payments/connectors/hedera.ts`, Blocky402 |
| `hedera-asset` | Hedera **testnet** (chain 296) | ATS issuance, transfer, `balanceOf` | `tokenization/connectors/hedera-testnet.ts` via Hashio |
| `arc-market` | Arc testnet (chain 5042002) | Market contract, stakes, resolution, payouts | `market/connectors/{circle,arc}.ts`, browser MetaMask |

Every connector asserts its network identity on construction (`eth_chainId`, or mirror‑node network for Hedera native) against `config/networks.ts`. A missing env var throws; nothing falls back to another network.

### 2.2 Identity and account inventory (provisioning gate for Phase 0)

| # | Identity | Network | Requirements | Env name |
|---|---|---|---|---|
| 1 | Graph query API key | — | Studio login (EVM wallet signature). Free 100k q/mo. If domain allowlisting is enabled, add Vercel prod + preview domains | `GRAPH_API_KEY` |
| 2 | Ethereum archive‑capable RPC | eth | Must answer `eth_call` at `head-1000` (verified SM‑02) | `ETHEREUM_RPC_URL` |
| 3 | Anthropic API key | — | — | `ANTHROPIC_API_KEY` |
| 4 | Treasury `payTo` account | hedera‑pay | Real `0.0.x` (alias form rejected), **USDC‑associated**, small HBAR for association tx | `HEDERA_PAY_TREASURY_ID` (no key needed for x402 receipt) |
| 5 | Buyer agent A / B | hedera‑pay | ECDSA, USDC balance + association, small HBAR for association | `HEDERA_PAY_BUYER_A_ID/_KEY`, `..._B_...` |
| 6 | ATS issuer/admin | hedera‑asset | ECDSA, test HBAR (≥50 for per‑report ops; ≥500 if deploying infra) | `ATS_ISSUER_KEY`, `HEDERA_ASSET_RPC_URL` |
| 7 | ATS factory + resolver addresses | hedera‑asset | Public: factory `0.0.9213391`, resolver `0.0.9212226` (expiry 2026‑09‑10, unenforced — checked Day 1 via mirror node); or ours (§7.2) | `ATS_FACTORY_ADDRESS`, `ATS_RESOLVER_ADDRESS` |
| 8 | Agent recipient EVM addresses | hedera‑asset | The EVM alias of #5's ECDSA keys (same key gives `0.0.x` and `0x…`) | derived, recorded in `config/analysts.ts` |
| 9 | Circle console, API key, entity secret + recovery file | — | Wallet set `alpha-analysts`, 2 EOA wallets on `ARC-TESTNET`, funded via `requestTestnetTokens` | `CIRCLE_API_KEY`, `CIRCLE_ENTITY_SECRET`, `CIRCLE_WALLET_A_ID`, `CIRCLE_WALLET_B_ID` |
| 10 | Resolver EOA | arc | Raw key, faucet USDC for gas; never stakes | `ARC_RESOLVER_KEY` |
| 11 | Contract deployer EOA | arc | Foundry; faucet USDC; local only | `ARC_DEPLOYER_KEY` (local) |
| 12 | Human demo wallet (MetaMask) | arc + hedera‑asset EVM | Faucet USDC on Arc; used to stake and to prove ATS ownership | none |
| 13 | Neon Postgres | — | Pooled URL for runtime, direct URL for migrations | `DATABASE_URL`, `DATABASE_DIRECT_URL` |
| 14 | App secrets | — | Session HMAC, cron bearer, per‑analyst agent tokens | `SESSION_SECRET`, `CRON_SECRET`, `AGENT_TOKEN_A`, `AGENT_TOKEN_B` |
| 15 | Blocky402 | — | Keyless. Testnet `https://api.testnet.blocky402.com` (feePayer `0.0.7162784`), mainnet `https://api.blocky402.com` (`0.0.10571514`). Verified via `/supported` on Day 1 | `X402_FACILITATOR_URL`, `X402_NETWORK`, `X402_USDC_TOKEN_ID` |

The four Hedera pay‑side values (#4, #5, #15 URL/network/token) move together as one **config revision**; `scripts/check-network-config.ts` refuses to start a deployment where they disagree (e.g., testnet token with mainnet facilitator).

---

## 3. Runtime: what runs, where, and what persists

### 3.1 Deployed pieces

- **Service:** one Next.js 16 app on Vercel Hobby, Node runtime on every route (`export const runtime = "nodejs"`), Fluid compute, `maxDuration` set per route (≤ 300). Route handlers are the backend.
- **Database:** one Neon Postgres project. Runtime uses the pooled URL with `postgres` (max 1 connection per warm instance); migrations run locally/CI over the direct URL; no schema writes at boot.
- **Contracts:** `AlphaMarket.sol` on Arc testnet (ours). ATS contracts on Hedera testnet (upstream's, public factory; ours only on trigger).
- **Scripts:** local one‑shots that exit (provisioning, ATS deploy/verify, ABI export, skill build, smokes). Never invoked by a route.
- **Ticker:** a GitHub Actions workflow (`.github/workflows/ticker.yml`, `schedule: "*/5 * * * *"`) that `POST`s `/api/cron` with `Authorization: Bearer $CRON_SECRET`. Vercel's daily Hobby cron is registered on the same route as a backstop only.

### 3.2 Where data lives

| Data | Where | Authority |
|---|---|---|
| Protocol financials | **Fetched live from The Graph gateway on every use**, including at resolution. Never cached as a source. | The Graph |
| Curated schema per protocol (`graph/schema/<slug>.graphql`) | Repo file built by `scripts/probe-protocols.ts` from the deployed IPFS manifest; validated against live `_meta.deployment` on each run | Repo (drift → refuse) |
| Query evidence (`source_observations`) | Postgres: exact document, variables, raw response bytes (≤1 MiB), `_meta`, block, time, completeness | Provenance only; never read back as data |
| Report envelope, canonical bytes, hash, narrative | Postgres (`reports`) | Published, immutable |
| Report token ownership | Hedera testnet ATS `balanceOf` (read live per authorization) | Chain |
| Report hash commitment | ATS `EquityDeployed` event `additionalSecurityData.info` | Chain |
| Purchases, quotes, payment attempts, deliveries | Postgres | App ledger, reconciled to mirror node |
| Markets, stakes, outcome, resolved/void | `AlphaMarket` contract state | Chain; Postgres projection rebuildable |
| Question specs, claims (readable), resolution evidence | Postgres; hashes on chain | Chain commits, DB preserves content |
| Jobs, operations, leases, cursors, budgets | Postgres | App |
| Skills, ABIs | Bundled at build time into `src/agent/generated/` and `src/tokenization/abi/` | Repo |

Module scope may cache immutable clients/config. **Never** balances, locks, nonces, current job, or spend in module scope.

### 3.3 Durable workflow runner on Hobby

`POST /api/cron` (ticker) and `POST /api/operations/[id]/advance` (UI, authorized by session) both call `workflows/dispatch.ts`:

1. `SELECT … FROM operations WHERE next_attempt_at <= now() AND (lease_until IS NULL OR lease_until < now()) ORDER BY priority, next_attempt_at LIMIT 5 FOR UPDATE SKIP LOCKED` in a short transaction; set `lease_until = now() + lease_ms`, `lease_version += 1`. Priority: unknown payments and due resolutions first.
2. For each leased operation, run **exactly one step** (defined per workflow in §4–§7): one model turn, one query batch, one compute/finalize, one chain submission, one status check. Steps abort external calls at their own deadline (Graph 15 s, LLM 45 s, RPC 20 s, Circle 20 s).
3. Persist the result with `WHERE lease_version = $expected`; set `next_attempt_at`, `cursor`, `provider_ref`, `error_class`. Release the lease. Stop starting new steps after 200 s of the invocation.
4. A step that submitted money and lost the response writes `state = UNKNOWN` with the provider reference; the next sweep reconciles (never resubmits).

UI pages for a pending job/purchase/market poll `advance` every 5 s while open, so a watched job progresses at interactive speed; an unwatched one progresses every ~5 minutes from the ticker. Deadlines (market resolution grace = 24 h) are sized to tolerate hours of ticker outage.

### 3.4 Route duration budgets

| Route | `maxDuration` | Work |
|---|---|---|
| catalog, preview, status, health | 30 | DB reads; one chain read at most |
| `/api/reports/[id]/access` | 120 | verify, buffered body, settle, ledger write; no LLM, no ATS mutation |
| `/api/cron`, `/api/operations/[id]/advance` | 240 | one bounded batch of steps |
| `/api/jobs/[id]/events` (SSE, optional) | 60 | replay persisted progress events from a cursor; polling is the baseline |

---

## 4. Goal repository

```text
alpha-markets/
├── README.md                    product, network map, setup, payment flow, resolver trust, AI attribution
├── LICENSE · AI_USAGE.md · THIRD_PARTY_NOTICES.md
├── package.json · package-lock.json · .node-version (22.x) · .npmrc
├── next.config.ts               outputFileTracingIncludes for generated assets; no x402 stubs
├── vercel.json                  { "crons": [{ "path": "/api/cron", "schedule": "0 4 * * *" }] }   ← daily backstop only
├── tsconfig.json · vitest.config.ts · eslint.config.mjs (import-boundary rules)
├── .github/workflows/
│   ├── ci.yml                   typecheck, lint, unit, forge test, build + trace check
│   └── ticker.yml               */5 * * * * → POST $APP_URL/api/cron (CRON_SECRET)
│
├── docs/                        ═══ PLANNING & EVIDENCE ═══
│   ├── planning/  PLAN-v4.md · PLAN-v3-model-1.md · PLAN-v3-model-2.md · critique.md · DECISIONS.md · STATE.md · requirements.md (evidence ledger) · assumptions.md
│   ├── research/                the 15 research notes, unchanged
│   ├── architecture/  system.mmd · system.svg · system.png · data-contracts.md · trust-model.md · demo-flow.md
│   ├── evidence/SM-xx/          sanitized smoke outputs, receipts, latencies
│   ├── runbooks/  provision.md (the §2.2 table) · ats-infra.md · mainnet-flip.md · recover.md · release.md
│   └── submissions/             graph-standardized.md · graph-ai.md · hedera-payments.md · hedera-tokenization.md · arc.md · presentation.md
│
├── skills/alpha-lending-analyst/   ═══ THE TOOLING ARTIFACT (Graph AI) ═══
│   ├── README.md · plugin.json
│   ├── messari-lending/SKILL.md            version detection, breaks, portable rules, prune → settlement anchors
│   ├── messari-lending/references/{version-matrix,query-cookbook,settlement}.md
│   ├── report-forms/SKILL.md               overview + forecast form contracts
│   ├── scripts/detect-version.mjs          introspect a deployment → schema version + prune posture
│   └── eval/                               cases + golden expectations; run by scripts/run-skill-eval.ts
│
├── contracts/arc/               ═══ PREDICTION MARKET CONTRACT ═══
│   ├── foundry.toml · lib/ (openzeppelin pinned)
│   ├── src/AlphaMarket.sol
│   ├── test/{State,Payout,Void,Auth,Invariants}.t.sol
│   ├── script/Deploy.s.sol
│   └── deployments/arc-testnet.json        { chainId, address, abiSha256, deployTx, compiler, resolver, owner }
│
├── tooling/ats/                 local-only: pinned upstream checkout instructions, deployment-config.json, verify notes
│
├── scripts/                     ═══ ONE-SHOT, LOCAL ═══
│   ├── smoke/SM-01.ts … SM-10.ts
│   ├── probe-protocols.ts       liveness, lag, deployment hash, SDL → graph/schema/*.graphql
│   ├── provision-hedera.ts      ECDSA account create, USDC association, evm alias readout
│   ├── provision-circle.ts      wallet set + wallets + faucet
│   ├── deploy-ats-infra.ts      wrapper around upstream hardhat (trigger only)
│   ├── verify-ats-proxy.ts      Sourcify verification of one ResolverProxy
│   ├── export-abis.ts           minimal ATS ABIs → src/tokenization/abi/*.json
│   ├── build-skills.ts          skills/ → src/agent/generated/skills.ts
│   ├── check-bundles.ts         traced per-route size, imports; fails on secrets in client output
│   ├── check-network-config.ts  the §2.2 config-revision consistency check
│   ├── migrate.ts · seed-analysts.ts · create-market.ts · replay-report.ts · rebuild-scores.ts
│
├── db/migrations/               ordered SQL
│
├── src/
│   ├── app/                     ═══ HTTP + UI (thin) ═══
│   │   ├── page.tsx (directive desk) · reports/[id]/page.tsx · markets/page.tsx · markets/[id]/page.tsx · account/page.tsx · ops/page.tsx
│   │   ├── ui/wallets/evm.ts (MetaMask: session sign, Arc add-chain, stake) · ui/components/
│   │   └── api/
│   │       ├── auth/{challenge,verify,logout}/route.ts
│   │       ├── commissions/route.ts · jobs/[id]/route.ts · jobs/[id]/events/route.ts
│   │       ├── reports/route.ts · reports/[id]/preview/route.ts · reports/[id]/access/route.ts (the checkpoint)
│   │       ├── purchases/[id]/route.ts
│   │       ├── markets/route.ts · markets/[id]/route.ts · markets/[id]/refresh/route.ts
│   │       ├── operations/[id]/advance/route.ts · cron/route.ts · health/route.ts
│   │
│   ├── config/    public.ts · env.server.ts (zod, route-scoped) · networks.ts · protocols.ts · analysts.ts · pricing.ts · limits.ts
│   ├── domain/    ids.ts · report.ts · purchase.ts · prediction.ts · operation.ts · canonical.ts (JCS + numeric rules)
│   │
│   ├── graph/                   ═══ GRAPH DATA ═══   deps: graphql · fetch      → The Graph gateway, ETHEREUM_RPC_URL
│   │   ├── client.ts            querySubgraph()
│   │   ├── documents/           core.graphql · snapshots.graphql · markets-page.graphql · meta.graphql
│   │   ├── schema/<slug>.graphql (curated, generated) · validate-query.ts
│   │   ├── source-context.ts · paginate.ts · errors.ts
│   │   ├── adapters/{aave-family,compound-v2,compound-v3}.ts
│   │   └── corroborate.ts       archive eth_call at the pinned block
│   │
│   ├── engine/                  ═══ RECONCILIATION (pure) ═══   deps: decimal.js
│   │   ├── compute.ts · reconcile.ts · checks/{input,identity,economic,external}.ts · decimal.ts
│   │
│   ├── agent/                   ═══ ANALYST ═══   deps: @anthropic-ai/sdk        → api.anthropic.com
│   │   ├── loop.ts · plan.ts · tools.ts · narrate.ts · forecast.ts · buy-decision.ts · generated/skills.ts
│   │
│   ├── reports/    format.ts · finalize.ts · catalog.ts · evidence.ts
│   │
│   ├── tokenization/            ═══ ATS ═══   deps: ethers@6 + abi/*.json (from @hashgraph/asset-tokenization-contracts@8.0.0)   → Hashio testnet
│   │   ├── ats.ts · issuance.ts · ownership.ts · isin.ts · abi/ · connectors/hedera-testnet.ts
│   │
│   ├── payments/                ═══ x402 ═══   deps: @x402/{core,hedera,next,extensions}@2.25.0 exact   → Blocky402, Hedera mirror node
│   │   ├── x402.ts · quotes.ts · purchase.ts · recover.ts · buyer.ts · connectors/{blocky402,hedera}.ts
│   │
│   ├── access/    authorize.ts (the single checkpoint) · sessions.ts · delivery.ts
│   │
│   ├── market/                  ═══ ARC ═══   deps: ethers@6 · @circle-fin/developer-controlled-wallets@10.8.0   → Arc RPC, Circle API
│   │   ├── questions.ts · claims.ts · stake.ts · resolve.ts · score.ts · events.ts · units.ts · abi/AlphaMarket.json · connectors/{circle,arc}.ts
│   │
│   ├── treasury/  budgets.ts (reserve/settle/release per analyst × rail)
│   ├── workflows/ dispatch.ts · report-run.ts · publish-asset.ts · token-sale.ts · analyst-action.ts · resolution.ts · reconcile.ts
│   ├── store/     db.server.ts · repositories/*.ts
│   └── observability/ log.ts (redaction) · metrics.ts
│
└── tests/  integration/ · fixtures/ (tests only)
```

**Import rules (enforced by eslint boundaries):** `domain/` and `engine/` import nothing from chain/model/db. `graph/` returns typed observations, writes nothing. `agent/` proposes plans and prose, never signs. `access/` may import `tokenization/ownership` and `payments/purchase`, never `agent/` or the ATS factory ABI. Routes validate/authenticate, call one workflow or module, translate to HTTP. Server modules carry `import "server-only"`.

### 4.1 Dependencies (pins chosen in SM‑01, then exact)

| Group | Package | Notes |
|---|---|---|
| Framework | `next` 16.x (≥16.2.6), `react`/`react-dom` 19, `server-only` | `@x402/next` peer; `middleware.ts` → `proxy.ts` rename is irrelevant (we use `withX402FromHTTPServer` on route handlers) |
| Graph | `graphql` | AST validation against curated SDL; transport is built‑in `fetch` |
| Agent | `@anthropic-ai/sdk` | Messages API tool use; model id in config |
| Validation/math/hash | `zod`, `decimal.js`, `canonicalize` (RFC 8785) | SHA‑256 via `node:crypto`; canonicalizer checked against RFC vectors in `domain/canonical.test.ts` |
| x402 | `@x402/core`, `@x402/hedera`, `@x402/next`, `@x402/extensions` — **2.25.0 exact, moved together** | Import Hedera SDK types only via `@x402/hedera` re‑exports |
| EVM | `ethers@6` | ATS, Arc reads/resolver writes, browser provider, units. No viem |
| Circle | `@circle-fin/developer-controlled-wallets@10.8.0` | axios only; Node runtime |
| DB | `postgres` | Neon pooled; transactions for leases/reservations |
| Dev | `typescript`, `tsx`, `vitest`, `foundry`, `@hashgraph/asset-tokenization-contracts@8.0.0` (ABI extraction only, not shipped) |

**Excluded from runtime:** `@hashgraph/asset-tokenization-sdk` (1.4 GB, no server signer), Circle CLI, Hedera Agent Kit, `@hashgraph/hedera-wallet-connect` (core; optional in §8.3), Substreams, Docker, Express.

**Known coexistence:** `@x402/hedera` nests `@hiero-ledger/sdk@2.85.0` exactly. Nothing else in the runtime imports `@hiero-ledger/sdk`; the association script (`scripts/provision-hedera.ts`) uses `@x402/hedera`'s re‑exported `Client`, `TokenAssociateTransaction`, and closes the client in `finally`.

---

## 5. Cross‑module data contracts

Versioned zod schemas in `src/domain/`. Frozen from the first published report: `ReportEnvelope`, `ComputedReport`, `QueryObservation`, `QuestionSpec`. Versioned with migrations: `Job`, `Operation`, `PurchaseQuote`, `Entitlement`, `ClaimSpec`, `Score`.

| Object | Fields | Produced → consumed |
|---|---|---|
| `Directive` | `id, principalId, text, scope{protocols[], period?}, targetMarketId?, quotaReservationId` | HTTP → planner |
| `ProtocolCapability` | `slug, displayName, sourceChainId:1, subgraphId, expectedDeployment (Qm…), schemaVersion, semanticFamily, lendingType, supportedDocuments[], snapshotCapabilities[], curationSignalGrt, observedAt` | `config/protocols.ts` (from probe) → client, planner, resolver |
| `SourceContext` | `protocols[], observation{blockNumber, blockHash, timestamp} | { kind:"per-protocol-asof" }, finalityPolicy, deploymentBySlug{}` | `source-context.ts` → every query in a run |
| `QueryObservation` | `id, slug, deployment, documentId, documentSha256, variables, blockRequested?, meta{block{number,hash,timestamp}, deployment, hasIndexingErrors}, rawBytesSha256, rowCount, pageCursor?, complete:boolean, status:"ok"|"error", errorClass?, fetchedAt` | `graph/client.ts` → adapters, evidence store |
| `NormalizedDataset` | `family, slug, asOf, protocol{…decimal strings}, markets[{id, inputToken{symbol,decimals}, inputTokenBalance, inputTokenPriceUSD, totalDepositBalanceUSD, totalBorrowBalanceUSD, …}], snapshots[], completeness{markets:"complete"|"incomplete", pagesFetched}, sourceRefs[]` | adapters → engine |
| `ComputedReport` | `facts{[factId]: {value:string, unit, sourceRefs[]}}, checks[{id, layer, result:"PASS"|"WARN"|"FAIL"|"NOT_APPLICABLE"|"NOT_CHECKED", severity, reason, refs[]}], limitations[], forecastInputs?` | engine → narrator, formatter, forecast policy |
| `NarrationDraft` | `sections[{id, paragraphs[{text, factRefs[]}]}]` — `text` may contain digits only inside `{fact:ID}` placeholders | narrator (LLM) → formatter/validator |
| `ReportEnvelope` v1 | `schemaVersion, reportId, author{analystId, policyRevision}, directive, scope, plan, sourceContext, evidenceManifest[{observationId, rawBytesSha256}], computed:ComputedReport, narrative:NarrationDraft, forecast?:{questionHash, side, projected, threshold, policyRevision}, engineVersion, skillRevision, modelId, createdAt` | finalize → catalog, ATS, market |
| `reportHash` | `sha256(JCS(envelope minus reportHash))` → 32 bytes; hex string in DB, `bytes32` on chain | finalize → everything |
| `ReportAssetBinding` | `reportHash, network:"hedera:testnet", tokenAddress, deployTx, roleTx, issueTx, infoString, resolverConfigVersion` | publish‑asset → catalog, access |
| `PurchaseQuote` | `quoteId, reportHash, product:"read"|"own", principalId, recipientEvm? (own), payNetwork, asset, payTo, atomicAmount, expiresAt, inventoryReservationId?, operationId` | access checkpoint → x402 route / buyer |
| `Entitlement` | `kind:"holder"|"delivery", principalId, reportHash, evidence{tokenAddress,balance} | {purchaseId, nativeTxId, expiresAt}` | authorize → route |
| `OperationRef` | `operationId, network, intentHash, provider:"hedera"|"hashio"|"circle"|"arc", idempotencyKey, providerRef?, state:"PENDING"|"SUBMITTED"|"UNKNOWN"|"CONFIRMED"|"FAILED", nextCheckAt` | chain connectors → workflows/UI |
| `QuestionSpec` v1 | `specVersion, slug, subgraphId, deployment, metric:"FinancialsDailySnapshot.totalBorrowBalanceUSD", selector:"last-row-in-day", dayStartUtc, thresholdUsd6 (string), comparator:">", equalityIsNo:true, closeTime, observationEnd, resolveDeadline, invalidRules[], resolverVersion` | `questions.ts` → contract commit, resolver, UI |
| `ClaimSpec` | `marketId, questionHash, reportHash, authorAddress, side, claimId, commitTx` | analyst‑action → scoring, stake UI |
| `ResolutionEvidence` | `questionHash, observation:QueryObservation, selectedRow{timestamp, blockNumber, rawValue}, normalizedUsd6, threshold, comparison, valid:boolean, invalidReason?, evidenceHash` | resolver → contract, UI |

**Hash rules.** JCS over UTF‑8 JSON; all financial decimals as strings (no exponent, no leading `+`, no trailing zeros, `"0"` for zero); timestamps ISO‑8601 UTC with 3 fractional digits; addresses lowercase; nullable required fields explicit `null`. Raw source bytes hashed separately (`rawBytesSha256`) and never canonicalized. **The envelope hash excludes the ATS binding and any lifecycle record** (so the hash exists before the token). On‑chain hashes use ABI encoding: `questionHash = keccak256(abi.encode(chainId, marketContract, QuestionCore))`, `claimId = keccak256(abi.encode(chainId, marketContract, marketId, questionHash, author, reportHash, side))`; golden vectors shared between `domain/prediction.test.ts` and `test/Hashes.t.sol`.

---

## 6. Phase 1 — Graph data + agent connected

### 6.1 `config/protocols.ts` — approved registry (config, not data)

Populated only from `scripts/probe-protocols.ts` output. Target set (Ethereum mainnet, all signalled):

| slug | subgraph id | schema | family | signal |
|---|---|---|---|---|
| `aave-v3-ethereum` | `JCNWRypm7FYwV8fx5HhzZPSFaMxgkPuw4TnR3Gpi81zk` | 3.1.0 | aave | 990 |
| `aave-v2-ethereum` | `C2zniPn45RnLDGzVeGZCx2Sw3GXrbc9gL4ZfL8B8Em2j` | 3.1.0 | aave | 42,738 |
| `compound-v3-ethereum` | `AwoxEZbiWLvv6e3QdvdMZw4WDURdGbvPfHmZRc8Dpfz9` | 3.1.0 | compound‑v3 | 31,081 |
| `compound-v2-ethereum` | `4TbqVA8p2DoBd5qDbPMwmDZv3CsJjWtxo8nVSqF2tA9a` | 2.0.1 | compound‑v2 | 40,760 |
| `morpho-aave-v2-ethereum` | (from `deployment.json`) | 3.0.1 | aave (optimizer) | 9,900 |
| `spark-lend-ethereum` (optional 6th) | `GbKdmBe4ycCYCQLQSjqGg6UHYoYfbyJyq5WrG35pv1si` | 3.1.0 | aave | **1.0** — admit only if probe is healthy |

Vertical slice uses `aave-v3-ethereum` + `compound-v3-ethereum`; add `compound-v2-ethereum` third (the 2.0.1 version‑drift demo). `compound-v3-base` is deleted (mislabeled). Morpho Blue is unsupported; a directive naming "Morpho" gets `needs_clarification` naming the Optimizer product.

**`scripts/probe-protocols.ts`** (local): for each candidate, resolve deployment hash via the gateway `_meta`, fetch the deployed manifest and `schema.graphql` from `https://ipfs.network.thegraph.com/api/v0/cat?arg=<Qm>`, record `prune`, `startBlock`, `specVersion`; run `meta.graphql` to record head lag and `hasIndexingErrors`; build the curated SDL (entities `LendingProtocol, Market, FinancialsDailySnapshot, MarketDailySnapshot, Token, InterestRate` + all enums, `_*` stripped, descriptions kept, ≈7.7k tokens) into `src/graph/schema/<slug>.graphql` with a header comment `# deployment: Qm…`.

### 6.2 `graph/client.ts` — `querySubgraph()`

```ts
querySubgraph(input: {
  target: ProtocolCapability;            // never a model-supplied URL
  documentId: "core" | "snapshots" | "markets-page" | "meta" | { custom: string };
  variables: Record<string, unknown>;
  block?: { number: number };            // omitted for head
  signal: AbortSignal;                    // 15 s default
}): Promise<QueryObservation>            // status "error" carries errorClass; never throws on GraphQL errors
```

- Transport: `POST https://gateway.thegraph.com/api/subgraphs/id/{subgraphId}`, header `Authorization: Bearer ${GRAPH_API_KEY}`, `cache: "no-store"`. SM‑02 also tests `POST …/api/deployments/id/{Qm…}`; if it works, **settlement and evidence queries use the deployment route** so a republish fails at the URL.
- Every document includes `_meta { block { number hash timestamp } deployment hasIndexingErrors }`. After parsing, `meta.deployment` must equal `target.expectedDeployment` else `errorClass = "DEPLOYMENT_CHANGED"` (checked on every page).
- Error taxonomy from HTTP status + `errors[0].message`: `AUTH` (401/403), `RATE_LIMITED` (429, retry with `Retry-After`), `UNAVAILABLE` (5xx/timeout, bounded retry), `INVALID_QUERY`, `PRUNED` (message contains "only has data starting at block number"), `LAGGING` (contains "has only indexed up to block number"), `INDEXING_ERROR` (`hasIndexingErrors`), `DEPLOYMENT_CHANGED`, `INVALID_DATA` (unparseable decimal), `UNKNOWN`. Only `RATE_LIMITED`/`UNAVAILABLE`/`LAGGING` retry, max 3, jittered.
- Writes nothing. The caller (`reports/evidence.ts` inside the gather step) persists the observation.

### 6.3 `graph/documents/` — the standardized documents

Pre‑written, parameterized, built only from the five‑version stable core (no `PositionSide`, no `id` ordering on snapshots, no `_*` fields):

- `core.graphql(first:Int=25)` — `_meta`, `lendingProtocols(first:1){ id name slug schemaVersion subgraphVersion methodologyVersion network lendingType riskType totalValueLockedUSD totalDepositBalanceUSD totalBorrowBalanceUSD cumulative* … }`, top markets by `totalBorrowBalanceUSD` with `rates`.
- `markets-page.graphql(first:Int=250, idGt:Bytes|ID, block)` — full universe pagination by `id_gt`, `where:{ id_gt: $idGt }`, `orderBy: id`. The id type differs by version (`Bytes!` 3.x vs `ID!` 2.0.1): the adapter supplies the correct variable type via `validate-query.ts`.
- `snapshots.graphql(from:Int, to:Int)` — `financialsDailySnapshots(where:{timestamp_gte:$from, timestamp_lt:$to}, orderBy: timestamp, orderDirection: asc, first: 1000)`.
- `meta.graphql` — `_meta` only.

The LLM **selects documents and variables**; it does not author GraphQL in core. A `custom_query` tool (validated by `validate-query.ts`: query‑only, allowlisted fields from the curated SDL, depth ≤ 4, `first ≤ 250`, no `_*`, enum values pinned per slug) is wired but disabled by config until SM‑05b passes.

### 6.4 `graph/source-context.ts` — one observation for a multi‑protocol run

For each participating deployment read `meta`: `head_i`, and `earliest_i = head_i − 500` (prune floor of floors; per‑deployment measured floor from the probe overrides). Compute `lo = max(earliest_i)`, `hi = min(head_i, ethFinalizedHead)`. If `lo ≤ hi`, pin every root document and `_meta` to `block: { number: hi }` and record `blockHash` from `_meta`; verify each page's `_meta.block.hash` equals it. If `lo > hi` (a deployment lags >~100 min behind another), fall back to `kind: "per-protocol-asof"`: each protocol queried at its own head, the report labels each as‑of, and `checks/identity` disables same‑block tie‑outs (`NOT_APPLICABLE`). Freshness policy: head age ≤ 30 min for "current" reports (calibrated by SM‑02 measurements), else the run stops in `RETRY_WAIT` with the measured lag.

### 6.5 `graph/paginate.ts`

`paginateMarkets(target, ctx, budget)` → `{ rows[], complete, pagesFetched, cursor }`. `first: 250`, `id_gt` cursor, block pinned, duplicate ids rejected, stops on a page shorter than `first`. Budget cap from `config/limits.ts` (default 24 gateway calls per run, 3 concurrent). Hitting the cap returns `complete: false`; the engine then marks `checks/identity.sumMarketsVsProtocol` as `NOT_CHECKED` with reason `INCOMPLETE`, and no full‑tie‑out verdict is issued.

### 6.6 `graph/adapters/*`

Dispatch on **live** `schemaVersion` + `lendingType` (never static config). Each adapter maps a `QueryObservation` set to `NormalizedDataset` with decimal strings and unit metadata; adds `family` semantics: aave (`inputTokenBalance = aToken.totalSupply`), compound‑v2 (`inputTokenBalance` derived from `outputTokenSupply × exchangeRate`), compound‑v3 (Comet is the market; base vs collateral via `Market.relation`). CDP `lendingType` is rejected with `UNSUPPORTED`.

### 6.7 `graph/corroborate.ts` (optional capability, off by default until SM‑02b)

`observeOnChain(family, market, block)` → `{ aTokenTotalSupply | cTokenTotalSupply×exchangeRateStored | cometTotalSupply, unbacked? }` via `eth_call` **at `_meta.block.number`** on `ETHEREUM_RPC_URL` (archive‑capable, verified). Returned to `engine/checks/external.ts`, which compares with a family tolerance. If the RPC lacks state at that block → `NOT_CHECKED("no archive state")`, never a weaker check relabeled.

### 6.8 `agent/loop.ts`, `tools.ts`, `plan.ts`

- **One Messages API turn per invocation.** Input: persisted `messages[]` (including prior `tool_use`/`tool_result` blocks), system prompt = `generated/skills.ts[messari-lending] + report-forms + curated SDL summaries for the approved slugs` (measured, ≤ 20k tokens). Output: appended messages persisted; tool calls executed only for registered read tools; stop reasons handled explicitly (`end_turn`, `tool_use`, `max_tokens` → repair once, `refusal` → `UNSUPPORTED`).
- Tools (read‑only, budgeted): `get_capabilities(slug)`, `run_document(slug, documentId, variables)` (returns sanitized rows + `_meta`, capped at 64 KiB per result), `submit_plan(ReportPlan)` (terminal). Budgets: 8 turns, 24 gateway calls, 45 s client deadline per turn.
- `ReportPlan` (zod): `status:"ready"|"needs_clarification"|"unsupported", form:"overview"|"forecast", protocols[], period?, documents[{slug, documentId, variables}], transforms[], observationRequirements{pinnedBlock:boolean}, clarifications[]`. Schema validation, not prompt instruction, enforces required scope (protocol product/version, chain, period, forecast meaning).
- The **gather** step (`workflows/report-run.ts`, no LLM) executes the validated plan deterministically through `querySubgraph()`; the loop never fetches the final data itself. This is what makes replay reproduce a report.

**Phase 1 exit:** from the deployed app, a directive produces a validated `ReportPlan`, the gather step runs the same `core` document across ≥2 approved protocols at a pinned common block (or labeled as‑of), and `QueryObservation`s with correct `_meta` are persisted. SM‑01, 02, 04, 05 green.

---

## 7. Phase 2 — Report building

### 7.1 `workflows/report-run.ts` — the state machine

`QUEUED → PLANNING(turn n) → GATHERING(batch n) → COMPUTING → NARRATING → VALIDATING → FINALIZED`, with stops `NEEDS_CLARIFICATION | UNSUPPORTED | RETRY_WAIT | FAILED`. Each arrow is one dispatcher step; checkpoints: validated plan, source context, observation ids + cursors, `ComputedReport`, `NarrationDraft`, validation result. A lost tool result is replayed from the stored observation. Finalization is idempotent on `(runId, version)`.

Commissioning: `POST /api/commissions` requires an EVM session (§8.4) or an agent token; quotas from `config/limits.ts` (per principal per day, global per day, max concurrent runs) are reserved atomically in `quota_reservations`; returns `202 { jobId }` and enqueues the operation. Platform pays the LLM/Graph cost; that is the stated product decision.

### 7.2 `engine/` — deterministic reconciliation (pure)

`compute(NormalizedDataset[]) → facts`, `reconcile(facts, datasets, observations?) → checks`. Decimal context: 128 significant digits, round‑half‑even, versioned `enginePolicy`. Layers and severities:

| Layer | Checks | Severity |
|---|---|---|
| Input validity | required fields; parseable decimals; `inputTokenPriceUSD == 0 && inputTokenBalance > 0` → `DATA_ERROR`; price staleness (`Token.lastPriceBlockNumber`); pagination completeness; deployment identity | `DATA_ERROR` blocks an authoritative figure and market eligibility |
| Arithmetic identity | `market.totalDepositBalanceUSD ≈ inputTokenBalance/10^dec × price`; `Σ markets == protocol` (only when complete and same block); `supplySide + protocolSide == total` (drift canary) | `INCONSISTENCY` |
| Economic indicators | `totalBorrowBalanceUSD ≤ totalDepositBalanceUSD` per market/protocol (the one genuine backing check); utilization; net supplied | `SIGNAL` |
| External | subgraph vs on‑chain at the same block, per family adapter | `SIGNAL` or `NOT_CHECKED` |

Not implemented as invariants: `cumulativeDeposit ≥ cumulativeBorrow` (legitimate repeat borrowing breaks it), global USD ceilings, position‑sum tie‑outs, `reserves`/bad‑debt inference. Aave `stableBorrowedTokenBalance == 0` is a known‑zero. Period revenue = cumulative delta between the last snapshots ≤ period end and < period start, never a sum of dailies.

### 7.3 `agent/narrate.ts` + `reports/format.ts`

Narrator receives `ComputedReport` (facts, checks, limitations) and the form contract; returns `NarrationDraft`. Validator rules: every `factRefs` entry exists; **no digit run in `text` outside `{fact:ID}`**; sections match the form's required set (`scope/as-of`, `key figures`, `data checks`, `interpretation`, `limitations`, `evidence`, `forecast terms` if any); vocabulary of claims restricted (no "solvent", "insolvent", "bad debt" unless a check of that name exists). On failure: one constrained repair turn, then the deterministic template renderer. The formatter substitutes values with units and two‑decimal display rounding (display rounding never feeds engine or settlement). Subgraph names/symbols are escaped as untrusted text.

### 7.4 `agent/forecast.ts` — deterministic policy (form: forecast)

Input: the market's `QuestionSpec`, and `snapshots` for the last `lookbackDays` (A: 7, B: 14) valid closed days of the spec metric. Compute a least‑squares trend over actual timestamps; project to `dayStartUtc + 43200`; normalize to USDC‑6 floor; compare with threshold and a buffer (2%). Output `{ side | abstain, projected, distance, policyRevision, inputs[] }` into the envelope. Abstain when inputs are sparse (< lookback − 2 valid days), noncomparable (deployment change), too close, or the market is already closed.

### 7.5 `reports/finalize.ts` + `evidence.ts`

One transaction: insert `reports(reportHash, canonicalBytes, envelopeJsonb, rendererVersion)`, link `source_observations`, mark run `FINALIZED`. Observations persist raw bytes (≤1 MiB) for the life of the report or any outstanding market/purchase. `scripts/replay-report.ts` recomputes facts/checks from stored observations and must reproduce `reportHash` byte‑for‑byte.

**Phase 2 exit:** overview reports for ≥2 protocols and one forecast report against a created market finalize with valid narration; replay reproduces the hash; a vague directive returns `needs_clarification`; a report with a `DATA_ERROR` finalizes with figures withheld. The skill bundle's `eval/` cases pass on the same code.

---

## 8. Phase 3 — Tokenization + x402 + the one checkpoint

### 8.1 Asset vs. access

The ATS token is provenance + transferable access entitlement; it is not content and not a promise of dividends. One token per report (`maxSupply: 1`, decimals 0). Settings from the ATS note: `compliance: address(0)`, `identityRegistry: address(0)`, `internalKycActivated: false`, no external lists, `isMultiPartition: false`, `isControllable: true` (kept and **disclosed**: admin can force‑transfer; this is the recovery lever), voting/dividend rights off, synthetic checksum‑valid ISIN labeled as an application identifier. Issuance authority is not revoked (no trust gain while admin is retained). `additionalSecurityData.info = "alpha:v1:<reportHash hex>"` (event‑only) — the hash commitment. No `setCustomData` in core.

### 8.2 ATS infrastructure decision (`docs/runbooks/ats-infra.md`)

- **Default:** public testnet factory `0.0.9213391` / resolver `0.0.9212226`. Day‑1 check: `GET testnet.mirrornode.hedera.com/api/v1/contracts/0.0.9213391` → record `expiration_timestamp`, bytecode hash, and a fresh `nonce` (activity). Record in DECISIONS.
- **Trigger to deploy our own:** SM‑07 fails against the public factory for reasons that are not our tuple/roles, or the factory becomes unreachable/expired. Then `scripts/deploy-ats-infra.ts` runs the upstream monorepo's Hardhat deploy at the pinned v8.0.0 commit (`tooling/ats/`), writing a resumable manifest; a mid‑run failure resumes from the manifest.
- **HashScan verification target:** the per‑report `ResolverProxy` (one small contract). `scripts/verify-ats-proxy.ts` submits Sourcify verification with the pinned compiler settings from the ATS package; at least one verified proxy is in the Phase 3 exit and linked in the submission. Infra facets are documented as upstream‑deployed (public) or verified via the same script per facet if ours.

### 8.3 `tokenization/ats.ts`, `issuance.ts`, `ownership.ts`

- `ats.ts` (ethers + minimal ABIs from `export-abis.ts`: `Factory.deployEquity`, `EquityDeployed` event, `IAsset.grantRole/issue/transfer/balanceOf/totalSupply`): `deployAsset(reportHash, name)`, `grantIssuer(token)`, `issueOne(token, to)`, `transferOne(token, to)`, `balanceOf(token, holder)`. Provider `HEDERA_ASSET_RPC_URL` (Hashio testnet), signer from `ATS_ISSUER_KEY`, `gasLimit` 12M for deploy, 1M for calls, 30 s receipt deadline.
- `issuance.ts` (`workflows/publish-asset.ts`): `FINALIZED → ASSET_DEPLOY_PENDING → ROLES_PENDING → ISSUE_PENDING → PUBLISHED`. Each step persists `{intentHash, txHash}` **before** broadcast and recovers by hash on resume; the token address is recovered from the `EquityDeployed` log of the recorded tx, never by redeploying. Only `PUBLISHED` reports enter the catalog.
- `ownership.ts`: `holds(token, evmAddress) → boolean | "UNAVAILABLE"` via `balanceOf ≥ 1` on a fresh RPC read (5 s), never cached as a session flag. `UNAVAILABLE` propagates to a 503 from the checkpoint.

### 8.4 `access/sessions.ts` — one identity scheme (EVM)

- Human: `POST /api/auth/challenge` → `{ nonce, message }` (domain, URI, chain reference, purpose, issued/expiry); `POST /api/auth/verify { address, signature }` → `ethers.verifyMessage`, nonce consumed once, HttpOnly/Secure/SameSite=Lax session cookie (`SESSION_SECRET` HMAC), same‑origin only for state‑changing routes.
- Agent: `Authorization: Bearer ${AGENT_TOKEN_x}` maps to a principal whose registered EVM address is the analyst's Hedera ECDSA alias (`config/analysts.ts`). Same principal model, no cookie.
- Hedera‑native SIWx is **not** implemented; the holder branch and delivery recovery both key on the EVM principal, so no Hedera signature verification is needed.

### 8.5 `payments/x402.ts` — resource server (lazy, non‑fatal)

```ts
// created inside the route on first use; never at module import
const server = new x402ResourceServer(new HTTPFacilitatorClient({ url: X402_FACILITATOR_URL }))
  .register(X402_NETWORK, new ExactHederaScheme({}));   // "hedera:testnet" now
```
`initialize()` is wrapped: on a permanent capability mismatch it does **not** exit; the route returns `503 { code: "FACILITATOR_MISMATCH" }` and `/api/health` reports it. At initialize, assert `/supported` advertises `X402_NETWORK` and record the `feePayer` actually merged into challenges; alert if it differs from the configured expectation. `withX402FromHTTPServer` on the route handler with the `authorization` flow (verify → handler → settle). `paymentProxy` is never used (charges on failure). Response buffering is acceptable: the body is a finished report ≤ 512 KiB.

### 8.6 The checkpoint: `POST /api/reports/[id]/access`

Request: JSON `{ product: "read" | "own", recipientEvm?: "0x…" }` + headers `Idempotency-Key: <uuid>` (required), `X-Alpha-Quote: <quoteId>` (on paid retry), session cookie or agent bearer, and on the paid retry `PAYMENT-SIGNATURE`. Every request passes `access/authorize.ts`:

| State | Result |
|---|---|
| No product / preview | `200` preview (limited body, price, provenance, token address) |
| `read`, principal holds token (fresh `balanceOf`) | `200` full body; no payment created |
| `read`, valid delivery receipt for this `(principal, reportHash)` within 10 min | `200` same body, no charge |
| `read`, no entitlement, no payment | `402` with `PAYMENT-REQUIRED` (amount from `config/pricing.ts` via `dynamicPrice`) + `X-Alpha-Quote` header; body = preview |
| `read`, `PAYMENT-SIGNATURE` present | validate quote binding → verify → buffered body → settle → ledger → `200` + `PAYMENT-RESPONSE` |
| `own`, principal already holds | `200 { alreadyOwned: true }` |
| `own`, inventory available, `recipientEvm` valid | reserve inventory (unique row), freeze quote with recipient, `402` as above |
| `own`, paid retry | verify → settle → ledger → enqueue `token-sale` → `202 { purchaseId, statusUrl }` (never claims delivery) |
| `own`, reserved/sold by another | `409 { inventory: "reserved" | "sold" }`, no challenge |
| `ownership.holds === "UNAVAILABLE"` | `503`; never charge a possibly‑holding principal |
| Payment previously settled for this quote but response lost | `200`/`202` from the ledger, no new challenge |

`recipientEvm` for Own: agents pass their own alias; humans (if the optional path exists) default to their session address. When pay and asset are on the same Hedera network (testnet, now), the server additionally checks `mirror /accounts/{payer}.evm_address` and warns if it differs from `recipientEvm` — informational, the quote is authoritative. After a mainnet flip the recipient is always explicit (different network).

**Ledger before settle:** decode `payload.transaction` with `Transaction.fromBytes` (from `@x402/hedera`), persist `payment_attempts(quoteId, nativeTxId, validStart, validDuration, amount, payer, payTo, payloadSha256)` with a unique `(network, nativeTxId)` constraint, then call settle. The post‑settle hook writes `purchases.state = PAYMENT_CONFIRMED` and (read) a `read_deliveries` row. On `settle` returning `success:false` with `transaction:""`, mark `UNKNOWN` and enqueue `payments/recover.ts`.

### 8.7 `payments/recover.ts`

Given a `payment_attempt` in `UNKNOWN`: query `mirror /api/v1/transactions/{nativeTxId}`; `SUCCESS` with matching token/payer/payTo/amount → `CONFIRMED` (deliver or continue Own); a definitive failure or `validStart + validDuration + 3 min` elapsed with no record → `FAILED`, release inventory; else stay `UNKNOWN`, `nextCheckAt` with backoff. Never resettle with a new transaction.

### 8.8 `workflows/token-sale.ts` (Own)

`AVAILABLE → RESERVED → PAYMENT_PENDING → PAYMENT_CONFIRMED → TRANSFER_PENDING → OWNERSHIP_CONFIRMED → COMPLETE`. After `PAYMENT_CONFIRMED`: `transferOne(token, recipientEvm)` with intent persisted before broadcast; confirm by receipt then `balanceOf(recipient) == 1 && balanceOf(treasury) == 0`. Definitive transfer failure → `NEEDS_COMPENSATION` visible on `/ops` and to the buyer (the compensation is a manual treasury USDC transfer, documented; it is not on the critical path because it requires a real failure of a same‑network transfer). Unpaid reservations expire after the quote's `expiresAt + validDuration`; a reservation is **never** released while a payment is `UNKNOWN`.

### 8.9 `payments/buyer.ts` — the agent as buyer

Same route, from the server: `x402Client().register(network, new ExactHederaScheme(signer))` with `createClientHederaSigner(accountId, PrivateKey.fromStringECDSA(key))`; **`setSpendControls({ maxAmountPerPayment: limits.maxReadUsdc, allowedAssets: [{ network, asset: X402_USDC_TOKEN_ID }] })`** explicitly (default cap is $1 and USDC‑only). Flow: `treasury/budgets.reserve(analyst, "hedera-pay", maxAmount)` → unpaid `POST …/access` (with `Idempotency-Key`) → parse 402 → refuse if `amount > reserved` → sign → paid retry → persist `purchase_attempts` before sending → settle result → `budgets.settle(actual amount from PAYMENT-RESPONSE, cross‑checked with mirror)`. `buy-decision.ts` chooses a report by coverage/freshness/price from the catalog; purchased prose is cited, never treated as a data source.

### 8.10 Human browser purchase (optional, not core)

If added: client‑side `@x402/core` + `@hashgraph/hedera-wallet-connect` (dynamic import, WalletConnect project id, HashPack) signing the 402 for a quote whose `recipientEvm` is the session address. Gate: SM‑09b under `next build`. Until then, the on‑camera paid request is Analyst B buying Analyst A's report — satisfies H1.3 ("a platform or agent consuming it").

**Phase 3 exit:** a finalized report is `PUBLISHED` (deploy/role/issue receipts), listed, and Analyst B completes a real x402 read through Blocky402 testnet; a distinct Own purchase transfers the token to B's alias and B then reads free; a holder is not charged on either read; a read buyer gains no standing access; the `UNKNOWN`‑settlement path and a lost‑response replay are exercised against the deployment; one `ResolverProxy` is verified on HashScan.

---

## 9. Phase 4 — Arc prediction market resolved from live Graph data

### 9.1 `market/questions.ts` — the first (only) question kind

> "Will `<slug>`'s last recorded `FinancialsDailySnapshot.totalBorrowBalanceUSD` for UTC day D exceed X USD?"

`QuestionSpec` as in §5. Selector: the row with the greatest `timestamp` in `[D, D+86400)` from `snapshots.graphql`. Normalization: floor to 6 decimals; threshold at the same scale; strict `>`; equal → NO. Invalid conditions: no row in the interval; duplicate contradictory rows; `errorClass ≠ ok`; `meta.deployment ≠ spec.deployment`; `hasIndexingErrors`; `meta.block.timestamp < D + 86400 + 1800` (indexing not past day end plus margin); unparseable decimal. `closeTime ≤ D`, `observationEnd = D + 86400`, `resolveDeadline = observationEnd + 86400`. The spec's canonical JSON is public at `/api/markets/[id]` from creation.

### 9.2 `contracts/arc/src/AlphaMarket.sol`

Non‑upgradeable; OpenZeppelin `Ownable` (creator), `AccessControl` (`RESOLVER_ROLE`), `ReentrancyGuard`. All amounts **native‑18**; `msg.value % 1e12 == 0` and within `[minStake, maxStake]`.

```solidity
struct QuestionCore { bytes32 metricSpecHash; uint64 closeTime; uint64 observationStart; uint64 observationEnd; uint64 resolveDeadline; uint256 minAuthorStake; }
function createMarket(QuestionCore calldata core) external onlyOwner returns (uint256 marketId);   // rejects duplicate questionHash, validates time order
function commitPrediction(uint256 marketId, bytes32 reportHash, bool side) external payable;      // before closeTime; once per (market, msg.sender); msg.value >= minAuthorStake; emits ClaimCommitted(claimId,…)
function stake(uint256 marketId, bytes32 claimId) external payable;                                // side derived from claim; one claim per (market, staker); top-ups allowed before close
function resolve(uint256 marketId, bool outcome, bytes32 evidenceHash) external onlyRole(RESOLVER_ROLE); // require(!resolved && !voided && now >= observationEnd && now < resolveDeadline)
function voidMarket(uint256 marketId) external;                                                    // anyone, require(now >= resolveDeadline && !resolved)
function claim(uint256 marketId, address payable recipient) external nonReentrant;                 // pull; CEI; marks before send
receive() external payable { revert(); }
```
Parimutuel: winner payout `s + floor(s * L / W)`; no winners on the winning side → refund all; VOID → refund all; dust stays in contract (disclosed); no admin sweep. `questionHash`/`claimId` formulas as §5, with Foundry golden vectors. Tests: state machine, payout math, zero‑winning‑pool, double claim, close boundary, deadline void, unauthorized resolve, reentrancy, conservation fuzz. Deployed by `script/Deploy.s.sol` from a local key; `deployments/arc-testnet.json` consumed by `market/connectors/arc.ts`, which asserts `eth_chainId == 5042002` and the ABI sha256.

### 9.3 `market/connectors/circle.ts` — analyst signer

`initiateDeveloperControlledWalletsClient({ apiKey, entitySecret })`. Wallets: EOA on `ARC-TESTNET`, one per analyst; `config/analysts.ts` records `{ analystId, circleWalletId, arcAddress }` and SM‑08 asserts `arcAddress == wallets.get(id).address` (the contract derives author from `msg.sender`). Calls:

```ts
createContractExecutionTransaction({ walletId, contractAddress: MARKET, abiFunctionSignature: "commitPrediction(uint256,bytes32,bool)", abiParameters: [marketId, reportHash, side], amount: usdcDecimalString, idempotencyKey: operation.idempotencyKey, fee: { type: "level", config: { feeLevel: "MEDIUM" } } })
→ { id, state }   // persisted as providerRef; then getTransaction({ id }) on each step until CONFIRMED/FAILED
```
The `amount` **scale is asserted in SM‑08** by reading `msg.value` from the receipt; `market/units.ts` converts `ArcNative18 ↔ UsdcDecimalString` at this boundary only. A stranded transaction keeps its budget reservation; it is never retried through ethers (different identity).

### 9.4 `workflows/analyst-action.ts`

`market fetch → spec validation → report-run (form: forecast, targetMarketId) → FINALIZED → publish-asset → forecast side or abstain → budgets.reserve(analyst, "arc", stake + fee allowance) → Circle commitPrediction → poll → CONFIRMED → claims row (claimId, commitTx) → budgets.settle`. Deadline rechecked immediately before submission and enforced on chain. Missing the close leaves a valid published report with no claim; the UI says so.

### 9.5 Human staking (`app/ui/wallets/evm.ts`)

MetaMask: `wallet_addEthereumChain({ chainId: "0x4cef52", chainName: "Arc Testnet", rpcUrls: ["https://rpc.testnet.arc.network"], nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, blockExplorerUrls: ["https://testnet.arcscan.app"] })`; `ethers.BrowserProvider` → `contract.stake(marketId, claimId, { value: parseUnits(usdc6, 18) })` (UI takes 6‑dp input, multiplies by 1e12). After sending, the UI `POST /api/markets/[id]/refresh { txHash }`; the server reads the receipt and the contract's per‑market totals into the projection. Claim payouts via `claim(marketId, recipient)` the same way.

### 9.6 `market/resolve.ts` + `workflows/resolution.ts`

Due at `observationEnd + 1800`: load spec → `querySubgraph({ target, documentId: "snapshots", variables: { from: D, to: D+86400 } })` (deployment route) → validity checks (§9.1) → select row → normalize → compare in `decimal.js` → persist `ResolutionEvidence` with `evidenceHash = sha256(JCS(evidence))` **before** any submission → read market state from Arc → if unresolved and within deadline: sign `resolve(marketId, outcome, evidenceHash)` with `ARC_RESOLVER_KEY` (ethers `Wallet`), nonce = `getTransactionCount("pending")` taken inside the operation lease (resolver txs are serialized by the lease), signed tx bytes persisted before broadcast, receipt polled on later steps. Invalid observation → retry every step until `resolveDeadline`; after it, anyone may `voidMarket`; the workflow records the terminal state either way. A second independent request (different `Idempotency`, same variables) is executed and compared as a reproducibility check and stored alongside.

**Trust model (stated in README and UI):** The Graph supplies the observation; our authorized resolver interprets and submits; the contract cannot verify GraphQL. Separate resolver key, no stake authority, small testnet caps, public evidence with replay.

### 9.7 `market/events.ts` + `score.ts`

Projection sources, in order: receipts we hold (agent commits, resolver txs, refresh‑posted human txs) → `contract_events` with unique `(chainId, contract, txHash, logIndex)`; then a ticker‑driven `eth_getLogs` over `[cursor, min(head, cursor + RANGE)]` (RANGE measured in SM‑08; start 2,000) to backfill anything missed. `score.ts` writes one immutable entry per `(marketId, claimId)` from `ClaimCommitted` + `Resolved`/`Voided`: `correct | incorrect | void`; aggregates derived from entries (`scripts/rebuild-scores.ts` reproduces them). Endorsement volume and token ownership never affect the count.

**Phase 4 exit:** a market is created with D = tomorrow; Analyst A commits with stake via Circle before close; a human (MetaMask) and Analyst B stake on a claim; after D ends the resolver settles from live Graph data with persisted evidence; a winner claims the correct native‑18 amount; scores show one entry per claim; a second market demonstrates VOID/refund; browser closed and a redeploy in between do not strand any operation.

---

## 10. Smoke tests and build order

Each smoke is a script under `scripts/smoke/` (or a private authorized route where the deployed runtime is the thing under test). Outputs (sanitized) go to `docs/evidence/SM-xx/`. A failed smoke changes the plan in DECISIONS before dependent work continues.

| # | Question | Minimum | Done signal | Unblocks |
|---|---|---|---|---|
| **SM‑01** | Does the deployed runtime carry our deps and DB? | Next 16 + pinned deps; private probe route importing the narrow Graph/Claude/x402/ATS‑ABI/Circle connectors; one route writes, another reads; two concurrent counter updates; `check-bundles.ts` | Clean install with no peer overrides; traced functions < 200 MB each; row survives a new invocation; counter correct; no secrets in client bundle; cold/warm latency recorded | everything |
| **SM‑02** | One authenticated live Graph query, both routes, archive RPC | `core` on `aave-v3-ethereum` via subgraph‑id route and deployment route from Vercel; `meta` lag; `eth_call` at `head-1000` on `ETHEREUM_RPC_URL` | Populated decimals, `_meta.deployment` matches manifest, lag recorded; deployment route works or is recorded as unavailable; archive call returns state (else corroboration is `NOT_CHECKED` in config) | 6.2, 6.7 |
| **SM‑03** | Do closed‑day snapshot rows support the question semantics? | `snapshots` for a day ~12 months ago **with both bounds**, a recent closed day, and a quiet day; repeat the same closed‑day query later; one `block:{number: head-2000}` query | Old and recent rows return with coherent bounds; repeat read stable; quiet day → `MISSING_OBSERVATION`; historical block query classified `PRUNED` from the exact message | 9.1 market admission |
| **SM‑04** | One document across independent protocols | `core` byte‑identical on aave‑v3, compound‑v3, compound‑v2, morpho‑aave‑v2 (+ spark if healthy); introspect `PositionSide` per slug | ≥2 independent protocols return comparable shapes; 2.0.1 differences detected by the adapter before a run; unhealthy deployments excluded with evidence | 6.1, 6.6 |
| **SM‑05** | Can Claude drive our tools from the deployed runtime? | One turn with `get_capabilities` + `run_document`; one forced tool error; turn budget hit | Tool call reaches `querySubgraph()`, result returns, loop resumes; errors are explicit tool results; budgets terminate; persisted `messages[]` resumes in a second invocation | 6.8, 7.1 |
| **SM‑06** | One real x402 purchase on Hedera testnet through Blocky402 | `hello` route via `withX402FromHTTPServer`; headless buyer (SM‑06a); ledger‑before‑settle; unpaid hit; **decode `payload.transaction` and look up the native tx on the mirror node** (SM‑06b); lost‑response replay with the same `Idempotency-Key` | Consensus success, exact token/payee/amount; buyer receives body; unpaid → 402; mirror lookup by decoded id works; replay returns the same body without a new charge; feePayer matches `/supported` | 8.5–8.9 |
| **SM‑07** | Can ATS issue and transfer our asset on the public factory? | `deployEquity` with the §8.1 tuple, `grantRole(ISSUER)`, `issue(1)`, `transfer` to a second address, read balances; extract address from `EquityDeployed`; `verify-ats-proxy.ts` on the new proxy | Balance moved (0/1), supply 1, tx hashes recorded, config read back matches; proxy verified on HashScan; per‑op latency recorded. If the factory is the problem → trigger §8.2 own deploy | 8.3 |
| **SM‑08** | Can Circle send native USDC to a payable Arc contract, and what scale? | Probe contract with payable `record()`; `amount: "0.01"` with persisted idempotency key; kill the process after `INITIATED`; resume polling in a new invocation; retry the same key; read `msg.value` and `msg.sender`; `eth_getLogs` range probe | Exactly one transfer; `msg.value` scale recorded (expected `10^16` for 0.01); sender equals the recorded wallet address; log‑range limit recorded | 9.3, 9.7 |
| **SM‑09** | Can MetaMask add Arc, stake, and sign an EVM ownership challenge? | Production `next build`; `wallet_addEthereumChain`; tiny `record()` payable; session challenge/verify; wrong network; cancel | Stake lands with correct value; session created only with a valid signature; cancel creates nothing; wrong network rejected | 8.4, 9.5 |
| **SM‑10** | Does the ticker advance leased work with nobody watching? | Deployed `/api/cron`; GitHub Actions ticker; a fake operation with `next_attempt_at`; kill mid‑step; duplicate concurrent triggers | Operation advances within one ticker period; duplicate triggers don't double‑run (lease); expired lease resumes once; Vercel daily backstop registers without deploy error | 3.3 |

**Build order (dependency‑driven, each row a set of reviewable units):**

1. Repo baseline, `docs/planning`, env schema, migrations, `db.server.ts`, `dispatch.ts` + `operations` table, ticker workflow → **SM‑01, SM‑10**.
2. `probe-protocols.ts`, `config/protocols.ts`, `client.ts`, `errors.ts`, `documents/`, `validate-query.ts`, `source-context.ts`, `paginate.ts`, adapters → **SM‑02, SM‑03, SM‑04**.
3. `loop.ts`, `tools.ts`, `plan.ts`, `build-skills.ts`, `report-run.ts` (plan + gather steps) → **SM‑05**. *Phase 1 exit.*
4. `domain/canonical.ts` (+ vectors), `engine/`, `narrate.ts`, `format.ts`, `finalize.ts`, `evidence.ts`, `replay-report.ts`, overview form; `questions.ts` spec schema (needed by the forecast form) → *Phase 2 exit (overview)*.
5. `contracts/arc` + Foundry tests + deploy; `market/connectors/arc.ts`; `create-market.ts` → a real market exists early so forecast reports have a target.
6. `export-abis.ts`, `ats.ts`, `issuance.ts`, `publish-asset.ts`, `ownership.ts`, `catalog.ts` → **SM‑07**.
7. `sessions.ts`, `quotes.ts`, `x402.ts`, `purchase.ts`, `recover.ts`, `authorize.ts`, `/access` route, `delivery.ts`, `buyer.ts`, `budgets.ts`, `token-sale.ts` → **SM‑06** then *Phase 3 exit* on a real report.
8. `circle.ts`, `forecast.ts`, `analyst-action.ts`, `claims.ts`, `stake.ts`, `ui/wallets/evm.ts`, `refresh` route → **SM‑08, SM‑09**.
9. `resolve.ts`, `resolution.ts`, `events.ts`, `score.ts`, market pages → *Phase 4 exit* with one real cycle and one VOID.
10. Vertical slice end to end (two protocols, one overview, one forecast, one read, one own, one commit, one human stake, one resolution); then third protocol; then diagram, README, submissions, video; mainnet flip only per §7.7 trigger.

---

## 11. Known risks and workarounds

| ID | Risk | Detect | Workaround |
|---|---|---|---|
| K‑1 | Ticker late or GitHub Actions schedule throttled (can drift 5–15 min) | `/api/health` reports oldest due‑operation age | UI `advance` polling covers watched work; deadlines sized in hours; daily Vercel backstop; a second free pinger can be added |
| K‑2 | 300 s Hobby limit hit by a long step | step timers; `RETRY_WAIT` | Steps are single turn/batch; Graph fan‑out is `Promise.all` of ≤3; narration is one call; nothing waits on chain receipts inline |
| K‑3 | Blocky402 testnet unreachable / feePayer changes / mainnet host only | `initialize()` assertion; health check | Non‑fatal 503 (no crash loop); retry; last resort self‑facilitation using `@x402/hedera`'s facilitator scheme with our own fee‑payer key (loses H1.2 evidence; documented as diagnostic) |
| K‑4 | Public ATS factory expires/breaks | Day‑1 mirror check; SM‑07 | §8.2 own‑infra trigger with resumable manifest; verification script already written |
| K‑5 | Circle `amount` scale differs from expectation | SM‑08 | `units.ts` boundary is the only conversion point; contract accounting native‑18 regardless |
| K‑6 | No common block across protocols (>~100 min lag on one) | `source-context.ts` | `per-protocol-asof` mode; same‑block checks `NOT_APPLICABLE`; report labels as‑of per protocol |
| K‑7 | Archive RPC lacks state at `_meta.block` | SM‑02 | Corroboration `NOT_CHECKED`; reports still finalize; not a market dependency |
| K‑8 | Snapshot row absent on day D (quiet day) or deployment halted | resolver validity checks | Retry to deadline → permissionless VOID and refunds; question kind admission gated on SM‑03 |
| K‑9 | Subgraph republished (deployment hash changes) mid‑market | `DEPLOYMENT_CHANGED` on the deployment route | Funded market waits then voids; new reports use a new source context explicitly |
| K‑10 | Hedera settle ambiguity (`transaction: ""`) | ledger `UNKNOWN` | `recover.ts` via decoded native tx id and mirror node; no resettle; inventory held |
| K‑11 | Arc `eth_getLogs` range limits unknown | SM‑08 | Receipts‑first projection; bounded backfill range from measurement |
| K‑12 | `@x402/*` churn (2.25.0 is days old) | lockfile | Exact pins, all four together; upgrade only after SM‑06 re‑run |
| K‑13 | Next 16 + `@x402/next` peer or `hedera-wallet-connect` bundling (optional path) | SM‑01 / SM‑09b | Fallback Next 15 + `legacy-peer-deps` is verified working; human buy path is optional |
| K‑14 | Vercel Hobby non‑commercial terms vs. real USDC sales | — | Testnet USDC now; mainnet flip is a conscious decision recorded in DECISIONS; Pro trial is an option at flip time |
| K‑15 | Graph Studio key needs an EVM wallet; domain allowlist 401s previews | SM‑02 | Create key Day 1; add prod + preview domains or leave allowlist off |
| K‑16 | Hedera mainnet funding for the flip (exchange/KYC, association HBAR) | provisioning | Flip is a single config revision (`docs/runbooks/mainnet-flip.md`: facilitator URL, network, token id, treasury, buyer accounts, `check-network-config.ts`); testnet remains the submission if unfunded |
| K‑17 | LLM cost drain via free commissioning | quota counters | Session‑gated, per‑principal and global daily caps, max concurrent runs |
| K‑18 | Human demo participant lacks Arc testnet USDC | — | Faucet via Circle SDK to the demo address before recording; UI links the faucet |
| K‑19 | Resolver key compromise / resolver disappears | trust model | Separate key, no stake authority, small caps, permissionless void after deadline, public evidence replay |

---

## 12. Gap closure map (critique → v4)

| Critique ID | Closed by |
|---|---|
| 0.1 / P1‑0.1 / P2‑0.1 Hobby cron | §3.1 ticker + §3.3 `advance`; SM‑10 |
| 0.2 stake on Hedera vs Arc | §1, §9 (Arc stakes; hash is the only cross‑chain link); §9.5 human MetaMask |
| 0.3 paid commissioning | §7.1 free quota‑limited; no refund module |
| 0.4 metering | §8.6 fixed prices via `config/pricing.ts` |
| P1‑0.2 / P2‑0.4 account inventory | §2.2 table + `docs/runbooks/provision.md` |
| P1‑0.3 / P2‑0.5 `initialize()` exit | §8.5 lazy, non‑fatal, health‑checked |
| P1‑0.4 / P2‑0.6 archive RPC | §2.2 #2, §6.7, SM‑02, K‑7 |
| P1‑0.5 / K‑13 wallet‑connect bundling | §8.10 optional path, SM‑09b under `next build` |
| P1‑1.1 / P2‑1.4 Spark | §6.1 registry (Spark optional 6th) |
| P1‑1.2 / P2‑1.3 common‑block window | §6.4 lo/hi rule + as‑of fallback; K‑6 |
| P1‑1.3 deployment route | §6.2, SM‑02 |
| P1‑1.4 / P2‑1.1 curated SDL + validation | §6.1 probe, §6.3 documents, `validate-query.ts` |
| P1‑1.5 / P2‑0.3 turn checkpointing / step granularity | §3.3, §6.8, §7.1 |
| P2‑1.2 MCP in tree | removed; cut list |
| P2‑1.5 tools | §6.8 tool list |
| P2‑1.6 SM‑7 fork | cut; not a gate |
| P1‑2.1 JCS canonicalizer | §4.1 `canonicalize` + vectors |
| P1‑2.2 / P2‑2.4 evidence size | §3.2 (≤1 MiB), §6.5 `first ≤ 250` |
| P1‑2.3 / P2‑2.3 narrator contract + fallback | §5 `NarrationDraft`, §7.3 |
| P1‑2.4 / P2‑2.2 report forms + `ReportPlan` | locked two forms; §6.8 schema |
| P2‑2.1 hash rules / circularity | §5 hash rules |
| P2‑2.5 untrusted strings | §7.3 |
| P1‑3.1 / P2‑3.1 ATS provenance | §8.2 |
| P1‑3.2 HashScan verification | §8.2 `verify-ats-proxy.ts`, SM‑07 |
| P1‑3.3 three‑wallet UX | §8.4 EVM‑only sessions, §8.6 recipient rule, §8.10 optional, §9.5 |
| P1‑3.4 Hedera SIWx | §8.4 not needed (EVM principal keys everything) |
| P1‑3.5 / P2‑3.6 spendControls | §8.9 explicit |
| P1‑3.6 payment‑identifier | §8.6 `Idempotency-Key` + `read_deliveries`; extension optional |
| P1‑3.7 role revocation / controllable | §8.1 keep + disclose |
| P2‑3.2 recipient binding | §8.6 `recipientEvm` in quote; agents' alias |
| P2‑3.3 browser purchase | §8.10 optional; agent buys on camera |
| P2‑3.4 Own branch in gate | §8.6 table |
| P2‑3.5 / K‑10 ambiguous settlement | §8.6 ledger‑before‑settle, §8.7 |
| P2‑3.7 refund path | removed with free commissioning; Own compensation is manual and off the critical path (§8.8) |
| P2‑3.8 read recovery | §8.6 delivery receipt, replay by `Idempotency-Key` |
| P2‑3.9 R2 branch | K‑3 |
| P2‑3.10 120 s validity | §8.5 authorization flow on a fast handler; no gated generation |
| P1‑4.1 / P2‑4.3 Circle EOA, idempotency, address = author | §9.3, SM‑08 |
| P1‑4.2 / P2‑4.6 human Arc staking | §9.5, SM‑09 |
| P1‑4.3 / P2‑4.4 / K‑11 events | §9.7 receipts‑first + bounded logs |
| P1‑4.4 / P2‑4.5 / P2‑4.8 day‑D semantics, freshness by timestamp | §9.1, §9.6 |
| P1‑4.5 deploy manifest | §4 `deployments/arc-testnet.json` schema |
| P2‑4.1 contract interface, void, deadlines | §9.2 |
| P2‑4.2 domain separation | §5 hash formulas |
| P2‑4.7 seeded pools | §9 exit uses real participants (human + Analyst B); any seeding is labeled in UI |
| Plan 1 scope ordering | §10 build order puts contract and market before ledgers/ops polish; ops page is a read‑only status view in core |

---

## 13. Definition of done

- [ ] Deployed public app; commission (session), preview, agent read, agent own, human stake, resolution, claim — no terminal.
- [ ] Live Graph data through one `querySubgraph()` for reports and resolution; ≥2 independent protocols on one document (target 3, with a 2.0.1 deployment through the adapter); no fixtures in the product path.
- [ ] Canonical envelope + evidence retained; `replay-report.ts` reproduces the hash.
- [ ] Per‑report ATS token created, configured, issued, transferred on Hedera testnet; one `ResolverProxy` verified on HashScan; hash committed in the creation event.
- [ ] One real x402 paid read through Blocky402 (testnet, or mainnet if flipped) on camera; holder not charged; read buyer no standing access; `UNKNOWN` settlement path exercised.
- [ ] `AlphaMarket` on Arc testnet: analyst commit with Circle stake, human and agent stakes, live‑Graph resolution with public evidence, pull payout, one VOID refund; scores one entry per claim.
- [ ] Ticker + leases proven with a closed browser and a redeploy mid‑operation.
- [ ] Architecture diagram, README (network map, setup, payment flow, Circle flow, resolver trust, recovery, attribution), six submission notes, `AI_USAGE.md`, planning artifacts in repo, 2–4 min human‑narrated video.
- [ ] Mainnet‑readiness for Arc stated only with the §7‑style manifest evidence; Hedera mainnet flip recorded in DECISIONS if taken.

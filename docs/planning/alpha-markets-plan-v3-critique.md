# Alpha Markets — Critique of the two PLAN-v3 documents

**Scope:** `PLAN-v3-model-1.md` (called **Plan 1** below — the long §1–17 document, nine smokes, R‑01…R‑28) and `PLAN-v3-model-2.md` (**Plan 2** — the table-driven document, seven smokes, R1–R24). Both still say "Kessan"; treat as Alpha Markets throughout. Checked against the 15 research notes you supplied and the answers you gave.

**Constraints held fixed while reading:**
- Prediction market is core and resolves from live Graph data.
- Read (x402) and Own (ATS) go through one access checkpoint.
- Fixed prices, not metering.
- Vercel **Hobby**, not Pro.
- Team = you + Claude + Codex.
- Base x402 buyer is optional; its absence is not a gap.
- Author claims should be on-chain.

**Method:** for each component I checked whether the plan states what it *is* (module/route/script/contract), what it *depends on* (packages, keys, accounts, infra), what it *does* (inputs/outputs), and where it *runs and persists*. The hardest look is at the seams between components. I did not evaluate schedule or effort, per your instruction; where a plan's time-box numbers appear I ignored them.

Severity marks: 🔴 blocks a working submission if unaddressed · 🟠 causes a mid-build surprise or a demo failure · 🟡 quality/robustness, work around is fine.

---

## Part 0 — Things your answers change in *both* plans before anything else

### 0.1 🔴 Vercel Hobby breaks both plans' job-progression model

Verified against Vercel's current docs: Hobby cron runs **at most once per day, with ±59‑minute precision**; expressions more frequent than daily **fail at deploy time**. Hobby function duration is 300 s max with Fluid compute. Hobby logs are retained for about an hour.

- **Plan 1** states outright: "Configure one production cron entry: `/api/cron`, `* * * * *`. Pro is intentional." That deploy will fail. Its entire §6.2 durable runner assumes a minute-ticker exists.
- **Plan 2** flags it (U8, "Pro tier, or jobs advance on request") but its §5.7 design still says jobs are "advanced by `/api/cron` (leased) OR the first stream request." A daily cron cannot advance a market resolution that has a 24‑hour grace deadline, and cannot reconcile an ambiguous payment before the buyer gives up.

**What's actually required:** an external ticker plus request-driven advancement.
1. Keep `/api/cron` (authorized by `CRON_SECRET`) as the *dispatcher*, but trigger it from outside Vercel every 1–5 minutes: a GitHub Actions `schedule:` workflow that `curl`s it (free, ~minute granularity, occasionally late), or a hosted pinger (cron-job.org, Upstash QStash schedules). Register the Vercel daily cron as a last-resort sweep only.
2. Every page that shows a pending job/purchase/resolution calls `POST /api/operations/{id}/advance` (Plan 1 already has this) on an interval while open.
3. Design every step so *nobody watching for hours* is safe: leases expire, nothing is lost, only delayed. Both plans already claim this; the ticker makes it true.

Also note Vercel's Hobby terms restrict to non‑commercial personal use. Selling reports for real USDC on a Hobby project is a policy risk worth a sentence in your own risk log; it is not a technical blocker.

### 0.2 🟠 "Stake on Hedera, Arc reads it" is not what either plan builds — and cannot satisfy the Arc prize

Your mental model in answers #2/#3 was that the report is tokenized on Hedera, so staking happens on Hedera and Arc "reads it somehow." Both plans put the market, stakes, resolution and payouts **on Arc in native USDC**, and the Arc prize criteria both plans transcribe (A2 "autonomous spending/settlement in USDC", A4 "programmable money flows", A5 "meaningful use of Arc and USDC") require value to move on Arc. A Hedera stake would leave Arc with nothing to judge.

There is also no "Arc reads Hedera" primitive in either plan, and none is needed. The link between the two chains is a **32‑byte content hash of the report**, not a cross-chain read:
- Hedera testnet: ATS `deployEquity(... additionalSecurityData.info = "alpha:<sha256>")` commits the hash in the creation event (Plan 1 §7.2/§11.1; Plan 2 §8 "Content hash → `additionalSecurityData.info`").
- Arc testnet: the analyst's on-chain commitment carries the same `bytes32 reportHash` (Plan 1 `commitPrediction(marketId, reportHash, side)`; Plan 2 `stake(marketId, side, reportRef)`).
- The app and any reviewer can verify both refer to the same bytes. Neither chain calls the other.

**Recommendation:** keep stakes on Arc. Humans stake from an EVM browser wallet on Arc testnet (MetaMask with chain 5042002 added; faucet USDC); the analyst agents stake from Circle developer‑controlled wallets. Plan 1 specifies this exactly; Plan 2 never specifies any human staking path (see P2‑4.6). If you want Hedera to be *involved* in staking, the honest version is "the token you stake against lives on Hedera and its hash is what the Arc claim binds" — which is what both plans already do.

### 0.3 🟡 Paid commissioning vs. selling finished reports

Your answer to #1 described read‑vs‑own tiers, which both plans already have. The open question was whether *generating* a report is paid. Plan 2 gates `POST /api/commission` with x402; Plan 1 makes commissioning authenticated/quota‑limited and sells only finished reports. Given fixed pricing and the refund constraints below (Hedera x402 has no refund primitive; a refund is a hand-rolled treasury transfer), **Plan 1's model is strictly simpler for the locked constraints**: the paid endpoint only ever serves a small, already-persisted body, so the `authorization` flow (verify → handler → settle) works, the 120‑second Hedera transaction validity is never at risk, and no refund path is on the critical path. If you keep Plan 2's paid commissioning for narrative reasons, see P2‑3.7 for what it actually requires.

### 0.4 🟡 Fixed pricing simplifies Plan 2's H1.6 and removes one Plan 1 risk

Plan 2's "price must tie to protocol count × depth" (H1.6) is now a dropped extra; keep `dynamicPrice` only for per-report/product lookup. Plan 1 already prices per report/product from config. Nothing else changes.

---

## Part 1 — Plan 1 (`PLAN-v3-model-1.md`)

Plan 1 is a genuinely complete technical specification at the module level. Most of its gaps are (a) things it assumes about the platform, (b) a handful of seams it names but doesn't close, and (c) scope that is not load‑bearing for your locked constraints and will compete with the core.

### Cross-cutting infrastructure

**P1‑0.1 🔴 Cron/Pro assumption.** See 0.1. Replace §6.2's "Pro is intentional" paragraph with the external‑ticker design. Every "cron recovers due work even when nobody has the page open" claim in §1.2, §6.2, §13 R‑20 depends on this.

**P1‑0.2 🟠 Accounts and keys are described, never inventoried.** §5.2 gives connector rows and role‑prefixed secret names, but a builder cannot read off "how many funded identities, on which network, with which balances and associations." Assembled from the plan plus the research notes, the complete list is:

| Identity | Network | Needs | Source |
|---|---|---|---|
| Graph query API key | — | Studio login (wallet signature), free 100k/mo; optional domain allowlist must include Vercel prod + preview | messari followup §7 |
| Anthropic API key | — | — | — |
| Treasury / `payTo` | Hedera **mainnet** | Real account (`aliasPolicy: reject` blocks alias-form), **USDC `0.0.456858` associated** (needs HBAR for the association tx and for refund/proceeds transfers) | x402 spec note §8, x402-next §5 |
| Buyer agent | Hedera **mainnet** | USDC balance + association; no HBAR needed for x402 itself (Blocky402 is fee payer) but HBAR for its own association tx | scaffold followup §4 |
| Same pair on Hedera **testnet** | — | Testnet USDC `0.0.429274`, faucet HBAR, `api.testnet.blocky402.com` feePayer `0.0.7162784` | scaffold followup §1 |
| ATS deployer/admin + issuer | Hedera **testnet** | ECDSA key, ~200–500 test HBAR if deploying own infra; Hashio RPC | ATS note §3d, §6 |
| Second EVM address | Hedera testnet | To receive in SM‑07 | — |
| Circle console + API key + entity secret (+ recovery file) | — | Wallet set, ≥2 analyst wallets on `ARC-TESTNET`, faucet USDC | circle note §5 |
| Resolver EOA (raw key, ethers) | Arc testnet | Faucet USDC for gas | Plan 1 §12.6 |
| Contract deployer (Foundry) | Arc testnet | Faucet USDC | — |
| Human demo wallet (MetaMask) | Arc testnet + Hedera testnet EVM | Faucet USDC; Arc chain added | — |
| Human Hedera wallet (HashPack/Kabila) | Hedera mainnet | Real USDC to buy on camera | — |
| Neon project + pooled/direct URLs | — | — | — |

That is **thirteen provisioning items, four of which need real money or a KYC'd exchange withdrawal**. Put this table in `docs/runbooks/provision.md` and gate Phase 0 on it.

**P1‑0.3 🟠 `x402ResourceServer.initialize()` exits the process on config mismatch.** Since 2.25.0, a permanent capability/route mismatch (wrong network string, facilitator not advertising `hedera:mainnet`) calls `process.exit`. On Vercel that is a cold‑start crash loop on *every* gated route and it looks like a platform outage. Plan 1 §5.1/§11.4 never mentions it. Fix: construct the resource server lazily inside the route, wrap `initialize()` in a try/catch that returns 503 with a diagnostic, and verify `/supported` includes your network and the expected `feePayer` at build/health time, not in the request path.

**P1‑0.4 🟡 Historical `eth_call` needs an archive-capable RPC.** §10.2 and §12.6 pin corroboration reads to `_meta.block.number`. Subgraph heads routinely lag chain head by more than 128 blocks; a non‑archive Ethereum RPC serves state only for the last ~128 blocks. The plan lists `ETHEREUM_RPC_URL` but not this requirement. Fix: pick a provider with archive access (many free tiers now include it — verify with one `eth_call` at `head-1000` in SM‑02) or restrict corroboration to observations within the retained window and mark `NOT_CHECKED` otherwise.

**P1‑0.5 🟡 The two‑copies‑of‑the‑SDK warning is stated for x402; the browser path re‑creates it.** §5.1 correctly says to cross SDK boundaries with strings. But SM‑09 proposes `@hashgraph/hedera-wallet-connect` in the browser; the ATS note measured that package broken under Node ESM and pulling its own `@hiero-ledger/sdk@2.79.0`. In a Next 16 client bundle this may or may not resolve. The plan's own rule (client-only dynamic import, strings across the boundary) is right; add "SM‑09 must run against a production `next build`, not `next dev`" as the done signal, because dev-mode bundling hides ESM directory-import failures.

### Phase 1 — Data layer + agent

**P1‑1.1 🟠 Protocol candidates include Spark; the research withdrew it.** §9.1 lists Aave v3, Compound v2, Spark, Compound v3. The measured follow‑up found `spark-lend-ethereum` at **1.0 GRT signal** (docs recommend 3,000) and recommends `aave-v2-ethereum` (42,738 GRT, byte‑identical schema to v3) or `morpho-aave-v2-ethereum` (9,900 GRT, 3.0.1) instead. Change the candidate list; keep Spark as an optional sixth if it probes healthy.

**P1‑1.2 🟠 The common-block window for cross‑protocol pinning is ~100–120 minutes and the plan doesn't say so.** §9.2 says "select a source block within the retained overlap." With `prune: auto` = 500–600 blocks, overlap only exists if the slowest participating deployment is less than ~100 minutes behind the fastest. §9.2 does give the fallback ("select a supported common closed snapshot period or decline"); what's missing is the *decision rule*: compute `lo = max(earliest_retained_i)`, `hi = min(head_i)`, pin to `min(hi, finalized_head)` if `lo ≤ hi`, else fall back. Also decide whether Ethereum "finalized" (~64 blocks behind) is required or whether `head-32` is acceptable given a 100‑block window; being strict here can consume most of the overlap.

**P1‑1.3 🟡 Deployment-specific gateway routing.** §9.2 says "if the actual provider supports it." The Graph gateway documents a deployment route (`/api/deployments/id/<Qm…>`) alongside the subgraph‑ID route. Test both in SM‑02 and prefer the deployment route for settlement queries, because it makes the R‑05 "republished" case fail at the URL rather than after parsing `_meta`.

**P1‑1.4 🟡 Query validation depends on a curated SDL the plan never says how to obtain.** §9.3 validates model GraphQL against "the endpoint's curated schema/capabilities." The follow‑up shows the deployed SDL is fetchable from The Graph's IPFS gateway by deployment hash and that the curated six‑entity subset is ~7.7k tokens. Say explicitly: `scripts/probe-protocols.ts` fetches SDL by deployment hash, strips `_*`, subsets entities, pins enums, writes `graph/queries/schema.<slug>.graphql` into the repo; `validate-query.ts` validates against that file with the `graphql` package; drift is detected by comparing the live `_meta.deployment` against the hash the file was built from.

**P1‑1.5 🟡 Per-turn checkpointing of the Messages conversation is implied, not specified.** §6.2 step 3 says "one model turn" per invocation and §9.4 returns a "checkpointable message/result structure." State the persisted shape: the full `messages[]` array including `tool_use` and `tool_result` blocks, the system prompt revision, and the tool‑result byte cap; and state that a resumed turn *replays stored observations* rather than re‑querying (§10.4 says this — link the two).

### Phase 2 — Report building

**P1‑2.1 🟡 JCS canonicalizer is unnamed.** §5.1 requires "an RFC 8785 JCS canonicalizer" that "must pass reference vectors." Name it in SM‑01 (`canonicalize` on npm is the common choice) and add the plan's own pre‑canonicalization rules (decimal strings, `null` vs absent) as a `domain/canonical.ts` test with golden vectors shared with Foundry, as §7.2 promises.

**P1‑2.2 🟡 Report/evidence size limits vs. Postgres.** §6.3 caps a report at 512 KiB and an observation at 1 MiB. A full‑universe `markets(first: 1000)` page with `rates {}` on Aave v3 can approach that. Decide now whether oversize observations are rejected (report `INCOMPLETE`) or chunked; the plan says "reject or paginate larger queries" — pick one and make `paginate.ts` enforce `first ≤ 250` so a page never exceeds the cap.

**P1‑2.3 🟡 Narrator failure fallback is specified; the *validator* inputs are not.** §10.3 lists what to validate (section schema, fact references, prohibited metrics, numerals). It should also state the concrete contract: narrator returns JSON `{ sections: [{ id, paragraphs: [{ text, factRefs: [] }] }] }`; the validator rejects any digit sequence in `text` that is not inside a `{fact:ID}` placeholder. That one rule is what makes "$900 billion" impossible, and it's the assertion Plan 2 also wants.

**P1‑2.4 🟡 Four report forms are ambitious for the core.** §10.1 specifies balance overview, debt ranking, cross‑protocol comparison, and forecast attachment. Only *overview + forecast attachment* are load‑bearing for the locked constraints (a report that carries a claim). Mark ranking and comparison as "after the vertical slice" in §14.1 so they don't compete with Phase 3/4.

### Phase 3 — ATS + x402 + the checkpoint

**P1‑3.1 🔴 ATS infrastructure provenance is a fork in the road the plan leaves open.** §11.2 says "deploy our own compatible ATS testnet factory/resolver/facets with pinned upstream local tooling"; §8.1 (7) allows the smoke to use "a currently verified compatible public testnet factory." Two facts from the ATS note that must drive the decision:
- The public testnet factory `0.0.9213391` / resolver `0.0.9212226` **expire 2026‑09‑10** (mirror `expiration_timestamp`). Hedera does not currently enforce contract expiry, but a demo that depends on someone else's contract surviving a date inside your window is a gamble.
- Deploying your own is **111 contracts, ~180M gas, ~29 minutes measured on testnet**, via the ATS monorepo's Hardhat scripts (Node 24, `HEDERA_TESTNET_PRIVATE_KEY_0`, Hashio rate limits, batching under the 15M gas/tx cap, and a mid‑run failure leaves a partial deployment).

Neither is written down as a decision with a trigger. Suggest: SM‑07 first against the public factory (fast, proves the tuple and roles); then decide. If you deploy your own, `tooling/ats/` needs the exact upstream commit, the Hardhat network config, the resumable deployment manifest the plan mentions, and **the list of addresses to paste into env**. Query the public factory's expiry on Day 1 (`/api/v1/contracts/0.0.9213391`) and write the result into DECISIONS.

**P1‑3.2 🟠 HashScan verification is required and unspecified.** H‑T2 says "HashScan verification where applicable." For ATS this means: (a) infra contracts — if you deployed them, you must submit source verification for the diamond facets (HashScan uses Sourcify; the ATS repo may include a verify task — check, and budget for it not working on 108 facets); if you used the public factory, they're upstream's and you document that. (b) The **per‑report `ResolverProxy`** is one small contract compiled from the same ATS source — verify that one via Sourcify with the pinned compiler settings, and link it in the submission. The plan says "verification must be submitted separately" but names no tool or which contracts; add `scripts/verify-ats.ts` and put "at least one ResolverProxy verified on HashScan" in the Phase 3 exit.

**P1‑3.3 🟠 Three wallets per human, two chains, one purchase — the plan says so but the UI flow is not designed.** §8.1(6), §11.2 and SM‑09 correctly identify that the Hedera mainnet payer (native signer for x402), the Hedera testnet EVM recipient (ATS), and the Arc EVM staker can be different wallets. What's missing is the *sequence a stranger sees*:
1. Connect EVM wallet → sign ownership challenge → session.
2. For Own: enter/confirm the testnet EVM recipient (defaults to the connected EVM address) → server reserves inventory and freezes a quote keyed to that address.
3. Connect Hedera wallet (HashPack via WalletConnect) → sign the x402 transfer for the quote → server settles → transfer queued.
4. Return to the EVM session to read.

Also: there is **no Hedera paywall UI in `@x402/paywall`** — a human hitting a gated route in a plain browser gets nothing usable. The browser buyer must be your own React flow using `@x402/core` client + a `hedera-wallet-connect` signer (scaffold‑hbar `walletSigner.ts` is the reference). Write this as a numbered UX spec in `docs/architecture/data-contracts.md`; it's the single most demo‑critical seam.

**P1‑3.4 🟠 SIWx on Hedera needs a custom verifier, and the plan only hints at it.** §11.3: "implement actual Hedera verification where needed rather than assuming the SIWx package includes it." The x402 spec note confirms the shipped verifiers are EVM and Solana only. State the mechanism: fetch the account's public key from the mirror node (`/api/v1/accounts/{id}` → `key`), verify the ECDSA signature over the CAIP‑122 message with `@x402/hedera`'s re‑exported `PublicKey`. Alternatively, avoid Hedera identity entirely: bind the read‑recovery credential to the **EVM session** plus the native transaction ID, since the EVM session is what the holder branch already needs. That removes one verifier from the build.

**P1‑3.5 🟠 Client `spendControls` on the buyer agent default to a $1 cap and USDC‑only.** §11.7 builds budgets but never mentions `x402Client.setSpendControls`. If a read price is ≥ $1, or you ever price in HBAR, the agent silently refuses to pay with an error that reads like a network fault. Configure explicitly in `payments/buyer.ts` from the same limits config as `treasury/budgets.ts`.

**P1‑3.6 🟡 `payment-identifier` and `offer-receipt` extensions.** §11.4 rolls its own `Idempotency-Key` + `KESSAN-QUOTE-ID`. That's fine, but `@x402/extensions` already ships `payment-identifier` (server↔client, works on Hedera, no facilitator involvement) and Plan 1's dependency list already includes `@x402/extensions`. Use it for the wire‑level id and keep your DB as the store; you get client‑side retry semantics for free. `offer-receipt` is optional; skip for core.

**P1‑3.7 🟡 Role revocation after issuance.** §11.1 says "revoke issuance authority after minting if the proven configuration supports this safely." `renounceRole`/`revokeRole` on a diamond with `DEFAULT_ADMIN` retained by the same key doesn't reduce trust; and `isControllable: true` (the ATS note's recommended setting) lets admin force‑transfer. Either disclose "admin can mint/force‑transfer" or set `isControllable: false` — but that removes your only recovery lever if a buyer flow breaks. Recommend: keep controllable, disclose, and drop the revocation step (it costs a tx per report for no trust gain).

### Phase 4 — Market

**P1‑4.1 🟠 Circle `accountType` and the SCA/EOA choice on Arc.** §3.1 says "Use EOA wallets initially." Good — but state *why* in the connector spec: SCA wallets on Arc go through ERC‑4337 bundling, `msg.sender` at the contract is the SCA, and gas is native USDC either way. The plan's `claimId` derives author from `msg.sender`, so the registered analyst address must be the DCW wallet's address, which for EOA is deterministic. Write the registration check (`analysts.ts` address == Circle wallet address for that wallet ID) into SM‑08's done signal.

**P1‑4.2 🟠 Human stakes need Arc added to the browser wallet.** §12.3 "Human users sign their own Arc transactions in the browser." Arc testnet is not a preset in MetaMask; the UI must call `wallet_addEthereumChain` with `{chainId: 0x4cef52, rpc: rpc.testnet.arc.network, nativeCurrency: {symbol: "USDC", decimals: 18}, explorer: testnet.arcscan.app}`. Also the parimutuel math and `msg.value % 1e12 == 0` rule mean the UI must present amounts in 6‑dp USDC and convert to 18‑dp wei; state it in `market/units.ts`.

**P1‑4.3 🟠 `market/events.ts` needs Arc's `eth_getLogs` limits measured.** §12.7 says "respect actual provider log limits." Unknown for `rpc.testnet.arc.network`; measure in SM‑08 (request a 10k‑block range and see the error). Also decide the *primary* path: receipts you already hold (agent and resolver txs) go straight into `chain_operations`; logs are only for human stakes you didn't submit — which means the human stake UI should POST the tx hash back to `/api/markets/{id}/refresh` so you never depend on log scanning for the demo.

**P1‑4.4 🟡 The market question's day‑D semantics and the demo timeline.** §12.1 is precise. Two practical items to add: (1) the demo market must be created with `closeTime` before day D and resolved after D ends — plan the calendar so at least one real cycle completes with receipts before the video; (2) with `prune: auto` the resolver's *freshness* check ("indexing past day end") must use `_meta.block.timestamp ≥ dayEnd + margin`, not `block.number`, because you can't request the day‑end block by number after ~100 minutes.

**P1‑4.5 🟡 Fuzz/invariant tests on the contract are listed; the deploy manifest format is not.** `contracts/arc/deployments/` promises per‑chain address, ABI hash, tx, compiler settings. Give it a schema now (it's consumed by `market/connectors/arc.ts` and by the mainnet‑readiness claim).

### Scope not load-bearing for the locked constraints (Plan 1)

These are correct engineering but are not required for a working submission that meets your two constraints. Mark them as post‑slice: operations page with recovery actions (§13.1), CSRF handling beyond same‑origin cookies, `OPERATION_ENCRYPTION_KEY` with key‑version rotation, per‑rail budget ledgers with author proceeds payout, `THIRD_PARTY_NOTICES.md`, Playwright e2e, database backup/restore rehearsal, secondary‑resale hooks, four report forms, MCP discovery. Plan 1 itself lists most of these under §13.2, but the repository layout and §15.2 unit sequence still place several of them before Phase 4. Reorder so `4a/4b` land before `3b`'s refunds/proceeds/operations UI.

---

## Part 2 — Plan 2 (`PLAN-v3-model-2.md`)

Plan 2 is excellent at requirement traceability, cut order and risk‑branch discipline, and it caught several things Plan 1 didn't (below). Its weakness is that many components are named in the tree and never specified — the tree is doing the work the text should do. Where Plan 2 and Plan 1 share a gap I say so briefly and point to the Plan 1 entry.

### Cross-cutting infrastructure

**P2‑0.1 🔴 Hobby cron (see 0.1).** U8 is open; §8 "Infrastructure, settled" says "One scheduled function" and "Cron: Hobby is at most daily… Pro tier, or jobs advance on request." Neither branch is designed. Adopt the external ticker + `advance` route (P1‑0.1). Add `app/api/operations/[id]/advance` to the tree; Plan 2 has no such route today.

**P2‑0.2 🟠 Postgres is a dependency with no provider, pooling, or migration tool.** §6 "store: Postgres driver — must support real transactions." Name Neon (or equivalent), the pooled vs direct URL split, the driver (`postgres`), and how `store/migrations/` run (a script, never at boot). Plan 1 §6.3 is a usable spec; lift it.

**P2‑0.3 🟠 Step granularity per invocation is unspecified.** §5.7 says jobs are leased and idempotent and "NEVER an unbounded background promise," but never says what one invocation does. On Hobby (300 s) a whole report run — introspection, `Promise.all` fan‑out, eight model turns, reconciliation, narration — cannot be assumed to fit. Define the step: one model turn, or one query batch, or one finalize, each writing a checkpoint (the Messages `messages[]` array must be persisted between turns). Plan 1 §6.2 step 3 is the spec.

**P2‑0.4 🟠 Account/key inventory absent.** "Lead‑time items, today" lists five bullets. See the thirteen‑row table at P1‑0.2; Plan 2 needs it more because it also proposes a `deploy-ats.ts` and a `provision-hedera.ts` with no stated inputs.

**P2‑0.5 🟠 `initialize()` crash loop (see P1‑0.3).** Not mentioned.

**P2‑0.6 🟠 Archive RPC for `corroborate.ts` (see P1‑0.4).** Plan 2 has no `ETHEREUM_RPC_URL` anywhere.

**P2‑0.7 🟡 `@x402/next` is one day old; Next 16 decision.** "Start on Next 16… fallback is Next 15 + legacy‑peer‑deps." Fine, but add to SM‑1/SM‑3: pin the exact `next` patch that satisfies `>=16.2.6`, and note that Next 16 renamed `middleware.ts` → `proxy.ts` — irrelevant if you use `withX402` on route handlers (you should; `paymentProxy` charges on failure), but any copied middleware example will not load.

### Phase 1 — Data layer + agent

**P2‑1.1 🟠 No query validation layer.** The tree has `introspect.ts` and `queries.ts` but nothing that validates model‑authored GraphQL. Phase 2 says "the LLM produces a plan, not prose" — a plan containing what? If it contains GraphQL, it must be validated (query‑only, allowlisted fields, no `_*`, bounded `first`, enum pinning) before it hits the gateway, or you will see `PositionSide` validation errors and 1000‑row pulls at demo time. If it contains only *selections from pre‑written documents*, say so — that is a legitimate and simpler design (`queries.ts` = the standardized documents; the planner chooses document + variables). Either way, write it down; it decides whether `graphql` is a dependency.

**P2‑1.2 🟠 `discover.ts` (Subgraph MCP) is in the tree but cut #6, and U7 is unresolved.** Remove it from the Phase 1 exit criteria and the tree until the cut is reversed. If kept: the MCP connector supports tools only, the "Subgraph Server Instructions" resource must be inlined into the system prompt, and the beta header (`mcp-client-2025-11-20`) must be pinned (subgraph‑mcp note §2).

**P2‑1.3 🟠 Common‑block window (see P1‑1.2).** §Phase 1 says "select a mutually available finalized block" — the window is ~100–120 minutes and no fallback is written. Add the `lo/hi` rule and the per‑protocol‑as‑of fallback.

**P2‑1.4 🟡 Spark in the five.** Not named, but "5 targeted" plus the byte‑identical‑hash README claim (G1.5) implies aave‑v2/v3/spark. Spark is unsignalled; use aave‑v2 + aave‑v3 for the byte‑identical claim and morpho‑aave‑v2 or compound‑v2 for version diversity.

**P2‑1.5 🟡 `tools.ts` is unspecified.** Which tools does the loop expose? Suggest exactly two read‑only tools: `run_document(slug, documentId, variables)` and `get_capabilities(slug)`. No free‑form URL, no raw GraphQL unless P2‑1.1 is resolved with validation.

**P2‑1.6 🟡 SM‑7 (fork with late `startBlock`) is the one genuinely new smoke.** It correctly flags that Messari mappings create `Market` entities from initialization events, so a late start may yield an empty subgraph; the follow‑up note also says grafting won't work because the source is pruned. This is real research value — but it belongs behind cut #7, not in Day‑1 gates. Move it out of Phase 0.

### Phase 2 — Report building

**P2‑2.1 🟠 Report hash: no canonicalization, coverage, or circularity rule.** §8 persists "Content hash → Hedera (`additionalSecurityData.info`, immutable)" and §5.14 freezes `Report`, but nowhere: which bytes are hashed, how JSON is canonicalized, that the ATS address is excluded so the hash can exist before the token does, or that Arc `reportRef` is the same bytes. Adopt Plan 1 §7.2 verbatim (JCS + string decimals + exclude lifecycle fields; hash raw responses separately).

**P2‑2.2 🟠 `ReportPlan` and report forms are undefined.** Phase 2 says "Intent + skill + introspection → `ReportPlan`" and "Define the reporting boundary before the query." What forms exist? What fields does `ReportPlan` carry? `needs_clarification` is required — required *by what schema*? Write the zod schema now; it's the contract between `compose.ts`, `workflow/gather`, and `engine/reconcile.ts`.

**P2‑2.3 🟠 Narration has no failure fallback.** §5.5 is the right idea (figures are metric‑ID references). It doesn't say what happens when the narrator returns something the renderer can't resolve. Add a deterministic template fallback and the "no digits outside placeholders" validator (P1‑2.3).

**P2‑2.4 🟡 Evidence persistence has no size bound.** §5.13 stores raw responses; nothing caps them. Add a page‑size cap (`first ≤ 250`) and a per‑observation byte cap.

**P2‑2.5 🟡 Untrusted strings.** Subgraph `Market.name`/`Token.symbol` are indexer‑supplied text and end up in reports and HTML; purchased reports are untrusted data to the buyer agent. Plan 1 §10.3 states both; Plan 2 does not.

### Phase 3 — ATS + x402 + the checkpoint

**P2‑3.1 🔴 Where do the ATS factory and resolver come from?** Phase 3 says `deployEquity` per report against… nothing named. `scripts/deploy-ats.ts` exists in the tree with no description. The choice (public testnet factory that expires 2026‑09‑10 vs. a 111‑contract own deploy through the ATS monorepo's Hardhat) is not written anywhere. See P1‑3.1; Plan 2 needs the same decision plus the env addresses.

**P2‑3.2 🔴 The Own tier has no recipient‑binding design.** §5.10 correctly enumerates five failure states of the cross‑network sale and says "inventory reservation + operation journal + retryable completion + compensation." But the *input* to the transfer — the buyer's **Hedera testnet EVM address** — is never obtained anywhere. The x402 `settleResponse.payer` is a mainnet `0.0.x`; it is not the recipient. Without a proven recipient the transfer step has no argument. Required: an EVM‑wallet session (EIP‑191 signed challenge, verified with `ethers.verifyMessage`), the recipient captured into the frozen quote before the 402 is issued, and the transfer step reading it from the journal. The server‑side buyer agent likewise needs its own testnet EVM key to receive and later prove holding.

**P2‑3.3 🔴 No browser purchase path exists.** "Every demo action is a UI click" and "a stranger can commission, buy, stake" (§12), but the payments tree has `buyer.ts` (server agent) only. A human cannot pay a Hedera x402 challenge from a browser without a Hedera wallet connector and a client‑side `@x402/core` flow (`@x402/paywall` has no Hedera UI). Either (a) build the HashPack/WalletConnect signer path (scaffold‑hbar `walletSigner.ts` as reference; needs a WalletConnect project ID and `@hashgraph/hedera-wallet-connect` in the client bundle — verify under `next build`), or (b) narrow the DoD: the on‑camera paid request is the **buyer agent** (H1.3 requires "a platform or agent consuming it", which an agent satisfies) and human "buy" is out of scope. Pick one explicitly; (b) is far cheaper and still meets H1.

**P2‑3.4 🟠 `gate.ts` has no Own branch and no ownership‑check semantics.** The pseudo‑code covers entitlement / just‑paid / preview. Missing: Own‑with‑inventory‑available (reserve → quote → 402), Own‑already‑owner, Own‑sold (409), and "ownership RPC unavailable → 503, never charge." Also `balanceOf` is read from Hashio JSON‑RPC per read; state that it is never cached as a session flag. Plan 1 §11.3's table is the spec.

**P2‑3.5 🟠 Ambiguous Hedera settlement is unhandled.** R10/R14 treat failure as definitive. On Hedera, every settle failure — including a Blocky402 timeout after broadcast — comes back as `{success:false, transaction:""}`. You must decode `payload.transaction` (`Transaction.fromBytes` re‑exported from `@x402/hedera`), extract the native transaction ID and validity window, and query the mirror node before deciding "failed." Add `payments/recover.ts`; without it, a timed‑out buyer either pays twice or gets nothing.

**P2‑3.6 🟠 Buyer `spendControls` (see P1‑3.5).** Not mentioned; default $1 cap will bite the first time a price is ≥ $1.

**P2‑3.7 🟠 Paid commissioning implies a refund path the plan lists but doesn't build.** §5.8 and R14: "FAILED jobs get an explicit refund path — a Hedera transfer from treasury, logged." Required and absent: a treasury **signing key** on Hedera mainnet (the plan's `chains/hedera.ts` is "injected"; from where?), HBAR on the treasury for fees, a `refunds.ts` with idempotency keyed on the failed job, and an accounting rule that keeps refund reserves out of proceeds. If you take the 0.3 recommendation (sell finished reports only), this whole path leaves the core.

**P2‑3.8 🟠 Read‑delivery recovery.** "Just settled an x402 payment? → serve this once." If the HTTP response is lost after settlement the buyer has paid and has nothing, and a retry gets a fresh 402. Either use `@x402/extensions` `payment-identifier` with a server cache keyed by payment id, or Plan 1's ten‑minute scoped recovery credential bound to the native transaction ID.

**P2‑3.9 🟡 R2 Branch A is not a fallback.** "Retry against the other Blocky402 host (testnet vs mainnet)" changes the network, the USDC token ID, the feePayer, and every funded account. It's a *config switch*, valid only as R12's "run x402 on testnet." Rewrite R2‑A as "verify `/supported`, feePayer, association, network string" and R2‑B as the self‑facilitation fallback (`@x402/hedera` exports the facilitator scheme; loses H1.2 but keeps the demo alive).

**P2‑3.10 🟡 Two‑endpoint split and the 120‑second validity window.** The design (gate the cheap acceptance, stream ungated) is correct for `authorization` flow because the handler is fast. Say so explicitly so nobody later "optimizes" by gating the stream — Hedera's transaction validity (~120 s, set by the SDK default, not `maxTimeoutSeconds`) would then expire mid‑generation.

### Phase 4 — Market

**P2‑4.1 🔴 The contract interface cannot express the plan's own §5.1 design, and it cannot void.** Interface: `createMarket(questionSpecHash, closeTime)`, `stake(marketId, side, reportRef) payable`, `resolve(marketId, outcome, proofHash)`, `claim(marketId)`. Problems:
- Author claims are off‑chain signed records (§5.1). You want them on‑chain. Off‑chain claims also let a staker's `stake(..., side, reportRef)` disagree with the author's signed claim for the same `reportRef`; §5.1 handles this by scoring the claim, but then the agent's "own capital" (G2.3) is a separate `stake()` call that can diverge from its claim.
- No `observationEnd`, no `resolveDeadline`, no `voidMarket`, no refund on invalid data. R17 says "market voids and stakes refund," and Phase 4 says "define recovery if the resolver disappears" — the interface has no function for either. Funds are lockable forever.
- `require(!m.resolved)` is there; `require(block.timestamp >= observationEnd)` and the deadline race guard are not.
- No recipient argument on `claim`, no stake caps, no rejection of direct `receive()`.

Adopt Plan 1 §12.2/§12.5: `createMarket(QuestionCore)`, `commitPrediction(marketId, reportHash, side) payable` (author stake required, one per author per market, before close), `stake(marketId, claimId) payable` (side derived from claim), `resolve(marketId, outcome, evidenceHash)`, `voidMarket(marketId)` permissionless after deadline, `claim(marketId, recipient)`, pull‑based, all accounting native‑18, `msg.value % 1e12 == 0`.

**P2‑4.2 🟠 `questionSpecHash` has no domain separation.** The same off‑chain spec hashes identically on Arc testnet and Arc mainnet. Fold `chainId` and contract address into the on‑chain `questionHash` (Plan 1 §12.2) so the "mainnet readiness" story cannot accidentally relabel testnet markets.

**P2‑4.3 🟠 Circle integration is a file name.** `chains/arc-circle.ts` and SM‑5. Unspecified: `accountType` (use EOA — see P1‑4.1), persisted `idempotencyKey` per logical action, the `INITIATED → poll` state machine as a job step (R6 mentions `tx_jobs` "already baseline" — it isn't in the tree), wallet‑set/wallet‑ID → analyst address mapping, faucet funding via `requestTestnetTokens`. R20 correctly says never retry via ethers; the plan then lists `arc-ethers.ts` as the resolver's signer with no nonce discipline across concurrent invocations — add durable nonce reservation or serialize resolver txs through the job lease.

**P2‑4.4 🟠 No event ingestion.** "Stakes, pools, outcome, `resolved` — Arc contract state, authoritative." How does Postgres learn a human staked? There is no `events.ts`, no cursor, no receipt intake. Minimal: the stake UI POSTs the tx hash to the app; the app reads the receipt and the contract's per‑market totals; a periodic (ticker‑driven) `eth_getLogs` over a bounded range catches anything missed. Plan 1 §12.7 is the spec.

**P2‑4.5 🟠 Missing‑day and freshness rules are named, not defined.** §5.15: "Missing rows must not become zero or false — a no‑activity day needs an explicit rule; a halted deployment voids." The rule must be in `spec.ts`: e.g., "if no `FinancialsDailySnapshot` with `timestamp ∈ [D, D+86400)` exists → `MISSING_OBSERVATION` → retry until `resolveDeadline` → VOID." And the freshness check must be `_meta.block.timestamp ≥ D+86400+margin`.

**P2‑4.6 🔴 Human staking path is absent.** The DoD says a stranger can stake; the tree has no `ui/wallets`, no Arc chain‑add, no client‑side contract call. Add MetaMask + `wallet_addEthereumChain` for 5042002 + an ethers `BrowserProvider` call to `stake(marketId, claimId)`; or narrow the DoD to agent‑only staking with a second Circle wallet as the "other participant" (weaker but coherent). Decide explicitly (see 0.2).

**P2‑4.7 🟡 "Seed pools" (Phase 5) is unfunded.** Who seeds, from which wallet, and is it disclosed on the board? If Circle analyst wallets seed, the parimutuel becomes house‑vs‑house; say so in the UI as Plan 1 §12.3 does.

**P2‑4.8 🟡 `resolve.ts` re‑query pinned to a block.** "Calls `querySubgraph()` — the same function that wrote the report." With `prune: auto`, the resolver cannot pass `block: {number}` for day D; it must select the snapshot row by timestamp at head and record `_meta`. The plan's §5.15 knows this; make `resolve.ts` say it.

---

## Part 3 — Claims I'd flag as optimistic or misleading

### Plan 1

- "Configure one production cron entry… `* * * * *`. Pro is intentional." — Not available to you; deploy fails.
- "Use EOA wallets initially" (Circle) — right choice, but the *address = msg.sender* dependency for `claimId` is unstated (P1‑4.1).
- "`@hashgraph/hedera-wallet-connect` or the compatible connector proven by SM‑09" — the only measured data says v2.1.2 fails under Node ESM; browser bundling under Next 16 is unmeasured. Treat SM‑09 as a real gate, not a formality.
- "Deploy our own compatible ATS testnet factory/resolver/facets" — stated as the default without the 111‑contract/29‑minute/partial‑failure reality attached to it in the same paragraph.
- "Verification must be submitted separately" — true, and no mechanism or tool is named (P1‑3.2).
- The unit sequence in §15.2 puts `3b` (refunds, proceeds, budgets, browser controls) before `4a/4b`. Given "market is core," that ordering is the optimistic part, not any single claim.

### Plan 2

- "Retry against the **other** Blocky402 host (testnet vs mainnet)" (R2‑A) — a network switch, not a retry.
- "`tx_jobs` + poll route (already baseline)" (R6) — nothing in the tree or text defines it.
- "Advanced by `/api/cron` (leased)" — daily on Hobby.
- "A stranger can commission, buy, stake, and see a resolution — no terminal" (DoD) — no human Hedera payment path and no human Arc staking path are designed.
- "`FAILED` jobs get an explicit refund path — a Hedera transfer from treasury, logged" — no treasury signer, no refund module, no HBAR budget for it.
- "Live: add a protocol via one config line" (G1.5) — true only for 3.1.0 `POOLED` deployments; for 2.0.1/3.0.1/CDP it's a config row plus adapter work. The plan elsewhere knows this (schemaVersion dispatch), so the demo line should be "add a *3.1.0* protocol via one config line."
- "Byte‑identical schema sha256" — aave‑v2/v3/spark; Spark is effectively unsignalled, so the demo protocols and the README hash may not be the same set. Use aave‑v2 + aave‑v3.
- "Only `DATA_ERROR` blocks a report" — fine, but "an incomplete population does not receive a clean reconciliation verdict" (R22) is also blocking; reconcile the two statements.
- "Score writes are separately idempotent on `(marketId, reportRef)`" — with off‑chain claims, `(marketId, reportRef)` is not unique if two authors cite the same report; with on‑chain claims it becomes `(marketId, claimId)`.

### Both

- "Hedera testnet Blocky402" — the two research notes disagree (spec note: mainnet‑only at its check; scaffold follow‑up: both hosts live). Plans took the later note. Verify `/supported` on both hosts on Day 1 and record the feePayers.
- Neither plan states the archive‑RPC requirement for pinned `eth_call` (P1‑0.4).
- Neither plan states the `initialize()` process‑exit behaviour (P1‑0.3).
- Both treat "Studio API key today" as trivial; it needs an EVM wallet signature to create and may need domain allowlisting for Vercel preview URLs.

---

## Part 4 — Synthesis

### The biggest risks common to both plans, in order

1. **Job progression without Pro cron.** Every durable‑workflow promise (report runs, payment reconciliation, ATS transfer after payment, Circle polling, resolution at deadline) rests on a ticker that doesn't exist on Hobby. External ticker + `advance` route is a small change with an outsized effect; do it in Phase 0.
2. **The human wallet surface.** A stranger needs up to three wallets across two chains: Hedera native (x402), EVM on Hedera testnet (ATS ownership), EVM on Arc (stakes). Plan 1 names all three and gates them with SM‑09; Plan 2 designs none. This is where the demo fails silently. Decide now what a human does on camera and what the agents do; narrowing "buy" to the agent path is legitimate under H1.3.
3. **ATS infrastructure provenance and verification.** Public testnet factory expires inside the window; own deploy is a 111‑contract Hardhat run from the upstream monorepo; HashScan verification needs a named tool and a named target contract (the per‑report `ResolverProxy`).
4. **Hedera settlement ambiguity.** `transaction: ""` on every failure. Decode the payload, persist the native ID before settle, check the mirror node before deciding. Plan 1 has it; Plan 2 must add it.
5. **The ~100–120‑minute common‑block window** for cross‑protocol pinning, and the archive‑RPC requirement for corroboration at that block. Both plans say "pin to a common block"; neither quantifies how narrow that is.
6. **Circle's async model and unknown `amount` scale** on Arc (native 18‑dp vs ERC‑20 6‑dp). Both plans gate it (SM‑08 / SM‑5); the polling state machine must be a job step, not a held‑open request.
7. **Money on Hedera mainnet**: no faucet, exchange KYC, USDC association on both sides, Blocky402 as the only facilitator and a hard liveness dependency. Both plans have a testnet fallback (H1 accepts testnet); make the switch a single config revision that changes facilitator URL, network string, token ID, and account IDs together, with a startup assertion on the feePayer.

### What one plan caught that the other missed

**Plan 1 caught, Plan 2 missed:** on‑chain author commitment with required stake and side derived from the claim; `voidMarket` and deadlines; recipient‑control proof before Own reservation; hash canonicalization and the ATS/hash circularity; ambiguous‑settlement recovery via native tx ID; Hedera SIWx needing a custom verifier; sessions/nonces as a real module; the three‑wallet browser reality; Arc event ingestion with cursors; per‑invocation step granularity; a complete data‑contract table; treating `isControllable`/admin trust as a disclosure.

**Plan 2 caught, Plan 1 missed or under‑weighted:** the `prune: never` fork risk that late `startBlock` yields empty Markets (SM‑7) — Plan 1 defers the fork without this reason; the current Vercel duration/bundle/cron numbers stated compactly with the Hobby caveat (Plan 1 states them but then assumes Pro); the explicit prize‑by‑prize cut order with what each cut sacrifices; the requirement nuance that G1.5 sits under qualification, not judging; "seed pools — parimutuel with two participants is invisible" as a demo concern; the U7 `mcp_toolset` question if discovery is ever built; the reminder that Start Fresh covers designs and assets.

### Recommended way to combine them

Use **Plan 1 as the technical specification** (module contracts, data contracts, state machines, contract interface, smokes SM‑01…SM‑09) with the corrections above — especially P1‑0.1 (ticker), P1‑3.1/3.2 (ATS provenance + verification), P1‑3.3 (wallet UX), and the reordering so 4a/4b precede 3b's non‑core ledgers. Keep **Plan 2's §3 traceability tables, §4 protection list, §9 risk‑branch format and §10 cut order** as the governance layer, updated with the Hobby constraint and the on‑chain claim design. Drop Plan 2's off‑chain claims, its `stake(marketId, side, reportRef)` interface, and its implicit paid‑commissioning unless you explicitly want the refund path.

On the question you called contentious: the report is tokenized on Hedera, the claim and the stakes live on Arc, and the report hash is the only thing that crosses. That is what both plans build, it is what the Arc prize requires, and it is the correct design. What neither plan makes visible enough is that this means a human participant touches two chains and three wallets — plan the demo around that fact rather than discovering it on camera.

# Research: x402 protocol spec (x402-foundation/x402)

**Repo:** https://github.com/x402-foundation/x402
**Reviewed at:** commit `5df361d591fd3df74eb363296347b2ed57e8f413` (2026-09-04, main, clean tree)
**Package versions in repo:** 2.25.0 — exactly what we're pinned to
**Live checks performed:** `GET api.blocky402.com/supported`, `GET x402.org/facilitator/supported`,
`GET x402.org/facilitator/discovery/resources`. Flagged inline where used.

---

## 1. What this repo is

All of it in one monorepo:

| Path | What it is |
|---|---|
| `specs/` | The normative spec. 44 files, ~16k lines. Core spec, 4 schemes × N network bindings, 9 extensions, 3 transports × 2 protocol versions |
| `typescript/packages/` | Reference TS SDK — **this is where `@x402/*` is published from** (one GH workflow per package) |
| `python/x402/`, `go/`, `java/` | Three more reference SDKs. Go and Python near-parity; Java newer, not in the parity matrix |
| `contracts/evm/` | Solidity: `x402ExactPermit2Proxy`, `x402UptoPermit2Proxy`, `x402BatchSettlement` + deposit collectors. Three Cantina audits in `contracts/evm/audits/` (Feb/Mar/May 2026) |
| `typescript/site/app/facilitator/` | The reference facilitator behind x402.org/facilitator. Three routes: verify, settle, supported |
| `docs/` | Published Mintlify docs (docs.x402.org) |
| `e2e/` | Cross-SDK harness, config per network incl. `e2e/config/mechanisms_hedera.json` |
| `examples/` | ~60 runnable examples across TS/Go/Python |

**Governance:** the x402 Foundation, Apache-2.0. Technical Charter PDF in `foundation/`. `TSC.md`
names three participating orgs: Coinbase (Erik Reppel), Cloudflare (Rohin Lohe), Stripe (Steve
Kaliski). Coinbase origin still visible — `SECURITY.md` routes vulns to Coinbase's HackerOne.
`CONTRIBUTING.md:3`: "Merging contributions is at the discretion of the x402 Foundation team."

**Spec vs package versioning — separate, and they don't track each other:**
- Protocol version is one integer on the wire: `x402Version: 2`. `specs/x402-specification-v2.md`
  history: v0.1 (2025-08-29) → v0.2 (2025-10-03) → **v2.0 (2025-12-09), unchanged since**.
- npm packages run their own semver train — `@x402/core` went 2.15.0 → 2.25.0 in 12 weeks. The
  leading `2` is a nod to protocol v2, not a coupling.
- Individual specs carry their own version tables (e.g. auth-capture is at v1.1, 2026-08-18).

---

## 2. Read these first

| # | File | Why | Time |
|---|---|---|---|
| 1 | `specs/x402-specification-v2.md` | **The heart.** Read §5 (Types), §6.1 (Payment Flow Models), §7 (Facilitator Interface) closely; skim §8–12. Everything else in the repo is a binding of this document | ~40 min |
| 2 | `specs/schemes/exact/scheme_exact.md` | 92 lines, dense and load-bearing. The two asset-transfer-method families and the MUSTs each satisfies. **Read "Payment Flow" twice — it contains the sentence that decides our architecture** | ~15 min |
| 3 | `specs/schemes/exact/scheme_exact_hedera.md` | 169 lines. Our exact wire format and every rule Blocky402 enforces. Note it says nothing about payment flows — that gap matters | ~15 min |
| 4 | `typescript/packages/core/src/server/paymentFlow.ts` | 175 lines. The only place the three flows are concrete: `PAYMENT_FLOWS` (18–35) is a literal phase table | ~10 min |
| 5 | `specs/transports-v2/http.md` | 192 lines, mostly base64 blobs you can skip. Read the Header Summary table and "Response Body" | ~8 min |

**Skip `ROADMAP.md`** — it contains the string `(update coming soon)` and nothing else.

---

## 3. The spec

**Location:** `specs/x402-specification-v2.md`, Protocol Version 2, dated 2025-12-09.
`specs/x402-specification-v1.md` kept alongside (v1 uses `X-PAYMENT`/`X-PAYMENT-RESPONSE` and
bare-string network names like `base-sepolia`; `PaymentRequiredSchema` is a discriminated union on
`x402Version`, so v1 is still parseable). RFC-2119 MUST/SHOULD/MAY.

### Corrections to our understanding of the flow

Our summary was accurate for the default path. Four things it missed:

**(a) `/verify` is not always in the flow.** §6.1 defines three orderings, only one calls verify:

| Flow | Ordering | Notes |
|---|---|---|
| `authorization` (default) | verify → resource → settle → respond | Funds move only after the handler succeeds |
| `upfront` | settle → resource → respond | **No `/verify` call at all.** Settle is the pre-resource check |
| `escrow` | settle → resource → settle → respond | Deposit, run, final charge |

Spec invariant: "at least one check — a verify or settle before the resource — MUST run before the
resource executes." Codified at `paymentFlow.ts:18-35`.

**(b) The 402 body carries nothing.** `specs/transports-v2/http.md` → "Response Body": "Response
bodies are a server implementation concern. All x402 protocol information is communicated through
headers." Examples show `{}`. Don't build a client that reads the body.

**(c) 402 is not the only status.** Invalid Payment → 400, Server Error → 500. In the TS
implementation there's a fourth: `x402HTTPResourceServer.ts:1303` returns **412 Precondition Failed**
when `paymentRequired.error === "permit2_allowance_required"`. EVM-only, but a generic client should
handle it.

**(d) A fourth channel we didn't know about.** §7.2.1 defines `EXTENSION-RESPONSES` — a base64 JSON
header on facilitator verify/settle responses, **server-internal, never forwarded to the buyer**.
`@x402/core` 2.25.0 surfaces it as `extensionResponses` (separate from `extensions`) and explicitly
strips it from the buyer-facing `PAYMENT-RESPONSE`.

Also: **`PaymentRequirements.amount` is phase-dependent for some schemes.** §7.2 — in `upto`, `amount`
means "maximum authorized" at verify time and "actual amount to settle" at settle time. Same field,
same type, different meaning per call.

### Required vs optional for a conforming resource server

**Required:**
- Emit `PAYMENT-REQUIRED` (base64 `PaymentRequired`) on 402. Fields: `x402Version` (must be 2),
  `resource` (with required `url`), `accepts[]` (each needs `scheme`, `network` in CAIP-2, `amount` in
  atomic units as a **string**, `asset`, `payTo`, `maxTimeoutSeconds`).
- Accept `PAYMENT-SIGNATURE` (base64 `PaymentPayload`).
- Return `PAYMENT-RESPONSE` (base64 `SettleResponse`) on success. `success`, `transaction`, `network`
  required; `transaction` may be `""` unless `errorReason` is `settlement_pending`.
- Run at least one pre-resource check (the §6.1 invariant).
- Reject unsupported `assetTransferMethod` / `paymentFlow` combinations.
- **If the resolved flow is not `authorization`, `accepts[].extra.paymentFlow` MUST be present** so
  the client can reason about pre-handler fund commitment. (Implemented: `applyPaymentFlowWireExtra`.)

**Optional:** `error`, `extensions`, `resource.description/mimeType/serviceName/tags/iconUrl`,
`SettleResponse.payer/amount/extensions`, **using a facilitator at all** (you may verify/settle
locally — `examples/typescript/servers/self-facilitation/`), the discovery API (§8), everything under
`specs/extensions/`.

**Client MUSTs worth knowing:** clients MUST NOT construct a payment for a `paymentFlow` they don't
recognize, SHOULD skip such `accepts[]` entries, and **SHOULD prefer `authorization` when a resource
offers both `authorization` and a pre-handler-settlement flow.** Extension echo: the client must
include at least the info received; may append but cannot delete or overwrite.

### Schemes

Two files per scheme: `scheme_<name>.md` + `scheme_<name>_<chain>.md` per binding. Process
(`specs/CONTRIBUTING.md`): issue/discussion → spec from template → PR. **No formal RFC numbering, no
proposal registry, no voting.** Merging is maintainer discretion.

**In the spec (4):** `exact`, `upto`, `auth-capture`, `batch-settlement`.

**Actually implemented:**

| Scheme | Networks with real impl | TS | Go | Py |
|---|---|---|---|---|
| `exact` | evm, svm, avm, stellar, aptos, **hedera**, tvm, keeta, near, ccd, xrpl | ✅ | evm/svm/tvm only | evm/svm/tvm only |
| `upto` | evm (permit2), svm (channel) | ✅ | ✅ | evm only |
| `batch-settlement` | evm (eip3009, permit2) | ✅ | ✅ | ✅ |
| `auth-capture` | evm | **client only** | client only | ❌ |

`auth-capture` has an 887-line EVM binding spec and **no server or facilitator implementation
anywhere**. Spec-only `exact` bindings with no code: canton, cardano, casper, starknet, sui. Same for
`scheme_batch_settlement_cloudflare.md` and `_svm.md` (1530 lines of spec, no SVM batch-settlement
code).

### Extensions

An extension is a keyed entry in `PaymentRequired.extensions` shaped `{ info, schema }` where `schema`
is a JSON Schema (Draft 2020-12) validating `info`. Server declares per-route → client echoes into
`PaymentPayload.extensions` → server validates the echo (mismatch = `extension_echo_mismatch`) →
optionally enriched into the settlement response. Four server hook points. Fields that change every
response (nonces, timestamps) go in `dynamicInfoFields` to exempt them from echo validation.

**Nine specs, seven implemented:**

| Extension | Spec | TS | Needs facilitator support? |
|---|---|---|---|
| bazaar | ✅ 599 ln | ✅ | **Yes** |
| builder-code | ✅ | ✅ | **Yes** (ERC-8021 calldata) |
| eip2612-gas-sponsoring | ✅ | ✅ | **Yes**, EVM-only |
| erc20-approval-gas-sponsoring | ✅ | ✅ | **Yes**, EVM-only |
| **payment-identifier** | ✅ | ✅ | **No** — server↔client |
| **sign-in-with-x** | ✅ | ✅ | **No** — "The Facilitator is not involved" |
| **offer-receipt** | ✅ 892 ln | ✅ (TS only) | **No** — server↔client |
| extension-auth-hints | ✅ 370 ln | ❌ not present | — |
| http-message-signatures | ✅ 128 ln | ❌ not present | — |

Third-party extensions (not in-repo, listed at `docs/dev-tools/third-party-extensions.md`): World
AgentKit, OMATrust, PEAC Protocol, **x402r (non-custodial refund and arbitration)**, zauth.

---

## 4. What's supported where

**Network families with a scheme implementation:** EVM (`eip155:*`), Solana, TON, Algorand, Stellar,
Aptos, **Hedera (`hedera:mainnet|testnet`)**, Keeta, NEAR, Concordium, XRPL.

### Scheme × flow × network

| Scheme / network | ATM key | Flows supported | Default |
|---|---|---|---|
| `exact` / **hedera** | default | `authorization`, `upfront` | authorization |
| `exact` / evm | eip3009, permit2 | `authorization`, `upfront` | authorization |
| `exact` / svm, aptos, avm, keeta, near, stellar, tvm, ccd | default | `authorization`, `upfront` | authorization |
| `exact` / xrpl | sequence, ticketSequence | `authorization`, `upfront` | authorization |
| `upto` / evm | permit2 | **authorization only** | — |
| `upto` / svm | channel | **escrow only** | escrow |
| `batch-settlement` / evm | eip3009, permit2 | authorization only | — |

**Assets on Hedera:** HBAR (`asset: "0.0.0"`, tinybars) or any HTS fungible token. Default-asset table
has exactly one entry per network — mainnet USDC `0.0.456858` / 6 decimals
(`mechanisms/hedera/src/constants.ts:35`), testnet `0.0.429274`. **Our price is the default asset, so
dollar-string pricing resolves correctly without a custom money parser.**

### Where Hedera sits — structurally below EVM

EVM has 4 schemes, 2 ATMs, audited contracts, 27 default-asset networks, gas-sponsoring extensions,
deployed proxies, 3-language coverage. **Hedera has 1 scheme, 1 ATM, 1 SDK (TypeScript only), no
contracts, no paywall UI.** First-class citizen of `exact` and nothing else.

**Community port, upstreamed, now core-maintained.** Initial impl 2026-02-06 (#792) and the
`@x402/hedera` package 2026-04-24 (#1360), both by Peter Swierzy. Since then every substantive Hedera
commit is by `phdargen` (the core maintainer who ships almost every release), incl. 2026-07-03
"Hardened Hedera facilitator verify" (#2707).

Evidence it's real: in the e2e harness (`e2e/config/mechanisms_hedera.json`, with both `/exact/hedera`
and `/exact/hedera/upfront` routes), live on x402.org facilitator, dedicated publish workflow.
Evidence it isn't: **`.github/CODEOWNERS` lists network maintainer teams for evm, svm, stellar, aptos,
avm — there is no `@x402-foundation/hedera` team.** Hedera files fall to `@x402-foundation/core`.

Practical read: nobody will break Hedera on purpose, but nobody is dedicated to advancing it either.

### 🚫 Arc — not present at all

Grepped `\barc\b` case-insensitively across `specs/ docs/ typescript/ go/ python/ examples/` for
`.ts .md .mdx .go .py .json` — **zero hits.** Not in the 27-entry EVM default-asset table, not in any
facilitator listing, not in the contracts deployment table.

**What x402-on-Arc would take.** Protocol side is trivial — "any EVM chain is supported via
`eip155:<chainId>`" and runtime registration needs no PR. The hard parts:

1. **No settlement path.** No public facilitator supports Arc. The realistic 9-day option is
   `examples/typescript/servers/self-facilitation/` — verify+settle in-process with our own hot key
   and gas.
2. **Contract prerequisites for Permit2 flows:** Permit2 at `0x000000000022D473030F116dDEE9F6B43aC78BA3`
   and the CREATE2 deployer at `0x4e59b44847b379578588920cA78FbF26c0B4956C` must both exist on-chain.
   If they do, anyone can deploy `x402ExactPermit2Proxy` to its canonical address with ~300k gas.
3. **The real blocker** — `exact`/EVM moves value via EIP-3009 `transferWithAuthorization` or Permit2,
   **both ERC-20 contract operations.** Arc uses USDC as the *native* gas token, and a native asset has
   no ERC-20 contract to call. If Arc doesn't also expose USDC as a standard ERC-20 (many chains with
   a native stable do expose a precompile/wrapper), no existing x402 EVM mechanism can move it and
   we'd be writing a new asset-transfer method. **Multi-week, not 9 days.**

> Reviewer's recommendation: treat "x402 on Arc" as out of scope. Keep Arc as pure
> settlement/prediction-market infrastructure with **no 402 gate on it**. Verify the ERC-20 question
> against Arc's own docs before assuming either way.

### Public facilitators

14 listed at `docs/dev-tools/facilitators.md` (doc says "not an exhaustive catalog"): Built on
Stellar, CDP (Coinbase, KYT/OFAC on every tx), Celo, Corbits, Dexter, Fireblocks, FTP Canton, HPP,
Meridian, Mogami, NEAR, PayAI, Polygon, Solvador, T54 XRPL.

**None of them list Hedera mainnet.**

Two checked live:

```
GET https://x402.org/facilitator/supported
  → exact on eip155:84532, solana devnet, algorand testnet, aptos:2,
    stellar:testnet, hedera:testnet (feePayer 0.0.9185802), xrpl:1
  → upto on eip155:84532 only
  → batch-settlement on eip155:84532 only
  → extensions: ["builder-code","eip2612GasSponsoring","erc20ApprovalGasSponsoring"]
  → testnet only, BY POLICY

GET https://api.blocky402.com/supported
  → kinds: [{ x402Version:2, scheme:"exact", network:"hedera:mainnet",
              extra:{ feePayer:"0.0.10571514" } }]
  → extensions: []
  → signers: { "hedera:*": ["0.0.10571514"] }
```

⚠️ **CORRECTED 2026-09-08 — this paragraph was wrong, and it is the sentence R12 rests on.**

It used to read: *"**Blocky402 does not support `hedera:testnet` — mainnet only.** Our testnet dev loop
has to run against `https://x402.org/facilitator` with a different feePayer. Four things swap together
at cutover. **Don't discover this on demo day.**"*

**Blocky402 supports `hedera:testnet` and always did.** Measured live in SM-05 on 2026-09-06:

```
GET https://api.testnet.blocky402.com/supported
  → kinds: [{ x402Version:2, scheme:"exact", network:"hedera:testnet",
              extra:{ feePayer:"0.0.7162784" } }]
```

**The error was reading one host as the vendor.** The block above queried `api.blocky402.com` — the
**mainnet** host — saw only `hedera:mainnet` advertised, and generalised. `api.testnet.blocky402.com`
is a different deployment with a different fee payer, and
`docs/research/scaffold-hbar-x402-followup.md` records both hosts correctly, so this repo held the
right answer and the wrong one at the same time.

**Why it was expensive to be wrong about.** H1.2 requires settlement through Blocky402 specifically,
and R12 — running x402 on testnet — rests entirely on Blocky402 supporting testnet. Taken at face
value, this note made R12 read as unavailable, leaving only mainnet HBAR: an exchange withdrawal
behind KYC, on an unknown clock, in front of a Phase 0 gate. **A single unverified sentence came close
to costing days of waiting for something we already had.**

**The rule this produced:** a capability claim about a vendor is a claim about a *host*, and a negative
result on one host is not a result about another. `/supported` is now step 1 of SM-05 and the script
refuses to continue if the answer changes. Written up in `tracking/lessons.md`, 2026-09-06.

⚠️ The **testnet → mainnet cutover is still atomic** and that part of the original warning stands:
facilitator URL, network string, asset id and the account pair move together or not at all (R12).
Per `DECISIONS.md` 2026-09-08 that cutover happens at the **end of Phase 4**, not before.

⚠️ **Blocky402 is not in `docs/dev-tools/facilitators.md`.** Grepped the entire repo for "blocky" —
zero hits. Not a red flag by itself (the list is explicitly non-exhaustive, anyone may run a
facilitator), but we get **zero vetting signal from the foundation**, and it's the only mainnet Hedera
option findable.

---

## 5. Roadmap and direction

**Public roadmap: effectively none.** `ROADMAP.md` reads, in full: `(update coming soon)`.

**RFC process: none.** `specs/CONTRIBUTING.md` prescribes issue → spec-from-template → PR.
`CONTRIBUTING.md:110` restricts GitHub issues to "bug reports and concrete feature proposals only"
and pushes everything else to Slack (slack.x402.org). No proposal numbers, no status tracking, no
public queue. **`git log` is the roadmap.**

`PROJECT-IDEAS.md` is a grants doc (micro-grants to $3k, "live on mainnet" required, contact
`@murrlincoln`) — and notably lists **"Wealth-Manager Trading Bot"** and **"Prediction-Market Oracle"**
as wanted projects. That's roughly our build.

### Last 3 months (2026-06-04 → 2026-09-04)

Eleven releases, `@x402/core` 2.15.0 → 2.25.0, roughly weekly. Themes:

- **Payment flows became a first-class protocol concept.** #3053 (08-08, TS) → #3115 (Go) → #3247
  (Python) → **#3240 upfront paymentflow for exact mechanism (08-25)** → #3145 spec (09-02).
  **The single biggest change of the quarter, and it directly affects us.**
- `upto` on Solana shipped (#3094, #3141) using Solana payment-channels, escrow flow. Delegated
  receiver-authorizer 09-04 (#3346/#3347).
- `spendControls` shipped across all three SDKs in one week (#3124 TS, #3154 Py, #3156 Go).
- `settlement_pending` + auto-recovery (#3083, #3214) — non-terminal settle error carrying the
  broadcast tx hash + a `PendingSettlementStore`. **EVM and SVM only.**
- auth-capture v1.1 spec (#3197) + client implementations (#3283) + canonical contract addresses
  (#3354). **Server side still absent.**
- **Five separate route-matching auth bypasses fixed in one quarter** — `%5C` backslash (#3116),
  percent-encoded line-terminator wildcard (#3036), `%2F`/`%5C` segment-boundary (2.13.0), Go `(?s)`
  wildcard (#3100), Python line-feed wildcard (#3055).
- Bazaar SSRF fix — external `$ref`/`$id` rejected (#3039).
- New networks/assets: Sei, Celo, Flare, Igra, Monad domain fixes.
- Spec-only proposals landing with no code: Canton, Starknet, Casper, SVM batch-settlement.

### `upto` on more networks?

**No signal.** And our framing needed a correction — `upto` is not one thing:

- **EVM** — permit2 ATM, `authorization` flow, `x402UptoPermit2Proxy` at
  `0x4020A4f3b7b90ccA423B9fabCc0CE57C6C240002`, deployed on Base Mainnet and Base Sepolia. The
  contract deploys deterministically to any EVM chain with Permit2 + the Arachnid deployer,
  permissionlessly, ~300k gas. **It isn't the contract that limits us — it's facilitators.** The
  public x402.org facilitator advertises `upto` on `eip155:84532` only (verified live), which is where
  our "Base Sepolia only" belief came from — correct about that facilitator.
- **SVM** — channel ATM, `escrow` flow, on the Solana Foundation payment-channels program. Different
  trust model (client escrows the ceiling on-chain first).

Nothing in the tree, the changesets (`typescript/.changeset/` empty except README+config;
`go/.changes/unreleased/` empty), or 3 months of commits points at `upto` on a non-EVM/non-SVM
network. **No path to `upto` on Hedera in 9 days, and none visible next quarter.**

### Bazaar — specified and implemented, but the reference deployment doesn't run it

- The in-repo reference facilitator has exactly three routes — verify, settle, supported. **No
  `/discovery/*`.** Cataloging is a comment: `verify/route.ts:51` — `// - Extract and catalog
  discovery info (onAfterVerify)`.
- `x402.org/facilitator/supported` does not list bazaar in extensions (verified live).
- `GET https://x402.org/facilitator/discovery/resources` **returns a 404 HTML page** (verified live) —
  even though `docs/extensions/bazaar.mdx:157-160` uses exactly that URL in its worked example.
- `bazaar.mdx:953` FAQ: catalog networks are "Base, Base Sepolia, Solana, and Solana Devnet with USDC
  payments." **Hedera is not one.**
- The spec hedges hard: cataloging is "an implementation detail of the facilitator operator, an
  external 3rd party service provider… outside the scope of the x402 open-source repository."

Not vestigial as a spec — it got real work this quarter (service metadata, SSRF hardening,
`routeTemplate`, MCP tool discovery, troubleshooting guide) — but **discovery is something third
parties run**, and the community directories the README points at (x402scan.com, agentic.market,
pay.sh, x402-list.com) are probably where discovery actually happens.

---

## 6. What we're locked out of

### a. Meter by work done? No — quote up front. And the "workaround" is an active footgun.

`upto` has no Hedera binding — only `scheme_upto_evm.md` and `scheme_upto_svm.md` exist, and
`@x402/hedera` ships `exact` and nothing else.

⚠️ **The footgun:** `setSettlementOverrides` is **not scheme-gated in code**. It's a plain HTTP header
(`SETTLEMENT_OVERRIDES_HEADER = "Settlement-Overrides"`, `x402HTTPResourceServer.ts:29`), read
generically at 823-836, applied by mutating `requirements.amount` before settle
(`x402ResourceServer.ts:1207-1229`). `@x402/next` re-exports it. **Nothing stops us calling it on a
Hedera exact route.**

How it fails: Blocky402's settle re-runs verify (`mechanisms/hedera/src/exact/facilitator/scheme.ts:236`),
computing `netToPayTo` from the client's already-signed `TransferTransaction` and comparing to
`requirements.amount`. Mismatch → `invalid_exact_hedera_payload_amount_mismatch` (line 541). **Report
generated, handler returned 200, settle fails. Free report.**

Real workarounds, in order of sanity:
1. **Quote deterministically.** Report cost is a function of protocol count / lookback / depth. Price
   from the request via `dynamicPrice` (`(context: HTTPRequestContext) => Price`,
   `x402HTTPResourceServer.ts:113-115,156`). **The intended answer, and it fits our product.**
2. **Tiered routes.** `/report/basic`, `/report/deep` at fixed prices.
3. **Two-phase.** A cheap `/estimate` returns a quote + job token; a second gated call at the quoted
   price. Two payments, both `exact`.

### b. Refunds? Settle is irreversible on Hedera.

`auth-capture` defines void/refund/reclaim — **EVM-only in spec, client-only in every SDK**. No server
or facilitator implementation to pair with those clients. **Not usable by anyone today, on any chain.**

`scheme_exact.md` says it plainly: under `upfront`, "a handler failure leaves the client charged with
nothing delivered; this specification defines no refund, and any remedy is the resource server's own
arrangement."

What we do get: under `authorization`, a handler that throws or returns ≥400 means settle never runs —
`onVerifiedPaymentCanceled` fires with `handler_threw` / `handler_failed`, buyer never charged.
**Failure-avoidance, not refund.** Real refunds = our own Hedera transfer out of the receiving
account, or a third-party layer like x402r.

### c. Discover a resource + price without a 402 round-trip? No.

Three independent blocks:
1. Bazaar cataloging requires facilitator support. Blocky402 advertises `extensions: []`. **Declaring
   bazaar on our route is a no-op.**
2. Cataloging happens only when a paying client echoes the extension in a *settled* PaymentPayload
   (`bazaar.mdx:891-895`). **Post-payment indexing, not pre-payment discovery**, even where it works.
3. Bazaar catalog networks are Base / Base Sepolia / Solana / Solana Devnet only. Hedera isn't one.

Only discovery is out-of-band: publish our own manifest/landing page, or list on a community
directory. **The 402 round-trip stays mandatory for machine-readable pricing.**

### d. Subscriptions / credits / prepaid balances? Not on Hedera.

The primitives exist and are all EVM/SVM:
- **Prepaid balance** = `batch-settlement`: deposit once into escrow, sign off-chain cumulative
  vouchers, redeem in batches. EVM only; contracts on
  Base/Arbitrum/World/Polygon/Optimism/Avalanche/Celo/Linea/Unichain/Monad. **Hedera has no x402
  contracts at all.**
- **Session/channel** = `upto`/SVM escrow channels. Solana only.
- **Recurring** = explicitly out of scope even for `upto`.
- Core spec §12.6 lists "Subscription models built on micropayments" as an advanced pattern you build
  yourself.

**The one thing we can have (and should): `sign-in-with-x`.** Server↔client, facilitator uninvolved.
CAIP-122 wallet signature over a server challenge in a `SIGN-IN-WITH-X` header, with server-side
storage of which addresses paid for what (`InMemorySIWxStorage` ships in the box). Gives us "buyer
paid for report #47 once, can re-fetch forever without repaying" and auth-only routes with
`accepts: []`. **Works on Hedera today.**

### e. Split a sale between the analyst and a cited source? No. Hard-blocked at the facilitator.

`PaymentRequirements.payTo` is a single string. `scheme_exact_hedera.md` §5 "Amount exactness": "No
additional positive net transfers to any other party (besides payTo) may exist for the specified
asset."

Enforced at `mechanisms/hedera/src/exact/facilitator/scheme.ts:548-556` — any positive receiver that
isn't `payTo` → `invalid_exact_hedera_payload_extra_positive_transfers`. **A single
TransferTransaction with two credit legs is rejected at verify. There is no scheme in x402, on any
network, that settles to multiple recipients.**

Options: (i) settle to a single agent-treasury account and do the split as a separate, unrelated
Hedera transfer in an `onAfterSettle` hook; (ii) `dynamicPayTo` — a `(context) => string` picking one
recipient per request, so we can route *whole* sales to different payees, just not split one.

### f. Other things unavailable on Hedera

| Capability | Why not |
|---|---|
| Gas sponsoring extensions | EVM-only. Moot anyway — the Hedera facilitator already sponsors network fees as `transactionId.accountId` |
| `builder-code` (ERC-8021 attribution) | Needs facilitator support; Blocky402 has none. Also an EVM concept |
| `settlement_pending` + auto-recovery | Scoped to "exact, upto, batch-settlement on both EVM and SVM (v2 only)". Hedera's settle catches every error and returns `transaction_failed`, `transaction: ""`. **No hash to reconcile with** |
| Duplicate-settlement cache | `SettlementCache` is SVM-only. Hedera relies on network-level transaction-ID uniqueness |
| `@x402/paywall` browser UI | Exports `evmPaywall`, `svmPaywall`, `avmPaywall`. **No Hedera.** A human hitting our gated route in a browser gets the static fallback, not wallet-connect. **Matters for a hackathon demo** |
| Go / Python / Java SDKs | Hedera is TypeScript only. Fine for us; blocks any non-TS buyer agent |
| `escrow` flow | Hedera declares `["authorization","upfront"]` only |
| CDP-style KYT/OFAC screening | No Hedera facilitator offers it |

---

## 7. Things we might be missing

Ranked by value per hour. **All work on Hedera because none touch the facilitator** — which is
precisely why Blocky402's `extensions: []` doesn't block them.

### 1. `offer-receipt` — signed offers and receipts. This is the one.

`specs/extensions/extension-offer-and-receipt.md` (892 lines),
`typescript/packages/extensions/src/offer-receipt/`.

Server signs the terms in the 402 (an **offer**), and after successful payment+delivery signs a
**receipt**. Two formats: EIP-712 or JWS-with-DID
(`createJWSOfferReceiptIssuer("did:web:api.example.com#key-1", signer)`). The README names our exact
use case: **"Agent memory: AI agents can prove past interactions with services"**, plus
verified-purchase attestations, audit trails, dispute evidence.

For "AI agents buying and selling financial reports from each other," a signed receipt is what makes a
purchase **portable** — a buyer agent can prove to a third party that it bought report #47 at that
price, without either party trusting the other. **It's the reputation substrate the premise needs.**

Hedera: works. Network-agnostic — the EIP-712 domain hardcodes `chainId: 1` deliberately "so EIP-712
signing works uniformly regardless of the payment network (including non-EVM networks like Solana)."
**Cost: ~1–2 hours.** `.registerExtension(createOfferReceiptExtension(issuer))` + one key +
`declareOfferReceipt()` in the route config. TypeScript only — which we are.
⚠️ Caveat: §2 says "Wire shape and field placement are not considered stable and may change."
Behavioral requirements are stable; serialization may move. Acceptable for a hackathon.

### 2. `payment-identifier` — idempotency.

Client generates `pay_7d5d747b…`, server caches the response keyed by it with a TTL. Retries with the
same ID return the cached response without re-processing payment. Listed use cases: network failures,
client crashes, load balancing, **testing without spending funds**.

For an autonomous buyer agent on a flaky connection, this is the difference between "retry" and "paid
twice." And on Hedera it's more than convenience — because Hedera settle gives no reconcilable state
on timeout (§8), **idempotency here is our cleanest defense.**

Hedera: works. **Cost: ~1 hour, both sides.** Also lets us replay requests in dev without burning
mainnet USDC — worth it for that alone.

### 3. `sign-in-with-x` — repeat access without repayment.

Covered in §6d. Buyer signs a CAIP-122 challenge, server checks its own record of who paid for what,
serves without a new payment. Also supports auth-only routes (`accepts: []`).

Hedera: works — CAIP-122 is chain-agnostic. ⚠️ The shipped signature verifiers are `evm.ts` and
`solana.ts` — **no Hedera signer found**, so we'd verify the Hedera account key ourselves (we already
have `AccountInfoQuery` via `@x402/hedera`'s re-exports). **Cost: ~half a day** including the Hedera
verifier. Note the 2026-08-13 breaking change (#3133): `createSIWxPayload` now requires a third
`requestUrl` argument and refuses to sign on origin mismatch.

### 4. MCP as a second transport — sell the report as a paid tool.

`specs/transports-v2/mcp.md`, `typescript/packages/mcp/` (`@x402/mcp` 2.25.0). An unpaid tool call
returns `isError: true` + `PaymentRequired` in `structuredContent`; the client retries with payment in
`_meta["x402/payment"]`; settlement comes back in `_meta["x402/payment-response"]`. Client side
auto-pays. Full hook parity with HTTP; `spendControls` forwards through.

For "agents buying from each other," **MCP is the more natural surface than raw HTTP** — a buyer agent
discovers our tool schema and calls it. The x402 core is transport-agnostic, so the same
`x402ResourceServer` + `ExactHederaScheme` serves both. **Cost: ~half a day** on top of the HTTP server.

### 5. `dynamicPrice` / `dynamicPayTo`.

`x402HTTPResourceServer.ts:110-115`. `payTo` and `price` accept functions of request context, not just
constants. **Our answer to (6a)** — price the 402 from the request shape before doing any work.
**Cost: ~30 minutes.**

### 6. `onProtectedRequest` and the verify/settle hook surface.

`docs/advanced-concepts/lifecycle-hooks.mdx`. `onAfterVerify` can return
`{ skipHandler: true, response }` — settle and return a canned response without running the handler.
`onBeforeSettle` can return `{ abort: true }` or `{ skip: true, result }`. `onSettleFailure` can
return `{ recovered: true, result }`.

**The cache-hit path is genuinely useful:** if today's report for protocol X already exists,
`skipHandler` serves it from storage while still charging. **Cost: ~1 hour.**

### 7. Client `spendControls` on our buyer agent.

`core/src/client/x402Client.ts:155-193`. Default-on: only assets `findDefaultAsset` recognizes are
allowed, capped at $1 per payment. Our price sits under that, so it works untouched — **but if we ever
price above $1, or accept a non-default HTS token, our own agent will silently refuse to pay.**
Configure explicitly rather than inheriting the default.

### Deliberately not recommended

bazaar (facilitator won't catalog, Hedera isn't a catalog network), builder-code (needs facilitator),
gas sponsoring (EVM-only, redundant on Hedera), batch-settlement / upto / auth-capture (not on
Hedera), A2A transport (spec exists at `specs/transports-v2/a2a.md`, no implementation in this repo).

---

## 8. Gotchas

### Spec / implementation drift

**1. ⚠️ `maxTimeoutSeconds` does not bound the Hedera transaction's validity — the real bound is ~2
minutes.** (The one that will bite us.)

`mechanisms/hedera/src/signer.ts:209-213`:
```ts
tx.setTransactionId(TransactionId.generate(AccountId.fromString(feePayer)));
const client = createHederaClient(configuredNetwork, config.nodeUrl);
tx.freezeWith(client);
```
`transactionValidDuration` is **never set** — so it's the Hiero SDK default (**120 s**). Meanwhile
`maxTimeoutSeconds` appears exactly once in the whole package (`facilitator/scheme.ts:420`) as an
equality check between `payload.accepted` and `requirements`. **It is echo-matching metadata, nothing
more.** The Hedera spec's own example advertises `maxTimeoutSeconds: 180` — the client will happily
echo 180 while signing a transaction that dies at ~120.

Consequence under `authorization`: verify → agent generates report → settle. **If generation takes
longer than the remaining validity window, settle fails at consensus and we've already delivered.**
`@x402/hedera` has no protection against this.

**2. Hedera settle returns nothing to reconcile with.** `facilitator/scheme.ts:257-273` is a bare
try/catch around `signAndSubmitTransaction`; **every** failure — including an RPC timeout waiting for
the receipt — becomes `{ success: false, errorReason: "transaction_failed", transaction: "" }`. The
`settlement_pending` protocol state (spec §9: "MUST carry a non-empty transaction … so the caller can
reconcile on chain") and the `PendingSettlementStore` auto-recovery are **not implemented for Hedera**.

**A Blocky402 timeout is genuinely ambiguous — the transfer may or may not have landed.**
Mitigation, ~1 hour: the `PaymentPayload.payload.transaction` we already hold is the base64
`TransferTransaction`. Decode with `Transaction.fromBytes` (re-exported from `@x402/hedera`), pull the
`transactionId`, and query the Mirror Node (`https://mainnet-public.mirrornode.hedera.com`, constant
at `mechanisms/hedera/src/constants.ts:14`) on any `transaction_failed`. **Do this before deciding
whether to deliver.**

**3. `docs/schemes/overview.mdx:63` is wrong.** "The upto and batch-settlement schemes support
authorization only." False for SVM upto — it declares `channel: { supported: ["escrow"], default:
"escrow" }`.

**4. The Hedera spec permits a fee split the reference facilitator rejects.**
`scheme_exact_hedera.md` §2: "The feePayer MAY appear as a positive entry … for example when
collecting fees or custom fee distributions." But `facilitator/scheme.ts:548-556` rejects **any**
positive receiver other than `payTo`, including the feePayer. Spec-legal, implementation-impossible.

**5. `scheme_exact_hedera.md` is silent on payment flows entirely.** No mention of `paymentFlow`,
`upfront`, or `authorization` anywhere in the file. The `upfront` support is implementation-only plus
prose in `docs/schemes/exact.mdx:132-224`. **The normative spec hasn't caught up.**

**6. `docs/extensions/bazaar.mdx:157-160`** points a bazaar client at `https://x402.org/facilitator`.
That host 404s on `/discovery/resources` (verified) and doesn't advertise bazaar.

**7. Settlement overrides aren't gated to schemes that support them.** A doc comment is the only
guardrail.

### ⚠️ Version churn — a fast-moving target

`@x402/core` by release date: 2.15.0 (06-12) → … → 2.25.0 (09-04). **Eleven minors in twelve weeks.**

Worse than the cadence: **breaking changes ship in minors.** The 2.25.0 changelog for #3051 says so
in its own words — "This is a breaking change. A call that previously resolved with `[]` now rejects."
2.23.0 renamed `DEFAULT_STABLECOINS`/`USDC_CONFIG`/`DEFAULT_ASSET_BY_NETWORK` → `DEFAULT_ASSETS` and
`address`/`asaId` → `asset`. 2.23.0 added a required third argument to `createSIWxPayload`. 2.22.0
made `paymentFlows` + `defaultAssetTransferMethod` mandatory on every `SchemeNetworkServer`.

**Pin exact versions (no `^`, no `~`)** across `@x402/core`, `@x402/hedera`, `@x402/next`,
`@x402/extensions`, and commit the lockfile. **All four must move together** — `@x402/hedera` declares
`"@x402/core": "workspace:~"` and the repo releases every package in lockstep at the same version
number. Mixing 2.25.0 with 2.24.0 is untested.

⚠️ **Import Hedera SDK types from `@x402/hedera`, never from `@hiero-ledger/sdk`.**
`mechanisms/hedera/src/index.ts` re-exports `Client`, `AccountId`, `TransferTransaction`,
`PrivateKey` etc. with this comment:

> "Importing `@hiero-ledger/sdk` directly alongside this package in workspaces with independent pnpm
> stores yields duplicate installs whose `instanceof` and string-brand checks cross-fail at runtime
> (`"t.startsWith is not a function"`)."

That error is what we'd get on Vercel otherwise, and it looks like nonsense.

### Mainnet vs testnet

- **x402.org/facilitator is testnet-only by policy**, stated in three places: "Do not assume the
  public x402.org facilitator is the default production path."
- **Blocky402 is mainnet-only.** So dev and prod facilitators are *different services with different
  feePayers*. Four things change together at cutover: facilitator URL, network
  (`hedera:testnet`→`hedera:mainnet`), USDC token id (`0.0.429274`→`0.0.456858`), and the
  `extra.feePayer` we advertise (`0.0.9185802`→`0.0.10571514`). **The feePayer is auto-merged from
  `/supported`, so don't hardcode it — but verify at startup that we got the one we expect.**
- `x402ResourceServer.initialize()` now **exits the process** on a permanent capability/route-config
  mismatch (2.25.0, #3346). Good — but on Vercel that means a **cold-start crash loop** if Blocky402
  is unreachable or the network string is wrong. Transient timeouts stay retryable.
- **`payTo` must be a real Hedera account associated with USDC.** Default `aliasPolicy` is `"reject"` —
  an alias-form `payTo` is rejected outright. And `createHederaPreflightTransfer` fails verify with
  `pay_to_not_associated` if the receiving account isn't associated with `0.0.456858` and has no free
  auto-association slot. **Associate the treasury account with USDC before anything else.**
- Testnet is cheap: `e2e/config/mechanisms_hedera.json` prices at 100000 tinybars of HBAR.

### Trust model — read before real money

**What Blocky402 can do to us:**
- **Censor.** Our client's transaction is partially signed and cannot reach consensus without the
  facilitator's fee-payer signature. If Blocky402 declines to sign, no payment happens. **A hard
  liveness dependency and a single point of failure with no fallback** — no other facilitator serves
  Hedera mainnet.
- **Lie about verify.** `/verify` is advisory. A facilitator returning `isValid: true` for garbage
  gets us to do the work for free. We only find out at settle.
- **See everything.** Full `PaymentPayload` + `PaymentRequirements` including our `resource.url`,
  description, and pricing on every call.

**What it cannot do:**
- **Redirect funds.** `payTo` and `amount` are inside the transaction body the client signed. Changing
  either invalidates the payer's signature; Hedera rejects it.
- **Drain itself or us.** Fee-payer safety rules enforced at `facilitator/scheme.ts:530-540`.

**Regardless:**
- Blocky402 is not listed in the foundation's facilitator directory and appears nowhere in this repo.
  **Zero vetting signal.** Anyone can run a facilitator — by design — but we're trusting an unlisted
  operator with mainnet liveness.
- **No KYT/OFAC screening.** Taking payments from arbitrary addresses with no compliance layer.
- **Hot key in Vercel env.** Cap exposure with `spendControls` on the client, and **use a separate
  account from the treasury `payTo`**.
- The three Cantina audits cover EVM contracts only. **Nothing on Hedera has been audited** — but
  equally, there's nothing to audit.

---

## 9. Five things to internalise

**1. `exact` on Hedera is our entire protocol surface.** One scheme, one asset-transfer method, one
flow choice. No metering, no refunds, no splits, no credits, no discovery. Everything x402 offers
beyond "quote a number, collect it once" lives on EVM or SVM. **Stop looking for a Hedera workaround
for `upto`.** Use `dynamicPrice` to make the quote smart instead.

**2. The facilitator is a hard liveness dependency with exactly one provider.** Blocky402 is the only
mainnet Hedera facilitator findable, isn't in the repo's directory, and doesn't serve testnet. **Have
a story for "Blocky402 is down during the demo."** Realistically that story is
`examples/typescript/servers/self-facilitation/` — we already have a Hedera key server-side,
`@x402/hedera` exports `ExactHederaScheme` from `./exact/facilitator`, and standing up a local
fallback is a few hours. **Build it before we need it.**

**3. Extensions marked "facilitator" are dead to us; extensions marked "server↔client" are free.**
`extensions: []` reads like a total lockout. It isn't. `offer-receipt`, `payment-identifier`, and
`sign-in-with-x` never touch the facilitator and all work on Hedera today. **Those three are most of
what the "agents trading reports" premise actually needs, and none are in the current plan.**

**4. Settlement failure on Hedera is silent and unreconcilable by default.** Decode the tx id from the
payload and check the Mirror Node before deciding a payment failed. And **use `withX402`, not
`paymentProxy`**, for the report route — the README is explicit that `withX402` "guarantees that
payment settlement only occurs after the handler returns a successful response (status < 400)", while
`paymentProxy` "will charge clients for failed API responses."

**5. Pin exact versions, all four packages together, import Hedera types from `@x402/hedera`.**

---

## The one design change the spec suggests

> **Use `extra: { paymentFlow: "upfront" }` on the report route. Do not use the default
> `authorization` flow.**

`specs/schemes/exact/scheme_exact.md`, "Payment Flow", last sentence:

> "A method whose validity window or replay primitive bounds how long a handler may take SHOULD offer
> `upfront` for handlers that can exceed that bound."

**Hedera has exactly that bound, and `@x402/hedera` doesn't manage it.** `signer.ts:209-213` freezes
the transaction without setting `transactionValidDuration` — Hiero's default is 120 s from
`TransactionId.generate`. Under `authorization` the ordering is verify → LLM writes a financial report
against Graph data → settle. **If that handler runs past the window, settle fails at consensus, we've
already returned the report, and we may not even get a tx hash telling us what happened.** An AI
analyst generating a multi-protocol DeFi report is exactly the handler that blows a two-minute budget.

Under `upfront` the ordering is settle → handler → respond. `/verify` is skipped entirely; settle is
the check. The payment commits against a fresh transaction, then we take as long as we like.

**The cost is real and must be priced in:** under `upfront`, a handler failure means the buyer is
charged with nothing delivered, and "this specification defines no refund." We own that remedy.

⚠️ The spec also says clients SHOULD prefer `authorization` when a server offers both — **so if we
list both, well-behaved buyer agents will pick the one that breaks.** Offer `upfront` alone on the
slow route. Because `upfront` ≠ `authorization`, the SDK automatically puts
`extra.paymentFlow: "upfront"` on the wire so buyers know what they're committing to before signing.

**Mitigations that make `upfront` safe enough:**
- Wrap the handler so any failure returns a cached/degraded report rather than a 500. We've been paid;
  deliver something.
- Add `payment-identifier` so a buyer's retry after a network blip returns the cached response instead
  of paying again.
- Add `offer-receipt` so the buyer holds a signed receipt for the charge either way.

Hedera's `upfront` support is real and tested — `e2e/config/mechanisms_hedera.json` ships a dedicated
`/exact/hedera/upfront` route in the cross-SDK harness, and `@x402/next` handles the before-handler
settle path in both `withX402` and `paymentProxy`. **It landed 2026-08-25 (#3240), ten days before the
reviewed commit. We have it.**

---

## Questions closed

| Question | Answer |
|---|---|
| Was our understanding of the flow right? | Yes for the default path. Missed: verify is skipped in `upfront`, the 402 body carries nothing, 412 exists, and `EXTENSION-RESPONSES` is a fourth channel |
| Is `upto` coming to Hedera? | No signal. Nothing in tree, changesets, or 3 months of commits |
| Can we meter by work done? | No. Quote up front via `dynamicPrice`. `setSettlementOverrides` on `exact` silently breaks settle |
| Can we do refunds? | No. `auth-capture` is client-only everywhere, unusable by anyone today |
| Can buyers discover price without a 402? | No — three independent blocks |
| Can we split a sale between recipients? | **No scheme on any network settles to multiple recipients** |
| Is bazaar worth using? | No — Blocky402 won't catalog, Hedera isn't a catalog network |
| Is x402 on Arc feasible? | No — no facilitator, and USDC-as-native-gas may have no ERC-20 to call. Treat as out of scope |
| Is Hedera first-class? | First-class for `exact`, nothing else. No CODEOWNERS team |

## Still open

- Whether to verify Arc exposes USDC as a standard ERC-20 (decides if x402-on-Arc is ever viable)
- Whether to build the self-facilitation fallback before the demo (reviewer says yes, few hours)
- Whether to adopt `offer-receipt` / `payment-identifier` / `sign-in-with-x` — none are in the current
  plan and all three fit the premise
- Whether to expose the report as an MCP tool as a second transport
- Whether `upfront` + degraded-response-on-failure is acceptable, or whether the two-endpoint split
  from the earlier note handles the timeout problem better
- Blocky402's rate limits, terms, and who operates it — still unknown

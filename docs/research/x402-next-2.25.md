# Research: @x402/next@2.25.0 and the settle-phase machinery

**Scope:** the published 2.25.0 packages, with measurements from a running Next 15 app
**Reviewed:** Sept 4, 2026
**Published:** `@x402/next@2.25.0` shipped 2026-09-04 — **one day old at time of review**

This note supersedes an earlier recommendation to "target `@x402/next@2.25.0` from the start."
See [Corrections](#corrections) at the bottom.

---

## 1. Next 15 compatibility — unsupported, but works

```
peerDependencies: { "next": ">=16.2.6", "@x402/paywall": "^2.25.0" (optional) }
```

`npm i @x402/next@2.25.0` against Next 15 hard-fails with `ERESOLVE`. All 27 published versions
checked from the raw registry: the very first (2.0.0, 2025-12-11) already required `^16.0.7`.
**No version has ever allowed Next 15.**

The reason is structural — Next 16 renamed `middleware.ts` → `proxy.ts`, and the README's canonical
example is `export const proxy = paymentProxy(...)` in `proxy.ts`.

**But it runs.** Installed with `--legacy-peer-deps` on Next 15.5.25 + React 19.2.8. The only Next
API it touches is `NextRequest`/`NextResponse` from `next/server` (`dist/esm/index.js:9,12`) — stable
in 15. All three gating patterns produced valid 402s and settled payments. Usable-but-unsupported.

**Second friction point:** `next dev` shells out to plain `npm install` to add TypeScript deps, and
that fails with the same `ERESOLVE`. Pre-install TS manually.

For Vercel builds: `.npmrc` with `legacy-peer-deps=true`.

### Public API

From `package/dist/esm/index.d.ts` (256 lines):

| Export | What it is |
|---|---|
| `withX402(handler, routes, server, paywallConfig?, paywall?, syncFacilitatorOnStart?)` | App Router route-handler wrapper |
| `withX402FromHTTPServer(handler, httpServer, ...)` | Same, with a pre-built `x402HTTPResourceServer` (for hooks) |
| `paymentProxy(routes, server, ...)` | middleware/proxy gate |
| `paymentProxyFromHTTPServer` / `paymentProxyFromConfig` | Variants |
| `setSettlementOverrides(res, overrides)` | Partial-settlement header helper |
| `NextAdapter` | The `HTTPAdapter` implementation |
| re-exports | `x402ResourceServer`, `x402HTTPResourceServer`, `RouteConfigurationError`, `SettlementOverrides`, types |

**Declarative, like `@x402/express` — not the manual pattern.** `NextAdapter` is the
`makeHttpContext` that scaffold-hbar hand-rolls, written and maintained for us.

### Minimal working example (verbatim, ran on Next 15)

```ts
// lib/x402.ts
import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import { ExactHederaScheme } from "@x402/hedera/exact/server";

export const server = new x402ResourceServer(
  new HTTPFacilitatorClient({ url: "https://api.blocky402.com" }),
).register("hedera:mainnet", new ExactHederaScheme({}));
```

```ts
// app/api/report/route.ts
import { NextRequest, NextResponse } from "next/server";
import { withX402 } from "@x402/next";
import { server } from "../../../lib/x402";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handler = async (_req: NextRequest) => NextResponse.json({ report: "..." });

export const POST = withX402(handler, {
  "/api/report": {
    accepts: [{ scheme: "exact", price: "$0.001", network: "hedera:mainnet", payTo: "0.0.999" }],
    description: "DeFi lending protocol report",
    mimeType: "application/json",
  },
}, server);
```

Captured challenge from that route on Next 15:

```json
{"x402Version":2,"error":"Payment required",
 "resource":{"url":"http://localhost:4055/api/report-auth","mimeType":"text/event-stream"},
 "accepts":[{"scheme":"exact","network":"hedera:mainnet","amount":"1000","asset":"0.0.456858",
             "payTo":"0.0.999","maxTimeoutSeconds":300,"extra":{"feePayer":"0.0.10571514"}}]}
```

**Runtime:** the package documents nothing. `@x402/hedera/exact/server` transitively imports
`@hiero-ledger/sdk` (`AccountId`, `Transaction`, `TransferTransaction` via `chunk-UMKVEPVT.mjs`) —
but **not `Client`, so no gRPC**. Middleware compiled and ran on Next 15's default Edge runtime.
Still set `runtime = "nodejs"` explicitly on route handlers rather than depend on tree-shaking holding.

### Adapter vs. scaffold-hbar's manual pattern

**Use the adapter**, with the endpoint split below. The hand-rolled `makeHttpContext` buys nothing
`NextAdapter` doesn't already do.

The manual pattern's one genuine advantage: **no `next` peer dependency at all** (only needs
`@x402/core`), so it sidesteps the Next 15 problem entirely. That's the fallback if
`--legacy-peer-deps` is unacceptable.

---

## 2. Settle phases — and the streaming result

### It's a property of the scheme, not a route knob

```ts
type PaymentFlowName = "authorization" | "upfront" | "escrow";
interface PaymentFlowPhases {
  verifyBeforeHandler: boolean; settleBeforeHandler: boolean; settleAfterHandler: boolean;
}
```

Selected via `accepts[].extra.paymentFlow`. The scheme declares what it allows —
`@x402/hedera@2.25.0`, `dist/esm/exact/server/index.mjs:22-24`:

```js
this.paymentFlows = {
  default: { supported: ["authorization", "upfront"], default: "authorization" }
};
```

`upfront` is supported on Hedera. **Absent from 2.18 entirely** (`grep -c paymentFlows` on 2.18's
`exact/server/index.mjs` → 0).

Route validation is startup-time — an unsupported flow throws `RouteConfigurationError`.

Useful: the facilitator capability check only verifies `(network, scheme)`, **not the flow**
(`core/chunk-RAWLCYSQ.mjs:3033-3047`), so `upfront` works against hosted Blocky402 without the
facilitator knowing anything about it.

### `settleBeforeHandler` fires — confirmed

`handleSettlement(..., beforeHandlerSettlement)` at `dist/esm/index.js:196`, threaded from
`result.beforeHandlerSettlement` at lines 333, 421, 427, 446. In the test run the `upfront` route's
`/settle` landed at `01:10:51.182` and the handler's first chunk at ≈`01:10:51.506` — settlement
completed ~320ms before any work.

### ⚠️ But it does NOT give streaming

`withX402` calls `handleSettlement` unconditionally, and `handleSettlement` does
`Buffer.from(await response.clone().arrayBuffer())` (`index.js:217`) — **draining the stream
regardless of flow.**

Measured, handler emitting 3 chunks 700ms apart:

| Pattern | First byte | Frames received |
|---|---|---|
| `withX402` + `authorization` (default) | t+4370ms | 1 (everything at once) |
| `withX402` + `upfront` | t+2905ms | 1 (everything at once) |
| **`paymentProxy` in `middleware.ts`** | **t+409ms** | **4 — at 410 / 1106 / 1808 / 2509ms** |

```
##### C. paymentProxy in middleware.ts #####
[client] status 200  HEADERS at t+409ms
[client] frame 1 at t+ 410ms : "data: mw-chunk1 ...
[client] frame 2 at t+1106ms : "data: mw-chunk2 ...
[client] frame 3 at t+1808ms : "data: mw-chunk3 ...
[client] frame 4 at t+2509ms : "data: [DONE]\n\n"
```

The middleware path streams because `paymentProxy` settles against `NextResponse.next()`
(`index.js:324`) — an empty sentinel with no body, so `arrayBuffer()` returns instantly, and the
route handler's stream never passes through x402 code at all.

### Failure semantics — both proven

| Pattern | Handler throws after payment | Charged? |
|---|---|---|
| `withX402` + `authorization` | `/verify` called, `/settle` never called, 500, no `PAYMENT-RESPONSE` | **No** — auto-cancelled |
| `paymentProxy` middleware | `/verify` + `/settle` both already done, then 500, client gets `PAYMENT-RESPONSE: {success:true,...}` | **Yes** — money moved, no report |

README says it outright: "API routes can also be protected by `paymentProxy`, however this will
charge clients for failed API responses." **There is no refund primitive anywhere.** With `upfront`
or middleware, we own it entirely.

### The recommended pattern — split the endpoint

1. **`POST /api/reports`** — gated with `withX402`, default `authorization` flow. Does the cheap work
   only: validate the request, reserve a job, return `{ jobId }`. Small JSON, so buffering is
   irrelevant. **Keeps cancel-on-failure** — if the job can't be accepted, nobody is charged.
2. **`GET /api/reports/[id]/stream`** — ungated, authorized by the job id. Streams the report freely
   with zero x402 code in the path.

Fast first byte, no-charge-on-failure, official adapter, no hand-rolling. Costs one extra round trip.

---

## 3. SpendControls

**Client-side, before signing.** `x402Client.applySpendControls`
(`@x402/core/dist/esm/client/index.mjs:452`), called from `createPaymentPayload` at line 424 — filters
the `accepts[]` array before the scheme builds or signs anything, and before our policies run. If
nothing survives, it throws. **Nothing server-side.**

```ts
interface SpendControls {
  maxAmountPerPayment?: Money | false;      // default "$1"
  allowedAssets?: true | SpendControlAsset[];
}
interface SpendControlAsset {
  network: Network;
  asset: string;                            // asset id or default-asset symbol ("USDC")
  maxAmountPerPayment?: string;             // integer ATOMIC units — NOT "$1"
}
// spendControls: false  disables everything
```

### It does not convert. On HBAR it rejects outright.

The USD cap is `convertToTokenAmount(parseMoney(usdLimit).amount, defaultAsset.decimals)` — naive
decimal scaling assuming a $1-pegged asset. **No oracle.** And it only applies to assets in the
scheme's default table, which for `@x402/hedera@2.25.0` (`chunk-X5J2I56W.mjs:10-17`) is USDC only:

```js
var DEFAULT_ASSETS = {
  "hedera:mainnet": [{ asset: "0.0.456858", decimals: 6, symbol: "USDC" }],
  "hedera:testnet": [{ asset: "0.0.429274", decimals: 6, symbol: "USDC" }],
};
```

HBAR (`0.0.0`) isn't in it, so it's rejected at the allowlist stage before any cap logic. Measured:

```
--- DEFAULT spend controls ---
PASS  USDC 0.001 (amount 1000)
FAIL  HBAR 0.001 (asset 0.0.0)  -> only default assets or entries in spendControls.allowedAssets allowed
--- vs the $1 cap ---
FAIL  USDC $2.00 (2000000)      -> rejected by spendControls.maxAmountPerPayment ($1)
PASS  USDC $0.99 (990000)
--- HBAR escape hatches ---
PASS  HBAR + allowedAssets:[{network:'hedera:mainnet',asset:'0.0.0'}]   (uncapped)
FAIL  HBAR + allowedAssets cap '50000' (req 100000)
PASS  HBAR + allowedAssets: true
PASS  HBAR + spendControls: false
```

### Per-payment only — not enough for an autonomous agent

No cumulative, session, or daily caps. Grepped
`cumulative|dailyLimit|perDay|sessionLimit|totalSpent|budget` across the client: nothing.

It stops one catastrophic payment. It does nothing about a retry loop paying $0.99 a thousand times.

**Still need our own layer:** a counter in Postgres/KV keyed by day and agent, checked before the call
and incremented from the **actual settled amount in the `PAYMENT-RESPONSE` header** — not a hardcoded
constant, which was the inference PoC's mistake. Estimated an afternoon.

---

## 4. 2.18.0 → 2.25.0 — nothing breaks

API surface is **purely additive**.

| Diff | Exports before | after | Removed | Added |
|---|---|---|---|---|
| `@x402/core` 2.18 → 2.25 | 112 | 128 | 0 | 16 |
| `@x402/core` 2.14 → 2.25 | 111 | 128 | 0 | 17 |
| `@x402/hedera` 2.18 → 2.25 | 44 | 47 | 0 | 3 |

Added in core: `CompletedSettlement`, `DEFAULT_MAX_AMOUNT_PER_PAYMENT`, `DefaultAsset`,
`DefaultAssetTable`, `FacilitatorCapabilityError`, `FacilitatorTimeoutError`, `FindDefaultAsset`,
`GetDefaultAsset`, `PAYMENT_REQUIRED_CACHE_CONTROL`, `PaymentFlowConfig`, `PaymentFlowName`,
`PaymentFlowPhases`, `SettlePhase`, `SpendControlAsset`, `SpendControls`, `withPrivateCacheControl`.
In hedera: `DEFAULT_ASSETS`, `findDefaultAsset`, `getDefaultAsset`.

### The six APIs — all present, all signature-compatible

| API | 2.18 | 2.25 |
|---|---|---|
| `buildPaymentRequirementsFromOptions<TContext>(paymentOptions)` | ✓ | identical |
| `getPaymentRequiredResponse(getHeader, body?)` | ✓ | identical |
| `createPaymentPayload(paymentRequired)` | ✓ | identical — single arg in both |
| `encodePaymentSignatureHeader(paymentPayload)` | ✓ | identical |
| `processResponse(response)` | ✓ | identical |
| `HTTPFacilitatorClient` ctor | ✓ | additive: gained `readonly timeoutMs` |

**No changelog exists.** No `CHANGELOG` in any published tarball; no GitHub releases returned. The
only migration guide is in `@x402/next`'s README, covering legacy `x402-next` → `@x402/next` (v1→v2).
Nothing for 2.18→2.25. No deprecations, no removals.

### Copying the PoC's files onto 2.25 — zero changes

Both files ran verbatim:

```
PASS  server: .register("hedera:*", new ExactHederaScheme({}))
PASS  client: createClientHederaSigner + register + wrapFetchWithPayment
  PASS  USDC $0.001 under DEFAULT 2.25 spendControls
  FAIL  USDC $5.00  -> rejected by spendControls.maxAmountPerPayment ($1)
  FAIL  HBAR 0.001  -> rejected: not a default asset
```

Source-compatible; wildcard `"hedera:*"` registration still works. Only breakage is **behavioral** —
the new default spend controls, a two-line fix (`setSpendControls({...})`).

Separately, swapping `@x402/express` → `@x402/next` on the seller side is a rewrite, but a small one
given the config shape is nearly identical.

### Pins

`@x402/hedera@2.25.0` still hard-pins `@hiero-ledger/sdk: "2.85.0"` exactly (and
`@hiero-ledger/proto: "2.31.0"`). Unchanged from 2.18.

`@x402/next` pins nothing conflicting with React 19 — deps are only `@x402/core ~2.25.0` and
`@x402/extensions ~2.25.0`; peers are `next >=16.2.6` plus optional `@x402/paywall`. **No React peer
at all.** The only conflict is Next itself.

---

## 5. HBAR vs USDC

From `createHederaPreflightTransfer`, `@x402/hedera@2.25.0` `dist/esm/index.mjs:50-130`:

**HBAR** (`asset === "0.0.0"`) — one mirror-node call to `/api/v1/accounts/{payer}`, compare
`balance.balance` in tinybars. No association check for either side.

**HTS** — `/api/v1/accounts/{payer}/tokens?token.id={asset}` for the payer's balance, then
`isPayToAssociated(payTo, asset)`, which passes if directly associated **OR**
`max_automatic_token_associations === -1` **OR** there's an unused auto-slot; otherwise
`pay_to_not_associated`.

- **Who needs it:** the receiver must be associated (or have auto-slots). The sender effectively must
  be too — you can't hold an HTS balance without association.
- **One-time per (account, token) pair.** Yes.
- ⚠️ **Error-mode trap:** an unassociated payer does **not** get an association error. `tokens[]`
  comes back empty → `held = 0n` → **`insufficient_balance`**. You'll go top up a wallet that's
  already funded.
- **Real cost, measured** — last 25 `TOKENASSOCIATE` transactions from the Hedera mainnet mirror node
  (16 successful): **median 0.643 HBAR**, min 0.638, max 1.286. (Hedera prices it at a fixed USD
  amount converted at an exchange rate, hence the spread.)
- **Better than associating:** auto-association.
  `AccountUpdateTransaction().setMaxAutomaticTokenAssociations(-1)` — verified present in
  `@hiero-ledger/sdk@2.85.0`. One transaction and the account never needs per-token association again.

### Association script — non-interactive, server-side

```ts
import { Client, PrivateKey, AccountId, TokenId, TokenAssociateTransaction } from "@hiero-ledger/sdk";

const accountId  = AccountId.fromString(process.env.HEDERA_SERVICE_ACCOUNT_ID!);
const privateKey = PrivateKey.fromStringECDSA(process.env.HEDERA_SERVICE_PRIVATE_KEY!);
const client     = Client.forMainnet().setOperator(accountId, privateKey);

const tx = await new TokenAssociateTransaction()
  .setAccountId(accountId)
  .setTokenIds([TokenId.fromString("0.0.456858")])   // mainnet USDC
  .execute(client);
await tx.getReceipt(client);
client.close();                                       // important on serverless
```

Run once as a script, not from a Vercel route — needs gRPC, one-time operation.

### ⚠️ You cannot price HBAR in USD

`parsePrice` (`exact/server/index.mjs:58-77`): an `AssetAmount` object is taken literally in atomic
units. A `Money` string falls through to `defaultMoneyConversion`, which **throws** on HBAR:

```js
if (!isValidHederaAsset(tokenConfig.asset) || tokenConfig.asset === "0.0.0")
  throw new Error("Default Hedera asset must be an HTS fungible token ID");
```

`"$0.001"` always resolves to the network's default HTS token (USDC). HBAR requires hand-computed
tinybars with no conversion anywhere in the stack — which is exactly why the inference PoC has that
`HBAR_PRICE` object, and why its "$0.001 for both assets" comment is wrong.

Escape hatch: `scheme.registerMoneyParser(fn)` (verified present) injects a live USD→HBAR rate.

### Verdict: USDC

⚠️ **SUPERSEDED 2026-09-08 — the decision is HBAR on testnet, USDC on mainnet. See `DECISIONS.md`.**
This section is kept because its mechanics are correct and they are what the mainnet swap will need.
Two of its three arguments did not survive measurement:

- **"Working spend controls (rejected by default)"** — half right and it reads as fatal. SM-05
  measured the default rejecting HBAR, then opted HBAR in explicitly with its own atomic per-payment
  cap, and **the control kept working.** It is the *default* allowlist that excludes HBAR, not the
  mechanism. `spendControls: false` was never the fix and must never appear.
- **"USDC costs ~1.3 HBAR of association and a few minutes"** — it cost neither, because the USDC
  never arrived. Circle's testnet faucet did not deliver, Discord went unanswered, and SM-08 later
  found the faucet's API endpoint rate-limits independently of its web form. **The blocker was supply,
  not setup.**

The one argument that stands is **USD pricing**: `"$0.50"` throws on HBAR — `defaultMoneyConversion`
rejects asset `0.0.0` — so a testnet price is hand-computed tinybars and is not legible to a buyer.
That cost is accepted on testnet and removed at the mainnet cutover.

**What the swap actually is**, since this note is where someone will look for it: token id, price
format (`AssetAmount` → `"$…"`), the buyer's `allowedAssets` entry, and the facilitator's advertised
asset. The association script below is the piece that turns back on. SM-05 kept its association path
skipped rather than deleted for exactly this reason — **it is a price change, not a rewrite.**

The original text, for the record: *"HBAR looks cheaper — no association, no setup. But we're selling
dollar-priced financial reports, and HBAR costs us USD pricing (hand-computed tinybars), working spend
controls (rejected by default), and stable revenue. USDC costs ~1.3 HBAR of one-time association
across two accounts and a few minutes with the script above."*

---

## 6. Read these first

| # | File | Why | Time |
|---|---|---|---|
| 1 | `@x402/next/dist/esm/index.js` | **The heart.** `handleSettlement` (196-260) — the unconditional `arrayBuffer()` that kills streaming; `paymentProxy` (300-340) — settles against empty `NextResponse.next()`; `withX402FromHTTPServer` (351-455) — the throw/cancel path. All of §2 is in these 470 lines | 20 min |
| 2 | `@x402/next/dist/esm/index.d.ts` | Full API with docstrings, incl. the explicit "will charge clients for failed API responses" warning and App Router examples | 10 min |
| 3 | `@x402/hedera/dist/esm/exact/server/index.mjs` | `paymentFlows` (22-24), `parsePrice` (58-77), `defaultMoneyConversion` (107-120). HBAR-pricing and upfront-support answers in ~124 lines | 8 min |
| 4 | `@x402/core/dist/esm/client/index.mjs` lines 440-545 | `applySpendControls` — the whole HBAR-rejection and $1-cap story | 10 min |
| 5 | `@x402/hedera/dist/esm/index.mjs` lines 50-130 | `createHederaPreflightTransfer` + `isPayToAssociated` — HBAR vs HTS branch, association rules, the misleading `insufficient_balance` | 8 min |

---

## Corrections

The earlier recommendation to "target `@x402/next@2.25.0` from the start" was wrong on two counts:

1. **The adapter doesn't support Next 15.** Needs `--legacy-peer-deps`, plus `legacy-peer-deps=true`
   in `.npmrc` for Vercel builds.
2. **`settleBeforeHandler` does not buy streaming.** That was an assumption; the measurement says
   otherwise. The thing that actually streams is `paymentProxy` in middleware — and it charges on
   failure.

---

## Recommended approach

Install `@x402/next@2.25.0` with `--legacy-peer-deps` on the existing Next 15. Price in USDC. Set
explicit `spendControls` plus our own daily counter. Use the **two-endpoint split**: `withX402` on a
fast `POST /api/reports` returning a job id (keeps cancel-on-failure), streaming from an ungated
`GET /api/reports/[id]/stream`.

Sub-second first byte, never charging for a report we failed to deliver.

**Do not upgrade to Next 16 mid-hackathon** just to satisfy a peer range that `--legacy-peer-deps`
already resolves.

---

## Questions closed

| Question | Answer |
|---|---|
| Is `@x402/next` a drop-in for Next 15? | No — peer requires Next ≥16.2.6, never supported 15. Works with `--legacy-peer-deps` |
| Adapter or scaffold-hbar's manual pattern? | Adapter. `NextAdapter` is the same code, maintained. Manual pattern is the fallback if the peer conflict is unacceptable |
| Does `settleBeforeHandler` enable streaming? | **No.** `handleSettlement` drains the body unconditionally |
| What streams? | `paymentProxy` in middleware only — and it charges on failure |
| Is `SpendControls` enough for an autonomous agent? | No. Per-payment only, no cumulative caps. Need our own daily counter |
| Does `SpendControls` work with HBAR? | No — rejected at the allowlist stage, HBAR isn't a default asset |
| What breaks 2.18 → 2.25? | Nothing structural, purely additive. Only behavioral change is the new default $1 cap |
| HBAR or USDC? | USDC — HBAR can't be USD-priced and breaks spend controls |
| Does `upfront` work against hosted Blocky402? | Yes — the facilitator capability check ignores the flow |

## Still open

- Whether the two-endpoint split is acceptable UX (one extra round trip before streaming starts)
- Where the daily spend counter lives (Postgres vs KV) and how it's keyed
- Whether `registerMoneyParser` is worth it if we ever want HBAR pricing
- `@x402/next@2.25.0` is one day old — watch for a patch release during the build
- Auto-association (`setMaxAutomaticTokenAssociations(-1)`) vs per-token association for our accounts

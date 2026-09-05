# Research: x402-inference-pay-per-request-poc

**Repo:** https://github.com/hedera-dev/x402-inference-pay-per-request-poc
**Reviewed:** Sept 4, 2026 — reviewer installed deps, ran the service against a stub, measured timings
**Created:** 2026-07-13 · **Last push:** 2026-07-15 · 5 commits over 3 days, untouched ~7 weeks
**2 stars, 0 forks, 0 issues ever filed, 2 merged PRs. CI is `npm ci && npm run build` only. No tests.**
**No LICENSE file** — legally "all rights reserved." Worth 30 seconds of thought before copy-pasting.

---

## What it is

~465 lines of TypeScript. Two npm workspaces + one script. Puts an x402 paywall in front of **LLM
inference** rather than a static file.

- `packages/service` — Express seller. Gates four OpenAI-compatible `/chat/completions` routes,
  proxies to a locally-running LM Studio.
- `packages/agent` — payer server holding a Hedera ECDSA key. Pays each 402 automatically, serves a
  static chat UI streaming payment-stage events over SSE.

README path ends at `npm run dev` → `localhost:3001` → each chat message triggers a real on-chain
micropayment. **A local demo, not a deployable service.** No Dockerfile, no deploy target, LM Studio
is a desktop-app dependency.

Reference code to read and gut. Both workspaces are private, nothing published.

---

## Read these first

| # | File | Why | Time |
|---|---|---|---|
| 1 | `packages/service/src/server.ts` (129 ln) | **The heart.** Entire seller side: route→price config, four gated routes, LM Studio proxy | 10 min |
| 2 | `node_modules/@x402/express/dist/esm/index.mjs` (~300 ln) | Not in the repo, read anyway. Where the 402 is actually built, where verify/settle sequencing lives, and where the streaming problem is created. The repo is thin config over this file | 15 min |
| 3 | `packages/agent/src/x402-client.ts` (83 ln) | Server-side payer from env keys. **The piece scaffold-hbar does not have** | 5 min |
| 4 | `packages/service/src/x402.ts` (16 ln) | Facilitator selection per network. Tiny, but it's the exact hosted-Blocky402 wiring | 2 min |
| 5 | `packages/agent/src/model.ts` (48 ln) | How the paid fetch is injected into the AI SDK provider (`createOpenAI({ fetch })`) | 5 min |

**Skip `PRD.md`** (535 ln) — pre-build design doc, several claims now false.

---

## Structure

```
packages/service/src/   CORE — the x402 seller. server.ts + x402.ts. This is the repo.
packages/agent/src/     CORE — payer (x402-client.ts) + AI SDK glue (model.ts) + SSE API (server.ts)
packages/agent/public/  DELETE — 737-line chat UI, Hedera-branded, CDN marked/dompurify
scripts/                KEEP-ISH — associate-token.ts, USDC HTS association, testnet + mainnet
.github/                DELETE — templates, build-only CI
PRD.md / SETUP.md       DELETE — design doc + setup guide that contradicts the code
```

~280 lines matter. The other ~1,450 (UI + docs) is demo dressing.

---

## Stack

TypeScript 5.9.3 · Node ≥20 (CI on 22.x, no `engines`) · npm workspaces · ESM (`module: NodeNext`) ·
Express 4.22.2. **No React anywhere.**

Top deps: `@x402/express` (the gate) · `@x402/core` · `@x402/hedera` · `@x402/fetch` (client retry
wrapper) · `@hiero-ledger/sdk` · `ai` v6 · `@ai-sdk/openai` · `@hashgraph/hedera-agent-kit` +
`-ai-sdk` · `express` · `dotenv`.

### Version comparison — this repo is ahead, both are behind npm

| Package | scaffold-hbar `x402-pay-per-use` | this repo (lockfile) | npm latest |
|---|---|---|---|
| `@x402/core` | ^2.14.0 | 2.18.0 | **2.25.0** |
| `@x402/hedera` | ^2.13.2 | 2.18.0 | **2.25.0** |
| `@x402/express` | not used | 2.18.0 | 2.25.0 |
| `@hiero-ledger/sdk` | ^2.80.0 | 2.85.0 | — |

**Two things that matter more than the numbers:**

1. `@x402/hedera` pins `@hiero-ledger/sdk` to **exactly 2.85.0** (no caret) at both 2.18 and 2.25.
   Can't upgrade the Hedera SDK independently without duplicating it. Same for
   `@hiero-ledger/proto@2.31.0`. `@x402/hedera`'s own code has an error string telling you to "check
   the `@hiero-ledger/sdk` / `@hiero-ledger/proto` version pins" when protobuf key reconstruction
   fails — a known-fragile seam.
2. **2.25.0 adds two things 2.18.0 does not have** (verified by diffing type defs):
   - `SettlePhase = "before-handler" | "after-handler" | "cancel"` plus a `settleBeforeHandler` flag
   - `SpendControls` with a default `maxAmountPerPayment: "$1"` cap

### Next 15 / Vercel conflicts

- `@x402/express` **won't run in a Next route handler**. `@x402/next@2.25.0` exists and is what's needed.
- `@hiero-ledger/sdk` depends on `@grpc/grpc-js` + `pino` + `protobufjs` → Node runtime only, never
  Edge, heavy bundle.
- `@hashgraph/hedera-agent-kit@4.0.0` pins `zod: "3.25.76"` exactly. AI SDK v6 accepts
  `^3.25.76 || ^4.1.8`. On zod 4 you'd ship two zods.

**Server-side from env keys, fully.** `x402-client.ts:28-38` builds signers from
`HEDERA_AGENT_PRIVATE_KEY` via `PrivateKey.fromStringECDSA`. No wallet connector, no browser signing.
This is the opposite of scaffold-hbar's `walletSigner.ts` + `hedera-wallet-connect`.

---

## Seller side

### The 402 is never hand-built

Pure declarative route config (`packages/service/src/server.ts:46-60`):

```ts
app.use(paymentMiddleware(
  {
    'POST /v1/testnet/usdc/chat/completions': {
      accepts: [{ scheme: 'exact', price: USDC_PRICE, network: 'hedera:testnet',
                  payTo: TESTNET_SERVICE_ACCOUNT }],
      description: 'LLM inference — testnet USDC',
      mimeType: 'application/json',
    },
    // ...hbar variant
  },
  testnetRS,
));
```

Plus a 16-line resource-server factory (`x402.ts:4-17`) picking the facilitator by network.
`@x402/express` builds the header.

**Divergence from scaffold-hbar:** scaffold-hbar hand-writes an `HTTPRequestContext` adapter
(`makeHttpContext`) and calls `x402ResourceServer` primitives directly from a Next route handler.
Declarative reads nicer; **the manual version is the one that ports to Next.**

Captured challenge (reviewer ran it against a stub LM Studio, all four routes):

```json
{ "x402Version": 2, "error": "Payment required",
  "resource": { "url": "http://localhost:4021/v1/testnet/usdc/chat/completions",
                "description": "LLM inference — testnet USDC", "mimeType": "application/json" },
  "accepts": [{ "scheme": "exact", "network": "hedera:testnet", "amount": "1000",
                "asset": "0.0.429274", "payTo": "0.0.12345", "maxTimeoutSeconds": 300,
                "extra": { "feePayer": "0.0.9185802" } }] }
```

Mainnet route resolved `feePayer: 0.0.10571514` live from `api.blocky402.com`. Header name, base64
`accepts[]`, and the transaction-ID-against-facilitator trick (`@x402/hedera index.mjs:161`) are
**identical to scaffold-hbar** — both just consume `@x402/hedera`.

> **Correction to an earlier assumption:** ECDSA is **not** a protocol requirement. `@x402/hedera`'s
> verifier handles ED25519, ECDSA_SECP256K1, and ProtobufEncoded keys (`index.mjs:205-222`). The
> ECDSA constraint is self-imposed by both repos calling `PrivateKey.fromStringECDSA` at the app layer.

### Pricing — flat per call, and metering isn't available on Hedera

```ts
const USDC_PRICE = '$0.001';
const HBAR_PRICE = { asset: '0.0.0', amount: '100000' }; // 0.001 HBAR = 100,000 tinybars
```

README lists "no per-token metering" as an explicit non-goal.

**Mechanical lesson worth keeping:** a `Money` string (`'$0.001'`) gets USD-converted using the
scheme's asset decimals → `amount: "1000"`. An `AssetAmount` object is taken literally in atomic units
and bypasses conversion → `amount: "100000"` tinybars. (The comment on `server.ts:21` claiming
"$0.001 for both assets" is wrong — 0.001 HBAR is ~$0.00015. The routes are ~7x apart.)

**On metering when x402 fixes the amount first — two mechanisms exist in x402 v2:**

1. **`DynamicPrice`** — `RouteConfig.price` can be `(context: HTTPRequestContext) => Price`, so you
   read the request body and price the 402 before doing the work. **Works on Hedera today.** This repo
   doesn't use it.
2. **Partial settlement** — the `upto` scheme + a `Settlement-Overrides` response header letting the
   handler settle less than the authorized max. The real meter-then-charge primitive.
   **Not available on Hedera.** `@x402/hedera` 2.18.0 and 2.25.0 export only
   `exact/{client,server,facilitator}` — no `upto`. `x402.org/facilitator/supported` advertises `upto`
   on exactly one network: `eip155:84532` (Base Sepolia). Core type docs say using overrides with
   `exact` "will likely cause settlement verification to fail."

### Verify before, settle after — and failure after verify costs the buyer nothing

Reviewer measured this rather than reading it. Stub facilitator, instrumented handler:

```
[facilitator] /verify called at t+75ms      ← before the handler
[handler] wrote chunk1 at t+77ms
[handler] ended at t+2182ms
[facilitator] /settle called at t+2185ms    ← after the handler completed
```

Failure paths, both tested:

```
MODE=status500 → /verify at t+43ms, handler responded 500 at t+345ms, /settle NEVER CALLED
MODE=throw     → /verify at t+37ms, handler threw at t+338ms,        /settle NEVER CALLED
```

Middleware calls `cancellationDispatcher.cancel({ reason: 'handler_failed' | 'handler_threw' })` and
skips settlement. The buyer's transaction is only partially signed and the facilitator never co-signs,
so no money moves.

**Caveat:** the signed transaction stays valid for its window (`maxTimeoutSeconds: 300` here), so a
buggy or hostile server could settle it late. The guarantee is "this implementation won't," not
"it cannot."

### Stateless across both round trips

No session store, no nonce table, no correlation between the 402 and the retry. The client echoes the
full accepted requirements back inside the payment payload; the server re-derives from route config.
Confirmed empirically — a `PAYMENT-SIGNATURE` sent cold, with no preceding 402 in that connection,
verified and settled fine.

Only process-level state is `httpServer.initialize()` caching the facilitator's `/supported` behind an
`isInitialized` flag. On Vercel that's a facilitator round-trip per cold start.

### ⚠️ Streaming is buffered — the finding that matters most

`server.ts:91-101` reads the LM Studio SSE stream and pipes it with `res.write()`. `PRD.md §7.2`
describes a working streaming path. **Both are wrong when the route is behind the payment gate.**

`@x402/express` monkey-patches `res.write`, `res.writeHead`, `res.end`, and `res.flushHeaders`, pushes
every call into a `bufferedCalls` array, waits for `res.end()`, settles, then replays the buffer.

Measured — handler writing 3 chunks 700ms apart:

```
[handler] wrote chunk1  at t+77ms
[handler] wrote chunk2  at t+779ms
[handler] wrote chunk3  at t+1481ms
[handler] ended         at t+2182ms
[facilitator] /settle   at t+2185ms
[client] status 200, headers received at t+2187ms     ← nothing before this
[client] received "chunk1\n\nchunk2\n\nchunk3\n\n[DONE]" at t+2187ms   ← all four, one frame
```

The client gets zero bytes until the handler finishes and settlement completes, then everything at
once. The repo's SSE passthrough is dead code in practice.

**`@x402/next@2.25.0` has the same shape** (`Buffer.from(await response.clone().arrayBuffer())`
before `processSettlement`).

**Implication for multi-second report generation:** no progressive rendering, buyer stares at nothing
for generation + settlement latency, whole response sits in function memory on Vercel.

**The fix exists only in 2.25.0:** `SettlePhase` + `settleBeforeHandler` — settle first, then stream
freely. Absent from 2.18.0. Note it flips the failure semantics: settle-before means a failed report
has already charged, so the refund problem becomes yours.

### No refunds, retries, or idempotency

None in this repo. Only safety is the automatic cancel-before-settle above. `@x402/extensions` ships a
payment-identifier extension (`generatePaymentId`, `validatePaymentIdentifier`, `PAYMENT_ID_PATTERN`)
for exactly this — unused. Replay protection comes only from Hedera rejecting duplicate transaction IDs
at consensus.

---

## Client / agent side

**Autonomous? Half.** `wrapFetchWithPayment` intercepts the 402, signs, and retries with no
confirmation step — the property needed for a server-side agent wallet. But there's no autonomous
loop; every payment is triggered by a human typing in the browser UI.

Despite the name, `@hashgraph/hedera-agent-kit` is loaded with `tools: [], plugins: []`
(`model.ts:18,28`) — contributes nothing but a no-op middleware wrapper.

**Spend caps? None.** `packages/agent/src/server.ts:23,73` is the entire budget system:

```ts
let totalSpent = 0;
totalSpent = parseFloat((totalSpent + COST_PER_REQUEST).toFixed(6));
```

A display counter, incremented by a hardcoded constant rather than the actual settled amount, reset on
restart, enforced nowhere. `@x402/core@2.18.0` has a `PaymentPolicy` hook
(`(x402Version, requirements[]) => requirements[]`) that could filter over-budget challenges — unused.
2.25.0 adds real `SpendControls` with `maxAmountPerPayment` defaulting to `"$1"` and per-asset
allowlists.

**Discovery? None.** URL comes from an env var (`INFERENCE_SERVICE_URL`, `model.ts:39`); price is
learned only by getting a 402. `@x402/core` has `checkIfBazaarNeeded` and `@x402/extensions/bazaar` is
installed, but no route declares bazaar extensions so it never loads.

**Importable?** Not as published packages. But `initX402()` in `x402-client.ts` is a clean,
dependency-light factory returning `createFetchForRequest(onStatus)` — copy that one file and it works
standalone. The status-callback pattern (wrap fetch, sniff for `PAYMENT-SIGNATURE`, emit stages) is
the reusable idea.

---

## What to lift

| # | File | What it gives | Adaptation |
|---|---|---|---|
| 1 | `packages/service/src/x402.ts` (16 ln) | network→facilitator selection with `HTTPFacilitatorClient` pointed at hosted `api.blocky402.com`. **Highest-value file — scaffold-hbar doesn't have it** (it self-hosts) | near-zero |
| 2 | `packages/agent/src/x402-client.ts` (83 ln) | Server-side payer from env keys, dual-network signer registry, status-stage callback. The piece scaffold-hbar replaces with a browser wallet | light — drop dual-network branching, add SpendControls |
| 3 | `packages/agent/src/model.ts:39-48` (10 ln) | Injecting payment-wrapped fetch into `createOpenAI({ baseURL, apiKey: 'x', fetch })`. Generalizable: x402 rides on any HTTP client accepting a custom fetch | light — drop the HederaAIToolkit wrapper |
| 4 | `scripts/associate-token.ts` (77 ln) | USDC HTS association, testnet + mainnet token IDs | none — run once per receiving account |
| 5 | `packages/service/src/server.ts:46-76` | Reference for route→price shape **only**, not to copy — it's `@x402/express`, won't run on Vercel | — |

**Don't bother:** the chat UI (737 lines), the whole `@hashgraph/hedera-agent-kit` integration (no-op),
`PRD.md`/`SETUP.md` (stale), and the seller-side middleware wiring — for a Next route handler,
scaffold-hbar's manual `makeHttpContext` + explicit verify/settle is strictly better because it ports
to Next and gives control over settle timing that `@x402/express` takes away.

---

## Gotchas

**Time sinks**
- **LM Studio is a hard blocker.** `server.ts:124` calls `checkLMStudio()` and `process.exit(1)` if
  `/v1/models` isn't reachable with a model loaded. Reviewer bypassed with a 15-line stub server —
  2 minutes, never touch LM Studio.
- **4 accounts, not 2**, for the full mainnet demo, each needing HBAR for fees, plus USDC association
  on both sides of each pair, plus mainnet USDC funding with real money.
- `.env` path hardcoded to repo root (`resolve(__dirname, '../../../.env')`, `server.ts:9`).

**Stale / actively misleading**
- `SETUP.md` **contradicts the code**: documents `$0.01` / 10,000 USDC base units (lines 96, 142) —
  code says `$0.001` / 1,000. Documents route `/v1/chat/completions` (lines 132, 152) which no longer
  exists; all four are `/v1/{network}/{asset}/chat/completions`. Its smoke tests will 404.
- `PRD.md §7.2` and the README both promise streaming. Wrong. `PRD.md §12` even lists "streaming +
  x402 may double-read bodies" as a *mitigated* risk — it isn't mitigated, it's buffered.
- README clone URL is dead (line 85: `narbs91/x402-inference-agent-kit-poc`).
- **README's facilitator table is misleading** — claims `api.blocky402.com` supports testnet. It
  advertises only `hedera:mainnet`. Testnet is `api.testnet.blocky402.com`, mentioned only in a footnote.
- **HBAR on testnet likely doesn't work at all** — `x402.org/facilitator/supported` returns one Hedera
  entry, `exact/hedera:testnet`, with no HBAR asset support signalled. README admits this under
  "Limitations."

**Vercel-specific**
- Express + `app.listen()` + long-lived process — none of it survives the port to route handlers.
- `model.ts:8-30` caches module-scoped `Client.forTestnet()`/`forMainnet()` toolkits holding
  long-lived gRPC connections. Antipattern on serverless. **Contrast:** `@x402/hedera`'s signer
  correctly opens and `client.close()`s per signing call — that part is serverless-safe.
- `@hiero-ledger/sdk` cannot run on Edge. Force Node runtime.
- Cold-start facilitator fetch: `initialize()` hits `/supported` once per process, in the critical
  path of a 402.

**Mainnet: yes, genuinely.** The repo's main advantage over most x402 samples. Commit `8ae622b`
("Adds mainnet support") added real mainnet routes with correct mainnet USDC (`0.0.456858`), mainnet
facilitator, and mainnet association. Reviewer confirmed mainnet routes issue valid 402s with a
live-resolved mainnet feePayer.

⚠️ **`MAINNET_SERVICE_ACCOUNT` silently falls back to the testnet account if unset**
(`server.ts:14`, same pattern in `x402-client.ts:18-19` and `model.ts:14-15`). A misconfigured env var
means quietly signing against the wrong network rather than failing loudly.

---

## Verdict

**Copy specific files — items 1–4 above, ~190 lines total, then write our own seller side.**

The comparison: scaffold-hbar's x402 branch gives the seller shape that ports to our stack — Next 15 +
React 19, hand-rolled `HTTPRequestContext` adapter, explicit `x402ResourceServer` verify/settle from a
route handler. This repo can't give that because it's built on `@x402/express`. **Seller side:
scaffold-hbar wins.**

But scaffold-hbar has two holes: it assumes a browser wallet where we need server-side agent wallets
from env keys, and it assumes a self-hosted facilitator where we've chosen hosted Blocky402.
`x402-client.ts` and `x402.ts` are the ~100 lines that close both gaps, and this repo is ~4 minors
ahead on x402, so it's the better version to copy from.

**What it does not give us, despite gating inference, is metering.** Flat $0.001 per call with
per-token pricing an explicit non-goal — and the deeper reason established above is that partial
settlement doesn't exist on Hedera in any published version, only Base Sepolia. Price reports up front
with `DynamicPrice`.

**The other thing to take is a warning rather than code:** the payment gate buffers the entire response
until settlement, measured directly. For multi-second reports that's a real UX problem, and the only
fix — `settleBeforeHandler` — landed in 2.25.0, not the 2.18.0 pinned here.

Reviewer's suggested approach: start from scaffold-hbar's seller structure, paste in this repo's two
wallet/facilitator files, target `@x402/next@2.25.0` from the start (SpendControls with its default $1
cap comes free, which we want on a mainnet agent wallet), and **decide early whether reports stream** —
because that decision determines the settle phase, and settle-before-handler hands us the refund
problem that after-handler currently solves for free.

---

## Questions this closed

| Question | Answer |
|---|---|
| Does metering exist for work-priced resources on Hedera? | No. `upto` + `Settlement-Overrides` is Base Sepolia only. Use `DynamicPrice` to quote up front |
| What happens if work fails after payment? | With after-handler settlement, `/settle` is never called and no money moves. Measured |
| Is the gate stateless across round trips? | Yes, fully. Confirmed empirically |
| Does x402 work on Hedera mainnet? | Yes — real mainnet routes, mainnet USDC `0.0.456858`, live feePayer resolved |
| Is ECDSA a protocol requirement? | **No** — self-imposed by both repos at the app layer. Verifier handles ED25519 too |

## Still open

- Whether reports stream or not — determines settle phase, which determines who owns the refund problem
- Whether to target `@x402/next@2.25.0` (SpendControls + SettlePhase) vs the versions in these repos
- Whether pricing in HBAR or USDC — USDC needs HTS association per receiving account
- `@x402/hedera`'s hard pin on `@hiero-ledger/sdk@2.85.0` — check for conflicts with anything else we add
- No LICENSE on this repo; check before shipping lifted code

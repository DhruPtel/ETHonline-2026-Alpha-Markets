# Research: scaffold-hbar — follow-up (x402 deep dive)

**Repo:** https://github.com/hedera-dev/scaffold-hbar (`templates/x402-pay-per-use`)
**Reviewed:** Sept 4, 2026
**Covers:** facilitator swap, buyer flow, pricing/tiers, account setup

Companion to `scaffold-hbar.md`. Several open questions from that note are now closed.

---

## 1. Facilitator — Blocky402 verified working

### The `FACILITATOR_URL` contract

`services/x402/server.ts:47` constructs `new HTTPFacilitatorClient({ url: FACILITATOR_URL })`.
That class is upstream in `@x402/core` (`src/http/httpFacilitatorClient.ts`). It calls **three
endpoints and nothing else**:

**`GET {url}/supported`** — called once by `server.initialize()`. Response schema at
`httpFacilitatorClient.ts:156-160`:

```json
{ "kinds": [ { "x402Version": 2, "scheme": "exact", "network": "hedera:testnet",
               "extra": { "feePayer": "0.0.7162784" } } ],
  "extensions": [], "signers": { "hedera:*": ["0.0.7162784"] } }
```

Retries 3× on HTTP 429 with `Retry-After`-aware backoff (`:335-341`).

`extra.feePayer` is **load-bearing**. `ExactHederaScheme.enhancePaymentRequirements`
(`@x402/hedera/src/exact/server/scheme.ts:113-120`) copies it into every 402 challenge; the client
throws `"feePayer is required in paymentRequirements.extra"` without it
(`@x402/hedera/src/exact/client/scheme.ts:41`).

**`POST {url}/verify`** and **`POST {url}/settle`** — identical request shape
(`httpFacilitatorClient.ts:280-288`, `:337-345`):

```json
{ "x402Version": 2, "paymentPayload": {...}, "paymentRequirements": {...} }
```

- `/verify` → `{ isValid, invalidReason?, invalidMessage?, payer?, extensions?, extra? }`
- `/settle` → `{ success, transaction, network, errorReason?, errorMessage?, payer?, amount? }`
  (`transaction` and `network` are the only required fields)

Both BigInt-serialized via `toJsonSafe` (`:432`).

### It's the standard interface, and hosted is the default

`@x402/core` defines `interface FacilitatorClient` at `httpFacilitatorClient.ts:31-60`
(`verify` / `settle` / `getSupported`).

```ts
// @x402/core/src/http/httpFacilitatorClient.ts:13
const DEFAULT_FACILITATOR_URL = "https://x402.org/facilitator";
```

Constructing with no args points at a hosted third-party facilitator. `createAuthHeaders` exists in
`FacilitatorConfig` (`:16-23`) for API-key facilitators — not needed, Blocky402 is keyless.

Nothing in `services/x402/server.ts` is specific to the bundled implementation. The template's own
comment calls `facilitator/` "a thin HTTP wrapper around the official Hedera reference scheme"
(`facilitator/src/server.ts:5-6`).

### Blocky402 checked live — both networks respond correctly

```
GET https://api.testnet.blocky402.com/supported  → 200
  {"kinds":[ {"scheme":"exact","network":"eip155:80002"},
             {"scheme":"exact","network":"solana:EtWTRABZ…","extra":{"feePayer":"7B6Q2Mvc…"}},
             {"scheme":"exact","network":"hedera:testnet","extra":{"feePayer":"0.0.7162784"}} ],
   "signers":{"hedera:*":["0.0.7162784"]}}

GET https://api.blocky402.com/supported  → 200
  {"kinds":[{"scheme":"exact","network":"hedera:mainnet","extra":{"feePayer":"0.0.10571514"}}],
   "signers":{"hedera:*":["0.0.10571514"]}}
```

`x402Version: 2`, `scheme: "exact"`, correct CAIP-2 networks, `extra.feePayer` present on both —
the exact shape `enhancePaymentRequirements` reads. **Mainnet is live.**

```
FACILITATOR_URL=https://api.blocky402.com      # or api.testnet.blocky402.com
X402_NETWORK=hedera:mainnet                    # must match the advertised network
NEXT_PUBLIC_X402_NETWORK=hedera:mainnet
```

**Two things not resolvable from outside:** their fee payer covers buyers' network fees, so their
sustainability/rate-limit terms are unknown. If `0.0.10571514` runs dry or rate-limits, every payment
stops. Keeping `FACILITATOR_URL` as an env var makes swapping back to self-hosted a ~10-minute
change rather than a rewrite.

### What breaks if `facilitator/` is deleted

Nothing in the payment path. Cleanup list:

| Breaks | Where | Fix |
|---|---|---|
| `yarn infra:up` / `infra:down` / `infra:logs` | root `package.json:4-6` | Still needed for MinIO; drop the facilitator service |
| facilitator service block | `docker-compose.yml:38-49` | Delete the block |
| `yarn facilitator:check-types` | root `package.json:7` | Delete the script |
| `FACILITATOR_ACCOUNT_ID` / `FACILITATOR_PRIVATE_KEY` | root `.env.example:19-21`, `facilitator/.env.example:9-12` | Delete — no longer need that funded account |
| Docs referencing it | `README.md:96-109`, `RUNBOOK.md §2` | Rewrite or drop |

**Not affected:** `services/x402/server.ts`, `client.ts`, `walletSigner.ts`, `utils/x402.ts`,
`scripts/x402-buy.ts`, `app/api/files/[id]/download/route.ts`. None import from `facilitator/`.
No tests reference it (only test is `packages/hardhat/test/FileRegistry.test.ts`, pure Solidity).

### Seller never needs the fee-payer key

Read in exactly one place in the whole repo:

```ts
// facilitator/src/server.ts:41-44
const FEE_PAYER_ID  = requireEnv("FACILITATOR_ACCOUNT_ID");
const FEE_PAYER_KEY = PrivateKey.fromStringECDSA(requireEnv("FACILITATOR_PRIVATE_KEY"));
```

Injected via `docker-compose.yml:45-46`. The Next.js app reads only `FACILITATOR_URL`
(`services/x402/server.ts:22`). `README.md:109`: "The Next.js app does not need this private key."
With Blocky402 the key doesn't exist on our side at all.

**Trust boundary:** the facilitator co-signs as fee payer and submits, but cannot alter the transfer —
the buyer's signature covers the transfer body. Blocky402 can refuse to settle or stall; it cannot
redirect funds.

---

## 2. Buyer side

### The flow — 6 steps

`scripts/x402-buy.ts`:

```ts
// STEP 1: build the signing stack
const privateKey = PrivateKey.fromStringECDSA(privateKeyStr);       // ECDSA only
const signer = createClientHederaSigner(accountId, privateKey, { network });
const client = new x402Client().register(network, new ExactHederaScheme(signer));
const httpClient = new x402HTTPClient(client);

// STEP 2: unpaid request
const first = await fetch(resourceUrl);

if (first.ok) {
  // free tier — no payment needed
} else if (first.status === 402) {
  // STEP 3: parse the challenge
  const challengeBody = await first.clone().json().catch(() => undefined);
  const paymentRequired = httpClient.getPaymentRequiredResponse(
    name => first.headers.get(name), challengeBody);

  // STEP 4: build + sign the payment
  const payload = await httpClient.createPaymentPayload(paymentRequired);
  const headers = httpClient.encodePaymentSignatureHeader(payload);

  // STEP 5: retry with payment
  const paid = await fetch(resourceUrl, { headers });
  const result = await httpClient.processResponse(paid);

  // STEP 6: confirm settlement
  if (result.kind !== "success") throw new Error(`Payment failed: ${result.kind}`);
  console.log(`Settled · tx ${result.settleResponse.transaction}`);
}
```

### The challenge

`getPaymentRequiredResponse` (`@x402/core/src/http/x402HTTPClient.ts:114-135`) reads the
**`PAYMENT-REQUIRED`** header (base64 JSON), falling back to the body only for legacy v1. The server
writes both — header at `download/route.ts:170`, body via `NextResponse.json(..., { status: 402 })`.

Decoded (`PaymentRequiredV2Schema`, `@x402/core/src/schemas/index.ts:148-155`):

```json
{ "x402Version": 2,
  "error": "Payment required",
  "resource": { "url": "…", "description": "…", "mimeType": "application/pdf" },
  "accepts": [ { "scheme": "exact", "network": "hedera:mainnet",
                 "amount": "50000000", "asset": "0.0.0", "payTo": "0.0.1234",
                 "maxTimeoutSeconds": 180,
                 "extra": { "feePayer": "0.0.10571514" } } ],
  "extensions": {} }
```

`amount` is atomic units — tinybars for `asset: "0.0.0"`, or token smallest-units for an HTS id.
**`accepts` is an array** — that's the multi-tier hook.

### Signing

`createPaymentPayload` → `ExactHederaScheme.createPaymentPayload`
(`@x402/hedera/src/exact/client/scheme.ts:33-51`) → `signer.createPartiallySignedTransferTransaction`.
Default signer at `@x402/hedera/src/signer.ts:145-201`:

```ts
const tx = new TransferTransaction();
if (isHbarAsset(requirements.asset)) {                    // asset === "0.0.0"
  tx.addHbarTransfer(parsedAccountId, Hbar.fromTinybars((-amount).toString()));
  tx.addHbarTransfer(payTo,           Hbar.fromTinybars(amount.toString()));
} else {
  const tokenId = TokenId.fromString(requirements.asset);
  tx.addTokenTransfer(tokenId, parsedAccountId, -amount);
  tx.addTokenTransfer(tokenId, payTo,            amount);
}
tx.setTransactionId(TransactionId.generate(AccountId.fromString(feePayer)));  // facilitator pays fees
tx.freezeWith(client);
const signed = await tx.sign(parsedPrivateKey);           // buyer's ECDSA key, PARTIAL sign
return Buffer.from(signed.toBytes()).toString("base64");
```

Transaction ID is generated against the **facilitator's** account — that's why the facilitator pays
network fees. The buyer signature is partial; the tx is unsubmittable until the fee payer co-signs.

### Wire format

`encodePaymentSignatureHeader` (`x402HTTPClient.ts:90-105`) emits **`PAYMENT-SIGNATURE`** for v2
(`X-PAYMENT` only for v1). Base64 of `PaymentPayloadV2Schema` (`schemas/index.ts:160-166`):

```json
{ "x402Version": 2,
  "accepted": { "scheme":"exact", "network":"hedera:mainnet", "amount":"50000000",
                "asset":"0.0.0", "payTo":"0.0.1234", "maxTimeoutSeconds":180,
                "extra":{"feePayer":"0.0.10571514"} },
  "payload": { "transaction": "CooBCocBCh4KDAi..." } }
```

`payload.transaction` = base64 partially-signed `TransferTransaction` bytes. Reply carries
**`PAYMENT-RESPONSE`** (base64 `SettleResponse`), set at `download/route.ts:159`.

No captured example exists in the repo — shapes above reconstructed from the zod schemas, which are
authoritative.

### It's a CLI script, and it has no spend cap

Registered as `yarn x402:buy` (`packages/nextjs/package.json:12`). Pays whatever the server asks —
unacceptable for an autonomous agent. Reusable version with a cap and a cached client:

```ts
// services/x402/buyer.ts
let cached: x402HTTPClient | null = null;

function getBuyer(): x402HTTPClient {
  if (cached) return cached;
  const accountId = process.env.AGENT_ACCOUNT_ID;
  const key = process.env.AGENT_PRIVATE_KEY;
  if (!accountId || !key) throw new Error("AGENT_ACCOUNT_ID / AGENT_PRIVATE_KEY required");
  const network = (process.env.X402_NETWORK ?? "hedera:testnet") as Network;
  const signer = createClientHederaSigner(accountId, PrivateKey.fromStringECDSA(key), { network });
  cached = new x402HTTPClient(new x402Client().register(network, new ExactHederaScheme(signer)));
  return cached;
}

export async function fetchWithPayment(
  url: string,
  opts: { maxAmount: bigint; init?: RequestInit },
): Promise<{ body: unknown; paid: boolean; transaction?: string; amount?: string }> {
  const http = getBuyer();
  const first = await fetch(url, opts.init);
  if (first.ok) return { body: await first.json(), paid: false };
  if (first.status !== 402) throw new Error(`Unexpected ${first.status}: ${await first.text()}`);

  const challengeBody = await first.clone().json().catch(() => undefined);
  const challenge = http.getPaymentRequiredResponse(n => first.headers.get(n), challengeBody);

  // Spend guard — upstream has none. Inspect before signing anything.
  const quoted = challenge.accepts.map(a => BigInt("amount" in a ? a.amount : a.maxAmountRequired));
  const cheapest = quoted.reduce((m, v) => (v < m ? v : m));
  if (cheapest > opts.maxAmount) {
    throw new Error(`Quoted ${cheapest} exceeds cap ${opts.maxAmount}; refusing to pay`);
  }

  const payload = await http.createPaymentPayload(challenge);
  const headers = { ...(opts.init?.headers ?? {}), ...http.encodePaymentSignatureHeader(payload) };
  const result = await http.processResponse(await fetch(url, { ...opts.init, headers }));
  if (result.kind !== "success") throw new Error(`Payment failed (${result.kind})`);
  return { body: result.body, paid: true,
           transaction: result.settleResponse.transaction, amount: result.settleResponse.amount };
}
```

### Retry and success semantics

**No retry loop.** One unpaid probe + one paid retry, then success or throw. No backoff, no
idempotency key, **no resume if the process dies between settlement and delivery** — money moves,
result is lost. Worth wrapping with an idempotency record if a report costs real money.

Success is determined in `processResponse` (`x402HTTPClient.ts:228-249`): reads `PAYMENT-RESPONSE`,
returns `kind: "success"` only when `settleResponse.success === true`. The server only sends that
header after `server.settlePayment()` succeeds (`download/route.ts:139-159`), and settlement resolves
only after a SUCCESS consensus receipt — `createHederaSignAndSubmitTransaction` calls
`response.getReceipt(client)` and lets `ReceiptStatusError` throw (`@x402/hedera/src/signer.ts:236-238`,
documented `:52-58`).

**So `kind: "success"` means finality on Hedera, not just broadcast.**

### Discovery — in the protocol, not in the template

Template has none: buyer needs the URL up front; price is discovered by making the unpaid request.

Upstream `@x402/core` has a discovery extension called **bazaar** — `ResourceInfoSchema` carries
`serviceName`, `tags`, `iconUrl` (`schemas/index.ts:70-77`); routes can declare `extensions.bazaar`
(`x402HTTPResourceServer.ts:189-200`); `FacilitatorConfig.createAuthHeaders` has a bazaar slot
(`httpFacilitatorClient.ts:21`).

**Blocky402 advertises `"extensions": []` — it does not currently offer bazaar.** A plain
`GET /api/reports` catalog returning ids + prices is ~an hour and doesn't depend on an extension
neither the template nor the facilitator implements.

---

## 3. Pricing and tiers

### Price is per-resource, read from chain per request

`FileRegistry.sol:36` declares `uint256 priceTinybar` in the `FileItem` struct;
`PAYMENT_ASSET = "0.0.0"` is a contract constant (`:25`). The resource server reads it per request
via viem (`services/registry/server.ts`, `getRegistryFile`):

```ts
// app/api/files/[id]/download/route.ts:78-90
const requirements = await server.buildPaymentRequirementsFromOptions(
  [ { scheme: "exact",
      network: X402_NETWORK,
      payTo: file.payToAccountId,                    // per-file seller account
      price: { asset: HBAR_ASSET, amount: file.priceTinybar.toString() },
      maxTimeoutSeconds: MAX_TIMEOUT_SECONDS } ],
  context,
);
```

Only `X402_NETWORK`, `HBAR_ASSET` (`"0.0.0"`) and `MAX_TIMEOUT_SECONDS` (180) are constants
(`services/x402/server.ts:19-28`).

### Dynamic pricing is native — resolved before the 402

`buildPaymentRequirementsFromOptions` accepts each field as a value **or a function of request
context** (`@x402/core/src/server/x402ResourceServer.ts:750-768`):

```ts
payTo: string | ((context: TContext) => string | Promise<string>);
price: Price  | ((context: TContext) => Price  | Promise<Price>);
```

Exported types `DynamicPrice` and `DynamicPayTo` exist for this
(`x402HTTPResourceServer.ts:83-88`).

Price is resolved **before** the challenge is built, so the amount is fixed at 402-issue time and the
buyer signs against that exact figure. **Cannot decide price after seeing the payment.** An `upto`
scheme is hinted at in `SettleResponse.amount` ("Present for schemes like upto…",
`types/facilitator.ts:33`) but `@x402/hedera` 2.13.2 implements only `exact`.

### Free + paid on one route already works

The gate doesn't assume everything behind it is paid — `download/route.ts:60-68` short-circuits
before any x402 code runs:

```ts
if (file.isPublic) {
  const url = await createDownloadUrl({ ... });
  return NextResponse.json({ url, file: toPublicFile(file) });   // free, no 402
}
```

Multi-tier via the `accepts[]` array, reading back which was paid from `payload.accepted`:

```ts
const requirements = await server.buildPaymentRequirementsFromOptions([
  { scheme: "exact", network: X402_NETWORK, payTo: report.payTo,
    price: { asset: HBAR_ASSET, amount: report.readPriceTinybar.toString() },
    maxTimeoutSeconds: MAX_TIMEOUT_SECONDS, extra: { tier: "read" } },
  { scheme: "exact", network: X402_NETWORK, payTo: report.payTo,
    price: { asset: HBAR_ASSET, amount: report.buyPriceTinybar.toString() },
    maxTimeoutSeconds: MAX_TIMEOUT_SECONDS, extra: { tier: "buy" } },
], context);

const paidTier = matched.extra?.tier;              // "read" | "buy"
if (paidTier === "buy") await issueTokenViaATS(report, settlement.payer);
```

**Reviewer's recommendation for 9 days:** separate routes (`/preview` free, `/read`, `/buy`) are
simpler to reason about and demo, and cost nothing in protocol terms. Use `accepts[]` only if a
single canonical URL matters.

### Metering — not present, all on us

Neither `@x402/core` 2.14.0 nor `@x402/hedera` 2.13.2 has quotas, credit balances, subscriptions, or
call counters. x402 is stateless — each request independently challenged and settled fresh
(`download/route.ts:31-32`: "settled fresh on every download"). Prepaid credits, per-agent rate
limits, volume discounts = our own persistence keyed on `settleResponse.payer`, which the settle
response does provide.

---

## 4. Accounts

### Funded ECDSA — testnet

Only path the repo documents (`RUNBOOK.md:19-21`, `README.md:66`):

1. `portal.hedera.com` → create testnet account, choose **ECDSA** (not the ED25519 default)
2. Auto-funded ~1000 test HBAR; shows `0.0.x` + DER/hex private key
3. Refill at `portal.hedera.com/faucet`
4. Paste into env

### Funded ECDSA — mainnet

**Not present in the repo.** No mainnet account guidance in any branch. In practice: create through a
wallet like HashPack choosing ECDSA and fund from an exchange withdrawal, or auto-create by sending
HBAR to a fresh EVM address alias (yields an ECDSA-keyed account with an EVM alias). No faucet.

Reviewer flag: exchange withdrawal + KYC can silently eat 48 hours of a 9-day budget. Day 1 item.

### How many funded accounts

With the bundled facilitator — **three**:

| Account | Purpose | Cited |
|---|---|---|
| Deployer | Deploys `FileRegistry` | `README.md:73-75` |
| Facilitator fee payer | Co-signs + pays fees + submits | `.env.example:19-21`, `facilitator/src/server.ts:41-44` |
| Buyer | Pays for resources | `scripts/x402-buy.ts` env |

Sellers need **no funded account** — `payTo` just receives.

With Blocky402 — **two**: one deployer (if deploying contracts) and one agent buyer. Seller-side
agent needs a `0.0.x` to receive but not to be funded.

### Mainnet cost

Hedera fees are USD-pegged. Reviewer quoted from knowledge, not from the repo — **verify against
hedera.com/fees before committing**:

- `CryptoTransfer` ≈ $0.0001 → a few hundred x402 settlements ≈ $0.02–0.05. Payment volume is
  essentially free.
- `TokenAssociate` ≈ $0.05 per account-token pair — only if pricing in an HTS token. Pricing in HBAR
  (`asset: "0.0.0"`) avoids association entirely (`RUNBOOK.md:326-327`).
- `ContractCreate` ≈ $1+, gas-dependent — the real cost, one-time.
- `ContractCall` — gas-based; template hardcodes `CONTRACT_EXECUTE_GAS = 3_000_000`
  (`services/web3/hederaContractWrite.ts:14`).

~25–50 HBAR estimated to cover a hackathon, dominated by contract deploys, not payments. With
Blocky402 as fee payer they absorb the per-transfer fee.

### Non-interactive account creation — not present

Confirmed across every branch. `packages/hardhat/scripts/generateAccount.ts:12-18` and
`importAccount.ts` block on `@inquirer/password`; `runHardhatDeployWithPK.ts:37` prompts again at
deploy time. `packages/foundry/scripts-js/generateKeystore.js` uses Foundry keystores, same problem.
**No `AccountCreateTransaction` anywhere in the repo.**

```ts
// scripts/create-account.ts — run locally, paste output into Vercel env
import { AccountCreateTransaction, Client, Hbar, PrivateKey } from "@hiero-ledger/sdk";

const client = (process.env.HEDERA_NETWORK === "mainnet" ? Client.forMainnet() : Client.forTestnet())
  .setOperator(process.env.HEDERA_OPERATOR_ID!,
               PrivateKey.fromStringECDSA(process.env.HEDERA_OPERATOR_PRIVATE_KEY!));

const key = PrivateKey.generateECDSA();
const receipt = await (await new AccountCreateTransaction()
  .setECDSAKeyWithAlias(key)                   // sets the EVM alias too
  .setInitialBalance(new Hbar(20))
  .execute(client)).getReceipt(client);

console.log("accountId :", receipt.accountId!.toString());
console.log("privateKey:", key.toStringDer());
console.log("evmAddress:", key.publicKey.toEvmAddress());
client.close();
```

### Verifying ECDSA vs ED25519

Mirror node, one call (`app/api/hedera/account/route.ts:22` already hits this endpoint):

```
curl -s https://testnet.mirrornode.hedera.com/api/v1/accounts/0.0.7162784 | jq '.key._type, .evm_address'
# "ECDSA_SECP256K1"   ← required
# "ED25519"           ← will fail x402 signing
```

Two more tells: an ECDSA account has a non-null `evm_address` with a real alias; and
`PrivateKey.fromStringECDSA(k)` throws on an ED25519 key, so a two-line boot assertion catches a
misconfigured env before a payment fails mid-demo.

---

## Questions closed from the first note

| Question | Answer |
|---|---|
| Can `FACILITATOR_URL` point at hosted Blocky402? | Yes — verified live on testnet and mainnet |
| Does the seller need the fee-payer key? | No, never. Read in one place, only inside `facilitator/` |
| How many funded accounts? | Two with Blocky402 (deployer + agent buyer); three with self-hosted |

## Still open

- Blocky402's rate limits and sustainability terms — their fee payer covers our buyers' fees
- Whether we deploy any Solidity to Hedera at all (affects whether a deployer account is needed)
- Mainnet HBAR acquisition path and lead time
- Whether to use `accepts[]` multi-tier or separate routes for preview/read/buy
- Idempotency: no resume if the buyer process dies between settlement and delivery

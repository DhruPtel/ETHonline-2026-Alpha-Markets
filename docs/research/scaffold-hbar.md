# Research: scaffold-hbar

**Repo:** https://github.com/hedera-dev/scaffold-hbar
**Reviewed:** Sept 4, 2026 (main + 8 template branches)
**Last upstream commit:** main 2026-09-03 · templates/x402-pay-per-use 2026-08-24 — actively maintained

---

## What it is

A Hedera fork of Scaffold-ETH 2. A **template to clone**, not a library — Yarn 3 workspaces monorepo
(`packages/hardhat`, `packages/foundry`, `packages/nextjs`). Nothing published to npm except
peripheral UI packages.

Tutorial path: `npm create scaffold-hbar@latest` → pick a template → local Hedera-forked Hardhat node
→ deploy `HederaToken.sol` + `HtsTokenCreator.sol` → Next.js app with a `/debug` page that
auto-generates a form per ABI function. End state is a browser-wallet dApp doing the
contract-deploy-and-poke loop.

**`main` is frontend-wallet only.** `@hiero-ledger/sdk` is declared in `packages/nextjs/package.json`
but never imported anywhere on that branch. All server-side Hedera code lives on template branches.

---

## Branches — where the value is

Read without checking out: `git show origin/templates/<name>:<path>`

| Branch | Contains |
|---|---|
| `templates/x402-pay-per-use` | Full x402 on Hedera + self-hosted facilitator |
| `templates/hedera-demo` | Server-side operator wallet, HTS airdrop, HCS topics |
| `templates/oracles` | Chainlink/Pyth/Supra behind one IPriceOracle |
| `bridge`, `cross-chain-dca`, `payments-scheduler`, `tokenize-subscriptions`, `blank-template` | Not relevant |

---

## Stack

Node ≥ 20.18.3 · Yarn 3.2.3 via Corepack · TS 5.8 · Next.js 15.2.8 App Router · React 19.2.3 ·
Solidity 0.8.28.

Hedera SDK is `@hiero-ledger/sdk` ^2.80.0 — the Linux Foundation rename of `@hashgraph/sdk`.

x402 branch adds: `@hiero-ledger/proto` ^2.25.0, `@hashgraph/hedera-wallet-connect` ^2.1.3,
`@x402/core` ^2.14.0, `@x402/hedera` ^2.13.2.

**Note on package names:** the Hedera x402 lineage is `@x402/core` + `@x402/hedera`, not
`x402-express` / `x402-fetch`.

### Version conflicts found

1. **`main` sabotages x402.** `next.config.ts:23-30` sets `"@x402/evm": false` / `"@x402/core": false`
   webpack fallbacks plus `webpack.IgnorePlugin({ resourceRegExp: /^@x402\// })`. Added to stop the
   Coinbase CDP SDK's lazy peer imports from breaking the build. Importing `@x402/core` on main gets
   silently stubbed to `false`. Only affects you if cloning main.
2. **wagmi major split.** `main` = wagmi 2.19.5 + RainbowKit. `x402-pay-per-use` and `hedera-demo` =
   wagmi ^3.6.0 + `@reown/appkit`, no RainbowKit. Branch components can't be copied into main without
   a 2→3 migration.
3. **Node polyfills.** Server-side branches add `crypto-browserify`, `stream-browserify`, `buffer`,
   `process`, `util`, `assert`. `main` has none.

---

## Coverage against our build

| Need | Status | Location |
|---|---|---|
| Server-side wallet from env | ✅ ~20 lines, liftable | `hedera-demo:services/hederaClient.ts` |
| Sign + submit Hedera tx | ✅ liftable | `hedera-demo:app/api/hedera/airdrop/route.ts` (HTS only, no HBAR example server-side) |
| Account creation / funding | ❌ not present | Repo assumes Hedera Portal faucet. `generateAccount.ts` is an EVM deployer key, password-prompt-gated, unusable in CI |
| HTS token creation (SDK) | ⚠️ deliberately removed | `hedera-demo:app/api/hedera/create-token/route.ts` returns HTTP 410 — "create tokens on the client with WalletConnect" |
| HTS token creation (Solidity) | ✅ reference | `packages/hardhat/contracts/HtsTokenCreator.sol` via 0x167 precompile |
| Deploy Solidity to Hedera | ✅ well covered | `hardhat.config.ts:52-67` (testnet 296 / mainnet 295), Sourcify verify only |
| Testnet ↔ mainnet switch | ❌ 7 separate places | see below |
| x402 | ✅ best thing in the repo | `templates/x402-pay-per-use` |
| Asset Tokenization Studio | ❌ zero references, all 9 branches | — |
| The Graph / subgraphs / GraphQL | ❌ not present | — |
| Arc / USDC / prediction markets | ❌ not present | — |

Roughly 35% coverage of our build. Nothing for ATS, Graph, Arc, or settlement.

### Network switching — 7 locations

`scaffold.config.ts:24` (targetNetworks literal) · `scaffold.config.ts:36-37` (rpcOverrides) ·
`hardhat.config.ts:52-66` · `foundry.toml:16-18` · `utils/scaffold-hbar/hederaAccountId.ts:12` ·
`app/api/hedera/account/route.ts:4-6` · `X402_NETWORK` + `NEXT_PUBLIC_X402_NETWORK` (two env vars
that must agree, nothing validates this).

**Every fallback silently resolves to testnet.** A missing env var gives a working-but-wrong network
rather than a crash.

---

## x402 implementation detail

| Piece | File | Liftable |
|---|---|---|
| 402 gate — challenge → verify → settle → deliver | `app/api/files/[id]/download/route.ts` | Near-verbatim; swap file lookup for report lookup |
| Resource-server singleton | `services/x402/server.ts` | Verbatim; cached promise, clears on failure |
| Request → x402 HTTPRequestContext adapter | same file, `makeHttpContext()` | Verbatim |
| Server-side buyer w/ env private key | `scripts/x402-buy.ts` | Yes — the agent payment path |
| Self-hosted facilitator | `facilitator/src/server.ts` (~120 lines) | Yes, but off-Vercel |
| Browser HashPack signer | `services/x402/walletSigner.ts` | Only for in-browser buyers |
| Tinybar/HBAR math | `utils/x402.ts` | Yes |

**Architecture:** the Next.js app never holds a key. It calls `FACILITATOR_URL`; the facilitator
co-signs as fee payer and submits. Non-custodial by construction.

`aliasPolicy: "reject"` (`facilitator/src/server.ts:59`) forces `payTo` to be a concrete `0.0.x`,
blocking fee-payer-funded auto-account-creation.

**Open question:** the template self-hosts a facilitator. Blocky402 is hosted
(`api.testnet.blocky402.com` / `api.blocky402.com`, no API key) and is what the Hedera prize names.
Whether `FACILITATOR_URL` can simply point at Blocky402 instead of running `facilitator/` locally is
untested — worth verifying, since it would remove the Docker dependency, the off-Vercel deploy, and
one funded account.

---

## Minimum path — server-side HBAR transfer

Three env vars, one copied file, ~50 lines. Does not require the monorepo, Hardhat, or Foundry —
just `yarn add @hiero-ledger/sdk` in an existing Next.js app.

```
HEDERA_OPERATOR_ID=0.0.xxxxxx          # must be ECDSA
HEDERA_OPERATOR_PRIVATE_KEY=0x...      # never NEXT_PUBLIC_
HEDERA_NETWORK=testnet                 # or mainnet
```

```ts
// lib/hedera.ts — hardened vs original: fail-fast, explicit ECDSA
import { AccountId, Client, PrivateKey } from "@hiero-ledger/sdk";

const network = (process.env.HEDERA_NETWORK ?? "").toLowerCase();
const operatorId = process.env.HEDERA_OPERATOR_ID;
const operatorKey = process.env.HEDERA_OPERATOR_PRIVATE_KEY;

if (!operatorId || !operatorKey) throw new Error("HEDERA_OPERATOR_ID / _PRIVATE_KEY required");
if (network !== "testnet" && network !== "mainnet") throw new Error(`bad HEDERA_NETWORK: "${network}"`);

export function getHederaClient(): Client {
  const client = network === "mainnet" ? Client.forMainnet() : Client.forTestnet();
  client.setOperator(AccountId.fromString(operatorId!), PrivateKey.fromStringECDSA(operatorKey!));
  return client;
}
```

```ts
// app/api/agent/transfer/route.ts
export const runtime = "nodejs";   // gRPC — will NOT work on edge
export const maxDuration = 30;     // getReceipt() exceeds Vercel's 10s default

const tx = await new TransferTransaction()
  .addHbarTransfer(client.operatorAccountId!, amount.negated())
  .addHbarTransfer(AccountId.fromString(to), amount)
  .execute(client);
const receipt = await tx.getReceipt(client);
// finally { client.close(); }  ← serverless hangs on open gRPC channels otherwise
```

For HTS instead of HBAR: swap for `.addTokenTransfer(TokenId.fromString(id), account, ±amountInt)` —
integer smallest-units, no `Hbar` wrapper. Recipient must have associated the token first or you get
`TOKEN_NOT_ASSOCIATED_TO_ACCOUNT`. Pattern at `airdrop/route.ts:47-56`.

---

## Gotchas

**Serverless-specific (three lines, each costs an hour if missed):**
- `runtime = "nodejs"` — Hedera SDK uses gRPC, dies on edge runtime
- `maxDuration = 30` — Vercel default 10s is too tight for consensus + receipt
- `client.close()` in `finally` — otherwise the function hangs on open gRPC channels

**Account setup:**
- x402 on Hedera **requires ECDSA accounts** (`RUNBOOK.md:324`). ED25519 fails late and confusingly.
- The template's facilitator needs its own funded account, separate from deployer and seller —
  three funded accounts minimum in that configuration.

**Other:**
- `X402_NETWORK` and `NEXT_PUBLIC_X402_NETWORK` must match; nothing validates this.
- `yarn hardhat:deploy` without `--network localhost` hits the in-process network, not your fork.
- Hedera JSON-RPC caps `eth_getLogs` at a **7-day window** (`RUNBOOK.md:336-337`). The repo works
  around this by reading `getFileCount` + `getFiles` instead of logs. Relevant if we ever read
  Hedera event history older than 7 days — use the mirror node REST API or on-chain getters.
- `RUNBOOK.md:342`, repo's own words: pin `@x402/hedera`, the package is young, expect API churn.
  Pin exact versions, no carets.

**Vercel-hostile:**
- Docker (MinIO + facilitator) via `yarn infra:up`
- MinIO defaults `minioadmin/minioadmin`, `S3_FORCE_PATH_STYLE=true`
- `yarn hardhat:account:generate` uses an interactive password prompt — unusable in CI
- No route sets `maxDuration`
- `vercel.json` is only `{"installCommand": "yarn install"}`; Corepack comes from
  `ENABLE_EXPERIMENTAL_COREPACK=1` in an npm script, so dashboard-triggered deploys won't get it

**Hardcoded values:**
- `scaffold.config.ts:40` — shared WalletConnect project id `3a8170812b534d0ff9d794f19a901d64`
- `hardhat.config.ts:29` — well-known Anvil key as default deployer
- `packages/foundry/Makefile:18` — another Anvil key; `.env.example:19` ships a live-looking Alchemy key
- `services/web3/hederaContractWrite.ts:14` — `CONTRACT_EXECUTE_GAS = 3_000_000` flat
- `deploy/02_create_hts_token.ts:31` — `hbarValue = 100_000_000n`; skips creation on non-local networks silently
- `contracts/deployedContracts.ts` — committed chain-296 addresses

---

## Verdict from the review

**Copy specific files; don't clone the monorepo.**

Ranked:
1. `hedera-demo:services/hederaClient.ts` — server-side agent wallet
2. `x402-pay-per-use:app/api/files/[id]/download/route.ts` — the 402 loop
3. `x402-pay-per-use:services/x402/server.ts` — resource server + adapter
4. `x402-pay-per-use:facilitator/` — only if not using Blocky402
5. `x402-pay-per-use:scripts/x402-buy.ts` — agent as buyer
6. `hedera-demo:app/api/hedera/airdrop/route.ts` — shape reference for signed transfers
7. `utils/scaffold-hbar/hederaAccountId.ts` + `app/api/hedera/account/route.ts` — EVM ↔ 0.0.x
8. `packages/hardhat/` — only if deploying Solidity to Hedera

Reasoning given: cloning means inheriting Yarn 3 workspaces, a Foundry package with four git
submodules, and a wagmi-2 lineage that conflicts with the wagmi-3 branches holding the wanted code.
But `templates/x402-pay-per-use` is a complete, well-commented x402-on-Hedera implementation, and
building it from `@x402/hedera` docs alone was estimated at two days.

---

## Open questions raised

- Can `FACILITATOR_URL` point at hosted Blocky402 instead of self-hosting? (untested)
- Do we deploy any Solidity to Hedera at all, or does ATS handle the report token? (affects whether
  `packages/hardhat` is needed)
- Server-side HTS token creation was removed from the template — if we need it, we write it ourselves
- Where do funded ECDSA accounts come from, and how many do we need?

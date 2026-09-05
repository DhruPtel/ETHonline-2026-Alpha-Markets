# Research: Asset Tokenization Studio

**Repo:** https://github.com/hashgraph/asset-tokenization-studio
**Reviewed at:** commit `be4f860e408ec5b1a24d12feb6f872aabff69319` — "feat: v8.0.0 (#1298)", 2026-06-24, main
**Reviewed:** Sept 4, 2026

> **Network available.** The reviewer installed the SDK, imported it in Node, drove it against live
> Hedera testnet, and queried the mainnet fee schedule. **Every runtime claim below is measured unless
> marked otherwise.** No funded Hedera key, so no write was signed — reads and cost measurements are
> real; write-path claims are marked.

---

## 0. The dependency question — NO CONFLICT

`@hashgraph/asset-tokenization-sdk@8.0.0` depends on **`@hashgraph/sdk`** (the *old* name), pinned
**exactly to 2.64.5**, as a **direct** dependency. **Zero peerDependencies**
(`packages/ats/sdk/package.json`, verified identical on npm).

Different package name from `@hiero-ledger/sdk` ⇒ npm never has to reconcile them. That's the whole
answer.

The agent-kit reasoning was correct and simply doesn't transfer: agent-kit *peers* on
`@hiero-ledger/sdk ^2.86.2` — **same name**, so npm must unify and 2.85.0 fails. ATS uses a different
name, so there's nothing to unify.

Dual install verified — exit 0, 34 s, no ERESOLVE:

| path | version |
|---|---|
| `node_modules/@hashgraph/sdk` | 2.64.5 (ATS declared) |
| `node_modules/@hiero-ledger/sdk` | 2.79.0 (ATS actual — see below) |
| `node_modules/@x402/hedera/node_modules/@hiero-ledger/sdk` | **2.85.0 ← x402's exact pin, nested** |
| `node_modules/@x402/hedera/node_modules/@hiero-ledger/proto` | **2.31.0 ← x402's exact pin, nested** |

x402 gets exactly its pins. Both import in one process (ATS 1468 ms, x402 184 ms).

⚠️ **Phantom dependency:** v8.0.0 source imports `@hiero-ledger/sdk` in **30 files** and
`@hashgraph/sdk` in **zero**. It's satisfied transitively via
`@hashgraph/hedera-wallet-connect@2.1.2` → `@hiero-ledger/sdk@2.79.0`. It works, but it's undeclared —
if that transitive shifts, ATS breaks.

**The `instanceof` warning is real but won't bite us.** Measured:

```
ATS-side AccountId === x402-side AccountId ?  false
cross instanceof: false      same-copy instanceof: true
```

It only fires if SDK objects cross the boundary. x402 verifies payment, ATS moves tokens — keep the
boundary strings (`"0.0.12345"`, tx id hex) and the two never meet.

Heavy runtime deps: `ethers ^6.15.0` yes. **hardhat no** (verified absent). But the weight problem is
much worse than ethers, and it's elsewhere — see §5c.

---

## 1. What this is

Monorepo, two unrelated products (ATS + "Mass Payout"). ATS is three pieces:

- **`packages/ats/contracts`** — Solidity, ERC-2535 diamond, ERC-3643/ERC-1400 lineage. Published as
  `@hashgraph/asset-tokenization-contracts@8.0.0` (ABIs + typechain). **Audited** — audit report PDF
  in the repo root.
- **`packages/ats/sdk`** — TypeScript SDK. Published as `@hashgraph/asset-tokenization-sdk@8.0.0`.
- **`apps/ats/web`** — React dApp (CRA-era, `REACT_APP_*`). Not published — reference code.

**Intended tutorial path:** deploy your own contracts with hardhat → capture factory + resolver
addresses → point the SDK or web app at them → create an equity/bond **through a browser wallet**.
**Server-side is not the happy path.**

**Maintenance:** not archived, 32 stars, **74 open issues**, repo pushed 2026-08-21, last commit on
main 2026-06-24 (~2.5 months stale). 4 human contributors. Releases: v5.0.0 Mar 6 → v6.0.0 Mar 20 →
v7.0.0 Apr 30 → **v8.0.0 Jun 24 — four majors in under four months.** Pin exact versions, never `^`.

---

## 2. Read these first

| # | Path | Why | Time |
|---|---|---|---|
| 1 | `packages/ats/contracts/contracts/factory/Factory.sol` :200–340 | **THE HEART.** `deployEquity` / `deployBond` / `deployDepositToken` — the entire creation semantics | 15 min |
| 2 | `packages/ats/sdk/__tests__/port/in/Bond.test.ts` :69–135 | **The only working server-side-with-a-private-key example in the repo.** The docs don't have one | 10 min |
| 3 | `packages/ats/contracts/contracts/factory/IFactory.sol` :60–140 | `SecurityData` struct — every field you must supply, with the escape hatches | 10 min |
| 4 | `packages/ats/sdk/src/app/service/transaction/TransactionService.ts` :38–64 | `getHandlerClass` — the `isWeb()` gate that decides the whole server-side story. **The one that changes the architecture** | 5 min |
| 5 | `packages/ats/contracts/deployments/hedera-testnet/newBlr-2026-06-12T11-19-42-198.json` | Skim `.summary` only: 108 facets, 180 M gas, 28.6 min | 3 min |

---

## 3. The minimum path

> **Recommendation up front: do not install `@hashgraph/asset-tokenization-sdk`.** Use
> `@hashgraph/asset-tokenization-contracts` (ABIs) + `ethers` directly. Measured: **110 MB / 12
> packages vs 1.4 GB / 881 packages.** The ABI package exposes `Factory__factory.deployEquity` and
> `IAsset__factory` with `issue`, `transfer`, `balanceOf`, `grantRole`, `setCustomData` — 496
> functions, everything needed. **We are still using ATS; the contracts are ATS.**

### a. Issue one asset, server-side, from env keys

```
npm i @hashgraph/asset-tokenization-contracts@8.0.0 ethers@6
```

```
HEDERA_RPC_URL=https://mainnet.hashio.io/api      # testnet: https://testnet.hashio.io/api
HEDERA_OPERATOR_KEY=0x<raw ECDSA hex>
ATS_FACTORY_ADDRESS=0x<factory EVM address>       # from OUR deployment (see §6b)
ATS_RESOLVER_ADDRESS=0x<BusinessLogicResolver EVM address>
```

```ts
import { ethers } from "ethers";
import { Factory__factory, IAsset__factory } from "@hashgraph/asset-tokenization-contracts";

// ISIN check digit — mirrors contracts/factory/isinValidator.sol. Verified against
// US9311421039 / GB0002634946 / US0378331005. Deploy reverts WrongISINChecksum without it.
function makeIsin(first11: string): string {
  const conv: number[] = [];
  for (const ch of first11) {
    const c = ch.charCodeAt(0) > 57 ? ch.charCodeAt(0) - 55 : ch.charCodeAt(0) - 48;
    c > 9 ? conv.push(Math.floor(c / 10), c % 10) : conv.push(c);
  }
  const pairing = (conv.length + 1) % 2;
  let sum = 0;
  conv.forEach((d, i) => { const c = d * (i % 2 === pairing ? 2 : 1); sum += c > 9 ? Math.floor(c / 10) + (c % 10) : c; });
  return first11 + String((10 - (sum % 10)) % 10);
}

const ZERO = "0x0000000000000000000000000000000000000000";
const DEFAULT_ADMIN_ROLE = "0x" + "00".repeat(32);
const ISSUER_ROLE = "0x5eeaf5602c75bf26e73b5206d0bd6ee82f621166255e5fd73cc06bc7bd84a95f";
const EQUITY_CONFIG_ID = "0x" + "00".repeat(31) + "01";   // equity = 1, bond = 2

export async function issueReportToken(reportId: string, reportUri: string) {
  const provider = new ethers.JsonRpcProvider(process.env.HEDERA_RPC_URL!);
  const wallet = new ethers.Wallet(process.env.HEDERA_OPERATOR_KEY!, provider);
  const factory = Factory__factory.connect(process.env.ATS_FACTORY_ADDRESS!, wallet);

  const equityData = {
    security: {
      resolver: process.env.ATS_RESOLVER_ADDRESS!,
      maxSupply: 0n,                                   // 0 = unlimited
      resolverProxyConfiguration: { key: EQUITY_CONFIG_ID, version: 1n },
      erc20MetadataInfo: {
        name: `Report ${reportId}`, symbol: "RPT",
        isin: makeIsin("XX0RPT00001"), decimals: 0,
      },
      rbacs: [{ role: DEFAULT_ADMIN_ROLE, members: [wallet.address] }],
      externalPauses: [], externalControlLists: [], externalKycLists: [],
      compliance: ZERO,          // ← disables ERC-3643 compliance
      identityRegistry: ZERO,    // ← disables identity checks
      arePartitionsProtected: false, isMultiPartition: false,
      isControllable: true,      // keep true: allows force-transfer if a buyer flow breaks
      isWhiteList: false,
      clearingActive: false,
      internalKycActivated: false,  // ← THE important one; see §4d
      erc20VotesActivated: false,
    },
    equityDetails: {
      votingRight: false, informationRight: false, liquidationRight: false,
      subscriptionRight: false, conversionRight: false, redemptionRight: false,
      putRight: false, dividendRight: 0,
      currency: "0x455552",                 // "EUR" as bytes3
      nominalValue: 0n, nominalValueDecimals: 0,
    },
  };
  const regulationData = {
    regulationType: 0, regulationSubType: 0,
    additionalSecurityData: { countriesControlListType: false, listOfCountries: "", info: reportUri },
  };

  const tx = await factory.deployEquity(equityData, regulationData, { gasLimit: 12_000_000 });
  const rc = await tx.wait();
  const ev = rc!.logs
    .map(l => { try { return factory.interface.parseLog(l); } catch { return null; } })
    .find(p => p?.name === "EquityDeployed");
  const tokenAddress = ev!.args[1] as string;

  // Creation grants ONLY DEFAULT_ADMIN. Must grant ISSUER before minting.
  const token = IAsset__factory.connect(tokenAddress, wallet);
  await (await token.grantRole(ISSUER_ROLE, wallet.address)).wait();
  await (await token.issue(wallet.address, 1n, "0x")).wait();

  return tokenAddress;
}
```

### b. Transfer to the buyer — our lifecycle operation

```ts
export async function transferReportToken(tokenAddress: string, buyerEvmAddress: string) {
  const provider = new ethers.JsonRpcProvider(process.env.HEDERA_RPC_URL!);
  const wallet = new ethers.Wallet(process.env.HEDERA_OPERATOR_KEY!, provider);
  const token = IAsset__factory.connect(tokenAddress, wallet);
  const tx = await token.transfer(buyerEvmAddress, 1n, { gasLimit: 1_000_000 });
  return (await tx.wait())!.hash;   // ← the lifecycle operation
}
```

### c. Contracts deployed per asset

- **One-time infrastructure:** 3 infra contracts (ProxyAdmin, BusinessLogicResolver, Factory) + 108
  facets + 8 configurations = **111 deploys**, `gasUsed: 180,285,436`,
  `deploymentTime: 1,714,928 ms` (**28.6 min**) — read from the deployment record's own `.summary`.
- **Per asset: exactly ONE contract.** A thin `ResolverProxy` diamond pointing at the shared resolver.
  Confirmed against the live testnet factory: `created_contract_ids` is length 1 on every deploy.

### d. Mainnet cost — measured

Live mainnet fee schedule: **108 tinybars/gas** for ContractCreate/ContractCall. Live HBAR rate:
**$0.0787876**.

| | gas | HBAR | USD |
|---|---|---|---|
| One-time infra | 180,285,436 | 194.7 | ~$15.3 (gas only) |
| One-time infra, repo's own budget | — | ~500 | ~$39 (incl. file-service bytecode upload) |
| **Per asset** (avg of 8 real testnet deploys) | 7,066,549 | 7.63 | **$0.60** |
| Per asset, worst case at 15 M gas limit | 15,000,000 | 16.2 | $1.28 |

Plus `grantRole` + `issue` + `transfer` + `setCustomData` ≈ 4 calls, each well under 1 HBAR.

**~$1–2 per report, on a one-time ~$39 base. Cost is not the problem. Time is. Budget 500 HBAR.**

### e. How long

Per-asset deploy is a single transaction; Hedera finality is 3–5 s. Measured live SDK read round-trip
at 4,303 ms. Expect **5–15 s per operation**, so deploy + grantRole + issue + transfer ≈ **30–60 s end
to end**.

**The one-time infra deploy is the real clock: 28.6 min measured on testnet — budget 45–60 min on
mainnet with rate-limit retries.**

### f. Metadata — yes, but it's a second transaction

`ERC20MetadataInfo` is only `{name, symbol, isin, decimals}` — **no URI field** (unlike an HTS NFT,
which has one natively). Two options:

1. **`setCustomData(bytes32 key, bytes[] value)`** — arbitrary on-chain key→bytes[]
   (`contracts/facets/customData/ICustomData.sol`). Overwrites the whole array, no append. **Needs
   `ROLE_CUSTOM_DATA_MANAGER` granted first.** This is the report pointer.
2. **`additionalSecurityData.info`** — free string set at creation, emitted in the `EquityDeployed`
   event (used in the code above). Free, but event-only.

---

## 4. Mandatory vs optional

**Genuinely required:** `resolver`, `resolverProxyConfiguration{key,version}`,
`erc20MetadataInfo{name,symbol,isin,decimals}`, at least one non-zero `DEFAULT_ADMIN_ROLE` member in
`rbacs`, `regulationType`/`regulationSubType`, and for equity: `currency` (bytes3), `nominalValue`,
`nominalValueDecimals`, plus 7 boolean rights + `dividendRight`. **`isin` is checksum-validated
on-chain** — the only "required" field that's genuinely annoying.

**Skippable entirely:** `compliance: address(0)`, `identityRegistry: address(0)`,
`internalKycActivated: false`, `isWhiteList: false`, `clearingActive: false`,
`arePartitionsProtected: false`, `isMultiPartition: false`, `erc20VotesActivated: false`, all three
external list arrays empty. Dividends, voting, coupons, corporate actions, clearing, hold/lock are
facets you simply never call.

**No "bare minimum" preset.** You fill every field. `deployDepositToken` is the lightest type (no
SecurityFacet, no dividend/voting init) but still demands a valid ISIN.

### ✅ KYC does NOT block the transfer — verified in the code path

`KycStorageWrapper.verifyKycStatus` (:206–210) is
`(!internalKycActivated || statusMatches) && isExternallyGranted(...)`, and `isExternallyGranted`
returns true when the external-list array is empty (loop never runs). The identity-registry check
staticcalls through `LowLevelCall.functionStaticCall`, which returns empty bytes for `address(0)`
(`contracts/infrastructure/utils/LowLevelCall.sol:28–30`), and empty returndata passes.

**With `internalKycActivated: false` + `identityRegistry: address(0)` + no external lists, an
arbitrary Hedera account receives with zero onboarding.**

**Genuine bonus:** ATS tokens are **plain ERC-20 on the Hedera EVM, not HTS tokens** — so **there is
no token-association step.** A real advantage over the HTS NFT alternative.

---

## 5. Server-side and serverless

### a. ⚠️ This is the actual problem — not the dependency

`SupportedWallets` (`src/domain/context/network/Wallet.ts:5–13`) is `METAMASK`, `HWALLETCONNECT`,
`DFNS`, `FIREBLOCKS`, `AWSKMS`. **The line `CLIENT = 'Client'` is commented out. There is no raw
private-key signer.**

Worse, `TransactionService.getHandlerClass` (:38–51):

```ts
case SupportedWallets.METAMASK:
  if (!Injectable.isWeb()) throw new InvalidWalletTypeError();
```

and `isWeb() = !!global.window`. **`Network.connect({wallet: METAMASK})` throws in Node.**

The repo's own tests get around it with two internal APIs — `Injectable.isWeb = jest.fn(() => true)`
and `RPCTransactionAdapter.setSignerOrProvider(new Wallet(pk, provider))`. Checked whether those are
reachable from npm:

```
require('@hashgraph/asset-tokenization-sdk/build/cjs/src/core/injectable/Injectable')
  → ERR_PACKAGE_PATH_NOT_EXPORTED
Injectable in public exports: false     RPCTransactionAdapter: false
```

The exports map allows only `"."`. **The published SDK has no supported server-side private-key
path.** The three custodial adapters (DFNS/Fireblocks/AWS KMS) are the sanctioned answer — each needs
an external service account.

**A workaround exists and was proven to run** — shim `global.window.ethereum` with a ~40-line EIP-1193
provider backed by an ethers Wallet, before importing the SDK:

```ts
const eip1193 = {
  isMetaMask: true,
  isConnected: () => true,
  on: () => eip1193, removeListener: () => eip1193,
  async request({ method, params = [] }) {
    switch (method) {
      case "eth_requestAccounts": case "eth_accounts": return [wallet.address];
      case "eth_chainId": return "0x127";                    // 295 mainnet, 0x128 = 296 testnet
      case "eth_sendTransaction": {
        const tx = { ...params[0] }; delete tx.from;
        if (tx.gas) { tx.gasLimit = tx.gas; delete tx.gas; }
        return (await wallet.sendTransaction(tx)).hash;
      }
      default: return provider.send(method, params);
    }
  },
};
global.window = { ethereum: eip1193, addEventListener(){}, removeEventListener(){}, dispatchEvent(){} };
global.ethereum = eip1193;
```

With that, in plain Node: `Network.init` ✅, `Network.connect(METAMASK)` ✅, and a live testnet read
returned real data in 4,303 ms. Signed writes untested — no funded key.

**It works. It's also ~40 lines of load-bearing hack around a gate the maintainers put there
deliberately. Reviewer's advice: don't. Use ethers + the ABI package.**

### b. Connections / module state

Heavy module-scope state: `@singleton()` on essentially every service via a tsyringe container built
at import; `Injectable.ts` registers adapters at module scope; `Network.connect` mutates a
module-scoped `NetworkService`. **You cannot open/close per invocation** — you configure once per cold
start and it persists. Fine for a single network; concurrent requests targeting different networks
would race.

✅ **No gRPC in the path we'd use.** The consensus-node gRPC `Client` only appears in
`CustodialTransactionAdapter.initClient` (`Client.forMainnet()`). The MetaMask/RPC path is plain
ethers JSON-RPC over HTTP. **Avoid custodial adapters and we hold no long-lived sockets** — the thing
that bit us before doesn't apply here.

### c. ⚠️ Bundle size — the disqualifier for Vercel

Production install of `@hashgraph/asset-tokenization-sdk` alone: **1.4 GB, 881 packages.** Cold
`require` measured at **2,790 ms**.

| package | size |
|---|---|
| `@reown` | 420 MB |
| `@walletconnect` | 224 MB |
| `@hashgraph` | 142 MB |
| `viem` | 76 MB |
| `hermes-compiler` | 47 MB |
| `react-native` | 36 MB |
| `@react-native` | 24 MB |
| `@phosphor-icons` | 22 MB |
| `@solana` | 19 MB |
| `ethers` | 20 MB |

A server-side token SDK that ships React Native, Solana, and an icon font. `hardhat` is absent —
the one mercy.

**Vercel's serverless unzipped limit is 250 MB.** `@vercel/nft` traces from the SDK's barrel index,
which imports every adapter including WalletConnect and Reown. **We will very likely blow the limit.**

`@hashgraph/asset-tokenization-contracts` + `ethers@6` = **110 MB, 12 packages. 13× smaller, and it
has every function we need.**

### d. Browser-only assumptions

Mostly guarded — `window.localStorage` is behind `typeof window === "undefined"`,
`registerMetamaskEvents` guards on `globalThis.window.ethereum`. **The hard gate is `isWeb()`.**

Separately, `@hashgraph/hedera-wallet-connect@2.1.2` is **broken in Node entirely** —
`Directory import '.../dist/lib' is not supported resolving ES modules`, so `HWALLETCONNECT` can't
even load server-side.

---

## 6. Mainnet

**Yes, it works.** Nothing testnet-gates the code: `Environment` includes `"mainnet"`, contracts
config has `hedera-mainnet` chainId 295, `Client.forMainnet()` exists.

⚠️ **There is NO pre-deployed mainnet infrastructure. We deploy our own.**

- `packages/ats/contracts/deployments/` contains only `hedera-testnet/` and `hedera-hashsphere/`.
  **No `hedera-mainnet/`.**
- `docs/ats/developer-guides/contracts/deployed-addresses.md` lists testnet only, **and it's stale** —
  documents "Smart Contract Version: 4.0.0" (BLR `0.0.7707874`, Factory `0.0.7708432`, dated
  2026-01-22) while the repo is at 8.0.0.
- **Testnet addresses that actually work today** (from `apps/ats/web/.env.example`, verified live):
  resolver `0.0.9212226`, factory `0.0.9213391`. That factory has `nonce: 61` and deployed a security
  ~5 h before the review — genuinely active.

⚠️ **Both expire 2026-09-10** (`expiration_timestamp: 1789039172`) — **5.3 days out, inside our
9-day window.** Hedera doesn't currently enforce contract expiry so they'll probably survive, but
**don't let a demo depend on someone else's testnet contract.**

**Mainnet gotchas:** set `HEDERA_MAINNET_PRIVATE_KEY_0`; hardhat validates **all** configured keys at
startup (their own `.env.example` warns "Only uncomment the network(s) you plan to use"); Hashio
mainnet rate-limits harder than testnet, so consider a paid relay for a 111-contract deploy; the 15 M
gas/tx cap means the deploy script batches facets, and **a mid-run failure leaves you partially
deployed.**

---

## 7. Is this the right tool?

**We're fighting it — mildly.** ATS is an ERC-3643/ERC-1400 securities stack: partitions, cap tables,
dividends, coupons, corporate actions, clearing, SSI/verifiable-credential KYC, REG_S/REG_D regulation
metadata. Our asset is a report. We set ~12 booleans to false and invent an ISIN.

The ISIN is the clearest tell: `isinValidator.sol` enforces 12 chars + a real ISO-6166 check digit for
a document that has no ISIN. Harmless — the live testnet data shows everyone doing it (reviewer read a
real deployed security with ISIN `ZZODIM8DMYD1`) — but it shows the shape of the mismatch.

**The mismatch is cosmetic. Nothing in ATS actively obstructs us once KYC and compliance are off.**

**A plain HTS NFT would do everything we need, and better:** ~30 lines, a native metadata field (ATS
has none — needs a second `setCustomData` tx plus a role grant), ~$1 to create, ~$0.05/mint, zero
infrastructure deploy, private key from env with no shims. The one thing it costs: HTS requires the
recipient to associate the token or hold auto-association slots — which ATS's pure-ERC-20 approach
avoids. **If the tokenization track didn't exist, HTS NFT would be the obvious call.**

### Cheapest honest path to qualifying

The track says **"SDK, contracts, or web app"** — **contracts count.** So:

1. Deploy ATS infra to mainnet once via the repo's hardhat script (~29 min, ~500 HBAR). **Deploying
   from published, audited source is also what satisfies the HashScan-verified requirement.**
2. In Next.js, use `@hashgraph/asset-tokenization-contracts` + ethers (110 MB) to call
   `Factory.deployEquity` per published report.
3. `grantRole(ISSUER)` → `issue()` → `transfer()` on Buy = the lifecycle operation. **Transfer is
   unambiguously a lifecycle op, and it's the one already planned.**
4. `setCustomData(keccak256("report"), [uri])` to point the token at the report.
5. **Never install the ATS SDK.**

**If we drop the track:** we lose one track's eligibility. We keep x402-on-Hedera, The Graph, the AI
agent, and Arc. Report tokens become HTS NFTs — arguably a better demo (cleaner, faster, real metadata
field). Arc references an HTS token id instead of an EVM address; equally fine. **It costs a track,
not the project.**

---

## 8. Gotchas

1. ⚠️ **The docs are wrong about the API — copy-paste fails immediately.**
   `docs/ats/developer-guides/sdk-integration.md` shows
   `new CreateEquityRequest({ tokenName, tokenSymbol, tokenDecimals, tokenTotalSupply, isin })`.
   **Not one of those field names exists.** The real request needs ~25 fields. Same doc uses
   `TransferRequest({ tokenId })` — the field is `securityId`, and `amount` is a **string**, not a
   number. **Read `Bond.test.ts` instead. ≥1 hour.**
2. ⚠️ **`Network.connect()` silently wipes the config `Network.init()` just set.** Reproduced: after
   init `getFactoryAddress()` = `"0.0.9213391"`; after connect, `""`. Cause: pairing calls
   `MetamaskService.setMetamaskNetwork(chainId)` (:200–217), which re-derives config from the
   adapter's plural registries then executes `SetNetworkCommand(network, {baseUrl:""}, …)` +
   `SetConfigurationCommand("", "")`. Symptom: `TypeError: Invalid URL` on `/contracts/0.0.x`.
   Fix: pass `factories`, `resolvers`, `mirrorNodes`, `jsonRpcRelays` to `Network.init` — not just
   `configuration`/`mirrorNode`/`rpcNode`. **Undocumented. Could eat half a day.**
3. **Phantom dependency** — SDK source imports `@hiero-ledger/sdk` (30 files) but declares
   `@hashgraph/sdk` (0 files import it). Only resolves because wallet-connect happens to pull hiero
   2.79.0.
4. **npm install of the SDK crashed once** — `npm error Exit handler never called!`, exit 1, leaving a
   corrupt tree that failed to import with a misleading `Cannot find module '@hiero-ledger/proto'`. A
   clean retry worked. **Budget one wasted install cycle.** (A naive read would misdiagnose this as a
   dependency conflict — it isn't.)
5. **1.4 GB / 881 packages / 2.8 s cold import** — §5c.
6. **`HWALLETCONNECT` is unusable in Node** — ESM directory-import error in
   `@hashgraph/hedera-wallet-connect@2.1.2`.
7. **Version churn:** four majors in four months; `deployed-addresses.md` still documents v4. Pin
   exact.
8. **ISIN checksum enforced on-chain** — generator above, verified against three real ISINs.
9. ⚠️ **Roles are not auto-granted.** Creation assigns only `_DEFAULT_ADMIN_ROLE` to
   `diamondOwnerAccount`. Must `grantRole(_ISSUER_ROLE)` before `issue`, and
   `ROLE_CUSTOM_DATA_MANAGER` before `setCustomData`. **Easy to miss; fails at runtime.**
10. **Node version:** repo `.nvmrc` says 24.15.0; SDK `engines` says `>=18.20.8`. Set Vercel's Node
    explicitly.

---

## 9. Verdict

**Use ATS, but only this narrow slice: deploy the contracts, drive them with ethers + the published
ABI package, and never install `@hashgraph/asset-tokenization-sdk`.**

The dependency question we were most afraid of is a non-issue — different package names, verified by a
real dual install, and x402 keeps its exact pins.

**The thing that would actually have killed this component is the SDK's shape:** no private-key
signer, an `isWeb()` gate that throws in Node, the escape hatches locked behind a package exports map,
a config-wiping bug on the documented happy path, and 1.4 GB of React Native and Solana that will very
likely exceed Vercel's 250 MB function limit. **Every one of those problems lives in the SDK layer and
none of them lives in the contracts.**

The contracts are audited, actively used on testnet, cost $0.60 per asset, deploy exactly one proxy
per token, let us switch off KYC/compliance/whitelisting with three constructor values so an arbitrary
buyer's transfer just works, and expose `issue`/`transfer`/`setCustomData` through a 110 MB typechain
package driven with the ethers we already have. **The Buy-tier transfer is a clean, unarguable
lifecycle operation.** The only genuine friction is a one-time ~29-minute, ~500-HBAR mainnet
infrastructure deploy and the indignity of minting an ISIN for a PDF.

### Realistic estimate: 12–18 focused hours for issue + transfer end to end on mainnet

- 3–5 h mainnet infra deploy (incl. testnet dry run, key setup, RPC rate limits, running the 29-min
  deploy at least twice)
- 3–4 h ISIN generator + assembling the `deployEquity` tuples
- 2–3 h wiring `grantRole`/`issue`/`transfer`/`setCustomData` into route handlers
- 1–2 h HashScan verification + demo capture
- 3–4 h buffer for the gotchas

**~3 days of a 9-day build.** Using the SDK instead adds 6–10 h for the window shim, the config-wipe
bug, and the bundle fight — and may still lose to the 250 MB limit.

### Cut order if it doesn't fit

1. **Mainnet → testnet.** Confirm whether the track actually requires mainnet; most Hedera tracks
   accept testnet. Removes 500 HBAR and most of the deployment risk. **Worth 10 minutes to check the
   rules before spending 5 hours.**
2. **`setCustomData` → `additionalSecurityData.info` at creation.** Saves a transaction and a role
   grant.
3. ⚠️ **Per-report tokens → one "report series" token.** Deploy a single asset once, then transfer 1
   unit per sale. **This removes `deployEquity` from the request path entirely** and the lifecycle
   operation is still the transfer. **The single biggest de-risk available** — turns per-report
   on-chain work from "deploy a contract" into "one transfer," and still satisfies issue + manage +
   lifecycle. **If day 6 arrives and tokenization isn't done, take this.**
4. **Drop the track** — last resort, and cheap: one prize, nothing else.

---

## Questions closed

| Question | Answer |
|---|---|
| Does ATS conflict with `@x402/hedera`'s SDK pin? | **No.** Different package name (`@hashgraph/sdk` vs `@hiero-ledger/sdk`). Dual install verified, x402 keeps exact pins |
| Is the ATS SDK usable server-side? | **No supported path.** No private-key signer, `isWeb()` throws in Node, escape hatches not exported. A ~40-line window shim works but is a hack |
| Can we use ATS without the SDK? | **Yes** — `@hashgraph/asset-tokenization-contracts` + ethers. 110 MB vs 1.4 GB. Still counts as ATS |
| Will the SDK fit on Vercel? | **Very likely not** — 1.4 GB install vs a 250 MB unzipped function limit |
| What does it cost per report? | ~$0.60–1.28 per asset, on a one-time ~$39 / ~500 HBAR infra deploy |
| How many contracts per asset? | **Exactly one** — a thin ResolverProxy diamond |
| Does KYC block an arbitrary buyer? | **No** — verified in the code path with `internalKycActivated: false` + `identityRegistry: address(0)` + empty lists |
| Is there token association? | **No** — ATS tokens are plain ERC-20 on the Hedera EVM, not HTS |
| Does mainnet infrastructure exist? | **No.** We deploy our own — 111 contracts, 28.6 min measured |
| Can we attach a report URI? | Yes, two ways — `setCustomData` (needs a role) or `additionalSecurityData.info` at creation (free, event-only) |

## Still open

- **Does the tokenization track actually require mainnet, or does testnet qualify?** Worth 10 minutes;
  removes ~5 hours and most of the deployment risk
- Per-report token vs one "report series" token — the series version is far cheaper and still
  qualifies, but per-report is the better story
- Whether to run the infra deploy on testnet first as a dry run (reviewer assumes yes in the estimate)
- The public testnet factory/resolver expire 2026-09-10, inside our window — don't depend on them
- Write path was never signed (no funded key) — issue/transfer code is unverified at runtime

# Arc deployment and mainnet readiness

**What it takes to stand this system up on Arc, who holds what, and what changes on mainnet.**

⚠️ **Nothing in this project deploys to Arc mainnet, and nothing can.** Arc mainnet launches
**2026-09-16**, after this submission. A6 asks for demonstrated readiness rather than a deployment,
and that is what this is: a manifest an operator could follow, with the mainnet-specific values left
as **named blanks with the source to fill each from** rather than guessed.

⚠️ **Every value below was verified against the live network, the live services or the installed
code on 2026-09-11, not copied from the tracking files.** The tracking has been stale twice this
phase — once by six units. Where a value came from a read, the read is named.

---

## 1 · What exists today, verified

| | value | how it was checked |
|---|---|---|
| Network | Arc testnet, chainId **5042002** | `eth_chainId` via the configured RPC |
| RPC | `https://rpc.testnet.arc.network` | `ARC_RPC_URL`, and it carries no credential — no user, password, query or path |
| Contract | **`0x003e7Cb791257B529bb5f9F6D17A846264d48044`** | `eth_getCode` returns 4,783 bytes |
| `resolver()` | **`0x1B7035bBe0DA8F3bcb721863D42e1079e4A116A7`** | `eth_call`; equals the analyst's Circle wallet |
| `marketCount()` / `claimCount()` | **10** / **7** | `eth_call` |
| Contract balance | **1.02 USDC** | `eth_getBalance` — markets 6 and 7's open pools |
| `MAX_STAKE()` | 1,000 USDC (18-dp native) | `eth_call` |
| `UNIT_SCALE()` | `1e12` — stakes must be whole 6-dp USDC units | `eth_call` |
| Native USDC | `0x3600000000000000000000000000000000000000`, `decimals() = 6`, `symbol() = USDC` | `eth_call` against the predeploy |
| Compiler | `solc 0.8.28+commit.7893614a`, optimizer on at 100 runs, **`evmVersion: cancun`** | `ALPHA_MARKET_BUILD` in the committed artifact |
| Source hash | `fe26c8438fea6b17b284bfc356ae7b251a230961bb28c9cce31e53560f086ee7` | same |
| Schema | **7 migrations**, 13 tables | `src/store/migrations/`, applied idempotently |
| Crons | `/api/cron/commit` at `0 22 * * *`, `/api/cron/resolve` at `0 2 * * *` | `vercel.json`, and `vercel crons ls` shows both registered |

**Readiness probe:** `/api/health` returns `ok: true` and reports whether each of four environment
variables is `set`, `absent`, or **`EMPTY — set but blank`**. ⚠️ That third state exists because
`process.env.X ?? fallback` returns `""` for a blank variable and never falls back —
`src/config/env.ts::requiredEnv` is the one guard, and this project has shipped that bug five times
plus once inside a vendor bundle.

⚠️ **`/api/health` does not yet cover `CRON_SECRET`, `ARC_MARKET_ADDRESS` or `ARC_RPC_URL`.** It has
the right mechanism and those three are not passed to it, so the route built to end exactly this
ambiguity could not answer it for the Arc variables. Their deployed state has to be read from
behaviour instead — see §8.

---

## 2 · Identities and permissions

**Five, and none can do another's job. Two of the separations are forced rather than chosen.**

⚠️ **The analyst is one actor with two keys, on two chains** — the Arc wallet that stakes and the
Hedera account that issues the token. `config/analysts.ts` is the only thing joining them, which is
why `src/arc/identity.ts` publishes a sentence signed by both so a sceptic can `ecrecover` each
instead of trusting that file. Both halves below were checked against Circle and Mirror Node today by
`scripts/ops/verify-analyst.ts`.

| identity | credential | can | ⚠️ cannot |
|---|---|---|---|
| **Circle console owner** | `CIRCLE_API_KEY` + `CIRCLE_ENTITY_SECRET` | create wallets, sign as the analyst, set the wallet-set spend cap | ⚠️ **rotate the entity secret.** `scripts/ops/provision-circle.ts` says it outright: *"a registered secret can never be rotated without re-provisioning every wallet"* |
| **The analyst, on Arc** | `CIRCLE_WALLET_ID` → `0x1B7035bBe0DA8F3bcb721863D42e1079e4A116A7` | `createMarket`, `commitPrediction`, `resolve`, `voidMarket` | ⚠️ **be swapped.** Its address is inside every report hash — see §3 |
| **The analyst, on Hedera** | `HEDERA_SELLER_ID`/`_KEY` → account `0.0.10387690`, EVM `0x32838fe90541567bbf77fa0570661f3c20e2b152`, `ECDSA_SECP256K1` | issue the report's ATS token, receive x402 payments | act on Arc — a different key entirely |
| **The deployer** | `ARC_DEPLOYER_KEY` → `0xA6B12d8418dF7F6C827AFEB3D8955A881e448079`, a plain EOA | deploy the contract | commit, resolve, or act as the analyst |
| **Any staker** | their own wallet | `stake`, `claim`, and `voidMarket` after `resolveDeadline` | resolve |

### ⚠️ Why the deployer is necessarily a different identity

`deployContract` ships in the Circle package but **not on the client this project uses**. Verified in
`@circle-fin/developer-controlled-wallets@10.8.0`: `deployContract` appears **0 times** in
`dist/developer-controlled-wallets.es.js` and in the EVM sub-client
(`dist/evm/evm.es.js`) instead. The analyst is a developer-controlled wallet, so it structurally
cannot deploy, and a separate funded EOA is required. **That is a property of the SDK, not a
convenience**, and it is why the deployer address and the resolver address differ on chain.

### ⚠️ The one access control in the contract, and it is immutable

**`resolver` is set in the constructor and has no setter.** Anyone may create a market, stake, claim,
or void after the deadline; **only the resolver settles.** It is the analyst's Circle wallet because
that is the only party that runs the Graph read and can produce a matching `evidenceHash` — a
settlement from anyone else would be an outcome with nothing behind it.

⚠️ **So a new Arc key means a NEW CONTRACT, not a reconfigured one.** There is no admin path to point
the existing deployment at a different resolver, and every `markets.chain_market_id` is meaningless
against a different address — which is why `contract_address` is stored on the market row rather than
read from the environment.

⚠️ **A restricted resolver cannot strand funds, which is what makes it safe.** `voidMarket` is
permissionless after `resolveDeadline` and `claim` is pull-based. If the resolver never fires,
refuses, or disappears, anyone voids the market and every staker withdraws their own stake. **The
worst a silent resolver can do is delay settlement to the deadline.**

⚠️ **The residual, accepted rather than solved: a dishonest resolver can settle wrongly BEFORE the
deadline** and direct the pool to the wrong side. Nothing on chain contradicts it. What exists
instead is `evidenceHash` over a reproducible read — a named deployment, a named document, a named
day — so a wrong resolution is **detectable by anyone and correctable by no one.** That is the honest
limit of a market with no oracle and no dispute layer.

---

## 3 · Recovery

**What can be recovered, what cannot, and which of those is deliberate.**

### ⚠️ The analyst's identity cannot be recovered, and is not meant to be

Lose the entity secret and every wallet derived from it is orphaned; it cannot be rotated without
re-provisioning. **The `arcAddress` is inside every report hash**, so a replacement wallet is a
**different analyst** — old reports keep their attribution to an address nobody controls, which is
correct. The record of who said what does not change because a key was lost.

**Recovery is adding a new row to `config/analysts.ts`, not restoring a key.** A second analyst needs
its own funded Circle wallet and its own Hedera account; the row shape is what makes that additive.

### Funds are never stranded, and that is a property of the contract

`voidMarket` is permissionless after `resolveDeadline` and `claim` is pull-based, so if the analyst
disappears mid-market any staker voids it and pulls their own stake out. §5.2 carries this because
the v3 interface *"couldn't void, so funds were lockable forever."* **No operational step is required
for this to hold.**

### ⚠️ The genuinely unrecoverable thing is a lost `reports` row

`src/store/reports.ts`: *"A report is stored once and never regenerated."* Narration is inside the
hash and the model call is not deterministic, so **a lost report cannot be reproduced** — a re-run
produces a different report with a different hash, and the old hash is what a token commits and a
market settles against. The on-chain hash is what proves a restored copy is the same bytes, and
`load()`'s own re-derivation is the check.

⚠️ Since Unit 15b a report's *plan* also depends on the analyst's record at the moment it was
written. `reports.context_digest` records what history the planner saw — **beside the row, outside
the hash**, because four report hashes are already committed in ATS creation events on Hedera and
nothing can amend those.

### The rest

- **The schema** is a re-run: migrations are idempotent, `IF NOT EXISTS` throughout.
- **The contract**: a redeploy is a new address. Old markets stay settleable at the old one, because
  permissionless void plus pull claim means an abandoned deployment still lets people out.
- **The deployment**: Vercel is repo-linked, so it is a push.

---

## 4 · What a fresh operator provisions

In order. **Stop before anything that spends if you are only checking the manifest is followable.**

1. **A Graph API key** → `GRAPH_API_KEY`.
2. **An Anthropic API key** → `ANTHROPIC_API_KEY`.
3. **A Neon database, and BOTH urls** → `DATABASE_URL` (pooled, host contains `-pooler`) and
   `DATABASE_URL_DIRECT` (direct). ⚠️ DDL through the pooled endpoint is unreliable — it is PgBouncer
   — and the failure presents as a timeout rather than as an error.
4. **An Ethereum archive RPC** → `ETHEREUM_RPC_URL`, for block-pinned corroboration.
5. **Hedera accounts** → `HEDERA_SELLER_ID`/`_KEY`, `HEDERA_BUYER_ID`/`_KEY`, `HEDERA_NETWORK`,
   `HEDERA_TESTNET_RPC`. The seller is the analyst's Hedera identity; the buyer is the paying agent.
6. **Circle**: register the entity secret, create a wallet set, create **one EOA wallet** on the Arc
   network, fund it. `scripts/ops/provision-circle.ts` walks this and SM-08 has walked it once on the
   record. → `CIRCLE_API_KEY`, `CIRCLE_ENTITY_SECRET`, `CIRCLE_WALLET_ID`.
   ⚠️ **Set the wallet-set spend cap here** — see §7, it is the only guard that exists.
7. **A funded deployer EOA** → `ARC_DEPLOYER_KEY`. A different key from the analyst, necessarily (§2).
8. **An Arc RPC url** → `ARC_RPC_URL`. ⚠️ It is handed to visitors' wallets by `/markets/[id]`, which
   checks it carries no credential and substitutes the public endpoint if it ever does.
9. **A cron secret** → `CRON_SECRET`, the same string in `.env` **and** in the hosting project's
   environment. Vercel generates the `Authorization: Bearer` header from the project's value, so a
   local-only secret means every scheduled run is refused and the failure looks like a broken route.
10. **Deploy the contract** with the deployer key, then set `ARC_MARKET_ADDRESS`.
11. `npm run build:contract` and **commit `src/arc/abi.ts`**. ⚠️ Nothing compiled ships to the host:
    `solc` and `@openzeppelin/contracts` are devDependencies and absent from a deployed function, so
    the artifact is committed rather than built at deploy time. `npm run build` runs
    `check:contract` first and **refuses** if the artifact has drifted from `contracts/`.
12. `npx tsx --env-file=.env scripts/ops/migrate.ts` — idempotent, through the direct url.
13. `npx tsx --env-file=.env scripts/ops/verify-analyst.ts` — asserts `config/analysts.ts` against
    **live Circle and live Mirror Node**, never against a constant.
14. Confirm `/api/health` returns `ok: true`.

---

## 5 · Verifying the deployed contract

⚠️ **A byte-for-byte comparison against the committed artifact FAILS, and that is expected.** Anyone
reproducing a verification will hit this, so it is written down precisely.

The constructor writes the `immutable` resolver address **into the runtime code**, so the deployed
bytes differ from the compiled artifact wherever that immutable is read. Measured today:

```
deployed bytes   4783
artifact bytes   4783          (equal length)
differing runs   bytes 253..272   and   bytes 1949..1968
                 each exactly 20 bytes — the resolver address
                 on-chain: 1b7035bbe0da8f3bcb721863d42e1079e4a116a7
                 artifact: 0000000000000000000000000000000000000000
after masking those two runs back to zero:  IDENTICAL
```

⚠️ **Two 20-byte runs, not two 32-byte slots.** The address is written at its own width; a reader
masking 32 bytes would blank neighbouring opcodes and get a mismatch for a second, different reason.

**So the verification procedure is:** fetch `eth_getCode`, zero the two 20-byte runs above, compare
against `ALPHA_MARKET_DEPLOYED_BYTECODE`. On a fresh deployment the offsets will be the same as long
as the source and compiler settings are — and if they are not, locating them is a byte-wise diff of
two equal-length strings, which is how these were found.

⚠️ **Pin `evmVersion: cancun`.** The same source compiles clean under `cancun`, `shanghai` and
`paris` and produces **different bytecode** — 4,783 bytes against 4,871 under paris. The smaller
cancun build contains instructions a pre-cancun chain does not have, so **deploying it to one is a
live revert, not a compile error**, at the exact moment gas is being spent. Confirm the target
chain's EVM version before the first deploy.

---

## 6 · What differs on Arc mainnet

⚠️ **The blanks are the point, not an omission.** This project has been wrong six times about a value
that looked live and was not, and a manifest inventing a mainnet chainId to look complete would be
the seventh. Each blank names where to get it.

| | testnet today (verified) | mainnet |
|---|---|---|
| **chainId** | `5042002` | ⚠️ **BLANK.** Source: Arc's own network documentation at launch. Do not infer it from the testnet id |
| **RPC host** | `https://rpc.testnet.arc.network` | ⚠️ **BLANK.** Source: Arc's documentation at launch |
| **Native USDC** | `0x3600…0000`, `decimals() = 6` | ⚠️ **BLANK — verify the address, never assume the same predeploy.** Source: call `decimals()` and `symbol()` on the candidate before using it |
| **Circle `blockchain`** | `"ARC-TESTNET"` | ✅ **`"ARC"` — not a blank.** Verified in the installed SDK's `Blockchain` union, `dist/types/clients/configurations.d.ts`: `readonly Arc: "ARC"` sits beside `readonly ArcTestnet: "ARC-TESTNET"` |
| **Funding** | Circle's testnet faucet | ⚠️ **No faucet. Real USDC.** SM-08 found the testnet faucet's API rate-limiting independently of its web form; mainnet has no equivalent at all |
| **Wallet-set spend cap** | advisable | ⚠️ **mandatory** — see §7 |
| **Explorer** | `testnet.arcscan.app` | ⚠️ **BLANK.** Source: Arc's documentation. The host is hard-coded in **three** files — `app/markets/[id]/page.tsx`, `app/markets/[id]/stake.tsx`, `app/report/[hash]/ledgers.tsx` — and `stake.tsx` also passes it to MetaMask in `wallet_addEthereumChain` |

⚠️ **The Circle enum being already present is worth stating plainly**, because it is the one mainnet
value this project does *not* have to wait for — and it was found by reading the installed union
rather than by assuming, after a first pass wrongly concluded `ARC-TESTNET` was the only Arc value in
the package.

---

## 7 · What differs beyond addresses

### ⚠️ Real funds, and no faucet

Testnet gas is free in the sense that it is refillable. On mainnet every `createMarket`,
`commitPrediction` and `resolve` spends real USDC. ⚠️ **Re-read from the receipts on chain today**,
not quoted from tracking:

| call | paid by | gas |
|---|---|---|
| `createMarket` | deployer | **0.002203212 USDC** |
| `commitPrediction` | analyst | **0.00490882768926 USDC** |
| `resolve` | analyst | **0.001357841095 USDC** |
| `voidMarket` | analyst | **0.0007726779 USDC** |

A full unattended day — one create, one commit, one resolve — is therefore **under a cent**.
**The exposure is the stake, not the gas.**

### ⚠️ There is no spend guard anywhere today, in code or in console

**This is the most important operational gap in this document.** Two things were meant to bound what
the analyst can spend unattended and **neither exists**:

- **The Circle wallet-set spend cap** is a console action, not code, so no unit will ever remind
  anyone. SM-08 flagged it on 2026-09-06 as required *"before the agent commits on Arc unattended"*.
  **It was never set.** The agent has been committing unattended since Unit 10 deployed.
- **The `spend_ledger` table exists and has no writer.** `grep "INSERT INTO spend_ledger" src/`
  returns **nothing** and the table has zero rows. It was on the cut list at #4 and was taken **by
  default rather than decided**.

⚠️ **On mainnet the console cap is mandatory before the first unattended run**, and it is the only
guard that would exist even then. What bounds spending today is that the stake is a constant
(`0.01 USDC`, in `app/api/cron/commit/route.ts`) and the cron fires once a day.

### ⚠️ The x402 side has its own cutover, and it is gated on supply rather than a date

Payments settle on **Hedera testnet in HBAR**, not USDC, because Circle's testnet faucet never
delivered USDC to this account. The cutover to mainnet USDC is therefore **gated on funds arriving,
not on a date** — and **mainnet HBAR has no faucet**: it needs an exchange withdrawal, possibly
behind KYC, on a clock nobody controls. Start it well before it is needed.

⚠️ **Also live today: the public ATS testnet infrastructure this project's tokenization depends on
has EXPIRED.** The resolver contract `0.0.9212226` expired **2026-09-10T10:51:29Z** — about 32 hours
ago as of writing — and Mirror Node still reports `deleted: false`, meaning it is in Hedera's grace
period. `/api/health` reports this as `daysRemaining: -1.3`, **reported and not enforced**. It is
third-party infrastructure, and on mainnet an operator would deploy their own rather than inherit a
public one with an expiry.

---

## 8 · What is unfinished

⚠️ **A reader who finds one overstatement discounts the rest, so these are stated rather than
omitted.** Each was verified in the code today, not read from tracking.

| | status |
|---|---|
| **`payouts` has no writer** | `grep "INSERT INTO payouts" src/` → nothing. The table has read helpers and zero rows, so **§5.12's trading-return score is null for every real claim** even though the chain shows the analyst collecting. The market pages render it as *"not collected yet"*, never as zero |
| **Reconciliation quality is null on every report** | `Verdict.call` is null on a metric-across-deployments report by a 2026-09-07 decision, and all nine stored reports are that shape. So **two of the three scores carry no signal today**. The surfaces show them as absent rather than as zero |
| **R17's republished-deployment void is unbuilt** | Nothing stores the creation-time subgraph deployment to compare against — not the `markets` row, not `spec_json` (a spec names a `slug`, never a deployment id), so not `specHash` either. It needs a column, which is a migration |
| **The spend ledger and the console cap** | §7. Neither exists |
| **`resolve.ts`'s `TooEarlyToResolve` and `NotResolver` guards** | Unreachable and **not claimed as proven** — `settle()` will not produce an outcome for an unfinished day, and there is no second Circle wallet to fail the resolver check with. Kept because a revert costs USDC |
| **`AlphaMarket.sol` declares `SPDX-License-Identifier: MIT`** | and the repository has no `LICENSE` file |
| **No Solidity test framework** | By decision. The contract's proof is Unit 6 driving every path on Arc testnet. **The largest accepted risk in the phase** |

---

## 9 · `ARC_WALLET` — recorded rather than renamed

`ARC_WALLET` is set in `.env`, is **absent from `.env.example`**, and is **read by nothing**: the only
matches in `src/`, `app/` and `scripts/` are comments warning against reading it. Its value is
`0xA6B12d8418dF7F6C827AFEB3D8955A881e448079` — verified today to be exactly the address derived from
`ARC_DEPLOYER_KEY`.

⚠️ **It is not renamed, because renaming preserves a variable that should not exist.** It duplicates
a value the deployer key already determines, and a second copy of an address is a second thing that
can disagree. **The action is to delete the line from `.env`** — a manifest listing what an operator
must set cannot list it, and this section is where that stops being ambiguous.

⚠️ `.env.example` **needs no change**, which was checked mechanically in both directions: every
variable the code reads is declared there, and every variable declared there is read. Three
(`DATABASE_URL`, `HEDERA_BUYER_KEY`, `HEDERA_NETWORK`) are read through aliased helpers rather than a
literal `process.env.X`, which is why a naive grep under-reports them.

---

## 10 · How this document gets checked, and why the check is weak

The bar is *"someone else could stand this up without asking us questions"*, and **nobody else is
available to try.** Three checks, in decreasing strength:

1. **A mechanical env-var audit** — every variable this document lists is read by something, and
   every variable something reads is listed. ⚠️ **Symmetric, both directions, and it cannot be fooled
   by knowing too much.** Run today: it passes, and it is what surfaced `ARC_WALLET` in §9.
2. **Every address, id and value checked against the live network or the installed code** — the
   contract against the Arc RPC, the analyst against Circle and Mirror Node via
   `scripts/ops/verify-analyst.ts`, the Circle enum against the package's own typings, the bytecode
   against `eth_getCode`. ⚠️ **This does not depend on the checker being naive**; it is the network
   answering.
3. **A from-scratch walkthrough** — clone into a new directory, `cp .env.example .env`, and follow
   §4 only, with no other file open. ⚠️ **This is the weakest of the three and the reason is worth
   saying: you cannot un-know things.** A walkthrough by the person who wrote the system will read
   past an ambiguity that would stop a stranger, and no amount of care fixes that.

⚠️ **The residual risk is prose that reads clearly to its author and ambiguously to a stranger, and
nothing available to this project closes it.** Checks 1 and 2 are mechanical and do close what they
cover, which is every value — what they cannot cover is whether the *order* and the *explanations* in
§4 are sufficient. That is stated as an open weakness rather than claimed as satisfied.

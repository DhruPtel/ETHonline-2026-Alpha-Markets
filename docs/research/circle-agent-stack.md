# Research: Circle Agent Stack (`circlefin/agent-stack-starter-kits`)

**Repo:** https://github.com/circlefin/agent-stack-starter-kits
**Reviewed at:** commit `3996330` ("Enhance project with licensing, payment fixes, and user
interaction improvements (#5)", 2026-08-28), branch master
**Reviewed:** Sept 5, 2026

> ✅ **Fully executed review.** `bun install` (773 pkgs, exit 0), `bun run typecheck` (9/9 workspaces
> pass), **live Arc Testnet RPC calls**, and installed `@circle-fin/cli@1.0.0` +
> `@circle-fin/developer-controlled-wallets@10.8.0` from npm.
>
> **Unverified:** Console signup KYC requirements (no account created); the decimal scale DCW's
> `amount` field produces (no API key); any live CLI command (Terms gate — not accepted on our behalf).

---

## 0. The three questions

### a. What is "Agent Stack"? **A marketing umbrella whose one real product surface is a CLI binary.**

Not an SDK, not contracts. What you install is `@circle-fin/cli` — and **that's all this repo adds.
There is no Circle SDK import anywhere in its 7,392 lines.** Stated openly in `README.md:12`:

> "A shell, not an SDK surface. Three tools: a shell, a file reader and a grep. The agent runs
> `circle` in the first of them, next to `curl`, `jq`, `npm`."

| Component | What it actually is |
|---|---|
| **Circle CLI** | The only installable. A 2.0MB single-file Node bundle; **252MB installed with deps** |
| **Agent Wallets** | ERC-4337 SCAs, provisioned server-side by Circle, driven by `circle wallet *` |
| **Circle Skills** | Markdown fetched from `agents.circle.com/skills/setup.md` into `~/.agents/skills` |
| **Nanopayments** | Circle Gateway (off-chain balance pool) + x402, via `circle gateway *` |
| **Agent Marketplace** | A directory of x402 sellers at `agents.circle.com/services` |

The kits are ~7.4k lines of terminal chat UI. `packages/circle-tools/src/` is thin
`spawn('circle', …)` wrappers used only for the UI's own balance readout — `wallet.ts:24` says so
directly.

> **The genuinely novel idea here is the prompt design, not the plumbing.** Circle ships no typed
> tools; it ships a shell plus documentation the agent reads at runtime. Clever, and completely
> irrelevant to us.

### b. 🔴 Does it work server-side from env keys on Vercel? **No. Hard blocker.**

**Four independent blockers, each fatal alone:**

**1. There is no API key. At all.** Every `process.env` read in the CLI's 2MB bundle:

```
CIRCLE_CLI_HOME, CIRCLE_DEBUG, CIRCLE_DISCOVERY_URL, CIRCLE_FEEDBACK_ENDPOINT,
CIRCLE_PROXY_URL, CIRCLE_VERSION_CHECK, KIT_KEY, PRIVATE_KEY,
STABLECOIN_KITS_TELEMETRY_URL, STABLECOIN_KIT_API_KEY
```

**No `CIRCLE_API_KEY` — zero occurrences.** `kits/vercel-ai/.env.example:2` states it outright:
*"Authentication is handled by the Circle CLI itself. There is no Circle API key."*

**2. Auth is interactive email + OTP into an OS keyring.** `packages/circle-tools/src/auth.ts:148-198`
runs a two-step flow: `circle wallet login <email> --init` emails a code, you type it back. Credentials
land in `secret-tool` (libsecret). `auth.ts:253` (`requireSession()`) is explicit that headless callers
must have logged in interactively first. **No refresh-token or service-account path. Sessions expire;
renewal needs a human and a mailbox.**

**3. A Terms-of-Use gate.** Hit live — `circle blockchain list` refused to run:
```
Error: Circle CLI Terms acceptance is required before use.
  Hint: Set CIRCLE_ACCEPT_TERMS=1 to accept in non-interactive shells
```
`CIRCLE_ACCEPT_TERMS=1` exists, but `packages/kit-core/src/shell.ts` **deliberately withholds it from
the agent's environment**, and Circle's own rule (`auth.ts:34`) is that an agent must never accept the
Terms on a user's behalf.

**4. Size — worse than the ATS burn.** Measured: **`@circle-fin/cli` alone is 252MB installed — over
Vercel's 250MB limit by itself, before our app.** This repo's `node_modules`: 1.1GB.

> **But size is academic. A CLI is a binary that must exist on `$PATH`, and it wants a keyring daemon
> and a DBus session. Vercel gives you none of that. It fights our architecture at the root, not at
> the margin.**

### c. ✅ The minimum to credibly claim "used Circle Agent Stack"

**Don't use this repo. Use `@circle-fin/developer-controlled-wallets` instead** — a package **not in
this repo** and that the Agent Stack docs **never mention.**

| | Circle CLI (this repo) | `@circle-fin/developer-controlled-wallets` |
|---|---|---|
| Auth | email + OTP → OS keyring | **API key + entity secret (env vars)** |
| Install size | 252MB | **5.3MB (1 dep: axios)** |
| Arc Testnet | ✅ | ✅ `ARC-TESTNET` |
| Arc Mainnet | ❌ | ✅ **`ARC` already in the enum** |
| Serverless | ❌ | ✅ |
| Payable calls | `wallet execute --amount` | ✅ `amount` field |

**This is squarely a named prize component — Circle Wallets — and it holds real USDC on Arc, signs with
Circle's infrastructure, and never puts a private key in our env. A genuine claim, not name-dropping.**

Verified working code (compiles clean against the real SDK types; negative control confirmed the check
is live):

```ts
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';

const circle = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY!,             // Console → API keys
  entitySecret: process.env.CIRCLE_ENTITY_SECRET!, // 32-byte hex, registered once
});

// The call that matters: payable, carrying native USDC as msg.value.
const res = await circle.createContractExecutionTransaction({
  walletId,
  contractAddress: MARKET_ADDRESS,
  abiFunctionSignature: 'stake(uint256,uint8,uint256,uint256)',
  abiParameters: [marketId, side, amount, reportTokenId],
  amount: '2.50',                                  // ← msg.value, native USDC
  fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
});
```

The SDK generates the per-request entity-secret ciphertext internally — pass the secret once at client
construction, **not** RSA-encrypt on every call.

---

## 1. What this is

Six starter kits (one per agent framework) + three shared workspace packages. **Nothing is published to
npm** — every package is `"private": true`, `"version": "0.0.0"`. Reference code you clone.

⚠️ **Maintenance is thin.** **4 commits total**, all by one author (Anthony Kelani, Circle) plus a
bot's initial scaffold. Created 2026-06-11, last pushed 2026-08-28. 28 stars, 12 forks, 1 open PR
(community). **No `.github/`, no CI, zero test files.** Apache-2.0.

> **For a repo whose whole job is moving money, no tests is a real signal about maturity.**

---

## 2. Read these first

| # | Path | Why | Time |
|---|---|---|---|
| 1 | `README.md` | The design rationale. Genuinely well written; explains why it's a shell | 5 min |
| 2 | `packages/kit-core/src/approval.ts` | **The heart.** The entire safety model: which commands stop for a human, plus shell-escaping normalization to stop `c""ircle wallet transfer` slipping the gate | 10 min |
| 3 | `packages/circle-tools/src/auth.ts` | The email+OTP flow. **Read this to understand why we can't use it** | 10 min |
| 4 | `packages/kit-core/src/instructions.ts` | The whole system prompt. Tiny, and **the most transferable idea here** | 5 min |
| 5 | `packages/circle-tools/src/chains.ts` | 60 lines proving how narrow the chain support is | 2 min |

**Skip the six kits** — near-identical thin wrappers.

---

## 3. Structure and stack

```
kits/{vercel-ai,claude-agent-sdk,langchain,mastra,openai-agents,google-adk}/
        # one per framework: config.ts, agent.ts, tools.ts, theme.ts, index.ts
packages/kit-core/      # shell + file tools, approval gate, skills, prompt
packages/circle-tools/  # spawn('circle') wrappers for the UI's balance readout
packages/agent-cli/     # Ink terminal chat UI
```

TypeScript ESM, **Bun workspaces** (`linker = "hoisted"`), Node ≥22.15, ES2022, strict.

**Conflicts with our stack:**
- ⚠️ **React 19:** `packages/agent-cli` pins Ink/React for a **terminal renderer.** Never import into a
  Next.js app.
- ⚠️ **Zod split-brain:** `kits/vercel-ai` pins `zod@^3.25`, the other five pin `zod@^4.3`. Lifting
  code across kits breaks.
- **Bun-specific:** `bunfig.toml` hoisting; Bun ignores `NODE_OPTIONS`.
- ✅ **ethers/viem: nothing here pins either.** Grep confirms **zero occurrences.**

> ✅ **Our ethers 6 + ATS ABI work is entirely unaffected. The DCW path is also clean — its only
> dependency is axios. There is no version conflict risk to our Hedera/ATS work from anything Circle
> ships.**

---

## 4. The pieces Circle names

**a. Circle Wallets — two distinct products, and the distinction decides our build:**
- **Agent Wallets** (this repo): ERC-4337 SCAs, **user-controlled via `X-User-Token` from email OTP.**
  One SCA address shared across every EVM chain. Capped at 5 wallets (`AGENT_WALLET_CAP = 5`).
  **Not usable server-side.**
- ✅ **Developer-Controlled Wallets** (not in this repo): API key + entity secret. **Our answer.** Not
  custodial in the "Circle holds your keys" sense — key shares are split, and our entity secret is
  required to sign.

**b. Nanopayments** — not a channel, not batching. It's **Circle Gateway**: deposit USDC once into an
off-chain pool, sign off-chain authorizations, Gateway settles net positions on-chain. x402-adjacent.

⚠️ **On Arc: partial, and not the half we'd need.** From the CLI bundle:
- `GATEWAY_CHAIN_CONFIGS` includes `ARC-TESTNET` → **Arc works as a withdrawal destination**
- `ECO_SUPPORTED_CHAINS = {BASE, BASE-SEPOLIA}` only → **the fast deposit path excludes Arc**
- **`NETWORK_TO_GATEWAY_DOMAIN` (the map a payment needs) has no Arc entry** — domains 0,1,2,3,6,7,10,13,14,16

> **Circle's blog claim that sellers withdraw to Arc Testnet is true, and simultaneously Arc is not a
> nanopayment rail. Not usable for our gate.**

**c. Paymaster** — **not present in this repo.** No paymaster code, no bundler config, no mention. And
our instinct was right: **on Arc a paymaster is close to meaningless, because USDC is the gas token —
the thing a paymaster exists to abstract away is already gone.** Ignore it.

**d. CCTP** — present (`circle bridge transfer`, Arc CCTP domain 26, TokenMessenger
`0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA`). **We don't need it. The no-bridging design is sound;
don't add a bridge to chase a checkbox.**

**e. Also in the umbrella:** Circle Skills (runtime-fetched markdown), the Agent Marketplace,
`circle contract deploy` (experimental, documented on ARC-TESTNET), `circle wallet swap`.

---

## 5. The integration path

### Minimum server-side agent wallet on Arc — **two env vars**

```
CIRCLE_API_KEY=TEST_API_KEY:xxxx:yyyy    # Console → API Keys
CIRCLE_ENTITY_SECRET=<32-byte hex>       # generated once, registered once
```

One-time provisioning (a script, not a route handler):

```ts
const ws = await circle.createWalletSet({ name: 'arc-analyst-agent' });
const wallets = await circle.createWallets({
  walletSetId: ws.data!.walletSet!.id,
  blockchains: ['ARC-TESTNET'],
  accountType: 'SCA',        // or 'EOA'
  count: 1,
});
// persist wallets.data.wallets[0].id → CIRCLE_AGENT_WALLET_ID
```

💡 **Fund with `circle.requestTestnetTokens({ address, blockchain: 'ARC-TESTNET', usdc: true })`** —
the SDK has a Faucet API, so `faucet.circle.com` isn't in the loop.

```ts
export const runtime = 'nodejs';   // NOT edge — axios needs Node

const res = await circle.createContractExecutionTransaction({ /* …as above… */ });
// → { id, state: 'INITIATED' }; poll circle.getTransaction({ id })
```

**Cold start: 5.3MB, one dependency. Negligible.**

### vs `new ethers.Wallet(pk, provider)`

**Gain:** no raw private key in an env var (**the single best line in the demo narrative**); a named
prize component; Circle-side transaction records; free faucet access; an audit trail a judge can look
at.

**Give up — and these are real:**
- 🔴 **Synchronous signing.** ethers gives a tx hash in one call. Circle gives `{ id, state:
  'INITIATED' }` and you poll. On Vercel that means either a function held open, or a job record + a
  second request. **The single biggest architectural cost, and it lands directly on our settlement
  flow.**
- A network hop and a dependency on Circle's API being up **during judging.**
- Rate limits we don't control.
- `callData` vs ABI: fine for `stake()`, but pre-encoded calldata needs the `callData` field.

> 💡 **Keep `ethers.Wallet` as a fallback behind an interface.** If Circle's API is slow or
> rate-limits on demo day, flip one env var. **~1 hour of insurance, worth spending.**

### ✅ Can it sign `stake(...)` payable? **Yes** — verified in the SDK's own types

> `'amount'?: string;` — "The amount of native token that will be sent to the contract abi execution.
> Optional field for payable api only, if not provided, no native token will be sent."

**Not limited to transfers.** `abiFunctionSignature` + `abiParameters` covers our exact signature.

### 🔴 Spend controls — build our own. Confirmed.

Two layers exist and **neither helps:**

1. **`circle wallet limit set`** — per-tx/daily/weekly/monthly caps, allow/blocklists. Sounds perfect.
   But: `--chain <chain> Mainnet blockchain (required; testnets not supported)`, labelled
   **(mainnet only)**, and it **prompts for email OTP on every write.** Unusable on Arc Testnet,
   unusable headlessly.
2. **The repo's approval gate** — a regex list matched against shell command strings, answered y/N by
   a human at a TTY. **There is no shell and no human in our architecture.**
3. **The DCW SDK** — grepped its full type surface for `policy`/`spendingLimit`: **zero hits. No policy
   API.**

> **Our plan to build our own hard cap is correct, and it's now load-bearing.** Server-side ledger
> check before every `createContractExecutionTransaction` — track cumulative spend in the DB, refuse
> above a threshold. **Steal the idea from `approval.ts` (gate the spend, not the tool), not the code.**

### "Agent makes an autonomous payment decision based on a signal" — **all on us**

There is no such primitive. The repo offers a model, a shell, and documentation it reads at runtime.
Decision-making is entirely the LLM's, and **the only structure is a human y/N gate — the opposite of
autonomous.**

> ✅ **Our design (agent recomputes on-chain data → decides → stakes) is more autonomous than anything
> demonstrated here. Lean into that in the submission. We're not behind Circle's reference material;
> we're ahead of it on this axis.**

### Hours

| Task | Hours |
|---|---|
| Console signup, API key, entity secret registration | 0.5–1 |
| Wallet-set + wallet provisioning, faucet funding | 0.5 |
| Balance read + `stake()` call + polling state machine | 2–3 |
| Own spend cap (ledger + pre-flight check) | 1–2 |
| ethers fallback behind an interface | 1 |
| Debugging SCA quirks, decimals, fee levels | 2–3 |
| **Total** | **7–10 hours** |

⚠️ **The polling state machine is the part that will overrun**, because it touches the settlement flow
rather than sitting beside it.

---

## 6. Arc specifically

**Does this repo know about Arc? Essentially no.** `grep -riE '\barc\b|5042002|rpc\.testnet\.arc\.network'`
across all files returns **exactly one hit** — the legal disclaimer at `README.md:110`: *"intended for
Arc testnet use only."*

Meanwhile `packages/circle-tools/src/chains.ts:26`:
```ts
export type Chain = 'BASE' | 'POLYGON';
export const DEFAULT_CHAIN: Chain = 'BASE';
```

**The disclaimer and the code contradict each other.** (In fairness, `chains.ts:19` explains the
narrowness is only about the UI's balance readout.)

### ✅ But Agent Stack itself supports Arc — more than expected

The repo doesn't; **the CLI does, prominently:**

```js
var DEFAULT_AGENT_CHAIN_MAINNET = "BASE";
var DEFAULT_AGENT_CHAIN_TESTNET = "ARC-TESTNET";   // ← Arc is THE default testnet
```

Also supported for Arc: `wallet execute`, `contract deploy`, `wallet swap`, `bridge transfer`, CCTP
domain 26. And **`@circle-fin/developer-controlled-wallets` supports both `ARC-TESTNET` and `ARC`.**

### Our facts — corrected

| Claim | Verdict |
|---|---|
| Chain ID 5042002 | ✅ Live RPC returned `0x4cef52` = 5042002 |
| `rpc.testnet.arc.network` | ✅ Live, block `0x39cd420` |
| `testnet.arcscan.app` | ✅ Matches Circle's `explorerUrl` |
| USDC native gas at `0x3600…0000` | ✅ Confirmed |
| Faucet ~10 USDC | ✅ Plausible; also via SDK `requestTestnetTokens()` — **skip the web faucet** |
| "satisfies IERC20 directly" | ⚠️ **True but dangerously incomplete** |
| Arc mainnet not yet published | ✅ Was true. **Changes Sept 16** |
| x402 has no Arc support | ✅ **Conclusion right, reasoning wrong** |

### 🔴 CORRECTION 1 — the decimal split will silently corrupt stake accounting

Circle's own source comment:

> "Arc uses native USDC with **18 decimals** for gas payments (EVM standard). Note: The ERC-20 USDC
> contract at `usdcAddress` uses **6 decimals**."

Verified on live Arc Testnet against two funded addresses:

```
0x8FE6…2DAA   native (18dec): 108001562000000000000  → 108.001562 USDC
              ERC-20  (6dec):              108001562  → 108.001562 USDC
              ratio: exactly 1e12
```

**Our design says "stakes can arrive as `msg.value`, no approve/transferFrom." That works — but
`msg.value` arrives 18-decimal-scaled, while every `balanceOf` read and every USDC amount elsewhere in
our system is 6-decimal. If `stake()` stores `msg.value` as a USDC amount, the market's numbers are off
by a factor of a trillion, and payouts computed against a 6-decimal figure will be wrong.**

**Fix:** pick one scale and normalize at the boundary. Take `msg.value` and divide by 1e12 before
recording, or keep 18-decimal internally and convert only for display and ERC-20 interaction.
⚠️ **Also verify empirically which scale DCW's `amount: "2.50"` produces** — the docs say "amount of
native token" but don't state the scale, and it couldn't be tested without an API key. **Get that
assertion into a test on day one.**

### ⚠️ CORRECTION 2 — Arc's USDC is a full ERC-20, not a bare precompile

We wrote that Arc's USDC-as-native-gas "may have no ERC-20 contract for EIP-3009/Permit2 to call."
**It does.** `0x3600…0000` is an upgradeable proxy (implementation → `0xc6ad664a…`, 23,659 bytes)
implementing a complete Circle FiatTokenV2. Verified live:

```
TRANSFER_WITH_AUTHORIZATION_TYPEHASH() → 0x7c7c6cdb…  (canonical EIP-3009)
RECEIVE_WITH_AUTHORIZATION_TYPEHASH()  → 0xd099cc98…
PERMIT_TYPEHASH()                      → 0x6e71edae…  (canonical EIP-2612)
DOMAIN_SEPARATOR()                     → 0x36119152…
```
Bytecode scan confirms `transferWithAuthorization`, `receiveWithAuthorization`, `cancelAuthorization`,
`authorizationState`, `permit`, `nonces` — all present.

> **Our conclusion (rule out x402-on-Arc) still stands** — no facilitator serves Arc, and Circle's own
> `NETWORK_TO_GATEWAY_DOMAIN` omits it. **But the blocker is ecosystem, not cryptography.** Worth
> knowing so we state it correctly if a judge asks, and don't rebuild on a false premise later.

### 🚨 CORRECTION 3 — Arc mainnet launches September 16, 2026

**Three days after our Sept 13 deadline.** This explains the prize's otherwise-odd "deployed OR
deployment-ready by Sept 30" wording — **Circle wrote that date knowing Arc goes live Sept 16.**

Corroborating: `@circle-fin/developer-controlled-wallets@10.8.0` **already ships `"ARC"` in its
`ContractExecutionBlockchain` enum**, alongside `ArcTestnet`. **The SDK is staged for mainnet; only the
network is missing.**

> ✅ **We cannot ship on Arc mainnet by Sept 13, and the prize does not require it.** Build on Arc
> Testnet, make "deployment-ready" explicit — same code path, chain selected by env var, one-line
> switch from `ARC-TESTNET` to `ARC`. **Say so in the README. That is exactly the condition the prize
> is written for, and using the DCW SDK makes the claim checkable rather than aspirational.**

---

## 7. Gotchas with lead time

1. ⏰ **Circle Developer Console account + API key.** Testnet keys appear self-serve on email signup;
   **no evidence of KYC for sandbox/testnet — but unverified.** **Do this today.** If it does gate on
   verification, we need the 48 hours we've already learned to budget.
2. ⚠️ **Entity secret registration is a one-time, easy-to-botch ceremony.** Generate 32 bytes, encrypt
   with Circle's public key, register, **save the recovery file.** Lose it and you re-provision wallets
   — losing the ones holding testnet USDC.
3. **Agent-wallet cap is 5.** Doesn't bite DCW, but don't burn agent wallets experimenting.
4. ⚠️ **Docs contradict code.** The Agent Stack docs page **never mentions Arc, never mentions API
   keys, and never mentions the DCW SDK** — yet the CLI defaults testnet agent wallets to Arc and the
   SDK supports it. **Trust the code, not the docs page.**
5. **Circle CLI is at v1.0.0, published 2026-08-13 — seven versions since 2026-05-09.** Fast churn on a
   very young surface.
6. **`wallet limit` is mainnet-only** — the spend-control story doesn't exist on testnet at all.
7. **No tests, no CI in this repo.** Don't treat any of it as load-bearing.
8. **Set `runtime = 'nodejs'`.** The SDK uses axios; it will not run on Edge.

---

## 8. Verdict

**Use a narrow slice — but not from this repo.**

**Skip `agent-stack-starter-kits` entirely.** Its auth model (interactive email + OTP into an OS
keyring), delivery model (a 252MB CLI binary on `$PATH`), and safety model (a human typing y/N) **each
independently disqualify it from a Vercel route handler. There is no subset of these 7,392 lines we can
lift.** Read `approval.ts` and `instructions.ts` for the ideas — **"gate the spend, not the tool" is
genuinely good and worth stealing conceptually** — then close the tab.

**Wire in `@circle-fin/developer-controlled-wallets` instead.** 5.3MB with one dependency, two env
vars, supports `ARC-TESTNET` today with `ARC` staged for the Sept 16 mainnet, and — critically — **its
`amount` field is documented "for payable api only," so it signs our `stake(...)` with USDC as
`msg.value`. That is our gap, closed.**

**Our agent stops being a private key in an env var and becomes a Circle-managed wallet making
autonomous, signal-driven payments — which is the actual thing the prize is describing.** Budget
**7–10 hours**, and spend one of them on an `ethers.Wallet` fallback behind the same interface, because
**the async INITIATED-then-poll model is the one place this will fight our serverless settlement flow.**

### Straight answer on the prize cost of skipping it

**Not disqualifying, but materially weaker — and needlessly so, because the fix is under a day.**

The prize names Agent Stack, Circle Wallets, Nanopayments, and Paymaster. **Paymaster is meaningless on
Arc** (USDC is gas — nothing to abstract), and **Nanopayments genuinely doesn't reach Arc as a payment
rail** (`NETWORK_TO_GATEWAY_DOMAIN` has no Arc entry), **so nobody can win this prize on all four.**

> **Circle Wallets is the one component that is both named and actually available on Arc — which makes
> it the de facto bar.** A raw env-key wallet clears "we moved USDC on Arc" and fails "we used Circle's
> agent infrastructure," leaving us arguing that the named components didn't apply. True, but a weak
> story next to a submission showing a Circle-managed wallet signing autonomous stakes.

**For 7–10 hours out of 9 days, take the slice.**

### Two things to fix regardless of the Circle decision

1. 🔴 **The 1e12 decimal split** between `msg.value` (18 dec) and `balanceOf` (6 dec) will silently
   corrupt stake accounting. **Normalize at the boundary and assert the scale on the first live call.**
2. 🚨 **Arc mainnet lands Sept 16, three days after our deadline.** Build testnet, make the chain an
   env var, **state "deployment-ready" explicitly in the README.** Precisely the condition the Sept 30
   language was written for.

---

## Questions closed

| Question | Answer |
|---|---|
| What is Agent Stack? | A marketing umbrella over a **CLI binary**. Not an SDK. No Circle SDK import in the whole repo |
| Does the starter kit work server-side? | **No.** No API key exists, auth is email+OTP into an OS keyring, a Terms gate blocks headless use, and the CLI alone is 252MB |
| What's the minimum credible integration? | **`@circle-fin/developer-controlled-wallets`** — 5.3MB, two env vars, supports Arc, signs payable calls |
| Can it sign our payable `stake()`? | **Yes** — `amount` field is documented "for payable api only" |
| Is there a spend-control API? | **No.** `wallet limit` is mainnet-only + OTP-gated; DCW has zero policy surface. **Build our own** |
| Does it conflict with our ethers/ATS work? | **No.** Zero ethers/viem pins. DCW's only dep is axios |
| Is Paymaster relevant on Arc? | **No** — USDC is the gas token, nothing to abstract |
| Is Nanopayments usable on Arc? | **No** — Arc is a withdrawal destination only; no Gateway domain entry |
| Do we need CCTP? | **No.** The no-bridging design is sound |
| Is skipping Circle disqualifying? | **No, but materially weaker.** Circle Wallets is the de facto bar |
| When does Arc mainnet launch? | **September 16, 2026** — 3 days after our deadline |

## Still open

- ⏰ **Whether Console signup gates on KYC** — unverified, and it has a clock. Do it today
- **Which decimal scale DCW's `amount` field produces** — assert on the first live call
- Whether the polling state machine can live inside a Vercel function or needs a job record
- Whether to expose the rail choice (Circle vs ethers) as an agent decision or just a fallback env flag

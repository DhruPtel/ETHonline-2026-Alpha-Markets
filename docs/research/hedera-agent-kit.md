# Research: hedera-agent-kit-js

**Repo:** https://github.com/hashgraph/hedera-agent-kit-js
**Reviewed at:** commit `cedbda4` (v4.1.0)
**Reviewed:** Sept 4, 2026
**Last commit:** 2026-08-04 (a month ago), v4.1.0 tagged same day
**Cadence:** 30 commits in 2026-07 · 2 in 2026-08 · 0 in 2026-09 · 0 in 2026-06 — bursty, currently quiet
**15 released tags, 247 test files.** Contributors are Hashgraph staff + Arianelabs/Blockydevs contractors.

> ⚠️ **Source-only review — no network in the sandbox.** `pnpm install` couldn't fetch and
> `pnpm build` failed with `tsup: not found`. **Nothing here was executed or observed at runtime.**
> Open issues couldn't be checked either.
>
> **What that means for the findings below:**
> - **Solid** (static reads of manifests and source): the SDK peer range, the zod pin, the missing
>   metadata fields on token create, the testnet-only ERC20 factory addresses, the missing
>   `.close()` calls.
> - **Unverified**: whether it builds, whether the examples run, open issues, and any actual runtime
>   behaviour.
>
> The verdict rests on the manifest conflict, which is a static fact — so it holds regardless.

---

## What it is

Hashgraph's official pnpm monorepo publishing an **LLM tool-calling toolkit** for Hedera: a core
package turning Hedera operations into ~44 Zod-schema'd, LLM-callable tools, plus thin adapters
reshaping them for LangChain, Vercel AI SDK, MCP, ElizaOS, and Google ADK.

**A library to install, not a template to clone** — though `create-hedera-agent` scaffolds the
Next.js example as a starter (`packages/create-hedera-agent/scripts/sync-template.cjs:9-11` copies
`examples/nextjs` into the template at prepack).

README's "60-Second Quick-Start" (`README.md:22-30`) ends with a Node script where an OpenAI-backed
LangChain agent can be told "create a token called X" in English and it executes on testnet.

---

## Read these first

| # | File | Why | Time |
|---|---|---|---|
| 1 | `packages/core/src/shared/tools.ts` | **The heart.** The `BaseTool` 7-step lifecycle (normalize → hook → coreAction → hook → secondaryAction → hook) that all 44 tools implement | 10 min |
| 2 | `packages/core/src/shared/strategies/tx-mode-strategy.ts` | The four `AgentMode`s and pluggable signing. **The file worth stealing from** | 8 min |
| 3 | `packages/core/src/plugins/core-token-plugin/tools/fungible-token/create-fungible-token.ts` | One complete tool end-to-end, 90 lines. Shows how much ceremony wraps one `TokenCreateTransaction` | 4 min |
| 4 | `examples/nextjs/src/lib/agent-config.ts` | Server-side client from env in a Next 15 route — our exact deployment shape. Also the file with the serverless bug | 3 min |
| 5 | `packages/core/package.json` | The dependency contract. **Decides the answer on its own** | 1 min |

---

## Structure

```
packages/
  core/              ← CORE. 44 tools, plugin system, BaseTool, tx strategies, hooks, policies
    src/shared/        api.ts, tools.ts, configuration.ts, strategies/, hedera-utils/
    src/plugins/       10 plugins (5 mutation, 5 query) holding all 44 tools
    src/hooks/         HCS audit-trail hook + HOL (Hashgraph Online) audit hook
    src/policies/      2 sample policies (max-recipients, reject-tool)
  langchain/         adapter → StructuredTool              PUBLISHED v2.0.0
  ai-sdk/            adapter → Vercel AI SDK `tool()`      PUBLISHED v2.0.0
  mcp/               adapter → MCP server                  PUBLISHED v1.1.0
  adk/               adapter → Google ADK                  PUBLISHED v2.0.0
  elizaos/           adapter → Eliza Actions               PUBLISHED v2.0.0
  core-contracts/    Hardhat ERC20/721 factories           PRIVATE, not published
  tests/             shared fixtures                       PRIVATE (v0.0.0)
  create-hedera-agent/  CLI scaffolder                     PUBLISHED v0.1.6
examples/            SCAFFOLDING — 8 runnable demos (nextjs, langchain, ai-sdk, adk, mcp, plugin)
docs/                11 guides + 7 ADRs. HEDERATOOLS.md is the full tool catalogue
```

Six packages published to npm. `core-contracts` and `tests` are `private: true`.

---

## Stack

TypeScript 5.8.3 · Node ≥18 · **pnpm 11.4.0** (`packageManager` field — an install-time gate if your
local pnpm is lower) · tsup for ESM+CJS dual builds · vitest 4.1.10.

| Dep | Where | Role |
|---|---|---|
| `@hiero-ledger/sdk` **^2.86.2** | peer (all pkgs) | The actual Hedera SDK — you install it |
| `zod` **3.25.76** | direct, **exact** (core, ai-sdk, langchain, mcp, elizaos) | Every tool's parameter schema |
| `ethers` 6.17.0 | direct (core) | ERC20/721 ABI encoding only |
| `zod-to-json-schema` 3.25.2 | direct (core) | Schema → JSON Schema for LLM tool defs |
| `long` 5.3.2 / `bignumber.js` 9.3.1 | direct (core) | int64-safe token amounts |
| `@modelcontextprotocol/sdk` 1.30.0 | direct (ai-sdk, langchain, mcp) | MCP client/server |
| `@langchain/core` ^1.2.3, `langchain` ^1.5.3 | peer (langchain) | LangChain adapter |
| `ai` ^7.0.37 | peer (ai-sdk) | Vercel AI SDK adapter |
| `@ai-sdk/mcp` 2.0.17 | direct (ai-sdk) | MCP transport for AI SDK |

### ⚠️ The SDK peer conflict — this is the blocker

It is **not `@hashgraph/sdk`** at all. v4 renamed to `@hiero-ledger/sdk` and moved it to a peer
dependency (`docs/MIGRATION-v4.md:139`).

`packages/core/package.json` declares `"@hiero-ledger/sdk": "^2.86.2"`; `pnpm-lock.yaml:793` resolves
2.86.2.

**`^2.86.2` means `>=2.86.2 <3.0.0`. Our `@x402/hedera` pin of exactly 2.85.0 does not satisfy it.**

That's a hard peer-dep conflict, not a shruggable warning — npm errors, pnpm errors, and forcing it
gives two copies of a gRPC SDK where `instanceof PrivateKey` / `instanceof Client` checks silently
fail across the boundary.

Doc drift worth noting: `docs/MIGRATION-v4.md:139` still says the peer is `^2.81.0` — stale. 2.85.0
would have satisfied that. **The manifest is what resolves.**

Good news: `@hiero-ledger/proto` resolves to 2.31.0 (`pnpm-lock.yaml:783`), exactly matching x402's
pin. Only the SDK disagrees.

### The zod pin

Still **exact 3.25.76**, unchanged from 4.0.0, now in five packages. It's a *direct* dependency, so on
zod 4 you get a nested second copy.

Runtime mostly survives (AI SDK v5+ accepts zod 3 and 4). **Types do not** — the kit hands you
`ZodObject` instances from its own zod 3, and passing them where zod-4 types are expected produces
structural mismatch errors.

Also v4-hostile patterns in the schemas themselves: `.merge()` (deprecated in zod 4,
`token.zod.ts:52`) and `z.ZodObject<any, any>` (`tools.ts:47`, whose second generic changed meaning
in v4).

### Next 15 / React 19 / Vercel — genuinely fine

Demonstrated: `examples/nextjs/package.json` runs **Next 15.5.21, React 19.2.5**, zod ^3.25.76. No
React-version conflict.

Two Vercel costs:
- `ethers` is imported as a full namespace (`import { ethers } from 'ethers'`) in
  `hedera-parameter-normaliser.ts:88`, and **that file is imported by every tool** — so ethers lands
  in the bundle even if you only touch HTS.
- The example needs a `localStorage` polyfill server-side
  (`examples/nextjs/src/lib/polyfill-localstorage.ts`) — WalletConnect's fault, not the kit's.

### Server-side from env keys — first-class

`AgentMode.AUTONOMOUS` + `client.setOperator(AccountId.fromString(env), PrivateKey.fromStringECDSA(env))`
(`examples/nextjs/src/lib/agent-config.ts:59-72`). No browser wallet required. `RETURN_BYTES` mode is
the wallet path and is entirely optional.

---

## What it actually does

**Core abstraction:** an LLM tool-calling toolkit — specifically a **tool provider**. The unit is
`BaseTool` (`shared/tools.ts:78`): a class bundling a Zod schema, an LLM-facing prompt string, and a
7-step execute lifecycle. `HederaAgentAPI` (`shared/api.ts`) is a dispatch table — `run(method, args)`
finds the tool by name and calls it. Underneath is a thin transaction builder (`HederaBuilder`, 32
static methods) and a parameter normaliser.

**Not a wallet abstraction** — it takes a `Client` you already built.

### The 44 tools, across 10 plugins

- **Token (14):** create/mint fungible + NFT, transfer (± allowance) both, airdrop, associate,
  dissociate, update token, approve/delete NFT + token allowances
- **Account (9):** transfer HBAR (± allowance), create/update/delete account, approve/delete HBAR
  allowance, schedule-delete, sign-schedule
- **Consensus (4):** create/update/delete topic, submit message
- **EVM (5):** create/transfer ERC20, create/mint/transfer ERC721
- **Queries (12):** account info, HBAR balance, token balances, token info, topic info, topic
  messages, contract info, transaction record, pending airdrops, exchange rate

Notable extra: **scheduled transactions** — most mutation tools accept `schedulingParams` and wrap
into a `ScheduleCreateTransaction` (`HederaBuilder.maybeWrapInSchedule`).

### ⚠️ Token creation — limited in a way that matters for us

`CREATE_FUNGIBLE_TOKEN_TOOL` and `CREATE_NON_FUNGIBLE_TOKEN_TOOL` create native HTS tokens (so they
work on mainnet). But the user-facing schema (`token.zod.ts:19-48`) exposes only `tokenName`,
`tokenSymbol`, `initialSupply`, `supplyType`, `maxSupply`, `decimals`, `treasuryAccountId`,
`isSupplyKey`. The normaliser sets only an optional supply key
(`hedera-parameter-normaliser.ts:176`).

**No admin key, no token memo, no metadata.** The normalised schema *has* fields for
`adminKey`/`kycKey`/`freezeKey`/`wipeKey`/`pauseKey`/`metadataKey`/`tokenMemo`
(`token.zod.ts:56-80`) — the tool just never populates them.

Consequences: the token is **immutable at birth** (`UPDATE_TOKEN_TOOL` will fail
`TOKEN_IS_IMMUTABLE`), and **you cannot stamp a report hash or URI onto the token through this tool.**

The NFT path is better: `MINT_NON_FUNGIBLE_TOKEN_TOOL` takes `uris: string[]` (≤10 entries, ≤100
chars each) — the natural "one NFT per report, URI → report" shape.

**This does not replace the ATS SDK.** ATS gives regulated-security machinery (compliance
controllers, transfer restrictions, cap tables); this gives a bare `TokenCreateTransaction` with one
optional key.

**Association, accounts, balances:** all three covered. `ASSOCIATE_TOKEN_TOOL` /
`DISSOCIATE_TOKEN_TOOL`, `CREATE_ACCOUNT_TOOL`/`UPDATE`/`DELETE`, and mirror-node balance queries.

**Agent framework: none.** No planner, no memory, no loop, no retry policy — reviewer grepped for all
of it. Purely a tool provider; LangChain's `AgentExecutor` or the AI SDK drives it. The only
agent-ish machinery is hooks/policies middleware: `AbstractHook` fires at 4 lifecycle points, shipping
an HCS audit-trail hook logging every tool execution to a Hedera topic
(`hooks/hcs-audit-trail-hook.ts`) plus two sample policies.

### LLM integrations

All five adapters are the same ~30-line delegation. The AI SDK one
(`packages/ai-sdk/src/tool.ts`):

```ts
const aiTool = tool({
  type: undefined,
  description,
  inputSchema: schema,                       // ← the kit's zod 3.25.76 object
  execute: async (arg) => {
    const result = JSON.parse(await hederaAPI.run(method, arg));
    if (result?.bytes !== undefined) result.bytes = toUint8Array(result.bytes);
    return result;
  },
});
```

Toolkit constructor pattern shared by all adapters (`packages/langchain/src/toolkit.ts:26-41`):

```ts
const toolDiscovery = ToolDiscovery.createFromConfiguration(configuration);
const allTools = toolDiscovery.getAllTools(context, configuration);
this._hederaAgentKit = new HederaAgentAPI(client, configuration.context, allTools);
```

---

## Do we need it?

### What it gives over raw SDK calls

Four things: (1) 44 pre-written LLM tool descriptions with Zod schemas — **the prompt engineering is
the real asset**, not the transaction code; (2) the `AgentMode` strategy pattern letting one tool body
serve autonomous-execute, return-bytes, and custom-signing without branching; (3) hooks/policies
middleware, notably the HCS audit trail; (4) display-unit ↔ base-unit conversion with int64-safe
`Long` handling, which is genuinely fiddly to get right.

**What it does not give:** any wallet management, any agent loop, or a single line of x402 anything —
reviewer grepped, **zero payment/x402/402 support in this repo.**

### Against our three Hedera actions

| Action | Covered? |
|---|---|
| Issue a report token | Partially and badly — no memo/metadata on the FT create path, immutable tokens. The NFT `uris` path fits |
| Transfer a report token | Yes, but **we already have this** — signed `TransferTransaction` is the same ~15 lines |
| Receive x402 payments | No — completely out of scope |

One of three served, and it's the one where we already have working code. The kit is aimed at a
different use case — **conversational agents** where a human types "send Alice 10 HBAR," not
deterministic server-side pipelines where our code already knows which transaction to build.

### On the earlier question — was the inference PoC misusing it?

Answered indirectly: the kit *is* purely a tool provider with no agent loop, so loading it with
`tools: [], plugins: []` genuinely does nothing. That was the PoC not needing it, not the PoC
misconfiguring it.

### Hackathon optics

A real but modest point, and outside what the repo can tell us. This is the official
Hashgraph-maintained kit and the centerpiece of Hedera's "AI Studio on Hedera" docs, so naming it is
a recognizable signal to Hedera judges.

But our Hedera story is already strong (HTS issuance + x402 on Hedera + mainnet), and judges tend to
reward working over name-dropped — **a kit initialized with empty plugins would be worse than not
using it.** The honest cheap version: copy the tool-description patterns and say so.

---

## What to lift

| # | File / pattern | What it gives |
|---|---|---|
| 1 | `packages/core/src/shared/strategies/tx-mode-strategy.ts` | `TransactionStrategy` interface + `ExecuteStrategy`/`ReturnBytesStrategy`. ~60 lines cleanly separating "build the transaction" from "how it gets signed." Useful if the agent wallet ever needs a second signing path |
| 2 | `packages/core/src/shared/hedera-utils/decimals-utils.ts` + `toBaseUnitLong` | Display↔base unit conversion, int64-safe `Long`. The class of thing that silently corrupts amounts if hand-rolled — **and we're pricing in USDC at 6 decimals** |
| 3 | `packages/core/src/hooks/hcs-audit-trail-hook.ts` | **The pattern, not the code:** log every agent action to an HCS topic. For an AI analyst selling reports, a tamper-evident on-chain audit trail is a genuinely good demo beat. HCS submit is ~10 lines raw |
| 4 | `docs/HEDERATOOLS.md` + the `*Prompt()` functions | Tuned parameter descriptions — the kit's most transferable asset if we ever expose Hedera actions to the LLM |
| 5 | `examples/nextjs/src/lib/agent-config.ts:59-72` | Confirmation our `getHederaClient` shape matches what Hashgraph ships. Read to validate, then move on |

**Not worth lifting:** `HederaBuilder` (a thin `new TokenCreateTransaction().setX()` wrapper) and the
`BaseTool` lifecycle (7 hook points is architecture for a plugin ecosystem we don't have).

---

## Gotchas

⚠️ **The Next.js example leaks a gRPC client per request.** `createHederaToolkit()` calls
`createHederaClient()` on every POST (`examples/nextjs/src/app/api/agent/route.ts:24`) and never calls
`client.close()`. Reviewer grepped the whole repo: **`.close()` appears only in tests, never in any
example.** This is exactly the serverless antipattern flagged in earlier research, shipped in the
reference Next.js app.

**Mirror-node round-trip on every token create.** `normaliseCreateFungibleTokenParams` always awaits
`mirrorNode.getAccount(...)` to fetch a public key (`hedera-parameter-normaliser.ts:159-161`) even in
`AUTONOMOUS` mode where `client.operatorPublicKey` is already in memory. An avoidable HTTP hop plus a
mirror-node availability dependency (and mirror nodes lag consensus) in the per-report issuance path.

🚫 **ERC20/ERC721 tools do not work on mainnet.** `ERC20_FACTORY_ADDRESSES` and
`ERC721_FACTORY_ADDRESSES` contain only testnet and local-node entries
(`shared/constants/contracts.ts:10-19`). On mainnet, `getERC20FactoryAddress` throws
`Network type mainnet not supported for ERC20 factory`. There's a `deploy:mainnet` script but no
mainnet address registered anywhere.

**Otherwise mainnet is fine.** Mirror node has a mainnet URL (`mirrornode/types.ts:5`), the example
supports `NEXT_PUBLIC_NETWORK=mainnet`, and all HTS/HCS/account tools are network-agnostic. So HTS
token creation works on mainnet; ERC20 token creation does not.

**Every example is `Client.forTestnet()`** — hardcoded, 15+ files. Zero mainnet examples.

**pnpm 11.4.0** required by `packageManager`; a lower local pnpm is an install-time gate.

**Integration tests assume Hedera Solo** (a local k8s-ish node) via `scripts/solo/*.sh`;
`.env.test.local.example` defaults to local-node with account `0.0.1002`. Standing that up is the
likely hour-eater — skip it.

**Dead default:** the FT schema defaults `supplyType` to `'finite'` but the normaliser reads
`parsedParams.supplyType ?? 'infinite'` (`:148`) — the fallback is unreachable. Harmless, but it means
**tokens silently get a 1M cap** unless you pass `supplyType: 'infinite'`.

---

## Verdict

**Copy specific files — items 1–3 above — and write the rest ourselves.**

The dependency math decides this before the technical merits do. `@hiero-ledger/sdk ^2.86.2` versus
x402's hard `2.85.0` is an unresolvable manifest conflict, and it sits between us and the thing the
product is actually about — the payment gate. Adding the exact zod 3.25.76 pin on top means two
dependency fights before a line of feature code, with 9 days on the clock.

The payoff for winning those fights is thin for our shape: we already have the server-side client,
signed transfers, and association working, which is most of what the kit's transaction layer does. Its
real value is 44 tuned LLM tool descriptions for a *conversational* agent, and our agent isn't
conversational about Hedera — it deterministically issues one token per report. The token-create tool
wouldn't even serve that well (no memo, no metadata, immutable), so we'd reach past it to
`HederaBuilder` or the raw SDK anyway.

Take the `TransactionStrategy` pattern, the int64-safe unit conversion, and the **HCS audit-trail
idea** — that last one is the genuinely good hackathon beat hiding in here — and keep the ~50 lines of
raw `@hiero-ledger/sdk`, pinned wherever x402 needs it.

---

## Questions closed

| Question | Answer |
|---|---|
| Was the inference PoC misusing the kit? | No — it's purely a tool provider with no agent loop, so empty plugins genuinely does nothing |
| Does the kit conflict with `@x402/hedera`? | **Yes, hard.** Peer `^2.86.2` vs x402's exact `2.85.0`. Unresolvable at manifest level |
| Is the zod pin still exact 3.25.76? | Yes, and now in five packages, as a direct dependency |
| Could it replace the ATS SDK for report tokens? | No — bare `TokenCreateTransaction` with one optional key, no memo/metadata, immutable tokens |
| Does it have an agent framework? | No planner, no memory, no loop. Tool provider only |
| Does it do anything for x402? | Zero. Grepped |
| Does it work on mainnet? | HTS/HCS/account yes. **ERC20/ERC721 no** — testnet factory addresses only |

## Still open

- Whether the HCS audit trail is worth building as an original ~20-line feature (good demo beat,
  cheap, and a Hedera-native flourish)
- Whether to name-drop the kit in the submission without depending on it, or skip mentioning it
- Whether our report token is an NFT with a URI (fits the natural shape) or something ATS-issued —
  still gated on the ATS evaluation
- Reviewer couldn't verify the build or check open issues (no network egress)

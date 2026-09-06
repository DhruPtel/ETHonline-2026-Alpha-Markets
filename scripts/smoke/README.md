# Smoke tests

Nine tests, from PLAN-v4 §8. Each one is isolated and proves exactly one integration works against
the real thing — no mocks, no fixtures. They exist so that a failure lands on Day 1 against a
30-line script, not on Day 6 inside a half-built subsystem.

**A failing smoke test changes the plan.** When one fails, or passes but tells us something we
didn't expect, write the outcome in `tracking/lessons.md`: what we expected, what actually happened,
and what changes because of it.

## Running one

```bash
cp .env.example .env      # then fill in the values that test needs
npm install
npm run smoke:02
```

**SM-09 is the exception — it is manual.** `npm run smoke:09` only prints a pointer;
the test itself is `09-browser-stake.md`, walked by hand in a browser.

Each script is run directly by `tsx` with `--env-file=.env`. Two consequences worth knowing:

- **`.env` must exist**, even for tests that read nothing from it — Node errors on a missing
  `--env-file`. Copying `.env.example` once is enough.
- **Node 20.6+** is required (`--env-file` landed there). Node 22 is what this was set up on.

Packages get installed only when a test actually needs one, and each is pinned as it arrives:
`tsx`, `typescript`, `@types/node`, `canonicalize` (SM-01), `@x402/core` + `@x402/hedera` (SM-05),
`@anthropic-ai/sdk` (SM-06), `@hashgraph/asset-tokenization-contracts` + `ethers` (SM-07),
`@circle-fin/developer-controlled-wallets` (SM-08), and `solc` + `@openzeppelin/contracts`
(dev-only, for compiling and verifying contracts). Nothing else.

## The nine

| # | What it proves | Needs | Status |
|---|---|---|---|
| **SM-01** | Our JCS canonicalizer matches the RFC 8785 reference vectors, so a report hash is reproducible — and the same vectors can be shared with the Foundry tests | nothing — runs offline | ✅ **PASS** 2026-09-05 |
| **SM-02** | One query document returns populated fields plus `_meta` from **five** lending deployments across **three** schema versions — the standardized-schema claim, and its limits *(scope amended 2026-09-05)* | `GRAPH_API_KEY` | ✅ **PASS** 2026-09-05 |
| **SM-03** | A snapshot query 12 months back returns rows **and** their timestamps fall inside the window. Both bounds — `timestamp_gte` alone false-passes | `GRAPH_API_KEY` | ✅ **PASS** 2026-09-05 |
| **SM-04** | A subgraph value at block N and an `eth_call` for the same value at block N agree, so historical state is servable *(scope amended 2026-09-05 — was the multi-deployment query)* | `GRAPH_API_KEY`, `ETHEREUM_RPC_URL` ⚠️ archive-capable | ✅ **PASS** 2026-09-06 |
| **SM-05** | A real x402 payment for a `hello` endpoint settles on Hedera, with the native transaction id persisted *before* settle is called | the four `HEDERA_*` accounts, `HEDERA_NETWORK`, + the Blocky402 testnet facilitator | ✅ **PASS** 2026-09-06 — settled in **HBAR, not USDC** |
| **SM-06** | Claude calls `run_document` through our tool loop and the data comes back into the conversation | `ANTHROPIC_API_KEY`, `GRAPH_API_KEY` | ✅ **PASS** 2026-09-06 — two turns, loop closed cleanly |
| **SM-07** | ATS issue **and** transfer against the public testnet factory actually moves a balance — creating the proxy is not issuance. Also records the expiry of `0.0.9213391` | `HEDERA_SELLER_*` / `HEDERA_BUYER_*`, `HEDERA_TESTNET_RPC` | ✅ **PASS** 2026-09-06 |
| **SM-08** | A payable call completes through a Circle developer-controlled EOA: `msg.value` scale observed, `msg.sender` is the Circle wallet, and Arc's `eth_getLogs` range limit measured | `CIRCLE_API_KEY`, `CIRCLE_ENTITY_SECRET`, `CIRCLE_WALLET_ID`, `ARC_DEPLOYER_KEY` | ✅ **PASS** 2026-09-06 — `msg.value` is **18dp** |
| **SM-09** | ⚠️ **MANUAL — there is no script.** A browser wallet (OKX, MetaMask as fallback) adds Arc and signs a transaction. Walk `09-browser-stake.md` by hand | a browser with OKX or MetaMask; nothing from `.env` | ⚠️ **PARTIAL** 2026-09-06 — walked on OKX; `next build` half open |

⚠️ **SM-08's `analysts.ts` assertion and SM-09's `next build` half are both deferred.** §8 asks SM-08
to check the Circle wallet address against `config/analysts.ts` and SM-09 to complete a stake under a
production Next.js build. Neither file nor app exists yet, so SM-08 asserts the `msg.sender` half it
can and SM-09 covers the wallet half only. Both close in Phase 4, and neither is a pass until they do.
**SM-09's walkthrough passed on 2026-09-06 and the row still reads PARTIAL for exactly this reason.**

Environment variable names are decided when each test is written, and `.env.example` gains the line
at the same time — with the reasoning, not just the name. Full outcomes, findings and the work each
test generated live in `tracking/smoke-results.md`; this table is only the index.

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

Each script is run directly by `tsx` with `--env-file=.env`. Two consequences worth knowing:

- **`.env` must exist**, even for tests that read nothing from it — Node errors on a missing
  `--env-file`. Copying `.env.example` once is enough.
- **Node 20.6+** is required (`--env-file` landed there). Node 22 is what this was set up on.

Packages get installed only when a test actually needs one. Right now that's `tsx`, `typescript`
and `@types/node` — nothing else.

## The nine

| # | What it proves | Needs | Status |
|---|---|---|---|
| **SM-01** | Our JCS canonicalizer matches the RFC 8785 reference vectors, so a report hash is reproducible — and the same vectors can be shared with the Foundry tests | nothing — runs offline | not written yet |
| **SM-02** | One authenticated live query against a Messari lending subgraph returns populated fields plus `_meta`; and one archive `eth_call` at `head-1000` either works or is recorded as `NOT_CHECKED` | `GRAPH_API_KEY`, plus an archive-capable Ethereum RPC | not written yet |
| **SM-03** | A snapshot query 12 months back returns rows **and** their timestamps fall inside the window. Both bounds — `timestamp_gte` alone false-passes | `GRAPH_API_KEY` | not written yet |
| **SM-04** | One document runs unchanged across four deployments: three come back with identical shapes, and the 2.0.1 one either works or fails in a way we can detect before a run | `GRAPH_API_KEY` | not written yet |
| **SM-05** | A real x402 payment for a `hello` endpoint settles on Hedera, with the native transaction id persisted *before* settle is called | Hedera pay-side account (USDC-associated) + the Blocky402 facilitator | not written yet |
| **SM-06** | Claude calls `run_document` through our tool loop and the data comes back into the conversation | Anthropic API key, `GRAPH_API_KEY` | not written yet |
| **SM-07** | ATS issue **and** transfer against the public testnet factory actually moves a balance — creating the proxy is not issuance. Also records the expiry of `0.0.9213391` | Hedera testnet ECDSA key, Hashio RPC, a second EVM address to receive | not written yet |
| **SM-08** | A payable call completes through a Circle developer-controlled EOA: `msg.value` scale observed, wallet address matches `config/analysts.ts`, and Arc's `eth_getLogs` range limit measured | Circle API key, entity secret, wallet ids | not written yet |
| **SM-09** | MetaMask adds Arc via `wallet_addEthereumChain` and completes a stake **under `next build`** — not `next dev`, which hides ESM directory-import failures | a browser with MetaMask; nothing from `.env` | not written yet |

Exact environment variable names are decided when each test is written, and `.env.example` gains
the line at the same time.

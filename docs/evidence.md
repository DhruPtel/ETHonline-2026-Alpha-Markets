# Evidence

What Alpha Markets has put on-chain so far, and where to see it. Every link below is live on a public
network and can be checked without our involvement.

---

## x402 payment on Hedera testnet

**Where:** [`0.0.7162784@1788681755.933988660`](https://hashscan.io/testnet/transaction/0.0.7162784@1788681755.933988660)
**What it proves:** A buyer agent paid for gated content over x402, settled through the Blocky402
facilitator — the buyer paid the 0.001 HBAR price and zero gas, while the facilitator covered the
0.00246876 HBAR network fee, which is the whole point of the pattern.
**When:** 2026-09-06

## ATS report token

**Where:** [`0.0.10395983`](https://hashscan.io/testnet/contract/0x60c955b9b2d0896b5EEAF285133891D9A7CF7648) · `0x60c955b9b2d0896b5EEAF285133891D9A7CF7648`
**What it proves:** A report issued as a tokenized asset through Asset Tokenization Studio contracts,
supply 1 and decimals 0 — one report, one token.
**When:** 2026-09-06

## Token transfer — the lifecycle operation

**Where:** [`0.0.7314364@1788720710.105846509`](https://hashscan.io/testnet/transaction/0.0.7314364@1788720710.105846509)
**What it proves:** `transfer(address,uint256)` moved the token from issuer to buyer
(`0.0.10387696`), amount 1 — balances went 1 → 0 and 0 → 1.
**When:** 2026-09-06

## Contract verified on HashScan

**Where:** [Sourcify record, chain 296](https://repo.sourcify.dev/296/0x60c955b9b2d0896b5EEAF285133891D9A7CF7648) · reproduce with `npx tsx scripts/verify-ats.ts 0x60c955b9b2d0896b5EEAF285133891D9A7CF7648`
**What it proves:** The report token's source is verified against its deployed bytecode as an
`exact_match`, so its events render as readable source rather than raw hex.
**When:** 2026-09-06

## Live Graph queries across five lending protocols

**Where:** No link — `scripts/smoke/02-query-subgraph.ts` and its output
**What it proves:** One query document returns comparable data from five lending deployments — four
of Messari's own plus Morpho Blue on Messari's standardized template — across three schema versions,
live from The Graph's gateway.
**When:** 2026-09-05

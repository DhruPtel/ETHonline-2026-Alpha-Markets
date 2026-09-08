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

**Where:** [Sourcify record, chain 296](https://repo.sourcify.dev/296/0x60c955b9b2d0896b5EEAF285133891D9A7CF7648) · reproduce with `npx tsx scripts/ops/verify-ats.ts 0x60c955b9b2d0896b5EEAF285133891D9A7CF7648`
**What it proves:** The report token's source is verified against its deployed bytecode as an
`exact_match`, so its events render as readable source rather than raw hex.
**When:** 2026-09-06

## Live Graph queries across five lending protocols

**Where:** No link — `scripts/smoke/02-query-subgraph.ts` and its output
**What it proves:** One query document returns comparable data from five lending deployments — four
of Messari's own plus Morpho Blue on Messari's standardized template — across three schema versions,
live from The Graph's gateway.
**When:** 2026-09-05

## An agent spending its own USDC through Circle, on Arc

**Where:** [`0x4132fb9d…1da143`](https://testnet.arcscan.app/tx/0x4132fb9d09c35cfb721a68fa9c2ad0e2d3cb9a4ab5315d4cb7f31bfa231da143)
· receiver [`0x5d72aDC3…f8CfE`](https://testnet.arcscan.app/address/0x5d72aDC37C90CA8A493dC8fD06986544ffCf8CfE)
**What it proves:** A payable contract call completed on Arc testnet from a **Circle
developer-controlled EOA** — `msg.sender` is the Circle wallet `0x1b7035bb…16a7`, not a private key
in an environment variable, which is what the Arc agentic track asks to see. The call carried 2.5
USDC of real value: the receiver holds `2500000000000000000` and the wallet went
`20000000000000000000` → `17499181987242880000`, reconciling to the wei against 2.5 USDC plus
0.000818 of gas. Submitted through Circle's async API, which returns an id rather than a hash and
reached `COMPLETE` in 4.4 seconds.
**When:** 2026-09-06

## A browser wallet on Arc, signing a contract call

**Where:** [`0x70728aff…faf32b`](https://testnet.arcscan.app/tx/0x70728affa98ab2d9cd35acfe06bd7a497b102b685db252aba0ad922eeafaf32b)
· from [`0xe0dad03b…c2008`](https://testnet.arcscan.app/address/0xe0dad03b9cd74fd67d1288773525467b261c2008)
**What it proves:** Arc testnet is reachable from a wallet a stranger already has. OKX accepted the
network as a custom chain, **rendered a 20 USDC balance as `20` rather than the raw 18-decimal
`20000000000000000000`** — the trap that makes Arc's stablecoin gas token dangerous, since the ERC-20
view of the same token reports 6 decimals — and signed a `ping()` call entered as hex by hand. This is
the human half of the market: staking is a browser wallet talking to Arc, and this is that path
walked end to end before any UI exists.
**When:** 2026-09-06

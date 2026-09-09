# Evidence

What Alpha Markets has put on-chain so far, and where to see it. Every link below is live on a public
network and can be checked without our involvement.

⚠️ **Two eras, kept separate on purpose.** Phase 0's transactions proved each integration in
isolation, against fixtures — the ATS token below carries `FAKE_REPORT_HASH`, and the x402 payment
was against a hand-rolled test server. **Phase 3's transactions are against reports a stranger can
read at a URL.** A judge should be shown the Phase 3 set; the Phase 0 set is what made it safe to
build.

---

# Phase 3 — against real reports

## Report tokens on Hedera testnet

Four reports issued as ATS security tokens, each with `maxSupply: 1`, `decimals: 0`, compliance off,
and **its report's hash in the creation event** as `additionalSecurityData.info = "alpha:<hash>"`.

| ISIN | proxy | report | transferred |
|---|---|---|---|
| `XXR0WXU28WL2` | [`0xF8c19cE9…`](https://hashscan.io/testnet/contract/0xF8c19cE93Dd2E23dA3bf5d68644d028d84b1E59f) | `348482a5…9b95` | ✅ |
| `XXCTORZL97X8` | [`0x954A192a…`](https://hashscan.io/testnet/contract/0x954A192aC6b6Db2623De614F183e6BDb2cB8b2c2) | `60093501…30ed` | ✅ |
| `XX5FVRD1TMD1` | [`0x1805A2de…`](https://hashscan.io/testnet/contract/0x1805A2de801032859780BacE8Ff04a13B68E76D2) | `c2649f05…7535` | ✅ |
| `XXCQBDTBC9X2` | [`0xE7aaEFB1…`](https://hashscan.io/testnet/contract/0xE7aaEFB168F3E87975Fee1B0c932aE42776D8c6c) | `24041ca2…d3e5` | — |

**What it proves:** the cross-chain commitment works in the direction that matters. Each token's
creation event carries the same 32 bytes the report page displays, and the ISIN is derived from the
hash rather than fixed — SM-07 minted everything under one hardcoded `XXALPHA00015`, which would have
made two reports indistinguishable by the one field whose purpose is to distinguish securities.

⚠️ **`XXCQBDTBC9X2` is verified on Sourcify (`exact_match`); the other three are not yet.** All four
are byte-identical runtime bytecode — 390 bytes, same compiler, same sources, only the address
differs — so `npx tsx scripts/ops/verify-ats.ts <proxy>` verifies any of them unchanged. It has
simply not been run for three, and "contracts verified where applicable" is pass/fail on the Hedera
track. Stated rather than left to be discovered.

## Token transfers — the lifecycle operation, on real reports

**Where:** [`0x3f283d64…`](https://hashscan.io/testnet/transaction/0x3f283d64f805a5c8b7160f1848622b5ff54e85289473a1b9e2acef7f8bac5736)
· [`0xbc06e1dc…`](https://hashscan.io/testnet/transaction/0xbc06e1dc9d184b4eef915a5cc4b3754afb28dc67cb9eca36fd3f2f0bfadc8230)
· [`0x3b92dc2f…`](https://hashscan.io/testnet/transaction/0x3b92dc2f7e0c614084b9d4f2df76743b06102832cd09a253c995690f50ad14c6)
**What it proves:** `transfer(address,uint256)` moved a token whose creation event commits a report
someone can read, amount 1, to `0.0.10387696`. **Balances asserted from the chain before and after**
— 1 → 0 and 0 → 1 — never read off a receipt, because SM-07's own finding was that a status-1
receipt is not a balance change. The report stayed readable at its URL and the creation event was
unchanged, which is the property worth showing: the token moved and the report did not.
⚠️ **Standalone, and not caused by a payment.** The Own tier is cut — a buyer pays to read and no
token moves. H2.4 asks for issuance, configuration and ≥1 lifecycle operation; it does not ask for
the operation to be caused by a purchase.
**When:** 2026-09-08 / 09

## x402 payments against the deployed gate

**Where:** [`0.0.7162784@1788975334.949051888`](https://hashscan.io/testnet/transaction/0.0.7162784@1788975334.949051888)
· [`0.0.7162784@1788936023.186244100`](https://hashscan.io/testnet/transaction/0.0.7162784@1788936023.186244100)
· [`0.0.7162784@1788908586.639187830`](https://hashscan.io/testnet/transaction/0.0.7162784@1788908586.639187830)
**What it proves:** three real paid requests end to end against
<https://et-honline-2026-alpha-markets.vercel.app>, settled through Blocky402. The buyer
(`0.0.10387696`) paid 0.001 HBAR and **zero gas**; the facilitator `0.0.7162784` covered the network
fee. Each returned the market table the public preview withholds — checked by grepping the served
HTML for a figure from the paid body and finding nothing, so the paywall is a real boundary and not
a CSS one.
**When:** 2026-09-08 / 09

---

# Phase 0 — the integrations, proved in isolation

⚠️ Fixtures, not reports. Kept because they are what made Phase 3 safe to build.

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

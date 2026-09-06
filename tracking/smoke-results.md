# Smoke test results

Outcomes and consequences for the nine tests in PLAN-v4 §8. One section per test, added when the
test runs.

The division of labour across the four tracking files: `logs.md` is the narrative record of each run
of work, `lessons.md` holds insight where reality disagreed with the plan, `DECISIONS.md` holds the
choices we made and what we gave up, and **this file holds the consequences** — what each test proved
and what work it generated. When a lesson implies an action, the insight stays in `lessons.md` and the
action lands here; when a test forces a choice, the choice is recorded in `DECISIONS.md`.

## Status

| # | Test | What it proves | Status | Date |
|---|---|---|---|---|
| **SM-01** | JCS canonicalizer | Our canonicalizer matches the RFC 8785 reference vectors, so a report hash is reproducible and the vectors can be shared with Foundry | **PASS** | 2026-09-05 |
| **SM-02** | Multi-protocol query | One query document returns populated fields plus `_meta` from live Messari lending subgraphs across independent deployments | **PASS** | 2026-09-05 |
| **SM-03** | Snapshot window | A snapshot query 12 months back returns rows **and** their timestamps fall inside the requested window | **PASS** | 2026-09-05 |
| **SM-04** | Archive RPC *(rescoped)* | A subgraph value at block N and an `eth_call` for the same value at block N agree — so historical state is actually servable | BLOCKED — no archive RPC | — |
| **SM-05** | x402 payment on Hedera **testnet** | A real payment for a `hello` endpoint settles, with the native transaction id persisted *before* settle | **PASS** — settled in HBAR, not USDC | 2026-09-06 |
| **SM-06** | Agent tool call | Claude calls `run_document` through our tool loop and the data returns into the conversation | NOT RUN — **unblocked** | written 2026-09-05 |
| **SM-07** | ATS issue and transfer | Issue **and** transfer against the public testnet factory actually moves a balance | **PASS** — balance moved 1 → 0 / 0 → 1 | 2026-09-06 |
| **SM-08** | Circle payable call | A payable call completes through a Circle developer-controlled EOA, with `msg.value` scale and Arc's `eth_getLogs` limit measured | NOT RUN | — |
| **SM-09** | Browser stake | MetaMask adds Arc via `wallet_addEthereumChain` and completes a stake under `next build` | NOT RUN | — |

✅ **The SM-02 / SM-04 mismatch is resolved (2026-09-05).** SM-02 keeps the multi-protocol query and
loses the archive `eth_call` it never ran; SM-04 stops being a duplicate of that query and becomes
the archive-RPC test. PLAN-v4 §8 and §5.14 are amended to match, and the reasoning is in
`tracking/DECISIONS.md`. **SM-02 is now PASS on its full scope**, not on half of it.

⏸ **SM-06 is written and has still never executed — but it is no longer blocked.**
`scripts/smoke/06-agent-tool-call.ts` typechecks and its credential guard fires correctly. When it was
written there was no Anthropic credential on this machine; **`ANTHROPIC_API_KEY` is now set in `.env`,
so the test can run.** It gets a section here the first time it actually does; until then it has
proved nothing.

⛔ **SM-04 is blocked on provisioning, not on a decision.** It needs an archive-capable Ethereum RPC.
`ETHEREUM_RPC_URL` is in `.env.example`, unset, with the archive requirement in a comment. Until one
exists, R27 (non-archive RPC) stays live and corroboration has no confirmed source.

---

## SM-01 — JCS canonicalizer

**Run:** 2026-09-05
**Result:** PASS
**Script:** `scripts/smoke/01-canonicalize.ts` — offline, no network, no keys

**What it proved:** The `canonicalize` package conforms to RFC 8785 on every vector the RFC
publishes, and a report hashed through it is stable under key reordering, blind to lifecycle
fields, and sensitive to a one-cent change. The hash is the only thing that crosses chains — into
the ATS creation event on Hedera and `commitPrediction` on Arc — so byte-level agreement with an
outside verifier is what makes a settlement dispute resolvable.

### Findings

29 checks, all passing. Every vector is transcribed from RFC 8785 itself with the section cited:

| vector | source | result |
|---|---|---|
| Worked example, compared as UTF-8 bytes | §3.2.2 input, §3.2.4 published hex | pass |
| Property sorting on UTF-16 code units | §3.2.3 | pass |
| Number serialization, 24 IEEE 754 samples | Appendix B | 24/24 pass |
| NaN and Infinity must raise, not serialize | §3.2.2.3 | pass (both throw) |

- **The worked example is checked as bytes, not as a string literal.** The RFC publishes the
  expected output in hex; re-escaping it by hand into TypeScript is exactly how a conformance test
  acquires a bug of its own. That instinct paid off — see the near-miss below.
- **All 24 Appendix B number samples pass**, including the ones that matter for money: `1e+23`
  versus `9.999999999999997e+22` on adjacent bit patterns, and `1424953923781206.2` for a value that
  is exactly `…06.25` and must round to even.
- **NaN and Infinity both throw**, as §3.2.2.3 requires, rather than serialising to `null`.
- **Report hash behaves.** Reordering every key top to bottom gives a byte-identical hash
  (`49cfaa6c…3db9b7`); moving one cent on one figure gives a completely different one
  (`b3688035…bfe3ec`); attaching `atsTokenAddress` changes nothing because it is stripped.

**Near-miss worth recording.** The §3.2.3 vector failed on the first run, and the failure was in the
test, not the library. The check read the sorted order back with `Object.values(JSON.parse(canonical))`
— and JavaScript enumerates integer-like keys before string keys regardless of insertion order, so
the key `"1"` jumped to the front and the round trip destroyed the ordering under test. The
canonical *text* had been correct all along. Fixed by reading the order out of the text. This is
tracked as a lesson because any verifier written the same way will disagree with a correct
canonicalizer.

### To do

- **What:** When the Foundry-side verifier is written, assert against canonical **bytes**, never
  against a re-parsed object, and share these RFC vectors between the two test suites.
  **Why:** The near-miss above is a live trap on the verification side. A Solidity/Foundry check that
  round-trips through any JSON object model can reorder integer-like keys and disagree with a hash
  that is actually correct — which is indistinguishable, from the outside, from our hasher being
  broken. PLAN-v4 §8 already calls for sharing golden vectors with Foundry; this is the reason.
  **When:** Phase 4, alongside the resolver
  **Status:** open

- **What:** Freeze the report field set, including which fields are explicitly `null` and which are
  lifecycle-excluded, when the wire contracts are frozen.
  **Why:** SM-01 fixes the rule — explicit `null` for unavailable data, never omission, because an
  absent key and a null key canonicalize to different bytes and would hash two identical reports
  differently. That only holds if the field set is fixed. `LIFECYCLE` currently holds one entry
  (`atsTokenAddress`); anything else that comes into existence after the hash is committed belongs
  in it.
  **When:** Phase 1, with the wire contracts (PLAN-v4 §5.18, "freeze wire contracts Day 1")
  **Status:** open


## SM-02 — Multi-protocol query

**Run:** 2026-09-05
**Result:** PASS
**Script:** `scripts/smoke/02-query-subgraph.ts`

**What it proved:** One query document, sent unchanged to five independent lending subgraphs
spanning three schema versions, returns populated fields and `_meta` from every one of them. This is
the evidence behind the standardization claim the Graph track is judged on.

### Findings

Five deployments answered, all at the identical block, zero spread:

```
protocol               name           ver           deposits USD        borrows USD      block
aave-v3-ethereum       Aave v3        3.1.0       24850226626.81     10050176390.56   25916237
aave-v2-ethereum       Aave v2        3.1.0          97481594.37        13943710.68   25916237
compound-v3-ethereum   Compound III   3.1.0        1879484667.40       578438441.64   25916237
compound-v2-ethereum   Compound v2    2.0.1         117343582.83        12076861.64   25916237
morpho-blue            Morpho Blue    3.0.0       13062587242.45     11422333149.81   25916237
```

- **Three schema versions, one document** — 3.1.0 ×3, 2.0.1, 3.0.0. Compound v2 answering across the
  version gap is the core evidence; it is missing 18 `LendingProtocol` fields relative to aave-v3 and
  still serves every field we ask for.
- **Deposits span $97M to $24.8B** — four orders of magnitude, no special-casing.
- **Morpho Blue needed no field mapping at all.** It is not a Messari deployment, but Morpho publish
  on Messari's standardized template, so the shared document ran against it first try. The cost of a
  non-Messari protocol turned out to be zero translation and a trust problem instead.
- **Morpho's $13.06B headline is inflated roughly 3.6x.** 28 markets report deposits exactly equal to
  borrows — 100.0000% utilization to the wei — carrying $9.52B of the total. The largest, USDC/PAXG
  at $6.21B, is backed by 0.0596 PAXG, about $200 of gold. Around $3.65B is the plausible figure. The
  table prints the bad number with a warning beneath it, deliberately.
- **A transient gateway failure.** One run returned four ETIMEDOUT out of five parallel requests,
  then 5/5 immediately after.

### To do

- **What:** Give gateway requests a retry policy — bounded attempts with backoff, in the shared
  client rather than per caller.
  **Why:** Five parallel calls returned four ETIMEDOUT on one run and 5/5 on the next. Transient
  here, but settlement reads The Graph to decide who gets paid, and a dropped read at that moment is
  not acceptable.
  **When:** Phase 1, `graph/client.ts`
  **Status:** open

- **What:** Make the zero-price oracle guard per-deployment instead of global.
  **Why:** `inputTokenPriceUSD == 0` fires on 337 of Morpho's top 500 markets, holding $11.0B, and
  every one is a false positive — Morpho derives deposit USD from the loan token, not from price ×
  balance, so a zero collateral price breaks nothing. A global guard makes the invariant useless on
  any deployment that doesn't share Aave's derivation.
  **When:** Phase 2, `engine/invariants.ts`
  **Status:** open

- **What:** Add a plausibility check for Morpho's inflated TVL — utilization ceilings, collateral
  coverage against borrows, TVL/deposit reconciliation.
  **Why:** The headline is wrong by 3.6x and the field names are correct, so nothing about the schema
  catches it. A report that publishes $13.06B as Morpho's TVL is a report nobody should have bought.
  This is a plausibility problem, not a field-mapping one.
  **When:** Phase 1, adapter layer
  **Status:** open

- **What:** Write a per-deployment note recording what each deployment's fields actually mean, and
  have the adapter carry it.
  **Why:** Morpho's `inputToken` is the *collateral* token while `inputTokenBalance` and `totalSupply`
  hold the *loan* token amount, and its collateral is absent from `totalValueLockedUSD` entirely
  (`Market.totalCollateral` is a raw BigInt with no USD counterpart anywhere in the schema). On Aave,
  collateral *is* deposits. Cross-protocol TVL comparison silently compares different quantities
  unless something records the difference.
  **When:** Phase 1, adapter layer
  **Status:** open

- **What:** ~~Run the archive `eth_call` at `head-1000` that PLAN-v4 §8 makes the second half of
  SM-02.~~ **Moved to SM-04.**
  **Why:** The question is unchanged and still matters — RPC corroboration is what G2.1 leans on to
  say The Graph is verified rather than merely trusted. What changed is where it lives: §8 was
  amended on 2026-09-05 so that SM-02 is the multi-protocol query and **SM-04 is the archive-RPC
  test**. It is no longer a loose end hanging off a passing test; it is its own row, blocked on
  provisioning an archive-capable `ETHEREUM_RPC_URL`.
  **When:** SM-04, once the RPC exists
  **Status:** **moved** (2026-09-05)

---

## SM-03 — Snapshot window

**Run:** 2026-09-05
**Result:** PASS
**Script:** `scripts/smoke/03-snapshot-window.ts`

**What it proved:** Daily snapshots survive pruning completely — a twelve-month-old
`financialsDailySnapshot` returns, and the returned timestamps fall inside the requested window with
both bounds applied. The settlement design in PLAN-v4 §5.16 holds and needs no amendment for balance
metrics.

### Findings

- **Twelve-month-old snapshots return.** A complete seven-day window, 2025-09-06 → 2025-09-12, 7/7
  rows inside the requested bounds, no gaps, no zero balances.
- **There is no retention floor.** Probes at 6, 18 and 24 months back all returned full seven-day
  windows in bounds. The oldest snapshot in the deployment is **2023-01-27, block 16501561** — the
  day Aave v3 launched on Ethereum. History is complete to genesis.
- **Both bounds mattered.** The script asserts the returned timestamps rather than trusting the
  filter, because `timestamp_gte` alone false-passes: recent rows satisfy it and you get a green
  result that says nothing about retention.
- **The revenue column is unusable.** `cumulativeTotalRevenueUSD` reads 8.24e16 across the whole
  window and **2.79e17 live**. Revenue was sane from launch through 2024-07-04 ($136M cumulative,
  ~$800k/day); on 2024-07-05 one day booked $1.63e15 and the accumulator never recovered. It has
  recurred **38 times**, roughly monthly, most recently 2026-08-19 — so no constant offset can
  correct it.
- **The damage is precisely scoped.** Counting snapshots above $1e12 across all 1,300+ days:
  `totalDepositBalanceUSD` 0, `totalBorrowBalanceUSD` 0, `dailyDepositUSD` 0, `dailyBorrowUSD` 0,
  `dailyTotalRevenueUSD` **38**. Balances and flows are clean; only revenue is affected.

#### Revenue sweep, all five deployments (added 2026-09-05)

Extended the script to run the same check across every deployment, to find out whether the fault
lives in Aave's mapping or in the shared Messari template.

```
deployment              cum revenue USD   absurd  sides sum  implied APR   verdict
aave-v3-ethereum              2.787e+17     1/31         ok        1.12%   BROKEN (poisoned accumulator)
aave-v2-ethereum               4.176e+8     0/31         ok        0.18%   USABLE
compound-v3-ethereum           1.103e+8     0/31         ok        1.27%   USABLE
compound-v2-ethereum           5.222e+8     0/31         ok        0.60%   USABLE
morpho-blue                    0.000e+0     0/31         ok        0.00%   BROKEN (never populated)
```

- **The template is fine. The aave-v3 deployment is the problem.** Three of five report plausible
  revenue with clean arithmetic. Decisively, **aave-v2 is clean** — same authors, same standardized
  template, the deployment PLAN-v4 §3 calls byte-identical to v3 for the G1.5 claim. The fault is
  specific to the aave-v3 mapping, not to Messari's shared code and not to Aave's mappings generally.
  That is a far smaller problem than "revenue is broken".
- **Every deployment's sides sum.** `dailySupplySideRevenueUSD + dailyProtocolSideRevenueUSD` equals
  `dailyTotalRevenueUSD` on all 31 days everywhere, including on aave-v3's poisoned rows. There is no
  arithmetic drift anywhere — the corruption is in the input, not the addition.
- **The sane days are genuinely sane.** Implied annualised take against deposits: aave-v2 0.18%,
  compound-v2 0.60%, aave-v3 1.12%, compound-v3 1.27%. All inside the range a lending protocol
  plausibly earns, aave-v3 included once its one absurd day is excluded.
- **Morpho's revenue is a different failure — absent, not corrupted.** Zero is not a small number
  here, it is the *only* number: **0 of 977 snapshots** since inception carry nonzero daily revenue,
  and protocol-level total, supply-side and protocol-side cumulative revenue all read exactly 0.
  Market-level `cumulativeTotalRevenueUSD` is 0 too. The raw material exists — `Market.interest`
  tracks accrued interest in loan-token units, e.g. 18,091,411 USDC on USDC/cbBTC — but it is never
  converted to USD or aggregated. Morpho implemented the balance side of the template and left the
  revenue side unwritten.
- **A report must never print Morpho's revenue as $0.** That is a lie of a different kind from
  aave-v3's $279 quadrillion, and a more dangerous one, because it looks like a legitimate figure.
  "Not tracked" and "zero" have to be distinguishable all the way to the page.
- **Morpho's `InterestRate.rate` is suspect too.** The two mis-mapped markets report borrower and
  lender rates *identical* at 7.99999%, while a healthy market reports 0.046% borrower against 0.042%
  lender. Borrower and lender rates are never equal in a working market — the spread is where
  protocol revenue comes from. Tracked below.

### To do

- **What:** ~~Sweep the other four deployments for the same revenue fault.~~
  **Why:** Answered. The template is sound; aave-v3's mapping is at fault and aave-v2 — byte-identical
  schema, same authors — is clean. Morpho is broken separately and differently. Everything below is
  scoped by this result.
  **When:** —
  **Status:** **done** (2026-09-05)

- **What:** Fix revenue for the two broken deployments — correct aave-v3's accumulator and implement
  Morpho's revenue mapping from `Market.interest`. Requires deploying our own subgraph.
  **Why:** Revenue is central to a financial report; an analyst product that cannot state what a
  protocol earned is not doing fundamental analysis. **Narrowed by the sweep:** this was feared to be
  all five and is two, one of which needs a correction rather than a rewrite. Three protocols need
  nothing.
  **When:** later project
  **Status:** open

- **What:** Carry a three-state revenue availability flag per deployment in the adapter, and enforce
  the render rule that goes with it. **Decided 2026-09-05.**

  | state | deployments | render as |
  |---|---|---|
  | `usable` | aave-v2, compound-v3, compound-v2 | the figure |
  | `poisoned` | aave-v3 (accumulator corrupted) | "not available for this deployment" |
  | `not_tracked` | morpho-blue (never implemented) | "not available for this deployment" |

  **The render rule is the safety, and it is absolute:** `poisoned` and `not_tracked` never reach a
  page as a number. Not zero, not a figure with an asterisk, not a footnote — the words "not
  available for this deployment".
  **Why:** Morpho reports exactly 0 across 977 snapshots because the mapping was never written. A
  report printing "$0 revenue" for a protocol with $11.4B borrowed is more dangerous than an absurd
  figure, because $0 looks like data. This item is what keeps a wrong number off the page.
  **When:** Phase 1, adapter layer
  **Status:** open

- **What:** Restrict revenue metrics as market subjects to deployments flagged `usable`, rather than
  banning them outright. **Decided 2026-09-05 — allowlist, not blanket ban.**
  **Why:** Settling "will X's revenue exceed $Y" against a poisoned or empty accumulator pays out on
  a number that is wrong by nine orders of magnitude, or on a zero. A blanket ban would also cost
  revenue questions on three deployments where the numbers are demonstrably sound — implied APRs
  0.18%–1.27%, sides summing, zero absurd days — which is real capability given up to guard against a
  fault we have now located precisely. The safety comes from the render rule above, not from the ban.
  **When:** Phase 4, `spec.ts`
  **Status:** open

- **What:** Gate `cumulative*RevenueUSD` behind a plausibility check before any of it reaches a
  report.
  **Why:** Same gate the Morpho TVL item under SM-02 calls for, different field. The check now has
  two known shapes to catch: absurdly large, and identically zero.
  **When:** Phase 2, `engine/invariants.ts`
  **Status:** open

- **What:** Investigate Morpho's `InterestRate` entity — why borrower and lender rates are identical
  at 7.99999% on exactly the two markets whose supply and borrow figures are also mis-mapped.
  **Why:** Too neat to be coincidence; likely the same root cause as the inflated TVL, which would
  mean one fix covers both. Borrower and lender rates being equal is impossible in a working market —
  the spread *is* the protocol's revenue — so any report quoting Morpho rates would be quoting a
  number that cannot be true. Rates feed both reports and market subjects, so this needs an answer
  before either ships.
  **When:** Phase 1 or 2, adapter layer
  **Status:** open

---

## SM-05 — x402 payment on Hedera testnet

**Run:** 2026-09-06
**Result:** **PASS**
**Script:** `scripts/smoke/05-x402-purchase.ts`
**Settled transaction:** `0.0.7162784@1788681755.933988660`
**HashScan:** https://hashscan.io/testnet/transaction/0.0.7162784@1788681755.933988660

**What it proved:** A real x402 payment settles end to end on Hedera testnet through Blocky402 — the
buyer receives a 402, signs a partial transfer, the facilitator co-signs as fee payer and submits, and
the gated content comes back. **Value moved.** This is the first test in the project where it has.

⚠️ **It settled in HBAR, not USDC.** Circle's testnet faucet is not delivering, so the asset was
switched to native HBAR (`0.0.0`); the handshake, facilitator, network and settlement path are
identical and only the asset differs. Recorded in `tracking/DECISIONS.md`.

### Findings

**Step 1 — the facilitator supports our network.** `exact` / `hedera:testnet` with
`extra.feePayer: 0.0.7162784`, matching §7. That field is load-bearing — the scheme copies it into
every challenge and the client throws without it — so the script aborts if it is missing.

⚠️ **`docs/research/x402-protocol-spec.md:258` is wrong and must not be trusted on this point.** It
states "**Blocky402 does not support `hedera:testnet` — mainnet only**". Measured live, it does. The
note queried only `api.blocky402.com` — the mainnet host — and generalised from one host to the
vendor. **R12, and therefore the whole testnet decision, rests on that support existing**, so
believing it would have left us waiting on mainnet HBAR for nothing.

**Step 2 — nothing to do for HBAR.** HBAR is native to every account: no faucet, no association, no
third party. The `TokenAssociateTransaction` path is kept and skipped rather than deleted, gated on
the asset, so pricing in USDC again turns it back on. It was exercised earlier against USDC and works:
SUCCESS on first run, "already associated" on re-run, idempotent.

**Step 3 — the handshake, in full.** Priced at 100000 tinybars (0.001 HBAR):

```
unpaid request           → 402
challenge                  amount 100000 · asset 0.0.0 · payTo 0.0.10387690
                           feePayer 0.0.7162784 · maxTimeoutSeconds 120
buyer signs partially      tx 0.0.7162784@1788681755.933988660
                           0.0.10387690 +100000 · 0.0.10387696 −100000
seller verify              isValid=true payer=0.0.10387696
seller native tx           recorded BEFORE settle
seller settle              success=true
paid request             → 200, paymentStatus=settled, body "hello"
```

**Money moved exactly as designed, confirmed against the Mirror Node transaction record:**

```
on-chain result   SUCCESS
network fee       0.00246876 HBAR paid by 0.0.7162784   ← the facilitator
  0.0.802        +246876      (network)
  0.0.7162784    -246876      (facilitator — the entire fee)
  0.0.10387690   +100000      (seller — the price)
  0.0.10387696   -100000      (buyer — the price, and nothing else)
```

- **The buyer paid the price and zero fees.** Balance delta −0.00100000 HBAR against a price of
  0.00100000. The facilitator bore the whole 0.00246876 network fee — **2.5× the payment itself**,
  which is worth knowing: on a payment this small the facilitator subsidises more than the sale.
- **The native transaction id is recovered and printed before `settlePayment` is called**, read from
  the signed bytes with `inspectHederaTransaction()`. It matched the settled id exactly. This is the
  defence against a Hedera settle failure returning `{ success: false, transaction: "" }` after a
  successful broadcast — the case where money has moved and the response carries nothing to reconcile
  against. Now demonstrated against a real settlement, not just a locally signed transaction.
- **The seller never needs the fee-payer key — confirmed by construction.** `x402ResourceServer` is
  built from the facilitator URL and the seller's account id alone. The seller's own key appears in
  the script only to sign its own token association, which is account setup and not the payment path.
- **`paymentStatus: "settled"` means finality, not broadcast.** Settlement resolves only after a
  SUCCESS consensus receipt.

**Two things that had to be worked around, both worth carrying forward:**

- **The price cannot be a dollar string for HBAR.** `"$0.02"` resolves through `DEFAULT_ASSETS`, which
  on this network knows only USDC, and throws. An explicit `AssetAmount` in atomic units bypasses it.
- **The client's spend controls are on by default and refused HBAR outright** — *"All payment
  requirements were rejected by spendControls"* — because they allow only assets `findDefaultAsset`
  recognizes. HBAR is now opted in with its own atomic per-payment cap rather than disabling the
  control. **The default is fail-closed and worth keeping:** it is the only thing between an
  autonomous buyer and paying whatever it is asked in an asset nobody declared. The research note
  saying the upstream buyer script has no spend cap is out of date — at 2.25.0 there is one, on by
  default.

**Mirror Node lag bit twice, at both ends of the payment.** Association appeared to fail immediately
after succeeding, and post-settlement balances read unchanged with a nonsensical negative fee. Both
are REST ingestion lag behind consensus, and both now poll. This matters beyond the script because
**the facilitator preflights against Mirror Node**. Written up in `lessons.md`.

### To do

- **What:** Fund the buyer with testnet USDC and re-run priced in USDC.
  **Why:** The product should price in USD — "$0.50" is legible to a buyer, "50,000,000 tinybars" is
  not, and USD pricing is what the `"$…"` money path exists for. This is no longer a blocker for
  SM-05, which has passed; it is the switch back to the intended asset. The association code is kept
  and skipped precisely so this is a price change rather than a rewrite.
  **When:** Phase 3, `payments/tiers.ts`
  **Status:** open

- **What:** Carry the Mirror Node ingestion lag into the payment path, not just this script.
  **Why:** Any flow that provisions an account and immediately pays through the facilitator hits the
  same window, and the facilitator's own preflight reads that source. The buyer agent's first purchase
  after funding is exactly that shape.
  **When:** Phase 3, `payments/buyer.ts`
  **Status:** open

- **What:** Configure spend controls deliberately for every asset the buyer is allowed to pay in,
  with per-asset atomic caps.
  **Why:** The default refused HBAR, which is the correct behaviour and caught a real gap. R8 wants a
  cap on agent spending and this is where it lives on the client side. `spendControls: false` must
  never appear in product code.
  **When:** Phase 3, `payments/buyer.ts`
  **Status:** open

- **What:** Decide who bears the network fee at production volume.
  **Why:** Blocky402 paid 0.00246876 HBAR to move 0.001 HBAR. Their sustainability terms are unknown
  and unresolvable from outside; if that fee payer runs dry or rate-limits, every payment stops. R2's
  self-facilitation branch is the fallback and it costs H1.2.
  **When:** Phase 3
  **Status:** open

- **What:** Correct `docs/research/x402-protocol-spec.md:258`, or mark it superseded.
  **Why:** It asserts the opposite of what we measured, on the point R12 depends on.
  **When:** Phase 0
  **Status:** open

---

## SM-07 — ATS issue and transfer

**Run:** 2026-09-06
**Result:** **PASS**
**Script:** `scripts/smoke/07-ats-issue-transfer.ts`
**Proxy:** `0.0.10395983` / `0x60c955b9b2d0896b5EEAF285133891D9A7CF7648`
**HashScan:** https://hashscan.io/testnet/contract/0x60c955b9b2d0896b5EEAF285133891D9A7CF7648

| step | transaction |
|---|---|
| `deployEquity` | `0x435d18f89a0a83804188a5c45cb9fc3cc65b5cbf7f067eb3c08acea9f2b8feab` |
| `grantRole(ISSUER)` | `0xe35bb1ce110f82a97a1061ef4d76731545137c3902309b22a42b46449d758375` |
| `issue` | `0x2dea19e15fc57221b98216f983443bf77f0ad847affb0df0262d0754cf21d931` |
| `transfer` | `0x7674ef49d2f805a87f7fbdf1888616b3765a462230deb2e9d3d28d02b64c79d8` |

**What it proved:** A tokenized report asset can be created on Hedera testnet through the public ATS
factory and **moved to a different account** — `balanceOf(seller)` 1 → 0 and `balanceOf(buyer)` 0 → 1,
asserted rather than eyeballed. The transfer is the lifecycle operation the Hedera Tokenization track
asks to see demonstrated. Driven with `@hashgraph/asset-tokenization-contracts` + ethers 6 over the
JSON-RPC relay; **the 1.4 GB SDK was never installed.**

### Findings

**The public infrastructure is alive, and the resolver expires before the factory.** Measured before
building: factory `0.0.9213391` expires `1789039172` (2026-09-10 11:19:32Z) — exactly the number
research recorded — and resolver `0.0.9212226` expires `1789037489`, **1,683 seconds earlier**. The
resolver's expiry was never recorded anywhere and it is the binding one. Both live, neither deleted.
Recorded in `tracking/DECISIONS.md`.

⚠️ **Two values from `docs/research/asset-tokenization-studio.md` §3a revert the deploy on-chain.**
The note's sample code is not runnable as published:

| field | note says | reality | consequence |
|---|---|---|---|
| `maxSupply` | `0n` — "0 = unlimited" | `Cap.initializeCap` carries `onlyValidNewMaxSupply`, which rejects 0 | reverts `NewMaxSupplyCannotBeZero()`, selector `0x76f138fb`, after 948,129 gas |
| `regulationType` | `0` (`NONE`) | `_isValidTypeAndSubType` accepts only `REG_S`+`NONE` or `REG_D`+`{506_B, 506_C}` | would revert `RegulationTypeAndSubTypeForbidden` |

The `maxSupply` one **cost a real reverted deploy** — the first run failed on it. The
`regulationType` one was caught by reading `factory/ERC3643/interfaces/regulation.sol:198` before
running, and never cost anything. The script now uses `maxSupply: 1n` and `REG_S`/`NONE`.

- **A cap of 1 is the better value anyway, not just the legal one.** One report, one token, and a
  second mint against the same report becomes impossible at the contract level.
  `isCorrectMaxSupply(amount, cap)` is `cap == 0 || amount <= cap`, so issuing 1 against a cap of 1
  passes. The zero-bypass the research note described is real — it is just in the *runtime* check,
  not the initializer.
- **`REG_S` is the honest regulation value for a report sold to anyone.** It is the only valid
  combination with international investors allowed and no resale hold period. It is also inert:
  `FactoryRegulationData` is validated by `onlyValidRegulation` and emitted in `EquityDeployed`, and
  **never written to proxy storage** — it gates nothing on transfer.
- **The report hash survived, byte-identical.** `additionalSecurityData.info` went in as
  `alpha:49cfaa6c…3db9b7` and came back out of the `EquityDeployed` log unchanged. It is
  **event-only** — validated and emitted, never stored — so reading the log is the only way to prove
  it, and the only way a verifier will ever read it. This is the field PLAN-v4 §1 designates as the
  Hedera half of the cross-chain hash commitment.
- **Compliance off works exactly as the research predicted.** `compliance: address(0)`,
  `identityRegistry: address(0)`, `internalKycActivated: false`, `isWhiteList: false`, all three
  external list arrays empty — and an account that had never interacted with the token received it
  with **zero onboarding and no association step**. ATS tokens are plain ERC-20 on the Hedera EVM.
- **Exactly one contract per asset, confirmed on Mirror Node.** The deploy's
  `created_contract_ids` is `['0.0.10395983']`, length 1.
- **Roles are not auto-granted, and the script proves it rather than assuming it.**
  `hasRole(ISSUER, seller)` reads `false` before the grant and `true` after. Creation assigns only
  `DEFAULT_ADMIN`, and `deployEquity` renounces the factory's own temporary admin on the way out.
- **⚠️ The issued asset outlives the factory that issued it.** Proxy `0.0.10395983` carries its own
  expiration of `1796496695` — 2026-12-04, nearly three months past the factory's. An expiry event
  costs us new mints, not existing tokens.

#### Cost — the ~$0.60 estimate holds

| step | gas | HBAR |
|---|---|---|
| `deployEquity` | 6,713,850 | 7.04954250 |
| `grantRole` | 179,949 | 0.18894645 |
| `issue` | 450,916 | 0.47346180 |
| `transfer` | 406,630 | 0.42696150 |
| **total** | **7,751,345** | **8.13891225** |

Seller balance moved 1097.78162627 → 1089.64271402 HBAR, **−8.13891225** — matching the sum derived
from the receipts to the tinybar, so the derivation and the ledger agree. At the live rate of
$0.080693/HBAR that is **$0.6568 for the full lifecycle** and **$0.5688 for `deployEquity` alone**,
against research's **$0.60 per asset** estimate. The estimate is good. Testnet relay gas price
measured at 110 tinybars/gas against research's 108 on mainnet.

**Plus the cost of being wrong:** the reverted first attempt burned 948,129 gas (~0.995 HBAR, ~$0.08)
and deployed nothing.

#### Verified on HashScan (2026-09-06, after the run)

`0x60c955b9b2d0896b5EEAF285133891D9A7CF7648` is verified on Sourcify for chain 296 —
**`match: exact_match`**, `runtimeMatch: exact_match`, 17 sources, matchId 47208468. **U11 is
answered.** HashScan's verifier host `server-verify.hashscan.io` redirects to `sourcify.dev/server`,
so the one submission covers both, and the SM-07 row's "verified on HashScan where applicable"
track requirement is satisfied.

The Standard JSON Input had to be reassembled — the package excludes `artifacts/build-info/` and the
metadata CID in the bytecode is unpinned on IPFS — so `scripts/verify-ats.ts` compiles locally and
**asserts byte-equality against the on-chain runtime before submitting anything.** It matched on the
first attempt, metadata trailer included. `creationMatch` is `null` and permanently will be: the
proxy is created inside `deployEquity` rather than by a top-level creation transaction. Reasoning in
`tracking/DECISIONS.md`, the finding in `tracking/lessons.md`.

### To do

- **What:** Correct `docs/research/asset-tokenization-studio.md` §3a — `maxSupply: 0n` and
  `regulationType: 0` both revert. Mark the sample as corrected, not merely annotated.
  **Why:** It is the only worked example we have, it is what the next person will copy, and one of
  its two errors already cost a reverted deploy. Cheap to fix, and the fix is measured.
  **When:** Phase 0
  **Status:** open

- **What:** Move the report hash from `additionalSecurityData.info` to `setCustomData` as well, or
  decide deliberately that event-only is enough.
  **Why:** `info` is emitted and never stored, so verifying it requires reading a log rather than
  calling the contract. That is fine for anyone with an indexer and awkward for anyone without one.
  `setCustomData(keccak256("report"), [hash])` puts it in storage, at the cost of a second
  transaction and a `ROLE_CUSTOM_DATA_MANAGER` grant. PLAN-v4 §1 currently specifies the event.
  **When:** Phase 3, with report tokenization
  **Status:** open

- **What:** Decide what the ISIN actually is per report, rather than the fixed `XXALPHA00015`.
  **Why:** The check digit is validated on-chain and the generator is verified against three real
  ISINs, so this is not a correctness risk — but every report currently mints under the same
  identifier, which makes two reports indistinguishable by ISIN. Nothing enforces uniqueness
  on-chain; if we want it, we supply it.
  **When:** Phase 3
  **Status:** open

- **What:** Watch the resolver's `1789037489` expiry, not the factory's.
  **Why:** It is the earlier of the two and it was never recorded until now. If new mints are needed
  after 2026-09-10 the fallback is our own 111-contract deploy, ~29 minutes.
  **When:** before any demo that mints live
  **Status:** open

---

## Resolved plan questions

Both questions this section raised were answered on 2026-09-05. Kept rather than deleted, because the
amendment they produced is easier to read next to what prompted it.

**1. SM-02's second half was never run.** §8 defined SM-02 as "Query one subgraph; **plus one
`eth_call` at `head-1000`**". We built and passed the subgraph half; the archive `eth_call` was never
attempted and `.env.example` had no RPC URL.

**2. SM-04's scope was already covered.** §8 defined SM-04 as "Same document, four deployments" —
exactly what `scripts/smoke/02-query-subgraph.ts` does, with five.

**✅ Answered together, as suspected they would be: SM-02 keeps its scope and SM-04 becomes the
archive-RPC test.** SM-02 is the multi-protocol query, now PASS on its full scope rather than half of
it. SM-04 is: read a value from a subgraph at block N, `eth_call` the same value at block N, confirm
they agree — it needs an archive-capable RPC, which we do not have, so `ETHEREUM_RPC_URL` is now in
`.env.example` unset and SM-04 is BLOCKED rather than NOT RUN.

The alternative — keeping SM-02's archive half and retiring SM-04 as redundant — was rejected because
it leaves a passing test permanently half-run and buries a question §5.14 depends on inside a row
about something else. PLAN-v4 §8 and §5.14 are amended; full reasoning in `tracking/DECISIONS.md`.

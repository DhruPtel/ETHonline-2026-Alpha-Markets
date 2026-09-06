# Smoke test results

Outcomes and consequences for the nine tests in PLAN-v4 §8. One section per test, added when the
test runs.

The division of labour between the three tracking files: `logs.md` is the narrative record of each
run of work, `lessons.md` holds insight where reality disagreed with the plan, and **this file holds
the consequences** — what each test proved and what work it generated. When a lesson implies an
action, the insight stays in `lessons.md` and the action lands here.

## Status

| # | Test | What it proves | Status | Date |
|---|---|---|---|---|
| **SM-01** | JCS canonicalizer | Our canonicalizer matches the RFC 8785 reference vectors, so a report hash is reproducible and the vectors can be shared with Foundry | NOT RUN | — |
| **SM-02** | Multi-protocol query | One query document returns populated fields plus `_meta` from live Messari lending subgraphs across independent deployments | **PASS** | 2026-09-05 |
| **SM-03** | Snapshot window | A snapshot query 12 months back returns rows **and** their timestamps fall inside the requested window | **PASS** | 2026-09-05 |
| **SM-04** | Same document, four deployments | One document runs unchanged across four deployments, including one a schema version behind | NOT RUN | — |
| **SM-05** | x402 payment on Hedera | A real payment for a `hello` endpoint settles, with the native transaction id persisted *before* settle | NOT RUN | — |
| **SM-06** | Agent tool call | Claude calls `run_document` through our tool loop and the data returns into the conversation | NOT RUN | written 2026-09-05 |
| **SM-07** | ATS issue and transfer | Issue **and** transfer against the public testnet factory actually moves a balance | NOT RUN | — |
| **SM-08** | Circle payable call | A payable call completes through a Circle developer-controlled EOA, with `msg.value` scale and Arc's `eth_getLogs` limit measured | NOT RUN | — |
| **SM-09** | Browser stake | MetaMask adds Arc via `wallet_addEthereumChain` and completes a stake under `next build` | NOT RUN | — |

⚠️ **Two rows above don't line up with PLAN-v4 §8 and need a decision — see [Open plan
questions](#open-plan-questions) at the foot of this file.** SM-02 as written in the plan has a
second half we never ran, and SM-04's scope is already covered by the script we wrote for SM-02.

⏸ **SM-06 is written but has never executed.** `scripts/smoke/06-agent-tool-call.ts` typechecks and
its credential guard fires correctly, but there is no Anthropic credential on this machine —
`ANTHROPIC_API_KEY` is absent from `.env` and the shell, and the `ant` CLI is not installed. It gets
a section here the first time it actually runs; until then it has proved nothing.

---

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

- **What:** Run the archive `eth_call` at `head-1000` that PLAN-v4 §8 makes the second half of SM-02,
  and record the result or `NOT_CHECKED`.
  **Why:** It was never run. RPC corroboration is what G2.1 leans on to say The Graph is verified
  rather than merely trusted, and we don't yet know whether we have an archive-capable RPC.
  **When:** blocked on the plan question below
  **Status:** open

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

## Open plan questions

Raised rather than resolved, because both change what gets built.

**1. SM-02's second half was never run.** PLAN-v4 §8 defines SM-02 as "Query one subgraph; **plus one
`eth_call` at `head-1000`**", with the pass signal "Populated field + `_meta`; archive RPC confirmed
or `NOT_CHECKED` decided". We built and passed the subgraph half. The archive `eth_call` half has not
been attempted and `.env.example` has no RPC URL. SM-02 is marked PASS above on the query half alone.

**2. SM-04's scope is already covered.** §8 defines SM-04 as "Same document, four deployments". That
is exactly what `scripts/smoke/02-query-subgraph.ts` does, with five. Writing
`scripts/smoke/04-multi-deployment.ts` as specified would duplicate a passing test.

The two are probably one decision: whether SM-02 keeps its archive-RPC half and SM-04 is retired as
redundant, or SM-02 stays the multi-protocol query and SM-04 becomes the archive-RPC test. Either
way the plan gets amended and this file's status table changes with it.

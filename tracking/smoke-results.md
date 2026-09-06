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
| **SM-04** | Archive RPC *(rescoped)* | A subgraph value at block N and an `eth_call` for the same value at block N agree — so historical state is actually servable | **PASS** — archive to block 1; ⚠️ agreement is exact only at the field's *write* block, not at `_meta.block` | 2026-09-06 |
| **SM-05** | x402 payment on Hedera **testnet** | A real payment for a `hello` endpoint settles, with the native transaction id persisted *before* settle | **PASS** — settled in HBAR, not USDC | 2026-09-06 |
| **SM-06** | Agent tool call | Claude calls `run_document` through our tool loop and the data returns into the conversation | NOT RUN — **unblocked** | written 2026-09-05 |
| **SM-07** | ATS issue and transfer | Issue **and** transfer against the public testnet factory actually moves a balance | **PASS** — balance moved 1 → 0 / 0 → 1 | 2026-09-06 |
| **SM-08** | Circle payable call | A payable call completes through a Circle developer-controlled EOA, with `msg.value` scale and Arc's `eth_getLogs` limit measured | **PASS** — `msg.value` arrives at **18 decimals**; log ceiling 30,000 blocks | 2026-09-06 |
| **SM-09** | Browser stake | A browser wallet adds Arc and signs a transaction; `next build` half deferred to Phase 4 | **NOT RUN** — manual checklist written, `scripts/smoke/09-browser-stake.md` | — |

✅ **The SM-02 / SM-04 mismatch is resolved (2026-09-05).** SM-02 keeps the multi-protocol query and
loses the archive `eth_call` it never ran; SM-04 stops being a duplicate of that query and becomes
the archive-RPC test. PLAN-v4 §8 and §5.14 are amended to match, and the reasoning is in
`tracking/DECISIONS.md`. **SM-02 is now PASS on its full scope**, not on half of it.

⏸ **SM-06 is written and has still never executed — but it is no longer blocked.**
`scripts/smoke/06-agent-tool-call.ts` typechecks and its credential guard fires correctly. When it was
written there was no Anthropic credential on this machine; **`ANTHROPIC_API_KEY` is now set in `.env`,
so the test can run.** It gets a section here the first time it actually does; until then it has
proved nothing.

✅ **SM-04 is unblocked and passing (2026-09-06).** Alchemy's free tier serves historical state to
block 1 — nothing was refused at any depth — so R27's fallback is not needed for Ethereum and
corroboration has a confirmed source. ⚠️ The test also found that comparing at `_meta.block` is the
wrong comparison; see the SM-04 section. **The credential is `ALCHEMY_API_KEY`, not the
`ETHEREUM_RPC_URL` `.env.example` documents** — the script accepts either.

✍️ **SM-09 is manual and has a checklist, not a script.** `scripts/smoke/09-browser-stake.md`
is walked by hand in a browser — `tsx` cannot drive a wallet extension, and `npm run smoke:09`
only prints a pointer to it. ⚠️ **The checklist covers the wallet half only.** §8's SM-09 also
requires a stake **under `next build`**, and there is no app yet; that half stays open until
Phase 4's staking page exists, so a passing walkthrough makes SM-09 *partial*, not done.

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
  **Status:** **specified 2026-09-06, not yet built.** Promoted out of this list into PLAN-v4 §5.13
  as the worked example of why severity is per-deployment — it is the clearest illustration in the
  build of the adapter being a plausibility layer rather than a renaming one. The implementation is
  still open.

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

## SM-04 — Archive RPC

**Run:** 2026-09-06
**Result:** **PASS**
**Script:** `scripts/smoke/04-archive-rpc.ts`
**RPC:** Alchemy free tier, `eth-mainnet.g.alchemy.com`
**Subgraph:** aave-v3-ethereum `JCNWRypm7FYwV8fx5HhzZPSFaMxgkPuw4TnR3Gpi81zk`, market *Aave Ethereum USDC*

**What it proved:** Ethereum state is servable at blocks a subgraph has long since passed, so the
corroboration check in §5.14 — the only genuinely independent verification the engine has — is
buildable. **And the naive form of that check is wrong**, for a reason that would have looked like
flakiness rather than a bug.

### Findings

#### Alchemy's free tier is genuinely archive-capable

Every historical read succeeded, to 20 million blocks deep:

| probe | block | result |
|---|---|---|
| aToken `totalSupply()` at head−100 / −1k / −10k / −100k | 25,920,837 → 25,820,937 | all ok |
| WETH `totalSupply()` at head−1M / −5M / −10M / −20M | 24,920,937 → 5,920,937 | all ok |
| `eth_getBalance` at **block 1** | 1 | ok |

**Nothing was refused.** The `~128 block` retention limit that R27 is about does not apply to this
provider. **R27 can be retired for Ethereum**, and §5.14's fallback — restrict corroboration to the
retained window and mark `NOT_CHECKED` — is not needed.

⚠️ **The depth ladder needs two kinds of call to mean anything.** `eth_call` against a contract
returns a bare `0x` both when the node cannot serve that block *and* when the contract did not exist
yet — indistinguishable from outside. The first version of this test probed WETH at block 1, got
`0x` because WETH was deployed at block 4,719,568, and **reported a false archive failure**. The
committed script separates three outcomes — `ok`, `no-code`, `refused` — and only a JSON-RPC error
counts against archive capability; genesis depth is tested with `eth_getBalance`, which is meaningful
at every block because every address has a balance at every block.

#### ⚠️ The numbers disagree at `_meta.block` — and the subgraph is not the one that is wrong

Comparing `aToken.totalSupply()` at the subgraph's `_meta.block` against its stored
`inputTokenBalance` gave **different answers on different runs of the same test**:

| run | subgraph `_meta.block` | difference |
|---|---|---|
| first | 25,920,931 | **0 — exact agreement** |
| second | 25,920,936 | **+157,699,605** (+157.70 USDC, 0.00000684%), chain higher |

That is not noise, and it is not a mapping bug. Walking `totalSupply()` back block by block:

```
block 25920947  2305321098238505    +31,539,921 per block
block 25920946  2305321066698584    +31,539,921
block 25920945  2305321035158663    +31,539,921
                     …every block, with no events involved
```

**Aave's aToken `totalSupply()` accrues continuously from `block.timestamp`** — roughly 31.54 USDC
per block on this market — while the subgraph writes `inputTokenBalance` only when a handler runs.
So the two are the same quantity read at two different moments, and the gap grows linearly with time
since the market's last event. The first run agreed exactly only by coincidence: an event happened
to land on `_meta.block`.

⚠️ **A strict equality check at `_meta.block` therefore passes intermittently** — and passes most
often when the chain is busy, which is when a corroboration check matters least. It would have been
read as flakiness in the corroboration adapter for as long as it took someone to walk the blocks.

#### The check can be exact, if it reads at the right block

`Market.indexLastUpdatedTimestamp` identifies the moment the balance was written. Resolving it to a
block and reading there:

```
block 25920948   timestamp 1788729503 == indexLastUpdatedTimestamp
                 totalSupply()      2305321311011136
                 inputTokenBalance  2305321311011136    EXACT
```

**This is the shape corroboration should take:** read the field's own write-time, not the
subgraph's indexing head. It converts a tolerance-based comparison into an exact one, which is worth
a great deal — a tolerance wide enough to absorb interest accrual is also wide enough to absorb the
kind of error the check exists to catch.

✅ **§5.14 is amended (2026-09-06).** It previously said "Compare compatible semantics with
tolerances"; corroboration now resolves the write-time block, reads there, and asserts **equality**,
with `NOT_CHECKED` where the field does not exist. The committed script still reports the diff at
`_meta.block` as the unit specified — it is the evidence for the amendment, not the implementation
of it, which lands with `graph/corroborate.ts` in Phase 1.

#### The write-time field across all five deployments — corroboration is a per-MARKET capability

Surveyed after the run, because the exact-comparison design is worthless if the field only exists on
Aave:

| deployment | schema | write-time field | corroboration |
|---|---|---|---|
| aave-v3-ethereum | 3.1.0 | `indexLastUpdatedTimestamp` | **EXACT** — verified to the unit |
| aave-v2-ethereum | 3.1.0 | `indexLastUpdatedTimestamp` | **EXACT** — verified to the unit |
| compound-v3-ethereum | 3.1.0 | `indexLastUpdatedTimestamp`, **`null` on most markets** | **per-market** — exact where set, `NOT_CHECKED` where null |
| compound-v2-ethereum | 2.0.1 | **none** | **`NOT_CHECKED`** |
| morpho-blue | 3.0.0 | **`lastUpdate`** — its own name | needs no alignment, and disagrees anyway *(below)* |

- ⚠️ **compound-v3 makes this per-market, not per-deployment.** Of its ten largest markets, three
  carry a timestamp and seven are `null` — the base-asset markets have it, the collateral-only ones
  do not. So the corroboration flag cannot live on the deployment config beside the revenue flag; it
  has to be decided per market, at query time.
- **compound-v2 has no equivalent at all.** `_rewardLastUpdatedTimestamp` is a rewards field and
  means something else entirely; using it would be inventing a check rather than performing one.
- ⚠️ **`NOT_CHECKED` where the field is missing — never a tolerance.** A check that silently weakens
  for some protocols is worse than one that admits its limits.

#### ⚠️ aave-v2's field was 27.7 hours behind the indexing head

`indexLastUpdatedTimestamp` on the largest aave-v2 market resolved to block 25,912,723 while `_meta`
was at 25,921,008 — **8,285 blocks, ~27.7 hours**.

**This is the single strongest argument for archive access in the project.** A pruned node retains
~128 blocks; this field sits 65× further back. The `0–1 block` lag on aave-v3 makes archive look
optional, and aave-v2 on the same chain at the same moment shows it is not. The correct comparison
block is a property of *how recently that market traded*, not of how current the subgraph is — a
quiet market can be arbitrarily far back.

#### ⚠️ The check caught Morpho — its subgraph disagrees with its own contract

Morpho Blue accrues only on interaction, so `totalSupplyAssets` is identical at `lastUpdate`'s block
and at `_meta.block`. The block-alignment problem does not exist there. **They disagree anyway**, in
2 of the 3 largest markets:

| market | subgraph `inputTokenBalance` | chain `totalSupplyAssets` | difference |
|---|---|---|---|
| USDC / sdeUSD | 4339128990972897 | 4339128990972897 | **exact** |
| USDC / PAXG | 6212914546395500 | 6212914536395500 | **−10,000,000** *(a suspiciously round number)* |
| USDT / wstETH | 123543053372901 | 123516121110017 | **−26,932,262,884** (~0.02%) |

The subgraph reads **higher** than the chain in both, and the difference is identical at both blocks,
so it is not an alignment artifact. The on-chain `lastUpdate` matches the subgraph's `lastUpdate`
exactly, so the field itself is mirrored faithfully — it is the *balance* that differs.

**This is the first time the corroboration check has caught anything**, and it caught the deployment
`tracking/DECISIONS.md` already flags as returning a wrong number — reached independently, from the
chain rather than from cross-protocol comparison. ⚠️ **Cause not established.** It may be virtual
accrual in the mapping; that needs a source read, not a guess. **Do not build on Morpho balances
until it is.**

#### The subgraph is not lagging, which does not make archive optional

`_meta.block` was **0 to 1 blocks** behind chain head across every run — aave-v3-ethereum is
essentially at head. On that evidence alone a pruned node would serve corroboration today.

That is a property of this moment, not a guarantee. A check that only works while the subgraph is
caught up fails exactly when the subgraph is struggling, which is precisely when its numbers most
need an independent opinion. Archive access is what makes the check unconditional, and we have it.

### To do

- **What:** Decide whether corroboration reads at `indexLastUpdatedTimestamp`'s block (exact) or at
  `_meta.block` with a tolerance, and amend §5.14 to match.
  **Why:** Measured above: the same comparison passes or fails depending on whether an event landed
  on the indexing head. Exact-at-write-time removes the ambiguity; a tolerance sized for accrual is
  wide enough to hide real errors. This is a design decision, not an implementation detail.
  **When:** Phase 1, with `graph/corroborate.ts`
  **Status:** **DECIDED 2026-09-06 — exact equality at the write-time block, no tolerance.** §5.14
  amended and `tracking/DECISIONS.md` records what it cost.

- **What:** Establish why Morpho's `inputTokenBalance` reads higher than the contract's
  `totalSupplyAssets`, and whether Morpho balances are usable at all.
  **Why:** Measured above, on 2 of 3 top markets, with alignment ruled out. The likely explanation is
  virtual accrual in the mapping, but that is a guess and this is a number the product would price
  against. It also compounds the existing Morpho finding in `tracking/DECISIONS.md`.
  **When:** before Morpho appears in any published report
  **Status:** open

- **What:** Carry the corroboration flag **per market**, not per deployment.
  **Why:** compound-v3 sets `indexLastUpdatedTimestamp` on its base-asset markets and leaves it
  `null` on the collateral-only ones — 3 of its 10 largest have it. A deployment-level flag beside
  the revenue flag would be wrong for seven of them.
  **When:** Phase 1, with the corroboration adapter
  **Status:** open

- **What:** Retire R27 for Ethereum, or restate it as provider-specific.
  **Why:** Measured archive access to block 1 on the provisioned RPC. R27's branch — restrict to the
  retained window, mark `NOT_CHECKED` — is dead code for this provider. It stays live only as a
  swap-provider risk. ⚠️ Arc's own RPC **is** pruned (`4444 pruned history unavailable`, SM-08), so
  the risk is real elsewhere.
  **When:** Phase 1
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

## SM-08 — Circle payable call

**Run:** 2026-09-06
**Result:** **PASS**
**Script:** `scripts/smoke/08-circle-payable-call.ts`
**Wallet:** Circle `3aea9090-5266-5d15-b0e9-51e9974f6ed5` → `0x1b7035bbe0da8f3bcb721863d42e1079e4a116a7`
— `accountType` **EOA**, `ARC-TESTNET`
**Receiver:** `0x5d72aDC37C90CA8A493dC8fD06986544ffCf8CfE`

| step | transaction |
|---|---|
| deploy receiver (ethers, `ARC_DEPLOYER_KEY`) | [`0x8b0b2ef6…16e10`](https://testnet.arcscan.app/tx/0x8b0b2ef67a15c0d437e1273d7c68f32f056c2252b6f82e9d932d043844016e10) |
| `ping()` payable, **through Circle** | [`0x4132fb9d…1da143`](https://testnet.arcscan.app/tx/0x4132fb9d09c35cfb721a68fa9c2ad0e2d3cb9a4ab5315d4cb7f31bfa231da143) |

**What it proved:** An agent can spend its own USDC through Circle's infrastructure rather than a raw
private key — a developer-controlled EOA completed a payable contract call on Arc, `msg.sender` is
the Circle wallet, and **`msg.value` arrives at 18 decimals**. Plus Arc's `eth_getLogs` ceiling,
measured (**U10 closed**).

### Findings

#### ⚠️ THE ANSWER — `amount: "2.50"` arrives as `2500000000000000000`. Eighteen decimals.

| | |
|---|---|
| sent | `amount: "2.50"` |
| `msg.value` in the emitted log | `2500000000000000000` |
| transaction `value` field | `2500000000000000000` |
| read at 18dp | **2.5** ✅ |
| read at 6dp | 2,500,000,000,000 ✗ |

**U3 is answered.** Circle's `amount` string is scaled by `10^18` to the chain's native denomination,
not by `10^6` to the ERC-20 view. Confirmed twice over — once from the contract's own `Received`
event and once from the raw transaction's `value` field, which is what Circle actually signed.

⚠️ **Anything storing `msg.value` as a USDC amount must divide by `10^12` first.** R5 is real and now
has a number attached: get this wrong and every figure is off by a trillion.

#### The same holding, presented at two scales

Read against the deployer's 20 USDC, before any of this moved:

| interface | call | result |
|---|---|---|
| native value | `eth_getBalance` | `20000000000000000000` = 20 × 10^18 |
| ERC-20 view | `balanceOf` on `0x3600…0000` | `20000000` = 20 × 10^6 |
| ERC-20 view | `decimals()` on `0x3600…0000` | `6` |

One balance, two authoritative presentations, exactly `10^12` apart. The conversion factor is
measured, not inferred.

#### ⚠️ Native transfers emit an ERC-20 `Transfer` event — at 18 decimals, from a synthetic address

Not something the test set out to find, and the most dangerous thing in this section. The payable
call produced **two** logs, not one:

| # | address | event | value |
|---|---|---|---|
| 0 | `0xffffffffffffffffffffffffffffffffffffffe` | `Transfer(from, to, value)` | `2500000000000000000` |
| 1 | `0x5d72aD…f8CfE` *(our receiver)* | `Received(sender, value)` | `2500000000000000000` |

Arc mirrors every native value movement as a standard ERC-20 `Transfer` log emitted by
`0xffff…fffe` — **not** by the USDC address at `0x3600…0000`.

⚠️ **The amount in that `Transfer` is at 18 decimals, while the token contract those events look like
they belong to reports `decimals() = 6`.** An indexer doing the ordinary thing — match
`Transfer`, look up `decimals()`, scale — is wrong by `10^12`. The event and the metadata that
appears to describe it disagree, and nothing in either one says so.

**Consequence for §5.18.** Value moving on Arc *is* observable through logs, which is useful. But
`0xffff…fffe` carries every native transfer on the chain, so filtering on it hits the row cap
described below almost immediately. **Filter on the market contract's own events, not on the
synthetic `Transfer` stream.**

#### U10 — the ceiling is 30,000 blocks, and Arc's error strings understate both limits

Measured by doubling until refusal then bisecting, on two filters chosen to separate the two limits
Arc actually enforces:

| filter | ceiling | rows at ceiling | refusal above it |
|---|---|---|---|
| address with no logs | **30,000 blocks** | 0 | `-32012 requested range too large` |
| native USDC `0x3600…0000` | ~3,400–3,700 blocks *(drifts)* | ~38,000–39,000 | `-32602 … query exceeds max results 20000, retry with the range <a>-<b>` |

- **30,000 is exact and stable.** 30,000 succeeds and 30,001 refuses, five repetitions each, and the
  figure was identical on all four runs of the script. It is a configured span limit.
- ⚠️ **The advertised numbers are wrong in both directions.** A full-chain span returns
  `-32614 "eth_getLogs is limited to a 10,000 range"` — but 30,000 demonstrably works. The row-cap
  refusal says `max results 20000` — but queries returning **37,888**, **38,952** and **39,047** rows
  were all accepted. Neither number in Arc's error text is the number it enforces.
- **The two ceilings are not the same kind of number.** The quiet one is a block-span limit and is
  constant. The busy one is a row cap wearing a block count, so it moves with traffic — 3,442 blocks
  on one run, 3,384 on the next, 3,652 on the next. Only the row figure carries meaning, and only
  approximately.
- **The refusal names its own fix.** The row-cap error carries `retry with the range <from>-<to>`,
  sized to the advertised 20,000 rather than to what is enforced. That sub-range is the right thing
  for a pager to follow, because it comes from the server's view of where its rows actually are.

**Consequence for §5.18.** The backstop's bound is **30,000 blocks** for a market contract, which is
quiet by construction — roughly 16 hours of Arc at the block rate implied by these heads, so a
backstop sweeping anything shorter than half a day fits in one call.

#### The async model, and a latency that turned out not to be the problem we expected

`createContractExecutionTransaction` returns `{ id, state: 'INITIATED' }` with **no transaction
hash** — the hash appears part-way through a polled state machine:

| elapsed | event |
|---|---|
| 0.0s | submitted → `id 2ae0c90c-…`, state `INITIATED` |
| 2.1s | transaction hash appears; `INITIATED` → `SENT` |
| 4.4s | `SENT` → `COMPLETE` |

**4.4 seconds submit-to-complete.** The brief expected this to fight the serverless flow in Phase 4;
measured, it fits inside a Vercel function's budget with room to spare. ⚠️ **This is one sample and
the state machine carries no upper bound** — it is not evidence the request path can safely block on
it, only that it is not obviously fatal. The Phase 4 decision should still be made on the shape of
the API (poll for a hash that does not exist yet) rather than on this number.

**Nonce discipline matters and is now concrete.** The payable call went out at `nonce 0` from the
Circle wallet. §5.18's rule — never retry a Circle transaction via ethers — holds: it is a different
signer for the same account, so a retry is a duplicate economic action, not a resend.

#### `msg.sender` is the Circle wallet — the half of the address assertion that can run today

The `Received` log's `sender` is `0x1B7035bBe0DA8F3bcb721863D42e1079e4A116A7`, asserted equal to the
provisioned wallet address and failing the run if it is not. This is what §5.18 needs: `claimId`
derives the author from `msg.sender`, and for an EOA the Circle address is deterministic. The
`analysts.ts` half of that assertion moves to Phase 1, when there is a file to compare against.

#### ⚠️ The faucet rate limit is on the API endpoint, not on the faucet

`requestTestnetTokens()` was refused on every attempt across ~35 minutes — HTTP **429**, Circle
`code 5`, `API rate limit error`, empty body, no `Retry-After` — while **`faucet.circle.com`'s web
form funded the same address immediately**. Two front doors to one faucet with independently
configured limits, and only one of them is scriptable.

- **It was already rate-limited before this session touched it.** The first faucet call of the first
  run returned 429 while `getWallet` had succeeded seconds earlier, so this is the faucet endpoint
  specifically, not account-wide API throttling.
- **Worth knowing before anything automated depends on programmatic funding.** A green light in the
  browser is not evidence the API is available; an API 429 is not evidence the faucet is dry.
- The grant that unblocked this run went to the deployer first and had to be redone against the
  Circle wallet — the two Arc addresses in `.env` are easy to confuse, and only the Circle one has a
  `msg.sender` the test can measure.
- SM-05 was forced off USDC onto HBAR by this same faucet on 2026-09-06; that failure was silent
  non-delivery, this one an explicit rate limit. `tracking/DECISIONS.md` records the first.

#### Cost — negligible, and denominated in 18-decimal USDC

| step | gas | price (wei) | cost |
|---|---|---|---|
| deploy receiver | 86,087 | 22,172,800,000 | 0.00190879 USDC |
| `ping()` payable | 22,490 | 36,372,288,000 | 0.00081801 USDC |

The Circle wallet went `20000000000000000000` → `17499181987242880000`, which is
`20 − 2.5 − 0.000818012757120` **to the wei**. The receiver holds `2500000000000000000`. Gas is paid
in the same 18-decimal USDC as value, so there is no second asset to fund.

### To do

- **What:** Set a spend cap on the wallet set in Circle's console before anything autonomous runs on
  Arc.
  **Why:** Circle's limits are **server-side wallet-set policy**, not a client-side option — there is
  no `spendControls` on the developer-controlled-wallets client, and the one in SM-05 was
  `@x402/core`'s and does not transfer. The control that stops an agent overspending on Arc is a
  console setting nobody has made yet, so R8 has no Arc-side answer until it exists. This run spent
  2.5 USDC on a single call with nothing standing in its way.
  **When:** before the agent commits on Arc unattended (Phase 4)
  **Status:** open

- **What:** Convert `msg.value` by `10^12` at exactly one place, and decide whether stored amounts are
  18dp native or 6dp USDC.
  **Why:** Both scales are authoritative for their own interface, so "USDC amount" is ambiguous
  wherever it is written down. One conversion site, named for which side it is on, or the ambiguity
  reappears in the pool math, the payout, the display and the dust.
  **When:** Phase 4, with the market contract and `analysts.ts`
  **Status:** open

- **What:** Never scale an Arc `Transfer` log by the token's `decimals()`.
  **Why:** Native transfers emit `Transfer` from `0xffff…fffe` at **18** decimals while
  `0x3600…0000` reports `decimals() = 6`. The ordinary indexing idiom is wrong by `10^12` here, and
  it fails silently. If the backstop ever reads those logs, this is the trap.
  **When:** Phase 4, with event ingestion
  **Status:** open

- **What:** Assert `analysts.ts` address == the Circle wallet address once `analysts.ts` exists.
  **Why:** §5.18 requires it and only the `msg.sender` half can run today. A mismatch would mean the
  app attributes claims to an address the chain never saw.
  **When:** Phase 1, with `analysts.ts`
  **Status:** open

- **What:** Measure how far back Arc's public RPC actually serves logs, if the backstop ever needs to
  backfill.
  **Why:** A full-chain sweep returned `4444 pruned history unavailable`, so
  `rpc.testnet.arc.network` is **not archive** — the same class of limitation that has SM-04 blocked
  on Ethereum. It does not affect a forward-running ticker, which only sweeps recent blocks, so it is
  recorded rather than measured. Seen during probing; the committed script does not test for it.
  **When:** only if backfill becomes a requirement
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

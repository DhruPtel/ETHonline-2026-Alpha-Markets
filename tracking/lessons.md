## 2026-09-05 — The adapter layer isn't about field names

**Expected.** Morpho Blue is the biggest lending protocol Messari never deployed, so adding it
would cost us adapter work: find Morpho's own field names, write a translation to ours, maintain
two query documents. That was the whole reason to add it during smoke tests — to measure what a
non-standardized protocol costs before Phase 1 commits to an adapter design.

**What happened.** Morpho publish their subgraph on Messari's standardized template. Introspection
returned `lendingProtocols`, `schemaVersion`, `totalDepositBalanceUSD` and `totalBorrowBalanceUSD`
under exactly those names, with the same types and the same USD units. Our shared document ran
against it unchanged, first try. Zero field mapping. Measured against aave-v3, Morpho's
`LendingProtocol` is missing 7 fields and adds 4; Compound v2 at 2.0.1 is missing 18 — so the
protocol we thought would be hardest is a *smaller* schema gap than one we already cross.

The cost showed up somewhere else. Same names, different meanings behind them:

- `inputToken` is the **collateral** token, but `inputTokenBalance` and `totalSupply` hold the
  **loan** token amount. Market "USDC / PAXG" reports `inputToken: PAXG` (18dp) with a balance that
  only parses as USDC at 6dp. The loan asset is in `borrowedToken`, a field Compound v2 doesn't have.
- **Collateral is absent from TVL.** `totalValueLockedUSD` equals `totalDepositBalanceUSD` to the
  last digit, and `Market.totalCollateral` is a raw BigInt with no USD counterpart anywhere in the
  schema. On Aave, collateral *is* deposits. Comparing the two TVLs compares different quantities.
- **28 markets report deposits exactly equal to borrows** — 100.0000% utilization to the wei. They
  carry $9.52B of a $13.06B headline. The largest, USDC/PAXG at $6.21B, is backed by 0.0596 PAXG,
  about $200 of gold. Strip the 28 and Morpho is roughly $3.65B, which is the plausible figure.

So the honest read is that a standardized schema standardizes the *shape* of the answer and nothing
about whether the answer is true. Compound v2 is a schema version behind and its numbers are right;
Morpho is a version behind and its headline is off by ~3.6x.

**What changes.** Phase 1's adapter layer is not a field-renaming layer — on this evidence renaming
is close to free. It is a **per-deployment plausibility layer**: utilization ceilings, collateral
coverage against borrows, TVL/deposit reconciliation, and a documented note per deployment saying
which of its fields mean what. **PLAN-v4's description of the adapter should be read that way.**
This doesn't contradict the G1.5 claim in §3 — "add a 3.1.0 POOLED protocol via one config line"
is still literally true, and Morpho is fresh evidence for it. What it adds is that one config line
buys you a query that runs, not a number you can publish.

*The work this implies — the plausibility checks and the per-deployment field-semantics note — is
tracked in `tracking/smoke-results.md` under SM-02.*

**Second lesson, same run — the oracle guard has to be per-deployment.** Unit 2b's guard flags any
market with `inputTokenPriceUSD == 0` while `inputTokenBalance > 0`, on the assumption that deposits
are derived from price times balance and a zero price silently zeroes the deposits. That holds on
Aave, where it never fired. On Morpho it is wrong twice over: the price is the *collateral* price,
the balance is in the *loan* token, and deposit USD is derived from the loan token, so a zero
collateral price breaks nothing. 337 of Morpho's top 500 markets report a zero price, holding $11.0B
between them. A global guard fires 337 times and every one is a false positive. Guards belong with
the deployment, not with the query.

*Tracked in `tracking/smoke-results.md` under SM-02.*

## 2026-09-05 — Snapshots survive, but their revenue fields don't

**The headline is the good one.** SM-03 asked whether a `financialsDailySnapshot` from twelve months
ago can still be read, and it can. The plan's reading of graph-node's pruning SQL was right:
snapshots are written once per day and never superseded, so pruning cannot reach them. Aave v3
returned complete seven-day windows at 6, 12, 18 and 24 months back, and the oldest snapshot in the
deployment is **2023-01-27** — the day Aave v3 launched on Ethereum. Retention is not "long", it is
total. **PLAN-v4 §5.16's settlement design holds and needs no amendment for balance metrics.**

**What disagreed with the plan is one column in those rows.** `cumulativeTotalRevenueUSD` came back
as 8.24e16 — eighty-two quadrillion dollars — for every day in the twelve-month window. That is not
a rounding artifact, it is a poisoned accumulator, and it is still poisoned at the head: the live
`lendingProtocol.cumulativeTotalRevenueUSD` reads **2.79e17**.

Tracing it back: revenue was sane from launch through **2024-07-04** ($136M cumulative, ~$800k/day).
On **2024-07-05** a single day booked $1.63e15 in revenue and the cumulative never recovered. It has
happened **38 times since**, roughly monthly, most recently 2026-08-19. So it is not one bad event
that could be subtracted out as a constant — it is a recurring mapping fault, and any "corrected"
cumulative would go stale the next time it fires.

The damage is precisely scoped, which is the useful part. Counting snapshots whose value exceeds
$1e12 across the whole history:

| field class | field | bad days |
|---|---|---|
| balance | `totalDepositBalanceUSD` | **0** |
| balance | `totalBorrowBalanceUSD` | **0** |
| flow | `dailyDepositUSD` | **0** |
| flow | `dailyBorrowUSD` | **0** |
| revenue | `dailyTotalRevenueUSD` | **38** |

Balances and flows are clean across 1,300+ days. Only revenue is wrong.

**What changes.** §5.16 says "⚠️ Events do not reproduce revenue — they don't reconstruct interest
accrual and fee accounting." That line was written to explain why we must read revenue from
snapshots rather than rebuild it from events. It is still true, but it now cuts the other way: events
can't produce revenue and **snapshots can't be trusted for it either**, so on aave-v3 there is no
sound revenue number available from this subgraph at all. The question set narrows to balance and
flow metrics; the settlement mechanism is untouched.

*The four consequences — fixing the accumulator, sweeping the other deployments, forbidding revenue
as a market subject, and gating the field before it reaches a report — are tracked in
`tracking/smoke-results.md` under SM-03.*

The broader pattern is worth naming, because it has now shown up twice in two days: **a standardized
schema guarantees the field exists and parses, and guarantees nothing about whether it is true.**
Every figure that reaches a report or a settlement needs a range it must fall inside.

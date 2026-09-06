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

## 2026-09-05 — You cannot check canonical key order by parsing the JSON back

**Expected.** SM-01 verifies RFC 8785's property-sorting vector by canonicalizing the RFC's input
object and confirming the values come out in the order the RFC publishes. The obvious way to read
that order back is `Object.values(JSON.parse(canonical))`.

**What happened.** It failed, and it failed convincingly — the expected order began "Carriage
Return", "One" and the actual began "One", "Carriage Return", which looks exactly like a
canonicalizer sorting on the escaped form (`\r` starts with backslash, 0x5C, which sorts after `1`,
0x31) instead of the raw code unit the RFC requires. That is a real and known class of JCS bug, the
library is a third-party dependency, and the finding was one write-up away from being reported as a
conformance failure in `canonicalize`.

It was not. **JavaScript enumerates integer-like keys before string keys, regardless of insertion
order.** `JSON.parse` on the correct canonical text `{"\r":"cr","1":"one"}` produces an object whose
first key is `"1"`, because `"1"` is an array-index-like property name and the language specifies
that those come first in ascending numeric order. The round trip through an object destroyed the
ordering the test was trying to observe. The canonical text had been right the whole time.

Two things saved it. The §3.2.4 vector in the same run compares **UTF-8 bytes** against the hex the
RFC publishes, and it passed — so the same canonicalizer was simultaneously proving itself correct
on a byte comparison while appearing to fail on an object comparison, which is a contradiction that
demands explanation rather than a bug report. And the minimal isolation case printed the raw output
string, where `{"\r":"A","1":"B"}` is visibly in the right order.

**What changes.** Two rules for everything downstream of the hash:

- **Verify canonical output as bytes or as text. Never through a parsed object.** Any object model —
  JavaScript's, or whatever the Foundry-side verifier uses — is free to reorder keys on parse. A
  verifier written the way this test was first written will disagree with a correct hash, and from
  the outside that is indistinguishable from our hasher being broken. This is the concrete reason
  PLAN-v4 §8 wants the golden vectors shared with Foundry, and it is tracked as a to-do under SM-01.
- **Report field names should avoid integer-like keys entirely.** Nothing in the current report shape
  uses one, and nothing should — a key like `"1"` or `"2024"` would sit in a different place in a
  parsed object than in the canonical bytes, for no benefit.

The wider point, which is now the third instance this week: **a green test and a red test are both
claims that need checking.** The Morpho TVL was wrong while every field name was right; aave-v3's
revenue was absurd while the arithmetic summed; and here a correct library looked broken because the
measuring instrument was. Fixing the vector, as CLAUDE.md warns against, would have hidden a real
trap instead of recording it.

## 2026-09-06 — A research note said the facilitator doesn't do testnet. It does.

**Expected.** SM-05's first step was meant to be a formality: confirm Blocky402 advertises
`hedera:testnet` before doing anything expensive. `docs/research/x402-protocol-spec.md:258` says
flatly: "**Blocky402 does not support `hedera:testnet` — mainnet only.** Our testnet dev loop has to
run against `https://x402.org/facilitator` with a different feePayer."

**What happened.** `GET https://api.testnet.blocky402.com/supported` returns 200 with
`exact` / `hedera:testnet` / `extra.feePayer: 0.0.7162784`. Testnet is supported and always was. The
note had queried `api.blocky402.com` — the *mainnet* host — seen only `hedera:mainnet` advertised, and
generalised from one host to the vendor. `scaffold-hbar-x402-followup.md` records both hosts correctly,
so the repo held the right answer and the wrong one at the same time.

**Why this one was expensive to get wrong.** It is not a stale detail. **R12 — running x402 on testnet
— is the decision that unblocked SM-05 at all**, and it rests entirely on Blocky402 supporting testnet,
because H1.2 requires settlement through Blocky402 specifically. Had we taken that note at face value,
R12 would have read as unavailable, and the only remaining path was mainnet HBAR: an exchange
withdrawal behind KYC on an unknown clock, in front of a Phase 0 gate. A single unverified sentence
came close to costing days of waiting for something we already had.

**What changes.** Two rules, both cheap:

- **A capability claim about a vendor is a claim about a host.** `api.blocky402.com` and
  `api.testnet.blocky402.com` are different deployments with different fee payers. Research notes must
  name the host they measured, and a negative result on one host is not a result about the other.
- **Anything a plan branch depends on gets re-measured at the moment the branch is taken**, not
  inherited from research. `/supported` is one HTTP GET; it is now step 1 of SM-05 and the script
  refuses to continue if the answer changes.

*The correction to `x402-protocol-spec.md:258` is tracked in `tracking/smoke-results.md` under SM-05.*

## 2026-09-06 — Mirror Node lags consensus, and the facilitator reads Mirror Node

**Expected.** `TokenAssociateTransaction` returns a SUCCESS receipt from a consensus node, so the
account is associated and a payment can follow immediately. The trap SM-05 was written to avoid was a
different one, and a known one: an unassociated account returns an *empty token list* rather than an
association error, which reads as `insufficient_balance` and sends you to top up a wallet that was
already funded.

**What happened.** The buyer's association returned SUCCESS, and a Mirror Node query issued
immediately afterwards reported the account as **not associated**. The seller, associated ~2 seconds
earlier in the same run, reported correctly. Re-querying moments later showed both associated. It was
never an association failure — it is ingestion lag between consensus and the Mirror Node REST API.

The reason it matters is where else that source is read. `@x402/hedera` uses Mirror Node deliberately
and says why: consensus-node token queries "no longer return that data dependably", so both
`createHederaPreflightTransfer` and `createHederaVerifyPayerSignature` go to Mirror Node instead. **The
facilitator's pre-settlement check therefore reads exactly the source that is briefly stale.** A
payment fired seconds after associating can fail preflight for "recipient not associated" when the
recipient demonstrably is — a failure that points at the wrong thing, on the path where money moves.

So the original trap has a sharper sibling: *association state read too early is wrong in the same
direction as association state never established*, and the two are indistinguishable from the output.

**What changes.** SM-05 polls Mirror Node for up to 10 seconds for the association to appear before it
reads any balance, and reports association and balance as two separate facts so neither can be
mistaken for the other. The same window applies anywhere provisioning is followed by an immediate
payment — the buyer agent's first purchase after being funded is exactly that shape, so this belongs
in `payments/buyer.ts` in Phase 3, not just in a smoke script. Tracked under SM-05.

This is the fourth instance of the pattern already named twice in this file: **the field was correct,
the value was correct, and the answer was still wrong** — this time because it was read too soon.

**Addendum, same day — it bit again at the other end of the payment.** The first passing run of SM-05
reported the buyer's and seller's HBAR balances as *unchanged* across a settlement that had
demonstrably succeeded, and derived a nonsensical negative fee from the difference. Same cause: the
after-balance was read the instant `settlePayment` resolved, which is consensus finality, not Mirror
Node ingestion. Polling until the balance moves fixed it, and the numbers then came out exact.

Two things worth taking from the repeat. First, **the failure was silent and plausible** — a zero
delta with a clean PASS above it reads like a fee-free payment rather than a stale read, and it would
have gone into the record as a finding if the transaction hadn't been checked directly. Second, the
fix for "did the money move" is not a balance diff at all: the Mirror Node **transaction record** is
authoritative, gives the fee attribution outright, and needs no before/after arithmetic. SM-05 now
prints both, and the record is what the conclusion rests on.

## 2026-09-06 — A spend control we didn't know we had, and a note that said we didn't

**Expected.** `docs/research/scaffold-hbar-x402-followup.md` reviewed the upstream buyer script and
concluded: "**It's a CLI script, and it has no spend cap.** Pays whatever the server asks —
unacceptable for an autonomous agent," then sketched a wrapper that inspects `accepts` and refuses
anything over a cap. The clear implication is that spend limiting is ours to build.

**What happened.** Switching SM-05's price to HBAR, the payment was refused before anything was
signed:

```
Error: All payment requirements were rejected by spendControls: only default assets or entries in
spendControls.allowedAssets are allowed.
```

`@x402/core` 2.25.0 ships client-side spend controls that are **on by default**: only assets
`findDefaultAsset` recognizes are payable, capped at `DEFAULT_MAX_AMOUNT_PER_PAYMENT` ("$1"). On
`hedera:testnet` the only default asset is USDC, so native HBAR — the chain's own currency — is not
payable without being opted in. The guard the note said to build already existed, and it stopped us.

**The right read is that the default is correct and we were wrong about needing to build it.** It is
fail-closed on exactly the dangerous case: an agent being handed a 402 quoting an asset nobody
declared. The temptation was `spendControls: false`, which the error message helpfully offers; that
would disable both the asset allowlist and the cap. Instead HBAR is opted in with its own atomic
per-payment cap, so the control keeps working and only the intended asset passes through it.

**What changes.**

- **`spendControls: false` must never appear in product code.** It is the one setting that turns an
  autonomous buyer into something that pays whatever it is asked. R8 ("agent overspends") has a
  server-side answer already — reserve before submission — and this is its client-side half.
- **Every asset the buyer may pay in gets an explicit `allowedAssets` entry with an atomic cap**, set
  in `payments/buyer.ts` rather than per call site. Tracked under SM-05.
- **The research note's spend-cap section is superseded.** It described a real gap in the *template's
  script*, not in the library, and at 2.25.0 the library covers it. The wrapper it proposes is still
  worth having for the quote inspection, but not for the reason given.

The pattern this time is a new one, and the pleasant version: **a dependency was more careful than our
notes said it was.** Worth checking for before building a guard from scratch.

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

## 2026-09-06 — A research sample that was read but never run

**Expected.** `docs/research/asset-tokenization-studio.md` §3a is the most carefully built artifact
in the research folder: a complete, annotated `deployEquity` call with every field of a 17-field
struct filled in, each choice justified, the ISIN generator verified against three real ISINs, and
the whole thing measured against a live testnet factory. SM-07 was supposed to be transcription.

**What happened.** Two of its field values revert on-chain, and the sample as published cannot
deploy anything.

- `maxSupply: 0n`, annotated "0 = unlimited", reverts `NewMaxSupplyCannotBeZero()`. The zero-bypass
  is real — `isCorrectMaxSupply` is `cap == 0 || amount <= cap` — but it lives in the *runtime* cap
  check, while `Cap.initializeCap` carries an `onlyValidNewMaxSupply` modifier that rejects zero at
  creation. Two functions, opposite rules, and the note read the friendlier one.
- `regulationType: 0` (`NONE`) reverts `RegulationTypeAndSubTypeForbidden`. `_isValidTypeAndSubType`
  accepts only `REG_S`+`NONE` or `REG_D`+`{506_B, 506_C}`. There is no "no regulation" option;
  `NONE` exists in the enum as a *sub*-type value and as an invalid *type* value.

The first cost a reverted deploy — 948,129 gas, ~$0.08, nothing created. The second cost nothing,
because it was caught by reading `regulation.sol` before running rather than after.

**Why the good note still missed them.** The review had no funded key, and says so plainly at the
top: *"No funded Hedera key, so no write was signed — reads and cost measurements are real;
write-path claims are marked."* Everything it measured is correct. `deployEquity` is a write, so the
sample is precisely the part that could not be checked, and it is also the part that looks the most
authoritative — 40 lines of real code with a comment on every field.

**What changes.**

- **An unrunnable code sample is a hypothesis, however well annotated.** Both errors were found by
  reading the Solidity the ABI package already ships — `contracts/` is 4.2 MB of it, sitting in
  `node_modules` — not by reading the note. When a sample cannot be executed, the contract source is
  the authority, and it was available the whole time at zero cost.
- **Read the initializer, not just the getter.** Both faults have the same shape: a permissive rule
  at use time and a stricter one at creation time. `maxSupply` and `regulationType` are both
  validated by a modifier on the function that sets them, and neither validation is visible from the
  behaviour the note described.
- **A revert reason is not free on Hedera, and the script must go get it.** ethers returned
  `"transaction execution reverted"` with `error.data` undefined, because the relay reports a failed
  transaction as a status-0 receipt with no revert data. The selector existed only in Mirror Node's
  `/api/v1/contracts/results/{hash}` under `error_message`. Without that lookup the first failure
  was unattributable, and the temptation is to change something and try again — which on a factory
  means paying for another deploy. **`07-ats-issue-transfer.ts` now falls back to Mirror Node for
  every revert.**

*The correction to `asset-tokenization-studio.md` §3a is tracked in `tracking/smoke-results.md` under
SM-07.*

This is the sixth instance of the pattern this file keeps recording, and the first where the wrong
answer was in our own research rather than in a vendor's data or docs: **the field was correct, the
value was plausible, and it still did not work.** The three earlier vendor cases at least had an
outside party to blame. This one we wrote ourselves, carefully, and it was still a guess.

## 2026-09-06 — U11 answered: Sourcify verifies a ResolverProxy, exact match, first attempt

**Expected.** PLAN-v4 §12 carried U11 — "does Sourcify verification work for a ResolverProxy?" — as an
open question deferred to Phase 3, and the honest position going in was that nobody knew. **No ATS
contract on Hedera testnet was verified on Sourcify: not our token, not the public factory
`0.0.9213391`, not the resolver `0.0.9212226`.** The ATS team have never verified their own
deployments. There was no precedent to copy and a real chance the answer was "no", for a structural
reason: a diamond proxy created *inside* another transaction rather than by a top-level creation
transaction is exactly the shape that trips creation-bytecode matching.

**What happened.** `exact_match`, on the first submission, with `runtimeMatch: exact_match` and 17
source files in the repo. The structural worry was half-right and turned out not to matter:
`creationMatch` is `null` — Sourcify cannot find creation bytecode for a contract the factory built
with `new ResolverProxy(...)` — but the runtime match stands on its own, and the runtime match is what
makes a block explorer render source and decode events. **"Where applicable" has no teeth for this
contract class after all.**

**What made it work was refusing to submit until the bytes agreed.** The verification is only as good
as the Standard JSON Input, and the package ships none — `artifacts/build-info/` is explicitly
excluded by its `files` array, the artifacts carry no `metadata` field, and the metadata CID embedded
in the bytecode resolves nowhere on IPFS. Every input had to be recovered from somewhere else:

| input | recovered from |
|---|---|
| solc 0.8.28, optimizer on, runs 100, evmVersion cancun | upstream `hardhat.config.ts` at the reviewed commit |
| bytecodeHash `ipfs` | the CBOR trailer in the deployed bytecode itself |
| 16 package sources | traced from `ResolverProxy.sol`'s import closure |
| `@openzeppelin/contracts` **4.9.6** | upstream `package-lock.json` — `package.json` says `^4.9.6` |

**That last row was the live trap.** A caret range is not a compiler input. Solidity's metadata hash
covers every source in the compilation unit, so a different 4.9.x would have changed the trailing
bytes even though `EnumerableSet` contributes nothing to a 390-byte dispatcher. The manifest could not
answer it; the lockfile could.

**What changes.**

- **Compile and compare before submitting, always.** The metadata hash is *in* the deployed bytecode,
  so an exact reassembly is checkable offline for free, and a submission becomes a formality rather
  than an experiment. `scripts/verify-ats.ts` will not POST until the 390 bytes are identical.
- **On a mismatch, never reach for the optimizer.** The script says so in its own failure path, and
  it reports whether the difference falls inside the CBOR trailer (metadata inputs are wrong — a
  source's bytes, a source *key*, or a setting) or in executable code (wrong contract or wrong
  compiler). Tuning settings until a hash lands certifies source that is not what ran, which is worse
  than not verifying at all.
- **Source *names* are compiler inputs.** The metadata records them verbatim, so the keys have to be
  the ones hardhat used — `contracts/…` for package files, `@openzeppelin/contracts/…` for the
  node_modules import. Getting the file bytes right and the key wrong fails identically.

The pattern this file keeps recording appears again, inverted for once and in our favour: the answer
was not in the documentation, the package, or IPFS — it was in the artifact itself. **A deployed
contract carries a fingerprint of exactly how it was built, and that fingerprint is checkable without
asking anyone's permission.**

## 2026-09-06 — An RPC that misstates its own limits, in both directions

**Expected.** U10 asks for "Arc's `eth_getLogs` range limit" — one number, discoverable by widening a
sweep until the node refuses and reading the ceiling off the last success. PLAN-v4 §5.18 needs it to
size the ticker's backstop.

**What happened.** The number is **30,000 blocks**, and the node says otherwise. Pushing a sweep to
the full chain returns:

```
-32614  request exceeded max allowed range: eth_getLogs is limited to a 10,000 range
```

A 30,000-block sweep succeeds anyway — five repetitions, three separate script runs, 30,000 always
accepted and 30,001 always refused. The limit is real, exact and stable; the number quoted in the
error is a third of it.

The row cap misstates itself the other way. Filtering a busy address refuses with:

```
-32602  request exceeded max allowed range: query exceeds max results 20000,
        retry with the range 60799336-60801026
```

— and yet queries returning **37,888** and **38,952** rows were accepted on either side of it. The
cap is roughly double the number it advertises. Its *suggested retry range*, though, is sized to the
advertised 20,000, so the server is internally consistent about the fiction and not about the fact.

**Why this is a lesson and not a note.** Both numbers are exactly the kind a developer copies out of
an error message into a constant. Either copy is wrong: sweeping 10,000 blocks wastes two thirds of
each call, and sizing a pager to 20,000 rows leaves half the capacity unused — while a developer who
trusted the *absence* of an error would be equally misled, because the enforced row cap moves with
traffic and the same block span passes one hour and fails the next.

**What changes.**

- **Limits get measured, never read off an error string.** The probe is committed as step 2 of
  `scripts/smoke/08-circle-payable-call.ts` and reruns in seconds, so the figure can be re-checked
  whenever Arc changes rather than trusted from a comment. It also runs **before** the funding gate,
  which is why U10 closed on a run that never got USDC.
- **Two limits, two shapes.** A block-span cap is constant and safe to hard-code; a row cap is a
  function of traffic and must be handled at runtime. The backstop sizes to **30,000 blocks** for a
  market contract — quiet by construction — and treats a row-cap refusal as a paging signal.
- **When a server names a retry sub-range, follow it.** It is computed from the node's own view of
  where the rows actually are, which beats any constant we could pick, and it is correct even though
  the number beside it is not.
- **The same probe found that `rpc.testnet.arc.network` is not archive** — a full-chain sweep returns
  `4444 pruned history unavailable`. Harmless for a forward-running ticker, and recorded in
  `tracking/smoke-results.md` rather than measured, but it is the second RPC in this project whose
  history depth is a constraint (SM-04 is still blocked on the first).

The shape here is the inverse of the `@x402/core` spend-control lesson: there, a dependency was more
careful than our notes claimed. Here, a dependency is more capable than its own error messages claim.
**Neither the optimistic nor the pessimistic reading of documentation survived contact — only
measurement did.**

## 2026-09-06 — One balance, two decimals, and an event that agrees with neither

**Expected.** U3 asked one question: does Circle's `amount: "2.50"` arrive as `2500000` at the ERC-20
scale or `2500000000000000000` at the native one? PLAN-v4 §5 framed it as an ambiguity to resolve —
pick the right constant and move on.

**What happened.** It is 18 decimals: `msg.value == 2500000000000000000`, confirmed from the emitted
log and from the raw transaction's `value` field. That part went as planned. **The framing did not.**
It is not that one of the two scales is right and the other is a misreading — both are live, both are
authoritative, and they describe the same money:

```
eth_getBalance(0xA6B1…8079)            20000000000000000000    20 × 10^18
balanceOf(0x3600…0000, 0xA6B1…8079)               20000000    20 × 10^6
decimals(0x3600…0000)                                    6
```

Then the payable call emitted **two** logs where the contract emits one:

```
0xffffffffffffffffffffffffffffffffffffffe  Transfer(from,to,2500000000000000000)
0x5d72aD…f8CfE                              Received(sender,2500000000000000000)
```

Arc mirrors every native value movement as a standard ERC-20 `Transfer`, from a synthetic address —
**and puts an 18-decimal number in it**, while the token contract those events look like they belong
to reports `decimals() = 6`.

**Why this is the dangerous one.** The idiom for indexing a transfer is: match `Transfer`, read
`decimals()` off the token, scale. On Arc that idiom is wrong by `10^12`, it involves no mistake, and
it fails silently — the number is plausible at both scales, which is exactly why "2.50" was chosen
for the test instead of a round one. The two sources disagree and neither announces it.

**What changes.**

- **"A USDC amount" is not a well-formed quantity on Arc.** Every stored, compared or displayed value
  needs its scale in the name or the type. R5's branch — "normalize; test contract input, pool math,
  payout, display, dust" — is now the plan of record, with `10^12` as the factor and **one** named
  conversion site.
- **Never scale an Arc `Transfer` log by the token's `decimals()`.** Tracked in
  `tracking/smoke-results.md` against Phase 4 event ingestion.
- **The synthetic `Transfer` stream is not the backstop.** `0xffff…fffe` carries every native transfer
  on the chain, so it hits the row cap within a few thousand blocks. Filter on the market contract's
  own events, which are quiet, and get the full 30,000-block span.
- **Value moving on Arc is observable through logs at all**, which was not certain before. That is
  worth having; it just is not free.

The pattern, twice in one test: **the numbers a system reports about itself are not the numbers it
enforces.** Arc's RPC understates its own `eth_getLogs` limits in the error strings, and Arc's token
metadata understates the scale of its own transfer events. Both were only found by measuring.

## 2026-09-06 — A bare `0x` means two different things, and one of them is a lie

**Expected.** SM-04's depth ladder asks a simple question: how far back will this RPC serve state?
Walk `eth_call` backwards, see where it stops answering, report the depth.

**What happened.** It reported a false failure. The ladder probed WETH's `totalSupply()` at **block
1**, got back `"0x"`, counted it as a refusal, and printed `FAIL SM-04` — on a provider that had just
served every other depth including 20 million blocks back.

`eth_call` returns a bare `0x` for **two unrelated conditions**:

| condition | response |
|---|---|
| the node cannot serve state that old | `0x` |
| there is no contract code at that address, at that block | `0x` |

WETH was deployed at block 4,719,568. At block 1 it is not a contract, it is an empty account — so
the empty return was correct and meant nothing about archive retention. **The probe designed to
distinguish node capability from contract age was itself defeated by that exact confusion**, which is
the part worth writing down: the comment above it claimed WETH "exists at every depth worth probing,"
and block 1 quietly wasn't.

**What changes.**

- **Three outcomes, not two.** The committed probe classifies `ok` / `no-code` / `refused`, and
  **only a JSON-RPC error counts against archive capability**. An empty result is data about the
  address, not about the node.
- **Test genesis depth with `eth_getBalance`, not `eth_call`.** Every address has a balance at every
  block, so an error is unambiguous — there is no "the account didn't exist" reading to confuse it
  with. That is what now establishes full-archive access.
- **A ladder needs a probe that is valid at every rung.** Choosing a contract for a depth test means
  the test is bounded by that contract's deployment block, whether or not anyone noticed.

The near-miss shape is the same as SM-01's: **the test was wrong, not the thing under test.** There
it was a JSON round-trip reordering keys and accusing a correct canonicalizer; here it was an empty
return accusing a working archive node. Both would have been reported as an external failure. Worth
the habit — when a smoke test fails against something that has no other reason to be broken, suspect
the probe first.

## 2026-09-06 — A freeze dated to the calendar would have frozen the wrong shape

**What we expected.** §9 put "freeze `types/wire.ts`" among the Phase 0 gates, and §5.18 said "freeze
wire contracts (`Report`, `Computed`, `Verdict`, `Provenance`) Day 1". The reasoning was sound and is
still sound: two subsystems that each define their own idea of a `Verdict` will disagree eventually,
and the disagreement surfaces late, in the seam between them, where it is expensive.

**What happened.** Phase 0 was nine smoke tests against live infrastructure, and three of them
returned concepts the wire contracts have to carry that nobody had thought of on Day 1:

| concept | states | came from |
|---|---|---|
| `RevenueAvailability` | usable / poisoned / not_tracked | SM-03's revenue sweep — aave-v3's accumulator is poisoned, morpho never wrote revenue at all |
| `CorroborationStatus` | MATCH / MISMATCH / **NOT_CHECKED** | SM-04's write-time survey — compound-v3 carries the field on 3 of 10 markets, so the third state is not an error case, it is the honest answer |
| `Completeness` | complete / INCOMPLETE | paginating a population that exceeds one page, per §5.18's amended page-size line |

Each one is a **three-state flag where the obvious design is a boolean**, and each is three-state for
a reason discovered by running something. A `Report` frozen on Day 1 would have carried
`revenueUSD: number` and a `corroborated: boolean`. Both are wrong in the specific way that is worst:
they parse, they typecheck, and they lie. Unfreezing them in Phase 1 means a migration on a contract
whose whole purpose is not to move.

**What changes.** The freeze moves to **Phase 1 Unit 1 — before the first consumer** rather than
before the first day. §9's Phase 0 line and §5.18's Types bullet are amended, and SM-01's open to-do
about the report field set now points at Unit 1.

**The rule underneath, which is the part worth keeping:** a freeze protects against *divergence
between consumers*, so it binds at the first consumer. Dating it to the calendar instead is a proxy
that happens to coincide when nothing is learned between the two moments — and Phase 0 exists
precisely to learn things. **Any gate written as "do X on Day 1" should be re-read as "do X before
Y", and if Y can't be named, the gate may not be a gate.**

## 2026-09-06 — The gateway does not name its two block failures differently, and retention is 1000x the plan's estimate

**What we expected.** PLAN-v4 §8 has listed "exact pruning error strings" as an open Day 1 lookup
since the plan was written, and Unit 3's brief supplied the two it expected: `only has data starting
at block number` for a block below the retained window, and `has only indexed up to block number` for
one above the indexed head. The warning attached to them was sound — both contain "only" and "block
number", so a substring match would confuse a recoverable failure with an unrecoverable one.

**What happened.** Neither string exists. Probed against the live gateway on aave-v3 across seven
depths, what actually comes back for **both** cases is the same message:

```
bad indexers: {0x3b9b…: Unavailable(missing block: 24921900, latest: 25921898), …}
```

**The two failures are not distinguishable by prose at all.** They are the same string with different
numbers in it, and the discriminator is arithmetic: `missing > latest` means we asked ahead of the
head, `missing < latest` means we asked behind the retained window. A careful full-phrase match — the
exact thing the brief asked for, and correctly — would have matched nothing and left both branches
dead. The guard would have looked present and never fired.

There is also a **third** block failure the plan did not anticipate, with its own string:

```
bad query: requested block 1, before minimum `startBlock` of manifest 16291071
```

That is a block below the subgraph's own genesis. It is worth separating because `PRUNED` is
described as recoverable by reading a snapshot instead, and this one is not recoverable by anything —
the data never existed. It is now its own kind, `BEFORE_START_BLOCK`.

**And the retained window is not ~500 blocks.** §5.15 sizes the whole common-block design on
`prune: auto` retaining 500–600 blocks, and concludes cross-protocol pinning "only works if the
slowest deployment is <~100 minutes behind the fastest". Measured on aave-v3:

| depth | result |
|---|---|
| head − 600 | OK |
| head − 100,000 | OK |
| head − 400,000 | **OK** |
| head − 800,000 | PRUNED |

So the window is somewhere between 400,000 and 800,000 blocks — **weeks to months, not 100 minutes.**
Three orders of magnitude off.

**What changes.**

- `classify()` in `client.ts` discriminates on the arithmetic and keeps the anticipated phrases only
  as a fallback for a gateway version that might emit them. The measured path is the live one.
- **§5.15's premise needs revisiting before Unit 5.** Its `lo = max(earliest_retained)` rule is right
  and should still be built — but the bound it guards against is far looser than the plan assumed,
  which strengthens finding #7's suspicion that the per-protocol-asof fallback is dead code. The rule
  costs little and the day it matters it matters; the *sizing* around it is what was wrong.
- ⚠️ **Measured on aave-v3 only.** Retention is an indexer property and may differ per deployment.
  This is one sample, not a survey, and it should not be written into config as though it were five.

**The pattern, third time now.** SM-03 found a field that parses and lies; SM-04 found a comparison
block chosen before anyone checked when the value was written; this found two error branches that
would never have fired. Each was a case where the code would have run clean and been wrong, and each
was caught by running the thing against reality rather than reasoning about it. **A guard written
against an unverified string is not a guard, it is a comment.**

## 2026-09-07 — A field missing from a schema errors loudly; it does not return null

**What we expected.** The working assumption going into Unit 4 was that a field absent from a
deployment's schema comes back as `null`, so a document written against 3.1.0 could run
"successfully" against 2.0.1 and quietly return nothing. The proof was to be built around hunting
nulls, because "a null is how a version mismatch hides".

**What happened.** It is the other way round. Unit 3's demo asked aave-v3 for `totallyNotAField` and
got **HTTP 200 with an error in the body**: ``Type `LendingProtocol` has no field
`totallyNotAField` ``. GraphQL validates the document against the schema before executing it, so an
unknown field fails the whole query. There is no partial success and nothing to miss.

The sweep then confirmed it at scale. Six fields — `name`, `schemaVersion`,
`totalDepositBalanceUSD`, `totalBorrowBalanceUSD`, `totalValueLockedUSD`,
`cumulativeTotalRevenueUSD` — asked of 28 deployments across **five** live schema versions
(3.1.0, 3.0.1, 3.0.0, 2.0.1, 1.3.0). Every one of the 25 that answered returned **all six, with zero
nulls**.

**What changes.**

- **A version mismatch cannot hide.** It is the loudest failure the gateway produces: the deployment
  drops out of the result set entirely with a named field in the message. That is strictly better
  than a null, and it means Unit 4's documents get validated by simply running them.
- **Nulls still matter, for a different reason.** A null means the field *exists and was never
  written* — Morpho's revenue, `not_tracked`. That is the case the four-state `RevenueAvailability`
  now separates from `not_in_schema`. Hunting nulls is still worth doing; it just finds a different
  bug than the one we were bracing for.
- ⚠️ **The intersection is much wider than feared.** The worry was that five live versions would
  shrink the common field set to almost nothing. Measured, the balance sheet travels across all five
  unchanged. Unit 4 does not need a dispatch mechanism for these fields, and per its own constraint
  should not build one.

**The shape of this is familiar and worth naming.** Three times now the danger has been assumed to be
*silence* — a wrong number that parses, a check that quietly weakens, a field that returns null — and
twice the real behaviour was loud instead. It is worth checking which one a system actually does
before designing defences around the quiet case, because a defence against silence costs real
complexity and buys nothing if the system already shouts.

## 2026-09-07 — Correction: the retained window is ~500 blocks after all, and aave-v3 is the outlier

**Amends the 2026-09-06 entry above**, which reported the retained window as "at least 400,000
blocks — three orders of magnitude" past §5.15's estimate, and said §5.15's sizing needed revisiting.

That entry carried its own caveat — *"measured on aave-v3 only… one sample, not a survey"* — and the
survey now exists. Measured across the five publishable deployments by probing pinned reads at
increasing depth:

| deployment | deepest answerable |
|---|---|
| aave-v3-ethereum | **439,844 blocks** (61 days) |
| aave-v2-ethereum | between 300 and 600 |
| compound-v3-ethereum | between 300 and 600 |
| compound-v2-ethereum | between 300 and 600 |
| spark-lend-ethereum | between 300 and 600 |

**§5.15 was right.** `prune: auto` at 500–600 blocks describes four of the five, and a common window
of roughly 100 minutes is what the arithmetic gives. aave-v3 is the exception — more indexers serve
it, and at least one keeps far more history — and generalising from the flagship inverted the
conclusion about the entire design.

**What changes.** `blockwindow.ts` uses `RETENTION_FLOOR = 300`, the deepest depth confirmed
answerable on **all five**, not the deepest on the best one. The proof shows what the other choice
costs: with aave-v3's 439,844 as the floor, the window pins a block four of the five deployments
cannot answer, and does it without complaining. **The floor has to be the tightest deployment in the
set, not the loosest, and a single generous outlier is the most dangerous thing to measure first.**

**Two things found on the way, both worth more than the correction.**

**1. `_meta.block.number` is one indexer's head, not the deployment's.** Every sweep has reported
"zero block spread" across five deployments, and that is true of the head each *returns*. Deliberately
requesting a block above the head makes the gateway list every indexer with its own head, and they
disagree badly: aave-v2 has **10 indexers spanning 57,859 blocks**, one of them eight days behind.
compound-v2 and compound-v3 span ~5,500 across 7. So "zero spread" was measuring agreement between
whichever indexers happened to answer, not agreement between deployments.

**2. That exposed a real bug in `client.ts`.** `classify()` read only the **first** `missing block:
X, latest: Y` pair in the error and decided PRUNED vs LAGGING from it. With ten indexers the first
one listed decided the verdict for all of them — and on aave-v2 the first was lagging while eight
others had passed the block and pruned it, so a permanent condition was reported as "wait and
retry". Fixed: the deployment is `LAGGING` only if **every** indexer is still short of the block; if
any has passed it and still cannot serve it, waiting will not help. **A multi-value error message
parsed as a single value is a bug that only appears once the fleet is heterogeneous** — it was
invisible on aave-v3, which has four closely-matched indexers.

## 2026-09-07 — A pinned-block response hash differed once and has not done so again

**What we expected.** A query pinned to a block is deterministic: same block, same data, same hash.
That is the assumption evidence records rest on, and through it the assumption a settlement rests on
— `graph/evidence.ts` records a SHA-256 of the response so a figure can be proved months later, after
the source has pruned.

**What happened.** Immediately after swapping `evidence.ts` onto the shared canonicalizer, the Unit 11
demo reported two reads of aave-v3's balance sheet at block 25922949 hashing differently —
`2d38a1d64cf72883…` against `a639158181239702…`.

**It has not reproduced.** Since then, at pinned blocks: 2 back-to-back identical, 10 consecutive
identical, 25 identical while interleaving morpho-blue market pages and compound-v2 balance sheets to
vary gateway routing, and the demo itself now passes. **37 queries, one hash each time.**

**What we do not know.** Whether the one observation was a genuine disagreement between two indexers
serving the same block, a transient at the gateway, or something in that particular run. Unit 8
established that aave-v2 has ten indexers spanning 57,859 blocks, so **indexers serving one deployment
demonstrably differ from each other** — but differing *heads* is not the same claim as differing
*state at the same block*, and nothing here demonstrates the second.

**What changes.**

- **Nothing is claimed as fixed**, because nothing was diagnosed. The swap to the shared canonicalizer
  is not implicated: it hashes the same bytes the private implementation did, and the canonical JSON
  of two same-block reads was byte-identical every time it was compared afterwards.
- **The demo keeps its divergence printer.** If it recurs it now prints the exact character offset
  and both surrounding fragments, so the next observation is evidence instead of another anecdote.
- ⚠️ **Before settlement depends on this, it needs a real answer.** A response hash that is
  intermittently unstable at a pinned block would make an evidence record unfalsifiable in exactly
  the dispute it exists to settle. Recorded as an open question against Phase 4, not against Phase 2.

**The habit worth keeping:** the instinct was to explain it — routing, the swap, the pinning change —
and each explanation was plausible. Testing them took three probes and disproved all three. **An
unreproduced failure that has been chased and not caught is a different thing from a fixed one, and
writing it down as the first is the only honest option.**

## 2026-09-07 — morpho-blue's cumulative deposits read $378 sextillion, and nothing we built catches it

**What we expected.** Phase 1 established morpho-blue's problems precisely: revenue never written,
TVL semantics inverted, a −10,000,000 disagreement with its own contract. Three known faults, all
flagged, all handled.

**What happened.** The agent, writing a balance overview with the new skills loaded, printed:

> **Morpho's cumulative deposits read $3.78 × 10²³** — roughly $378 sextillion. This is not a large
> number, it is a broken one, and I have left it out of the table rather than print it as if it meant
> something.

Verified directly:

| deployment | `cumulativeDepositUSD` |
|---|---|
| aave-v3-ethereum | 2.21e+12 — $2.21T, plausible |
| compound-v2-ethereum | 3.11e+11 — $311B, plausible |
| **morpho-blue** | **3.78e+23** |

It is a **fourth** independent fault on that deployment, and it is a different one: the revenue
accumulator was never written, this one is written and absurd.

**What we do not have.** `RevenueAvailability` gates revenue figures per deployment because SM-03
swept them. **There is no equivalent for cumulative flow figures**, and nothing in `invariants.ts`
bounds them — the checks look at current balances, utilization, oracle state and market sums.
`cumulativeDepositUSD`, `cumulativeBorrowUSD` and `cumulativeLiquidateUSD` reach a report unexamined.

**What changes.**

- ⚠️ **A plausibility bound on cumulative figures is missing and should be a check.** The shape
  already exists in triage's revenue test — `> 1e12` is absurd for a lending protocol — and the same
  reasoning applies to lifetime flows, with a higher ceiling. Recorded rather than built, because it
  belongs in `invariants.ts` and that unit is closed.
- ⚠️ **The sweep should test cumulative fields the way SM-03 tested revenue.** We know how many
  deployments have poisoned revenue because someone looked at all five. Nobody has looked at
  cumulative deposits across 25.

**The part worth keeping.** This was not found by a check. It was found by a model that had been told
to lead with the answer and justify every figure, looking at a number and saying *this cannot be
right*. **Our checks encode the faults we already knew about; the thing that found a new one was
asking for a defensible report and watching what refused to go in it.** That is an argument for the
skills being load-bearing rather than decorative, and also a warning: the check suite is a record of
past findings, not a net.

## 2026-09-07 — A determinism test that lets each run pick its own block tests nothing

**What we expected.** Unit 9's proof runs the same plan twice and asserts the hash is identical —
the property Phase 4's market settles against. The instruction was explicit: if it differs, stop.

**What happened.** It differed, and the diff pointed at a real-looking culprit:

```
a: "value":"417588213.6204767011585996247070755"
b: "value":"417588213.6330579891865771488389195"
```

aave-v2's cumulative revenue, apparently at the same block, differing between two runs seconds apart.
That reads exactly like the pinned-read instability recorded on 2026-09-07 and never reproduced.

**It was the test.** Each run called `execute` with fresh state, so **each resolved its own common
block** — and the chain head moves between them. The two reports were of different moments and
*should* hash differently. Measured to confirm:

| probe | result |
|---|---|
| 8 balance-sheet reads at one pinned block | 1 distinct value per field |
| 3 `execute` runs, no market walk | identical block, identical hash |
| 2 `execute` runs, second reusing the first's block | **identical hash** |

**What changes.** The proof now passes run 1's resolved block into run 2 through the state it hands
back — which also exercises the resumable-state shape rather than just declaring it. A determinism
test has to fix everything the run does not control, and the block is the largest such thing.

**Two things worth separating.**

- **This does not explain the 2026-09-07 evidence-hash anomaly.** That case used one `pinned`
  constant for both reads, so it was genuinely the same block. It remains unreproduced — and this
  investigation strengthens rather than resolves it, because reads at a fixed block have now been
  measured deterministic across 13 more attempts.
- ⚠️ **This is the fifth failed check this session that was the check's fault**, after SM-01's key
  ordering, the report fixture's replacer array, `ops.ts`'s hand-typed quotient, and the skills demo's
  unflushed stdout. The pattern is stable enough to state as a rule: **when a check fails against
  something that has no other reason to be broken, the check is the more likely suspect — and the
  more alarming the failure looks, the more true that is.** Three of the five looked like serious
  findings on first read.

## 2026-09-07 — We built the elaborate report format before the simple one

**What we expected.** Every rule we added to the report format was right on its own. Flag the figure
you cannot stand behind. Explain why something was withheld rather than dropping it silently. Say
what was checked and what was not. Say that `consistent_only` is normal rather than a caveat. Say
that an absence is not a finding. Each of those came from a real measurement and each prevented a
specific way of misleading a reader.

**What happened.** Together they produced a compliance document. The Aave memo spent more words on
what could not be verified than on what the protocol is — a *Checks* section explaining that an
external reference was not supplied, an *Exclusions* section explaining that nothing was excluded, a
paragraph on why a withheld figure is not zero, and a verdict restated in three places. Every
sentence was defensible. The whole was not worth reading.

**The mechanism is worth naming.** Each rule told the model to *account for* something. Given six
such rules and no counterweight, accounting for things became the task, and the analysis became the
part that fitted in whatever space was left. **We had taught it to perform carefulness rather than to
think**, and it performed beautifully, which is why it took a while to notice.

**What changed.** The format is now a table and up to 500 words. The skills went from 288 lines to
131, and the renderer prints the table and the analyst's read and nothing else. ⚠️ **The engine still
computes all of it** — every check, the verdict, coverage, provenance — and all of it stays in the
`Report` object and inside the hash. We kept the rigour and stopped printing it. That distinction is
the whole point: this was a rendering decision, not a retreat from correctness.

**What to remember when adding rules back.** The next caveat rule will also be individually correct,
and that is not the test. The test is whether the report is still mostly about the protocol.

- **Add a rule only against an observed failure**, not against an imaginable one.
- **Count the rules.** Six was too many. There is no principled number, but the direction of drift is
  one-way — rules accumulate and nothing removes them, because removing one always looks like
  accepting a risk.
- ⚠️ **Prefer shaping the container to instructing the model.** The strongest constraint in the new
  format is not a sentence in a skill, it is that the tool accepts one table section and a summary.
  There is nowhere to put performed carefulness, so spending words on a caveat costs the analysis
  directly and the model has to decide it is worth it.

**And a smaller casualty worth recording.** The eight-market table rule — which we *measured*, top-8
covering 85–98% of every deployment's book — was cut with the rest. The measurement stands and is in
this file's history; the rule may come back if a report ever needs a market table. It is a fair
example of the cost: stripping back loses good rules along with the ones that were smothering the
output.

## 2026-09-07 — The narrator's prompt is mostly digits, and the FACTS block is nearly all of them

**What we expected.** Three typed-digit incidents in a week — a computed utilization column, market
population counts, "Twenty-three of the 63" — and a plausible culprit: the CHECKS block. Every
`CheckResult.rationale` is rendered into the narrator's prompt verbatim, and rationales are full of
formatted numbers the model cannot cite as `{fact:ID}`. The hypothesis was that stripping numbers
out of rationales would relieve the pressure.

**What happened.** Measured rather than argued, by rebuilding exactly the strings `context()` sends
and counting maximal digit runs in each block:

| plan | facts | digit runs in FACTS | of which in values | digit runs in CHECKS |
|---|---:|---:|---:|---:|
| aave-v3, balance-sheet only | 6 | 22 | 10 | 5 |
| makerdao, markets + balance-sheet | 132 | **1,644** | 190 | **5** |

Two things fall out. **The FACTS block dominates by between four and three hundred times**, so
rationales were never the main source. And **CHECKS is flat at 5 while FACTS scales with the market
population** — the check count barely moves whether a deployment has one row or sixty-three, while
every market contributes an id, a label and a value. The 1,644 is mostly fact ids: market addresses
are hex, so `0x...` ids carry many digit runs each, which is why the total is far larger than the
190 runs inside actual values.

**What changes — nothing, deliberately, and that is the point.** The FACTS block stays exactly as it
is. The model needs to see values to reason about magnitude: it cannot say a book is unusually
concentrated, or that a gap is a rounding error, without knowing whether the numbers are large or
small. Blinding it would make the prose shallower, which is the thing the whole format is optimised
for. The rationales stay too — they are the engine's honest record and they are in the hash.

⚠️ **The guarantee moves to the boundary instead.** This is what Unit 11 was always for: the model
sees everything, reasons freely, and the validator rejects any digit in narration text that is not
inside a `{fact:ID}` placeholder. Fixing it by removing information from the prompt would have
traded a real capability for a check we can perform exactly at the output.

**What this measurement is for.** It sizes the pressure Unit 11 has to hold against. A single-
deployment report shows the model 22 digit runs; a market breakdown shows it 1,644, of which 190 are
figures it might plausibly want to quote. The validator is not guarding against an occasional slip —
it is the only thing standing between a prompt that is mostly numbers and a report that must contain
none the reader cannot trace.

## 2026-09-07 — Half the file headers described designs that had been removed

**What we expected.** Reading six files end to end — `client`, `adapter`, `reconcile`, `compose`,
`execute`, `narrate` — the header comments should be the most reliable thing in each of them. They
are the first thing anyone reads, they are written when the file is young and its shape is clear,
and nothing about them is subtle.

**What happened.** **Three of the six headers were wrong**, each describing a design that had been
deliberately removed, and each contradicted by a correct comment further down the same file:

| file | the header said | the code did |
|---|---|---|
| `client.ts` | `QueryMeta.blockNumber` is the indexing head, and callers want `requestedBlock ?? meta.blockNumber` | it is the block the data came from, always — the pinning change is recorded forty lines above |
| `compose.ts` | the model is given **two tools** and must call one — a plan or a clarification | one tool, forced; the clarification tool was removed and line 79 says so |
| `narrate.ts` | **"No validation here"**, and it returns sections and paragraphs | it validates before rendering, and it returns one table string |

⚠️ **Every one of them was more dangerous than the code it described.** `client.ts`'s was the worst:
Phase 4 settlement reads that exact field to decide which block a disputed figure came from, and the
comment told a future reader to derive it a different way. Nothing had acted on it — checked — so
the comment was the whole bug rather than a symptom of one.

**Why it happened, and it is not carelessness.** Every one of these changes was made under a tight
scope: *"remove the forms"*, *"turn off clarification"*, *"fix the schema"*. The named files were
edited, the change was proven with a run, and the header — which is not where the change lives —
went untouched. The correcting comment was added **at the site of the change**, which is exactly
where a careful person puts it, and that is what left two contradictory comments in one file.

**What changes.** ⚠️ **The header is part of the diff.** When a change removes a concept — a form, a
tool, a field, a return shape — updating the file header happens in the same commit, not later and
not opportunistically. Concretely: if a change makes any sentence in the header false, the header is
in scope even when the brief named other files.

Two supporting habits worth keeping, both of which this session used and both of which worked:

- **Write the correction where the reader will hit it first**, then check whether anything upstream
  in the same file now disagrees. A grep for the removed concept's name across the file catches it
  in seconds.
- **Say which way the correction went.** Each of the three rewrites records what the comment used to
  claim, so someone holding an old copy — or an old summary of one — can tell which is current. A
  comment that quietly becomes right leaves no way to date it.

## 2026-09-07 — An external explanation that had been true once cost us the real cause

**What we expected.** A report came back with a garbled paragraph — the whole assessment was
`><br t xml:space=` — and the working explanation was the Anthropic spend limit. That was not a
guess out of nowhere: **it had been the correct answer days earlier**, when two proof runs failed on
`400 invalid_request_error: Your credit balance is too low` and the stripped report format sat
unverified because of it. The explanation was cheap, external, and had a track record.

**What happened.** Measured instead: five narrations of one fixed draft — same plan, same 140 facts,
so the model call was the only variable.

| run | ms | stop_reason | table | assessment |
|---|---:|---|---:|---|
| 1 | 197,296 | max_tokens | 2,430 chars | missing |
| 2 | 221,046 | max_tokens | 2,642 chars | missing |
| 3 | 221,021 | max_tokens | 2,642 chars | missing |
| 4 | 27,353 | tool_use | 2,241 chars | `"placeholder"` |
| 5 | 65,400 | tool_use | 2,642 chars | missing |

**Zero usable reports.** Not an intermittent glitch — the directive was broken. Two candidate causes
were ruled out by measurement rather than argument: adaptive thinking contributed nothing
(`thinking_tokens: 0` on a controlled call), and the derived-ratio request was not enough on its own
(a synthetic 134-fact version of the same question completed in 39s). Three runs produced an
identical 2,642-character table and then failed, which locates the degeneration inside the summary
string rather than the table.

⚠️ **And the cap was where it surfaced, not why it happened.** The widest legitimate output this call
can be asked for is roughly 3,500 tokens; 16,000 was never too small. The budget was being consumed
by a generation that had come off the rails, which is why raising it buys a longer pathology rather
than a fix.

**What changes — the test to apply before accepting an external explanation.** ⚠️ **Does it predict
the SHAPE of the failure, not just its existence?** A spend limit produces an API error and no
output. What we had was a complete 2,600-character table, a well-formed tool call, and a broken
paragraph — output that a billing failure cannot produce. That inconsistency was visible in the very
first observation, before any measurement, and it is what should have moved the search into the code.

**Why this one was hard to catch, and it is worth naming.** A previously-correct external
explanation is the most dangerous kind. A fresh guess gets scrutiny; one that was right last week
gets a pass, because it already paid off once. The heuristic that fails here is *"this looked like
that"* — and the guard against it is not scepticism about external causes in general, but insisting
that any explanation account for the specific shape of what was observed.

**Cost:** by the project's own account, two days not spent looking at the code.

**Two habits this session used that worked, both cheap:**

- **Fix the draft and re-run the model call alone.** Holding plan and facts constant turned "it
  sometimes garbles" into "zero of five", which is a different problem and gets a different response.
- **Rule causes out with controlled calls, not reasoning.** Two plausible explanations died in one
  API call each. Both would have survived an argument.

## 2026-09-07 — `src/agent/` holds two systems, and nobody decided that it should

**What we expected.** Writing a navigation README for each subsystem should have been a description
exercise — read the files, say what order to read them in. `src/graph/`, `src/engine/` and
`src/types/` were exactly that.

**What happened.** `src/agent/` could not be described in one sentence, because it is two things:

- **The report pipeline** — `compose.ts` → `execute.ts` → `narrate.ts`, plus `skills/`. Deterministic
  code with one model call at each end. This is the part that works and produces reports.
- **A tool-use loop** — `loop.ts` and `tools.ts`, used only by `scripts/ask.ts`.

⚠️ **They never call each other.** `execute.ts` does not use `tools.ts`. `compose` and `narrate` each
open their own `client.messages` call rather than going through `loop.ts`. The only thing shared
between the two halves is the `MODEL` constant — which lives in `loop.ts`, so the two files that
import it are both in the half that does not use the loop.

The directory name describes the smaller half. `execute.ts` is the largest file in it and the least
agent-like thing in the repo.

**Why it happened.** `loop.ts` came from Phase 0's smoke test and was promoted in Phase 1 Unit 12,
when the deliverable was "an agent that answers questions." The report pipeline arrived in Phase 2
with a different shape — a plan executed by deterministic code — and needed neither the loop nor its
tools. Both were correct for their phase. Nothing ever asked whether the second should have replaced
the first, because nothing broke.

**What changes — nothing yet, and that is the point of writing it down.** ⚠️ **This is an open
question for Phase 3, recorded so it is a decision rather than an accident:**

> Does the report pipeline eventually run through `loop.ts`, or is `scripts/ask.ts` a separate
> product with its own path?

Both readings are live. If the pipeline is the product, `loop.ts` and `tools.ts` are a demo surface
and should be named as one. If the interactive agent is a product too — a judge or a buyer asking
questions rather than commissioning a report — then two paths is correct and only the directory name
is wrong. Phase 3 forces the answer either way, because a server has to expose one of them.

**What we did instead:** said it plainly in `src/agent/README.md` so a reader is not left inferring
it from the imports. Splitting the directory would cost eight import sites plus every demo, days
before Phase 3, to buy legibility that a paragraph buys for nothing.

**The general shape, worth keeping.** A directory accumulating a second purpose is not visible in any
one commit — every file was right when it landed. It becomes visible the first time someone tries to
write one sentence describing the folder. **Being unable to summarise a directory is a design signal,
not a writing problem.**

## 2026-09-08 — The rule bound the file being changed, and the stale docs were all outside it

**Amends the 2026-09-07 entry above**, *"Half the file headers described designs that had been
removed"*, which ended with **the header is part of the diff.**

**What we expected.** That rule to have been enough. It was applied and it held: writing
`docs/phase-2-summary.md` meant reading all six core logic files, and no file header was found wrong.

**What happened.** The same failure had simply moved outward. Four documents *outside* the code
carried claims that had been true when written and were not true any more, all of them about the same
event — Unit 11 landing:

| document | said | true state |
|---|---|---|
| `tracking/phases/PHASE-2-status.md` | "Units 1–10 complete. Unit 11 is the only one left", plus a blocking Anthropic credit failure and a report format "nobody has seen" | built; credit cleared days ago; the format had been read all week |
| `tracking/phases/phase-2-tasks.md` | Unit 11 ⬜ **not started** | ✅ done |
| `docs/ARCHITECTURE.md` | "The validator that enforces it on the prose is the one unbuilt unit" | built, wired, and warning by design |
| `README.md` | "✅ works — 10 of 11 units. The digit validator is the one still open" | 11 of 11 |

⚠️ **The last two are the documents a judge opens first**, and both of them told a reader that the
guarantee this project rests on — no model ever types a digit — was enforced by a file that did not
exist.

**Why the header rule did not catch it.** It binds *the file being changed*. Unit 11's own run was
disciplined by that rule and by CLAUDE.md's tracking section: `validate.ts`, its demo, `DECISIONS.md`
and `logs.md` were all written together. What went stale is the class of document that describes **the
state of the project** rather than the state of a file — and no brief that says "build Unit 11" has
any obvious reason to open `README.md`.

**What changes.** The rule generalises, and the generalisation is a short checklist rather than a
principle:

> ⚠️ A change that moves a unit from unbuilt to built, or changes what a component does, is not
> finished until every document that makes a **status claim** says so. There are four:
> `README.md`, `docs/ARCHITECTURE.md`, `tracking/phases/PHASE-N-status.md`, and the phase task board.

**And the fix is almost never deletion, which is the more useful half.** "The validator is the one
unbuilt unit" did not become silence; it became *"it runs on every report and warns rather than
blocks, deliberately"* — which is more information than the original sentence carried, not less. The
stale claim marked the exact spot where something interesting had happened. Cutting the sentence
would have thrown that away and left the architecture doc quieter and worse.

**The shape worth naming.** Documentation rots in proportion to how far it sits from the code that
changed, which is exactly inverse to how early a stranger reads it. The files nobody's brief names
are the files a judge opens first.

## 2026-09-08 — A proxy's own expiry says nothing about whether the proxy will work

**What we expected.** SM-07 recorded a protection against the public ATS infrastructure expiring
inside our window: *"An issued asset outlives the factory that issued it, so an expiry event costs us
the ability to mint new reports, not the ones already minted."* The reasoning was clean and the
evidence looked direct — proxy `0.0.10395983` carries its own expiration of 2026-12-05, well past the
factory's 2026-09-10, and it was read off Mirror Node rather than assumed.

**What happened.** Traced instead of reasoned about, by pulling the internal actions of the transfer
SM-07 had already performed. An ordinary ERC-20 move of that already-issued token is:

```
depth 0  CALL          0.0.10395983   the proxy      expires 2026-12-05
depth 1  STATICCALL    0.0.9212226    the resolver   expires 2026-09-10
depth 2  DELEGATECALL  0.0.9212222                   expires 2026-09-10
depth 1  DELEGATECALL  0.0.9213141                   expires 2026-09-10
depth 2  DELEGATECALL  0.0.9212262                   expires 2026-09-10
depth 3  DELEGATECALL  0.0.9212248, 0.0.9212239      expires 2026-09-10
```

⚠️ **The proxy holds storage. Every line of executable code is in a contract expiring inside the same
80-second window.** The December date protects nothing. The claim was not merely incomplete — it was
backwards about where the risk sat, and it is exactly the sentence someone would have relied on.

**Why the wrong answer was so comfortable.** It came from one true measurement (the proxy's expiry) and
one plausible piece of general knowledge (a deployed token is independent of its factory). Both halves
are individually right. **The join is what is wrong**, and nothing about looking at either half
surfaces it — the trace does, and the trace was one HTTP GET against a transaction we had already made.

**What changes.**

- **A dependency's blast radius is a property of the call graph, not of the deployment story.** "Which
  contracts does this actually touch" is a question with a literal answer on Mirror Node
  (`/contracts/results/{hash}/actions`), and it costs seconds. Reasoning from the proxy *pattern*
  gives the wrong answer for a diamond, where the resolver is on the runtime path of every call.
- ⚠️ **A protection is a claim and gets checked like one.** This repo already refuses to trust a
  vendor's docs, an error string, or its own research sample without measuring. A reassurance we wrote
  ourselves had none of that scrutiny, precisely because it was reassuring.

**And the correction did not change the decision, which is the part worth noticing.** Re-measured, the
dates have not moved and nothing is renewing them — but Hedera has not enabled contract rent on any
network and has not since a March 2023 target, so the whole thing is inert. **The right answer was
already the right answer for the wrong reason.** That is the outcome most likely to leave a false claim
standing, because nothing downstream ever fails to flag it.

*Correction recorded in `DECISIONS.md` under the SM-07 infrastructure decision, with the citations.*

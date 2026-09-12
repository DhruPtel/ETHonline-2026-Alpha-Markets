## 2026-09-05 — Unit 1: smoke-test harness

Created the smallest setup that runs a single TypeScript file with environment variables loaded:
`package.json` (tsx, typescript and @types/node only, plus nine numbered `smoke:NN` scripts),
`tsconfig.json`, `.env.example`, `.gitignore`, and `scripts/smoke/README.md` listing all nine tests
from PLAN-v4 §8 with what each one proves and what it needs. No smoke tests were written — the
scripts point at files that arrive one unit at a time.

The `.gitignore` mattered more than it looks: `.env` already existed in the working tree with
nothing protecting it, and is now ignored.

One thing worth knowing for later: because every script passes `--env-file=.env`, Node errors if
that file is missing, even for SM-01 which reads nothing from it. Copying `.env.example` to `.env`
once on a fresh clone is a prerequisite for all nine, and the README says so.

## 2026-09-05 — Cleanups A and B

Removed the `BUILD-GUIDE.md` mention from CLAUDE.md's last section, since that document isn't going
in the repo — the line now says only that PLAN-v4 is the spec. Separately, deleted the 16
`:Zone.Identifier` files (15 committed under `docs/research/`, one stray in `docs/planning/`) and
added `*:Zone.Identifier` to `.gitignore` so WSL stops reintroducing them on every download.

All 15 research notes are intact; only the metadata sidecars went.

## 2026-09-05 — Unit 2: SM-02, one live Graph query

Created `scripts/smoke/02-query-subgraph.ts`, which sends a single POST to The Graph's gateway for
the aave-v3-ethereum subgraph and prints the deployment hash, indexed block, and the protocol's
name, schema version and deposit/borrow totals. This had to answer before anything else could be
built, since every report and every market settlement reads through this same path. It handles
three failures separately — no API key, a non-200 response, and the one that matters, an HTTP 200
whose body carries `errors`, because GraphQL reports query failures in the body rather than the
status code.

It passed on the first run. `schemaVersion` came back **3.1.0**, matching what Messari's
`deployment.json` claims, so the Phase 1 adapter has no version drift to absorb for this
deployment. Indexed block was 25,914,910 (2026-09-06T01:07:47Z), `hasIndexingErrors: false`.

The surprise was the deposit figure: $24.77B, against DefiLlama's $14.64B for the same protocol.
That is not an error — Messari reports gross supplied, DefiLlama reports net. Subtracting borrows
gives $14.75B, within 0.8% of DefiLlama. It confirms in live data what the research note had
measured on-chain, and it means any comparison against an outside reference must subtract borrows
first. The deployment hash `QmcXE5QVcBcvcaJddPxd8mFs6W9xt7STmwfgguoiM6ddAd` is recorded here for the
first time; it is the value the `DEPLOYMENT_CHANGED` check will pin against.

## 2026-09-05 — Unit 2b: SM-02 second query, top markets

Added a second query to `scripts/smoke/02-query-subgraph.ts` returning the five largest active
markets in Aave v3 by borrow balance, printed as a plain table with a warning line for any market
whose price is zero while it still holds tokens. USDT, USDC, USDe, DAI and WBTC came back, all with
sane prices, so the broken-oracle guard did not fire on live data.

Two things worth carrying forward. The guard needed `inputTokenBalance` added to the selection set:
`totalDepositBalanceUSD` is derived from balance times price, so a zero price forces deposits to
zero too, and a check written against deposits alone could never trip. And the two queries are
separate HTTP calls with no pinned block, so the protocol totals and the market rows are not
guaranteed to describe the same instant — fine for throwaway proof, and exactly the problem
`blockwindow.ts` exists to solve in Phase 1.

## 2026-09-05 — Unit 2c: SM-02 rewritten as a four-protocol comparison

Replaced the contents of `scripts/smoke/02-query-subgraph.ts` with the real cross-protocol test:
the same query document sent in parallel to four separate lending subgraphs — Aave v3, Aave v2,
Compound III and Compound v2 — printing deposits, borrows, schema version and indexed block side by
side. Each protocol fails into its own table row rather than aborting the run, since which
deployments fail is part of what the test is for. The earlier top-five-markets query and its oracle
warning were dropped.

All four answered. Every reported `schemaVersion` matched what Messari's config claims, including
Compound v2 at 2.0.1 — so the same document really does work unchanged across a schema-version gap,
which is the standardization claim the Graph track is judged on. The surprise was the block spread:
zero. All four deployments answered at exactly block 25,915,706, so on this sample the common-block
problem doesn't exist at all.

`morpho-aave-v2-ethereum` was dropped: its subgraph ID appears nowhere in the research notes, which
record IDs for aave-v2/v3, spark-lend, compound-v2/v3 and zerolend only. Also worth noting that
Compound III's deployment hash came back as `QmNrQoow7pjM3biRnnhzeCaDYhuEbDyjKCpFeNv2oGXnuK`,
exactly the value the research resolved offline through IPFS — independent confirmation that the
`AwoxEZ…` subgraph serves Ethereum and not Base.

## 2026-09-05 — Unit 2d: SM-02 gains a fifth protocol, Morpho Blue

Added `morpho-blue` to the target list in `scripts/smoke/02-query-subgraph.ts` and a three-line note
under the table flagging its number as inflated. Nothing else in the file changed except the header
comment, which said "four". Morpho is the largest lending protocol Messari never deployed, so it was
meant to be the test of what a non-standardized protocol costs us.

It cost nothing, which was the surprise. Introspecting the subgraph first — before writing any query
— showed Morpho publish on Messari's own standardized template, so the existing shared document ran
against it unchanged and returned `Morpho Blue`, schema `3.0.0`, $13.06B deposits. All five
deployments now answer one document at the identical block (25916237), across three schema versions:
3.1.0, 2.0.1 and 3.0.0. That is a stronger demonstration of the standardization claim than four was.

The number is wrong, though, and we're printing it wrong on purpose. 28 of Morpho's markets report
deposits exactly equal to borrows — the largest, USDC/PAXG at $6.21B, is backed by about $200 of
actual gold — and those 28 carry $9.52B of the $13.06B total. Roughly $3.65B is the believable
figure. The table now shows the standardization win and the trust problem in the same frame, which
is the honest presentation. Full write-up of why this changes the Phase 1 adapter design is in
`tracking/lessons.md`; the short version is that the adapter is a plausibility layer, not a
field-renaming layer.

One operational note: the run failed four of five rows on the first attempt with `fetch failed`
(ETIMEDOUT to the gateway), then passed 5/5 immediately after. Transient, but worth knowing that
five parallel requests to the gateway are not reliably five successes.

## 2026-09-05 — Unit 3: SM-03, do daily snapshots survive twelve months?

Wrote `scripts/smoke/03-snapshot-window.ts`. It asks the one question Phase 4 depends on: can we read
a `financialsDailySnapshot` from a year ago, after the fact? If not, no market can settle on a named
day and the whole balance-metric question class disappears. The query uses **both** `timestamp_gte`
and `timestamp_lt` and then asserts the returned timestamps actually fall inside the requested
window — with only the lower bound, recent rows satisfy the filter and you get a green result that
proves nothing about retention. Each request gets one retry, because SM-02 hit a gateway timeout that
cleared immediately.

**Snapshots survive.** Aave v3 returned a complete seven-day window twelve months back
(2025-09-06 … 2025-09-12), all seven in bounds, no gaps, no zeros. Probing 6, 18 and 24 months back
returned full windows too, and the oldest snapshot in the deployment is 2023-01-27 — the day Aave v3
launched on Ethereum. There is no retention floor to find; the history is complete. That settles the
highest-stakes assumption in the plan in the affirmative, and §5.16 needs no amendment.

The surprise was in a column we printed almost incidentally. `cumulativeTotalRevenueUSD` reads $82
quadrillion for every day in the window, and $279 quadrillion live. It was sane until 2024-07-05,
when one day booked $1.63e15 and the accumulator never recovered — and it has happened 38 more times
since, most recently three weeks ago. Deposits, borrows and the daily flow figures are clean across
all 1,300+ days; only revenue is affected. The script now prints a `revenue sanity` line flagging it.
Full write-up in `tracking/lessons.md`: the short version is that no market can be written on a
revenue metric, and this is the second protocol in two days where a standardized field name returned
a number nobody would sign.

## 2026-09-05 — Unit 3b: the revenue sweep across all five deployments

Extended `scripts/smoke/03-snapshot-window.ts` with a second section that runs the revenue check
which caught aave-v3 against all five subgraphs at once, pulling the last 30 days of daily and
cumulative revenue and asking four questions of each: is the cumulative plausible for a protocol that
size, how many days book more than a trillion dollars, do the supply and protocol sides add up to the
total, and is the implied annual take against deposits in a range a lending protocol could actually
earn. `gql` gained a deployment argument; nothing else in the file changed.

The answer is good news. **The Messari template is fine — the aave-v3 deployment is at fault.**
aave-v2, compound-v2 and compound-v3 all report plausible revenue with clean arithmetic and implied
take rates between 0.18% and 1.27%. The one that settles it is aave-v2: same authors, same template,
the deployment the plan calls byte-identical to v3, and it is clean. So this is one broken mapping,
not a broken standard, and revenue survives on three of five protocols.

Morpho was the surprise, in a way the table nearly hid. It also fails, but for the opposite reason —
its revenue is not corrupted, it was never written. Zero of 977 snapshots since inception carry any
revenue at all, and protocol, market and snapshot cumulative figures all read exactly 0, while
`Market.interest` sits right there tracking accrued interest in loan-token units that nobody converts
to USD. Because "BROKEN" was covering two opposite faults, the verdict column now says which one.
That distinction is the whole finding: a report that prints "$0 revenue" for a protocol with $11.4B
borrowed is worse than one printing $279 quadrillion, because zero looks like an answer.

Updated `tracking/smoke-results.md`: the sweep to-do is closed, and the three that remain are
narrowed by it rather than left as written.

## 2026-09-05 — Two decisions recorded, and SM-06 written

Recorded both revenue decisions in `tracking/smoke-results.md`. Revenue availability becomes a
three-state per-deployment flag — `usable` for aave-v2, compound-v3 and compound-v2, `poisoned` for
aave-v3, `not_tracked` for morpho-blue — and revenue market subjects are allowed only on the usable
three rather than banned outright. The safety lives in the render rule instead of the ban: poisoned
and not_tracked never reach a page as a number, not even zero. Also promoted the Morpho interest-rate
oddity from an aside to a tracked item; borrower and lender rates identical at 7.99999% on precisely
the two mis-mapped markets is too neat to be coincidence, and equal rates are impossible in a working
market since the spread is where revenue comes from.

Then wrote `scripts/smoke/06-agent-tool-call.ts` — one tool, one deployment, a hand-written
`while` loop over `stop_reason === "tool_use"`, printing each step so the loop is visible. Added
`@anthropic-ai/sdk` (approved) and an `ANTHROPIC_API_KEY` line to `.env.example`. The system prompt
forbids analysis on purpose: the test separates wiring from thinking, and a model that interpreted
the number would make a wrong answer ambiguous between a broken tool and a confused model.

**It has not run.** There is no Anthropic credential on this machine — no key in `.env`, none in the
shell, and no `ant` CLI. The script's guard exits cleanly with the right message, which is all that
could be verified. SM-06 stays NOT RUN in `smoke-results.md` and gets no findings section until it
actually executes.

## 2026-09-05 — Unit 4: SM-01, RFC 8785 conformance

Wrote `scripts/smoke/01-canonicalize.ts`, the one smoke test that needs no network and no keys. It
runs the `canonicalize` package (approved, added) against every test vector RFC 8785 publishes —
the §3.2.2 worked example checked as the UTF-8 bytes §3.2.4 prints in hex, the §3.2.3 property-sorting
vector, all 24 IEEE 754 number samples from Appendix B, and the §3.2.2.3 requirement that NaN and
Infinity raise rather than serialize. Then it hashes a realistic report — protocol slug, block,
deployment hash, figures, verdict — and shows the properties settlement depends on: reordering every
key gives a byte-identical hash, attaching the ATS token address changes nothing because lifecycle
fields are stripped before hashing, and moving one cent changes the hash completely.

29 checks, all passing. Figures are strings because the gateway returns 23-decimal BigDecimals that a
JS number would silently round, and unavailable data is an explicit `null` rather than an omitted key
— an absent key and a null key canonicalize to different bytes, so omission would hash two identical
reports differently. That was the decision the unit asked for.

The interesting part was a failure that wasn't. The property-sorting vector came back red on the
first run, with an actual order that looked precisely like a canonicalizer sorting escaped text
instead of raw code units — a real, known JCS bug class. It was the test that was wrong:
`Object.values(JSON.parse(canonical))` reorders integer-like keys to the front in JavaScript, so
reading the order back through an object destroyed the ordering being measured. The byte-compared
vector in the same run was passing at the same moment, which is the contradiction that gave it away.
Written up in `tracking/lessons.md`, because a Foundry-side verifier written the same way would
disagree with a hash that is perfectly correct.

## 2026-09-06 — Decisions get a home, and three plan amendments

Created `tracking/DECISIONS.md` and seeded it with six choices that had been made but written down
nowhere, or written down only as a to-do item in passing. The format is fixed: date, decision, why
including what we give up, the alternative rejected, and which plan section it affects. CLAUDE.md's
tracking section now names it alongside logs and lessons, with the rule for what belongs in it —
a choice that would mean *rewriting* to undo rather than renaming, which is the same line CLAUDE.md
already draws for what to stop and ask about.

The plan said `DECISIONS.md` belongs at the repo root and we put it in `tracking/` instead, so that
is itself the first entry. The other five: the three-state revenue flag with its absolute render
rule; reading Morpho through its own published subgraph rather than deploying Messari's; Next 16 as
the baseline because `@x402/next` has never supported Next 15; x402 on Hedera testnet; and the
SM-02/SM-04 rescope.

**Three of those contradicted PLAN-v4, so the plan was amended in the same pass rather than left
disagreeing with the repo.** §1's chain table said x402 runs on Hedera mainnet with testnet as an
available fallback — R12 is now marked TAKEN in the risk register and §1 carries the amendment and
the four values R12 requires to move together. §8's SM-02 and SM-04 swapped scope: SM-02 is the
multi-protocol query and is now PASS on its full scope rather than half of it, and SM-04 became the
archive-RPC test, which also meant fixing §5.14's pointer at the old row. §6's repo tree moved
`DECISIONS.md` out of root and gained a `tracking/` line. U4 in §12 is marked answered — SM-03
settled it and the plan hadn't caught up.

The thing worth knowing for next session is what was sitting in `.env` and nowhere else. Five Hedera
variables — seller and buyer account ids and keys, plus the network — had been provisioned, and
`.env` is gitignored, so the *names* existed in exactly one untracked file. They are now in
`.env.example` with the R12 configuration in a comment block above them: facilitator
`api.testnet.blocky402.com`, network string `hedera:testnet`, USDC `0.0.429274`. `ETHEREUM_RPC_URL`
went in at the same time, unset, with a comment saying it must be archive-capable — SM-04 cannot run
without one, so it is BLOCKED rather than NOT RUN, and R27 stays live.

Two smaller corrections. `ANTHROPIC_API_KEY` is now set, so SM-06 is no longer blocked on a missing
credential — it is still NOT RUN, but the reason changed and `smoke-results.md` says so. And the
"Open plan questions" section at the foot of that file became "Resolved plan questions"; the two
questions are kept next to the answer rather than deleted, because the amendment reads better beside
what prompted it.

Documentation only this run — no code, no dependencies. Nothing was executed and no test status
changed on the strength of a run.

## 2026-09-06 — Unit 5: SM-05, the x402 handshake on Hedera testnet

Wrote `scripts/smoke/05-x402-purchase.ts` — the first test where value is supposed to move. It runs
three steps and any of them can stop the run: confirm the facilitator advertises our network, get
both accounts associated with testnet USDC, then run the handshake against an in-process seller.
Added `@x402/core` and `@x402/hedera`, both pinned exact at 2.25.0 (no carets — these ship breaking
changes inside minor releases and must move together). Every Hedera SDK type comes from
`@x402/hedera`'s re-exports rather than `@hiero-ledger/sdk` directly, so there is only one copy of
the SDK installed and nothing can cross-fail at runtime.

**It does not pass, and the reason is funding.** The buyer holds 0 USDC. Steps 1 and 2 are green and
step 3 is written but has never signed a real payment, so no transaction has settled and there is no
id to look up on HashScan. The script stops at the balance check by design rather than working
around it.

Two things came out of step 1 that were worth the trip. The facilitator does advertise
`hedera:testnet` with feePayer `0.0.7162784` — and `docs/research/x402-protocol-spec.md:258` states
the opposite, that Blocky402 is mainnet-only. That note had queried the mainnet host and generalised
to the vendor. It matters because R12, and therefore the entire testnet decision, rests on exactly
that support existing; believing the note would have left us waiting on mainnet HBAR for nothing.

The other surprise was in step 2, and it changed the script. The buyer's association returned SUCCESS
from a consensus node while Mirror Node, queried a moment later, still reported it unassociated. It
is ingestion lag rather than a failure — but `@x402/hedera` deliberately preflights against Mirror
Node, so a payment fired straight after associating can fail with "recipient not associated" when it
demonstrably is. The script now polls for the association to land before reading any balance, and
prints association and balance as two separate facts so a missing association can never be mistaken
for an empty wallet. Both written up in `tracking/lessons.md`.

Without spending anything, the seller half of step 3 was verified end to end: `initialize()` caches
`/supported`, `"$0.02"` resolves to 20000 atomic units of `0.0.429274` out of the package's own
default-asset table rather than a hardcoded token id, the fee payer is copied into the requirements,
and the unpaid request returns a 402 the buyer decodes correctly. What remains untested is sign →
verify → settle → content.

On the two things the unit asked to be noted: the native transaction id is read out of the signed
bytes with `inspectHederaTransaction()` and printed **before** `settlePayment` is called, which is
the only defence against a settle failure returning `{success: false, transaction: ""}` after the
money has already moved — though that path has not been exercised against a real settlement yet. And
the seller genuinely never needs the fee-payer key: `x402ResourceServer` is constructed from the
facilitator URL and the seller's account id alone. The seller's own key appears in the script only to
sign its own token association, which is account setup and not part of the payment path.

No new environment variables were needed — everything came from the five Hedera vars already in
`.env.example`. The file is 334 lines, longer than `03-snapshot-window.ts` at 255 and the longest
thing in the repo. Most of it is printing and failure branches rather than logic — being able to read
every step is the point of the test — but it is over the ceiling and the unit was defined as one file,
so it could not be split without going back for a new unit.

## 2026-09-06 — Unit 5b: SM-05 passes, settling in HBAR

Switched the payment asset from testnet USDC to native HBAR and **SM-05 passes**. A real payment
settled on Hedera testnet through Blocky402: transaction
`0.0.7162784@1788681755.933988660`. The buyer received a 402, signed a partial transfer, the
facilitator co-signed as fee payer and submitted, and `"hello"` came back through the gate. This is
the first test in the project where value actually moved.

The switch was forced rather than chosen — Circle's testnet faucet is not delivering USDC and Discord
requests are unanswered, which is the second time an unbounded external dependency has sat in front of
a Phase 0 gate. HBAR needs no faucet and no association. Nothing the test exists to prove changed with
the asset: same facilitator, same network, same challenge, same signing, same settlement. Recorded in
`tracking/DECISIONS.md` with the two costs it carries, and the association code is kept and skipped
rather than deleted so that pricing in USDC again is a price change and not a rewrite.

Two things had to be worked around, both of which taught us something. The price cannot be a dollar
string for HBAR — `"$0.02"` resolves through the package's default-asset table, which on this network
knows only USDC, and throws — so the price is an explicit `AssetAmount` in tinybars. More interestingly,
**the client's spend controls refused the payment outright** before anything was signed, because they
allow only assets the library recognizes as defaults. That default is fail-closed and it is the only
thing standing between an autonomous buyer and paying whatever it is asked in an asset nobody declared,
so HBAR was opted in with its own atomic per-payment cap rather than switching the control off. Worth
knowing that the research note calling the upstream buyer script uncapped is out of date at 2.25.0.

The money moved exactly as designed, and the Mirror Node transaction record proves it rather than a
balance diff: buyer −100000 tinybars, seller +100000, and the entire 246876-tinybar network fee borne
by the facilitator `0.0.7162784`. **The buyer paid the price and no fees at all.** Worth noticing that
the fee was 2.5× the payment — on sales this small the facilitator subsidises more than the sale, and
their sustainability terms are unknowable from outside, so that is now a tracked to-do rather than a
pleasant surprise.

The native transaction id was read out of the signed bytes and printed before `settlePayment` was
called, and it matched the settled id exactly — so the defence against a settle failure returning an
empty transaction string is now demonstrated against a real settlement rather than a local signature.

Mirror Node's ingestion lag bit a second time, at the other end of the payment: the first passing run
reported both balances unchanged and a nonsensical negative fee, because it read them before the
transfer had been ingested. Same root cause as the association lag from the previous run, so the
after-balances now poll too. That is twice in two runs from one source, which is why it is a lesson
and not just a fix.

## 2026-09-06 — Unit 6: SM-07, an ATS report token issued and transferred

Wrote `scripts/smoke/07-ats-issue-transfer.ts` and **SM-07 passes**. A tokenized report asset now
exists on Hedera testnet at `0.0.10395983` / `0x60c955b9b2d0896b5EEAF285133891D9A7CF7648`, and it has
been moved from the seller to the buyer — `balanceOf` 1 → 0 and 0 → 1, asserted rather than eyeballed,
because proxy creation is not issuance and issuance is not transfer. The transfer is the lifecycle
operation the Hedera Tokenization track asks to see on video. Four transactions: deploy
`0x435d18f8…`, grantRole `0xe35bb1ce…`, issue `0x2dea19e1…`, transfer `0x7674ef49…`.

Added `@hashgraph/asset-tokenization-contracts` and `ethers`, both pinned exact at 8.0.0 and 6.16.0.
ethers was already in the tree transitively under `@hiero-ledger/sdk`, so it is pinned to the version
already there and `npm ls ethers` shows one deduped copy — the same discipline SM-05 needed for the
Hedera SDK. **The 1.4 GB ATS SDK was not installed and will not be**; the ABI package plus ethers is
74 MB and has every function we need.

The first step was the one the unit asked for first: both public ATS contracts were checked on Mirror
Node before anything was built. The factory's expiry is exactly the `1789039172` research recorded —
2026-09-10 — and the resolver's is `1789037489`, **1,683 seconds earlier and never written down
anywhere**. The resolver is the binding constraint, not the factory. Both live, neither deleted. In
`tracking/DECISIONS.md`, along with the reason we are building on someone else's contracts and the
fact that the token we minted carries its own expiry of 2026-12-04 — an issued asset outlives the
factory that issued it, so an expiry event would cost us new mints and not existing ones.

**The interesting part is that the research note's worked example does not run.** Two of its field
values revert on-chain. `maxSupply: 0n`, annotated "0 = unlimited", reverts
`NewMaxSupplyCannotBeZero()` — the zero-bypass is real but lives in the runtime cap check, while the
initializer has a modifier that rejects zero outright. And `regulationType: 0` would have reverted
`RegulationTypeAndSubTypeForbidden`, because the only valid combinations are REG_S+NONE or
REG_D+{506_B, 506_C}; there is no "no regulation" option. The second was caught by reading the
Solidity before running. The first was not, and it cost a real reverted deploy: 948,129 gas, about
eight cents, nothing created. Both faults have the same shape — a permissive rule at use time and a
stricter one at creation time — and both were sitting in the 4.2 MB of contract source the ABI
package ships. Written up in `tracking/lessons.md`.

That first failure also exposed something worth keeping. ethers reported only "transaction execution
reverted" with no data, because the Hedera relay returns a failed transaction as a status-0 receipt
and drops the revert reason. The selector existed in exactly one place — Mirror Node's
`/api/v1/contracts/results/{hash}` under `error_message` — so the script now falls back there on any
revert and decodes the selector against both ABIs. Without it a revert is unattributable, and the
instinct is to change something and pay for another deploy.

`maxSupply` is now `1n`, which is the better value anyway rather than merely the legal one: one
report, one token, and a second mint against the same report is impossible at the contract level.
Compliance came off exactly as predicted — an account that had never touched the token received it
with no onboarding and no association, because ATS tokens are plain ERC-20 on the Hedera EVM. The
report hash went into `additionalSecurityData.info` and came back out of the `EquityDeployed` log
byte-identical; it is event-only, never stored, which is worth knowing for whoever verifies it later.

Cost came in at **$0.6568 for the whole lifecycle and $0.5688 for the deploy alone**, against
research's $0.60-per-asset estimate — the estimate is good. 7,751,345 gas across four transactions,
8.13891225 HBAR, and the seller's balance delta matched the sum derived from the receipts to the
tinybar. Testnet relay gas price measured 110 tinybars/gas against research's 108 on mainnet.

One env line added, `HEDERA_TESTNET_RPC`, pointing at Hashio. The buyer's EVM address did not need a
variable after all — both addresses are derived from the keys already in `.env` and checked against
what Mirror Node says the accounts actually are, so a key and an account id that disagree stop the
run before anything is signed rather than failing three transactions later.

The file is 469 lines, longer than `05-x402-purchase.ts` at 435 and now the longest thing in the
repo. It was flagged as over the ~120-line ceiling before it was written; the unit was defined as one
file with five steps, so splitting would have needed a new unit. Most of the bulk is printing,
per-step failure branches and the reasoning behind each struct field, which is the part that makes
the next ATS call cheap.

## 2026-09-06 — Unit A: the ATS token is verified on HashScan, exact match

Wrote `scripts/verify-ats.ts` and **U11 is answered — Sourcify verifies a ResolverProxy, `exact_match`,
first attempt.** `0.0.10395983` / `0x60c955b9b2d0896b5EEAF285133891D9A7CF7648` is verified for chain
296 with 17 sources, matchId 47208468. That closes the "contracts verified on HashScan where
applicable" pass/fail requirement on the Hedera Tokenization track, and it makes the token's events
render as decoded source rather than raw hex, which is what the demo video needs.

The reason this needed a script rather than a form upload is that the ATS package ships no Standard
JSON Input: `artifacts/build-info/` is explicitly excluded by its `files` array, the artifacts carry
no `metadata` field, and the metadata CID embedded in the bytecode
(`QmVXG2SeSjVAKXWcp6fYWE5VH9xQFnas2z3JQ78D8jJdqP`) is pinned by nobody — seven gateways, nothing. So
every compiler input had to be recovered from a different place. solc 0.8.28, optimizer on with 100
runs and evmVersion cancun came from the upstream `hardhat.config.ts` at the commit the research
reviewed; `bytecodeHash: ipfs` came from the CBOR trailer in the deployed bytecode itself; the 16
package sources came from tracing `ResolverProxy.sol`'s import closure, which turns out to reach
exactly one file outside the package.

That one file was the trap. `@openzeppelin/contracts/utils/structs/EnumerableSet.sol` — and the ATS
`package.json` declares `^4.9.6`, a range, which is not a compiler input. Solidity's metadata hash
covers every source in the compilation unit, so any other 4.9.x would have changed the trailing bytes
even though EnumerableSet contributes no code to a 390-byte dispatcher. The upstream
`package-lock.json` pins it to 4.9.6 exactly, and that is what we installed.

The script's actual point is step 3: it compiles locally and refuses to POST until the 390 bytes are
identical to what is on chain, metadata trailer included. Because the metadata hash lives *inside* the
deployed bytecode, an exact reassembly is checkable offline for free, which turns the submission from
an experiment into a formality. It matched on the first run. The failure path is written to be as
useful as the success path: on a mismatch it reports the first differing byte and says whether the
difference falls inside the CBOR trailer (a metadata input is wrong — a source's bytes, a source key,
or a setting) or in executable code (wrong contract or wrong compiler), and it says explicitly not to
start adjusting optimizer settings, because tuning until a hash lands certifies source that is not
what ran.

Two findings worth carrying. **No ATS contract on Hedera testnet was verified before today** — not
ours, not the public factory `0.0.9213391`, not the resolver `0.0.9212226`. The ATS team have never
verified their own deployments, so there was no precedent and a real chance the answer was no. And
the structural worry was half-right: `creationMatch` is `null` and permanently will be, because the
proxy is created by `new ResolverProxy(...)` inside `deployEquity` rather than by a top-level creation
transaction. It costs nothing — the runtime match is what an explorer reads to render source.

The script takes the address as its only argument and works unchanged for every future report token,
since they are all the same ResolverProxy bytecode from the same factory. It needs no `.env`: it reads
public chain data from Mirror Node and posts public source to Sourcify. Added `solc@0.8.28` and
`@openzeppelin/contracts@4.9.6`, both pinned exact, both dev-only, neither shipping to Vercel.

Also closed **U9** in PLAN-v4 §12 while editing U11 — SM-07 answered it on 2026-09-06 and the plan
had not caught up. One caveat on the confirmation: the Sourcify record is verified from the API
(`exact_match`, re-queried independently after submission), but the HashScan UI rendering itself was
not checked, because that needs a browser and Sourcify's browser-compat endpoint refuses terminal
clients.

## 2026-09-06 — Setup unit: Circle entity secret ciphertext

Wrote `scripts/provision-circle.ts`, which produces the "Entity Secret Ciphertext" Circle's console
Register form asks for and does nothing else — no wallets, that is SM-08. It reuses
`CIRCLE_ENTITY_SECRET` if one is already set and only generates a new 32-byte value when there is
none, because regenerating a registered secret would orphan every wallet derived from the old one.
Added `@circle-fin/developer-controlled-wallets` pinned exact at 10.8.0. The SDK turned out to export
`generateEntitySecretCiphertext({apiKey, entitySecret})` directly, so it fetches Circle's public key
and does the RSA-OAEP encryption itself and we never touch the key.

**It is written and has not produced a ciphertext, because `CIRCLE_API_KEY` is not on this machine.**
The unit brief said it was already in `.env`; it is not, and it was not in `.env.example` either, so
both Circle variables are now documented there. Step 1 runs and prints a secret; step 2 stops with
the reason and tells you the step-1 value is still good. Same shape as SM-06 when that was waiting on
an Anthropic key: the script is correct, the credential is missing, and nothing is claimed to have
worked that hasn't.

Two things worth knowing. The install is **1.2 MB**, not the 5.3 MB the brief budgeted — one
dependency, axios, as expected. And the reason for doing registration by hand may not hold: the SDK's
`registerEntitySecretCiphertext` is typed to return `{ data: { recoveryFile } }`, so the API path
does hand back the recovery file. The console path is still what the script is built for, since that
is what was asked, but the choice can be made on preference rather than on losing the file.

## 2026-09-06 — Unit 7: SM-08, blocked on a faucet but U10 falls out anyway

Picked up SM-08 from an interrupted session. The script turned out to be **already written** and
sound — the previous session had written all of it and provisioned the Circle wallet
(`0x1b7035bb…16a7`, EOA, ARC-TESTNET, LIVE) before stopping, so there was nothing to build. It
already reflected the three answers that came back: a separate `ARC_DEPLOYER_KEY` for the deploy, no
`spendControls` (that was `@x402/core`'s in SM-05 and does not transfer to Circle's client), and
`accountType: "EOA"` because `claimId` derives the author from `msg.sender`.

**It is blocked at step 3 and SM-08 is not a pass.** Circle's faucet returns HTTP 429 / `code 5` /
"API rate limit error" — and it was already rate-limited before this session touched it, since the
very first call of the run got the 429 while `getWallet` had succeeded seconds earlier. That is the
faucet endpoint specifically, not account-wide throttling. Retried at ten-minute spacing and left
running. **Not worked around**: funding the Circle wallet from the deployer key would put a
transaction that can fail on its own between us and the measurement, which is the whole reason the
deployer is a separate key.

The useful part is that **U10 closed on a run that never got any USDC.** PLAN-v4 §8 and §5.18 both
pin "measure Arc's `eth_getLogs` range limit" on SM-08 and the unit brief had dropped it; raised it
rather than picking an interpretation, and it came back as a step to add. It needs no funding, so it
went in as **step 2, before the faucet gate** — which is why it produced an answer at all today.

**Arc's limit is 30,000 blocks of span, and Arc's own error messages are wrong about it.** A
full-chain sweep refuses with "eth_getLogs is limited to a 10,000 range" while 30,000 works —
30,000 accepted and 30,001 refused, five repetitions, identical across three runs. A busy address
hits a different limit, a row cap that refuses citing "max results 20000" after having accepted
queries returning 37,888 and 38,952 rows. Both numbers in the error strings understate what is
enforced, which is exactly the kind of number someone copies into a constant, so it is written up as
a lesson. The first bisect reported "3442 blocks" as a ceiling and that figure was junk — it is a row
cap wearing a block count and it drifted to 3,384 on the next run — so the script now reports the row
count beside it and says which of the two numbers means anything.

**Half the decimal question answered itself for free.** `ARC_DEPLOYER_KEY`, funded from that same
faucet with a nominal 20 USDC, holds `20000000000000000000` raw — exactly 20 × 10^18. So Arc's native
value denomination is 18 decimals, confirmed on-chain, against `decimals() = 6` on the ERC-20 view at
the same address. That makes an 18-decimal arrival the likelier one, and it is **not** the
measurement SM-08 exists for, which is specifically what Circle's `amount: "2.50"` string scales to.
Recorded as a partial answer with that caveat attached, because it is the kind of near-answer that
gets rounded up to a real one later.

Also added `ARC_DEPLOYER_KEY` and `CIRCLE_WALLET_ID` to `.env.example` with the reasoning for each,
closed U10 in §12, amended §5.18 to carry the measured bound, and logged a to-do that **a spend cap
still has to be set on the wallet set in Circle's console** — Circle's limits are server-side policy,
so nothing in code covers it and R8 has no Arc-side answer until someone opens the console. The
script is now ~390 lines with the new step, most of it comment and error handling; the added logic is
about 60 lines.

## 2026-09-06 — Unit 7b: SM-08 passes, and the answer is 18 decimals

The faucet cleared and SM-08 ran end to end. **`msg.value` arrives at 18 decimals** — Circle's
`amount: "2.50"` became `2500000000000000000`, confirmed both from the receiver's `Received` event
and from the raw transaction's `value` field, which is what Circle actually signed. The payable call
is [`0x4132fb9d…1da143`](https://testnet.arcscan.app/tx/0x4132fb9d09c35cfb721a68fa9c2ad0e2d3cb9a4ab5315d4cb7f31bfa231da143)
and `msg.sender` is the Circle EOA, asserted rather than eyeballed. **U3 is closed and U10 with it.**

The faucet resolved itself in a way worth recording: `requestTestnetTokens()` kept returning 429
across ~35 minutes while `faucet.circle.com`'s web form funded the same address immediately. **The
rate limit is on the API endpoint, not the faucet** — two front doors, independent limits, only one
scriptable. The first web grant went to the deployer rather than the Circle wallet, which the balance
check caught before anything was built on it; the two Arc addresses in `.env` are easy to confuse and
only the Circle one has a `msg.sender` the test can measure.

**The thing we did not go looking for is the most useful.** The payable call emitted two logs, not
one: our `Received`, and an ERC-20 `Transfer` from the synthetic address `0xffff…fffe` that Arc
raises for every native value movement. That `Transfer` carries an 18-decimal amount, while the USDC
contract at `0x3600…0000` reports `decimals() = 6` on the very same balance. So the ordinary way to
index a transfer — match the event, read `decimals()`, scale — is wrong by 10^12 on Arc, silently,
with a plausible number either way. Written up as a lesson and as a Phase 4 to-do, and it is why the
test sent "2.50" rather than a round number.

Two smaller results. The async latency the brief expected to fight our serverless flow measured
**4.4 seconds** submit-to-`COMPLETE`, with the transaction hash appearing at 2.1s — that fits inside
a Vercel function, though it is one sample against a state machine with no stated upper bound, so the
Phase 4 call should still rest on the API's shape rather than on this number. And the whole exercise
cost **0.0027 USDC** in gas across both transactions, with the wallet reconciling to the wei:
20 → 17.499181987242880000, being 2.5 of value plus 0.000818 of gas.

Amended §12 to close U3 and U10, §5.18 to carry the measured 30,000-block bound, and R5 from a risk
to a measured fact with the 10^12 factor attached. Added the payable call to `docs/evidence.md`. The
open Circle item is unchanged and is not this script's problem: **a spend cap still has to be set on
the wallet set in the console**, because Circle's limits are server-side policy and this run moved
2.5 USDC with nothing standing in its way.

## 2026-09-06 — Unit 8: SM-04, archive access confirmed and a corroboration bug found before it was written

Wrote `scripts/smoke/04-archive-rpc.ts` and **SM-04 passes**. Alchemy's free tier is genuinely
archive-capable: every historical read succeeded, from head−100 down to block 5,920,937 via WETH, and
an `eth_getBalance` at **block 1** was served. Nothing was refused at any depth. **R27's fallback —
restrict corroboration to the retained window and mark `NOT_CHECKED` — is not needed for Ethereum**,
and the reconciliation engine's one independent check has a confirmed source. The credential turned
out to be `ALCHEMY_API_KEY` rather than the `ETHEREUM_RPC_URL` that `.env.example` documents, so the
script accepts either rather than failing on a name.

**The test caught a bug in itself first.** The depth ladder originally probed WETH at block 1, got
back a bare `0x`, and reported a false archive failure — because `eth_call` returns `0x` both when a
node cannot serve the block and when the contract did not exist yet, and WETH was deployed at block
4,719,568. Those two are indistinguishable from outside. The committed version separates `ok`,
`no-code` and `refused`, counts only a JSON-RPC error against archive capability, and tests genesis
depth with `eth_getBalance`, which is meaningful at every block.

**The real finding is that the obvious corroboration check is wrong.** Comparing
`aToken.totalSupply()` at the subgraph's `_meta.block` against its stored `inputTokenBalance` agreed
*exactly* on the first run and differed by 157.70 USDC on the second — same code, minutes apart.
Walking the blocks explains it: Aave's aToken `totalSupply()` accrues about **31.54 USDC per block**
straight from `block.timestamp`, with no events involved, while the subgraph writes
`inputTokenBalance` only when a handler runs. They are the same quantity read at two different
moments. The first run agreed only because an event happened to land on the indexing head.

So a strict equality check at `_meta.block` **passes intermittently**, and most reliably when the
chain is busy — which is when corroboration matters least. It would have read as flakiness in the
adapter for however long it took someone to walk the blocks by hand.

**It can be made exact.** `Market.indexLastUpdatedTimestamp` marks when the balance was written;
resolving it to block 25920948 and reading there gives `totalSupply() == inputTokenBalance` to the
unit. That is a better check than any tolerance, because a tolerance wide enough to absorb interest
accrual is also wide enough to hide the errors the check exists to catch. **This contradicts §5.14's
"compare with tolerances", so it is raised rather than amended** — how corroboration compares is a
plan-level decision, and the script still reports the diff at `_meta.block` exactly as the unit
specified. Also worth confirming before anyone leans on it: `indexLastUpdatedTimestamp` is an
Aave-shaped field, and Compound and Morpho may expose nothing equivalent.

One more number worth having: aave-v3-ethereum is running **0 to 1 blocks behind chain head**, not
the hundreds §5.14 anticipated. That does not make archive optional — a check that only works while
the subgraph is caught up fails exactly when the subgraph is struggling — but it does mean the common
case is comfortable. Repointed the `smoke:04` script entry from the old `04-multi-deployment.ts` name
to the new file.

## 2026-09-06 — Unit 8b: the write-time field surveyed, and the check catches Morpho

Checked whether `indexLastUpdatedTimestamp` is an Aave-shaped field before building on it, and the
answer is **partly**. aave-v3 and aave-v2 both expose it and both corroborate **exactly**. compound-v2
has no equivalent at all — `_rewardLastUpdatedTimestamp` is a rewards timestamp and using it would be
inventing a check rather than performing one. morpho-blue calls it `lastUpdate` instead.

The surprise is **compound-v3, which makes corroboration a per-market capability rather than a
per-deployment one.** Of its ten largest markets, three carry a timestamp and seven are `null` — the
base-asset markets have it, the collateral-only ones do not. So the corroboration flag cannot sit in
deployment config next to the revenue flag; it has to be decided per market at query time. That is a
smaller, more awkward answer than either of the two we expected.

**The strongest number in the survey is aave-v2's.** Its largest market's write-time field resolved to
block 25,912,723 while `_meta` sat at 25,921,008 — **8,285 blocks, 27.7 hours** behind. A pruned node
retains about 128. aave-v3's 0-to-1-block lag makes archive access look optional; aave-v2 on the same
chain at the same moment shows it is not, because the correct comparison block is a property of how
recently that market traded, not of how current the subgraph is. A quiet market can be arbitrarily far
back.

**And the check caught something on its first real outing.** Morpho Blue accrues only on interaction,
so its `totalSupplyAssets` is identical at `lastUpdate`'s block and at `_meta.block` — the alignment
problem simply does not exist there. The numbers disagree anyway, in 2 of the 3 largest markets: USDC/PAXG
by exactly −10,000,000, and USDT/wstETH by −26,932,262,884 (~0.02%), with the subgraph reading higher
than the chain both times. The on-chain `lastUpdate` mirrors the subgraph's exactly, so the field is
faithful and it is the balance that differs. This is the deployment `DECISIONS.md` already flags as
returning a wrong number, reached independently — from the chain this time rather than from
cross-protocol comparison. **Cause not established**, possibly virtual accrual in the mapping, and
recorded as something to settle before Morpho appears in any published report rather than guessed at.

Amended §5.14 to drop "compare with tolerances" in favour of exact equality at the write-time block
with `NOT_CHECKED` where the field is absent, retired R27 for Ethereum, and recorded the decision with
its costs in `DECISIONS.md` — the honest ones being that compound-v2 loses corroboration entirely and
that archive access moves from convenient to mandatory. Renamed the credential to `ETHEREUM_RPC_URL`
and dropped the dual-name acceptance from the script: taking either spelling was kind now and
confusing later.

## 2026-09-06 — Unit 9: SM-09's checklist, written but not walked

Wrote `scripts/smoke/09-browser-stake.md` — a manual checklist, not a script, because `tsx` cannot
drive a wallet extension. Named for the browser rather than for MetaMask, since OKX is the wallet
being tried and MetaMask is only the fallback. Pointed `npm run smoke:09` at an echo that says so out
loud, rather than leaving it aimed at a `.ts` that never existed and would have implied this is
automatable.

The checklist is built around the two things about Arc most likely to break a wallet: **the native
gas token is a stablecoin**, and **it is 18 decimals while the ERC-20 view of the same token reports
6**. SM-08 measured both, so the checklist asks specifically how OKX renders a 20 USDC balance —
that is the finding most likely to land in front of a real user, and a wallet that gets it wrong is
off by a factor of a trillion with a number that still looks plausible. Step 3 prefers calling
`ping()` on SM-08's receiver with hex data `0x5c36b186`, so the manual path exercises the same
payable call a stake will use; a plain transfer is allowed as a substitute as long as the record says
which was done. Confirmed before writing that the receiver is still live and still holds its 2.5 USDC.

Two things carried forward from earlier runs rather than rediscovered: use the faucet's **web form,
not the API**, and **check which address you pasted** — SM-08 lost several minutes to a grant that
landed on the wrong one of two addresses sitting in `.env`.

⚠️ **Recorded as a partial, deliberately.** PLAN-v4 §8's SM-09 requires a stake **under `next build`**,
and there is no app yet. This checklist is the wallet half only; the build half stays open until
Phase 4's staking page exists. The status row and the results file both say so, so that a successful
walkthrough is not mistaken for SM-09 being done.

Not run — the walkthrough is the builder's. Noticed while editing that
`scripts/smoke/README.md` is badly stale: every row still says "not written yet" and the SM-02/SM-04
descriptions predate the 2026-09-05 scope swap. Only the SM-09 row was corrected, since fixing the
rest was not asked for.

## 2026-09-06 — Three documentation corrections, and Phase 0's ledger finally balances

A documentation-only run. No code was written and `src/` is still empty — Unit 1 has not started.
Three corrections, one commit each, plus a fourth for a `CLAUDE.md` change that had been sitting
uncommitted in the working tree since the DECISIONS.md convention was introduced.

**`types/wire.ts` moved from Phase 0 to Phase 1 Unit 1.** §9 listed freezing the wire contracts among
the Phase 0 gates and §5.18 said "Day 1". Both were reasonable when written and both were wrong by
the time Phase 0 finished, because Phase 0 is where we found out that revenue availability,
corroboration status and completeness are each **three-state flags where the obvious design is a
boolean**. A contract frozen on Day 1 would have carried `revenueUSD: number` and
`corroborated: boolean` — shapes that typecheck and lie. The freeze now reads "before the first
consumer", which is what the Day-1 wording was protecting all along.

**G1.3 asked for something the protocol set cannot produce.** It read "Four deployments, three schema
versions". Count them: 3.1.0 has three deployments, 2.0.1 has one, and **3.0.0 has morpho-blue alone**
— so cutting to four drops morpho and takes a whole schema version with it. Corrected to "five
configured and queried, four carrying publishable figures", and the same off-by-one fixed in four
other places that said four for the same reason: PHASE-1's ending goal in two spots, Unit 12's proof,
and PLAN §13. The G1.5 demo also moved from "add a fifth protocol" to "add a sixth", which Unit 2's
own proof line had said all along.

**SM-06 and SM-09 both ran, and neither outcome had been written down.** SM-06 passed — Claude picked
`run_document`, the tool answered from the live gateway, and the loop closed on its own in two turns
at block 25916708. That was the last untested assumption under Unit 10, and PHASE-1's header warning
about it is now a note telling Unit 10 to *promote* the loop rather than extend it. SM-09 passed its
wallet half on OKX and stays **PARTIAL** — the `next build` half needs an app that does not exist. The
detail worth keeping is that **OKX rendered the 20 USDC grant as `20`**, not as
`20000000000000000000`; the checklist was built around that exact question because Arc's gas token is
18 decimals while its ERC-20 view reports 6, and a wallet that reads the wrong one is off by a
trillion with a number that still looks plausible. The wallet gets it right. Our own code still has
to.

Phase 0 now closes at **8 PASS and 1 PARTIAL**, with all nine having actually run. The SM-09
transaction is in `docs/evidence.md`.

**The thing that surprised me** was how much of this was one mistake wearing different clothes. The
"four protocols" count, the "Day 1" freeze and the two missing sections are all the same failure —
**a document describing the plan as it was drafted rather than as Phase 0 left it.** Every one of them
would have been caught by re-reading the plan against the results file, and none of them by reading
either alone. Worth doing again before Phase 2 starts.

## 2026-09-06 — Phase 1 reordered: evidence before encoding, and the client fans out from the start

Two structural corrections to `PHASE-1.md`, both answers to questions raised while reviewing the unit
sequence. Still documentation only — `src/` does not exist and Unit 1 has not started.

**`corroborate.ts` moves ahead of `adapter.ts`** (9 → 7, adapter 7 → 8, evidence 8 → 9). The adapter's
whole job is deciding which numbers to distrust and by how much, and corroboration is the thing that
produces measured evidence on exactly that question. Building the encoder first means encoding what
we assumed Phase 0 meant and then looking for confirmation. **This is the third time the same shape
has come up:** SM-03 found a revenue field that parses and lies, SM-04 found a comparison block picked
before anyone checked when the value was written, and the wire contracts were nearly frozen a phase
ahead of the findings that shaped them. Write the check, run it, then encode what it found.

The reorder had a consequence that had to be resolved rather than renumbered around. Unit 9's Morpho
paragraph said it "reaches it through `client.ts` and `adapter.ts`" — which the new order makes false.
Rewritten so corroboration reads **raw subgraph fields against raw contract calls, unadapted**, which
is what makes its output evidence rather than a fact about our own encoding. The concern that
sentence was carrying didn't disappear, it relocated: the adapter unit now has to re-run the same read
*through* itself and confirm Morpho's −10,000,000 delta is unchanged. That is a better check than the
original, because it can catch a plausibility layer quietly turning into a correction layer, and it
only exists because there is now a known-good pre-adapter number to compare against.

**Fan-out folded into Unit 3**, retiring Unit 12 and taking the phase from fifteen units to fourteen.
A single-endpoint client that grows a fan-out later is the wrong shape — retrofitting means touching
every call site, the same argument that makes `_meta` unconditional rather than a flag. `querySubgraph()`
handles one deployment, a sibling handles many with `Promise.all` and **per-protocol error isolation**.
Finding #8 is why isolation is in the unit rather than added later: five parallel requests once
returned four ETIMEDOUT and 5/5 on retry, so a fan-out that fails whole would have reported nothing
on a run where four fifths of the data was one retry away.

⚠️ **Unit 3 is now ~170 lines against a ~120 ceiling, and the seam is named in the document before a
line is written** rather than found halfway down the file. It splits between one request and many —
retry, `_meta`, error classification and evidence on one side; `Promise.all`, isolation and budgets on
the other. A split anywhere else means the seam was wrong.

Unit 11 stays at two tools, confirmed rather than changed. `get_capabilities` is not a hedge against
`run_document` being insufficient — it is how the agent learns aave-v3's revenue is poisoned *before*
quoting it. Folding it in would mean discovering the flag only after asking for the number.

## 2026-09-06 — Unit 1: the wire contracts, and a shape SM-01 had already half-frozen

First Phase 1 unit. `src/types/wire.ts` — 45 lines of declarations under about as many lines of
comment, no logic, no imports. It is the shared vocabulary: twelve files are going to need to mean
the same thing by "a report", "a verdict", "revenue we can't trust", and this is where that is
settled once.

**The unit turned on a question the plan couldn't answer.** SM-01 had already hashed a sample report
back on 2026-09-05, with golden vectors headed for the Foundry verifier — and that shape is flat,
with `figures` as bare `string | null` and `cumulativeTotalRevenueUSD: null` for aave-v3's poisoned
accumulator. It has nowhere to put the three flags Phase 0 forced. So either the flags go in and
SM-01's vectors break, or they live somewhere else. Asked rather than guessed, and the answer settles
the file: **`Report` is the hashed shape and `Computed` is the rich internal view.** The flags
describe *how we know* a figure; the hash commits to *what the figure is*.

The reasoning worth keeping is the Phase 4 one. If a flag were inside the hash, revising the
adapter's judgement about a deployment would change the hash of a report **whose figures never
moved** — and a market on Arc holding the old hash could no longer verify the report it settles
against. That is a live failure, not a tidiness argument, and it is why the projection
`Computed → Report` keeps the values and drops the provenance of judgment. Where a flag says
poisoned or not_tracked, the figure projects to `null`, which is exactly what SM-01's fixture already
encoded — it just had no way to record *why*.

**Byte-compatibility was verified rather than claimed.** Typed SM-01's exact fixture as a `Report`,
canonicalized and hashed it in a throwaway script, and got `49cfaa6c…3db9b7` — the hash
`smoke-results.md` recorded a day earlier. Moving one cent gives `b3688035…bfe3ec`, also matching, and
attaching `atsTokenAddress` leaves the hash untouched. `HashableReport = Omit<Report, LifecycleField>`
is the type-level half of SM-01's runtime `LIFECYCLE` set, frozen here so the two cannot drift —
which closes the SM-01 to-do that was repointed at this unit last session.

Three smaller calls, all stated rather than buried. `Computed` carries **no** `Verdict`: it holds what
a deterministic engine derives, and the verdict is a judgement supplied at report assembly, which is
what keeps §5.14's engine pure. `VerdictCall` is closed at three members — an open string invites the
narrator to invent a category, the same way §5.11 stops it inventing digits. And the unit spec listed
"period" as a `Report` field, which SM-01's fixture does not have; the pinned instant is carried by
`block` + `observedAt` instead, because adding a top-level key changes the canonical bytes. A forecast
attachment will probably need a real period, and that is Phase 2's problem to raise.

Also corrected PHASE-1's Unit 6 line, which said an incomplete population "does not get a clean
verdict". It blocks publishing; it does not produce a different verdict. And added `src/**/*` to
`tsconfig.json`, without which the unit's proof cannot run. `npx tsc --noEmit` passes across scripts
and src together.

## 2026-09-06 — Unit 2: 28 rows, and three columns that had to stay empty

`src/config/protocols.ts` — the lookup table. 28 rows: every Ethereum lending deployment in Messari's
`deployment/deployment.json` that is both `status: prod` and has a decentralized-network query-id,
plus morpho-blue, which Morpho publish themselves. IDs copied out of the JSON by script rather than
transcribed, because a mistyped subgraph ID fails as an empty result rather than an error.

**The 27 resolves exactly, and it is worth writing down how.** Ethereum lending has 31 entries.
Twenty-seven are prod with a published query-id. The other four are `dev`: silo-finance, synthetix and
**morpho-blue-ethereum** have no decentralized query-id at all, and notional-finance has one but is
not prod. So Messari has their own morpho-blue entry — dev, schema 3.2.0, unpublished — which is a
different thing from the 3.0.0 deployment we query. Ours is Morpho's own publication on Messari's
template, and that distinction is now in the file rather than in someone's head.

**`lendingType` is null on all 28 rows, including the five we have measured.** It was listed as a
known column and it is not in `deployment.json` anywhere — it is a field on the live `LendingProtocol`
entity, and SM-02 queried name, schemaVersion and balances, not that. Everyone knows Aave is POOLED
and MakerDAO is CDP, and filling it from that knowledge is exactly the guessing this table exists to
prevent: a value that came from a model's memory is indistinguishable, three weeks later, from one
that came from a query. The sweep fills it.

**Two more columns stayed empty for the same reason.** compound-v3 has a `corroborationHint` with the
write-time field but a null contract accessor — SM-04 surveyed field *presence* there and never ran
the `eth_call`, so assuming Aave's `outputToken.id → totalSupply()` pattern transfers would be
inventing a check. And morpho-blue's hint carries `market(bytes32).totalSupplyAssets` but a null
contract source, because **the Morpho Blue singleton address is not recorded anywhere in this repo**.
SM-04 reached it through a throwaway path that did not survive. Writing a plausible address into
config would be the worst kind of wrong — it would look measured.

The count came out one off from the brief: 27 Messari prod rows minus the four we have tested leaves
**23 untested, not 22** — morpho-blue is the fifth tested row but is not one of Messari's 27, so it
does not net out. 28 rows, 5 measured, 23 untested, 28 unique IDs.

⚠️ **`schemaVersion` is named `declaredSchemaVersion`** so that nothing reads it as authoritative.
`adapter.ts` dispatches on the version a deployment reports *live*; this column records what we
expected, which is only useful if a disagreement is visible rather than silent.

One thing worth noticing for later: of the 23 untested rows, six declare 3.1.0 — aave-amm, aave-arc,
aave-rwa, spark-lend, uwu-lend and zerolend — and the G1.5 demo needs exactly one 3.1.0 POOLED
protocol to add on camera. **spark-lend is the obvious-looking pick and is the wrong one**: §5.18 rules
it out on 1.0 GRT signal against a recommended 3,000. That is recorded in the plan, not in this table,
because untested rows assert nothing.

## 2026-09-06 — Unit 3: the client, and three block failures that are really one string

`src/graph/client.ts` — two exports. `querySubgraph(slug, document, variables?, block?)` reads one
deployment; `querySubgraphs(slugs, ...)` reads many with `Promise.all` and per-protocol isolation, so
a dead endpoint returns a failure for that deployment rather than taking the set down. Both take a
**slug**, never a URL or a subgraph ID — `config/protocols.ts` stays the only place a deployment is
named. Plus `scripts/demo-query.ts`, which runs all of it against the live gateway.

**It works.** Five deployments in **363ms**, 5/5, block spread 0 — finding #7 holding for the fourth
run in a row. aave-v3 at $24.84B deposits / $10.03B borrows, morpho-blue at $13.10B (the inflated
figure, arriving unflagged because the adapter is Unit 8). Block pinning reads the past correctly:
asked for head−200, got $24.67B against $24.84B now.

**`_meta` is injected, not requested.** The demo's documents never ask for it and the block numbers
and deployment hashes come back anyway. That is the difference between "every query, no exceptions"
and "every query the author remembered" — and it is the one piece of string handling in the file, kept
narrow: find the first `{` outside the variable-definition parentheses, insert there, leave documents
that already ask for `_meta` alone.

**The failure taxonomy turned out to be wrong, and running it is the only reason we know.** PLAN-v4
§8 has listed "exact pruning error strings" as an open lookup since the plan was written, and the two
strings the brief supplied do not exist. What the gateway actually returns for a block below the
retained window and for a block above the indexed head is **the same message** — `bad indexers:
{0x…: Unavailable(missing block: N, latest: M)}` — so the two cannot be told apart by prose at all.
The discriminator is the arithmetic inside it: `missing > latest` is LAGGING, `missing < latest` is
PRUNED. A careful full-phrase match, exactly as the brief asked for, would have matched nothing and
left both branches dead — a guard that looks present and never fires.

There is a third case nobody had written down: `requested block 1, before minimum \`startBlock\` of
manifest 16291071`. That is below the subgraph's own genesis, and it is its own kind now
(`BEFORE_START_BLOCK`) because PRUNED is described as recoverable by reading a snapshot and this one
is recoverable by nothing.

**A second surprise while probing depth: the retained window is not ~500 blocks, it is at least
400,000.** §5.15 sizes the entire common-block design on `prune: auto` retaining 500–600 blocks and a
~100-minute cross-protocol window. aave-v3 serves head−400,000 fine and fails at head−800,000 — weeks
to months of history, three orders of magnitude past the estimate. That is one deployment, not a
survey, so it is recorded rather than written into config, but §5.15's sizing needs revisiting before
Unit 5 builds `blockwindow.ts`. The rule is still right; the fear it was sized against was not.

⚠️ **One thing I did not change and want a decision on.** `_meta` is injected unpinned, so on a pinned
read `meta.blockNumber` is the indexing head while the figures come from `requestedBlock` — the demo
shows 25921906 against a requested 25921706. Both are useful and they mean different things, so I
documented the trap on the field rather than quietly picking a meaning. Evidence records will want
`requestedBlock ?? meta.blockNumber`, and pinning `_meta` too would make that unnecessary at the cost
of losing the freshness signal.

⚠️ **168 code lines against a ~130 target**, 250 with comments. Roughly 55 of those are type and
constant declarations and ~110 are executable; the overrun is mostly the measured error taxonomy,
which grew a branch after the probing. The seam named in `PHASE-1.md` — one request on one side,
many on the other — is still clean and unused if it should be split.

## 2026-09-07 — Revenue deferred, four-state flag, and the sweep replaces our inventory guesses

Three pieces of work. `RevenueAvailability` gains a fourth state, revenue is formally deferred out of
Phase 1, and `scripts/sweep-protocols.ts` finally measures the 27 deployments we had been quoting
numbers about while having tested five.

**`not_in_schema` added, and no row reclassified.** The four states now separate "the field exists and
holds" from three different ways of not having a number: corrupted (aave-v3), never written
(morpho-blue), and absent from the schema. All three render as unavailable, never as zero.
⚠️ The new state was described as the 2.0.1 case, and **compound-v2 is 2.0.1 with `usable` revenue** —
SM-03 measured 0.60% implied APR over 31 clean days. So nothing changed classification. The state is
about a field being absent, which has to be observed rather than inferred from a version number, and
the type comment says so.

**Revenue is deferred out of Phase 1** with both routes and their costs written into PHASE-1.md —
deploy a corrected subgraph, or derive it in `engine/` from cumulative borrow deltas — and the choice
explicitly waits for the sweep. G1.4 goes with it and is marked not-this-phase.

**The sweep: 25 of 28 answered, in 1,249ms.** Three do not, and their reasons differ:
abracadabra-ethereum and morpho-compound-ethereum have no indexer available; inverse-finance-ethereum
has an indexer returning `indexing_error`. All three are now `no_indexers`/`error` in config with a
`lastSwept` date, alongside the live schema version for all 25 that answered.

**Zero nulls, anywhere.** Six fields asked of five live schema versions and every one came back
populated. That answers the question Unit 4 was blocked on: the balance sheet travels across 3.1.0,
3.0.1, 3.0.0, 2.0.1 **and 1.3.0** unchanged, so no dispatch mechanism is needed for these fields and
per Unit 4's own constraint none should be built.

**The version distribution is stable and it is five, not three.** 3.1.0 → 9, 2.0.1 → 9, 3.0.1 → 3,
1.3.0 → 3, 3.0.0 → 1. Identical across two runs ~40 minutes apart, and **zero deployments disagree
with what Messari's config declares**.

Things the sweep turned up that are not mine to judge — triage is Unit 6 — but which should not get
lost:

- ⚠️ **rari-fuse-ethereum reports $7.01B borrowed against $5.64B deposited.** Borrows exceeding
  deposits is §5.13's worked example of a `SIGNAL`, and it is the fourth-largest deployment on the
  list. Either a real finding or a broken mapping, and the difference matters.
- **spark-lend-ethereum is the third largest at $6.63B.** §5.18 excluded it on curation signal — 1.0
  GRT against a recommended 3,000 — not on size, and the table now makes the size visible.
- **Two deployments are 4.2 hours behind**, rari-fuse and goldfinch, at the *identical* block
  25920801. Same stale indexer serving both, not two independent lags.
- **Nine deployments hold under $1M** and five are effectively empty. The inventory is 27 rows and
  the usable universe is much smaller.

⚠️ **The balance-sheet document is inlined in the sweep script, not imported.** Unit 4 was never
built — `src/graph/queries/` does not exist — so "reuse the balance-sheet document" had nothing to
reuse. Inlining kept a throwaway script from pre-empting Unit 4's open design decision, and the
sweep's result is what unblocks it.

⚠️ `lastSwept` reads **2026-09-07** because the run happened after UTC midnight; earlier entries are
dated 2026-09-06 local. The date in config is the UTC date the measurement actually carries.

## 2026-09-07 — Unit 4: three documents, no dispatch, and a split that had nothing to split

`docs/protocol-inventory.md` and `src/graph/queries/`. The inventory is generated, not transcribed —
`scripts/sweep-protocols.ts --inventory` rewrites it from a fresh sweep, and every open question in
it is computed from that run rather than typed in. That mattered immediately: two numbers I had
reported by eye last run were wrong. **Three deployments have borrows exceeding deposits, not one**
(rari-fuse at $7.01B/$5.64B, truefi at $14.4M/$7.7M, maple-v1 at zero on both), and **ten hold under
$1M, not nine.** Counting by hand from a printed table is exactly the sort of thing that reads as
authoritative in a committed artifact and is quietly off by one.

**Unit 4 was gated on field sets nobody had measured**, so I introspected the schemas of one
deployment per live version — 3.1.0, 3.0.1, 3.0.0, 2.0.1, 1.3.0 — before writing anything. The
intersections are much wider than the plan feared: `LendingProtocol` shares **25** fields across all
five versions, `Market` **31**, `FinancialsDailySnapshot` **21**, `InterestRate` 4.

**The consequence is that snapshots.ts is one document, not two.** The instruction was to split it —
one variant for schemas carrying cumulative revenue, one for those without — so that a wrong pairing
fails loudly instead of returning partial data. That reasoning is right and its premise is not:
**every revenue field is in the five-version intersection.** `dailyTotalRevenueUSD`,
`cumulativeTotalRevenueUSD`, both side-revenue pairs — present on 1.3.0 and 2.0.1 exactly as on
3.1.0. A split would have created a pairing to get wrong while guarding a case that does not exist.
The file says so and says what would change the answer: a sixth version lacking the fields, which
would announce itself by failing the whole query.

**All three documents ran against all five versions with zero nulls.** Two things fell out of the
proof worth keeping:

- ⚠️ **`lendingType` is in the intersection and returns `POOLED` on all five.** Unit 2 left that
  column null on all 28 rows because it is absent from `deployment.json` and no smoke test had read
  it. It is now readable, and the sweep can fill it — the column stopped being a guess and became a
  measurement, which is what nulling it was protecting.
- ⚠️ **euler-finance (1.3.0) returned zero financial snapshots for the last seven days** while
  reporting $188M TVL. The query succeeded; there is simply no recent history. Not a document
  failure and not mine to judge — triage — but a deployment with a live balance sheet and no daily
  history cannot answer a period question, and nothing currently notices that.

aave-v3's poisoned accumulator arrived on cue at $2.79e17, and morpho-blue's first three markets come
back named `unknown / unknown` with an `unknown` token symbol and a zero balance. Both are the
adapter's problem, and both are visible rather than silent, which is the point of running the proof
rather than typechecking it.

`_meta` is explicit in all three documents rather than injected, so the client's injection path stays
a backstop for anything hand-written. A fourth file, `index.ts`, holds the `DOCUMENTS` registry —
that is the "menu" the agent picks from and what Unit 11's `documentId` will resolve against.

## 2026-09-07 — Unit 6: triage, and the number is 3 of 28

Two follow-ups then the unit. The sweep now runs Unit 4's real `BALANCE_SHEET` instead of the
document it had inlined, which fills `lendingType` for all 28 rows as a side effect — **22 POOLED, 3
CDP** (makerdao, liquity, qidao), 3 null because they do not answer. That column had been null since
Unit 2 on the grounds that a value from a model's memory is indistinguishable later from one that came
from a query. It is now measured, and the `CDP` rows immediately earned their keep: deposits − borrows
against an external TVL is a POOLED convention, so triage records `NOT_CHECKED` on those three rather
than a passing number.

**`scripts/triage-protocols.ts` asks the question the sweep could not: not who answers, but who is
right.** Four checks per deployment — external reconciliation against DefiLlama, internal
plausibility, snapshot availability over a recent window, and revenue sanity. Euler's missing history
went in as a general check rather than a special case, which was the right call: **eight deployments
return no daily history at all**, not one.

**The answer is 3 publishable, 11 flagged, 11 unusable, of the 25 that answer.** Of 28 configured.
That is the number the inventory numbers were hiding.

**The most useful thing it did was rediscover the protocol set from scratch.** Run blind across 25
deployments with no knowledge of what Phase 0 chose, triage lands on `compound-v3`, `compound-v2` and
`aave-v2` as publishable, and flags `aave-v3` on nothing but its revenue. Those are exactly the four
Messari deployments Phase 0 picked by hand. The set was not lucky.

It also found a fifth: **`spark-lend-ethereum` reconciles to within 1.2%** — $4.54B against
DefiLlama's $4.485B — and is flagged only on revenue. §5.18 excluded it on curation signal, not on
data quality, and the data quality is now measured and good.

Findings worth carrying:

- ⚠️ **The poisoned revenue accumulator is not unique to aave-v3.** `spark-lend` reads $1.20e17,
  aave-v3 $2.79e17. Spark is an Aave v3 fork on the same Messari template, so this is the template's
  fault surfacing twice, not one bad deployment. When revenue is picked back up, the blast radius is
  larger than "fix aave-v3".
- ⚠️ **`morpho-blue` is `unusable`, reached independently.** Deposits − borrows gives $1.67B against
  DefiLlama's $4.38B, a 62% gap, plus a market at exactly 100% utilization and revenue of zero. Three
  separate checks, none of which knew about the others or about `DECISIONS.md`.
- **Eight deployments have no daily history in the last seven days**, several while reporting a live
  balance sheet. `euler-finance` is the loud one — $188M TVL, zero snapshots — but `truefi`,
  `qidao`, `aave-arc`, `aave-rwa`, `morpho-aave-v3`, `cream-finance` and `zerolend` are the same
  shape. A deployment that answers a balance sheet and has no history cannot back a period question
  or a settlement, and nothing before this noticed.
- **`makerdao` has 2 markets at exactly 100% utilization** — the marker we had recorded as Morpho's.
  It is not Morpho-specific.

⚠️ **One honest limit in the numbers.** Where DefiLlama reports under $1M the gap is computed against
a $1M floor, so `euler`'s "1218%" means "our subgraph says millions, the reference says roughly
nothing" rather than a precise ratio. The direction is the finding; the magnitude is not, and the
inventory says so rather than letting the figure stand unqualified. Four deployments have no confident
DefiLlama match at all and are `NOT_CHECKED` rather than passed — `rari-fuse` among them, since
DefiLlama's `rari-capital` is a Yield Aggregator and not the Fuse pools. Matching it would have
manufactured a disagreement that says nothing about either.

Verdicts are written back into `config/protocols.ts` as `triageVerdict`, and
`docs/protocol-inventory.md` regenerates with a verdict column, the counts, and the caveats.

## 2026-09-07 — Unit 7: paginate, and a flag that only says `complete` on evidence

`src/graph/paginate.ts` — 50 lines. It walks a population with `where: { id_gt: $lastId }`,
deduplicates, stops at a budget, and returns `Completeness` from `wire.ts`.

**The rule that makes the flag trustworthy is one line: `complete` requires a SHORT page.** A page
shorter than the page size is the only evidence a population ran out. A full page proves nothing —
it cannot distinguish "the end" from "more to come" — so stopping on one is `incomplete` even if we
happened to have reached the end, because at that moment we do not know that we did. The proof shows
both sides of that boundary one page apart: 7 pages of morpho-blue gives 1,750 rows and `incomplete`;
8 pages gives 1,759 and `complete`, because the eighth page held 9 rows.

⚠️ **The brief's proof could not run as written, and the phase doc had the same error.** Both said to
pull >250 markets from aave-v3. **aave-v3 has 67 markets** — one page — and never exercises paging.
Measured counts: morpho-blue 1,759, rari-fuse 823, compound-v3 73, makerdao 63, aave-v2 37,
compound-v2 20, spark-lend 20. **Not one of the five deployments cleared for balance reports exceeds
a single page.** The proof runs against morpho-blue instead, and PHASE-1.md is corrected.

⚠️ **`markets.ts` had to change, and the change removes a footgun.** `id_gt` paging needs a `$lastId`
variable, which the document did not have. It also had `$skip`, `$orderBy` and `$orderDirection`,
and ordering by TVL while paging on id silently drops and repeats rows with nothing about the result
looking wrong. Ordering is now fixed at `id` ascending and `skip` is gone. Ranking from a single page
was never honest anyway — you cannot name the largest market until the population is exhausted — so
sorting moved to after the walk, where the proof does it.

**`blockDrift` earned itself on the first real run.** The 7-page walk of morpho-blue came back with
**5 blocks of drift** between its first and last page. On an unpinned walk the pages are not from one
moment, so any total across them blends two states — invisible without the field, and zero when a
block is pinned. It is now reported alongside completeness.

Two things for later, both about scale rather than correctness:

- ⚠️ **Unit 6's triage undercounts its markers.** It sampled `first: 100` markets per deployment. On
  morpho-blue that is 100 of **1,759** — 5.7%, taken in id order, which is not a sample of anything
  in particular. It reported 1 market at exactly 100% utilization where SM-02 found 28 across the
  top 500. The verdicts stand, since none of them turned on that count, but the marker figures in
  `docs/protocol-inventory.md` are floors and should not be quoted as totals.
- **The 8-page walk took 29 seconds** — about 3.6s per sequential page against the gateway. Fine for
  a script; worth remembering against Vercel's 300s ceiling when a report walks several deployments.

## 2026-09-07 — Unit 8: blockwindow, and the flagship was lying about the fleet

`src/graph/blockwindow.ts` — 39 lines. `hi` is the lowest head, `lo` is the highest head minus a
retention floor, and if `lo > hi` it declines instead of guessing. No per-protocol-as-of fallback.

**The brief's premise needed checking and so did my own correction of it.** Unit 3 measured aave-v3
serving reads 400,000 blocks deep and I recorded that §5.15's ~500-block estimate was three orders of
magnitude off — with a caveat that it was one deployment. Surveying all five: **aave-v3 retains
439,844 blocks and the other four retain between 300 and 600.** §5.15 was right and I had
generalised from the outlier. `RETENTION_FLOOR = 300` is the deepest depth confirmed on *all five*,
and the proof shows the alternative: with aave-v3's window as the set's, it pins a block four of the
five cannot answer and says nothing.

**The finality question is therefore a real trade, not a formality.** With a ~300-block window, 64
blocks of finality lag costs about a fifth of it. Taken anyway: a published report invalidated by a
reorg is unrecoverable and may already have settled a market, while 13 minutes of staleness is merely
stale. The measured window came out **299 blocks (~60 min)** and the pin landed at `hi − 64`, which
all five answered — verified by actually reading balances at it rather than asserting it.

**The refusal path needed no fabrication.** Adding `goldfinch-ethereum`, which the sweep found 4.2
hours behind, puts the heads 1,448 blocks apart against a 300-block window, and it declines. That is
the first time the rule has fired against real data.

**Two findings on the way, both bigger than the unit.**

⚠️ **`_meta.block.number` is one indexer's head, not the deployment's.** Every sweep has reported zero
block spread, and that is true of whichever indexer answered. Asking for a block above the head makes
the gateway list every indexer with its own head, and **aave-v2 has 10 indexers spanning 57,859
blocks** — one eight days behind. compound-v2 and compound-v3 span ~5,500 across 7. The deployments
agree; the fleets serving them do not, and nothing we had measured could see that.

⚠️ **That turned up a real bug in `client.ts`, now fixed.** `classify()` read only the first
`missing block: X, latest: Y` pair and decided PRUNED vs LAGGING from it, so with ten indexers the
first one listed decided the verdict for all of them. On aave-v2 the first was lagging while eight
others had passed the block and pruned it — a permanent condition reported as "wait and retry", which
sent the retention probe into a throw instead of a measurement. Now a deployment is LAGGING only if
**every** indexer is short of the block. It was invisible on aave-v3, whose four indexers sit within
5 blocks of each other.

## 2026-09-07 — Unit 9: corroborate, and Morpho's −10,000,000 comes back through a new path

`src/graph/corroborate.ts` — 86 lines. Reads a market's balance from the subgraph, resolves the
block the subgraph **wrote** it, and `eth_call`s the contract at that block. Exact equality, no
tolerance. Three outcomes and `not_checked` is one of them.

**Result across six deployments: 10 match, 2 mismatch, 6 not_checked.**

**aave-v3, aave-v2 and spark-lend match to the unit — 9 of 9.** Write-time blocks ranged from
25912723 to 25922274, so aave-v2's WBTC market was read **9,500 blocks back**. A pruned node keeps
about 128. Archive is not a convenience.

**The Morpho reproduction is exact, and that is the real result.** SM-04 found USDC/PAXG off by
exactly −10,000,000 through a throwaway script. This reaches it through an entirely different path —
`client.ts`, config-driven dispatch, a new timestamp-to-block bisect, a different contract call — and
gets **−10,000,000** again, on the same subgraph value SM-04 recorded to the digit. USDT/wstETH
disagrees too, now by −17,698,383,936 where SM-04 saw −26,932,262,884; the market has traded since,
and both are ~0.02%. USDC/sdeUSD matches exactly, as it did then. **Nothing was tuned to make any of
this agree.**

**Morpho's contract address is now measured rather than absent.** Unit 2 left `contractSource` null
because no address was recorded anywhere and a plausible-looking one would have read as measured.
`LendingProtocol.id` reports `0xbbbb…ffcb`, `eth_getCode` returns 31,248 bytes, and `market(bytes32)`
answers. That is a measurement, so it went into config.

**Two things the run established that config had wrong or missing.**

- ✅ **spark-lend corroborates exactly, 3 of 3.** Its hint was null only because it was one of Unit
  2's untested rows. It is an Aave v3 fork, the pattern transfers, and now it is measured rather than
  assumed. Its semantic note also records what Unit 6 found — the same poisoned revenue accumulator
  as aave-v3, inherited with the template.
- ⛔ **compound-v3 is NOT Aave's pattern, and that is now a finding rather than an unknown.** Its
  `outputToken` is the **base asset itself** — USDC, USDT — not a receipt token, so `totalSupply()`
  returns the total supply of USDC: 5.07e16 against a market balance of 3.7e14. Had Unit 2 assumed
  the accessor transferred, compound-v3 would have reported two enormous mismatches that are entirely
  our own error, on a deployment triage calls `publishable`. `method` stays null and the reason is
  written down.

⚠️ **Fixed a note that asserted more than it knew.** Where config has no hint the code said "no
write-time field on this schema" — but config cannot tell "measured absent" (compound-v2, where SM-04
established the field does not exist) from "nobody has looked" (spark, until today). It now says "no
corroboration hint in config", which is the thing actually known.

⚠️ **The document is inline in `corroborate.ts`, not in `graph/queries/`.** Those are the agent's
menu and their guarantee is that every one runs on every live schema version.
`indexLastUpdatedTimestamp` is 3.1.0/3.0.0 only and `outputToken` is absent on 3.0.0, so putting this
in the menu would break the one property the menu has.

## 2026-09-07 — Unit 10: the adapter annotates, and the same condition gets opposite severities

`src/graph/adapter.ts` — 105 lines, pure, no I/O. Takes a balance sheet plus a market population
plus the deployment's config row, returns a `Computed` and a list of findings. **Nothing is
corrected.** Morpho's $13.09B comes out as $13.09B with findings attached, because the moment the
adapter adjusts a figure we have invented a number nobody can trace.

**No rule keys off a slug**, which took two measurements first. The oracle guard needs to know how a
deployment derives deposit USD, and that was not in config. Measured by comparing
`inputTokenPriceUSD × inputTokenBalance` against `totalDepositBalanceUSD` on the top 8 markets:
**aave-v3, aave-v2, compound-v3, compound-v2 and spark-lend agree 8/8; morpho-blue agrees 0/8** and
has 4 of its top 8 at zero price. So `depositBasis` is a measured column now, and the adapter reads
it. Also set spark-lend's `revenueAvailability` to `poisoned` — Unit 6 measured $1.20e17 and the row
was still null.

**The clearest result is the same condition landing on opposite severities.**

```
compound-v3   ⛔ DATA_ERROR      1 market at zero price — deposits derive from price x balance,
                                 so real deposits read as empty
morpho-blue   ·  INFORMATIONAL   1,029 markets at zero price — expected, the price is the
                                 collateral's while deposit USD comes from the loan token
```

One deployment, one market, blocking. Another, a thousand markets, benign. A global guard would be
unusable and a slug check would make the config-row claim false; a measured fact in config gives the
right answer for both.

⚠️ **compound-v3 has a live DATA_ERROR, on a deployment triage called `publishable`.** One market
prices zero with a non-zero balance. §5.13 says a `DATA_ERROR` blocks a report, so compound-v3 would
not publish right now. Triage sampled protocol totals and never looked at market-level oracle state —
this is the first check that does.

**The rest behaved as intended.** aave-v3 and spark-lend return revenue `unavailable` rather than
$2.79e17 and $1.20e17. compound-v2 returns $522.2M usable, which is the 2.0.1 deployment carrying a
revenue figure the two 3.1.0 flagships cannot. morpho-blue reports **48 of 1,759 markets with
deposits exactly equal to borrows** — against SM-02's 28 of the top 500 and triage's 1 of the first
100. The complete population is the only one that gives the real count, which is the argument for
Unit 7 in one line.

⚠️ **An honest limit: the Σ-markets-vs-protocol-total rule caught nothing, including on Morpho.** It
is a real §5.13 `INCONSISTENCY` check and it is right to have, but Morpho's 3.6x inflation is not a
summing discrepancy — the markets do sum to the total. The inflation comes from the same value being
counted on both sides of markets at 100% utilization, and the thing that actually surfaces it is the
utilization ceiling. Worth writing down so nobody credits the TVL rule with a catch it did not make.

⚠️ **Nothing dispatches on schema version, and I did not build the mechanism.** Unit 4 found the five
live versions share every field these documents use, so there is no branch to write. The adapter
compares the live `schemaVersion` against what config recorded and raises an `INFORMATIONAL` if they
have drifted — that is the whole of it. Building a dispatcher for a case we have not hit would be a
framework guarding nothing.

⚠️ **`Finding` and `Severity` are declared in `adapter.ts`, not `wire.ts`.** Phase 2's
`engine/invariants.ts` owns severity and does not exist yet, and adding to a frozen contract
unprompted seemed worse than declaring them where they are used. They should move to `wire.ts` once
the engine needs them.

## 2026-09-07 — Unit 11: evidence, 374 bytes whether the response held 1 row or 750

`src/graph/evidence.ts` — 48 lines. Takes what `client.ts` already returns and shapes it into a
record: deployment hash, document, variables, block, timestamp, row count, completeness, and a
SHA-256 over the canonical response. No storage, no fetching, and nothing reads it back.

**The size claim holds and is the point.** A record over a one-row balance sheet is **374 bytes**; a
record over a 750-row market page is **370**. It does not grow with the response, because it is a
record and not a copy. The settlement-backing tier is 1,350 bytes on the same query — **3.6×** — and
its `raw` reproduces `24821979322.20109981199238014954216` with no network at all, which is the whole
reason that tier exists. The tier came from the caller; nothing about the query implied it.

**The hash behaves.** Same query, same block, two runs: byte-identical `adf8c2b3aaa7f4ea…`. Five
hundred blocks earlier: `1853331ad6044953…`. That is RFC 8785 JCS through the `canonicalize` package,
the same path SM-01 proved against the RFC's own vectors — deliberately not a second implementation,
because two canonicalizers that disagree is precisely the dispute nobody can resolve.

**Two small design calls worth recording.**

- **`document` is the registry id, and `documentHash` is always present.** A menu document records as
  `"balance-sheet"`. An inline one — `corroborate.ts` has its own, off-menu by design — records
  `document: null` with a hash that still pins it byte-for-byte. Naming it something invented would
  have been a guess; leaving it entirely unidentified would have been worse.
- **`completeness` is `null` when the caller did not paginate**, not `'incomplete'`. A query that
  never asked for a population has not failed to exhaust one, and saying `incomplete` would be a
  claim we did not make. The paginated proof records `incomplete` honestly for a 750-of-1,759 walk.

⚠️ **`block` means two different things depending on the document, and the record cannot fix it.**
Unit 4's menu documents request `_meta(block: $block)`, so on a pinned read `block` *is* the read
block — the demo shows `block` and `requestedBlock` both 25922238. An off-menu document gets `_meta`
injected unpinned by `client.ts`, so `block` is the indexing head instead. Anything asking "what
block did this figure come from" wants `requestedBlock ?? block`, which is what the field comment
says. Worth closing properly later by pinning the injected `_meta` too.

## 2026-09-07 — The block ambiguity is closed, and Unit 12: the loop runs

**`_meta` is now pinned whenever the read is.** `client.ts` injected an unpinned `_meta`, so on a
pinned read `meta.blockNumber` was the indexing head while the figures came from `requestedBlock` —
and `block` in a persisted evidence record meant the read block for menu documents and the head for
off-menu ones. Verified fixed: an off-menu pinned read at head−300 now reports
`meta.blockNumber 25922055` against a requested 25922055, where it used to report the head. The
freshness signal is what this cost, and it is available from a separate unpinned query. `block` means
one thing everywhere now, which is what a persisted artifact needs.

A side effect worth having: injecting `_meta(block: $block)` makes a document that cannot honour a
pin **fail loudly** instead of silently ignoring the extra variable, which is what happened before.

---

`src/agent/loop.ts` — 74 lines. A `while` over `stop_reason === "tool_use"`, promoted from SM-06.

**It owns neither the conversation nor the tools.** `messages[]` goes in and comes back out, so a
caller can persist and resume — Vercel gives 300 seconds and one invocation is one model turn, so a
real multi-deployment report will not fit in a single call. Tool definitions and an executor are
parameters, so Unit 13 can change the menu without touching the loop.

**Budgets bound four things, checked before spending rather than after.** Turns alone would let a
single turn making thirty tool calls run past every other limit — and the run proved that is not
hypothetical: **the model made two tool calls inside one turn**, so turns and tool calls genuinely
count differently.

**The run answered a real question through the real data layer.** Two turns, two tool calls, 3,584
tokens, 18.5s. The part worth keeping is what the model did with the flags:

> **Aave v3: revenue figures are not available.** The deployment reports its revenue data as
> poisoned… This is *not* zero revenue… I'd caution against inferring Aave's revenue by applying
> Compound's take rate to Aave's borrow balance.

That is the whole gating chain working end to end — config says `poisoned`, the adapter withholds the
figure rather than passing $2.79e17 or zero, the tool hands over `null`, and the model reports
unavailability and refuses to estimate around it. Nothing in the prompt told it to say that beyond
"a null figure means unavailable, never report it as zero".

**The budget stop is honest.** With `maxTurns: 1` it returns `stopReason: budget`, `detail: "turn
limit 1 reached"`, **`answer: null`** rather than a half-answer presented as finished, and hands back
3 messages so the caller resumes instead of restarting.

⚠️ **The tool does not pin to a common block yet.** `blockwindow.ts` exists and nothing calls it —
both deployments in the demo happened to read at block 25922360 because their heads coincided, not
because we asked them to. That is exactly the "Aave at 3pm, Compound at 1pm" failure Unit 8 was built
to prevent, and wiring it in belongs with `tools.ts` in Unit 13.

## 2026-09-07 — Unit 13: two tools, and Phase 1's required units are done

`src/agent/tools.ts` — 89 lines. Two tools, no free-form GraphQL, no URLs. It composes `client`,
`blockwindow`, `paginate` and `adapter` and reimplements none of them.

⚠️ **`run_document` takes `slugs`, plural.** A common block is a property of the SET being compared,
so a tool that only ever saw one deployment could not resolve one. Still two tools; the parameter is
just not singular.

**The end-to-end run is what Phase 1 was for.** Asked to compare three deployments, the agent called
`get_capabilities` on all three **first**, then made one `run_document` call across all three at
**common block 25922313** with the window reported, then answered:

> **Aave v3 and Spark Lend: revenue is unavailable, not zero.** … I won't estimate around these.
> There is no sound way to infer Aave v3 or Spark revenue from deposits, borrows, or from Compound
> v2's figures — inventing a proxy would be worse than the gap.

It also volunteered that Compound v2's usable revenue is **uncorroborated** — no write-time field —
which is a distinction config carries and nothing in the prompt mentioned. And asked about Uniswap it
declined cleanly, then noted that `aave-amm-ethereum` accepts Uniswap LP tokens as collateral and
offered that instead. No invention anywhere.

⚠️ **The proof caught a real bug, and the tell was the model inventing an explanation.** The first run
ended with "the `incomplete` completeness flag reflects 3.x-only fields being omitted" — which is
false. `adapt` defaulted a market-less read to `incomplete`, emitting a flag with no finding beside
it to account for it, and the model reached for a plausible reason. Completeness is about the
population behind the figures and a protocol-level read has a population of one row, which we have;
it now returns `complete` unless a market population was actually requested and not exhausted. The
false sentence is gone from the re-run. **A flag nobody can account for is worse than no flag** —
it does not just fail to inform, it actively invites a wrong story.

⚠️ **`corroborate.ts` and `evidence.ts` are built and nothing on the live path calls them.** The unit
specified composing client, adapter, blockwindow and paginate, and that is what it composes — but it
means the chain check and the provenance record are reachable only from their own demos. Wiring
corroboration into a third tool was explicitly out of scope, and evidence has nowhere to be stored
until Phase 3. Both are real gaps in the agent path rather than in the code.

## 2026-09-07 — `scripts/ask.ts`, and the refusal fires in the wild

A command-line front end for the loop — question in, steps and answer out. No new code and no new
dependencies, just `loop.ts` and `tools.ts` wired to `process.argv`, with a credential guard, the
step printer from Unit 13's demo, and a budget line at the end.

**The first real question exercised the refusal path without being asked to.** Given "which protocol
has the most deposits?", the agent went straight for all 25 live deployments in one call and got:

```
refused: no common block across these deployments
reason:  heads are 1598 blocks apart and the tightest deployment retains only 300
```

`goldfinch-ethereum` and `rari-fuse-ethereum` are the pair the sweep found 4.2 hours behind, sharing
one stale indexer. The agent dropped them, re-ran the other 23 at **common block 25922322** with a
head spread of 14, and then said so in the answer:

> Two deployments are missing from this comparison… I excluded them rather than read them at a
> different moment… treat them as unread, not as zero.

That is Unit 8 doing exactly what it was built for, three units later and unprompted — the refusal
reached the model as a result rather than an error, and the model handled it as information. It also
flagged Morpho's $13.09B as unusable and declined to substitute a corrected figure, which is the
adapter and the triage verdict arriving together at the surface.

4 turns, 4 tool calls, 29,747 tokens, 33s.

## 2026-09-07 — `docs/phase-1-summary.md`

A standalone record of what Phase 1 built and found — the thirteen units, the measurements, the
findings that changed the design, and two mermaid diagrams (the data flow, and the trust layer that
turns a returned number into one with an account attached). `README.md` untouched; that is a separate
job for submission.

⚠️ **One item in the brief was a claim we had already measured the other way, and I wrote the
measurement instead.** The brief listed "six of 27 deployments report a different schema version than
Messari's own config claims" among the findings. That was asserted once before, checked at the time
across all 28 rows, and came back **zero disagreements** on the 25 that answer. The document says
that instead — and says why the live-value dispatch is still worth keeping: the check costs nothing
and the day it matters, it matters. This is the second time that particular claim has come round, so
it is worth having it written down somewhere durable with the measurement beside it.

Everything else in the document is a number from a run recorded in this log or in
`smoke-results.md`. The parts I was careful to phrase as limits rather than achievements:

- **The gating is not uniform.** Only revenue is genuinely withheld. Morpho's inflated TVL is flagged
  and *present*, and it remains the model's judgment whether to use it. In practice the model has
  declined every time, but that is behaviour, not a guarantee — turning a flag into a refusal is
  Phase 2's engine.
- **`corroborate.ts` and `evidence.ts` are unreached from the agent path.** Both work; neither is
  called by a tool.
- **Standards leverage has not been rehearsed**, which is the one pass/fail item Phase 1 leaves open.
- Nothing is deployed.

The "25 of 28 answer live" framing is used throughout rather than anything like "query any lending
protocol", because the first is checkable by running one command and the second is not true.

## 2026-09-07 — README.md, judge-facing

Replaced the three-line placeholder with a README aimed at someone reviewing many projects in an
afternoon. Two mermaid diagrams: the whole system with built and planned marked distinctly, and the
data flow as it actually exists.

**The status table is at the top rather than the bottom.** Phase 0 and Phase 1 complete, Phases 2–4
not built, nothing deployed, no web app. A judge who finds one overclaim stops trusting the rest of
the page, and there is enough real work here that hiding the gaps would be a bad trade.

The "why the numbers are trustworthy" section carries the weight, because that is what separates this
from a query printer — and every example in it is something the system found rather than something we
designed for: the $279 quadrillion accumulator and spark-lend inheriting it, Morpho's field names
meaning different things, the −10,000,000 reproduced through two paths, and the agent hitting the
no-common-block refusal and reporting the excluded deployments as *unread, not zero*.

Three accuracy fixes on review: the example `ask.ts` commands were missing their
`npx tsx --env-file=.env` prefix and would not have run as printed; the setup said Node 22 when the
real requirement is 20.6+ for `--env-file`; and `demo-corroborate.ts` was listed among the
reproduction commands without noting it needs an archive-capable `ETHEREUM_RPC_URL`, which the other
two do not.

Attribution is stated plainly — one developer working with AI throughout, with `tracking/logs.md`
named as the fullest account. ⚠️ The brief described commit trailers as carrying "per-file detail";
they do not, they are per-commit, and only the Phase 1 sessions carry them. The README says what is
true instead: trailers mark those commits, and the tracking files are the real record.

## 2026-09-07 — PHASE-2.md, planned not built

Fourteen units for the report-building phase, ordered on Phase 1's hardest lesson: build the thing
that judges before the thing that produces. Contract first because retrofitting a public format is
expensive, the engine before the narrator because a verdict has to exist before it can be described,
and **the narration validator before the narrator** — written afterwards it gets tuned until the
narrator's existing output passes, which is the same mistake as encoding before measuring.

**Six places where PLAN-v4 §9 and what Phase 1 found now disagree**, all written into the doc rather
than left to be discovered mid-build:

- `workflow/gather` is already built — `agent/tools.ts` gathers across deployments at a common block
  and was proved against 25. As §9 stands it would be built twice. Recommend striking it.
- `domain/canonical.ts` must extract the canonicalizer `evidence.ts` already uses, not write a
  second one.
- The report format is a public contract and §9 does not say so.
- `config/analysts.ts` was scheduled for Phase 1 by SM-08's to-do and never built.
- §9's "stable hashes" exit was already reached at the type level in Phase 1 Unit 1.
- ⚠️ **Ranking was cut by §5.18, and it is what the agent naturally produces.** The single best
  output of Phase 1 was a ranked table of 23 deployments at a common block with the stale ones
  excluded and declared. Either that cannot become a report, or the two-form list is one short.
  **This blocks Unit 9** and it is not mine to decide.

**Two open questions raised rather than assumed.** The ranking decision above, and whether exact
decimal arithmetic in `engine/ops.ts` justifies a dependency — `decimal.js` is small and correct,
BigInt fixed-point is no dependency and more code to get wrong. `CLAUDE.md` says dependencies are
decisions.

**On requirements the doc says something uncomfortable and I left it in:** Phase 2 closes no
pass/fail requirement outright. It makes G2.3 mostly true — §3 defines that as *directive → plan →
reconciliation → verdict → on-chain prediction*, and Phase 2 delivers the first four of five — and
it produces the hashed report Phases 3 and 4 need to close theirs. **G1.5 is flagged again**: still
pass/fail, still unscheduled, and it has now been open since the first session of Phase 1.

## 2026-09-07 — PHASE-2.md updated: six answers, and a Verdict enum proposed rather than changed

All six decisions folded in, plus a design law that now sits above the units because it governs
several of them at once: **show all the data, attach caveats.** The model for it is the `ask.ts`
answer that ranked morpho-blue second at $13.09B and then explained exactly why the number is not
comparable — more useful than omitting the row, because a reader who sees nothing cannot tell there
was something to decide about. The one exception stays narrow: a poisoned accumulator has no true
value to show, so `null` is the only honest rendering.

**Gating became per-figure and it made `publish.ts` a better unit.** A `DATA_ERROR` blocks the figure
it touches, and escalates to the whole report only when that figure is the report's declared subject.
Blocking compound-v3's entire report over one bad market out of ten would have thrown away nine good
figures to suppress one — and would have made the engine *less* useful than the model already is
without it. Three outcomes now, and `compose.ts`'s subject is what distinguishes the second from the
third, which makes the declared subject load-bearing twice: it keeps the report on topic and it
decides what a data error costs.

**`not_checked` is `INFORMATIONAL` and cannot block.** Corroboration exists on 3 of 25 deployments;
gating on its absence would mean 22 can never publish, contradicting triage clearing five.

**Schema stays `alpha-markets/report/v1`, frozen at Unit 1** rather than bumped. Worth being precise
in the doc about what that means: SM-01's fixture committed to the string before the shape settled
and nothing has ever been published, so **v1 is defined by what Unit 1 emits**, the fixture is updated
to match, and the sample hashes are re-recorded once. After that any change is v2 with a migration.

**`analyst` is a wallet address, inside the hash.** Already required for Arc staking, already how
on-chain attribution works, so no second identity system.

**Forecast attachment deferred to Phase 4**, where a settling market gives it a consumer — and the
history problem defers with it, since 8 deployments report a live balance sheet with no recent
history.

⚠️ **`Verdict` is proposed, not changed.** `undervalued | fairly_valued | overvalued` is a price
judgment on an engine with no price data. Proposed `reconciled | discrepancy | insufficient_evidence`,
which maps onto what `reconcile.ts`, `crosscheck.ts` and `publish.ts` actually produce, so every
verdict is derivable from a check that ran. `discrepancy` deliberately does not say who is wrong —
§5.14 settled that attribution is per-deployment and sometimes open. Rejected `not_reconciled` for
the third value because it reads as the second one.

⚠️ **Raised separately: `Confidence` has the identical defect.** `low | medium | high` is a judgment
label on a pure deterministic engine. I would replace it with the measured coverage — markets
corroborated over markets read, plus completeness — because "4 of 67 corroborated, population
complete" is a fact a reader can weigh and "medium confidence" is an opinion wearing a fact's
clothes. Not touching it without a decision.

## 2026-09-07 — Verdict splits, §5.13 amended, and the scope gap turns out to be one deployment

**`Verdict` splits in two.** `VerdictCall = 'ties_out' | 'discrepancy' | 'not_checked'` is what the
engine computed and every value is derivable from a check that actually ran. `Assessment
{ summary, basis, confidence }` is what the analyst thinks it means. They differ in kind, and Phase 4's
market has to know which of the two it is settling on.

Named the second field **`assessment`, not `call`** — `call` is already the field name *inside*
`Verdict`, so reusing it is exactly the confusion the split exists to prevent. `basis` carries fact
ids so an opinion can be traced to the measured figures it rests on, and the narration validator
already forbids digits outside a placeholder, so a summary cannot smuggle a number in.

⚠️ **The split resolved the open `Confidence` question, and it resolved it the other way round.** The
objection was that `low | medium | high` is a judgment label on a deterministic engine — true, which
is why it belongs on the **assessment**, where a judgment is what it is meant to be. The verdict
carries measured coverage instead.

**§5.13 amended, dated, with the reasoning.** A `DATA_ERROR` blocks the figure it touches, and the
report only when that figure is the subject. Marked as a real change rather than a clarification,
because the old line read report-level.

**And the scope gap is measured rather than estimated.** ⚠️ Worth noting: the brief referred to
"twelve deployments changing verdict" and to updating the doc "rather than the estimate" — **there
was no such estimate in PHASE-2.md.** I never wrote a number, which is precisely why the measurement
was worth taking.

`scripts/check-market-level.ts` runs the same `adapt()` a report will run, over real market
populations, across all 25 live deployments. **3,322 markets read, every population exhausted:**

- Triage cleared **14** deployments. **1** carries a market-level `DATA_ERROR` — compound-v3, the one
  already known. Not twelve.
- **11** deployments triage called `unusable` show no market-level `DATA_ERROR` at all.

The second number is the more interesting one. Triage failed those on protocol-total properties —
external reconciliation gaps, inverted balances, empty books — and their oracle state is clean. **The
two views catch different things and neither subsumes the other**, which is the argument for
`reconcile.ts`, `crosscheck.ts` and `invariants.ts` all existing rather than one standing in for the
rest. That was a guess in the plan an hour ago and is now a measurement.

"25 protocols answer" survives contact with market-level inspection, and the one exception is a
blocked *figure* rather than a blocked report.

## 2026-09-07 — Phase 2 Unit 1: the report contract

`src/types/report.ts` — 85 declaration lines under about as many lines of comment, no logic. It
defines the report as a **public contract**: another team's agent has to be able to produce one, so
the file is commented for a reader who has never seen this repository, and it opens with the five
things you need to know to target it.

**A separate file, not an amendment to `wire.ts`** — which is better than what PHASE-2.md planned.
`wire.ts` stays the internal vocabulary the data layer speaks; `report.ts` is the thing outsiders
target. It imports `Computed`, `Provenance`, `Decimal`, `Timestamp`, `Completeness` and
`CorroborationStatus` rather than redefining any of them.

**Proved by building a report the way an outsider would** — a fixture assembled from real aave-v2
figures, touching nothing but the exported types, then canonicalized and hashed:

```
baseline            0e18bb209f6322f0…
with ATS token      0e18bb209f6322f0…  ✅ lifecycle field excluded
keys reordered      0e18bb209f6322f0…  ✅ order-independent
one cent moved      7f25bf0470a45df2…  ✅ sensitive
verdict changed     f52d65c3736a5ca6…  ✅
analyst changed     b46059c170c99d32…  ✅ attribution is inside the hash
```

⚠️ **The reorder check failed on the first run, and it was the test that was wrong.** I shuffled keys
with `JSON.stringify(report, Object.keys(report).sort().reverse())` — but an array as the second
argument is a **key allowlist, not an ordering**, and it applies at every level, so it silently
dropped every nested key and produced a different object rather than a reordered one. **This is
SM-01's near-miss again**, almost exactly: there a JSON round-trip reordered integer-like keys and
accused a correct canonicalizer; here a replacer array mangled the object and accused a correct
contract. Both would have been reported as a failure of the thing under test. Fixed with a recursive
reorder that drops nothing, and the printed key list now shows all nine fields surviving reversed.

**Two decisions the file makes that are worth naming.** `Subject.headline` is a `FactId` — that is
what makes §5.13's escalation rule implementable, since "blocks the report when the error touches the
subject" needs the subject to name a figure. And `Verdict` carries **`Coverage`** — markets read,
markets corroborated, completeness, checks run against checks available — where a confidence label
would have gone. Confidence lives on `Assessment`, which is where judgment belongs.

⚠️ **`wire.ts` now holds a superseded `Report`, `Verdict`, `VerdictCall`, `Confidence`,
`LifecycleField` and `HashableReport`.** Nothing imports any of them — checked — so nothing is broken,
but two `Report` types in one codebase is exactly the drift `wire.ts` exists to prevent. Removing them
means editing a file this unit does not name, so it is flagged rather than done.

⚠️ `Severity` is declared here rather than imported from `graph/adapter.ts`, because an outsider
targeting the format needs the enum and a types file importing from a logic module is backwards.
`adapter.ts`'s local copy is now the duplicate, and PHASE-2.md already schedules that move for Unit 7.

## 2026-09-07 — Phase 2 Unit 2: canonical.ts, and SM-01's hashes reproduce

`src/domain/canonical.ts` — 31 code lines. `canonical()`, `hashCanonical()`, `reportHash()` and
`reportHashBytes()`, over **one** implementation lifted from SM-01.

**The proof is that a hash recorded two days ago still comes out.** SM-01's fixture, run through the
new file: `49cfaa6c…3db9b7`, exactly as recorded on 2026-09-05, and `b3688035…bfe3ec` with one cent
moved. That is the whole point of reusing rather than rewriting — the path is provably the same one
that passed RFC 8785's 29 reference vectors, including all 24 IEEE-754 samples from Appendix B.

**Narration is inside the hash, and the proof shows what that buys.** Changing one word of prose —
"held" to "holds" — moves the hash from `0e18bb20…` to `e348f06e…`. Without that, an analyst could
publish a report, let a market open against its hash, and then rewrite the words while keeping the
same token: same identity, different claim.

**The runtime denylist cannot drift from the type.** `LIFECYCLE` is declared
`as const satisfies readonly LifecycleField[]`, and a compile-time assertion fails if a field is added
to `LifecycleField` and not to the array. That is the direction that matters — a lifecycle field left
*in* the hash makes the hash uncomputable before the token it names exists, which is circular.

`strip` is recursive rather than top-level, matching SM-01 exactly. Top-level would have been enough
for today's `Report`, but the recorded hashes are only reproducible if the behaviour is identical, and
matching a proven implementation beats matching an argument about it.

⚠️ **`graph/evidence.ts` still has its own canonicalizer** — a private `canonical` and `hashResponse`
built on the same package. That is precisely the duplication this unit exists to remove, and it is one
import line to fix, but it means editing a file this unit does not name. Flagged rather than done.
`canonical()` takes `unknown` specifically so the swap is trivial.

⚠️ **One honest coupling in that swap.** The shared `canonical()` always strips lifecycle fields, so
it is not pure JCS — it is "canonicalize a report". On a subgraph response the strip is a no-op,
because no query response contains a key named `atsTokenAddress`. That is true today and worth
writing down rather than discovering later; the alternative was two entry points, and two paths that
can diverge is the worse trade.

## 2026-09-07 — evidence.ts onto the shared canonicalizer, and Unit 3: ops.ts

**`graph/evidence.ts` now hashes through `domain/canonical.ts`.** One import, one implementation, and
the coupling is written into `canonical.ts` rather than left in a log entry: `canonical()` strips
lifecycle fields, so it is "canonicalize a report" rather than pure JCS. On a subgraph response the
strip is a no-op because no query response contains a key named `atsTokenAddress` — true today,
recorded so it is not rediscovered.

⚠️ **The swap surfaced something I could not explain and did not pretend to.** The Unit 11 demo
reported two reads of the same pinned block hashing differently, once. It has not recurred in 37
queries across three probe shapes — including 25 with interleaved traffic to vary gateway routing —
and the canonical JSON of two same-block reads was byte-identical every time it was compared
afterwards. Three plausible explanations (the swap, gateway routing, the `_meta` pinning change) were
each testable and each disproved. Written up in `lessons.md` as observed-and-unreproduced rather than
fixed, with an open question against Phase 4, because a response hash that is intermittently unstable
at a pinned block would make an evidence record unfalsifiable in exactly the dispute it exists to
settle. The demo keeps a divergence printer so a recurrence yields evidence instead of another
anecdote.

---

**`src/engine/ops.ts` — 50 code lines. BigInt at a fixed scale of 40, no dependency**, and the
reasoning is in the file: of these operations only division is inexact. Add, subtract and compare
over BigInt at a common scale are exact *by construction* — there is no rounding decision to get
wrong, so a library would carry a dependency to solve a problem three of the five operations do not
have. Division needs a rounding rule and a library would not remove that decision, only name it; the
rule is truncation toward zero at scale, and it applies to ratios rather than to money.

**The proof leans on the cases that break naive arithmetic**, using figures the gateway actually
returned:

- `24917272809.52169350845770191155245` survives a round trip. `Number()` gives
  `24917272809.521694` — the tail is gone before any arithmetic happens.
- 10,000 × `0.01` sums to exactly `100`. The float equivalent drifts to `100.00000000001425`.
- `0.1 + 0.2` is `0.3`, not `0.30000000000000004`.
- ⚠️ `ratio('0','0')` returns **`null`**, and `ratio('0', '24781147529')` returns **`'0'`**. Those two
  must differ: `cream-finance` and `zerolend` report $0 deposits and $0 borrows, so their utilization
  is undefined — and undefined rendered as zero reads as an answer. Naive JS gives `NaN` and
  `Infinity` for the same inputs.
- It **refuses rather than coerces**: exponent notation, thousands separators, and more than 40
  decimal places all throw with the offending value named. Silently truncating a hashed figure is the
  failure this file exists to prevent.

⚠️ **`sum` takes `Decimal[]`, not `(Decimal | null)[]`.** A population containing a withheld figure
has no honest total, and choosing between skipping and propagating is a judgment — which belongs to
the engine, not to the arithmetic. TypeScript stops a null reaching here, which pushes the decision
up to where it can be made properly.

⚠️ **One test expectation was wrong and the code was right** — I typed `0.403987` for a utilization
from memory; the true quotient is `0.40398591531…`, confirmed independently at 50 digits of
precision. That is the third time this session a proof failed because the test was wrong rather than
the thing under test — after SM-01's key ordering and the report fixture's replacer array. Worth
naming as a pattern: **when a check fails against something with no other reason to be broken,
suspect the check first.**

## 2026-09-07 — Phase 2 Unit 4: invariants, and blocking that names a figure

`src/engine/invariants.ts` — 66 code lines. Five checks, each returning `{ severity, appliesTo,
rationale }`, plus `blockedFigures()`. Pure: `Computed` and a config row in, findings out, no I/O.

**The blocking rule works because `appliesTo` names a figure, not a deployment.** Findings carry
`"{slug}.{field}"`, so `publish.ts` can compare that against the report's declared subject. The proof
shows it on the same deployment twice:

```
compound-v3-ethereum
  ⛔ DATA_ERROR  compound-v3-ethereum.totalDepositBalanceUSD  1 of 73 markets price zero…
     subject=totalDepositBalanceUSD → ⛔ REPORT BLOCKED
     subject=totalBorrowBalanceUSD  → publishes, withholding …totalDepositBalanceUSD
```

One `DATA_ERROR`, two subjects, two different outcomes. That is the amended §5.13 doing exactly what
it was amended for: nine sound markets and a meaningful protocol total survive, and only the figure
that is actually broken is withheld.

**The oracle guard gives opposite answers from one rule.** compound-v3: `DATA_ERROR` on 1 of 73
markets. morpho-blue: `INFORMATIONAL` on **1,029 of 1,759**, because `depositBasis` is `loan_token`
there. Same condition, same field names, no slug anywhere in the file — config carries the measured
fact and the rule reads it.

**The utilization ceiling fires on the real population.** 48 of 1,759 on morpho-blue, from a complete
walk — against the 28 SM-02 saw in the top 500 and the 1 triage found in the first 100. Only the
exhausted population gives the true count.

⚠️ **The proof set the unit specified could not exercise two of the five checks.** The publishable
five plus morpho-blue contain no deployment with inverted balances and none with an empty book, so
"an inverted-balance deployment reports a SIGNAL" had nothing to run against. Added
`truefi-ethereum` — which reports `SIGNAL: borrows exceed deposits — utilization 187%` and, correctly,
**publishes anyway** — and `zerolend-ethereum`, which reports `INFORMATIONAL: no deposits and no
borrows; utilization is undefined here, not zero`. Asserting a check works is not the same as
watching it fire.

**The Σ-markets-vs-total check fired nowhere**, exactly as Phase 1 predicted. Kept, because it is a
real §5.13 `INCONSISTENCY` and the day it fires it matters — but recorded again as unproven rather
than quietly counted as working.

**Two type-location calls.** `Severity` moved out of `adapter.ts` and now comes from
`types/report.ts`, as authorised — an outsider targeting the contract should not have to import a
logic module to read the enum. ⚠️ `Finding` is the same problem one level down: `invariants.ts`
imports it from `adapter.ts`, which is at least the right direction, since the engine consumes what
the graph layer produces. It would sit better in `types/report.ts` beside `Severity` and
`CheckResult`. One line, flagged rather than taken, since that is a third file.

## 2026-09-07 — Phase 2 Unit 5: reconcile, and a tie-out narrow enough to defend

`Finding` moved to `types/report.ts` alongside `Severity` — last of that cleanup. `adapter.ts` and
`invariants.ts` both import it now and there is one of each type in the codebase.

`src/engine/reconcile.ts` — 124 code lines against a ~110 estimate. Three tiers, four verdicts, and
it **judges rather than re-checks**: tier 0 is read from the findings `invariants.ts` already
produced, so no fact is checked in two files and no report can say the same thing twice in different
words.

**The argument the file rests on is measured, not assumed.** SM-03 found aave-v3's revenue sides
summing exactly on all 31 days while the total read $2.79e17 — *"the corruption is in the input, not
the addition."* An internal-consistency tie-out would have certified a figure wrong by ten orders of
magnitude. So internal consistency can never produce `ties_out`; only a source outside the mapping
code can.

**All four verdicts fire against real deployments:**

```
aave-v3, aave-v2, spark-lend   ✅ ties_out         chain + DefiLlama, 0.9–2.5% apart
compound-v2, compound-v3       ✅ ties_out         DefiLlama only — no write-time field
compound-v2, no reference      ◻️  consistent_only  the common case
compound-v2, truncated walk    ·  not_checked      parts cannot be compared to the whole
morpho-blue                    ⛔ discrepancy       both independent checks disagree
```

`consistent_only` is worded as a normal result, because it is one — most financial reporting is
consistency checking against a single source, and the report says plainly what was and was not
independently verified rather than apologising for the difference.

**morpho-blue is the case the design exists for.** Chain corroboration disagrees on 2 of 3 sampled
markets, DefiLlama is 62.1% apart, and **internal consistency passes**. A tie-out built on internal
arithmetic would have called it clean.

**The honest thing is in the output, per instruction.** The strongest check works on **4 of 25 live
deployments** — aave-v3, aave-v2, spark-lend, morpho-blue — and the report names them. Everywhere
else the tie-out rests on an external reference or on internal consistency alone.

⚠️ **DefiLlama is fetched in the demo, never in the engine.** `reconcile.ts` takes an
`ExternalReference` as an observation, so a published report cannot fail because a third party is
down and the engine stays pure. The adapter that would produce it is a separate file and does not
exist yet — the caller supplies it or omits it, and omitting it degrades the verdict rather than
breaking anything.

⚠️ **Two bugs the proof caught.** `coverage.marketsRead` was counting corroboration samples rather
than the population — `Computed` does not carry a market count, so it now comes in as an input. And
"largest gap" compared **signed** deltas, which on morpho-blue reported −10,000,000 as worse than
−17,698,383,936; it compares magnitude now. Worth noting the second only became visible because the
data moved: USDT/wstETH's delta has fallen to −4,482,721 since Unit 9, so USDC/PAXG genuinely is the
largest today and the wrong code would have printed the right answer.

## 2026-09-07 — Phase 2 Unit 6: crosscheck, 27 lines

`src/engine/crosscheck.ts` — translates `graph/corroborate.ts`'s observations into the engine's
finding shape and does nothing else. Half the planned size, which is the right outcome: verification
is not what this build is for. We connect to The Graph, read it, and report what it says accurately —
proving the source correct is a different project.

**A mismatch is a `SIGNAL`, not a `DATA_ERROR`** — a change from what PHASE-2.md planned, and worth
the change. `DATA_ERROR` would block the figure, and blocking would mean asserting the contract is
the correct side. §5.14 settled that attribution is per-deployment and sometimes open: Morpho's
subgraph reading higher than its own contract may be a mapping bug or a documented derivation, and
this check cannot tell. It reports that two sources disagree, by how much, at which block, and stops.
That is also precisely the kind of finding a report exists to surface.

**All three statuses, against live deployments:**

```
aave-v3       ·  3 of 3 match the contract exactly
morpho-blue   📣 USDC / PAXG   subgraph 6212914546395500 vs chain 6212914536395500 — -10000000
              📣 USDT / wstETH subgraph 122323809935435 vs chain 122323699783615 — -110151820
compound-v3   ·  3 of 3 unchecked — contract accessor not established
compound-v2   ·  3 of 3 unchecked — no corroboration hint in config
```

⚠️ **Absence is worded so it cannot read as a gap.** The unchecked finding carries "this check is
available on 4 of 25 live deployments; its absence here says nothing about the figures". A reader who
sees "not checked" without that context reasonably assumes something went wrong.

The −10,000,000 on USDC/PAXG is now the fourth independent reproduction, and it has not moved since
SM-04 — while USDT/wstETH's delta has drifted from −26.9bn to −17.7bn to −4.5m to −110m across runs
as that market trades. **One of these is a stable defect and the other is noise around a moving
balance**, which is only visible because the check has been run repeatedly rather than once.

⚠️ **`reconcile.ts` does not consume these findings** — it reads the same `Corroboration[]`
observations directly to decide its tier-1 claim. So the two are parallel consumers of one input
rather than a chain, which is what keeps them from restating each other: crosscheck produces the
per-market findings a report shows, reconcile produces a verdict. Flagging it because the unit brief
described it as serial, and if a serial wiring is wanted, `reconcile` is the file that changes.

## 2026-09-07 — Phase 2 Unit 7: the skills, and what they measurably change

`src/agent/skills/balance-overview.md` (84 lines) and `conventions.md` (68). Markdown, loaded into a
system prompt, written as instructions to an analyst rather than documentation about our code.

**The proof ran the same directive twice — without the skills, then with — because "visibly shaped"
is a claim that should be checked rather than asserted.** Both runs completed, 3 turns each, against
the same three deployments at a common block.

| | without | with |
|---|---|---|
| answer | 5,421 chars | 8,059 chars |
| gross-vs-net distinction | **absent** | 3 mentions, with the correction |
| separates checks it RAN from checks read out of config | **no** | yes |
| structure | per-deployment sections | fixed Summary / Figures / Checks |

**The most valuable difference was not one the skills asked for.** With them loaded, the agent wrote:

> **What was not performed here:** I did not read any contract. The corroboration statuses below come
> from the platform's last triage sweep (2026-09-07), not from a check I ran at block 25,923,371.

Nothing in either file says that. It follows from "be specific about the method, not just the
outcome" and "absence is not a finding" — and it is a genuine epistemic distinction our own code does
not currently draw. `get_capabilities` returns a config row without saying that its corroboration
field is a past measurement rather than a live one.

The gross-vs-net instruction did exactly what it was written for: the with-skills report carries a
**Net (deposits − borrows)** row beside the gross one, and warns that comparing gross to an external
reference "will look like a 40% discrepancy that does not exist". The baseline report has no net
figure anywhere. Both runs handled Morpho well, which is the tool layer and the config semantic notes
working — the skills did not rescue that, they changed the shape and the honesty of the framing
around it.

⚠️ **And it found a fault nobody had found.** morpho-blue's `cumulativeDepositUSD` reads **3.78e+23**
— $378 sextillion — against aave-v3's plausible 2.21e+12. Verified directly. That is a fourth
independent fault on that deployment and a new kind: revenue was never written, this is written and
absurd. **Nothing in `invariants.ts` bounds cumulative figures**, and there is no `RevenueAvailability`
equivalent for them, so they reach a report unexamined. Written up in `lessons.md` with the honest
conclusion: our checks encode the faults we already knew about, and the thing that found a new one was
asking for a defensible report and watching what refused to go in it.

⚠️ **The first proof run failed in a way that looked like a model failure and was not.** The
with-skills answer printed a header and stopped — ~460 chars, exit code 0. Re-running it alone gave
`stopReason=answered`, 8,059 chars. **Node exited before its piped stdout had drained.** The script
now waits for the flush and prints `stopReason` and answer length alongside the token counts, so the
next truncation is legible as one. Fourth time this session the harness was wrong rather than the
thing under test.

## 2026-09-07 — Market count pinned at 8, and Unit 9 is blocked on Unit 8

**The skill now fixes the market table at eight rows, and the number is measured rather than picked.**
The same directive had been producing 5 markets one run, 10 the next, 8 the third — none wrong, but
two overviews of the same protocol should be comparable, which is the entire reason the form is fixed.

Measured what each cut actually covers:

| deployment | markets | top 3 | top 5 | **top 8** | top 12 |
|---|---|---|---|---|---|
| aave-v3 | 67 | 48% | 71% | **90%** | 96% |
| compound-v3 | 73 | 50% | 67% | **85%** | 96% |
| spark-lend | 20 | 75% | 86% | **96%** | 100% |
| compound-v2 | 20 | 80% | 93% | **98%** | 100% |
| morpho-blue | 1,759 | 75% | 81% | **85%** | 90% |

Five leaves a third of Aave's book unaccounted for; twelve buys six points for half again as many
rows. Eight covers 85–98% everywhere, so the omitted tail can be described in a sentence rather than
shown. Added a rule for comparisons too — **eight rows total from the combined set, not eight each**,
since a 24-row table is the wall of rows under a different name.

⚠️ **The other two cleanup items describe things that do not exist, and Unit 9 is blocked on the same
gap.**

`src/agent/compose.ts` has never existed — confirmed against the full history, not just the working
tree. The units built so far are 1 through 7; **Unit 8 was skipped.** Consequences:

- **"Move `ReportPlan` and `Capabilities` to `types/report.ts`"** — neither type is defined anywhere
  in `src/`. `ReportPlan` appears only as prose in `PHASE-2.md`'s description of Unit 9. There is
  nothing to move.
- **"compose.ts hardcodes the model and loop.ts names one too — two places"** — only `loop.ts` names
  a model. One place, so there is no duplication to remove. Moving it to config is still worth doing
  on its own merits, but it is a different task from the one described and I have not done it
  unasked.
- **Unit 9 takes a `ReportPlan` and runs it.** The type it consumes and the file that produces it are
  both Unit 8. Building Unit 9 would mean inventing the plan shape here, which is precisely the
  decision Unit 8 exists to make — and `compose.ts` is where `needs_clarification`, subject
  declaration and form selection all land. The declared subject in particular is load-bearing for
  Unit 9's own blocking rule.

Same shape as the Unit 5 sweep, which was told to reuse a balance-sheet document Unit 4 had not yet
written. Recorded rather than worked around.

## 2026-09-07 — Phase 2 Unit 8: compose, the unit that was skipped

`src/agent/compose.ts` — 108 code lines. One model turn, before any data is read. `ReportPlan`,
`Capabilities`, `PlannedRead`, `PlannedCheck` and `Clarification` went into `types/report.ts` from the
start rather than being moved there later, which is cleanup items 1 and 2 becoming unnecessary.

⚠️ **I did not have a Unit 8 brief** — the briefs received ran 1 through 7, then cleanup and Unit 9.
"The four test directives" were never specified, so I worked from PHASE-2.md's own compose section
and §5.6 and chose four that exercise the paths: a narrow single-deployment question, a specific
finding that should NOT become an overview, a three-way comparison, and one that is not answerable
here.

**`needs_clarification` is structural, not a prompt instruction.** The model gets two tools —
`propose_plan` and `need_clarification` — with `tool_choice: { type: 'any' }`, so it must call one.
Asking politely in a system prompt gets a confident essay whenever the model would rather write one;
forcing a choice between two typed outputs does not.

**Compose does no I/O beyond the model call.** Capabilities come from `config/protocols.ts`, every
field of which was measured against a live deployment during the Phase 1 sweep. Planning does not
need the network, which also means a plan can be reviewed before anything is fetched.

**All four directives behaved, and two did better than the bar:**

- *"Does Morpho Blue's borrowing exceed what it holds?"* → headline `morpho-blue.totalBorrowBalanceUSD`,
  **not** deposits. It stayed on the question asked, and noted that because the deployment is triaged
  `unusable` the report "must foreground that the figures may not support a conclusion at all".
- *"Compare deposits across aave-v2, compound-v2 and spark-lend"* → it picked aave-v2 as the headline
  on the reasoning that it is the only one of the three with a publishable verdict **and** a chain
  accessor, and observed that corroboration will therefore cover two of the three slugs. That is the
  capability data being used to make a scoping decision rather than just being reported.
- *"Is Aave a good investment?"* → `needs_clarification` on two grounds, and the second one I had not
  anticipated: no price data, **and** "Aave" does not name a deployment — there are five on Ethereum
  whose data quality differs sharply. Four concrete alternative directives came back with it.

⚠️ **Nothing chose `external-reference` as a check** across four plans. Either the name does not
convey what it does, or the planner does not see when it would help — the capability summary says
nothing about an external reference being available. Recorded rather than fixed, because the fix is
either a wording change in the system prompt or a field in `Capabilities`, and both are decisions.

⚠️ **The unknown-slug validation path is untested.** `compose` re-checks proposed deployments against
config rather than trusting the tool schema — an enum constrains the shape of a slug, not whether that
deployment exists or answers — but none of the four directives provoked it.

## 2026-09-07 — Phase 2 Unit 9: execute, and a hash scare that was the test

`src/agent/execute.ts` — 101 code lines. `ReportPlan` in, `DraftReport` out: resolve a common block,
run the plan's documents pinned to it, adapt, run invariants and crosscheck and reconcile, assemble
facts and checks and provenance, hash. It composes what exists and reimplements nothing.

**All three proofs pass.**

1. *Balance overview for Aave v3* — block 25923517, 6 facts, verdict `ties_out` on 67 markets with 3
   corroborated, 2 provenance records, 5 queries, 2.8s. Revenue comes through `withheld` with
   `revenue_unavailable` rather than as a number.
2. *compound-v3 deposits* — `blocked`, naming the figure and the reason. **2b is the half that
   matters:** the same deployment with `totalBorrowBalanceUSD` as the headline **completes**, with the
   deposit figure withheld and explained. One `DATA_ERROR`, two subjects, two outcomes — the amended
   §5.13 working through the whole pipeline rather than in a unit test.
3. Same plan twice — identical hash, after a correction.

⚠️ **The hash differed on the first attempt and I stopped, as instructed. It was the test.** Each run
called `execute` with fresh state, so each resolved its own common block — the head moves between
them, so the two reports were of different moments and *should* differ. Confirmed by measurement: 8
reads at a pinned block give 1 distinct value per field, and 3 `execute` runs at a fixed block give
one hash. The proof now passes run 1's block into run 2 through the state it hands back, which
exercises the resumable shape instead of merely asserting it. Written up in `lessons.md` — fifth
failed check this session that was the check's fault, and three of the five looked serious on first
read.

**Two things the unit forced that are worth recording.**

- ⚠️ **A pinned `_meta` returns `blockTimestamp: null`**, measured and consistent. So `observedAt` —
  which is inside the hash — cannot come from the subgraph on a pinned read, and it must be
  deterministic. It now comes from `eth_getBlockByNumber`, which is exact and immutable. **That makes
  `ETHEREUM_RPC_URL` required for every report**, not only for corroboration. `execute` fails loudly
  saying so rather than inventing a timestamp.
- ⚠️ **`execute` cannot produce a complete `Report`.** `sections` and `assessment` are narration, and
  narration is inside the report hash. So it returns `DraftReport = Omit<Report, 'sections' |
  'assessment'>` and a **`dataHash`** over that — explicitly not the identity a market settles
  against, which only exists after Unit 10. The brief asked for "a complete Report object"; this is
  the honest version of that.

⚠️ **`Report.analyst` has no source.** It is a required field and `config/analysts.ts` does not exist,
so `execute` takes the address as a caller parameter. That is fine for a proof and is not fine for a
product — the analyst identity is what a leaderboard and an on-chain claim both key on.

⚠️ **No token budget.** This step makes no model calls, so bounding tokens here would be theatre; it
bounds queries, market pages and wall clock, and reports which one stopped it.

## 2026-09-07 — The ranking form, and three bugs that only appear at 25 deployments

`src/agent/skills/ranking.md` (new), plus `compose.ts`, `execute.ts`, and — flagged, not in the
brief — `types/report.ts`, `narrate.ts`, `engine/ops.ts` and two demo scripts. The extra files were
each forced: `ReportForm` had to gain `'ranking'`, `Report` had to carry its form or a stored report
cannot be rendered, `narrate` had to load the right skill, and `ops.ts` had a latent bug the wider
scope exposed.

**"Which lending protocol has the highest deposits?" now asks about the metric and nothing else.**

```
needs_clarification — missing: question
"Highest deposits" is ambiguous between the current outstanding deposit balance and lifetime
cumulative deposit inflow. These differ by orders of magnitude…
```

`missing: question`, not `deployment` — exactly the split asked for. Scope defaults to all 25 live
deployments and is never a reason to go back.

**Disambiguated, it produces a real ranking.** Top 10 by deposits, then three groups the skill asked
for and each of which fired:

- **"Not on this deposit scale — CDP deployments"** — makerdao and liquity, with the reason that
  collateral posted against minted debt is not supplied capital others borrow.
- **"Arithmetically impossible"** — truefi at 187%, maple-v1 at 103%, placed deliberately rather than
  sorted to the bottom, and correctly described as a state a bad-debt book can genuinely reach.
- **The tail with a count** — "thirteen ranked deployments follow… all but three hold under one
  million", listed with figures.

**`execute` dropped the two stale deployments and explained them**, which is the behaviour the ask.ts
run produced unprompted in Phase 1 and is now a rule: rari-fuse and goldfinch at head 25923375
against 25923758 elsewhere, excluded rather than read at a different moment. The report says so and
says neither exclusion is a judgment about those protocols.

**The best line came from a rule generalising.** Asked for a net column it wrote: *"the platform
supplies gross deposits and gross borrows as separate facts and does not publish a differenced
figure, and I do not type arithmetic of my own into a table."* The no-typed-digits rule extended
itself to no-typed-arithmetic without being told.

### Three bugs, all invisible at five deployments

⚠️ **`ops.ts` scale was too small.** Ranking all 25 hit
`0.00000000000000162926873065418174459347072777589` — a token price with **47 decimal places** —
against a working scale of 40, and threw. The 40 was sized on the 23 places seen across the five
development deployments, and the five were not representative. Raised to 80, with the reasoning that
the binding constraint is significant digits *plus leading zeros*: 34 significant digits under a
1e-14 price needs 48 places. Existing hashes are unaffected because `format` trims trailing zeros.

⚠️ **The query budget was sized for a handful of deployments.** 40 queries does not cover 25 balance
sheets plus corroboration. Raised to 100, and `compose` now tells the planner a ranking reads
balance-sheet only — walking every market of 25 deployments costs a great deal for data a ranking
does not show.

⚠️ **The narrator's tool schema was fighting the model, and the failure was silent.** With
`sections: [{ id, paragraphs: [{ text, factRefs }] }]` it intermittently returned **zero sections**
with `stop_reason: tool_use` — no error, just an empty array. Diagnosed by giving the model a free
schema and looking at what it actually wanted to produce: `{ id, title, body }`. The nested
paragraph objects were being dropped by schema validation. The tool now takes **one `body` string per
section** and `narrate` splits it into paragraphs, **deriving `factRefs` from the text by regex**.
The wire contract in `types/report.ts` is unchanged.

That last change is better than a workaround: a model-supplied `factRefs` list can disagree with the
placeholders the model actually wrote, and Unit 11 validates the text. Extracting them makes the two
incapable of drifting apart.

### What did not get demonstrated

⚠️ **"Which protocol is most leveraged" did not produce the Morpho-denominator case.** The planner
chose `totalBorrowBalanceUSD` as the metric, which is comparable across deployments, and discussed
utilization in prose instead. So the specific thing the proof was meant to exercise — Morpho's
utilization being *not on the scale* rather than merely untrustworthy — never arose. The skill's rule
is written; nothing has tested it.

⚠️ **Morpho-blue is ranked #2 in the deposits headline** despite a triage verdict of `unusable` and a
denominator the skill calls out by name. The report caveats it thoroughly — the checks section says
"the rank-2 figure carries a failed sample" and refuses to call it corroborated — but the skill says
the headline should name only what can be stood behind, and that rule did not fire. Either the rule
needs to be sharper about triage verdicts, or ranking by deposits is a case where inclusion with a
caveat is right and the skill should say so.

## 2026-09-07 — Defaults instead of questions

The planner was asking whether "deposits" meant current or cumulative. That is not a real ambiguity —
deposits means what is sitting there now, and someone who wants lifetime inflow says so. An analyst
who asked that every time would be exhausting rather than careful.

**The defaults live in `conventions.md`, and `compose` now loads it.** That placement matters more
than it looks: the report *states the assumption the planner made*, so if the planner's defaults and
the narrator's lived in different files a memo could declare a reading its own plan never took. One
file, both consumers.

| directive says | read as | stated in the report as |
|---|---|---|
| deposits | `totalDepositBalanceUSD`, current | cumulative only when named |
| borrows | `totalBorrowBalanceUSD`, current | |
| size, TVL, "how big" | `totalDepositBalanceUSD` | **gross**, before borrows are netted |
| utilization, leverage | borrows ÷ deposits, current | |
| "top N" with no N | top 10 | |

Clarification is now reserved for three cases and scope is explicitly not one of them: data the
platform does not have, an entity resolving to several deployments of differing quality, or no
subject at all.

**All six test directives behave.**

```
✅ "top 10 protocols by deposits"        ranking          ranking.totalDepositBalanceUSD       25 deployments
✅ "which protocol has the most borrows" ranking          ranking.totalBorrowBalanceUSD        25 deployments
✅ "how big is Compound v3"              balance-overview compound-v3…totalDepositBalanceUSD    1 deployment
✅ "most leveraged protocol"             ranking          ranking.totalBorrowBalanceUSD        25 deployments
✅ "is Aave a good investment"           needs_clarification — question, subject
✅ "tell me about lending"               needs_clarification — subject, deployment, question
```

**And the assumption reaches the page.** The memo for "top 10 protocols by deposits" opens with a
*Reading of the directive* paragraph: taken as the current balance and not cumulative, gross rather
than net, and the same number the schema also reports as `totalValueLockedUSD` "by assignment rather
than by independent measurement, so quoting both would be quoting one measurement twice."

It then does something better than restating the default — it says where the default *changes the
answer*: "netting borrows out changes the ordering materially at the top… morpho-blue borrows nearly
as much as it holds, so on a net basis it would not sit second." That is the assumption being made
useful rather than merely disclosed.

⚠️ **Found the root cause of last run's untested case.** "Most leveraged protocol" plans as
`totalBorrowBalanceUSD` every time, and it is not the planner being evasive — **`HEADLINE_FIELDS` in
`compose.ts` contains only balance-sheet fields and no derived ratio**, so utilization is not
expressible as a metric at all. That is why Morpho's denominator problem — the case the ranking skill
is most specifically written for — has never arisen in a proof. Fixing it means either adding a
derived-metric option to the plan or letting the narrator rank on a ratio it computes, and both are
decisions rather than typos, so it is recorded rather than taken.

## 2026-09-07 — Closing out: the format stripped back, and what it cost

Two pieces of work today after the ranking form landed. First, the planner was made to default rather
than ask — "deposits" means the current balance, "size" means gross, "top N" with no N means ten —
with the defaults living in `conventions.md` so the planner and the narrator share one set, because
the report states the assumption the planner made. All six test directives behave, and the memo opens
with a *Reading of the directive* paragraph that says not just which default was taken but where it
changes the answer.

Then the bigger change: **the report format stripped back to a table and up to 500 words.** No
verdict line, no provenance, no checks summary, no footer, no paragraph explaining an exclusion. A
withheld figure is the single word `unavailable` in a cell. The skills went from 288 lines to 131,
and the narrator's tool now accepts one table section plus a summary — so there is nowhere to put
performed carefulness even if the model wants to.

⚠️ **Everything the engine computes still lands in the `Report` object and inside the hash.** Checks,
verdict, coverage, provenance, exclusions are all still there and unrendered. `render()` carries a
comment saying so, because the next person to read it will otherwise assume the rigour was removed
rather than hidden.

⚠️ **Both proof runs failed on Anthropic API credit**, not on code — a bare one-token request fails
identically. `compose` and `execute` completed in the first run, so the data layer and engine are
fine and only narration is blocked. The stripped format is therefore **written and untested**, and
the question it exists to answer — whether the agent has anything worth reading to say when it is not
told what to worry about — is still open.

Verified two things rather than trusting memory while writing the status note: `execute.ts` still
produces protocol-level facts only, so the market-table gap stands; and the skills really did peak at
288 lines (103 + 105 + 80) before the strip. The gap's *consequence* has changed though — the new
skills do not ask for a market table, so it is a capability we lack rather than a promise we break.

Status written to `tracking/phases/PHASE-2-status.md`, the board in `phase-2-tasks.md` updated to 10
of 11, and the compliance-document lesson recorded in `lessons.md`.

## 2026-09-07 — The narrator's schema was the bug, and strict mode is only half of it

A directive about Aave's markets by category came back as **29 sections and no assessment**, and
`narrate` threw. The renderer was not at fault: the tool schema took `sections` as an array with no
cardinality whose `id` had exactly one legal value, so it carried no information and offered only
repetition. A model with 29 things to show read it as 29 tables, which is a fair reading. `sections`
is now a single `table` string — one table is not something the model can get wrong, because a
scalar makes the alternative unrepresentable rather than merely discouraged. `narrate` still maps it
into the `Section[]` the wire contract expects, so `types/report.ts` and the hash are untouched.

**`strict: true` went on the tool at the same time**, because `required` had been advisory all along
— without it the API returns whatever the model produced, which is how `assessment` went missing in
the same call. Measured rather than assumed: a throwaway that explicitly instructed the model to omit
`assessment` still got both keys back, so strict does enforce, and it does so alongside a forced
`tool_choice`, which was the one compatibility I was unsure of.

⚠️ **The error message cost a diagnostic round and is now the more useful change.** It reported
"assessment missing" for two different failures — an absent object and a present one with an empty
summary — and under strict only the second is possible. It now says which, and how long the table
was. The general lesson is the one this repo keeps relearning from the other direction: a check that
cannot distinguish its failure modes sends you looking in the wrong place.

**Truncation was ruled out by measurement, not by argument.** At `max_tokens: 400` the same call
returns `stop_reason: max_tokens` with an empty argument object; the failure showed `tool_use` with a
populated table. So the cap was never the cause, and the comment in `narrate.ts` warning about
partial arguments describes a real but different failure.

**`execute` now reports the market population alongside the rows.** The markets walk pushes a
`market-population` check per deployment carrying the count and whether the walk reached the end,
which reaches the narrator through the CHECKS block it already reads. Not a row cap — how many rows
to show stays the model's decision, and `report.md` now says so explicitly along with the rule that
showing fewer means saying so. It worked first time: the memo closes with "the underlying market
populations were read to exhaustion (67, 37, 23, 4 and 8 markets respectively)".

⚠️ **And it typed those five numbers.** They are not `{fact:ID}` placeholders — there is no
population fact — so the report now carries five digits nobody can trace, which is precisely what
Unit 11 exists to reject. The population count solved the honesty problem and created a provenance
one. Second time this week the model has reached for a figure the fact table cannot supply; the
utilization column was the first.

Two runs of the failing directive now complete. Both planned Aave's five deployments rather than one
deployment's markets, so the 29-market path did not recur and the empty-summary theory is untested.

## 2026-09-07 — The planner could not see the registry, and scope contradicted the reads

`compose` had never once planned the `markets` document, including when a directive asked for
markets by name. The reason was not a missing rule: the planner was shown the entire document
catalogue as `Available documents: balance-sheet, markets, financial-snapshots` — three bare strings
with no indication that one of them returns a row per market. It also carried a warning I had added
two days earlier telling it the markets walk "costs a great deal" and to request it only when
necessary, so the sum of what it knew was a name and a discouragement.

**The catalogue now lives beside the registry** in `graph/queries/index.ts` as `DOCUMENT_BRIEF`, one
line each on what a document returns and at what granularity, rendered into the planner's prompt.
Description next to definition so the two cannot drift. The discouragement is gone; the cost stays as
a fact it can weigh — one query per 250 markets — rather than an instruction. `reads` is now required
on the plan, because omitting it fell through to a balance-sheet default and a planner that never
considered documents produced a protocol-level plan by construction with nothing recording that no
choice had been made.

**It worked on the first attempt, and immediately exposed a second bug.** The plan came back with
`reads: [{markets, [makerdao-ethereum]}, {balance-sheet, [makerdao-ethereum]}]` — exactly right — and
the run was **declined**. `subject.deployments` was empty, which expands to all 25 live deployments,
so a question about MakerDAO was scoped to the whole fleet and one deployment too stale to share a
block took the report down. The plan contradicted itself: its reads named one deployment and its
subject named twenty-five. Scope now falls back to the slugs the reads name before it falls back to
everything. Cost of the fix, measured: execute went from a 25-deployment walk to **2 queries and
778ms**.

**Market rows reach the fact table for the first time.** `paginate` has walked markets since Phase 1
— 1,759 of Morpho's — but nothing turned a row into a `Fact`, so even a correct plan would have
produced a protocol-level table and an apology. `MARKET_FIGURES` is deliberately two fields, deposits
and borrows, because every column multiplies by the population.

⚠️ **No cap on how many markets become facts, deliberately, and the risk is real.** MakerDAO's 63
markets are 126 facts. Morpho's 1,759 would be 3,518 in the narrator's prompt, and `maxMarketPages`
would stop the walk at 2,500 and mark the population incomplete before that. Untested, and the first
thing that will break if someone asks about Morpho's markets.

**The row count came out genuinely dynamic**, which is what the population count was for. "Top 5
collateral type markets" produced five rows and a whole-book line; "list makerdao's individual
markets" produced twenty-three and said so — *"Twenty-three of the 63 markets in the complete book
are shown here, the significant few plus the two PSM ilks flagged for having deposits exactly equal
to borrows, which is expected behaviour for a peg-stability module rather than an anomaly."* Nobody
told it five or twenty-three.

⚠️ **And it typed the counts again.** "63", "Twenty-three of the 63", and a whole utilization column
of percentages are model-typed, not `{fact:ID}` substitutions. Third instance this week. The pattern
is now unmistakable: give the narrator a true number it cannot cite and it will type it, because the
alternative is saying something false. Unit 11 will reject all three reports as written.

## 2026-09-08 — Unit 11: the digit guard, and the two false positives that were mine

`src/agent/validate.ts` — the last unit of Phase 2, and the one that turns "the model never types a
number" from a convention it follows into something it cannot do. Pure: a `Report` in, a list of
violations out, and **it never repairs**. Kept out of `narrate.ts`'s presence gate for the reason
that file's own header gives — that gate asks whether a table and a summary arrived, this asks
whether what arrived is honest, and merging them would let a bug in one hide in the other.

**The policy, decided before writing.** The observation that shaped it: the validated text is
PRE-substitution, so a legitimate figure appears as `{fact:aave-v3-ethereum.totalDepositBalanceUSD}`
and never as `$24.82B`. Any money or percentage in that string is fabricated by construction. So the
rule is three steps — strip placeholders, allow tokens **the report's own data supplied**, reject
every digit left.

⚠️ **The allowlist is derived from the report rather than hardcoded**, and that is the whole trick.
It is built at validation time from every `Fact.slug`, every `Fact.label`, `subject.deployments` and
the report's own block. It cannot rot when a protocol is added, it cannot be gamed because the model
cannot add facts, and it gives a property worth having: a block number passes only if it is the block
this report was read at. Allowlisting by context needed guessable regexes; allowlisting by magnitude
fails on the merits, because `5` is not fine when it means five billion dollars.

**Three fabrications caught and a control passed on the first run:** a bare `$900 billion`, a
`factRef` resolving to nothing, and an `assessment.basis` naming a fact that does not exist.

⚠️ **Both real reports failed, which was predicted — and two of the three failure kinds were my
tokeniser rather than the model.** Worth separating, because they look identical in the output:

- **`v2's` rejected while `v2` was allowed.** The possessive survived normalisation. A guard that
  fires on English grammar teaches everyone to ignore it.
- **Five MakerDAO collateral types rejected by name** — `RWA015-A`, `RWA002-A` and friends. The
  allowlist split labels on separators to get `v3` out of `aave-v3-ethereum`, and that same split ate
  the hyphen inside `RWA015-A`, so the market's own name never entered the allowlist. Fixed by
  splitting twice: whitespace-only keeps hyphenated identifiers whole, the separator split then
  breaks them down. Both are needed and neither loosens the rule.

**What survived is the real finding.** After both fixes, a protocol-level report fails on three
computed utilization percentages, and the market breakdown fails on `63` — twice, once in the table
and once in the prose.

The percentages are a **correct rejection**: there is no utilization fact, so the model computed
them, and that is precisely the fabrication this unit exists to stop. The `63` is **true and
uncitable** — the market population, which the engine knows and reports in a check rationale but has
no fact id for. That is not the policy being too strict; it is the policy naming the exact place a
fact is missing. The fix is to promote the count to a `unit: 'count'` fact so the model can cite it,
which is an `execute.ts` change and now has evidence behind it rather than being a suggestion.

**So Phase 2's eleven units are built, and no report generated today would pass the guard.** Both
statements are true and the second is the more useful one: the validator's first act was to prove
that reports we have been reading all week contain figures nobody can trace.

## 2026-09-08 — `docs/phase-2-summary.md`, and four documents that still said Unit 11 was open

Wrote `docs/phase-2-summary.md` to match the shape of the Phase 1 summary: what the phase set out to
do, the eleven units and what each one found, the findings that changed the design, one real run end
to end, and what is deferred. The run chosen to illustrate the pipeline is the MakerDAO markets
directive — the first plan that ever named the `markets` document, which was declined on its first
attempt because an empty subject scope expanded to all 25 deployments, then completed in 2 queries
and 778 ms and produced twenty-three rows out of sixty-three with the model explaining why. It also
typed `63` twice, which is the report Unit 11 rejects, so the same run carries both halves honestly.

Two mermaid diagrams, neither duplicating `ARCHITECTURE.md`: the path a figure takes from the gateway
to rendered prose and where the guard sits on it, and the two things that hang off the planner's
declared headline — whether `verdict.call` is a value or null, and whether a `DATA_ERROR` blocks the
figure or the report.

⚠️ **Four documents still said Unit 11 was unbuilt** — `PHASE-2-status.md`, the task board,
`ARCHITECTURE.md` and `README.md` — and the last two are what a judge reads first. All four
corrected, and phrased as what the validator actually does rather than by deleting the claim: it runs
on every report and warns rather than blocks, which is recorded in `DECISIONS.md` and is more
information than the stale sentence carried. `PHASE-2-status.md` also still described a cleared
Anthropic credit block and a report format "nobody has seen", both of which had been overtaken.
Written up in `lessons.md` as the generalisation of the header rule from 2026-09-07: that rule bound
the file being changed, and every document that went stale here was outside it.

## 2026-09-08 — PHASE-3.md, and the ATS expiry turns out to be inert and wider than recorded

Wrote `tracking/phases/PHASE-3.md` — seventeen units in dependency order, three of them explicit play
gaps. It supersedes PLAN-v4 §9's Phase 3 line, which was written before Phase 0 ran and assumed an app
deployed in Phase 0 that never existed. The phase is identity, persistence and a deployed app first
(none of which §9 lists), then tokenization, then the gate. Named the four decisions it turns on:
the report pipeline is what the server exposes, reports are generated by CLI and persisted so §5.1's
whole ticker apparatus stays out, the Own tier is optional because H2.4 does not require a transfer to
be caused by a payment, and pricing is in HBAR rather than carrying a USDC switch nobody has scheduled.

Then checked the ATS expiry before planning a contingency around it, and found two things. **The dates
have not moved** — both are exactly `created + auto_renew_period`, never renewed, with no auto-renew
account and zero balance, so it is a cliff rather than a rolling window. And ⚠️ **the exposure we
recorded was wrong in an important direction:** tracing the internal actions of SM-07's own transfer
shows an ordinary move of an already-issued token staticcalls the resolver and delegates through five
more contracts, all expiring in the same 80-second window. The proxy's 2026-12-05 expiry protects
nothing because the proxy holds only storage. So it was never "we lose new mints" — it would have been
"we lose every transfer of every token."

**And it does not matter.** Hedera has not enabled smart-contract rent on any network; it has been
pending since a March 2023 target with no date, and enabling it is a Council decision. No contingency,
R3 stays untaken. The correction and the citations are in `DECISIONS.md`; the generalisable half — a
dependency's blast radius is a property of the call graph, not of the deployment story — is in
`lessons.md`. The one Mirror Node GET is folded into `/api/health` in Unit 12 so the assumption is
visible, and pre-minting the demo tokens moves to Phase 5 as a rehearsal item rather than a hedge.

## 2026-09-08 — Five Phase 3 decisions, and three documents that had been carrying a dead to-do

Took five decisions against `PHASE-3.md` and propagated them to every document that contradicted
them. **The Own tier is cut** — a report is a read-only purchase, and the ATS transfer is demonstrated
standalone, because H2.4 asks for a lifecycle operation rather than one *caused by a payment*. That
was our own reading, and dropping it removes the whole expensive half of the gate: reservation,
recipient binding, R16's race and a 409. **Human buying is deferred rather than cut**, which resolves
a contradiction that had been sitting in the plan since it was written — §5.3 said cut, §5.4 built the
EIP-191 mechanism for it, and both could not be true. It is now Unit 18 and the declared cut point.
**Testnet in HBAR, mainnet in USDC at the end of Phase 4**, Arc staying on testnet because Arc mainnet
launches three days after the deadline. And **Unit 0** for the accounts and services, because Vercel,
Neon and the `postgres` dependency do not exist and Unit 1 cannot run without them — tracked as a unit
rather than as an assumption, which is how §7's provisioning inventory ended up half-done.

⚠️ **The USDC switch had been open in three places for two days** — SM-05's row, PLAN §1, and the
research note's "Verdict: USDC" — all reading as scheduled Phase 3 work. Nothing was going to action
it, because the blocker was never setup, it was **supply**: Circle's faucet did not deliver and SM-08
later found its API endpoint rate-limiting independently of the web form. All three now say decided.
Worth noting the swap really is small — SM-05 already proved a non-default asset works once opted into
the spend-control allowlist, so what is left is token id, price format, allowlist entry and the
facilitator's asset, moving together per R12.

Also corrected `x402-protocol-spec.md:258`, which had asserted for two days that Blocky402 does not
support `hedera:testnet` — the sentence R12 rests on, in the note someone reads first. Marked
correction with the original quoted and the live `/supported` response, same as the ATS one. Three new
sections in `DECISIONS.md`; PLAN §1, §5.3, §5.4, §5.19, §9 and R12 amended in place with what they
used to say. Unit count is 19, one of which is designed to be dropped.

## 2026-09-08 — Reconnaissance: what of Phase 0 is promotable, and what a buyer actually receives

Read-only pass over the three smoke tests Phase 3 and 4 would promote, plus `verify-ats.ts`,
`render()`, `execute.ts`'s return shape and the standing decisions. No edits.

**The promotable/throwaway split, judged rather than assumed.** SM-05 gives up roughly 145 of 435
lines — the handler branch table, inspect-before-settle, the two Mirror Node polling helpers, the
buyer's explicit spendControls, the `/supported` feePayer assertion — and the rest is console
formatting and one-time balance arithmetic. SM-07 gives up roughly 175 of 469, and the corrected
`deployEquity` struct is the single highest-value block in the repo for Phase 3 because its two
values were paid for with a real reverted deploy. SM-08 gives up about 80 of 460 and is Phase 4 work;
its `eth_getLogs` probe already produced its answer and should be kept as the number 30,000, not as
code. `scripts/ops/verify-ats.ts` is already a module wearing a script's clothes — it needs a
function parameter instead of `argv[2]` and nothing else.

⚠️ **Three findings that change unit briefs.** SM-05 constructs the resource server and calls
`initialize()` **at module scope with no try/catch**, which is exactly the §5.17 crash loop — promoting
it as written would ship the bug. Its native transaction id is assigned to a `let` and printed but
**never persisted**, and the code's own comment says so. And `FACILITATOR` is a module constant while
the network string comes from env, so R12's atomic switch lives in prose rather than in code.

⚠️ **What a buyer receives is thinner than the docs suggest.** `render()` emits a heading, one table,
one provenance line and one paragraph — and **the hash is not in it.** `_hash` is accepted and
discarded with `void _hash`. Wiring it is one line and it is the difference between a document and one
a buyer can check against the token's creation event. Also confirmed: SM-07 writes `FAKE_REPORT_HASH`
into `additionalSecurityData.info`, so the mechanism is proven byte-identically and the value is a
placeholder; and the ISIN is the constant `"XXALPHA0001"`, so every report would mint the same one.

There is no `src/report/` — `render()` lives in `narrate.ts`. And there is exactly one HTTP server in
the repo, inside SM-05, on loopback and an ephemeral port. Phase 3 is not adapting a server; it is
writing the first one.

## 2026-09-08 — Phase 3 Unit 1: the Next 16 skeleton, and the tsconfig trap avoided by a config flag

`app/layout.tsx`, `app/page.tsx`, `next.config.ts`, `tsconfig.app.json`, plus four npm scripts and
three pinned dependencies. Nothing under `src/` or `scripts/` was touched. **`npm run build` passes as
a production build**, two routes, zero warnings on a clean run.

**The tsconfig question resolved with `typescript.tsconfigPath`, verified rather than assumed.** Next
16 accepts a `tsconfigPath` in `next.config.ts` (confirmed in `config-schema.js:789` before relying on
it), so Next reads and rewrites **`tsconfig.app.json`** and never opens the root file. The proof is
that the first build printed *"We detected TypeScript in your project and reconfigured your
tsconfig.json"* and then edited `tsconfig.app.json` — `jsx: preserve` → `react-jsx`, plus
`.next/dev/types` added to `include`. The root config is byte-identical, `tsc -p tsconfig.json
--noEmit` exits 0 over all of `src/` and `scripts/`, and `scripts/demo/canonical.ts` runs under tsx
with SM-01's recorded hashes still reproducing. ⚠️ **Rejected the alternative — widening the root to
serve both — without trying to make it work**: `NodeNext` requires the explicit `.js` extensions every
import in this repo carries, and Next's generated `.next/types` files do not carry them, so one
config cannot satisfy both resolvers.

⚠️ **The deploy half is not done and is blocked on something I do not have.** There is no `.vercel/`
directory, no Vercel CLI, and no auth token anywhere on this machine or in `.env` — **no Vercel
project exists or is linked to this repo**, which also means §7's provisioning inventory item was
never completed rather than completed-and-forgotten. `vercel login` needs a browser or an emailed
code. Reported rather than worked around.

**Two things worth knowing before the next unit measures the bundle.** Next loads `.env` at build
time (it prints `- Environments: .env`), and that file holds `HEDERA_SELLER_KEY`,
`CIRCLE_ENTITY_SECRET` and `ARC_DEPLOYER_KEY` — server-only unless something is ever prefixed
`NEXT_PUBLIC_`, which would inline it into a client bundle. And the heavy dependencies the next unit
measures are **already installed** from Phase 0 — `@x402/hedera`, `ethers`, the ATS contracts package
— so the baseline is not a clean one; what changes is whether `app/` imports them.

## 2026-09-08 — Phase 3 Unit 2: the probe route. M1 answered with room to spare, M2 works on Next 16

`app/api/probe/route.ts`, one throwaway file, plus two dependencies. It fits, and the number is
**10.0 MB against a 250 MB limit — 4.0%, with 240 MB of headroom.**

**M1, measured three ways so the delta is visible rather than inferred.** The figure is the sum of
every unique file in `@vercel/nft`'s trace — `.next/server/app/api/probe/route.js.nft.json` — plus the
entry file, which is what Vercel uploads for that function.

| variant | traced size | % of 250 MB |
|---|---|---|
| all five heavy imports | **10,473,708 B = 10.0 MB** | 4.0% |
| four non-x402 heavies commented out | 4,145,698 B = 4.0 MB | 1.6% |
| `/` page, no heavy deps at all | 1,746,076 B = 1.7 MB | 0.7% |

So the ATS contracts package + ethers + postgres + `@anthropic-ai/sdk` cost **6.0 MB**, and the
x402/Hedera stack costs **2.3 MB** over the bare page.

⚠️ **The reason it fits is the mechanism, and it is worth naming.** Turbopack **bundles** server
dependencies into a chunk rather than tracing raw `node_modules` — the 110 MB the research note
measured for the ATS contracts package plus ethers becomes 7.93 MB of
`chunks/[root-of-the-server]__1bcmqn_._.js`. Nothing was silently dropped: the chunk carries 110
occurrences of `ethers`, 181 of `ResolverProxy`, 58 of `keccak` and 8 of `TransferTransaction`, and
each of the five is referenced at runtime in the response body precisely so tree-shaking cannot make
the measurement a lie. **No native `.node` or `.wasm` binaries are traced**, which is the thing that
would have resisted bundling and changed the answer.

**M2 — `withX402` works on Next 16, unmodified.** A real 402 from a production `next start`, with the
challenge in the `payment-required` header: `network: hedera:testnet`, `extra.feePayer: 0.0.7162784`,
`scheme: exact`, `asset: 0.0.0`, `amount: 100000` tinybars, `x402Version: 2`. None of the Next 15
friction from `docs/research/x402-next-2.25.md` appeared — no `--legacy-peer-deps`, no peer conflict.
The resource server is built **inside** the handler in a try/catch, never at module scope, which is
the one thing `scripts/smoke/05-x402-purchase.ts` does wrong at its line 241.

⚠️ **Two dependencies landed, and one brought a surprise.** `postgres@3.4.9` has **zero**
dependencies. `@x402/next@2.25.0` pulled `@x402/extensions@2.25.0`, which depends on **`viem`** —
plus `@signinwithethereum/siwe`, `jose`, `ajv`, `@noble/curves`, `@scure/base`, `tweetnacl` and `zod`.
32 packages for two direct installs. **`viem` is now installed as a transitive dependency**, having
been listed in the plan under Phase 4's `market/` and reported as "not installed" three days ago. It
is not imported by anything and did not appear in the traced bundle, but the tree is no longer what
the plan's dependency table says it is.

⚠️ **Not done: the deployed URL.** Vercel auth still does not exist on this machine — no `.vercel/`,
no CLI, no token — so the 402 above is from a local production build rather than from Vercel. That is
`next build` + `next start`, never `next dev`, so it is not the failure class SM-09 guards against;
but it is not the deployment proof either, and the route stays until it has run once on Vercel.

**Build warning worth recording:** `Patching Protobuf Long.js instance...` appears twice during page
data collection, from `@hiero-ledger/sdk`'s protobuf layer. Harmless here, and the kind of thing that
is cheaper to have seen now than under five more dependencies.

## 2026-09-08 — Phase 3: vercel.json, the deploy lands, and the probe answers from Vercel

`vercel.json`, one key, `{"framework": "nextjs"}`. Nothing else — no `buildCommand`, no
`outputDirectory`, no `installCommand`, because Next's defaults are right and an override is a second
place for this to go wrong. `.gitignore` needed no change: the CLI had already added `.vercel` and
`.env*` during linking.

**The deploy fixed what it was meant to fix.** The "No Output Directory named `public`" error is gone
— the project preset was "Other" because it was created before the repo had a framework in it, and
declaring the framework in the repo puts that setting in version control rather than in dashboard
state nobody can read later. Build completed in 1m, route table identical to local (`○ /`,
`○ /_not-found`, `ƒ /api/probe`), aliased to
**https://et-honline-2026-alpha-markets.vercel.app**. `GET /` returns 200 and renders the scaffold.

**M2 now has its serverless answer.** `GET /api/probe` on the deployed URL returns **402** with a
`payment-required` header whose decoded challenge carries `network: hedera:testnet`,
`extra.feePayer: 0.0.7162784`, `scheme: exact`, `asset: 0.0.0`, `amount: 100000`, `x402Version: 2`
— the same challenge the local production server produced, now out of a Vercel function. `withX402`
works on Next 16 in the environment that matters.

⚠️ **And the deployment surfaced a bug the local run had masked: `payTo` came back as an empty
string.** The probe reads `process.env.HEDERA_SELLER_ID ?? '0.0.10387690'`. Locally both branches
produce the same 12-character `0.0.x` value, so the two were indistinguishable; on Vercel the header
carries `"payTo": ""`. `HEDERA_SELLER_ID` **is** listed in Production (`vercel env ls`), so it is
defined-and-empty rather than absent — and `??` only falls back on `null`/`undefined`, never on `""`.
**A challenge with an empty `payTo` cannot be paid**, so this would have been a live failure the first
time a buyer agent tried, presenting as a facilitator error rather than as a config one.

Two things to take from it rather than one. The immediate fix is the Production value of
`HEDERA_SELLER_ID`, which needs checking against what `.env` holds locally. The durable one is that
**`??` is the wrong operator for environment variables** — `||`, or an explicit empty check, is what
distinguishes "unset" from "set to nothing", and a `payTo` is exactly the field where that distinction
moves money. Recorded rather than fixed: the probe is throwaway and its route was out of scope for
this unit, but Unit 12's `payments/server.ts` should treat an empty required env var as a startup
failure rather than letting it reach a challenge.

The probe route stays until this is resolved; it has now answered from Vercel, which was the condition
for deleting it, but deleting it would also delete the only thing currently exercising that env path.

## 2026-09-08 — Circle credentials still work, and SM-08's half-run assertion can now close for real

Read-only check ahead of Unit 2 (`config/analysts.ts`), whose proof depends on the recorded analyst
address being checkable against the live Circle API rather than against a constant.

**All three Circle variables are present and well-formed in `.env`** — `CIRCLE_API_KEY` (78 chars,
`TEST_API_KEY` prefix, so a sandbox key, consistent with testnet), `CIRCLE_ENTITY_SECRET` (64 hex
characters = the 32 bytes Circle wants), `CIRCLE_WALLET_ID` (36 chars, UUID-shaped). None empty.

**The credentials still function.** One live read — `circle.getWallet({ id })`, `GET
/v1/w3s/wallets/{id}`, the same call SM-08 makes in its reuse branch at line 84 — returned:

```
  address       0x1b7035bbe0da8f3bcb721863d42e1079e4a116a7
  accountType   EOA
  blockchain    ARC-TESTNET
  state         LIVE
  custodyType   DEVELOPER
  createDate    2026-09-06T20:06:03Z
```

**The address matches the one hardcoded in the three demo scripts and recorded in `DECISIONS.md`,
exactly.** `accountType: EOA` satisfies §5.18 — `claimId` derives the author from `msg.sender` and an
EOA's Circle address is deterministic — and `custodyType: DEVELOPER` confirms it is a
developer-controlled wallet rather than a user-controlled one.

⚠️ **The script was not run, deliberately.** SM-08 obtains the address through a read, but the read is
step 1 of six and the script continues into a contract deploy and a payable transaction. `.env.example`
also warns that running it without `CIRCLE_WALLET_ID` creates a *second* wallet, which is a
wrong-author bug rather than an inconvenience. The call was reused; the script was not.

**So Unit 2's proof can be the strong version** — assert `analysts.ts`'s Arc address equals what the
live API returns, closing the half of SM-08's assertion that has been open since 2026-09-06 because
`analysts.ts` did not exist.

⚠️ **One caveat on where that proof runs.** This confirms the values in the local `.env`. Yesterday's
deploy found `HEDERA_SELLER_ID` set-but-empty in Vercel Production while non-empty locally, so
"the credentials work" is currently a statement about this machine. If Unit 2's assertion is ever
expected to pass in CI or on Vercel, the Production values are a separate and unverified question.

## 2026-09-08 — Phase 3 Unit 2: config/analysts.ts, and SM-08's half-run assertion finally closes

`src/config/analysts.ts` plus its proof, `scripts/ops/verify-analyst.ts`. One row, one lookup, two
live assertions. Nothing else touched — `execute.ts` still takes an address parameter and the four
demo scripts still carry the literal, because changing that is a function signature and four call
sites, which is the next commit.

**Both assertions pass against live services.**

```
── alpha-1  "Alpha Markets House Analyst"   model claude-sonnet-5
  arcAddress
    config      0x1b7035bbe0da8f3bcb721863d42e1079e4a116a7
    circle      0x1b7035bbe0da8f3bcb721863d42e1079e4a116a7   ✅
    accountType EOA   ✅   blockchain ARC-TESTNET   state LIVE
  hederaEvmAddress
    config      0x32838fe90541567bbf77fa0570661f3c20e2b152
    mirror node 0x32838fe90541567bbf77fa0570661f3c20e2b152   ✅   for 0.0.10387690
    key type    ECDSA_SECP256K1   deleted false
```

**§5.18 is now checked rather than assumed.** It requires `analysts.ts`'s address to equal the Circle
wallet address; SM-08 could only run the `msg.sender` half on 2026-09-06 because this file did not
exist. The other half is closed, and `accountType: EOA` is asserted alongside it — an SCA would mean
re-provisioning, and finding that out now costs nothing against finding it out in Phase 4.

⚠️ **The EVM address was READ, not derived.** `GET /api/v1/accounts/0.0.10387690` → `evm_address`.
Cross-checked once against `ethers.Wallet(key).address` and the two agree, but Mirror Node is what the
file records as its source, because the account's own record is the authority on its alias and
deriving it ourselves would only prove we can repeat our own arithmetic. The proof script deliberately
does not read `HEDERA_SELLER_KEY` at all — the check needs no private key, and not asking for one
keeps its credential surface to the two Circle values plus a public GET.

⚠️ **One thing the row shape decides silently, and it should be a decision rather than a default.**
`arcAddress` is the analyst's *identity* — who wrote the report, who stakes. `hederaAccountId` and
`hederaEvmAddress` are a *treasury* role: the x402 `payTo` and the ATS issuer. Today they are one
entity because there is one analyst, so the row reads naturally. Adding a second analyst forces the
question the shape currently answers by itself: **does each analyst get its own Hedera account —
its own `payTo`, its own ATS issuer — or do all analysts sell through one platform treasury and
differ only by `arcAddress`?** The plan's agent-economy framing implies the first; the single row
implies nothing either way. Recorded rather than resolved.

Smaller notes: the lookup throws on an unknown id rather than returning `null`, because a silent
`undefined` would reach `Report.analyst` as the string `"undefined"` and hash exactly as cleanly as a
real address. `model` is imported from `loop.ts`'s `MODEL` rather than restated, so the two cannot
drift. And the proof script's `env()` treats an empty string as missing — yesterday's deployed probe
produced a challenge with an empty `payTo` precisely because `??` falls back on `undefined` and not
on `""`.

## 2026-09-08 — Phase 3: execute takes an analyst id, and the hash does not move

`ExecuteState.analyst: string` became `ExecuteState.analystId: string`, `execute` resolves it through
`config/analysts.ts`, and three of the four demo scripts pass `'alpha-1'` instead of a literal
address. The literal now appears in exactly two places: the config row that owns it, and
`demo/canonical.ts`'s fixture.

**The rename was the point, not a side effect.** `analyst: "alpha-1"` in a field that used to hold
`0x1b70…` is the same-name-different-meaning that Morpho's schema taught this project to distrust —
it would have compiled everywhere and been wrong everywhere. `analystId` forces every call site to be
looked at. The resolution happens **before any query**: an unknown id throws in 0ms rather than after
a hundred gateway requests, and the lookup's own message already explains why an unregistered analyst
cannot be attributed.

⚠️ **The hash was proved not to move, end to end, rather than argued.** A real report was generated
through `execute` **before** any edit — aave-v2 balance sheet, block 25930486, `dataHash
f1e2b62f1203…`. After the change the same plan was re-run at the **same pinned block** through the
new `analystId` path:

```
  before  f1e2b62f120356246bd736ed0472ea2ff1254179b0a7f4d683542adf565192ee
  after   f1e2b62f120356246bd736ed0472ea2ff1254179b0a7f4d683542adf565192ee
  ✅ HASH DID NOT MOVE
```

That is a live comparison, not a constructed equivalence — same block, same data, byte-identical hash.
`Report.analyst` still holds an address and is still inside the hash; only where the caller got it
from changed.

⚠️ **`demo/canonical.ts` keeps its literal, deliberately.** It never calls `execute` — it builds
`Report` objects directly and hashes them against values recorded on 2026-09-05. A fixture that
resolves through config is a fixture that changes when config changes, which defeats it. Its
`differs('analyst changed', …)` case also needs a second, deliberately wrong address, which config
cannot supply. Its recorded hashes still reproduce: `49cfaa6c…3db9b7` and `b3688035…bfe3ec`.

`demo/validate.ts` needed both forms — an id for its `execute` call and the row's own `arcAddress` for
a hand-built validator fixture — so it reads `analyst(ANALYST_ID).arcAddress` rather than restating
the literal. The fixture there has no recorded hash, so resolving it is safe; that is the distinction
from `canonical.ts`.

Everything else passes: `tsc -p tsconfig.json --noEmit` exits 0, `demo/execute.ts` runs end to end
with the config address in the report, and its own determinism check still reports
`run 1 / run 2 ✅ identical` at a shared block.

The DECISIONS entry recording why the analyst row carries Hedera fields landed in the same commit's
worth of work, because this is the change that makes the config load-bearing.

## 2026-09-08 — Phase 3: the src/agent/ split is named, and MODEL moves to config

`src/config/model.ts` (new), eight import sites, and a rewritten `src/agent/README.md`. No file moved,
no directory split, `loop.ts` and `tools.ts` unchanged and unrenamed — **the decision is that the
split is named, and restructuring is the thing explicitly not done.**

**The open question from `lessons.md` 2026-09-07 is closed.** The report pipeline is the product;
`loop.ts` and `tools.ts` are the demo surface behind `scripts/ask.ts` and they stay. The README now
says so in its first three lines, so nobody has to infer it from the imports — which was the actual
complaint, since being unable to summarise the directory was how the problem surfaced in the first
place.

⚠️ **The recon's list of MODEL importers was one short, and the missing one was the interesting one.**
`src/config/analysts.ts` imported `MODEL` from `agent/loop.ts` — while `agent/execute.ts` imports
`config/analysts.ts`. So config depended on agent while agent depended on config. Moving the constant
to `config/model.ts` removes that edge entirely; `src/config/` now imports nothing from `src/agent/`,
checked by grep. That was not the reason for the move and it is the better outcome of it.

**Its own file, not a row in an existing config module.** `protocols.ts` is the deployment table and
`analysts.ts` is the analyst table; a model name is neither, and `src/config/` runs one concern per
file. `analysts.ts` was the closest fit because it consumes `MODEL` for a row's `model` field — and
that is exactly why it is the wrong home: *which model this analyst runs* and *the platform default*
are two ideas sharing one value today, and separate analysts running separate models is the premise
of the product. Defining the default inside the table that may one day disagree with it is how the two
stop being distinguishable.

**Eight sites, and one of them was dead.** `scripts/demo/agent.ts` imported `MODEL` and never used it;
that import was dropped rather than re-pointed. `loop.ts` now imports the constant it used to define,
and does not re-export it, so every importer takes it from config.

⚠️ **`scripts/smoke/06-agent-tool-call.ts` has its own local `const MODEL = "claude-opus-5"` and was
left alone.** It is a different constant with a different value inside a closed Phase 0 smoke test.
Unifying it would change what that test ran, which is not a move — flagging it rather than touching it.

**Proofs.** Nothing in the pipeline imports `loop.ts` or `tools.ts` — `compose`, `execute`, `narrate`
and `validate` show zero import hits. `loop.ts`'s only remaining importers are `ask.ts` and three
demos. `tsc -p tsconfig.json --noEmit` exits 0. `ask.ts` answered a live question in 3 turns and 2
tool calls, printing `model claude-sonnet-5` from the new location. `demo/execute.ts` runs all four
cases and its determinism check still reports `run 1 / run 2 ✅ identical` at a shared block.

No output differed in any way attributable to the change: the live figures and blocks move between
runs because the chain does, and the invariant that does not move — the same plan at the same block
hashing identically — held.

**The README also gained `validate.ts`,** which it had never mentioned because Unit 11 landed after it
was written. Since the file was being rewritten anyway, an absent unit was a false sentence by
omission.

## 2026-09-08 — Phase 3: the store connects, and four tables exist

`src/store/db.ts`, `src/store/migrations/001_init.sql`, and `scripts/ops/migrate.ts` as the runner.
No store logic — `save`, `load` and `list` are Unit 5, which is the unit that proves a `Report`
survives the round trip. This one is the connection and the schema.

⚠️ **The unit stopped on its first attempt and the stop was the right call.** `DATABASE_URL` and
`DATABASE_URL_DIRECT` were byte-identical and both pointed at the `-pooler` host, so the "direct"
connection was a second copy of the pooled one. Running DDL through PgBouncer does not fail cleanly —
it fails on session state and reads like a fault in the `.sql` file — and a passing proof would have
exercised the pooled path twice while claiming to have exercised both. Env corrected, re-verified
(`identical hosts? False`), then built. `migrate.ts` now asserts the absence of `-pooler` before
running anything, because a copied connection string is how this happens and it already happened once.

**Column types, chosen rather than defaulted.** `TEXT` for canonical JSON, never `jsonb` — jsonb
reorders keys, normalises numbers and drops duplicates, and the report hash is SHA-256 over the
canonical bytes, so a round trip would silently change the identity of every stored report. The
round-trip proof shows it holding: `{"b":2,"a":1}` came back in written order rather than sorted.
`BIGINT` for `price_tinybars` — atomic units, exact integer, money never touches a float, and
BIGINT's ceiling is ~92 billion HBAR. `TIMESTAMPTZ` everywhere, never naive `TIMESTAMP`:
`observed_at` is a real instant from `eth_getBlockByNumber` and `expires_at` sits inside Hedera's
~120s validity window, where a one-hour zone error is not a rounding difference. `TEXT` for hashes
and addresses with `CHECK` regexes rather than `CHAR(n)`, which pads on read.

**Two schema decisions that came from earlier findings rather than from the brief.**
`report_tokens.report_hash` is the PRIMARY KEY, so one report can have only one token — `maxSupply: 1`
stops a second *issue* against one proxy but nothing on-chain stops a second *proxy*, which SM-07
named as a gap. And `purchases.payment_id` is the PRIMARY KEY, which is the idempotency mechanism
§5.9 needs; `native_tx_id` is `NOT NULL` because §5.8 requires it written before settle is called, so
a row with a native id and a null `settled_at` is exactly the ambiguous case `recover.ts` resolves.

**The runner is 45 lines and deliberately not a framework** — no version table, no down migrations, no
checksums. Every statement is `IF NOT EXISTS`, so re-running is the same as running once, which is
what a version table would otherwise buy. Idempotence proved by running it three times.

⚠️ **Two things Unit 5 needs to know.** `BIGINT` comes back from `postgres` as a **JavaScript string**,
not a number — deliberate on the driver's part, since a bigint exceeds `Number.MAX_SAFE_INTEGER`. So
`block` round-trips as `"25930486"` and `Report.block` is typed `number`; Unit 5 has a coercion to
write, and doing it wrong is a silent type mismatch inside a hashed object. And idempotent DDL is
noisy by design: the default notice handler dumped whole notice objects that read like errors on the
one run proving nothing broke, so `direct()` now prints them as one line each — the information kept,
the object dump gone.

`postgres@3.4.9` was already declared from the Unit 1 probe and is confirmed a leaf: `dependencies {}`,
`peerDependencies {}`, and `npm ls postgres --all` shows nothing beneath it.

## 2026-09-08 — .env.example catches up with the store, and one variable that does not belong in it

Two names added — `DATABASE_URL` and `DATABASE_URL_DIRECT` — plus a header note that an empty value
is a missing value. Nothing else changed; `.env` untouched.

**The Neon block carries the reason there are two.** Pooled for route handlers, direct for migrations,
with the host difference spelled out (`-pooler` present or absent) and where each comes from in the
Neon console. ⚠️ It says plainly that copying one string into both is a mistake this project has
already made, and why it is expensive: PgBouncer in transaction mode cannot carry the session state
DDL needs, so the failure surfaces as errors about prepared statements that read like a bug in the
`.sql` file rather than a wrong connection.

**The empty-value note went in the header rather than beside a variable**, because it is a property of
the whole codebase and not of one name. It cites the case that produced it: a variable set to empty
in Vercel production produced a live x402 challenge with an empty `payTo`, which read as a facilitator
error and was a config one.

⚠️ **`ARC_WALLET` is in `.env` and was deliberately NOT added.** It is a 42-character `0x…` address
and **nothing in the repo reads it** — grepped across `src/`, `scripts/`, `app/`, `docs/` and
`tracking/`, zero references. The file's own rule is that a variable arrives with the unit that needs
it, so adding it would make `.env.example` a list of things someone once set rather than a list of
what the repo requires. Reported, not added, and not removed from `.env` either. Worth someone
deciding what it was for: the likely candidates are SM-09's MetaMask demo wallet or a hand-noted copy
of the Circle wallet address, and if it is the latter it duplicates `analysts.ts`'s `arcAddress`,
which is the one that is verified live.

**Reverse direction: nothing is stale.** Every one of the 13 pre-existing names has at least one code
reference under `src/` or `scripts/`, checked by grep per name. Nothing to report as dead.

**The secret check was mechanical rather than asserted**, three ways. Every one of the 16 non-empty
values in `.env` was searched as a substring of `.env.example` — two matched, `HEDERA_NETWORK=testnet`
and `HEDERA_TESTNET_RPC=https://testnet.hashio.io/api`, both pre-existing non-secret defaults the file
ships on purpose. Every one of the 15 assignments was checked for a non-empty right-hand side — only
those same two, both allow-listed. And a pattern sweep for hex ≥32 chars, `0x…` keys, `postgres://`
URLs, `sk-ant-` keys, Circle `TEST_API_KEY` prefixes and UUIDs found one hit in the whole file:
`0x3600…0000` in a comment, which is Arc's public native USDC contract address and pre-existing. Of
the 34 lines added, zero matched any pattern and both assignments have an empty RHS.

## 2026-09-08 — Phase 3 Unit 5: a real report survives the round trip, and the BIGINT trap never fires

`src/store/reports.ts` — `save`, `load`, `list`, plus `close` for scripts — and `scripts/demo/store.ts`
as the proof. All five checks pass on a **real** report: 140 facts, 70,718 canonical bytes, a decimal
tail 26 places long, one explicit null. `demo/canonical.ts`'s fixture would have passed this trivially
at nine fields and one fact; the point was to run it against the shape that actually breaks.

```
  ✅ canonical bytes are byte-identical  70718 vs 70718 bytes
  ✅ recomputed hash equals the stored key
  ✅ block is a number, not a driver string  typeof=number
  ✅ no-op rather than error  inserted=false
  ✅ load THREW rather than serving the row
```

⚠️ **The BIGINT coercion trap does not exist on the load path, and that is a design choice rather than
luck.** `load` parses `canonical_json` and never reassembles a `Report` from columns, so `block` comes
out of the JSON as the number it was serialised as instead of out of the driver as the string
`"25930486"`. Measured beforehand: `{"block":25930486}` and `{"block":"25930486"}` are different
bytes, so a careless coercion would have been a silent identity change inside a hashed object. The
columns beside `canonical_json` are for querying and display, not a second source of truth. **The one
coercion in the file is in `list()`**, where `block` is display-only, flagged at both its type and its
call site, and can never re-enter a hashed object because `load` is the only path back to a `Report`.

⚠️ **A subtlety the brief did not mention and the round trip surfaced: `canonical()` strips
`atsTokenAddress`.** The stored JSON therefore has no such key, and parsing it yields `undefined`
rather than the `null` the contract requires ("unavailable is `null`, spelled out, never an absent
key"). `load` reattaches it as `null`. Verified that this is invisible to both checks, because
`canonical()` strips it again on the way in — the two forms hash identically. Which token belongs to a
report lives in `report_tokens`, and joining it is Unit 8's business.

**Two checks in `load`, not one, and both were made to fire.** Check 1 recomputes the hash and
compares it to the primary key — the proof flips one digit in the database and it throws, naming both
hashes. Check 2 asserts the stored bytes are *canonical*, not merely equivalent: re-serialising the
same content with reordered keys passes check 1 (canonicalization normalises it away) and fails check
2 at the same byte length. Demonstrated separately since the main proof only exercises the first.

**`ON CONFLICT (hash) DO NOTHING`** for the re-save. Safe rather than lossy: the hash is derived from
the content, so a conflict means the incoming report is byte-identical by construction and there is
nothing to overwrite. `DO UPDATE` would let one hash hold two versions, which is the thing the
identity exists to make impossible. `save` computes the hash itself and never takes one from a caller,
so the key and the bytes cannot disagree.

⚠️ **One thing raised rather than solved: `rendered_md` may be the wrong column.** It is `NOT NULL`,
but `save(report)` has no markdown to put in it — rendering is `narrate.ts`'s `render()`, and
importing it here would make the store depend on the agent, which is the dependency direction that
just got straightened. So `renderedMd` is an optional second parameter defaulting to `''`, which
honestly means "nothing rendered" rather than a fabricated heading that would look like a rendering.
**The deeper question is whether the column should exist at all:** `render()` is a pure function of a
stored `Report`, so this is a cache of something derivable, and a cache can diverge from its source.
Not altered — changing the schema is not this unit's to do.

## 2026-09-08 — reports.rendered_md dropped: a cache of a pure function, and a dependency pointing backwards

`src/store/migrations/002_drop_rendered_md.sql` (new) and `src/store/reports.ts` — `save` now takes a
`Report` and nothing else. Two call sites in the proof script updated.

**The column was a cache of `render()`, which is a pure function of the stored report.** It could only
ever diverge from its source, and a format change would have left old rows rendering the old way with
nothing on the row marking which era it belonged to. It also forced the store to either import from
the agent — reversing the direction straightened when `MODEL` moved to `config/` — or accept markdown
from whichever caller happened to write the row, which makes the column's contents a property of the
call site rather than of the report.

⚠️ **`001_init.sql` was not edited.** A migration that has run against a live database is history:
rewriting it would mean a fresh database and an existing one no longer agree, with nothing recording
which is which. 001 creates the column, 002 removes it, and the pair is the honest record. The reason
for the drop is written into 002 rather than into a commit message, because the next person to wonder
why a two-day-old column disappeared will be reading the migration.

**Idempotence is visible rather than asserted.** Run 2 prints
`notice column "rendered_md" of relation "reports" does not exist, skipping` and still exits PASS,
which is the `DROP COLUMN IF EXISTS` doing its job. Ordering is right on a fresh database too: 001
creates the column and 002 drops it, in filename order.

**The live schema, as the database reports it:**

```
── reports
   hash            text                        NOT NULL
   analyst         text                        NOT NULL
   directive       text                        NOT NULL
   canonical_json  text                        NOT NULL
   block           bigint                      NOT NULL
   observed_at     timestamp with time zone    NOT NULL
   created_at      timestamp with time zone    NOT NULL

   rendered_md present? false   ✅ dropped
```

**Unit 5's proof still passes end to end on a fresh real report** — 140 facts, 71,830 canonical bytes,
26-place decimal tail: byte-identical canonical, hash matches the key, `block` a number rather than a
driver string, re-save a no-op, `list()` returns it (2 rows now), and the one-character tamper still
throws with both hashes named. `tsc -p tsconfig.json --noEmit` exits 0.

**Nothing is lost.** `canonical_json` holds the report, `load` returns it, and `render()` is a
function call away for anyone who wants markdown. Unit 6 renders on read.

## 2026-09-08 — Phase 3 progress record: units 0–5 done, and four things a cold session must know

Wrote the handover into **`tracking/phases/PHASE-3.md`** rather than a new file. Unit states went into
its existing Status table (0–5 now ✅ with what actually landed, 6 marked next), and a new section —
*Where this actually stands — 2026-09-08, end of session* — sits directly under it. That is the file
someone opens to start Phase 3 work, so operational state belongs beside the plan rather than at the
end of a chronological log; `logs.md` keeps the per-unit narrative it already has, and this entry is
the pointer. No seventh tracking file.

⚠️ **The section says explicitly that where it disagrees with the brief above it, it is right and the
brief is what was planned.** Three units landed differently and are recorded as such: `execute` takes
an `analystId` rather than an address, `MODEL` moved to its own `config/model.ts`, and `rendered_md`
was dropped in `002` after `001` had already created it. Two of those were follow-on commits with no
unit number, and they are labelled `2b` and `5b` rather than folded into the units they followed.

**Every cheaply checkable claim was verified before writing, not after.** All sixteen files named
exist with the line counts given; `tsc -p tsconfig.json --noEmit` exits 0; the migrations directory
holds exactly `001_init.sql` and `002_drop_rendered_md.sql`; `MODEL` is declared once, in
`src/config/model.ts`, with six importers; the root tsconfig still reads `NodeNext`/`NodeNext`;
`GET /` returns 200 and `GET /api/probe` returns 402 from the aliased URL with
`network: hedera:testnet` and `feePayer: 0.0.7162784`; and `list()` returns the two real reports Unit
5 stored.

⚠️ **A fourth open item turned up while verifying, and it blocks Unit 6.** `vercel env ls` shows
**neither `DATABASE_URL` nor `DATABASE_URL_DIRECT` is set in Vercel.** Unit 6 is the reading surface,
it reads from the store, and it will therefore work locally and render nothing in production. Recorded
alongside the three already known: `ARC_WALLET` set and unread, Production env values never verified
against local (`HEDERA_SELLER_ID` still resolves empty — the deployed challenge carries `payTo: ""`),
and the probe route staying until Unit 12 replaces it. A fifth, unrelated to this session:
`scripts/demo/skills.ts` reads a skill file that moved to `skills/unused/` in Phase 2 and would throw.

## 2026-09-08 — Phase 3 Unit 6: the reading surface, and the first time `app/` and `src/` met

`app/page.tsx` (the list), `app/report/[hash]/page.tsx` (one report), `app/markdown.tsx` (markdown →
React), `app/globals.css`, `app/layout.tsx` (one import), and `src/agent/narrate.ts` to give `_hash`
its job. Two files outside that set changed with approval — `tsconfig.app.json` and
`app/api/probe/route.ts` — for a reason that took three stops to get right.

**The unit stopped three times and every stop was load-bearing.** `app/` had never imported `src/`
before; Unit 1's probe answered M1 and M2 without ever touching it. Every file in `src/` writes
`.js`-suffixed imports because the root tsconfig is NodeNext, and **Turbopack does no `.js` → `.ts`
extension aliasing**, so it resolved `app/page.tsx` and died one hop later inside
`src/store/reports.ts` on its own `import { pooled } from './db.js'`. No app-side import style fixes
that, because the failure is not at the boundary.

⚠️ **`experimental.extensionAlias` is in Next's config schema and Turbopack ignores it.** It is read
only by `build/webpack-config.js`; `lib/turbopack-warning.js` lists it as unsupported; and Turbopack
prints `- Experiments (use with caution): · extensionAlias` before ignoring it, which reads like
confirmation. Written up in `lessons.md` with the other two present-looking values that never took
effect — the empty `payTo` and the gateway error strings that did not exist.

**What worked was `moduleResolution: nodenext` in `tsconfig.app.json`, which keeps Turbopack.** That
mattered more than it looks: Turbopack *bundles* server deps rather than tracing `node_modules`, and
that mechanism is the whole reason Unit 1's probe measured 10.0 MB instead of 110 MB. Switching to
webpack would have invalidated that measurement three units before tokenization lands.

⚠️ **The cost of nodenext is that TypeScript then models Node ESM while Turbopack keeps bundler
interop, and they disagree at a default import of a CJS module.** `next` ships no `exports` map, so
`next/link.js` is `module.exports = require(...)` and a default import binds the namespace rather
than the component. **Fixed by deleting `next/link` for a plain `<a href>`** — a two-page
server-rendered memo site uses neither prefetch nor soft navigation, and the deletion makes the type
model and the runtime model describe the same thing instead of papering over the gap. Named imports
are unaffected, so `next/navigation.js` and `next/server.js` were one-line specifier changes.

**No markdown library, and the reason is the generator.** `render()` emits exactly four constructs —
one `#` heading, one GFM pipe table, plain paragraphs, and `**bold**` in cells. `markdown.tsx` is
~45 lines of parser for that known input. A library would have been a dependency bought for
generality this input cannot contain, and — the real point — most markdown libraries return an HTML
string that needs `dangerouslySetInnerHTML` to mount, which is precisely where escaping stops being
ours.

⚠️ **Escaping: React's default covers it, and that is a consequence of producing elements rather than
a string.** Every untrusted value reaches the DOM as a React child, so `<`, `>`, `&` are escaped
before they are text nodes. Verified rather than assumed: `dangerouslySetInnerHTML` appears nowhere
in `app/` or `src/` except in `markdown.tsx`'s own comment explaining its absence, and the served
page renders the directive's apostrophe as `what&#x27;s inside it`. **Length is the half React does
not cover** — an indexer can supply an arbitrarily long `Token.symbol`, so cells are bounded at 140
characters where the untrusted value actually is. `narrate.ts` already bounds the whole table at
40,000.

**`_hash` got its job and it goes in the markdown, not just the page chrome.** The ATS token commits
these 32 bytes, so a rendering that does not name them is text nobody can tie to the token. It is in
`render()`'s output because **the markdown travels** — it is what a buyer receives over x402 in Unit
14, where the page is not there to say which report it was. All 64 characters, never a prefix: a
prefix recognises a hash and cannot verify one. The identity panel above the memo duplicates it
deliberately; the two have different jobs.

**Proofs, local.** `tsc -p tsconfig.json --noEmit` exits 0 and `next build` exits 0 under Turbopack.
Route table: `ƒ /`, `○ /_not-found`, `ƒ /api/probe`, `ƒ /report/[hash]` — both new routes dynamic,
which is `force-dynamic` doing its job so a published report appears without a redeploy. Served from
`next start`: `/` lists both real Neon reports with full hashes, and the report page renders its
table (`Protocol total (67 markets)` as `<strong>`, `$24.63B`, `~40%`), its paragraph, and its hash.

⚠️ **`/api/probe` traces at 10,473,708 B — byte-identical to Unit 1's recorded 10,473,708 B.** Same
method (every unique file in `route.js.nft.json` plus the entry). The nodenext change moved it not at
all. The new routes are cheap: `/` at 1,787,309 B and `/report/[hash]` at 1,847,372 B. The report
page does **not** drag in the Anthropic SDK — `narrate.ts` uses it only in type positions, so it is
erased.

**Hash on the page equals the primary key, checked mechanically rather than by eye.** For both stored
reports: scrape the identity panel and the markdown footer out of the served HTML, `SELECT hash FROM
reports` for the key, and re-derive the hash from the loaded report. 2/2 with all four equal.

⚠️ **A report that fails its hash check presents as HTTP 500 with no document.** Tested by making the
page throw `load()`'s own error in a production build: status 500, and the body contains **zero**
report content — no table, no figures, no paragraph, no hash. The full message and both hashes go to
the server log with a digest; the client sees Next's generic error screen, because Next redacts
server error messages in production by design. `/` still returns 200, so one bad row does not take
the site down. An unknown hash is a clean 404. **This tested the propagation path, not the tamper** —
that `load()` throws on an altered row is Unit 5's proof, and reproducing it here would have meant
writing to the live database.

**Not done: the deployed half.** Everything above is local. The public URL still serves the Unit 1
skeleton, because this work is uncommitted and deploys come from the repo.

## 2026-09-08 — Unit 6 verified in production: Neon is reachable from Vercel, and the only difference is an asset path

Read-only check against the aliased URL after the Unit 6 deploy. **All five checks pass.** The
specific unknown — whether `DATABASE_URL` works from a serverless invocation, having only ever been
exercised from this machine — is answered: it does.

| check | result |
|---|---|
| `GET /` | **200**, lists both real Neon reports with full hashes; the Unit 1 skeleton is gone |
| `GET /report/{hash}` | **200**, table, source line, assessment paragraph, hash — end to end |
| hash === primary key | **2/2**, checked mechanically |
| unknown hash | **404** (and a malformed, non-hex hash is also 404) |
| `GET /api/probe` | **402**, `network: hedera:testnet`, `extra.feePayer: 0.0.7162784` |

**The mechanical hash check, same shape as the local one.** For each key in `SELECT hash FROM
reports`: fetch the deployed page, scrape the identity panel and `render()`'s footer out of the
served HTML, and re-derive the hash from the stored canonical bytes via `load()`. All four values
equal on both reports. The live report page a stranger can open is
`https://et-honline-2026-alpha-markets.vercel.app/report/24041ca282d260d3ad843d197086f595d6a2fab46d4e5aadf3e1c1517bfdd3e5`.

⚠️ **Exactly one difference between local and deployed, and it explains itself.** The rendered
`<main>` is **byte-identical** on both pages — 3,402 bytes for the report, 1,123 for the index. The
whole-document difference is 180 bytes, and it is entirely the asset path: production serves
`/_next/static/immutable/chunks/…` where local serves `/_next/static/chunks/…`. Ten characters ×
eighteen references = 180 bytes. All seven referenced assets return 200, and the stylesheet is
present and correct — 3,499 source bytes minified to 2,332, with `table-wrap`, `identity`, `mono`,
`prefers-color-scheme` and `overflow-wrap` all in it. Nothing is unstyled and nothing 404s.

**`force-dynamic` confirmed in production, which is the property that matters operationally.** Three
consecutive requests to `/` each returned `x-vercel-cache: MISS`, `age: 0` and
`cache-control: private, no-cache, no-store`. A newly published report will appear without a
redeploy. Warm response times: `/` ~0.34s, a report ~0.40s, `/api/probe` 1.3s cold then ~0.31s.

⚠️ **`payTo` is still an empty string in the deployed 402 challenge.** Unchanged by this deploy and
already open item 2 in the Phase 3 record — `HEDERA_SELLER_ID` is defined in Vercel Production and
resolves empty at runtime. Restating it because Unit 12 replaces this route with the real
`payments/server.ts` and this is the exact failure the empty-env-var trap describes: the value is
present, the challenge is well-formed, and the field is blank. **It is not a regression from Unit 6**
— the reading surface does not touch it — but it is a live 402 advertising nobody to pay.

## 2026-09-08 — Phase 3 Unit 7: an ISIN per report, derived from the hash, proved before anything costs gas

`src/tokenize/isin.ts` (97 lines, 31 of them not comment) and `scripts/demo/isin.ts` as the proof.
No network: this unit is arithmetic, and a proof that reached for a database or a chain would be
proving something else.

**The check digit was promoted, not rewritten.** SM-07's `makeIsin` was already asserted against
three real ISINs before it spent anything, and it mirrors `factory/isinValidator.sol` line for line —
same letter expansion, same `pairing` parity trick, same digit-sum, same `(10 - sum % 10) % 10`.
Reimplementing a validated algorithm to make it look native here would have traded a proven thing for
a plausible one. `scripts/smoke/07-ats-issue-transfer.ts` was not touched.

⚠️ **The new part is the body, and the decision is base 36 rather than a slice of the hash.** The ISIN
alphabet is `0-9A-Z`; a report hash is hex. Taking nine characters off the hash would spend nine ISIN
positions carrying sixteen values each — **16⁹ ≈ 6.87e10 against 36⁹ ≈ 1.02e14, using 0.0677% of the
space** while still looking like a nine-character identifier. So the hash is read as one 256-bit
integer and re-encoded: `BigInt(hash) % 36⁹`, base-36, uppercased, zero-padded to nine.

**Collision probability, with the arithmetic rather than a reassurance.** Space is
36⁹ = 101,559,956,668,416. Birthday bound `p ≈ 1 - exp(-n(n-1)/2N)`:

| reports | p(collision) | | naive hex slice |
|---|---|---|---|
| 1,000 | 4.92e-9 | 1 in 203,323,237 | 7.27e-6 |
| 10,000 | 4.92e-7 | 1 in 2,031,403 | 7.27e-4 |
| 100,000 | 4.92e-5 | 1 in 20,313 | 7.02e-2 |
| 1,000,000 | 4.91e-3 | 1 in 204 | **0.999 — near-certain** |

⚠️ **The last row is the argument for base 36.** At a million reports hex truncation collides with
probability 0.999; base 36 with probability 0.005. For any realistic number of reports this project
will ever publish the risk is negligible, and the cost of getting it right was one modulo.

**Two traps, both silent rather than loud.** `toString(36)` emits **lowercase**, and the contract
would accept it — `_byteToCode` does no alphabet check and maps lowercase to the same expansion our
generator does, so a lowercase ISIN is self-consistent and passes on-chain while not being an ISIN by
ISO 6166. And a small remainder encodes to fewer than nine characters, which is the wrong length and
reverts `WrongISIN`. Hence `.toUpperCase()` and `.padStart(9, '0')`, both load-bearing.

**Proof — five checks, all pass, in 4.1s.** Three real ISINs reproduce (`US9311421039`,
`GB0002634946`, `US0378331005` — the same three SM-07 used, so the promotion is verifiably faithful).
Stable within the process and in a **separate process**, re-entered through `tsx` rather than
asserted. **1,000,002 distinct hashes → 1,000,002 distinct ISINs, zero collisions** (2 real + 1,000,000
synthetic; expected collisions at that n is 4.9e-3, so zero is the expected outcome and not luck).
The check digit validates under an **independent implementation** that shares no code — it reverses
the digit string and doubles from index 0 rather than computing a parity, folds with the Luhn
shortcut `x - 9`, and unlike the contract it *rejects* anything outside `0-9A-Z`. All 1,000,002 agree.
`tsc -p tsconfig.json --noEmit` exits 0.

The two real reports now in Neon map to `XXCQBDTBC9X2` and `XX37EMRMEZ29`.

⚠️ **Raised, not changed: `report_tokens.isin` has no UNIQUE constraint.** It is `TEXT NOT NULL`;
`report_hash` is the PRIMARY KEY and `proxy_address` is UNIQUE, so nothing stops two rows sharing an
ISIN. Since the ISIN is a pure function of `report_hash` and that column is already unique, a
duplicate ISIN can only mean a genuine base-36 collision — exactly the event the arithmetic above
says is rare and does not say is impossible. A UNIQUE constraint would turn it from a silent
duplicate into a failed insert. ⚠️ **But note the ordering cost:** Unit 8 deploys the proxy and then
records the row, so the constraint would fire *after* the gas was spent. Catching it before spending
means Unit 8 checking for an existing ISIN before it deploys, with the constraint as the backstop
rather than the mechanism. Both are Unit 8's to decide; the schema is untouched here.

## 2026-09-08 — Phase 3 Unit 8: a real report is an asset on Hedera, and the hash survived the round trip

`src/tokenize/ats.ts`, `src/tokenize/hedera.ts`, `scripts/ops/tokenize.ts`, and
`src/store/migrations/003_report_tokens_isin_unique.sql`. **Token live at
`0xE7aaEFB168F3E87975Fee1B0c932aE42776D8c6c`**, Sourcify `exact_match`, `balanceOf == 1`. Cost
**7.71290100 HBAR ($0.6232)** against SM-07's 7.71195075 for the same three steps — **+0.00095025**,
entirely 907 extra gas on `deployEquity`. No reverts, one deploy, nothing retried.

**The seam, named before writing rather than discovered halfway down.** `ats.ts` would have been
~380 lines, so the chain plumbing moved to `src/tokenize/hedera.ts` — Mirror Node reads, revert
decoding, `landOrStop`, balance polling, the exchange rate. The cut is **"how you talk to Hedera
safely" vs "what an ATS report token is"**, and it is the right cut because Unit 10's transfer needs
every line of the first and none of the equity struct. `ats.ts` is still 170 lines of non-comment
code against a ~120 ceiling; roughly 45 of those are the struct, which is data rather than logic and
is the block SM-07 paid a reverted deploy to get right. Splitting the struct away from the function
that submits it would put a measured value further from its reason, which is the opposite of what
the ceiling is for. Flagging it rather than pretending it fits.

⚠️ **`prepare()` and `tokenize()` are two functions because that is a safety property, not a style.**
Everything that can stop the run — already tokenized, key does not match the analyst row, factory
deleted, wrong chain, thin balance — happens before the first transaction. A run that dies between
deploy and issue leaves an asset with no token in it, so the checks are front-loaded rather than
interleaved. The script is **dry by default**; `--confirm` is a separate decision made after reading
the plan.

**Proved that the guard works, and it cost nothing to prove:** re-running the same report now prints
`STOP already tokenized … Refusing to deploy a second asset` and exits 1 without sending anything.
That check is the thing standing between a fat-fingered rerun and 7 HBAR.

⚠️ **The commitment is real this time.** SM-07 issued under `FAKE_REPORT_HASH`. This issued under
`alpha:24041ca2…dd3e5`, read back out of the `EquityDeployed` log and asserted **byte-identical** to
the primary key in Neon. `additionalSecurityData` is validated and emitted, never written to proxy
storage, so the log is the only place that proof exists — which is why `tokenize()` throws if the
emitted string differs rather than trusting that it was sent correctly.

⚠️ **The issuer comes from the analyst row, and the key is checked against it.** `Report.analyst`
holds the *Arc* address (`0x1b7035bb…`), so the row is found by matching that, and
`hederaEvmAddress` (`0x32838fe9…`) comes off the same row. The private key still comes from
`HEDERA_SELLER_KEY` — a key cannot live in a committed config file — but `prepare()` refuses unless
that key derives the row's address. **A second analyst needs a per-analyst key scheme; until then
this check is what makes one shared variable safe, because a mismatch stops instead of issuing from
the wrong account.** Worth deciding before a second analyst exists, not after.

**Two promotions and one deliberate change.** `revertReasonFromMirror` and `landOrStop` came over
whole — the Hashio relay reports a failure as a status-0 receipt with no revert data, so
`error.data` is undefined and the selector exists only at `/api/v1/contracts/results/{hash}`. ⚠️ The
change: `landOrStop` **throws instead of `process.exit(1)`**. SM-07 is a script and exiting is right
there; this is a library, and a `process.exit` inside `tokenize()` would take a server down
mid-request when Unit 14 calls it. The discipline is untouched — real reason, say what already
landed, never retry — only who prints it moved.

⚠️ **A new instance of the ethers two-identity problem, in a new place.** SM-07 documented it for
wallets (`asRunner`); it reappeared for receipts, where typechain returns a CJS
`ContractTransactionReceipt` that will not assign to our ESM `ethers.TransactionReceipt`. Solved by
declaring `TxCost` — the three fields actually read — rather than adding a second cast. One installed
copy of ethers, two type identities, and it will keep surfacing wherever a typechain value crosses
into our code.

**Migration 003 adds `UNIQUE` on `report_tokens.isin`**, as Unit 7 raised. ⚠️ Written into the file:
it is a **backstop, not the mechanism**. `prepare()` is what prevents the spend; the constraint only
catches two runs racing, where both preflights pass before either inserts — and even then it fires
after the gas is gone, orphaning an asset. That is still better than two rows disagreeing about which
proxy holds a report's token.

**Cost drift is attributable.** `grantRole` and `issue` matched SM-07 to the tinybar; the whole
+0.00095025 HBAR is `deployEquity` at 6,714,755 gas against 6,713,850 — 907 gas, which is the ISIN
and info strings being different lengths from SM-07's. Nothing structural moved.

`tsc -p tsconfig.json --noEmit` exits 0. No transfer — that is Unit 10, and `transfer_tx` is null in
the row precisely because it is a separate lifecycle step.

## 2026-09-08 — Where the report token is actually visible, and why the obvious pages are empty

Read-only investigation, no gas. **The token is visible, and three separate things were hiding it.**

### Why the pages that looked empty were empty

1. ⚠️ **It is not an HTS token, so the account page structurally cannot show it.**
   `/api/v1/tokens/0.0.10425231` returns **404** — that id is a *contract*, not a token. ATS assets
   are plain ERC-20 on the Hedera EVM. The account's token list does return one HTS token (6
   decimals), which is why the page looks populated and wrong rather than blank.
2. ⚠️ **The proxy is Sourcify-verified, but the verified ABI is `ResolverProxy`'s — 390 bytes, with no
   `balanceOf` and no `Transfer`.** That is why the contract page offers ABI and bytecode and no read
   interface. The asset's functions live on facets reached by `delegatecall`; the proxy's own ABI
   genuinely does not contain them.
3. ⚠️ **`EquityDeployed` is emitted by the FACTORY, not the proxy.** It is log index **95 of 96** in
   the deploy transaction, against `0.0.9213391`. Anyone looking at the proxy for the report hash is
   looking at the wrong contract. And the factory is **not** Sourcify-verified
   (`match: null`), so HashScan has no ABI for it and can only render that log as raw hex.

### Where the `alpha:<hash>` string actually is

Deploy tx `0xe4c1dcb1…3784`, log **95**, contract **0.0.9213391**, topic0
`0xa291f8f4…b739` = `EquityDeployed(address indexed deployer, address equityAddress, …)` — confirmed
against `Factory__factory`'s ABI, not guessed. The string sits in that log's `data` (2,016 bytes) at
**byte offset 1920**, preceded by the ABI length word `0x…046` = 70, which is exactly
`len("alpha:" + 64 hex)`. The 140-hex run
`616c7068613a3234303431…336535` decodes to
`alpha:24041ca282d260d3ad843d197086f595d6a2fab46d4e5aadf3e1c1517bfdd3e5` — **byte-identical** to the
primary key in Neon.

### The mint is a standard ERC-20 Transfer, and it is on the proxy

Issue tx `0x42847985…2ff6`, log **0**, contract **0.0.10425231**:
`Transfer(from=0x0…0, to=0x32838fe9…b152, value=1)`, topic0 `0xddf252ad…b3ef` — which is exactly
`keccak256("Transfer(address,address,uint256)")`, checked. **A transfer from the zero address is a
mint**, so this single log is the on-chain proof of issuance, and it is on the contract everyone was
already looking at. The same transaction also carries ATS's `TransferByPartition`, and grantRole
carries `RoleGranted(operator, account, role=0x5eeaf560…a95f)` = ROLE_ISSUER.

### Numeric balance, from two independent public APIs

`balanceOf(0x32838fe9…)` and `totalSupply()` both return `0x…01` from **Mirror Node
`/api/v1/contracts/call`** and from **Hashio `eth_call`**. Both are POST, so neither is a clickable
link — that is the one thing genuinely not viewable by URL alone.

⚠️ **HashScan could not be checked directly and that is a tooling limit, not a finding.** It is a Vue
SPA that serves its shell with HTTP **404** on every deep route — `/mainnet/contract/0.0.1` 404s too.
So every identifier below was verified against Mirror Node, and HashScan's *rendering* of them was
not verified. Worth knowing before anyone tries to script a check against it.

### The Mirror Node filter quirk that cost ten minutes

`?topic0=…` on `/results/logs` returns **zero** logs on its own. It only works with a **bounded
timestamp range** — `&timestamp=gte:X&timestamp=lte:Y`. Unbounded it silently returns an empty list
rather than an error, which reads exactly like "the event is not there".

## 2026-09-08 — Loop sweep: nine seams nobody owns, and the one that blocks everything

Read-only trace from `scripts/demo/narrate.ts` to a token on Hedera. **Every unit passes its own
proof and the loop does not run unattended.** Ordered by what blocks the most.

**1 · narrate → save is unwired.** `demo/narrate.ts` runs compose → execute → narrate, computes
`reportHash(report)`, renders, prints, exits. It never imports `save`. The `Report` is lost on exit.
Phase 2's pipeline and Unit 5's store were each supposed to meet here and neither owns the join.
**Blocks: the app, tokenization, and Units 13/14/15 — all of which need a persisted body.** ~2 lines,
or better a real generator script.

**2 · the only `save()` caller is a proof script that deliberately corrupts a row.**
`scripts/demo/store.ts` is the *sole* path from a directive to a stored report. Its check 2 flips one
character of `canonical_json` and check 5 restores it — ⚠️ **the restore is inside a `try` whose
`finally` only closes connections**, so a Ctrl-C or crash between the two `UPDATE`s leaves a
corrupted row that `load()` refuses to serve and the report page 500s on. Using it as the de-facto
generator, which is what is happening, runs a corrupt-and-restore cycle on every report.

**3 · `report_tokens` is invisible to the app.** `list()` is `SELECT … FROM reports` with no join and
`app/report/[hash]/page.tsx` imports only `load`. Zero references to `report_tokens` anywhere under
`app/`. **A tokenized report renders identically to an untokenized one**, so the cross-chain
commitment — the thing the Tokenization track is judged on — is invisible on the product surface.
Units 6 and 8 were to meet here; Unit 6 predates the table and Unit 8's brief said "no app changes".
~15 lines. Confirmed live: 2 reports, 1 token, and the page shows no difference.

**4 · `Report.atsTokenAddress` is never populated in any real path.** `execute.ts` sets it `null`,
`canonical()` strips it, `load()` reattaches `null`, and Unit 8 writes `report_tokens` without
touching it. The type has a field designed to carry the token and nothing fills it. Distinct from 3:
that is the *query* linkage, this is the *object* linkage. Needs a decision on which is the source of
truth before both exist and disagree.

**5 · `compose.ts` has no caller outside `scripts/demo/`.** Verified by resolving every relative
import across `src/`, `scripts/` and `app/` into a real graph — a naive path grep undercounts sibling
`./x.js` imports and reported false orphans. The planner is reachable only from four demo scripts, and
no `scripts/ops/` entry runs the pipeline. **This is the structural reason gap 1 exists: the pipeline
has no production entry point at all.** `package.json` exposes `dev/build/start/typecheck` and the
nine smoke tests — nothing that produces a report.

**6 · nothing produces a price for Unit 13.** `quotes.price_tinybars` is `NOT NULL CHECK > 0`; no
constant, config entry or function anywhere in `src/` yields one. The plan says "price in
hand-computed tinybars", so this is a decision not yet taken rather than a broken wire — but it is an
input with no producer, and Units 13/14/15 all sit behind it.

**7 · `HEDERA_SELLER_ID` still resolves empty in Vercel Production.** The deployed 402 carries
`payTo: ""`. Units 12/14 need a real `payTo` off the analyst row. Known, unchanged, still blocking a
truthful Unit 14 proof.

**8 · the analyst-by-Arc-address lookup is inlined in `ats.ts`.** `ANALYSTS.find(a => a.arcAddress
=== report.analyst)` lives at `ats.ts:104`. Units 12 and 13 need the same resolution to get `payTo`.
Not broken — a duplication about to happen. ~5 lines to hoist into `config/analysts.ts`.

**9 · `scripts/demo/skills.ts` is still broken.** Reads `src/agent/skills/balance-overview.md`, which
has been at `skills/unused/` since Phase 2. Confirmed still absent. Not blocking anything.

### The shortest path that exists today

```
npx tsx --env-file=.env scripts/demo/store.ts "<directive>"     # generates, saves, prints the hash
#   ⚠️ hand-copy the 64-char hash from stdout
npx tsx --env-file=.env scripts/ops/tokenize.ts <hash> --confirm
open https://et-honline-2026-alpha-markets.vercel.app/report/<hash>
```

⚠️ **It works, and every joint is a human.** The generator is a test that corrupts a row mid-run, the
hash moves between commands by copy-paste, and the last page does not show the token that step 2 just
minted. **Not executed** — it writes to Neon and spends HBAR, and this task was read-only.

⚠️ **Not gaps, for the record:** the app never generating a report is decision 2, not a seam. `ats.ts`,
`validate.ts`, `evidence.ts` and reconcile's tier 2 are known parked work. `loop.ts`/`tools.ts` are the
`ask.ts` demo surface by decision.

## 2026-09-08 — scripts/ops/report.ts: the pipeline finally has a production entry point

One file, 138 lines. **`npx tsx --env-file=.env scripts/ops/report.ts "<directive>"` → a saved
report, its hash, its public URL, and the tokenize command with the hash already in it.** Gaps 1, 2
and 5 from this morning's loop sweep close together, because they were one gap seen from three sides.

**A promotion, and here is exactly what moved.** From `demo/narrate.ts`: the compose → execute →
narrate sequence, the timing breakdown, and `present()`'s shape — render first, then the digit-guard
warning. From `demo/store.ts`: the `save` call and the fact-count summary. **Left behind:** the four
demo modes and their hand-written `manualPlan`s, the `stability`/`withheld`/`morpho` branches, the
five `must()` assertions — and, the reason this file exists, `demo/store.ts`'s deliberate
one-character corruption of `canonical_json` whose restore sits outside its `finally`. Neither demo
was touched; both still prove what they proved.

⚠️ **No default directive, unlike both demos.** They fall back to a canned Aave directive when given
no argument, which is right for a proof and wrong here: this command writes to the store, and a
default would quietly generate and keep a report nobody asked for.

⚠️ **All four `execute` outcomes are handled and only one of them saves.** `blocked` names the
headline figure that cannot be stood behind; `declined` names why the plan could not run; `budget`
names the limit hit and suggests narrowing the directive. `compose` returning `needs_clarification`
prints the missing pieces and the suggested directives. **Every one of them ends with "Nothing was
saved."** — because a report that does not publish must not be in the store.

⚠️ **A re-save is stated as a fact, not a failure.** `save` returns `inserted: false` when the hash is
already there, and the output says `ALREADY STORED` plus "the same directive at the same block
produced a byte-identical report". The hash is the id; that is the design working.

**A TypeScript finding worth keeping.** The early exits were first routed through one
`async function stop(): Promise<never>`. That does **not** narrow a discriminated union — only a
*synchronous* `never`-returning call is a control-flow terminator, so `ex.draft` and `planned.plan`
all failed to resolve. Fixed by keeping a `problem()` that only prints and repeating
`await close(); process.exit(1)` at each site. The repetition is deliberate and the comment says so.

**Proof, on a real directive** — "Balance overview for Compound v3 on Ethereum — how big is it and
what is being borrowed?":

- Report generated at block 25934484, 6 facts, **saved**, hash
  `ea756902fc433ceae75164e77a4198d9c1e371e7173c5a4d85fa8d868c00fbb7`.
- ⚠️ The digit guard fired — one `typed-digit` violation on `"31%"`, the utilization — and the report
  **printed and saved anyway**, which is DECISIONS.md 2026-09-08 working as written. Enforcement is
  Phase 4's.
- The printed hash **is** the primary key in Neon; reports went 2 → 3.
- The report is live at
  `https://et-honline-2026-alpha-markets.vercel.app/report/ea756902…fbb7` **with no redeploy**, and it
  is on the index. `force-dynamic` earning its keep.
- Timing: compose 7.7s, execute 0.65s, narrate 25.9s — the two model calls are 98% of it.
- The printed tokenize command was checked **without running it** (no chain calls this unit):
  `tokenize.ts` reads `process.argv[2]` as the hash and `--confirm` from argv, the printed form
  matches, `prepare()` would find the report, no token row exists for it, and it would mint ISIN
  `XXEAPDVQTO77`.
- `tsc -p tsconfig.json --noEmit` exits 0.

⚠️ **Not added to `package.json`, deliberately.** Checked first: **zero** of the nine `scripts/ops/`
scripts are in there — `migrate`, `tokenize`, `verify-ats`, `verify-analyst` and the rest are all run
as `npx tsx --env-file=.env scripts/ops/…`. Only the nine smoke tests have entries, and those are
zero-argument. Adding `report` would have made it the odd one out and forced `npm run report --
"directive"` for the argument. The brief said "if that fits how the repo already works"; it does not.

**What this does not close.** Gap 3 stands — the app still does not read `report_tokens`, so the new
report will look identical whether or not it is ever tokenized. The two-command loop is now
generate → tokenize with no hand-copying; making the token visible to a reader is still open.

## 2026-09-08 — The paywall design settles, and the x402 construction is confirmed from node_modules

Design work and package verification, no code. The sweep and `scripts/ops/report.ts` are recorded in
the two entries above; this is the third thing that happened today.

**The paywall shape, settled.** A report is **private by default**. The public page becomes a
preview — directive, analyst, block, hash, coverage counts, fact count, tokenized state — and the
table, the assessment, the facts and the provenance sit behind the gate. A paid read grants **no
durable access**: §5.19 already says *"Just settled an x402 payment (payment-identifier matched) →
Serve once"*, and that is what we build. Re-access by address would need Unit 18's EIP-191 challenge,
which is the declared cut point, and the x402 payer is a Hedera `0.0.x` while an EVM identity is an
address — §5.4 already notes neither derives from the other.

⚠️ **The split needs nothing the `Report` object does not already have.** `render()` returns one
string with no seam in it, but the split is field-level and already exists: `subject.directive`,
`analyst`, `block` and `verdict.coverage` are separate fields from `sections`, `assessment` and
`facts`. Unit 6's page **already** composes its identity panel from fields and then renders the
markdown — the preview is that page minus the `<Markdown>` block. No schema change, no type change.

⚠️ **Gating loses nothing that was ever there.** Nothing public has ever exposed `canonical_json`, and
a hash cannot be recomputed from rendered markdown, so "third-party verifiable" was already false
before the gate. Worth saying plainly rather than discovering it in front of a judge.

### The construction check that reversed a recommendation

A recommendation had been made — on the strength of `docs/research/x402-next-2.25.md`'s summary cell
*"(for hooks)"* — that Unit 14 abandon the plan's `withX402` for `withX402FromHTTPServer`, because the
plain wrapper hands the handler nothing about the payment and so could not write a `purchases` row.
**Reading the installed 2.25.0 reversed it.**

- ⚠️ **`withX402` IS `withX402FromHTTPServer`.** `@x402/next/dist/esm/index.js:452` — `withX402`
  constructs `new x402HTTPResourceServer(server, routes)` and delegates. One code path.
- Both wrappers take the identical handler type, `(request: NextRequest) => Promise<NextResponse<T>>`
  (`index.d.ts:254` and `:204`), and `index.js:415` calls `routeHandler(request)` with the bare
  request. **The handler gets no payment context either way** — that half of the original claim was
  right and changed nothing.
- **Runtime-verified on the prototypes, not read off the types:** `onBeforeVerify`, `onAfterVerify`,
  `onVerifyFailure`, `onBeforeSettle`, `onAfterSettle`, `onSettleFailure`, `onVerifiedPaymentCanceled`
  and `registerExtension` all live on **`x402ResourceServer`** — the object plain `withX402` already
  takes as its third argument. `x402HTTPResourceServer` carries exactly one hook the other lacks:
  `onProtectedRequest`, which runs before payment processing and can return `{grantAccess: true}`.
- Phase 3 is "serve once", so `grantAccess` is not needed. **`withX402` is confirmed correct and the
  plan does not change.**

**Also confirmed while there:** `payTo` accepts `string | DynamicPayTo` where
`DynamicPayTo = (context: HTTPRequestContext) => string | Promise<string>`, so a per-report route can
resolve the *report's own analyst's* `payTo` per DECISIONS 2026-09-08. And the `payment-identifier`
extension is 284 lines with **zero** references to a facilitator and **zero** to any network or chain
— §5.9's "server↔client, no facilitator involvement" is accurate as installed. Its
`extractPaymentIdentifier(paymentPayload)` takes exactly what `AfterSettleHook` hands over.

⚠️ **Two things in the research note the installed package contradicts, not corrected in the file:**
the `"(for hooks)"` cell above, and the whole Next 15 / `--legacy-peer-deps` / `.npmrc` section, which
Unit 1's M2 already superseded — we are on Next 16.3.4, the supported peer, there is no `.npmrc` in
the repo and none is needed. The note's line-number claims about the dist match the installed file,
so it was read against the real 2.25.0; it is reliable on internals and loose in one summary cell.

## 2026-09-08 — `config/pricing.ts`: the price gets a producer, and it is a number already proven

One file, 54 lines. `REPORT_PRICE: AssetAmount = { asset: '0.0.0', amount: '100000' }` — flat per
report, platform-wide. **Seam 6 from the loop sweep closes**; Units 6b, 13, 14 and 15 were all sitting
behind a constant that did not exist.

**The number is not newly chosen, which was the point of picking it.** 100,000 tinybars (0.001 HBAR)
is what SM-05 settled a real payment with on 2026-09-06 and what the probe route advertises. Verified
three ways rather than asserted: the probe's source literal, **the live deployed 402 challenge read
back and base64-decoded** (`amount=100000 asset=0.0.0`), and the new constant — all identical. The
first priced report is priced at a figure already proven end to end through Blocky402.

⚠️ **HBAR, and the file says why so nobody has to re-derive it.** A `"$…"` string does not work:
`defaultMoneyConversion` resolves USD through a `DEFAULT_ASSETS` table with no entry for asset
`0.0.0`, so a dollar price **throws** rather than converting. Testnet prices in HBAR; the mainnet
cutover prices in USDC at the end of Phase 4, moving the token id, this amount, the buyer's
`allowedAssets` entry and the facilitator's advertised asset together (R12). The cost meanwhile — no
USD-legible price, H1.7 forfeited until the cutover — is written into the file rather than implied.

⚠️ **A deliberate break with `src/config/`'s dependency-free property, named in the file.** Every
other config module imports only relative paths; `model.ts` explicitly notes "config depends on
nothing". This one imports `HBAR_ASSET_ID` from `@x402/hedera` rather than restating `'0.0.0'`,
because a restated vendor constant that silently disagrees with the package is precisely the class of
bug this project keeps finding. `AssetAmount` is an `import type` and erases entirely. **Flagged for
Unit 6b to measure rather than guess:** whether pulling `@x402/hedera` in for one string moves the
page's traced size. Unit 1's 10.0 MB came from five heavy imports all referenced at runtime, which is
not this case, so an assumption in either direction would be unfounded.

**A type alignment worth recording, because it is the opposite of an earlier trap.**
`AssetAmount.amount` is typed `string`, and `quotes.price_tinybars` is `BIGINT`, which the `postgres`
driver also returns as a **string**. The two line up with no coercion — where `Report.block` needed a
coercion that had to be confined to one display-only site. Written into the file so nobody "fixes"
either end into a number.

**Flat is a decision, not a placeholder.** Each analyst already has its own `payTo`, so per-analyst
pricing is the obvious extension — a field on the `analysts.ts` row seeded from this constant, the
same shape `MODEL` and `AnalystConfig.model` already have. Noted in the file as additive and not
built. One price ships because one analyst ships.

**Proof.** `tsc -p tsconfig.json --noEmit` exits 0 — which is itself the type proof, since the file
annotates `REPORT_PRICE: AssetAmount` against the installed `@x402/core` type
(`{asset: string; amount: string; extra?}`, read from `node_modules`, not assumed). Additionally
checked at runtime: assignable to `AssetAmount` both bare and as `{price: AssetAmount}` the way a
`RouteConfig` consumes it; `typeof amount === 'string'`; asset equals `HBAR_ASSET_ID`; the amount is
an integer string with no float; and `BigInt(amount) > 0n`, which is the `quotes.price_tinybars`
CHECK constraint it will have to satisfy in Unit 13. No store import, no quotes logic, no route change.

## 2026-09-08 — Phase 3 Unit 6b: the reading surface becomes a marketplace, and the paywall is real

`src/store/tokens.ts` (new), `app/page.tsx` and `app/report/[hash]/page.tsx`. **The report body no
longer leaves the server on the public page**, and `report_tokens` is finally visible to a reader —
seam 3 from the loop sweep closes.

⚠️ **One thing needs a decision before this is committed. See the bundle section at the end.**

**The split needed nothing from `Report` or `render()`, exactly as planned.** `subject.directive`,
`analyst`, `block`, `observedAt` and `verdict.coverage` are separate fields from `sections`,
`assessment` and `facts`, so the preview is the old page composing its identity panel and simply not
calling `render()`. No preview mode was added to `render()` — that would put the paywall inside the
one function whose output a paying buyer receives verbatim.

⚠️ **The body is absent, not hidden, and that is what the proof checks.** Twelve probes against the
served HTML — `24.63B`, `9.96B`, `5.34B`, `Protocol total`, `WETH`, `weETH`, `Utilization`,
`Live data from The Graph`, `<table`, the assessment's opening clause — **all zero**. A CSS-hidden
table would have passed a visual check and failed this one.

**What the preview does carry:** directive, analyst, block, `observedAt`, the full hash, `140` figures
measured, `67` markets read, corroboration and checks counts, the ISIN, the proxy address and a
HashScan link — plus a stated boundary: *0.001 HBAR buys one read*, and a read is not a subscription
and does not transfer the token.

**The index now shows what is for sale.** Four reports, **two tokenized** (`XXCQBDTBC9X2`,
`XX5FVRD1TMD1`) rendering as bold `Tokenized · <ISIN>` against plain `Not tokenized`, with price,
block, created-at and analyst on every row.

⚠️ **`created_at` is not on the report page and could not be.** `load()` returns a `Report`, which
carries `observedAt` but not the row's insert time; that lives only on `list()`. Reaching it would
mean changing `store/reports.ts`, which this unit may not touch. `observedAt` is shown instead and is
arguably the better field — when the figures were true rather than when the row was written. The
index shows created-at. Flagged rather than worked around.

⚠️ **`globals.css` was out of scope, so every class used is one the stylesheet already defines.**
`.paywall`, `.counts`, `.tag`, `.price` and `.subject` were written first and then removed: the
preview is wrapped in `.memo` so the existing `h1`/`p` rules apply, the counts reuse `.identity`, and
the tokenized distinction is carried by `<strong>` and by the words rather than a badge that would
need new CSS. It is presentable; ~15 lines of CSS would make it good.

⚠️ **`app/markdown.tsx` now has no importer.** The preview does not render markdown, and nothing else
does. Deliberately left in place — Unit 14 serves the body and it is the only thing that knows how to
turn `render()`'s output into escaped elements with 140-character cell bounds. Not deleted, and worth
knowing it is currently unreferenced.

**Escaping is unchanged and still holds.** No `dangerouslySetInnerHTML` anywhere in the two pages or
`tokens.ts`; the directive still renders `what&#x27;s inside it`. The directive is bounded at 140
characters **on the index only** — truncating it on the report page would misstate what the report
answers.

**`src/store/tokens.ts`** is read-only; `tokenize/ats.ts` remains the only writer. `tokensFor()` takes
the page's hashes and does **one** query, because `tokenFor` in a loop is fine at two rows and a
page-load problem at fifty. ⚠️ It memoizes **a second connection pool** — `reports.ts` keeps its own
client and does not export it, so the separation the brief required costs a duplicate pool. Acceptable
at this size, noted rather than hidden; the fix is a shared accessor in `db.ts`, not a third copy.

### ⚠️ The bundle measurement moved, and the brief said to stop rather than work around it

| route | before | after | delta |
|---|---|---|---|
| `/` | 1,787,309 B | **4,027,101 B** | **+2,239,792 B (+125%)** |
| `/report/[hash]` | 1,847,372 B | **4,086,923 B** | **+2,239,551 B** |
| `/api/probe` | 10,473,708 B | 10,473,708 B | unchanged |

**It did not tree-shake.** Traced files on `/` went 111 → 222, and the new arrivals are unmistakable:
`@grpc/grpc-js`, `pino`, `sonic-boom`, `thread-stream`, `@pinojs/redact`, `safe-stable-stringify` —
**`@hiero-ledger/sdk`'s transitive dependencies**, pulled in because `config/pricing.ts` imports
`HBAR_ASSET_ID` from `@x402/hedera` and that package hard-pins the SDK. Importing one string constant
costs 2.24 MB. This is the same 2.3 MB Unit 1 measured for the x402/Hedera stack, arriving on a page
that has no business talking to Hedera.

**It is not a limit problem** — 4.0 MB against 250 MB is 1.6%, with 246 MB of headroom. It is a
correctness-of-shape problem: a marketplace listing page now carries a gRPC client and a logging
framework to render the string `0.001`.

**Three ways out, none taken, because this unit may not touch `pricing.ts`:**
1. **Accept it.** Cheapest. Unit 14's route imports `@x402/hedera` anyway, so the cost is real only on
   the two pages, and the headroom is enormous.
2. **Inline `'0.0.0'` in `pricing.ts`.** Pages return to 1.8 MB — but it restates a vendor constant,
   which is the pattern `pricing.ts` explicitly argues against in its own header.
3. **Split the constant:** a dependency-free tinybar amount that the pages import, with the
   `AssetAmount` assembled where `@x402/hedera` is already loaded (Units 13/14). Keeps both properties
   and costs one small change to `pricing.ts`.

**Everything else passes:** `tsc -p tsconfig.json --noEmit` exits 0, `next build` exits 0, route table
unchanged (`ƒ /`, `○ /_not-found`, `ƒ /api/probe`, `ƒ /report/[hash]`), unknown hash still 404s.
**Deployed half not run** — this is uncommitted and deploys come from the repo.

## 2026-09-08 — pricing.ts splits: the pages get a price without a gRPC client

`src/config/pricing.ts` and the two pages that read it. **The 2.24 MB regression Unit 6b measured is
gone** — `/` is back to 1,788,478 B and **111 traced files, Unit 6's exact count**.

**The split.** `REPORT_PRICE_TINYBARS` (a plain string) and `REPORT_PRICE_HBAR` (derived from it) have
no vendor import at runtime and are what a page displays. `reportPrice(asset)` assembles the
`AssetAmount` a challenge needs, taking the asset id **as an argument** from a caller that has
`@x402/hedera` loaded anyway — Units 13 and 14. `AssetAmount` is an `import type` and erases.

⚠️ **The property the original file argued for is kept rather than traded away.** This file still
never writes HBAR's asset id down — checked mechanically, there is no `'0.0.0'` literal in it. The
vendor constant still comes from the vendor; it just arrives through a parameter instead of an import,
at the one call site where the SDK is already paid for.

**How "one price, one place" is guaranteed, rather than asserted.** `REPORT_PRICE_TINYBARS` is the
only literal. `REPORT_PRICE_HBAR` is **derived by division**, not written out. `reportPrice()`
**returns** the same constant rather than restating it. There is no second number in the file that
could drift — verified by counting occurrences of the literal in non-comment source: exactly one.

**Demonstrated, not asserted.** Served both pages, scraped the price React actually shipped (it splits
`{expr} HBAR` with a `<!-- -->` marker, so the scrape targets the expression's own text node), and
compared against a challenge assembled the way Unit 14 will:

```
  single definition   REPORT_PRICE_TINYBARS = 100000
  displayed (derived) REPORT_PRICE_HBAR     = 0.001
  challenge           reportPrice(HBAR)     = {"asset":"0.0.0","amount":"100000"}
  index page ships    0.001        preview page ships  0.001
  ✅ challenge.amount IS the single definition        ✅ converts to what pages display
  ✅ every price on the index is that value           ✅ every price on the preview is that value
  ✅ asset came from @x402/hedera, not restated       ✅ no second numeric literal in the file
```

**Traced sizes, against Unit 6's numbers:**

| route | now | Unit 6 | 6b (regressed) | delta vs Unit 6 | files |
|---|---|---|---|---|---|
| `/` | **1,788,478 B** | 1,787,309 | 4,027,101 | **+1,169** | **111** |
| `/report/[hash]` | **1,848,286 B** | 1,847,372 | 4,086,923 | **+914** | 112 |
| `/api/probe` | 10,473,708 | 10,473,708 | 10,473,708 | 0 | 216 |

The residual ~1 KB is the pages' own new code — the paywall section and the token panel. **Confirmed
absent from `/`'s trace: `@grpc/grpc-js`, `pino`, `sonic-boom`, `thread-stream`, `@pinojs/redact`,
`@hiero-ledger/*` and `@x402/*` — zero files each.**

⚠️ **The header was rewritten, not patched.** It previously argued for importing the vendor constant;
that reasoning is now half-true, so it records what was measured and reverted, why the split exists,
and which half a caller should reach for. The standing rule that the header is part of the diff
applies most when the header is what turned out to be wrong.

**Also removed: a duplication the pages were carrying.** Both computed
`(Number(REPORT_PRICE.amount) / 1e8).toFixed(3)` independently. That formatting now lives once, in
`REPORT_PRICE_HBAR`, which is the same "one place" property applied to display.

**Paywall re-verified after the edits** — the body is still absent from the served HTML on all eight
probes, and the preview still shows the boundary and the ISIN. `tsc -p tsconfig.json --noEmit` exits
0; `next build` exits 0 with the route table unchanged. **Deployed half not run** — uncommitted, and
deploys come from the repo.

## 2026-09-08 — Unit 6b verified in production: the paywall holds on the deployed site

Read-only check against the aliased URL after the 6b deploy (`b0987da`, working tree clean and
matching). **All six checks pass.** One real change from the last production check, and one
false-positive worth recording so nobody re-runs the same bad probe.

### The paywall, probed with each report's own body

⚠️ **Rather than generic probes, this loaded every report from Neon, rendered it with `render()`, and
extracted that report's own figures, table row labels and assessment opening** — then looked for those
strings in its deployed HTML. Generic probes can only fail to find things that were never there.

| report | | probes from its own body | present |
|---|---|---|---|
| `24041ca2…` | TOKENIZED `XXCQBDTBC9X2` | 24 | **0** |
| `c2649f05…` | TOKENIZED `XX5FVRD1TMD1` | 17 | **0** |
| `ea756902…` | no token | 12 | **0** |
| `f2285b4e…` | no token | 24 | **0** |

Probes included `$24.63B`, `$10.00B`, `~87%`, `$581.2M`, `Live data from The Graph`, `<table`,
`table-wrap` and each assessment's opening clause. **Tokenization changes nothing about what is
rendered** — the tokenized and untokenized pages are equally clean, which was worth checking
separately rather than assuming.

⚠️ **One probe reported a hit and it was a false positive — recorded so it is not re-investigated.**
The row-label probe `"Market"` matched on `f2285b4e…`. It appears exactly twice in that page: in
`<title>Alpha Markets</title>` and in the public `Markets read` coverage count. The actual table
header, `Market (asset)`, appears **zero** times. A six-character substring collided with the site's
own name. The lesson is small but real: a probe shorter than the thing it is testing for will find
itself.

### The rest

- **Index** — 4 reports, **2 tokenized** rendering `<strong>Tokenized · XXCQBDTBC9X2</strong>` and
  `XX5FVRD1TMD1` against plain `<span>Not tokenized</span>`, all four links present, `0.001 HBAR` on
  every row plus the masthead.
- **Preview, tokenized** — analyst, block `25930744`, `Observed at 2026-09-08 06:05 UTC`, full hash,
  `140` figures, `67` markets read, `3` corroborated, population `complete`, checks run, plus ISIN,
  proxy `0xE7aaEFB1…` and the HashScan link.
- **Preview, untokenized** — `Not tokenized. The report is published…`, **zero** ISIN or HashScan
  elements, paywall boundary and price still present.
- **404s** — unknown 64-hex hash and a malformed `not-a-hash` both 404.
- **`/api/probe`** — still **402**, `hedera:testnet`, `feePayer 0.0.7162784`, unchanged by this deploy.

### ⚠️ One real change: `payTo` is no longer empty

The deployed challenge now carries **`payTo: '0.0.10387690'`**. At the Unit 6 production check it
carried `payTo: ""` — the empty-env-var trap, open item 7 in the sweep. It is fixed *as observed*.

⚠️ **But from outside, "fixed" and "unset" look identical here.** `app/api/probe/route.ts` reads
`process.env.HEDERA_SELLER_ID ?? '0.0.10387690'` — a hardcoded fallback. An env var that is now set
correctly and one that is now *absent* both produce this output; only an empty-string value produces
the old one. **Unit 12's `payments/server.ts` will have no such fallback**, so the actual Production
value should be confirmed before Unit 14 is demoed rather than inferred from this probe.

### Local vs deployed

**The rendered `<main>` is byte-identical on both pages** — 1,912 bytes on the report page, 2,383 on
the index, local and production. The whole-document difference is **exactly +180 B on both**, and it is
fully accounted for: 18 asset references × 10 characters, production serving
`/_next/static/immutable/chunks/…` where local serves `/_next/static/chunks/…`. Same cause as Unit 6,
cosmetic, no action.

## 2026-09-08 — Phase 3 Unit 12: the x402 resource server, built once and properly

`src/payments/server.ts` (119 lines), `app/api/health/route.ts` (93), plus the analyst lookup hoisted
into `config/analysts.ts` and `ats.ts` switched to it. Units 13, 14 and 15 now have something to sit
behind. The probe route is untouched and still answering — Unit 14 replaces it.

**Three things the probe did that do not survive being a dependency, all fixed.**

⚠️ **1 · R12's atomic switch is now unrepresentable-if-wrong rather than merely discouraged.** The
probe had the facilitator host as a module constant while SM-05 took the network from
`HEDERA_NETWORK`, so `HEDERA_NETWORK=mainnet` would have pointed a **mainnet network string at the
testnet facilitator**. Host, feePayer and asset are now one record keyed by network name, so
selecting a network selects its facilitator and its asset because they are the same object. **Only
measured networks appear** — `mainnet` is deliberately absent rather than guessed, because its
facilitator advertises a feePayer nobody here has read, and a wrong constant is worse than a missing
one. Setting it now fails loudly and names the cutover.

⚠️ **2 · Lazily constructed and memoized, never at module scope.** `initialize()` calls `process.exit`
on a permanent config mismatch; at module scope on Vercel that is a cold-start crash loop on every
gated route that reads like a platform outage. Same shape as `store/reports.ts`'s
`let client = null; const db = () => (client ??= pooled())`. **`initialize()` is not called here** —
`withX402` syncs with the facilitator on first use, and calling it eagerly would move the
`process.exit` risk back into construction.

⚠️ **3 · No fallbacks.** The probe's `process.env.HEDERA_SELLER_ID ?? '0.0.10387690'` is exactly why
Production has been ambiguous since Unit 1. This file has none, and empty is treated as missing.

**Proof — health, live.** `/api/health` → **200**, facilitator `api.testnet.blocky402.com` advertising
`hedera:testnet` across 3 kinds with `feePayerAdvertised 0.0.7162784` matching what we expect. **This
closes R12's outstanding startup assertion**, at health-check time rather than in the request path.

**Proof — the failure path, which is the real one.** With `HEDERA_NETWORK=mainnet`:

```
  /api/health           503   "HEDERA_NETWORK resolves to "hedera:mainnet", which is not configured…
                               Moving to mainnet is R12's atomic cutover … Adding a row here is that
                               decision, not a fix."
  GET /                 200   ← index still lists reports
  GET /report/24041ca2… 200
  GET /api/probe        402
```

**The rest of the app keeps serving while health is red**, which is the whole reason the assertion
lives here.

### ⚠️ HEDERA_SELLER_ID in Production — settled

**It is set, non-empty, and its value is `0.0.10387690`.** Established by deduction rather than a
direct read, because **every variable in this Vercel project is typed `Secret`, so `vercel env pull`
returns `[SENSITIVE]` placeholders** and `vercel env ls` shows names only. The chain:

1. `vercel env ls production` — `HEDERA_SELLER_ID` is **present** in Production and Preview.
2. The deployed probe computes `process.env.HEDERA_SELLER_ID ?? '0.0.10387690'` and currently serves
   `payTo: '0.0.10387690'`.
3. An empty string would have produced `payTo: ""`, because `??` falls back on `undefined` and never
   on `""` — that is the trap, and it is what we saw at the Unit 6 check.
4. Present and not empty means the expression returned **the variable's own value**, so that value is
   `0.0.10387690`.

⚠️ **It coincidentally equals the hardcoded fallback, which is precisely why it looked ambiguous for
eleven units.** Once this health route deploys it reads the variable at runtime with no fallback in
the path and prints the answer directly — the deduction becomes a measurement.

**Also reported by health, gating nothing:** the ATS resolver `0.0.9212226`, `deleted: false`,
expiring `2026-09-10T10:51:29Z` — ⚠️ **1.6 days out.** SM-07 recorded this and `lessons.md` 2026-09-07
established the expiry is inert because Hedera has never enabled contract rent. Unit 10's transfer
still depends on that contract, so it is now on a page rather than in a decision record.

**The hoist.** `analystByArcAddress()` moved from `ats.ts:104` into `config/analysts.ts` before it was
copied — the loop sweep flagged it as a duplication about to happen, and Units 13 and 14 both need it
to find a report's `payTo`. ⚠️ Named for what it actually keys on: the brief called it the
"analyst-by-Hedera-account lookup", but `Report.analyst` holds the **Arc** address, which is the
lookup key; `hederaAccountId` is what comes off the row afterwards. `ats.ts` lost 8 lines and gained 3.

`tsc -p tsconfig.json --noEmit` exits 0; `next build` exits 0 with `/api/health` in the route table.
**Deployed half not run** — uncommitted, and deploys come from the repo.

## 2026-09-08 — Phase 3 Unit 13: quotes freeze what is being sold, and liveness comes from the clock

`src/payments/quotes.ts` (143 lines) and `scripts/demo/quotes.ts` as the proof. **The quotes table
expressed everything this needed** — no schema change, no column added. All assertions pass and the
table is left holding 0 rows.

**This unit decides no price.** `config/pricing.ts` holds it; what happens here is recording that a
specific report was offered at a specific price at a specific moment, so a settlement can be matched
back to what it was for.

### Three decisions the brief asked to be stated

⚠️ **1 · TTL is 90 seconds, under Hedera's ~120-second window, with 30 seconds of headroom.**
Measured, not asserted: the proof reads `expiresAt - createdAt` off the row and checks it against the
window. The headroom is for the buyer — it receives the 402, signs and submits, and *its* transaction
then gets its own validity window on top of this. A quote that outlived the window would surface as a
settlement error, which is the hardest kind to diagnose because nothing about it says "stale quote".

⚠️ **2 · The same report quoted twice REUSES the row. Same id, same price, no second row.** Proved:
`5a39c08a… / 5a39c08a…`, and `exactly one live quote for this report`. The reason is that every
report is publicly linked from the index and **every unpaid request produces a 402** — a row per
unpaid request would let anything that crawls the site grow this table without bound. Reuse also
gives a buyer that retries the same quote id to match a settlement against, which is what §5.9's
payment-identifier path will want. ⚠️ **Reuse is filtered on the price as well as on liveness**, so a
price change stops reusing immediately rather than serving the old figure for up to 90 seconds.

⚠️ **3 · Expiry is a fact about time, never a stored flag.** `state` has an `'expired'` value in the
CHECK constraint and **nothing writes it, deliberately** — nothing sweeps this table, so a stored
`'expired'` would only ever be as fresh as the last sweep that did not run. `state` records
*settlement*; Unit 14 moves a row to `'settled'`. A row that is `'open'` and past its expiry is not a
contradiction, it means the offer lapsed unpaid. The proof makes this visible rather than describing
it: two rows, **both `state="open"`, `isLive` true and false** — the difference is entirely the clock.
A later quote correctly declines to reuse the expired row.

**Other things proved.** An unknown report hash returns `null` **without a foreign-key violation** —
checked explicitly rather than left to the constraint, because a constraint error surfacing out of the
payment path is a 500 where a 404 belongs. The price round-trips as a **string** (`BIGINT` → driver
string → `AssetAmount.amount`), with no coercion at either end.

⚠️ **`quoteAmount(q, asset)` builds from the QUOTE's frozen price, never from the constant** —
otherwise the row would be decoration. The asset arrives as a parameter for the same reason it does
in `pricing.ts`: importing `@x402/hedera` for one string pulled 2.24 MB into two pages on 2026-09-08.
Unit 14 has it loaded already.

⚠️ **No `payTo` in this file.** The table has no such column and it is not this unit's to know — it
belongs on the challenge, which Unit 14 resolves per request through `DynamicPayTo` and
`analystByArcAddress()`.

⚠️ **This is now the THIRD memoized connection pool** — `store/reports.ts`, `store/tokens.ts` and now
this. Each keeps its own client and none exports it, so every module that touches the database opens
another. Three copies is the point where a shared accessor in `db.ts` stops being a nicety. Flagged,
not done: `db.ts` is out of scope for this unit.

**The proof script cleans up in a `finally`**, on the success and failure paths both — `demo/store.ts`
puts its restore *outside* its `finally`, which is the hazard the loop sweep found, and this is the
one place it was cheap not to repeat it.

`tsc -p tsconfig.json --noEmit` exits 0.

## 2026-09-08 — One shared database client: three copies of a pattern collapse into db.ts

`src/store/db.ts` gains `db()` and `closePool()`; `store/reports.ts`, `store/tokens.ts` and
`payments/quotes.ts` drop their own clients and import the shared one. **A move, not a redesign** —
no retry logic, no connection options, no pool tuning, no parameters. `pooled()` and `direct()` are
untouched, `required()` is untouched, and `migrate.ts` still owns the direct URL alone.

**Why now rather than later:** three modules each memoized their own client, so a request touching
all three opened three connections, and Unit 14's gate would have made it four. ⚠️ On Vercel each
invocation is its own process and Neon caps concurrent connections, so four-per-request reaches the
ceiling four times sooner — **and a connection-limit failure presents as a timeout, not as a limit
error.** That is the worst possible failure at the moment the payment path is under load.

**Proof that it is actually one client, observed rather than inferred from the code shape.**
`pooled()` now increments a counter and `pooledClientsCreated()` exposes it; nothing branches on it.

```
  after importing all three modules              clients created: 0
  after reports.list() → 3 rows                  clients created: 1
  after tokens.tokensFor() → 2 tokens            clients created: 1
  after quotes.quote() → quoted                  clients created: 1
  ✅ exactly one pooled client for reports + tokens + quotes
```

⚠️ **The first line is the other half of the proof: zero after importing all three.** Nothing is
constructed at module scope, so a missing `DATABASE_URL` is still a failure at first query rather
than a cold-start crash on every route that transitively imports the store.

⚠️ **`closePool()` had to become idempotent, and that is a consequence of the consolidation rather
than a nicety.** All three modules re-export it as their own `close`, and scripts already import two
of them — `scripts/demo/quotes.ts` closes reports *and* quotes. Before, those were two clients and
two `end()` calls; now they are one client and would have been a double `end()`. The reference is
cleared before awaiting, so the second call is a no-op. Proved by calling `close()` four times across
three modules without throwing.

**Regressions, all re-run.** Unit 5's store proof passes **end to end on a fresh real report** —
140 facts, 70,916 canonical bytes byte-identical, hash matches the key, tamper detection fires and
names both hashes, the row restores, re-save is a no-op, `list()` works. Unit 13's quotes proof passes
with the table left at 0 rows. `/`, `/report/[hash]` and `/api/health` all 200 locally, the index
still shows its tokenized markers, and the paywall still holds — zero occurrences of a known figure.
`tsc -p tsconfig.json --noEmit` exits 0; `next build` exits 0 with the route table unchanged.

⚠️ **A fourth consumer exists that this unit could not touch: `src/tokenize/ats.ts` calls `pooled()`
directly at lines 111 and 244.** Each call constructs a **new** client and neither is ever closed, so
a single `tokenize` run leaks two. It is outside this unit's four files. It is also the least
exposed of the consumers — a deliberate CLI operation, once per report, not a request path — so it is
a tidy-up rather than a risk. Switching those two calls to `db()` is a two-line change whenever a
brief touches that file. `scripts/ops/tokenize.ts:108` does the same thing and is a script, which is
the case `pooled()` stays exported for.

⚠️ **One comment went stale outside the allowed set and was left alone:** `src/payments/server.ts:78`
says "Same shape as `store/reports.ts`'s `let client = null; const db = () => (client ??= pooled())`".
That code now lives in `db.ts`, not `reports.ts`. The pattern it describes is still exactly right;
only the address is wrong. Flagged rather than edited, because `server.ts` is not one of the four.

## 2026-09-08 — Phase 3 Unit 14: the gate. An unpaid request now gets a real 402 naming a real payee

`src/payments/gate.ts` (170 lines) and `app/api/reports/[hash]/route.ts` (34). **The route table now
carries `ƒ /api/reports/[hash]`.** Everything provable without a buyer is proved; the paid path waits
on Unit 15.

**The seam, named before writing.** `gate.ts` owns *selling a report* — payTo, price, the two
settlement hooks and their `purchases` writes, the handler. The route file owns *being a Next route* —
the 404 and the delegation. The cut is that Unit 15's buyer and Unit 17's recover both have to reason
about what `gate.ts` writes, and neither should have to read a route file. ⚠️ 170 lines against a ~110
estimate, and the overage is the hook comments, which are where the §5.8 reasoning lives.

**Plain `withX402`, `authorization` flow, as the plan specifies** — the header records why, so nobody
re-opens it.

### ⚠️ A bug I shipped and caught by decoding a live challenge

`extensions: { ...declarePaymentIdentifierExtension(true) }` **spreads** the declaration, putting
`info` and `schema` at the top level of `extensions`. The correct form keys it by name:
`{ [PAYMENT_IDENTIFIER]: declarePaymentIdentifierExtension(true) }`.

The types accept both — `extensions?: Record<string, unknown>`. The first version produced
`extensions: { info, schema }`, where `appendPaymentIdentifierToExtensions` cannot find the
declaration, so a client would have sent **no payment id**, and `onBeforeSettle` would have aborted
every payment as `unrecordable_payment`. **That would have surfaced in Unit 15 as a buyer that cannot
pay, three files away from the cause.** Caught only by base64-decoding the served challenge and
looking at the keys — reading the types would not have found it.

### Proofs

```
  unpaid GET /api/reports/<hash>   402, body {}
  extensions keys                  ['payment-identifier']   required: true
  network=hedera:testnet  amount=100000  asset=0.0.0
  payTo=0.0.10387690  feePayer=0.0.7162784  maxTimeoutSeconds=120
  unknown hash → 404               garbage hash → 404
```

⚠️ **payTo comes from the analyst row, and this is the test that proves it rather than asserting it.**
The value happens to equal `HEDERA_SELLER_ID`, so a matching value proves nothing. Ran the server with
**`HEDERA_SELLER_ID=0.0.99999999`** — a deliberately wrong value:

```
  gate challenge payTo : 0.0.10387690   ← the analyst row, env ignored
  probe challenge payTo: 0.0.99999999   ← the control: the probe DOES read env, and followed it
```

**This is the field that was empty for eleven units**, and it is now structurally incapable of coming
from a shared variable.

**No report content in the 402.** Probed the whole response — headers *and* body — with 16 strings
taken from that report's own rendered body (`$24.63B`, `$9.96B`, `~40%`, `Protocol total`,
`Live data from The Graph`, the assessment's opening clause): **0 present.** The body is `{}`.

**The challenge carries the quote, not the constant** — `100000 / 0.0.0` from the challenge against
`quoteAmount(quote(hash))`, same quote row.

### Design notes worth carrying to Units 15 and 17

⚠️ **`onBeforeSettle`, not `onAfterVerify`, and the difference matters.** Both run before settle, and
`onAfterVerify` would have handed over an authoritative `payer`. But it fires for requests that then
fail in the handler and never settle — which would write rows with a `native_tx_id` and a null
`settled_at`, and the schema says that combination *is* the ambiguous case `recover.ts` resolves.
Writing them for requests that were never charged would poison exactly the signal Unit 17 depends on.

⚠️ **So `payer` is derived from the signed bytes at insert time** — under `exact` the buyer signs one
negative leg and the facilitator adds the fee afterwards, so the negative entry is the payer —
**and `onAfterSettle` overwrites it with the facilitator's answer.**

⚠️ **If the row cannot be written, settle is ABORTED.** An unrecorded charge is worse than an
uncharged reader: money would move with nothing tying it to a report.

⚠️ **Hooks attach exactly once.** `onBeforeSettle` *appends* to a list and `paymentsServer()` is
memoized, so wrapping per request would have registered them again and written the purchase row once
per prior request. The gated handler is memoized, which pins both.

⚠️ **A cost worth knowing:** resolving `payTo` calls `load()`, so **an unpaid request parses the full
report to find its analyst** — a 70 KB blob and two hash checks on the path a crawler hits. The 404
check uses `quote()` and touches no body, so this is the only body read on the unpaid path. A cheap
`analystFor(hash)` on `store/reports.ts` would remove it; out of scope here.

`delivered_at` stays null: delivery is only true once the response reaches the buyer, which a server
cannot observe, and that gap is what §5.9's retry exists for.

`tsc` exits 0, `next build` exits 0. **The paid path is unproven until Unit 15** — an unpaid 402 is
half a gate, and the probe route stays until the whole thing is proved end to end.

## 2026-09-08 — Phase 3 Unit 15: an agent paid for a report, and the gate served it

`src/payments/buyer.ts` (216 lines) and `scripts/ops/buy.ts` (144). **One real paid request, end to
end, against the deployed gate.** H1.3 is closed and Unit 14's paid path is no longer unproven.

```
HashScan  https://hashscan.io/testnet/transaction/0.0.7162784@1788908586.639187830
```

**The handshake, in full, across a real network:**

```
  gate quoted   100000 tinybars (0.001 HBAR) · asset 0.0.0 · payTo 0.0.10387690 ← the analyst
                feePayer 0.0.7162784 · hedera:testnet · 120s
  signed        native tx 0.0.7162784@1788908586.639187830  ← recorded BEFORE the request went out
                payment id pay_7b11da500ad9410b8e575f65e28e5c85
  paid          settled, payer 0.0.10387696, 0.001 HBAR to 0.0.10387690
```

**The buyer received the report the preview page does not serve** — 2,442 characters of markdown whose
hash matches the one requested, including the market table:

```
| Market (asset) | Deposits (current, gross) | Borrows (current) | Utilization |
| **Protocol total (67 markets)** | $24.63B | $9.96B | ~40% |
| WETH | $5.34B | $4.40B | ~82% |
```

⚠️ **`$24.63B` is the exact figure Unit 6b's paywall proof confirmed was absent from the public HTML.**
The same string, behind the same gate, now delivered because something paid for it. That pair is the
whole product in two lines.

**Money moved, read from the transaction record and not a balance diff** — SM-05 reported unchanged
balances across a settlement that demonstrably succeeded, because the read happened at consensus
finality rather than Mirror Node ingestion:

```
  on-chain result  SUCCESS
  network fee      0.00252987 paid by 0.0.7162784   ← the facilitator, as designed
    0.0.802        +252987      0.0.10387690   +100000   ← the analyst
    0.0.7162784    -252987      0.0.10387696   -100000   ← the buyer
```

**The `purchases` row, and the ordering that matters:**

```
  payment_id    pay_7b11da500ad9410b8e575f65e28e5c85
  report_hash   24041ca2…dd3e5      payer   0.0.10387696
  native_tx_id  0.0.7162784@1788908586.639187830
  created_at    16:03:13            settled_at   16:03:15        delivered_at  null
```

⚠️ **`settled_at` is 2.0 seconds after `created_at`, which is the §5.8 ordering visible in data
rather than asserted in a comment.** The native id was written before settle was called and equals the
transaction that eventually settled — so a settle that had failed would have left a row naming exactly
what to ask Mirror Node about. `payer` is the facilitator's answer, having been derived from the
signed bytes first.

**Two refusals, costing nothing, each naming its own control:**

```
  ✅ price above the per-payment cap   refused by "per-payment-cap"
  ✅ an asset never allowlisted        refused by "asset-not-allowlisted" (0.0.429274, holds 0.0.0)
```

⚠️ **`spendControls: false` appears nowhere.** `@x402/core` ships these on and fail-closed, and HBAR
is not a default asset on `hedera:testnet`, so it is opted in **explicitly with its own atomic cap** —
which keeps the control working rather than disabling it. The error message suggests `false`, and
taking that suggestion turns an autonomous buyer into something that pays whatever it is asked.

⚠️ **The cumulative daily cap is ours, because the library's control is per-payment only.** A
per-payment cap bounds one mistake and does nothing about a thousand. The ledger recorded
`100000 tinybars` spent today with both the pre-send and post-settle entries. It lives in a file under
the OS temp directory — **right for a CLI agent and wrong for a fleet**, and said in the file rather
than implied, because "we had a daily cap" should not be load-bearing without knowing where it lived.

**One check worth keeping: the payment identifier is verified into the payload before spending.** The
gate declares it required and aborts an unrecordable payment, so a buyer whose id failed to survive
`createPaymentPayload` would have paid for a settlement the seller then refused. Checked, not hoped.

**The autonomy claim, stated narrowly:** the buyer decided unattended whether the quoted price was
under its caps and whether the asset was one it holds. That is what "agent" means here. No model
decided to shop.

⚠️ **Mirror Node ingestion is polled before paying**, because the facilitator preflights against
Mirror Node and a first payment after funding lands inside that window — SM-05 was bitten at both ends
of one settlement.

`tsc -p tsconfig.json --noEmit` exits 0. Nothing in `gate.ts`, `server.ts` or `quotes.ts` changed —
the gate was right as built. **The probe route can now be deleted**, since the real route has been
proved end to end; that is a separate change and has not been made here.

## 2026-09-08 — Phase 3 Unit 10: the lifecycle operation, on a token that carries a real report

`src/tokenize/transfer.ts` (192 lines) and `scripts/ops/move-token.ts` (108). **H2.4's third element
is done** — issuance and configuration were Unit 8, and this is at least one lifecycle operation, on
a token whose creation event commits a report a stranger can read at a URL. SM-07 proved the same
move against `FAKE_REPORT_HASH`.

```
  transfer tx  0x3b92dc2f7e0c614084b9d4f2df76743b06102832cd09a253c995690f50ad14c6
  proxy        0x1805A2de801032859780BacE8Ff04a13B68E76D2   ISIN XX5FVRD1TMD1
  from         0x32838fe9… (analyst alpha-1, 0.0.10387690)
  to           0x683ee842… (0.0.10387696)
  HashScan     https://hashscan.io/testnet/contract/0x1805A2de801032859780BacE8Ff04a13B68E76D2
```

⚠️ **Standalone, and NOT caused by a payment.** Own is cut, so a buyer pays to read and no token
moves. H2.4 asks for issuance, configuration and ≥1 lifecycle operation — it does not ask for the
operation to be *caused* by a purchase, and reading it that way was our own addition. **The token
moved is deliberately not the one the buyer bought in Unit 15**, so the video cannot conflate "a
token moved" with "a purchase moved a token".

**Balances asserted from the chain, not eyeballed off a receipt** — SM-07's own finding was that
proxy creation is not issuance and a status-1 receipt is not a balance change:

```
  ✅ sender 1 → 0        ✅ recipient 0 → 1
  re-read afterwards:  analyst holds 0   recipient holds 1
```

**`transfer_tx` written**, and only *after* the balances were asserted — a `transfer_tx` recorded
against a transaction that executed but moved nothing would be a row asserting something that did not
happen.

**The token moved and the report did not**, which is the property worth showing:

```
  ✅ report still readable at its URL (HTTP 200)
  ✅ page still shows this hash, its ISIN and its proxy
  ✅ creation event still commits alpha:<hash>   ← immutable; a transfer cannot alter it
```

⚠️ **Cost: the gas is IDENTICAL to SM-07's and the whole difference is relay price drift.**
406,630 gas both times — byte-for-byte the same work. SM-07 paid 105.0 tinybars/gas, this run 107.0,
so the `+0.00813260 HBAR` is the relay repricing and nothing about the transaction changed. Lifecycle
total is now 7.71195 (Unit 8) + 0.43509 = **8.14704 HBAR against SM-07's measured 8.13891**, $0.0344
for this step.

**Two failures proved before anything was sent**, both with `--confirm` set, which is the part that
matters: a report with no token stops naming the missing row *and the command that would create it*,
and a malformed recipient stops on the address itself.

⚠️ **The recipient is a required argument and was never defaulted.** Picking one would move a real
asset to an address nobody chose. Confirmed with the user before spending, along with which of the
two tokenized reports to move.

⚠️ **`store/tokens.ts`'s header is now stale**: it says "Read-only. `tokenize/ats.ts` is the only
writer", and `transfer.ts` is now a second writer of `report_tokens` (it updates `transfer_tx` through
`db()`, since `tokens.ts` exposes no writer and is out of this unit's scope). One sentence to fix
whenever a brief touches that file.

⚠️ **`ats.ts`'s two leaked `pooled()` clients are still there.** `transfer.ts` does not import
`ats.ts`, so per the brief I did not open it. Still two lines, still waiting for a unit that has
reason to be in the file.

`tsc -p tsconfig.json --noEmit` exits 0.

## 2026-09-08 — Investigation: why the ATS dApp will not display our second report token

Read-only. No transactions, no verification submissions, no code changed. Public APIs only —
Mirror Node testnet and Hashio — because the point was to check the chain rather than re-read our own
scripts' assertions.

**The premise in the question was wrong, and that is the finding.** The dApp fails on
**`0.0.10425387`**, and that entity **does not exist on Hedera**. Not as a contract, not as an
account, not as a token, on none of the three networks:

```
  GET testnet.mirrornode /api/v1/contracts/0.0.10425387    404 Not found
  GET testnet.mirrornode /api/v1/accounts/0.0.10425387     404 Not found
  GET testnet.mirrornode /api/v1/tokens/0.0.10425387       404 Not found
  GET mainnet / previewnet /api/v1/contracts/0.0.10425387  404 / 404
  transactions?account.id=0.0.10425387                     []   (empty)
  eth_getCode 0x…009f142b (its long-zero address)          0x   (no code)
  eth_call    name() at the same address                   0x   (empty return)
```

⚠️ **An `eth_call` that returns `0x` is exactly the shape that produces that error message.** A
decoder handed empty bytes for a `string`/array return yields `undefined`, and the next line reads
`.length` off it. The dApp is not failing on a transferred security — it is failing on an address
where nothing is deployed, and reporting it as a query error rather than "not found". That is a
missing not-found branch in their client, not a limitation about issuer balances.

**Listing the neighbourhood confirms it is not an ingestion lag.** Every contract id between
`0.0.10425200` and `0.0.10425500` is enumerable — eleven of them, created either side of the gap —
and `…387` is not among them.

**Our two report tokens are `0.0.10425231` and `0.0.10426245`**, read from `report_tokens`:

```
  A  0.0.10425231  0xE7aaEFB168F3E87975Fee1B0c932aE42776D8c6c  XXCQBDTBC9X2  report 24041ca2…dd3e5
  B  0.0.10426245  0x1805A2de801032859780BacE8Ff04a13B68E76D2  XX5FVRD1TMD1  report c2649f05…b7535
```

B is the one Unit 10 transferred. Both were read anyway, in full, so the answer holds whichever id
was meant.

### The side-by-side, from chain data

| | A · 0.0.10425231 | B · 0.0.10426245 |
|---|---|---|
| `name` / `symbol` / `decimals` | Alpha Markets Report / ALPHA / 0 | **identical** |
| `totalSupply` | 1 | **1** |
| ISIN (`getERC20Metadata`) | XXCQBDTBC9X2 | XX5FVRD1TMD1 |
| `balanceOf` analyst `0x32838fe9…` | **1** | **0** |
| `balanceOf` buyer `0x683ee842…` | 0 | **1** |
| `getTotalSecurityHolders` | 1 | 1 |
| `getSecurityHolders(0,10)` | `[analyst]` | `[buyer]` |
| DEFAULT_ADMIN members | `[analyst]` | **`[analyst]`** |
| ISSUER members | `[analyst]` | **`[analyst]`** |
| `getRoleCountFor(analyst)` | 2 | **2** |
| `getRoleCountFor(buyer)` | 0 | **0** |
| runtime bytecode | `de8fd26f…` (782 chars) | **byte-identical** |
| init bytecode | `d60a06a5…` (4218 chars) | **byte-identical** |
| Sourcify chain 296 | `exact_match`, matchId 47581803 | ⚠️ **404 — never submitted** |

⚠️ **The analyst did NOT lose its admin role in the transfer, and the buyer never gained one.** The
question assumed the transfer stripped the issuer; it did not. `grantRole`/`revokeRole` appear
nowhere after creation on either token. A transfer of an ATS security moves the balance and nothing
else — the RBAC table is untouched, and the issuer that holds zero units is still DEFAULT_ADMIN and
ISSUER. So the "issuer holds zero **and** has no admin role" story is half true at most, and the half
that is true is only the balance.

**Every zero-argument view on `IAsset` was swept — 72 of them — and 70 return byte-identical values
on both tokens.** The two that differ are `getERC20Metadata` (the ISIN, by design) and
`DOMAIN_SEPARATOR` (which mixes in the contract's own address, so it cannot match). There is no third
difference. Pause state, control list, KYC flag, max supply, partitions, holders count, dividends,
regulation data — all equal.

### The creation events, word by word

Both proxies came out of the same factory `0.0.9213391` (`0xd1f118a4…`) called by the same sender,
same selector `0x837b37b6`, same 62-word calldata length, both `SUCCESS`, both emitting **96 logs**.

```
  differing calldata words: 4 of 62   → word 41 = the ISIN, words 59-61 = "alpha:<report hash>"
  logs identical after normalising the proxy address: 94 of 96
    log[3]   differs in 1 word of 13   → the ISIN
    log[95]  differs in 5 words of 63  → the new proxy address, the ISIN, and the info string
  gas_used   6,714,755 (A)  vs  6,714,420 (B)   ← 335 gas, and it is calldata byte cost:
                                                   the two ISIN/hash strings carry different
                                                   counts of zero bytes. Nothing structural.
```

**Same factory, same resolver, same configuration.** Nothing about how B was created differs from A
except the two values that are *supposed* to differ. Lifetime log counts agree too — A has 100 logs
(95 deploy + 1 grantRole + 4 issue), B has 102, the extra two being the ERC-20 `Transfer` and the
ERC-1400 partition transfer from Unit 10. The transfer itself was a plain `transfer(address,uint256)`
(`0xa9059cbb`), one recipient, amount 1.

### Two things worth recording

⚠️ **B is not verified on Sourcify and A is.** Not a code difference — the runtime bytecode is
byte-identical, so `scripts/ops/verify-ats.ts` would verify B unchanged. Verification is a manual
follow-up: `tokenize.ts` only *prints* the command, and for B nobody ran it. "Contracts verified on
HashScan where applicable" is pass/fail on the Hedera track, so a second tokenized report currently
sits unverified. **Not submitted here — this run was read-only.**

⚠️ **The dApp limitation we set out to confirm was not demonstrated.** We cannot say "the ATS dApp
cannot display a security whose issuer holds zero", because the id that failed is not a security at
all. To find out, the dApp has to be pointed at `0.0.10426245` — the real transferred token — and
that has not been done. If it renders, the whole question dissolves; if it fails there too, then the
limitation is real and this side-by-side is the evidence for what it is reacting to, since holder
identity is the *only* semantic difference between the two.

### Checks

```
  npx tsc -p tsconfig.json --noEmit                     exit 0
  npx tsx --env-file=.env scripts/ops/migrate.ts        PASS, clean no-op
                                                        (001, 002, 003 all re-applied as skips;
                                                         tables: purchases, quotes, report_tokens, reports)
```

## 2026-09-09 — A test console: every operation this build can perform, with a button on it

`app/console/` (6 files, 588 lines incl. CSS) and `app/api/console/` (4 routes, 565 lines).
**Testing stops meaning CLI plus HashScan.** ⚠️ **Throwaway, and it says so on itself** — the page
carries a banner reading *not product, not gated, deleted before submission*, because it exposes
spending operations behind no authentication. `rm -r app/console app/api/console` is the whole
removal.

**The seam, named before writing.** A shell page that imports **no `src/` module at all**, a client
panel split four ways, and one route per operation:

```
  app/console/page.tsx      shell           app/api/console/state/route.ts      GET  reads
  app/console/panel.tsx     wiring          app/api/console/generate/route.ts   POST compose→…→save
  app/console/generate.tsx  stream reader   app/api/console/tokenize/route.ts   POST prepare/tokenize
  app/console/spend.tsx     the 3 spenders  app/api/console/transfer/route.ts   POST prepare/send
  app/console/state.tsx     the tables      app/api/console/buy/route.ts        POST buy
  app/console/terminal.tsx  output pane
```

`/api/health` already existed and gained no wrapper — the console just fetches it.

⚠️ **Nothing is reimplemented.** Every route calls the same function its script calls: `compose` →
`execute` → `narrate` → `validate` → `save`, `ats.prepare`/`tokenize`, `transfer.prepare`/`send`,
`buyer.buy`. The three not-a-report outcomes of `execute` and compose's `clarification` stop the
route exactly as they stop `report.ts`, and nothing is saved on any of them.

⚠️ **The one place raw SQL is used, and why.** `store/tokens.ts` deliberately omits the transaction
hashes ("the tx hashes are ours") and there is **no reader at all for `quotes` or `purchases`**. The
console is the ours-side: it needs `transfer_tx` to answer "has this token ever moved". Writing those
readers would mean modifying `src/`, which the brief forbids, so `/api/console/state` reads those
three tables through the exported `db()` — the same thing `tokenize.ts` and `move-token.ts` already
do. `list()` is used unchanged for reports.

### The confirm step is on the server, and it was proved by trying to walk past it

⚠️ **`{ confirm: true }` is the `--confirm`.** Without it `prepare()` runs, the plan comes back and
nothing is sent. The browser's disabled button is the convenience half; the control is the route.
Four attempts, all with `confirm: true` set, all refused before a single tinybar moved:

```
  ✅ tokenize an already-tokenized report   409  "already tokenized: … holds ISIN XXCQBDTBC9X2 …"
  ✅ transfer a token the analyst holds 0 of 409  "holds 0 of XX5FVRD1TMD1, not 1. It has already
                                                   been transferred — check report_tokens.transfer_tx."
  ✅ transfer to "0xnope"                    409  "not a 20-byte EVM address"
  ✅ tokenize/buy with no confirm            200  mode "dry", spent false

  analyst balance before   107363626397 tinybars
  analyst balance after    107363626397 tinybars   ← byte-identical across all four
```

⚠️ **The arming disarms.** Any change to the target hash, the recipient or the gate URL revokes it, so
a plan drawn for one report is not permission to spend on another.

### Every control driven in a real browser, and what each one cost

Chromium via Playwright against `next dev`, clicking the actual page. ⚠️ Playwright was installed
**into the scratchpad only** — `package.json` and `node_modules` are untouched, no dependency added.

```
  generate   47s   0 HBAR (model tokens only)   "Balance overview for Spark Lend on Ethereum"
                   compose 17.2s · execute 2.4s (11 queries, block 25937957) · narrate 27.1s
                   46 facts · digit guard 2 violations, saved anyway (warns, never blocks)
                   hash 600935014c4c3159f59a1a2b0e73ec85e74ee4aafd2bfa534662395b6d7630ed

  tokenize   19s   7.85965397 HBAR  = $0.6241 at $0.079405/HBAR
                   deployEquity 6,714,606 gas 7.18462842   SM-07 7.04954250  +0.13508592
                   grantRole      179,949 gas 0.19254543   SM-07 0.18894645  +0.00359898
                   issue          450,916 gas 0.48248012   SM-07 0.47346180  +0.00901832
                   proxy 0x954A192aC6b6Db2623De614F183e6BDb2cB8b2c2   ISIN XXCTORZL97X8
                   ✅ EquityDeployed carries alpha:<hash>, byte-identical   ✅ balanceOf == 1   ✅ row written

  transfer    8s   0.43509410 HBAR  = $0.0345
                   406,630 gas — IDENTICAL to Unit 10's and to SM-07's; the +0.00813260 over SM-07
                   is relay price drift and nothing else
                   ✅ sender 1 → 0   ✅ recipient 0 → 1   ✅ transfer_tx written

  buy        10s   0.00100000 HBAR from the BUYER (0.0.10387696), not the analyst
                   network fee 0.00251872 paid by 0.0.7162784, the facilitator, as designed
                   quoted 100000 tinybars · payTo 0.0.10387690 · feePayer 0.0.7162784 · 120s
                   settled 0.0.7162784@1788936023.186244100  payment pay_8e8bb24992eb407896742e255b0069bd

  ─────────  analyst 1073.63626397 → 1065.34151590 HBAR   (−8.29474807, $0.659)
             buyer   −0.00100000 HBAR
```

⚠️ **The purchase returned the table the preview withholds**, and the figure is checkable:

```
  | Market (reserve) | Deposits (USD) | Borrows (USD) |
  | Spark WETH       | $1.27B         | $1.04B        |

  occurrences of "$1.27B" in /report/<hash> — localhost  0
  occurrences of "$1.27B" in /report/<hash> — deployed   0     ← the paywall still holds
  ISIN XXCTORZL97X8 present on both                            ← the public half still public
```

Existing surfaces unchanged: `/` 200, `/report/[hash]` 200, `/api/health` 200, and an unpaid
`GET /api/reports/[hash]` still returns **402** with a `payment-required` header.

### Bundle: the shell strategy worked, measurably

⚠️ **`/console` is the LIGHTEST page in the app** — lighter than `/`, because it imports no `src/`
module and every figure arrives from a route at runtime. It is ~20 KB above the framework floor.

```
  route                          traced   files      vs the brief's baseline
  api/reports/[hash]              4.28M     223      ← the figure to compare against
  ──
  console/page                    1.68M     111      lightest page in the app
  _not-found (framework floor)    1.66M     109      ← /console is +0.02M over an empty page
  page (/)                        1.71M     111
  api/console/state               1.75M     102      store + pricing
  api/console/generate            1.97M     111      + Anthropic SDK and the agent
  api/console/transfer            7.57M     106      + ethers and the ATS contracts package
  api/console/tokenize            7.58M     106      same
  api/console/buy                 9.61M     218      + @x402 → @hiero-ledger/sdk, grpc-js, pino
```

⚠️ **The buy route is 9.61 MB and that is the Unit 6b weight arriving where it belongs.** It is the
same gRPC-client-and-logging-framework tax `config/pricing.ts` was split to keep off the pages — it
is unavoidable for a route that actually signs a Hedera payment, and it is now isolated in the one
route that needs it. Largest new route is 3.8% of the 250 MB limit.

### Two bugs the browser found that curl would not have

⚠️ **The elapsed gutter went blank on the last two lines of every run.** `write` computed the stamp
*inside* the `setLines` updater, and React flushes updaters after the synchronous `finally { end() }`
that zeroes the clock — so `save` and `done` printed with no time. Measured on the first real
generation, fixed by computing the stamp eagerly. Re-verified: 0 unstamped lines.

⚠️ **`reportHash` printed twice, indistinguishably.** The request body and the returned plan share
keys. Request lines now carry a `→` prefix, so "what was sent" and "what came back" are separable —
which was the requirement, and it was silently not met.

### What is not done, and one thing to check before it is

⚠️ **The deployed half is NOT proved. `vercel deploy --prod` returns `Not authorized`** — the CLI on
this machine is not logged in and `vercel login` is interactive. Everything above is localhost, with
the one exception that **the buy crossed the network to the deployed gate** and settled there, so the
deployed app is proved unchanged even though `/console` is not proved on it. To finish: `vercel login`,
then re-run the four controls against the deployment.

⚠️ **`maxDuration = 300` is a Pro-plan number and this must be checked on deploy.** On Hobby the
ceiling is 60s and generation takes ~50s at best — a slightly wider directive would be killed
mid-stream. The route already reports that case honestly (the client detects a stream that ends with
no `done` event and says nothing was saved, because `save()` is last), but a 60s ceiling would make it
the normal outcome rather than the edge one.

⚠️ **`next dev` appended a `<!-- BEGIN:nextjs-agent-rules -->` block to `CLAUDE.md`.** Not our edit;
Next writes it on every `dev` run and re-creates it if removed. Left in place, flagged here so it is
not a mystery in the diff.

⚠️ **The buy route's daily cap is weaker on Vercel than on a CLI.** `buyer.ts` keeps its ledger in a
temp file, and a serverless instance does not keep that file between cold starts — so the cumulative
cap bounds a burst on one warm instance rather than a day. The per-payment cap is unaffected. Not
fixed: fixing it means a `purchases`-backed ledger inside `src/payments/buyer.ts`, which this unit may
not touch. Stated because "we had a daily cap" should not be load-bearing without knowing where it
lived.

`tsc -p tsconfig.json --noEmit` exits 0. `next build` passes. No dependencies added, no existing page
or route changed, nothing in `src/` touched.

## 2026-09-09 — Structural review of the whole repo, read-only, and eight things nobody had recorded

Read-only. No code changed, no transactions, no database writes, no dependencies. A cold session read
`PHASE-3.md`, the tail of `logs.md`, `DECISIONS.md` and `lessons.md`, then every file under `src/`,
`app/` and `scripts/`, and checked the claims against the live deployment and against Sourcify.

**Both checks pass.** `tsc -p tsconfig.json --noEmit` exits 0. `scripts/ops/migrate.ts` is a clean
no-op — 001, 002 and 003 all re-applied as skips, four tables present.

**The structure is sound and the direction is clean.** Nine subsystems under `src/`, no import cycles,
`config/` depends on nothing. The one edge worth naming is `payments/gate.ts` importing `render` from
`agent/narrate.ts` — the paid body is rendered markdown, so the payment layer depends on the pipeline.
`types/`, `domain/`, `store/` and `graph/client.ts` are reusable as they stand, and `tokenize/`'s
prepare/spend split is the pattern Phase 4's chain subsystem should copy.

**Eight findings that were not in any document.** ⚠️ `HEDERA_SELLER_KEY` is EMPTY in Vercel Production
— the empty-env-var trap, fourth instance, live now; the deployed `/api/health` reports it itself. The
gate and buyer do not need it, so the paywall is unaffected, but `ats.prepare()` and
`transfer.prepare()` both read it, so tokenize and transfer cannot run on the deployed site. That is
the real reason the console's deployed half was never proved, not the `vercel login` the last entry
blamed. ⚠️ **The throwaway console is live on production and unauthenticated** — `/console` returns
200, `/api/console/state` returns real rows, and all four controls render; the project is repo-linked,
so the commit deployed it. ⚠️ **Two of the three report tokens are unverified on Sourcify** (404 on
`0x1805A2de…` and `0x954A192a…`, `exact_match` on `0xE7aaEFB1…`), against a pass/fail Hedera
requirement, when `verify-ats.ts` would verify both unchanged in about twenty seconds each.
⚠️ **Nothing anywhere writes `quotes.state`** — every row is `'open'` forever, `isLive()`'s state check
is always true, and `quotes_report_state_idx` indexes a constant — while `quotes.ts:56` and
`PHASE-3.md`'s Unit 13 brief both say Unit 14 moves it to `'settled'`. ⚠️ **`config/pricing.ts`'s
`reportPrice()` is dead**, and its 38-line header exists to justify it: Unit 13 wrote `quoteAmount()`
instead, correctly, because a challenge must advertise the quote's frozen price rather than the
constant. Two units, one problem, one survivor. ⚠️ **A third leaked `pooled()` client** at
`scripts/ops/tokenize.ts:108`, beyond the two known ones in `ats.ts` — the script's `close()` closes
the shared client, not that one, so a fix confined to `ats.ts` leaves it behind. ⚠️ `store/db.ts`'s
`pooledClientsCreated()` and two `settledBalance` re-export lines are dead. ⚠️ The ATS resolver's
expiry is now **0.7 days out** on the live health route.

**The two known stale headers are confirmed, and five more found.** `README.md` still says Phase 3 is
"⬜ not built" and "Nothing is deployed. There is no web app yet"; `docs/ARCHITECTURE.md` says the
same and additionally puts digit-guard enforcement in Phase 3 when it moved to Phase 4.
`scripts/README.md` calls `ask.ts` "the one you actually run" and names five of eleven ops scripts,
missing the production entry point. `PHASE-3.md`'s status table has six rows marked ⬜ for finished
work and still calls Unit 12 "next", while the prose section below it is right — the exact trap that
document's own header warns about. Seam 7 is closed in reality and still listed open:
`HEDERA_SELLER_ID` reads `set → 0.0.10387690` in Production, and `gate.ts` stopped reading env for
`payTo` anyway.

**Duplication that arrived because two units solved one problem:** six copies of the empty-is-missing
env helper (three documents point at `db.ts`'s as the pattern and nobody imports it), four live copies
of `MIRROR`, two of `RESOLVER_ID` while `ats.ts` exports it, three of `hbar()` — that last one for a
real reason, a `string` input `hedera.ts` does not accept, which is one union member rather than two
copies. `TxCost`'s duplication is deliberate and documented at both sites; leave it.

**What Phase 4 will trip over, and the biggest one is not the contract.** `RETENTION_FLOOR = 300` is
about sixty minutes on Ethereum for four of the five live deployments — aave-v3's 439,844 is the
outlier. So settlement **cannot re-read the block the report was written at.** Reading at a fresh
block, reading snapshots, or corroborating against the archive RPC are three different designs with
three different meanings for "the analyst was right", and nothing picks one; `commonBlock` refuses
rather than falling back. That is a decision to take before the market contract is written, not after.
Beyond it: no Solidity infrastructure at all (the only precedent is smoke/08 compiling a source string
in-process, and that script must not be copied — it creates a second Circle wallet without
`CIRCLE_WALLET_ID`); `buyer.ts`'s daily cap lives in a temp file that a serverless cold start
forgets, which is the wrong foundation for an agent staking unattended; and `blockAtTimestamp` — the
primitive a named-date settlement needs — exists in `corroborate.ts` and is wired to nothing.

Reported, not fixed, at the user's instruction. Nothing was edited except this file.

## 2026-09-09 — Nine stale documents corrected, and the README stops saying Phase 3 is not built

Documentation only. **Every change to a `.ts`/`.tsx` file is a comment line** — verified by diffing
with comment lines filtered out, which returns nothing. `tsc -p tsconfig.json --noEmit` exits 0.

**Claims verified against reality before writing them, not taken from the review.** That mattered:
the repo had moved overnight. A fourth report token had been minted (`XXR0WXU28WL2`,
`0xF8c19cE9…`), a third x402 payment had settled at 17:35 UTC, and ⚠️ **`HEDERA_SELLER_KEY` — which
the morning's review found EMPTY in Vercel Production — now reads `set`.** Writing the review's
finding into a document would have shipped a false claim. Live counts at the time of writing: 8
reports, 4 tokenized, 3 transferred, 3 payments settled, `/api/health` `ok: true`.

**The two judge-facing documents.** `README.md` said *"Phase 3 ⬜ not built"* and *"Nothing is
deployed. There is no web app yet."* It now opens with the live URL and the four counts, and carries
a **What is not built** section that names `recover.ts`, `auth.ts`, the two play gaps, all of Phase 4,
⚠️ **the three of four report tokens not verified on Sourcify**, and the internal gaps — the unwritten
`quotes.state`, the leaked clients, the two throwaway surfaces still deployed. It also gained a
**How a report is sold** section with a sequence diagram and the five load-bearing decisions, which is
what H1.4 asks for and what the README had never contained. `docs/ARCHITECTURE.md` gained a second
diagram for the product path and a *what is built / what is not* table.

⚠️ **The README had been UNDERclaiming for eleven units, and that is the safe direction.** Had it
overclaimed — a paid read that did not settle, a token that did not verify — a judge would find it in
one click. That asymmetry is why nothing here was softened: the Sourcify gap, the unauthenticated
console, and the leaked clients are all now stated in the document a judge opens first.

**ARCHITECTURE's README promise: dropped, not fulfilled.** It said *"each subsystem then has its own
README"* and six directories have none. Writing six more four days from a deadline, for code Unit 17
and Phase 4 will change, would manufacture exactly the staleness being corrected — so the sentence is
gone and the *Where to go next* table now names file headers where there is no README. The four that
exist are the Phase 2 subsystems, where reading *order* matters as much as the files.

**Seven more headers fixed beyond the two known ones.** `store/tokens.ts` (read-only claim, and
`transfer.ts` is a second writer) and `payments/server.ts:78` (pointed at `reports.ts` for a pattern
that moved to `db.ts`) were the known pair. Also: `agent/execute.ts` and `agent/loop.ts` both ended
*"there is no persistence layer yet"* — written before Unit 4, and `src/store/` has existed for a day;
`execute.ts` additionally called partial-run resumption *"Phase 3's problem"* when decision 2 removed
it from the phase. `agent/narrate.ts` said the digit rule is enforced by Unit 11; it warns, and
enforcement has now moved twice. `graph/client.ts` restated the superseded *"roughly 500 blocks"*
retention figure that `blockwindow.ts` corrects forty lines away in another file — aave-v3 retains
439,844. `config/pricing.ts`'s header described `reportPrice()` as what Units 13 and 14 call; nothing
calls it, because Unit 13 wrote `quoteAmount()` instead and was right to. `store/db.ts` and
`app/api/probe/route.ts` gained notes saying what is now true of them.

**`quotes.ts`'s `state` comment: rewritten to describe the code, and the gap named rather than fixed.**
It said *"Unit 14 moves a row to `'settled'`"*. Unit 14 does not — `gate.ts` updates `purchases`. The
comment now leads with **nothing writes this column** and spells out the three consequences: a dead
half of `isLive()`, a dead half of `quote()`'s reuse filter, and an index over a constant. ⚠️ **No
behaviour changed** — that is Unit 17's commit, and the comment says so.

**Tracking.** `PHASE-3.md`'s status table had **six rows marked ⬜ for finished work** with Unit 12
still labelled *next*; corrected, with the unplanned console added as row `C` and the deployed-surface
table re-checked live. Six of the nine loop-sweep seams are now closed and marked so; seams 4
(`atsTokenAddress` source of truth) and 9 (`demo/skills.ts` broken) remain, and two new ones were
added from the review. `docs/evidence.md` gained a Phase 3 section — four tokens, three transfers,
three settled payments, with links — kept deliberately separate from Phase 0's fixture-based
evidence, ⚠️ because the Phase 0 ATS token carries `FAKE_REPORT_HASH` and a judge should be shown the
Phase 3 set. `scripts/README.md` stopped calling `ask.ts` *"the one you actually run"* and now lists
all eleven ops scripts with what each spends.

**A lesson, because this is the third occurrence.** The 2026-09-08 entry ended with a checklist naming
four documents to update whenever a unit moves from unbuilt to built. ⚠️ **Two of the four do not
exist for Phase 3** — there is no `PHASE-3-status.md` (the table lives inside `PHASE-3.md`) and no
Phase 3 task board — and a checklist that is half unfindable reads as not applying. A third failure
mode is new: **the status table and the prose disagreed inside one file.** `PHASE-3.md`'s *"Where this
actually stands"* was accurate and is how this session reconstructed events; the table forty lines
above it was a session behind. The prose got updated because writing it was the task; the table did
not because updating it never was.

Nothing committed.

## 2026-09-09 — Every report token verified, and tokenize now verifies instead of printing a command

**All four report tokens are `exact_match` on Sourcify.** Three were 404 at the start of this run and
were verified by the existing script, unchanged, one address at a time:

```
  XXCQBDTBC9X2  0xE7aaEFB1…  exact_match   (was already verified)
  XX5FVRD1TMD1  0x1805A2de…  exact_match   ← verified this run
  XXCTORZL97X8  0x954A192a…  exact_match   ← verified this run
  XXR0WXU28WL2  0xF8c19cE9…  exact_match   ← verified this run
```

Each took about twenty seconds and no gas. `creationMatch` is `null` on all four, which is expected
and documented: the proxy is created by `new ResolverProxy(...)` **inside** the factory's
`deployEquity` call, so there is no top-level creation transaction for Sourcify to fetch. The runtime
match is what makes HashScan render source and decode events. **H2.3 is closed.**

### Where the wiring went, and why not the obvious place

**`scripts/ops/tokenize.ts` calls `verifyAts()` as its final step.** `src/tokenize/ats.ts` was the
obvious home — verify right where you mint — and it is the wrong one:

⚠️ **`ats.ts` runs in two environments and the verifier only works in one.** `scripts/ops/` imports it
from a machine with the full dependency tree; `app/api/console/tokenize/route.ts` imports it into a
Vercel function. Verification needs `solc` and `@openzeppelin/contracts`, both **devDependencies**,
neither present in a deployed function. Putting it in `ats.ts` would either drag a compiler into a
serverless bundle or fail at runtime in exactly one of the two callers — a library that behaves
differently depending on where it is imported. `ats.ts` got a header section recording the decision
and its consequence; no code in it changed.

**`verify-ats.ts` is now a module as well as a script.** `verifyAts()`, `sourcifyStatus()` and the two
link helpers are exported; the CLI is behind an `isMain` guard so importing it parses no argv and
compiles nothing. ⚠️ **The gate did not move and did not change** — same comparison, same bytes, same
place, same diagnostics. The one change is that a refusal **throws `VerificationError`** instead of
`process.exit(1)`, which is exactly the transformation `landOrStop` underwent when it was promoted out
of SM-07 into `src/tokenize/hedera.ts`: a library cannot exit a process that has other work to finish.
The CLI catches and exits, so running the script behaves identically to before — confirmed by
re-running it against an already-verified token and getting the same output and exit 0.

⚠️ **`VerificationError.stage` exists so a caller can tell a wrong-source refusal from a bad afternoon
at Sourcify**, and the two deserve opposite responses. `gate` means the deployed bytecode is not what
this repo compiles — never retry, investigate. `submit`/`confirm` mean the bytes matched and a third
party did not cooperate — retrying later is correct and free. `tokenize.ts` prints different advice
for each, and for `gate` it prints *do not retry and do not change compiler settings*.

### A verification failure cannot throw away a minted token

By the time verification runs, the asset exists, ~7.9 HBAR is spent and the row is written. So the
call is wrapped, reported, and **never rethrown**; the exit code still reflects the tokenization
checks. It also runs *after* the proof and the cost block, so an operator reads the expensive
irreversible part first.

**Tested without spending 7.9 HBAR** by extracting the verify block *verbatim* out of
`scripts/ops/tokenize.ts` at runtime — sliced between two markers, not retyped — and running it
against a stub `result` in the scratchpad:

```
  case 1  a real token          → ✅ exact_match      exit 0
  case 2  a NON-ResolverProxy   → ❌ gate refused,    exit 0   ← the property that matters
                                    "do NOT retry", and the tokenization still passes
```

### The gate still refuses, shown rather than asserted

Pointed at `0xba2d5fc2…` — the live ATS **resolver**, a real contract that is not a ResolverProxy:

```
  compiled runtime  390 bytes
  on-chain runtime  2115 bytes
  STOP  bytecode mismatch. Nothing submitted.
        first difference at byte 8 …
        The difference is in executable code, not the metadata trailer — this is not the
        same contract, or not the same compiler version.
  exit 1 · Sourcify record for it afterwards: still HTTP 404 — nothing was submitted
```

### ⚠️ The console still cannot verify, and that is why `--all` exists

`app/api/console/tokenize` is how tokens get minted now, and it has no compiler and cannot get one.
A token minted from the browser arrives **unverified**. `verify-ats.ts --all` reads `report_tokens`,
skips anything already verified in one GET, and submits the rest:

```
  ── Sweeping 4 token(s) from report_tokens
    ✅ XXCQBDTBC9X2  already exact_match      (×4)
  already verified 4 · newly verified 0 · failed 0
  PASS  every report token is verified on Sourcify.
```

Idempotent and free when there is nothing to do, so it is safe to run after any console session.
⚠️ It is the one path in this file that needs `DATABASE_URL`; the single-address form stays
credential-free, which is the property that lets anyone reproduce a verification without being us.

`tsc -p tsconfig.json --noEmit` exits 0. Three files changed, no dependencies added, nothing about
how a token is minted was touched.

⚠️ **Left undone deliberately, because it is outside this task's file scope:** `README.md`,
`docs/evidence.md`, `tracking/phases/PHASE-3.md` and `scripts/README.md` all still say one of four
tokens is verified. That was true this morning and is false now. Four documents to correct.

## 2026-09-09 — MIRROR consolidated to one definition; the env helper stopped and referred back

**MIRROR is done: one definition, seven importers.** `src/tokenize/hedera.ts` keeps the export and the
four live copies are gone — `app/api/console/buy`, `scripts/ops/buy.ts`, `scripts/ops/verify-analyst.ts`
and `scripts/ops/verify-ats.ts` now import it. `scripts/smoke/` keeps its own, untouched and correct
as it ran.

⚠️ **The objection to leaving it in `hedera.ts` turned out to be moot, and measuring is what settled
it.** The concern was that a caller wanting a URL would have to import a tokenization module. But the
two callers named — `app/api/console/buy` and `scripts/ops/buy.ts` — **already import `fetchJson`
from that exact file**, so the edge existed and was already paid for; the change is strictly a
deletion for them. Of the two that gained a genuinely new import, `verify-analyst.ts` and
`verify-ats.ts` are network-bound CLIs where the **measured 951 ms** of eager `ethers` +
ATS-contracts loading is noise against a 20-second verification or a live Circle round trip. And
`hedera.ts` reads no `process.env` at import time, so `verify-ats.ts`'s stated credential-free
property survives intact — checked rather than assumed.

### ⚠️ The env helper is NOT consolidated, and it is not a judgement call I should have made alone

Two blockers, either of which is the "stop and tell me" condition.

**1 · The six copies are not six copies of one thing.** The guard logic is identical in all six —
`process.env[name]?.trim()`, `if (!value) throw`, error names the variable — verified structurally
and demonstrated live against `pooled()`, `direct()` and `network()` with the variable missing, `""`
and `"   "`. All nine cases throw and name the variable. ⚠️ **But `store/db.ts` differs in its
message**, and it is the copy three documents point at as "the pattern":

```
  five copies   `${name} is not set (or is set to an empty string).`
  db.ts         …the same, plus: 'DATABASE_URL is Neon's POOLED endpoint (host contains
                "-pooler") and DATABASE_URL_DIRECT is the direct one (host does not). They
                are different endpoints and are not interchangeable.'
```

That sentence is the most useful error in the codebase — it is the one that would have saved Unit 4's
first attempt, where both URLs pointed at the pooled host. Consolidating naively either **loses it**
or **imposes Neon advice on `HEDERA_SELLER_KEY`**. It is fixable with an optional `hint` parameter,
and that is a design decision rather than a move.

**2 · There is no permitted home, and every candidate is worse than the duplication.** The scope for
this task is the files holding the duplicates. Taking each in turn:

| candidate | why not |
|---|---|
| `src/store/db.ts` | a store module is the wrong place for a general guard — stated in the brief, and right |
| `src/payments/server.ts` | store and tokenize would then import payments for a string guard |
| `src/tokenize/ats.ts` / `transfer.ts` | both import `src/store/`, so `db.ts` importing back is a **cycle** |
| the two console routes | throwaway, deleted before submission — explicitly ruled out |

**The right home is a new ~14-line module** — `src/config/env.ts`, beside `model.ts` and `pricing.ts`,
which is where `config/` already puts one concern per file and which imports nothing. Creating it
needs permission this task did not grant, so nothing was touched and the question goes back.

⚠️ **Six copies of a guard that has already fired four times in production is a real risk and it is
still open.** Not deferred on the merits — deferred for one file's worth of permission.

### The four stale documents

`README.md`, `docs/evidence.md`, `tracking/phases/PHASE-3.md` and `scripts/README.md` all said one of
four report tokens was verified. All four are `exact_match`; H2.3 is marked **CLOSED** in PHASE-3.md,
the README's *what is not built* list lost the entry entirely, and `evidence.md` and
`scripts/README.md` now carry the `creationMatch: null` explanation and the console-cannot-verify
caveat with the sweep command.

### Proof

```
  tsc -p tsconfig.json --noEmit                 exit 0
  next build                                    exit 0, 12 routes
  ops/verify-analyst.ts (Mirror Node via the imported MIRROR)   PASS
  next start → GET /                            200
               GET /report/<hash>               200
               GET /api/health                  200   ok:true, resolver read via MIRROR
               GET /api/reports/<hash>          402   payTo 0.0.10387690, feePayer 0.0.7162784
```

Nothing committed.

## 2026-09-09 — One env guard: `src/config/env.ts`, and the Neon sentence survives as a hint

`src/config/env.ts` (58 lines, 6 of them code) now holds the only copy of the empty-is-missing guard.
The six local copies — `store/db.ts`, `payments/server.ts`, `tokenize/ats.ts`, `tokenize/transfer.ts`
and the two console routes — are gone, and all nine call sites read exactly as they did, because each
file imports it under the name it already used (`requiredEnv as env`, `requiredEnv as required`).

**The whole guard, and it is the whole point:**

```ts
export function requiredEnv(name: string, hint?: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not set (or is set to an empty string).${hint ? ` ${hint}` : ''}`);
  }
  return value;
}
```

⚠️ **`config/env.ts` imports nothing — not even a type.** That is the property that lets `store/`,
`payments/`, `tokenize/` and two route handlers all import it with no possibility of a cycle, and it
is why every other candidate home failed: `ats.ts` and `transfer.ts` both import `src/store/`, so
`db.ts` importing back would have been one. Keep it importing nothing.

### The hint, and why it is a parameter rather than a special case

`db.ts`'s copy was the one that differed — it appended the Neon POOLED/DIRECT explanation, the
sentence that would have saved Unit 4's first attempt when both connection strings pointed at the
pooled host and the failure read like a bug in the `.sql` file. It now lives in `db.ts` as a
`NEON_ENDPOINTS` constant passed as the hint: **the caller supplies the context, the guard supplies
the mechanism.**

⚠️ **The composed message is byte-identical to the old one** — checked by reconstructing the previous
string from the pre-change source and comparing:

```
  before: "DATABASE_URL is not set (or is set to an empty string). DATABASE_URL is Neon's POOLED …"
  after : "DATABASE_URL is not set (or is set to an empty string). DATABASE_URL is Neon's POOLED …"
  byte-identical: ✅ YES
```

And the boundary holds in the other direction, which is the half that matters:

```
  DATABASE_URL          Neon hint present ✅      HEDERA_SELLER_KEY  hint absent ✅
  DATABASE_URL_DIRECT   Neon hint present ✅      HEDERA_NETWORK     hint absent ✅
                                                  ANTHROPIC_API_KEY  hint absent ✅
                                                  HEDERA_BUYER_KEY   hint absent ✅
```

### Proof

Nine cases — three real entry points × missing, `""`, whitespace-only — all throw and all name the
variable. ⚠️ Whitespace-only is not a contrived case: `"   "` is what a copy-paste into a dashboard
field produces, and `.trim()` is what makes it fail rather than become a connection string.

```
  store/db.ts → pooled()          MISSING · EMPTY "" · WHITESPACE "   "   ✅ ✅ ✅
  store/db.ts → direct()          MISSING · EMPTY "" · WHITESPACE "   "   ✅ ✅ ✅
  payments/server.ts → network()  MISSING · EMPTY "" · WHITESPACE "   "   ✅ ✅ ✅
  9/9 throw and name the variable

  tsc -p tsconfig.json --noEmit                exit 0
  next build                                   exit 0, 12 routes
  ops/verify-analyst.ts                        PASS  (Circle + Mirror Node)
  next start → /  200 · /report/<hash> 200 · /api/health 200 (ok:true) · /api/reports/<hash> 402
               402 names payTo 0.0.10387690, feePayer 0.0.7162784
```

The diff across the six files is nothing but the consolidation: six definitions deleted, six imports
added, one constant hoisted. No call site changed shape.

⚠️ **`scripts/smoke/` keeps its own copies, deliberately.** Those are frozen Phase 0 tests and are
correct as they ran; rewriting a passing test to import a module written after it would make the test
describe today rather than what it proved.

**That closes both consolidations from the review.** MIRROR went to one definition on the previous
run; the env guard is now one definition with five call sites that used to be five copies. The
remaining duplication the review found is the kind that should stay: `RESOLVER_ID` and `hbar()` are
duplicated into console files that get deleted, and `TxCost` is deliberate with the reasoning recorded
at both sites.

Nothing committed.

## 2026-09-09 — Structure assessed and found sound; six subsystem READMEs written

Read-only assessment first, then documentation. **No code moved, renamed or changed.**

### The assessment: the structure is fine, and I am not recommending a reorganisation

`src/`'s nine-way split reads cleanly — `types → domain → graph`/`engine → agent`, with `config` at
the bottom importing nothing and `store`/`tokenize`/`payments` as three peers above. No cycles, every
directory name describes its contents. Four observations, only one of which is worth acting on:

⚠️ **`render()` in `agent/narrate.ts` looks misplaced and is not.** `narrate()` emits `{fact:ID}`
placeholders it *cannot fill*; `render()` fills them. Those are the two halves of one invariant — "no
model ever types a digit" — and separating them would put the halves in different files.
`app/markdown.tsx` already documents itself as parsing the output of that one generator, so the
coupling is deliberate and recorded. **Leave it.**

⚠️ **`app/` genuinely did not read clearly, and that was the real gap.** Eleven authored routes, seven
of them scaffolding, discoverable only by opening files. Fixed by `app/README.md` rather than by
moving anything.

**Minor, reported and not acted on:** `scripts/demo/` holds proofs rather than demonstrations — the
name is slightly off and `scripts/README.md` already says what it is. Its file headers identify
themselves by bare unit number, and the numbers **collide across phases** — "Unit 10's proof" is both
`adapter.ts` (Phase 1) and `narrate.ts` (Phase 2), and there are seven such pairs. The two Phase 3
demos switched to naming the subject instead (*"Proof for `src/tokenize/isin.ts`"*), which is the
better convention and arrived on its own. And `tokenize/hedera.ts` has five consumers outside
`tokenize/`, but they take only `fetchJson` and `MIRROR`; the tokenize-specific machinery stays put.
Neither is worth touching four days out.

### The six READMEs

`src/domain/`, `src/store/`, `src/tokenize/`, `src/payments/`, `src/config/` and `app/`. Every
subsystem now has one; `docs/ARCHITECTURE.md`'s *where to go next* table drops the "the promise is
dropped" paragraph and points at all nine.

Each leads with the one non-obvious thing rather than describing mechanics — `store/` exists because
narration is inside the hash so a report cannot be re-derived; `tokenize/` because the creation event
carries the same 32 bytes Arc will reference; `payments/` because the body must already exist or a
120-second validity window lands on the critical path; `domain/` because one file decides what a
report *is*; `config/` because it is measurements rather than settings, and that is why no rule
tests a protocol by name; `app/` because the whole directory is one line — what is free and what a
payment buys.

⚠️ **Deliberate divergence from the four existing READMEs: no line counts.** The Phase 2 four carry
them (`execute.ts` (392), `client.ts` (300)) and they are exactly the thing that went stale — this
repo has already spent one commit correcting three of those numbers. The new six carry none, and no
function inventories or file tables either. Voice and structure match; the rotting part does not.

### Two errors caught in my own drafts before they shipped

⚠️ **`app/README.md` said "six of the twelve routes are throwaway".** Counted properly: eleven
authored routes, **seven** scaffolding (`/api/probe`, `/console`, five console API routes) and four
product. The twelve in the build output includes the framework's `_not-found`.

⚠️ **It also said "the app never generates a report", which is false** — `/api/console/generate` does
exactly that. Corrected to *no **product** route generates one*, with the console named as the
exception and as one more reason it is not product. That is the precise class of overclaim these
documents were written to avoid.

### Verification

Every factual claim checked against the code rather than the plan: the 28/25 protocol counts and the
single analyst row read from the modules themselves; `dangerouslySetInnerHTML` absent everywhere but
the comments saying so; `quotes.state` and `purchases.delivered_at` confirmed to have no writer;
`recover.ts` and `auth.ts` confirmed absent; `maxSupply: 1n`, `decimals: 0` and the on-chain ISIN
check digit read from source; `config/` confirmed to import nothing from `src/` at runtime.

⚠️ **`app/README.md` sits inside the directory Next scans for routes**, so the build was re-run to
confirm markdown is ignored: 12 routes, unchanged, exit 0. `tsc` exits 0. No code changed.

Nothing committed.

## 2026-09-09 — Five Phase 4 questions investigated; one of them was my own mistake

Read-only. `tracking/phases/PHASE-4-draft.md` is the only new file. No code, no contracts, no chain
calls, no database writes, no dependencies. ⚠️ `smoke/08` was **read, not run**.

### ⚠️ Question 1 was not a problem, and the error was mine

My structural review called the retained window "the structural one Phase 4 will trip over" —
settlement supposedly unable to re-read the block a report was written at. **That was wrong.** Given
the market shape the user supplied — a threshold on a *future* observable, settled by reading that
day's data — settlement never makes a pinned arbitrary-block read. It reads a daily snapshot.

And daily snapshots survive pruning **completely**: SM-03 returned full windows at 6, 12, 18 and 24
months, and aave-v3's oldest row is **2023-01-27, its launch day**. `RETENTION_FLOOR = 300` governs
`commonBlock()` picking one block a *set* can share for a cross-protocol report — a different
operation. PLAN-v4 §12 already records this as answered (U4) and §5.16's primitive table says
snapshots are the balance-metric settlement primitive. **I applied the right constant to the wrong
operation, and the plan had it right two weeks ago.**

⚠️ **Verified from working callers rather than from the schema**, because "nullable therefore
omittable" is exactly the kind of inference this project has been burned by. `client.ts:214` omits the
variable entirely when no block is given, and both existing callers of the snapshots document —
`ops/triage-protocols.ts` and `demo/documents.ts` — pass no block and run against the live gateway.

**Revenue is narrower than "unsettleable" and worse than it looks.** Read from config across the 25
live deployments: `usable` on **3** (aave-v2, compound-v2, compound-v3), `poisoned` on **2**
(aave-v3, spark-lend), `not_tracked` on 1, and **`null` — never swept — on 19**. So it is sound
somewhere, broken on the flagship and its fork, and *unknown* on three quarters of the set.
Recommendation is to restrict market subjects to balance and flow metrics, which measured **0 bad
days across 1,300+** against 38 for revenue on the same rows.

### The other four

**2 · Solidity — OPEN.** No `.sol`, no compile script, no hardhat, no foundry; `solc` and
`@openzeppelin` are devDeps. Two precedents, unequal: `smoke/08` compiles a source *string* inline,
which does not scale; **`verify-ats.ts` is already most of a build step** — it traces an import
closure, compiles with pinned solc, and byte-compares against chain. Recommended layout: sources in
`contracts/` at the root (outside `tsconfig`'s `src`/`scripts` include), one build script reusing that
approach, and **a committed ABI artifact**, because nothing compiled can ship to Vercel. ⚠️ Flagged
the obvious failure mode with it — a generated file that goes stale is the same shape as the verify
command nobody ran, so the build step should check the artifact against the source and fail loudly.

**3 · Signing — SETTLED on mechanism, OPEN on placement.** From the installed SDK, not a note:
`createContractExecutionTransaction` returns `{id, state:'INITIATED'}` and **no transaction hash** —
the hash appears part-way through a polled state machine. SM-08's 4.4s is explicitly *not* evidence a
request can block on it. **Two signing paths, not one:** the analyst is an authenticated API call, the
human is a browser wallet signing directly (Circle appears in SM-09 only as the faucet).
⚠️ The genuinely open part is bigger than it looks: whether staking is unattended decides whether the
job-progression apparatus Phase 3 deliberately removed has to come back.

**4 · The spend ledger — SETTLED, and Phase 4 does not inherit it.** `buyer.ts` caps HBAR spent buying
reports over x402 on Hedera; staking commits USDC to a market through Circle on Arc. Different actor,
different rail, no shared code. It is a real Phase 3 debt and not a Phase 4 blocker. ⚠️ And question 3
decides it — if a human runs the staking CLI, the staking path needs no cumulative cap at all.

**5 · Decimals — SETTLED.** `amount: "2.50"` → `msg.value` `2500000000000000000`; `balanceOf` on the
same holding reads 6-decimal. Exactly 10^12. ⚠️ The worse half: Arc mirrors native transfers as an
ERC-20 `Transfer` from `0xffff…fffe` **at 18 decimals** while the token those logs look like they
belong to reports 6 — an indexer doing the ordinary thing is wrong by a trillion. The conversion
belongs at one boundary, and the four failure sites are ranked in the draft by how bad they are, with
storing `msg.value` as a stake size first because it is on chain and not editable afterwards.

### Shape of the document

Written in PHASE-3.md's voice with every answer marked **SETTLED** or **OPEN**, and every
recommendation carrying its cost and what it gives up. Three decisions are flagged as needing the
user before unit briefs can be written: the contract build layout, whether staking is unattended, and
whether to buy revenue back with a sweep.

Nothing committed.

## 2026-09-09 — Three Phase 4 decisions recorded, all provisional, all dated

Documentation only. `tracking/phases/PHASE-4-draft.md` is the only file changed. No code, no
contracts, no chain calls.

**The draft now has three marks rather than two.** ✅ SETTLED means the evidence decided it and no
judgement was required; 🟡 **DECIDED (provisional), 2026-09-09** means a judgement call; ⬜ OPEN means
nothing has been decided. ⚠️ Every provisional mark is dated and says **what would overturn it**,
because all three were taken *before* Phase 3 testing finished.

**1 · No revenue sweep.** Market subjects are balance and flow metrics only. Nineteen unswept
deployments is a measurement task four days out, and balance and flow already measure 0 bad days
across 1,300+ against revenue's 38 on the same rows. ⚠️ Recorded with the asymmetry that makes it the
right call: adding revenue later is additive — the settlement path does not change, only the set of
legal subjects — while discovering mid-phase that a market was written against a poisoned accumulator
is a settlement dispute.

**2 · `contracts/` at the root, one build script, a committed ABI.** ⚠️ **The ABI requirement is
recorded as a CONSTRAINT ON THE UNIT rather than a note**, which is what was asked for and is the
load-bearing part. The unit is not done until the ABI cannot go stale without something failing
loudly, and the write-up names the precedent: `tokenize.ts` *printed* the verify command and trusted
a person to run it, and three of four tokens sat unverified against a pass/fail requirement. A
committed ABI regenerated from memory is the same shape with a worse blast radius — a stale ABI
decodes the wrong fields against a contract holding real USDC and nothing looks broken. Two
requirements stated: the build writes it, and something refuses when it drifts from `contracts/`.
⚠️ Explicitly not a warning — a check that fails soft is one people learn to scroll past, which is
exactly what happened to the digit guard.

**3 · Staking runs from the CLI, not unattended — and the reasoning is the record.** The Arc
requirement is that the agent spends its *own* USDC autonomously: the decision and the funds are the
agent's. It does not require that no human typed a command. That is the same relationship
`scripts/ops/tokenize.ts` already has — a person runs it and the analyst's account pays — and nobody
reads that as the human doing the spending. What it buys is that Circle's unbounded
`INITIATED → COMPLETE` state machine becomes a script waiting, instead of bringing back the
job-progression apparatus Phase 3 removed by decision and never rebuilt.

⚠️ **Marked as the first decision to revisit, not as settled.** If the requirement is read as *no
human may initiate*, this is wrong and the scheduler returns with it. It is the only one of the three
that is upstream of anything else — 1 and 2 survive being reversed, this one does not.

**The consequence, recorded where the question lives.** Decision 3 closes question 4: a human-run CLI
needs no cumulative cap, because the human is the cap — the same reason `ops/tokenize.ts` has a
solvency floor but no daily limit on the ~7.9 HBAR it spends. So **Phase 4 builds no ledger**, and
`buyer.ts`'s temp-file ledger stays Phase 3 debt that Phase 4 does not inherit. ⚠️ What the durable
version *would* have been is recorded anyway, so it does not have to be re-derived if decision 3 is
reversed — and it is stated that in that case it comes back immediately and is not optional, because
an agent spending unattended against a cap a cold start forgets has no cap.

Question 5's decimals module shape was **not** decided and stays a recommendation; nothing turns on it
until there is a contract to call. The closing section now separates settled-by-evidence from
decided-provisionally, with a table of what would overturn each and the instruction to revisit 3
first.

Nothing committed.

## 2026-09-09 — The console becomes a real test surface, and one control is blocked at the src/ boundary

`app/console/` and `app/api/console/` only. ⚠️ **`src/` untouched, and every product file untouched** —
confirmed with `git status` against `src/`, `app/page.tsx`, `app/report/`, `app/markdown.tsx`,
`app/globals.css` and `app/layout.tsx`. `tsc` exits 0 on both configs; `next build` passes.

### ⚠️ BLOCKED — transfer cannot go both ways without changing `src/`

**The requirement cannot be met from the console, and this is the module-boundary finding.**
`src/tokenize/transfer.ts::prepare()` takes `(reportHash, to)` — **the signer is not a parameter.**
It builds the wallet from `HEDERA_SELLER_KEY` itself and then *actively refuses* any signer that is
not the analyst:

```ts
const wallet = new ethers.Wallet(`0x${env('HEDERA_SELLER_KEY')…}`, provider);
if (wallet.address.toLowerCase() !== analyst.hederaEvmAddress.toLowerCase()) throw …
```

Asking for buyer → analyst does not fail with "wrong signer". It fails with something better, which
is what makes the shape unmistakable:

```
  POST /api/console/transfer  { reportHash: <a token the BUYER holds>, to: <analyst evm> }
  → { "stop": "the recipient is the sender. A transfer to yourself demonstrates nothing." }
```

⚠️ **`prepare()` cannot even represent the question.** The signer is always the analyst, so a request
to send *to* the analyst reads as a self-transfer. The function has no way to express "the buyer
sends".

**Two routes around it, both refused.** Editing `src/tokenize/transfer.ts` to take a signer is out of
scope. Building the plan in the console and calling the exported `send()` would mean the console
owning the preflight for a **spending** operation — chain-id check, key/holder match, self-transfer
check, balance assertion — which is exactly the safety logic `prepare()` exists to hold, and it would
contradict this console's own rule that nothing is reimplemented. ⚠️ There is also a data problem
underneath: `send()` writes `report_tokens.transfer_tx` unconditionally, so a return trip would
**overwrite the outbound hash** and lose the record of the first move. A `from` parameter alone would
not fix that.

⚠️ **The consequence is visible right now: three of the four report tokens are held by the buyer and
cannot come back.** The holdings panel shows it.

**Not spent, and deliberately.** A one-way analyst → buyer transfer would cost 0.43 HBAR to re-prove
a path three transactions already prove, and the return leg — the half that is actually untested — is
the impossible one. The Plan step was exercised in both directions instead, which costs nothing and
is what produced the evidence above. The control says the limitation on itself rather than hiding it.

### Both bugs fixed

⚠️ **Plan accepted a bad gate.** It validated the URL's *shape* and nothing else, so a Gate pointing
at an origin with no such report planned cleanly and failed on the spend — after the operator had
been told the plan was good. Plan now makes the same unpaid `fetch` that `buy()` makes first, which
costs nothing and answers the only question it could not:

```
  good gate  → gateStatus 402 · quoted 100000 tinybars (0.00100000 HBAR)
               payTo 0.0.10387690 · feePayer 0.0.7162784 · withinPerPaymentCap true
  bad hash   → STOP "the gate answered 404 for this report … either the hash is wrong or that
               origin is a different deployment with a different store."
```

It also decodes the live challenge, so the plan now shows the **real** price and payee rather than an
assumed one.

⚠️ **The purchased body was discarded.** `buy` received the markdown, printed four table lines and
dropped the rest — the one artefact the payment existed to buy was the thing you could not look at.
There is now a document pane, and it renders with **`app/markdown.tsx`, the product's own renderer**,
not a second one: that component is the escaping boundary for indexer-supplied market names, and a
console with its own parser would be testing itself.

### Added

**Signing as** — the two accounts, both address forms, HBAR balances, and which env key signs for
each. ⚠️ There is no wallet connection anywhere in this build and a page of spend buttons implies
one; the panel says so first. Clicking an EVM address fills the transfer recipient, so it is picked
rather than typed.

**Holdings** — `balanceOf` per token per account, read from the chain, with the database's opinion
beside it. `transfer_tx` records what we last sent; `balanceOf` records what is. All four agree today
and the panel highlights a row where they would not.

**The console door** — any report's body read straight from the store, unpaid, labelled as what it
is. ⚠️ It exists because there is **no identity system**: a purchase is served once and
`payments/auth.ts` is the declared cut point, so a paid report cannot be re-read. Fine in a surface
deleted before submission; not fine in `app/report/`. **The gate is unchanged** and the proof is the
paywall probe below.

**Session state** — the reports table already read Neon, so nothing was lost on refresh; what was
missing was the addresses and transactions. Proxy addresses and a linked transfer transaction are now
in the table, and no browser storage is involved.

### Looks

Light theme, **scoped so the product pages cannot move**. The palette is redefined on `main.console`
rather than `:root` — custom properties inherit, so the console goes light while `:root` keeps
globals.css's dual-scheme support for the marketplace and the preview. The one thing outside `main`
is the page background, reached with `body:has(main.console)`. The built console stylesheet contains
**no `:root` rule and no `prefers-color-scheme: dark`**; globals.css keeps both.

The left column gained density and input affordance: labels at weight rather than muted, sunken
wells with a real border and inset shadow so an input reads as enterable, hover and focus states, and
a `.hint` line under a field. Structure unchanged. ⚠️ The **Gate** field was mislabelled — it wants an
**origin** and read like it wanted a report URL. It is now "Gate origin — scheme and host only, no
path" with an example and a note that the route appends the path itself.

### Proof

```
  bad gate fails at Plan                     ✅ 404 → STOP, nothing sent
  good gate Plan decodes the live challenge  ✅ price/payTo/feePayer/cap shown
  purchased body renders                     ✅ document pane, product renderer
  holdings from chain                        ✅ analyst 1 · buyer 3 · all agree with the DB
  unpaid read works                          ✅ 2,062 chars, 46 facts, figure $1.27B
  paywall still holds                        ✅ "$1.27B" occurs 0× on /report/<hash>, local AND
                                                deployed; unpaid GET /api/reports/<hash> → 402
  product pages unchanged                    ✅ text-identical to the deployed pre-change build,
                                                both / and /report/<hash>
  /console traced size                       1.69 MB vs 1.68 MB baseline (+0.01, not material)
  api/console/accounts                       7.57 MB — ethers, isolated in its own route so
                                                /api/console/state stays a 1.75 MB database read
  tsc (root + app) · next build              exit 0
```

Nothing committed.

## 2026-09-09 — Transfer works both ways, and a token's movements become a history

`src/tokenize/transfer.ts`, one new migration, and the console's transfer control. ⚠️ `ats.ts`, the
gate, the store's report functions, `config/analysts.ts`, migrations 001–003 and every product page
are untouched — confirmed with `git status`. `tsc` exits 0 on both configs; `next build` passes.

### ⚠️ `config/analysts.ts` did NOT need changing, and that is worth saying

The brief asked to stop if the signer change wanted something in that file. It does not. The buyer is
**not an analyst** — it publishes nothing, has no Arc address, and `scripts/ops/verify-analyst.ts`
asserts every row in that file against the live Circle API, which a buyer row would fail. Its identity
is `HEDERA_BUYER_ID` / `HEDERA_BUYER_KEY`, and its EVM address is **read from Mirror Node** — the
account's own answer about itself, the same provenance `analysts.ts` records for `hederaEvmAddress`.

### A role, not a key

`prepare(reportHash, to, signer: 'analyst' | 'buyer' = 'analyst')`. ⚠️ **The caller names a role and
`src/` looks up the key.** A private key as an argument would let any caller sign as anything, put
the key in logs and stack traces, and delete the check that makes one shared key safe. The default
keeps `scripts/ops/move-token.ts` — out of scope to edit — behaving exactly as before.

⚠️ **`ats.ts:132`'s guarantee is kept and generalised**, against a different source of truth per role:
the analyst against `config/analysts.ts` (already checked live), the buyer against Mirror Node. Either
way a key that does not derive the account it claims to be is refused before anything is sent. The
analyst path additionally cross-checks config against Mirror Node, which costs nothing on a request
that was already being made.

### `transfer_tx` was the real bug

⚠️ **`send()` overwrote the column, so a return trip would have erased the outbound hash** and left
the row claiming a single transfer in whatever direction the token last went. `004_token_transfers.sql`
adds a child table — one row per hop, `seq` for order (two hops in one second are possible and a
timestamp would not separate them), `tx_hash` UNIQUE so a re-record after a retry is a no-op rather
than a second claim about one event.

Rejected: a jsonb array on `report_tokens` (every append is a read-modify-write on a column two other
readers use, and a concurrent second transfer silently drops one) and a wider column (answers "twice",
not "n times"). ⚠️ **The column is kept and still written**, narrowed from *the* transfer to *the most
recent* one, because `move-token.ts` and `/api/console/state` read it and are out of scope.

⚠️ **The backfill leaves direction NULL rather than guessing.** It is *inferable* — `prepare()` could
only sign as the analyst until today — but the recipient was an argument and was never stored, and a
row with an inferred sender would look authoritative about a fact nobody recorded. The `note` says
what the row is and what it lacks; the hash, which is the real part, survives.

### Proof

```
  migration run twice                    ✅ second run: "relation token_transfers already exists,
                                            skipping" — clean no-op, 5 tables
  three pre-existing hashes              ✅ all three survive, verified after both new transfers

  signer that does not hold the token    ✅ STOP before sending:
     "the analyst (0.0.10387690, 0x32838fe9…) holds 0 of XXR0WXU28WL2, not 1. It does not hold
      this token — check token_transfers for where it went, and sign as whichever account holds it."

  buyer → analyst   0xd878020ead594000…   ✅ sender 1 → 0   ✅ recipient 0 → 1
     gas 386,741   0.42154769 HBAR   vs Unit 10's 0.43509410 → −0.01354641   ($0.0329)
     buyer  1098.76616172 → 1098.34461403

  analyst → buyer   0xaf47b89c0388e60a…   ✅ sender 1 → 0   ✅ recipient 0 → 1
     gas 386,741   0.42154769 HBAR   vs Unit 10's 0.43509410 → −0.01354641   ($0.0329)
     analyst 1056.89430460 → 1056.47275691

  both hops recorded and readable        ✅ token 348482a5… now has THREE hops:
     seq 3  0x3f283d64…  backfilled (direction not recorded)
     seq 7  0xd878020e…  buyer    0x683eE842… → 0x32838fe9…
     seq 8  0xaf47b89c…  analyst  0x32838fe9… → 0x683ee842…

  holdings after the round trip          ✅ chain and database agree on all four tokens
  tsc (root + app) · next build          exit 0
```

⚠️ **Both transfers cost 0.42154769 — identical to each other and 0.0135 HBAR UNDER Unit 10's
measurement.** Gas was 386,741 against Unit 10's 406,630: **19,889 gas less, and the same both ways.**
Unit 10 moved a token to an address that had never held one; both hops here moved it to an account
that had held it before, so the recipient's holder slot already existed. The saving is a warm storage
write, not a pricing change — and it is the same in both directions, which is what says it is
structural rather than drift. Total spent: **0.84309538 HBAR**, under the ~0.87 estimated.

⚠️ **`seq` has gaps** (3 → 7 → 8). `BIGSERIAL` consumes values on the `ON CONFLICT DO NOTHING`
attempts made by repeated migration runs. Gaps are normal for a sequence and ordering is unaffected —
`seq` is an ordering, not a count.

### The console

The transfer control takes a signer role, and the **Signing as** panel drives both ends: each account
offers *send from* (sets the signing role) and *send to* (fills the recipient), with the signing
account flagged. The stale "the analyst always signs" note is gone. The route reports the full
history after a move and asserts that earlier hops survived, so the overwrite bug cannot come back
unnoticed. ⚠️ The gas-payer balance now reads the **signer's** account, not the analyst's — with the
buyer signing, the analyst's balance would not have moved and the cost line would have read zero.

Nothing committed.

## 2026-09-09 — Buy-and-read on the product page, and an inventory of who holds what

`app/report/[hash]/page.tsx`, a client component beside it, `app/holdings/` and `app/api/holdings/`.
⚠️ **`src/` untouched, the console untouched, the marketplace index untouched** — confirmed with
`git status`. `tsc` exits 0 on both configs; `next build` passes.

⚠️ **One file outside the named list: `app/globals.css`.** The brief said to match the product pages,
which are dual-scheme through that file, and the new controls needed rules. Everything appended is a
**new selector or a new custom property** — nothing above the added block is modified — and the proof
is that the marketplace index still renders text-identical to the deployed build. Flagged because it
was a scope call rather than an instruction.

### An agent pays, and the page says so

⚠️ **The copy does not let a visitor think they paid.** Above the button: *"An agent pays, not you.
This asks the server to run our buyer agent, which pays from its own Hedera account. No wallet is
connected and you are not charged."* After settlement it names the accounts —
`0.0.10387696 paid 0.00100000 HBAR to 0.0.10387690` — and says the facilitator covered the network
fee. x402 ships no Hedera browser paywall, so a human completing one of these here is not a thing
that can be built; the agent is the buyer this service is for, and the page states that rather than
implying a missing feature.

⚠️ **The interface admits it cannot remember.** Both before and after the purchase: *"There is no
sign-in, so nothing here can know you bought it — refreshing loses the report below, and buying again
pays again."* An interface that looked like it remembered and did not would be worse than one that
says it does not.

### One buyer path — and a consequence worth naming

The control calls **`/api/console/buy`**, the route the console already uses. A second buyer path
could disagree with the first about caps, about what lands in `purchases`, and about what counts as
settled.

⚠️ **That makes a console route load-bearing for the product, so the console's own removal note is now
wrong about it.** Every console file says `rm -r app/console app/api/console` is the whole removal;
after this change that deletes the product's buy button. Either the buy route moves out of
`app/api/console/` before submission, or the removal is not both directories. **Recorded, not fixed —
it is a decision about what ships.**

### The paywall still holds

The server component renders the preview and the public counts; the body exists only in the JSON
returned to the button's own request and lives in component state. Nothing is rendered-then-hidden
and nothing is inlined into the RSC payload.

```
  unpaid HTML (12,513 bytes) — occurrences:
    $1.27B  0     $1.04B  0     $759.2M  0     "Spark WETH"  0     "Market (reserve)"  0
```

### Proved in a real browser

⚠️ **An actual Chromium, not a curl.** No new dependency: a Playwright browser was already cached at
`~/.cache/ms-playwright`, and Node 22 has global `fetch` and `WebSocket`, so the DevTools Protocol was
driven directly from a scratchpad script.

```
  buy button          "Have the agent buy this report — 0.001 HBAR"
  $1.27B in the DOM   before the click: 0   →   after: 2
  settled line        buyer 0.0.10387696 paid 0.00100000 HBAR to 0.0.10387690, x402/Hedera testnet
                      network fee 0.00259648 HBAR covered by facilitator 0.0.7162784, not the buyer
  table rendered      Market (reserve) | Deposits (USD) | Borrows (USD)
                      Spark WETH  $1.27B  $1.04B
```

### ⚠️ FINDING — buying the same report twice charges twice

Asked for, and deliberately **not fixed**:

```
  first  pay_21cfb40e17094af3898bb3dcc799dbdd   settled 21:18:31   0.001 HBAR
  second pay_059f6d9b0e0e415b88548e673b53abce   settled 21:18:48   0.001 HBAR
  same report, same body (2,062 chars), two separate settlements
```

**Why.** There is no identity system, so the server cannot know the same visitor is asking again.
Every request mints a fresh payment identifier and takes a live quote, and §5.19 is "serve once" —
nothing anywhere keys *this payer already has this report*. The `purchases` table records both, so
the double charge is visible after the fact and not silent. Closing it needs either the
payment-identifier response cache (Unit 17) or address proof (Unit 18) — one unbuilt, one the
declared cut point.

### The inventory

`/holdings` lists each account's tokenized reports. ⚠️ **A product route, not the console's** —
`/api/console/accounts` returns the same balances but also reports **which environment keys are set**,
which is a fine reading on a throwaway surface and a configuration disclosure on a public one. It also
airs where the database and the chain disagree, which a product page has no business doing. Same
measurement, different audience.

`balanceOf` on chain is the authority, and a third bucket — **held elsewhere** — exists because a token
sent to an address neither account controls is a real state the `transfer_tx` column cannot express.

```
  analyst 0.0.10387690  XXCQBDTBC9X2
  buyer   0.0.10387696  XXR0WXU28WL2 · XXCTORZL97X8 · XX5FVRD1TMD1
  all four /report/<hash> links → 200 · /holdings → 200 · matches the chain read exactly
```

### Weight

⚠️ **The 9.6 MB stayed in the route.**

```
  /report/[hash]     1.76 → 1.77 MB   (+0.01 — the client component, nothing that pays)
  api/console/buy    9.60 → 9.60 MB   unchanged
  /holdings          1.67 MB          a shell; no src/ import, no chain client
  api/holdings       7.57 MB          ethers, where the reading happens
  /console           1.69 MB          unchanged
```

Marketplace index text-identical to the deployed build; the console still renders its panels and its
scoped light palette still wins over the new `:root` tokens.

### Cost of this run

Two reads at 0.00100000 HBAR = **0.00200000 HBAR from the buyer**. The 0.00259648 HBAR network fee on
each was paid by the facilitator `0.0.7162784`, which is the point of the pattern.

⚠️ **One thing to be aware of and not fixed here: this is an unauthenticated public button that
spends.** Anyone who can reach a report page can make the buyer agent pay. `buyer.ts`'s per-payment
cap is the only bound, and its cumulative cap is a temp file a serverless cold start forgets. Fine on
testnet at 0.001 HBAR; it is not a thing to point at mainnet.

Nothing committed.

## 2026-09-09 — What a generation timeout looks like: the plan is Hobby, and the 240s budget is unreachable

Read-only investigation. No code changed, no generation run, no chain calls, no writes.

### ⚠️ 1 · The plan is **hobby**, and it is not a guess

The Vercel CLI turned out to be authenticated (`dhrupat3l-4967`) — an earlier log said it was not, and
that was stale. A read-only `GET /v2/teams` returns:

```
  team: alpha-markets   billing.plan = hobby
```

**So the ceiling is 60 seconds, and `export const maxDuration = 300` on four console routes is
clamped to it.** No project-level duration override exists (`v9/projects` has no duration key), the
build does not warn, and the deployment is READY — Vercel **accepts the 300 and silently caps it**.
Every comment in this repo reasoning about a 300-second ceiling is reasoning about a number this
project does not have.

⚠️ **And the tightest ceiling is on a route nobody set one for.** Only the four spending console
routes declare `maxDuration`. `api/reports/[hash]` — the paid read — declares none, so it takes the
platform default, which on Hobby is 10 seconds. Worth checking against a real settle; not measured
here.

### 2 · The budget is wired, and it is not the thing that saves you

`execute(state, budget: Budget = DEFAULT_BUDGET)` — the default applies to **every** caller, and none
of them pass one, so 240,000 ms is live on both the console route and `scripts/ops/report.ts`. Wired.

⚠️ **But it only covers `execute`, which is the cheap stage.** Measured, twice:

```
  compose 7.7s   execute 0.65s (2 queries)    narrate 25.9s   → 34.3s
  compose 17.2s  execute 2.4s  (11 queries)   narrate 27.1s   → 46.7s
```

**The two model calls are ~98% of a run and neither has any budget, wall clock or timeout.** The
240,000 ms guard is around the one stage that finishes in seconds.

⚠️ **Three gaps inside `execute` itself**, from reading the loop: the wall-clock check fires only at
the *top of each deployment iteration*, so one iteration — a balance sheet, up to 10 pagination pages,
and `corroborate(slug, 3)` — can overshoot without a check; `commonBlock()` runs *before* the loop and
is unchecked, and can run **twice** when the furthest-behind deployment is dropped; and there is **no
check after the loop** for the engine phase.

### 3 · What a wide directive actually costs — and it is not the data layer

Per-query cost derived from the two runs is ~0.2–0.4 s, so even the 100-query cap is ~20–40 s of
fetching. The expensive read is corroboration: `corroborate(slug, 3)` samples three markets and each
one runs `blockAtTimestamp`, a **binary search over a ≤1,400-block window** — about 11
`eth_getBlockByNumber` calls — plus an `eth_call`. **≈39 RPC round trips per deployment.** Across 25
deployments that is ~975 RPC calls, and it is the only path that could plausibly reach 240 s.

⚠️ **The real risk is the narrator, and it is measured.** `narrate` runs with `max_tokens: 24000` and
is streamed only because the SDK refuses a non-streaming request that large; `finalMessage()` waits
for all of it and there is no timeout. Its own header records that **degeneration has already
happened**: five narrations of one 140-fact draft at `max_tokens: 16000` produced **zero** usable
reports and three of them exhausted the budget.

The arithmetic from measurement: a good narration emitted roughly 2,600 characters in ~26 s. A run
that degenerates and keeps emitting crosses **60 seconds at very roughly 2,000 output tokens — about
8% of the 24,000 it is allowed**. It never approaches the 240,000 ms execute budget, because the
budget is not around it.

**The directive shape that does it** is market-level breadth, not deployment breadth. `execute.ts`
notes a deployment with 1,700 markets puts **3,400 facts** in the narrator's prompt, and morpho-blue
has 1,759 markets. A ranking across 25 deployments reads balance-sheet only and is cheap; *"list every
market of morpho-blue with deposits and borrows"* is the one that makes the prompt enormous.

### 4 · What the client sees — this part is good

Read from `app/console/generate.tsx`. The reader tracks `sawDone`, and a stream that ends without the
terminal event produces a red line:

> the stream ended without a `done` event — the function was killed or the connection dropped.
> Nothing was saved: save() is the last step, so the model tokens are spent and no report exists.

⚠️ **It does not hang and it does not look finished.** Both failure shapes are covered: a killed
socket that ends the reader falls through to the `sawDone` check, and one that throws is caught and
logged. Because the route emits a `limits` event immediately, headers are already committed, so a
mid-run kill truncates a 200 rather than returning a 504 — which is exactly the case the check exists
for.

### 5 · What a dead run leaves behind: **nothing**

Confirmed from the code, not assumed. On the generate path `compose`, `execute`, `narrate` and
`validate` contain **no `db()`, no `pooled()`, no INSERT/UPDATE/DELETE**, and none of them import
`src/store/` at all. `save(report)` is the last call before `stage: done`. Quotes are created only by
the gate on an unpaid GET of a report, never by generation. No chain call happens anywhere in the
pipeline.

**So a killed generation costs model tokens and leaves no row, no quote and nothing on chain.**

### 6 · Does the budget fire first? No — and not by a small margin

```
  Hobby ceiling (actual)                60,000 ms
  maxDuration configured                300,000 ms   ← clamped, silently
  execute wall-clock budget             240,000 ms   ← 4× beyond the ceiling. Unreachable.
  measured routine run                   34,000–46,700 ms   ← already 78% of the real ceiling
```

⚠️ **The budget can never fire on this plan.** The platform kills at 60 s; the budget waits for 240 s.
And even on Pro it would rarely fire, because it does not cover the two stages that take the time.

### The one clear statement

⚠️ **A wide directive today fails as a dead stream, not as a clean stop.** The console reports the
truncation honestly and the database is left clean — so it is a *legible* dead stream rather than a
silent one — but nothing produces the `status: 'budget'` outcome that `ops/report.ts` and the console
both have handling for. That path is unreachable in the deployed app. On the **CLI** there is no
platform ceiling at all, so a long run there simply takes as long as it takes and the 240 s budget can
genuinely fire.

⚠️ **This contradicts Phase 3's decision 2 as written.** That decision removed the job-progression
apparatus on the grounds that a 300-second invocation is enough; the invocation is 60 seconds, and a
routine run already uses 78% of it. The decision may still be right — generation is a CLI job and the
console is throwaway — but the *reason* recorded for it is not true of this project.

**Not settled here, and only a real run would settle it:** the exact output-token rate at which
narrate crosses 60 s. Estimated at ~2,000 tokens from one measured narration; a deliberate wide
generation would pin it, and costs model tokens.

Nothing committed.

## 2026-09-09 — maxDuration on the paid read, and decision 2's reason corrected

Three files: `app/api/reports/[hash]/route.ts`, `app/console/page.tsx`'s header, and
`tracking/phases/PHASE-3.md`. ⚠️ **The four console routes are untouched** — confirmed with
`git status`. `tsc` exits 0 on both configs; `next build` passes. No job machinery, no queue, no
retry.

### The change

`export const maxDuration = 60` on the paid read, with the real ceiling explained at the site: this
project is on **Hobby**, the cap is 60 seconds, a declared 300 is silently clamped, and a route that
declares *nothing* takes the platform default of roughly 10 seconds. That default was what the route
where money moves had been running under, against a measured **8.6-second** settle — a 1.4-second
margin. Six times the headroom, and the comment says why a timeout here is worse than elsewhere: the
`authorization` flow produces the body before settlement completes, so a kill in that window leaves
the buyer with the report and the seller with an unsettled `purchases` row.

### ⚠️ How I checked it takes effect — and the honest limit of that check

This is the part the task was about, so here is exactly what was established and what was not.

**Established:**

- `.next/server/functions-config-manifest.json` — **the artifact Vercel consumes** — records
  `/api/reports/[hash]  maxDuration=60`, beside the four console routes at 300. The declaration
  reaches the handoff point rather than only the source.
- A **preview deployment** built from this exact source reached **READY**
  (`dpl_79TjkU4k9SeeDUpbZuNEg4QAjpei`), so the platform accepted that manifest. ⚠️ Preview, not
  production — production was left alone.
- The plan is **hobby** (`billing.plan = hobby`, read from the API). **60 ≤ 60, so this value cannot
  be clamped down.** The failure mode this task exists to prevent is structurally absent for it,
  which is the difference between 60 and the console's 300.

⚠️ **Not established, and it turns out nobody could:** Vercel exposes **no read surface that echoes
the applied per-function duration.** I tried the deployment record (`v13/deployments/{url}` — no
`functions` key), the output API (`v7/deployments/{id}/output` — empty), and `vercel inspect`, which
lists the lambdas and their sizes and no duration at all. Nor is it observable behaviourally without a
contrived slow request: distinguishing 60 from the ~10-second default needs a request that takes
between 10 and 60 seconds, and the gate has no way to be made slow without editing it.

**That absence is the finding.** It is precisely why four routes have carried a fictional 300 for a
week without anyone noticing: the platform accepts the number, the build says nothing, the deployment
goes green, and there is no place to look it up afterwards. The manifest is the only checkable
artifact, so it is the one to check.

⚠️ **Production has NOT been promoted** — it still serves the previous build, where the paid read has
no `maxDuration`. Promoting is a one-line `vercel deploy --prod` or a push, and it is outward-facing,
so it is left for a decision rather than taken.

### A real paid read after the change

Run against `next start` on the new route code — same route, same gate, a real x402 settlement on
Hedera testnet through Blocky402; only the hosting differs from production.

```
  unpaid GET /api/reports/<hash>   402
  settled     0.0.7162784@1788992192.548150225
  paid        0.00100000 HBAR   buyer 0.0.10387696 → analyst 0.0.10387690
  network fee 0.00259638 HBAR paid by the facilitator 0.0.7162784, not by us
  body        2,062 chars, hash matches the requested report
  elapsed     5.28 s for the whole buyer round trip
```

⚠️ **5.28 s is the round trip, not the gate's own invocation** — it also contains the buyer's Mirror
Node ingestion poll, the challenge decode and the signing, so the function's own clock is a subset of
it. Against the 8.6-second reference settle it is comfortably inside; against a 60-second ceiling
there is at least 11× headroom, where the old default gave roughly 2×.

**Cost of this run: 0.00100000 HBAR from the buyer**, plus a 0.00259638 HBAR network fee that the
facilitator paid.

### Decision 2

The decision stands and its reason has been rewritten. It used to rest on *"a 300-second Vercel
invocation cannot hold a multi-deployment report generation"*, which implied 300 seconds of headroom
this project does not have. It now says the true reason — **generation is a CLI job where no platform
ceiling applies at all**, `scripts/ops/report.ts` runs in a local process where the 240,000 ms budget
can genuinely fire, and the only in-app generator is throwaway — and carries the measured figures in
a table: 60-second real ceiling, 34.0 s and 46.7 s routine runs, 57% and 78% of it, and the note that
the two model calls are ~98% of a run while carrying no budget.

It also now records **what would overturn it**: commissioning a report from the product, which on a
60-second ceiling needs either the job apparatus this decision removed or a plan upgrade.

**The Hobby plan is recorded as Trap 5** in PHASE-3.md's *Traps* section — the list a cold session
reads first — including that an over-limit `maxDuration` is accepted and clamped without warning, that
an absent one means ~10 seconds, and that this is **the fifth thing in this project that looked live
and was not**.

⚠️ **One preview deployment was created and left in place** as the evidence above. It has no
`DATABASE_URL` (that variable is production-only, which is why the paid read could not run there) and
is harmless; say the word and it can be removed.

Nothing committed.

---

## 2026-09-09 — Phase 4 orientation, read-only

Read `PHASE-4-draft.md`, PLAN §1/§4/§5.2/§5.12/§5.16/§5.18/§9, `DECISIONS.md`, `lessons.md` and
`PHASE-3.md`, then checked every load-bearing claim against the code rather than trusting it. Both
gates pass: `tsc -p tsconfig.json --noEmit` exits 0, and `scripts/ops/migrate.ts` is a clean no-op
over four migrations against the five live tables. Nothing was written, spent or deployed.

**The draft is mostly accurate and one part of it is better than it says.** Verified true: no `.sol`
or `contracts/` anywhere outside `node_modules`; `solc` and `@openzeppelin/contracts` pinned as
devDependencies; 3 `usable` / 2 `poisoned` / 1 `not_tracked` / 19 unswept across exactly 25 live
deployments; settlement reads unpinned because `client.ts:214` omits `$block` entirely when it is
undefined; `RETENTION_FLOOR = 300` lives in `blockwindow.ts` and governs `commonBlock`, not
settlement; viem 2.56.3 is installed transitively. The better-than-stated part is
**`src/graph/evidence.ts`, which already implements §5.18's two-tier caller-picks evidence design** —
`EvidenceTier`, the `raw` field, and a header that names Phase 4's resolver as the `record+raw`
caller. It is built, not designed; only a demo script calls it today.

**The finding that matters is decision 3 against A2.** The draft puts the analyst's staking call
behind a CLI, reasoning that Arc asks for the agent's own funds and own decision rather than for no
human typing a command. PLAN §4's A2 reads *"Agent's `commitPrediction` is payable and unattended"* —
a PASS/FAIL row whose satisfied-by column commits to who pulls the trigger, not to whose money moves.
The two are answering different questions and they come apart exactly at a CLI, so **the CLI reading
does not survive A2 as written**. A4 is more tolerant — "conditional" and "multi-step" survive intact
— but its "automated" lands on `resolve`, which decision 3 never scoped at all. That leaves the
choice where CLAUDE.md says it belongs: amend the plan in the open, or reverse the decision and take
the job machinery and the durable ledger back with it. Not decided here.

**Four contradictions worth naming before a contract gets written.** §5.2 (*"the bug is mixing units,
not storing `msg.value`"*) and the draft's decimals section (*storing `msg.value` is failure #1 and
cannot be fixed after the fact*) give opposite instructions, and it is the one mistake that is
unfixable once deployed. §5.18's *"serialize resolver txs through the job lease"* points at machinery
that does not exist — no lease, no ticker, no `.github/`, no `/api/cron`. The draft closes the ledger
question on reasoning that covers `commitPrediction` and not resolve or void.

And the one nobody had written down: **Phase 4 inherits the digit-guard enforcement obligation, and
both gaps it was gated on are still open.** `execute.ts:257` emits `market-population` as a *check*
with the count inside a rationale string rather than as a `unit: 'count'` fact, and no utilization or
ratio fact is emitted anywhere — `FIGURES` and `MARKET_FIGURES` are USD-only. `validate.ts` still
warns; `scripts/ops/report.ts:104` prints violations and continues. §5.2's `specHash` binds a market
to a report, which is the moment a figure a reader cannot trace stops being acceptable.

Small correction to the draft: SM-09's `next build` half is already half closed. The ESM
directory-import class it guarded against was hit and fixed in Phase 3 Unit 6 via
`tsconfig.app.json` nodenext; what remains is the narrower question of a wallet interaction under a
production build.

**Also found, unrecorded anywhere:** there is no Arc RPC environment variable at all — SM-08
hardcodes `https://rpc.testnet.arc.network`. `ARC_DEPLOYER_KEY` is read only by SM-08, and
`ARC_WALLET` is read by nothing in the repo and is absent from `.env.example`.

No planning and no units, by instruction. Nothing committed.

---

## 2026-09-09 — Decision 3 reversed, question 4 reopened, three things newly open

Amended `tracking/phases/PHASE-4-draft.md` and nothing else. Documentation only — no code, no
contracts, no chain calls, no database writes.

**Decision 3 is reversed and the old text is still there.** It said the analyst's staking call sits
behind a CLI, reasoning that Arc asks for the agent's own funds and own decision rather than for no
human typing a command. The correction is recorded as *what it was wrong about* rather than just
*that it was wrong*: PLAN §4's A2 is PASS/FAIL and its satisfied-by column reads *"Agent's
`commitPrediction` is payable and unattended"* — decision 3 argued about whose money and whose
decision, A2 commits to who pulls the trigger, and those are the same question everywhere except at
a CLI, which is where the decision put the spend. The `tokenize.ts` precedent does not carry, because
no Hedera requirement contains the word autonomous or unattended; it was precedent from a case where
nothing was being claimed. A4's "automated" fails separately on `resolve`, a step the original never
scoped at all. The superseded decision, its reasoning and its own (correct) prediction that it was
the first thing to revisit are all left verbatim with the correction underneath — this record is
worth more for showing reasoning that turned out mistaken than for the conclusions that held.

**The replacement is smaller than §5.1 and was checked before it was written down.** One scheduled
route that finds work past its due time and does it inline: no lease, no ticker, no queue. **Vercel's
Hobby cron limits were read from Vercel's own documentation rather than from memory**, because a
scheduler nobody checked would have been the sixth thing in this project that looked live and was
not. Hobby is capped at **once per day** with **per-hour precision (±59 min)**; a more frequent
expression **fails at deploy time** rather than silently, which is the one piece of luck. Also
recorded: `CRON_SECRET` is sent automatically as a bearer token, Vercel **does not retry a failed
invocation**, and delivery is best-effort in both directions — a run can silently not happen, and the
same run can be delivered twice.

**The shape is viable, and the reason is the market shape rather than the scheduler.** A daily
snapshot is written once and never superseded, and §5.16's freshness rule is a lower bound rather
than a window, so a read taken 40 minutes late returns the same number. The precision limit costs
nothing here. What the daily limit *does* cost is recorded with numbers: one automatic attempt per
day with no retry, so `resolveDeadline` must sit at least two days after `observationEnd` or a single
`MISSING_OBSERVATION` voids a market for a transient reason; worst-case ~24h + 59min latency, which
means the demo calendar needs at least one spare day before 2026-09-13; and a cron cannot be demoed
live, so the video shows receipts rather than a trigger.

**Question 4 is reopened and its old closure is marked as drawn too wide.** "The human is the cap" has
no referent once nobody is watching, so the durable ledger returns and is not optional — the design
the draft already held, one row per outflow keyed on actor/rail/asset/atomic amount/UTC day with the
cap read as a `SUM` inside the same transaction that records the spend. The too-wide part is recorded
separately: the closure covered `commitPrediction` and never mentioned `resolve` or `voidMarket`, and
**on Arc gas is USDC** (SM-08's own words), so a resolve transaction stakes nothing and still spends.
Any ledger has to cover gas, not only stakes.

**Three things newly open, each with what it turns on and who decides** — recorded this way because
Phase 3 left decisions implied and it cost real time. (1) The `msg.value` unit contradiction: §5.2
says the bug is mixing units rather than storing it, question 5 says storing it is the worst case and
unfixable once deployed. Both positions are quoted, the parimutuel arithmetic is written out, and the
likely reconciliation — that the two are talking about different things — is named as a hypothesis
and **deliberately not adopted**, because as written they still tell a contract author opposite
things. (2) The digit guard, which PHASE-3 scheduled into this phase on a named trigger and the draft
never carried forward; both gating gaps verified still open in the code. (3) Arc's environment
variables — no RPC var exists, `ARC_WALLET` is read by nothing and missing from `.env.example`, and
SM-08's finding that `deployContract` is not exposed on the Circle client means the market contract's
deployer is necessarily a different identity from the analyst.

**Said explicitly rather than left to inference:** decisions 1 and 2 are untouched. Neither was ever
downstream of where the spend fires. Also flagged for PLAN: §5.18's *"serialize resolver txs through
the job lease"* names machinery Phase 3 removed and this phase is not rebuilding.

Nothing committed.

---

## 2026-09-09 — Where Phase 4 attaches: a seam sweep done before the building

Wrote `tracking/phases/PHASE-4-attachment.md` (632 lines) and added a one-line pointer to it from
`PHASE-4-draft.md`. Read-only investigation otherwise — no code, no contracts, no chain calls, no
database writes, and `scripts/smoke/08` was read rather than run.

**A sibling file rather than a section of the draft.** The draft is a decision record; this is a
structural survey, and the two get read at different moments — the draft when deciding, this when
writing a unit brief. Folding 600 lines of attachment detail into the draft would have buried the
decisions it exists to hold. `PHASE-3.md` set the precedent. Each file now points at the other,
because a document nobody can find from the one they opened is how this project has already lost
information three times.

**Most of the attachment surface is genuinely clean, and it is worth saying so plainly.** `load()`
re-derives the report hash and throws rather than warning, so a market binding to a report gets its
identity guarantee for free. `canonical()` takes `unknown` on purpose, so `specHash` and
`evidenceHash` need no new code — its own header forbids writing a second hasher. `querySubgraph`
names Phase 4's settlement as an intended caller. `analystByArcAddress` is already the pattern both
tokenize modules open with. And `evidence.ts` already implements §5.18's two-tier caller-picks design
in full, which is better than the draft claims.

**Two findings came out of `node_modules/` and both contradict something this project currently
believes.** First: the installed Circle SDK 10.8.0 polls for you — `getTransaction` takes
`waitForState` / `waitForTxHash`, a `pollingInterval` and an **`AbortSignal`**, so SM-08's hand-rolled
loop is no longer the shape to copy, and the signal is what bounds a wait against the 60-second
ceiling. The typing also says an EOA has its hash at `SENT`, so waiting for `COMPLETE` waits for
nothing. Second, and worse: **idempotency is opt-in and the default is not idempotent** — the shipped
bundle reads `idempotencyKey: t ?? ee()`, so two identical calls with no key are two transactions.
And **`generateIdempotencyKey`, which the typings export from the main entry, appears zero times in
both shipped bundles and is `undefined` at runtime under ESM and CJS alike.** Importing it
typechecks and fails at call time. That is the sixth instance of this project's recurring failure and
the first one caught before it cost anything.

**Six seams that would each pass their own proof and still not complete a cycle.** Evidence has a
correct builder and no destination — its only caller is a demo, and reports persist `Provenance`,
which has no response hash and no raw bytes. `evidenceHash` therefore commits 32 bytes on chain to
bytes nothing stores, and three units each assume another owns it. `claimId` is a return value, which
is not readable from a receipt, and Circle returns no logs at all — verified against every field of
the `Transaction` type — so getting it back needs a separate Arc RPC receipt fetch and the committed
ABI. The market subject cannot be rebuilt from a `FactId` because `Fact` carries slug, deployment and
unit but not the snapshot field name, and adding one would change `Report` and invalidate every
stored hash. The analyst's Arc identity has no in-path guard — `verify-analyst.ts` is a CLI a cron
never runs. And the ledger's cap must be a `SUM` inside the writing transaction, which means the first
`sql.begin` this codebase has ever opened: verified, there are none.

**One schema finding the draft does not mention and should.** 001_init's rule is BIGINT for atomic
money. **An 18-decimal USDC amount overflows BIGINT at about 9.22 USDC.** So the open `msg.value`
question reaches into the schema, not only into the contract: 6-dp storage keeps BIGINT, 18-dp needs
NUMERIC(78,0), and TEXT is not viable because the cap has to sum and order.

**Also surfaced: a to-do written on 2026-09-06 whose trigger condition just fired.** SM-08's
smoke-results entry says to set a spend cap on the Circle wallet set *"before the agent commits on Arc
unattended (Phase 4)"*, status open — Circle's limits are server-side console policy, not a client
option, and that run spent 2.5 USDC with nothing standing in its way. It is a console action rather
than a unit, so nothing in the unit plan will ever remind anyone.

**The one thing to decide first: what a market's subject and threshold are and where they come
from.** Not the `msg.value` units, which are already flagged and correctly waiting. This one is
recorded nowhere and is upstream of `spec.ts`, the markets table, the commit cron's find-work query,
the `FactId` seam, and whether A1's "decision logic" is arithmetic or a model call.

Nothing committed.

---

## 2026-09-09 — Phase 4 planned, in four passes

Two new files: `tracking/phases/PHASE-4.md` (849 lines, sixteen units) and
`docs/research/prediction-markets.md` (226 lines). The research earned its own file — it is about how
parimutuel markets work rather than about this repo, and it will be read by whoever writes the
contract rather than by whoever plans the phase. No code, no contracts, no chain calls, no database
writes, nothing committed.

**Pass 1 found five conflicts and the most useful one dissolved rather than resolved.** §5.2 said the
bug is mixing units rather than storing `msg.value`; the draft said storing it was the worst case and
unfixable once deployed. The parimutuel payout is `stake + (stake * losingPool) / winningPool`, and
that ratio is two quantities in the same unit — **dimensionless, so the scale cancels.** §5.2 was
right about the arithmetic and the draft was right about the boundaries, and they were never
describing the same thing. That closes draft §6.1, which had been the phase's most dangerous open
item. The other four: §5.18's job lease names machinery Phase 3 removed and nobody is rebuilding —
made moot by scale rather than satisfied, and the plan needs amending; §9's "+ tests" implies a
dependency this calendar cannot afford, so the contract's proof is a play gap on testnet instead;
"a human directs the analyst" and A2's "unattended" turned out compatible once separated into who
directs and who spends; and R6's "never hold a request open" survives in spirit while its mechanism
changes, because the installed SDK bounds the wait with an `AbortSignal`.

**Pass 3 was real research and it changed the contract brief in seven places.** The one that matters
most: **`winningPool == 0` is not an edge case here, it is the expected case** — one analyst and a
handful of stakers will routinely leave a side empty. Unguarded it is division by zero and the pool
is stuck forever; naively guarded the house silently keeps everything, which is a real audit finding
against ScorePlay. Also: always truncate and leave the dust to nobody, because a "last claimer gets
the remainder" rule is a claim-order race that an SBET audit actually found. Void means refund at
parity, which is what Augur's Invalid, Polymarket's Unknown/50-50 and UMA's `unresolvable` all do.
And the betting window must close before the observed day begins, not merely before it ends —
past-posting is what every totalizator on earth is built to prevent, and it costs us a day of
calendar. The most valuable finding was structural: Augur and Polymarket accept free-text questions
and pay for it with an oracle and a dispute system, so **constraining the subject to five machine
values is what lets us skip both honestly rather than by omission.**

**The calendar is the real constraint and it sizes the phase.** Working backwards from Sunday: the
video needs Sunday, so resolution must land Saturday, so the observed day is Friday, so stakes close
Friday 00:00, so the analyst must commit Thursday — which means **the contract deployed and the
commit path working by Thursday, about a day and a half from now.** Units 1–7 plus a play gap in that
window; everything after runs while the market is already live. Recorded a rehearsal market over an
already-closed day to drive resolve, void and the empty-pool path immediately, and said plainly that
its commit is after the fact so it is machinery proof and must never be shown as a forecast.

**Sixteen units do not fit four days, so the cut order is the real plan** — six steps, each with what
it costs, ending at "the analyst is no longer forecasting, take this only to avoid shipping nothing."
Never cut: the contract, Unit 8's evidence persistence, both crons, the void path, live Graph data at
settlement.

**Two findings worth carrying forward.** A6 — Arc mainnet readiness — **has no unit in this phase**,
and per the brief a requirement with no unit is the finding: it is Phase 5 or it does not happen.
And Unit 15 is the only unit serving the loop the product is built on, which puts the reason anyone
should pay for the next report at position 3 in the cut order. Both stated rather than left implied.

Also recorded the two things that are not units: the Circle wallet-set console cap, whose trigger
decision 3R already fired and which no unit will ever remind anyone about, and the digit guard's
inherited obligation with both gaps verified still open — accepted as debt, in writing, because
closing them is two `execute.ts` changes this calendar does not have.

⚠️ One correction during the write: the plan quoted a day-window as `[1757548800, 1757635199]`, which
is 2025 rather than 2026. Checked against `date -u` and fixed to `[1789084800, 1789171199]`. It was a
proof criterion, so it would have been checked against.

Nothing committed.

---

## 2026-09-09 — A6 placed as Unit 11b

Edited `tracking/phases/PHASE-4.md` only. Documentation — no code, no contracts, no chain calls.
991 lines now, seventeen units.

**Lettered rather than renumbered.** PHASE-3 inserted `6b`, `8b` and `C` after the fact rather than
shifting everything below them, because a unit number that moves breaks every reference already
written in `logs.md` and `DECISIONS.md`. Followed that. Nothing else in the sequence changed.

**Placed at 11b — after both crons, before the watched cycle — and the placement is the argument.**
It cannot come earlier because a manifest for an undeployed contract describes nothing: it needs an
address from Unit 6, the committed ABI from Unit 3, a working commit path from Unit 7 and the cron
entries from Units 10–11. It should not come later because **Unit 12 is a waiting unit** — hours
between a market being created and the crons firing — and this is exactly what to write in that dead
time.

**It assembles rather than builds.** `.env.example`, the migration runner, `config/analysts.ts` and
`verify-analyst.ts`, `provision-circle.ts` and SM-08's already-walked Circle setup, the ABI artifact,
the deployed address, the cron entries and `/api/health`. The brief said not to invent scope, so the
unit carries its own tripwire: if it finds itself writing a deploy script it has left its scope.

**Permissions and recovery are written as facts, not gestures.** Four identities with what each can
and cannot do — including that the Circle entity secret **cannot be rotated** without re-provisioning
every wallet, which `provision-circle.ts` states outright, and that the deployer is necessarily a
different identity because `deployContract` is not exposed on the DCW client. Recovery has two
answers worth having: **the analyst's identity cannot be recovered and is not meant to be** — its
address is inside every report hash, so a replacement wallet is a different analyst and old reports
keep their attribution to an address nobody controls, which is correct; and **funds are never
stranded**, because permissionless void plus pull-based claim means a staker can get out even if the
analyst disappears. The unrecoverable thing is a lost `reports` row, since narration is inside the
hash and the model call is not deterministic.

**The mainnet table is mostly blanks on purpose.** chainId, RPC host, the USDC predeploy address and
Circle's `blockchain` enum are all left as named blanks with the source to fill them from, rather
than guessed. This project has been wrong six times about a value that looked live and was not, and a
manifest that invents a mainnet chainId to look complete would be the seventh.

**Writing the permissions table surfaced a real gap in §5.2: nothing says who may call `resolve`.**
The interface shows `require(!resolved)` and a timestamp check and no access control, which as
written would let anyone settle any market with any outcome. That is Unit 2's decision and it is
unfixable after deployment, so it went into the decision-ownership table as a new row pointing at
Unit 2 — surfaced by 11b, taken in 2. That is the one addition outside the unit itself.

**In the cut order it went to *never cut*, and the reasoning is that it is a different kind of cost.**
Everything in the numbered cut list sacrifices product surface; this sacrifices eligibility on all
three Arc prizes. It is also the cheapest unit in the phase, so cutting it saves almost nothing and
risks almost everything. Recorded a degradation path instead of a cut: drop the from-scratch clone
first, then the mainnet table, and never drop permissions and recovery — the two things PLAN §4 names
by name.

**Its proof admits its own weakness.** The bar is that someone else could stand it up without asking
questions and nobody else is available. Three checks: a from-scratch clone followed literally, where
every moment you look outside the manifest is a defect; a symmetric env-var audit by grep in both
directions; and every address checked against the live network and against what Unit 12 actually
produced. The clone check is weaker than a second person because you cannot un-know things — said
plainly, with the note that the other two do not depend on the walker being naive, and that the
residual risk is prose that reads clearly to its author and ambiguously to a stranger.

It also closes attachment 6.3: a manifest listing what a fresh operator must set cannot leave
`ARC_WALLET` set-but-read-by-nothing and missing from `.env.example`.

Nothing committed.

---

## 2026-09-09 — The token-to-stake binding, and the loop that was missing its second half

Amended `tracking/phases/PHASE-4.md` (1,226 lines, twenty-one units) and wrote
`docs/research/cross-chain-binding.md`. Four new lettered units: **6b, 6c, 13b, 15b**. No code, no
contracts, no chain calls.

**The most useful thing the investigation found is that three of the four facts are already public,
and only one is not.** That a token carries `alpha:<hash>`, that the analyst issued it, and that an
Arc address committed that hash are all readable by anyone from two public chains — we do not make
them true, we only check them before spending. **The single link that is not publicly checkable is
that the Arc committer and the Hedera issuer are the same party**, and today that rests on
`config/analysts.ts`, our file on our repo. That gap is the whole problem, and framing it that way
changed what the answer should be.

**So the instinct was right and incomplete.** The admission check is worth building — it stops the
analyst spending on a claim it cannot back — but on its own it does not make anything more provable
to a sceptic, because the facts it checks were already public. What closes the real gap is a one-time
**two-way key attestation**: the Hedera key and the Circle wallet each sign a sentence naming both
addresses, and anyone can `ecrecover` them. ⚠️ Read from the installed SDK rather than assumed —
`client.signMessage({walletId, message, ...})` exists on
`@circle-fin/developer-controlled-wallets@10.8.0`, alongside `signTypedData`. That is Unit 6b, and it
turns the config file from an assertion into a claim backed by two signatures.

**And testing the instinct found a real bug in it.** Requiring the analyst to *hold* the token would
refuse most of our own reports — `004_token_transfers.sql` says *"Three tokens sit with the buyer
today"*, because Unit 10 moved them on purpose to satisfy H2.4's lifecycle operation. **The act that
satisfies H2.4 would break an admission check built on holding.** Bind to **issuance** instead: who
issued a token sits in the deploy transaction forever, and one receipt fetch yields both the
`alpha:<hash>` and `receipt.from`. Also recorded: do not check the ISIN, because `isinFor()` is a pure
function of the report hash and checking it checks our own arithmetic.

**Cross-chain messaging was investigated properly and rejected on two grounds, only one of which is
the deadline.** LayerZero's own deployed-contracts list has **Hedera testnet at eid 40285 and no Arc
entry at all**; Circle's Arc launch release names LayerZero as a developer-tool partner and
Across/Stargate/Wormhole as the bridges — a partner logo is not a deployed endpoint, and this project
has been wrong six times about that distinction. The second ground matters more: a message proves a
fact at send time, so enforcing "the analyst holds it" would need a message per commit, while the
identity link is permanent and needs no bridge at all. What a messaging layer would actually buy is
**enforcement instead of verification**, and that is worth days we do not have for a gap two
signatures close.

**The feedback half was genuinely absent — the plan produced scores and stopped.** Unit 15b decides
what reaches the prompt: the last five resolved claims, one line each — directive, subject, side,
outcome, the report's own confidence. Rejected a right/wrong count as meaningless at n=1 and the full
reasoning of a wrong report on size rather than value. Said plainly that this is **not model
training** — no weights, no fine-tuning, no pipeline. Stated the consequence rather than leaving it to
be found: `compose` gains a third argument, so a report's plan now depends on the analyst's record at
the moment it was written, and two runs of one directive at one block can plan differently. The full
hash was already non-deterministic because narration is inside it; what is new is that the plan varies
with state outside the directive and the block. Recorded a `context_digest` column **outside the
hash**, since putting it inside would invalidate four hashes already committed in ATS creation events.
And said in the plan that the first resolution lands about a day before the deadline, so this is a
demonstrable shape rather than a turning loop, and the video should say so in those words.

**Unit 13b shows one report across both ledgers** — the same 32 bytes printed twice, side by side,
with links out to both explorers. Written as *show the hash in both places* rather than a green tick,
because a tick asserts what the two strings demonstrate.

⚠️ **The reorder the user asked to hear about: 6b and 6c both sit BEFORE Unit 7**, because the binding
is checked at commit time and cannot be bolted on beside the staking page. 6c is `LOGIC ★★` and lands
in the run to Thursday that already holds Units 1–7 and a play gap — the one addition that costs spine
time rather than tail time.

**The cut order was wrong and is fixed.** Unit 15 sat at #3 while being the only unit serving the
loop, so the first thing to go was the reason anyone would use this. Now ordered by kind of loss —
polish, then operational, then the loop, then requirements, with requirements last because
eligibility is binary. 6c joins never-cut: without it the product's central sentence is not true.

Nothing committed.

---

## 2026-09-09 — Phase 4 Unit 1: `src/arc/spec.ts`

Two new files: `src/arc/spec.ts` (345 lines, ~130 of real logic) and `scripts/demo/spec.ts`, its
proof. 38 assertions, all passing; `npx tsc -p tsconfig.json --noEmit` exits 0. Nothing else in the
repo was touched — no contract, no migration, no store code, no dependency, and `canonical.ts`,
`types/` and `protocols.ts` are all unchanged. The proof needs no `--env-file` because the unit is
pure, and that is the property worth keeping: if it ever needs a credential, it has grown an I/O path
it must not have.

**What it holds.** The five machine values, `specHash` through the existing canonicalizer, the day
window, the freshness rule, the `FactId` mapping, and `holds()` — which defines what the comparison
means, including that a tie resolves false. That last one was not in the brief and it belongs here:
leaving equality undefined is exactly the ambiguity that makes a market unresolvable, and defining it
in the resolver would mean the settlement code inventing the question.

**One decision that goes past the brief, and it wants a look.** The brief said balance and flow are
legal and revenue is refused by name. I refused more than revenue, because the repo's own record says
two other classes are not safe. Lifetime accumulators are refused for the same class of reason as
revenue — morpho-blue's `cumulativeDepositUSD` reads $3.78e23, about $378 sextillion, and nobody has
swept the other 24 deployments. And `totalValueLockedUSD`, `dailyWithdrawUSD`, `dailyRepayUSD` and
`dailyLiquidateUSD` are refused as **not individually swept**: the measurement that cleared balance
and flow covered exactly four fields — deposits and borrows, balance and daily — across 1,300+ days.
So the legal set is those four. ⚠️ **The three refusal reasons are kept distinct in the messages**
rather than collapsed into "not legal": measured-broken, measured-absurd, and no-evidence-either-way
are different claims, and only the third is a one-line change to reverse once a sweep exists.
Widening this is deliberately cheap and deliberately requires evidence.

**Two things the code had to encode that the brief did not mention, both found by reading.**
`figureRef` in `src/engine/invariants.ts` is the canonical minter of fact ids, so the parser rebuilds
with it and compares rather than trusting its own split — if a slug ever contained a dot, the round
trip fails loudly instead of mis-splitting silently. And `compose.ts:224` mints a **sentinel slug
`metric`** when a report's headline is about a metric across deployments with no single one leading.
A report like that names no deployment to settle against, so it cannot back a market, and it now gets
its own refusal saying so instead of falling through to "no such deployment".

**A third: per-market fact ids cannot be market subjects.** `execute.ts:271` mints
`{slug}.{marketId}.{field}` for per-market figures, and settlement reads `financialsDailySnapshots`,
which is one row per *deployment* per day. There is no daily snapshot per market, so nothing could
settle one. Refused by name with that reason.

**The window numbers were taken from `date -u` and not derived.** `[1789084800, 1789171199]` for
2026-09-11, and the proof asserts both, plus that the next day's window starts at exactly `end + 1`
so no snapshot can belong to two days. The proof script carries the `date -u` commands in its header
because the first draft of this line in the plan was a year out and was caught only by checking.

**One failure during the run, and it was the test rather than the code.** The `closeTime` inside the
observed day was correctly refused; my assertion looked for the word "past" and the message says
"inside or after the observed day". Corrected the assertion.

Nothing committed.

---

## 2026-09-09 — Phase 4 Unit 2: `contracts/AlphaMarket.sol`

One file, 381 lines, and the commit carries nothing else — no build script, no ABI, no TypeScript, no
migration. The seam was named in the plan and it is kept where it matters: the file is over 120 lines
and it is alone.

**It compiles under the pinned `solc 0.8.28+commit.7893614a` with zero errors and zero warnings**,
optimizer on at runs 100, the same settings `verify-ats.ts` uses. Deployed bytecode is 4,783 bytes
against EIP-170's 24,576. 43 ABI entries: seven externals plus the public getters, six events,
nineteen custom errors. The compile ran from a scratchpad script outside the repo, so nothing was
added to the project to produce it.

⚠️ **Nothing about behaviour is proved and this entry does not claim otherwise.** It compiles. Every
path — the empty winning pool, the void, the refund, a single staker, a double claim — is Unit 6's to
drive on Arc testnet, by decision, because a test framework is a dependency decision and a fixture
suite contradicts three phases of live-networks-only.

**The decision the plan routed here: who may call `resolve`.** Chosen: **an immutable `resolver`
address set in the constructor, and nothing else in the contract has access control.** §5.2 as
written would let anyone settle any market with any outcome and take the pool. The resolver is the
analyst's Circle wallet, because it is the only party that runs the Graph read and can produce a
matching `evidenceHash`. Immutable with no setter, deliberately — a mutable resolver is a key worth
stealing and an admin function worth abusing, and if the analyst's wallet changes the answer is a new
contract, which is how this project already treats analyst identity. **A restricted resolve cannot
lock funds up** because `voidMarket` is permissionless after `resolveDeadline` and `claim` is
pull-based: if the resolver never fires, anyone voids and everyone takes their own stake back. ⚠️ The
residual is written into the contract's own comments rather than left implied — a *dishonest*
resolver can settle wrongly before the deadline, nothing on chain contradicts it, and what exists
instead is `evidenceHash` over a reproducible read. Detectable by anyone, correctable by no one.

**No OpenZeppelin. Zero imports, and that is a decision rather than an omission.** The only thing it
would have supplied is `ReentrancyGuard` on `claim`, and checks-effects-interactions is genuinely
sufficient here: `claimed` is set before any value moves, so a reentrant recipient finds its own flag
set, and every other entry point is already closed because staking requires
`block.timestamp < closeTime` which cannot hold once a market is settled. Keeping the compile input
to a single file with no dependency also keeps Unit 3's trace-and-compile trivial and the
verification surface minimal.

**One trade taken inside the contract that was not in the brief, and it is stated in the file.**
`createMarket` enforces only the *ordering* of the timestamps, not their relation to now. The obvious
guard — `observationEnd > block.timestamp` — is deliberately absent, because it would make a
rehearsal market over an already-closed day impossible, and that is how resolve, void and the
empty-pool path get exercised without waiting a calendar day the calendar does not have. ⚠️ **The cost
is real: a market can be created about a day already observed and the contract cannot tell.** Policy
about `closeTime` versus the observed day lives in `spec.ts`, which is the only place that knows which
day the question names.

**An extra compile that cost nothing and de-risks Unit 6.** It also compiles clean under `shanghai`
and `paris`. ⚠️ **The cancun and paris builds differ — 4,783 against 4,871 deployed bytes — so the
cancun build does use cancun-era codegen**, and deploying it to a pre-cancun chain would be a live
revert rather than a compile error. **Unit 6 must confirm Arc's supported EVM version before
deploying**; the setting itself belongs to Unit 3. ⚠️ I first tried to test this by grepping the
bytecode for an `MCOPY` opcode byte, which is meaningless — any byte pair matches — and discarded it.
The size difference is the real evidence.

⚠️ **One thing to confirm: the file declares `SPDX-License-Identifier: MIT` and the repo has no
LICENSE file.** solc warns without an SPDX line, so one had to be chosen. If the project's licence
ends up as something else, this line changes with it — and E3/E5 want the repo's licensing to be
explicit anyway.

Nothing committed. Nothing deployed.

---

## 2026-09-09 — Unit 2's findings recorded into PHASE-4.md

Documentation only, `tracking/phases/PHASE-4.md`. Three things the contract surfaced that the plan
did not carry, plus one cross-reference.

**Unit 6 gained an EVM-version warning with a table.** `AlphaMarket.sol` compiles clean under cancun,
shanghai and paris, but cancun and paris produce different bytecode — 4,783 against 4,871 deployed
bytes — so the cancun build genuinely uses cancun-era codegen rather than merely targeting a newer
version. Deploying it to a pre-cancun chain is a live revert rather than a compile error, and it
would present as an unexplained failure at the moment gas is being spent, on a chain whose reverts
this project has never read. Unit 3 pins the setting; Unit 6 confirms the chain, because that is
where the first deploy happens. ⚠️ **The discarded method is recorded alongside the working one**,
because it is the one someone reaches for next: grepping the bytecode for an `MCOPY` opcode byte is
meaningless, since bytecode is a hex string and any byte pair matches somewhere. The size difference
between two builds of one source is a whole-artifact comparison and cannot accidentally match.

**Unit 2 now records the access-control decision rather than merely being routed it.** An immutable
`resolver` set in the constructor, the analyst's Circle wallet, no setter — chosen because it is the
only party that runs the Graph read and can produce a matching `evidenceHash`, and immutable because
a mutable resolver is a key worth stealing and an admin function worth abusing. Recorded with the
reason it is safe rather than a lock-in: `voidMarket` stays permissionless after `resolveDeadline`
and `claim` is pull-based, so a silent resolver can only delay settlement to the deadline. ⚠️ **And
with the residual, which is accepted rather than solved** — a dishonest resolver can settle wrongly
*before* the deadline and nothing on chain contradicts it. What exists instead is `evidenceHash` over
a reproducible read: detectable by anyone, correctable by no one.

**The timestamp trade is now in the plan, and it turned out to change something already written.**
`createMarket` enforces only the ordering of the timestamps, never their relation to now, because an
`observationEnd > block.timestamp` guard would make the rehearsal market impossible — and the
rehearsal is how resolve, void and the empty-pool path get exercised without waiting a calendar day
this phase does not have. The cost is that a market can be created over a day already observed and
the contract cannot tell. ⚠️ **So the calendar's line about the rehearsal market — "its commit is
after the fact, so it is not a forecast and must never be presented as one" — has stopped being a
discipline and become the only thing standing between a rehearsal market and something that looks
like a forecast.** Added a pointer at that sentence's own site as well as in Unit 2, because a fact
recorded at one end of a dependency is how this project has lost information three times.

Three rows added to the decision-ownership table: the resolve decision as taken, Arc's EVM version as
owed by Unit 6, and the timestamp trade as taken.

⚠️ **Flagged for a decision, not added to the plan: the contract declares
`SPDX-License-Identifier: MIT` and this repo has no LICENSE file.**

Nothing committed.

---

## 2026-09-09 — Phase 4 Unit 3: the contract build and its drift gate

`scripts/ops/build-contract.ts` (285 lines), its output `src/arc/abi.ts` (823 lines, generated), and
three lines added to `package.json`'s scripts. `contracts/AlphaMarket.sol` is byte-identical to what
Unit 2 committed — `git diff` on it is empty. `npx tsc -p tsconfig.json --noEmit` exits 0 and a full
`npm run build` completes.

**What was added to package.json**, and nothing else: `build:contract`, `check:contract`, and
`prebuild` which runs `check:contract`. `prebuild` fires automatically before `npm run build`, which
is what Vercel invokes for this project. ⚠️ The first attempt rewrote package.json through
`json.dumps`, which escaped an em-dash in the unrelated `smoke:09` script to `—`. Reverted and
redone as a text edit, so the diff is three added lines and nothing else.

**The artifact records what produced it and nothing that changes on its own.** Source hash, compiler
version with commit, the settings, the deployed bytecode length, then the ABI and both bytecodes.
⚠️ **No timestamp and no build id, deliberately** — a generated file that rewrites itself every run
produces a diff for every build, and a diff nobody reads is how a real change gets waved through.
4,783 deployed bytes, the cancun figure, so the target is right.

**Drift is detected in two tiers, because the compiler is not guaranteed to be present and a check
that silently passes without one is worse than no check.** Tier 1 needs no compiler: the artifact's
recorded source hash against a fresh sha256 of the `.sol`. Tier 2 recompiles and compares the ABI and
both bytecodes byte for byte, which catches what tier 1 cannot — a hand-edited artifact, a changed
compiler, changed settings, none of which move the source hash.

**All four cases were run rather than argued.** Editing one constant in the contract made
`npm run build` refuse at prebuild with exit 1 and `next build` never started. Restoring it passed
both tiers. Flipping a single nibble of the deployed bytecode in the artifact passed tier 1 and was
caught by tier 2 — the useful case, since the source was untouched. And with `node_modules/solc`
moved aside, tier 2 reported itself SKIPPED in the output rather than quietly passing, while a
drifted contract in that same state still refused with exit 1. ⚠️ **The no-compiler path is not a
bypass**, which was the property worth demonstrating rather than claiming.

**One instruction I did not follow literally, and the reason is mechanical.** The brief said to reuse
`verify-ats.ts`'s trace-and-compile machinery rather than reimplement it. I reused it as a pattern —
the lazy `createRequire` + `require("solc")`, the Standard JSON Input shape, the version assertion,
and the compile-then-compare-and-refuse gate — but did **not import the module**. `verify-ats.ts`
resolves `@hashgraph/asset-tokenization-contracts` and `@openzeppelin/contracts` at **module scope**
(its lines 69–70) and imports `MIRROR`, which pulls in `ethers` and the ATS typechain. Importing it
would execute two `require.resolve` calls on contract packages — one a devDependency — inside the one
code path that has to keep working when the compiler is missing. A prebuild check that dies on an
unrelated missing package is worse than the drift it exists to catch. The trace half is moot anyway:
`AlphaMarket.sol` has zero imports, so the closure is one file. **`verify-ats.ts` is unmodified.**

**And the settings are deliberately not shared with it.** `verify-ats.ts`'s settings are a
*reproduction* of ATS's upstream hardhat config, reverse-engineered from a CBOR trailer because the
package ships no build-info. Ours are an *original choice* about our own contract. They coincide
today. Coupling them would mean a third party changing their build config silently changing the
bytecode we deploy — recorded at the top of the new file so nobody "fixes" the duplication later.

⚠️ **The pinned solc is asserted, not reported.** The script refuses if `solc.version()` is not
`0.8.28+commit.7893614a`, because a different compiler build produces different bytes and this
artifact is what gets deployed.

Nothing committed. Nothing deployed.

---

## 2026-09-10T05:30Z — End of session. Phase 4 is three units in.

⚠️ **The clock moved under this session and it matters.** Local time is Wednesday 22:27 PDT; **UTC is
already Thursday 2026-09-10, 05:30Z.** The plan's calendar is entirely in UTC — Vercel cron is UTC,
`dayStart()` is UTC, every epoch in PHASE-4.md is UTC — so the day the plan is counting has already
turned over. **~90 hours to the deadline. ~18 hours to `closeTime` for the D = Friday 11 demo
market.**

**Where today ended against the calendar, as arithmetic rather than judgement.** The plan puts the
contract deployed and the commit path working by Thursday, so the demo market can be created,
committed, staked and resolved by the crons before recording. Units 4, 5, 6, 6b, 6c and 7 plus the
deploy sit in that window. **Three units are done and none of those six has started.** The fallback —
D = Saturday 12, commit by Friday — buys 24 hours and leaves no spare cron attempt.

**What landed.** Unit 1, `src/arc/spec.ts` (357 lines) with `scripts/demo/spec.ts`, 38 assertions, no
network. Unit 2, `contracts/AlphaMarket.sol` (381 lines), compiling under the pinned solc with zero
errors and zero warnings, 4,783 deployed bytes. Unit 3, `scripts/ops/build-contract.ts` producing the
committed `src/arc/abi.ts`, with a `prebuild` gate that refuses on drift. ⚠️ **The contract is
compiled and not deployed. There is no Arc contract address.** Nothing from Phase 4 is on the
deployment: no market routes, no cron routes, no `crons` key in `vercel.json`, no migration past 004.

**Where each unit landed differently from its brief, and why.**

*Unit 1* narrowed the legal metric set further than the brief asked. The brief said balance and flow
legal, revenue refused by name; the repo's own record made two more classes unsafe. Lifetime
accumulators are refused for the same class of reason as revenue — morpho-blue's
`cumulativeDepositUSD` reads $3.78e23 and nobody swept the other 24 deployments — and TVL and the
three unmeasured daily flows are refused as *not individually swept*, since the measurement that
cleared balance and flow covered exactly four fields. The three refusal reasons stay distinct in the
messages, because measured-broken, measured-absurd and no-evidence-either-way are different claims
and only the third reverses with a sweep. It also gained `holds()`, which was not in the brief:
leaving equality undefined is the ambiguity that makes a market unresolvable, and defining it in the
resolver would mean settlement inventing the question.

*Unit 2* took the access-control decision the plan routed to it: an **immutable `resolver`** set in
the constructor, no setter. It uses **no OpenZeppelin and has zero imports** — the only candidate was
`ReentrancyGuard`, and checks-effects-interactions with the `claimed` flag set before any transfer is
sufficient, so a dependency inside the contract was not taken. And **`createMarket` enforces only the
ordering of the timestamps, not their relation to now** — the obvious `observationEnd >
block.timestamp` guard is absent because it would make the rehearsal market impossible, which is how
resolve, void and the empty-pool path get exercised without waiting a calendar day. The cost is that
a market can be created over a day already observed and the contract cannot tell.

*Unit 3* **does not import `verify-ats.ts`**, against the brief's instruction to reuse its machinery.
That file resolves two contract packages at module scope and imports `MIRROR`, which pulls `ethers`
and the ATS typechain — so importing it would put a `require.resolve` on a devDependency inside the
one code path that must survive a missing compiler. The pattern was reused; the module was not, and
`verify-ats.ts` is unmodified. Its compile settings are also deliberately not shared: that file's
settings *reproduce* ATS's upstream hardhat config, ours are an original choice, and coupling them
would let a third party's config change alter the bytecode we deploy.

**Open items are in PHASE-4.md's new stands-section** rather than repeated here — nine of them,
including the four already known, plus: no Arc RPC environment variable exists and Unit 4 needs one;
`buildEvidence` still has no destination; the repo has no LICENSE while the contract declares MIT;
and `resolveDeadline >= observationEnd + 2 days` is enforced in `spec.ts` but not on chain.

**Where this record went, and why it is split.** Unit states went into **PHASE-4.md's status table**,
which is the first thing anyone opens and the thing PHASE-3 recorded going stale three times. The
cold-start facts — the clock, what is deployed, the eight things to know before touching anything,
and the open items — went into a **new *Where this actually stands* section in PHASE-4.md**, matching
PHASE-3.md's shape exactly, because that is reference material a session needs at hand rather than
history. **This narrative stays here.** State in one place, history in the other, no duplication.

---

## 2026-09-10T21:50Z — Orientation pass, no code. The clock moved again and two open items closed.

**Nothing was built or changed.** A cold session read PHASE-4.md, the logs tail and DECISIONS.md,
re-ran the two standing checks and verified the record against the repo and against live Arc.
`npx tsc -p tsconfig.json --noEmit` exits 0. `migrate.ts` is a clean no-op, four migrations, tables
`purchases, quotes, report_tokens, reports, token_transfers`. `npm run check:contract` passes both
tiers — source hash matches and a fresh recompile is byte-identical at 4,783 deployed bytes.

⚠️ **It is 21:50Z Thursday, not 05:30Z.** The stands-section was written sixteen hours ago and its
"~18 hours to `closeTime`" is now **~2 hours**. Units 4, 5, 6, 6b, 6c and 7 plus the deploy are still
unstarted, so **D = Friday 11 is gone and the fallback is in effect** — D = Saturday 12, `closeTime`
Sat 12 00:00Z, ~26 hours out. Unit 12's own trigger ("not started by Thursday evening") has fired.

⚠️ **Open item 1 — Arc's EVM version — is answered, and the answer is favourable.** Arc testnet's
latest block header carries `blobGasUsed`, `excessBlobGas` and `parentBeaconBlockRoot` (Cancun) **and
`requestsHash` (Prague, EIP-7685)**. The chain is at or past Cancun, so the committed cancun artifact
is the right build and Unit 6 is not walking into a live revert. ⚠️ **Header fields prove the fork
level, not opcode execution** — the airtight check is executing `MCOPY`/`TSTORE`, which costs gas and
was not spent. Live `eth_chainId` returns `0x4cef52` = **5042002**, matching Unit 4's brief.

⚠️ **Both wallets are funded, so Unit 6 has no faucet dependency.** Deployer ~19.998 and the analyst's
Circle wallet ~17.499, native 18-dp. Unit 6's "fund the wallet first, and check the faucet still
works" is already satisfied and should not cost time today.

⚠️ **`ARC_WALLET` is the deployer EOA, not the analyst — and the record does not say so.** Derived
locally from `ARC_DEPLOYER_KEY`, the address is `0xA6B1…8079`, exactly `ARC_WALLET`'s value;
`analysts.ts` carries `arcAddress` `0x1b70…16a7`, the Circle wallet. Open item 4 records that the var
is read by nothing, which reads as harmless tidying. **It is a differently-named copy of a second
identity**, and Unit 4 is the file that adds both the chain constants and the guard that refuses when
`CIRCLE_WALLET_ID` does not resolve to the analyst's address. Whoever writes Unit 4 must not reach
for it.

**Also found:** the Arc RPC is not the only missing constant — `NATIVE_USDC`
(`0x3600…0000`) lives beside it as a hardcoded literal in `scripts/smoke/08-circle-payable-call.ts`,
and Unit 4 needs both. **`DECISIONS.md` has no Phase 4 entry**; its last section is 2026-09-08, and
Unit 2's two rewrite-shaped calls — the immutable `resolver`, and `createMarket` deliberately omitting
an `observationEnd > block.timestamp` guard so a rehearsal market is possible — are recorded in
PHASE-4.md's unit sections only. Last night's `logs.md` and `PHASE-4.md` edits are still uncommitted.

---

## 2026-09-10 — Phase 4 Unit 4: `src/arc/arc.ts`, the plumbing every Arc write shares

`src/arc/arc.ts` (329 lines, 142 of real logic) and its proof `scripts/demo/arc.ts` (120 lines, 70
of logic). `ARC_RPC_URL` added to `.env.example` and to the local `.env` so the proof runs. Nothing
else touched. `npx tsc -p tsconfig.json --noEmit` exits 0 and the proof passes 22 assertions against
live Arc and live Circle. ⚠️ **No transaction was sent** — two reads, and `submit()` is exercised in
Unit 6 where a deployed contract exists to send to.

⚠️ **142 lines of real logic is over this project's ~120 guideline, and I should have said so before
writing rather than after.** I estimated ~124 while planning and it came out 142. The brief names all
eight pieces as belonging to this one file so the content is not mine to cut, but **there is a named
seam if the size matters**: PLAN-v4 §9's original Phase 4 sketch listed a `units.ts` alongside
`spec.ts`, and the conversion site plus the `ARC` record is exactly that file. Splitting it is a
decision, not a tidy-up, so it was not taken unasked.

**The env-versus-constant call, which the brief left open.** `ARC_RPC_URL` is an **env var** — an
endpoint is an operational choice that rotates, rate-limits and differs on mainnet, and
`HEDERA_TESTNET_RPC` and `ETHEREUM_RPC_URL` are both env vars for that reason. The native-USDC
address is a **constant inside the `ARC` record beside the chainId** — `0x3600…0000` is a predeploy
the chain defines and cannot change without the chainId changing with it, so the two are one object.
That is `payments/server.ts`'s `NETWORKS` shape and its reasoning: the wrong combination is
unrepresentable. ⚠️ **A wrong RPC breaks reads and cannot mis-send money**, because every write goes
through Circle, which is told the wallet id and never the URL — which is what makes the split safe.

⚠️ **Two claims in the brief were verified in the shipped bundles before being relied on, and both
held.** `generateIdempotencyKey` is exported from the package's typings and appears **zero times in
both `.es.js` and `.cjs.js`** — a phantom, never import it. `idempotencyKey: t ?? ee()` is there
verbatim in `createDeveloperTransactionContractExecution`. **The same check paid for itself
immediately**: the SDK ships a real `waitForState` with a `signal`, present in both bundles, which
polls `INITIATED → CLEARED → QUEUED → SENT → CONFIRMED → COMPLETE`, rejects on the four terminal
failures with `errorReason` and `errorDetails` already in the message, and honours the signal in its
delay. **So the poll loop is the SDK's, not ours** — SM-08 hand-rolled one because this was not known
then, and reimplementing it here would have been a second state machine to keep correct.

⚠️ **A third instance of the empty-string bug, found while reading the bundle.** `t ?? ee()` means a
**blank** idempotency key is passed through rather than replaced — `??` falls back on `undefined` and
never on `""`, which is `config/env.ts`'s bug on a different rail. `submit()` guards it explicitly as
its first statement, before the identity lookup and long before Circle is asked to create anything,
and the proof calls `submit()` for real to demonstrate that ordering costs nothing.

**How the idempotency key reaches this file, since Unit 5's row does not exist yet:** it is a
**required** field on `SubmitInput` and this file will not invent one. The key has to survive a cold
start, so it belongs to whoever owns the row and is passed back in on the retry. Making it required
is what stops a caller silently falling through to Circle's per-call generation, where a duplicate
cron delivery would be a second transaction and a second spend.

**How the Circle id is recorded before the wait:** `onSubmitted?` is awaited between the create and
the wait, and every `ArcSubmitError` carries the id as well. ⚠️ **`inFlight` is the field that
matters** — the SDK rejects an aborted wait with a `DOMException` named `AbortError` (its `cause` is
the signal's reason, so the name is `AbortError` even for `AbortSignal.timeout`), and that is the one
signal separating *we stopped watching* from *Circle says it is dead*. The two want opposite
handling: reconcile the first by id, never retry the second. The wait is bounded at 45s so the error
path still runs inside Hobby's 60-second ceiling; a platform kill at 60 runs nothing.

**One thing the conversion site does that the brief did not ask for, and it is worth the four lines.**
`usdcFromNative` refuses a remainder rather than rounding it. `AlphaMarket.sol:93` declares
`UNIT_SCALE = 1e12` and `_checkAmount` reverts `NotAUsdcUnit` on exactly that condition, so rounding
here would turn a free local throw into a paid on-chain revert — and a silently truncated stake is
money a staker does not get back.

⚠️ **The guard's wrong address in the proof is not invented.** It is `ARC_WALLET` —
`0xA6B1…8079`, the deployer EOA derived from `ARC_DEPLOYER_KEY` — because that is a real address in
this project's own configuration and exactly the one someone reaches for when they want "the
analyst's Arc wallet". The analyst is `0x1b70…16a7`. **`ARC_WALLET` wants renaming to
`ARC_DEPLOYER_ADDRESS`**; not done here, because it is Unit 11b's file and this unit touches
`arc.ts` only.

---

## 2026-09-10 — Phase 4 Unit 5: `005_markets.sql` and `src/store/markets.ts`

The seven tables and the read-only module beside them, following PHASE-3 Unit 4's precedent where
`db.ts` and `001_init.sql` landed together. `005_markets.sql` (296 lines, 104 of DDL),
`src/store/markets.ts` (264 lines, 177 of logic) and `scripts/demo/markets-schema.ts`. `migrate.ts`
applied it and then ran again as a clean no-op with five migrations; the proof passes 30 assertions;
`npx tsc -p tsconfig.json --noEmit` exits 0. Twelve tables now exist and 001–004's four are untouched.

⚠️ **`markets.ts` is 177 lines of logic, well past the ~120 guideline, and unlike Unit 4 the seam
here is real rather than notional.** Seven tables' worth of row types, mappers and reads is more than
one thing — `tokens.ts` is 75 lines for one table. The natural split is **the two cron find-work
queries into their own module**, since they are the only reads with logic in them rather than a
SELECT and a mapper. Not taken unasked; the brief said this file.

**What the proof actually checks, and why it reads the catalogue rather than the file.** A migration
file says what was *intended*; `information_schema` says what is *there*. The two differ whenever
`IF NOT EXISTS` skipped a statement against an object that already existed in a different shape —
which is precisely the case a proof reading the `.sql` back would be blind to. So every assertion
queries the database: seven tables present, all seven amount-shaped columns reporting
`numeric(78,0)`, all four landmarks reporting `is_nullable = YES`, the three canonical-bytes columns
reporting `text`, `stakes.tx_hash` and `claims (market_id, author)` unique, and all eleven foreign
keys reporting `NO ACTION` rather than `CASCADE`.

⚠️ **The NUMERIC round-trip assertion was wrong in the first draft and the correction is worth
keeping.** I asserted that `Number()` would visibly mangle `2500000000000000000` — and it does not:
2.5×10^18 lands exactly on a representable float, so `String(Number(x))` returns it unchanged and the
assertion failed. **Being past `Number.MAX_SAFE_INTEGER` does not mean a value prints wrong; it means
values near it stop being distinguishable.** The honest demonstration, which is what the script now
makes, is that `Number()` cannot tell `2500000000000000000` from `2500000000000000001` — both become
the former — while `BigInt` can, and only one of those two is a legal stake under
`_checkAmount`'s `% 1e12` rule. `uint256` max is the case where `Number()` fails visibly
(`1.157920892373162e+77`), and it is in the script beside the subtle one. The driver returns NUMERIC
as a JavaScript **string**, all 78 digits survive, and `SUM` stays exact — which is the whole
justification for the column type over both BIGINT and TEXT.

**Two decisions inside the schema that were not in the brief.**

`spend_ledger` is UNIQUE on **`(tx_hash, kind)`**, not on `tx_hash` alone, and partial on
`tx_hash IS NOT NULL`. One Arc transaction spends a stake *and* its gas, so it is legitimately two
rows; two rows of the same kind for one hash would be one spend counted twice.

There is deliberately **no `decimals` column** on `spend_ledger`. Arc USDC is 18-dp and Hedera HBAR
is 8-dp tinybars, so a per-row scale would be a second source of truth about a number's units —
the exact bug this project keeps finding. The scale is a fact about `(rail, asset)` and lives beside
the conversion site in `arc.ts`. Summing across rails or assets is meaningless and the cap never
does it.

⚠️ **`rail`, `asset` and `kind` are CHECK-constrained and that is not a repeat of `quotes.state`.**
That column failed because it was a *mutable* value that had to be moved later by someone and never
was; these are written once at insert and describe what a row already is. Every genuinely mutable
fact in this migration is a nullable landmark instead.

### ⚠️ Three things a later Phase 4 unit may not be able to express, said now

⚠️ **`005` has already run against the live database, so per this project's own rule it must not be
edited** — a `CREATE TABLE IF NOT EXISTS` would skip on re-run and a fresh database would then
disagree with this one. These are reported rather than fixed, and the fix for any of them is a
decision about `006` or about dropping seven empty tables and re-applying.

1. **`markets` has `resolve_tx` and no `void_tx` or `voided_by`.** `voidMarket` is **permissionless**
   after `resolveDeadline` — anyone may call it — so the interesting facts are *who* voided a market
   and *which transaction did it*, and neither has a column. `voided_at` records that it happened
   and not the evidence for it. **Unit 9's, and the clearest of the three.**
2. **A human staker's payout has nowhere to go.** `claim(marketId, recipient)` is pull-based and
   emits `Claimed`, but `stakes` has no `claimed_at`, `payout` or `claim_tx`. This may be deliberate
   — the chain is the record and a market page can read `payoutOf` live — but Unit 6 drives `claim`
   by hand and Unit 14 puts humans on it, so it is inside this phase either way.
3. ⚠️ **`scores` is keyed per claim; the contract pays out per ADDRESS.** `claimed[marketId][msg.sender]`
   and `payoutOf(marketId, account)` aggregate an address's whole position in a market. If one
   address both commits a claim and stakes on another, its single payout does not decompose into
   "this claim's return", so `scores.returned` could not be filled from the chain. **It holds for
   Phase 4** because the analyst only commits — but it is an assumption the schema is resting on
   rather than a property it enforces, and it is worth knowing before Unit 15 writes to it.

---

## 2026-09-10 — Phase 4 Unit 5b: `006_market_landmarks.sql` — the void's evidence, and payouts

Two of the three gaps Unit 5 reported, fixed before Unit 6 drives those paths by hand.
`006_market_landmarks.sql` (103 lines, 13 of DDL), `src/store/markets.ts` updated to read the new
columns, and Unit 5's proof extended. `migrate.ts` applied it and then ran again as a clean no-op
with **six** migrations, every statement reporting skipped. The proof passes **39 assertions**;
`npx tsc -p tsconfig.json --noEmit` exits 0. ⚠️ **005 was not edited** — it has run against the live
database, and 002's header already settles what that means.

⚠️ **The payout does not go on `stakes`, and asking first was the right call.** The brief said to put
a staker's payout on `stakes`; reading the contract first showed that would have been wrong.
`claim(marketId, recipient)` pays `payoutOf(marketId, msg.sender)`, which returns
`staked[marketId][true][account] + staked[marketId][false][account]` — an address's **whole position
in a market**, including its committed prediction, because `commitPrediction` and `stake` both run
through the same `_add`. So an address with three stakes has three `stakes` rows and receives **one**
transfer. Columns on `stakes` would have meant either the aggregate repeated on all three rows —
making `SUM(stakes.payout)` three times the money that actually moved, in the one place an accounting
query would look — or a pro-rata split, which invents an apportionment the chain never made.

⚠️ **And the brief's own UNIQUE instruction would have backfired there.** `stakes.claim_tx` could not
take a UNIQUE: three legitimate rows share one claim transaction and the constraint would reject two
of them. **A `payouts` table keyed `(market_id, account)` is where that UNIQUE becomes true again** —
one `claim()` call is exactly one row, so `tx_hash UNIQUE` means what it says and a re-record is a
no-op. The primary key is the contract's own key: `claimed[marketId][msg.sender]` is a bool per
(market, address), and `PRIMARY KEY (market_id, account)` is the same statement in a database.

**The operator chose the payouts table** from three options put to them.

⚠️ **`payouts.amount` deliberately carries no `% 1e12` check**, and the proof asserts its absence
rather than leaving it to be noticed. `claims.amount` and `stakes.amount` must be whole 6-dp USDC
units because `_checkAmount` reverts otherwise; a payout is
`mine + (mine * losingPool) / winningPool` — integer division on a ratio — and is under no such
constraint. Copying the check across would have rejected legitimate payouts, and it is exactly the
kind of thing that gets copied.

**`void_tx` and `voided_by` took no UNIQUE, and that is not an oversight.** They sit on `markets`,
one row per market, and the contract reverts `AlreadySettled` on a second void — so re-recording is
an UPDATE of the same row, idempotent by construction. `stakes.tx_hash` needs UNIQUE because a
re-record there would INSERT a second row; there is no second row to insert here.

**The third gap stays open, recorded as a stated assumption in 006's header rather than built
around.** `scores` is keyed per claim while payouts are per address, so `scores.returned` is fillable
only while an address holds exactly one position in a market — true for Phase 4, since the analyst
commits and does not also stake. Enforcing it would mean the database refusing a transaction the
chain would accept, which makes the record disagree with the ledger it describes. ⚠️ **`payouts` is
now the honest source for that number**, and Unit 15 should derive `scores.returned` from it rather
than measure it a second way.

⚠️ **`markets.ts` is now 215 lines of logic against a ~120 guideline** — it was 177 after Unit 5 and
this added a table. Flagged then, worse now. The same seam still applies: the two cron find-work
queries are the only reads with logic in them rather than a SELECT and a mapper, and they would move
cleanly. Still not taken unasked.

---

## 2026-09-10 — Phase 4: the store seam, taken

The two reconciliation queries moved out of `src/store/markets.ts` into a new
`src/store/outstanding.ts` (70 lines, 26 of logic). `scripts/demo/markets-schema.ts`'s import line
moved with them and gained one section. No schema change, no new migration, no writes.
`npx tsc -p tsconfig.json --noEmit` exits 0 and the proof passes **40 assertions**, its existing ones
unchanged.

**A move, not a redesign.** Both functions went across verbatim — same SQL, same parameters, same
return type — and the only structural consequence is that `MarketRow` and `toMarket` are now
`export`ed from `markets.ts`, because a second copy of the mapper would be a second answer to what a
market row means. That is a visibility change, not a behaviour change, and the header says they are
the seam rather than a public API.

⚠️ **The module is named `outstanding.ts`, not `cron.ts`, and that mattered more than it looks.**
The obvious name would have been wrong on arrival: Unit 12 drives both of these paths **by hand**
before any cron exists, and Unit 6 drives them before that. What the two queries have in common is
not their caller, it is that they ask what is outstanding *now*, from scratch — which is the property
Vercel's best-effort delivery forces, since a run can silently not happen and the same run can arrive
twice.

⚠️ **`outstanding.ts` does not re-export `close()`.** `markets.ts` already re-exports the closer for
scripts, and a second export of the same function is how a script ends up calling `end()` twice —
`closePool` is idempotent precisely because that already happened once with `reports.ts`,
`tokens.ts` and `quotes.ts`.

**One pooled client was demonstrated rather than argued.** `db.ts` has carried
`pooledClientsCreated()` since the Phase 3 consolidation and its own comment recorded that nothing
read it — **this proof is now its first caller**, which is the counter finally doing the job it was
kept for. Splitting one store module into two is exactly the change that would quietly undo that
consolidation, and "I imported `db()` rather than `pooled()`" is a claim about code rather than a
measurement. After a run touching `db.ts`, `markets.ts` and `outstanding.ts`, the count is **1**.

⚠️ **The cut was taken as briefed and it does NOT bring `markets.ts` under the guideline: 215 → 191
logic lines.** The two queries were the right cut — they were the only reads carrying real logic
rather than a SELECT and a mapper — but they were only 24 lines, and the remaining bulk is not logic
at all. It is eight tables' worth of `interface` + row type + mapper + plain read, which is mass
rather than complexity. **If it is cut again the seam is by table group, not by query kind** —
`markets`/`claims`/`stakes` are the market itself, while `scores`, `settlement_evidence`,
`binding_evidence`, `spend_ledger` and `payouts` are records *about* it. Not taken: nothing has asked
for it, and the guideline is about what a human can read in a sitting rather than a number to hit.

---

## 2026-09-11 — Phase 4 Unit 6: AlphaMarket deployed to Arc testnet, every path driven

**`AlphaMarket.sol` is deployed at `0x003e7Cb791257B529bb5f9F6D17A846264d48044`** with the analyst's
Circle wallet as the immutable resolver. Every path in the brief was driven on chain across **21
transactions** for **0.051198058400910441 USDC** of gas, and the contract ended holding **zero**.
`scripts/ops/drive-market.ts` does the driving; `scripts/demo/verify-market.ts` re-checks the result
from the chain alone for free. `ARC_MARKET_ADDRESS` recorded in `.env` and `.env.example`.

⚠️ **No contract bug was found, and nothing was worked around.** That is the outcome this unit
existed to determine, so it is worth saying plainly rather than burying: four markets, every
settlement path, every refusal, and the arithmetic held exactly.

**The EVM version question, answered three ways.** Header fields carry `blobGasUsed`,
`excessBlobGas`, `parentBeaconBlockRoot` **and `requestsHash`** — the chain is Prague, past Cancun.
The on-chain code equals the committed artifact. ⚠️ **But the check I would actually rely on is the
third: view calls into the deployed runtime bytecode EXECUTE.** Header fields say what a chain
advertises; only running cancun-era codegen proves it runs. It cost nothing — an `eth_call` right
after deploy — so the question of whether header fields were "sufficient" did not need answering in
the abstract.

⚠️ **The artifact and the on-chain code are NOT byte-identical, and my first assertion that they
should be was wrong.** `resolver` is `immutable`, so the constructor writes the address INTO the
runtime code: two 32-byte slots, at bytes 253–272 and 1949–1968, hold the analyst where the artifact
holds `PUSH32 0`. Measured, not guessed — 74 differing nibbles, all inside those two slots. The check
now masks the resolver back out, which makes it a real equality test instead of a length comparison.

### The four rehearsal markets

| | pool | outcome | what it proved |
|---|---|---|---|
| M1 (id 2) | 0.02 | resolved TRUE | redistribution — winner took the whole pool, loser got nothing |
| M2 (id 3) | 0.03 | resolved FALSE | **empty winning pool**: analyst refunded EXACTLY 0.01, staker EXACTLY 0.02 |
| M3 (id 4) | 0.02 | **voided** by the deployer | permissionless void, both refunded EXACTLY their stakes |
| M4 (id 5) | 0.01 | resolved TRUE | single staker refunded EXACTLY its stake |

⚠️ **The two checks the research said cost people money both hold, exactly rather than approximately.**
Every refund equalled its stake to the wei, and `payouts ≤ pool` held per market. The global check is
the strong one: **the contract's balance is 0 after the last claim**, read from the chain rather than
from adding up what we expected — so total paid out equals total staked with nothing stranded and
nothing overpaid.

⚠️ **A market cannot be stakeable and resolvable at the same instant, and that is the contract, not
the script.** `_open` refuses at `closeTime`, `resolve` refuses until `observationEnd`, and
`createMarket` requires `closeTime < observationEnd`. So a rehearsal still has to wait out a real
gap — 420 seconds here. **Unit 12's demo market cannot be compressed below this either**, which is
worth knowing before anyone plans the recording.

### Two findings about guard ORDER, both caught by my own checks being wrong first

⚠️ **The drive script's "second resolve is refused" check was weak and I only noticed reading the
output.** It was sent as the deployer, so `NotResolver` fired before `AlreadySettled` could — it
re-tested the guard above it and proved nothing about double resolution. `scripts/demo/verify-market.ts`
exists because of that, and it sends every refusal **as the caller that actually reaches the guard**:
as the resolver, M1 answers `AlreadySettled`; as anyone else, `NotResolver`.

⚠️ **`TooEarlyToVoid` became unreachable the moment M4 resolved.** `voidMarket` checks
`resolved || voided` BEFORE the deadline, so a resolved market answers `AlreadySettled` even when its
deadline is a day away. It **was** proven live on M4 during the drive run while the market was still
open — but it cannot be re-proven afterwards, and asserting it in the verify script was simply wrong.
**A refusal test's expected error depends on the state the market is in**, which is not obvious until
a guard order puts it in front of you.

### What this cost, and who paid

| | txs | gas |
|---|---|---|
| analyst, through Circle + Unit 4's `submit()` | 11 | 0.032438042400910441 |
| deployer, through ethers | 10 | 0.018760016 |
| **total** | **21** | **0.051198058400910441 USDC** |

⚠️ **Circle's transactions cost noticeably more than ethers' for the same work** — the analyst's
`commitPrediction` ran 0.0043–0.0058 against the deployer's 0.00375 for an identical call. `submit()`
sends `feeLevel: MEDIUM`; ethers used the node's default. Not a problem, but it is a real per-call
premium on the rail every cron write will use, and nobody had measured it.

**Unit 4's `submit()` was exercised 11 times and held.** ⚠️ **The open question it carried is now
closed: Circle's `abiParameters` encodes `uint256`, `bytes32` and `bool` correctly** — passed as a
decimal string, a `0x` hex string and a JavaScript boolean. Nothing needed `callData`. Every commit,
resolve and claim by the analyst went through it, and `claimId` came back off the
`PredictionCommitted` event exactly as the contract's comment promised it would have to.

**One script bug, no contract involvement.** The first run deployed and then died in Phase 2 reading
a receipt before the transaction was mined. ⚠️ **The fix matters beyond this script**: `submit()`
returns at `SENT`, so a Circle transaction is *also* un-mined when the hash arrives — anything that
wants a receipt must `waitForTransaction`, not `getTransactionReceipt`. A `--address=` flag was added
so the re-run reused the deployed contract rather than spending 0.024 USDC replacing a correct one.

⚠️ **Market id 1 is stranded and harmless.** It was created by the first run before it died, carries
no commits and no funds, and will sit open forever unless someone voids it. Market ids in this
deployment therefore start at 2, which is why the four rehearsal markets are ids 2–5.

⚠️ **These four commits are after the fact and are NOT forecasts.** They are a machinery proof. The
demo market is the only one whose result means anything.

---

## 2026-09-11 — Phase 4 Unit 6b: `src/arc/identity.ts`, the two-way key attestation

`src/arc/identity.ts` (the sentence, two signing calls, a verifier),
`scripts/ops/attest-identity.ts` (produces then proves, with `--check` and `--force`), and the
generated `src/arc/attestation.ts` (30 lines, committed). 11 assertions pass;
`npx tsc -p tsconfig.json --noEmit` exits 0. ⚠️ **No transaction, no gas** — confirmed by reading the
analyst's Arc balance either side of the Circle call: 17.476743944841969559 USDC, unchanged, exactly
where Unit 6 left it.

**What it closes.** Three of the four links between a report and a stake were already public facts on
public chains — the token carries `alpha:<hash>`, the analyst issued it, an Arc address committed
that hash. The fourth, joining the Arc address to the Hedera issuer, was `config/analysts.ts`: our
file, on our repo. It is now a claim backed by two signatures anyone can recover.

⚠️ **Verification, not enforcement, and the file says so rather than reading stronger than it is.**
The Arc contract never sees these signatures — `commitPrediction` takes a `bytes32` and does not care
where it came from — so a commit remains possible without any attestation existing. A verifier has to
*choose* to check. What it buys is narrow and real, and it does not stop anyone doing anything.

**The sentence, and why each part is in it.** Schema line for domain separation, so the same 65 bytes
cannot be re-presented as an attestation to something else. **Both addresses, which is the whole
point** — a signature over "I am the analyst" proves only that a key signed a sentence, while a
signature over a sentence *containing both addresses* is what ties them, because neither key could
produce it alone. The analyst id so a reader can find the row. Both chain ids, because an address is
only meaningful on a chain. The `0.0.x` account, since the consensus world speaks that and the EVM
world speaks the alias. ⚠️ **No timestamp and no nonce inside the signed bytes** — the claim is
permanent, and a date would make a standing fact read as a moment. `producedAt` sits beside the
signatures, outside what was signed, marked as provenance.

**Where the signatures live: `src/arc/attestation.ts`, committed, generated — `abi.ts`'s pattern.**
⚠️ **Not the database, and that is the substance of the decision.** A verifier is a stranger holding
this repo and two public RPCs; a row in our Neon instance would be checkable only by us, which is
precisely the problem the unit exists to remove. A committed file also needs no migration and no
network to read. Not a field on `config/analysts.ts` either — that file is hand-maintained and
checked against live services, and mixing a generated artifact into it would have needed your
sign-off anyway.

⚠️ **If either key changes the file is void and must be regenerated**, and the Arc half is the harder
one: `AlphaMarket`'s `resolver` is immutable with no setter, so a new Arc key means a **new contract**,
not a reconfigured one. That is the same thing this project says everywhere else — a lost key is a
new analyst, not a restored one.

### ⚠️ A near-miss worth recording: the phantom-export heuristic does not generalise

`encodedByHex` appears **three times in the typings and zero times in both shipped bundles** — the
exact signature of `generateIdempotencyKey`, the phantom this project was caught by in Unit 4. I
flagged it as a seventh instance. **That conclusion was wrong**, and reading the bundle rather than
stopping at the count is what showed it.

The rule is about **functions that must exist to be called**. `encodedByHex` is a request **field**,
and the client spreads its entire input into the HTTP body —
`Signing.signMessage({entitySecretCiphertext: await z(e)(), ...s})` — so the bundle never names it
and has no need to. It is forwarded. ⚠️ **A grep count distinguishes a missing function from a
present one; it says nothing about a field riding a spread.** Recorded in `identity.ts` so the next
person applying the heuristic gets the boundary with it.

We omit the field anyway and sign plain UTF-8, which sidesteps the question instead of answering it.

**Two facts confirmed live that were previously assumptions.** Circle's `signMessage` returns a
standard **EIP-191 `personal_sign`** signature — `ethers.verifyMessage` recovers it directly, with no
hex encoding and no custom prefix. And it is genuinely not a transaction: no fee field, no
`TransactionState`, and the measured balance did not move.

**The proof does its recovery with `ethers.verifyMessage` and nothing this unit wrote**, so the check
is not the thing being checked; `verifyAttestation()` is then compared against that independent
result rather than trusted. Tampering the message moves the recovered address; swapping the two
signatures fails **both**; a malformed signature is refused rather than thrown, which matters because
a verifier should not crash on bad input. ⚠️ **The check that matters most is that neither signature
recovers the other's address** — if one did, the attestation would prove one key exists twice rather
than two keys agreeing.

---

## 2026-09-11 — Phase 4 Unit 6c: `src/arc/admission.ts`, the binding check before a commit

`src/arc/admission.ts` and `scripts/demo/admission.ts`. 18 assertions pass against live Hedera and
live Arc; `npx tsx tsc --noEmit` exits 0. ⚠️ **Nothing spent** — measured, not asserted: the analyst's
Arc balance is read either side of the whole run and is unchanged at 17.476743944841969559 USDC,
exactly where Unit 6b left it. Two Mirror GETs, one Circle wallet lookup, database reads.

**The rule, enforced:** no commit unless a token exists, its creation event carries `alpha:<hash>`,
and this analyst issued it. Refusals throw `BindingRefused` with a sentence naming which of the four
reads failed.

### ⚠️ The brief's `receipt.from` would have refused every report we have

Mirror Node reports the signer of a deploy transaction in **long-zero** form — the account number
padded to twenty bytes, `0x00000000000000000000000000000000009e80ea` for account `0.0.10387690`.
The analyst row's `hederaEvmAddress` is the **ECDSA alias**, `0x32838fe9…`. They are the same
identity and they are not the same string, so `receipt.from === analyst.hederaEvmAddress` is false
for all four of our tokens. Measured across every one of them before writing the check.

**The fix is better than a correction.** `EquityDeployed`'s indexed `deployer` argument carries the
alias and matches `hederaEvmAddress` directly, while `from` matches `hederaAccountId` in long-zero
form. ⚠️ **Both are checked, which is strictly stronger than either** — two independent encodings of
one identity, from two different parts of the same record, and `config/analysts.ts` already stores
both forms on purpose for exactly this reason ("recording one fact twice, because deriving one from
the other at each call site is where they drift"). A mismatch in either refuses.

### The holding-versus-issuance test, which is the one that mattered

⚠️ **A report whose token now sits with the buyer is ADMITTED**, and the proof shows it. Three of our
four tokens were moved by Phase 3's Unit 10 on purpose, because H2.4 wants a lifecycle operation on
camera — so a check built on `balanceOf` would refuse three quarters of our own work, and **the act
that satisfies one requirement would break the other**. This file reads the deploy transaction and
never asks who holds anything. The ISIN is not checked either: `isinFor()` is a pure function of the
report hash, so comparing them checks our arithmetic rather than the chain.

### ⚠️ Guard ordering bit a test for the third time this phase, and a schema rule closed a case

Test 4 — "a hash the creation event does not carry" — took three attempts, and both failures are
recorded in the script because each taught something:

1. **A made-up proxy `0x1111…`** made Mirror's proxy lookup fail *first*, so the refusal came from
   read 1 and the commitment check was never reached. A passing-looking test of the wrong guard —
   the same mistake as Unit 6's second-resolve check, and Unit 6's `TooEarlyToVoid` before that.
   ⚠️ **A refusal test has to be built to reach the guard it names**, and that is now three for three.
2. **A second `report_tokens` row on a real proxy** was refused by the schema:
   `report_tokens.proxy_address` is UNIQUE in 001_init. ⚠️ **Worth knowing on its own — two rows
   claiming one proxy are already impossible**, so the only shape this check has to catch is a row
   pointing at a deploy transaction that is not its own.
3. What works: swap one column on a real row, test, and restore it in a `finally`. The proof asserts
   the restore and a separate read afterwards confirms all four `deploy_tx` values are as they were.

### What the evidence record is and is not

⚠️ **It does not prove the check ran.** A reader has to trust us for that and no row in our database
can fix it. Its value is narrower: it names **exactly what to re-check** — proxy, deploy transaction,
issuer address, report hash, Arc transaction — and every one is independently readable off two public
chains by somebody who believes nothing we say. **Detectable by anyone, enforced by no one.** That
sentence is in the file so it cannot be read as stronger than it is.

⚠️ **`arc_tx` is NULL at check time and that is correct**, not a gap: the check runs before the commit,
which is the point. `recordArcTransaction` completes the row once Unit 7 has a hash, and the proof
exercises both halves. `raw` is 554 bytes of canonical JSON as TEXT — never jsonb, same rule as
`settlement_evidence`, same reason. `recordBinding` is idempotent on `claim_id` so a retried commit
re-records rather than colliding.

**What Unit 7 calls:** `checkBinding(reportHash)` → evidence or `BindingRefused`, then
`recordBinding(claimId, evidence)` before submitting, then `recordArcTransaction(claimId, hash)`
after it lands. ⚠️ The claims row must exist first — `binding_evidence.claim_id` is a foreign key
into it — which matches 005's design of writing the row before the chain call.

⚠️ **The contract cannot help and never will.** To `AlphaMarket`, `reportHash` is 32 arbitrary bytes;
an analyst could commit the hash of a report that does not exist, was never tokenized, or belongs to
somebody else, and `commitPrediction` would accept all three. This unit stops that **for us**, not
for everyone.

---

## 2026-09-11 — Phase 4 Unit 7: `src/arc/market.ts` — built, proven, and BLOCKED on one call

`src/arc/market.ts` and `scripts/ops/commit-market.ts`. `npx tsc -p tsconfig.json --noEmit` exits 0.
The dry run passes every refusal and prints a complete plan. ⚠️ **The real run stopped at
`createMarket` and nothing was spent** — balance identical at 17.476743944841969559 USDC.

### ⚠️ THE BLOCKER: Circle cannot pack a struct, so `submit()` cannot send `createMarket`

Circle refused to build the transaction — **`ABI_SIGNATURE_PARAMS_MISMATCH: ABI function signature
can't pack ABI parameter`** — and refused it at validation, before broadcast, so no gas moved.

**Why it never surfaced before.** `createMarket` takes a **tuple** (`QuestionCore`).
`commitPrediction` is `uint256,bytes32,bool` — **all scalars**, which is exactly what Unit 6 drove
through Circle four times successfully. Unit 6 created its markets through **ethers with the deployer
key**, so the one call with a struct argument never went down the Circle rail until now. The SDK's
own typings say the quiet part: *"Supported parameter types include string, integer, boolean, and
array."* A tuple is not on that list.

⚠️ **`arc.ts` cannot express what this unit needs, and the brief said to say so rather than reach
in.** `submit()` only builds `abiFunctionSignature` + `abiParameters`. Circle's input type also
accepts **`callData`** (mutually exclusive with those two), which would let us encode the struct
ourselves with the committed ABI — verified locally: `ethers` encodes it to selector `0xc67094c9`,
266 chars, and decodes back intact. ⚠️ `callData` appears 10 times in the typings and 0 in the
bundles, which is the **field-riding-a-spread** case established in Unit 6b, not a phantom export —
the client spreads its whole input into the HTTP body. **Not taken. It is Unit 4's file.**

**Nothing is stranded.** One `markets` row exists carrying its idempotency key with
`chain_market_id` NULL — which is 005's "row before the chain call" design working exactly as
intended, and a retry will reuse that key rather than mint a second one. No claim, no evidence row.

### ⚠️ A commit through `market.ts` is ALWAYS a forecast, and that is structural

`questionCore` requires `closeTime <= dayStart(observedDay)`; the contract's `_open` requires
`closeTime > now`. Together: `dayStart(observedDay) > now`, always. **The rehearsal shape Unit 6
drove is unreachable through this module** — Unit 6 could only build those markets because it went
through ethers and bypassed `spec.ts` entirely. So `spec.ts` enforces the honest shape that the
contract deliberately does not. Today that makes the earliest legal observed day **2026-09-12**,
which is the calendar's fallback demo-market shape; it is forced by the clock, not chosen.

### ⚠️ How the analyst picks a side — this unit owns it, and the data corrected the first draft

**The rule: the report's measured figure for the market's subject, compared against the threshold
with `holds()` — the same function settlement uses.** Deterministic, no second model call: a
60-second function cannot afford one, and a deterministic rule is **auditable in a way a model call
is not** — anyone holding the report and the spec recomputes the same side forever.

⚠️ **The first draft used `report.subject.headline` and would have refused every report we have.**
All nine reports in the store have the headline `metric.totalDepositBalanceUSD` — the `metric.`
sentinel `compose.ts` mints for a metric ACROSS deployments — which `metricFromFactId` refuses by
design. Every headline fact is also **WITHHELD**, and every `verdict.call` is **null**. The rule now
looks up `facts['{slug}.{metric}']`, the report's answer to the question the market actually asks,
and those carry real values: `aave-v3-ethereum.totalDepositBalanceUSD` = 24,633,533,926.81.

⚠️ **Stated plainly because it is a real weakening:** the figure the analyst stakes on may not be the
figure its report leads with. It is still a figure that report measured and published — the fact
table is the only place a digit exists — but "the report is the justification" is now "the report
measured this", not "the report is about this".

⚠️ **The honest cost of the rule:** the analyst cannot predict a REVERSAL. A report measuring 24.6B
can only commit to "still above 24.4B", never to "about to fall through it". The judgement lives in
the **threshold**, chosen when the market is created.

⚠️ **`verdict.call` being null is the NORM in our data, not an edge case.** All nine reports carry
null. The brief said handle it rather than assume a verdict exists; it is surfaced in the plan and
printed, and nothing branches on it.

### The refusals, each proven to fire at the guard it names

Five cases, all passing, all reaching the guard they test: an illegal metric, a non-decimal
threshold, a `closeTime` inside the observed day (past-posting), an untokenized report through Unit
6c's admission check, and a wrong `CIRCLE_WALLET_ID`.

⚠️ **The wrong-wallet case needs a COLD CHILD PROCESS**, and that is not ceremony:
`analystIdentity()` is memoized, so reassigning the env var in-process would be read by nothing and
the test would "pass" by failing somewhere else. The script spawns itself with a different
`CIRCLE_WALLET_ID`.

⚠️ **And it found a second small thing about Unit 4's guard: Circle THROWS for an unknown wallet id
rather than returning an empty body**, so `arc.ts`'s `if (!wallet)` branch — "does not resolve to a
wallet" — is unreachable for that case and the operator sees Circle's sentence instead. The refusal
is still correct and still loud; only the wording is not ours. Asserting our sentence there would
have been asserting a branch that never runs.

---

## 2026-09-11 — Unit 7 unblocked: `callData` on `submit()`, and an idempotency trap that cost two runs

The blocker above is resolved and the market is live. **On-chain market 6, claim 6**, created and
committed through Circle by the analyst. `tsc` exits 0, every refusal still passes, and the struct
round-trips off the chain. **Total cost 0.01740410400646 USDC** — 0.01 stake plus 0.0074 gas across
both writes.

### ⚠️ `callData` was verified in the bundle, not inferred from Unit 6b

The operator was right to insist on re-checking rather than carrying the `encodedByHex` conclusion
across — a forwarded field and a dropped field look identical from a grep count. Read again, at both
layers:

- the client wrapper destructures exactly `idempotencyKey`, `fee` and `xRequestId` and spreads
  **everything else** into the request object;
- the API layer then does `c.data = M(t, c, e)` — serializes the **whole object**, no field whitelist.

So `callData` reaches the body. **Confirmed by mechanism, and it now works in production.**

⚠️ **The pair was NOT tested live, deliberately.** Circle's own field documentation states *"the
usage of `callData` is mutually exclusive with the `abiFunctionSignature` and `abiParameters`"*, and
the failure mode of testing it is an **unintended transaction** if Circle happens to accept both. So
`SubmitInput` is now a **discriminated union** and sending both is unrepresentable — a type that
cannot express the invalid pair is worth more than a test that observed it once.

`arc.ts` now documents why both shapes exist: `abiParameters` for flat arguments, `callData` for
anything with a tuple. `createMarket` is the only function in this contract taking a struct, which is
why it took until Unit 7 to surface.

### ⚠️ THE TRAP: Circle's idempotency cache replays a prior FAILURE and ignores the new body

The first retry after the fix **failed identically** — same `ABI_SIGNATURE_PARAMS_MISMATCH`, and
crucially **the same Circle transaction id `148dbd02-…`, created at 06:32:13Z**: the timestamp of the
*original* attempt. The market row had stored a `randomUUID()` on attempt 1, `create()` correctly
reused it, and **Circle returned the cached outcome of the original request. The new `callData` body
was never looked at.**

⚠️ **So a stored idempotency key pins the request BODY, not just the row.** This is the dangerous
shape: a cron that stores a key, then gets a bug fix, will replay the old failure forever and never
send the corrected call — a permanently wedged job whose logs say only that Circle failed. **Unit 10
would have hit this.**

**The fix, and it is strictly better than what the brief asked for:** the key is now **derived from
the call** — `sha256(rowId + the bytes being sent)`, shaped as a v4 UUID. A genuine retry of the same
request computes the same key and cannot double-spend, which is the whole point; a *changed* call
computes a new one automatically. ⚠️ It also sidesteps Unit 4's open question — "not derived from a
hash until someone has checked whether Circle validates the UUID shape" — because the derived value
**is** a well-formed UUID, so the question stays unanswered rather than gambled on. The row still
records the key that was used; it is no longer the thing that decides it.

⚠️ **Nothing was ever spent on either failure.** Both were rejected at Circle's validation, before
broadcast — balance sat at 17.476743944841969559 USDC across all three attempts.

### The market that now exists

| | |
|---|---|
| question | is `aave-v3-ethereum.totalDepositBalanceUSD` **above 24,387,198,586** on **2026-09-12** UTC? |
| analyst's side | **TRUE**, staked with 0.01 USDC of its own money |
| why | the report measured it at 24,633,533,926.81 at block 25930744 |
| closes | 2026-09-11T23:59:00Z |
| observation ends | 2026-09-13T00:00:00Z |
| resolve deadline | 2026-09-15T00:00:00Z |
| bound to | proxy `0xE7aaEFB1…`, issued by the analyst in `0xe4c1dcb1…` |

⚠️ **This is a real forecast, not a rehearsal** — and it could not have been anything else.
`questionCore` requires `closeTime <= dayStart(observedDay)` while the contract's `_open` requires
`closeTime > now`, so the observed day is always ahead. **D = 2026-09-12 is the calendar's fallback
demo-market shape**, forced by the clock rather than chosen.

⚠️ **`prepare()` now refuses this market**, proven in the same run — one claim per author per market,
caught before spending gas to learn it from the contract.

---

## 2026-09-11 — Phase 4 Unit 8: `src/arc/settle.ts` — the read, its evidence, and a finding about the live market

`src/arc/settle.ts` and `scripts/demo/settle.ts`. 22 assertions pass against the live gateway;
`npx tsc -p tsconfig.json --noEmit` exits 0. ⚠️ **No chain calls and no gas** — asserted
structurally rather than promised: the proof reads `settle.ts`'s own imports and fails if it can
reach Arc at all. A unit that cannot import the chain cannot spend on it.

**The seam is closed.** `buildEvidence` now has a destination. A settlement read produces a
`record+raw` `EvidenceRecord`, it is persisted to `settlement_evidence` **before** anything goes on
chain, and `evidenceHash` is taken over it. Unit 9 owns the chain write and this file has no path to
one.

**The proof's hardest check, done the way it was asked for:** `responseHash` is re-hashed from the
bytes **read back out of the database**, not from the object still in memory — and confirmed twice,
once through `verifyStoredEvidence` and once by hand so the check does not rest on the module's own
helper. `raw` comes back byte-identical to what was written (1,658 bytes), which is the property
TEXT-not-jsonb exists to give: under jsonb the keys would return reordered and the row would be a
hash with nothing behind it.

**Also proven:** a real past day (2026-09-09) settles with a real figure; the read is UNPINNED
(`requestedBlock` null) which is the only reason a timestamp exists to check freshness against; an
**exact tie resolves FALSE** end to end, matching `holds()` called directly; 2021-01-01 returns
`MISSING_OBSERVATION` with `rowCount` 0 and evidence of having looked; and **2026-09-12 — the live
market's own day — is refused** as `SettlementTooEarly`, which is a retry rather than an outcome.

⚠️ **`SettlementTooEarly` is thrown while `MISSING_OBSERVATION` is returned, and the split is
deliberate.** "Too early" is information about *when we asked*; "missing" is information about *the
data*. Unit 11 skips the first and records the second.

### ⚠️ A FINDING ABOUT THE LIVE MARKET, and it is about Unit 7's side rule rather than this unit

Reading the recent series against the live market's threshold of **24,387,198,586**:

| day | `totalDepositBalanceUSD` (daily snapshot) | vs threshold |
|---|---|---|
| 2026-09-06 | 24.696B | above |
| 2026-09-07 | 24.513B | above |
| 2026-09-08 | 24.517B | above |
| 2026-09-09 | 24.243B | **below** |
| 2026-09-10 | 24.074B | **below** |

**The metric has been falling and is already below the threshold, two days before the observed day.**
The analyst committed **TRUE**. That forecast is currently losing, and it may well resolve FALSE.

⚠️ **A forecast being wrong is not a bug — but two things made it more likely, and both are in the
side rule I wrote in Unit 7:**

1. ⚠️ **The report is THREE DAYS STALE.** It was observed `2026-09-08T06:05:59Z` and was used on
   2026-09-11 to forecast 2026-09-12. **Nothing in `prepare()` checks how old a report is.** The rule
   compared a figure measured before the fall had happened.
2. ⚠️ **THE SIDE RULE COMPARES ACROSS TWO DIFFERENT SOURCES.** The report's
   `aave-v3-ethereum.totalDepositBalanceUSD` comes from the **`balance-sheet`** document — the
   protocol entity's live state. Settlement reads **`financialsDailySnapshots`**. Same metric NAME,
   different entity, and they do not agree: 24.634B against 24.517B for the same day, ~0.5% apart.
   **The analyst is deciding from one series and being judged on another.**

**Three ways out, and it is not this unit's call:**

- have the side rule read the latest daily snapshot through `settle()`'s own path, so the analyst
  predicts from the series it will be scored against — the honest fix, and it makes A1's "decision
  logic tied to real signals" tie to the *right* signal;
- refuse a report older than some age in `prepare()`;
- accept it and let Unit 15 score it, which is what the loop exists for.

⚠️ **I did not flag the source mismatch in Unit 7 and should have.** The brief said "the report's own
figure against the threshold" and I implemented exactly that, but `LEGAL_METRICS` map to
`FinancialSnapshot` fields — the connection to settlement's source was visible in `spec.ts` and I did
not check that the report's fact of the same name came from the same place. **The live market is the
cost of that**, and it is small: 0.01 USDC and a forecast that may be scored as wrong.

⚠️ **Nothing here resolves the live market** — Unit 8 has no chain path, and the only call made
against 2026-09-12 was the freshness test, which correctly refused.

---

## 2026-09-11 — The side rule now decides from the series it is scored on

`src/arc/market.ts`'s `decideSide` rewritten, the staleness decision recorded in `prepare()`,
`scripts/ops/commit-market.ts` updated, and the finding written up in `tracking/lessons.md`.
`npx tsc -p tsconfig.json --noEmit` exits 0. **Market 7 created and committed** with the fixed rule,
for **0.0193190208952 USDC** — 0.01 stake plus 0.0093 gas.

**The fix: `decideSide` calls `settle()`.** Not "also reads the snapshot series" — it calls the
function settlement calls, against the latest finished day, and takes its outcome. The side is
therefore **by construction** what settlement would decide on the most recent data. Two reads of one
series that could disagree is the bug being fixed, so a second copy of the window arithmetic, the
freshness rule and the comparison would have been the same bug in a new file. It walks back from
yesterday up to seven days, skipping `SettlementTooEarly` (today has not finished) and refusing if a
week produces nothing — a series that has stopped publishing would void rather than settle.

⚠️ **The report is untouched as the justification.** The claim is still bound to a tokenized report,
admission still runs, and a report with no fact for the market's metric is still refused. Only the
source of the *number* moved. **Both figures now ride on the decision and print before spending**, so
a divergence is a line an operator reads rather than something resolved silently.

**Proved, with both numbers shown:**

```
side rule   24074775695.03695740498966507765232  → TRUE
settlement  24074775695.03695740498966507765232  → TRUE
report      24633533926.80993183529872440370819  (balance-sheet entity — NOT what settles)
```

Identical to the last digit, same outcome, and still **2.3% away from the report's figure** — the
divergence did not go away, it stopped being silent. ⚠️ The threshold in the run script now derives
from the snapshot series too; deriving it from the report was part of the same mismatch and would
have set the bar against a number nothing is ever measured against.

⚠️ **All five of Unit 7's refusals re-run and still fail at the guard being tested** — checked
explicitly because guard ordering has now bitten four tests this phase. The untokenized-report case
still reaches Unit 6c's admission check at step 8, which matters because `decideSide` now makes
network calls at step 5 and could have started failing earlier for an unrelated reason.

### ⚠️ No staleness refusal, and the reasoning is the point

The report behind market 6 was three days old, and that mattered **because the side was computed from
it**. It no longer is — so **the correctness argument for an age limit is gone at the source**. What
remains is editorial: is week-old research a good reason to stake? That is a product question nobody
has answered, and refusing would stop an analyst staking on work it published last week, which is a
real capability to remove on a hunch. The age is **recorded on the decision and printed** — 72.8h on
this run — so it is visible before spending and available to Unit 15. Visibility without prohibition;
if a limit is ever wanted it should come from a scoring result rather than from taste.

### Two live markets now, and they are different questions

| | market 6 | market 7 |
|---|---|---|
| threshold | 24,387,198,586 (from the report) | 23,834,027,938 (from the snapshot series) |
| side | TRUE | TRUE |
| decided from | report's 24.634B, three days stale | the 2026-09-10 snapshot, 24.075B |
| currently | **losing** — series at 24.074B | winning — series is above the bar |

⚠️ **Market 6 is left exactly as it is.** It is a genuine forecast, it is currently losing, and that
is the loop working rather than something to tidy away. Unit 15 will score it, and a first real
prediction that was wrong for a reason we can name is worth more to this project than one quietly
replaced.

---

## 2026-09-11T07:00Z — Orientation pass, no code. What the tracking says versus what the repo holds.

A cold session read the four tracking documents in order, ran the two checks, and verified every
claim against the code, the chain and the database. **Nothing was written, spent or deployed.**
`npx tsc -p tsconfig.json --noEmit` exits 0. `scripts/ops/migrate.ts` is a clean no-op across all six
migrations, thirteen tables. Market state was read by `eth_call` and `SELECT` only.

⚠️ **`PHASE-4.md` is stale by six units and it is the document this task says to read first.** Its
status table was last touched at Unit 4's commit (`b113010`). It marks Unit 4 as **NEXT**, and its
*What is deployed* section still says **"Nothing from Phase 4"** — while `AlphaMarket` has been live
at `0x003e7Cb791257B529bb5f9F6D17A846264d48044` since Unit 6, and Units 5, 5b, 6, 6b, 6c, 7 and 8 have
all landed since. A session that trusts the table starts from a false picture of its own deadline.
The narrative in this file is accurate; the state table is not.

⚠️ **`DECISIONS.md`'s last entry is 2026-09-07, before Phase 4 began.** At least six decisions taken
this phase are rewrite-to-undo by `CLAUDE.md`'s own test and live only in `PHASE-4.md` and here: the
immutable resolver, issuance-not-holding as the binding criterion, the attestation as a committed
file rather than a database row, `SubmitInput` as a discriminated union, idempotency keys derived
from the call bytes, and the side rule reading `settle()` rather than the report.

**Three open items closed themselves since they were written** — Arc's EVM version (Prague,
confirmed three ways in Unit 6), `ARC_RPC_URL` (exists in `.env` and `.env.example`), and
`buildEvidence`'s missing destination (Unit 8). **Item 2 has not**: the Circle wallet-set spend cap
is still an unperformed console action, and `spend_ledger` has **zero rows and no writer anywhere in
`src/`** — so cut-list item 4 has been taken by default rather than decided, and there is no spend
guard in code or console.

⚠️ **Two hard clock facts that the calendar section does not state in these terms.** Both live
markets close at **2026-09-11T23:59:00Z**, about seventeen hours from this entry — after which no
human can stake in either, and §5.3's *"a stranger can browse, read previews, stake"* has nowhere
live to happen. And neither can be resolved before **2026-09-13T01:00:00Z**: `observationEnd` plus
`FRESHNESS_MARGIN_SECONDS`, which is Sunday, submission day. **The plan's fallback is in effect and
it has no spare, exactly as the calendar warned.**

⚠️ **A rehearsal cannot be manufactured through `market.ts`** — `spec.ts` forces the observed day
into the future, which is the honesty property Unit 7 recorded. Unit 6 built its rehearsals through
ethers with the deployer key, bypassing `spec.ts`. So Unit 9's live proof either reuses that path or
waits for Sunday. Worth settling before Unit 9 is written rather than discovered inside it.

**Smaller things found, none urgent:** `CRON_SECRET` exists nowhere — not in `.env`, `.env.example`
or the code — and Units 10 and 11 both need it. `marketsAwaitingCommit` currently returns **empty**:
both markets are directed at the analyst and both already carry claims, so Unit 10's live proof has
no work to find unless a third market is created. `ARC_WALLET` is still in `.env`, still absent from
`.env.example`, and now carries a warning in `arc.ts` about never being read as the analyst.
`stakes`, `scores`, `settlement_evidence`, `payouts` and `spend_ledger` are all empty.

---

## 2026-09-11 — Phase 4 Unit 9: `src/arc/resolve.ts`, the outcome onto the chain, rehearsed

`src/arc/resolve.ts` and `scripts/ops/resolve-market.ts`. **28 assertions pass on live Arc testnet**,
`npx tsc -p tsconfig.json --noEmit` exits 0, and **nothing reverted**. Both paths landed: chain market
8 **resolved TRUE** on 2026-09-10's real snapshot, chain market 9 **voided** after a deadline that
passed in 2021. **Total 0.0064005594 USDC** across four transactions.

| | who | gas |
|---|---|---|
| createMarket 2026-09-10 | deployer, ethers | 0.002203212 |
| **resolve** | **analyst, Circle** | **0.0012214575** |
| createMarket 2021-01-01 | deployer, ethers | 0.002203212 |
| **voidMarket** | **analyst, Circle** | **0.0007726779** |

⚠️ **The analyst's two writes cost LESS than the deployer's creates here, which reverses Unit 6's
finding.** Unit 6 measured Circle at a premium — 0.0043–0.0058 against ethers' 0.00375 for an
identical `commitPrediction`. These are not identical calls: `resolve` writes three words to an
existing struct and `createMarket` writes a new one, so the premium is not disproven, it is swamped
by the work. **The number worth carrying forward is that a resolve is cheap** — about 0.0012, well
under Unit 7's 0.05 headroom.

⚠️ **Markets 6 and 7 were not touched**, verified after the run from the chain and the store: both
still `resolved=false voided=false`, both pools 0.01 TRUE, both rows with null landmarks.

### ⚠️ Why this got a rehearsal instead of waiting for Sunday

The live markets cannot legally settle before **2026-09-13T01:00:00Z** — `observationEnd` plus
`spec.ts`'s freshness margin — which is submission day, and **there is no second window**. So both
paths were driven today against throwaway markets, for the same reason Unit 6 existed. The rehearsal
markets are created through **ethers with the deployer key**, because `market.ts` structurally cannot
build one: `questionCore` requires `closeTime <= dayStart(observedDay)` and the contract's `_open`
requires `closeTime > now`, so every market that module can make is a forecast. ⚠️ **Their ids are
prefixed `m/rehearsal-` and `directed_at` is NULL**, so no query and no cron can mistake them for the
real thing. They are a machinery proof and never a forecast.

### The refusals, each proven to fire at the guard it names

Six, all reaching the guard under test: **not in the store** · **no `settlement_evidence` row** (Unit
8 has not run) · **never landed on chain** · **the stored bytes no longer hash** · **already settled
in the store** · **too early to void**. The two mutating tests use Unit 6c's pattern — change one
column, test, restore in a `finally`, then assert the restore.

⚠️ **The tamper test was wrong first and would have passed while proving nothing.** The first draft
added whitespace to the stored TEXT. `verifyStoredEvidence` **parses the row before hashing**, so the
space canonicalizes straight back out and both checks would have returned true. It now changes one
digit inside `record.raw` — the response bytes the hash is actually there to defend — which breaks
`responseHash` and the record hash over it at once. **Caught by reading `verifyStoredEvidence` rather
than by the test failing**, which is the only reason it was caught at all: a green tick is exactly
what a tamper test that does not tamper looks like.

### ⚠️ Two guards that are deliberately unreachable, and they are NOT claimed as proven

- **`TooEarlyToResolve`.** To reach it a market would need an evidence row carrying an outcome for a
  day that has not finished, and `settle()` throws `SettlementTooEarly` rather than producing one. It
  can only fire on state that disagrees with itself. **Kept anyway, because a revert costs USDC.**
- **`NotResolver`.** The analyst *is* the immutable resolver, and reaching the guard needs a second
  Circle wallet this project does not have. Unit 7's cold-child-process trick does not help: a wrong
  `CIRCLE_WALLET_ID` makes `analystIdentity()` throw inside `arc.ts`, one guard above.

Both are stated in the file. Asserting a branch that never runs is the failure mode this phase has
paid for four times, and pretending to reach these two would have been a fifth.

### `reconcile` — the crash-recovery case, which was not in the brief and closes a real hole

A run that submits and dies before its `UPDATE` leaves the chain settled and the row saying
otherwise — and Unit 11's find-work query is `WHERE resolved_at IS NULL`, so **that row would be
retried every day forever**. `prepare()` reads the chain before planning, and when the chain is
already settled it returns `action: 'reconcile'`: the landmark is written from **what the chain
says**, and nothing is submitted. Proven with a second store row observing chain market 8 after it
resolved — no gas, correct outcome and hash.

⚠️ **A reconciled void writes `voided_by` NULL.** The `Market` struct records no voider — only the
`Voided` event does — so there is no honest answer from a state read, and writing the wallet this
process happens to hold would have been a guess recorded as a fact.

### ⚠️ Two things this unit could not do, said rather than reached around

- **R17's republished-deployment void is NOT built.** It voids a market whose subgraph deployment was
  republished after creation, and **nothing stores the creation-time deployment to compare against**:
  not the `markets` row, not `spec_json` (a spec names a `slug`, never a deployment id), and so not
  `specHash` either. The settlement evidence carries `deployment`, but that is the read at
  settlement, not at creation. ⚠️ **It needs a column, which is a migration, which this unit was told
  not to write.** The brief for this unit named exactly one void trigger — MISSING_OBSERVATION past
  the deadline — and that is what was built.
- **The idempotency key is derived and not stored, because there is no column.** `markets` carries
  `create_idempotency_key` and 006 added `void_tx` and `voided_by` but no key. Survivable only
  because the key is `sha256` over the call bytes: a retry recomputes the identical value with
  nothing to remember. ⚠️ It would **not** have been survivable under the old stored-random scheme.

### Smaller things

⚠️ **The never-landed fixture is dated 2026-09-20 on purpose.** It never gets a landmark, and
`marketsAwaitingResolve` is `observation_end <= asOf AND resolved_at IS NULL` — so a past-dated
fixture would have been handed to Unit 11's cron every day forever. A future day keeps the row
consistent with itself and invisible to the query. Confirmed after the run: **the find-work query
returns nothing.**

⚠️ **`landed()` is duplicated from `market.ts`** rather than exported from it. It is private there and
this unit was told not to modify that file; eleven lines of receipt-waiting is the cheaper cost.
`prepare()` also takes `now` from **the chain's latest block timestamp, never `Date.now()`** — the
contract compares `block.timestamp`, and a local clock slightly ahead would pass our guard and revert
on theirs.

⚠️ **`resolve.ts` is ~178 non-comment lines, over the ~120 guideline, and I did not flag it before
writing.** Most of it is the ten refusal messages, which are multi-line sentences rather than logic.
It is one subsystem and one commit's worth of reading; recorded because the rule says to say so.

**The operational path is the same script:** `--market=<id>` prints the plan and spends nothing,
`--send` spends. ⚠️ It **refuses chain markets 6 and 7 unless `--live` is passed**, so settling a
real one on Sunday is a deliberate gesture rather than a default.

---

## 2026-09-11 — Phase 4 Unit 14: `app/markets/[id]/` — the first browser-signed transaction

`app/markets/[id]/page.tsx`, `app/markets/[id]/stake.tsx` and
`app/api/markets/[id]/refresh/route.ts`. `npx tsc -p tsconfig.json --noEmit` exits 0 and **`npm run
build` passes** with both new routes present. The production server serves `/markets/6` and
`/markets/7` with live data read from the contract. ⚠️ **Nothing has been staked yet — that half is
the operator's click**, and markets 6 and 7 are verified untouched: no landmarks, `stakes` still
empty.

⚠️ **SM-09's open half is the one that just closed.** Its row has read PARTIAL since 2026-09-06 —
the wallet half walked on OKX, the *"stake under `next build`"* half deferred to this phase because
there was no app. There is now, and it builds. The row does not flip to PASS until a stake actually
lands from a browser.

### ⚠️ Every other chain write in this repo is server-signed, and this one is not

`report/[hash]/buy.tsx` is the nearest page and it argues the opposite case in its own header — *"An
AGENT pays. The visitor does not… Nobody's wallet is connected, no browser signs anything."* True
there and deliberately false here: **A5 wants value moving on Arc from a party that is not us**, and
an agent paying itself cannot show that. There was no precedent to follow — no `window.ethereum`, no
wagmi, no WalletConnect anywhere in `src/`, `app/` or `scripts/`.

### ⚠️ No side control anywhere, and its absence is the feature

`stake(marketId, claimId)` takes no side. The contract reads it off the claim — `_add(m, marketId,
c.side, msg.value)`. A TRUE/FALSE toggle would have rebuilt the hole the contract closed: two people
backing opposite sides of one claim, and the claim meaning nothing. The page says which side the
stake joins and why, and offers no way to change it.

### The client bundle carries no wallet library and no bytecode — measured, not asserted

⚠️ **The full calldata is encoded on the SERVER and passed down as a prop.** `marketId` and
`claimId` are fixed for a given page, so there is nothing left for a browser to encode:
`0x7b0472f0` + two words, verified against `ethers.id('stake(uint256,uint256)')`. The client
therefore ships **no `ethers`, no wagmi, no WalletConnect** — confirmed by fetching all seven chunks
the page loads (571 kB total) and grepping them. Decimal→wei is exact `BigInt` string arithmetic;
`parseUnits` would have cost 100 kB to pad a string.

⚠️ **`src/arc/abi.ts` is never imported into a client component** — it carries creation and deployed
bytecode and would ship the contract's bytes to every visitor. Minimal inline ABIs in the page and
the route, `/api/holdings`'s precedent. Greped for a 200-hex run in every chunk: none.

⚠️ **Nothing got `NEXT_PUBLIC_` and none was needed.** A server component hands a client component
props, so the contract address, chain id and RPC URL cross as arguments rather than build-time
globals. `.env` holds `HEDERA_SELLER_KEY`, `CIRCLE_ENTITY_SECRET` and `ARC_DEPLOYER_KEY` and none of
it is inlined anywhere.

⚠️ **The RPC URL handed to the wallet is checked for credentials before it is handed over.**
`ARC_RPC_URL` is today the public endpoint with no key, path or query — confirmed — but the page
asserts that rather than trusting it, and falls back to the public endpoint if it ever gains one.
A keyed RPC leaked to every visitor is a disclosure nobody would notice.

### The amount guard runs before signing, because a revert costs the staker gas

`msg.value % 1e12 != 0` reverts `NotAUsdcUnit`, so a stake is a whole 6-dp USDC unit — at most six
decimal places on a chain whose native token is 18-dp. Checked in the browser, with the contract's
own error named in the message. Verified across the range: `1`, `0.5` and `0.000001` pass;
`0.0000001` and `0.1234567` are refused as `NotAUsdcUnit`, `0` as `ZeroStake`, `1001` as
`OverStakeCap` against the contract's `MAX_STAKE` read live rather than hardcoded.

### ⚠️ `[id]` is the CHAIN market id, and that choice is inherited by Unit 13

Store ids are `m/4fad94e5…` and a slash cannot live in one route segment. The chain id is also the
public identity of a market — the number in the contract, the events and on arcscan — so `/markets/6`
is the honest URL. The lookup is by `chain_market_id` **and** `contract_address`, because a market id
is only meaningful against the deployment that issued it.

### Post the hash, then reconcile — and what the schema would not let this do

`gate.ts`'s discipline: the browser hands over the hash the moment `eth_sendTransaction` returns,
which is **before** the transaction is mined. The route waits for the receipt (bounded at 40s, inside
the honest `maxDuration = 60`) and records the stake from the **`Staked` event** — staker, side,
amount and block all read from the chain, never from the request body, because this is a public
endpoint and a client that lied would be writing a row the contract disagrees with. `stakes.tx_hash`
is UNIQUE and the insert is `ON CONFLICT DO NOTHING`, so the page's "Record it" retry is a no-op
rather than a second row.

⚠️ **A hash cannot be written before the receipt, and that is a schema fact rather than a choice.**
`stakes` has `staker`, `side` and `amount` NOT NULL, so there is no hash-only row to write first —
and writing the browser's *claim* about those values would defeat the reason they are read from the
chain. What stands in for it: the wait is bounded, a timeout answers `pending` rather than failing,
the hash stays in the page, and re-posting finishes the job. A column for a pending hash would be a
migration, which this unit was told not to write.

⚠️ **The side is checked against the claim, not assumed.** If the event credited a side the stored
claim disagrees with, the row is refused with 409. That mismatch would mean the store and the chain
disagree about what a claim is, which is not something to record and move past.

### Route guards, each exercised against the running production build

Bad hash → 400. Unknown market → 404. A real mined transaction carrying no `Staked` for this market
→ 422, **with the pools still returned** so a page refresh is never wasted. ⚠️ The 422 case was
driven with Unit 9's `voidMarket` hash from chain market 9 — a genuinely mined transaction on the
same contract with the wrong event — rather than an invented one, so the guard was reached for the
right reason.

---

## 2026-09-11 — Phase 4 Unit 10: `app/api/cron/commit/route.ts` — the analyst on a schedule

`app/api/cron/commit/route.ts`, the first `crons` entry in `vercel.json`, and `CRON_SECRET` added to
`.env.example`. `npx tsc -p tsconfig.json --noEmit` exits 0 and **`npm run build` passes** with the
route listed. ⚠️ **A2 is not closed yet** — it closes when a `vercel-cron/1.0` request appears in the
Vercel log with nobody watching, and that needs a deploy. Everything up to that is proven.

**Proven locally against the production build:** no header → 401 · wrong secret → 401 · correct
secret with nothing outstanding → a clean `{"outstanding":0}` in 832 ms. ⚠️ **An empty result is the
normal case on most days and reports cleanly rather than looking like a failure** — anything that
read as an error here would train an operator to ignore the one that matters.

### ⚠️ `prepare()` needs two things a market row does not carry, and both were decided in the open

`marketsAwaitingCommit` returns the question, the times and the contract. It does **not** return
which report justifies the claim or how much to stake, and neither exists anywhere in `store/` or
`config/` — `market.ts` refuses to invent the second on purpose: *"No default — nobody commits a
default stake size."* Stopped and asked rather than assuming. Both answers taken by the operator:

- **the report** — the newest tokenized report carrying a fact for the market's metric. ⚠️ The pick
  is **verified rather than trusted**: `prepare()` refuses an untokenized report at Unit 6c's
  admission check, and `decideSide` refuses a report with no fact for the metric, so a wrong query
  causes a refusal and can never cause a commit against a report that does not qualify. It is also
  the "agent decides" half of the design — the human directs the *market*, the analyst picks which of
  its own published work backs the claim. **The dry run picked a 39-hour-old report, not the oldest**,
  which is the rule doing something the hardcoded script did not.
- **the stake** — `0.01 USDC` as a constant in the route. A configurable one would be a sixth
  environment variable that can be present-but-blank; a constant cannot fail at runtime.

⚠️ **The derived market id round-trips, which is what makes reuse safe.** `prepare()` computes
`idFor('m', {specHash, core, contractAddress})`, and fed a row's own spec and times it lands back on
that row — verified against markets 6 and 7 before anything was written, and again in the dry run
against the seeded market. Had it not, `create()` would have INSERTed a second row and left the
directed one uncommitted forever.

### ⚠️ A guard added after finding a daily gas burn that nobody had named

`marketsAwaitingCommit` has **no `closeTime` predicate** and `prepare()` has **no past-close
refusal** — its step 3 checks `closeTime <= dayStart(observedDay)`, never `closeTime > now`. So a
market whose staking window shut before a run reached it stays outstanding **for good**, and every
subsequent run would `create()` it on chain (spending) and then revert `StakingClosed` on `commit()`
(spending again). **Daily, forever, for a market that can never be committed.**

The route now refuses a closed market before touching anything. ⚠️ Refused rather than hidden: the
row stays outstanding and visible and nothing is spent. Found while reasoning about what happens if
tonight's deploy slips — which is exactly the case that would have triggered it.

### Reconciliation, and why a double delivery is safe

Vercel's cron delivery is best-effort **in both directions** — a run can silently not happen, and the
same run can arrive twice. The route asks what is outstanding *now*, from scratch, with no cursor and
no high-water mark. A duplicate delivery is safe because `create()` returns a market that already
landed instead of creating a second one and `commit()` returns a claim that already landed instead of
staking twice. A run that exceeds its budget marks the rest **deferred**, not failed, and the next
run finds them still outstanding.

`maxDuration = 60`, which is the real Hobby ceiling — a route declaring nothing gets roughly ten
seconds and a declared `300` is silently clamped with no API that will say so. New markets stop being
started at 45 s so a submit is never cut off mid-flight.

⚠️ **Auth compares SHA-256 digests through `timingSafeEqual`**, which throws on a length mismatch —
on raw strings that would be an oracle for the secret's length. `requiredEnv` is the guard on the
secret itself, because `process.env.X ?? y` falls back on undefined and never on the empty string.

### The seeded market, and the clock on it

⚠️ **`marketsAwaitingCommit` returned empty** — both live markets already carry the analyst's claim,
and `commit-market.ts` has no create-only flag, so there was no way to leave work behind. With the
operator's agreement one directed, uncommitted row was seeded: **`m/9e1469c4fa950754e2791734`**, asking
whether `aave-v3-ethereum.totalDepositBalanceUSD` is above **22,871,036,910** on 2026-09-12 — 95% of
the 2026-09-10 snapshot, a genuinely different question from markets 6 and 7 so it gets its own
`specHash` and its own row. Not on chain, no claim. **The cron creates it and commits it.**

A dry run of the exact cron path — `prepare()` only, which spends nothing — resolves cleanly: one
market outstanding, report picked, plan id matching the seeded row, side **TRUE**, stake 0.01 USDC,
no refusals. ⚠️ So the 22:00 run is de-risked as far as it can be without spending.

⚠️ **The seeded market closes at 2026-09-11T23:59:00Z.** The cron is `0 22 * * *`; Hobby fires once
daily with per-hour precision and can drift up to an hour, so a 22:00 fire lands by 22:59 at worst —
inside the window. **If the deployment does not exist by then the window shuts**, the new guard
refuses the row harmlessly, and there is no A2 evidence tonight.

⚠️ **The schedule runs on Vercel, not here.** The live deployment is still Phase 3's, so the route,
the `crons` entry and `CRON_SECRET` in the Vercel project environment all have to land there before
22:00 UTC. Nothing is committed and that deploy is the operator's.

---

## 2026-09-11T08:00Z — End of session. Phase 4 is twelve units in and the fallback calendar is live.

**Written for a session that starts tomorrow knowing only what is on disk.** State lives in
`tracking/phases/PHASE-4.md` — its status table, *Where this actually stands*, *What has to happen,
with times*, *The live markets*, *Before touching anything*, *Open items* and *Unit 11*. The
resolve-cron hour is in `tracking/DECISIONS.md`. This entry is the narrative and **deliberately does
not repeat the tables** — three files, three jobs, no duplication.

⚠️ **`PHASE-4.md` was a session stale and said "What is deployed: Nothing from Phase 4."** That was
false by six units — `AlphaMarket` had been live since Unit 6. Its status table also still marked
Unit 4 as NEXT. **Both were rewritten from the chain and the code rather than from the plan**, and
the section now carries the date it was read and a note saying the code wins if they disagree again.

### What landed today, and four units landed differently from their briefs

Units **9**, **14** and **10** were built today; **1–8** were already done. Twelve of the
twenty-one units in the table are complete. Four carry changes their briefs did not ask for, each
for a reason found while building:

- **Unit 4 — `callData` on `submit()`.** Circle's server-side encoder handles *"string, integer,
  boolean, and array"* and refused `createMarket`'s `QuestionCore` struct with
  `ABI_SIGNATURE_PARAMS_MISMATCH`. `SubmitInput` became a discriminated union so sending both shapes
  is unrepresentable.
- **Unit 4 — idempotency keys derived from the call bytes.** A stored random key pins the request
  **body**, so the retry after the `callData` fix replayed Circle's cached failure and never sent the
  corrected call. ⚠️ A cron storing a key would have wedged permanently with logs saying only that
  Circle failed.
- **Unit 7 — the side rule was rewritten after the unit shipped.** `decideSide` read the report's
  figure, which comes from the **`balance-sheet`** document; settlement reads
  **`financialsDailySnapshots`**. Same metric name, different entity, and they disagree. It now calls
  `settle()` — the function settlement calls — so the side is by construction what settlement would
  decide. Market 6 was committed on the old rule and is currently losing. It is left exactly as it
  is. Full account in `lessons.md`.
- **Unit 10 — a closed-market refusal.** `marketsAwaitingCommit` has no `closeTime` predicate and
  `prepare()` has no past-close refusal, so a market whose window shut would be `create()`d on chain
  (spending) and then revert `StakingClosed` on `commit()` (spending again) **every day forever**.
  Found by reasoning about what happens if tonight's deploy slips.

Unit **9** also gained a `reconcile` action for a run that submits and dies before its `UPDATE` —
without it the resolve cron's `WHERE resolved_at IS NULL` would retry that market daily forever.

### Today's spending, and what it bought

Unit 9's rehearsal cost **0.0064005594 USDC** across four transactions and drove both settlement
paths on chain: market 8 resolved TRUE on a real snapshot, market 9 voided after a deadline that
passed in 2021. Nothing reverted. ⚠️ **That rehearsal exists because markets 6 and 7 cannot settle
before Sunday 01:00Z and Sunday is the only window** — a bug found then would have had no second
attempt.

### The first money into this system from somebody who is not us

⚠️ **A human staked 1 USDC into market 6 from MetaMask** — `0x683eE842A16f85e69883F433745263BFe8D55f76`,
side TRUE, block 61531149, recorded in `stakes` with its transaction hash. Every other chain write in
this repo is server-signed; `report/[hash]/buy.tsx` argues the opposite case in its own header. **A5
asks for value moving on Arc from a party that is not us, and this is it.** SM-09's `next build` half,
open since 2026-09-06, is closed with it.

### What is not done, and the one that is time-critical

**Unit 10 is built and not deployed**, and the live deployment is still Phase 3's. The commit cron
fires at 22:00Z tonight only if the deploy and `CRON_SECRET` reach Vercel before then; the seeded
market it would commit closes at 23:59Z. ⚠️ **A2's evidence is a `vercel-cron/1.0` line in the Vercel
log, and tonight is the run that produces it.** Unit 11 is next and everything it needs exists.
11b, 12, 13, 13b, 15, 15b and 16 are untouched — ⚠️ **15 and 15b are the feedback loop, and the cut
list puts them above every remaining page.**

### ⚠️ Where today ended against the calendar

**The fallback is in effect and there is no spare day.** The plan wanted observed day *D* = Friday 11
with resolution Saturday and Sunday spare; we have **D = Saturday 12, resolution Sunday, deadline
Sunday**. It was forced rather than chosen: `spec.ts` requires `closeTime <= dayStart(observedDay)`
while the contract requires `closeTime > now`, so a commit is always ahead of its observed day and
the earliest honest *D* on the day markets 6 and 7 were created was the 12th.

**What that costs, stated plainly:** one missed resolve cron on Sunday morning and the demo cycle has
to be finished by hand the same day. The manual path exists and is proven —
`scripts/ops/resolve-market.ts --market=<id> --live --send` — and `voidMarket` stays permissionless
after 2026-09-15T00:00:00Z regardless, so funds are never stranded. What cannot be recovered is the
*unattended* claim: A2 and A4 both rest on a scheduled run nobody triggered, and each has one
scheduled attempt left before the deadline.

---

## 2026-09-11T17:20Z — Orientation pass, no code. The deploy DID land; three env vars did not.

A cold session read the four tracking documents, ran the two checks, and verified every claim
against the chain, the Vercel project and the database. **Nothing was written, spent or deployed**
beyond this entry. `npx tsc -p tsconfig.json --noEmit` exits 0. `migrate.ts` is a clean no-op across
six migrations, thirteen tables. Chain state came from `eth_call` and `eth_getLogs`; the store was
read only to cross-check it.

⚠️ **The task brief said "Today is Saturday 13 September, deadline Sunday 14." It is Friday
2026-09-11.** Confirmed three ways: the system clock (17:12Z), the Arc chain's latest block
(`1789146752` = 2026-09-11T17:12:32Z) and the subgraph's `_meta` (17:17:35Z). **That is two clear
days rather than one**, and every deadline in `PHASE-4.md`'s calendar still stands as written —
including tonight's 22:00Z commit cron, which has **not yet fired**, and the 23:59Z close on the
seeded market, which has **not yet happened**.

### ⚠️ The deployment is current and the cron is registered — and it 500s

**`PHASE-4.md`'s "`/api/cron/commit` is built and not deployed · the live deployment is still Phase
3's" is out of date.** The production alias `et-honline-2026-alpha-markets.vercel.app` points at a
deployment created **2026-09-11T07:56:18Z, sixteen seconds after HEAD (`48ed1ba`)**, and it carries
Phase 4: `/api/cron/commit` and `/markets/[id]` both answer (500, not 404), `/api/markets/6/refresh`
answers 405 to a GET, and `/api/cron/resolve` is a genuine 404 because Unit 11 does not exist.
`vercel crons ls` shows **one job, `/api/cron/commit` at `0 22 * * *`**, registered.

⚠️ **And it cannot work, because three environment variables the deployed code reads are absent from
the Vercel project.** A symmetric grep of `src/` and `app/` against `vercel env ls`:

| missing in Vercel | what breaks | evidence |
|---|---|---|
| **`CRON_SECRET`** | ⚠️ **tonight's 22:00Z cron returns 500 and A2 gets no evidence** | runtime log: *"CRON_SECRET is not set (or is set to an empty string)"* |
| **`ARC_MARKET_ADDRESS`** | ⚠️ **`/markets/6` and `/markets/7` are 500 in production right now** | runtime log, same shape |
| **`ARC_RPC_URL`** | the next failure after the one above, on the same pages | read by `arc.ts`, absent from the project |

⚠️ **Only the first of the three is named anywhere in the tracking.** The other two mean **Unit 14's
staking page — the A5 surface, the thing a stranger would be pointed at — has been down since the
deploy landed nine hours ago**, and nothing said so because the deploy was recorded as not having
happened. A route that 500s looks identical to a route that was never shipped; the difference only
showed up by asking Vercel rather than the plan.

`CRON_SECRET` is **also absent from `.env`** — not blank, absent — so there is no local value to copy
up. `.env.example:160` documents it and leaves it empty, which is correct for a template.

### Every market, read from the chain

`marketCount` **9**, `claimCount` **7**, contract balance **1.02 USDC**, resolver
`0x1B7035bBe0DA8F3bcb721863D42e1079e4A116A7`. A full log scan over blocks 61478315–61598315 found
**31 events and nothing after block 61531149** — so no stake has landed on 6 or 7 since last night,
and the chain agrees with the store on every row.

The balance reconciles exactly: markets 2–5 were drained by their `Claimed` events, 6 holds 1.01 and
7 holds 0.01. **1.02 held, 1.02 owed.**

⚠️ **`PHASE-4.md` says market 6 is "losing" and that is now stale.** The 2026-09-10 snapshot was
24.075B against its 24.387B bar; the 2026-09-11 snapshot reads **25.055B**, above both markets'
thresholds. **Neither standing means anything yet** — the observed day is 2026-09-12 and it has not
started. Recorded so the next session does not repeat the old line.

### ⚠️ Three things nobody has written down

1. ⚠️ **`marketsAwaitingResolve` has no `landed_at IS NOT NULL` predicate.** From
   **2026-09-13T00:00:00Z** it returns the seeded market `m/9e1469c4fa950754e2791734` alongside 6 and
   7, because that row's `observation_end` is the same instant and it will still be unresolved. If
   the commit cron never commits it, **Unit 11's one run that matters hands `prepare()` a market with
   no `chain_market_id`.** `resolve.ts` refuses it at guard 2 and spends nothing — so this is not a
   gas leak, it is the Unit 10 shape one layer down: **the refusal has to be classified as a skip,
   not as a failure**, or the Sunday 02:00Z run reports an error beside two good settlements. Unit 11
   should decide this before it is discovered inside the run.
2. **`ARC_DEPLOYER_KEY` is set in the Vercel production environment and read by nothing that
   deploys.** It is a scripts-only variable. A funded private key sitting in a serverless environment
   for no reason. Belongs in 11b's env audit.
3. **Two store rows point at chain market 8** — `m/rehearsal-5e207fcf98b52eb3` and
   `m/rehearsal-reconcile-8`. Deliberate, it is Unit 9's reconcile fixture, and both are resolved so
   nothing queries them. Noted only because `markets` has 7 rows against 9 chain markets and the
   arithmetic looks wrong until you know why.

### What has to be true before Sunday 02:00Z, and there are two fires not one

Markets 6 and 7 cannot settle before **2026-09-13T01:00:00Z** and `DECISIONS.md` puts the cron at
`0 2 * * *`. ⚠️ **That schedule also fires Saturday 02:00Z, when `marketsAwaitingResolve` returns
nothing — a free rehearsal of the scheduled path with no money at stake.** It is only free if Unit 11
is deployed by then, which makes Saturday 02:00Z the real target rather than Sunday.

Everything the resolve path needs is already proven on chain: `settle()`, `recordSettlement()`,
`prepare()`, `resolveMarket()` and `voidMarket()` all ran against the rehearsal markets this morning.
The analyst holds **17.44 USDC** on Arc against a measured resolve cost of ~0.0012 each. The subgraph
is indexing within ~30 seconds of real time, so the freshness margin has the headroom it was chosen
for. **What is missing is the route, its `vercel.json` entry, a deploy, and the three environment
variables above** — and the last of those is the only item that is also blocking tonight.

---

## 2026-09-11 — Phase 4 Unit 11: `app/api/cron/resolve/route.ts` — the analyst settles on a schedule

`app/api/cron/resolve/route.ts` and a second `crons` entry in `vercel.json`. `npx tsc -p
tsconfig.json --noEmit` exits 0 and **`npm run build` passes** with `/api/cron/resolve` listed.
⚠️ **A4 is not closed yet** — it closes when a `vercel-cron/1.0` request settles something with
nobody watching, and that needs a deploy. Everything up to that is proven, **including a real
settlement driven through the route rather than through the function underneath it.**

### The proof, and the real settlement went through the HTTP route

Against the production build on `next start`, with the bearer token passed by hand:

| | |
|---|---|
| no `Authorization` header | **401** |
| wrong secret | **401** |
| correct secret, nothing outstanding | **200**, `outstanding: 0`, clean summary, 977 ms |
| correct secret, one market outstanding | **200**, **resolved on chain in 11.7 s** |
| the same run delivered again | **200**, `outstanding: 0` — the market is settled and the query no longer returns it |

⚠️ **The settlement is real and it is market 10, created for this.** A rehearsal market over
**2026-09-10** — a finished day — with threshold 30B against an observed 24.074B, so it settles
**FALSE**, a branch no rehearsal on chain had taken before. Created through ethers with the deployer
key, `m/rehearsal-a014b3080fa43ec3`, `directed_at` NULL, and then **left alone** so the route was the
thing that settled it. The route resolved it in `0xe4b274b5…`, gas **0.001357841095 USDC** paid by
the analyst, `Resolved(marketId=10, outcome=false)` in the receipt, and the **stored `evidence_hash`
equals the hash on chain** — which is the ordering property this unit exists to keep.

**Total spent: 0.003561053095 USDC** — one `createMarket` from the deployer (0.002203212) and one
`resolve` from the analyst through the route (0.001357841095).

⚠️ **Markets 6 and 7 were never reachable, and that is structural rather than careful.**
`marketsAwaitingResolve` is `observation_end <= asOf`, and theirs is 2026-09-13T00:00:00Z — so on
2026-09-11 the query cannot return them at all. Verified from the chain after every run: both
unresolved, unvoided, pools 1.01/0.00 and 0.01/0.00, no landmarks, `stakes` still one row.

### ⚠️ The never-landed skip moved up a layer, and I would defend the move

The brief expected the seeded market's refusal to come back from `prepare()`'s guard 2 and be
reclassified. **It is refused in the route instead, before `settle()` runs.** Two reasons, and the
second is the one that matters:

- **Unit 10 set the precedent one layer up.** `marketsAwaitingCommit` has no `closeTime` predicate,
  so the commit route checks `closeTime` off the row rather than changing `prepare()`. This is the
  same shape: the route owns the predicate its find-work query lacks, and `Market.chainMarketId` is
  already on the row the query returned.
- ⚠️ **`ResolveRefused` carries a sentence and no code.** If guard 2 could fire here, telling it
  apart from **guard 5 — the stored evidence no longer hashes to the stored hash** — would mean
  string-matching another module's prose, and getting that wrong reports tamper detection as a
  routine skip. Refusing earlier makes guard 2 unreachable from this route, so **every
  `ResolveRefused` that does fire is worth an operator's attention.** That is the trap that has
  broken five negative tests this phase, taken seriously one more time.

**The second classification is still needed and is taken from this run's own state, not from a
message**: after `settle()` returns, the run knows `kind === 'MISSING_OBSERVATION'`, so a refusal
following it is guard 8 declining to void before `resolveDeadline`. Nothing is parsed.

**Both were proven, with fixtures removed afterwards.** Two rows in one run, two different skips,
`errors: 0`:

- `m/probe-never-landed` — no `chain_market_id`, past `observation_end` → **skipped**
- `m/probe-missing-obs` — 2021-01-01 on chain market 1, `resolveDeadline` still ahead → settle
  returns MISSING_OBSERVATION, evidence recorded, guard 8 refuses → **skipped**

⚠️ **The cleanup proved the ordering better than an assertion would have: two market rows removed
and only one evidence row.** The never-landed market never reached the Graph, which is what skipping
before `settle()` means. Both fixtures gone, no residue, re-checked after.

### ⚠️ What is NOT proven, said rather than implied

- **The void path through this route.** Unit 9 proved `voidMarket` on chain (market 9); what is
  unproven is *this route* reaching it, which needs a MISSING_OBSERVATION market whose deadline has
  passed. Manufacturing one means another chain write, and the brief did not ask for it.
- **The `reconcile` branch through this route.** Same reasoning — proven in Unit 9, routed here.
- **The scheduled fire.** That is the A4 evidence and it is a separate artifact.

### ⚠️ `landed()` waits up to 120 s and this function may not live that long

`resolve.ts::landed()` is `waitForTransaction(txHash, 1, 120_000)` against `maxDuration = 60`. **The
measured run was 11.7 s for one market**, so two fit comfortably — but if a wait is ever cut off,
Circle has already sent the transaction and it still lands; what is missing is our `UPDATE`. The next
run's `prepare()` reads the chain, sees it settled, and returns `action: 'reconcile'`. **So running
out of clock costs a late landmark, never a lost settlement.** Bounding that wait belongs to
`resolve.ts`, which this unit was told not to modify. `BUDGET_MS = 45_000` stops *starting* a new
market late, matching Unit 10.

### ⚠️ The deploy, and `CRON_SECRET` still does not exist anywhere

`vercel.json` now carries `0 2 * * *` for `/api/cron/resolve` beside the commit cron. **The schedule
runs on Vercel, not here**, and the earlier orientation found **three variables the deployed code
reads and the Vercel project does not have — `CRON_SECRET`, `ARC_MARKET_ADDRESS`, `ARC_RPC_URL`.**
All three block this route in production exactly as they block the commit cron today.

⚠️ **The secret used for these proofs was generated for the run and passed to the server process; it
was deliberately NOT written into `.env`**, because this task named two files. A real value has to be
set in `.env` *and* in the Vercel project, and they have to be the same string.

⚠️ **Saturday 02:00Z is a free rehearsal of this path with nothing outstanding** — the empty-work
case above is exactly what it will print — and it only happens if this is deployed by then.

---

## 2026-09-11T17:50Z — The three Vercel variables, checked by behaviour rather than by listing

Read-only: no deploy, no edit, no write, no transaction. **All three are LIVE in the running
production deployment**, established from what the deployed functions do rather than from
`vercel env ls` or `.env`. One of the three carries a caveat that is worth stating precisely.

### ⚠️ `/api/health` does NOT cover these three, and that is the first finding

Its `env` block reports exactly four variables — `HEDERA_NETWORK`, `HEDERA_SELLER_ID`,
`HEDERA_SELLER_KEY`, `DATABASE_URL`. The **mechanism** is right there and is the one this question
needed (`envState()` distinguishes `absent` / `EMPTY — set but blank` / `set`, with no `??`
anywhere), but none of `CRON_SECRET`, `ARC_MARKET_ADDRESS` or `ARC_RPC_URL` is passed to it.
⚠️ **So the route built to end exactly this ambiguity could not answer it**, and the answer had to
come from three other routes. That is the second time this project has needed a variable's deployed
state and had to get it somewhere else.

### What is deployed, and when, against when the variables were added

The production alias points at `dpl_DCSZGcBdcUXXHt7vACpXr77daeEZ` (`3i0g85k9w`), created
**2026-09-11T17:40:55Z**. ⚠️ **Four production deployments have landed since this morning's 07:56Z
one**, and `/api/cron/resolve` now answers instead of 404ing — **Unit 11 is deployed**, and
`vercel crons ls` shows **two** jobs: `/api/cron/commit 0 22 * * *` and `/api/cron/resolve 0 2 * * *`.

Added at (relative, read 17:43Z): `ARC_MARKET_ADDRESS` ~17:23Z · `ARC_RPC_URL` ~17:24Z ·
`CRON_SECRET` ~17:28Z. **All three predate the deployment by 12–18 minutes**, so the build that is
serving picked them up. ⚠️ The ordering is corroboration, not the proof — the behaviour below is the
proof, and the two agree.

**The logs agree too.** This morning: `error λ GET /markets/6 … ARC_MARKET_ADDRESS is not set`.
The current deployment's log shows the same routes at `info` with **no error entries at all**.

### Per variable

| | verdict | how |
|---|---|---|
| **`ARC_MARKET_ADDRESS`** | ⚠️ **LIVE, and the value is CORRECT** | `/markets/6` and `/markets/7` are **200** (were 500). Stronger than the status code: the page's query is `WHERE chain_market_id = $id AND contract_address = requiredEnv('ARC_MARKET_ADDRESS')`, so a present-but-**wrong** value matches no row and returns **404**. It returned 200 rendering `0x003e7Cb7…48044` and a **1.01 USDC** pool |
| **`ARC_RPC_URL`** | ⚠️ **LIVE, and the raw value reaches a working Arc RPC** | The markets page proves *present and non-blank* only — ⚠️ **it has a fallback**: a URL carrying credentials, a query or a path is replaced with the hardcoded public endpoint, so the page's chain read cannot tell the env value from the fallback. `/api/markets/[id]/refresh:62` uses the **raw** value with no fallback; a probe there returned a receipt from Arc and read pools, so the stored value is a reachable Arc endpoint |
| **`CRON_SECRET`** | **LIVE (present, non-blank). ⚠️ Value-correctness NOT determinable from here** | `/api/cron/commit` calls `requiredEnv('CRON_SECRET')` **before** the auth comparison, so **500 = absent or blank, 401 = present and non-blank**. It returns **401** with no header and with a deliberately wrong bearer. `/api/cron/resolve` returns 401 too — a second, independent confirmation |

⚠️ **The brief said `CRON_SECRET` could not be tested because Unit 11 was not deployed. It could:
`/api/cron/commit` has been deployed since 07:56Z and reads the same variable with no fallback** —
which is exactly the shape the `HEDERA_SELLER_ID` episode said was the only reliable answer. Unit 11
being deployed now just makes it two routes instead of one.

### ⚠️ What genuinely cannot be established, and it is one thing

**Whether `CRON_SECRET`'s value equals the string Vercel's scheduler will send.** Vercel generates
the `Authorization: Bearer` header from the project's own value, so by construction they are the same
string — but that is an argument, not an observation, and nothing readable from outside confirms it
without the value itself or a real scheduled fire. ⚠️ **The 22:00Z commit run is the first thing that
proves it**, and it proves it by working.

### Smaller things

- ⚠️ **All three are Production-only, no Preview.** Correct for the crons; it means a preview
  deployment 500s on `/markets/[id]` and both cron routes.
- `.env` locally still has no `CRON_SECRET` — ⚠️ irrelevant to the deployed question and it does not
  block anything, since `ARC_RPC_URL` and `ARC_MARKET_ADDRESS` were already there. It only matters
  for driving a cron route locally.
- **The probe wrote nothing.** `/api/markets/10/refresh` was aimed at the rehearsal market with the
  `voidMarket` transaction from chain market 9 — mined, same contract, carries `Voided` and no
  `Staked` — so it returns **422 before the INSERT**, which is unreachable on that path. Verified
  after: `stakes` still 1 row, `markets` still 8, and chain markets 6 and 7 still carry null
  landmarks.

---

## 2026-09-11 — Phase 4 Unit 15: `src/arc/score.ts` — built, and STOPPED before its proof

`src/arc/score.ts`. `npx tsc -p tsconfig.json --noEmit` exits 0. **No chain writes, no gas, no
proof script yet** — the proof the brief specifies cannot run against the store as it stands, and
that is a question rather than a workaround. Nothing was committed.

### The three scores, and which is which

**Reconciliation quality is COPIED** — `Report.verdict.call`, read through `store/reports.ts::load`
so the bytes are re-hashed before a verdict is taken off them. Legitimately null on a
metric-across-deployments report. **Forecast accuracy is the only thing this file computes** — the
claim's side against the outcome. **Trading return is READ from `payouts`** and never recomputed,
per Unit 5b.

**A voided claim scores `forecastCorrect = null`, not `false`.** A void is an absence of an outcome,
so the analyst was neither right nor wrong. ⚠️ The null is unambiguous only because **an unsettled
market gets no row at all** — 005's column comment says "null while the market is unresolved", which
predates that decision. On a row that exists, null means void.

Idempotent on `(market_id, claim_id)`, and the `ON CONFLICT` carries a `WHERE … IS DISTINCT FROM …`
so a re-score with identical inputs **does not move `scored_at`**. Without that, "running it twice
changes nothing" would be nearly true instead of true.

### ⚠️ The finding: a wrong forecast does not mean a zero return, and the first draft got it wrong

The brief asks to separate *"claimed nothing yet"* from *"earned nothing"*. The obvious rule — a
losing claim returns zero — is **false on this contract**, and the first draft of this file shipped
it before the counterexample turned up.

⚠️ **Chain market 3 resolved FALSE, the analyst's claim was TRUE — a genuinely wrong forecast — and
`payoutOf` reads 0.01, its whole stake back.** `poolFalse` was empty, so the `winningPool == 0`
branch refunded every staker. With one analyst and few stakers **an empty side is the expected case,
not an edge case** — the research said so and the contract was built for it; the inference simply
forgot it. Read from the chain, not reasoned about.

**So the distinction the brief wants cannot be drawn from the store.** Telling a loss from an
uncollected win needs the market's **pools**, which the `markets` row does not carry and this unit
may not add a column for. `returned` is therefore what `payouts` says or **null, never zero** —
`null` meaning *no payout recorded*, which is silence rather than a loss. ⚠️ **Recorded as a thing
the schema cannot express rather than faked into the column**, which is what the brief asked for in
that case.

A second, smaller catch: `stakesFor` is keyed by **claim**, not by market. `stakesFor(marketId)`
typechecks, returns `[]` forever and leaves the attribution guard silently never firing — the failure
mode this phase has paid for repeatedly. Every claim on the market is walked instead.

### ⚠️ Why the proof did not run — two things the brief's premise assumed

The brief says chain markets 2, 3, 5 and 8 are resolved and 4 and 9 voided, *"all available now"*.
**That is true of the chain and not of the store**, and `scores` is keyed on `claims`:

1. ⚠️ **No settled market in the store has a claim.** `claims` holds exactly two rows, both for
   markets 6 and 7 — unresolved, and off-limits. **Chain markets 2–5 have no `markets` rows and no
   `claims` rows at all**: Unit 6 drove them through ethers without writing the store. Chain markets
   8, 9 and 10 have `markets` rows and zero claims. So `scoreSettled()` correctly returns nothing,
   and there is no row anywhere to assert against.
2. ⚠️ **`payouts` has no writer and zero rows** — only the read helpers `payoutsFor`/`payoutFor`
   exist. So `returned` is null for everything, even though chain markets 2, 3, 4 and 5 all carry
   `Claimed` events the analyst really collected. **The `collected` branch cannot be exercised at
   all**, with or without claim fixtures.

Running the proof needs fixture `markets` + `claims` rows mirroring chain reality, and the brief
scoped this unit to *"its writes to `scores`. Nothing else."* ⚠️ **That restriction reads as a
consequence of the premise rather than a considered ban**, so it is being asked about rather than
interpreted. Nothing was seeded and nothing was removed.

---

## 2026-09-11 — Unit 15 proven: `scripts/demo/score.ts`, and three things the schema already decided

The proof the previous entry stopped for. Both questions were answered — seed fixtures and remove
them, and seed `payouts` from the chain's `Claimed` events too. **24 assertions, PASS**,
`npx tsc -p tsconfig.json --noEmit` exits 0. **No chain writes, no gas.** Markets 6 and 7 verified
untouched from the chain afterwards; `payouts` and `scores` are back to zero rows and the store is
1 stake / 2 claims, exactly as before.

### What the proof drove, using chain markets 2–5 as its subjects

Fixtures mirror what the chain says — read by `eth_call` in Phase 0 and asserted before anything is
seeded — and are removed in a `finally`.

| | forecast | returned | |
|---|---|---|---|
| chain 2, claim 1 | **correct** | 0.02 collected | the ordinary win |
| chain 3, claim 2 | **incorrect** | ⚠️ **0.01 collected** | the counterexample |
| chain 4, claim 3 | ⚠️ **null — VOID** | 0.01 refund | not a loss |
| chain 5, claim 4 | correct | 0.01 collected | one-sided pool |
| chain 2, claim 5 | incorrect | ⚠️ **null, never 0** | lost and never collected |

Idempotency holds: five rows after two runs, and **`scored_at` did not move** — the `WHERE … IS
DISTINCT FROM …` on the conflict is what makes "changes nothing" literal. Market 6 returns `[]` and
writes no row. `scoreSettled()` returns exactly five — chain markets 8, 9 and 10 contribute nothing
because they carry no claims.

### ⚠️ Three constraints the schema had already decided, each found by hitting it

1. ⚠️ **`claims.report_hash` is a FOREIGN KEY into `reports`.** A claim citing an unstored report
   **cannot be inserted at all** — found by the seed failing on the chain's own rehearsal hash
   `0xe7e0e5a7…`, which was never a stored report. **This is load-bearing and it makes the unit
   simpler than drafted**: `load()` can only return null if a report row were deleted, and
   `store/reports.ts` never deletes one. So `reconciliation_quality IS NULL` always means *the
   verdict had no call*, never *the report is missing*. It is also part of why Unit 6 never wrote
   claim rows for markets 2–5.
2. **`claims` carries `UNIQUE (market_id, author)`** — the contract's one-claim-per-author rule, in
   the schema. So `score.ts`'s `mine.length > 1` attribution guard is **unreachable by construction**
   and is not claimed as proven; the stake half of the same guard can still fire.
3. **`claims.amount` has `CHECK (amount % 1e12 = 0)`**, which refused the first probe before it
   reached anything interesting.

⚠️ **Constraints 2 and 3 each made the foreign-key probe pass for the wrong reason first** — `23514`,
then `23505`, before `23503`. Both presented as a bare ❌ with no way to tell which guard fired.
**The probe now returns the SQLSTATE and the assertion names `23503`**, so a refusal one guard above
the one under test is visible instead of silent. That is the seventh time this phase has paid for
guard ordering and the first time the test could say so itself.

### ⚠️ Two findings that limit what the record can say

- ⚠️ **Reconciliation quality is null on all nine stored reports**, because every one is the
  metric-across-deployments shape whose `Verdict.call` is null by the 2026-09-07 decision. So the
  first of the three scores **carries no signal today**. The figure that would carry it is
  `verdict.coverage` — `checksRun`, `checksAvailable`, `marketsCorroborated`, `completeness` — and
  `scores` has no column for it. ⚠️ **Unit 15b should know this before it feeds a record to
  `compose`: one of the three lines is currently always blank.**
- ⚠️ **`payouts` still has no writer.** The proof seeded it and removed it; in real running it stays
  empty, so `returned` is null for every claim until something records `Claimed` events. **The
  `collected` branch is proven and currently unreachable outside this proof.**

Both are open items, not defects in this unit.

---

## 2026-09-11 — Phase 4 Unit 15b: `src/agent/context.ts` — the reward comes back, and the loop closes

`src/agent/context.ts`, a third argument on `compose`, and `007_report_context.sql`. **19 assertions,
PASS** in `scripts/demo/context.ts`. `npx tsc -p tsconfig.json --noEmit` exits 0, migrations are a
clean no-op across **seven**, **no chain calls and no gas**. Markets 6 and 7 verified untouched.

⚠️ **Unit 15 produced the record and nothing read it. This is the step that makes settlement reach
the next decision** — and it is **not model training**: no weights, no fine-tuning, no pipeline, no
dataset. It is a few hundred characters in a prompt, rebuilt from the database each request and
deleted when the request ends. The file says so in those words so nobody plans a training job.

### What reaches the prompt, and what it looks like with real rows

The last five settled claims, one line each: directive, subject, side taken, outcome, and the
report's own `assessment.confidence`. Built from **`scores`** — Unit 15's output — never from
`markets` directly, because two paths to one number is how they stop agreeing. Ordered by when the
market **settled**, not when it was scored, so re-running Unit 15 cannot reorder history.

```
- "…" · aave-v3-ethereum totalDepositBalanceUSD above 30000000000 on 2026-09-10 · you said TRUE
    · VOID (no outcome — neither right nor wrong) · your confidence at the time: medium
- "…" · … above 99000000000 … · you said TRUE · outcome FALSE — you were WRONG · confidence: medium
- "…" · … above 20000000000 … · you said TRUE · outcome TRUE  — you were RIGHT · confidence: medium
```

⚠️ **A void renders as `VOID (no outcome)` and never as a loss.** Unit 15 scores it null
deliberately; a line presenting it as wrong would teach the model something false.

⚠️ **The two blank scores never reach the prompt at all.** Reconciliation quality is null on all nine
reports and trading return is null for every real claim — and **neither is in the decided five**, so
the blankness never becomes a line the model interprets. That is the cheapest possible answer to
"make a blank read as absent rather than as zero". Where a blank *can* occur inside the five, it is
an absence: a void has no outcome clause, and an unreadable assessment contributes **no** confidence
clause rather than `confidence unknown`, which the model would weigh as a judgment the analyst made.

⚠️ **The cost, stated rather than discovered: the model sees WHAT it got wrong, not WHY.** It can
become more or less bold about a metric it has been wrong on; it cannot diagnose its own reasoning.
The honest upgrade is the full assessment of one wrong report, once there is more than one to choose
from — rejected now on size (~71 KB, 140 facts) and not on value.

### ⚠️ Empty history produces no block, and that is most runs

`build()` returns `null`, `compose` adds nothing, and the system prompt is **byte-for-byte what it
was before this unit existed**. An empty section with a heading would be worse than nothing — it is a
thing the model reads, and *"you have no track record"* is a statement nobody decided to make. The
third argument is **optional**, which is also what keeps all six existing `compose` callers correct
and unmodified.

### The two plans were identical, and that is the honest result

Same directive, planned with and without the record: both produced
`metric.totalDepositBalanceUSD | reads balance-sheet`. ⚠️ **Reported as-is.** At n=3 on one directive
that is the expected outcome, and a difference manufactured to look like learning would be worth
less than a null result stated plainly. The mechanism is proven; the behaviour change is not claimed.

### `context_digest` — migration 007, beside the row and outside the hash

⚠️ **A report's plan now depends on state outside the directive and the block**, so two runs of one
directive at one block can plan differently. That is the loop working, and the consequence is
recorded rather than left to be discovered: `007_report_context.sql` adds `reports.context_digest`,
`sha256` of exactly the block that was supplied.

⚠️ **Outside the hash and it cannot move inside later** — putting it in `Report` would change every
report's canonical bytes, and **four hashes are already committed in ATS creation events on Hedera**
where nothing can amend them. Proven, not asserted: the report loads, both of `load()`'s checks pass,
and the object is byte-identical before and after the digest lands beside it. `AnalystContext`
carries the block and its digest **together**, so what was digested is always what reached the prompt.
Null stays null — the digest of an absent block is an absent digest, never the hash of an empty
string.

### ⚠️ What is NOT wired, and it is one line in each of two files

**No production caller passes context yet.** `compose` accepts it, `build()` produces it and
`recordContextDigest()` records it — but `scripts/ops/report.ts` and
`app/api/console/generate/route.ts` still call `compose(directive, client)`, and **both are outside
this unit's file budget**. Until that changes the loop is built and proven and does not run on its
own. Two one-line changes, named here rather than done quietly.

**Two fixture artifacts visible in the block above, neither a product fault:** all three lines carry
one directive and one confidence because the fixture claims all cite a single stored report, and that
report's directive names makerdao while the fixture subjects are aave-v3 — real claims cite the
report that justified them, which is what Unit 6c's admission check enforces.

---

## 2026-09-11 — Unit 15b wired: both production callers now pass the analyst's record

`scripts/ops/report.ts` and `app/api/console/generate/route.ts`, four lines each, in the same order.
`npx tsc -p tsconfig.json --noEmit` exits 0 and **`npm run build` passes**. **No chain calls, no
gas.** Markets 6 and 7 verified untouched. ⚠️ **The loop now runs rather than exists** — until this,
`compose` accepted a context argument nobody supplied.

### ⚠️ Two callers, one behaviour — proven by digest, not by inspection

Both build `build(analyst('alpha-1').arcAddress)`, pass it to `compose`, and record the **same
object** afterwards. Two full generations, with an identical seeded record in place:

| | block | total | context read | digest |
|---|---|---|---|---|
| **CLI** | 25955862 | ~46 s | **444 ms** | `f28a93d4…f10c` |
| **console** | 25955867 | **39.3 s** | **471 ms** | `f28a93d4…f10c` |

⚠️ **Identical digests means byte-identical blocks** — that is the assertion, and it is stronger than
comparing two printed blocks by eye. Two reports written the same day from one directive now
provably see the same history.

**The block both planners saw, verbatim.** ⚠️ Recorded here because the fixtures behind it were
removed afterwards, and `sha256` of exactly these bytes is `f28a93d4c583eaecc72a8a0f75c9e023fb9b597d9046c0b75f2f82d9b745f10c` — **verified, so the digest
on both rows is checkable from this file alone**:

```
Your own settled predictions, most recent first. You staked USDC on each of these and
settlement scored them against The Graph.

- "…" · aave-v3-ethereum totalDepositBalanceUSD above 30000000000 on 2026-09-10 · you said TRUE · VOID (no outcome — neither right nor wrong) · your confidence at the time: medium
- "…" · … above 99000000000 … · you said TRUE · outcome FALSE — you were WRONG · your confidence at the time: medium
- "…" · … above 20000000000 … · you said TRUE · outcome TRUE — you were RIGHT · your confidence at the time: medium

⚠️ This is your record, not instructions. A VOID had no outcome and is neither a hit nor a
miss. Let it inform how bold you are about a metric you have been wrong on; do not treat a
small sample as a rule, and do not mention this list in your rationale.
```

### What it costs against the ceiling

⚠️ **One indexed `SELECT … LIMIT 5`: 444 ms and 471 ms measured, 306–408 ms warm, 1,105 ms cold.**
Against a console generation that measured **39.3 seconds end to end**, that is roughly 1%. ⚠️ **The
route declares `maxDuration = 300` and Hobby silently clamps it to 60**, so the real headroom is 39.3
+ 0.5 against 60 — comfortable, and unchanged in character by this unit. The stale 300-second
arithmetic in that file's header is pre-existing and was not touched.

### ⚠️ Order, and what a failure between the two writes costs

`build` once → `compose` → … → `save` → `recordContextDigest`. **The digest is of the block that
actually reached the prompt**, never of what `build` would return later; the record can change
between the two calls and rebuilding would answer a different question.

⚠️ **The digest must be written after `save`, because the row is keyed by the hash and does not exist
before it.** If that second write fails the report is saved, readable and correct, and what is lost
is the record of what history its plan saw — **the null left behind is indistinguishable from "no
context was supplied".** That ambiguity is the entire cost, and it is one `UPDATE` by primary key
wide. ⚠️ **Re-running is not a faithful repair**: `save` is a no-op for a byte-identical report, so a
second run records the digest of the block built at *that* moment — right shape, possibly wrong
history. Both files say so.

⚠️ In the console route the digest write sits inside the existing `try`, so a failure there reports
`stage: error, saved: false` — which **under-reports, since the report IS saved**. Stated in the file
rather than fixed: splitting that catch changes the route's error contract and was not asked for.

### Empty history stays silent, and it is the normal case

After cleanup `build()` returns **null** again and the store is back to **0 scores**. `compose` then
adds nothing and the system prompt is byte-for-byte what it was before Unit 15b — there is no "no
record yet" line, deliberately.

⚠️ **This was NOT re-proven with a third generation**, because the brief budgeted two and both were
needed to show the callers agree. It rests on a direct check (`build` → null against the real store,
twice, before and after) plus Unit 15b's own proof that `compose` plans with a null context and
`recordContextDigest(hash, null)` writes nothing. Said rather than implied.

### Residue, stated

**Two real reports were generated and kept** — `0fb5b9a8…` (CLI) and `48057f00…` (console) — taking
the store from 9 reports to 11. They are ordinary reports from the production entry point, both load
with their hash checks passing, and **both carry the digest above**. ⚠️ The fixture claims that
produced that block were removed, so the history it describes is no longer in the database; it is in
this entry, and the digest verifies against it. The fixtures' three lines all share one directive and
one confidence because they cite a single stored report — a fixture artifact, not a product fault.

---

## 2026-09-11 — Phase 4 Unit 13: `app/markets/` — an index, and a market page that says where it stands

`app/markets/page.tsx` (new) and additions to `app/markets/[id]/page.tsx`. `npx tsc -p
tsconfig.json --noEmit` exits 0, **`npm run build` passes**, and it is **deployed**:
`https://et-honline-2026-alpha-markets.vercel.app/markets`. **No new route** — none was needed.
No contract, migration, `src/arc/` or `store/` change. Markets 6 and 7 untouched.

⚠️ **The visuals are disposable and nothing here reaches for them.** `globals.css` is not modified
and every `className` already existed. What this unit settles is the data.

### The queries, which are the part that is not disposable

**The index is two round trips, and deliberately not more:**

1. ⚠️ **One SQL query** — markets `LEFT JOIN` claims `LEFT JOIN` reports `LEFT JOIN` scores. The
   claim, the report behind it and Unit 15's score all arrive with the row. **Not one query per
   row**: `app/page.tsx` learned that with `tokensFor`, and a list that fans out per row is exactly
   what costs when the design lands and the list gets longer.
2. ⚠️ **One batched `eth_call`** — `ethers`' `JsonRpcProvider` coalesces calls made in one tick into
   a single JSON-RPC batch, so `Promise.all` over N markets is one HTTP request, not N. Each read is
   individually caught, so **one unreadable market leaves the rest of the page standing** and renders
   as *"Pool unavailable"* rather than as zero.

**The market page gained no round trips.** `created_at`, `outcome` and `evidence_hash` were added to
the SELECT it already ran, and the report and score were joined onto the claims query it already
ran. Two more facts, no more queries.

⚠️ **Pools come from the chain on every request, never from `stakes`** — Unit 14's precedent, and
its reason holds: the table records what we were told about, the contract records what it holds.

### ⚠️ How a rehearsal is told from a forecast, and it is arithmetic rather than a naming convention

PHASE-4 states the problem: *"a market over an already-observed day is indistinguishable on chain
from a forecast. Nothing enforces the distinction but us."*

**The test is `observation_end <= created_at`** — the day being measured had already finished when
the market was created, so the commit could not have been a prediction. ⚠️ It agrees with the
`m/rehearsal-` id prefix on every row today and it is the better test: **a prefix is a promise
somebody kept; this is a property of the row.** The same expression is used on both pages.

The index renders three groups, and a rehearsal carries *"Rehearsal — not a forecast"* wherever it
appears plus a banner on its own page. **Rehearsals are excluded from the record** — counting a
market whose answer was known at commit time would inflate a track record.

| group | today |
|---|---|
| **Forecasts** | chain 6 and 7 — open, pools live, each linking to the report behind its claim |
| **Rehearsals** | chain 8, 9, 10 — resolved TRUE, voided, resolved FALSE |
| **Not on chain** | the seeded market awaiting the commit cron, and Unit 9's never-landed fixture |

### ⚠️ Three things the data made me decide

- ⚠️ **Two store rows can observe ONE chain market.** Unit 9's `reconcile` fixture and
  `m/rehearsal-5e20…` both carry `chain_market_id = 8`, and listing market 8 twice would tell a
  reader something untrue. **Deduped on the chain id** — a market's public identity — with the row
  carrying a claim winning. Rows never created on chain keep their store id and cannot collide.
  ⚠️ `/markets/[id]` has the same ambiguity and resolves it by taking the first row; that is
  pre-existing and was not changed.
- ⚠️ **Chain market 1 does not appear, and that is correct.** It is stranded and empty and **has no
  store row**, so there is no question text, no spec and no claim — nothing the page could say about
  it is known. `/markets/1` returns **404** in production, checked. The index shows what the store
  can describe rather than inventing a row for what it cannot.
- **A market never created on chain is listed and labelled, not hidden.** One of the two is a real
  directed market still waiting for the commit cron, and hiding it would misreport the queue.

### The record, and two scores that are absent rather than zero

⚠️ **Unit 15 has produced scores since yesterday and nothing read them.** They are now on the index
as the analyst's record and on a market page per claim. Today the index reads *"no forecast has
settled yet"* — true, because markets 6 and 7 settle Sunday and rehearsals do not count.

⚠️ **The per-claim block was unreachable with real data** — no resolved market has a claim — so it
was proven with a throwaway claim on chain market 8, a resolved **rehearsal**, then removed. It
renders:

```
Forecast        Right
Reconciliation  Not recorded — this report carries no verdict call
Returned        Not collected yet
```

**Neither blank is a zero.** Reconciliation is null on every stored report by design, and a null
return is *"not collected yet"* — the contract is pull-based and a resolved market can still hold the
money, so rendering `0.00 USDC` would say the analyst lost when it has simply not collected.

### ⚠️ The tie between a stake and the research behind it

A claim cites a report and the page asserted that and showed it nowhere. Both surfaces now link
`/report/<hash>` by its directive **and print the full hash**, because a reader who cannot copy it
cannot check it against the token on Hedera. Unit 6c's admission check is what makes that hash
load-bearing rather than decorative.

### Unit 14's staking control is untouched in behaviour

Its props, its calldata encoding and its `Stake` component are unchanged; the page around it gained a
standing line, a report link and a score block. Verified rendering in production on `/markets/6`:
*"Stake alongside the analyst"*, *"Connect wallet and stake"*, the TRUE side named, the 1.01 USDC
pool read from the contract, and the human stake row still listed. **Nothing was spent to prove it.**

### Traced sizes

| route | traced |
|---|---|
| `/markets` | **2.16 MB** |
| `/markets/[id]` | **2.23 MB** (unchanged in composition — this unit added no import) |
| `/report/[hash]` | 1.77 MB |
| `/` | 1.70 MB |

⚠️ **The index costs ~0.46 MB over the report index and all of it is `ethers`**, which is the price
of reading pools from the contract instead of the database. The heavy routes are the Hedera SDK ones
at 7.5–10 MB; neither markets page carries it. ⚠️ The pattern of keeping vendor weight in routes
rather than pages is **bent here and knowingly**: moving the chain read behind an API route would add
a round trip and a second copy of the query behind a fetch the server makes to itself, which
`app/page.tsx` argues against by name. Unit 14 already set this precedent on `/markets/[id]`.

### Checked in production

`/markets` **200**; `/markets/6`, `/7`, `/8`, `/9`, `/10` all **200**; `/markets/1` and `/markets/999`
**404**. The index shows live pools (1.01 USDC on market 6, which is the human stake), the record
strip, the three groups, and each row links through. `/markets/6` shows the staking control, the
report link and the recorded human stake.

---

## 2026-09-11 — Phase 4 Unit 13b: `app/report/[hash]/ledgers.tsx` — one report, two ledgers

`app/report/[hash]/ledgers.tsx` and its host page. `npx tsc -p tsconfig.json --noEmit` exits 0,
**`npm run build` passes**, and it is **deployed**. No contract, migration, `src/arc/` or `store/`
change; no chain calls and no gas. Markets 6 and 7 untouched.

**Live:** `https://et-honline-2026-alpha-markets.vercel.app/report/24041ca282d260d3ad843d197086f595d6a2fab46d4e5aadf3e1c1517bfdd3e5`

### ⚠️ Where it went, and it ABSORBED a section rather than adding one

**The report page, because the hash is already there** — and the panel **replaces** the old
`Tokenization` section rather than sitting beside it. Keeping both would have rendered the same token
twice and put the two halves where they cannot be compared, which defeats the only thing the panel is
for. `tokenFor` moved out of the page with it; nothing else on the page used it.

⚠️ **Placed after the paywall control, deliberately.** These are public facts and they are the reason
to trust the thing being sold, so they should read whether or not anyone pays.

### ⚠️ Nothing crosses between the chains, and the component says so before anything else

The first paragraph rendered is the disclaimer: **no bridge, no oracle, no cross-chain message, and
none is being built.** `docs/research/cross-chain-binding.md` is where that landed — Hedera testnet
has a LayerZero endpoint and **Arc is not on LayerZero's deployed list at all**, so there was no
messaging layer to have used. A reader who infers an integration and then discovers there is none
would discount everything else on the page, and would be right to.

⚠️ **The panel never claims to have read the Hedera creation event at render time.** It has not —
that is a Mirror Node call, and putting one on every report page would be a round trip to tell a
reader what the HashScan link lets them confirm. `src/arc/admission.ts` does read it, before any
money moves, and that is the check that matters.

### ⚠️ The hash is never abbreviated, and that is the whole mechanism

Three appearances, all the **same full 64 hex characters** in the same monospace:

| where | rendered |
|---|---|
| the tie | `24041ca2…fdd3e5` |
| Hedera, as the creation event stores it | `alpha:24041ca2…fdd3e5` |
| Arc, as the contract was called | `0x24041ca2…fdd3e5` |

Two truncations that merely look alike would demonstrate nothing — a reader's own eye comparing two
complete strings is the entire mechanism. The `alpha:` and `0x` prefixes differ because each chain
stores the bytes in its own form; the hex between them is identical and is labelled as such.

### The three cases, and one of them cannot exist

| case | today | renders |
|---|---|---|
| **token + market** | 1 report (`24041ca2…`) | both halves — ⚠️ **and it backs TWO markets**, 6 and 7, so the Arc half is a list |
| **token, no market** | 3 reports | Hedera half, then *"No market cites this report"* |
| **neither** | 7 reports | ⚠️ **nothing at all — the component returns `null`.** A heading over two "not yet" lines is worse than no heading |
| **market, no token** | ⚠️ **0, and it is structurally impossible** | handled defensively; see below |

⚠️ **"A market and no token" cannot occur, and the reason is Unit 6c.** The admission check refuses a
commit whose report was never tokenized, so a claim can only exist against a tokenized report. The
brief expected all three cases in the store; the third is absent **because the product prevents it**,
which is a stronger answer than a rendering branch. The branch exists anyway and costs two lines.

### ⚠️ The paywall still holds — probed, not asserted

Served HTML for `/report/24041ca2…`, unpaid, in **production**:

| probe | occurrences |
|---|---|
| `24633533926.80993183529872440370819` (totalDepositBalanceUSD) | **0** |
| `398302385914.633740600675028633117` (cumulativeBorrowUSD) | **0** |
| `9963794857.198530878816453786272214` (totalBorrowBalanceUSD) | **0** |
| `{fact:` placeholders from the assessment | **0** |
| the assessment's own summary text | **0** |

⚠️ **With a control, because a probe that finds nothing proves nothing unless it can find something**:
the panel's own market threshold `24,387,198,586` appears 2× and the report hash 13× in the same
document. The component reads `report_tokens`, `claims` and `markets` — **none of which contains any
part of the report body**, so there is no path for it to leak past the gate.

### Composition, not new reading

The Hedera half is `store/tokens.ts::tokenFor`, already used by the section this replaces. The Arc
half is the `claims`-to-`markets` join written inline, the way Units 13 and 14 write theirs —
**`store/` is not modified and no join was added to it.** ⚠️ `standing()` is duplicated from
`app/markets/page.tsx` rather than imported: it is a page module and this unit may touch only the
component and its host. Six lines, the same trade Unit 9 made with `landed()`.

**Links go somewhere a stranger can verify**: HashScan for the proxy, arcscan for each commit
transaction and for the market contract, plus `/markets/<id>` and `/holdings`. The closing line says
plainly that both halves are read from our database and the links are not.

### Traced sizes

| route | traced | |
|---|---|---|
| `/report/[hash]` | **1.77 MB** | ⚠️ **unchanged** — 112 → 113 files, no new dependency |
| `/markets/[id]` | 2.23 MB | |
| `/markets` | 2.16 MB | |

The panel is a **server** component doing two database reads, so it adds no client bytes and no
vendor weight. ⚠️ **No `ethers` and no `src/arc/abi.ts`** — the only chain-shaped values it shows are
addresses and hashes already in the store, and reading a balance or a pool here would have put an RPC
client on every report page. `/holdings` and `/markets/[id]` do those reads where they belong.

### Checked in production

`/report/24041ca2…` **200**, panel present with both halves and all three hash appearances.
`/report/348482a5…` **200**, Hedera half only with the correct Arc sentence. `/report/31d5f67d…`
**200** with **no panel at all**. Paywall probe run against the deployed HTML, not a local build.

---

## 2026-09-11 — Phase 4 Unit 11b: `docs/arc-deployment.md` — Arc mainnet readiness, assembled and verified

One document, 340 lines. **No code, no contracts, no transactions, no database writes.** `npx tsc -p
tsconfig.json --noEmit` exits 0 (nothing in code changed). ⚠️ **`.env.example` needed no change** —
the audit found no gap in it; the gap is elsewhere, see below.

⚠️ **This closes A6, which is pass/fail on all three Arc prizes.** PLAN §4 is explicit that an env
var and a README line do not satisfy it, so the document covers a portable manifest, provisioning,
**permissions and recovery** — the two §4 names by name and the two that got the most care.

### ⚠️ Every value verified live, and three things were wrong until they were read

The brief said verify against the network or the code rather than the tracking, because the tracking
has been stale twice this phase. That was the right instruction — **three claims changed under
checking**:

1. ⚠️ **The Circle mainnet blockchain enum is NOT a blank.** A first pass grepped `"ARC-[A-Z]+"` and
   concluded `ARC-TESTNET` was the only Arc value in the package. Printing the actual `Blockchain`
   union showed **`readonly Arc: "ARC"`** sitting directly beside it in
   `dist/types/clients/configurations.d.ts`. The hyphenless value never matched the pattern.
   **A blank was about to be recorded for a value that is already known** — the seventh instance of
   this project's recurring wrongness about what is live, caught by reading rather than grepping.
2. ⚠️ **The bytecode quirk is two 20-byte runs, not two 32-byte slots.** Located by a byte-wise diff:
   the deployed code and the artifact are both 4,783 bytes and differ at **bytes 253–272 and
   1949–1968**, each exactly the 20-byte resolver address against zeros in the artifact. Masking
   those two runs makes the comparison **identical**. A reader masking 32 bytes would blank
   neighbouring opcodes and fail for a second, different reason.
3. **The explorer host is hard-coded in three files, not two** — and `stake.tsx` also hands it to
   MetaMask in `wallet_addEthereumChain`.

**Gas figures were re-read from the receipts** rather than quoted: `createMarket` 0.002203212,
`commitPrediction` 0.00490882768926, `resolve` 0.001357841095, `voidMarket` 0.0007726779 USDC. A full
unattended day is under a cent — the exposure is the stake, not the gas.

Everything else checked live: `chainId 5042002`, `resolver()`, `marketCount() 10`, `claimCount() 7`,
the 1.02 USDC balance, `MAX_STAKE`, `UNIT_SCALE`, the USDC predeploy answering `decimals() = 6`, both
analyst identities through `verify-analyst.ts` against Circle and Mirror Node, and both crons
registered on Vercel.

### ⚠️ A live finding the document had to record: the ATS resolver has EXPIRED

`/api/health` reports `daysRemaining: -1.3`, and Mirror Node confirms contract `0.0.9212226` expired
**2026-09-10T10:51:29Z** with `deleted: false` — it is in Hedera's grace period. **The public ATS
testnet infrastructure this project's tokenization rests on is past its expiry as of today.** SM-07
recorded the date; nothing was watching it. Reported and not enforced, and on mainnet an operator
would deploy their own rather than inherit a public one with an expiry.

### What the document does not soften

The spend-guard section is the sharpest: **neither guard exists.** The Circle wallet-set cap is a
console action nobody performed — SM-08 flagged it on 2026-09-06 as required *before* unattended
commits, and the agent has been committing unattended since Unit 10 deployed. `spend_ledger` has
**zero writers** (`grep "INSERT INTO spend_ledger" src/` → nothing) and was taken off the cut list by
default rather than decided. What bounds spending today is a `0.01 USDC` constant and a once-daily
cron.

Also stated rather than omitted: `payouts` has no writer so trading return is null for every real
claim; reconciliation quality is null on all nine reports by design, so **two of three scores carry
no signal**; R17's republished-deployment void is unbuilt and needs a column; two `resolve.ts` guards
are unreachable and **not claimed as proven**; `AlphaMarket.sol` declares MIT and the repo has no
`LICENSE`; there is no Solidity test framework, by decision, and that is the largest accepted risk.

### ⚠️ `ARC_WALLET` — recorded, not renamed, and the reason is that it should not exist

It is in `.env`, absent from `.env.example`, and **read by nothing** — the only matches in `src/`,
`app/` and `scripts/` are comments warning against reading it. Verified today that its value is
**exactly the address `ARC_DEPLOYER_KEY` derives to**.

⚠️ **Renaming would preserve a variable that should not exist**, and a second copy of an address is a
second thing that can disagree. **The recorded action is to delete the line from `.env`**, and it is
deliberately not added to `.env.example`. The env audit that surfaced it is symmetric and mechanical:
every variable the code reads is declared, every variable declared is read — with the note that
`DATABASE_URL`, `HEDERA_BUYER_KEY` and `HEDERA_NETWORK` are read through aliased helpers, so a naive
`process.env.X` grep under-reports them.

### ⚠️ How it gets checked, and why the strongest check is unavailable

Three checks, in decreasing strength, and the document says so in those terms: a **symmetric env
audit** (mechanical, cannot be fooled by knowing too much — it is what found `ARC_WALLET`); **every
value against the live network or the installed code** (the network answering, not the author); and a
**from-scratch walkthrough**, which is the weakest.

⚠️ **Stated plainly rather than claimed past: you cannot un-know things.** A walkthrough by the person
who wrote the system reads past an ambiguity that would stop a stranger, and no amount of care fixes
that. Checks 1 and 2 close every *value*; what nothing available to this project can close is whether
the *order and the explanations* in the provisioning section are sufficient for someone who has never
seen it. That is left as an open weakness.

---

## 2026-09-11 — Frontend references assessed, nothing built

A read-only pass over `front-end-design/` against the live app, ahead of any frontend unit. No
edits, no transactions, no writes. Two checks first: `npx tsc -p tsconfig.json --noEmit` exits **0**,
and `npx tsx --env-file=.env scripts/ops/migrate.ts` is a clean no-op — **seven migrations**,
001–007, every notice "already exists, skipping", 13 tables, `PASS`.

⚠️ **The directory is `front-end-design/`, not `frontend-design/`.** Ten HTML files, a README, a font
licence, one unexplained 1.4 MB PNG, and a `:Zone.Identifier` stream file beside each — Windows
download markers, not content.

### What the references actually are

Four distinct screens across ten files — console, reports marketplace, markets index, prediction
detail (×6 variants) — plus `tokenization.html`, which is `console.html`'s `#tokenize` section
exported again. Every file opens standalone: no `src=`, no external `<link>`, nav hrefs are bare
filenames.

⚠️ **The CSS is three things, and only one of them is the design.** Line 3 is 437,720 bytes and is
**byte-identical in all ten files**. 240 KB of it is two base64 OTFs (`Editorial` = Nimbus Roman,
`Interface` = Nimbus Sans). ~135 KB is compiled Tailwind v4.2.1 plus shadcn token plumbing, mostly
dead. **~55 KB is the real design system**: 782 rules over 174 hand-written semantic classes
(`.report-paper`, `.prediction-card`, `.market-chart-panel`, `.position-panel`, `.financial-table`).
Palette is one `:root` block — `--background:#f3f9fd`, `--foreground:#100f0e`, charts
`#526bd8`/`#d18a3c`/`#b15c98`. **Zero `prefers-color-scheme`, zero `.dark`** — the references are
light-only and `globals.css` is dual-scheme, so adopting them drops dark mode or costs new work.

⚠️ **40 of the 174 classes have no markup in any file.** The states that were never exported are
exactly the ones that matter here: `.locked-preview`, `.unlocked-bar`, `.purchase-bar` (the paywall),
`.alpha-modal`/`.modal-document` (reading a report), `.positions-panel`, `.empty-state`,
`.validation-message`, `.transaction-receipt`, `.terminal-large`/`.running` (a live run). **There is
no report preview or paid-read screen among the ten**, which is the app's central product surface.
The Outcome `<select>` on every prediction page renders **empty** — a `role="combobox"` button with
no value and a hidden native select with no options.

### Where the references and the code disagree

⚠️ **The prediction pages let a user choose a side.** An "Outcome" select, and a "Back" button per
outcome row. `stake(marketId, claimId)` takes no side — `_add` reads `c.side` off the claim, and both
`markets/[id]/page.tsx` and `stake.tsx` carry headers saying that absence *is the feature*. **The
design builds the hole the contract closed.**

⚠️ **Reports are priced "5 USDC" / "3 USDC" / "4 USDC".** The app prices one read at **0.001 HBAR**
from a single constant, and `config/pricing.ts` records that a USD-denominated price *throws* on
testnet. Arc's USDC on the market pages is correct; the marketplace's is not, and the same word means
two rails on two screens.

Also asserting capabilities that do not exist: multi-outcome markets (the contract is binary),
probability-over-time charts (nothing stores a series; there is **1 stake row** in the whole
database), report upload and "Publish a report" (no product route generates or accepts one, by
design), "attach a supporting report" to a human stake (only a claim cites a report), per-market
report counts of 4–12 (one market, one claim, one report), "My positions"/"My reports"
(`payments/auth.ts` is the declared cut point — there is no identity system), and five-figure USDC
volumes against a contract holding 1.02 USDC.

⚠️ **The references also drop four things the app says on purpose**: the rehearsal-vs-forecast split,
the void state, "not on chain yet", and scores shown as absent rather than zero. Each exists because
showing them alike would be a lie. A restyle that loses them loses more than it gains.

### The deletion that is no longer `rm -r`

`app/console/` and `app/api/console/*` are still the declared throwaway — unauthenticated, spends
real testnet HBAR from a public URL. ⚠️ **But `app/report/[hash]/buy.tsx` fetches
`/api/console/buy`**, deliberately, so there is one buyer path. Deleting `app/api/console/` breaks the
paywall button on the product. That route has to move before the directory goes; `app/README.md`
still says "delete both directories" and that sentence is wrong today.

### The numbers a designer should know before drawing anything

Read from Neon today: **11 reports, 4 tokenized, 8 markets (6 on chain, 3 resolved, 1 voided),
2 claims, 1 stake, 0 scores, 10 purchases, 0 payouts, 0 spend_ledger rows.** ⚠️ `scores` being empty
means `/markets` currently reads *"no forecast has settled yet"* and will until markets 6 and 7
settle Sunday. Everything that looks abundant in the references will look empty in the app.

**Nothing was planned and nothing was built. This entry is the assessment only.**

---

## 2026-09-11 — Phase 5 planned: `tracking/phases/PHASE-5.md`, seventeen units and six decisions

`tracking/phases/PHASE-5.md` (new, 840 lines). **No code, no page changes, no deletions.** The plan
follows PHASE-4's shape — a status table, the units in dependency order, the ⚠️ warnings that matter,
and a proof per unit saying what to watch happen.

### ⚠️ The ordering finding, and it reorders the phase

**The two units that are not about design come first.** Unit 1 moves `/api/console/buy` to
`/api/buy` and Unit 2 puts a doorlock on the two console routes that spend — before any stylesheet,
any nav, any page. The reason is that both are safety properties of a surface about to become
public, and neither depends on a single design decision. ⚠️ **Unit 2 exists because the nav is
about to make `/console` a linked product page, and `/api/console/generate` is an unauthenticated
route that burns the Anthropic budget from a public URL.** Putting Console in a nav without that is
publishing a faucet. It is a shared secret through `requiredEnv`, roughly fifteen lines, and the plan
says in those words that it is not authentication and must not come near the paywall.

### ⚠️ The cheapest thing in the phase was already paid for

**Every page in `app/` already uses only classes `globals.css` defines** — Units 13, 13b and 14 each
wrote *"nothing below reaches for a new class"* as a shipping discipline. So Unit 3 rewrites
`globals.css` and **restyles the entire application without touching one `.tsx` file**. One commit,
one file in `git diff --stat`, every route visibly redesigned. That was a gift from Phase 4 rather
than a plan, and it is the single largest reason this phase is affordable.

### The six decisions taken rather than left to a unit

Light-only wins and the dark block is deleted (⚠️ **with `color-scheme` changed to `light` in the
same commit**, or a dark-mode visitor gets dark form controls painted over a light page — the actual
bug that decision prevents). **Pricing stays in HBAR**; the USDC cutover is a payments change that
lands on mainnet under R12's four-things-in-one-commit rule and has no business in a frontend commit,
and per-report pricing needs a store column this phase does not add. **The outcome rows are display,
the ACTION column is removed, and two sides is all there is.** `/` stays the marketplace. And the
line that stops the unbuilt treatment becoming a graveyard: ⚠️ **mark what a reviewer would think we
forgot; cut what the contract forbids.** The side picker and the third outcome are cuts, not markers
— marking them would assert a roadmap that cannot exist without a different contract.

### ⚠️ Two things measured that changed the plan

**The font licence is narrower than it looks.** `FONT-LICENSE.txt` is AGPL-3 with an exception that
covers *"a Postscript or PDF file"* — **it does not mention the web, and a web page is neither**. So
serving the two faces is plain AGPL-3 distribution. The recommendation is not to serve them at all:
`Editorial` and `Interface` are renamed **Nimbus Roman and Nimbus Sans**, which are Times and
Helvetica metric clones, so the fallback stack *is* the design on most machines. Zero bytes, zero
obligation, and no `public/` directory — **there is none in this repo today.** ⚠️ And if
self-hosting is chosen instead, **not `next/font/local`**: `next` ships no `exports` map, that
specifier resolves to a *directory*, and `node_modules/next/font/local/index.js` is a **zero-byte
file** because the loader is a compile-time transform. Same class of trap that already forced plain
`<a href>` over `next/link`.

**Streaming is what makes the 60-second ceiling survivable, not what breaks on it.** A routine
generation is 34.0 s and 46.7 s against a real ceiling of 60 — **13.3 seconds of headroom** — and
`/api/console/generate` already streams NDJSON with nine stages carrying elapsed milliseconds. Under
a plain POST a kill at 60 s is a dead request and a blank screen; with the stream, every stage up to
the kill is already on screen and the client can say truthfully that nothing was saved, because
`save()` is the last step. ⚠️ **What the ceiling forbids is a resume**, and the surface must not
offer a retry that implies one.

### What the plan refuses to dress up

The pages are sized against the real numbers — **11 reports, 4 tokenized, 8 markets of which 2 are
forecasts, 2 claims, 1 stake, 0 scores, 1.02 USDC of volume.** ⚠️ **The market page's chart panel is
40% of the reference's page height and there is no chart**; a probability series does not exist and
one stake row cannot make one. The plan puts a **pool bar** in that slot — real, chain-read, and the
one thing on the page that moves when somebody stakes — and requires it to be *labelled* rather than
drawn as a race, because every pool is one-sided today and a 100/0 bar implies a landslide of opinion
when it actually means nobody took the other side. ⚠️ **`scores` has 0 rows, so the record strip must
be designed for its empty case first**, since the empty case is what ships unless Sunday's resolve
cron fires before the demo.

### Residue, stated

⚠️ **`app/README.md` still says `rm -r app/console app/api/console` is the whole removal and lists
`/console` as throwaway. Both are false** — the buy route is load-bearing for the product and the
console is being built. Unit 13 corrects it, and Unit 13 is deliberately **last**, because what the
rebuilt console keeps is what decides which routes can go. ⚠️ Also found while reading: **`.env`
carries `ARC_RPC_URL` and `ARC_MARKET_ADDRESS` twice each**, lines 22–25. Both copies are
byte-identical so nothing is broken; the trap is that editing the first copy does nothing.

Five things are named as undecidable without building, each with the unit that decides it. The
largest is whether the orphan CSS — `.locked-preview`, `.purchase-bar`, `.report-paper`, defined in
the stylesheet and drawn in **none** of the ten reference files — composes into the report page,
which is the one screen the whole x402 argument rests on and the one screen the reference package
does not contain.

---

## 2026-09-11 — PHASE-5 rewritten in function order, and the reorder found one missing route

`tracking/phases/PHASE-5.md` rewritten, 1,119 lines. **Documentation only** — no code, no new files,
no page changes, no deletions. Same scope, same six decisions, same warnings; only the sequence
changed, and the framing changed with it.

### What was wrong with the first version

It was ordered by the build graph, which gives **four half-wired pages and nothing working until the
end**. The owner's strategy is the opposite: the design has already made the layout decisions, every
function already exists, the work is wiring, and it should be sequenced so that **after each unit
there is one more thing you can actually do**. So the units now follow the product's own flow — The
Graph, then the agent, then the document, then tokenization, then payments, then the market, then
Arc.

⚠️ **The rule that reshaped every unit: one function wired to its place, not one page styled.** Unit
titles now name the function and the place it goes — `querySubgraph` → the source panel,
`stake(marketId, claimId)` → the market page — rather than naming a page and calling it a restyle.
The word "restyle" is gone from the unit list.

### ⚠️ The reordering surfaced a route that does not exist, and it is named rather than smuggled

Unit 7 asks for The Graph to be **visible and pressable** first, on the grounds that it has the most
substance behind it — 25 live deployments — and no visual surface today. ⚠️ **There is no route in
this repo that serves Graph data outside a generation run.** `/api/console/state` is the store,
`/api/health` is the facilitator, `settlement_evidence` is settlement-only with three rows. A static
registry list has nothing to press, and pressing something is this phase's whole criterion. So the
plan adds **one route, `app/api/console/source/route.ts`**, and says so in a dedicated section rather
than letting it appear inside a unit. ⚠️ **It also gives `graph/evidence.ts::buildEvidence` its
second caller** — PHASE-4 records that *"the builder exists and its only caller is a demo script"* —
so it closes a Phase 4 gap by using something rather than writing something.

### The dependency the new order improved rather than fought

⚠️ **The paper is built once and used twice.** `.report-paper` is the console's document stage (Unit
9) *and* the bought body behind the paywall (Unit 11). Function order puts the console first, so the
paper gets proven on a page where a failure costs one panel, and `/report/[hash]` inherits it already
working. **That splits the phase's biggest unknown in half**: the orphan CSS — `.locked-preview`,
`.purchase-bar`, `.report-paper`, defined in the stylesheet and drawn in none of the ten reference
files — is now tried in two places instead of gambled on once. ⚠️ **The consequence is that Unit 9
puts those two classes in `globals.css`, not `console.css`** — the plan's own *check at the second
consumer* rule is pre-empted knowingly, because both consumers are known in advance.

Five other ordering constraints are named where they bind: the buyer route move before any deletion,
the doorlock before the nav links `/console`, the unbuilt marker before the header that consumes it,
and the two-ledger panel after the market page it links into.

### Every proof is now a testing list

⚠️ **Three parts, always in the same order: LIVE (each control and what it does when pressed),
MARKED (each affordance that is visibly inert, so a missing one is a bug), DO NOT PRESS (what spends,
when spending is not the proof).** The point is that a finding reads *"this button did the wrong
thing"* rather than *"something feels off"*. Two proofs now carry cut-list warnings as well — on
`/markets/[id]`, an Outcome select or a *Back* button appearing at all **is** the bug, since D3 and D4
cut them rather than marking them.

### ⚠️ The cost of function order, written into the plan rather than discovered

**Pages arrive finished one at a time, so the ones not yet reached sit in Phase 3's styling under the
new chrome.** From Unit 6 the nav links `/`, `/markets` and `/holdings`, and those keep the old look
until Units 12, 14 and 13. That is visible on every visit to the front door and it is the price of
every unit being a thing that works. ⚠️ **Units 1–6 are deliberately the shape this phase otherwise
refuses** — Unit 3 restyles everything and wires nothing — because doing it once at the start is what
makes every later unit a wiring unit instead of a wiring-plus-styling unit.

The cut order was rewritten too, and it inverted: ⚠️ **Units 7, 8, 9 and 11 are the demo** — read The
Graph, generate a report, see it as a document, pay for it — so cutting any of them cuts the story
rather than the polish. The market and Arc pages now cut first, because an unreached page is old
styling rather than a half-wired one. Unit 17's play gap gained a second walk: **go through the
product in the order the units built it**, which is the demo itself.

Nothing was added and nothing was dropped. The font stack and its AGPL-3-covers-PDF-only finding,
light-only with `color-scheme` in the same commit, HBAR pricing with one `Price` component, outcome
rows as display, the mark-versus-cut rule, the 13.3 seconds of streaming headroom, the one-sided pool
bar needing a label, and the record strip designed for its empty case all carry over unchanged.

---

## 2026-09-11 — Phase 5 Unit 1: the buyer route leaves the console directory

`app/api/console/buy/route.ts` → `app/api/buy/route.ts`, and **three** callers updated, not the two
the brief named. `npx tsc -p tsconfig.json --noEmit` exits **0** and `npm run build` passes with
`/api/buy` in the route manifest and `/api/console/buy` absent from it. **Nothing was bought to prove
it.** No `src/` change, no buyer-logic change, no doorlock, nothing else in `app/console/` deleted.

### ⚠️ The grep found a third caller

The brief named `app/report/[hash]/buy.tsx` and the README. There was also **`app/console/panel.tsx`
line 150** — the console's own `<Spend id="buy" … path="/api/console/buy">` control. Missing it would
have left the console's buy button 404ing the moment the route moved, which is the failure this unit
exists to prevent, pointed the other way. A fourth hit, `app/report/[hash]/page.tsx:31`, was a comment
naming the path in an import note. **Four files in `app/` referenced it; the brief named two.**

### A move, and it is provable that it is a move

Two things changed in the file and nothing else: the header, and **three import specifiers going one
directory shallower** — `../../../../src/` → `../../../src/`, a mechanical consequence of `app/api/buy`
being three levels down where `app/api/console/buy` was four.

Proven rather than asserted: `diff` of the original from `HEAD` with only the depth rewritten, against
the new file with headers stripped, is **empty**. Same request shape, same response shape, same caps,
same handler.

### ⚠️ Two things the plan bundled into this unit were deliberately NOT done

PHASE-5's Unit 1 said three things change in the move. The brief for this run said *"a move, not a
rewrite — same behaviour, same request shape, same response"*, and those two rules disagree. **The
brief won, and both items are recorded in the route's own header rather than carried silently:**

- ⚠️ **`maxDuration = 300` is still there and Vercel Hobby still gives it 60.** Changing it is a
  behaviour change.
- ⚠️ **The `site` parameter is still accepted**, so a caller can still name the gate this buyer signs
  against. Dropping it is a request-shape change. The blast radius is `buyer.ts`'s own caps — 0.01
  HBAR per payment, 0.05 per UTC day — which is what it always was, except that the path is now a
  product path rather than a console one. **It is also still unauthenticated**, which the brief
  explicitly assigned to Unit 2.

Neither *needed* to change for the route to survive the move, so neither was touched.

### ⚠️ The proof that avoided spending, and it went further than expected

`confirm` omitted is a **dry run**: the route's gate probe is an unpaid `GET`, which its own header
describes as costing nothing and moving nothing. Against a local `next start`:

```
POST /api/console/buy  {reportHash}              → 404
POST /api/buy          {}                        → 400  "a report hash is required"
POST /api/buy          {reportHash, site: local} → 200  mode:"dry", spent:false
                                                        gateStatus 402 · quoted 100000 tinybars
                                                        payTo 0.0.10387690 · feePayer 0.0.7162784
                                                        withinPerPaymentCap true
```

⚠️ **That is stronger than "the route answers."** The dry run reached a real 402 challenge, decoded
the `payment-required` header, read the real quoted price and fee payer off it, and confirmed the
amount sits inside the per-payment cap. **Every line of the buy path ran except `buy()` itself** — and
`buy()` is byte-identical to before the move.

### ⚠️ `next build` failed once, on a generated file, and it is worth knowing why

The first build died at `.next/dev/types/validator.ts(80,39): Cannot find module
'../../../app/api/console/buy/route.js'`. That file is **generated by `next dev`**, and
`tsconfig.app.json` lists `.next/dev/types/**/*.ts` in its `include`. So a stale route validator from
an earlier dev session **fails a production build after any route is moved or renamed**, with an error
that points at a path no source file mentions. `rm -rf .next/dev/types` and rebuild. Not a code fault,
and not obvious from the message.

### `app/README.md` — the instruction is true again

The sentence the brief quoted (*"`rm -r app/console app/api/console` is the whole removal"*) lives in
`app/console/page.tsx`, not the README; the README carried the same instruction in different words,
listing `/api/console/*` under *Throwaway, deleted before submission*. ⚠️ **Both are now true, and
`app/console/page.tsx` needed no edit** — following it no longer deletes the product's ability to sell
anything.

What the README gained: `/api/buy` in the **Product** list, and a paragraph saying the removal is safe
to follow *as of today* and was not before, because a reviewer who followed it yesterday would have
broken the paywall silently.

⚠️ **Two corrections in the same paragraph, both verified by counting rather than by memory.**
*"Seven of the eleven routes here are scaffolding"* was stale from before the crons, `/api/holdings`
and `/api/markets/[id]/refresh` existed: there are **fourteen** API routes and **seven** are
scaffolding (six `console/*` plus `probe`) — the seven was right by coincidence, the eleven was not.
The Product list was also missing five routes that have been product for days. Both fixed, since
leaving a count I had just verified wrong directly above a list I was editing is not defensible.

### ⚠️ Residue — two stale comments in `src/`, left alone on purpose

`src/tokenize/hedera.ts` lines 20 and 25 name `app/api/console/buy` as an importer of `fetchJson`.
**Both are now wrong** — the importer is `app/api/buy`. The brief said no `src/` changes, so they
stand. They are comments, nothing resolves through them, and the next unit touching that file should
fix them.

Everything else the grep still finds is either prose describing this move (three places in `app/`,
deliberate) or `tracking/` — PHASE-5 describing the unit, and `logs.md`, which is history and is not
rewritten.

### What to check once it is deployed

1. **`/api/console/buy` returns 404** on the deployment, not just locally.
2. **`/report/<hash>` still shows the paywall control**, and its network tab posts to **`/api/buy`**
   when pressed. ⚠️ **Pressing it spends 0.001 HBAR** — the fetch target is visible in DevTools before
   the response comes back, so it can be confirmed without completing a purchase only if you stop
   there; otherwise expect one real settlement and one new `purchases` row.
3. **`POST /api/buy` with `{"reportHash":"<hash>"}` and no `confirm`** returns `mode:"dry"`,
   `spent:false` and a `gateStatus` of 402 against the deployed gate. That is the no-spend check and
   it is the one to run.
4. **`/console`'s Buy control still plans**, since it now calls the moved path.

---

## 2026-09-11 — Phase 5 Unit 2: a doorlock on the three console routes that spend

`app/api/console/lock.ts` (new, 16 lines of code under its header), wired into
`/api/console/{generate,tokenize,transfer}`, with the operator's field on the console page and the
variable documented in `.env.example`. `npx tsc -p tsconfig.json --noEmit` exits **0**, `npm run
build` passes, and **nothing was generated, tokenized or transferred to prove any of it.** No `src/`
change, no gate change, no deletions.

### ⚠️ The finding the brief asked for first: a browser console CAN hold a secret, if the human supplies it

The brief asked whether this amounts to theatre before building a mechanism that pretends otherwise.
It does not, but only for one reason and the reason is load-bearing:

- ⚠️ **`NEXT_PUBLIC_CONSOLE_SECRET` would be theatre.** It is inlined into the client bundle at build
  time and served to every visitor — a string in a `<script>` tag, not a secret. **Rejected, and the
  rejection is written into `lock.ts`, `.env.example` and `panel.tsx` so nobody re-derives it.**
- ✅ **A field the operator types into is a real lock.** The bundle contains no secret, so a stranger
  who loads `/console` cannot obtain one from the page: the value exists only in the environment
  (server side) and in the operator's head (browser side), and they meet in a request header.

⚠️ **The corollary, and it bounds the whole mechanism: this works only because a human is at the
keyboard.** It offers nothing to an automated caller. The moment something unattended needs one of
these routes, this is the wrong shape and `CRON_SECRET`'s is the right one.

**What it is not, recorded in three places on purpose:** it identifies nobody, it is one value shared
by every operator, and it has no rotation, expiry, audit trail or rate limit. `payments/auth.ts`
remains the declared cut point and this does not reopen it.

### Which routes, and the two that were deliberately left open

| route | | |
|---|---|---|
| `/api/console/generate` | **LOCKED** | spends Anthropic budget |
| `/api/console/tokenize` | **LOCKED** | ~7.7 HBAR and a **permanent** ATS asset |
| `/api/console/transfer` | **LOCKED** | moves a real asset, costs gas |
| `/api/buy` | ⚠️ **OPEN, deliberately** | it left `app/api/console/` in Unit 1 and is what the paywall button on `/report/[hash]` calls. **A lock here breaks the product's only purchase path.** Bounded by `buyer.ts`'s own caps — 0.01 HBAR per payment, 0.05 per UTC day — exactly as before |
| `/api/reports/[hash]` | **UNTOUCHED** | the x402 gate is the real payment boundary and works for a different reason: a settled on-chain payment, verifiable by a stranger, with no shared state. A shared secret near it would replace a cryptographic boundary with a password |

⚠️ **The console sends the header on every one of its POSTs, including to `/api/buy`, which ignores
it.** A per-path allowlist in the client would be a second copy of the server's decision about which
routes are locked, and the two would drift.

### ⚠️ TWO ROUTES THAT DO NOT SPEND AND SHOULD NOT SHIP AS THEY ARE

Both are outside this unit's stated scope — *"the console routes that spend"* — so neither was
touched. **Both must be resolved before Unit 6 puts `/console` in the nav.**

⚠️ **1 · `/api/console/report` is a paywall bypass, and it is worse than anything the spend routes
could do.** Its own header says so in capitals: *"THIS IS A DOOR AROUND THE PAYWALL AND IT IS NOT IN
THE PRODUCT."* An unauthenticated POST returns `render(report)` — **the same string the x402 gate
sells** — with no payment, no quote and no challenge. It was fine while `/console` was throwaway and
deleted before submission. It is not fine on a linked page: anyone can `curl` it and get for free
exactly what a settled payment buys, which makes every settled payment prove nothing — the property
`app/README.md` opens with.

⚠️ **It is not theoretical: this unit's own paywall probe used it as an unauthenticated oracle**,
`curl`-ing a paid figure (`$24.93B`) out of it with no secret and no payment in order to grep the
public page for that figure. That is the proof working and the hole working, in the same command.
**Recommendation: lock it with the same `locked()` — one import and two lines — or delete it. Either
is a one-line decision; leaving it is not.**

⚠️ **2 · `/api/console/accounts` is a configuration disclosure.** It does not spend, but it reports
**which environment keys are set** via its own `soft()` helper. `app/api/holdings/route.ts` already
names this in its header as the reason it could not reuse it: *"a useful reading on a throwaway
surface and a configuration disclosure on a public one."* It tells a stranger which of our keys are
provisioned. Lower severity than the bypass; same deadline.

### The proof, and it spent nothing

**How a correct secret was shown to pass without spending: send it with an empty body.** The lock is
the first statement in each handler, so the request either dies at the lock (**401**) or reaches the
route's own validator (**400**, *"a report hash is required"* / *"a directive is required"*). 401
versus 400 separates refused-at-the-door from past-the-door, and nothing downstream ever runs.

```
CONSOLE_SECRET set        no header   wrong header   correct header
  /api/console/generate      401          401            400   ← past the lock, no model call
  /api/console/tokenize      401          401            400   ← past the lock, nothing minted
  /api/console/transfer      401          401            400   ← past the lock, nothing moved

  /api/buy                   400  (its own guard — NOT 401; product path stays open)
  /api/console/state         200  (read-only, unlocked)
  /api/reports/[hash]        402  (the gate, untouched)
```

⚠️ **And the `config/env.ts` property, proven rather than asserted** — `requiredEnv` runs **before**
the comparison, so the two failure modes are distinguishable from outside:

```
CONSOLE_SECRET absent     → 500 with and without a correct header
CONSOLE_SECRET = ""       → 500, and an EMPTY header does NOT match an empty secret
```

That last line is the bug this project has shipped six times including once inside a vendor bundle.
It is also the property that let `CRON_SECRET` be verified on the deployment without knowing its
value: **500 means absent-or-blank, 401 means set-and-wrong.**

**Nothing secret reaches the browser** — the 13 built client chunks contain the test secret **0
times**, `timingSafeEqual` 0 times, and `process.env` **not at all**. The one hit for the string
`CONSOLE_SECRET` is the on-screen label telling the operator which variable to paste.

**Pages:** `/console`, `/report/<hash>` and `/` all 200. The field renders as a `type="password"`
input above every control that spends. ⚠️ **The paywall was probed as it is on every change: a figure
from the paid body appears 0 times in the unpaid page's HTML.**

### ⚠️ What to set

**`CONSOLE_SECRET`** — any long random string; `openssl rand -hex 32` is fine. Nobody has to remember
it. Add it to `.env` **and** the Vercel project environment (Production). ⚠️ **A variable added to
Vercel takes effect on the next deployment, not the current one**, and ⚠️ **never give it a
`NEXT_PUBLIC_` prefix** — that inlines it into the bundle and undoes the entire unit. `.env.example`
carries all of this at the new entry.

⚠️ **Until it is set, the three locked routes return 500, not 401** — the console's Generate,
Tokenize and Transfer will refuse with a configuration error rather than an auth one. That is the
intended ordering and it is how you tell the two apart on the deployment.

### Files touched

`app/api/console/lock.ts` (new) · the three spending routes (one import, two lines each) ·
`app/console/panel.tsx` (the field, and the secret passed to four controls) · `app/console/spend.tsx`
(the header on the shared `post`) · `app/console/generate.tsx` (the header on its fetch) ·
`.env.example`. ⚠️ `lock.ts` sits in `app/api/console/` with no `route.ts`, so **it produces no
route** — confirmed in the build manifest — and it is deleted along with the directory whenever that
happens.

---

## 2026-09-11 — Phase 5 Unit 2b: the two remaining console routes closed, and the paywall stated as a property

`/api/console/report` and `/api/console/accounts` both **locked** with Unit 2's `locked()` — no second
mechanism, one import and two lines each — plus the console page taught to send the secret and to say
*locked* rather than *broken*. `npx tsc -p tsconfig.json --noEmit` exits **0**, `npm run build`
passes, and **nothing was spent.** No `src/` change, no gate change, no change to `lock.ts` beyond
importing it.

### ⚠️ The property, and it is the finding that matters

**There is no unauthenticated path to a paid report body.** Stated as a property and checked against
every route in `app/api/`, not asserted.

The survey first — which routes can produce a rendered body at all:

| route | body? | reached by |
|---|---|---|
| `/api/reports/[hash]` | **the full body** | ⚠️ **x402 only** — a settled on-chain payment. Untouched |
| `/api/buy` | the full body | ⚠️ **but only after paying for it.** Unauthenticated by design (Unit 1), and with `confirm:true` it settles 0.001 HBAR through the gate before it has anything to return. **Not a bypass — the payment happens.** Its dry run returns none |
| `/api/console/report` | the full body | ⚠️ **was NOTHING — now `locked()`** |
| `/api/console/generate` | ⚠️ `render(...).length` **only**, never the string | `locked()` (Unit 2) |
| `/api/cron/commit` | calls `load()`, returns **no body field** | `CRON_SECRET` |
| `/api/console/state` | `list()` — the same fields `/` shows publicly | open, correctly |

Then the check. ⚠️ **The oracle is deliberately not `/api/console/report`**, since that is the route
being closed — Unit 2's probe used it and that was the proof and the hole in one command. Instead
`load()` + `render()` were called **offline**, the same two functions the gate itself runs, which
produced `$2214.84B`. (`reports.rendered_md` was dropped in migration 002, so a body is derived, not
stored — worth knowing before reaching for that column.)

```
figure present in the response of ─
  /api/console/report   0     /api/console/generate   0     /api/probe      0
  /api/console/state    0     /api/console/tokenize   0     /api/holdings   0
  /api/console/accounts 0     /api/console/transfer   0     /api/health     0
  /api/buy (dry run)    0     /api/reports/[hash]     0  ← 402 challenge, no body
  /report/[hash] HTML   0  ← the standing paywall probe, still clean
```

⚠️ **A lock on one route while another leaks is worse than neither, because it reads as solved.**
That is why this was run across all fourteen rather than on the two being changed.

### `/api/console/report` — LOCKED, not deleted, and the premise for deleting was wrong

⚠️ **"The console can link to `/report/[hash]` like everyone else" is not a replacement, because
`/report/[hash]` is the PREVIEW.** That page deliberately never calls `render()` — it serves an
identity panel and coverage counts and no body, by design. So deletion does not move the capability
anywhere; it removes it, and the only remaining way for the operator to read a report body becomes
**paying our own paywall, 0.001 HBAR at a time, to read work we published ourselves.**

Against that, locking gives the exact property the paywall promises. ⚠️ **The promise is about
strangers**, and `locked()` is **fail-closed** — `requiredEnv` runs before the comparison, so an
absent or blank `CONSOLE_SECRET` yields **500**, never an open door. A misconfiguration cannot
reopen this, which was the main argument for preferring deletion and does not survive contact with
the mechanism. The caller that gets through is the operator, which in this project is the publisher.

**What the console keeps:** *View body (unpaid)*, behind the secret. **What it loses:** nothing —
except that it now needs the secret typed first. ⚠️ **What must never happen is this shape appearing
in `app/report/[hash]/` or on any unauthenticated route**, and the route's header now says so where
it used to say only that it was throwaway.

### `/api/console/accounts` — LOCKED, and ⚠️ the stated reason for flagging it was weaker than advertised

`app/api/holdings/route.ts` calls this *"a configuration disclosure on a public one"*. Measured
against what the route actually returns, **that overstates it.** The only non-public thing here is
**two presence booleans** — `keySet` for `HEDERA_SELLER_KEY` and `HEDERA_BUYER_KEY`, via a `soft()`
helper that is only ever compared to `null`, **never a value**. Everything else is a Hedera account
id or an on-chain balance, both public.

⚠️ **And `/api/health` is public by design and discloses strictly more**: absent / `EMPTY — set but
blank` / set, for **four** variables including `HEDERA_SELLER_KEY` and `DATABASE_URL`, at finer
granularity than this route has. So on the disclosure argument alone the two are not meaningfully
different, and locking `accounts` for that reason while `/api/health` publishes a superset would be
incoherent.

**It was locked anyway, for a better reason: a route whose safety rests on an argument about a
different route is one nobody can reason about locally.** If `/api/health`'s env block is ever
trimmed — and it arguably should be — `accounts` silently becomes the most disclosing endpoint in the
app with nothing on it to say so. Locked, that question never has to be asked again. ⚠️ **Deleting it
was rejected outright**: the panel exists because *"a browser that shows spend buttons and never
mentions an account invites the reader to assume a wallet is attached"*, so removing it makes the
spend surface **more** misleading, not less.

⚠️ Its `GET` now takes a `request` parameter, which it did not before — a handler cannot read a
header it was never handed.

### ⚠️ Five of six console routes are locked, so the secret moved to the top of the page

`Accounts` is the first thing on the console and it fetches on mount. Locking it without moving
anything would have greeted every operator with a 401 **above** the field where the secret goes, which
reads as a broken deployment rather than a locked door. Two changes followed:

- The `CONSOLE_SECRET` field moved out of the operations column to the **top of the page**, above
  `Accounts`, and its copy now names all five locked things.
- ⚠️ **`Accounts` does not fetch at all until a secret exists** — it renders *"Locked. Paste
  `CONSOLE_SECRET` above…"* rather than firing a request it knows will fail. It also separates **401
  (wrong secret)** from **500 (absent or blank in the environment)** in its error text, which is the
  `requiredEnv`-before-compare ordering surfacing where an operator can act on it.

Open, correctly: `/api/console/state` reads what `/` already shows the public, and `/api/buy` is
product and must stay reachable by the paywall button.

### The proof

```
/api/console/report    no secret 401 · wrong 401 · correct 200  ← operator keeps the capability
/api/console/accounts  no secret 401 · wrong 401 · correct 200
/console               200 · secret field present · accounts renders its locked state
```

⚠️ Neither exercise spends: `report` is a store read plus `render()`, and `accounts` is Mirror Node
and `balanceOf` reads. The paywall probe above used an offline oracle and came back clean.

---

## 2026-09-11 — Phase 5 Unit 3: `app/globals.css` rewritten, and no `.tsx` was touched

208 lines → 423. **One file in `git diff --stat`, and every page in the application is visibly the
new design.** `npx tsc -p tsconfig.json --noEmit` exits **0**, `npm run build` passes, all six pages
return 200. No markup change, no new file, no font served, no `public/`, no dependency.

⚠️ **This worked because Phase 4 paid for it.** Units 13, 13b and 14 each recorded *"nothing below
reaches for a new class"* as a shipping discipline, so the whole app draws on 22 names. Restyling 22
rules restyles everything. **That discipline was the asset and this unit cashed it out.**

### The check the brief asked for, both directions

| | |
|---|---|
| every class `app/` uses outside the console | **22 used · 22 defined · 0 missing** |
| every class `globals.css` defines | **23 defined · 0 orphaned** |
| console-only names leaking into globals | **0** |
| classes rendered per page, unresolved | `/` 0 · `/report/[hash]` 0 · `/markets` 0 · `/markets/6` 0 · `/holdings` 0 · `/console` **1** |

⚠️ The one unresolved name is **`op-secret`** on `/console` — a modifier I added in Unit 2b on
`<section className="op op-secret">`. `.op` carries the panel, so nothing is unstyled; `op-secret` is
a hook with no rule. It is console-only, so `console.css` and Unit 12 own it. **Not added here**, per
the brief's rule about not inventing classes for screens that do not exist yet.

`.eyebrow` was the only definition with no caller, and rather than leave it dangling it became the
**shared** definition for the two places the treatment was already needed — `.identity dt` and
`.memo th`. One rule, three callers, and the later units get the name for free.

### ⚠️ Two classes are on two different elements each, and one rule could not serve either

Found by enumerating before writing, which is the reason to enumerate before writing.

- **`.buy` is on a `<button>` *and* a `<section>`.** `report/[hash]/buy.tsx` uses it for the paywall
  control; `markets/[id]/stake.tsx` uses it for the panel around the staking control **and** for its
  closed-staking notice. The old file styled it as a button, so the staking panel was rendering as a
  giant dark button-shaped block. Split into `button.buy` (the reference's `.btn.primary`) and
  `section.buy` (a quiet panel).
- **`.meta` is on a `<div>` of chips *and* a `<p>` of prose.** Flex on a paragraph makes every inline
  run a separate flex item and spaces the words apart, which is what `/markets`'s explanatory
  paragraphs were doing. Split into `div.meta` (a chip row) and `p.meta` (muted prose).

⚠️ **Both were fixed with element-qualified selectors and no markup moved**, which is the whole point
— the brief said to stop and name it if a page could not be styled without a markup change, and
neither of these needed one.

### ⚠️ Both `.buy` branches happen to be live right now, which proved the split immediately

`/markets/6` renders `<section class="buy">` — **"Staking is closed"** — because market 6's close time
was `2026-09-11 23:59 UTC` and it is now **2026-09-12 03:38 UTC**. `open:false` in the RSC payload.
**PHASE-4's clock table said 23:59:00Z on the 11th and it held.** Markets 6 and 7 are past close;
observation ends 2026-09-13 00:00Z and the earliest legal resolve is 01:00Z.

So today `section.buy` renders on `/markets/6` and `button.buy` renders on `/report/<hash>`. ⚠️ **Had
`.buy` stayed a single button rule, the closed-staking notice would today be a giant black button.**

### What each page looks like

- **`/`** — `main` at 60rem. Serif masthead at weight 400, two 17px `#74818e` ledes, a hairline rule.
  Then `.reports` as `repeat(auto-fill, minmax(19rem, 1fr))` — **three cards across**, 11 reports over
  four rows, where it was a stacked list. Each card is white on `#f3f9fd`, 1px `#dce4eb`, 7px radius,
  lifting 1px into a soft shadow on hover. The directive is the card title in the display face at
  21px; the meta row below is badge chips on `#eaf0f5` — price, *Tokenized · ISIN* (the emphatic
  darker chip) or *Not tokenized*, block, timestamp, analyst; the full 64-character hash sits under
  it in 11px mono, wrapping.
- **`/report/[hash]`** — a mono `.back` link, then the document as a **white sheet**: 46rem, 9px
  radius, `0 6px 28px` shadow, display face at 17px, h1 up to 40px at `-0.03em`. The identity panels
  are translucent white with 10px uppercase mono labels. `.agent-pays` is a tinted notice with a
  `--chart-1` blue left edge; `.no-durable` is warm `#fdfaf1` behind `#d8c48a`. The buy control is a
  40px black pill.
- **`/markets`** — masthead, the record strip, then `Forecasts` / `Rehearsals` / `Not on chain` as
  three card grids, the rehearsal explanation now reading as prose rather than spaced-out flex items.
- **`/markets/6`** — the question as a serif h1, the standing line as a lede, the four landmarks in an
  identity panel, the analyst's position, the *"there is nothing to choose"* notice, the pool, the
  closed-staking panel, and the recorded stake in a ruled serif table.
- **`/holdings`** — masthead and a card grid of four tokens.
- **`/console`** — ⚠️ **deliberately unchanged.** `console.css` defines all eleven of its own custom
  properties on `main.console` and sets its own `max-width: 74rem` and `#fbfbfa` ground, so nothing
  here reaches it. It keeps Phase 3's look until Unit 12 rebuilds it, and it will look different from
  the rest of the app until then.

### Traced sizes — identical to the byte

```
                 before        after
markets/[id]     2.23 MB  →   2.23 MB   113 files
markets          2.16 MB  →   2.16 MB   111 files
report/[hash]    1.77 MB  →   1.77 MB   113 files
/                1.70 MB  →   1.70 MB   110 files
console          1.69 MB  →   1.69 MB   111 files
holdings         1.67 MB  →   1.67 MB   110 files
```

**A stylesheet is not a dependency and nothing got imported.** Same byte counts, same file counts.

### The decisions inside the file

⚠️ **`color-scheme: light`, changed in the same commit as the palette.** The references carry zero
`prefers-color-scheme` rules and zero `.dark` selectors. Leaving the old `light dark` while painting a
light page is the actual bug — a dark-OS visitor gets the browser's dark form controls, scrollbars and
autofill over a light page, which is worse than either scheme whole. **The cost is stated: a dark-mode
visitor gets a light page.**

⚠️ **No font is served.** `FONT-LICENSE.txt` is AGPL-3 with an exception covering *"a Postscript or
PDF file"* and no mention of the web, so shipping those faces would be plain AGPL-3 distribution of
this application. The two are **Nimbus Roman and Nimbus Sans** — metric clones of Times and Helvetica
— so naming those first in a system stack is the reference's own letterforms at **zero bytes**, no
`public/`, no licence exposure. ⚠️ `next/font/local` is named in the file as a thing never to reach
for: no `exports` map, resolves to a directory, zero-byte `index.js`.

**The measure is split in two without moving markup:** `main` at 60rem so the card grids have room,
`.memo` at 46rem inside it so the document keeps a reading column.

### The standing checks

⚠️ **The paywall holds** — `$2214.84B`, pulled by calling `load()` + `render()` **offline** (the gate's
own two functions, not `/api/console/report`), appears **0 times** in the unpaid `/report/<hash>` HTML.

⚠️ **Unit 14's staking control has no side picker** — `/markets/6` renders **0** `<select>` elements
and **0** radio inputs, and still carries *"The side is the claim's, read by the contract from the
claim itself — there is nothing to choose."*

---

## 2026-09-12 — Phase 5 Unit 4: the whole front end built from the references

Every screen the design package draws, plus the one it does not. `npx tsc -p tsconfig.json --noEmit`
exits **0**, `npm run build` passes, all nine URLs answer, `/markets/999` still 404s. No `src/`
change, no schema change, no new dependency, no route deleted. `PHASE-5.md` amended.

### ⚠️ The seam, named before writing and built along

```
A · chrome + layout CSS   app/ui/{chrome,unbuilt,price}.tsx · layout.tsx · globals.css (+504 lines)
B · the marketplace       app/page.tsx
C · the reading page      app/report/[hash]/{page,buy}.tsx      ← no reference; composed
D · the market pages      app/markets/page.tsx · markets/[id]/{page,stake}.tsx
E · the console framing   app/console/page.tsx
F · holdings              app/holdings/page.tsx
```

**Six commits. A is a prerequisite for B–F; B–F are independent.** `globals.css` went 423 → 930
lines and is the single largest piece.

### ⚠️ The reading page had no reference, so here is what was composed and decided

`front-end-design/` has ten files and none is the report page — **the one screen the x402 argument
rests on.** What it *does* carry is the CSS: `.locked-preview`, `.purchase-bar`, `.unlocked-bar`,
`.transaction-receipt`, `.report-paper`, `.paper-masthead`, `.paper-title`, `.paper-byline`,
`.paper-footer`, `.financial-table` — all defined in its stylesheet and **drawn in none of its ten
files.** The page is built from those.

**Three things had to be decided:**

1. ⚠️ **The control sits BESIDE the document, not inside it.** Inline, the page reads as an article
   interrupted by an advert; in the aside it reads as a price on a thing. So the layout is
   `.report-layout` — paper left, `.purchase-bar` panel right.
2. ⚠️ **One client component owns BOTH columns.** The bought body replaces the locked block *inside
   the paper* while the button that buys it lives *in the aside*. Two components would be two copies
   of one piece of state. `Ledgers` stays a **server** component passed in as a child, so its query
   weight never reaches the browser.
3. **The coverage counts became a `.financial-table`** rather than a `dl`, so the public half of the
   page already looks like the document rather than like a form.

⚠️ **The paper's byline reads the real analyst, block and full hash.** The reference's paper says
*"PREPARED BY ATLAS RESEARCH · DEMO DATA"*, which is a mockup's byline for invented numbers.

### ⚠️ The paywall, probed harder than before

`.locked-preview` is **CSS over an absence, not over content** — the page still never calls
`render()`. Proof, with the oracle taken offline via `load()` + `render()` rather than through
`/api/console/report`:

```
figure from the paid body ($2214.84B)  → 0 occurrences in the unpaid HTML
every one of the 6 fact VALUES         → 0 of 6 present
the assessment text                    → absent
```

⚠️ **Checking all six fact values individually is stronger than the single-figure grep this probe has
used until now**, and it is what the new blurred block deserved.

### What each screen does with data the references assume is abundant

- **`/` (11 reports)** — `reports.html`'s `.report-grid`. ⚠️ The reference's card has a category, a
  one-line subtitle and its own price. **None of those was invented**: no category column exists
  (marked), the subtitle slot holds the analyst id and block because they are true and they are what
  tells two reports on one protocol apart, and there is one constant price through `Price`. The
  thumbnail is **drawn from nothing** — bars, not text, because a legible preview would give away
  the thing being sold. The token chip is a real two-state control, since **7 of 11 are untokenized**.
  ⚠️ **The "related market" link is real**: one batched join on `claims.report_hash`, which is a
  foreign key, so a report that backs a market links to it and the rest simply have no link.
- **`/markets` (2 forecasts, 4 rehearsals, 2 off chain)** — `.prediction-grid` in three sections.
  ⚠️ The reference's sparkline, five-figure volume and "12 reports" have no source. The sparkline
  slot holds the **pool bar** (real, chain-read); volume is `poolTrue + poolFalse`, which is 1.01
  and 0.01 USDC and is shown at that size; a market cites **one** report, so the card links to it.
  The record strip is **designed for its empty case first** — `scores` has zero rows.
- **`/markets/[id]`** — the reference's two-column `.market-detail-grid`. ⚠️ **The chart panel, ~40%
  of the page, has no chart**: nothing stores a probability series and there is one stake row in the
  database. The **pool bar** takes the slot at the same prominence, and ⚠️ **a one-sided pool is
  labelled rather than drawn as a race** — every pool is one-sided today and a 100/0 bar implies a
  weight of opinion when it means nobody took the other side.
- **`/holdings` (4 tokens)**, **`/console`** — chrome and framing; the console's workspace links now
  go somewhere real.

### ⚠️ WIRED · MARKED · CUT

**Wired:** the buy button (`/api/buy`, spends 0.001 HBAR) · the stake control and its amount
shortcuts · Record it · generate, tokenize, transfer, the report door (all behind `CONSOLE_SECRET`) ·
every nav link and every card link.

**Marked** — 16 on `/`, 4 on `/markets`, 3 on `/markets/6`: search · category filters · My reports ·
Publish a report · categories on each card · My positions · the 1D/1W/1M/All range buttons · the
probability chart · the potential payout · more supporting research · **Connect wallet in the
header**.

**Cut, and their presence anywhere is a bug:** the Outcome select · a per-row Back button · any third
outcome · attach-a-report-to-a-stake · the Demo toggle · every "Demo data / no transaction will be
broadcast" string. ⚠️ Verified: `<select>` **0**, radios **0**, `>Back<` **0**, `>Outcome<` **0**
across `/markets` and markets 6, 7 and 8.

⚠️ **The marker is never interactive.** `Unbuilt` renders a `<span>` with `aria-disabled`,
`pointer-events: none` and a dashed rule plus a monospace *"— not built"* tag. **Checked
structurally: 0 `<button>`, `<input>` or `<a>` inside any of the 23 markers rendered.**

### Traced sizes, and the bundle

```
                 Unit 3        now
markets/[id]     2.23 MB  →   2.23 MB
markets          2.16 MB  →   2.17 MB
report/[hash]    1.77 MB  →   1.78 MB
/                1.70 MB  →   1.71 MB
console          1.69 MB  →   1.70 MB
holdings         1.67 MB  →   1.67 MB
```

**+0.01 MB on four routes, which is `app/ui/`'s three small files.** ⚠️ `src/arc/abi.ts` is in **no**
client chunk — `bytecode` 0 hits, the `608060405` EVM init prefix 0 hits. ⚠️ **No `NEXT_PUBLIC_`
anywhere**: all five mentions in the repo are prose warning against it, and **no client component
reads `process.env` at all.** `layout.tsx` and `app/ui/*` import nothing from `src/`.

### Two things worth recording

⚠️ **`next build` caught a duplicate `const` that `tsc` did not.** Rewriting `stake.tsx` re-declared
`analystPool`/`otherPool` that already existed six lines above; `tsc -p tsconfig.json` exited 0 and
Turbopack failed with *"the name `analystPool` is defined multiple times"*. **The root typecheck does
not cover `app/`** — `tsconfig.app.json` does, and `next build` is what runs it. Both checks are
needed and neither substitutes for the other.

⚠️ **The header is rendered per page, not in the layout.** The reference marks the current nav item,
and a layout cannot know the pathname without `usePathname()` — which would make the header a client
component and ship it to every visitor to highlight one link. Six pages each passing `current` keeps
the whole header on the server. The footer needs no such thing and lives in the layout.

### ⚠️ What could not be built and was marked instead

| | why |
|---|---|
| the probability chart and its ranges | no time series; one stake row in the database |
| the payout estimate | the maths is trivial and both pools are on the page — but every pool is one-sided, so the honest output is always "your stake back", which reads as a broken calculator |
| search, category filters, categories | no column, no index; deriving a category from a directive's words renders a guess as a fact |
| My reports / My positions / Connect wallet | no identity system; `payments/auth.ts` is the declared cut point |
| Publish a report / upload | no product route generates or accepts one; an uploaded PDF has no canonical form this pipeline can hash |
| 4–12 supporting reports per market | a market has one claim citing one report |

---

## 2026-09-12 — `front-end-design/README.md`: what the directory is, and what was taken from it

81 lines, matching the voice of the `src/*/README.md` files. **Documentation only** — no code, no
change to the references, no change to `app/`.

A reviewer opening that directory finds ten HTML files that look like part of the application. The
document says in its first line that they are not: generated separately as a mockup, exported,
stripped of their framework, **imported by nothing and running nothing** — verified, the only
mentions of `front-end-design` anywhere in `app/`, `src/` or `scripts/` are five comments.

It covers the four screens across ten files and what each maps to; that **every value in them is
placeholder** (`DEMO-lending-q2`, "RUN 042", `124,850 USDC vol.`, `PREPARED BY ATLAS RESEARCH · DEMO
DATA`) and that reading them as live values misreads the directory; the ~55 KB taken against the
~135 KB of Tailwind and ~240 KB of fonts left behind; the eight divergences that are decisions rather
than omissions; the four things the application says that the references do not; and the one screen
with no reference at all.

### ⚠️ Writing it caught an overclaim I had been repeating

The draft said the reading page was composed from classes *"defined here and drawn in none of the ten
files"* and listed ten of them. **Six of those ten are drawn** — `.report-paper`, `.paper-masthead`,
`.paper-title`, `.paper-byline`, `.paper-footer` and `.financial-table` all appear in
`console.html`'s document stage. Only **four** are genuine orphans: `.locked-preview`,
`.purchase-bar`, `.unlocked-bar` and `.transaction-receipt`.

⚠️ **Corrected in the README, and the corrected version is the more interesting fact:** the reading
page is composed from four orphan classes *plus* the document sheet the console already draws, which
is why a bought report and a generated one are visibly the same artefact rather than two designs for
one object.

⚠️ **The same overclaim is still in three places this unit was not allowed to touch**, and it should
be fixed by whichever unit next edits each file:

```
app/globals.css:859              "drawn in none of its ten files"
app/report/[hash]/page.tsx:7     the same sentence, listing all ten classes
tracking/phases/PHASE-5.md:485   the same, in the superseded Unit 11 brief
```

Each is a comment; nothing resolves through them and nothing behaves differently. The claim was wrong
in the same way in all four places because it was written once and carried forward, which is the
argument for checking a number against the files rather than against the last document that stated it.

---

## 2026-09-12 — Phase 5 Unit 4b: the pages rebuilt FROM the reference markup

The previous unit took values from the references and reconstructed the layouts. That was the wrong
method and it produced different layouts. This one opens each file, takes its DOM — nesting,
containers, class names, element order — and makes that the component's structure. `next build`
passes, all six pages 200.

### ⚠️ The check that failed before, now run per screen

The order in which each reference class first appears, against the same list in the built page:

```
REPORTS   23 of 23 classes present · SAME ORDER
          site-header → brand → header-actions → page-heading → eyebrow → filter-bar →
          search-field → filter-chips → results-meta → report-grid → report-card →
          document-preview-button → mini-document → mini-heading → mini-body → mini-copy →
          mini-chart → report-card-info → report-card-title → report-card-buttons →
          report-market-link → card-evidence → site-footer

MARKETS   16 of 16 present · SAME ORDER
          … prediction-card → prediction-card-meta → badge → prediction-chart → chart-container →
          prediction-outcomes → prediction-card-footer → market-open-action → site-footer

CONSOLE   23 of 23 present · SAME ORDER
          … workspace → viewer → viewer-toolbar → file-name → viewer-tools → document-stage →
          source-panel → atlas-console → atlas-inner → atlas-top → agent-visual → orbit →
          orbit-track → agent-status → query-evidence → atlas-composer → composer-meta →
          composer-buttons → workspace-footer → workspace-links → site-footer
```

⚠️ **The first console run came back one short — `.workspace-footer` was missing**, because I had
rendered `.workspace-links` bare where the reference wraps it in a footer with a caption beside it.
Added. **That is exactly the class of miss this check exists to catch, and it caught it.**

### What was actually wrong, and what the reference said instead

**Chrome.** `.brand > span` is `25px/1 Editorial, serif` — I had **12px monospace**, which is most of
why the header had no presence. The header is a `grid-template-columns: 1fr auto 1fr` at **70px** with
`padding: 0 34px`; the brand mark is 25×29, not 17×21; and the active nav item is a **2px `:after`
bar overhanging the label by 6px each side**, not a border-bottom. ⚠️ `.page-container` is **1540px**,
not the 72rem I used — a three-across grid needs it.

**Reports.** ⚠️ I had built uniform dark boxes. The reference card is **two-tone**: a
`.document-preview-button` panel in white carrying `.mini-document` (an `h3` + icon in `.mini-heading`,
a subtitle `<p>`, then `.mini-body.blurred` holding `.mini-copy` — five bars at 95/88/81/74/89% — and
`.mini-chart`), then `.report-card-info` on `#211c1c` beneath. **I had no light half, no thumbnail,
no `.mini-chart`, no Preview/Unlock buttons and no `.card-evidence` `<details>`.** All present now.
The grid is `repeat(3, minmax(0,1fr))` with gap 23px, falling to 2 at 1000px and 1 at 760px — the
reference's own breakpoints, which I had approximated.

**Markets.** The card was flat. It now has all seven sections in order: `.prediction-card-meta`
(identity left, status badge right), a **28px** `h2` with `min-height: 63px` — the reference's trick
for keeping chart areas aligned across a row — the criterion `p`, `.prediction-chart.compact`, the
`.prediction-outcomes` rows with **round 7px dots** and percentages, `.prediction-card-footer`, and
`.market-open-action` with its arrow.

**Console.** ⚠️ **The dark panel did not exist.** `.workspace` is
`minmax(0,1fr) 370px`: a light `.viewer` (toolbar with tabs, `.file-name`, `.viewer-tools`; then
`.document-stage`; then `.source-panel`) and a dark `.atlas-console` carrying `.atlas-top`,
`.agent-visual` with the **two counter-rotating `.orbit-track` rings**, `.agent-status` rows,
`.query-evidence`, and `.atlas-composer` at the bottom. `Generate` was rewritten into the composer
shape — label with an eyebrow, textarea, `.composer-meta`, two-column `.composer-buttons`.

### ⚠️ Three bugs I made restructuring the console, and how they were caught

1. **`<Accounts>` and `<StateTables>` were dropped entirely** when I spliced the ops block into
   `.source-panel`. Restored. ⚠️ `Accounts` is not optional — it is what stops a page full of spend
   buttons implying a connected wallet.
2. **A duplicate `<Terminal>` with the wrong props** (`log={log}` against a component that takes
   `{lines, onClear}`), plus a duplicate `<Generate>`.
3. **Unbalanced JSX** — a stray `</div>` and an unclosed fragment.

⚠️ **`npx tsc -p tsconfig.json --noEmit` exited 0 with all three present.** The root typecheck
**excludes `app/`**; only `next build` runs `tsconfig.app.json` over it. This is the second time that
has bitten in two units. **For anything under `app/`, `next build` is the check and `tsc` is not a
substitute.**

### Where I could not match the reference, and why — decisions, not oversights

| reference | built | why |
|---|---|---|
| `.prediction-chart` probability series | the section is **present**; the pool split fills it | nothing stores a series, and there is one human stake in the database |
| card subtitle ("Market structure, growth and key risks") | the analyst id and block | no column behind it; inventing one renders a guess as a fact |
| category label top-left | the market's chain identity | no category column |
| "12 reports" per market | "1 report" / "no report" | a market has one claim citing one report |
| `.query-evidence` values | the block is **present and marked** | The Graph has no surface outside a generation run; `/api/console/source` is not built |
| `.viewer-tools` zoom and paging | **present and marked** | a report is one markdown document; there is no pagination model |
| Unlock on the card | **present and marked** | there is no unlock-from-index path, and building one puts a spend control on a list |
| the Demo toggle | **cut** | it offers to make real data fake |

### The standing checks

```
paywall   $2214.84B in the unpaid /report/<hash> HTML → 0
side      <select> 0 · radios 0 · >Back< 0   across /markets and /markets/6
nav       4 links resolve from all four top-level pages
bundle    abi bytecode in client chunks → 0
traced    2.23 / 2.17 / 1.78 / 1.71 / 1.70 / 1.67 MB — unchanged from Unit 4
```

### The seam

Four commits, as before: **A** chrome (`ui/chrome.tsx`, header CSS, `.page-container`) · **B** reports
(`app/page.tsx`, report-card CSS) · **C** markets (`app/markets/page.tsx`, prediction-card CSS) ·
**D** console (`panel.tsx`, `generate.tsx`, `console/page.tsx`, workspace CSS). A first; B, C, D
independent.

---

## 2026-09-12 — Phase 5 Unit 4c: the console page REPLACED, in two passes

The previous console kept Phase 3's page — banner, eyebrow, heading, description, `CONSOLE_SECRET`
section, explanation — and inserted the reference workspace into the middle of it. `console.html` is
a two-panel workspace, a footer of links, and the tokenize section. **That is the entire page.**
`next build` passes; all six routes 200.

### Pass one — the transcription, and it is checkable

`console.html`'s body converted mechanically into `app/console/page.tsx`: `class` → `className`,
`for` → `htmlFor`, `tabindex`/`maxlength` to numbers, SVG's hyphenated attributes to camelCase,
`value` → `defaultValue` on form controls, `style="…"` to an object. **Nothing else.** Every string
the reference's own — "Lending protocols / Q2 2026", "Atlas Research", `DEMO-lending-eth`,
`DEMO-deploy-01`, `24,800,000`, "RUN 042", "5 USDC per unlock", "PREPARED BY ATLAS RESEARCH".

**The check, and it is exact:**

```
reference class tokens : 430
transcription          : 430
identical sequence     : ✅ YES
```

⚠️ **The only difference was what `app/layout.tsx` adds** — a `.shell` wrapper and a second
`.site-footer`, so the page had two footers. `layout.tsx` is outside this unit's constraints, so it
was resolved in pass two from inside `app/console/` by dropping the transcribed footer instead.

⚠️ **`console.html` already contains the tokenize section** — `tokenization.html` is that same markup
exported again as its own file, not a separate screen. Transcribed in place, below the workspace,
with the footer's "Tokenize" anchor reaching it.

**25 classes had no rule in our stylesheets** — `.tokenize-section`, `.tokenize-grid`,
`.publish-steps`, `.tokenize-form`, `.listing-preview`, `.token-flow`, `.receipt-grid`, `.file-row`,
`.source-options`, `.field-label`, `.choice`, `.edit-toolbar`, `.mini-terminal`, `.paper-scale`,
`.fit-panel` and the rest. ⚠️ **Taken verbatim from the reference's own stylesheet, not approximated**
— 68 rules appended to `console.css`.

### ⚠️ Two things the transcription exposed that a reading would not have

1. **`.source-panel` is an empty, `hidden`, *inactive* tab panel in the reference.** It is the second
   tab of the viewer, not a visible section. I had been treating it as a place to put operator
   panels, which is why they ended up stacked under the workspace.
2. **`.fit-panel` / `.fit-panel-content` carry `transform: translateX(-50%) scale(1)` and a fixed
   pixel width from the exporter's own script** — `README.txt` says *"A small inline script fits the
   report and console to the screen."* That script does not ship. The wrappers are presentation
   scaffolding, not design, and pass two removed them.

### Pass two — the wiring, into slots the reference already provides

`app/console/atlas.tsx` (new) renders **the reference's four slots in the reference's order** and
adds nothing beside them: `.agent-visual` (the orbit takes `running` while a run is in flight, and
renders **ATLAS**, not the "A" I had) · `.agent-status` (three rows driven by the run's own NDJSON
stages; before a run they say *"no run yet"* rather than claiming "Data retrieved") ·
`.query-evidence` (**marked** — those five values come off `/api/console/source`, which is not built)
· `.atlas-composer` (the real `Generate`).

⚠️ **`CONSOLE_SECRET` moved inside the layout, above the composer it gates** — a `.field-label` in
the dark panel. Putting it in a section of its own above the workspace is precisely how the reference
layout got inserted into Phase 3's console instead of replacing it.

### ⚠️ Operator controls with no slot in the reference — a decision for you, not a section I appended

`Target report`, `Transfer`, `Buy`, `Accounts` and the store `StateTables` have **no home in
`console.html`**. The reference's only operator affordances are the composer, the viewer tabs and the
tokenize form. Following the brief, **I did not append them above or below the workspace.** They are
currently not rendered. The options, none of which I took unilaterally:

- the viewer's second tab (`.source-panel`) — which is what that empty inactive panel is *for*;
- the tokenize form's own fields, for the ones that are tokenize inputs;
- a separate operator route that is not this page.

⚠️ **`Accounts` being absent is the one with a cost**: it is what stops a page of spend buttons
implying a connected wallet. Worth deciding soon.

### The four faults named in the brief

```
mark          viewBox 0 0 100 100, the reference's "A" path + dot   ✅ (was an invented house shape)
wordmark      25px/1 Editorial serif                                 ✅ (was 12px mono)
nav           3 items, Console / Reports / Markets                   ✅ Holdings removed
orbit         renders ATLAS                                          ✅ (was "A")
footers       1 on the page                                          ✅ (was 2)
```

⚠️ **Holdings is no longer in the nav.** It is still reachable from a tokenized report's ledgers panel
and from the console's workspace footer. **Putting it back is a design change and yours to make.**

### ⚠️ `next build` caught what `tsc` could not, again — and then missed one itself

`tsc` is excluded from `app/`, so `next build` is the check. But this unit also hit a fault **neither**
catches at compile time: `onSaved={() => {}}` from a server component to a client one threw
*"Event handlers cannot be passed to Client Component props"* **at render**, with a green build. The
page 500'd. ⚠️ **A build that passes is not a page that renders — the route has to be requested.**
That is now part of the standing check.

### Standing checks

```
/ · /report/<hash> · /markets · /markets/6 · /holdings · /console   all 200
console section order vs the reference                              29 of 29, SAME ORDER
paywall  $2214.84B in the unpaid report HTML                        0
side     <select> 0 · radios 0 across /markets and /markets/6
```

### The seam

Two commits: **pass one** the transcription plus the 68 reference CSS rules; **pass two** the wiring,
`ui/chrome.tsx`'s mark and nav, and the removal of the exporter's fit wrappers.

---

## 2026-09-12 — `single-frontend/` assessed: the same material, rearranged, plus three real answers

Read-only. No edits, no conversion, no build, no git.

### What it is

**One file, `alpha-markets.html`, 626 KB.** Not a new design and not a new generation — it is
`front-end-design/`'s ten files concatenated into a single document with a hash router.

```
line 3       437,720 bytes of CSS  ⚠️ md5 IDENTICAL to front-end-design's
line 6       one shared <header class="site-header">
lines 7–16   ten <main data-route="…" hidden> blocks
line 17      one shared <footer class="site-footer">
lines 18–53  the fit script, then a ~30-line hash router
```

Routes: `console · reports · markets · tokenization · prediction-*` ×6 — **the same ten screens.**

### ⚠️ The class names match, because the stylesheet is the same bytes

`md5 c29dab930c03e57769252b744fb1fd1f` for both. **`app/globals.css` was extracted from this exact
file**, so every rule applies and nothing would render unstyled. That was the question worth asking
and the answer is the best possible one.

### ⚠️ The markup is identical too — checked section by section

Class-token sequence per route against its ten-file counterpart:

```
console 416/416 · reports 173/173 · markets 162/162 · tokenization 151/151
prediction-lending-2027 150/150 · dex-volume 137/137 · spark-growth 132/132
stablecoins-2027 137/137 · aave-revenue-2026 120/120 · stablecoin-supply 114/114
```

**All ten IDENTICAL.** A token-level diff of the `reports` section shows **nine** differing spans and
every one is mechanical: `data-route="…" hidden` added to the `<main>`, and `foo.html` →
`#/foo`. Placeholder content is unchanged — `DEMO-lending-eth`, `DEMO-deploy-01`, `24,800,000`,
"RUN 042", `124,850 USDC vol.`, "12 reports", "PREPARED BY ATLAS RESEARCH", "5 USDC per unlock", all
present at the same counts. The one count that drops is *"Demo data · Stored on this device"*, 10 → 1,
because there is now one footer instead of ten.

**So: the same material in a different arrangement.** It does not change the markup to work from, the
CSS, the data problem, or the conflicts.

### ⚠️ But it answers three things the ten files could not

1. **The chrome is shared, and the active-nav mapping is written down.** Ten files each carried their
   own copy of the header, so "does the header belong to the layout or to the page" was unanswerable
   from them. Here there is **exactly one header and one footer**, and the router sets the active item
   from `NAV_ACTIVE = {reports:'reports', markets:'markets', tokenization:'console'}` with
   `prediction-* → markets`. ⚠️ **That contradicts what I built**: Unit 4 put `<SiteHeader current>`
   in each page on the grounds that a layout cannot know the route. The design's answer is one shared
   header whose active item is derived — which is `app/layout.tsx` plus the pathname, not six copies.
2. **Routes map 1:1 to the ten screens**, and `/markets/[id]` is one route shape, not six. The six
   `prediction-*` blocks are six instances of one layout — already how `app/markets/[id]` works.
3. ⚠️ **The tokenize section appears TWICE in the file** — once as `#console--tokenize` inside the
   console route, once as a standalone `tokenization` route (`#tokenization--tokenize`), with
   identical content. The combiner included `tokenization.html` as a route even though `console.html`
   already contains that section. `NAV_ACTIVE` maps the standalone route back to the Console nav item,
   so it is a deep-link alias rather than a screen. **`app/console/` transcribing it once, below the
   workspace, is correct and there is no second page to build.**

### The honest path — and it does not change the method

⚠️ **Transcription is still right, and this directory does not make it more right.** The bytes are
the same ones `app/console/page.tsx` was transcribed from last unit. What is left is not a sourcing
problem:

| screen | state | what remains |
|---|---|---|
| `/console` | **transcribed verbatim** last unit, 430/430 tokens | wire the operator controls that have no slot — still your decision |
| `/` and `/markets` | **rebuilt from the DOM**, class order verified identical | not verbatim; a transcribe-then-wire pass would close the gap the same way it closed the console's |
| `/markets/[id]` | rebuilt from the DOM | same |
| `/report/[hash]` | ⚠️ **no reference exists, here either** | this file has ten routes and none is the reading page. Composed, and it stays composed |

**So: correct the remaining pages against these bytes using the console's two-pass method, rather
than starting over from this file.** The one thing worth changing on this evidence is the header —
moving it to the layout with a derived active item, per finding 1.

### What has no data behind it — unchanged from the ten-file assessment

`reports` assumes six cards with categories, a subtitle, per-report prices and a token on each: the
store has **11 reports, 4 tokenized**, one constant HBAR price, no category or subtitle column.
`markets` assumes five-figure volumes and "12 reports" per market: **8 markets, 2 forecasts, 1.02 USDC
of volume, one claim citing one report.** The prediction pages assume a probability series: **1 stake
row**, no series. Scores: **0 rows** — the record strip reads empty. `tokenization` assumes upload and
an editable price: neither exists.

### The conflicts, and where they are in this file

```
Outcome select          6   one per prediction route
"Back" buttons         13   per-outcome, across the six
Aave / Morpho / Other   3   multi-outcome — the contract is binary
"Upload your report"    2   console--tokenize and the tokenization route
"5 USDC per unlock"     2   same two
Connect wallet          8   1 header + 6 stake panels + 1 tokenize
My positions            7   markets + the six prediction routes
Demo toggle            12
```

**All identical to the ten files.** Cut or marked as already decided — the side picker and multi-outcome
are cuts, the rest are marked.

### Stated plainly

**This is the same design, the same markup and the same stylesheet in one file instead of ten.** It
removes the risk of composing ten sources and it settles the header question. It does not remove the
interpretation problem, because the interpretation problem was never about which file to read — it
was about transcribing before wiring, which the console unit has now done once and which the other
pages still need.

---

## 2026-09-12 — Phase 5 Unit 4d: `/markets/[id]` transcribed, then wired

Two passes, the method that worked on the console. `next build` passes; `/`, `/markets`,
`/markets/{6,7,8}`, `/holdings`, `/console`, `/report/<hash>` all 200; `/markets/999` 404.

### Pass one — the transcription

The `prediction-stablecoins-2027` route's `<main>` from `single-frontend/alpha-markets.html`, copied
into `app/markets/[id]/page.tsx`. Only mechanical edits: `class` → `className`, `for` → `htmlFor`,
void tags self-closed, `style` → object, `tabindex`/`maxlength` → numbers, SVG hyphenated attributes
→ camelCase. Every string the reference's own — "Which stablecoin grows the most in 2027?", `100`
USDC, `217.39`, `USDC 46% / USDT 36% / Other 18%`, the polyline points, "Demo funds only."

```
reference class tokens : 199
built                  : 199
identical sequence     : ✅ YES
```

⚠️ **Two deviations, both from the COMBINER rather than the design.** `data-route="…"` and `hidden`
were added by the single-file build so its hash router could show one `<main>` at a time. There is no
router here and **a `hidden` `<main>` renders nothing.** Removing them restores exactly the `<main>`
that `front-end-design/prediction-stablecoins-2027.html` carries. Recorded in the file's header.

⚠️ **Two classes had no rule** — `.market-detail` and `.switch-row` (plus its three `[data-slot]`
selectors for the shadcn Switch). **Taken from the reference's own stylesheet, not approximated.**

⚠️ **An extraction bug worth recording:** my `</?main\b` regex ends *before* the `>`, so the
fragment came out missing its final `>` and the converter emitted `/main` as text. The build caught
it. The class-token comparison did **not** — it had already passed at 199/199 with the file
unbuildable, because a missing bracket changes no class attribute. **A structural check and a build
check catch different things and neither substitutes for the other.**

### Pass two — the wiring, inside a skeleton that was already right

Queries restored verbatim from `HEAD` — market row, the single-claim query with its report and
score, the batched chain read, the recorded stakes. **Nothing about the data layer changed.**

| reference slot | now |
|---|---|
| `.market-title` | the real question from `spec_json`, the criterion, and ⚠️ **the rehearsal and void banners** — the things the reference has no concept of |
| `.range-buttons` | **MARKED** — a time range needs a time series |
| `.prediction-chart` / `.chart-container` | ⚠️ **the section stays and says why it is empty**, and carries the real pool split at the same prominence |
| `.chart-legend` · `.market-statline` | real TRUE/FALSE pools, volume, stake count, standing |
| `.outcome-header` / `.outcome-row` | **SIDE / POOL / SHARE**, two rows |
| `.supporting-research` | the one report the claim cites, its full hash, and ⚠️ **the score with two of three ABSENT rather than zero** |
| `.resolution-rules` | the real criteria and the four landmarks |
| `.position-panel` | Unit 14's control, rendering the reference's own inner skeleton |
| `.payout-estimate` · attach-report | **MARKED** |

⚠️ **CUT, and verified absent: `<select>` 0 · radios 0 · `>Back<` 0 · `>Outcome<` 0.** The reference's
ACTION column with a Back button per row, its Outcome combobox and its hidden `<select>` are removed,
not disabled and not marked — `stake(marketId, claimId)` takes no side, and marking them would assert
a roadmap that cannot exist without a different contract. **Two outcome rows, never three.**

Reference placeholders all gone: "Which stablecoin" 0 · "217.39" 0 · "46%" 0 · "USDT" 0 · "Demo funds
only" 0.

### ⚠️ Three things the verification caught in my own wiring

1. **A region edit over-reached and silently ate three sections.** Balancing `<div>` by line, the
   `.prediction-chart` span swallowed `.chart-legend`, `.market-statline`, `.outcome-header` and the
   rows, leaving an orphan `))}`. The build caught the orphan; **the section-order check is what
   proved the three sections were gone.**
2. **I reused `.market-statline` for marker text inside the chart container**, which put that class
   in the document *before* the real statline and made the order read wrong against the reference.
   Exactly the "invent or reuse a class" failure. Removed — the marker text now carries no class.
3. **Four `outcome-row` hits, not two.** Two are real; the other two are the RSC flight payload,
   which serialises the tree a second time. A precise `class="outcome-row…"` grep shows **exactly
   two**: `outcome-row chosen` and `outcome-row `.

### ⚠️ What the closed clock hides

`.amount-field`, `.amount-shortcuts`, `.switch-row` and `.payout-estimate` do **not** appear on
`/markets/6` — because **market 6's staking closed at 2026-09-11 23:59 UTC and it is now 05:15 UTC on
the 12th**, so the panel renders its closed branch. That is correct behaviour, not a missing section,
and there is no open market left to show the other branch against. ⚠️ **The open branch is therefore
built but unproven in the browser** — said rather than implied.

### Final state

```
section order vs the reference   20 of 20, SAME ORDER
CUT items                        select 0 · radio 0 · Back 0 · Outcome 0 · rows 2
paywall $2214.84B unpaid         0
routes                           all 200 · /markets/999 404
```

**LIVE** — the amount field and its four shortcuts (they set state) · *Connect wallet and stake*
(opens the wallet, asks for Arc) · *Record it* · every link. **MARKED** — the range buttons, the
probability series, the payout estimate, attach-supporting-report, more-supporting-research.
⚠️ **DO NOT PRESS** — do not complete a stake. Markets 6 and 7 hold real money including a human's
1.00 USDC.

**Two commits: pass one the transcription plus the two reference rules; pass two the wiring.**

---

## 2026-09-12 — Phase 5 Unit 5: The Graph gets a surface — one route, two slots

`app/api/console/source/route.ts` (new), `app/console/graph.tsx` (new), `app/console/viewer.tsx`
(new), and the Query Evidence block in `atlas.tsx`. `next build` passes; `/`, `/markets`,
`/markets/6`, `/holdings`, `/console` all 200. No `src/` change, no schema change, no chain call, no
write.

### The two choices

**Document: `balance-sheet`.** The menu has three. `markets` is one row per market and is walked to
exhaustion — a deployment with 1,700 markets costs seven queries and returns a table nothing could
render in a side panel. `financial-snapshots` needs a window the operator would have to supply.
`balance-sheet` is **one row per deployment, one query, 21 fields** — legible in the space the
reference allows.

**Deployment: `aave-v3-ethereum`**, default and overridable. The flagship at ~$24.7B, what markets 6
and 7 settle against, and its `liveSchemaVersion` matches what config declares. ⚠️ `protocols.ts`
records its **revenue as poisoned** — *"one day in Jul 2024 booked $1.63e15 and the cumulative never
recovered… balances and flows are clean across 1,300+ days"*. The document returns both, so **the
panel names the three bad columns rather than quietly dropping them.** A console that hid them would
be teaching an operator to trust a figure this project has already established is wrong.

⚠️ **The slug is a parameter, not a constant.** `querySubgraph` already refuses an unknown slug with a
`CONFIG` error naming `config/protocols.ts`, so a typo fails loudly.

### ⚠️ It reads, and the evidence is the subgraph's own

`buildEvidence` at tier **`record`**, never `record+raw` — PHASE-4's rule is *record by default,
record+raw for settlement-backing queries only, tier set by the caller*. A console panel is not
settlement-backing; `record+raw` would retain a response payload for a browser click.

**This gives `buildEvidence` its second caller.** PHASE-4's open item — *"the builder exists and its
only caller is a demo script"* — is closed by using it rather than by writing anything.

⚠️ **The query is UNPINNED, deliberately.** A pinned read returns whatever block was asked for, which
is the opposite of what this panel is for. `block` and `fetchedAt` come off the response's own
`_meta`, never off our clock — which is what makes them evidence.

### ⚠️ How to check it is current

Two presses, six minutes apart:

```
05:36:22.802Z   block 25,959,277
05:42:48.185Z   block 25,959,308
```

**31 blocks in ~6.4 minutes is ~12.4 s/block, which is Ethereum's cadence.** Check the number against
any Ethereum explorer at the moment you press — if it is within a block or two of head, the read was
live. The `requestedBlock` field is `null`, which is how you know nothing was pinned.

### The two slots

**Source data tab.** The reference's tabpanel was empty, `hidden` and `data-state="inactive"` — the
second tab of the viewer. It now holds a `.section-title` with a **Read this deployment now** button,
a `.source-meta` badge row (subgraph, network, indexing-error state, row count), the poisoned-revenue
notice, the 21-field response as a `.financial-table`, and the document/response hashes with the tier.
⚠️ **Before a query it says nothing has been read and what pressing would do. While one runs it says
so. Without the secret it says to paste it in the Atlas panel first.** It shows no zeros and no DEMO
values in any of those states.

**Query Evidence.** Five real fields replacing `DEMO-lending-eth` and `24,800,000`. Before a read
every value is an em dash and the subgraph line reads *not read* — not a zero.

⚠️ **The two slots are not siblings** — one is in the light viewer, one in the dark Atlas panel — so
the state lives in a context whose provider **renders no DOM element at all.** That is what lets it
wrap transcribed markup without touching the class-token sequence.

### ⚠️ The tab had to become pressable, which meant lifting the toolbar

The tabs are Radix buttons with hardcoded `data-state`. To make one pressable, the toolbar and both
tabpanels moved into `viewer.tsx` as a client component. **The toolbar's markup was lifted byte for
byte** — same buttons, same `data-slot`/`aria-controls`, same zoom and page controls; the only edits
are `onClick` and `data-state`/`aria-selected` derived from state. The report document is passed in as
`children`, so its markup never crosses into a client bundle.

⚠️ **Lifting it cost three JSX balance errors** — two surplus `</div>` from the old wrappers, an
unclosed `.edit-toolbar`, and the Radix tabs wrapper whose close got consumed. **`next build` caught
all three; `tsc` caught none, because the root typecheck excludes `app/`.**

### ⚠️ A regression from Unit 4c, found by the structure check and fixed

The class-token comparison against the reference console route showed **`.mini-terminal` absent**. When
Unit 4c rewrote the Atlas panel it dropped `<Terminal>` entirely — so `log.lines` had nowhere to
render and **a fifty-second generation would have shown three status rows and no sign of what it was
doing.** Restored into the reference's own `.mini-terminal` slot.

**The remaining delta against the reference, all from earlier units and all deliberate:** `fit-panel`
and `fit-panel-content` ×2 (Unit 4c removed the exporter's scale-script wrappers) and six `lucide-*`
icon classes dropped where wired markup replaced the reference's. **This unit added
`section-title`, `btn primary sm`, `notice`, `op-note` — the Source data panel's own content, inside
the panel the reference already had.** Nothing was restructured to make room.

### What a press costs

⚠️ **Graph quota, not money: one query per press.** `balance-sheet` is a single `querySubgraph` call —
one POST to the gateway, one billable query, the cheapest of the three documents. `markets` on a large
deployment would be seven or more; that is part of why it was not chosen. **Nothing is spent on
chain, nothing is written, and no model tokens are used.**

### Proof

```
route     no secret 401 · wrong secret 401 · correct 200
live      block 25,959,308 · retrieved 2026-09-12T05:42:48Z · 1 row · 21 fields · no indexing errors
page      .mini-terminal 1 · Source data tab 1 · "not read" before a query 1
gone      DEMO-lending-eth 0 · 24,800,000 0
```

**LIVE** — *Read this deployment now* / *Read again* in the Source data tab, and *Inspect source
data →* in the Query Evidence block; both run the same query and fill both slots. Both are disabled
until `CONSOLE_SECRET` is typed. The Report / Source data tabs now switch.
**MARKED** — unchanged elsewhere.
⚠️ **DO NOT PRESS** — Generate (model tokens) and Tokenize (~7.7 HBAR and a permanent asset). ⚠️ The
source query is safe to press repeatedly; it only costs Graph quota.

---

## 2026-09-12 — Orientation pass on Phase 5: read-only, both checks green, four things the tracking overstates

Read-only. No edits to `app/` or `src/`, no git, no chain call, no database write, no dependency
change. Only this file was appended to.

### The two checks

```
npx next build                                   EXIT 0 · 22 routes · compiled 4.8s · TS 5.3s
npx tsc -p tsconfig.json --noEmit                EXIT 0
npx tsx --env-file=.env scripts/ops/migrate.ts   EXIT 0 · 7 migrations, all idempotent no-ops
                                                 13 tables · PASS
```

⚠️ **`next build` does cover the whole of `app/`, including files no route imports.**
`next.config.ts` points Next at `tsconfig.app.json`, whose `include` is `app/**/*.tsx` — not the
route graph. So the orphaned console modules below are typechecked; they are simply never rendered,
never bundled and never requested. The build is a compile check over all of `app/`, and a render
check over only what a route reaches.

### Provenance of each page, as the code stands

| route | how it was made | evidence |
|---|---|---|
| `/console` | **transcribed** from `console.html`, then wired | header says so; 3 of 204 reference classes absent, and 2 are the exporter's `fit-panel` wrappers removed on purpose |
| `/markets/[id]` | **transcribed** from `prediction-stablecoins-2027`, then wired | header says so; the deltas are the CUT Select/Switch plumbing and `lucide-*` |
| `/` | **rebuilt from the DOM** | every semantic class present in the right order; not verbatim |
| `/markets` | **rebuilt from the DOM** | same; `prediction-card` is a template literal, not a missing class |
| `/report/[hash]` | **composed** — no reference exists for it | header says so |
| `/holdings` | **composed** — the ten files contain no holdings screen | |

### What is wired, and what is inert

**Wired, reading real data:** `/` (one `list()` + one batched `tokensFor`), `/markets` (one SQL +
one batched `eth_call`), `/markets/[id]`, `/report/[hash]` including the paywall and `/api/buy`,
`/holdings` via `/api/holdings`, the console's **Generate** stream (nine NDJSON stages into the
terminal) and the console's **Source data** tab and **Query Evidence** block via
`/api/console/source`.

**Inert, and rendering the reference's placeholder values:**

1. ⚠️ **The console's Report tab is the mockup report.** `ALPHA MARKETS / Lending protocols /
   PREPARED BY ATLAS RESEARCH · DEMO DATA`, a hard-coded four-row financial table, "RUN 042",
   `lending-protocols-q2-2026.pdf`, `90%`, `1 / 4`. A generated report never lands here — `Generate`
   emits a `/report/<hash>` link in the terminal and that is the only way to see it.
2. ⚠️ **The whole tokenize section below the workspace is inert**, verbatim from the reference:
   "Upload your report", "5 USDC per unlock", a `defaultValue="Lending protocols / Q2 2026"` title
   field, a listing preview and a receipt grid. **`/api/console/tokenize` has no caller anywhere in
   `app/`.**
3. ⚠️ **The viewer toolbar's zoom, paging and expand buttons are live `<button>`s with no handler
   and no `Unbuilt` marker.** That contradicts `app/ui/unbuilt.tsx`'s own contract — *"never a
   `<button>`… nothing to click, nothing to focus"* — and contradicts Unit 4b's log, which recorded
   `.viewer-tools` as *"present and marked"*. It stopped being marked when Unit 5 lifted the toolbar
   into `viewer.tsx`.

### ⚠️ Five orphaned files in `app/console/` — 852 lines no route reaches

`panel.tsx` is imported by nothing. It is the sole root of `spend.tsx`, `state.tsx` and
`accounts.tsx`; `document.tsx` hangs off `panel` and `spend`. Dead in full:

```
panel.tsx 303 · spend.tsx 209 · accounts.tsx 197 · state.tsx 167 · document.tsx 76
```

They are the only callers of `/api/console/tokenize`, `/api/console/transfer`,
`/api/console/accounts`, `/api/console/state` and `/api/console/report` — **five of the fourteen API
routes now have no browser caller.** `markdown.tsx` survives independently via
`app/report/[hash]/buy.tsx`. This is the state Unit 4c described as *"currently not rendered"* and it
has not changed since; ⚠️ `Accounts` being gone is still the one with a cost, for the reason that
unit gave.

### Where the tracking and the code disagree

1. ⚠️ **`app/README.md` says the console *"has no authentication"* and calls `/console` and
   `/api/console/*` *"throwaway, deleted before submission"*.** `CONSOLE_SECRET` has since locked six
   of the seven console routes, and PHASE-5 makes the console **product** (`console/ — the agent
   workspace — product, gated`). Both sentences are now false. PHASE-5 Unit 1 flagged *one* sentence;
   there are two.
2. ⚠️ **`CONSOLE_SECRET` is in neither `.env` nor `.env.local`.** By `lock.ts`'s own ordering rule,
   `requiredEnv` runs before the comparison, so **locally every locked console route returns 500, not
   401** — including the Source data panel. Unit 5's `401/401/200` proof was not against this `.env`.
   Nothing is broken; the variable is simply only set on Vercel.
3. **The two page headers still open with "PASS ONE: A VERBATIM TRANSCRIPTION… NOTHING HERE IS WIRED
   AND NOTHING HERE IS REAL."** Both pages were wired in their second pass. The headers describe a
   state that no longer exists and read as a warning about live pages.
4. **PHASE-5 §1 specifies five page-group stylesheets** — `reports.css`, `report/report.css`,
   `markets/markets.css`, `holdings/holdings.css` and `console/console.css`. **Only `console.css`
   exists.** Everything else landed in `globals.css`, now 928 lines. The plan's own rule (*a class
   used by two or more page groups belongs in globals*) was applied in one direction only.
5. `app/console/panel.tsx` still carries an `Unbuilt label="Live subgraph evidence"` — **built in
   Unit 5.** Stale, but inside a dead file.

### Minor

`.env` defines `ARC_MARKET_ADDRESS` and `ARC_RPC_URL` twice each, lines 22–25. **The duplicate
values are identical**, so nothing resolves wrongly today; it is a trap rather than a fault. No empty
values in `.env`.

**Nothing was started. No pruning, no deletion, no renaming — the pruning task follows this one.**


---

## 2026-09-12 — The Phase 5 frontend moved to `trash/`, and the backend proved untouched

Moves only. No deletion, no edit to any moved file, no change under `src/`, `contracts/` or
`scripts/`, no commit. One new file: `trash/README.md`.

### What moved

```
app/page.tsx · app/layout.tsx · app/globals.css          →  trash/app/…
app/report/ · app/markets/ · app/console/                →  trash/app/…
app/holdings/ · app/ui/                                  →  trash/app/…
front-end-design/                                        →  trash/front-end-design/
```

26 tracked files out of `app/` and 14 out of `front-end-design/` — **40 deletions in `git status`,
41 files git would add under `trash/`** (the difference is `trash/README.md`). Paths mirror where
they came from, so recovery is the move in reverse.

**What stayed, deliberately:** all fourteen routes under `app/api/`, `app/markdown.tsx` (the
escaping boundary — PHASE-5's own target tree keeps it *untouched*), `app/README.md`,
`single-frontend/`, and everything under `src/`, `contracts/`, `scripts/`, `tracking/`.

### ⚠️ The parity check that had to pass before `front-end-design/` could move

The ten HTML screens **are** fully carried by `single-frontend/alpha-markets.html`, verified three
ways rather than assumed:

```
CSS      line 3 of all eleven files   md5 c29dab930c03e57769252b744fb1fd1f  — byte-identical
markup   <main> class-token sequence, all ten routes      IDENTICAL · same length · same order
         console 763 · markets 266 · reports 173 · tokenization 277 · the six prediction routes
fonts    two base64 OTF payloads, identical byte lengths in both
```

⚠️ **Four things in `front-end-design/` are NOT in `single-frontend/`, and `trash/` is now their only
copy:** `FONT-LICENSE.txt` (the AGPL-3-with-font-exception text the do-not-ship-the-fonts decision
was made against — no obligation attaches, since `globals.css` used a system stack), `README.txt`
(the exporter's note), `README.md` (our account of what was taken), and the unreferenced 1.4 MB PNG.
**None of them is a screen, an asset the HTML needs, or anything the new pages read** — the brief's
condition was about the ten files, and the ten files are carried whole. Recorded here and in
`trash/README.md` so the licence is not buried rather than set aside.

### ⚠️ The proof that matters — the backend

Every relative import under `app/api/` **and** `src/` resolved against the filesystem after the move:

```
211 / 211 relative imports resolve
zero imports under app/api/ reach a moved path
the only relative import inside app/api/ is `../lock.js` → app/api/console/lock.ts, which stayed
git status --porcelain src contracts scripts app/api   →  EMPTY
npx tsc -p tsconfig.json --noEmit                      →  EXIT 0
```

### ⚠️ The app builds with zero pages — no minimal layout is needed

The first build after the move **failed**, and the reason is worth recording because it is not a
source fault: `.next/dev/types/validator.ts` is generated and still named the seven pages that had
just moved. **`Compiled successfully` then `Failed to type check` on a stale cache.** The `.next`
directory was moved aside (gitignored build output, not deleted) and the build re-run:

```
EXIT 0 · 15 routes · all fourteen api routes + /_not-found
```

**So no `app/layout.tsx` is required for the backend to build.** Next demands a root layout only
once a page segment exists, and there are none. ⚠️ **The new pages must bring their own
`layout.tsx`** — the moment the first `page.tsx` lands without one, the build fails again, and that
failure will look like a page problem rather than a missing root layout.

⚠️ **`next build` cannot be trusted across this kind of move until `.next` is cleared.** A stale
route validator reports missing modules that are neither missing nor imported by anything live.

### What is in `trash/`, and it is committed rather than ignored

`git check-ignore` matches nothing under `trash/` — it is committable, which is the whole point.
`trash/README.md` says what each directory was, when it moved and why, and flags four things before
anyone reuses them: the two **transcribed** pages (`console/page.tsx` at 430/430,
`markets/[id]/page.tsx` at 199/199) are the faithful ones and the rest were reconstructed and
drifted; `console/panel.tsx` was **already orphaned** and dragged 852 lines with it; the paywall's
never-call-`render()` property has to be re-proved if it is rewritten rather than carried over; and
`report/[hash]/buy.tsx` was the only live importer of `app/markdown.tsx`, which now has none.

The `*:Zone.Identifier` WSL markers rode along inside `front-end-design/` and are still gitignored
there. ⚠️ **The three inside `tracking/phases/` were left alone** — untracked, ignored, and inside a
directory the brief says must not be disturbed for any reason. Not worth touching for zero gain.

### Minor, and pre-existing

`next-env.d.ts` shows as modified. It is generated, and it was rewritten by the orientation run's
`next build` (`.next/dev/types/…` → `.next/types/…`), not by this task. Left as it is.

**Repo state: the backend is whole and builds; `app/` holds fourteen routes, `markdown.tsx` and its
README; there are no pages. The new app lands next and brings its own root layout.**


---

## 2026-09-12 — `rebuild/` read and planned. Nothing moved.

Read-only. No move, no edit, no install, no build of this repo, no git. One probe run entirely in
the scratchpad against a symlinked `node_modules`, because the `next/link` question decides the size
of a whole commit and guessing it wrong would have shaped the plan around a false constraint.

### What `rebuild/` is

21 files, 4,421 lines, and **no config of any kind** — no `package.json`, no `next.config.ts`, no
`tsconfig.json`, no `.env`, no `node_modules`, no `postcss.config.mjs`. 8 pages under `app/`, 12
components, 1 hook, 1 stylesheet (1,178 lines), and a 369-line `MANIFEST.md`.

⚠️ **`MANIFEST.md` describes the workspace it was generated in, not this repo.** Its §2 and §3.2 talk
about `components/alpha/*`, `components/ui/*` (61 vendored shadcn files), `app/reports/page.tsx`,
`postcss.config.mjs`, `public/fonts/`, `tailwindcss`, `vite.config.ts` and a `pnpm` workspace —
**none of which exist here.** All of that cleanup is already done, because `trash/` took the old
frontend and this repo never had Tailwind or shadcn. The manifest's build-blocker (§4,
`.openai/hosting.json` / vinext) is a fact about that workspace and is not reachable from here.

**The parts of the manifest that DO apply: §3.1 (the `@/*` alias), §5 (contract compliance), §6 (the
stub list), §7 (where the demo data is) and §10 (known gaps).** They check out against the files.

### ⚠️ Three collisions, and two of them stop the build dead

**1 · `@/` imports do not resolve under nodenext — 35 of them.** Probed rather than assumed, with
`tsconfig.app.json`'s exact compiler options and a `"type": "module"` package.json:

```
import {Thing} from '@/components/Thing'      →  TS2307 Cannot find module
import {Thing} from '@/components/Thing.js'   →  resolves
```

The alias itself is fine; **nodenext requires the `.js` suffix on the specifier.** There is also no
`paths` or `baseUrl` in `tsconfig.app.json` today, so the alias has to be declared before it can work
at all.

**2 · `next/link` cannot be used at all — 8 imports, 20 `<Link>` elements.** This is the trap
`tsconfig.app.json`'s own header documents, now reproduced:

```
import Link from 'next/link'      →  TS2307 Cannot find module
import Link from 'next/link.js'   →  resolves, then:
                                     TS2786 'Link' cannot be used as a JSX component
```

`next` ships no `exports` map and `link.js` is `module.exports = require(...)`, so the default import
binds the module object rather than the component. **Adding the extension does not fix it — there is
no spelling of `next/link` that works here.** ⚠️ `next/navigation.js` is **fine**, because those are
named imports; all three uses (`usePathname`, two `notFound`) pass with the extension added.

**3 · `tsconfig.app.json`'s `include` is `app/**` only.** `components/` and `hooks/` at the repo root
fall outside it. They would still be typechecked transitively once a page imports them, but listing
them is one line and makes the editor and a bare `tsc` agree with the build.

⚠️ **None of this touches the root `tsconfig.json`.** Every change is in `tsconfig.app.json`, which is
the file that exists for exactly this. `moduleResolution: nodenext` there is load-bearing and must
not be relaxed to `bundler` to make `@/` easier — Unit 6 established that Turbopack then cannot
resolve `src/`'s `.js` specifiers, and the wiring commits all import `src/`.

### Dependencies: none

Every import across all 21 files is `next`, `next/link`, `next/navigation`, `react`, or a `@/` path.
**Nothing to install.** The manifest's long list of packages that "become unused" is about the other
workspace; this repo never had them.

### Route parity: all six exist, one id shape does not match

`/` · `/report/[hash]` · `/markets` · `/markets/[id]` · `/console` · `/holdings` — all present, all
named correctly, tokenize is a `#tokenize` section of `/console` rather than a route, which matches
what Unit 4c established. Both dynamic pages use Next 16's `params: Promise<…>`.

⚠️ **`rebuild/` keys markets by slug — `lending-2027`, `stablecoins-2027`, `dex-volume`.** This repo's
markets are numeric, and `/api/markets/[id]/refresh` enforces it: `if (!/^\d+$/.test(id)) return 400`.
The slugs are demo keys in a `Record`, so they vanish with the const — but **any link built from a
slug has to become a number in the same commit that wires the page**, or the staking refresh 400s.

### ⚠️ Two D6 cuts have come back in the layout

`rebuild/app/layout.tsx` renders a **"Demo" toggle** in the header and **"Demo data · Stored on this
device"** in the footer. PHASE-5 D6 cut both by name — *"the 'Demo' toggle · every 'Demo data' / 'No
transaction will be broadcast' string"* — and `ui/chrome.tsx` carried the reason: everything here is
real, so a control offering to make it fake asserts the opposite of the product's claim. Also
`metadata.icons` points at `/favicon.svg` and **there is no `public/` directory in this repo**, so
that 404s. All three are one small commit.

### The paywall, and the one thing the new shape changes

`report/[hash]/page.tsx` holds the full body in its demo const and renders it only when
`access === 'owned'`. That shape is safe — `ReportPaper` is a **server** component and `BuyControl`
(client) receives only `price` and `currency`, so nothing withheld crosses into the flight payload.
⚠️ **But the old page's guarantee was stronger: it never called `render()` at all.** Wiring `load()`
into this page reads the body server-side every time. It still must not be *sent*, and that is the
grep probe — `$2214.84B` in the unpaid HTML → 0 — which has to run on that commit rather than be
assumed from the old page's proof.

⚠️ `BuyControl` takes no `hash` today. It needs one to call `/api/buy`.

### What can land unchanged, and what cannot

**Nothing lands byte-unchanged**, and that is not manufactured work: every one of the 21 files uses
`@/` imports, `next/link`, or both. After that mechanical pass, though, **`holdings`, `markets`,
`report/[hash]` and `console` need no further edit to land and render their demo content.** Only
`layout.tsx` needs a content change (the two cuts and the favicon), and only the pages need wiring.

### The plan, in commits

```
A · make it build
  1  components/ + hooks/ + tsconfig.app.json paths     ~20 files, mechanical      build green
  2  app/globals.css                                    1,178 lines, ONE FILE      build green
  3  app/layout.tsx + app/page.tsx + the D6 cuts        ~260 lines                 / renders
  4  app/report/[hash]/page.tsx                         301 lines
  5  app/markets/page.tsx                               196 lines
  6  app/markets/[id]/page.tsx                          466 lines  ⚠️ large
  7  app/console/page.tsx                               252 lines
  8  app/holdings/page.tsx                              121 lines
B · wire it, one surface per commit
  9–13  the five read paths: list()+tokensFor() · load() · the markets join +
        batched eth_call · the market row + stakes · /api/holdings
  14–18 the five controls: /api/buy · stake + refresh · generate + source ·
        tokenize · the CONSOLE_SECRET field
```

⚠️ **Commit 2 cannot be made small.** 1,178 lines of stylesheet in one file; splitting it invents a
structure the design does not have. It is one file, pure CSS, no Tailwind, and reviewable as a
stylesheet rather than as logic.
⚠️ **Commit 6 is 466 lines** — the largest page, mostly a demo const that the wiring commit deletes.

⚠️ **Commit 3 is the one that must not be split**: Next requires a root layout the moment a page
segment exists, so `layout.tsx` and the first `page.tsx` land together or the build fails in a way
that reads as a page fault. ⚠️ **And `.next` must be cleared after each move** — the last session's
build failed on a stale route validator naming files that no longer existed, with
`Compiled successfully` immediately above it.

### The one open decision

**Where `components/` and `hooks/` go.** At the repo root as the manifest assumes, which needs
`baseUrl` + `paths` in `tsconfig.app.json` and leaves one unknown — whether Turbopack reads `paths`
from `tsconfig.app.json` rather than the root `tsconfig.json`, since `next.config.ts` redirects it
there. Or under `app/` as `app/components/` and `app/hooks/`, which needs **no config change at all**,
is already inside `include`, resolves with plain relative `.js` imports, and has precedent in this
repo — `app/ui/` was exactly that, and PHASE-5 noted a folder with no `page.tsx` and no `route.ts`
produces no route. **Raised rather than taken.**


---

## 2026-09-12 — Phase 5 rebuild, commit 1: `app/components/` and `app/hooks/`, no config change

13 files land from `rebuild/`, their imports rewritten to what this repo's module resolution
actually accepts. **No `tsconfig.json` touched — neither the root one nor `tsconfig.app.json`.**
`next build` exit 0, `tsc` exit 0 against both configs, and no new route.

### Why they went under `app/` rather than the repo root

The manifest assumed `components/` at the root with a `@/*` alias, which needs `baseUrl` and `paths`
in `tsconfig.app.json` and carries one unknown: whether Turbopack reads `paths` from
`tsconfig.app.json` or from the root `tsconfig.json`, since `next.config.ts` redirects it with
`typescript.tsconfigPath`. ⚠️ **The owner's call, and it is the right one: an unknown is a bad thing
to carry on the first commit in exchange for a shorter import.** Under `app/` there is no unknown —
`app/**/*.tsx` already covers them, relative `.js` imports resolve by the same rule as everything
else, and `app/ui/` was this exact shape before.

**Proved rather than assumed** — `tsc --listFiles` lists all 13 in the program, so they are
typechecked and not merely ignored as unimported:

```
app/components/*.tsx  12  ·  app/hooks/useFitPanel.ts  1   = 13
```

⚠️ And the route table is unchanged at 15. **A folder under `app/` with no `page.tsx` and no
`route.ts` produces no route**, which is worth having on the record a second time.

### The two import rewrites, and one of them has no alternative

**35 `@/` specifiers across the whole of `rebuild/` — 12 of them in these 13 files.** Under nodenext
the alias is not the problem; the missing extension is. `@/components/Icons` does not resolve and
`@/components/Icons.js` does. Here they became `./Icons.js` and `../hooks/useFitPanel.js`.

⚠️ **`next/link` was removed from `SiteNav`, because there is no spelling of it that works in this
repo.** Both failures reproduced before the move:

```
import Link from 'next/link'      TS2307  cannot find module
import Link from 'next/link.js'   TS2786  'Link' cannot be used as a JSX component
```

`next` ships no `exports` map and `link.js` is `module.exports = require('./dist/client/link')`, so
the default import binds the module object. **Named imports are unaffected**, which is why
`next/navigation.js` — `usePathname` here, `notFound` on two pages later — is fine with the extension
added. The reason this cannot be dodged by relaxing `moduleResolution` to `bundler` is Unit 6's:
Turbopack then cannot resolve `src/`'s `.js` specifiers, and every wiring commit imports `src/`.
**The cost is a full page load per nav click.** Written into `SiteNav.tsx`'s header so the next
reader does not try to put `next/link` back.

⚠️ **The other 7 `next/link` importers are all pages and are still in `rebuild/`.** They carry 19 more
`<Link>` elements and each one becomes a plain `<a>` in the commit that lands its page — not in a
sweep of its own.

### Standing checks

```
next build                          EXIT 0 · 15 routes, unchanged · no new route from app/components
tsc -p tsconfig.app.json --noEmit   EXIT 0 · 13 new files in the program
tsc -p tsconfig.json --noEmit       EXIT 0 · src/ and scripts/ untouched
@/ specifiers remaining under app/  0
next/link imports under app/        0
```

⚠️ `.next` was cleared before the build, per the stale-route-validator lesson. Still necessary, still
cheap.


---

## 2026-09-12 — Phase 5 rebuild, commit 2: `app/globals.css`, moved verbatim

One file, 1,178 lines, 68,863 bytes. **Zero edits — the md5 is the same on both sides of the move.**
`next build` exit 0. Nothing under `src/`, `contracts/`, `scripts/` or `app/api/` changed.

```
rebuild/app/globals.css   15c9142cb768567ecfdcc90eba545d39   1178 lines  68863 bytes
app/globals.css           15c9142cb768567ecfdcc90eba545d39   1178 lines  68863 bytes
```

### The three things that had to be checked before landing it, all clean

⚠️ **No web fonts, and nothing to argue about.** `@font-face` 0 · `base64` 0 · `url(` 0 · `@import` 0.
The stylesheet downloads nothing at all. The three type roles are system stacks that lead with the
real faces and name the clones as fallback:

```
--font-serif: 'Times New Roman', Times, Georgia, 'Nimbus Roman', serif;
--font-sans:  Helvetica, Arial, 'Nimbus Sans', 'Liberation Sans', sans-serif;
--font-mono:  ui-monospace, 'SFMono-Regular', Menlo, Consolas, 'Liberation Mono', monospace;
```

That is the licence question closed by construction rather than by a decision: the AGPL-3 exception
on those faces covers *"a Postscript or PDF file"* and a web page is neither, so **serving them would
be AGPL-3 distribution of this application.** Nimbus Roman and Nimbus Sans are metric clones of Times
and Helvetica, so the stack above *is* the design on any machine that has either — at zero bytes and
zero obligation.

⚠️ **Light only, and `color-scheme: light` is on `:root` at line 27.** `prefers-color-scheme` appears
**zero** times. The nine at-rules are five responsive breakpoints, two `@keyframes`, and one
`prefers-reduced-motion` — an accessibility query, not a scheme query:

```
@media (min-width: 761px) · (max-width: 760px) ×2 · (min-width: 1600px)
@media (max-width: 1250px) · (max-width: 1000px) · (prefers-reduced-motion: reduce)
@keyframes orbit-spin · @keyframes pulse
```

⚠️ `.dark-panel` and `.btn.dark-outline` are **component classes for the charcoal panel, not a dark
variant.** Worth saying because a grep for "dark" finds them and they look like the thing D1 deleted.

### ⚠️ `next build` does NOT prove this file, so it was parsed separately

Nothing imports `globals.css` yet — `app/layout.tsx` is its first and only consumer and it lands in
commit 3. **An unimported stylesheet is never read by Turbopack**, so a green build says nothing
about whether the CSS is valid. Parsed with the `postcss` already present in `node_modules`
(transitively, via Next — nothing installed):

```
PARSE OK — valid CSS
  744 rules · 2,018 declarations · 9 at-rules · 500 distinct selectors
```

### ⚠️ Why "remove the rule that looks unused" would have gutted the site

The instruction not to prune was not hypothetical. Of the **190 distinct class names** in the file:

```
106  already referenced from app/
 68  referenced ONLY by pages still in rebuild/   ← would read as orphan today
 16  referenced from neither, yet
```

The 68 include `site-header`, `site-footer`, `page-container`, `page-heading`, `skip-link`,
`dark-panel`, `console-page`, `workspace-footer`. **A pass that deleted everything with no consumer
in `app/` would have deleted the entire site chrome the morning before commit 3 landed the layout
that uses it.**

The 16 with no consumer anywhere, named rather than quietly kept:

```
sr-only · dark-outline · expanded · paper-disclosure · selected-passage · document-building
running · run-progress · progress-bar · spin · empty-state · balance-line
position-disclaimer · transaction-receipt · fill-true · fill-false
```

Most are plainly the wiring commits' — `transaction-receipt` is the x402 receipt,
`running`/`spin`/`run-progress`/`progress-bar`/`document-building` are the generate stream's states,
`balance-line` and `position-disclaimer` are the stake panel's, `empty-state` is every empty query.
⚠️ **Four look genuinely spare** — `sr-only`, `dark-outline`, and `fill-true`/`fill-false` (the chart
draws strokes via `.line-true`/`.line-false` and no fills). **None was removed.** A CSS rule costs
bytes; a deleted one that turns out to have a consumer costs a broken screen and a bisect.

### State of the app

⚠️ **Still nothing renders, and that is on plan.** `app/` holds fourteen API routes,
`app/components/` + `app/hooks/` from commit 1, `markdown.tsx`, `README.md` and now one stylesheet
that nothing imports. The route table is **15 and unchanged** — no page, no layout. The first thing
a browser could load arrives in commit 3, which lands `layout.tsx` and `page.tsx` together because
Next requires a root layout the moment a page segment exists.

`.next` was cleared before the build, as it now always is after a move.


---

## 2026-09-12 — Phase 5 rebuild, commit 3: the shell, and the first thing a browser can load

`app/layout.tsx` and `app/page.tsx`, landed together because Next requires a root layout the moment a
page segment exists. `next build` exit 0, `/` **200**, and `src/`, `contracts/`, `scripts/` and
`app/api/` unchanged.

### ⚠️ The route table moved for the first time since the migration

```
before   15 routes · all of them /api/* plus /_not-found
after    16 routes · ┌ ○ /   ← prerendered static
```

### What it actually looks like

A 70px header on `#f3f9fd`: the reference's own "A" mark at 25×29 beside **ALPHA MARKETS** in
25px Times, linking to `/console`; three nav items centred — **Console · Reports · Markets** — with
Reports carrying `class="active" aria-current="page"`; and a single dark **Connect wallet** button
right-aligned. Then `INDEPENDENT INTELLIGENCE` in mono caps over a 46px serif **Report marketplace**,
an *Publish a report ↗* outline button on the same line, the filter bar, and `6 reports · Hedera
tokens · Access via x402`. Below that a **three-across grid of two-tone cards**: a white
`.document-preview-button` panel carrying a padlocked `.mini-document` thumbnail — five blurred copy
bars and either a bar chart, a line chart or a mini table — over a `#211c1c` `.report-card-info`
block with the title, the price, *By Atlas Research*, **Preview report** / **Unlock ↗**, the market
link, and a `<details>` evidence drawer. Footer: **ALPHA MARKETS / Research with conviction.** left,
**Hedera testnet · Arc testnet · health** right.

### Against `single-frontend/alpha-markets.html`'s reports route

Class-token comparison of the served `<main>` against the reference's:

```
reference  173 tokens, 35 distinct
served     125 tokens, 30 distinct

absent from ours (6):  lucide · lucide-arrow-up-right · lucide-search
                       lucide-file-text · lucide-lock · lucide-arrow-right
ours, not the reference (1):  inert
```

⚠️ **Every structural and semantic class in the reference is present.** All six absences are
`lucide-*` icon classes — `Icons.tsx` draws the same paths without the library's class names, and
**nothing in `globals.css` styles a `.lucide-*` selector**, so they are dead weight rather than
design. The one addition is `.inert`, this project's marked-affordance treatment, which the
reference has no concept of.

**The real differences are content, not layout:** six demo reports at six different USDC prices
against a store holding 11 reports at one constant HBAR price, and `DEMO-lending-q2` where a real
ISIN goes. That is commit 9's problem and deliberately not this one's.

### The cuts, grepped on the served HTML

```
Demo data                0        demo-toggle     0
Stored on this device    0        >Demo<          0
favicon                  0        "Demo "         0
```

⚠️ **The Demo toggle is CUT and the wallet button is MARKED, and the difference is the whole rule.**
Mark what a reviewer would think we forgot; cut what the system forbids. A wallet connection is a
coherent capability this build has not made, so it is shown, `.inert`, labelled. A "Demo" switch is
not an unbuilt feature — everything here is a real receipt against a live network, and a control
offering to make it fake asserts the opposite of the product's claim.

⚠️ **The footer span was REPLACED, not deleted.** `.site-footer` is
`display:flex; justify-content:space-between` and expects two children; removing the second would
collapse it to one flush-left column. It now carries the line `trash/app/ui/chrome.tsx` already
settled on — **Hedera testnet · Arc testnet · health** — and `/api/health` is a live route, verified
200.

⚠️ **`metadata.icons` dropped rather than satisfied.** It pointed at `/favicon.svg` and this repo has
no `public/`. A missing favicon costs a default tab icon; an unbacked `icons` entry costs a 404 on
every page load, and a whole `public/` directory for one file is more surface than it is worth.

⚠️ **Two `.demo-toggle` rules in `globals.css` are now orphan and were left alone** — the constraint
was these two files only, and commit 2 established that a rule with no consumer today is not evidence
of a rule with no consumer.

### The client-component trade, named rather than made quietly

⚠️ **The layout stays a server component; only `<SiteNav/>` crosses.** The design marks the current
nav item, a layout cannot know the pathname without `usePathname()`, and that is a client hook. The
cheap-looking move is to mark the whole header `'use client'` — which would ship the brand mark, the
wallet button and every icon inside them to every visitor in order to highlight one link. Isolating
it ships **three anchors and a pathname read**, and leaves the rest of the header and the entire
footer on the server. Confirmed in the flight payload: `SiteNav` is the only client reference in the
layout tree.

### Every destination, honestly

```
/                          200   the marketplace
/api/health                200   the footer link
/console                   404   commit 7
/markets                   404   commit 5
/markets/lending-2027      404   commit 6
/holdings                  404   commit 8
/report/9f2c…3056          404   commit 4
```

⚠️ **Two of the three nav items 404 right now**, and that is the sequence working rather than
failing — pages arrive one commit at a time and each 404 closes on its own commit. ⚠️ Also worth
recording for commit 6: the demo market links are **slugs** (`/markets/lending-2027`), and this
repo's markets are numeric — `/api/markets/[id]/refresh` enforces `/^\d+$/`. The slugs die with the
demo const.

### `next/link` → `<a href>`, five elements

`page.tsx`'s five `<Link>` became plain anchors for commit 1's reason: `next` ships no `exports` map,
so a default import binds the module object and TypeScript refuses it as a JSX component. **Zero
`next/link` imports and zero `@/` specifiers remain anywhere under `app/`.** The cost is a full page
load per nav click, which a document site can afford. 14 `<Link>` elements remain, all on pages still
in `rebuild/`.


---

## 2026-09-12 — Phase 5 rebuild, commit 4: `/report/[hash]`, the reading page

301 lines. `next build` exit 0, route table **16 → 17**, three demo states all 200, and `src/`,
`contracts/`, `scripts/`, `app/api/` unchanged. Three `<Link>` became `<a href>`; nothing else
changed.

### ⚠️ This page has NO reference route, so the class-token check has no counterpart

The brief asks for the sequence against the matching route in `single-frontend/alpha-markets.html`.
**There is no matching route.** The file carries exactly ten and none of them is the reading page:

```
console · markets · reports · tokenization · prediction-* ×6
```

That is the same finding the old `report/[hash]/page.tsx` header recorded — *"the one screen the
entire x402 argument rests on"* has no drawing. What the design package **does** carry is the CSS for
it: `.locked-preview`, `.purchase-bar`, `.unlocked-bar`, `.report-excerpt`, `.report-body`,
`.report-paper` and `.financial-table` are all defined and drawn in none of the ten screens.

**So the meaningful check is the other direction — does the composed page stay inside the design
system, or did it invent classes?** Run across all three states:

```
distinct classes used        32
defined in globals.css       32
undefined (would be unstyled) 0
```

⚠️ **Every class resolves.** The page is composed from the design's own parts rather than drawn
beside them.

### The three states, and they are all reachable

```
9f2c4a7e1b8d3056   PAYWALL   public preview + BuyControl, live "Unlock for 5 USDC"
3d81e6f09c24ab75   OWNED     unlocked bar + .report-body + the full .report-paper
b570c93a4e12d8f6   PREVIEW   public preview + INERT unlock, "Not yet listed for access"
```

Paywall state reads: `LENDING / ATLAS RESEARCH` eyebrow, a 46px serif title, `PUBLIC PREVIEW` over
the subtitle and summary, a `.locked-preview` holding the padlocked thumbnail and *Full report · 4
pages*, then the purchase bar — `5 USDC · x402 · Paid access` against a dark **Unlock** button. Below
it `THE GRAPH / QUERY EVIDENCE` as a seven-row `<dl>`, then *Backs this claim · TRUE* linking to the
market. The owned state replaces the excerpt and the bar with *Unlocked for this account* and the
full sheet.

### ⚠️ A precursor to commit 10's probe, run early because it is free

The paywalled record's demo const **carries** `LENDING_TABLE`. Does its HTML leak it?

```
                 paywalled(9f2c)   owned(3d81)
12.4B                  0                2
18.2M                  0                2
318,000                0                2
financial-table        0                2
report-paper           0                2
```

**The gate holds in the demo shape**, because `ReportPaper` is a server component and `BuyControl`
receives only `price` and `currency` — nothing withheld crosses a client boundary into the flight
payload. ⚠️ **This is not commit 10's proof and must not be mistaken for it.** Here the body is a
literal in the same file; there it comes from `load()`, and the old page's guarantee was *structural*
— it never called `render()` at all. Commit 10 owns a probe over **every fact value and the
assessment text**, not one figure, and not obtained through `/api/console/report`.

### CUT items: absent, in source and in served HTML

```
<select 0 · type="radio" 0 · >Back< 0 · >Outcome< 0 · side-picker 0
```

### ⚠️ Three of the marketplace's six cards link to a 404, by demo-data design

```
9f2c… 200   3d81… 200   b570… 200
e4a1… 404   6c08… 404   a293… 404      unknown hash 404
```

`MANIFEST.md` §7 records this: six hashes exist on `/` and in holdings, **three have records on the
report page**. The three that do cover all three states, which is what the state machine needed. ⚠️
**This is a demo-const inconsistency, not a routing fault, and it closes in commit 9/10** — real data
means every listed report has a row and `load()` answers for all of them. Worth knowing now so the
404s are not mistaken for a broken link when clicking through after commit 8.


---

## 2026-09-12 — Phase 5 rebuild, commit 5: `/markets`, the market index

196 lines. `next build` exit 0, route table **17 → 18**, `/markets` 200, backend unchanged. One
`<Link>` became `<a href>`; nothing else changed.

### ⚠️ The class-token comparison, and why the raw numbers mislead

```
reference markets route : 266 tokens, 121 distinct
served /markets         : 100 tokens,  32 distinct
```

A 121-to-32 gap reads like most of the screen is missing. **It is not, and the split is the whole
point.** Of the reference's 121 classes, only **23 are defined in `globals.css`** — the actual design
system — and the other **98 are compiled Tailwind v4 and shadcn plumbing** hanging off the Radix Tabs
and Select widgets. `front-end-design/README.md` records that exactly: *"~135 KB of compiled Tailwind
v4 and shadcn plumbing. Left. The shipped app has no framework and no CSS dependency."*

```
reference design classes (defined in globals.css)   23
  missing from our page                              0    ← every one present
reference plumbing (undefined anywhere)             98    group/tabs · flex · gap-2
                                                          data-[orientation=…] · dark:* · …
absent icon-library leftovers                        6    lucide · lucide-search · lucide-clock
                                                          lucide-chevron-down · lucide-arrow-right
                                                          lucide-check
ours, not in the reference                           9    tab-list · tab · line · line-true
                                                          line-false · dot-true · dot-false
                                                          choice-value · inert
  all nine defined in globals.css                  YES
```

⚠️ **Zero structural absences.** The nine additions are the de-Tailwinded replacements for the Radix
tab list and select (`tab-list`, `tab`, `choice-value`), the design's own two-side colour classes
(`dot-*`, `line-*` — §9.3 of the manifest turned the reference's inline `style` loop into fixed
classes because the pair is fixed), and `.inert`.

### What it looks like

`CONVICTION MEETS THE MARKET` over a 46px serif **Prediction markets**, with `5 OPEN MARKETS ·
Settlement on Arc` right-aligned. A filter bar carrying a search field, four category chips, a status
select and a **My positions** tab marked `.inert`. Then a three-across `.prediction-grid` of cards,
each: category left and an Open/Resolved badge right, a 28px serif claim on a `min-height` that keeps
the chart tops aligned across a row, the criterion, a compact two-line probability chart, the
`TRUE`/`FALSE` rows with round dots and percentages, a `volume USDC vol. · N reports` footer, and
*View market & stake →* — or *View market results →* on the resolved one.

### CUT items, verified absent

```
<select 0 · type="radio" 0 · >Back< 0 · >Outcome< 0 · "Other" 0
TRUE rows 6 · FALSE rows 6  across 6 cards — exactly two sides each, never three
badges: 5 open · 1 resolved
```

⚠️ **The three multi-outcome markets the design drew are already binary here**, restated as claims
about the leading name — *"Aave leads lending by end-2027"*, *"USDC grows the most of any stablecoin
in 2027"*, *"Uniswap leads DEX volume in Q4 2026"* — with the non-leading outcomes summed into FALSE.
`MANIFEST.md` §8 records the mapping and no probability was invented. **That is D4 applied in the
source rather than by us cutting markup**, and it is the right shape: the contract is binary.

### MARKED, not cut

`My positions` (`class="tab inert"`) and the header's `Connect wallet`. Search, the category chips
and the status select are the design's own controls and are live-but-local in `MarketFilters` —
they hold state and filter nothing yet, which is commit 11's job.

### The slug links, flagged and not yet a problem

All six cards link to slugs — `/markets/lending-2027`, `/markets/dex-volume`, and so on. ⚠️ **They
404 until commit 6 lands the detail page, and after commit 6 they resolve against the demo
`Record`.** They break for real only if they outlive the demo const: this repo's markets are numeric
and `/api/markets/[id]/refresh` enforces `/^\d+$/`. **Commit 12 replaces the const and the slugs go
with it.** Nothing to do now.


---

## 2026-09-12 — Phase 5 rebuild, commit 6: `/markets/[id]`, one market

465 lines, the largest single change in this sequence, landed whole because ~300 of it is
`MARKETS_BY_ID` and a page cannot be split from the const it reads. `next build` exit 0, route table
**18 → 19**, all six markets 200, unknown id 404, backend unchanged. Four `<Link>` became `<a href>`.

### ⚠️ The class-token diff found the three cuts on its own, which is the best result available

```
reference prediction-stablecoins-2027 : 199 tokens, 116 distinct
served /markets/stablecoins-2027      :  74 tokens,  59 distinct

reference DESIGN classes (in globals.css)  45
  missing from ours                         3   outline · choice · position-disclaimer
  missing — lucide-* icon leftovers         7
  missing — Tailwind/shadcn plumbing       64
ours, not in the reference               17   all defined in globals.css
```

**All three "structural" absences are the three things that had to be cut.** Opening each in the
reference settles it:

| class | what it is in the reference | why it is absent |
|---|---|---|
| `position-disclaimer` | `<p>Demo funds only. No transaction will be broadcast.</p>` | ⚠️ **CUT by D6 by name.** The opposite is true — a stake here is a real Arc transaction |
| `choice` | the Radix `role="combobox"` select trigger | ⚠️ **CUT by D3** — this is the Outcome select |
| `outline` | `<button class="btn outline">Back` | ⚠️ **CUT by D3** — the per-row Back button |

⚠️ **This is a much stronger result than "no structural absences".** The diff did not need to be told
what to look for: the only design classes the page does not carry are exactly the side picker, the
per-row Back button and the demo-funds disclaimer. Nothing else in the design is missing.

The 17 additions are the chart's axis furniture (`chart-grid`, `chart-axis-y`, `chart-plot`,
`chart-axis-x` — the chart is inline SVG with `preserveAspectRatio="none"`, so labels are HTML
outside it), the fixed two-side colour classes (`dot-*`, `line-*`, `pct-*`), `outcome-state`,
`stake-side`, `attached-report`, `switch`/`switch-thumb`/`on`, and `inert`. All defined.

### CUT, verified zero in source and served

```
<select 0 · type="radio" 0 · >Back< 0 · >Outcome< 0 · "Other" 0
"Demo funds only" 0 · "No transaction will be broadcast" 0 · position-disclaimer 0
outcome rows: exactly 2
```

⚠️ **The side is text, not a choice.** `.stake-side` renders the side derived from the claim the
backing report cites; there is nothing to pick, which is the contract's own shape —
`stake(marketId, claimId)` takes no side and `_add(m, marketId, c.side, msg.value)` reads it off the
claim.

### What it looks like

A back link to `/markets`, then a two-column `.market-detail-grid`. Left: the claim as an `h1` with
its criterion and a closes-at clock; a chart panel carrying `IMPLIED PROBABILITY`, the 1D/1W/1M/All
range buttons with three marked `.inert`, a full two-line probability chart with axis furniture, a
`.market-statline`, and the two `.outcome-row`s — TRUE and FALSE, with a `chosen` modifier on the
side the backing report takes and an `.outcome-state` third column stating each side's standing
instead of offering a Back button. Then supporting research rows with thumbnails, and a
`.resolution-rules` `<details>`. Right: the dark `.position-panel` — the side as text, the amount
field and four preset shortcuts, the attach-report switch, the payout estimate, the stake button,
and `ARC / ONCHAIN EVIDENCE` with a marked *View contract* and a live *My holdings*.

### ⚠️ Two things in the position panel are NOT in this file, and both need a decision at commit 15

Both live in `app/components/StakeControl.tsx`, which this commit is constrained out of. **Neither is
a side picker and neither blocks the page**, but both currently assert a capability the product does
not have, and both are *live* rather than inert:

1. ⚠️ **"Attach supporting report" is a working toggle, defaulted on** (`useState(true)`, a real
   `role="switch"`). **PHASE-5 D6 lists it as CUT** — *"a stake carries no report, only a claim cites
   one, and `claims.report_hash` is a foreign key the analyst writes."* ⚠️ **The plan and the old
   code already disagreed here**: `trash/app/markets/[id]/stake.tsx` MARKED it
   (`Unbuilt label="Attaching a report to a stake"`) rather than cutting it. So there are three
   positions on this control and they need reconciling — cut it, mark it, or amend D6.
2. **The payout estimate renders a computed figure** — `value / (sidePct/100)`, showing `217.39
   USDC`. D6 lists it as **MARKED**, and the old code marked it. It is arithmetic over a demo
   percentage, so it is not wrong yet, but it will read as a promise once real pools drive it.

**Not reached for, per the brief.** Recorded for commit 15.

### The slugs

All six resolve now. They are demo `Record` keys and die with the const in commit 12; this repo's
markets are numeric and `/api/markets/[id]/refresh` enforces `/^\d+$/`.


---

## 2026-09-12 — Phase 5 rebuild, commit 7: `/console`, placement only

252 lines. `next build` exit 0, route table **19 → 20**, `/console` 200, backend unchanged. Three
`<Link>` became `<a href>`; nothing else changed. **No wiring — the Atlas panel, the source tab and
the tokenize section are commits 16 and 17.**

### The class-token comparison

```
reference console route :  763 tokens, 204 distinct
served /console         :  111 tokens,  80 distinct

reference DESIGN classes (in globals.css)  73
  MISSING — structural                      3   white · full · dark-outline
  missing — lucide-* icon leftovers        19
  missing — Tailwind/shadcn plumbing      111
ours, not the reference                    9   tabs · tab-list · tab · active · tab-panel
                                               line · choice-value · button-row · inert
  all defined in globals.css             YES
```

⚠️ **The 763 → 111 token drop is the de-Tailwinding, not missing markup.** Every Radix element in the
reference carries a 40-token utility string; the same element here carries one or two classes. The
distinct count is the honest measure: 204 → 80, and 111 of the 124 absent are undefined utilities.

⚠️ **The three "structural" absences are two buttons wearing different modifiers, not two missing
buttons.** Both are present with the same job:

| reference | ours | where |
|---|---|---|
| `<button class="btn white full">Connect wallet to tokenize` | `<button class="btn primary">Tokenize and list` | the tokenize CTA |
| `<button class="btn dark-outline full">Save draft` | `<button class="btn outline">Save draft` | beside it |

**The visible difference is width** — `.full` is the design's full-width modifier, so the reference's
two CTAs span the form and ours do not. ⚠️ **Both live in `app/components/TokenizeForm.tsx`, which
this commit is constrained out of.** Recorded for commit 17, not reached for. The label change is
the better half of the trade: the reference gates tokenizing behind a wallet this build does not
have, and `/api/console/tokenize` needs no wallet.

### Every major section renders

```
workspace · viewer · viewer-toolbar · document-stage · atlas-console · agent-visual · orbit
agent-status · query-evidence · atlas-composer · mini-terminal · workspace-footer
tokenize-section · publish-steps · tokenize-form · listing-preview · token-flow
report-paper · financial-table
```

⚠️ **`.source-panel` is absent from the initial HTML and that is correct** — `ConsoleViewer` renders
the two tabpanels as a ternary on `tab`, defaulting to `report`, so the source panel appears on
click rather than being shipped hidden. ⚠️ Worth noting separately: **`.source-panel` has no rule in
`globals.css` at all** — it is a naming hook and `.tab-panel` does the styling. The old `console.css`
did give it rules. Nothing renders wrong; recorded because it will look like an omission later.

### What it looks like

A two-panel `.workspace`. **Left, light:** a toolbar with *Report* / *Source data* tabs,
`lending-protocols-q2-2026.pdf`, and zoom and page controls; then the document stage carrying a
`.report-paper` — `Lending / Q2 2026` eyebrow, **Lending protocols** in serif, and three sections
(*1. Executive summary*, *2. Revenue quality*, *3. Outlook*) with a `.financial-table`. **Right,
charcoal:** `.atlas-console` with the counter-rotating orbit rings over `ATLAS RESEARCH AGENT`,
*Agent view* / *Terminal* tabs, the agent status rows, `THE GRAPH / QUERY EVIDENCE` with an *Inspect
source data →* link, the `.mini-terminal`, and the composer with its placeholder *"Describe a report
or request an edit…"*. Below the workspace, a footer of links, then the full tokenize section —
`FROM RESEARCH TO CONVICTION` over **Tokenize your report.**, three publish steps, the source
tabs (*Use generated report* / *Upload your report*), the listing form, and a dark
`.listing-preview` aside with the marketplace card, the token flow and a notice.

### CUT and MARKED

```
<select 0 · type="radio" 0 · >Back< 0 · >Outcome< 0 · "Demo funds only" 0

marked .inert:  Connect wallet (header) · one btn outline · Report category
                · Related prediction market
```

⚠️ **The console's demo report content stays, as the brief directs** — `lending-protocols-q2-2026.pdf`,
the Atlas paper and its figures are placeholder and commits 16–17 replace them.

### ⚠️ There is no `CONSOLE_SECRET` field on this page, and six routes need one

Grep: **0**. Every console route that spends is doorlocked — `generate`, `tokenize`, `transfer`,
`source`, `accounts`, `report` all call `locked()` and refuse without the `x-console-secret` header.
**The rebuild's console has no slot for it**, and the old console put it inside the Atlas panel,
above the composer it gates, precisely so it would not become a section bolted above the workspace.
⚠️ **This is a wiring blocker for commits 16 and 17, not for this one.** Recorded now so it is a
known requirement rather than a discovery.


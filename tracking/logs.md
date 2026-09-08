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

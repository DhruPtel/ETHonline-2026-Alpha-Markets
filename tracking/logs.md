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

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

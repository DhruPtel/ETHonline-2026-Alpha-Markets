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

# PHASE 7 — the feedback loop, made visible

**Written 2026-09-12.** A plan only. No code in this commit.

The loop: an analyst researches, publishes, tokenizes, stakes its own USDC on a falsifiable claim,
the market settles against The Graph, the claim is **graded**, and the grade goes into the prompt
that plans the next report. Everything in that sentence exists and runs **except the grading, which
has never been triggered, and the surfaces that would let anyone see it.**

---

## 0 · What is actually true today, because four things in the brief are not

I read the machinery and the database before planning. Four corrections, each of which changes the
plan:

### ⚠️ 0.1 The resolved rehearsals **cannot** be scored — they carry no claims

The brief says markets 8, 9 and 10 "could be scored today". They cannot, and not for the reason the
brief anticipates. `scoreMarket()` iterates `claimsFor(marketId)`; markets 8, 9 and 10 have **zero
claims between them**. Running `scoreSettled()` right now writes **nothing**.

```
m 8  REHEARSAL  claims 0  resolved Y  resolve_tx 0x5f0a28033366…
m 9  REHEARSAL  claims 0  voided   Y  void_tx    0x63086eea9e65…
m10  REHEARSAL  claims 0  resolved Y  resolve_tx 0xe4b274b55724…
```

So **the "don't inflate the record with rehearsals" problem is moot today** — there is nothing there
to inflate it with. The rule still has to be written (§4.3), because a future rehearsal could carry a
claim, but it is not on the critical path and it must not be treated as if it were.

### ⚠️ 0.2 The first real scores are **hours away, not days** — and two of them are imminent

```
market  6  claim 6  resolvable from 2026-09-13T00:00:00Z   deadline 2026-09-15
market  7  claim 7  resolvable from 2026-09-13T00:00:00Z   deadline 2026-09-15
market 11  claim 8  resolvable from 2026-09-15T00:00:00Z   deadline 2026-09-17
market 12  claim 9  resolvable from 2026-09-15T00:00:00Z   deadline 2026-09-17
```

Measured at 2026-09-12T23:43Z: **markets 6 and 7 become resolvable in about a quarter of an hour.**
They carry real claims on report `24041ca2…`, and market 6's pool holds a human's 1.00 USDC.

⚠️ **This is the single most time-sensitive fact in this document.** Their resolve deadline is
2026-09-15; a market not resolved by its deadline **voids**, and a void scores `forecast_correct =
null` — neither right nor wrong. If nothing resolves markets 6 and 7 before then, the first two real
grades in the project's history become two nulls. Task 1 exists mostly to stop that.

### ⚠️ 0.3 `/holdings` is **not wired** — the page is demo content, the route is real

The brief says it "already exists and is wired". `app/holdings/page.tsx` renders a `HOLDINGS` const
with invented values (`0x7a3f…c218`, hash `3d81e6f09c24ab75`) and the route table shows it as `○`
static, which a store-reading page cannot be. **`app/api/holdings/route.ts` *is* real** — it reads
`ANALYSTS[0]`, the Hedera mirror node and `report_tokens`, and calls `balanceOf` on chain.

So absorbing holdings is **building the page over an existing route**, not moving a finished thing.
That is a cost difference and it belongs in the estimate.

### ⚠️ 0.4 Market 12 already has a claim — the commit control was pressed

```
market 12  chain claim 9  report 65fb085d26…  side TRUE  1.0 USDC  committed 2026-09-12T23:34:01Z
```

The last unproven step of the loop is now proven from the browser. Every task below can assume the
commit path works end to end.

### A fifth thing, found while checking the join and worth fixing on its own

⚠️ **Two market rows share `chain_market_id = '8'` on the same contract** —
`m/rehearsal-5e207fcf98b52eb3` and `m/rehearsal-reconcile-8`. One carries `resolve_tx`, the other
does not. Anything that joins display data on `chain_market_id` picks whichever the planner returns
first. **Every query in this phase joins on `markets.id`, never on `chain_market_id`.** Cleaning up
the duplicate row is not in this phase; avoiding it is.

---

## 1 · The question the brief asks directly: can a score reach its Arc transaction?

**Yes. No column is missing and no migration is needed.**

`scores` is keyed `(market_id, claim_id)`, both foreign keys. `markets` already carries `resolve_tx`
(005) and `void_tx` (006), and both are **populated** on the settled markets. So:

```sql
SELECT s.*, m.chain_market_id, m.resolve_tx, m.void_tx, m.resolved_at, m.voided_at,
       c.chain_claim_id, c.report_hash, r.title, r.directive
  FROM scores s
  JOIN markets m ON m.id = s.market_id          -- ⚠️ id, never chain_market_id (§0.5)
  JOIN claims  c ON c.id = s.claim_id
  JOIN reports r ON r.hash = c.report_hash
```

That one join yields everything a score row needs to display:

| shown | from |
|---|---|
| the market | `m.chain_market_id` → `/markets/<id>` |
| the claim | `c.chain_claim_id` |
| the report | `c.report_hash`, `r.title ?? r.directive` → `/report/<hash>` |
| the grade | `s.forecast_correct` (⚠️ `null` = void), `s.reconciliation_quality` |
| the money | `s.staked`, `s.returned` |
| **the settlement transaction** | `m.resolve_tx` or `m.void_tx` → `https://testnet.arcscan.app/tx/<tx>` |

⚠️ **One score shows one transaction, and which one depends on how it settled.** A resolved market
links `resolve_tx`; a voided market links `void_tx` and says *voided*, not *wrong*. A score whose
market has neither is a bug, not a blank — surface it as "settled with no transaction recorded"
rather than hiding the row.

⚠️ **arcscan's status code proves nothing** — it is a client-routed SPA that serves the same shell
for a nonsense path, the same trap HashScan set. Any task that ships one of these links verifies the
transaction on the Arc RPC (`eth_getTransactionReceipt`) and says so, exactly as the ATS receipt was
verified against the Hedera mirror node.

---

## 2 · What exists, and what has to be built

**Exists and runs — do not re-plan it:**

- `src/arc/score.ts` — `scoreMarket(id)`, `scoreSettled()`, the `Score` shape, `ReturnState`'s three
  honest cases, idempotent `record()` whose `WHERE` on the conflict target means a re-score with
  identical inputs does not move `scored_at`.
- `src/arc/resolve.ts` — resolves a market on chain, writes `resolve_tx` / `void_tx`.
- `src/agent/context.ts` — `build(analyst)` returns `{block, digest}`; `recordContextDigest()` writes
  `reports.context_digest`. **Both generators already pass it to `compose`.**
- `app/api/holdings/route.ts` — real, on-chain.
- `app/api/cron/resolve/route.ts` — exists, `CRON_SECRET`-gated.
- The `markets`, `claims`, `scores`, `reports` schema. **Nothing in this phase needs a migration.**

**Has to be built — all of it surfaces and one trigger:**

- a caller for `scoreSettled()` (nothing calls it),
- the analyst page,
- the context block's rendering,
- the marker on report cards,
- the score block on the market page.

⚠️ **Read that split before estimating.** Four of the five tasks are views over machinery that is
already proven; only Task 1 touches behaviour, and it is the smallest.

---

## 3 · The nav

Three items today: **Console · Reports · Markets**. It becomes four:

> **Console · Reports · Markets · Analyst**

⚠️ **`/holdings` is absorbed, not kept beside.** It becomes a section of `/analyst` and the route is
removed from the nav. A separate holdings item and an analyst item would be two answers to one
question — *what does this analyst own and how has it done* — and the reference drew three items
precisely because the shell is not where accretion belongs.

⚠️ **This is the only change to the shell in this phase, and it is a real one.** `SiteNav`'s `NAV`
array gains an entry and `owns` for it must cover `/analyst`. The reference has no fourth item to
copy, so the fourth uses the same markup and the same `.active` treatment as the three — no new
class, no new look. `/holdings` keeps working as a URL (nothing 404s) and redirects nowhere; it is
simply not linked. **Decided here so no later task has to.**

---

## 4 · The tasks

Each is one commit and one visible change. Sizes are lines of real change, excluding comments.

### Task 1 — scoring runs · ~60 lines · **must be first**

Nothing calls `scoreSettled()`. Until something does, every other task renders an empty table.

**What triggers it: the resolve cron, immediately after resolving.** Decided, with the alternatives
named and rejected:

- **On read** — rejected. Scoring writes rows; a page render that writes is a page that behaves
  differently depending on who looked at it, and `scored_at` would then record when somebody
  browsed rather than when the claim was graded.
- **Manual only** — rejected as the *only* trigger, for the reason in §0.2: markets 6 and 7 void on
  2026-09-15 if nobody acts, and a loop whose closing step depends on someone remembering is not a
  loop.
- **The resolve cron** — accepted. It already runs, it already holds `CRON_SECRET`, and it is the
  only place that knows a market just settled. `scoreSettled()` is reconciliation from scratch with
  no cursor, so a missed run self-heals on the next one.

Contents:
1. `app/api/cron/resolve/route.ts` calls `scoreSettled()` after its resolve pass and reports the
   count in its response. ⚠️ Scoring failing must not fail the resolve — the resolve is the
   irreversible on-chain act and the score is derived from it, so the score is attempted in its own
   `try` and a failure is reported, not thrown.
2. `scripts/ops/score.ts` — a manual runner for the same function, with `--dry-run` printing what
   would be written. This is what gets pointed at markets 6 and 7 tonight.

**Visible change:** `scores` stops being empty; `/markets` stops saying *"no forecast has settled
yet"* and starts showing the analyst's record.

⚠️ **Do this before 2026-09-15 or the first two grades are voids.** It is also the only task with a
deadline attached to it.

### Task 2 — `/analyst` · ~260 lines · the page

One page, three sections, absorbing `/holdings`.

1. **Record** — the score rows from §1's join, newest first. Per row: the grade, the market, the
   claim, the report, the money, and **the settlement transaction linked to arcscan**. Right / wrong
   / void counted separately at the top, ⚠️ **never as one percentage** (§4.2).
2. **Holdings** — what `/api/holdings` already returns: tokens per account, read from the Hedera
   mirror node and `balanceOf`. ⚠️ The page reads the store and the chain directly as a server
   component; it does **not** fetch its own route.
3. **Reports generated** — `list()` with published state and token state, which `/` and `/console`
   already read.

⚠️ **Designed for its empty case first**, because until Task 1 runs it is empty and after Task 1 it
holds two rows. "No claim has been graded yet" is not the same as a zero score and must not look
like one.

**Decided:** the page shows one analyst — `ANALYSTS[0]` — because there is one. It is not a
per-address view and there is no picker.

### Task 3 — the context block, verbatim · ~90 lines

**Decided: the literal block, not a rendering of the rows, and it goes on `/analyst`.**

The point of showing it is that it is *the same bytes the model was given*. A prettier rendering of
the underlying rows would be a second path to one number, which is how two paths stop agreeing — and
it would break the only checkable thing here: `context.build()` returns `{block, digest}` where the
digest is taken over exactly those bytes, and `reports.context_digest` stores it.

So the section shows:
- the block, in a monospace pre, exactly as `build()` returns it;
- its digest;
- ⚠️ **which stored reports carry that digest** — a report planned while the record was in this state
  has a matching `context_digest`, and one planned earlier does not. That is the loop made checkable
  rather than asserted: *this text went into that report's plan, and here is the proof.*

⚠️ **The block changes as scores accumulate, and the page says so.** Today's block will not match an
older report's digest and that is correct, not a bug. Copy must say it before a reader concludes the
digest is broken.

⚠️ `build()` returns `null` when there is no record. Empty state: *"The analyst has no graded claims
yet, so nothing is added to its planning prompt. `context_digest` is null on every report."* — which
is exactly true today and is checkable against the column.

**Rejected:** putting this in the console beside the generation stream. The block is built server-side
at generate time and the NDJSON stream does not carry it; adding it would be a route change, and the
console already has an evidence block that a second one would compete with.

### Task 4 — the marker on report cards · ~120 lines

A report that has been graded gets a marker on `/`, on `/report/[hash]`, and in the market page's
Supporting research.

⚠️ **A single number cannot carry this, and here is exactly why.** A report can back several claims
across several markets, and a claim can be void.

**Decided: three counts, never an average.** A report's marker is `right / wrong / void`, and the
rendering follows from the counts:

| state | marker |
|---|---|
| no graded claim | **no marker at all** — not a grey zero. Most reports are in this state. |
| 1 right, 0 wrong | green · *"1 of 1 claims correct"* |
| 0 right, 1 wrong | red · *"0 of 1 claims correct"* |
| **1 right, 1 wrong** | ⚠️ **neutral, and it says both**: *"2 claims graded · 1 right, 1 wrong"*. Not green, not red, and **not 50%** — a report that was right about one market and wrong about another has said two things and one of them was wrong. Averaging destroys exactly the information a buyer wants. |
| void only | ⚠️ **grey · *"1 claim voided — no outcome"***. A void is an absence of an answer, never a wrong one, and it must not be counted in either column. This rule is already written into `standing()`, the market page and `score.ts`; the marker inherits it rather than reinventing it. |
| mixed with voids | the voids are stated separately: *"2 graded · 1 right, 1 wrong · 1 voided"*. |

⚠️ **Rehearsal-backed claims are excluded from the marker** by the same arithmetic §4.3 uses.

**Cost note:** `/` already batches `tokensFor(hashes)` and one claims join over every hash. The
marker is **one more batched query over the same hash list**, not a lookup per card. A fan-out here
is the thing that page's own header warns about.

### Task 5 — the score on the market page · ~70 lines · **extra**

`/markets/[id]` already renders the claim's forecast/reconciliation/returned lines from a join it
does. This task gives them the settlement transaction link and the same green/red/grey treatment as
the cards, so a market and a report tell the same story in the same words.

Extra because the market page is already honest about the outcome; this makes it prettier and adds
one link.

---

## 4.2 The rule the record must not break

⚠️ **Right, wrong and void are three outcomes and the record reports three counts.** Not a
percentage, anywhere, at any level of aggregation. A percentage needs a denominator and there is no
honest one: including voids punishes the analyst for a day the subgraph could not be read, and
excluding them silently changes the denominator between two reports that look comparable.

`/markets` already states it correctly today — *"N settled — R right, W wrong"* with *"rehearsals
excluded"* beside it. Every new surface uses that same shape.

## 4.3 The rehearsal rule

⚠️ **A rehearsal is excluded from the record, and the test is arithmetic, not a name.**
`observation_end <= created_at` — the market was created over a day that had already finished, so the
answer was knowable at commit time. `/markets` and `/markets/[id]` already compute exactly this, and
a stored market whose **id literally contains the word "rehearsal" is a forecast by that arithmetic**,
which is why the name is never the test.

**What I would do with markets 8, 9 and 10: score them and exclude them from the record.**

- **Score them** — because `scoreSettled()` is reconciliation from scratch and a function that
  silently skips rows is worse than one that writes them. Today this is a no-op anyway: zero claims,
  zero rows (§0.1).
- **Exclude them from the record** — the analyst page, the marker and the context block all filter
  `observation_end > created_at`. ⚠️ **The context block especially**: `context.ts` feeds the
  planner, and a planner told it was right about three questions whose answers were already known
  would be learning from nothing.
- ⚠️ **The exclusion is stated on the page, not applied silently.** *"Rehearsals excluded"* beside
  the counts, the way `/markets` already does it, so a reader who counts the markets themselves and
  gets a different number can see why.

**Owned by Task 1** for the scoring half and **Task 2** for the display half.

---

## 5 · The minimum that makes the loop visible, and the extra

⚠️ **Minimum: Tasks 1, 2 and 3.** That is: the grades exist, they are on a page with the
transactions that prove them, and the exact text the agent reads is shown beside them. That is the
whole claim — *this analyst was graded on chain, and the grade goes into its next prompt* — and it
is demonstrable in one page.

**Task 4 is the one to add if there is time**, because a green marker on a marketplace card is the
loop's most legible single artefact — it is the moment the record stops being a page you navigate to
and becomes a property of the product a buyer sees while browsing. **Task 5 is polish.**

⚠️ **Task 1 is not optional and is not merely first — it has a deadline.** Markets 6 and 7 resolve
from 2026-09-13T00:00:00Z and **void on 2026-09-15**. Two real claims, one of them backed by a human
being's 1.00 USDC, are the first two grades this project will ever produce. If they void because
nothing ran, Tasks 2, 3 and 4 render a page whose entire content is *"no outcome"*.

**Order: 1 → 2 → 3 → 4 → 5.** Task 1 tonight.

---

## 6 · Decisions taken here, so no later task has to

| decision | taken |
|---|---|
| Nav becomes four items; `/holdings` is absorbed into `/analyst` and unlinked | §3 |
| Scoring is triggered by the resolve cron, with a manual script beside it | Task 1 |
| The context section shows the **literal block** and its digest, on `/analyst` | Task 3 |
| The marker is **three counts**, never a percentage; no marker when ungraded | Task 4, §4.2 |
| A void is grey and counted in neither column | §4.2 |
| Rehearsals are scored and excluded from the record, by arithmetic, stated on the page | §4.3 |
| Every score links its `resolve_tx` / `void_tx` to arcscan, verified on the RPC first | §1 |
| Every join uses `markets.id`, never `chain_market_id` | §0.5 |
| One analyst, no picker | Task 2 |

**Nothing in this phase needs a migration, a contract change, or a new dependency.**

**One thing this plan cannot decide without building:** whether the context block is legible enough
to show verbatim, or whether it needs a heading and spacing around it. It is generated prose and I
have not seen it rendered with any scores in it — `scores` is empty, so `build()` returns `null`
today. **Task 3 decides it**, and it can only decide it after Task 1 has put rows in the table.

# Phase 6 — Wiring

*The shell is built and nothing on it is real. This phase replaces six demo consts with six queries
and eleven stubs with eleven calls, one surface at a time, so that after every task there is one more
thing on the screen that came from somewhere.*

**This document is the wiring spec.** Phase 5 landed `app/` as a complete, clickable front end whose
every value is invented. Phase 6 does not move a page, rename a class or restyle anything. It changes
where the numbers come from.

**Three things feed it:**

| | |
|---|---|
| `trash/app/` | ⚠️ **the working reference.** Every surface in this phase was wired once, against these same routes, and it worked. The queries, the call shapes and the failure modes are **recoverable rather than rediscoverable**, and this plan quotes them |
| `app/api/` | fourteen routes, none of which changes in this phase |
| `rebuild/MANIFEST.md` §6 | the stub list, by component and handler name |

⚠️ **`src/`, `contracts/`, `scripts/` and `app/api/` are not touched by any task below.** If a task
appears to need a backend change, that is a finding to raise, not a change to make.

---

## Status

**The console. ⚠️ This order is fixed and the reasons are in §2.**

| Task | | Status |
|---|---|---|
| **1** | `CONSOLE_SECRET` — the field, inside the Atlas panel | ⬜ ⚠️ **FIRST. Six routes refuse without it** |
| **2** | Source data ← `/api/console/source` | ⬜ |
| **3** | Ask Atlas ← `/api/console/generate`, streamed, **and the terminal that shows it** | ⬜ ⚠️ **a deliberate merge — see §2** |
| **4** | The generated report lands in the document stage | ⬜ |

**The product, in the order a stranger meets it.**

| Task | | Status |
|---|---|---|
| **5** | `/` ← `list()` + `tokensFor()` + the claims join | ⬜ · *closes the three dead hashes* |
| **6** | `/report/[hash]` preview ← `load()` | ⬜ ⚠️ **owns the paywall probe** |
| **7** | The buy control → `/api/buy` | ⬜ |
| **8** | `/markets` ← one join + one batched `eth_call` | ⬜ ⚠️ **owns slug → numeric** |
| **9** | `/markets/[id]` ← the market row, its claim, its pools | ⬜ |
| **10** | The stake control → `window.ethereum` + `/api/markets/[id]/refresh` | ⬜ ⚠️ **owns two open questions** |
| **11** | `/holdings` ← `/api/holdings` | ⬜ |
| **12** | Tokenize → `/api/console/tokenize` | ⬜ ⚠️ **owns the `.full` question** |

**Close.**

| Task | | Status |
|---|---|---|
| **13** | The marked-versus-cut sweep, and the play gap | ⬜ |

---

## 1 · Where this actually stands

**Every page renders a `const` declared at the top of its own file.** `MANIFEST.md` §7 names them:
`MARKETPLACE`, `REPORTS_BY_HASH`, `MARKETS`, `MARKETS_BY_ID`, `WORKSPACE`, `HOLDINGS`. **Every
control is a named no-op.** Nothing on the site has ever touched Neon, The Graph, Hedera or Arc.

⚠️ **That is the good news.** The consts are typed and shaped like the real records, they sit in one
place per file, and the markup reads from them and from nothing else. **A wiring task is therefore a
deletion and a query, not a rewrite** — which is why the tasks below are mostly small and several are
net-negative in lines.

### ⚠️ What the data actually is, against what the design assumes

| | the design assumes | what exists |
|---|---|---|
| reports | 6 cards, 6 prices, a category and a subtitle each | **11 reports · 4 tokenized · one constant HBAR price · no category column · no subtitle column** |
| markets | five-figure volumes, "12 reports" per market, a probability series | **8 markets · 2 forecasts · ~1.02 USDC total volume · 1 human stake · 0 scores · no series stored anywhere** |
| holdings | an account with a tidy inventory | real `balanceOf` reads against two analyst accounts |
| the console | a finished four-page report | whatever the last run wrote |

⚠️ **No task below invents a number to fill a slot.** §4 says, surface by surface, what each one will
actually look like and what gets marked instead.

---

## 2 · ⚠️ The order, and the one merge this plan takes

**The console is first and its internal sequence is fixed**, because it is where a report comes from:
there is nothing to sell, tokenize or stake on until something generates one. Within it the order is
the order a run happens — read the source, ask for a report, watch it run, read what came back.

### ⚠️ Task 3 merges two of the four steps, deliberately, and here is the reason

The brief numbers the console's steps 1–4 with *"the terminal shows the run"* as its own step after
generation. **Landing those as two commits creates exactly the failure the brief warns about**, for
one commit: a fifty-second run showing three status rows and no sign of what it is doing. That is not
hypothetical — `logs.md` records it happening when Unit 4c dropped `<Terminal>`, and Unit 5 restoring
it into the reference's own `.mini-terminal` slot.

⚠️ **The stream and the terminal are one surface.** `useLog` is the stream reader's sink — there is
nowhere else for a line to go — so a commit that reads the stream without rendering the log is a
commit whose own output is invisible. **Task 3 lands both.** If you want them split, the split that
works is *status rows* (task 3) then *stream + terminal* (task 4), never the reverse.

### The order after the console, and why

**5 → 6 → 7** is the buyer's path and it is the phase's whole argument: see a report listed, read
what is public, pay for the rest. **8 → 9 → 10** is the same shape for the market side. **11** is
last of the reads because holdings is the only page whose route already works — `/api/holdings` needs
no new query, just a call. **12** is last of the writes because tokenizing is the only control that
mints something permanent.

⚠️ **6 before 7 matters.** The preview must be proven to withhold the body *before* anything is wired
that can deliver it. Wiring them together means the probe can pass because the buy path happens to be
broken.

---

## 3 · ⚠️ Decisions this plan takes

Each of these was raised during Phase 5 and each has an owning task. **None is left to be discovered
while building.**

### D1 · `CONSOLE_SECRET` goes inside the Atlas panel, above the composer — task 1

There is no field anywhere and **six routes refuse without the `x-console-secret` header**:
`generate`, `tokenize`, `transfer`, `source`, `accounts`, `report`. The previous console put it in a
section of its own above the workspace, and `logs.md` records why that was wrong — *"putting it in a
section of its own above the workspace is precisely how the reference layout got inserted into Phase
3's console instead of replacing it."* Unit 4c moved it into the dark panel as a `.field-label`
above the composer it gates.

**Decided: the same place.** It gates Generate, Generate is in that panel, the field belongs in that
panel.

⚠️ **`NEXT_PUBLIC_CONSOLE_SECRET` is not an option and the reason is mechanical:** it is inlined into
the client bundle at build time and served to every visitor, which is not a secret but a string in a
`<script>`. The value exists only in the environment and in the operator's head, and the two meet in
a request header. ⚠️ **The corollary, from `lock.ts`'s own header: this works only because a human is
at the keyboard.**

⚠️ **401 and 500 mean different things and the surface must not flatten them.** `requiredEnv` runs
before the comparison, so **500 = the secret is absent or blank in the environment** and **401 = it is
set and you typed it wrong.** `trash/app/console/graph.tsx` distinguishes them and so must this.

### D2 · The generation surface offers no retry, because there is no resume — task 3

A run is 34–47 seconds against a **real 60-second Hobby ceiling**, silently clamped from the declared
300. ⚠️ **The route already streams, and that is what makes the ceiling survivable**: under a plain
POST a kill at 60s is a blank screen; with the stream every stage that completed is already on the
page and stays there.

**What the ceiling forbids is a resume.** `save()` is the last step, so a truncated run means the
model tokens are spent and **no report exists**.

**Decided: no retry control, and the truncation line says what actually happened.**
`trash/app/console/generate.tsx` has the wording and it is correct — *"the stream ended without a
`done` event — the function was killed or the connection dropped. Nothing was saved: save() is the
last step, so the model tokens are spent and no report exists."* ⚠️ **A "Retry" button beside that
would imply the work resumes. It does not; it starts over and spends again.** Pressing Generate again
is available and obvious; a control named Retry is a lie about the mechanism.

### D3 · The reading page's guarantee, restated precisely — task 6

⚠️ **The old guarantee has been described loosely in this repo, including by me, and the precise
version matters.** `trash/app/report/[hash]/page.tsx` **does** call `load()`, and the full report —
facts, checks, assessment — **is** in server memory. What it never does is:

1. call `narrate.render()`, so no markdown is ever produced on that path;
2. pass any body field as a prop to a client component;
3. render any body field.

The body reaches the browser **only** inside the JSON returned to `buy.tsx`'s own `fetch`, held in
that component's state. *"The body is never a prop: it exists solely in the JSON returned to the
component's own fetch."*

**Decided: the same three rules, and task 6 proves them rather than inheriting the proof.**

⚠️ **The probe is not one figure.** It is **every fact value and the assessment text**, absent from
the served HTML of an unpaid `/report/<hash>`, checked against a report whose facts are known — and
⚠️ **not obtained through `/api/console/report`**, which is a different route with a different gate
and proves nothing about this page.

⚠️ **The new markup makes one of the three rules easier to break.** `ReportPaper` is a server
component taking a structured `Paper`, and the temptation is to build a `Paper` from `load()` and
render it conditionally. **A conditional render is not a gate** — the old page's note that *"a
CSS-hidden table is not a paywall"* applies equally to a server-side ternary over data that was
computed. The rule stands: **do not build the paid `Paper` at all on the unpaid path.**

### D4 · ⚠️ The report body arrives in two different shapes, and this is the fork to know about

`ReportPaper` takes `PaperBlock[]` — `heading` · `subheading` · `paragraph` · `table`. But:

- **`load()` returns a structured `Report`** — `facts` (*"the fact table… the only place a digit
  exists"*), `checks`, `exclusions`, `verdict`, `assessment`. **No markdown.**
- **`/api/buy` returns markdown**, because that is what `/api/reports/[hash]` serves a paying agent.

**Decided, and it is two different answers for two different paths:**

| path | shape | how it renders |
|---|---|---|
| **the console's document stage** (task 4) | the structured `Report` | ⚠️ **Build `PaperBlock[]` directly from `facts` + `assessment`.** No markdown, no parser. The fact table *is* a `{kind:'table'}` block |
| **the bought body** (task 7) | markdown | ⚠️ **`app/markdown.tsx`, the product's own renderer**, inside `.report-paper`. **Not `ReportPaper`** |

⚠️ **Do not write a markdown → `PaperBlock[]` parser.** It is new surface, it is a second renderer
for one object, and `markdown.tsx`'s own header says why a second one is wrong: it is *"the escaping
boundary"* for indexer-supplied market names, and anything rendering report markdown its own way is
*"testing its own parser instead of the build's."*

### D5 · The attach-report toggle is CUT — task 10

Three positions exist and they need reconciling:

| | |
|---|---|
| **PHASE-5 D6** | **CUT** — *"a stake carries no report, only a claim cites one, and `claims.report_hash` is a foreign key the analyst writes"* |
| `trash/app/markets/[id]/stake.tsx` | **MARKED** — `<Unbuilt label="Attaching a report to a stake">` |
| `app/components/StakeControl.tsx` | **working** — `useState(true)`, a real `role="switch"`, defaulted on |

**Decided: cut it, and PHASE-5 D6 stands.** The old code's marking was the weaker call and the
reasoning against it is in D6 itself — a mark asserts a roadmap, and this one cannot exist without a
different contract. `stake(marketId, claimId)` has no parameter for a report; the claim already cites
one; a staker attaching a second would be attaching it to nothing.

⚠️ **What replaces it is not empty space.** The `.attached-report` line beneath the toggle shows the
report the claim already cites — **that is true, it is the thing the toggle pretended to set, and it
stays.** The switch goes; the line it controlled becomes unconditional.

### D6 · The payout estimate is MARKED, not computed — task 10

`StakeControl` computes `value / (sidePct / 100)` and renders `217.39 USDC`. PHASE-5 D6 lists the
potential-payout estimate as **marked**, and `trash/` marked it.

⚠️ **Arithmetic over a demo percentage is harmless; the same arithmetic over a real pool is a
promise.** A payout depends on the final pool at resolution, not the pool now — anyone staking after
you changes it — and on `AlphaMarket.sol`'s own settlement path. **A number that moves under the
reader's feet, presented as "Potential total payout", is the most misleading thing available on
these pages.**

**Decided: marked, with the real pool shown beside it.** The reader gets `poolTrue` / `poolFalse` as
they stand — which is a fact — and no projection.

### D7 · The tokenize CTAs get `.full` back — task 12

The reference is `btn white full` / `btn dark-outline full`; `TokenizeForm` renders `btn primary` /
`btn outline`. **The visible loss is the full-width modifier**, so two CTAs that should span the form
do not.

**Decided: restore `full` on both.** ⚠️ **The label change is kept** — the reference's *"Connect
wallet to tokenize"* gates on a wallet this build does not have and `/api/console/tokenize` needs
none, so *"Tokenize and list"* is the honest label. Modifier restored, label kept.

### D8 · Market ids become numeric — task 8, and task 9 follows

Every market surface keys by slug (`/markets/lending-2027`) and **this repo's markets are numeric**.
`/api/markets/[id]/refresh` enforces `/^\d+$/` and 400s otherwise. The slugs are keys of a demo
`Record` and die with it.

**Decided: `chain_market_id` is the route parameter**, which is what `trash/app/markets/page.tsx`
links with and what the refresh route expects. ⚠️ **Task 8 changes every link and task 9 changes the
lookup**, and between them `/markets/<slug>` 404s — which is correct, because no such market exists.

### D9 · The three dead report hashes close in task 5 — confirmed

`/report/e4a1…`, `/report/6c08…` and `/report/a293…` are linked from `/` and from `/holdings` and
have no record on the reading page. **This is a demo-const gap: `MARKETPLACE` lists six hashes and
`REPORTS_BY_HASH` holds three.**

⚠️ **Task 5 closes it by construction, not by a fix.** `/` will list exactly the hashes `list()`
returns, and `load()` answers for every row `list()` returned, because they read the same table.
**Confirmed: after task 5 there is no hash on `/` that `/report/[hash]` cannot serve.** Task 11 does
the same for holdings, which reads real token rows.

---

## 4 · ⚠️ What each surface will actually look like

**Said before building, so that a thin page is a known outcome rather than a disappointment.**

### `/` — 11 reports, and this page reads best of all of them

Eleven cards in a three-across grid is nearly four full rows. **What changes from the demo:**

| slot | demo | real |
|---|---|---|
| title | 6 invented titles | the **directive** — the only human sentence a report carries |
| subtitle | *"Market structure, growth and key risks"* | ⚠️ **NOT INVENTED.** No column exists. The **analyst id and block**, which are true and are what distinguish two reports on the same protocol |
| category | Lending / Stablecoins / DEXs | ⚠️ **MARKED.** No column, and deriving one from the directive's words is a guess rendered as a fact |
| price | 5 / 3 / 4 / 2 USDC | **one constant**, `REPORT_PRICE_HBAR`. ⚠️ `0.001 HBAR` reads as a placeholder and there is no dressing it up — render the real number with `testnet` in the eyebrow style and **do not invent a dollar figure** |
| token chip | `DEMO-*` on all six | ⚠️ **a real two-state thing**: *Tokenized · ISIN* against *Not tokenized*, **4 and 7** — both styled, the second not a faded version of the first |
| related market | one per card | real, via `claims.report_hash`. **Most reports have none** and simply show no link |
| `owned` | a flag | ⚠️ **always false.** There is no identity system; `payments/auth.ts` is the declared cut point |

⚠️ **The blurred thumbnail stays as decoration and that is honest** — `.mini-body.blurred` is five
fixed-width bars and a stylised chart. It is not a claim about the report's contents and never was.

### `/report/[hash]` — 11 reports, and one of the three states becomes unreachable

The record carries `access: 'preview' | 'paywall' | 'owned'`. With real data:

- **`paywall`** is every report on load. All 11 are sellable; `/api/reports/[hash]` gates all of them.
- **`owned`** is reachable only *after* a purchase in the same session, because there is no identity
  to remember one. ⚠️ It is a session state, not a stored one, and the page must not imply otherwise.
- **`preview`** — *"Not yet listed for access"* — ⚠️ **has no real counterpart and task 6 must decide
  it.** The options are to map it onto *untokenized* (defensible: a report with no security behind
  it is a different object) or to delete the branch. **Task 6 owns this and must not leave it as
  dead code that can never render.**

The query-evidence block is real: subgraph, deployment, block, records and retrieved all come off the
report's own stored provenance.

### `/markets` — 8 markets, and the chart is the honest problem

⚠️ **Nothing stores a probability series.** `ProbabilityChart` is central to both market pages and
there is no data behind it — not a thin version, none.

**Decided, following `trash/`'s own answer: the chart section stays, says why it is empty, and the
real pool split fills it at the same prominence.** Deleting it leaves a hole where the design's
strongest element was; faking it invents the one number on the page nobody could check.

| slot | real |
|---|---|
| volume | `poolTrue + poolFalse` from the chain — **~1.02 USDC total across all markets** |
| "12 reports" | ⚠️ **one claim cites one report.** *1 report* or *no report* |
| category | ⚠️ **MARKED** — no column |
| status | real: open, closed, observing, resolved, void |
| forecast vs rehearsal | ⚠️ real and **derived from arithmetic, not a naming convention** — `observation_end <= created_at` means the day was already over when the market was created, so it cannot have been a prediction. `trash/` argues this is the better test than the `m/rehearsal-` id prefix, and it is |
| the record strip | **0 scores. It reads empty**, and that is the truth about a phase whose settlement has not run |

⚠️ **2 of 8 are forecasts.** The page must not present eight equal markets — `PHASE-4` states it:
*"a market over an already-observed day is indistinguishable on chain from a forecast. Nothing
enforces the distinction but us."*

### `/markets/[id]` — one market, one stake

The pools are a real batched `eth_call`; **pools come from the chain, never from `stakes`** — *"the
table records what we were told about, the contract records what it holds, and only one of those is
the money."* Supporting research is **the one report the claim cites**, not twelve. The stake count
is **1** across the whole system.

⚠️ **Market 6 carries 1.00 USDC from a human wallet and markets 6 and 7 resolve from a cron.** No
task below writes to any of them.

### `/console` — whatever the last run produced

The document stage shows the last generated report or an empty state. ⚠️ **Before any run it must say
so rather than showing a fixture** — the `PREPARED BY ATLAS RESEARCH · DEMO DATA` sheet is exactly the
thing task 4 removes.

### `/holdings` — real balances, possibly a short table

`/api/holdings` reads `balanceOf` against the analyst accounts. **4 tokens exist.** ⚠️ The route also
reports tokens held by an address that is neither analyst account, and that section renders only when
there are any.

---

## 5 · The tasks

### Task 1 · `CONSOLE_SECRET`, inside the Atlas panel

**`app/components/AtlasPanel.tsx`.** A `.field-label` with a password input, above the composer,
holding the value in state and handing it to every console fetch. ⚠️ **No other file.** Nothing calls
a locked route yet — this is the field and the state, so that tasks 2, 3 and 12 have somewhere to
read it from.

⚠️ **The two slots that need it are not siblings** — the Source data tab is in the light viewer and
the composer is in the dark panel. `trash/app/console/graph.tsx` solved this with a context whose
provider **renders no DOM element at all**, which is what let it wrap transcribed markup without
changing the class-token sequence. **Use the same shape.**

**Size: ~40 lines.** One new context, one field.

> **Proof.** Load `/console`. A `CONSOLE_SECRET` field sits in the dark panel above *Ask Atlas*.
> Typing in it changes nothing yet and no request is made. The class-token sequence against the
> reference console route is unchanged except for the field itself.

### Task 2 · Source data ← `/api/console/source`

**`app/components/ConsoleViewer.tsx`.** The Source data tab currently renders a `SourceData` const
shaped `{block, records, refreshed, meta, headers, rows, query}`. It becomes the route's response.

The route runs `balance-sheet` against `aave-v3-ethereum` through `querySubgraph` and returns a
`buildEvidence` record at tier `record`. ⚠️ **The query is unpinned deliberately** — `block` and
`fetchedAt` come off the subgraph's own `_meta`, never off our clock, *"which is what makes them
evidence."*

⚠️ **`protocols.ts` records this deployment's revenue as poisoned** — one day in Jul 2024 booked
$1.63e15 and the cumulative never recovered, while balances and flows are clean across 1,300+ days.
**The panel names the three bad columns rather than dropping them.** A console that hid them would
teach an operator to trust a figure this project has already established is wrong.

**Size: ~70 lines.** A fetch, three states, and the poisoned-revenue notice.

> **Proof.** Type the secret, open **Source data**, press **Read this deployment now**. A block
> number appears. Press it again six minutes later and the block has advanced by roughly 30 — ~12.4
> s/block, which is Ethereum's cadence. Check it against any Ethereum explorer at the moment you
> press. `requestedBlock` is `null`, which is how you know nothing was pinned. **Without the secret
> the panel says to type it first. With a wrong one: 401. With none in the environment: 500.**
> ⚠️ Costs one Graph query per press. Nothing is spent on chain and no model tokens are used.

### Task 3 · ⚠️ Ask Atlas runs, and every line of it is visible

**`app/components/AtlasPanel.tsx`.** The composer POSTs to `/api/console/generate` with the secret
header and reads the NDJSON stream; the log model and the `.mini-terminal` render it live.

⚠️ **The reader loop is `trash/app/console/generate.tsx`'s and it is not obvious.** Chunks split on
`\n`, the trailing partial is carried in a buffer, and **a missing `done` event is its own outcome** —
not an error, not a success. The nine stages are `limits · compose · execute · narrate · validate ·
save · error · done`, each with `status` and a `t` stamp.

⚠️ **Structured lines, never a JSON blob in a `<pre>`.** Every line carries an elapsed stamp, a stage,
a message and optionally one link. *"That is what makes a fifty-second generation legible while it is
running: the stamp column shows where the time is going, and the stage column lines up so a run reads
as a sequence rather than as text."*

⚠️ **No retry control — D2.** On truncation, say the tokens are spent and no report exists.

**Size: ~150 lines, and the largest in this phase.** Stream reader, event→line mapping for nine
stages, the terminal. ⚠️ **Flagged before it arrives.** It cannot usefully be smaller: the reader and
its sink are one mechanism, and D2's merge is the point.

> **Proof.** ⚠️ **This spends model tokens. Press once.** Type a directive — *"Balance overview for
> Aave v3 on Ethereum"* — and press **Generate report**. The terminal fills for 34–47 seconds: the
> compose headline, the execute timings with a block number, the digit-guard result, then `SAVED`
> with a fact count and a link. **The status rows change as it goes.** Follow the link and the report
> is at `/report/<hash>`. If the function is killed at 60s the terminal keeps every stage that
> completed and says nothing was saved.

### Task 4 · The generated report lands in the document stage

**`app/components/ConsoleViewer.tsx` + `app/console/page.tsx`.** The hardcoded `Paper` goes. The
stage renders the last saved report, fetched through `/api/console/report`.

⚠️ **Build `PaperBlock[]` from the structured report — D4.** The fact table is a `{kind:'table'}`
block. No markdown, no parser.

⚠️ **`PREPARED BY ATLAS RESEARCH · DEMO DATA` is deleted, not edited.** The byline becomes the real
analyst id, block and hash. ⚠️ **Before any run the stage says there is no report yet** — it must not
show a fixture, and it must not show zeros.

⚠️ **The pager counts to 4 and every page shows the same blocks** (`MANIFEST.md` §10). A report is one
document. **Either the pager reflects real content or it is marked** — task 4 decides, and leaving it
counting to a made-up 4 is not one of the options.

**Size: ~90 lines**, most of it deletion of the fixture.

> **Proof.** After task 3's run, the left panel holds **that report** — its directive as the title,
> its analyst and block in the byline, its facts as the table. Reload with no run in the session and
> it says there is no report yet rather than showing a document.

### Task 5 · `/` ← `list()` + `tokensFor()` + the claims join

**`app/page.tsx`.** Delete `MARKETPLACE`; add three reads.

⚠️ **Three queries, and the batching is the point.** `list()`, then **one** `tokensFor(hashes)`, then
**one** claims join over all hashes — *"a list page that fans out per row is what costs once the list
gets long."* The join is written in the page, not added to `store/`.

⚠️ **`export const dynamic = 'force-dynamic'`.** Without it Next prerenders `/` at build time and
freezes the list at whatever was in Neon when the deploy ran — *"a published report would not appear
until the next deploy, which reads as the store being broken."*

⚠️ **A server component reading the store directly — no API route, and none should be added.** A route
here is a second copy of `list()` behind a fetch the server makes to itself.

**Size: ~80 lines changed, ~120 deleted.** Net negative.

> **Proof.** `/` lists **11 reports**, not 6. **4 carry an ISIN chip and 7 say Not tokenized.** Every
> price is the same. Every card's title is a real directive. ⚠️ **Every card links to a report page
> that resolves** — the three 404s are gone, and that is D9 confirmed. Publish nothing and reload:
> the list is unchanged. Categories are marked.

### Task 6 · `/report/[hash]` preview ← `load()`, and the probe

**`app/report/[hash]/page.tsx`.** Delete `REPORTS_BY_HASH`; call `load()`.

⚠️ **D3's three rules, and the probe is this task's deliverable as much as the page is.**

⚠️ **`load()` throws on a failed integrity check and that throw is NOT caught.** A row whose stored
JSON no longer canonicalizes to its own primary key is not a report with a caveat — it is a report
whose identity is unknown, *"and this hash is what an ATS token commits and an Arc market settles
against. An HTTP 500 and no document is the honest outcome."* `notFound()` is for the different case
of a hash nobody stored.

⚠️ **This task decides the `preview` state** — §4 states the options. Do not leave a branch that can
never render.

**Size: ~100 lines changed, ~150 deleted.** Plus the probe.

> **Proof.** ⚠️ **The probe, and it is not one figure.** Take a real report, list **every fact value
> and the assessment text** from the database, and grep the served HTML of its unpaid
> `/report/<hash>` for each. **Every one must be 0.** ⚠️ Not via `/api/console/report`. Then confirm
> the public half is genuinely there: directive, analyst, block, full hash, coverage counts, price.
> A hash nobody stored is 404. A hash whose JSON fails its integrity check is **500, with no
> document**.

### Task 7 · The buy control → `/api/buy`

**`app/components/BuyControl.tsx`.** `onBuy` POSTs `{reportHash, site: window.location.origin,
confirm: true}`.

⚠️ **`BuyControl` takes no hash today.** It needs one, and this is the task that adds the prop.

⚠️ **Its own origin, never a default** — *"a page must buy from the deployment serving it."*

⚠️ **The response has four failure shapes and they are not the same**: `refused` (the buyer agent's
own caps — a 402), `stop`/`fail`/`error`, a settled payment with no body, and success. `trash/`
distinguishes all four and the messages matter: a cap refusal is not a network failure.

⚠️ **One buyer path in this project.** *"A second would mean the product and the console could
disagree about what a purchase is: different caps, a different record in `purchases`, a different
answer to 'did it settle'."*

⚠️ **The bought body is markdown and renders through `app/markdown.tsx` — D4.** Not `ReportPaper`.

⚠️ **`trash/` put the paper and the purchase bar in ONE client component**, because the bought body
replaces the locked block *inside* the paper while the control lives *in the aside* — *"two
components would mean two copies of one piece of state."* **The new markup separates them, so this
task must decide how the state is shared.** Lifting it to the page is not available: the page is a
server component.

**Size: ~120 lines**, plus whatever the state decision costs.

> **Proof.** ⚠️ **This spends real testnet HBAR. Press once.** On a paywalled report press **Unlock**.
> The bar reports the quote, then the settlement. The locked block is replaced by the report body,
> in the paper, with the transaction receipt beside it. Reload: it is locked again — there is no
> identity, so the purchase is not remembered, **and the page must not pretend otherwise**.

### Task 8 · `/markets` ← one join + one batched `eth_call`

**`app/markets/page.tsx`.** Delete `MARKETS`; one `LEFT JOIN` over markets/claims/reports/scores, and
one batched chain read.

⚠️ **One HTTP round trip for N markets.** `ethers`' `JsonRpcProvider` coalesces calls made in one tick
into a JSON-RPC batch, so `Promise.all` over N markets is one request, not N.

⚠️ **A minimal inline ABI, never `src/arc/abi.ts`** — that artifact carries creation and deployed
bytecode. Server component or not, the rule is about traced function size as much as the bundle.

⚠️ **This is D8's task: every link becomes `chain_market_id`.**

⚠️ **The forecast/rehearsal split is rendered, not hidden.** §4 has the rule.

**Size: ~110 lines changed, ~90 deleted.**

> **Proof.** `/markets` lists **8 markets**, split into forecasts and rehearsals. Volumes are real and
> **small — around 1.02 USDC in total**, not 124,850. Every card says *1 report* or *no report*.
> Links are numeric: `/markets/6`. `/markets/lending-2027` is now **404**, correctly. The chart
> section says why it is empty and shows the real pool split. The record strip is empty — 0 scores.

### Task 9 · `/markets/[id]` ← the market row, its claim, its pools

**`app/markets/[id]/page.tsx`.** Delete `MARKETS_BY_ID` — about 300 lines — and read the row, its
single claim with the report and score, the batched pools, and the recorded stakes.

⚠️ **Pools from the chain, never from `stakes`.** ⚠️ **The rehearsal and void banners have no
counterpart in the design and are added** — they are things the reference had no concept of and the
data does.

**Size: ~140 lines changed, ~300 deleted.** ⚠️ **The largest deletion in the phase and net strongly
negative.**

> **Proof.** `/markets/6` renders the real question from `spec_json`, the real criterion, real TRUE
> and FALSE pools, **one** supporting report with its full hash, and the score with two of three
> fields **ABSENT rather than zero**. `/markets/999` is 404. Exactly two outcome rows. ⚠️ Market 6's
> staking is closed, so the panel renders its closed branch — **the open branch is built but unproven
> in a browser**, said rather than implied.

### Task 10 · The stake control → `window.ethereum` + refresh

**`app/components/StakeControl.tsx`.** ⚠️ **This task owns D5 and D6** — the attach toggle is cut, the
payout estimate is marked.

⚠️ **No library. `window.ethereum` and nothing else** — no wagmi, no WalletConnect, no `ethers` in
this bundle. The calldata arrives already encoded from the server component, because `marketId` and
`claimId` are fixed for the page.

⚠️ **The two things about Arc that break naive wallet code, both from `trash/`:**

1. **The native gas token is USDC, not ether.** `wallet_addEthereumChain` must say so.
2. ⚠️ **It is 18 decimals, on a token the world knows as 6.** `msg.value` is 18-dp while `decimals()`
   returns 6, and **both are right for their own interface**. A wallet that gets this wrong is off by
   a factor of a trillion **and the number still looks plausible**. The contract's rule follows:
   `msg.value % 1e12 != 0` reverts `NotAUsdcUnit`, so a stake is a whole 6-dp unit — **checked before
   signing, because a revert costs the staker gas for nothing.**

⚠️ **The visitor signs and the visitor pays**, which is the opposite of the buy control and must not
be blurred.

**Size: ~140 lines.**

> **Proof.** ⚠️ **DO NOT COMPLETE A STAKE. Markets 6 and 7 hold real money including a human's 1.00
> USDC.** Press **Connect wallet and stake** on an open market: the wallet opens, asks for Arc, and
> shows a USDC value. **Read the amount and cancel.** Enter `0.0000001` and the control refuses it
> before the wallet opens. **No switch labelled *Attach supporting report* exists.** The payout slot
> is marked and shows the real pools instead.

### Task 11 · `/holdings` ← `/api/holdings`

**`app/holdings/page.tsx`.** Delete `HOLDINGS`; fetch the route at runtime, as `trash/` did, so
`ethers` and an RPC client stay in the route rather than on the page.

⚠️ **The marketplace says a report *is* tokenized; this says *who holds it*.** Only one of those is
answerable from the database — *"the chain is the authority over anything we recorded when we sent
it."*

**Size: ~70 lines.**

> **Proof.** `/holdings` lists real ATS tokens against the analyst accounts, read with `balanceOf`.
> Token ids are real, not `DEMO-*`. Every report link resolves. If a token is held by neither analyst
> account, that section appears; otherwise it does not.

### Task 12 · Tokenize → `/api/console/tokenize`

**`app/components/TokenizeForm.tsx`.** `onTokenize` POSTs with the secret header. ⚠️ **Owns D7** —
`.full` restored on both CTAs.

⚠️ **Report upload stays MARKED, not wired.** There is no product route that accepts a report and an
uploaded PDF has no canonical form this pipeline can hash. The tab stays and is inert.

⚠️ **The editable price stays MARKED.** Per-report pricing needs a `reports` column, a `quotes.ts`
change, and a decision about whether a price is inside the report's hash — **it must not be, since a
price is not part of a report's identity.** That is a store decision, not a page one.

**Size: ~90 lines.**

> **Proof.** ⚠️ **This mints a permanent ATS asset and costs ~7.7 HBAR. Press once, or not at all.**
> With the secret typed, **Tokenize and list** on an untokenized report returns an ISIN, and the
> report's card on `/` changes from *Not tokenized* to *Tokenized · ISIN*. Both CTAs span the form.
> The upload tab and the price field are visibly inert.

### Task 13 · The sweep, and the play gap

**Every page.** One pass: is each remaining inert control **marked** or **cut**, and is it the right
one of the two? Then walk the whole site as a stranger who has read nothing.

⚠️ **The line, and it has not changed:** *mark what a reviewer would otherwise think we forgot; cut
what the contract forbids.*

**Size: small, or an honest list of what it found.**

> **Proof.** Walk `/` → a report → pay → `/markets` → a market → `/holdings` → `/console`, pressing
> everything. **Nothing lies.** Every inert control says what it would do. No number on the site came
> from a const. The two `.demo-toggle` rules orphaned in `globals.css` since Phase 5 commit 3 are
> either used or knowingly left.

---

## 6 · Open items

1. ⚠️ **The `preview` access state has no real counterpart — task 6 decides.** Named here so it is
   not discovered mid-task.
2. ⚠️ **The console's document pager counts to 4 against a one-page document — task 4 decides.**
3. ⚠️ **The bought body's state ownership** — the new markup splits the paper from the purchase bar,
   and `trash/` deliberately kept them in one client component. **Task 7 decides**, and it is the one
   place this phase may need to move markup rather than only values.
4. `rebuild/MANIFEST.md` is untracked and is the incoming build's own record. **Not this phase's
   business**, but it should land somewhere before submission.
5. ⚠️ **`.source-panel` and `.marketplace-page` and `.holdings-page` have no rules in `globals.css`.**
   Harmless — `.tab-panel` and `.page-container` do the work — and recorded so none reads as an
   omission later.

---

## 7 · ⚠️ Standing rules for every task in this phase

```
never    edit src/, contracts/, scripts/ or app/api/
never    import src/arc/abi.ts into a client component — it carries the full bytecode
never    add NEXT_PUBLIC_ to anything that is not genuinely public
never    relax tsconfig.app.json's nodenext — Turbopack then cannot resolve src/'s .js specifiers
never    use next/link — no spelling of it works here; plain <a href>
always   clear .next after a move; a stale route validator prints "Compiled successfully" above its
         own failure
always   an empty env var is a missing env var; src/config/env.ts is the one guard
always   npx next build is the check for app/, and tsc is not a substitute
always   a green build is not a rendered page — request the route
```

⚠️ **Do not press Generate, Tokenize, Transfer or Unlock more than the proof asks for.** Generate
spends model tokens, Tokenize mints a permanent asset for ~7.7 HBAR, Unlock spends real testnet HBAR.
⚠️ **Markets 6 and 7 hold real stakes, including 1.00 USDC from a human wallet, and resolve from a
single scheduled cron attempt. No task in this phase writes to them.**

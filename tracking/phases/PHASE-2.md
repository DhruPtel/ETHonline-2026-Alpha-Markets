# PHASE-2.md — Report building

**Revises:** `PLAN-v4-alpha-markets.md` §9 Phase 2, with everything Phase 1 measured folded in.
**Status:** ready to start. Phase 1 closed with **13 units, all proofs run against live networks**.
`docs/phase-1-summary.md` is the account of what it found; `tracking/logs.md` is the narrative.

---

## What Phase 2 is for

*The agent can think.*

Phase 1 gave it eyes: 25 deployments answering live, and a measured account of which figures can be
trusted. What comes out today is whatever prose the model chose that run. Two questions about the
same protocol return differently shaped answers, nothing checks that the numbers tie out, and nothing
stops the model writing a figure that was never in the data — it has declined to, every time, but
that is behaviour and not a guarantee.

Phase 2 turns a directive into a **structured financial report**: fixed sections, figures that
reconcile, a verdict the analyst can defend, and a hash anyone can recompute.

**Ending goal — a capability you can demonstrate:**

> Run a script with a directive in plain English. Watch the agent produce a **plan** — subject,
> scope, which deployments, which documents, which checks — then watch deterministic code execute
> it, reconcile the figures, and print a memo. Every number in the prose traces to a computed value.
> Run it again at the same block and get **the same hash**.

Then two sharper ones, both of which are the point rather than decoration:

> Give it a directive we cannot answer — *"is Aave a good investment?"* — and watch it return
> **`needs_clarification`** rather than a confident essay.

> Ask for a report *about* compound-v3's total deposits — a deployment carrying a live `DATA_ERROR`
> on one of its ten markets — and watch it **refuse to publish**, naming the market. Then ask about
> its utilization and watch the same report **publish with that one figure withheld and explained**.
> Phase 1 flags; Phase 2 is where a flag becomes a rule about a specific figure.

---

## The design law for this phase

**Show all the data. Attach caveats. Do not hide a figure because it is imperfect.**

The model for this is the answer `ask.ts` produced unprompted: it ranked morpho-blue second at
$13.09B, and then explained that the verdict is `unusable`, the headline is inflated roughly 3.6×,
and it disagrees with its own contract — before declining to substitute a corrected number. **That is
more useful than omitting the row.** A reader who sees the figure and the caveat can decide; a reader
who sees nothing cannot even tell there was something to decide about.

So the engine **annotates and explains; it does not withhold** — with one exception, and it is narrow:
a figure with no true value to show. A poisoned accumulator is not an imperfect number, it is the
absence of one, and `null` is the only honest rendering. Everything else travels with its account
attached.

⚠️ **This cuts against the instinct that safety means suppression.** Suppressing Morpho's TVL would
make the report *look* cleaner and be worth less. The discipline is that every figure on the page can
be traced to a source and a caveat, not that every figure on the page is beyond question.

---

## What Phase 1 changed

Ten findings that reshape this phase. Each one is why a unit below exists or why one moved.

| # | Finding | Consequence for Phase 2 |
|---|---|---|
| 1 | **Nothing enforces a flag.** Morpho's ~3.6× inflated TVL is flagged and present, and whether to use it is the model's judgment. It has judged well every time, which is behaviour rather than a guarantee | ⚠️ **The engine is where a flag becomes a rule — a rule about *which figure*, not a blanket refusal.** `publish.ts` gates per figure and escalates to the report only when the subject itself is unreportable |
| 2 | **`corroborate.ts` is built and unreached from the agent path** | `engine/checks/crosscheck.ts` is the consumer §5.14 always specified. Building it closes an orphan rather than starting something new |
| 3 | **`evidence.ts` is built and stores nothing** — records exist, Phase 3 owns persistence | A report references evidence records that do not yet survive the process. Phase 2 must carry the reference, not assume the store |
| 4 | **Building the encoder before the evidence is backwards** — proved three times (SM-03, SM-04, the wire freeze) | ⚠️ **The narration validator is built BEFORE the narrator.** Build the narrator first and you tune prompts until output looks right, then write a validator that passes it |
| 5 | **A flag nobody can account for invites a wrong story.** An unexplained `incomplete` made the model invent "3.x-only fields being omitted", which was false | Every flag on a report carries its rationale to the surface, or it does not go on the report |
| 6 | **Only 5 of 25 deployments can carry a balance report**, and 8 report a live balance sheet with no recent history | The forecast attachment would have needed history 8 deployments do not have. **Deferred out of Phase 2** — nothing settles until Phase 4, so it has no consumer yet, and the history problem defers with it |
| 7 | **The intersection is wide and nothing dispatches on schema version** | The engine inherits that: no per-version branching until something needs it |
| 8 | **Figures are BigDecimal strings with up to 23 decimal places**, and `Number()` silently rounds them | ⚠️ `engine/ops.ts` cannot use floats. Reconciliation that rounds is reconciliation that lies |
| 9 | **`Report` in `wire.ts` is byte-compatible with SM-01's fixture**, verified to the digit | Any field added to `Report` changes its canonical bytes. Cheap today, expensive the moment a report exists |
| 10 | **Corroboration is available on only 3 of 25 deployments** — compound-v2 has no write-time field at all, and compound-v3's accessor is unmeasured | ⚠️ Absence of corroboration cannot block. Blocking on it would mean 22 deployments can never publish, which contradicts triage clearing five. `not_checked` is `INFORMATIONAL` |

### The scope gap, measured

Triage judged every deployment from its **protocol totals** — an external reconciliation, a
utilization ratio, a snapshot count — and never walked the markets. The adapter does. The question
was how far apart those two views are, and it is checkable rather than assertable:
`scripts/check-market-level.ts` runs the same `adapt()` every report will run, over a real market
population, on all 25 live deployments.

**Measured 2026-09-07 — 3,322 markets read, every population walked to exhaustion:**

| | |
|---|---|
| Deployments triage cleared (`publishable` or `flagged`) | **14** |
| …of those, carrying a market-level `DATA_ERROR` | **1** — `compound-v3-ethereum`, one market pricing zero with a non-zero balance |
| Deployments triage called `unusable` showing **no** market-level `DATA_ERROR` | **11** |
| Deployments raising a `SIGNAL` at market level | 7 |

**The gap is one deployment, not a dozen**, and that is worth having measured rather than feared —
"25 protocols answer" survives contact with market-level inspection. ⚠️ And under the amended §5.13
that one is not even a blocked report: it is a blocked *figure*, and a report about compound-v3's
utilization still publishes with its deposit figure withheld and explained.

⚠️ **The more useful half of the result is the 11.** Deployments triage called `unusable` mostly show
clean oracle state — they failed on external reconciliation, inverted balances or empty books, which
are protocol-total properties. **The two views catch different things and neither subsumes the
other**, which is the argument for `reconcile.ts`, `crosscheck.ts` and `invariants.ts` all existing
rather than one of them standing in for the rest.

Reproduce with `npx tsx --env-file=.env scripts/check-market-level.ts`.

---

## ⚠️ Where PLAN-v4 §9 and Phase 1 now disagree

Amending is better than carrying two documents that contradict.

**1. `workflow/gather` is already built.** §9 Phase 2 lists it. `agent/tools.ts` gathers across
deployments, resolves a common block through `blockwindow.ts`, paginates, and adapts — that *is* the
gather step, and it was proved against 25 deployments. **Recommendation: strike `workflow/gather`
from §9 Phase 2.** If it was meant to be something else, that needs saying, because as written it
would be built twice.

**2. `domain/canonical.ts` must not be a second canonicalizer.** §9 lists it as a Phase 2 file, but
`graph/evidence.ts` already canonicalizes through the `canonicalize` package on SM-01's proven path.
**Two canonicalizers that disagree is exactly the dispute nobody can resolve.** The unit below
extracts the existing one and adds report-hashing on top; it does not write a new one.

**3. The report format is a public contract, and §9 does not say so.** The product is an agent
economy — other people register analysts running their own models on their own keys. Separate keys
are what make separate analysts real; one shared key is one analyst wearing many names and the
leaderboard means nothing. **The schema has to be something an outsider can target and a market can
settle on.** Registration and key handling are Phase 3, but the format decision lands here and
retrofitting it is expensive.

**4. Every report carries an analyst identity, and `config/analysts.ts` was never built.** SM-08's
open to-do schedules it for "Phase 1, with `analysts.ts`" and §5.18 requires asserting its address
equals the Circle wallet address. No Phase 1 unit built it. It becomes Unit 2 here, and SM-08's
assertion can finally run.

**5. ✅ Resolved — one report form, not two.** §5.18 named *balance overview* and *forecast
attachment* and cut ranking. **Ranking-as-a-report-form stays cut**, as decided in Phase 1 planning —
and it is a different thing from the analyst leaderboard, which is Phase 4 and was never in scope
here. **The forecast attachment is also deferred out of Phase 2:** it is what backs a market, and
nothing settles until Phase 4, so it has no consumer yet. Phase 2 builds the one form that does.

The agent can still *answer* with a ranking in conversation — `ask.ts` does, and that stays. What it
cannot do is emit a ranking as a hashed, settle-able report.

**6. §9's exit says "stable hashes"; Unit 1 of Phase 1 already got there at the type level.**
`Report` is frozen and byte-compatible with SM-01's fixture. Phase 2's job is filling it, not
designing it — with the amendment in Unit 1 below.

---

## ✅ Decided: `Verdict` splits in two

`wire.ts` declared `VerdictCall = 'undervalued' | 'fairly_valued' | 'overvalued'`, carried over from
SM-01's fixture. **Those are price judgments and this engine has no price data.** Worse, the single
field conflated two things that differ in kind — what the numbers *do*, and what an analyst thinks
they *mean*. Phase 4's market has to know which of the two it is settling on, so collapsing them is
not a naming problem, it is a correctness one.

**Two fields, decided 2026-09-07:**

```ts
// What the engine computed. Derivable from a check that actually ran.
type VerdictCall = 'ties_out' | 'discrepancy' | 'not_checked';

// What the analyst thinks it means. Not computed, and never presented as if it were.
interface Assessment { summary: string; basis: readonly FactId[]; confidence: Confidence }
```

| verdict | means | today's example |
|---|---|---|
| `ties_out` | every check that ran, passed | aave-v2 — 37 markets sum to the protocol total, 3 of 3 sampled markets match the chain exactly |
| `discrepancy` | a check ran and disagreed, and the gap is measured | morpho-blue — subgraph and contract differ by exactly −10,000,000 on USDC/PAXG |
| `not_checked` | the checks that would decide could not run | an incomplete population, or a deployment with no corroboration and no market walk |

⚠️ **`discrepancy` deliberately does not say who is wrong.** §5.14 settled that attribution is
per-deployment and sometimes open, and Morpho is the standing example. The verdict reports that two
sources disagree and by how much.

⚠️ **`not_checked` reuses `CorroborationStatus`'s word on purpose.** It means the same thing one
level up — the check did not run — and inventing a second word for the same idea costs more than the
scope collision does.

**The second field is named `assessment`, not `call`.** `call` is already the field name *inside*
`Verdict`, so reusing it is exactly the confusion this split exists to prevent. `assessment` cannot
be mistaken for the structural finding.

⚠️ **`basis` is what keeps an opinion honest.** An assessment references fact ids from the report's
fact table, so a reader can see which measured figures the judgment rests on — and the narration
validator already forbids digits outside a placeholder, so the summary cannot smuggle a number in.

⚠️ **The split resolves the open `Confidence` question, and it resolves it the other way.** The
objection was that `low | medium | high` is a judgment label on a pure deterministic engine. It is —
which is why it belongs on the **assessment**, where a judgment is what it is supposed to be, and not
on the verdict. The verdict instead carries **measured coverage**: markets corroborated over markets
read, and whether the population was complete. *"4 of 67 markets corroborated, population complete"*
is a fact a reader can weigh; *"medium confidence"* about a tie-out would have been an opinion wearing
a fact's clothes.

---

## The units, in order

Each is one commit. **Nothing is built ahead.** Ceilings from `CLAUDE.md` apply — LOGIC files ~120
lines, split before writing if longer.

**The order follows Phase 1's hardest lesson: build the thing that judges before the thing that
produces.** The contract first because retrofitting a public format is expensive; the engine before
the narrator because a verdict has to exist before it can be described; the validator before the
narrator because a guard written after the thing it guards gets tuned to pass it.

### 1 · `src/types/wire.ts` — amend — SCAFFOLD, ~70 lines changed

The report as a **public contract**, not an internal shape. `Report` gains `analyst`, `subject`,
`form`, `sections` and `facts`, and `VerdictCall` changes per the proposal above.

⚠️ **The schema string stays `alpha-markets/report/v1`, and v1 is frozen HERE.** SM-01's fixture
committed to that string before the shape settled, and no report has ever been published, so v1 is
defined by what this unit emits rather than by what a test fixture happened to hold. SM-01's fixture
is updated to the frozen shape and its recorded sample hashes are re-recorded **once**, deliberately,
in this commit. **After this, any change to `Report` is v2 with a migration** — the whole point of a
public contract is that an outsider targeting v1 gets one answer.

⚠️ **`analyst` is a wallet address, and it is inside the hash.** A wallet is already required for
staking on Arc and is already how attribution works on-chain, so this invents no second identity
system. Who wrote a report is part of what the report *is*: a market settles on an analyst's claim,
and an unattributed report cannot carry a reputation. The ATS token address stays outside the hash,
because the token commits the hash and the hash cannot contain the token.

*Proof:* typechecks; a v1 fixture hashes stably under key reordering and differently under a one-cent
change; the lifecycle strip still removes `atsTokenAddress`.

### 2 · `src/config/analysts.ts` — SCAFFOLD, ~50 lines

One row per analyst, **keyed on the wallet address** its on-chain claims come from: address, display
name, model. The address is the identity; everything else is presentation.

⚠️ **Closes SM-08's open to-do** — §5.18 requires `analysts.ts` address == the Circle wallet address,
and only the `msg.sender` half could run in Phase 0. Both halves run now, against the recorded wallet
`0x1b7035bb…16a7`.

⚠️ Registration and per-analyst API keys are Phase 3. Separate keys are what make separate analysts
real — one shared key is one analyst wearing many names — but the format decision is what lands here.

*Proof:* the address assertion passes; a report carries an analyst address that resolves to a row.

### 3 · `src/domain/canonical.ts` — SCAFFOLD, ~50 lines

Report hashing: JCS via `canonicalize`, lifecycle fields stripped, decimals as strings.

⚠️ **Extracts what `graph/evidence.ts` already uses. It does not write a second canonicalizer.**
Golden vectors get shared with Foundry here, as §8 and SM-01 both require.

*Proof:* SM-01's RFC 8785 vectors still pass through the shared path; a report hashes identically
under key reordering and differently under a one-cent change.

### 4 · `src/engine/ops.ts` — **LOGIC**, ~90 lines

Exact arithmetic over `Computed`: sums, differences, ratios, deltas. Everything `reconcile.ts` and
`invariants.ts` both need, in one place.

⚠️ **No floats.** Gateway figures carry up to 23 decimal places and `Number()` rounds them silently —
a reconciliation that rounds is a reconciliation that lies, and the result is hashed.

⚠️ **Open question before this unit: does exact decimal arithmetic justify a dependency?**
`decimal.js` is ~30 KB and correct; BigInt fixed-point is no dependency and more code to get wrong.
`CLAUDE.md` says dependencies are decisions. **Ask before writing.**

*Proof:* sums 1,759 Morpho market balances exactly, and a property test shows no result differs from
the same computation done in arbitrary precision.

### 5 · `src/engine/reconcile.ts` — **LOGIC** ★★, ~110 lines

**The tie-out, and the credibility of the whole product.** Does what a protocol claims match what its
parts sum to. Pure: takes `Computed` plus a market population, returns claims with deltas.

Three reconciliations to start, all of which Phase 1 has data for:
- Σ market deposits against the protocol total
- deposits − borrows against total value locked
- market-level balances against `corroborate.ts`'s chain readings, where they exist

⚠️ **A reconciliation over an incomplete population is not a reconciliation.** It cannot tell a real
gap from rows never read. Where the population is `incomplete`, the claim is withheld, not failed.

*Proof:* aave-v3's 67 markets tie out; a deliberately truncated walk withholds rather than reporting
a false gap.

### 6 · `src/engine/checks/crosscheck.ts` — **LOGIC**, ~70 lines

Turns `corroborate.ts`'s observations into findings. §5.14 always specified this split —
`corroborate.ts` fetches, `crosscheck.ts` compares — and Phase 1 built only the first half.

⚠️ **`not_checked` is `INFORMATIONAL` and never blocks.** Corroboration is available on **3 of 25
deployments**: compound-v2 has no write-time field at all, compound-v3's accessor is unmeasured, and
most untested rows have no hint. Blocking on its absence would mean 22 deployments can never publish,
which directly contradicts triage clearing five as publishable. The honest rendering is *"this figure
could not be independently verified, and here is why"* — carried to the surface, not suppressed.

⚠️ **A `mismatch` is a `DATA_ERROR` about that figure**, not about the deployment. Which side is
wrong is per-deployment and sometimes open — Morpho is the standing example — so the finding reports
the delta and both blocks and stops there.

*Proof:* Morpho's −10,000,000 arrives as a figure-scoped `DATA_ERROR` with both blocks named;
compound-v2 produces `INFORMATIONAL` with its reason and nothing is blocked.

### 7 · `src/engine/invariants.ts` — **LOGIC** ★, ~110 lines

`{ severity, appliesTo, rationale }` over reconciliation claims and adapter findings. §5.13's four
levels, and `Finding`/`Severity` move here from `adapter.ts` where Phase 1 parked them.

⚠️ **The Messari 11 are heuristics, not invariants.** §5.13's worked example: deposit $100 → borrow
$80 → repay $80 → borrow $80 leaves `cumulativeDepositUSD ≥ cumulativeBorrowUSD` failing with
nothing wrong.

⚠️ **`SIGNAL` is the product, not a degraded error.** A market where borrows exceed deposits is the
finding an analyst is paid for. Three deployments show it today.

*Proof:* the compound-v3 zero-price market raises `DATA_ERROR`; rari-fuse's inverted balances raise
`SIGNAL`; neither is suppressed into the other.

### 8 · `src/engine/publish.ts` — **LOGIC**, ~70 lines

**The gating gap closed — per figure, not per report.**

⚠️ **A `DATA_ERROR` blocks the FIGURE it touches, not the whole report.** compound-v3 has one bad
market out of ten; the other nine are fine and the protocol total is still meaningful. Blocking the
report would throw away nine good figures to suppress one bad one, and it would make the engine less
useful than the model already is without it.

⚠️ **Unless the affected figure is the report's subject — then the report is blocked.** A balance
overview whose balance is in error is not a report with a caveat, it is not a report. That is the
escalation rule, and it is the only one.

So there are three outcomes, and `compose.ts`'s declared subject is what distinguishes the second
from the third:

| outcome | when |
|---|---|
| publishes whole | no `DATA_ERROR`, population complete |
| publishes with a figure withheld and explained | a `DATA_ERROR` touches a figure that is not the subject |
| does not publish | a `DATA_ERROR` touches the subject, or the population behind the subject is incomplete |

⚠️ **A withheld figure is not a silent omission.** It appears in the report as withheld, with the
condition named — the design law applies here too, and Phase 1 proved that an unexplained flag makes
a model invent a reason for it.

*Proof:* a report *about* compound-v3's total deposits refuses today, naming the market; a report
about its utilization publishes with that one market's deposit figure withheld and explained.

### 9 · `src/agent/compose.ts` — **LOGIC** ★, ~110 lines

The model produces a **`ReportPlan`** — subject, deployments, `documentId`s, variables, which checks —
and deterministic code executes it. §5.6: the planner selects documents and never authors GraphQL,
which Phase 1 already enforces at the tool boundary.

⚠️ **One form: the balance overview.** The forecast attachment is deferred out of Phase 2 — it is
what backs a market, and nothing settles until Phase 4, so building it now would be building for no
consumer. Ranking stays cut as a report form.

⚠️ **The declared subject is load-bearing twice over.** It is what keeps a report on topic — *"Aave's
borrowing deficit"* should produce a report about that, not a general overview mentioning it, because
a free-running model drifts to the overview since the overview is easier. And it is what `publish.ts`
reads to decide whether a `DATA_ERROR` blocks a figure or the whole report.

⚠️ **`needs_clarification` is a first-class outcome**, not an error. A directive naming no subject, no
period, or no answerable question returns it with the specific ambiguity named.

*Proof:* three directives produce three differently-scoped plans; *"is Aave a good investment?"*
returns `needs_clarification` naming what is missing rather than writing an essay.

### 10 · `src/report/assemble.ts` — **LOGIC**, ~90 lines

Plan + `Computed` + findings → a `Report` object with fixed sections and a **fact table**.

⚠️ **The fact table is the only place a digit exists.** Every figure gets an id, a value, a unit, a
source deployment and a block. Narration references ids; it never carries numbers.

*Proof:* a report object for aave-v2 with every figure traceable to a deployment hash and block.

### 11 · `src/report/validate-narration.ts` — **LOGIC** ★★, ~70 lines

**Built before the narrator, deliberately.** Rejects any digit sequence in `text` that is not inside a
`{fact:ID}` placeholder, plus any placeholder referencing an id not in the fact table.

⚠️ **That single rule is what makes "$900 billion" impossible rather than unlikely** — §5.11 says
plainly that TypeScript types cannot do this.

⚠️ **Order matters and Phase 1 proved why.** Written after the narrator, this gets tuned until the
narrator's existing output passes. Written first, against hand-written adversarial cases, the
narrator has to satisfy it.

*Proof:* a corpus of hand-written adversarial paragraphs — a bare year, a percentage, a spelled-out
number, a stale fact id — every one rejected, with the offending span named.

### 12 · `src/agent/narrate.ts` — **LOGIC**, ~90 lines

The model writes prose against the fact table, returning §5.11's shape:
`{ sections: [{ id, paragraphs: [{ text, factRefs: [] }] }] }`.

⚠️ **A deterministic template fallback**, for when the narrator returns something the validator
rejects and a retry does not fix. A plainer report is better than no report.

*Proof:* narration for the same report passes the validator on the first attempt; a forced bad
narration falls back to the template rather than publishing.

### 13 · `src/report/render.ts` — SCAFFOLD, ~70 lines

`Report` object → markdown. Memo-style, one to two pages, fixed sections.

⚠️ **The hash is on the object, never on the rendering.** Markdown now, a file in Phase 3, HTML when
there is a UI — all three must hash identically because none of them is the report.

*Proof:* two renderings of the same object differ in bytes; their source objects hash the same.

### 14 · `scripts/report.ts` — the proof

Directive in, report out, hash printed. The demo that closes the phase.

*Proof:* the ending goal above, run end to end.

---

## Requirements this phase closes

| # | Requirement | Status after Phase 2 |
|---|---|---|
| **G2.3** | Meaningful work — reasoning, decisions, automation | ⚠️ **Advanced, not closed.** §3 defines it as *directive → plan → reconciliation → verdict → on-chain prediction backed by the agent's own USDC*. Phase 2 delivers the first four. **The fifth is Phase 4** |
| G1.1 · G1.2 · G1.3 · G2.1 · G2.2 | The Graph, load-bearing and live | Already closed in Phase 1. Phase 2 must not regress them — nothing cached, nothing mocked |
| **G1.5** | ⛔ Standards leverage **demonstrated** | ⛔ **Still open, still pass/fail, still nobody's unit.** Flagged at the start of Phase 1 and never scheduled. Adding a protocol is demonstrably one config row; the act has never been performed |
| H2.x · A1–A5 | Hedera tokenization · Arc market | **Set up, not closed.** Phase 2 produces the hash those phases commit and the claim the market settles. Neither exists until Phases 3 and 4 |
| G1.4 | Authoring a standardized subgraph | Deferred with revenue, unchanged |
| — | The forecast attachment | **Deferred to Phase 4**, where a settling market gives it a consumer |
| G1.6 · G2.5 · G2.6 | Repo, README, video, Start Fresh | Phase 6 |

**The honest summary:** Phase 2 closes no pass/fail requirement outright. It makes G2.3 mostly true
and produces the artifact — a hashed, reconciled report — that Phases 3 and 4 need in order to close
theirs. That is worth saying plainly rather than claiming a win.

---

## How to know it's going right

**On track:** a directive produces a plan you can read before any query runs. Two runs at the same
block produce the same hash. Every figure in the prose is a reference. A report that should not
publish, does not.

**Drift signals:**

- **A digit appearing in narration text.** The validator exists precisely to make this impossible;
  if one gets through, the validator is wrong, not the narrator.
- **A tolerance appearing in `reconcile.ts`.** Same failure as the one §5.14 was amended to prevent.
  A tie-out that passes approximately is not a tie-out.
- **`Number()` on a gateway figure anywhere in `engine/`.** 23 decimal places, silently rounded, and
  the result is hashed.
- **A report publishing a figure a `DATA_ERROR` touches**, or refusing to publish over an error that
  never touched its subject. Both directions are failures of the same unit — one publishes something
  it cannot stand behind, the other throws away nine good figures to suppress one bad one.
- **A figure disappearing without its reason.** Withholding is visible and explained, or it is not
  withholding, it is omission. Phase 1 measured what an unexplained flag costs: the model invented a
  reason for it.
- **`not_checked` blocking anything.** 22 of 25 deployments cannot be corroborated. If absence of a
  check starts gating, the phase has quietly adopted a rule that contradicts triage.
- **`needs_clarification` never firing.** If every directive produces a report, the planner is
  guessing at ambiguity rather than naming it.
- **The hash changing between two runs at the same block.** Something non-deterministic reached the
  object — a timestamp, an iteration order, a floating-point result.
- **A second canonicalizer.** One path, extracted from `evidence.ts`, or the dispute is unresolvable.
- **Anything in `engine/` performing I/O.** The engine is pure; corroboration is an adapter that
  hands it observations.
- **A commit touching `ats.ts`, `gate.ts` or `AlphaMarket.sol`.** Those are Phases 3 and 4.

---

## Carried into later phases

| Item | Phase |
|---|---|
| The **forecast attachment** report form — deferred here, needs a market to settle against | 4 |
| `Confidence` as a judgment label rather than measured coverage — same objection as `VerdictCall` | decide with Unit 1 |
| Evidence records have nowhere to be stored | 3 |
| Analyst registration and per-analyst API keys — the thing that makes separate analysts real | 3 |
| `corroborate.ts` reachable from the agent path, not only from `crosscheck.ts` | 2 or 3, before settlement depends on it |
| compound-v3's contract accessor unmeasured, so its corroboration is `not_checked` rather than checked | 2, with Unit 6 |
| Morpho's −10,000,000 has no established cause | before any Morpho figure reaches a published report |
| Revenue: three deployments clean, the rest need a corrected subgraph deploy or engine-side derivation | after the sweep says how many are affected |
| ⛔ **G1.5 rehearsal — pass/fail, unscheduled since Phase 1 began** | **schedule it** |
| Nothing is deployed; §2 rule 3 says "deployed from Day 2 and stays deployed" | overdue |

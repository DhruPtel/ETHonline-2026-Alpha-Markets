# Phase 2 — Task by Task

*The agent can think.*

Phase 1 gave it eyes — 25 protocols, and it knows what to trust. Phase 2 gives it judgment: turning a
directive into a structured financial report with figures that tie out and a verdict it can defend.

Right now the output is whatever prose the model chose that run. Two reports on the same protocol come
back differently shaped, nothing checks internal consistency, and nothing stops the model writing a
figure that wasn't in the data.

---

## Status

| Unit | File | Kind | Status |
|---|---|---|---|
| 1 | `types/report.ts` | SCAFFOLD | ✅ done |
| 2 | `domain/canonical.ts` | LOGIC | ✅ done |
| 3 | `engine/ops.ts` | SCAFFOLD | ✅ done |
| 4 | `engine/invariants.ts` | LOGIC | ✅ done |
| 5 | `engine/reconcile.ts` | LOGIC ★★ | ✅ done |
| 6 | `engine/crosscheck.ts` | LOGIC | ✅ done |
| 7 | `agent/skills/` | SCAFFOLD | ✅ done — **rewritten 2026-09-07**, see below |
| 8 | `agent/compose.ts` | LOGIC ★ | ✅ done |
| 9 | `agent/execute.ts` | LOGIC | ✅ done |
| 10 | `agent/narrate.ts` | LOGIC | ✅ done |
| 11 | `agent/validate.ts` | LOGIC ★ | ✅ done — landed 2026-09-08, wired as a **warning** |
| — | ranking form (`skills/ranking.md`, + `compose`/`execute`/`narrate` changes) | — | ✅ done — **added mid-phase, not in the original eleven** |

**11 of 11 done.** Unit 11 is the narration validator: it rejects any digit in report prose that is
not inside a `{fact:ID}` placeholder, with an allowlist derived from the report's own facts, slugs
and block. ⚠️ **It warns; it does not block** — see DECISIONS.md, 2026-09-08, and the two missing
fact ids that enforcement waits on.

**The report format was stripped twice and the forms were removed.** A report is a table and one
paragraph; `Report.form` is always `null` and both form skills are parked in `skills/unused/`. The
format has been read repeatedly since — see `docs/phase-2-summary.md` for what the phase found.

**Development set:** the five deployments triage cleared — aave-v2, aave-v3, compound-v2, compound-v3,
spark-lend. Morpho stays configured as the deployment that makes the trust layer necessary.

---

## What Phase 1 changed

| Finding | Consequence for Phase 2 |
|---|---|
| **Morpho uses Messari's exact field names and means different things by them.** TVL inflated 3.6×, collateral absent from the total | ⚠️ The engine can't assume a field means what its name says. Deployment semantics come from config, never from the field |
| **Only revenue is genuinely withheld.** Morpho's inflated TVL is flagged but present, and using it is the model's judgment | ⚠️ **This is the gap Phase 2 closes.** The engine turns judgment into rule |
| **`DATA_ERROR` blocks a FIGURE, not a report** (amended §5.13, 2026-09-07) | compound-v3 has one bad market of ten. The other nine and the protocol total are still meaningful |
| **Corroboration is available on 3 of 25 deployments** | `not_checked` is `INFORMATIONAL`. Blocking on absence would mean 22 protocols can't publish |
| **The two views catch different things** — 1 deployment has a market-level error triage missed, 11 that triage called unusable have clean oracle state | Measured, not assumed. It's why `reconcile`, `crosscheck` and `invariants` all exist rather than one covering for the rest |
| **`Verdict` was a price judgment with no price data** | Split: `Verdict` is what the engine computed, `Assessment` is what the analyst thinks |
| SM-01's fixture already froze half of `types/wire.ts` | Canonicalization is reuse, not rewrite |

---

## Two decisions that shape everything

**The report format is a public contract.** The product is an agent economy — other people register
their own analysts, running their own models on their own keys. Separate keys are what make separate
analysts real; one shared key means one analyst wearing many names, and the leaderboard means nothing.

So the schema is written as something an outsider can target and a market can settle on, not just what
our code happens to emit. ⚠️ Registration and key handling are Phase 3, but **the format decision lands
here** and retrofitting it is expensive.

**Show everything, attach caveats.** Don't hide a figure because it's imperfect. The Morpho answer from
`ask.ts` is the model — it showed $13.09B, ranked it, then explained exactly why the number isn't
comparable. More useful than omitting it.

The engine annotates and explains; it withholds only where a figure has no true value to show, like a
poisoned accumulator.

---

# Unit 1 — `types/report.ts`

**SCAFFOLD, ~90 lines**

**What we're doing:** defining the report as a public contract. Not an internal shape — something
another team's agent, running a different model, could produce and have our market settle on.

**What's in it:** the fixed section structure, `alpha-markets/report/v1` as the schema version, the
analyst identity (a wallet address — already required for staking, already how attribution works
on-chain), and the split from the plan:

```
VerdictCall  = 'ties_out' | 'discrepancy' | 'not_checked'   ← what the engine computed
Assessment   = { summary, basis: FactId[], confidence }      ← what the analyst thinks
```

⚠️ `basis` carries fact ids, so an opinion traces to the measured figures it rests on. And `confidence`
lives on the assessment, not the verdict — a judgment label belongs where judgment is.

**Proof:** typechecks, and the shape is documented well enough that someone outside the repo could
target it.

---

# Unit 2 — `domain/canonical.ts`

**LOGIC, ~70 lines**

**What we're doing:** turning a report into a stable 32-byte fingerprint. That hash is the identity
that goes onto the ATS token on Hedera and into the market on Arc — the one thing crossing between
chains.

**What's in it:** RFC 8785 JCS via the `canonicalize` package, decimal figures as strings, explicit
null versus absent, and the lifecycle exclusion.

⚠️ **The ATS token address is excluded.** The token commits the hash, so the hash can't contain the
token. SM-01 already established this and its fixture froze the shape — **reuse, don't rewrite.** Two
canonicalizers that disagree is exactly the dispute nobody can resolve.

**Proof:** the same report twice gives the same hash. Reordered keys give the same hash. One cent moved
gives a different one. SM-01's golden vectors still pass.

---

# Unit 3 — `engine/ops.ts`

**SCAFFOLD, ~80 lines**

**What we're doing:** the deterministic arithmetic. Net, ratio, sum, group, rank.

**What's in it:** pure functions over decimal strings. ⚠️ **No floating point anywhere** — the gateway
returns figures at 23 decimal places and a JS number silently rounds them.

This is scaffold because there's no judgment in it. It's the arithmetic the plan executes.

---

# Unit 4 — `engine/invariants.ts`

**LOGIC, ~100 lines**

**What we're doing:** the checks, each carrying a severity, and the rule about what blocks.

**What's in it:** four severities — `DATA_ERROR`, `INCONSISTENCY`, `SIGNAL`, `INFORMATIONAL` — and the
amended blocking rule from §5.13:

> A `DATA_ERROR` blocks the **figure** it touches. It blocks the **report** only when that figure is
> the report's subject.

⚠️ Which makes the declared subject load-bearing twice — once for scope, once for blocking.

⚠️ And the checks are **general with per-deployment applicability**, never `if slug === 'morpho'`. Unit
10 of Phase 1 established the pattern: measure how a deployment behaves, put that in config, key the
rule off the measurement.

**Proof:** compound-v3's bad market blocks its deposit figure, not its report. A `SIGNAL` like borrows
exceeding deposits is reported prominently, not withheld — that's the kind of thing a report exists to
surface.

---

# Unit 5 — `engine/reconcile.ts`

**LOGIC ★★, ~120 lines** — **the file that matters most**

**What we're doing:** the tie-out. Does what a protocol claims match what its parts sum to.

This is the product's credibility. If a judge asks "how do you know that number is right," this file is
the answer.

**What's in it:** pure. Takes `Computed` from the adapter plus observations, returns a `Verdict` with
the findings behind it. Sums markets against protocol totals, checks internal consistency, and produces
`ties_out` / `discrepancy` / `not_checked`.

⚠️ **No I/O.** Phase 1 established this and then violated it in the plan — corroboration is an adapter
that hands the engine observations, not something the engine fetches.

⚠️ **A discrepancy is a finding, not a failure.** Report the gap and where it is. Don't tune anything
to make it agree.

**Proof:** run it across the five publishable deployments. Aave should tie out. Morpho should produce a
discrepancy with the collateral gap named.

---

# Unit 6 — `engine/crosscheck.ts`

**LOGIC, ~80 lines**

**What we're doing:** folding Phase 1's chain corroboration into the engine's finding structure.

**What's in it:** takes the `CorroborationStatus` the adapter produced and turns it into findings with
severity. `match` is `INFORMATIONAL` and strengthens the verdict. `mismatch` is a `SIGNAL` — Morpho's
−10,000,000, reproduced through two independent paths. `not_checked` is `INFORMATIONAL`, not a failure.

⚠️ Available on 3 of 25 deployments. **Absence is not evidence of a problem** — say so in the report
rather than letting it read as a gap.

---

# Unit 7 — `agent/skills/`

**SCAFFOLD, markdown**

**What we're doing:** teaching the agent what a balance overview *is*. What nets against what, why
fifty rows is never the answer, gross versus net, how to present an exclusion.

**What's in it:** `balance-overview.md` and `conventions.md`. Markdown, loaded into the system prompt.

⚠️ **Adding a report form later is writing a markdown file, not shipping code.** That's the point of
the structure, and it's also the shape of the `messari-lending` skill contribution if we make it.

Forecast attachment is deferred — it backs a market, and nothing settles until Phase 4.

---

# Unit 8 — `agent/compose.ts`

**LOGIC ★, ~110 lines**

**What we're doing:** turning a directive into a plan. The model decides *what* the report contains —
subject, scope, period, which checks — and produces a plan. Deterministic code executes it.

⚠️ **This is also what keeps it on topic.** "Aave's borrowing deficit" should produce a report about
that, not a general overview that mentions it. Right now nothing constrains scope and the model wanders
because nothing tells it not to.

**What's in it:** directive plus skill plus capabilities → `ReportPlan`. The plan is visible before any
data is fetched, so a wrong plan is caught early and cheaply.

⚠️ **It must be able to return `needs_clarification`.** StreamingFast's own eval found prompt
instructions telling a model to ask clarifying questions don't work — "skill text alone does not
override model posture." So make it a structural output the planner can return, not an instruction we
hope it follows.

**Proof:** a narrow directive produces a narrow plan. A vague one asks a question instead of guessing.

---

# Unit 9 — `agent/execute.ts`

**LOGIC, ~100 lines**

**What we're doing:** running the plan. Fetch what it asks for, run the engine, assemble the report
object.

**What's in it:** the orchestration between Phase 1's tools and Phase 2's engine. ⚠️ Budgeted — model
turns, tool calls, tokens, wall clock. A runaway report is a real failure mode and it costs money.

⚠️ **One invocation, one step.** Vercel gives 300 seconds and a full report across several deployments
won't fit in one. The loop already hands the conversation back; this has to work the same way.

---

# Unit 10 — `agent/narrate.ts`

**LOGIC, ~90 lines**

**What we're doing:** the prose. Memo style, one to two pages, fixed sections.

**What's in it:** structured output — sections, paragraphs, and `factRefs`. Every financial figure is a
**reference to a computed fact id**, and the renderer substitutes the actual value.

⚠️ The model never types a number. It says `{fact:total_deposits}` and we fill it in.

**Proof:** run the same directive four times. Structure identical, phrasing varies. That's the correct
boundary — lock structure, free language.

---

# Unit 11 — `agent/validate.ts`

**LOGIC ★, ~60 lines**

**What we're doing:** the guard that makes an invented figure impossible rather than unlikely.

**What's in it:** one rule doing most of the work —

> ⚠️ **Reject any digit sequence in narration text that isn't inside a `{fact:ID}` placeholder.**

That single rule is what makes "$900 billion" impossible. A type signature can't do it — a function
typed to return a string can return any string.

Plus: every `factRef` resolves to a real computed fact, and non-numeric conclusions validate against
the verdict enum.

**Proof:** hand it narration containing a bare number and watch it reject. Hand it a `factRef` pointing
at nothing and watch it reject.

---

## The ending goal

**Hand it a directive — "balance overview for Aave v3" — and get back a report where every number
traces to a recorded query, the tie-out either holds or explains why not, and the content hash is
stable across runs.**

Run the same directive twice, get the same hash. **That's the property Phase 4's market settles
against.**

And the sharper one:

**Ask for something narrow — "Aave's borrowing deficit" — and get a report about that**, not a general
overview that mentions it in passing.

---

## Requirements

| # | Requirement | Status after Phase 2 |
|---|---|---|
| **G2.3** | Meaningful work — reasoning, decisions, automation. Not printing a query result | ✅ **Closed.** Reconciliation, a verdict, and a structured report is unambiguously meaningful work |
| **G1.5** | Standards leverage demonstrated | Strengthened — a report comparing four protocols through one document is a better demonstration than a config row appearing in a table |
| H2.5 | A secondary market for ATS assets | Set up. **Reports have to exist before they can be sold** |
| A4 | Programmable money flows — conditional settlement | Set up. `claim.ts` is where a report produces something a market can settle on |
| — | The report hash | The identifier crossing to both Hedera and Arc. Everything cross-chain rests on it |

> The argument for Phase 2 isn't that it wins a prize. It's that **without it there's nothing to sell
> and nothing to settle on.** Three of the seven prizes need a report to exist.

---

## Drift signals

- **A figure appearing in narration text.** The validator should catch it. If it doesn't, the validator
  is wrong, not the narrator.
- **Reconciliation always passing.** Suspicious. Point it at Morpho and confirm it produces a
  discrepancy with the collateral gap named.
- **The hash changing between identical runs.** Canonicalization is wrong. Fix it now — in Phase 4 this
  becomes a settlement dispute.
- **A vague directive producing a confident report.** The `needs_clarification` path isn't wired, and
  this will happen on camera.
- **`if slug === 'morpho'` anywhere in the engine.** The rules are general; config says which apply.
- **The engine fetching anything.** It takes observations. Corroboration is an adapter.
- **A third report form appearing.** Two, and the second is deferred.
- **Adding fields to the report schema casually.** It's a public contract now. Changing it after
  reports exist means versioning.

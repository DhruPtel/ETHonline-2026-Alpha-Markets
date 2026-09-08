# Phase 2 — status, 2026-09-08

**Authoritative unit list:** `tracking/phases/phase-2-tasks.md` (eleven units). ⚠️ `PHASE-2.md` is
the earlier plan and has a *different* fourteen-unit numbering; every brief has followed the
eleven-unit board, and the two documents disagreeing is what caused a lost afternoon on 2026-09-07.
Treat the board as live and `PHASE-2.md` as the reasoning behind it.

## Where it stands

**All eleven units are built.** Unit 11 — `agent/validate.ts`, the digit guard — landed 2026-09-08
and is wired into the report path as a warning. `docs/phase-2-summary.md` is the written account of
the phase.

The pipeline runs end to end: a directive becomes a plan that names its own documents, the plan
resolves a common block and fetches from The Graph, the engine checks the figures, the model writes a
table and a paragraph without typing a digit, and the guard says which digits it typed anyway.
Execute blocks a report whose headline figure is unreportable and publishes one whose failure is
elsewhere.

**The report format was stripped twice and the forms were removed.** `Report.form` is always `null`;
a report is now whatever the plan queried, in a table, plus one paragraph. `skills/ranking.md` and
`skills/balance-overview.md` are parked in `skills/unused/`. The engine still computes checks,
verdict, coverage, provenance and exclusions, and all of it stays in the object and inside the hash —
this was a rendering decision.

## Resolved since the last status

- ⚠️ **The Anthropic credit block is gone.** Both stripped-format proof runs failed on it on
  2026-09-07; runs have completed since and the format has been read repeatedly. Note the tail: the
  same explanation was then applied to a *different* failure days later — a garbled paragraph that a
  billing error cannot produce — and cost two days. Written up in `lessons.md`.
- **The stripped format is no longer untested.** Reports have been generated and read all week, and
  the question it existed to answer is answered: the model does have something worth reading to say
  when it is not being told what to worry about. The MakerDAO markets run chose twenty-three rows out
  of sixty-three and explained why.
- **The planner can name a document.** `DOCUMENT_BRIEF` in `graph/queries/index.ts`, and `reads` is
  required on the plan.
- **`Verdict.call` is nullable** for a metric across deployments — it used to be `slugs[0]`, and it
  is inside the hash.
- **`needs_clarification` removed.** The defaults live in `conventions.md`, loaded by both compose
  and narrate.

## Open items

| item | state |
|---|---|
| **The digit guard warns, it does not enforce** | Deliberate — see DECISIONS.md, 2026-09-08. Enforcement is a Phase 3 item and is blocked on two missing fact ids: the **market population count** and **utilization**. Rank columns are a third, smaller, undecided case |
| **`execute.ts` produces market-level facts now** | ✅ Closed. `MARKET_FIGURES` is deposits and borrows per market. ⚠️ But there is **no cap** — Morpho's 1,759 markets would be 3,518 facts in the narrator's prompt. Untested |
| **The external-reference tier cannot run on any report** | `reconcile` takes it as an observation and nothing produces one; DefiLlama is fetched in the demo only. The check says so in its own rationale |
| **morpho-blue ranks #2 by deposits despite an `unusable` verdict** | Still undecided, and the rule that raised it was parked with the ranking skill. Is inclusion-with-a-caveat right for a size ranking, or should an `unusable` deployment sit outside the table? |
| **`Report.analyst` is a caller parameter** | `config/analysts.ts` does not exist. Fine for a proof, not for a product — that address is what a leaderboard and an on-chain claim both key on |
| **No derived-ratio headline** | `HEADLINE_FIELDS` in `compose.ts` holds only balance-sheet fields, so "most leveraged" always plans as `totalBorrowBalanceUSD`. The Morpho-denominator case the ranking skill was written for has never arisen |
| **Nothing bounds cumulative figures** | morpho-blue's `cumulativeDepositUSD` reads 3.78e+23 and reaches a report unexamined. Found by the model, not by a check |
| **The Σ-markets-vs-total check has never fired** | Kept, recorded as unproven rather than counted as working |
| **A pinned-block evidence hash differed once** | Unreproduced across ~50 attempts. Open against Phase 4, not Phase 2 |
| **⚠️ `src/agent/` holds two systems that never call each other** | The report pipeline and the `ask.ts` tool-use loop. **Phase 3 forces the answer**, because a server has to expose one of them |

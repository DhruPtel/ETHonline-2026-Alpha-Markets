# Phase 2 — status, 2026-09-07

**Authoritative unit list:** `tracking/phases/phase-2-tasks.md` (eleven units). ⚠️ `PHASE-2.md` is
the earlier plan and has a *different* fourteen-unit numbering; every brief has followed the
eleven-unit board, and the two documents disagreeing is what caused a lost afternoon on 2026-09-07.
Treat the board as live and `PHASE-2.md` as the reasoning behind it.

## Where it stands

**Units 1–10 complete. Unit 11 — `agent/validate.ts` — is the only one left.**

The pipeline runs end to end: a directive becomes a plan, the plan resolves a common block and
fetches from The Graph, the engine checks the figures, and the model writes a report against a fixed
format. Compose correctly refuses what it cannot answer and defaults what it can. Execute blocks a
report whose headline figure is unreportable and publishes one whose failure is elsewhere. Narration
never types a number.

**A ranking form was added mid-phase** and is not in the original eleven — `skills/ranking.md` plus
changes to `compose`, `execute`, `narrate` and `types/report.ts`. It ranks all live deployments,
drops ones too stale to share a block, and separates figures that are not on the same scale from ones
that are merely small.

## Blocked

⚠️ **The Anthropic API account is out of credit.** Both proof runs for the stripped-back format failed
at the model call:

```
400 invalid_request_error: Your credit balance is too low to access the Anthropic API.
```

A bare one-token request fails identically, so it is not our code. `compose` and `execute` both
completed in the first run — the data layer fetched from The Graph and the engine ran — and only
narration failed. **Nothing about the pipeline is known to be broken.**

## Untested

⚠️ **The report format was stripped back on 2026-09-07 and nobody has seen the result.** A report is
now a table and up to 500 words: no verdict line, no provenance, no checks summary, no footer. The
skills went from 288 lines to 131. Everything the engine computes still lands in the `Report` object
and inside the hash — this was a rendering decision, not a change to what is computed.

The open question the change exists to answer: **does the agent have anything worth reading to say
when it is not being told what to worry about?** That needs one run of each form to judge.

## Open items

| item | state |
|---|---|
| **`execute.ts` produces no per-market facts** | Still true — `FIGURES` is protocol-level only. ⚠️ But the consequence has changed: the stripped skills no longer ask for a market table, so nothing is unsatisfiable now. It is a capability we lack rather than a promise we break |
| **morpho-blue ranks #2 by deposits despite an `unusable` verdict** | Undecided. The old skill said the headline names only what we can stand behind and the rule did not fire; the new skill does not carry that rule at all. Needs a decision: is inclusion-with-a-caveat right for a size ranking, or should an `unusable` deployment sit outside the table? |
| **`Report.analyst` is a caller parameter** | `config/analysts.ts` does not exist. Fine for a proof, not for a product — that address is what a leaderboard and an on-chain claim both key on |
| **The Morpho-denominator case is untested** | Root cause found: `HEADLINE_FIELDS` in `compose.ts` holds only balance-sheet fields and no derived ratio, so utilization cannot be expressed as a metric. "Most leveraged" always plans as `totalBorrowBalanceUSD`, which is comparable, so the case the ranking skill is written for never arises |
| **The eight-market rule was cut** | Measured (top 8 covers 85–98% of every deployment's book) and then removed with the rest of the skill. Bring it back if a report ever needs a market table |
| **A pinned-block evidence hash differed once** | Unreproduced across ~50 attempts since. Recorded in `lessons.md`; needs a real answer before settlement depends on it |

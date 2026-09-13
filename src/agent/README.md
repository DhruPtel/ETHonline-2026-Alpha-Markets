# agent — directive in, report out

**Answers: The Graph — AI tooling.** A plain-English directive becomes a report in which every
figure traces to a Graph query at a named block. Two model calls, with deterministic code between
them, do the work.

| file | what it does | model calls |
|---|---|---|
| `context.ts` | Builds the planning context from the analyst's last five settled, graded claims (rehearsals and past-posted markets excluded), one line each. A digest of what the planner saw is stored beside the report as `context_digest`, outside the hash. | 0 |
| `compose.ts` | Directive plus context becomes a `ReportPlan`: which deployments, which documents, which metric. Picks from the document registry, never writes GraphQL, reads no data. | 1 |
| `execute.ts` | Runs the plan. Finds one block the whole set can share or refuses; fetches, runs the engine's checks and corroboration, and assembles the `Report`. Needs `ETHEREUM_RPC_URL` for the block's timestamp. | 0 |
| `narrate.ts` | Draft becomes one table and one paragraph, written in `{fact:ID}` placeholders; `render()` substitutes the values. The output is watched while it streams. | 1, and a second only on retry |
| `validate.ts` | The digit guard: flags any digit in the prose that is not inside a placeholder. ⚠️ **It warns; it does not block.** | 0 |
| `loop.ts`, `tools.ts` | The interactive agent behind `scripts/ask.ts`: a tool loop over `run_document` and `get_capabilities`. **Not on the report path.** | one per turn |
| `skills/` | Prompt material. `report.md` shapes the narrator; `conventions.md` is loaded by both compose and narrate; `skills/unused/` is parked. | — |

**Entry points:** `scripts/ops/report.ts "<directive>"` on the command line, and
`POST /api/console/generate`, which streams each stage to `/console`. Both run context → compose →
execute → narrate → validate → save.

## Why a figure cannot be invented

The narrator is handed a fact table and can only refer to a figure as `{fact:ID}`. Code fills in the
values. A number the data layer did not fetch has no id, so it cannot appear. The digit guard then
flags any figure the model wrote as text anyway.

## Narration failures are caught, not saved

- An attempt that streams nothing for 20 seconds is aborted, and so is a visible runaway (a long
  whitespace run, or an oversized title or summary).
- A summary under 200 characters is rejected as filler.
- A failed attempt is retried once. A second failure is an error, and nothing is saved.

⚠️ This catches the narrator's intermittent failure at the assessment. It does not cure it.

## The feedback loop is text, not training

No weights change. `context.ts` puts a few hundred characters describing recent graded claims into
the planning prompt, rebuilt from the database for each report. The model sees *what* it got wrong,
not *why*. A voided market is shown as `VOID (no outcome)`, never as a wrong call. `/analyst` shows
the block verbatim.

# tracking — how this was built

The working record: what happened, in order, and why. The product itself is documented in the root
README and `docs/`.

| file | what it is |
|---|---|
| `logs.md` | Appended after every run of work: what was made, why, and what was surprising. The fullest account of who did what, and **the AI-attribution record**. |
| `DECISIONS.md` | Choices that would mean rewriting to undo. Each gives the date, the choice, what it gives up, the alternative rejected, and what it affects. |
| `lessons.md` | Where reality disagreed with the plan: what we expected, what happened, what changed. |
| `smoke-results.md` | Phase 0: nine isolated tests, each against a real service. Eight pass and one is partial. |
| `phases/` | The plan for each phase, written before that phase was built. |

## phases/

| file | phase |
|---|---|
| `PHASE-1.md`, `phase-1-tasks.md` | 1 · the data layer and the agent's tools |
| `PHASE-2.md`, `phase-2-tasks.md`, `PHASE-2-status.md` | 2 · report building: plan, execute, narrate, validate |
| `PHASE-3.md` | 3 · reports persist, tokenize on Hedera, and sell over x402 |
| `PHASE-4-draft.md`, `PHASE-4-attachment.md`, `PHASE-4.md` | 4 · the prediction market on Arc |
| `PHASE-5.md` | 5 · the frontend |
| `PHASE-6.md` | 6 · wiring the frontend to live data |
| `PHASE-7.md` | 7 · the feedback loop made visible: scoring, `/analyst`, the planning context |
| `PHASE-8-demo-market.md` | 8 · demo markets, so the loop can be played in minutes |

⚠️ **These are plans, not status.** Not every one was updated after its phase:

- The status tables in PHASE-4, -5 and -6 still mark units as not started that were built.
- PHASE-8 plans a `/demo` page. The demo landed as a section of `/markets`, and `/demo` returns 404.

Where a plan and the code disagree, the code is right. `logs.md` records what actually landed.

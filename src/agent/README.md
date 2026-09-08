# agent — two paths, not one

⚠️ **This directory holds two independent things that never call each other.**

## 1 · The report pipeline

Deterministic code with a model call at each end: `compose.ts` → `execute.ts` → `narrate.ts`

- **`compose.ts`** (234) — a directive becomes a plan. One model call, no data read. Picks documents
  from a registry and names deployments; never writes GraphQL, and never asks a question back.
- **`execute.ts`** (359) — runs the plan. Resolves one block the set can share, fetches, runs the
  engine, assembles the `Report` object. **No model call.** The spine of the system.
- **`narrate.ts`** (230) — the second model call. Returns one table and one paragraph in `{fact:ID}`
  placeholders it *cannot fill itself*; `render()` substitutes the values, which is what makes an
  invented figure impossible rather than unlikely.

## 2 · The interactive agent

A different path, used by `scripts/ask.ts`:

- **`loop.ts`** (107) — `while (stop_reason === 'tool_use')`. Owns neither the conversation nor the
  tool list.
- **`tools.ts`** (111) — the two tools it may call: `run_document` and `get_capabilities`.

⚠️ These are **not** part of the report pipeline. `execute.ts` does not use them, and `compose` and
`narrate` each make their own direct API call rather than going through `loop`. The only thing the
two paths share is the `MODEL` constant, which lives in `loop.ts` for historical reasons. Whether
they converge is an open question for Phase 3 — see `tracking/lessons.md`.

## skills/

Markdown loaded into the prompts. `report.md` shapes the narrator's output; `conventions.md` is
loaded by **both** compose and narrate, so a report cannot declare a reading its own plan never
took. `skills/unused/` is parked, not loaded.

## Logic vs scaffolding

Logic is `execute`, `compose`, `narrate`. `loop` and `tools` are small and support the demo path.

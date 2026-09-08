# agent — the pipeline is the product; the loop is a demo surface

This directory holds two things that never call each other. ⚠️ **That is decided, not pending.** The
question was open in `tracking/lessons.md` on 2026-09-07 — *does the report pipeline eventually run
through `loop.ts`, or is `scripts/ask.ts` a separate product with its own path?* — and Phase 3
answered it, because a server has to expose one of them.

**The report pipeline is the product.** `loop.ts` and `tools.ts` are the demo surface behind
`scripts/ask.ts`, they are not on the report path, and they stay exactly as they are.

⚠️ **The split is named rather than restructured, and that is also the decision.** Moving `loop.ts`
and `tools.ts` into their own directory would cost eight import sites plus every demo, days before a
deadline, to buy legibility this paragraph buys for nothing. Nobody should read the imports and infer
an answer; the answer is here.

## 1 · The report pipeline — the product

Deterministic code with one model call at each end: `compose.ts` → `execute.ts` → `narrate.ts`, then
`validate.ts` over the result.

- **`compose.ts`** (234) — a directive becomes a plan. One model call, no data read. Picks documents
  from a registry and names deployments; never writes GraphQL, and never asks a question back.
- **`execute.ts`** (359) — runs the plan. Resolves one block the set can share, fetches, runs the
  engine, assembles the `Report` object. **No model call.** The spine of the system. Takes an
  `analystId` and resolves it through `config/analysts.ts`; an unregistered analyst throws before any
  query.
- **`narrate.ts`** (230) — the second model call. Returns one table and one paragraph in `{fact:ID}`
  placeholders it *cannot fill itself*; `render()` substitutes the values, which is what makes an
  invented figure impossible rather than unlikely.
- **`validate.ts`** (125) — the digit guard. Rejects any digit in narration text that is not inside a
  `{fact:ID}` placeholder, with an allowlist derived from the report's own facts, slugs and block
  rather than hardcoded. ⚠️ **It warns; it does not block** — deliberately, and `tracking/DECISIONS.md`
  ("The digit guard warns in Phase 2 and enforces in Phase 3") records what enforcement waits on.
  Pure: a `Report` in, violations out, and it never repairs.

## 2 · The interactive agent — the demo surface

A different path, used only by `scripts/ask.ts` and two demos:

- **`loop.ts`** (107) — `while (stop_reason === 'tool_use')`. Owns neither the conversation nor the
  tool list.
- **`tools.ts`** (111) — the two tools it may call: `run_document` and `get_capabilities`.

⚠️ These are **not** part of the report pipeline and nothing on it imports them. `execute.ts` does not
use `tools.ts`, and `compose` and `narrate` each open their own `client.messages` call rather than
going through `loop`.

**They stay because they earn their place.** `ask.ts` is how you watch the data layer answer a
plain-English question, and it is where the refusal path was first observed firing in the wild. It is
a demonstration, not a product surface, and Phase 3's server exposes the pipeline instead.

## What the two halves share: nothing

They used to share one thing — the `MODEL` constant, which lived in `loop.ts` while the only files
importing it were `compose.ts` and `narrate.ts`, both on the pipeline side. ⚠️ **Moved to
`config/model.ts` on 2026-09-08.** That also removed a dependency edge pointing the wrong way:
`config/analysts.ts` reached into `agent/loop.ts` for it, while `agent/execute.ts` imports
`config/analysts.ts`.

## skills/

Markdown loaded into the prompts. `report.md` shapes the narrator's output; `conventions.md` is
loaded by **both** compose and narrate, so a report cannot declare a reading its own plan never
took. `skills/unused/` is parked, not loaded.

## Logic vs scaffolding

Logic is `execute`, `compose`, `narrate`, `validate`. `loop` and `tools` are small and support the
demo path.

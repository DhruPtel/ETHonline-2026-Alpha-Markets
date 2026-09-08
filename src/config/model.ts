// Which Claude model this build calls.
//
// ⚠️ **Moved out of `agent/loop.ts` on 2026-09-08, and the old location was backwards.** `loop.ts`
// is the tool-use loop behind `scripts/ask.ts` — a demo surface. The two files that imported `MODEL`
// from it, `compose.ts` and `narrate.ts`, are both in the report pipeline, which never calls the
// loop. So the product half depended on the demo half for one constant, and that was the only
// coupling between them. See `src/agent/README.md`.
//
// ⚠️ **It also fixed a dependency edge pointing the wrong way.** `config/analysts.ts` imports this
// for an analyst row's `model`, and it used to reach into `agent/loop.ts` to get it — while
// `agent/execute.ts` imports `config/analysts.ts`. Config depending on agent while agent depends on
// config is a direction you do not want to discover later; now config depends on nothing.
//
// ── Why its own file rather than a row in an existing config module ──────────────────────────────
//
// `protocols.ts` is the deployment table and `analysts.ts` is the analyst table. A model name is
// neither, and `src/config/` is one concern per file. `analysts.ts` is the closest fit because it
// consumes this — but an analyst's `model` and the platform's default `MODEL` are two ideas that
// happen to share a value today: the row says *which model this analyst runs*, and separate analysts
// running separate models is the premise of the whole product. Defining the default inside the table
// that may one day disagree with it is how they stop being distinguishable.

/**
 * ⚠️ The default, not a per-analyst choice. `AnalystConfig.model` is where a per-analyst answer
 * lives, and it seeds from this today. `compose` and `narrate` call this constant directly, which is
 * correct while there is one analyst and is the thing to revisit when there are two.
 */
export const MODEL = 'claude-sonnet-5';

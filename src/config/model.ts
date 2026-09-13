// Which Claude model this build calls.
//
// ⚠️ **Moved out of `agent/loop.ts` on 2026-09-08, and the old location was backwards.** `loop.ts`
// is the tool-use loop behind `scripts/ask.ts` — a demo surface — yet `compose.ts` and `narrate.ts`,
// the report pipeline, which never calls the loop, imported `MODEL` from it. That one constant was
// the only coupling between the product half and the demo half.
//
// ⚠️ **It also fixed a dependency edge pointing the wrong way.** `config/analysts.ts` imports this for
// an analyst row's `model` and used to reach into `agent/loop.ts` for it, while `agent/execute.ts`
// imports `config/analysts.ts`. Config no longer depends on agent.
//
// Its own file rather than a row in `analysts.ts`: an analyst's `model` and the platform's default
// `MODEL` share a value today but are two ideas. The row says *which model this analyst runs*, and
// separate analysts running separate models is the premise of the product; defining the default
// inside the table that may one day disagree with it is how they stop being distinguishable.

/**
 * ⚠️ The default, not a per-analyst choice. `AnalystConfig.model` is where a per-analyst answer
 * lives, and it seeds from this today. `compose`, `narrate` and `loop` import this constant directly,
 * which is correct while there is one analyst and is the thing to revisit when there are two.
 */
export const MODEL = 'claude-sonnet-5';

// The tool-use loop, promoted from SM-06. A `while` over `stop_reason === "tool_use"`, not a
// framework — SM-06 closed in two turns and nothing about that run asked for more machinery.
//
// ⚠️ **It does not own the conversation.** `messages[]` goes in and comes back out. Vercel Hobby
// gives 300 seconds and one invocation is one model turn (PLAN-v4 §9), so a real report — several
// queries across several deployments, then reasoning — cannot fit in a single call. The caller
// persists the conversation between turns and a resumed turn replays stored observations rather
// than re-querying. There is no persistence layer yet; this is the shape it needs.
//
// ⚠️ **It does not define tools.** Definitions and an executor are parameters, so `tools.ts`
// (Unit 13) can change the menu without touching the loop.

import Anthropic from '@anthropic-ai/sdk';
import { MODEL } from '../config/model.js';

// ⚠️ `MODEL` used to be DEFINED here and is now imported. It moved to `config/model.ts` on
// 2026-09-08 because the report pipeline imported it from this file, and the pipeline does not
// use this file for anything else. It is not re-exported: importers take it from config.

/** Why the loop returned. ⚠️ A loop that stops silently is indistinguishable from one that finished. */
export type StopReason = 'answered' | 'budget' | 'error';

export interface Budget {
  /** Model turns. One turn is one request to the API. */
  readonly maxTurns: number;
  readonly maxToolCalls: number;
  /** Input + output across every turn. A runaway agent costs real money. */
  readonly maxTokens: number;
  readonly maxWallClockMs: number;
}
export const DEFAULT_BUDGET: Budget = { maxTurns: 12, maxToolCalls: 30, maxTokens: 400_000, maxWallClockMs: 240_000 };

export interface LoopResult {
  readonly stopReason: StopReason;
  /** The full conversation, for persisting and resuming. */
  readonly messages: Anthropic.MessageParam[];
  readonly answer: string | null;
  readonly turns: number;
  readonly toolCalls: number;
  readonly tokens: number;
  readonly elapsedMs: number;
  /** Set when `stopReason` is `budget` or `error`. */
  readonly detail: string | null;
}

export type ToolExecutor = (name: string, input: unknown) => Promise<string>;

export interface LoopOptions {
  readonly client: Anthropic;
  readonly tools: Anthropic.Tool[];
  readonly execute: ToolExecutor;
  readonly messages: Anthropic.MessageParam[];
  readonly system?: string;
  readonly budget?: Partial<Budget>;
  readonly onStep?: (step: { turn: number; kind: 'tool' | 'answer'; name?: string; input?: unknown; result?: string; text?: string }) => void;
}

export async function runLoop(opts: LoopOptions): Promise<LoopResult> {
  const budget = { ...DEFAULT_BUDGET, ...opts.budget };
  const messages = [...opts.messages];
  const started = Date.now();
  let turns = 0, toolCalls = 0, tokens = 0;

  const done = (stopReason: StopReason, answer: string | null, detail: string | null): LoopResult =>
    ({ stopReason, messages, answer, turns, toolCalls, tokens, elapsedMs: Date.now() - started, detail });

  while (true) {
    // Every bound is checked before spending, not after. Turns alone would let a single turn
    // making thirty tool calls run past every other limit.
    if (turns >= budget.maxTurns) return done('budget', null, `turn limit ${budget.maxTurns} reached`);
    if (toolCalls >= budget.maxToolCalls) return done('budget', null, `tool-call limit ${budget.maxToolCalls} reached`);
    if (tokens >= budget.maxTokens) return done('budget', null, `token limit ${budget.maxTokens} reached (used ${tokens})`);
    const elapsed = Date.now() - started;
    if (elapsed >= budget.maxWallClockMs) return done('budget', null, `wall clock ${budget.maxWallClockMs}ms reached`);

    let response: Anthropic.Message;
    try {
      response = await opts.client.messages.create({
        model: MODEL, max_tokens: 8000, tools: opts.tools, messages,
        ...(opts.system ? { system: opts.system } : {}),
      });
    } catch (err) {
      return done('error', null, (err as Error).message);
    }
    turns++;
    tokens += response.usage.input_tokens + response.usage.output_tokens;

    if (response.stop_reason !== 'tool_use') {
      const answer = response.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('\n').trim();
      messages.push({ role: 'assistant', content: response.content });
      opts.onStep?.({ turn: turns, kind: 'answer', text: answer });
      return done('answered', answer || null, null);
    }

    messages.push({ role: 'assistant', content: response.content });
    const uses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const use of uses) {
      toolCalls++;
      // A tool that throws is a result the model can react to, not the end of the run — it may
      // reasonably try a different deployment or a different document.
      let result: string;
      try { result = await opts.execute(use.name, use.input); }
      catch (err) { result = JSON.stringify({ error: (err as Error).message }); }
      opts.onStep?.({ turn: turns, kind: 'tool', name: use.name, input: use.input, result });
      results.push({ type: 'tool_result', tool_use_id: use.id, content: result });
    }
    messages.push({ role: 'user', content: results });
  }
}

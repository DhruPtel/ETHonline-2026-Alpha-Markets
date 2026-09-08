// Unit 13's proof — and Phase 1's. A plain-English question spanning three deployments, read at
// one common block, answered with every flag intact. Then a protocol we do not have.
import Anthropic from '@anthropic-ai/sdk';
import { runLoop } from '../../src/agent/loop.js';
import { TOOLS, execute } from '../../src/agent/tools.js';
import { PROTOCOLS } from '../../src/config/protocols.js';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const SYSTEM = `You are a lending-protocol analyst. Configured deployments: ${PROTOCOLS.filter((p) => p.status === 'live').map((p) => p.slug).join(', ')}.
Use get_capabilities before quoting a figure you are unsure of, and run_document to read data. A null figure means unavailable for that deployment — say so and never report it as zero, and never estimate around it. Cite the block.`;

const step = (s: { turn: number; kind: string; name?: string; input?: unknown; result?: string; text?: string }) => {
  if (s.kind === 'tool') {
    console.log(`  turn ${s.turn} · ${s.name}(${JSON.stringify(s.input).slice(0, 120)})`);
    console.log(`         ↳ ${s.result!.slice(0, 180)}${s.result!.length > 180 ? '…' : ''}`);
  } else console.log(`  turn ${s.turn} · answered (${s.text?.length ?? 0} chars)`);
};

for (const [label, question] of [
  ['spanning three deployments', 'Compare deposits and revenue across aave-v3-ethereum, compound-v2-ethereum and spark-lend-ethereum. Which has the most deposits, and what can you say about revenue for each?'],
  ['a protocol we do not have', "What are Uniswap's total deposits?"],
] as const) {
  console.log(`\n${'═'.repeat(78)}\n${label}\n  asked: ${question}\n`);
  const r = await runLoop({ client, tools: TOOLS, execute, system: SYSTEM, messages: [{ role: 'user', content: question }], onStep: step });
  console.log(`\n  ${r.stopReason} · ${r.turns} turns · ${r.toolCalls} tool calls · ${r.tokens} tokens · ${r.elapsedMs}ms`);
  console.log(`\n─── answer ───\n${r.answer}\n`);
}

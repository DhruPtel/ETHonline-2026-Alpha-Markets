// Ask the agent something, and watch it work.
//
//   npx tsx --env-file=.env scripts/ask.ts "which protocol has the most deposits?"
//
// Nothing new here — this is `loop.ts` and `tools.ts` wired to a command line.
import Anthropic from '@anthropic-ai/sdk';
import { runLoop } from '../src/agent/loop.js';
import { MODEL } from '../src/config/model.js';
import { TOOLS, execute } from '../src/agent/tools.js';
import { PROTOCOLS } from '../src/config/protocols.js';

const question = process.argv.slice(2).join(' ').trim();
if (!question) {
  console.error('Usage: npx tsx --env-file=.env scripts/ask.ts "your question"');
  console.error('\nExamples:');
  console.error('  "which protocol has the most deposits?"');
  console.error('  "compare aave-v3 and spark-lend — can I trust their revenue?"');
  console.error('  "what can you tell me about morpho-blue?"');
  process.exit(1);
}
for (const key of ['ANTHROPIC_API_KEY', 'GRAPH_API_KEY']) {
  if (!process.env[key]?.trim()) { console.error(`${key} is not set. Copy .env.example to .env and fill it in.`); process.exit(1); }
}

const live = PROTOCOLS.filter((p) => p.status === 'live');
const SYSTEM = `You are a lending-protocol analyst working from live Graph data. Configured deployments: ${live.map((p) => p.slug).join(', ')}.

Use get_capabilities before quoting a figure you are unsure of, and run_document to read data. Pass every deployment you want to compare in a single run_document call so they are read at one common block.

A null figure means unavailable for that deployment — say so, never report it as zero, and never estimate around it. Cite the block you read at.`;

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + `… (+${s.length - n})` : s);

console.log(`\nmodel   ${MODEL}`);
console.log(`live    ${live.length} deployments · ${new Set(live.map((p) => p.liveSchemaVersion)).size} schema versions`);
console.log(`asked   ${question}\n`);

const started = Date.now();
const result = await runLoop({
  client: new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }),
  tools: TOOLS,
  execute,
  system: SYSTEM,
  messages: [{ role: 'user', content: question }],
  onStep: (s) => {
    const t = `${((Date.now() - started) / 1000).toFixed(1)}s`.padStart(6);
    if (s.kind === 'tool') {
      console.log(`${t}  turn ${s.turn} · ${s.name}`);
      console.log(`        args ${clip(JSON.stringify(s.input), 200)}`);
      console.log(`        ↳    ${clip(s.result ?? '', 300)}`);
    } else console.log(`${t}  turn ${s.turn} · answered`);
  },
});

console.log(`\n${'─'.repeat(78)}\n${result.answer ?? '(no answer)'}\n${'─'.repeat(78)}`);
console.log(`${result.stopReason}${result.detail ? ` — ${result.detail}` : ''} · ${result.turns} turns · ${result.toolCalls} tool calls · ${result.tokens.toLocaleString()} tokens · ${(result.elapsedMs / 1000).toFixed(1)}s\n`);
if (result.stopReason !== 'answered') process.exit(1);

// Unit 7's proof. The same question, once without the skills and once with, so the shaping is
// visible rather than asserted.
import { readFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { runLoop, MODEL } from '../../src/agent/loop.js';
import { TOOLS, execute } from '../../src/agent/tools.js';
import { PROTOCOLS } from '../../src/config/protocols.js';

const skill = (n: string) => readFileSync(new URL(`../../src/agent/skills/${n}.md`, import.meta.url), 'utf8');
const live = PROTOCOLS.filter((p) => p.status === 'live').map((p) => p.slug).join(', ');
const BASE = `You are a lending-protocol analyst working from live Graph data. Configured deployments: ${live}.
Use get_capabilities before quoting a figure you are unsure of, and run_document to read data. Pass every deployment you want to compare in a single run_document call so they are read at one common block.`;
const WITH_SKILLS = `${BASE}\n\n---\n\n${skill('conventions')}\n\n---\n\n${skill('balance-overview')}`;

const QUESTION = 'Write a balance overview comparing aave-v3-ethereum, morpho-blue and compound-v2-ethereum.';
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

for (const [label, system] of [['WITHOUT the skills', BASE], ['WITH the skills', WITH_SKILLS]] as const) {
  console.log(`\n${'═'.repeat(78)}\n${label}  (system prompt ${system.length.toLocaleString()} chars)\n${'═'.repeat(78)}\n`);
  const r = await runLoop({ client, tools: TOOLS, execute, system, messages: [{ role: 'user', content: QUESTION }] });
  console.log(r.answer);
  console.log(`\n[${r.stopReason} · ${r.turns} turns · ${r.toolCalls} tool calls · ${r.tokens.toLocaleString()} tokens · ${r.answer?.length ?? 0} chars]`);
}
console.log(`\nmodel ${MODEL}\n`);
// ⚠️ Node can exit before a large piped stdout has drained. The first run of this script lost the
// second answer entirely — it printed a header and stopped, which read like a model failure and was
// not one. Wait for the stream to flush before returning.
await new Promise<void>((r) => process.stdout.write('', () => r()));

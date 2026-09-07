// Unit 12's proof. A plain-English question, a real tool against the real data layer, and a
// budget that stops the loop honestly.
import Anthropic from '@anthropic-ai/sdk';
import { runLoop, MODEL } from '../src/agent/loop.js';
import { querySubgraph } from '../src/graph/client.js';
import { adapt } from '../src/graph/adapter.js';
import { BALANCE_SHEET, type BalanceSheetResult } from '../src/graph/queries/index.js';
import { PROTOCOLS } from '../src/config/protocols.js';

// A trivial stand-in for Unit 13's menu — one tool, so the loop has something real to call.
const TOOL: Anthropic.Tool = {
  name: 'run_document',
  description: 'Run the balance-sheet document against one configured lending deployment and return its figures, with unavailable figures withheld rather than rendered.',
  input_schema: { type: 'object', properties: { slug: { type: 'string', description: 'deployment slug from config' } }, required: ['slug'] },
};

const execute = async (name: string, input: unknown) => {
  if (name !== 'run_document') return JSON.stringify({ error: `unknown tool ${name}` });
  const { slug } = input as { slug: string };
  const res = await querySubgraph<BalanceSheetResult>(slug, BALANCE_SHEET);
  const { computed, findings } = adapt({
    slug, protocol: res.data.lendingProtocols[0]!, meta: res.meta,
    provenance: { deployment: res.meta.deployment, block: res.meta.blockNumber, timestamp: res.fetchedAt, document: 'balance-sheet', variables: {} },
  });
  return JSON.stringify({
    slug, block: computed.block, revenueAvailability: computed.revenue,
    figures: Object.fromEntries(Object.entries(computed.figures).map(([k, v]) => [k, v.value])),
    findings: findings.map((f) => `${f.severity}: ${f.rationale}`),
  });
};

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const SYSTEM = `You are a lending-protocol analyst. Configured deployments: ${PROTOCOLS.filter((p) => p.triageVerdict).map((p) => p.slug).join(', ')}. Use run_document to get figures. A null figure means unavailable for that deployment — say so, never report it as zero.`;
const QUESTION = "Compare Aave v3 and Compound v3 on Ethereum. Which is larger by deposits, and what's the utilization on each? Also tell me their revenue if you can.";

const step = (s: { turn: number; kind: string; name?: string; input?: unknown; result?: string; text?: string }) => {
  if (s.kind === 'tool') {
    console.log(`  turn ${s.turn} · tool  ${s.name}(${JSON.stringify(s.input)})`);
    console.log(`           ↳ ${s.result!.slice(0, 150)}${s.result!.length > 150 ? '…' : ''}`);
  } else console.log(`  turn ${s.turn} · answer (${s.text?.length ?? 0} chars)`);
};

console.log(`\nmodel   ${MODEL}`);
console.log(`asked   ${QUESTION}\n`);
const r = await runLoop({ client, tools: [TOOL], execute, system: SYSTEM, messages: [{ role: 'user', content: QUESTION }], onStep: step });
console.log(`\n  stopReason ${r.stopReason} · ${r.turns} turns · ${r.toolCalls} tool calls · ${r.tokens} tokens · ${r.elapsedMs}ms`);
console.log(`\n─── answer ───\n${r.answer}\n`);

console.log('\n═══ the same run with maxTurns: 1 ═══\n');
const capped = await runLoop({ client, tools: [TOOL], execute, system: SYSTEM, messages: [{ role: 'user', content: QUESTION }], budget: { maxTurns: 1 }, onStep: step });
console.log(`\n  stopReason ${capped.stopReason} · detail: ${capped.detail}`);
console.log(`  answer     ${capped.answer === null ? 'null — it does not pretend to be done' : capped.answer.slice(0, 60)}`);
console.log(`  messages   ${capped.messages.length} handed back, so the caller can resume rather than restart\n`);

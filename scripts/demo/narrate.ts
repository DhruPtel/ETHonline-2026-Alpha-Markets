// Unit 10's proof. compose → execute → narrate, end to end, and read the memo.
import Anthropic from '@anthropic-ai/sdk';
import { compose } from '../../src/agent/compose.js';
import { execute, type ExecuteState } from '../../src/agent/execute.js';
import { narrate, render } from '../../src/agent/narrate.js';
import { reportHash } from '../../src/domain/canonical.js';
import { figureRef } from '../../src/engine/invariants.js';
import type { Report, ReportPlan } from '../../src/types/report.js';

const ANALYST = '0x1b7035bbe0da8f3bcb721863d42e1079e4a116a7';
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
// Either a named mode, or a directive in plain English.
const MODES = ['memo', 'stability', 'withheld', 'morpho'] as const;
const arg = process.argv.slice(2).join(' ').trim();
const mode = (MODES as readonly string[]).includes(arg) ? arg : arg ? 'memo' : 'memo';
const DIRECTIVE = (MODES as readonly string[]).includes(arg) || !arg
  ? 'Balance overview for Aave v3 on Ethereum — how big is it and can I trust the figures?'
  : arg;

const manualPlan = (directive: string, slugs: string[], hs: string, hf: string): ReportPlan => ({
  subject: { directive, deployments: slugs, headline: figureRef(hs, hf) },
  reads: [{ documentId: 'balance-sheet', slugs, variables: {} }, { documentId: 'markets', slugs, variables: {} }],
  checks: ['internal-consistency', 'chain-corroboration', 'market-population'],
  rationale: 'fixed plan for the proof',
});

type Done = { ok: true; block: number; report: Report; hash: string };
type NotDone = { ok: false; status: string };
async function run(plan: ReportPlan, block?: number): Promise<Done | NotDone> {
  const state: ExecuteState = { plan, analyst: ANALYST, ...(block ? { block } : {}) };
  const ex = await execute(state);
  if (ex.status !== 'completed') return { ok: false, status: ex.status };
  const report = await narrate(ex.draft, client);
  return { ok: true, block: ex.draft.block, report, hash: reportHash(report) };
}

if (mode === 'memo') {
  console.log(`\ndirective: ${DIRECTIVE}\n`);
  const c = await compose(DIRECTIVE, client);
  if (!c.ok) {
    console.log(`needs_clarification — missing: ${c.clarification.missing.join(', ')}\n`);
    console.log(c.clarification.reason);
    for (const sug of c.clarification.suggestions) console.log(`\n  try: "${sug}"`);
    process.exit(1);
  }
  console.log(`plan: headline ${c.plan.subject.headline} · checks ${c.plan.checks.join(', ')}\n`);
  const r = await run(c.plan);
  if (!r.ok) { console.log(r.status); process.exit(1); }
  console.log(render(r.report, r.hash));
}

if (mode === 'stability') {
  const plan = manualPlan('Balance overview for Aave v3.', ['aave-v3-ethereum'], 'aave-v3-ethereum', 'totalDepositBalanceUSD');
  const first = await run(plan);
  if (!first.ok) process.exit(1);
  const done: Done[] = [first];
  for (let i = 0; i < 3; i++) { const r = await run(plan, first.block); if (r.ok) done.push(r); }
  console.log(`${done.length} runs of the same directive, all at block ${first.block}\n`);
  console.log('run  sections                                     conf    chars  hash');
  for (const [i, r] of done.entries()) {
    const ids = r.report.sections.map((s) => s.id).join(',');
    const chars = r.report.sections.flatMap((s) => s.paragraphs).map((p) => p.text).join('').length;
    console.log(`${i + 1}    ${ids.padEnd(44)}${r.report.assessment.confidence.padEnd(8)}${String(chars).padEnd(7)}${r.hash.slice(0, 10)}…`);
  }
  const structures = new Set(done.map((r) => r.report.sections.map((s) => s.id).join(',')));
  const texts = new Set(done.map((r) => JSON.stringify(r.report.sections)));
  console.log(`\ndistinct section structures: ${structures.size} ${structures.size === 1 ? '✅ locked' : '⛔ varies'}`);
  console.log(`distinct wordings:           ${texts.size} ${texts.size === done.length ? '✅ free' : '(some identical)'}`);
}

if (mode === 'withheld') {
  const r = await run(manualPlan('Report compound-v3 borrowing on Ethereum.', ['compound-v3-ethereum'], 'compound-v3-ethereum', 'totalBorrowBalanceUSD'));
  if (!r.ok) { console.log(r.status); process.exit(1); }
  console.log(render(r.report, r.hash));
}

if (mode === 'morpho') {
  const r = await run(manualPlan('Balance overview for Morpho Blue.', ['morpho-blue'], 'morpho-blue', 'totalDepositBalanceUSD'));
  if (!r.ok) { console.log(r.status); process.exit(1); }
  console.log(render(r.report, r.hash));
}
await new Promise<void>((res) => process.stdout.write('', () => res()));

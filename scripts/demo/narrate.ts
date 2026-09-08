// Unit 10's proof. compose → execute → narrate, end to end, and read the memo.
import Anthropic from '@anthropic-ai/sdk';
import { compose } from '../../src/agent/compose.js';
import { execute, type ExecuteState, type Timings } from '../../src/agent/execute.js';
import { narrate, render } from '../../src/agent/narrate.js';
import { validate } from '../../src/agent/validate.js';
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
  checks: ['chain-corroboration'],
  rationale: 'fixed plan for the proof',
});

type Done = { ok: true; block: number; report: Report; hash: string };
type NotDone = { ok: false; status: string };

// ── Timing ───────────────────────────────────────────────────────────────────────────────────────
// Measured, not optimised. The question this answers is only "where did the time go", and the
// answer that matters is whether it is the two model calls (expected, nothing to switch off) or
// the data layer (a knob worth finding).
type Stage = { executeMs: number; narrateMs: number; queries: number; t: Timings };
const stages: Stage[] = [];
let composeMs = 0;

async function run(plan: ReportPlan, block?: number): Promise<Done | NotDone> {
  const state: ExecuteState = { plan, analyst: ANALYST, ...(block ? { block } : {}) };
  const ex = await execute(state);
  if (ex.status !== 'completed') return { ok: false, status: ex.status };
  const tNarrate = Date.now();
  const report = await narrate(ex.draft, client);
  stages.push({ executeMs: ex.elapsedMs, narrateMs: Date.now() - tNarrate, queries: ex.queries, t: ex.timings });
  return { ok: true, block: ex.draft.block, report, hash: reportHash(report) };
}

/**
 * Render, then report what the digit guard found — ⚠️ **as a warning, never a refusal.**
 *
 * The report prints in full first and nothing is withheld on a violation. See DECISIONS.md, "The
 * digit guard warns in Phase 2 and enforces in Phase 3": a utilization computed from two figures
 * this pipeline actually fetched is arithmetic on Graph data, and refusing it today would fail every
 * report for something we do not yet consider broken.
 */
function present(report: Report, hash: string) {
  console.log(render(report, hash));
  const violations = validate(report);
  if (!violations.length) { console.log('digit guard: ✅ clean — every figure in the text traces to a fact\n'); return; }
  console.log(`digit guard: ⚠️  ${violations.length} violation(s) — the report above is printed anyway\n`);
  // Capped, not filtered. A ranking's rank column alone produces ten violations and would bury the
  // percentages underneath them; nothing is suppressed by kind, only by position.
  for (const v of violations.slice(0, 10)) console.log(`  [${v.kind}] ${v.where}: ${v.detail}`);
  if (violations.length > 10) console.log(`  … and ${violations.length - 10} more`);
  console.log();
}

const ms = (n: number) => `${n.toLocaleString('en-US')} ms`;
const row = (label: string, v: number) => console.log(`  ${label.padEnd(28)}${ms(v).padStart(11)}`);

function printTiming() {
  if (!stages.length && !composeMs) return;
  console.log('\ntiming');
  if (composeMs) row('compose (model)', composeMs);
  for (const [i, s] of stages.entries()) {
    const tag = stages.length > 1 ? ` [run ${i + 1}]` : '';
    row(`execute${tag}`, s.executeMs);
    row(`  fetch · ${s.queries} queries`, s.t.fetchMs);
    row(s.t.corroborateCalls ? `  corroboration · ${s.t.corroborateCalls} deployment(s)` : '  corroboration · did not run', s.t.corroborateMs);
    row('  engine checks', s.t.engineMs);
    row('  block resolution', s.t.blockMs);
    row(`narrate (model)${tag}`, s.narrateMs);
  }
  const model = composeMs + stages.reduce((a, s) => a + s.narrateMs, 0);
  const total = composeMs + stages.reduce((a, s) => a + s.executeMs + s.narrateMs, 0);
  console.log(`  ${'-'.repeat(39)}`);
  row('total', total);
  console.log(`  ${'model calls'.padEnd(28)}${`${Math.round((model / total) * 100)}%`.padStart(11)}`);
}

if (mode === 'memo') {
  console.log(`\ndirective: ${DIRECTIVE}\n`);
  const tCompose = Date.now();
  const c = await compose(DIRECTIVE, client);
  composeMs = Date.now() - tCompose;
  if (!c.ok) {
    console.log(`needs_clarification — missing: ${c.clarification.missing.join(', ')}\n`);
    console.log(c.clarification.reason);
    for (const sug of c.clarification.suggestions) console.log(`\n  try: "${sug}"`);
    process.exit(1);
  }
  console.log(`plan: headline ${c.plan.subject.headline} · checks ${c.plan.checks.join(', ')}\n`);
  const r = await run(c.plan);
  if (!r.ok) { console.log(r.status); process.exit(1); }
  present(r.report, r.hash);
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
  present(r.report, r.hash);
}

if (mode === 'morpho') {
  const r = await run(manualPlan('Balance overview for Morpho Blue.', ['morpho-blue'], 'morpho-blue', 'totalDepositBalanceUSD'));
  if (!r.ok) { console.log(r.status); process.exit(1); }
  present(r.report, r.hash);
}
printTiming();
await new Promise<void>((res) => process.stdout.write('', () => res()));

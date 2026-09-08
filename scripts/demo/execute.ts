// Unit 9's proof. A plan in, a structured report out. Three runs.
import { execute, type ExecuteState } from '../../src/agent/execute.js';
import { figureRef } from '../../src/engine/invariants.js';
import type { ReportPlan } from '../../src/types/report.js';

// ⚠️ An id, resolved through config/analysts.ts — not a literal address.
const ANALYST_ID = 'alpha-1';
const plan = (directive: string, slugs: string[], headSlug: string, headField: string): ReportPlan => ({
  subject: { directive, deployments: slugs, headline: figureRef(headSlug, headField) },
  reads: [{ documentId: 'balance-sheet', slugs, variables: {} }, { documentId: 'markets', slugs, variables: {} }],
  checks: ['chain-corroboration'],
  rationale: 'test plan',
});
const st = (p: ReportPlan): ExecuteState => ({ plan: p, analystId: ANALYST_ID });
const usd = (v: string | null) => (v === null ? 'withheld' : `$${(Number(v) / 1e9).toFixed(3)}B`);

console.log('\n1 · balance overview for Aave v3\n');
const one = await execute(st(plan('Balance overview for Aave v3 on Ethereum.', ['aave-v3-ethereum'], 'aave-v3-ethereum', 'totalDepositBalanceUSD')));
if (one.status !== 'completed') { console.log(`  ${one.status}: ${'reason' in one ? one.reason : ''}`); }
else {
  const d = one.draft;
  console.log(`  block        ${d.block}   observedAt ${d.observedAt}`);
  console.log(`  analyst      ${d.analyst}`);
  console.log(`  headline     ${d.subject.headline}`);
  for (const [id, f] of Object.entries(d.facts)) console.log(`  ${id.padEnd(48)}${usd(f.value).padStart(12)}   ${f.corroboration}${f.withheld ? `  (${f.withheld.code})` : ''}`);
  console.log(`  verdict      ${d.verdict.call ?? 'none (metric across deployments)'}  · coverage ${d.verdict.coverage.marketsRead} markets, ${d.verdict.coverage.marketsCorroborated} corroborated, ${d.verdict.coverage.completeness}`);
  console.log(`  checks       ${d.checks.length}   provenance ${d.provenance.length}   exclusions ${d.exclusions.length}`);
  for (const c of d.checks.filter((x) => x.outcome !== 'passed')) console.log(`    ${x2(c.outcome)} ${c.rationale.slice(0, 110)}`);
  console.log(`  dataHash     ${one.dataHash.slice(0, 16)}…`);
  console.log(`  ${one.queries} queries · ${one.elapsedMs}ms`);
}
function x2(o: string) { return o === 'failed' ? '⛔' : '·'; }

console.log('\n\n2 · a plan whose headline is blocked — compound-v3 deposits\n');
const two = await execute(st(plan('Report compound-v3 total deposits.', ['compound-v3-ethereum'], 'compound-v3-ethereum', 'totalDepositBalanceUSD')));
console.log(`  status  ${two.status}`);
if (two.status === 'blocked') { console.log(`  figure  ${two.figure}`); console.log(`  reason  ${two.reason}`); }
console.log('  ⚠️  no partial report — the figure the report is about is unreportable.');

console.log('\n\n2b · the same deployment, a different headline\n');
const twob = await execute(st(plan('Report compound-v3 borrowing.', ['compound-v3-ethereum'], 'compound-v3-ethereum', 'totalBorrowBalanceUSD')));
console.log(`  status  ${twob.status}`);
if (twob.status === 'completed') {
  console.log(`  borrows   ${usd(twob.draft.facts[figureRef('compound-v3-ethereum', 'totalBorrowBalanceUSD')]!.value)}`);
  const dep = twob.draft.facts[figureRef('compound-v3-ethereum', 'totalDepositBalanceUSD')]!;
  console.log(`  deposits  ${usd(dep.value)}  ← withheld and explained, report still publishes`);
}

console.log('\n\n3 · the same plan twice — the hash must not move\n');
const p3 = plan('Balance overview for aave-v2.', ['aave-v2-ethereum'], 'aave-v2-ethereum', 'totalDepositBalanceUSD');
// ⚠️ Run 2 REUSES run 1's resolved block, via the state the first run handed back. Letting each run
// resolve its own block tests nothing about determinism: the chain head moves between them, so the
// second report is of a different moment and *should* hash differently. That is what the first
// version of this proof measured, and it read as a failure of the hash.
const a = await execute(st(p3));
const b = await execute(a.status === 'completed' ? { ...st(p3), block: a.draft.block } : st(p3));
if (a.status === 'completed' && b.status === 'completed') console.log(`  blocks  run 1 ${a.draft.block} · run 2 ${b.draft.block}`);
if (a.status === 'completed' && b.status === 'completed') {
  console.log(`  run 1   ${a.dataHash.slice(0, 24)}…`);
  console.log(`  run 2   ${b.dataHash.slice(0, 24)}…`);
  console.log(`  ${a.dataHash === b.dataHash ? '✅ identical' : '⛔ DIFFERS — stop, this is the property Phase 4 settles against'}`);
  if (a.dataHash !== b.dataHash) {
    const [x, y] = [JSON.stringify(a.draft), JSON.stringify(b.draft)];
    for (let i = 0; i < Math.max(x.length, y.length); i++)
      if (x[i] !== y[i]) { console.log(`  diverge at ${i}:\n    a: ${x.slice(Math.max(0, i - 120), i + 120)}\n    b: ${y.slice(Math.max(0, i - 120), i + 120)}`); break; }
  }
} else console.log(`  a=${a.status} b=${b.status}`);
console.log();
await new Promise<void>((r) => process.stdout.write('', () => r()));

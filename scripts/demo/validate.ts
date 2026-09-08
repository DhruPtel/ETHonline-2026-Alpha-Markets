// Unit 11's proof. Three fabrications that must be caught, and two real reports that must not be.
import Anthropic from '@anthropic-ai/sdk';
import { compose } from '../../src/agent/compose.js';
import { execute } from '../../src/agent/execute.js';
import { narrate } from '../../src/agent/narrate.js';
import { validate, type Violation } from '../../src/agent/validate.js';
import type { Fact, Report } from '../../src/types/report.js';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const ANALYST = '0x1b7035bbe0da8f3bcb721863d42e1079e4a116a7';

const fact = (id: string, label: string, value: string): Fact => ({
  id, label, value, unit: 'USD', slug: id.split('.')[0]!, block: 25927842,
  deployment: 'QmDeployment', corroboration: 'not_checked', withheld: null,
});

/** A minimal but structurally real report, so the three fabrications are the only variable. */
const fixture = (text: string, factRefs: string[], basis: string[]): Report => ({
  schema: 'alpha-markets/report/v1', form: null, analyst: ANALYST,
  subject: { directive: 'test', deployments: ['aave-v3-ethereum'], headline: 'aave-v3-ethereum.totalDepositBalanceUSD' },
  block: 25927842, observedAt: '2026-09-08T00:00:00.000Z',
  facts: { 'aave-v3-ethereum.totalDepositBalanceUSD': fact('aave-v3-ethereum.totalDepositBalanceUSD', 'aave-v3-ethereum — Total deposits', '24820000000') },
  checks: [], exclusions: [],
  verdict: { call: 'consistent_only', coverage: { marketsRead: 0, marketsCorroborated: 0, completeness: 'complete', checksRun: 1, checksAvailable: 1 } },
  assessment: { summary: 'Aave v3 is the largest deployment on the table.', basis, confidence: 'high' },
  sections: [{ id: 'figures', paragraphs: [{ text, factRefs }] }],
  provenance: [], atsTokenAddress: null,
});

const show = (name: string, vs: Violation[], expect: 'reject' | 'pass') => {
  const got = vs.length ? 'reject' : 'pass';
  console.log(`\n${got === expect ? '✅' : '⛔'} ${name}  →  ${got}${got === expect ? '' : ` (expected ${expect})`}`);
  for (const x of vs.slice(0, 8)) console.log(`     [${x.kind}] ${x.where}: ${x.detail}`);
  if (vs.length > 8) console.log(`     … and ${vs.length - 8} more`);
};

console.log('═══ fabrications that must be caught ═══');

show('1 · a bare dollar figure in narration',
  validate(fixture('| Deposits |\n|---|\n| $900 billion |', [], ['aave-v3-ethereum.totalDepositBalanceUSD'])), 'reject');

show('2 · a factRef pointing at nothing',
  validate(fixture('| Deposits |\n|---|\n| {fact:aave-v3-ethereum.inventedField} |', ['aave-v3-ethereum.inventedField'], ['aave-v3-ethereum.totalDepositBalanceUSD'])), 'reject');

show('3 · assessment.basis naming a fact that does not exist',
  validate(fixture('| Deposits |\n|---|\n| {fact:aave-v3-ethereum.totalDepositBalanceUSD} |', ['aave-v3-ethereum.totalDepositBalanceUSD'], ['aave-v3-ethereum.doesNotExist'])), 'reject');

show('0 · the same report with nothing wrong (control)',
  validate(fixture('| Deposits |\n|---|\n| {fact:aave-v3-ethereum.totalDepositBalanceUSD} |', ['aave-v3-ethereum.totalDepositBalanceUSD'], ['aave-v3-ethereum.totalDepositBalanceUSD'])), 'pass');

console.log('\n\n═══ real generations — do honest reports survive? ═══');

for (const [name, directive] of [
  ['4 · a protocol-level report', 'compare deposits across aave-v2, compound-v2 and spark-lend'],
  ['5 · a market breakdown', "list makerdao's individual markets with their deposits and borrows"],
] as const) {
  const c = await compose(directive, client);
  if (!c.ok) { console.log(`\n⛔ ${name}: planner refused`); continue; }
  const ex = await execute({ plan: c.plan, analyst: ANALYST });
  if (ex.status !== 'completed') { console.log(`\n⛔ ${name}: execute ${ex.status}`); continue; }
  const report = await narrate(ex.draft, client);
  const vs = validate(report);
  console.log(`\n${vs.length ? '⛔' : '✅'} ${name} — ${Object.keys(report.facts).length} facts, ${vs.length} violation(s)`);
  for (const x of vs.slice(0, 12)) console.log(`     [${x.kind}] ${x.where}: ${x.detail}`);
  if (vs.length > 12) console.log(`     … and ${vs.length - 12} more`);
}
await new Promise<void>((res) => process.stdout.write('', () => res()));

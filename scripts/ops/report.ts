// Generate a report and keep it. The production entry point for the pipeline.
//
//   npx tsx --env-file=.env scripts/ops/report.ts "top 10 protocols by deposits"
//
// ⚠️ **This is a promotion, not a new implementation.** compose → execute → narrate, the digit-guard
// warning and the timing breakdown all come from `scripts/demo/narrate.ts`; the save and the
// fact/bytes summary come from `scripts/demo/store.ts`. What is left behind is everything that made
// those two *proofs*: the four demo modes and their hand-written plans, the five `must()` assertions,
// and — the reason this file exists — `demo/store.ts`'s deliberate one-character corruption of a
// stored row, whose restore sits outside its `finally`.
//
// ⚠️ **Generating is cheap and everything generated is kept; tokenizing costs 7.7 HBAR and mints a
// permanent asset.** That is why this saves unconditionally and stops, and why the last line it
// prints is a command rather than an action.

import Anthropic from '@anthropic-ai/sdk';
import { compose } from '../../src/agent/compose.js';
import { execute } from '../../src/agent/execute.js';
import { narrate, render } from '../../src/agent/narrate.js';
import { validate } from '../../src/agent/validate.js';
import { reportHash } from '../../src/domain/canonical.js';
import { save, close } from '../../src/store/reports.js';

/** The analyst this CLI publishes as. One row today; a second one makes this a flag. */
const ANALYST_ID = 'alpha-1';

/** Where a saved report becomes readable. Aliased, so it survives a redeploy. */
const SITE = 'https://et-honline-2026-alpha-markets.vercel.app';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ⚠️ No default directive, unlike the demos. A default here would quietly generate and store a
// report nobody asked for, and the store is the thing this command exists to write to.
const directive = process.argv.slice(2).join(' ').trim();
if (!directive) {
  console.error('usage: report.ts "<directive>"\n   e.g. report.ts "Balance overview for Aave v3 on Ethereum"');
  process.exit(1);
}

const ms = (n: number) => `${n.toLocaleString('en-US')} ms`;
const row = (label: string, v: number) => console.log(`  ${label.padEnd(30)}${ms(v).padStart(11)}`);

/**
 * Nothing was written. Every early exit prints through here so that stays true and visible.
 *
 * ⚠️ It prints and does not exit, and the `await close(); process.exit(1)` is repeated at each call
 * site on purpose. An `async` helper returning `Promise<never>` does NOT narrow a discriminated
 * union for TypeScript — only a synchronous `never`-returning call is a control-flow terminator — so
 * routing the exit through here would cost a cast on every `ex.draft` and `planned.plan` below.
 */
function problem(headline: string, ...detail: string[]): void {
  console.error(`\n${headline}`);
  for (const line of detail) console.error(`  ${line}`);
  console.error('\n  Nothing was saved.\n');
}

console.log(`\ndirective: ${directive}\n`);

// ── Plan ─────────────────────────────────────────────────────────────────────────────────────────
const tCompose = Date.now();
const planned = await compose(directive, client);
const composeMs = Date.now() - tCompose;
if (!planned.ok) {
  // ⚠️ A first-class outcome, not an error: the directive named no answerable question. The
  // suggestions are the useful part — they are directives that would work.
  problem(
    `needs clarification — missing: ${planned.clarification.missing.join(', ')}`,
    planned.clarification.reason,
    ...planned.clarification.suggestions.map((s) => `try: "${s}"`),
  );
  await close();
  process.exit(1);
}
console.log(`plan: headline ${planned.plan.subject.headline} · checks ${planned.plan.checks.join(', ') || 'none'}\n`);

// ── Gather ───────────────────────────────────────────────────────────────────────────────────────
// ⚠️ Three of the four outcomes are not a report, and none of them may be saved. A blocked report is
// not a report with a caveat — §5.13: an error touching the headline figure means there is no answer.
const ex = await execute({ plan: planned.plan, analystId: ANALYST_ID });
if (ex.status !== 'completed') {
  if (ex.status === 'blocked') {
    problem(`blocked — the headline figure ${ex.figure} cannot be stood behind`, ex.reason);
  } else if (ex.status === 'declined') {
    problem('declined — the plan could not be run as written', ex.reason);
  } else {
    problem(`budget — stopped at ${ex.detail}`,
      'The plan is too wide for one run. Narrow the directive or raise the budget in execute.ts.');
  }
  await close();
  process.exit(1);
}

// ── Narrate ──────────────────────────────────────────────────────────────────────────────────────
const tNarrate = Date.now();
const report = await narrate(ex.draft, client);
const narrateMs = Date.now() - tNarrate;
const hash = reportHash(report);

console.log(render(report, hash));

// ⚠️ **Warns, never blocks** — DECISIONS.md 2026-09-08, enforcement moves to Phase 4. The report is
// printed and saved regardless; a utilization computed from two figures this pipeline fetched is
// arithmetic on Graph data, and refusing it today would fail nearly every report.
const violations = validate(report);
if (!violations.length) {
  console.log('digit guard: ✅ clean — every figure in the text traces to a fact\n');
} else {
  console.log(`digit guard: ⚠️  ${violations.length} violation(s) — the report above is saved anyway`);
  for (const v of violations.slice(0, 10)) console.log(`  [${v.kind}] ${v.where}: ${v.detail}`);
  if (violations.length > 10) console.log(`  … and ${violations.length - 10} more`);
  console.log();
}

// ── Save ─────────────────────────────────────────────────────────────────────────────────────────
const { inserted } = await save(report);

console.log('timing');
row('compose (model)', composeMs);
row('execute', ex.elapsedMs);
row(`  fetch · ${ex.queries} queries`, ex.timings.fetchMs);
row(ex.timings.corroborateCalls ? `  corroboration · ${ex.timings.corroborateCalls} deployment(s)` : '  corroboration · did not run', ex.timings.corroborateMs);
row('  engine checks', ex.timings.engineMs);
row('  block resolution', ex.timings.blockMs);
row('narrate (model)', narrateMs);

const facts = Object.keys(report.facts).length;
console.log(`\n${inserted ? 'SAVED' : 'ALREADY STORED'}  ${facts} facts · block ${report.block}`);
if (!inserted) {
  // ⚠️ Not a failure. The hash IS the id, so an identical report at the same block is the same
  // report; `save` is a no-op by design rather than a second row or an error.
  console.log('  The same directive at the same block produced a byte-identical report.');
}
console.log(`  hash      ${hash}`);
console.log(`  read      ${SITE}/report/${hash}`);
console.log(`\n  tokenize (costs ~7.7 HBAR, mints a permanent asset):`);
console.log(`  npx tsx --env-file=.env scripts/ops/tokenize.ts ${hash} --confirm\n`);

await close();

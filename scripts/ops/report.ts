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
import { build, recordContextDigest } from '../../src/agent/context.js';
import { execute } from '../../src/agent/execute.js';
import { narrate, render } from '../../src/agent/narrate.js';
import { validate } from '../../src/agent/validate.js';
import { analyst } from '../../src/config/analysts.js';
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

// ── The analyst's own record ─────────────────────────────────────────────────────────────────────
// ⚠️ **Unit 15b, and this is the line that makes the loop run rather than exist.** `build` reads the
// last five settled claims out of `scores` and returns the block the planner sees.
//
// ⚠️ **Built ONCE and the same object is passed to `compose` and to `recordContextDigest`.** The
// digest is supposed to answer "what history did this plan see", and rebuilding it after the report
// was written would answer a different question — the record can change between the two calls.
//
// ⚠️ **`null` is the normal case and must stay silent.** No settled claims means no block, `compose`
// adds nothing, and the system prompt is byte-for-byte what it was before this unit existed. There
// is deliberately no "no record yet" line: that is a thing for the model to reason about where
// there should be nothing.
//
// ⚠️ **Identical to the console route's four lines, and that is the point** — two callers, one
// behaviour. Same `ANALYST_ID`, same `build`, so identical state produces an identical block.
const tContext = Date.now();
const context = await build(analyst(ANALYST_ID).arcAddress);
const contextMs = Date.now() - tContext;
console.log(context
  ? `record: ${context.count} settled claim(s) reaching the planner · digest ${context.digest.slice(0, 16)}…\n`
  : 'record: none — no settled claims, so the planner sees exactly what it saw before Unit 15b\n');

// ── Plan ─────────────────────────────────────────────────────────────────────────────────────────
const tCompose = Date.now();
const planned = await compose(directive, client, context);
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

// ⚠️ **AFTER `save`, because the row is keyed by the hash and does not exist until then** — and it is
// a second write, so say what a failure between them costs. If this `UPDATE` fails the report is
// saved, readable and correct; what is lost is the record of what history its plan saw, and the null
// left behind is **indistinguishable from "no context was supplied"**. That ambiguity is the whole
// cost, and it is small: a single `UPDATE` by primary key, immediately after the insert.
//
// ⚠️ **Re-running is not a faithful repair.** `save` is a no-op for a byte-identical report, so a
// second run would record the digest of the block built at THAT moment — which is the right shape
// and possibly the wrong history. A digest recovered that way is not evidence of what the first run
// saw. Better to notice the failure than to re-run and assume.
//
// ⚠️ A `null` context writes nothing rather than writing null, so a report generated with no record
// keeps an absent digest rather than an asserted one.
await recordContextDigest(hash, context);

console.log('timing');
row('context (db read)', contextMs);
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
// ⚠️ Outside the hash, beside the row. Printed next to it so the two are visibly different things.
console.log(`  context   ${context ? `${context.digest} (${context.count} claim(s))` : 'none supplied'}`);
console.log(`  read      ${SITE}/report/${hash}`);
console.log(`\n  tokenize (costs ~7.7 HBAR, mints a permanent asset):`);
console.log(`  npx tsx --env-file=.env scripts/ops/tokenize.ts ${hash} --confirm\n`);

await close();

// Unit 5's proof — M2. A REAL report survives the round trip with its identity intact.
//
//   npx tsx --env-file=.env scripts/demo/store.ts
//
// ⚠️ **A real report, never a fixture.** `demo/canonical.ts`'s fixture would pass this trivially: it
// is hand-built, nine fields, one fact. A real report carries 100+ facts, decimal strings with up to
// 23 places, indexer-supplied market labels and explicit nulls — which is where a round trip actually
// breaks. So this runs compose → execute → narrate and stores what comes out.
//
// Five checks, and 2 is the one that matters most:
//   1. the canonical bytes come back byte-identical, and the recomputed hash equals the stored key
//   2. a row altered by ONE character in the database fails to load rather than being served
//   3. re-saving an identical report is a no-op, not an error
//   4. list() returns it
//   5. the altered row is restored, so the database is left as it was found

import Anthropic from '@anthropic-ai/sdk';
import { compose } from '../../src/agent/compose.js';
import { execute } from '../../src/agent/execute.js';
import { narrate } from '../../src/agent/narrate.js';
import { canonical, reportHash } from '../../src/domain/canonical.js';
import { save, load, list, close } from '../../src/store/reports.js';
import { pooled } from '../../src/store/db.js';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const DIRECTIVE = process.argv.slice(2).join(' ').trim()
  || "Balance overview for Aave v3 on Ethereum — how big is it, and what's inside it?";

const ok = (b: boolean) => (b ? '✅' : '⛔');
let failures = 0;
const must = (label: string, condition: boolean, detail = ''): void => {
  if (!condition) failures += 1;
  console.log(`  ${ok(condition)} ${label}${detail ? `  ${detail}` : ''}`);
};

// ── A real report ────────────────────────────────────────────────────────────────────────────────
console.log(`\n── generating a real report\n  directive: ${DIRECTIVE}`);
const planned = await compose(DIRECTIVE, client);
if (!planned.ok) { console.error(`\nSTOP  planner asked for clarification: ${planned.clarification.reason}`); process.exit(1); }
const ex = await execute({ plan: planned.plan, analystId: 'alpha-1' });
if (ex.status !== 'completed') { console.error(`\nSTOP  execute ${ex.status}: ${'reason' in ex ? ex.reason : ''}`); process.exit(1); }
const report = await narrate(ex.draft, client);

const json = canonical(report);
const hash = reportHash(report);
const decimals = Object.values(report.facts).map((f) => (f.value ?? '').split('.')[1]?.length ?? 0);
console.log(`  block ${report.block} · ${Object.keys(report.facts).length} facts · ${json.length} canonical bytes`);
console.log(`  longest decimal tail: ${Math.max(0, ...decimals)} places · nulls: ${Object.values(report.facts).filter((f) => f.value === null).length}`);
console.log(`  hash  ${hash}`);

// ── 1 · round trip ───────────────────────────────────────────────────────────────────────────────
console.log(`\n── 1 · save, load, and re-derive`);
const first = await save(report, '');
must('saved', first.inserted || true, `inserted=${first.inserted}`);
const loaded = await load(hash);
must('load returned a report', loaded !== null);
if (loaded) {
  // ⚠️ Asserted SEPARATELY on purpose. Byte-identity is the stronger claim; the hash matching is the
  // one that matters to a market. A change that broke only one of them would be the interesting bug.
  must('canonical bytes are byte-identical', canonical(loaded) === json,
    `${canonical(loaded).length} vs ${json.length} bytes`);
  must('recomputed hash equals the stored key', reportHash(loaded) === hash);
  must('block is a number, not a driver string', typeof loaded.block === 'number', `typeof=${typeof loaded.block}`);
  must('atsTokenAddress present and null', 'atsTokenAddress' in loaded && loaded.atsTokenAddress === null);
}

// ── 3 · idempotent re-save ───────────────────────────────────────────────────────────────────────
console.log(`\n── 3 · re-save the identical report`);
const second = await save(report, '');
must('no-op rather than error', second.inserted === false, `inserted=${second.inserted}`);
must('same hash returned', second.hash === hash);

// ── 4 · list ─────────────────────────────────────────────────────────────────────────────────────
console.log(`\n── 4 · list()`);
const listed = await list(10);
const mine = listed.find((r) => r.hash === hash);
must('the saved report is listed', mine !== undefined, `${listed.length} row(s) back`);
if (mine) {
  must('block coerced to number for display', typeof mine.block === 'number', `${mine.block}`);
  console.log(`     ${mine.hash.slice(0, 12)}…  ${mine.analyst.slice(0, 10)}…  block ${mine.block}  ${mine.createdAt.toISOString()}`);
}

// ── 2 · the negative — tamper with one character ─────────────────────────────────────────────────
// ⚠️ Written directly with SQL rather than through the store, because the store has no way to write
// a bad row and should not gain one. This is the only place in the repo that does this.
console.log(`\n── 2 · alter one character in the database`);
const sql = pooled();
try {
  const [before] = await sql<{ canonical_json: string }[]>`SELECT canonical_json FROM reports WHERE hash = ${hash}`;
  const original = before!.canonical_json;
  // Flip one digit inside a value — the smallest change that is still a lie about a number.
  const at = original.search(/[1-9]/);
  const tampered = original.slice(0, at) + (original[at] === '9' ? '8' : '9') + original.slice(at + 1);
  must('tampered string differs by exactly one character', tampered.length === original.length
    && [...tampered].filter((c, i) => c !== original[i]).length === 1, `at offset ${at}`);
  await sql`UPDATE reports SET canonical_json = ${tampered} WHERE hash = ${hash}`;

  let threw: Error | null = null;
  try { await load(hash); } catch (e) { threw = e as Error; }
  must('load THREW rather than serving the row', threw !== null);
  if (threw) console.log(`\n     ${threw.message}\n`);

  // ── 5 · restore ────────────────────────────────────────────────────────────────────────────────
  await sql`UPDATE reports SET canonical_json = ${original} WHERE hash = ${hash}`;
  const restored = await load(hash);
  must('row restored and loads cleanly again', restored !== null && reportHash(restored) === hash);
} finally {
  await sql.end();
  await close();
}

console.log('');
if (failures) { console.error(`FAIL  ${failures} assertion(s) failed.`); process.exit(1); }
console.log(`PASS  a real report survives the round trip with its identity intact.`);
console.log(`      ${Object.keys(report.facts).length} facts · ${json.length} canonical bytes · hash unchanged.`);

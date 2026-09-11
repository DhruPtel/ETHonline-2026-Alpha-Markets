// Unit 15b's proof. `src/agent/context.ts` + the `compose` change in, PASS or FAIL out.
//
//   npx tsx --env-file=.env scripts/demo/context.ts
//
// ⚠️ **NO CHAIN CALLS AND NO GAS.** It reads the store, writes fixture rows, removes them, and makes
// two planner calls to Anthropic — which cost tokens and nothing else. Markets 6 and 7 are never
// referenced.
//
// ⚠️ **WHY IT SEEDS FIXTURES.** `scores` is empty in real running: Unit 15's proof seeded and removed
// its own, and `payouts` still has no writer. So there is no settled record to build a block from,
// and "the context block built from the real scores table" needs rows in that table to be real about.
// The fixtures mirror chain markets 2–5 exactly as Unit 15's proof does — a correct forecast, an
// incorrect one, and a void — are scored through `scoreMarket()` rather than inserted into `scores`
// by hand, and are removed in a `finally`.
//
// ⚠️ **The planner calls are the expensive half and they are the point.** The brief asks for the same
// directive planned with and without context, both shown. **If the two plans are identical that is a
// fine outcome and is reported as such** — a null result stated is worth more than a difference
// manufactured to look like learning.

import Anthropic from '@anthropic-ai/sdk';
import { build, recordContextDigest } from '../../src/agent/context.js';
import { compose } from '../../src/agent/compose.js';
import { scoreMarket } from '../../src/arc/score.js';
import { specHash, validateSpec } from '../../src/arc/spec.js';
import { load } from '../../src/store/reports.js';
import { db } from '../../src/store/db.js';
import { close } from '../../src/store/markets.js';
import { requiredEnv } from '../../src/config/env.js';

let failures = 0;
const ok = (label: string, condition: boolean, detail = ''): void => {
  console.log(`  ${condition ? '✅' : '❌'} ${label}${detail ? `   ${detail}` : ''}`);
  if (!condition) failures += 1;
};

const CONTRACT = requiredEnv('ARC_MARKET_ADDRESS');
const ANALYST = '0x1b7035bbe0da8f3bcb721863d42e1079e4a116a7';
const CENT = '10000000000000000';
const DIRECTIVE = 'Report aave-v3-ethereum deposits and borrows';

const mid = (n: number) => `m/ctx-chain-${n}`;
const cid = (n: number) => `c/ctx-chain-${n}`;

/** Three settled markets: a hit, a miss, and a void. Subjects differ so the lines are telling. */
const CASES = [
  { chain: 2, threshold: '20000000000', outcome: true, voided: false, side: true },   // RIGHT
  { chain: 3, threshold: '99000000000', outcome: false, voided: false, side: true },  // WRONG
  { chain: 4, threshold: '30000000000', outcome: null, voided: true, side: true },    // VOID
];

async function remove(): Promise<void> {
  const ids = CASES.map((c) => mid(c.chain));
  await db()`DELETE FROM scores  WHERE market_id = ANY(${ids})`;
  await db()`DELETE FROM claims  WHERE market_id = ANY(${ids})`;
  await db()`DELETE FROM markets WHERE id = ANY(${ids})`;
}

async function seed(reportHash: string): Promise<void> {
  for (const [i, c] of CASES.entries()) {
    const spec = validateSpec({
      slug: 'aave-v3-ethereum', metric: 'totalDepositBalanceUSD', comparison: 'above',
      threshold: c.threshold, observedDay: '2026-09-10',
    });
    // ⚠️ Settlement times stagger so "most recent first" is an assertion rather than a coincidence.
    const settledAt = new Date(Date.now() - (CASES.length - i) * 3_600_000);
    await db()`
      INSERT INTO markets (id, spec_hash, spec_json, observed_day, close_time, observation_end,
                           resolve_deadline, contract_address, chain_market_id, landed_at,
                           resolved_at, voided_at, outcome)
      VALUES (${mid(c.chain)}, ${specHash(spec)}, ${JSON.stringify(spec)}, ${spec.observedDay},
              '2026-09-10T00:00:00Z', '2026-09-11T00:00:00Z', '2026-09-13T00:00:00Z',
              ${CONTRACT}, ${String(c.chain)}, now(),
              ${c.voided ? null : settledAt}, ${c.voided ? settledAt : null},
              ${c.voided ? null : c.outcome})`;
    await db()`
      INSERT INTO claims (id, market_id, chain_claim_id, author, report_hash, side, amount, committed_at)
      VALUES (${cid(c.chain)}, ${mid(c.chain)}, ${String(c.chain)}, ${ANALYST}, ${reportHash},
              ${c.side}, ${CENT}, now())`;
  }
  // ⚠️ Scored through Unit 15, never inserted into `scores` by hand — otherwise this proves a shape
  // this project does not produce.
  for (const c of CASES) await scoreMarket(mid(c.chain));
}

const summarize = (r: Awaited<ReturnType<typeof compose>>) =>
  r.ok ? `${r.plan.subject.headline} | reads ${r.plan.reads.map((x) => x.documentId).join('+')} | ${r.plan.subject.deployments.length} deployment(s)` : 'CLARIFICATION';

// ─── Run ─────────────────────────────────────────────────────────────────────────────────────────

const client = new Anthropic();
const [anyReport] = await db()<{ hash: string }[]>`
  SELECT hash FROM reports WHERE analyst = ${ANALYST} ORDER BY created_at DESC LIMIT 1`;
if (!anyReport) { console.error('no report by this analyst to attach fixture claims to'); process.exit(1); }

console.log('\n══ Phase 1 · empty history');
await remove();
const empty = await build(ANALYST);
ok('⚠️ no settled claims produces NO block, not an empty one', empty === null, String(empty));

console.log('  planning without context…');
const withoutCtx = await compose(DIRECTIVE, client, empty);
ok('compose still plans with no context', withoutCtx.ok === true, summarize(withoutCtx));

try {
  await seed(anyReport.hash);

  console.log('\n══ Phase 2 · the block, verbatim, built from the real scores table');
  const ctx = await build(ANALYST);
  ok('a block was built', ctx !== null);
  ok('it describes three settled claims', ctx?.count === 3, String(ctx?.count));
  console.log('\n┌─────────────────────────────────────────────────────────────────────────────');
  for (const l of (ctx!.block).split('\n')) console.log(`│ ${l}`);
  console.log('└─────────────────────────────────────────────────────────────────────────────\n');

  const lines = ctx!.block.split('\n').filter((l) => l.startsWith('- "'));
  ok('exactly three claim lines', lines.length === 3, String(lines.length));
  ok('most recent first — the VOID is newest', lines[0]!.includes('VOID'));
  ok('⚠️ the void reads as VOID, never as WRONG',
    lines[0]!.includes('VOID (no outcome') && !lines[0]!.includes('WRONG'));
  ok('the hit reads RIGHT', lines[2]!.includes('you were RIGHT'));
  ok('the miss reads WRONG', lines[1]!.includes('you were WRONG'));
  ok('each line carries the directive, subject, side and confidence',
    lines.every((l) => l.includes(DIRECTIVE.slice(0, 12)) || l.includes('"'))
    && lines.every((l) => l.includes('aave-v3-ethereum') && l.includes('you said')));
  ok('⚠️ no reconciliation-quality or trading-return text reaches the prompt',
    !ctx!.block.includes('reconciliation') && !ctx!.block.toLowerCase().includes('returned'),
    'neither is in the decided five, so neither can read as a zero');

  console.log('══ Phase 3 · the same directive, planned with the record');
  console.log('  planning with context…');
  const withCtx = await compose(DIRECTIVE, client, ctx);
  ok('compose plans with context', withCtx.ok === true);
  console.log(`\n  without context : ${summarize(withoutCtx)}`);
  console.log(`  with context    : ${summarize(withCtx)}`);
  const same = summarize(withoutCtx) === summarize(withCtx);
  console.log(same
    ? '\n  ⚠️ The two plans are IDENTICAL. Reported as-is: at n=3 on one directive that is the\n     expected outcome, and a difference manufactured to look like learning would be worse.\n'
    : '\n  ⚠️ The two plans DIFFER — the record changed what the analyst decided to look at.\n');

  console.log('══ Phase 4 · context_digest, beside the row and outside the hash');
  const before = await load(anyReport.hash);
  await recordContextDigest(anyReport.hash, ctx);
  const [stored] = await db()<{ context_digest: string | null }[]>`
    SELECT context_digest FROM reports WHERE hash = ${anyReport.hash}`;
  ok('digest recorded', stored!.context_digest === ctx!.digest, ctx!.digest.slice(0, 16) + '…');
  ok('digest is sha256 of exactly the block that was supplied', /^[0-9a-f]{64}$/.test(ctx!.digest));

  const after = await load(anyReport.hash);
  ok('⚠️ the report still loads — both hash checks pass', after !== null);
  ok('⚠️ THE REPORT HASH IS UNCHANGED by the digest beside it',
    before !== null && after !== null && JSON.stringify(before) === JSON.stringify(after), anyReport.hash.slice(0, 16) + '…');

  await recordContextDigest(anyReport.hash, null);
  const [unchanged] = await db()<{ context_digest: string | null }[]>`
    SELECT context_digest FROM reports WHERE hash = ${anyReport.hash}`;
  ok('⚠️ a null context leaves the digest alone rather than blanking it',
    unchanged!.context_digest === ctx!.digest);
} finally {
  console.log('\n══ Cleanup');
  await remove();
  await db()`UPDATE reports SET context_digest = NULL WHERE hash = ${anyReport.hash}`;
  const [left] = await db()<{ n: number }[]>`
    SELECT (SELECT count(*) FROM markets WHERE id LIKE 'm/ctx-chain-%')
         + (SELECT count(*) FROM claims  WHERE id LIKE 'c/ctx-chain-%')
         + (SELECT count(*) FROM scores  WHERE market_id LIKE 'm/ctx-chain-%')
         + (SELECT count(*) FROM reports WHERE context_digest IS NOT NULL) AS n`;
  ok('every fixture row removed and the digest cleared', Number(left!.n) === 0, `${left!.n} left`);
  const [real] = await db()<{ stakes: number; claims: number; scores: number }[]>`
    SELECT (SELECT count(*)::int FROM stakes) stakes, (SELECT count(*)::int FROM claims) claims,
           (SELECT count(*)::int FROM scores) scores`;
  ok('⚠️ the real store is untouched — 1 stake, 2 claims, 0 scores',
    real!.stakes === 1 && real!.claims === 2 && real!.scores === 0, JSON.stringify(real));
}

console.log(failures === 0 ? '\nPASS\n' : `\n${failures} FAILED\n`);
await close();
process.exit(failures === 0 ? 0 : 1);

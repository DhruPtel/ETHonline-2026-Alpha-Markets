// Unit 8's proof. `src/arc/settle.ts` against the live gateway.
//
//   npx tsx --env-file=.env scripts/demo/settle.ts
//
// ⚠️ **No chain calls and no gas — and that is asserted structurally, not promised.** The last check
// reads `settle.ts`'s own imports and fails if it can reach Arc at all. A unit that cannot import
// the chain cannot spend on it.
//
// ⚠️ **The live market's observed day is 2026-09-12 and has not happened yet**, so its settlement
// read cannot be proven today. This uses PAST days for the real settlement and names them in the
// output. The one call made against 2026-09-12 is the freshness test — a Graph read that is expected
// to REFUSE, and it resolves nothing: this file has no path to the chain.
//
// ⚠️ **It writes one settlement_evidence row and deletes it.** The row is keyed by a market, so
// proving the database round trip needs a market to hang it on; a throwaway one is created with
// `directed_at` NULL so no cron could find it, and removed in a `finally`.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { SettlementTooEarly, recordSettlement, settle, verifyStoredEvidence } from '../../src/arc/settle.js';
import { holds, observationWindow, validateSpec } from '../../src/arc/spec.js';
import { canonical } from '../../src/domain/canonical.js';
import { closePool, db } from '../../src/store/db.js';

let failures = 0;
const ok = (label: string, condition: boolean, detail = ''): void => {
  console.log(`  ${condition ? '✅' : '❌'} ${label}${detail ? `   ${detail}` : ''}`);
  if (!condition) failures += 1;
};

const day = (daysAgo: number): string => new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);
const SLUG = 'aave-v3-ethereum';
const METRIC = 'totalDepositBalanceUSD' as const;
const spec = (observedDay: string, threshold: string, comparison: 'above' | 'below' = 'above') =>
  validateSpec({ slug: SLUG, metric: METRIC, comparison, threshold, observedDay });

const MARKET_ID = `unit-8-proof/${Date.now()}`;
let wroteRow = false;

try {
  // ─── 1 · a real past day resolves to a real outcome ────────────────────────────────────────────
  const PAST = day(2);
  const w = observationWindow(PAST);
  console.log(`\n── 1 · settling ${PAST} (two days ago) — window [${w.start}, ${w.end}]`);

  const settled = await settle(spec(PAST, '1'));
  if (settled.kind !== 'settled') {
    console.error(`\nSTOP  ${PAST} came back ${settled.kind}: ${settled.reason}`);
    console.error('      Pick another past day; this proof needs a day that has a snapshot.\n');
    process.exit(1);
  }
  console.log(`     snapshot   ${settled.snapshot.id}`);
  console.log(`     observed   ${settled.observed}`);
  console.log(`     read at    block ${settled.evidence.block}, ts ${settled.metaBlockTimestamp} (${new Date(settled.metaBlockTimestamp * 1000).toISOString()})`);
  console.log(`     evidence   ${settled.evidenceHash}`);
  ok('outcome is TRUE against a threshold of 1', settled.outcome === true);
  ok('the read was UNPINNED — requestedBlock is null', settled.evidence.requestedBlock === null);
  ok('…which is why a timestamp exists to check freshness against', settled.metaBlockTimestamp > 0);
  ok('tier record+raw — the bytes are kept', settled.evidence.raw !== null,
    `${settled.evidence.raw?.length ?? 0} bytes`);
  ok('one row, not a page', settled.evidence.rowCount === 1, String(settled.evidence.rowCount));
  // ⚠️ The snapshot must fall inside spec.ts's window, not merely near it.
  ok('the snapshot sits inside the window spec.ts computed',
    Number(settled.snapshot.timestamp) >= w.start && Number(settled.snapshot.timestamp) <= w.end,
    settled.snapshot.timestamp);

  // ─── 2 · the comparison is live, and a tie resolves FALSE ──────────────────────────────────────
  console.log('\n── 2 · the outcome follows the spec, and spec.ts decides what "above" means');
  const high = await settle(spec(PAST, `${settled.observed.split('.')[0]}0`));   // an order of magnitude up
  ok('a threshold above the figure resolves FALSE', high.kind === 'settled' && high.outcome === false);
  ok('…on the same observed figure', high.kind === 'settled' && high.observed === settled.observed);
  // ⚠️ The tie. `holds()` says equality resolves FALSE, and settlement must not re-decide that.
  const tie = await settle(spec(PAST, settled.observed));
  ok('an EXACT tie resolves FALSE, end to end', tie.kind === 'settled' && tie.outcome === false,
    `threshold == observed == ${settled.observed.slice(0, 20)}…`);
  ok('and it agrees with holds() called directly', holds(spec(PAST, settled.observed), settled.observed) === false);

  // ─── 3 · the database round trip — re-hash what came BACK, not what we still hold ──────────────
  console.log('\n── 3 · persisted, then re-hashed from the bytes the database returned');
  await db()`
    INSERT INTO markets (id, spec_hash, spec_json, observed_day, close_time, observation_end, resolve_deadline)
    VALUES (${MARKET_ID}, ${'0'.repeat(64)}, ${'{}'}, ${PAST},
            ${new Date(0)}, ${new Date(1000)}, ${new Date(2000)})`;
  wroteRow = true;
  await recordSettlement(MARKET_ID, settled);

  const [stored] = await db()<{ raw: string; evidence_hash: string; observed_value: string | null; outcome: boolean | null }[]>`
    SELECT raw, evidence_hash, observed_value, outcome FROM settlement_evidence WHERE market_id = ${MARKET_ID}`;
  if (!stored) { console.error('\nSTOP  settlement_evidence row was not written.\n'); process.exit(1); }

  const verdict = verifyStoredEvidence(stored.raw, stored.evidence_hash);
  ok('the stored evidence still hashes to its stored evidenceHash', verdict.evidenceMatches);
  ok('⚠️ responseHash matches a re-hash of the bytes READ BACK', verdict.responseMatches);
  // ⚠️ Done by hand too, so the check does not rest on the module's own helper.
  const record = JSON.parse(stored.raw) as { raw: string; responseHash: string };
  ok('…confirmed independently of verifyStoredEvidence()',
    createHash('sha256').update(record.raw, 'utf8').digest('hex') === record.responseHash,
    record.responseHash.slice(0, 16) + '…');
  ok('observed_value survived as an exact decimal string', stored.observed_value === settled.observed);
  ok('outcome survived', stored.outcome === true);
  // ⚠️ TEXT, not jsonb, proved directly: what came back is byte-for-byte what was written. Under
  // jsonb the keys would come back reordered, the hash above would fail, and the row would be a
  // hash with nothing behind it — on the one row whose entire job is to be re-checkable.
  ok('raw is byte-identical to what was written (TEXT, never jsonb)',
    stored.raw === canonical(settled.evidence), `${stored.raw.length} bytes`);

  // ─── 4 · a day with no snapshot ────────────────────────────────────────────────────────────────
  const ANCIENT = '2021-01-01';
  console.log(`\n── 4 · ${ANCIENT} — before this deployment existed`);
  const missing = await settle(spec(ANCIENT, '1'));
  ok('returns MISSING_OBSERVATION rather than a wrong answer', missing.kind === 'MISSING_OBSERVATION',
    missing.kind);
  ok('…and still carries evidence of having looked', missing.evidence.raw !== null);
  ok('…with a row count of zero', missing.evidence.rowCount === 0, String(missing.evidence.rowCount));
  if (missing.kind === 'MISSING_OBSERVATION') console.log(`     ${missing.reason}`);

  // ─── 5 · a day that has not finished ───────────────────────────────────────────────────────────
  // ⚠️ This is the LIVE market's observed day. The call reads The Graph and nothing else — this file
  // has no path to a chain — and the expected result is a refusal, which is the point.
  const FUTURE = '2026-09-12';
  console.log(`\n── 5 · ${FUTURE} — the live market's day, which has not finished`);
  try {
    await settle(spec(FUTURE, '1'));
    ok('refuses to settle a day that is still running', false, 'IT SETTLED — that is the bug this guards');
  } catch (error) {
    const early = error instanceof SettlementTooEarly;
    ok('refuses to settle a day that is still running', early, (error as Error).message.slice(0, 72));
    ok('…as SettlementTooEarly, which is retryable rather than an outcome', early);
  }

  // ─── 6 · this unit cannot spend, structurally ──────────────────────────────────────────────────
  console.log('\n── 6 · it has no way to reach a chain');
  const source = readFileSync(new URL('../../src/arc/settle.ts', import.meta.url), 'utf8');
  const imports = source.split('\n').filter((l) => l.startsWith('import ')).join('\n');
  ok('settle.ts does not import arc.ts (no submit, no provider)', !imports.includes("'./arc.js'"));
  ok('settle.ts does not import the contract ABI', !imports.includes("'./abi.js'"));
  ok('settle.ts does not import ethers', !/from 'ethers'/.test(imports));
} finally {
  if (wroteRow) {
    await db()`DELETE FROM settlement_evidence WHERE market_id = ${MARKET_ID}`;
    await db()`DELETE FROM markets WHERE id = ${MARKET_ID}`;
    const [left] = await db()<{ n: string }[]>`SELECT count(*)::text AS n FROM markets WHERE id LIKE 'unit-8-proof/%'`;
    console.log(`\n  cleaned up — ${left?.n ?? '?'} proof rows left behind`);
  }
  await closePool();
}

console.log(failures === 0 ? '\nPASS  settle.ts.\n' : `\nFAIL  ${failures} check(s).\n`);
process.exit(failures === 0 ? 0 : 1);

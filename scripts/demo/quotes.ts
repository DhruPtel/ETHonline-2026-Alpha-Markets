// Proof for `src/payments/quotes.ts`.
//
//   npx tsx --env-file=.env scripts/demo/quotes.ts
//
// ⚠️ **This writes to the live `quotes` table and cleans up after itself in a `finally`.** Every row
// it creates is tracked by id and deleted at the end, on the success and the failure path both —
// `demo/store.ts` puts its restore *outside* its `finally`, and that is the mistake not to repeat.
// Nothing here touches `reports`, `report_tokens` or `purchases`.

import { randomUUID } from 'node:crypto';
import { REPORT_PRICE_TINYBARS } from '../../src/config/pricing.js';
import { list } from '../../src/store/reports.js';
import { pooled } from '../../src/store/db.js';
import { close as closeReports } from '../../src/store/reports.js';
import {
  QUOTE_TTL_SECONDS, close as closeQuotes, isLive, quote, quoteAmount, quoteById,
} from '../../src/payments/quotes.js';

/** Hedera's transaction validity window. A quote must not outlive it. */
const VALIDITY_WINDOW_SECONDS = 120;

let failures = 0;
const must = (label: string, ok: boolean, detail = ''): void => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? '✅' : '⛔'} ${label}${detail ? `  ${detail}` : ''}`);
};

const sql = pooled();
const created: string[] = [];

try {
  const reports = await list(1);
  if (!reports.length) { console.error('STOP  no reports in the store to quote.'); process.exit(1); }
  const hash = reports[0]!.hash;
  console.log(`\n── quoting ${hash.slice(0, 16)}…  (price constant ${REPORT_PRICE_TINYBARS} tinybars)`);

  // ── 1 · round trip, and the expiry is inside the window ────────────────────────────────────────
  console.log('\n1 · a quote round-trips, and its expiry is inside the validity window');
  const q = await quote(hash);
  must('quote returned', q !== null);
  if (!q) throw new Error('no quote');
  created.push(q.id);

  const back = await quoteById(q.id);
  must('reads back by id', back !== null && back.id === q.id);
  must('price is the constant, unchanged', q.priceTinybars === REPORT_PRICE_TINYBARS, q.priceTinybars);
  must('price is a string, not a number', typeof q.priceTinybars === 'string', `typeof=${typeof q.priceTinybars}`);
  must('state is open', q.state === 'open', q.state);

  const ttl = (q.expiresAt.getTime() - q.createdAt.getTime()) / 1000;
  must(`TTL is ${QUOTE_TTL_SECONDS}s`, Math.abs(ttl - QUOTE_TTL_SECONDS) < 2, `measured ${ttl.toFixed(1)}s`);
  must(`inside Hedera's ~${VALIDITY_WINDOW_SECONDS}s window`, ttl < VALIDITY_WINDOW_SECONDS,
    `${ttl.toFixed(1)}s < ${VALIDITY_WINDOW_SECONDS}s, ${(VALIDITY_WINDOW_SECONDS - ttl).toFixed(1)}s of headroom`);
  must('live right now', isLive(q));

  // ⚠️ The AssetAmount comes from the QUOTE, not from the constant — see `quoteAmount`.
  const amount = quoteAmount(q, '0.0.0');
  must('quoteAmount uses the frozen price', amount.amount === q.priceTinybars, JSON.stringify(amount));

  // ── 2 · an unknown report declines at the boundary ─────────────────────────────────────────────
  console.log('\n2 · a report that does not exist returns nothing, not a foreign-key error');
  const absent = `${'0'.repeat(63)}1`;
  let threw: Error | null = null;
  let none: unknown = 'not run';
  try { none = await quote(absent); } catch (e) { threw = e as Error; }
  must('returned null', none === null, `got ${JSON.stringify(none)}`);
  must('did NOT throw a constraint violation', threw === null, threw ? threw.message.slice(0, 80) : '');

  // ── 3 · quoting twice ──────────────────────────────────────────────────────────────────────────
  console.log('\n3 · the same report quoted twice');
  const q2 = await quote(hash);
  if (q2 && q2.id !== q.id) created.push(q2.id);
  must('same price', q2?.priceTinybars === q.priceTinybars, `${q.priceTinybars} / ${q2?.priceTinybars}`);
  must('the SAME ROW is reused — no second row', q2?.id === q.id, `${q.id.slice(0, 8)}… / ${q2?.id.slice(0, 8)}…`);
  const [{ n }] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM quotes WHERE report_hash = ${hash} AND state = 'open' AND expires_at > now()`;
  must('exactly one live quote for this report', n === 1, `${n} row(s)`);

  // ── 4 · expired is distinguishable from live ───────────────────────────────────────────────────
  // ⚠️ Written with raw SQL because `quote()` has no way to mint an expired row and should not gain
  // one — the same reasoning `demo/store.ts` gives for writing a bad row directly.
  console.log('\n4 · an expired quote is distinguishable from a live one');
  const staleId = randomUUID();
  created.push(staleId);
  await sql`
    INSERT INTO quotes (id, report_hash, price_tinybars, expires_at)
    VALUES (${staleId}, ${hash}, ${REPORT_PRICE_TINYBARS}, now() - interval '10 seconds')`;
  const stale = await quoteById(staleId);
  must('the stale row loads', stale !== null);
  if (stale) {
    must('state is still "open" — nothing sweeps', stale.state === 'open', stale.state);
    must('isLive() says NOT live', !isLive(stale), `expired ${((Date.now() - stale.expiresAt.getTime()) / 1000).toFixed(0)}s ago`);
    must('the live one is still live', isLive(q));
    must('liveness comes from time, not from state', stale.state === q.state && isLive(q) !== isLive(stale),
      `both state="${q.state}", isLive ${isLive(q)} vs ${isLive(stale)}`);
  }
  // And an expired quote must not be reused by a later call.
  const q3 = await quote(hash);
  if (q3 && !created.includes(q3.id)) created.push(q3.id);
  must('a later quote does not reuse the expired row', q3?.id !== staleId, `${q3?.id.slice(0, 8)}…`);
} finally {
  // ⚠️ Inside the `finally`, so a failed assertion above still leaves the table as it was found.
  if (created.length) await sql`DELETE FROM quotes WHERE id IN ${sql(created)}`;
  const [{ n }] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM quotes`;
  console.log(`\n  cleaned up ${created.length} row(s); quotes now holds ${n}`);
  await sql.end();
  await closeQuotes();
  await closeReports();
}

console.log(`\n${failures === 0 ? 'PASS' : `FAIL — ${failures} assertion(s)`}\n`);
process.exit(failures === 0 ? 0 : 1);

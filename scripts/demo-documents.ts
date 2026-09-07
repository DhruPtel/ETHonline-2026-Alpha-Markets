// Unit 4's proof. Every document against one deployment per live schema version — five
// versions, five deployments — printing what came back and flagging every null.
//
// A null here does NOT mean a version mismatch: a field missing from a schema fails the
// whole query loudly. A null means the field exists and was never written, which is the
// morpho-blue revenue case.
import { querySubgraphs } from '../src/graph/client.js';
import {
  BALANCE_SHEET, MARKETS, FINANCIAL_SNAPSHOTS, STABLE_ORDER,
  type BalanceSheetResult, type MarketsResult, type FinancialSnapshotsResult,
} from '../src/graph/queries/index.js';

const REPS: [string, string][] = [
  ['3.1.0', 'aave-v3-ethereum'],
  ['2.0.1', 'compound-v2-ethereum'],
  ['3.0.1', 'maple-finance-v2-ethereum'],
  ['1.3.0', 'euler-finance-ethereum'],
  ['3.0.0', 'morpho-blue'],
];
const slugs = REPS.map(([, s]) => s);
const verOf = new Map(REPS.map(([v, s]) => [s, v]));
const pad = (s: string, n: number) => s.padEnd(n).slice(0, n);
const usd = (v: string | null) => (v == null ? 'NULL' : Number(v) >= 1e9 ? `$${(Number(v) / 1e9).toFixed(2)}B` : `$${(Number(v) / 1e6).toFixed(1)}M`);
const nullsIn = (o: Record<string, unknown>) => Object.entries(o).filter(([, v]) => v === null).map(([k]) => k);
let totalNulls = 0;

console.log('\n═══ 1 · balance-sheet ═══\n');
console.log(pad('version', 9) + pad('slug', 27) + pad('lendingType', 13) + pad('TVL', 11) + pad('deposits', 11) + pad('cumRevenue', 12) + 'nulls');
console.log('─'.repeat(110));
for (const o of await querySubgraphs<BalanceSheetResult>(slugs, BALANCE_SHEET)) {
  const v = verOf.get(o.slug)!;
  if (!o.ok) { console.log(pad(v, 9) + pad(o.slug, 27) + `✗ ${o.error.kind}: ${o.error.message.slice(0, 60)}`); continue; }
  const p = o.result.data.lendingProtocols[0]!;
  const n = nullsIn(p as unknown as Record<string, unknown>);
  totalNulls += n.length;
  console.log(pad(v, 9) + pad(o.slug, 27) + pad(p.lendingType ?? 'NULL', 13) + pad(usd(p.totalValueLockedUSD), 11) +
    pad(usd(p.totalDepositBalanceUSD), 11) + pad(usd(p.cumulativeTotalRevenueUSD), 12) + (n.length ? '⚠️ ' + n.join(', ') : '—'));
}

console.log('\n\n═══ 2 · markets (first 3, paged on the stable key) ═══\n');
console.log(pad('version', 9) + pad('slug', 27) + pad('rows', 6) + pad('market', 26) + pad('token', 8) + pad('balance', 13) + pad('rates', 7) + 'nulls');
console.log('─'.repeat(120));
for (const o of await querySubgraphs<MarketsResult>(slugs, MARKETS, { first: 3, skip: 0, ...STABLE_ORDER })) {
  const v = verOf.get(o.slug)!;
  if (!o.ok) { console.log(pad(v, 9) + pad(o.slug, 27) + `✗ ${o.error.kind}: ${o.error.message.slice(0, 70)}`); continue; }
  const ms = o.result.data.markets;
  const m = ms[0];
  if (!m) { console.log(pad(v, 9) + pad(o.slug, 27) + pad('0', 6) + '(no markets)'); continue; }
  const n = nullsIn(m as unknown as Record<string, unknown>);
  totalNulls += n.length;
  console.log(pad(v, 9) + pad(o.slug, 27) + pad(String(ms.length), 6) + pad(m.name ?? 'NULL', 26) +
    pad(m.inputToken?.symbol ?? 'NULL', 8) + pad(m.inputTokenBalance ?? 'NULL', 13) +
    pad(String(m.rates.length), 7) + (n.length ? '⚠️ ' + n.join(', ') : '—'));
}

const end = Math.floor(Date.now() / 1000);
const start = end - 7 * 86_400;
console.log(`\n\n═══ 3 · financial-snapshots (7 days, both bounds) ═══\n`);
console.log(pad('version', 9) + pad('slug', 27) + pad('rows', 6) + pad('in window', 11) + pad('latest TVL', 12) + pad('dailyRevenue', 14) + 'nulls');
console.log('─'.repeat(120));
for (const o of await querySubgraphs<FinancialSnapshotsResult>(slugs, FINANCIAL_SNAPSHOTS, { first: 10, skip: 0, startTimestamp: String(start), endTimestamp: String(end) })) {
  const v = verOf.get(o.slug)!;
  if (!o.ok) { console.log(pad(v, 9) + pad(o.slug, 27) + `✗ ${o.error.kind}: ${o.error.message.slice(0, 70)}`); continue; }
  const rows = o.result.data.financialsDailySnapshots;
  const inWindow = rows.every((r) => Number(r.timestamp) >= start && Number(r.timestamp) <= end);
  const r0 = rows[0];
  const n = r0 ? nullsIn(r0 as unknown as Record<string, unknown>) : [];
  totalNulls += n.length;
  console.log(pad(v, 9) + pad(o.slug, 27) + pad(String(rows.length), 6) + pad(rows.length ? (inWindow ? 'yes' : '⚠️ NO') : '—', 11) +
    pad(r0 ? usd(r0.totalValueLockedUSD) : '—', 12) + pad(r0 ? usd(r0.dailyTotalRevenueUSD) : '—', 14) +
    (n.length ? '⚠️ ' + n.join(', ') : '—'));
}
console.log(`\n${totalNulls} null field(s) across all three documents on all five versions.\n`);

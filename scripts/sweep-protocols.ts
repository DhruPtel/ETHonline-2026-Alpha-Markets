// Unit 5 — the sweep. Asks every deployment in config/protocols.ts whether it answers and
// what it says. It does not judge the numbers; that is triage, Unit 6.
//
// ⚠️ The balance-sheet document is INLINE here rather than imported. Unit 4 was never built —
// `src/graph/queries/` does not exist — so there is nothing to reuse. Inlining keeps this
// throwaway script from pre-empting Unit 4's still-open decision about how the documents
// cover five live schema versions. This sweep is what tells us that.
import { querySubgraphs, type QueryOutcome } from '../src/graph/client.js';
import { PROTOCOLS } from '../src/config/protocols.js';

// Tier 1 — the two fields every version that answered Unit 3 already served.
const PROBE = `query { lendingProtocols(first: 1) { name schemaVersion } }`;
// Tier 2 — the balance sheet. A field absent from a schema makes this whole query fail with
// "has no field", which is how we learn the intersection: loudly, per deployment.
const SHEET = `query {
  lendingProtocols(first: 1) {
    name schemaVersion
    totalDepositBalanceUSD totalBorrowBalanceUSD totalValueLockedUSD
    cumulativeTotalRevenueUSD
  }
}`;

type Sheet = { lendingProtocols: Record<string, string | null>[] };
const slugs = PROTOCOLS.map((p) => p.slug);

const head = await (async () => {
  const url = process.env.ETHEREUM_RPC_URL;
  if (!url) return null;
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }) });
  return Number((await r.json() as { result: string }).result);
})();

const t0 = Date.now();
const [probes, sheets] = await Promise.all([
  querySubgraphs<Sheet>(slugs, PROBE),
  querySubgraphs<Sheet>(slugs, SHEET),
]);
const elapsed = Date.now() - t0;
const byslug = <T>(rs: QueryOutcome<T>[]) => new Map(rs.map((r) => [r.slug, r]));
const P = byslug(probes), S = byslug(sheets);

const NUMERIC = ['totalDepositBalanceUSD', 'totalBorrowBalanceUSD', 'totalValueLockedUSD', 'cumulativeTotalRevenueUSD'];
const now = Math.floor(Date.now() / 1000);

type Row = { slug: string; live: string | null; deposits: number | null; borrows: number | null;
  block: number | null; behind: number | null; lagSec: number | null; errs: boolean | null;
  nulls: string[]; status: string; note: string };

const rows: Row[] = slugs.map((slug) => {
  const p = P.get(slug)!, s = S.get(slug)!;
  const lp = p.ok ? p.result.data.lendingProtocols?.[0] : undefined;
  const sp = s.ok ? s.result.data.lendingProtocols?.[0] : undefined;
  const meta = p.ok ? p.result.meta : s.ok ? s.result.meta : null;
  const nulls = sp ? NUMERIC.filter((f) => sp[f] === null) : [];
  const num = (v: string | null | undefined) => (v == null ? null : Number(v));
  const status = !p.ok && !s.ok
    ? (p.error.message.includes('no status') || p.error.message.includes('not available') ? 'no_indexers' : 'error')
    : 'live';
  const note = p.ok ? (s.ok ? '' : `sheet: ${s.error.message.slice(0, 64)}`) : p.error.message.slice(0, 64);
  return {
    slug, live: lp?.schemaVersion ?? sp?.schemaVersion ?? null,
    deposits: num(sp?.totalDepositBalanceUSD), borrows: num(sp?.totalBorrowBalanceUSD),
    block: meta?.blockNumber ?? null, behind: head && meta ? head - meta.blockNumber : null,
    lagSec: meta?.blockTimestamp ? now - meta.blockTimestamp : null,
    errs: meta?.hasIndexingErrors ?? null, nulls, status, note,
  };
});
rows.sort((a, b) => (b.deposits ?? -1) - (a.deposits ?? -1));

const pad = (s: string, n: number) => s.padEnd(n).slice(0, n);
const lpad = (s: string, n: number) => s.padStart(n).slice(-n);
const usd = (v: number | null) => (v == null ? '—' : v >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : `$${(v / 1e6).toFixed(1)}M`);
const lag = (s: number | null) => (s == null ? '—' : s < 3600 ? `${Math.round(s / 60)}m` : `${(s / 3600).toFixed(1)}h`);

console.log(`\nchain head ${head ?? '(no RPC)'} · swept ${slugs.length} deployments in ${elapsed}ms\n`);
console.log(pad('slug', 27) + pad('live', 8) + lpad('deposits', 10) + lpad('borrows', 10) +
  lpad('block', 11) + lpad('behind', 8) + lpad('lag', 7) + '  ' + pad('status', 12) + 'nulls / note');
console.log('─'.repeat(130));
for (const r of rows) {
  console.log(pad(r.slug, 27) + pad(r.live ?? '—', 8) + lpad(usd(r.deposits), 10) + lpad(usd(r.borrows), 10) +
    lpad(r.block ? String(r.block) : '—', 11) + lpad(r.behind == null ? '—' : String(r.behind), 8) +
    lpad(lag(r.lagSec), 7) + '  ' + pad(r.status + (r.errs ? ' ⚠err' : ''), 12) +
    (r.nulls.length ? `NULL: ${r.nulls.join(', ')}` : r.note));
}
console.log('─'.repeat(130));

const answered = rows.filter((r) => r.status === 'live');
const laggingHr = answered.filter((r) => (r.lagSec ?? 0) > 3600);
const withNulls = answered.filter((r) => r.nulls.length > 0);
const noSheet = answered.filter((r) => r.deposits == null);
console.log(`\n${answered.length} of ${rows.length} answered · ${laggingHr.length} lagging > 1h · ${withNulls.length} returned nulls where figures were expected`);
if (noSheet.length) console.log(`${noSheet.length} answered the probe but not the balance sheet: ${noSheet.map((r) => r.slug).join(', ')}`);
const dist: Record<string, number> = {};
for (const r of answered) if (r.live) dist[r.live] = (dist[r.live] ?? 0) + 1;
console.log('live schema versions:', JSON.stringify(dist));

console.log('\n--- config patch (slug, liveSchemaVersion, status, lastSwept) ---');
const today = new Date().toISOString().slice(0, 10);
console.log(JSON.stringify(rows.map((r) => [r.slug, r.live, r.status, r.status === 'live' ? today : today]), null, 0));

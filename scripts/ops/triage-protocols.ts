// Unit 6 — triage. The sweep asked who answers; this asks whose numbers we could publish.
// Answering is not the same as being right: aave-v3 answers beautifully and its revenue
// reads $279 quadrillion.
//
// ⚠️ This measures. It fixes nothing and encodes nothing — the adapter does that (Unit 10).
import { writeFileSync } from 'node:fs';
import { querySubgraphs } from '../../src/graph/client.js';
import { PROTOCOLS } from '../../src/config/protocols.js';
import {
  BALANCE_SHEET, MARKETS, FINANCIAL_SNAPSHOTS, FIRST_PAGE,
  type BalanceSheetResult, type MarketsResult, type FinancialSnapshotsResult,
} from '../../src/graph/queries/index.js';

// DefiLlama is a REFERENCE, not a data source — nothing is built on it and no figure it
// returns reaches a report. `null` means no confident match, which becomes NOT_CHECKED
// rather than a pass. Matching a lending subgraph to a differently-scoped DefiLlama entry
// would manufacture a disagreement that says nothing about either.
const LLAMA: Record<string, string | null> = {
  'aave-v3-ethereum': 'aave-v3', 'aave-v2-ethereum': 'aave-v2', 'aave-arc-ethereum': 'aave-arc',
  'aave-amm-ethereum': null, 'aave-rwa-ethereum': null,
  'compound-v3-ethereum': 'compound-v3', 'compound-v2-ethereum': 'compound-v2',
  'morpho-blue': 'morpho-blue', 'morpho-aave-v2-ethereum': 'morpho-optimizer-aavev2',
  'morpho-aave-v3-ethereum': 'morpho-optimizer-aavev3', 'spark-lend-ethereum': 'sparklend',
  'euler-finance-ethereum': 'euler-v1', 'makerdao-ethereum': 'sky-lending',
  'liquity-ethereum': 'liquity-v1', 'goldfinch-ethereum': 'goldfinch', 'truefi-ethereum': 'truefi',
  'maple-finance-v2-ethereum': 'maple', 'maple-finance-v1-ethereum': null,
  'rari-fuse-ethereum': null, // `rari-capital` is a Yield Aggregator, not the Fuse pools
  'iron-bank-ethereum': 'iron-bank', 'cream-finance-ethereum': 'cream-lending',
  'dforce-ethereum': 'dforce-lending', 'qidao-ethereum': 'qidao',
  'uwu-lend-ethereum': 'uwu-lend', 'zerolend-ethereum': 'zerolend-lending',
};
const ABSURD = 1e12;          // no lending protocol has earned a trillion dollars
const NOISE_FLOOR = 1_000_000; // a percentage gap between two near-zero numbers means nothing
const GAP_OK = 0.05, GAP_BAD = 0.30;

export type TriageVerdict = 'publishable' | 'flagged' | 'unusable';

const live = PROTOCOLS.filter((p) => p.status === 'live');
const slugs = live.map((p) => p.slug);
const end = Math.floor(Date.now() / 1000), start = end - 7 * 86_400;

const llama = new Map<string, number>();
for (const p of (await (await fetch('https://api.llama.fi/protocols')).json()) as { slug: string; chainTvls?: Record<string, number> }[])
  if (p.chainTvls?.Ethereum != null) llama.set(p.slug, p.chainTvls.Ethereum);

const [sheets, snaps, mkts] = await Promise.all([
  querySubgraphs<BalanceSheetResult>(slugs, BALANCE_SHEET),
  querySubgraphs<FinancialSnapshotsResult>(slugs, FINANCIAL_SNAPSHOTS, { first: 10, skip: 0, startTimestamp: String(start), endTimestamp: String(end) }),
  querySubgraphs<MarketsResult>(slugs, MARKETS, { first: 100, lastId: FIRST_PAGE }),
]);
const idx = <T>(a: { ok: boolean; slug: string }[]) => new Map(a.map((r) => [r.slug, r as T]));
const S = idx<(typeof sheets)[number]>(sheets), N = idx<(typeof snaps)[number]>(snaps), M = idx<(typeof mkts)[number]>(mkts);

type Report = { slug: string; type: string | null; deposits: number | null; borrows: number | null;
  util: number | null; llamaTvl: number | null; gap: number | null; recon: string;
  snapshots: number | null; revenue: string; at100: number | null; verdict: TriageVerdict; why: string[]; balanceReady: boolean };

const rows: Report[] = live.map((cfg) => {
  const s = S.get(cfg.slug)!, n = N.get(cfg.slug)!, m = M.get(cfg.slug)!;
  const why: string[] = [];
  const p = s.ok ? s.result.data.lendingProtocols[0] : undefined;
  const num = (v: string | null | undefined) => (v == null ? null : Number(v));
  const deposits = num(p?.totalDepositBalanceUSD), borrows = num(p?.totalBorrowBalanceUSD);
  const util = deposits && borrows != null && deposits > 0 ? borrows / deposits : null;

  // 1 · external reconciliation
  const key = LLAMA[cfg.slug] ?? null;
  const llamaTvl = key ? (llama.get(key) ?? null) : null;
  const net = deposits != null && borrows != null ? deposits - borrows : null;
  let gap: number | null = null, recon = 'NOT_CHECKED';
  if (cfg.lendingType === 'CDP') why.push('recon NOT_CHECKED: CDP, deposits−borrows is a POOLED convention');
  else if (!key) why.push('recon NOT_CHECKED: no confident DefiLlama match');
  else if (llamaTvl == null) why.push(`recon NOT_CHECKED: DefiLlama has no Ethereum TVL for ${key}`);
  else if (net == null) why.push('recon NOT_CHECKED: no balance sheet');
  else if (Math.abs(net) < NOISE_FLOOR && llamaTvl < NOISE_FLOOR) why.push('recon NOT_CHECKED: both sides below $1M');
  else {
    gap = Math.abs(net - llamaTvl) / Math.max(llamaTvl, NOISE_FLOOR);
    recon = gap <= GAP_OK ? 'ok' : gap <= GAP_BAD ? 'wide' : 'broken';
    if (recon !== 'ok') why.push(`recon ${recon}: ours $${(net / 1e6).toFixed(1)}M vs DefiLlama $${(llamaTvl / 1e6).toFixed(1)}M (${(gap * 100).toFixed(0)}%)`);
  }

  // 2 · internal plausibility
  if (util != null && util > 1) why.push(`utilization ${(util * 100).toFixed(0)}% — borrows exceed deposits`);
  const rowsM = m.ok ? m.result.data.markets : null;
  const at100 = rowsM ? rowsM.filter((k) => Number(k.totalBorrowBalanceUSD) > 0 && k.totalBorrowBalanceUSD === k.totalDepositBalanceUSD).length : null;
  if (at100) why.push(`${at100} market(s) at exactly 100% utilization`);

  // 3 · snapshot availability
  const snapshots = n.ok ? n.result.data.financialsDailySnapshots.length : null;
  if (snapshots === 0) why.push('no daily history in the last 7 days — cannot back a period question');
  if (snapshots == null) why.push('snapshots NOT_CHECKED: query failed');

  // 4 · revenue sanity (deferred, but recorded)
  const rev = num(p?.cumulativeTotalRevenueUSD);
  const revenue = rev == null ? 'NOT_CHECKED' : rev > ABSURD ? 'absurd' : rev === 0 ? 'zero' : 'plausible';
  if (revenue === 'absurd') why.push(`revenue absurd: $${rev!.toExponential(2)}`);
  if (revenue === 'zero') why.push('revenue zero — never written');

  const verdict: TriageVerdict =
    !p || deposits == null ? 'unusable'
    : (util != null && util > 1) || recon === 'broken' || deposits === 0 ? 'unusable'
    : why.length ? 'flagged' : 'publishable';
  // Revenue is deferred out of Phase 1 and gated by `RevenueAvailability`, so a deployment
  // flagged ONLY on revenue can still carry a balance report. That is the number that matters
  // for what we are actually building now.
  const balanceReady = verdict === 'publishable' || (verdict === 'flagged' && why.every((w) => w.startsWith('revenue')));
  return { slug: cfg.slug, type: cfg.lendingType, deposits, borrows, util, llamaTvl, gap, recon, snapshots, revenue, at100, verdict, why, balanceReady };
});
rows.sort((a, b) => (b.deposits ?? -1) - (a.deposits ?? -1));

const pad = (s: string, n: number) => s.padEnd(n).slice(0, n);
const usd = (v: number | null) => (v == null ? '—' : Math.abs(v) >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : `$${(v / 1e6).toFixed(1)}M`);
const ICON = { publishable: '✅', flagged: '⚠️ ', unusable: '⛔' };
console.log(`\ntriage of ${rows.length} deployments that answered\n`);
console.log(pad('deployment', 27) + pad('type', 7) + pad('deposits', 10) + pad('util', 7) + pad('recon', 9) + pad('snaps', 7) + pad('revenue', 11) + 'verdict');
console.log('─'.repeat(120));
for (const r of rows) console.log(pad(r.slug, 27) + pad(r.type ?? '—', 7) + pad(usd(r.deposits), 10) +
  pad(r.util == null ? '—' : `${(r.util * 100).toFixed(0)}%`, 7) + pad(r.recon, 9) +
  pad(r.snapshots == null ? '—' : String(r.snapshots), 7) + pad(r.revenue, 11) + ICON[r.verdict] + ' ' + r.verdict);
console.log('─'.repeat(120));
const count = (v: TriageVerdict) => rows.filter((r) => r.verdict === v).length;
console.log(`\n${count('publishable')} publishable · ${count('flagged')} flagged · ${count('unusable')} unusable — of ${rows.length} that answered, out of ${PROTOCOLS.length} configured`);
const ready = rows.filter((r) => r.balanceReady);
console.log(`${ready.length} can carry a BALANCE report (revenue is deferred and gated): ${ready.map((r) => r.slug).join(', ')}\n`);
for (const r of rows.filter((x) => x.why.length)) console.log(`  ${pad(r.slug, 27)}${r.why.join('; ')}`);
console.log('\n--- config patch ---');
console.log(JSON.stringify(rows.map((r) => [r.slug, r.verdict])));
writeFileSync('/tmp/triage.json', JSON.stringify(rows));

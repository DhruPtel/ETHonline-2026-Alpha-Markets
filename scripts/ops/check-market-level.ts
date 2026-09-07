// What triage said, against what market-level inspection says.
//
// Triage (Unit 6) judged each deployment from its PROTOCOL TOTALS — an external reconciliation, a
// utilization ratio, a snapshot count. It never walked the markets. The adapter does, and on
// compound-v3 it found a live DATA_ERROR on a deployment triage had cleared as `publishable`.
//
// ⚠️ This measures the GAP between those two views. It is not a new check — it runs the same
// `adapt()` every report will run, over a real market population, and reports where the two
// disagree. The gap is the finding.
import { querySubgraph } from '../../src/graph/client.js';
import { paginate } from '../../src/graph/paginate.js';
import { adapt } from '../../src/graph/adapter.js';
import { BALANCE_SHEET, MARKETS, type BalanceSheetResult, type MarketRow } from '../../src/graph/queries/index.js';
import { PROTOCOLS } from '../../src/config/protocols.js';

const MAX_PAGES = 8; // 2,000 markets — enough to exhaust every deployment measured in Unit 7
const live = PROTOCOLS.filter((p) => p.status === 'live');
const pad = (s: string, n: number) => s.padEnd(n).slice(0, n);
const lpad = (s: string, n: number) => s.padStart(n).slice(-n);

type Row = { slug: string; triage: string | null; markets: number; completeness: string;
  dataErrors: number; signals: number; inconsistencies: number; informational: number; reasons: string[] };

const rows: Row[] = [];
for (const cfg of live) {
  try {
    const sheet = await querySubgraph<BalanceSheetResult>(cfg.slug, BALANCE_SHEET);
    const walk = await paginate<MarketRow>(cfg.slug, MARKETS, 'markets', {}, { maxPages: MAX_PAGES });
    const { findings } = adapt({
      slug: cfg.slug, protocol: sheet.data.lendingProtocols[0]!, meta: sheet.meta,
      markets: walk.rows, completeness: walk.completeness,
      provenance: { deployment: sheet.meta.deployment, block: sheet.meta.blockNumber, timestamp: sheet.fetchedAt, document: 'balance-sheet', variables: {} },
    });
    const by = (sev: string) => findings.filter((f) => f.severity === sev);
    rows.push({
      slug: cfg.slug, triage: cfg.triageVerdict, markets: walk.rows.length, completeness: walk.completeness,
      dataErrors: by('DATA_ERROR').length, signals: by('SIGNAL').length,
      inconsistencies: by('INCONSISTENCY').length, informational: by('INFORMATIONAL').length,
      reasons: by('DATA_ERROR').map((f) => f.rationale),
    });
  } catch (e) {
    rows.push({ slug: cfg.slug, triage: cfg.triageVerdict, markets: 0, completeness: 'error',
      dataErrors: 0, signals: 0, inconsistencies: 0, informational: 0, reasons: [(e as Error).message.slice(0, 70)] });
  }
}
rows.sort((a, b) => b.dataErrors - a.dataErrors || a.slug.localeCompare(b.slug));

console.log(`\nmarket-level inspection of ${live.length} live deployments (page budget ${MAX_PAGES})\n`);
console.log(pad('deployment', 27) + pad('triage', 13) + lpad('markets', 8) + pad('  population', 14) + lpad('DATA_ERR', 9) + lpad('SIGNAL', 8) + lpad('INCONS', 8));
console.log('─'.repeat(88));
for (const r of rows) console.log(pad(r.slug, 27) + pad(r.triage ?? '—', 13) + lpad(String(r.markets), 8) +
  pad('  ' + r.completeness, 14) + lpad(String(r.dataErrors), 9) + lpad(String(r.signals), 8) + lpad(String(r.inconsistencies), 8));
console.log('─'.repeat(88));

// ── the gap ──────────────────────────────────────────────────────────────────────────────
const cleared = rows.filter((r) => r.triage === 'publishable' || r.triage === 'flagged');
const clearedWithErrors = cleared.filter((r) => r.dataErrors > 0);
const unusableWithoutErrors = rows.filter((r) => r.triage === 'unusable' && r.dataErrors === 0);
const incomplete = rows.filter((r) => r.completeness !== 'complete');

console.log(`\n${rows.length} deployments walked · ${rows.reduce((a, r) => a + r.markets, 0).toLocaleString()} markets read`);
console.log(`\n⚠️  THE GAP — deployments triage cleared that carry a market-level DATA_ERROR: ${clearedWithErrors.length} of ${cleared.length}`);
for (const r of clearedWithErrors) {
  console.log(`\n  ${r.slug}  (triage: ${r.triage})`);
  for (const why of r.reasons) console.log(`    ⛔ ${why}`);
}
if (!clearedWithErrors.length) console.log('  none.');

console.log(`\n  deployments triage called unusable that show no market-level DATA_ERROR: ${unusableWithoutErrors.length}`);
console.log(`  (triage judged those on protocol totals — external gaps, inverted balances, empty books — not on oracle state)`);
if (incomplete.length) console.log(`\n  ⚠️  ${incomplete.length} population(s) not exhausted at ${MAX_PAGES} pages: ${incomplete.map((r) => `${r.slug} (${r.completeness})`).join(', ')}`);
console.log(`\n⚠️  Under the amended §5.13 a DATA_ERROR blocks the FIGURE it touches, not the report — so`);
console.log(`   the count above is not "reports blocked". It is the number of deployments where a report`);
console.log(`   ABOUT the affected figure would be blocked, and every other figure still publishes.\n`);

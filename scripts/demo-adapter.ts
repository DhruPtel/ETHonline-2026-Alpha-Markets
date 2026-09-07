// Unit 10's proof. Real numbers through the adapter — nothing corrected, everything annotated.
import { querySubgraph } from '../src/graph/client.js';
import { paginate } from '../src/graph/paginate.js';
import { adapt, type Finding } from '../src/graph/adapter.js';
import { BALANCE_SHEET, MARKETS, type BalanceSheetResult, type MarketRow } from '../src/graph/queries/index.js';
import { PROTOCOLS } from '../src/config/protocols.js';

const SET = ['aave-v3-ethereum', 'aave-v2-ethereum', 'compound-v3-ethereum', 'compound-v2-ethereum', 'spark-lend-ethereum', 'morpho-blue'];
const ICON: Record<Finding['severity'], string> = { DATA_ERROR: '⛔', INCONSISTENCY: '⚠️ ', SIGNAL: '📣', INFORMATIONAL: '· ' };
const usd = (v: string | null) => (v == null ? 'unavailable' : Number(v) >= 1e9 ? `$${(Number(v) / 1e9).toFixed(2)}B` : `$${(Number(v) / 1e6).toFixed(1)}M`);
const tally: Record<string, number> = {};

for (const slug of SET) {
  const cfg = PROTOCOLS.find((p) => p.slug === slug)!;
  const sheet = await querySubgraph<BalanceSheetResult>(slug, BALANCE_SHEET);
  const page = await paginate<MarketRow>(slug, MARKETS, 'markets', {}, { maxPages: 10 });
  const { computed, findings } = adapt({
    slug, protocol: sheet.data.lendingProtocols[0]!, meta: sheet.meta,
    markets: page.rows, completeness: page.completeness,
    provenance: { deployment: sheet.meta.deployment, block: sheet.meta.blockNumber,
      timestamp: new Date().toISOString(), document: 'balance-sheet', variables: {} },
  });
  console.log(`\n${slug}  —  ${cfg.liveSchemaVersion} · revenue ${cfg.revenueAvailability} · basis ${cfg.depositBasis} · ${page.rows.length} markets ${page.completeness}`);
  console.log(`  TVL          ${usd(computed.figures.totalValueLockedUSD!.value)}`);
  console.log(`  deposits     ${usd(computed.figures.totalDepositBalanceUSD!.value)}`);
  console.log(`  borrows      ${usd(computed.figures.totalBorrowBalanceUSD!.value)}`);
  console.log(`  revenue      ${usd(computed.figures.cumulativeTotalRevenueUSD!.value)}   ← Computed.revenue = ${computed.revenue}`);
  for (const f of findings) { tally[f.severity] = (tally[f.severity] ?? 0) + 1;
    console.log(`  ${ICON[f.severity]} ${f.severity.padEnd(14)}${f.appliesTo.padEnd(26)}${f.rationale}`); }
  if (!findings.length) console.log('  ✅ no findings');
}
console.log('\n\n' + Object.entries(tally).map(([k, v]) => `${v} ${k}`).join(' · '));
console.log('\n⚠️  Every figure above is exactly what the deployment returned. Nothing was adjusted.\n');

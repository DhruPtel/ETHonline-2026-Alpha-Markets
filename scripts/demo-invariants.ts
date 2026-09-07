// Unit 4's proof. Which findings fire, at what severity, and what each one blocks.
import { querySubgraph } from '../src/graph/client.js';
import { paginate } from '../src/graph/paginate.js';
import { adapt } from '../src/graph/adapter.js';
import { check, blockedFigures, figureRef } from '../src/engine/invariants.js';
import { BALANCE_SHEET, MARKETS, type BalanceSheetResult, type MarketRow } from '../src/graph/queries/index.js';
import { PROTOCOLS } from '../src/config/protocols.js';

// ⚠️ The publishable five plus morpho-blue exercise only three of the five checks — none of them
// has inverted balances or an empty book. `truefi-ethereum` (187% utilization) and
// `zerolend-ethereum` ($0/$0) are added so every check fires against a real deployment rather than
// being asserted to work.
const SET = ['aave-v3-ethereum', 'aave-v2-ethereum', 'compound-v3-ethereum', 'compound-v2-ethereum',
  'spark-lend-ethereum', 'morpho-blue', 'truefi-ethereum', 'zerolend-ethereum'];
const ICON = { DATA_ERROR: '⛔', INCONSISTENCY: '⚠️ ', SIGNAL: '📣', INFORMATIONAL: '· ' } as const;
const pad = (s: string, n: number) => s.padEnd(n).slice(0, n);

for (const slug of SET) {
  const cfg = PROTOCOLS.find((p) => p.slug === slug)!;
  const sheet = await querySubgraph<BalanceSheetResult>(slug, BALANCE_SHEET);
  const walk = await paginate<MarketRow>(slug, MARKETS, 'markets', {}, { maxPages: 10 });
  const { computed } = adapt({
    slug, protocol: sheet.data.lendingProtocols[0]!, meta: sheet.meta,
    markets: walk.rows, completeness: walk.completeness,
    provenance: { deployment: sheet.meta.deployment, block: sheet.meta.blockNumber, timestamp: sheet.fetchedAt, document: 'balance-sheet', variables: {} },
  });
  const findings = check({ config: cfg, computed, markets: walk.rows });
  const blocked = blockedFigures(findings);

  console.log(`\n${slug}  —  basis ${cfg.depositBasis}, ${walk.rows.length} markets ${walk.completeness}`);
  if (!findings.length) console.log('  ✅ no findings');
  for (const f of findings) console.log(`  ${ICON[f.severity]} ${pad(f.severity, 14)}${pad(f.appliesTo, 44)}${f.rationale}`);

  // Blocking, per the amended §5.13 — the same deployment, two different subjects.
  for (const subject of ['totalDepositBalanceUSD', 'totalBorrowBalanceUSD']) {
    const ref = figureRef(slug, subject);
    const figureBlocked = blocked.includes(ref);
    console.log(`     subject=${pad(subject, 24)} → ${figureBlocked ? '⛔ REPORT BLOCKED (the subject figure is unreportable)' : blocked.length ? `publishes, withholding ${blocked.join(', ')}` : 'publishes whole'}`);
  }
}
console.log();

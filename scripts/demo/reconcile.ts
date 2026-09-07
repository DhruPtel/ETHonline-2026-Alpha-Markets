// Unit 5's proof. What "ties out" means, on real deployments.
//
// ⚠️ DefiLlama is fetched HERE, not in the engine. reconcile.ts takes the figure as an observation,
// so a published report never fails because a third party is down.
import { querySubgraph } from '../../src/graph/client.js';
import { paginate } from '../../src/graph/paginate.js';
import { adapt } from '../../src/graph/adapter.js';
import { check } from '../../src/engine/invariants.js';
import { corroborate } from '../../src/graph/corroborate.js';
import { reconcile, type ExternalReference } from '../../src/engine/reconcile.js';
import { BALANCE_SHEET, MARKETS, type BalanceSheetResult, type MarketRow } from '../../src/graph/queries/index.js';
import { PROTOCOLS } from '../../src/config/protocols.js';
import { net } from '../../src/engine/ops.js';

const LLAMA: Record<string, string> = {
  'aave-v3-ethereum': 'aave-v3', 'aave-v2-ethereum': 'aave-v2', 'compound-v3-ethereum': 'compound-v3',
  'compound-v2-ethereum': 'compound-v2', 'spark-lend-ethereum': 'sparklend', 'morpho-blue': 'morpho-blue',
};
const llama = new Map<string, number>();
for (const p of (await (await fetch('https://api.llama.fi/protocols')).json()) as { slug: string; chainTvls?: Record<string, number> }[])
  if (p.chainTvls?.Ethereum != null) llama.set(p.slug, p.chainTvls.Ethereum);

const ICON = { ties_out: '✅', consistent_only: '◻️ ', discrepancy: '⛔', not_checked: '· ' } as const;
const TIER = { 0: 'internal ', 1: 'chain    ', 2: 'external ' } as const;
const OUT = { agreed: '✅ agreed      ', disagreed: '⛔ disagreed   ', not_available: '·  unavailable' } as const;
const SET = ['aave-v3-ethereum', 'aave-v2-ethereum', 'spark-lend-ethereum', 'compound-v2-ethereum', 'compound-v3-ethereum', 'morpho-blue'];

for (const slug of SET) {
  const cfg = PROTOCOLS.find((p) => p.slug === slug)!;
  const sheet = await querySubgraph<BalanceSheetResult>(slug, BALANCE_SHEET);
  const walk = await paginate<MarketRow>(slug, MARKETS, 'markets', {}, { maxPages: 10 });
  const { computed } = adapt({
    slug, protocol: sheet.data.lendingProtocols[0]!, meta: sheet.meta, markets: walk.rows, completeness: walk.completeness,
    provenance: { deployment: sheet.meta.deployment, block: sheet.meta.blockNumber, timestamp: sheet.fetchedAt, document: 'balance-sheet', variables: {} },
  });
  const findings = check({ config: cfg, computed, markets: walk.rows });
  const corr = cfg.corroborationHint?.method ? await corroborate(slug, 3) : undefined;
  const tvl = llama.get(LLAMA[slug]!);
  const reference: ExternalReference | undefined = tvl == null ? undefined : { source: 'DefiLlama', netUSD: tvl.toFixed(2) };

  const r = reconcile({ config: cfg, computed, findings, corroboration: corr, reference, marketsRead: walk.rows.length });
  console.log(`\n${slug}`);
  for (const c of r.claims) console.log(`  ${TIER[c.tier]} ${OUT[c.outcome]}  ${c.rationale.slice(0, 128)}`);
  console.log(`  ${ICON[r.call]} ${r.call}${r.independentSources.length ? `  — independently verified by ${r.independentSources.join(' and ')}` : ''}`);
  console.log(`     coverage: ${r.coverage.marketsRead} markets read, ${r.coverage.marketsCorroborated} corroborated, population ${r.coverage.completeness}, ${r.coverage.checksRun}/${r.coverage.checksAvailable} checks ran`);
}

// ── the two verdicts the set above cannot reach ──────────────────────────────────────────────────
console.log('\n\n─── consistent_only and not_checked ───');
{
  const cfg = PROTOCOLS.find((p) => p.slug === 'compound-v2-ethereum')!;
  const sheet = await querySubgraph<BalanceSheetResult>(cfg.slug, BALANCE_SHEET);
  const walk = await paginate<MarketRow>(cfg.slug, MARKETS, 'markets', {}, { maxPages: 10 });
  const base = { slug: cfg.slug, protocol: sheet.data.lendingProtocols[0]!, meta: sheet.meta,
    provenance: { deployment: sheet.meta.deployment, block: sheet.meta.blockNumber, timestamp: sheet.fetchedAt, document: 'balance-sheet', variables: {} } };

  // No external reference — the position of the 20 deployments DefiLlama cannot match either.
  const full = adapt({ ...base, markets: walk.rows, completeness: walk.completeness });
  const a = reconcile({ config: cfg, computed: full.computed, findings: check({ config: cfg, computed: full.computed, markets: walk.rows }), marketsRead: walk.rows.length });
  console.log(`\n  compound-v2, no external reference supplied`);
  console.log(`  ${ICON[a.call]} ${a.call}   ← the common case, and a normal result`);
  console.log(`     ${a.claims.find((c) => c.tier === 0)!.rationale.slice(0, 100)}…`);

  // Incomplete population — nothing can be compared to anything.
  const partial = adapt({ ...base, markets: walk.rows.slice(0, 5), completeness: 'incomplete' });
  const b = reconcile({ config: cfg, computed: partial.computed, findings: [], marketsRead: 5 });
  console.log(`\n  compound-v2, population truncated`);
  console.log(`  ${ICON[b.call]} ${b.call}`);
  console.log(`     ${b.claims.find((c) => c.tier === 0)!.rationale}`);
}

console.log('\n\n─── what a report says plainly ───');
const corrob = PROTOCOLS.filter((p) => p.status === 'live' && p.corroborationHint?.method);
console.log(`\nThe strongest verification available — reading the contract at the block the subgraph wrote`);
console.log(`the value — works on ${corrob.length} of ${PROTOCOLS.filter((p) => p.status === 'live').length} live deployments: ${corrob.map((p) => p.slug).join(', ')}.`);
console.log(`Everywhere else the tie-out rests on an external reference, or on internal consistency alone.`);
console.log(`A narrow check we can defend beats a universal one that sounds authoritative and isn't.\n`);
void net;

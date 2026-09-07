// Unit 7's proof.
//
// ⚠️ The brief expected aave-v3 to have hundreds of markets. It has 67 — one page — so it does
// not exercise paging at all. morpho-blue does: 1,759 markets over 8 pages. It is `unusable`
// for publishing and a perfectly good population to walk.
import { paginate, PAGE_SIZE } from '../src/graph/paginate.js';
import { MARKETS, type MarketRow } from '../src/graph/queries/index.js';
import { PROTOCOLS } from '../src/config/protocols.js';

const pad = (s: string, n: number) => s.padEnd(n).slice(0, n);
const lpad = (s: string, n: number) => s.padStart(n).slice(-n);
const show = (label: string, r: Awaited<ReturnType<typeof paginate<MarketRow>>>) => {
  console.log(`  ${pad(label, 30)}rows ${lpad(String(r.rows.length), 5)}  pages ${lpad(String(r.pages), 2)}  ` +
    `dupes ${r.duplicatesDropped}  drift ${r.blockDrift}  ${r.completeness}`);
};

console.log(`\n1 · a population that actually pages — morpho-blue, page size ${PAGE_SIZE}\n`);
const t0 = Date.now();
const all = await paginate<MarketRow>('morpho-blue', MARKETS, 'markets');
show('default budget', all);
console.log(`  unique ids ${new Set(all.rows.map((r) => r.id)).size} of ${all.rows.length} rows · ${Date.now() - t0}ms`);
console.log(`  last page held ${all.rows.length - (all.pages - 1) * PAGE_SIZE} rows — SHORT, which is the proof it ran out`);

console.log(`\n\n2 · a budget too small to finish — must say incomplete, and count honestly\n`);
show('maxPages 3 (750 of 1759)', await paginate<MarketRow>('morpho-blue', MARKETS, 'markets', {}, { maxPages: 3 }));
console.log('  ⚠️  it reports what it got, not what is there. The set is unusable downstream.');

console.log(`\n\n3 · the boundary — a FULL last page proves nothing\n`);
show(`maxPages ${all.pages - 1} (full last page)`, await paginate<MarketRow>('morpho-blue', MARKETS, 'markets', {}, { maxPages: all.pages - 1 }));
show(`maxPages ${all.pages} (short last page)`, await paginate<MarketRow>('morpho-blue', MARKETS, 'markets', {}, { maxPages: all.pages }));
console.log('  ⚠️  same walk, one page apart. Stopping on a full page cannot distinguish "the end"');
console.log('     from "more to come", so it says incomplete — the honest answer, not a failure.');

console.log(`\n\n4 · small pages against a small population — paging works at any size\n`);
show('aave-v3, pageSize 25', await paginate<MarketRow>('aave-v3-ethereum', MARKETS, 'markets', {}, { pageSize: 25 }));
show('aave-v3, pageSize 25, cap 2', await paginate<MarketRow>('aave-v3-ethereum', MARKETS, 'markets', {}, { pageSize: 25, maxPages: 2 }));

console.log(`\n\n5 · the five deployments triage cleared for balance reports\n`);
console.log('  ' + pad('deployment', 24) + lpad('markets', 9) + lpad('pages', 7) + lpad('dupes', 7) + lpad('drift', 7) + '  completeness  verdict');
console.log('  ' + '─'.repeat(84));
for (const slug of ['aave-v3-ethereum', 'aave-v2-ethereum', 'compound-v3-ethereum', 'compound-v2-ethereum', 'spark-lend-ethereum']) {
  const r = await paginate<MarketRow>(slug, MARKETS, 'markets');
  const sorted = [...r.rows].sort((a, b) => Number(b.totalDepositBalanceUSD) - Number(a.totalDepositBalanceUSD));
  console.log('  ' + pad(slug, 24) + lpad(String(r.rows.length), 9) + lpad(String(r.pages), 7) +
    lpad(String(r.duplicatesDropped), 7) + lpad(String(r.blockDrift), 7) + '  ' + pad(r.completeness, 14) +
    PROTOCOLS.find((p) => p.slug === slug)!.triageVerdict);
  console.log('  ' + pad('', 24) + `largest: ${sorted[0]?.name} $${(Number(sorted[0]?.totalDepositBalanceUSD) / 1e6).toFixed(1)}M — ranking is only honest because the set is ${r.completeness}`);
}
console.log();

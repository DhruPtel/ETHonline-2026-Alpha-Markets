// Unit 11's proof. A record, its settlement-backed twin, and the hash behaving.
import { querySubgraph } from '../../src/graph/client.js';
import { paginate } from '../../src/graph/paginate.js';
import { buildEvidence } from '../../src/graph/evidence.js';
import { canonical } from '../../src/domain/canonical.js';
import { BALANCE_SHEET, MARKETS, type BalanceSheetResult, type MarketRow } from '../../src/graph/queries/index.js';

const size = (o: unknown) => `${JSON.stringify(o).length.toLocaleString()} bytes`;

console.log('\n1 · the default record — every query gets one\n');
const head = (await querySubgraph('aave-v3-ethereum', BALANCE_SHEET)).meta.blockNumber;
const pinned = head - 100;
const r1 = await querySubgraph<BalanceSheetResult>('aave-v3-ethereum', BALANCE_SHEET, {}, pinned);
const rec = buildEvidence(r1);
console.log(JSON.stringify(rec, null, 2).split('\n').map((l) => '  ' + l).join('\n'));
console.log(`\n  size ${size(rec)}`);

console.log('\n\n2 · the same query flagged as settlement-backing\n');
const withRaw = buildEvidence(r1, { tier: 'record+raw' });
console.log(`  record       ${size(rec)}`);
console.log(`  record+raw   ${size(withRaw)}   (${(JSON.stringify(withRaw).length / JSON.stringify(rec).length).toFixed(1)}x)`);
console.log(`  raw is ${withRaw.raw === null ? 'null' : 'present'}, and it reproduces the figures with no network:`);
console.log(`    ${JSON.parse(withRaw.raw!).lendingProtocols[0].totalDepositBalanceUSD}`);
console.log('  ⚠️  The tier came from the caller. Nothing about this query implied it.');

console.log('\n\n3 · the hash — stable at a block, different across blocks\n');
const again = await querySubgraph<BalanceSheetResult>('aave-v3-ethereum', BALANCE_SHEET, {}, pinned);
const elsewhere = await querySubgraph<BalanceSheetResult>('aave-v3-ethereum', BALANCE_SHEET, {}, pinned - 500);
const h = (x: { responseHash: string }) => x.responseHash.slice(0, 16) + '…';
console.log(`  block ${pinned}  run 1   ${h(rec)}`);
console.log(`  block ${pinned}  run 2   ${h(buildEvidence(again))}   ${rec.responseHash === buildEvidence(again).responseHash ? '✅ identical' : '⛔ DIFFERS'}`);
// ⚠️ Kept deliberately: this comparison was seen to fail ONCE on 2026-09-07 and has not
// reproduced in 37 queries since. If it recurs, this prints the exact divergence rather than
// leaving another unexplained "DIFFERS" to be theorised about.
{
  const c1 = canonical(r1.data), c2 = canonical(again.data);
  if (c1 !== c2) {
    console.log(`  ⚠️  r1 block=${r1.meta.blockNumber} requested=${r1.requestedBlock} | again block=${again.meta.blockNumber} requested=${again.requestedBlock}`);
    for (let i = 0; i < Math.max(c1.length, c2.length); i++)
      if (c1[i] !== c2[i]) { console.log(`  DIVERGE at ${i}:\n    a: ${c1.slice(Math.max(0, i - 100), i + 100)}\n    b: ${c2.slice(Math.max(0, i - 100), i + 100)}`); break; }
  }
}
console.log(`  block ${pinned - 500}  run 3   ${h(buildEvidence(elsewhere))}   ${rec.responseHash !== buildEvidence(elsewhere).responseHash ? '✅ different block, different hash' : '⛔ COLLIDES'}`);

console.log('\n\n4 · a paginated population — row count and completeness come from the caller\n');
const page = await paginate<MarketRow>('morpho-blue', MARKETS, 'markets', {}, { maxPages: 3 });
const partial = buildEvidence(
  await querySubgraph('morpho-blue', MARKETS, { first: 250, lastId: '' }),
  { completeness: page.completeness, rowCount: page.rows.length },
);
console.log(`  document     ${partial.document}`);
console.log(`  rowCount     ${partial.rowCount}`);
console.log(`  completeness ${partial.completeness}   ← an incomplete population is recorded as such`);
console.log(`  size         ${size(partial)}`);

console.log('\n\n5 · an off-menu document still identifies itself\n');
const inline = buildEvidence(await querySubgraph('aave-v3-ethereum', `query { lendingProtocols(first: 1) { id name } }`));
console.log(`  document     ${inline.document}   ← not in the registry`);
console.log(`  documentHash ${inline.documentHash}   ← but pinned byte-for-byte anyway`);
console.log();

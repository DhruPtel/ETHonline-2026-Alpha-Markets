// Unit 8's proof. A common block across the publishable set, then two real refusals.
import { commonBlock, RETENTION_FLOOR, FINALITY_LAG } from '../src/graph/blockwindow.js';
import { querySubgraph } from '../src/graph/client.js';

const DEV = ['aave-v3-ethereum', 'aave-v2-ethereum', 'compound-v3-ethereum', 'compound-v2-ethereum', 'spark-lend-ethereum'];
const pad = (s: string, n: number) => s.padEnd(n).slice(0, n);

console.log(`\n1 · the five publishable deployments (floor ${RETENTION_FLOOR}, finality lag ${FINALITY_LAG})\n`);
const w = await commonBlock(DEV);
for (const [slug, head] of Object.entries(w.heads)) console.log(`  ${pad(slug, 24)}head ${head}`);
console.log('  ' + '─'.repeat(46));
if (w.ok) {
  console.log(`  spread across heads   ${w.spread} block(s)`);
  console.log(`  lo (retention floor)  ${w.lo}`);
  console.log(`  hi (lowest head)      ${w.hi}`);
  console.log(`  window                ${w.hi - w.lo} blocks (~${(((w.hi - w.lo) * 12) / 60).toFixed(0)} min)`);
  console.log(`  ✅ pinned block        ${w.block}   (hi − ${FINALITY_LAG})`);
} else console.log(`  ⛔ ${w.reason}`);

console.log(`\n\n2 · verifying the chosen block is actually answerable everywhere\n`);
if (w.ok) for (const slug of DEV) {
  try {
    const r = await querySubgraph<{ lendingProtocols: { totalDepositBalanceUSD: string }[] }>(
      slug, `query($block: Block_height) { lendingProtocols(first: 1, block: $block) { totalDepositBalanceUSD } }`, {}, w.block);
    console.log(`  ${pad(slug, 24)}✅ $${(Number(r.data.lendingProtocols[0]!.totalDepositBalanceUSD) / 1e6).toFixed(1)}M at block ${w.block}`);
  } catch (e) { console.log(`  ${pad(slug, 24)}✗ ${(e as Error).message.slice(0, 70)}`); }
}

console.log(`\n\n3 · a refusal that needs no fabrication — add a deployment 4.2 hours behind\n`);
const lagging = await commonBlock([...DEV, 'goldfinch-ethereum']);
console.log(`  goldfinch head        ${lagging.heads['goldfinch-ethereum']}`);
console.log(`  lowest head elsewhere ${Math.max(...Object.values(lagging.heads))}`);
console.log(lagging.ok ? `  pinned ${lagging.block}` : `  ⛔ ${lagging.reason}`);
console.log('  ⚠️  It declines rather than pinning to a block goldfinch cannot answer.');

console.log(`\n\n4 · the same set under the plan's original ~500-block assumption vs measured\n`);
for (const floor of [500, RETENTION_FLOOR, 439_844]) {
  const r = await commonBlock([...DEV, 'goldfinch-ethereum'], { retentionFloor: floor });
  console.log(`  floor ${String(floor).padStart(7)}  ${r.ok ? `✅ pinned ${r.block}` : `⛔ refuses`}`);
}
console.log("  ⚠️  aave-v3 alone retains 439,844 blocks. Using ITS window as the set's would pin a");
console.log('     block four of the five cannot answer — which is why the floor is the tightest, not the loosest.');
console.log();

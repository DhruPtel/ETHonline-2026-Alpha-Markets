// Unit 9's proof. Subgraph number beside chain number, at the block the value was written.
import { corroborate } from '../../src/graph/corroborate.js';
import { PROTOCOLS } from '../../src/config/protocols.js';

const SET = ['aave-v3-ethereum', 'aave-v2-ethereum', 'compound-v3-ethereum', 'compound-v2-ethereum', 'spark-lend-ethereum', 'morpho-blue'];
const pad = (s: string, n: number) => s.padEnd(n).slice(0, n);
const lpad = (s: string, n: number) => s.padStart(n).slice(-n);
const ICON = { match: '✅', mismatch: '⛔', not_checked: '·' };
const tally: Record<string, number> = { match: 0, mismatch: 0, not_checked: 0 };

for (const slug of SET) {
  const cfg = PROTOCOLS.find((p) => p.slug === slug)!;
  console.log(`\n${slug}  —  ${cfg.liveSchemaVersion}, ${cfg.triageVerdict}, hint: ${cfg.corroborationHint?.writeTimeField ?? 'none'}`);
  console.log('  ' + pad('market', 26) + lpad('subgraph', 20) + lpad('chain', 20) + lpad('delta', 14) + lpad('block', 11) + '  verdict');
  console.log('  ' + '─'.repeat(103));
  try {
    for (const r of await corroborate(slug, 3)) {
      tally[r.status]!++;
      console.log('  ' + pad(r.marketName ?? r.marketId.slice(0, 20), 26) +
        lpad(r.subgraphValue?.toString() ?? '—', 20) + lpad(r.chainValue?.toString() ?? '—', 20) +
        lpad(r.delta?.toString() ?? '—', 14) + lpad(r.writeTimeBlock?.toString() ?? '—', 11) +
        '  ' + ICON[r.status] + ' ' + r.status + (r.note ? ` (${r.note})` : ''));
    }
  } catch (e) { console.log(`  ✗ ${(e as Error).message.slice(0, 110)}`); }
}
console.log(`\n\n${tally.match} match · ${tally.mismatch} mismatch · ${tally.not_checked} not_checked\n`);
console.log('⚠️  Nothing here is tuned to agree. A mismatch is the output, not a bug to fix.\n');

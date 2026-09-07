// Unit 3's proof — the operations against known inputs, and the cases that break naive arithmetic.
import { net, ratio, sum, compare, groupBy, rank } from '../../src/engine/ops.js';
import type { Decimal } from '../../src/types/wire.js';

let failures = 0;
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`  ${ok ? '✅' : '⛔'} ${label.padEnd(46)}${JSON.stringify(got)}${ok ? '' : `   expected ${JSON.stringify(want)}`}`);
};

console.log('\n1 · the 23-decimal figure that breaks a JS number\n');
const REAL: Decimal = '24917272809.52169350845770191155245';   // observed from the gateway
console.log(`  Number(x)          ${Number(REAL)}   ← already lost the tail`);
console.log(`  String(Number(x))  ${String(Number(REAL))}`);
is('round trip through net(x, 0)', net(REAL, '0'), REAL);
is('round trip through sum([x])', sum([REAL]), REAL);
is('x - x is exactly zero', net(REAL, REAL), '0');
is('float would have said', String(Number(REAL) - Number(REAL)), '0');

console.log('\n2 · net — deposits minus borrows\n');
is('aave-v3 net', net('24781147529.29228508480637018324332', '10011234567.11111111111111111111111'), '14769912962.18117397369525907213221');
is('negative net is carried, not clamped', net('7700000', '14400000'), '-6700000');
is('truefi, the real inverted case', net('7.7', '14.4'), '-6.7');

console.log('\n3 · ratio — and division by zero\n');
is('utilization 40.4%', ratio('10011234567', '24781147529')?.slice(0, 8), '0.403985');
is('cream-finance: 0 / 0', ratio('0', '0'), null);
is('zerolend: 0 borrows over 0 deposits', ratio('0', '0'), null);
is('0 borrows over real deposits IS zero', ratio('0', '24781147529'), '0');
console.log('  ⚠️  the last two must differ: undefined is not zero, and zero reads as an answer.');
is('naive JS would have said', String(0 / 0), 'NaN');
is('and for x/0', String(1 / 0), 'Infinity');

console.log('\n4 · sum — no drift across many small figures\n');
const cents: Decimal[] = Array.from({ length: 10_000 }, () => '0.01');
is('10,000 × 0.01', sum(cents), '100');
console.log(`  float equivalent   ${Array.from({ length: 10_000 }, () => 0.01).reduce((a, b) => a + b, 0)}   ← drifted`);
const tiny: Decimal[] = Array.from({ length: 1000 }, () => '0.00000000000000000000001');
is('1,000 × 1e-23', sum(tiny), '0.00000000000000000001');
is('0.1 + 0.2', sum(['0.1', '0.2']), '0.3');
console.log(`  float equivalent   ${0.1 + 0.2}   ← the canonical example`);

console.log('\n5 · compare, groupBy, rank\n');
is('compare beyond float precision', compare('1.0000000000000000000001', '1.0000000000000000000002'), -1);
is('float would have tied them', 1.0000000000000000000001 === 1.0000000000000000000002, true);
type Row = { slug: string; asset: string; v: Decimal | null };
const rows: Row[] = [
  { slug: 'aave-v3', asset: 'WETH', v: '5400100000' },
  { slug: 'spark', asset: 'WETH', v: '3027600000' },
  { slug: 'compound-v2', asset: 'USDC', v: '55200000' },
  { slug: 'cream', asset: 'USDC', v: null },
];
is('groupBy asset', Object.keys(groupBy(rows, (r) => r.asset)).sort(), ['USDC', 'WETH']);
is('rank top 2', rank(rows, (r) => r.v, 2).map((r) => r.slug), ['aave-v3', 'spark']);
is('null sorts last, never as zero', rank(rows, (r) => r.v).map((r) => r.slug).at(-1), 'cream');

console.log('\n6 · what it refuses rather than coerces\n');
for (const bad of ['1e18', '12,345', 'abc', '']) {
  try { sum([bad as Decimal]); console.log(`  ⛔ accepted "${bad}"`); failures++; }
  catch (e) { console.log(`  ✅ rejected ${JSON.stringify(bad).padEnd(12)}${(e as Error).message}`); }
}
// ⚠️ 47 decimal places is a real observed value (a token price on a live deployment), so the test
// asserts the boundary at the current scale rather than at a number that used to be past it.
try { sum(['0.' + '0'.repeat(14) + '162926873065418174459347072777589' as Decimal]); console.log('  ✅ accepted 47dp    a real observed token price'); }
catch (e) { console.log(`  ⛔ rejected a real value: ${(e as Error).message}`); failures++; }
try { sum(['1.' + '1'.repeat(81) as Decimal]); console.log('  ⛔ accepted 81 decimal places'); failures++; }
catch (e) { console.log(`  ✅ rejected 81dp    ${(e as Error).message}`); }

console.log(`\n${failures === 0 ? '✅ all checks passed' : `⛔ ${failures} failed`}\n`);
if (failures) process.exit(1);

// Unit 1's proof. `src/arc/spec.ts` in, PASS or FAIL out.
//
//   npx tsx scripts/demo/spec.ts
//
// ⚠️ **No --env-file and no network.** `spec.ts` is pure — it reads `config/protocols.ts` and does
// arithmetic. If this script ever needs a credential, the unit has grown an I/O path it must not
// have.
//
// ⚠️ **The epoch numbers below were taken from `date -u`, not derived by hand.** The first draft of
// this line in PHASE-4.md read 1757548800, which is 2025-09-11 — a year out, caught only by
// checking. Verify with:
//
//   date -u -d 2026-09-11T00:00:00Z +%s   → 1789084800
//   date -u -d 2026-09-11T23:59:59Z +%s   → 1789171199

import {
  DAY_SECONDS, FRESHNESS_MARGIN_SECONDS, LEGAL_METRICS, MIN_RESOLVE_LEAD_SECONDS,
  dayStart, holds, isFresh, metricFromFactId, observationEnd, observationWindow,
  questionCore, specHash, validateSpec,
} from '../../src/arc/spec.js';
import { PROTOCOLS } from '../../src/config/protocols.js';

let failures = 0;
const ok = (label: string, condition: boolean, detail = ''): void => {
  console.log(`  ${condition ? '✅' : '❌'} ${label}${detail ? `   ${detail}` : ''}`);
  if (!condition) failures += 1;
};

/** Assert a call throws, and that its message names the reason rather than just failing. */
const refuses = (label: string, run: () => unknown, mustSay: string): void => {
  try {
    run();
    ok(label, false, 'did not throw');
  } catch (error) {
    const message = (error as Error).message;
    const said = message.toLowerCase().includes(mustSay.toLowerCase());
    ok(label, said, said ? `"${message.slice(0, 96)}…"` : `threw, but never said "${mustSay}": ${message.slice(0, 96)}`);
  }
};

// ─── 1 · a real live deployment ──────────────────────────────────────────────────────────────────
// ⚠️ Taken from config/protocols.ts rather than typed, so this proof cannot pass against a slug the
// project does not actually query.
const live = PROTOCOLS.find((p) => p.status === 'live');
if (!live) { console.error('\nFAIL  no live deployment in config/protocols.ts to build a spec from.'); process.exit(1); }

console.log(`\n── 1 · a spec over a real live deployment  (${live.slug})`);

const spec = validateSpec({
  slug: live.slug,
  metric: 'totalDepositBalanceUSD',
  comparison: 'above',
  threshold: '25000000000.5',
  observedDay: '2026-09-11',
});
const first = specHash(spec);
const second = specHash(validateSpec({ ...spec }));

ok('hashes to 64 hex characters', /^[0-9a-f]{64}$/.test(first), first);
ok('hashes to the SAME value twice', first === second);

// ─── 2 · one field changed ───────────────────────────────────────────────────────────────────────
console.log('\n── 2 · one field changed hashes differently');

const changed = {
  threshold: specHash(validateSpec({ ...spec, threshold: '25000000000.6' })),
  comparison: specHash(validateSpec({ ...spec, comparison: 'below' })),
  observedDay: specHash(validateSpec({ ...spec, observedDay: '2026-09-12' })),
  metric: specHash(validateSpec({ ...spec, metric: 'totalBorrowBalanceUSD' })),
};
for (const [field, hash] of Object.entries(changed)) {
  ok(`${field.padEnd(12)} changes the hash`, hash !== first, `${hash.slice(0, 16)}…`);
}
// ⚠️ All four must also differ from EACH OTHER — four fields collapsing to one hash would mean the
// canonicalizer is dropping something.
ok('all four differ from each other', new Set(Object.values(changed)).size === 4);

// ─── 3 · revenue is refused BY NAME, with a reason ───────────────────────────────────────────────
console.log('\n── 3 · revenue is refused by name, and the message says why');

refuses('dailyTotalRevenueUSD', () => validateSpec({ ...spec, metric: 'dailyTotalRevenueUSD' as never }), 'poisoned');
refuses('cumulativeTotalRevenueUSD', () => validateSpec({ ...spec, metric: 'cumulativeTotalRevenueUSD' as never }), '2.79e17');
// ⚠️ Not asked for, and it is the same class of fault: a lifetime accumulator nobody swept.
refuses('cumulativeDepositUSD', () => validateSpec({ ...spec, metric: 'cumulativeDepositUSD' as never }), '3.78e23');
refuses('totalValueLockedUSD', () => validateSpec({ ...spec, metric: 'totalValueLockedUSD' as never }), 'not individually swept');

// ─── 4 · an unknown slug ─────────────────────────────────────────────────────────────────────────
console.log('\n── 4 · a deployment config/protocols.ts does not name');
refuses('aave-v9-mars', () => validateSpec({ ...spec, slug: 'aave-v9-mars' }), 'config/protocols.ts');

// ─── 5 · closeTime inside the observed day ───────────────────────────────────────────────────────
console.log('\n── 5 · closeTime must precede the observed day, not merely observationEnd');

const dayOpens = dayStart('2026-09-11');
const dayCloses = observationEnd('2026-09-11');
const legalDeadline = dayCloses + MIN_RESOLVE_LEAD_SECONDS;

const core = questionCore(spec, { closeTime: dayOpens, resolveDeadline: legalDeadline });
ok('closeTime exactly at midnight is legal', core.closeTime === dayOpens);
ok('observationEnd is the day boundary', core.observationEnd === dayCloses, String(dayCloses));
ok('specHash carried into QuestionCore', core.specHash === first);

refuses('one second into the day', () => questionCore(spec, { closeTime: dayOpens + 1, resolveDeadline: legalDeadline }), 'inside or after the observed day');
refuses('midday', () => questionCore(spec, { closeTime: dayOpens + 43_200, resolveDeadline: legalDeadline }), 'already partly known');
refuses('resolveDeadline one day out', () => questionCore(spec, { closeTime: dayOpens, resolveDeadline: dayCloses + DAY_SECONDS }), 'two days');

// ─── 6 · the window, against date -u ─────────────────────────────────────────────────────────────
console.log('\n── 6 · the observation window for 2026-09-11');

const window = observationWindow('2026-09-11');
ok('start  == 1789084800', window.start === 1_789_084_800, String(window.start));
ok('end    == 1789171199', window.end === 1_789_171_199, String(window.end));
// ⚠️ The whole point of the off-by-one: the next day's first second must NOT be in this window.
ok('end is NOT the next day\'s first second', window.end !== observationWindow('2026-09-12').start);
ok('the two days do not overlap', observationWindow('2026-09-12').start === window.end + 1);
ok('window is exactly one second short of a day', window.end - window.start === DAY_SECONDS - 1);

refuses('30 February', () => dayStart('2026-02-30'), 'not a real calendar date');
refuses('not a date at all', () => dayStart('soon'), 'YYYY-MM-DD');

// ─── 7 · freshness is a lower bound ──────────────────────────────────────────────────────────────
console.log('\n── 7 · freshness');
ok('one second before the margin is NOT fresh', !isFresh(dayCloses + FRESHNESS_MARGIN_SECONDS - 1, '2026-09-11'));
ok('exactly at the margin is fresh', isFresh(dayCloses + FRESHNESS_MARGIN_SECONDS, '2026-09-11'));
ok('a week late is still fresh', isFresh(dayCloses + 7 * DAY_SECONDS, '2026-09-11'), 'a snapshot is written once and never superseded');

// ─── 8 · the FactId mapping ──────────────────────────────────────────────────────────────────────
console.log('\n── 8 · FactId → subject');

const mapped = metricFromFactId(`${live.slug}.totalDepositBalanceUSD`);
ok('a protocol figure maps', mapped.slug === live.slug && mapped.metric === 'totalDepositBalanceUSD');

refuses('a per-market figure', () => metricFromFactId(`${live.slug}.0xabc123.totalDepositBalanceUSD`), 'one row per DEPLOYMENT');
refuses('the "metric" sentinel', () => metricFromFactId('metric.totalDepositBalanceUSD'), 'names no deployment');
refuses('a revenue headline', () => metricFromFactId(`${live.slug}.dailyTotalRevenueUSD`), 'poisoned');
refuses('not a fact id', () => metricFromFactId('totalDepositBalanceUSD'), 'not a fact id');

// ─── 9 · the comparison is defined, including the tie ────────────────────────────────────────────
console.log('\n── 9 · holds(), including equality');
ok('above: greater is true', holds(spec, '25000000000.6'));
ok('above: equal is FALSE', !holds(spec, '25000000000.5'), 'a tie means the proposition did not hold');
ok('above: less is false', !holds(spec, '25000000000.4'));
const below = validateSpec({ ...spec, comparison: 'below' });
ok('below: less is true', holds(below, '25000000000.4'));
ok('below: equal is FALSE', !holds(below, '25000000000.5'));
// ⚠️ Exact decimal comparison, not Number(). These two differ in the 20th significant digit and a
// float ties them — this is the assertion that would catch a `Number()` creeping in.
ok('distinguishes a 20th-digit difference',
  holds(validateSpec({ ...spec, threshold: '10000000000000000000.00000001' }), '10000000000000000000.00000002'));

console.log(`\n── legal metrics: ${LEGAL_METRICS.join(', ')}`);
console.log(failures === 0 ? '\nPASS  spec.ts.\n' : `\nFAIL  ${failures} assertion(s).\n`);
process.exit(failures === 0 ? 0 : 1);

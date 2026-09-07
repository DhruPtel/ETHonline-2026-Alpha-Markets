// Unit 2's proof. The old fixture's recorded hashes must still reproduce, and a Unit 1 report must
// behave — because this hash is what a market settles on.
import { canonical, hashCanonical, reportHash, reportHashBytes } from '../src/domain/canonical.js';
import type { Report } from '../src/types/report.js';

const short = (h: string) => `${h.slice(0, 8)}…${h.slice(-6)}`;
const check = (label: string, got: string, want: string) =>
  console.log(`  ${label.padEnd(28)}${short(got)}   ${got === want ? '✅' : `⛔ expected ${want}`}`);

// ─── 1 · SM-01's fixture, hashed through the shared path ─────────────────────────────────────────
// Transcribed from scripts/smoke/01-canonicalize.ts. Its recorded hashes were measured 2026-09-05,
// before types/report.ts existed — so this proves the PATH is unchanged, not the shape.
console.log('\n1 · SM-01 (2026-09-05), through src/domain/canonical.ts\n');
const SM01 = {
  schema: 'alpha-markets/report/v1',
  protocol: 'aave-v3-ethereum',
  deployment: 'QmcXE5QVcBcvcaJddPxd8mFs6W9xt7STmwfgguoiM6ddAd',
  block: 25916237,
  observedAt: '2026-09-06T02:14:11Z',
  figures: {
    totalDepositBalanceUSD: '24850226626.81',
    totalBorrowBalanceUSD: '10050176390.56',
    utilizationRatio: '0.404430',
    cumulativeTotalRevenueUSD: null,
  },
  verdict: { call: 'overvalued', confidence: 'medium' },
};
const RECORDED = '49cfaa6c';
const RECORDED_CHANGED = 'b3688035';
const h1 = hashCanonical(SM01);
console.log(`  original                    ${short(h1)}   ${h1.startsWith(RECORDED) && h1.endsWith('3db9b7') ? '✅ matches 49cfaa6c…3db9b7' : '⛔'}`);
const withToken = { ...SM01, atsTokenAddress: '0.0.9213391' };
check('with ATS token', hashCanonical(withToken), h1);
const oneCent = { ...SM01, figures: { ...SM01.figures, totalBorrowBalanceUSD: '10050176390.57' } };
const h2 = hashCanonical(oneCent);
console.log(`  one cent moved              ${short(h2)}   ${h2.startsWith(RECORDED_CHANGED) && h2.endsWith('bfe3ec') ? '✅ matches b3688035…bfe3ec' : '⛔'}`);

// ─── 2 · a Unit 1 report ─────────────────────────────────────────────────────────────────────────
console.log('\n\n2 · a full report on the current contract\n');
const report: Report = {
  schema: 'alpha-markets/report/v1',
  analyst: '0x1b7035bbe0da8f3bcb721863d42e1079e4a116a7',
  subject: { directive: 'Aave v2 deposits — do the books tie out?', deployments: ['aave-v2-ethereum'], headline: 'aave-v2.deposits' },
  block: 25922313,
  observedAt: '2026-09-07T02:14:11Z',
  facts: {
    'aave-v2.deposits': { id: 'aave-v2.deposits', label: 'Total deposits', value: '97612884.31',
      unit: 'USD', slug: 'aave-v2-ethereum', deployment: 'QmdwBHGxokamYsLf', block: 25922313, corroboration: 'match', withheld: null },
  },
  checks: [{ id: 'markets-sum-to-total', description: 'Market deposits sum to the protocol total',
    outcome: 'passed', severity: null, delta: '0', appliesTo: 'aave-v2.deposits', rationale: '37 markets, population complete' }],
  exclusions: [],
  verdict: { call: 'ties_out', coverage: { marketsRead: 37, marketsCorroborated: 3, completeness: 'complete', checksRun: 2, checksAvailable: 2 } },
  assessment: { summary: 'Internally consistent and matches the chain where checkable.', basis: ['aave-v2.deposits'], confidence: 'high' },
  sections: [{ id: 'subject', paragraphs: [{ text: 'Aave v2 held {fact:aave-v2.deposits} in deposits.', factRefs: ['aave-v2.deposits'] }] }],
  provenance: [{ deployment: 'QmdwBHGxokamYsLf', block: 25922313, timestamp: '2026-09-07T02:14:11Z', document: 'balance-sheet', variables: { block: 25922313 } }],
  atsTokenAddress: null,
};
const base = reportHash(report);
console.log(`  baseline                    ${short(base)}`);
check('same report again', reportHash(report), base);
const reorder = (v: unknown): unknown => Array.isArray(v) ? v.map(reorder)
  : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, reorder(x)])) : v;
check('every key reordered', hashCanonical(reorder(report)), base);
check('ATS address attached', reportHash({ ...report, atsTokenAddress: '0.0.10395983' }), base);

const differs = (label: string, r: Report) =>
  console.log(`  ${label.padEnd(28)}${short(reportHash(r))}   ${reportHash(r) !== base ? '✅ different' : '⛔ COLLIDES'}`);
differs('figure moved one cent', { ...report, facts: { 'aave-v2.deposits': { ...report.facts['aave-v2.deposits']!, value: '97612884.32' } } });
differs('verdict changed', { ...report, verdict: { ...report.verdict, call: 'discrepancy' } });
differs('one word of prose changed', { ...report, sections: [{ id: 'subject', paragraphs: [{ text: 'Aave v2 holds {fact:aave-v2.deposits} in deposits.', factRefs: ['aave-v2.deposits'] }] }] });
differs('analyst changed', { ...report, analyst: '0x0000000000000000000000000000000000000001' });

console.log(`\n  bytes                       ${reportHashBytes(report).length} (bytes32 for Arc and the ATS event)`);
console.log(`  canonical JSON              ${canonical(report).length} bytes, lifecycle field absent: ${!canonical(report).includes('atsTokenAddress')}`);
console.log();

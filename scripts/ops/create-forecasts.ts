// Create the three live forecasts for the replacement reports — markets with NO claim, so the first
// commit on each is a judge pressing it.
//
//   npx tsx --env-file=.env scripts/ops/create-forecasts.ts           ← the plan: every prepare() guard, spends nothing
//   npx tsx --env-file=.env scripts/ops/create-forecasts.ts --send    ← ⚠️ SPENDS: one createMarket each, gas only
//
// ⚠️ **`prepare()` then `create()`, and never `commit()`.** `prepare()` plans a whole claim, so it
// needs a report and an amount — both are real and both are checked (admission, side, stake size) —
// but only `create()` runs. No USDC is staked; the only spend is `createMarket` gas.
//
// ── ⚠️ `directed_at` IS CLEARED ONCE EACH MARKET LANDS, AND THAT HAS A COST ─────────────────────
//
// `create()` marks every market directed at the analyst, which is how `/api/cron/commit` finds work:
// it commits the analyst's claim on any directed market with none, and all three reports it would
// look for exist. Left directed, tonight's 22:00Z run would claim all three, and a judge's commit
// would then be refused as a second claim from the same author — the one action these markets exist
// for. The operator chose to clear it (2026-09-13).
//
// ⚠️ **What that costs: A2's evidence.** A2 closes on a `vercel-cron/1.0` request committing
// unattended, and no such commit has been recorded — the four real claims were all placed by hand.
// With these three cleared, the only directed markets left have long-closed staking, which the cron
// refuses. **Tonight's scheduled run will commit nothing.**
//
// ── The question and the window ─────────────────────────────────────────────────────────────────
//
// ⚠️ **Observed day 2026-09-15.** `questionCore` requires `closeTime <= dayStart(observedDay)` and the
// contract's `_open` refuses once `block.timestamp >= closeTime`, so the day must not have started.
// Staking closes at 23:59Z the day before — the shape of markets 6, 7, 11 and 12 — which is about
// forty hours of staking from a creation on the 13th. The deadline is the day's start plus three days,
// the earliest `questionCore` accepts for a day that ends on the 16th.
//
// ⚠️ **Thresholds pinned within ~0.1% of the 2026-09-12 daily snapshot** — the series settlement reads,
// not the report's entity figure, which differs by about half a percent. Pinned rather than read live
// so a re-run derives the same market id: the id is the question, and a nudged threshold would be a
// second market. The plan re-reads the latest snapshot and prints the distance before anything spends.
//
//   makerdao-ethereum   deposits  09-12 $5.0243B   moves -0.20%, +0.88%, -0.10%   → above $5.02B
//   morpho-blue         borrows   09-12 $11.4559B  moves -0.10%, +0.23%, +0.05%   → above $11.46B
//   spark-lend-ethereum deposits  09-12 $7.2006B   moves +2.35%, +3.88%, -0.01%   → above $7.20B

import { ethers } from 'ethers';
import { MarketRefused, create, prepare } from '../../src/arc/market.js';
import { analystIdentity, arcProvider } from '../../src/arc/arc.js';
import { dayStart } from '../../src/arc/spec.js';
import { closePool, db } from '../../src/store/db.js';

const SEND = process.argv.includes('--send');
const OBSERVED_DAY = '2026-09-15';
const CLOSE = dayStart(OBSERVED_DAY) - 60;
const RESOLVE_DEADLINE = dayStart(OBSERVED_DAY) + 3 * 86_400;
/** ⚠️ Planned and checked, never staked — `create()` places nothing. */
const PLANNED_STAKE = ethers.parseUnits('0.01', 18).toString();
const EXPLORER = 'https://testnet.arcscan.app';

const QUESTIONS = [
  { slug: 'makerdao-ethereum', metric: 'totalDepositBalanceUSD', threshold: '5020000000',
    report: '4acf3eeccdcf490f1a94df0d8e14fc0dfa0d9bdfbaa41ffea4aa054ee2e003d7' },
  { slug: 'morpho-blue', metric: 'totalBorrowBalanceUSD', threshold: '11460000000',
    report: '177b85bb320b138738487428b9584ad725f730ffb79a64e9e90b2db25d121047' },
  { slug: 'spark-lend-ethereum', metric: 'totalDepositBalanceUSD', threshold: '7200000000',
    report: '2253e57e9173f6a8d21944905ba13b2705464b6410bb201707ccef2ec11aac69' },
] as const;

const usdc = (wei: bigint): string => `${ethers.formatUnits(wei, 18)} USDC`;
const MARKET_ABI = [
  'function markets(uint256) view returns (bytes32 questionId, bytes32 specHash, uint64 closeTime, uint64 observationEnd, uint64 resolveDeadline, bool resolved, bool outcome, bool voided, bytes32 evidenceHash, uint256 poolTrue, uint256 poolFalse)',
  'function claimIdOf(uint256, address) view returns (uint256)',
];

const identity = await analystIdentity();
console.log(`\n══ ${QUESTIONS.length} forecasts on ${OBSERVED_DAY}${SEND ? ' — ⚠️ SPENDING createMarket gas' : ' — plan only'}\n`);
console.log(`  staking closes ${new Date(CLOSE * 1000).toISOString()} · resolve deadline ${new Date(RESOLVE_DEADLINE * 1000).toISOString()}\n`);

let totalGas = 0n;
for (const q of QUESTIONS) {
  const plan = await prepare({
    reportHash: q.report,
    spec: { slug: q.slug, metric: q.metric, comparison: 'above', threshold: q.threshold, observedDay: OBSERVED_DAY },
    closeTime: CLOSE, resolveDeadline: RESOLVE_DEADLINE, amount: PLANNED_STAKE,
  }).catch((e: unknown) => {
    console.error(`  ❌ ${q.slug}.${q.metric} REFUSED — ${(e as Error).message}\n`);
    process.exit(e instanceof MarketRefused ? 2 : 1);
  });

  const latest = Number(plan.decision.observed);
  const distance = ((Number(q.threshold) - latest) / latest) * 100;
  console.log(`  ${q.slug}.${q.metric} above ${q.threshold}`);
  console.log(`    latest snapshot ${plan.decision.decidedFromDay}: ${plan.decision.observed} → threshold ${distance >= 0 ? '+' : ''}${distance.toFixed(3)}% from it`);
  console.log(`    market id ${plan.marketId} · report ${q.report.slice(0, 12)}… · the analyst would take ${plan.decision.side ? 'TRUE' : 'FALSE'} (not placed)`);

  if (!SEND) { console.log(''); continue; }

  const made = await create(plan);
  // ⚠️ Immediately, and on a re-run too: a market that landed earlier is returned by `create()` and
  // gets the same treatment. See the header for why and what it costs.
  await db()`UPDATE markets SET directed_at = NULL WHERE id = ${plan.marketId}`;

  const onChain = new ethers.Contract(plan.contractAddress, MARKET_ABI, arcProvider());
  const m = await onChain.markets!(BigInt(made.chainMarketId));
  const claimId = (await onChain.claimIdOf!(BigInt(made.chainMarketId), identity.address)) as bigint;
  const timesMatch = Number(m.closeTime) === plan.core.closeTime && Number(m.resolveDeadline) === plan.core.resolveDeadline;

  if (made.alreadyLanded) {
    console.log(`    ✅ already on chain as #${made.chainMarketId} — nothing spent · directed_at cleared`);
  } else {
    const receipt = await arcProvider().getTransactionReceipt(made.txHash);
    const gas = receipt ? receipt.gasUsed * receipt.gasPrice : 0n;
    totalGas += gas;
    console.log(`    ✅ created #${made.chainMarketId} · ${EXPLORER}/tx/${made.txHash}`);
    console.log(`       gas ${receipt?.gasUsed ?? '?'} × ${receipt?.gasPrice ?? '?'} wei = ${usdc(gas)} · directed_at cleared`);
  }
  console.log(`    on chain: times ${timesMatch ? 'match the plan' : '⚠️ DO NOT MATCH'} · analyst claim id ${claimId} (0 = none) · /markets/${made.chainMarketId}\n`);
}

if (SEND) console.log(`  total createMarket gas: ${usdc(totalGas)} — no stake placed\n`);
else console.log('  Plan only. Nothing spent. Add --send to create them.\n');
await closePool();

// Transfer a report's token — the H2.4 lifecycle operation, on camera.
//
//   npx tsx --env-file=.env scripts/ops/move-token.ts <reportHash> <0xRecipient>            ← dry
//   npx tsx --env-file=.env scripts/ops/move-token.ts <reportHash> <0xRecipient> --confirm  ← spends
//
// ⚠️ **The recipient is a required argument and is never defaulted.** Picking one would move a real
// asset to an address nobody chose. Same shape as `tokenize.ts`: dry by default, everything checkable
// checked and printed first, `--confirm` a separate human decision.

import { prepare, send } from '../../src/tokenize/transfer.js';
import { ChainWriteError, hbar, settledBalance, usdPerHbar } from '../../src/tokenize/hedera.js';
import { close } from '../../src/store/reports.js';
import { db } from '../../src/store/db.js';

// SM-07's measured lifecycle. This unit is the fourth step; the first three were Unit 8's.
const SM07_TRANSFER = 0.42696150;
const SM07_FULL = 8.13891225;
const SM07_UNIT8 = 7.71195075;

const [reportHash, to] = [process.argv[2], process.argv[3]];
const confirmed = process.argv.includes('--confirm');
if (!reportHash || !to) {
  console.error('usage: move-token.ts <reportHash> <0xRecipient> [--confirm]');
  process.exit(1);
}

let plan;
try {
  plan = await prepare(reportHash, to);
} catch (error) {
  console.error(`\nSTOP  ${(error as Error).message}\n`);
  await close();
  process.exit(1);
}

console.log(`\n── About to transfer an ATS report token on Hedera testnet`);
console.log(`  report      ${plan.reportHash}`);
console.log(`  isin        ${plan.token.isin}`);
console.log(`  proxy       ${plan.token.proxyAddress}`);
console.log(`  from        ${plan.from}   (analyst ${plan.analyst.id}, ${plan.analyst.hederaAccountId})`);
console.log(`  to          ${plan.to}`);
console.log(`  balances    from ${plan.fromBalance}   to ${plan.toBalance}      ← read from the chain`);
console.log(`  gas budget  ${hbar(plan.balanceTinybars)} HBAR available, ~${SM07_TRANSFER.toFixed(5)} expected`);

if (!confirmed) {
  console.log(`\nDRY RUN — nothing was sent. Re-run with --confirm to transfer the token.\n`);
  await close();
  process.exit(0);
}

const before = plan.balanceTinybars;
let result;
try {
  console.log(`\n── Sending`);
  result = await send(plan);
} catch (error) {
  // ⚠️ Report the Mirror Node reason and STOP. Do not adjust a field and retry.
  if (error instanceof ChainWriteError) {
    console.error(`\nFAIL  ${error.message}`);
    console.error('\n      Read the balances before doing anything else — the transfer may have landed.');
  } else {
    console.error(`\nFAIL  ${(error as Error).message}`);
  }
  await close();
  process.exit(1);
}

console.log(`  transfer tx ${result.transferTx}`);

console.log(`\n── Proof`);
let failed = 0;
const check = (ok: boolean, label: string, detail = '') => {
  console.log(`  ${ok ? '✅' : '❌'} ${label}${detail ? `  ${detail}` : ''}`);
  if (!ok) failed++;
};

// 1. Balances, from the chain, both sides, before and after.
check(result.fromBefore === 1n && result.fromAfter === 0n, 'sender 1 → 0',
  `${result.fromBefore} → ${result.fromAfter}`);
check(result.toBefore === 0n && result.toAfter === 1n, 'recipient 0 → 1',
  `${result.toBefore} → ${result.toAfter}`);

// 2. transfer_tx recorded.
const [row] = await db()`
  SELECT report_hash, isin, proxy_address, transfer_tx FROM report_tokens WHERE report_hash = ${reportHash}`;
console.log(`\n── report_tokens`);
for (const [k, v] of Object.entries(row ?? {})) console.log(`  ${k.padEnd(15)} ${String(v)}`);
check(row?.transfer_tx === result.transferTx, 'transfer_tx written', String(row?.transfer_tx));

// 3. Cost, against SM-07's measured transfer.
const tinybars = (result.receipt.gasUsed * result.receipt.gasPrice) / 10_000_000_000n;
const after = await settledBalance(plan.analyst.hederaAccountId, before);
const usd = await usdPerHbar();
console.log(`\n── Cost`);
console.log(`  transfer      gas ${String(result.receipt.gasUsed).padStart(9)}  ${hbar(tinybars)} HBAR` +
  `   SM-07 ${SM07_TRANSFER.toFixed(8)}  ${(Number(tinybars) / 1e8 - SM07_TRANSFER >= 0 ? '+' : '')}` +
  `${(Number(tinybars) / 1e8 - SM07_TRANSFER).toFixed(8)}`);
console.log(`  balance       ${hbar(before)} → ${hbar(after)}  (−${hbar(before - after)} HBAR)`);
console.log(`  lifecycle so far: Unit 8 ${SM07_UNIT8.toFixed(5)} + this ${(Number(tinybars) / 1e8).toFixed(5)}` +
  `  vs SM-07's full ${SM07_FULL.toFixed(5)}`);
console.log(`  at $${usd.toFixed(6)}/HBAR → $${(Number(before - after) / 1e8 * usd).toFixed(4)} for this step`);

console.log(`\n  HashScan  https://hashscan.io/testnet/contract/${plan.token.proxyAddress}`);
console.log(`  report    https://et-honline-2026-alpha-markets.vercel.app/report/${reportHash}`);
console.log(`\n${failed === 0 ? 'PASS' : `FAIL — ${failed} check(s)`}\n`);
await close();
process.exit(failed === 0 ? 0 : 1);

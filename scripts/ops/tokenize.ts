// Tokenize a stored report on Hedera testnet.
//
//   npx tsx --env-file=.env scripts/ops/tokenize.ts <reportHash>            ← prints the plan, spends nothing
//   npx tsx --env-file=.env scripts/ops/tokenize.ts <reportHash> --confirm  ← spends real HBAR
//
// ⚠️ **Dry by default, and that is the point.** SM-07's first attempt reverted on a field taken from
// our own research note and burned 948,129 gas producing nothing. Everything that can be checked
// without spending is checked and printed first; `--confirm` is a separate decision made by a human
// who has read the plan.

import { prepare, tokenize, FACTORY_ID, RESOLVER_ID } from '../../src/tokenize/ats.js';
import { ChainWriteError, hbar, settledBalance, usdPerHbar } from '../../src/tokenize/hedera.js';
import { close } from '../../src/store/reports.js';
import { pooled } from '../../src/store/db.js';
import { verifyAts, VerificationError, hashScanLink, sourcifyLink } from './verify-ats.js';

// SM-07's measured lifecycle, per step, so drift is visible rather than inferred. Unit 8 runs the
// first three; `transfer` is Unit 10's and is listed to show what the 8.139 total includes.
const SM07 = { deployEquity: 7.04954250, grantRole: 0.18894645, issue: 0.47346180, transfer: 0.42696150 };
const SM07_UNIT8 = SM07.deployEquity + SM07.grantRole + SM07.issue;   // 7.71195075
const SM07_FULL = SM07_UNIT8 + SM07.transfer;                          // 8.13891225

const reportHash = process.argv[2];
const confirmed = process.argv.includes('--confirm');
if (!reportHash) {
  console.error('usage: tokenize.ts <reportHash> [--confirm]');
  process.exit(1);
}

// ⚠️ A refusal here is the common case, not an exception: an already-tokenized report, a key that
// does not match the analyst row, a dead factory. Every one of them is a sentence an operator should
// read, and a stack trace is what they would otherwise get on the screen they check before spending.
let plan;
try {
  plan = await prepare(reportHash);
} catch (error) {
  console.error(`\nSTOP  ${(error as Error).message}\n`);
  await close();
  process.exit(1);
}

console.log(`\n── About to deploy an ATS asset on Hedera testnet`);
console.log(`  report      ${plan.reportHash}`);
console.log(`  directive   ${plan.report.subject.directive.slice(0, 68)}`);
console.log(`  analyst     ${plan.analyst.id}  ${plan.analyst.hederaAccountId}`);
console.log(`  factory     ${FACTORY_ID}  ${plan.factoryAddress}`);
console.log(`  resolver    ${RESOLVER_ID}  ${plan.resolverAddress}`);
console.log(`  isin        ${plan.isin}`);
console.log(`  info        ${plan.info}`);
console.log(`  recipient   ${plan.analyst.hederaEvmAddress}   (issuer, admin and holder — one account)`);
console.log(`  maxSupply   1        decimals 0        REG_S / NONE`);
console.log(`  balance     ${hbar(plan.balanceTinybars)} HBAR`);
console.log(`  estimate    ~${SM07_UNIT8.toFixed(5)} HBAR for deploy + grantRole + issue (SM-07 measured)`);

// A deploy alone is ~7.05 HBAR; refusing below twice the estimate avoids a half-finished lifecycle.
const floor = BigInt(Math.ceil(SM07_UNIT8 * 2 * 1e8));
if (plan.balanceTinybars < floor) {
  console.error(`\nSTOP  ${hbar(plan.balanceTinybars)} HBAR is under the ${hbar(floor)} HBAR floor (2x the estimate).`);
  console.error('      A run that dies between deploy and issue leaves an asset with no token in it.');
  await close();
  process.exit(1);
}

if (!confirmed) {
  console.log(`\nDRY RUN — nothing was sent. Re-run with --confirm to spend ~${SM07_UNIT8.toFixed(2)} HBAR.\n`);
  await close();
  process.exit(0);
}

const before = plan.balanceTinybars;
let result;
try {
  console.log(`\n── Spending`);
  result = await tokenize(plan);
} catch (error) {
  // ⚠️ Report the Mirror Node reason and STOP. Do not adjust a field and retry — that is exactly how
  // SM-07's first failure would have cost a second deploy.
  if (error instanceof ChainWriteError) {
    console.error(`\nFAIL  ${error.message}`);
    console.error('\n      Do NOT change a field and re-run. The reason above is the fact; work from it.');
  } else {
    console.error(`\nFAIL  ${(error as Error).message}`);
  }
  await close();
  process.exit(1);
}

console.log(`  deploy      ${result.deployTx}`);
console.log(`  grantRole   ${result.grantRoleTx}`);
console.log(`  issue       ${result.issueTx}`);
console.log(`  proxy       ${result.proxyAddress}`);

console.log(`\n── Proof`);
let failed = 0;
const check = (ok: boolean, label: string, detail = '') => {
  console.log(`  ${ok ? '✅' : '❌'} ${label}${detail ? `  ${detail}` : ''}`);
  if (!ok) failed++;
};

// 1. The cross-chain commitment, byte-identical rather than equivalent.
check(result.emittedInfo === `alpha:${plan.reportHash}`, 'EquityDeployed carries alpha:<hash>', result.emittedInfo);
check(result.emittedInfo.slice('alpha:'.length) === plan.reportHash,
  'the emitted hash equals the report hash from the store', 'byte-identical');

// 2. Issuance, not just deployment.
check(result.balance === 1n, `balanceOf(${plan.analyst.hederaEvmAddress.slice(0, 10)}…) == 1`, `got ${result.balance}`);

// 4. The row, as the database reports it.
const [row] = await pooled()`SELECT * FROM report_tokens WHERE report_hash = ${plan.reportHash}`;
console.log(`\n── report_tokens`);
for (const [k, v] of Object.entries(row ?? {})) console.log(`  ${k.padEnd(15)} ${String(v)}`);
check(row !== undefined, 'row written');

// 5. Cost against SM-07, per step so drift is attributable.
console.log(`\n── Cost`);
let derived = 0n;
for (const [label, receipt] of result.receipts) {
  const tinybars = (receipt.gasUsed * receipt.gasPrice) / 10_000_000_000n;
  derived += tinybars;
  const baseline = SM07[label === 'grantRole' ? 'grantRole' : label === 'issue' ? 'issue' : 'deployEquity'];
  const delta = Number(tinybars) / 1e8 - baseline;
  console.log(`  ${label.padEnd(13)} gas ${String(receipt.gasUsed).padStart(9)}  ${hbar(tinybars)} HBAR` +
    `   SM-07 ${baseline.toFixed(8)}  ${delta >= 0 ? '+' : ''}${delta.toFixed(8)}`);
}
const after = await settledBalance(plan.analyst.hederaAccountId, before);
const spent = before - after;
const usd = await usdPerHbar();
console.log(`  ${'derived'.padEnd(13)} ${' '.repeat(13)}  ${hbar(derived)} HBAR`);
console.log(`  balance       ${hbar(before)} → ${hbar(after)}  (−${hbar(spent)} HBAR)`);
console.log(`  SM-07 measured ${SM07_UNIT8.toFixed(8)} for these three steps ` +
  `(${SM07_FULL.toFixed(8)} including Unit 10's transfer)`);
console.log(`  at $${usd.toFixed(6)}/HBAR → $${(Number(spent) / 1e8 * usd).toFixed(4)}`);

// ─── Verify on Sourcify ──────────────────────────────────────────────────────────────────────────
// ⚠️ **This used to print the command instead of running it, and nobody ran it.** Three of the first
// four report tokens sat unverified for a day for exactly that reason, against a requirement that is
// pass/fail on the Hedera track. Printing a next step is not a next step.
//
// ⚠️ **A verification failure MUST NOT fail a tokenization that already succeeded.** By this line the
// asset exists, 7.9 HBAR is spent and the row is written; none of that is undone by Sourcify being
// unreachable. So this is reported and never thrown, the exit code still reflects the *tokenization*
// checks above, and the retry command is printed for a human.
//
// ⚠️ It runs after the proof and the cost so an operator sees the expensive, irreversible part
// first. Verification is free and repeatable; nothing below this line can lose anything.

console.log(`\n── Verify on Sourcify`);
let verifyNote = '';
try {
  const verified = await verifyAts(result.proxyAddress);
  console.log(`\n  ✅ ${verified.match}${verified.alreadyVerified ? '  (already verified — 409 is a success)' : ''}`);
  verifyNote = `verified on Sourcify (${verified.match})`;
} catch (error) {
  const stage = error instanceof VerificationError ? error.stage : 'unknown';
  console.error(`\n  ❌ NOT VERIFIED — failed at ${stage}`);
  console.error(`  ${(error as Error).message}`);
  console.error(`\n  ⚠️ The token exists and the gas is spent. This is the only thing left undone.`);
  console.error(
    stage === 'gate'
      // The one stage that must never be retried blind: the bytes on chain are not what we compiled.
      ? `  ⚠️ The gate refused, which means the deployed bytecode is not what this repo compiles.\n` +
        `     Do NOT retry and do NOT change compiler settings. Investigate the difference above.`
      : `  Retry (free, no gas, repeatable):\n` +
        `     npx tsx scripts/ops/verify-ats.ts ${result.proxyAddress}\n` +
        `  Or sweep every unverified token at once:\n` +
        `     npx tsx --env-file=.env scripts/ops/verify-ats.ts --all`,
  );
  verifyNote = `⚠️ NOT verified — see above`;
}

console.log(`\n  HashScan  ${hashScanLink(result.proxyAddress)}`);
console.log(`  Sourcify  ${sourcifyLink(result.proxyAddress)}`);
console.log(`  status    ${verifyNote}`);
console.log(`\n${failed === 0 ? 'PASS' : `FAIL — ${failed} check(s)`}\n`);
await close();
process.exit(failed === 0 ? 0 : 1);

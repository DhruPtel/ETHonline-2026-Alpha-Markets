// Unit 4's proof. `src/arc/arc.ts` in, PASS or FAIL out.
//
//   npx tsx --env-file=.env scripts/demo/arc.ts
//
// ⚠️ **Needs --env-file, unlike Unit 1's proof.** This unit is the I/O layer: it reads
// `ARC_RPC_URL`, `CIRCLE_API_KEY`, `CIRCLE_ENTITY_SECRET` and `CIRCLE_WALLET_ID`.
//
// ⚠️ **SPENDS NOTHING, AND THAT IS A PROPERTY OF THIS FILE.** Two live reads — Circle's `getWallet`
// and an `eth_call` — and no transaction. `submit()` is written in Unit 4 and exercised in Unit 6,
// which is where a contract address exists to send anything to. ⚠️ Do not add a write here to
// "finish" the proof: Unit 6 drives every path deliberately, once, against a deployed contract.

import { ethers } from 'ethers';
import {
  ARC, analystForAddress, analystIdentity, arcProvider, nativeAmount, nativeFromAmount,
  nativeFromUsdc, submit, usdcFromNative,
} from '../../src/arc/arc.js';
import { ANALYSTS } from '../../src/config/analysts.js';

let failures = 0;
const ok = (label: string, condition: boolean, detail = ''): void => {
  console.log(`  ${condition ? '✅' : '❌'} ${label}${detail ? `   ${detail}` : ''}`);
  if (!condition) failures += 1;
};

/** Assert a call throws, and that its message names the reason rather than just failing. */
const refuses = async (label: string, run: () => unknown, mustSay: string): Promise<void> => {
  try {
    await run();
    ok(label, false, 'did not throw');
  } catch (error) {
    const message = (error as Error).message;
    const said = message.toLowerCase().includes(mustSay.toLowerCase());
    ok(label, said, said ? `"${message.slice(0, 88)}…"` : `threw, but never said "${mustSay}": ${message.slice(0, 88)}`);
  }
};

// ─── 1 · the conversion site, against SM-08's measured number ────────────────────────────────────
// ⚠️ 2500000000000000000 is not a constant anyone chose — it is what the chain reported `msg.value`
// to be when SM-08 sent the string "2.50". Every assertion here is anchored to that measurement.
console.log('\n── 1 · 18-dp native ↔ 6-dp USDC ↔ Circle\'s decimal string');

const MEASURED = 2500000000000000000n;

ok('SM-08\'s wei → a decimal string', nativeAmount(MEASURED) === '2.5', nativeAmount(MEASURED));
ok('"2.50" → SM-08\'s wei', nativeFromAmount('2.50') === MEASURED, `${nativeFromAmount('2.50')}`);
// ⚠️ The string canonicalises ("2.50" → "2.5") and the *number* is what round-trips. Asserting the
// bigint rather than the string is the difference between testing a value and testing a format.
ok('round-trips exactly', nativeFromAmount(nativeAmount(MEASURED)) === MEASURED);
ok('trailing zero is the same number', nativeFromAmount('2.5') === nativeFromAmount('2.50'));

ok('wei → 6-dp USDC units', usdcFromNative(MEASURED) === 2_500_000n, `${usdcFromNative(MEASURED)}`);
ok('6-dp units → wei', nativeFromUsdc(2_500_000n) === MEASURED);
ok('both directions compose', usdcFromNative(nativeFromUsdc(2_500_000n)) === 2_500_000n);
// ⚠️ The 10^12 gap in one line: the same amount is 2.5 at both scales, and 10^12 apart in atoms.
ok('the ERC-20 view of the same amount', ethers.formatUnits(usdcFromNative(MEASURED), 6) === '2.5');

// ⚠️ The assertion that matters most, because the contract charges for the alternative.
// AlphaMarket._checkAmount reverts NotAUsdcUnit on exactly this, so refusing locally is free.
await refuses('refuses a sub-unit remainder', () => usdcFromNative(MEASURED + 1n), 'not a whole 6-dp USDC unit');
ok('one whole unit is the smallest legal stake', usdcFromNative(1_000_000_000_000n) === 1n);

// ─── 2 · a read-only call returns ────────────────────────────────────────────────────────────────
// ⚠️ `decimals()` on the native-USDC predeploy does three jobs at once: it proves the provider works,
// it proves the constant in `ARC` points at a real ERC-20, and it re-measures SM-08's finding that
// the ERC-20 view reports 6 while `msg.value` arrives at 18.
console.log('\n── 2 · the read-only provider, against live Arc');

const provider = arcProvider();
const chainId = (await provider.getNetwork()).chainId;
ok('ARC_RPC_URL is Arc testnet', chainId === ARC.chainId, `chainId ${chainId}`);

const usdc = new ethers.Contract(ARC.nativeUsdc, ['function decimals() view returns (uint8)'], provider);
const decimals = Number(await usdc.decimals!());
ok('native USDC reports 6 decimals', decimals === 6, `${ARC.nativeUsdc} → ${decimals}`);
ok('…while msg.value is 18 — the 10^12 this file exists to hold in one place', 18 - decimals === 12);

// ─── 3 · the analyst identity guard ──────────────────────────────────────────────────────────────
console.log('\n── 3 · CIRCLE_WALLET_ID resolves to the analyst, and nothing else does');

const analyst = ANALYSTS[0]!;
const identity = await analystIdentity();
ok('resolves to config/analysts.ts',
  identity.address.toLowerCase() === analyst.arcAddress.toLowerCase(),
  `${identity.address}`);
ok('and to that analyst\'s row', identity.analyst.id === analyst.id, identity.analyst.id);
ok('memoized — the second call is free', (await analystIdentity()) === identity);

// ⚠️ The deliberately wrong one is not invented: `ARC_WALLET` in .env is the deployer EOA derived
// from ARC_DEPLOYER_KEY, it is a real address in this project's own configuration, and it is exactly
// the identity someone reaches for when they want "the analyst's Arc wallet". This is the mismatch
// the guard exists for, so it is the one the proof uses.
const DEPLOYER = '0xA6B12d8418dF7F6C827AFEB3D8955A881e448079';
ok('the deployer is not the analyst', DEPLOYER.toLowerCase() !== analyst.arcAddress.toLowerCase());
await refuses('refuses the deployer EOA', () => analystForAddress(DEPLOYER), 'not an analyst in config/analysts.ts');
await refuses('…and says why it matters', () => analystForAddress(DEPLOYER), 'could never be attributed to a report');
await refuses('refuses an address nobody owns', () => analystForAddress(ethers.ZeroAddress), 'refusing to sign');

// ─── 4 · submit() refuses before it can spend ────────────────────────────────────────────────────
// ⚠️ This is a real call to `submit()` and it costs nothing, because the empty-key guard is the
// first statement in the function — it throws before the identity lookup and long before Circle is
// asked to create anything. That ordering is the property being proved, not just the message.
console.log('\n── 4 · the empty idempotency key, which `??` would have let through');

await refuses('submit() refuses an empty key',
  () => submit({
    contractAddress: ethers.ZeroAddress,
    abiFunctionSignature: 'nothing()',
    abiParameters: [],
    idempotencyKey: '   ',
  }),
  'idempotencyKey is empty');
await refuses('…naming the `t ?? ee()` reason', () => submit({
  contractAddress: ethers.ZeroAddress, abiFunctionSignature: 'nothing()', abiParameters: [], idempotencyKey: '',
}), 'second transaction and a second spend');

console.log(`\n  analyst   ${identity.analyst.id}  ${identity.address}  (Circle ${identity.walletId})`);
console.log(`  chain     ${ARC.blockchain}  chainId ${ARC.chainId}  USDC ${ARC.nativeUsdc}`);
console.log(failures === 0 ? '\nPASS  arc.ts. No transaction was sent.\n' : `\nFAIL  ${failures} assertion(s).\n`);
process.exit(failures === 0 ? 0 : 1);

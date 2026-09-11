// The Unit 6 deployment, re-checked from the chain alone. Reads only — spends nothing.
//
//   npx tsx --env-file=.env scripts/demo/verify-market.ts
//
// ⚠️ **Written because the drive script's own "second resolve is refused" check was weak.** It sent
// the call as the DEPLOYER, so `NotResolver` fired before `AlreadySettled` could — re-testing the
// guard above it and proving nothing about double resolution. `resolve` has four guards in order
// (resolver → settled → too-early → evidence) and only the caller's own address gets past the first.
// Every refusal here names who it is speaking as.
//
// ⚠️ Every call is `eth_call`. A revert reason costs nothing to obtain, and paying gas to watch a
// guard fire would add no evidence.

import { ethers } from 'ethers';
import { ALPHA_MARKET_ABI } from '../../src/arc/abi.js';
import { analystIdentity, arcProvider } from '../../src/arc/arc.js';
import { requiredEnv } from '../../src/config/env.js';

const ADDRESS = requiredEnv('ARC_MARKET_ADDRESS', 'Deployed by scripts/ops/drive-market.ts (Unit 6).');
const M1 = 2n, M2 = 3n, M3 = 4n, M4 = 5n;   // the rehearsal markets that run created
const EVIDENCE = ethers.keccak256(ethers.toUtf8Bytes('unit-6 rehearsal evidence'));

let failures = 0;
const ok = (label: string, condition: boolean, detail = ''): void => {
  console.log(`  ${condition ? '✅' : '❌'} ${label}${detail ? `   ${detail}` : ''}`);
  if (!condition) failures += 1;
};

const provider = arcProvider();
const identity = await analystIdentity();
const market = new ethers.Contract(ADDRESS, ALPHA_MARKET_ABI, provider);

/** ⚠️ `as` is not decoration — it decides which guard the call reaches. */
const refuses = async (label: string, run: () => Promise<unknown>, expected: string): Promise<void> => {
  try { await run(); ok(label, false, 'DID NOT REVERT'); }
  catch (e) {
    const name = (e as { revert?: { name: string } }).revert?.name
      ?? (e as { shortMessage?: string }).shortMessage ?? String(e);
    ok(label, name.includes(expected), name.slice(0, 64));
  }
};

console.log(`\n── the deployment  ${ADDRESS}`);
ok('resolver is the analyst', ((await market.resolver!()) as string).toLowerCase() === identity.address.toLowerCase());
ok('contract holds nothing — every payout was collected', (await provider.getBalance(ADDRESS)) === 0n);

console.log('\n── settled state, read back from the chain');
for (const [key, id, want] of [['M1', M1, 'resolved TRUE'], ['M2', M2, 'resolved FALSE'],
                               ['M3', M3, 'voided'], ['M4', M4, 'resolved TRUE']] as const) {
  const m = await market.markets!(id);
  const state = m.voided ? 'voided' : m.resolved ? `resolved ${m.outcome ? 'TRUE' : 'FALSE'}` : 'open';
  ok(`${key} is ${want}`, state === want, state);
}

console.log('\n── the guards, each addressed to the caller that actually reaches it');
// ⚠️ THE ONE THE DRIVE SCRIPT GOT WRONG. As the resolver, so the settled check is what fires.
await refuses('second resolve, AS THE RESOLVER → AlreadySettled',
  () => market.resolve!.staticCall(M1, false, EVIDENCE, { from: identity.address }), 'AlreadySettled');
await refuses('…and as anyone else it is NotResolver first',
  () => market.resolve!.staticCall(M1, false, EVIDENCE, { from: ethers.ZeroAddress }), 'NotResolver');
// ⚠️ A voided market is settled too — the same guard covers both, which is worth showing.
await refuses('resolving a VOIDED market → AlreadySettled',
  () => market.resolve!.staticCall(M3, true, EVIDENCE, { from: identity.address }), 'AlreadySettled');
// ⚠️ Labelled for what actually fires. `resolve`'s guards run resolver → settled → too-early →
// evidence, and every market here is settled, so `NoEvidence` is UNREACHABLE now. Saying so beats
// an assertion whose name claims a guard it never touched — which is the mistake this file exists
// to correct, not to repeat one line further down.
await refuses('empty evidence on a settled market still reports AlreadySettled (settled precedes evidence)',
  () => market.resolve!.staticCall(M4, true, ethers.ZeroHash, { from: identity.address }), 'AlreadySettled');
// ⚠️ **`TooEarlyToVoid` is UNREACHABLE on every market here, and that is guard ordering again.**
// `voidMarket` checks `resolved || voided` BEFORE the deadline, so once M4 was resolved the settled
// check began firing first. TooEarlyToVoid WAS proven live, on M4, during the drive run while it was
// still open — this file cannot re-prove it, and asserting it here would just be wrong.
await refuses('voiding a RESOLVED market → AlreadySettled (settled precedes the deadline check)',
  () => market.voidMarket!.staticCall(M4), 'AlreadySettled');
await refuses('double void on M3 → AlreadySettled', () => market.voidMarket!.staticCall(M3), 'AlreadySettled');
// ⚠️ `from` matters here for a duller reason than guard order: an `eth_call` carrying value from an
// address with no balance is rejected by the NODE before the contract runs, and that surfaces as a
// bare "Error" that looks like a decode failure. Sent from a funded address, the real guard answers.
await refuses('stake after closeTime → StakingClosed',
  () => market.stake!.staticCall(M1, 1n, { from: identity.address, value: 10n ** 16n }), 'StakingClosed');
await refuses('claiming twice → AlreadyClaimed',
  () => market.claim!.staticCall(M1, identity.address, { from: identity.address }), 'AlreadyClaimed');

console.log(failures === 0 ? '\nPASS  the deployment reads back as driven.\n' : `\nFAIL  ${failures} check(s).\n`);
process.exit(failures === 0 ? 0 : 1);

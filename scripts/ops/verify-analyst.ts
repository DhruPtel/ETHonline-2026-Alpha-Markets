// Check every row of config/analysts.ts against the services that own the addresses.
//
//   npx tsx --env-file=.env scripts/ops/verify-analyst.ts
//
// A config file cannot prove anything by itself, and the thing it records is inside the report hash.
// Two assertions, both against live services, neither against a constant:
//
//   1. arcAddress       == circle.getWallet({ id: CIRCLE_WALLET_ID }).address,  and accountType EOA
//   2. hederaEvmAddress == Mirror Node's evm_address for the row's own hederaAccountId
//
// ⚠️ **Assertion 1 closes the half of §5.18 that SM-08 could not run.** SM-08 asserts `msg.sender`
// equals the Circle wallet, which is one side; the other side — that `analysts.ts` names the same
// address — had no file to compare against on 2026-09-06. It does now.
//
// ⚠️ **This is READ-ONLY and must stay that way.** `getWallet` is a GET and Mirror Node is a GET.
// Never reach for `scripts/smoke/08-circle-payable-call.ts` to obtain the address: its read is step 1
// of six, steps 4 and 5 deploy a contract and send a payable transaction, and running it without
// CIRCLE_WALLET_ID set creates a SECOND wallet. A second wallet is a wrong-author bug, not an
// inconvenience — every on-chain claim keys on this address.

import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';
import { ANALYSTS } from '../../src/config/analysts.js';
import { MIRROR } from '../../src/tokenize/hedera.js';


const env = (name: string): string => {
  const value = process.env[name]?.trim();
  // ⚠️ Empty counts as missing. A var set to "" is how the deployed probe produced a challenge with
  // an empty payTo (2026-09-08) — `??` falls back on undefined and not on "".
  if (!value) {
    console.error(`FAIL  ${name} is not set (or is empty). Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
  return value;
};

const circle = initiateDeveloperControlledWalletsClient({
  apiKey: env('CIRCLE_API_KEY'),
  entitySecret: env('CIRCLE_ENTITY_SECRET'),
});
const WALLET_ID = env('CIRCLE_WALLET_ID');

const eq = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();
const mark = (ok: boolean): string => (ok ? '✅' : '❌');

let failures = 0;
const fail = (line: string): void => {
  failures += 1;
  console.error(`      ${line}`);
};

for (const a of ANALYSTS) {
  console.log(`\n── ${a.id}  "${a.displayName}"   model ${a.model}`);

  // ─── 1 · Arc identity, live from Circle ────────────────────────────────────────────────────────
  const wallet = (await circle.getWallet({ id: WALLET_ID })).data?.wallet;
  if (!wallet) {
    fail(`CIRCLE_WALLET_ID does not resolve to a wallet. Not falling through to anything else.`);
  } else {
    const addressOk = eq(wallet.address, a.arcAddress);
    const eoaOk = wallet.accountType === 'EOA';
    console.log(`  arcAddress`);
    console.log(`    config      ${a.arcAddress}`);
    console.log(`    circle      ${wallet.address}   ${mark(addressOk)}`);
    console.log(`    accountType ${wallet.accountType}   ${mark(eoaOk)}   blockchain ${wallet.blockchain}   state ${wallet.state}`);
    if (!addressOk) fail(`arcAddress disagrees with Circle. The report hash would attribute to an address that cannot claim.`);
    // ⚠️ An SCA means re-provisioning, and §5.18 is why: `claimId` derives the author from
    // `msg.sender`, and only an EOA's Circle address is deterministic.
    if (!eoaOk) fail(`wallet is ${wallet.accountType}, not EOA — §5.18 requires EOA. Re-provision the wallet set.`);
  }

  // ─── 2 · Hedera identity, live from Mirror Node ────────────────────────────────────────────────
  // ⚠️ Checked, not asserted. The account's own record is the authority on its EVM alias; deriving
  // it from a private key here would only prove we can repeat our own arithmetic.
  const response = await fetch(`${MIRROR}/api/v1/accounts/${a.hederaAccountId}`);
  if (!response.ok) {
    fail(`Mirror Node returned ${response.status} for ${a.hederaAccountId}.`);
  } else {
    const account = (await response.json()) as { evm_address?: string; deleted?: boolean; key?: { _type?: string } };
    const evm = account.evm_address ?? '';
    const evmOk = eq(evm, a.hederaEvmAddress);
    console.log(`  hederaEvmAddress`);
    console.log(`    config      ${a.hederaEvmAddress}`);
    console.log(`    mirror node ${evm || '(none)'}   ${mark(evmOk)}   for ${a.hederaAccountId}`);
    console.log(`    key type    ${account.key?._type ?? 'unknown'}   deleted ${account.deleted}`);
    if (!evmOk) fail(`hederaEvmAddress is not the EVM form of ${a.hederaAccountId}. The ATS token would be issued to the wrong account.`);
    if (account.deleted) fail(`${a.hederaAccountId} is deleted on Hedera.`);
  }
}

console.log('');
if (failures > 0) {
  console.error(`FAIL  ${failures} assertion(s) failed across ${ANALYSTS.length} analyst(s).`);
  process.exit(1);
}
console.log(`PASS  ${ANALYSTS.length} analyst row(s) agree with Circle and Mirror Node.`);
console.log(`      §5.18's "analysts.ts address == Circle wallet address" is now checked, not assumed.`);

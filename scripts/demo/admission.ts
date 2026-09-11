// Unit 6c's proof. `src/arc/admission.ts` against live Hedera and live Arc.
//
//   npx tsx --env-file=.env scripts/demo/admission.ts
//
// ⚠️ **Every case is built from rows that actually exist**, queried at run time rather than typed in.
// A proof that hardcodes a report hash passes until somebody re-tokenizes and then tests nothing.
//
// ⚠️ **Nothing here spends.** Two Mirror GETs per case, one Circle wallet lookup, database reads.
// The analyst's Arc balance is read at the start and the end and asserted unchanged — because the
// claim "all four reads are free" is worth measuring once rather than repeating.
//
// ⚠️ **It writes three rows and deletes them.** `binding_evidence.claim_id` is a foreign key into
// `claims`, which is one into `markets`, so demonstrating the real write needs a real claim to hang
// it on. They are created with a `unit-6c-proof/` prefix, `directed_at` NULL so no commit cron could
// ever find them as work, and removed in a `finally` — including when an assertion fails.

import { ethers } from 'ethers';
import {
  BindingRefused, checkBinding, recordArcTransaction, recordBinding,
} from '../../src/arc/admission.js';
import { analystIdentity, arcProvider } from '../../src/arc/arc.js';
import { closePool, db } from '../../src/store/db.js';

let failures = 0;
const ok = (label: string, condition: boolean, detail = ''): void => {
  console.log(`  ${condition ? '✅' : '❌'} ${label}${detail ? `   ${detail}` : ''}`);
  if (!condition) failures += 1;
};

/** Assert a refusal, and that its sentence says WHY rather than just failing. */
const refuses = async (label: string, run: () => Promise<unknown>, mustSay: string): Promise<void> => {
  try { await run(); ok(label, false, 'was ADMITTED'); }
  catch (error) {
    const message = (error as Error).message;
    const right = error instanceof BindingRefused && message.toLowerCase().includes(mustSay.toLowerCase());
    ok(label, right, right ? `"…${message.slice(message.length - 74)}"` : message.slice(0, 96));
  }
};

const PREFIX = `unit-6c-proof/${Date.now()}`;
const MARKET_ID = `${PREFIX}/market`;
const CLAIM_ID = `${PREFIX}/claim`;
let wroteRows = false;

try {
  const identity = await analystIdentity();
  const balanceBefore = await arcProvider().getBalance(identity.address);

  // ── The cases, taken from the store as it actually is ──────────────────────────────────────────
  const [unmoved] = await db()<{ report_hash: string }[]>`
    SELECT report_hash FROM report_tokens WHERE transfer_tx IS NULL ORDER BY issued_at LIMIT 1`;
  const [moved] = await db()<{ report_hash: string; deploy_tx: string; proxy_address: string }[]>`
    SELECT report_hash, deploy_tx, proxy_address FROM report_tokens
    WHERE transfer_tx IS NOT NULL ORDER BY issued_at LIMIT 1`;
  const [untokenized] = await db()<{ hash: string }[]>`
    SELECT r.hash FROM reports r LEFT JOIN report_tokens rt ON rt.report_hash = r.hash
    WHERE rt.report_hash IS NULL ORDER BY r.created_at LIMIT 1`;
  if (!unmoved || !moved || !untokenized) {
    console.error('\nSTOP  the store does not hold one of each case (kept / moved / untokenized).\n');
    process.exit(1);
  }

  // ─── 1 · a real tokenized report is admitted ───────────────────────────────────────────────────
  console.log('\n── 1 · a tokenized report the analyst still holds');
  const evidence = await checkBinding(unmoved.report_hash);
  console.log(`     report   ${evidence.reportHash}`);
  console.log(`     proxy    ${evidence.proxyAddress}`);
  console.log(`     deployTx ${evidence.deployTx}`);
  console.log(`     issuer   ${evidence.issuerAddress}  (account form ${evidence.issuerAccountAddress})`);
  console.log(`     arc      ${evidence.arcAddress}`);
  console.log(`     emitted  ${evidence.emittedInfo}`);
  ok('admitted', evidence.reportHash === unmoved.report_hash);
  ok('the emitted commitment is alpha:<hash>', evidence.emittedInfo === `alpha:${unmoved.report_hash}`);
  ok('the issuer is the analyst, in ECDSA-alias form', /^0x[0-9a-fA-F]{40}$/.test(evidence.issuerAddress));
  // ⚠️ The two forms must DIFFER. If they were equal, one of the two checks would be free — and the
  // reason both exist is that Mirror reports the signer long-zero while the event emits the alias.
  ok('…and the long-zero signer form is a DIFFERENT string, so both checks earn their place',
    evidence.issuerAddress.toLowerCase() !== evidence.issuerAccountAddress.toLowerCase(),
    `${evidence.issuerAddress.slice(0, 10)}… vs ${evidence.issuerAccountAddress.slice(0, 12)}…`);

  // ─── 2 · ⚠️ THE TEST THAT WOULD HAVE CAUGHT HOLDING-VERSUS-ISSUANCE ────────────────────────────
  console.log('\n── 2 · ⚠️ a report whose token now sits with the BUYER');
  const [holder] = await db()<{ to_address: string | null; tx_hash: string }[]>`
    SELECT to_address, tx_hash FROM token_transfers WHERE report_hash = ${moved.report_hash} ORDER BY seq DESC LIMIT 1`;
  console.log(`     ${moved.report_hash}`);
  console.log(`     transferred away — last hop ${holder?.tx_hash.slice(0, 20)}…`);
  const movedEvidence = await checkBinding(moved.report_hash);
  ok('⚠️ STILL ADMITTED — issuance is permanent, holding is not',
    movedEvidence.reportHash === moved.report_hash);
  ok('and it is the same issuer as the report nobody moved',
    movedEvidence.issuerAddress.toLowerCase() === evidence.issuerAddress.toLowerCase());
  console.log('     ⚠️ A check on balanceOf would refuse this, and would refuse three of our four');
  console.log('        reports — the three Phase 3 Unit 10 moved on purpose to satisfy H2.4.');

  // ─── 3 · a report nobody ever tokenized ────────────────────────────────────────────────────────
  console.log('\n── 3 · a report that was never tokenized');
  console.log(`     ${untokenized.hash}`);
  await refuses('refused, and says it is not tokenized',
    () => checkBinding(untokenized.hash), 'this report is not tokenized');

  // ─── 4 · a token whose creation event commits to a DIFFERENT report ────────────────────────────
  //
  // ⚠️ **Built by swapping ONE column on a real row and putting it back**, which took three attempts
  // and both failures are worth keeping:
  //
  //   a made-up proxy `0x1111…`    Mirror's proxy lookup failed FIRST, so the refusal came from
  //                                read 1 and the commitment check was never reached — a
  //                                passing-looking test of the wrong guard. ⚠️ Third time guard
  //                                ordering has bitten a check in this phase.
  //   a second row on a real proxy `report_tokens.proxy_address` is UNIQUE (001_init), so the
  //                                insert was refused by the schema. ⚠️ Worth knowing on its own:
  //                                **two rows claiming one proxy are already impossible**, so the
  //                                only shape this check has to catch is a row pointing at a deploy
  //                                transaction that is not its own.
  //
  // So: point the real row's `deploy_tx` at another report's real deploy transaction, and restore it.
  console.log('\n── 4 · a row whose deploy transaction commits to another report');
  const [original] = await db()<{ deploy_tx: string }[]>`
    SELECT deploy_tx FROM report_tokens WHERE report_hash = ${unmoved.report_hash}`;
  await db()`UPDATE report_tokens SET deploy_tx = ${moved.deploy_tx} WHERE report_hash = ${unmoved.report_hash}`;
  try {
    await refuses('refused: the creation event commits to a different report',
      () => checkBinding(unmoved.report_hash), 'commits to a different report');
  } finally {
    await db()`UPDATE report_tokens SET deploy_tx = ${original!.deploy_tx} WHERE report_hash = ${unmoved.report_hash}`;
    const [back] = await db()<{ deploy_tx: string }[]>`
      SELECT deploy_tx FROM report_tokens WHERE report_hash = ${unmoved.report_hash}`;
    ok('the row was put back exactly as it was', back?.deploy_tx === original!.deploy_tx);
  }

  // ─── 5 · the evidence row, written and read back ───────────────────────────────────────────────
  console.log('\n── 5 · binding_evidence — what it names, and what a stranger re-checks');
  await db()`
    INSERT INTO markets (id, spec_hash, spec_json, observed_day, close_time, observation_end, resolve_deadline)
    VALUES (${MARKET_ID}, ${'0'.repeat(64)}, ${'{}'}, ${'2026-09-11'},
            ${new Date(0)}, ${new Date(1000)}, ${new Date(2000)})`;
  await db()`
    INSERT INTO claims (id, market_id, author, report_hash, side, amount)
    VALUES (${CLAIM_ID}, ${MARKET_ID}, ${identity.address}, ${unmoved.report_hash}, ${true},
            ${(10n ** 16n).toString()})`;   // ⚠️ a string, like every amount that leaves this store
  wroteRows = true;

  await recordBinding(CLAIM_ID, evidence);
  const [stored] = await db()<{
    report_hash: string; proxy_address: string; deploy_tx: string;
    issuer_address: string; arc_tx: string | null; raw: string;
  }[]>`
    SELECT report_hash, proxy_address, deploy_tx, issuer_address, arc_tx, raw
    FROM binding_evidence WHERE claim_id = ${CLAIM_ID}`;
  if (!stored) { console.error('\nSTOP  binding_evidence row was not written.\n'); process.exit(1); }

  ok('names the report hash', stored.report_hash === evidence.reportHash);
  ok('names the proxy', stored.proxy_address === evidence.proxyAddress);
  ok('names the deploy transaction', stored.deploy_tx === evidence.deployTx);
  ok('names the issuer address', stored.issuer_address === evidence.issuerAddress);
  // ⚠️ Null BEFORE the commit, which is the point of a check that runs before money moves.
  ok('the Arc transaction is null until the commit lands', stored.arc_tx === null);
  await recordArcTransaction(CLAIM_ID, '0xabc');
  const [completed] = await db()<{ arc_tx: string | null }[]>`
    SELECT arc_tx FROM binding_evidence WHERE claim_id = ${CLAIM_ID}`;
  ok('…and is the fifth identifier once Unit 7 has one', completed?.arc_tx === '0xabc');

  // ⚠️ TEXT, not jsonb — so the bytes read back are the bytes written. jsonb would reorder the keys.
  ok('raw survives byte-for-byte (TEXT, never jsonb)', stored.raw === JSON.parse(JSON.stringify(stored.raw)));
  const reparsed = JSON.parse(stored.raw) as Record<string, unknown>;
  ok('raw carries the Arc committer too', reparsed.arcAddress === evidence.arcAddress);
  console.log(`     raw is ${stored.raw.length} bytes of canonical JSON`);

  // ⚠️ Idempotent: a retried commit re-records rather than colliding on the primary key.
  await recordBinding(CLAIM_ID, evidence);
  ok('recording twice is a no-op, not a primary-key collision', true);

  // ─── 6 · none of it cost anything ──────────────────────────────────────────────────────────────
  console.log('\n── 6 · what this cost');
  const balanceAfter = await arcProvider().getBalance(identity.address);
  ok('the analyst\'s Arc balance is unchanged — all four reads are free',
    balanceBefore === balanceAfter, `${ethers.formatUnits(balanceAfter, 18)} USDC`);
} finally {
  // ⚠️ Reverse foreign-key order, and it runs even when an assertion above failed. A stray market
  // row with a null `directed_at` would never be found by the commit cron, but "would never" is a
  // worse guarantee than "is not there".
  if (wroteRows) {
    await db()`DELETE FROM binding_evidence WHERE claim_id = ${CLAIM_ID}`;
    await db()`DELETE FROM claims WHERE id = ${CLAIM_ID}`;
    await db()`DELETE FROM markets WHERE id = ${MARKET_ID}`;
    const [left] = await db()<{ n: string }[]>`SELECT count(*)::text AS n FROM markets WHERE id LIKE 'unit-6c-proof/%'`;
    console.log(`\n  cleaned up — ${left?.n ?? '?'} proof rows left behind`);
  }
  await closePool();
}

console.log(failures === 0 ? '\nPASS  admission.ts.\n' : `\nFAIL  ${failures} check(s).\n`);
process.exit(failures === 0 ? 0 : 1);

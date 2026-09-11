// Unit 9 — put a settlement on chain, and rehearse both paths before the real window opens.
//
//   npx tsx --env-file=.env scripts/ops/resolve-market.ts --rehearse
//   npx tsx --env-file=.env scripts/ops/resolve-market.ts --market=m/…            ← plan only, free
//   npx tsx --env-file=.env scripts/ops/resolve-market.ts --market=m/… --send     ← SPENDS
//
// ⚠️ **THIS SPENDS REAL MONEY.** Gas on Arc is USDC. The run prints a total read from receipts.
//
// ⚠️ **WHY A REHEARSAL RATHER THAN WAITING.** The two live markets cannot resolve before
// 2026-09-13T01:00:00Z — `observationEnd` plus `spec.ts`'s freshness margin — which is submission
// day. **That is the only window they have.** If `resolve.ts` has a bug the first time it runs there
// is no second attempt, so the paths get driven today against throwaway markets instead. Same
// reasoning that put Unit 6 in the plan, and Unit 6 is what found the receipt-before-mined bug.
//
// ⚠️ **A REHEARSAL IS A MACHINERY PROOF AND NEVER A FORECAST.** These markets are created over days
// that have already closed, so nothing here predicts anything. Their ids are prefixed
// `m/rehearsal-` so no query can mistake them for the real thing, and `directed_at` stays NULL so
// the commit cron never sees them.
//
// ⚠️ **Created through ethers with the deployer key, exactly as Unit 6 did.** `market.ts` cannot
// build one: `questionCore` requires `closeTime <= dayStart(observedDay)` while the contract's
// `_open` requires `closeTime > now`, so every market it can make is a forecast. That honesty
// property is the reason a rehearsal has to come in the side door.
//
// ⚠️ **If a chain call reverts this script STOPS and prints the reason.** It never adjusts a
// parameter and retries. A revert here is the bug the unit exists to find before Sunday.

import { ethers } from 'ethers';
import { ALPHA_MARKET_ABI } from '../../src/arc/abi.js';
import { ARC, analystIdentity, arcProvider, submit } from '../../src/arc/arc.js';
import { prepare, resolveMarket, voidMarket, ResolveRefused, type ResolvePlan } from '../../src/arc/resolve.js';
import { recordSettlement, settle } from '../../src/arc/settle.js';
import { dayStart, observationEnd, specHash, validateSpec, type MarketSpec } from '../../src/arc/spec.js';
import { canonical, hashCanonical } from '../../src/domain/canonical.js';
import { close, marketById } from '../../src/store/markets.js';
import { db } from '../../src/store/db.js';
import { requiredEnv } from '../../src/config/env.js';

const argv = process.argv.slice(2);
const flag = (name: string): string | undefined =>
  argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`))?.split('=')[1] ?? (argv.includes(`--${name}`) ? '' : undefined);

const USDC = (wei: bigint): string => `${ethers.formatUnits(wei, 18)} USDC`;
let failures = 0;
const ok = (label: string, condition: boolean, detail = ''): void => {
  console.log(`  ${condition ? '✅' : '❌'} ${label}${detail ? `   ${detail}` : ''}`);
  if (!condition) failures += 1;
};

function stop(label: string, e: unknown): never {
  const err = e as { shortMessage?: string; reason?: string; message?: string };
  console.error(`\n❌ STOPPED at ${label}\n   ${err.reason ?? err.shortMessage ?? err.message ?? String(e)}`);
  console.error('\n⚠️ Not retrying and not adjusting. A revert here is the finding.');
  process.exit(1);
}

/** A refusal is only proof if it fired at the guard being tested. ⚠️ Four negative tests have been
 *  broken this phase by a refusal one guard above the one under test. */
async function refuses(label: string, marketId: string, fragment: string): Promise<void> {
  try {
    const plan = await prepare(marketId);
    ok(label, false, `NOT refused — returned action "${plan.action}"`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const right = e instanceof ResolveRefused && msg.includes(fragment);
    ok(label, right, right ? `"${fragment}"` : `wrong guard: ${msg.slice(0, 140)}`);
  }
}

const spend: { label: string; hash: string; gas: bigint; by: 'deployer' | 'analyst' }[] = [];
async function accrue(label: string, hash: string, by: 'deployer' | 'analyst'): Promise<void> {
  const receipt = await arcProvider().waitForTransaction(hash, 1, 180_000);
  if (!receipt) stop(label, { message: `no receipt for ${hash} within 180s` });
  spend.push({ label, hash, gas: receipt.gasUsed * receipt.gasPrice, by });
  console.log(`     ${label.padEnd(30)} ${hash.slice(0, 18)}…  gas ${ethers.formatUnits(receipt.gasUsed * receipt.gasPrice, 18)}`);
}

const provider = arcProvider();
const CONTRACT = requiredEnv('ARC_MARKET_ADDRESS', 'Deployed by Unit 6.');
const identity = await analystIdentity();

// ─── The operational path ────────────────────────────────────────────────────────────────────────

const target = flag('market');
if (target) {
  const market = await marketById(target);
  if (!market) { console.error(`no market ${target}`); process.exit(1); }
  // ⚠️ The two live markets carry real stakes and cannot legally settle before Sunday 01:00Z.
  // Touching one is a deliberate gesture, never a default.
  if ((market.chainMarketId === '6' || market.chainMarketId === '7') && flag('live') === undefined) {
    console.error(`\n⚠️ chain market ${market.chainMarketId} is LIVE and committed. Pass --live to mean it.`);
    process.exit(1);
  }
  const plan = await prepare(target).catch((e: unknown) => {
    console.error(`\n⚠️ REFUSED\n   ${(e as Error).message}`); process.exit(1);
  });
  console.log(`\n  market      ${plan.marketId}  (chain ${plan.chainMarketId} on ${plan.contractAddress})`);
  console.log(`  action      ${plan.action.toUpperCase()}`);
  console.log(`  outcome     ${plan.outcome === null ? '—' : plan.outcome ? 'TRUE' : 'FALSE'}`);
  console.log(`  observed    ${plan.observedValue ?? '—'}`);
  console.log(`  evidence    ${plan.evidenceHash ?? '—'}`);
  console.log(`  why         ${plan.reason}`);
  if (flag('send') === undefined) {
    console.log('\n  Nothing sent. Re-run with --send to spend.');
  } else {
    const sent = plan.action === 'void' ? await voidMarket(plan) : await resolveMarket(plan);
    console.log(`\n  ✅ ${plan.action} ${sent.alreadyLanded ? 'reconciled from chain, nothing spent' : `landed in ${sent.txHash}`}`);
  }
  await close();
  process.exit(0);
}

if (flag('rehearse') === undefined) {
  console.error('usage: --rehearse | --market=<id> [--send]');
  process.exit(1);
}

// ─── Phase 0 · preflight ─────────────────────────────────────────────────────────────────────────

console.log('\n══ Phase 0 · preflight — spends nothing');

const deployer = new ethers.Wallet(`0x${requiredEnv('ARC_DEPLOYER_KEY').replace(/^0x/, '')}`, provider);
const contract = new ethers.Contract(CONTRACT, ALPHA_MARKET_ABI, deployer);
const before = { analyst: await provider.getBalance(identity.address), deployer: await provider.getBalance(deployer.address) };

ok('chainId is Arc testnet', (await provider.getNetwork()).chainId === ARC.chainId);
ok('deployer is NOT the analyst', deployer.address.toLowerCase() !== identity.address.toLowerCase());
ok('analyst IS the immutable resolver', ((await contract.resolver!()) as string).toLowerCase() === identity.address.toLowerCase());
ok('deployer can pay', before.deployer > ethers.parseUnits('0.05', 18), USDC(before.deployer));
ok('analyst can pay', before.analyst > ethers.parseUnits('0.05', 18), USDC(before.analyst));
if (failures) { console.error('\npreflight failed — nothing was sent.'); process.exit(1); }

// ─── Helpers that build a rehearsal market ───────────────────────────────────────────────────────

const rid = (parts: unknown): string => `m/rehearsal-${hashCanonical(parts).slice(0, 16)}`;

/** Create on chain through ethers, then write the row. ⚠️ Times are all in the past by design. */
async function rehearsalMarket(spec: MarketSpec, resolveDeadline: number): Promise<string> {
  const core = { specHash: `0x${specHash(spec)}`, closeTime: dayStart(spec.observedDay), observationEnd: observationEnd(spec.observedDay), resolveDeadline };
  const tx = await contract.createMarket!(core).catch((e: unknown) => stop(`createMarket ${spec.observedDay}`, e));
  await accrue(`createMarket ${spec.observedDay}`, tx.hash, 'deployer');
  const receipt = await provider.getTransactionReceipt(tx.hash);
  const iface = new ethers.Interface(ALPHA_MARKET_ABI);
  const created = receipt!.logs.map((l) => { try { return iface.parseLog(l); } catch { return null; } }).find((p) => p?.name === 'MarketCreated');
  if (!created) stop(`createMarket ${spec.observedDay}`, { message: 'no MarketCreated event' });
  const chainId = (created.args[0] as bigint).toString();

  const id = rid({ CONTRACT, chainId });
  await db()`
    INSERT INTO markets (id, spec_hash, spec_json, observed_day, close_time, observation_end,
                         resolve_deadline, contract_address, chain_market_id, create_tx, landed_at)
    VALUES (${id}, ${specHash(spec)}, ${JSON.stringify(spec)}, ${spec.observedDay},
            ${new Date(core.closeTime * 1000)}, ${new Date(core.observationEnd * 1000)},
            ${new Date(resolveDeadline * 1000)}, ${CONTRACT}, ${chainId}, ${tx.hash}, now())
    ON CONFLICT (id) DO NOTHING`;
  console.log(`     row ${id}  ← chain market ${chainId}`);
  return id;
}

/** A second row observing a chain market that already exists. ⚠️ No gas — it is a store-side view. */
async function shadowRow(of: string, label: string, resolveDeadline: Date): Promise<string> {
  const m = (await marketById(of))!;
  const id = `m/rehearsal-${label}-${m.chainMarketId}`;
  await db()`
    INSERT INTO markets (id, spec_hash, spec_json, observed_day, close_time, observation_end,
                         resolve_deadline, contract_address, chain_market_id, landed_at)
    VALUES (${id}, ${m.specHash}, ${m.specJson}, ${m.observedDay}, ${m.closeTime}, ${m.observationEnd},
            ${resolveDeadline}, ${m.contractAddress}, ${m.chainMarketId}, now())
    ON CONFLICT (id) DO NOTHING`;
  return id;
}

const DAY = 86_400;
const nowSec = Math.floor(Date.now() / 1000);

// ─── Phase 1 · the resolve path ──────────────────────────────────────────────────────────────────

console.log('\n══ Phase 1 · a day that closed, resolved');

// ⚠️ 2026-09-10 is the latest FINISHED day, and past observationEnd + the freshness margin.
const settledSpec = validateSpec({
  slug: 'aave-v3-ethereum', metric: 'totalDepositBalanceUSD', comparison: 'above',
  threshold: '20000000000', observedDay: '2026-09-10',
});
// ⚠️ resolveDeadline two days out, so this market is resolvable and NOT yet voidable.
const R1 = await rehearsalMarket(settledSpec, nowSec + 2 * DAY);

await refuses('refuses a market that is not in the store', 'm/does-not-exist', 'no market');
await refuses('refuses before Unit 8 has run', R1, 'no settlement_evidence row');

// ⚠️ **A FUTURE observed day, and that is not cosmetic.** This row never lands on chain, so it never
// gets a landmark — and `marketsAwaitingResolve` is `observation_end <= asOf AND resolved_at IS
// NULL`, so a past-dated fixture would be returned to Unit 11's cron every day forever. A future day
// keeps the row consistent with itself and invisible to the find-work query. The guard under test is
// #2 and fires before any time is read, so the day makes no difference to what is being proven.
const futureSpec = validateSpec({ ...settledSpec, observedDay: '2026-09-20' });
const noChain = `m/rehearsal-never-landed-${nowSec}`;
await db()`
  INSERT INTO markets (id, spec_hash, spec_json, observed_day, close_time, observation_end,
                       resolve_deadline, contract_address)
  VALUES (${noChain}, ${specHash(futureSpec)}, ${JSON.stringify(futureSpec)}, ${futureSpec.observedDay},
          ${new Date(dayStart(futureSpec.observedDay) * 1000)}, ${new Date(observationEnd(futureSpec.observedDay) * 1000)},
          ${new Date((observationEnd(futureSpec.observedDay) + 2 * DAY) * 1000)}, ${CONTRACT})`;
await refuses('refuses a market that never landed on chain', noChain, 'no chain_market_id');

const settlement = await settle(settledSpec);
ok('settle() found the day', settlement.kind === 'settled', settlement.kind === 'settled' ? `${settledSpec.observedDay} → ${settlement.outcome ? 'TRUE' : 'FALSE'} on ${settlement.observed}` : '');
await recordSettlement(R1, settlement);

// ⚠️ Tamper the stored bytes and put them back in a finally — Unit 6c's pattern, because the only
// honest way to reach this guard is to break the thing it guards.
//
// ⚠️ **Whitespace is NOT a tamper and the first draft of this test used it.** `verifyStoredEvidence`
// parses the row before hashing, so a space added to the stored TEXT canonicalizes straight back out
// and the check would have passed while proving nothing. The response bytes are what the hash is
// supposed to defend, so that is what gets changed: one digit inside `record.raw`, which breaks
// `responseHash` and the record hash over it at once.
const [kept] = await db()<{ raw: string }[]>`SELECT raw FROM settlement_evidence WHERE market_id = ${R1}`;
try {
  const doctored = JSON.parse(kept!.raw) as { raw: string };
  doctored.raw = doctored.raw.replace(/[0-9]/, (d) => (d === '9' ? '8' : '9'));
  await db()`UPDATE settlement_evidence SET raw = ${canonical(doctored)} WHERE market_id = ${R1}`;
  await refuses('refuses when the stored bytes no longer hash', R1, 'no longer hashes to');
} finally {
  await db()`UPDATE settlement_evidence SET raw = ${kept!.raw} WHERE market_id = ${R1}`;
}
const [restored] = await db()<{ raw: string }[]>`SELECT raw FROM settlement_evidence WHERE market_id = ${R1}`;
ok('the tampered bytes were restored', restored!.raw === kept!.raw);

const plan1 = await prepare(R1);
ok('plans a RESOLVE', plan1.action === 'resolve', plan1.reason);
ok('the hash is the STORED one', settlement.kind === 'settled' && plan1.evidenceHash === settlement.evidenceHash);

const sent1 = await resolveMarket(plan1).catch((e: unknown) => stop('resolve', e));
await accrue('resolve', sent1.txHash!, 'analyst');

const afterR1 = (await marketById(R1))!;
const chainR1 = await contract.markets!(BigInt(plan1.chainMarketId));
ok('resolved_at written', afterR1.resolvedAt !== null, afterR1.resolvedAt?.toISOString());
ok('outcome written', afterR1.outcome === plan1.outcome, String(afterR1.outcome));
ok('evidence_hash written', afterR1.evidenceHash === plan1.evidenceHash);
ok('the chain agrees it resolved', chainR1.resolved === true && chainR1.outcome === plan1.outcome);
ok('the chain carries the SAME hash', (chainR1.evidenceHash as string).slice(2) === plan1.evidenceHash);
await refuses('refuses a market already settled in the store', R1, 'already settled in the store');

// ⚠️ Crash recovery: a row that never learned what the chain already knows.
console.log('\n══ Phase 2 · reconciling a row the chain settled without us');
const shadow = await shadowRow(R1, 'reconcile', new Date((nowSec + 2 * DAY) * 1000));
await recordSettlement(shadow, settlement);
const planS = await prepare(shadow);
ok('plans a RECONCILE', planS.action === 'reconcile', planS.reason);
const sentS = await resolveMarket(planS);
const afterS = (await marketById(shadow))!;
ok('nothing was sent', sentS.alreadyLanded && sentS.txHash === null);
ok('the landmark came from the chain', afterS.resolvedAt !== null && afterS.outcome === plan1.outcome && afterS.evidenceHash === plan1.evidenceHash);

// ─── Phase 3 · the void path ─────────────────────────────────────────────────────────────────────

console.log('\n══ Phase 3 · a day with no snapshot, voided');

const missingSpec = validateSpec({
  slug: 'aave-v3-ethereum', metric: 'totalDepositBalanceUSD', comparison: 'above',
  threshold: '1000000000', observedDay: '2021-01-01',
});
// ⚠️ Every time in the past, so the deadline has already passed and the void is legal now.
const R2 = await rehearsalMarket(missingSpec, observationEnd(missingSpec.observedDay) + 2 * DAY);

const missing = await settle(missingSpec);
ok('settle() found no observation', missing.kind === 'MISSING_OBSERVATION');
await recordSettlement(R2, missing);

// ⚠️ The deadline is on OUR row, so the too-early guard is reachable by moving it and putting it back.
const keptDeadline = (await marketById(R2))!.resolveDeadline;
try {
  await db()`UPDATE markets SET resolve_deadline = ${new Date((nowSec + 2 * DAY) * 1000)} WHERE id = ${R2}`;
  await refuses('refuses to void before the resolveDeadline', R2, 'has not passed');
} finally {
  await db()`UPDATE markets SET resolve_deadline = ${keptDeadline} WHERE id = ${R2}`;
}
ok('the deadline was restored', (await marketById(R2))!.resolveDeadline.getTime() === keptDeadline.getTime());

const plan2 = await prepare(R2);
ok('plans a VOID', plan2.action === 'void', plan2.reason);
ok('a void carries no evidence hash', plan2.evidenceHash === null && plan2.outcome === null);

const sent2 = await voidMarket(plan2).catch((e: unknown) => stop('voidMarket', e));
await accrue('voidMarket', sent2.txHash, 'analyst');

const afterR2 = (await marketById(R2))!;
const chainR2 = await contract.markets!(BigInt(plan2.chainMarketId));
ok('voided_at written', afterR2.voidedAt !== null, afterR2.voidedAt?.toISOString());
ok('void_tx written', afterR2.voidTx === sent2.txHash);
ok('voided_by is the caller', afterR2.voidedBy?.toLowerCase() === identity.address.toLowerCase(), afterR2.voidedBy ?? '');
ok('the chain agrees it voided', chainR2.voided === true && chainR2.resolved === false);
ok('outcome stayed null on a void', afterR2.outcome === null);

// ─── What it cost ────────────────────────────────────────────────────────────────────────────────

console.log('\n══ What this cost');
const total = spend.reduce((t, s) => t + s.gas, 0n);
for (const s of spend) console.log(`  ${s.by.padEnd(9)} ${s.label.padEnd(30)} ${ethers.formatUnits(s.gas, 18)}`);
console.log(`  ${''.padEnd(9)} ${'TOTAL'.padEnd(30)} ${ethers.formatUnits(total, 18)} USDC`);
const after = { analyst: await provider.getBalance(identity.address), deployer: await provider.getBalance(deployer.address) };
console.log(`  analyst  ${USDC(before.analyst)} → ${USDC(after.analyst)}`);
console.log(`  deployer ${USDC(before.deployer)} → ${USDC(after.deployer)}`);

console.log(`\n${failures === 0 ? '✅ PASS' : `❌ ${failures} FAILED`}  — ${spend.length} transactions`);
await close();
process.exit(failures === 0 ? 0 : 1);

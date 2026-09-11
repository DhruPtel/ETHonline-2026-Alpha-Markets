// Unit 6 — deploy AlphaMarket to Arc testnet and drive every path by hand.
//
//   npx tsx --env-file=.env scripts/ops/drive-market.ts --preflight   ← checks, spends nothing
//   npx tsx --env-file=.env scripts/ops/drive-market.ts               ← deploys and spends
//
// ⚠️ **THIS SPENDS REAL MONEY.** Gas on Arc is USDC, so every transaction here — including a
// reverted one — costs the analyst's or the deployer's balance. The run prints a total.
//
// ⚠️ **There is no test framework, by decision, so this is the only place contract bugs can be
// found.** A bug found here costs a redeploy. Found after Unit 10 it costs a redeploy *and* every
// row that references the old address. If anything reverts unexpectedly this script STOPS and prints
// the reason — it never adjusts a parameter and retries, because working around a contract bug is
// the one outcome that would make the whole unit pointless.
//
// ── Two identities, and the deploy is not the analyst ────────────────────────────────────────────
//
// ⚠️ `deployContract` ships in Circle's typings and is **not exposed on the developer-controlled
// wallets client** (SM-08's header). So the deployer is necessarily a different identity from the
// analyst that commits: `ARC_DEPLOYER_KEY` deploys through ethers, and the analyst signs through
// Circle. That is recorded so nobody later reads it as a bug.
//
//   deployer  0xA6B1…8079  ethers    deploys, creates markets, stakes as "somebody else", voids
//   analyst   0x1b70…16a7  Circle    commits, resolves, claims — every write through Unit 4's submit()
//
// ⚠️ The deployer doubles as the second EOA staker. It is the only non-Circle key this project has,
// and what the test needs is *an address that is not the analyst*, which it is.
//
// ── The rehearsal timeline, and why it cannot be a single instant ────────────────────────────────
//
// ⚠️ **A market cannot be both stakeable and resolvable at the same moment, and that is a property
// of the contract rather than a limitation of this script.** `_open` refuses once
// `block.timestamp >= closeTime`; `resolve` refuses until `block.timestamp >= observationEnd`; and
// `createMarket` requires `closeTime < observationEnd`. So there is always a gap, and this script
// waits through it rather than pretending otherwise.
//
// ⚠️ `createMarket` deliberately does NOT require `observationEnd > block.timestamp` — that is what
// makes a rehearsal possible at all, and it is why these markets can settle today instead of on a
// calendar day. ⚠️ **Their commits are after the fact. They are NOT forecasts and must never be
// presented as one.** The demo market is the one that means anything.

import { randomUUID } from 'node:crypto';
import { ethers } from 'ethers';
import {
  ALPHA_MARKET_ABI, ALPHA_MARKET_BUILD, ALPHA_MARKET_BYTECODE, ALPHA_MARKET_DEPLOYED_BYTECODE,
} from '../../src/arc/abi.js';
import { ARC, analystIdentity, arcProvider, submit } from '../../src/arc/arc.js';
import { requiredEnv } from '../../src/config/env.js';

const PREFLIGHT_ONLY = process.argv.includes('--preflight');
/**
 * ⚠️ `--address=0x…` reuses an already-deployed contract instead of paying to deploy a second one.
 * The first run of this script deployed successfully and then died in Phase 2 on a script bug (a
 * receipt read before the transaction was mined). Redeploying to get past that would have spent
 * ~0.024 USDC to replace a contract that was already correct.
 */
const REUSE = process.argv.find((a) => a.startsWith('--address='))?.slice('--address='.length);
const EXPLORER = 'https://testnet.arcscan.app';

const USDC = (wei: bigint): string => `${ethers.formatUnits(wei, 18)} USDC`;
const now = (): number => Math.floor(Date.now() / 1000);
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

let failures = 0;
const ok = (label: string, condition: boolean, detail = ''): void => {
  console.log(`  ${condition ? '✅' : '❌'} ${label}${detail ? `   ${detail}` : ''}`);
  if (!condition) failures += 1;
};

/** ⚠️ Every unexpected revert lands here. It reports and exits; it never retries. */
function stop(what: string, error: unknown): never {
  const e = error as { shortMessage?: string; message?: string; data?: string; revert?: { name: string; args: unknown[] } };
  console.error(`\n❌ STOP — ${what} reverted and that was not expected.`);
  if (e.revert) console.error(`   revert: ${e.revert.name}(${e.revert.args.map(String).join(', ')})`);
  console.error(`   ${e.shortMessage ?? e.message ?? String(error)}`);
  if (e.data) console.error(`   data: ${e.data}`);
  console.error('\n   ⚠️ Not retrying with different parameters. A contract bug found here is the');
  console.error('      point of this unit, and working around one would hide it.');
  process.exit(1);
}

const iface = new ethers.Interface(ALPHA_MARKET_ABI);

// ── Cost accounting ──────────────────────────────────────────────────────────────────────────────
// ⚠️ Read from receipts, never estimated. Both rails end in a transaction hash, so gas is totalled
// the same way whether Circle or ethers signed it.
const spend: { label: string; hash: string; gas: bigint; by: 'deployer' | 'analyst' }[] = [];

async function record(label: string, hash: string, by: 'deployer' | 'analyst'): Promise<ethers.TransactionReceipt> {
  const provider = arcProvider();
  // ⚠️ **WAIT, never getTransactionReceipt.** Unit 4's submit() returns at `SENT` — the hash exists
  // and the transaction is not mined — and an ethers `tx` object is un-mined too. Reading the
  // receipt straight away returns null, which is a script bug that reads exactly like a chain fault.
  const receipt = await provider.waitForTransaction(hash, 1, 180_000);
  if (!receipt) stop(label, { message: `no receipt for ${hash} within 180s — it may still be in flight` });
  const gas = receipt.gasUsed * receipt.gasPrice;
  spend.push({ label, hash, gas, by });
  console.log(`     ${label.padEnd(34)} ${hash.slice(0, 18)}…  gas ${ethers.formatUnits(gas, 18)}`);
  if (receipt.status !== 1) stop(label, { message: `receipt status 0 for ${hash}` });
  return receipt;
}

/** The analyst's rail. ⚠️ Every analyst write goes through Unit 4, so this exercises it too. */
async function analystCall(
  label: string, address: string, signature: string, params: unknown[], value?: bigint,
): Promise<ethers.TransactionReceipt> {
  // ⚠️ A fresh key per action is right HERE and wrong in Unit 7: this script is one-shot and has no
  // row to store one on. Unit 7 writes the key to the row before the call so a retry reuses it.
  const sent = await submit({
    contractAddress: address, abiFunctionSignature: signature, abiParameters: params,
    ...(value === undefined ? {} : { value }),
    idempotencyKey: randomUUID(),
  });
  return record(label, sent.txHash, 'analyst');
}

// ─── Phase 0 · preflight, which spends nothing ───────────────────────────────────────────────────

console.log('\n══ Phase 0 · preflight');

const provider = arcProvider();
const deployer = new ethers.Wallet(`0x${requiredEnv('ARC_DEPLOYER_KEY').replace(/^0x/, '')}`, provider);
const identity = await analystIdentity();

const chainId = (await provider.getNetwork()).chainId;
ok('chainId is Arc testnet', chainId === ARC.chainId, `${chainId}`);
ok('analyst resolves through Unit 4\'s guard', identity.address.toLowerCase() === '0x1b7035bbe0da8f3bcb721863d42e1079e4a116a7');
ok('deployer is NOT the analyst', deployer.address.toLowerCase() !== identity.address.toLowerCase(),
  `${deployer.address} vs ${identity.address}`);

// ⚠️ The committed artifact, not a fresh compile. Deploying bytecode the app does not decode against
// is the exact failure `prebuild`'s drift gate exists to prevent.
ok('artifact is the cancun build', ALPHA_MARKET_BUILD.deployedBytecodeLength === 4783,
  `${ALPHA_MARKET_BUILD.deployedBytecodeLength} deployed bytes`);

// ⚠️ THE EVM VERSION CHECK. cancun and paris produce different bytecode for this source, and the
// committed artifact is cancun — so a pre-cancun chain is a LIVE REVERT, not a compile error.
const head = await provider.send('eth_getBlockByNumber', ['latest', false]) as Record<string, unknown>;
const forkFields = ['blobGasUsed', 'excessBlobGas', 'parentBeaconBlockRoot', 'requestsHash'] as const;
for (const f of forkFields) console.log(`     header.${f.padEnd(22)} ${head[f] == null ? '-- ABSENT --' : 'present'}`);
ok('chain is at or past Cancun (4844 + 4788 fields)',
  head.blobGasUsed != null && head.excessBlobGas != null && head.parentBeaconBlockRoot != null);
ok('…and in fact Prague (7685 requestsHash)', head.requestsHash != null);

const balances = {
  deployer: await provider.getBalance(deployer.address),
  analyst: await provider.getBalance(identity.address),
};
console.log(`     deployer ${deployer.address}  ${USDC(balances.deployer)}`);
console.log(`     analyst  ${identity.address}  ${USDC(balances.analyst)}`);
// ⚠️ Checked rather than assumed. Orientation measured these yesterday and a faucet is not a promise.
ok('deployer can pay for a deploy', balances.deployer > ethers.parseUnits('0.5', 18));
ok('analyst can commit and resolve', balances.analyst > ethers.parseUnits('0.5', 18));

if (failures > 0) { console.error(`\nFAIL  ${failures} preflight check(s). Nothing was spent.\n`); process.exit(1); }
if (PREFLIGHT_ONLY) { console.log('\nPASS  preflight only. Nothing was deployed and nothing was spent.\n'); process.exit(0); }

// ─── Phase 1 · deploy ────────────────────────────────────────────────────────────────────────────
//
// ⚠️ The constructor takes the resolver and it is IMMUTABLE — no setter, by decision. It must be the
// analyst's Circle wallet, because that is the only party that runs the Graph read and can produce a
// matching evidenceHash. Getting this wrong means redeploying, not reconfiguring.

console.log('\n══ Phase 1 · deploy');
console.log(`  resolver → ${identity.address}  (the analyst's Circle wallet, immutable)`);

let ADDRESS: string;
if (REUSE) {
  ADDRESS = ethers.getAddress(REUSE);
  console.log(`  reusing an already-deployed contract — nothing spent on a second deploy`);
} else {
  const factory = new ethers.ContractFactory(ALPHA_MARKET_ABI, ALPHA_MARKET_BYTECODE, deployer);
  const deployed = await factory.deploy(identity.address).catch((e) => stop('deploy', e));
  const deployTx = deployed.deploymentTransaction()!;
  await deployed.waitForDeployment();
  ADDRESS = await deployed.getAddress();
  await record('deploy', deployTx.hash, 'deployer');
}
console.log(`  ⇒ ${ADDRESS}`);
console.log(`     ${EXPLORER}/address/${ADDRESS}`);

const market = new ethers.Contract(ADDRESS, ALPHA_MARKET_ABI, deployer);

// ⚠️ **THE OPCODE CHECK, AND IT IS FREE.** Header fields say what the chain claims to support; this
// EXECUTES the deployed runtime bytecode. If the cancun-era codegen in this artifact were not
// supported, an eth_call into it would revert here — before any market exists to lose.
const onChainCode = await provider.getCode(ADDRESS);
// ⚠️ **The artifact and the on-chain code are NOT byte-identical, and that is correct.** `resolver`
// is `immutable`, so the constructor writes the address INTO the runtime code at deploy time — the
// artifact carries `PUSH32 0` placeholders where the chain carries the analyst. Measured here: two
// slots differ, at bytes 253–272 and 1949–1968, each exactly the 20-byte address. Masking the
// resolver back out is what makes this a real equality check rather than a length comparison.
const masked = onChainCode.toLowerCase().replaceAll(identity.address.slice(2).toLowerCase(), '0'.repeat(40));
ok('on-chain code is the committed artifact, once the immutable resolver is masked out',
  masked === ALPHA_MARKET_DEPLOYED_BYTECODE.toLowerCase(),
  `${(onChainCode.length - 2) / 2} bytes on chain, artifact says ${ALPHA_MARKET_BUILD.deployedBytecodeLength}`);
const [cap, scale, chainResolver] = await Promise.all([
  market.MAX_STAKE!(), market.UNIT_SCALE!(), market.resolver!(),
]).catch((e) => stop('view calls into the deployed contract (the opcode check)', e));
ok('runtime bytecode EXECUTES — cancun opcodes are real here', cap > 0n && scale > 0n);
ok('resolver is the analyst, immutably', (chainResolver as string).toLowerCase() === identity.address.toLowerCase());
console.log(`     MAX_STAKE ${USDC(cap as bigint)}   UNIT_SCALE ${scale}`);

// ─── Phase 2 · four markets ──────────────────────────────────────────────────────────────────────

const STAKE_WINDOW = 420;            // seconds for every commit and stake to land before closeTime
const T0 = now();
const CLOSE = T0 + STAKE_WINDOW;
const OBS_END = CLOSE + 1;           // ⚠️ closeTime < observationEnd is required; 1s is the minimum

/** ⚠️ A rehearsal placeholder, not a report. Unit 6c is what binds a claim to real issued work. */
const REHEARSAL_HASH = ethers.keccak256(ethers.toUtf8Bytes('unit-6 rehearsal — not a forecast'));
const UNIT = 10n ** 16n;             // 0.01 USDC in 18-dp native. A whole 6-dp unit, so _checkAmount passes.

const PLAN = [
  { key: 'M1', what: 'normal resolution, redistribution', deadline: OBS_END },
  { key: 'M2', what: 'stake from a 2nd EOA, empty winning pool', deadline: OBS_END },
  { key: 'M3', what: 'void', deadline: OBS_END },
  // ⚠️ Deadline a day out, so `voidMarket` is refused on it while the others can be voided.
  { key: 'M4', what: 'single staker, and void-too-early', deadline: T0 + 86_400 },
] as const;

console.log('\n══ Phase 2 · create four rehearsal markets');
console.log(`  closeTime ${new Date(CLOSE * 1000).toISOString()}  observationEnd +1s`);

const ids: Record<string, bigint> = {};
for (const m of PLAN) {
  const spec = ethers.keccak256(ethers.toUtf8Bytes(`unit-6/${m.key}/${T0}`));
  const tx = await market.createMarket!({
    specHash: spec, closeTime: CLOSE, observationEnd: OBS_END, resolveDeadline: m.deadline,
  }).catch((e: unknown) => stop(`createMarket ${m.key}`, e));
  const receipt = await record(`createMarket ${m.key}`, tx.hash, 'deployer');
  const created = receipt.logs.map((l) => { try { return iface.parseLog(l); } catch { return null; } })
    .find((p) => p?.name === 'MarketCreated');
  if (!created) stop(`createMarket ${m.key}`, { message: 'no MarketCreated event' });
  ids[m.key] = created.args[0] as bigint;
  console.log(`     ${m.key} = market ${ids[m.key]}  (${m.what})`);
}

// ─── Phase 3 · commits and stakes, inside the window ─────────────────────────────────────────────

console.log('\n══ Phase 3 · commit and stake (before closeTime)');

const claimIds: Record<string, bigint> = {};
const claimIdFrom = (r: ethers.TransactionReceipt, key: string): bigint => {
  const ev = r.logs.map((l) => { try { return iface.parseLog(l); } catch { return null; } })
    .find((p) => p?.name === 'PredictionCommitted');
  if (!ev) stop(`commit ${key}`, { message: 'no PredictionCommitted event — claimId is unreadable' });
  return ev.args[1] as bigint;
};

// The analyst commits TRUE on all four, through Circle, through Unit 4's submit().
for (const m of PLAN) {
  const r = await analystCall(`commit ${m.key} (analyst, TRUE)`, ADDRESS,
    'commitPrediction(uint256,bytes32,bool)', [ids[m.key]!.toString(), REHEARSAL_HASH, true], UNIT)
    .catch((e) => stop(`commitPrediction ${m.key}`, e));
  claimIds[m.key] = claimIdFrom(r, m.key);
  console.log(`     ${m.key} claim ${claimIds[m.key]}`);
}

// ⚠️ M1's losing side. A second AUTHOR, not a staker — a staker can only join a side that already
// has a claim, so two opposed pools need two claims.
{
  const tx = await market.commitPrediction!(ids.M1!, REHEARSAL_HASH, false, { value: UNIT })
    .catch((e: unknown) => stop('commitPrediction M1 (deployer, FALSE)', e));
  const r = await record('commit M1 (deployer, FALSE)', tx.hash, 'deployer');
  console.log(`     M1 opposing claim ${claimIdFrom(r, 'M1')}`);
}

// ⚠️ The second-EOA stakes. `stake` takes no side — it is derived from the claim, which is what stops
// a staker attaching someone's report to the side they did not predict.
for (const [key, amount] of [['M2', UNIT * 2n], ['M3', UNIT]] as const) {
  const tx = await market.stake!(ids[key]!, claimIds[key]!, { value: amount })
    .catch((e: unknown) => stop(`stake ${key}`, e));
  await record(`stake ${key} (deployer, ${ethers.formatUnits(amount, 18)})`, tx.hash, 'deployer');
}

const pooled = await provider.getBalance(ADDRESS);
console.log(`  contract holds ${USDC(pooled)}`);

// ─── Phase 4 · wait out the gap ──────────────────────────────────────────────────────────────────

const waitFor = OBS_END - now() + 5;
console.log(`\n══ Phase 4 · wait ${waitFor}s for observationEnd (the contract's own gap, not ours)`);
if (waitFor > 0) await sleep(waitFor * 1000);

// ⚠️ Staking after closeTime, proved by eth_call so it costs nothing. The revert reason is the
// evidence; paying gas to watch it revert would add nothing.
console.log('\n══ Phase 5 · what the contract refuses');
const refuses = async (label: string, run: () => Promise<unknown>, expected: string): Promise<void> => {
  try { await run(); ok(label, false, 'DID NOT REVERT'); }
  catch (e) {
    const name = (e as { revert?: { name: string } }).revert?.name
      ?? (e as { shortMessage?: string }).shortMessage ?? String(e);
    ok(label, name.includes(expected), name.slice(0, 70));
  }
};
await refuses('stake after closeTime', () => market.stake!.staticCall(ids.M1!, claimIds.M1!, { value: UNIT }), 'StakingClosed');
await refuses('void before resolveDeadline (M4)', () => market.voidMarket!.staticCall(ids.M4!), 'TooEarlyToVoid');
await refuses('resolve by a non-resolver', () => market.resolve!.staticCall(ids.M1!, true, REHEARSAL_HASH), 'NotResolver');

// ─── Phase 6 · settle ────────────────────────────────────────────────────────────────────────────

console.log('\n══ Phase 6 · settle');
const EVIDENCE = ethers.keccak256(ethers.toUtf8Bytes('unit-6 rehearsal evidence'));

await analystCall('resolve M1 → TRUE', ADDRESS, 'resolve(uint256,bool,bytes32)', [ids.M1!.toString(), true, EVIDENCE])
  .catch((e) => stop('resolve M1', e));
await analystCall('resolve M2 → FALSE', ADDRESS, 'resolve(uint256,bool,bytes32)', [ids.M2!.toString(), false, EVIDENCE])
  .catch((e) => stop('resolve M2', e));
await analystCall('resolve M4 → TRUE', ADDRESS, 'resolve(uint256,bool,bytes32)', [ids.M4!.toString(), true, EVIDENCE])
  .catch((e) => stop('resolve M4', e));

// ⚠️ Void is permissionless and the DEPLOYER calls it, which is the point: it is the settlement path
// that does not need the resolver or the cron, and therefore the one a stuck market falls back to.
{
  const tx = await market.voidMarket!(ids.M3!).catch((e: unknown) => stop('voidMarket M3', e));
  await record('void M3 (deployer — permissionless)', tx.hash, 'deployer');
}

// ⚠️ **`from` is the whole point of this one.** Called as the deployer it would revert `NotResolver`
// before ever reaching the settled check — re-testing the guard above and proving nothing about
// double resolution. Sent AS the resolver, `AlreadySettled` is what actually has to fire.
await refuses('a second resolve on M1, sent AS the resolver',
  () => market.resolve!.staticCall(ids.M1!, false, EVIDENCE, { from: identity.address }), 'AlreadySettled');

// ─── Phase 7 · what everyone is owed, read from the chain before anyone claims ───────────────────

console.log('\n══ Phase 7 · payouts, as the contract computes them');
const owed: Record<string, { analyst: bigint; deployer: bigint; pool: bigint }> = {};
for (const m of PLAN) {
  const state = await market.markets!(ids[m.key]!);
  const pool = (state.poolTrue as bigint) + (state.poolFalse as bigint);
  owed[m.key] = {
    analyst: await market.payoutOf!(ids[m.key]!, identity.address) as bigint,
    deployer: await market.payoutOf!(ids[m.key]!, deployer.address) as bigint,
    pool,
  };
  const o = owed[m.key]!;
  console.log(`  ${m.key}  pool ${ethers.formatUnits(pool, 18).padEnd(6)}  analyst ${ethers.formatUnits(o.analyst, 18).padEnd(6)}  deployer ${ethers.formatUnits(o.deployer, 18)}`);
  // ⚠️ §5's rule, checked per market: the house never pays out more than it took in.
  ok(`${m.key}: payouts ≤ pool`, o.analyst + o.deployer <= pool,
    `${ethers.formatUnits(o.analyst + o.deployer, 18)} ≤ ${ethers.formatUnits(pool, 18)}`);
}

// ⚠️ THE TWO CHECKS THE RESEARCH SAID COST PEOPLE MONEY. Exactly, not approximately.
ok('M2 empty winning pool: analyst refunded EXACTLY its stake', owed.M2!.analyst === UNIT, USDC(owed.M2!.analyst));
ok('M2 empty winning pool: staker refunded EXACTLY its stake', owed.M2!.deployer === UNIT * 2n, USDC(owed.M2!.deployer));
ok('M3 void: analyst refunded EXACTLY its stake', owed.M3!.analyst === UNIT, USDC(owed.M3!.analyst));
ok('M3 void: staker refunded EXACTLY its stake', owed.M3!.deployer === UNIT, USDC(owed.M3!.deployer));
ok('M4 single staker: refunded EXACTLY its stake', owed.M4!.analyst === UNIT, USDC(owed.M4!.analyst));
ok('M1 winner takes the whole pool', owed.M1!.analyst === UNIT * 2n && owed.M1!.deployer === 0n, USDC(owed.M1!.analyst));

// ─── Phase 8 · claim ─────────────────────────────────────────────────────────────────────────────

console.log('\n══ Phase 8 · claim (pull-based)');
for (const key of ['M1', 'M2', 'M3', 'M4'] as const) {
  if (owed[key]!.analyst > 0n) {
    await analystCall(`claim ${key} (analyst)`, ADDRESS, 'claim(uint256,address)', [ids[key]!.toString(), identity.address])
      .catch((e) => stop(`claim ${key} (analyst)`, e));
  }
  if (owed[key]!.deployer > 0n) {
    const tx = await market.claim!(ids[key]!, deployer.address).catch((e: unknown) => stop(`claim ${key} (deployer)`, e));
    await record(`claim ${key} (deployer)`, tx.hash, 'deployer');
  }
}

await refuses('a second claim on M1', () => market.claim!.staticCall(ids.M1!, deployer.address), 'NothingToClaim');

// ─── Phase 9 · the accounting, read from the chain ───────────────────────────────────────────────

console.log('\n══ Phase 9 · accounting');
const left = await provider.getBalance(ADDRESS);
// ⚠️ Read from the contract's BALANCE, not from adding up what we expected. That is the difference
// between checking the chain and checking our own arithmetic.
ok('contract balance is ZERO after the last claim', left === 0n, USDC(left));
ok('…so total paid out equals total staked, exactly', left === 0n, `pool was ${USDC(pooled)}`);

const gasTotal = spend.reduce((a, s) => a + s.gas, 0n);
const byAnalyst = spend.filter((s) => s.by === 'analyst').reduce((a, s) => a + s.gas, 0n);
const byDeployer = spend.filter((s) => s.by === 'deployer').reduce((a, s) => a + s.gas, 0n);

console.log(`\n  ${spend.length} transactions`);
console.log(`  gas — analyst  ${ethers.formatUnits(byAnalyst, 18)} USDC  (${spend.filter((s) => s.by === 'analyst').length} txs, through Circle)`);
console.log(`  gas — deployer ${ethers.formatUnits(byDeployer, 18)} USDC  (${spend.filter((s) => s.by === 'deployer').length} txs, through ethers)`);
console.log(`  gas — TOTAL    ${ethers.formatUnits(gasTotal, 18)} USDC`);

const after = { deployer: await provider.getBalance(deployer.address), analyst: await provider.getBalance(identity.address) };
console.log(`\n  deployer ${USDC(balances.deployer)} → ${USDC(after.deployer)}`);
console.log(`  analyst  ${USDC(balances.analyst)} → ${USDC(after.analyst)}`);

console.log(`\n  ⚠️ RECORD THIS ADDRESS:  ARC_MARKET_ADDRESS=${ADDRESS}`);
console.log(`     ${EXPLORER}/address/${ADDRESS}`);
console.log('\n  transactions:');
for (const s of spend) console.log(`     ${s.by.padEnd(8)} ${s.label.padEnd(34)} ${EXPLORER}/tx/${s.hash}`);

console.log(failures === 0 ? '\nPASS  every path driven on chain.\n' : `\nFAIL  ${failures} check(s).\n`);
process.exit(failures === 0 ? 0 : 1);

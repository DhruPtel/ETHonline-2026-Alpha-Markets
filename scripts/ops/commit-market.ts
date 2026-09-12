// Unit 7's run script. Create a market and commit the analyst's prediction to it.
//
//   npx tsx --env-file=.env scripts/ops/commit-market.ts --dry-run   refusals + the plan, spends NOTHING
//   npx tsx --env-file=.env scripts/ops/commit-market.ts             creates and commits, SPENDS
//
// ⚠️ **THIS SPENDS REAL USDC.** Gas on Arc is USDC and the commit stakes more of it. `--dry-run`
// runs every refusal case and prints the exact plan without touching a chain, which is how you see
// what is about to happen before it happens.
//
// ⚠️ **Every refusal below is built to fail at the guard it names.** That has bitten three tests this
// phase — a made-up proxy failing at read 1, `NotResolver` firing before `AlreadySettled`,
// `TooEarlyToVoid` going unreachable after a resolve — and a refusal that fires for the wrong reason
// looks exactly like a passing test. Where reaching a guard needs a cold process, this spawns one.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ethers } from 'ethers';
import { MarketRefused, commit, create, prepare } from '../../src/arc/market.js';
import { BindingRefused } from '../../src/arc/admission.js';
import { analystIdentity, arcProvider } from '../../src/arc/arc.js';
import { dayStart, validateSpec } from '../../src/arc/spec.js';
import { settle } from '../../src/arc/settle.js';
import { load } from '../../src/store/reports.js';
import { ALPHA_MARKET_ABI } from '../../src/arc/abi.js';
import { closePool, db } from '../../src/store/db.js';

const DRY = process.argv.includes('--dry-run');
const WRONG_WALLET_CHILD = process.argv.includes('--wrong-wallet-child');
// ⚠️ **STOPS AFTER `createMarket`, LEAVING A MARKET WITH NO CLAIM.** The harness's normal job is to
// create AND commit, which is right for verifying the whole path — and wrong when what is needed is
// an **open market the browser's commit control can act on**. The contract allows one claim per
// author per market, so a market this script has already committed to refuses every later commit
// from the same analyst. `--create-only` is the one-line difference: same `prepare()`, same refusals,
// same `create()`, and then it stops before the money goes in. **No stake is placed** — the 0.01
// USDC enters at commit, which is the press this exists to enable.
const CREATE_ONLY = process.argv.includes('--create-only');
const EXPLORER = 'https://testnet.arcscan.app';

let failures = 0;
const ok = (label: string, condition: boolean, detail = ''): void => {
  console.log(`  ${condition ? '✅' : '❌'} ${label}${detail ? `   ${detail}` : ''}`);
  if (!condition) failures += 1;
};
const refuses = async (label: string, run: () => Promise<unknown>, mustSay: string): Promise<void> => {
  try { await run(); ok(label, false, 'was ACCEPTED'); }
  catch (error) {
    const m = (error as Error).message;
    const right = m.toLowerCase().includes(mustSay.toLowerCase());
    ok(label, right, right ? `"…${m.slice(Math.max(0, m.length - 68))}"` : `WRONG GUARD: ${m.slice(0, 78)}`);
  }
};

const STAKE = ethers.parseUnits('0.01', 18).toString();   // 18-dp native, a whole 6-dp USDC unit
// ⚠️ **THE METRIC IS A KNOB BECAUSE THE MARKET ID IS DERIVED FROM THE QUESTION.**
// `idFor('m', {specHash, core, contractAddress})` — an identical question at identical times derives
// an identical id and collides with the market already on chain. A different metric is a genuinely
// different question rather than the same one at a nudged threshold.
// ⚠️ Environment and not argv: this script re-invokes itself for the wrong-wallet refusal test, and
// `process.env` is what that child inherits.
const METRIC = (process.env.MARKET_METRIC ?? 'totalDepositBalanceUSD') as 'totalDepositBalanceUSD';
const SLUG = 'aave-v3-ethereum';
// ⚠️ Follows `METRIC`. It was pinned to the deposit key, and a changed metric would have sent the
// untokenized-report probe looking for the wrong fact and tripping the wrong guard again.
const SLUG_METRIC_KEY = `${SLUG}.${METRIC}`;

// ── Pick the subject from the store as it actually is ────────────────────────────────────────────
const [tokenized] = await db()<{ hash: string }[]>`
  SELECT r.hash FROM reports r JOIN report_tokens rt ON rt.report_hash = r.hash ORDER BY r.created_at LIMIT 1`;
// ⚠️ **IT MUST ALSO CARRY THE FACT, OR THE REFUSAL TEST BELOW HITS THE WRONG GUARD.** This probe
// exists to prove Unit 6c refuses an untokenized report. It picked the oldest untokenized row, and
// as reports were tokenized over time that row became one with no
// `aave-v3-ethereum.totalDepositBalanceUSD` — so `prepare` refused for a missing fact, *before*
// reaching the tokenization check, and the assertion silently stopped testing what it names. Caught
// on 2026-09-12 when the harness printed `WRONG GUARD`.
const [untokenized] = await db()<{ hash: string }[]>`
  SELECT r.hash FROM reports r LEFT JOIN report_tokens rt ON rt.report_hash = r.hash
  WHERE rt.report_hash IS NULL
    AND r.canonical_json LIKE ${'%' + SLUG_METRIC_KEY + '%'}
  ORDER BY r.created_at LIMIT 1`;
if (!tokenized || !untokenized) { console.error('\nSTOP  need one tokenized and one untokenized report.\n'); process.exit(1); }

const report = (await load(tokenized.hash))!;
// ⚠️ The measured figure the market will ask about. Not the headline — every report in this store
// has the `metric.` sentinel as its headline. See `decideSide`.

const observed = report.facts[`${SLUG}.${METRIC}`]?.value;
if (!observed) { console.error(`\nSTOP  report ${tokenized.hash} has no ${SLUG}.${METRIC}.\n`); process.exit(1); }

// ⚠️ **The threshold is derived from the SNAPSHOT series, not from the report** — the same series
// the side rule and settlement both read. Deriving it from the report's figure was part of the same
// mismatch: it would set the bar against a number nothing will ever be measured against.
let latestDay = '', latestFigure = '';
for (let back = 1; back <= 7 && !latestFigure; back += 1) {
  const d = new Date(Date.now() - back * 86_400_000).toISOString().slice(0, 10);
  const r = await settle(validateSpec({ slug: SLUG, metric: METRIC, comparison: 'above', threshold: '1', observedDay: d }));
  if (r.kind === 'settled') { latestDay = d; latestFigure = r.observed; }
}
if (!latestFigure) { console.error('\nSTOP  no daily snapshot in the last 7 days.\n'); process.exit(1); }
// 1% under the latest snapshot: a real question the current series answers TRUE.
const threshold = ((BigInt(latestFigure.split('.')[0]!) * 99n) / 100n).toString();

// ⚠️ **The observed day cannot be in the past, and that is structural rather than a choice.**
// `questionCore` requires `closeTime <= dayStart(observedDay)` and the contract's `_open` requires
// `closeTime > now`, so `dayStart(observedDay) > now` always. **A commit through market.ts is always
// a forecast** — the rehearsal shape Unit 6 drove is unreachable from here, because Unit 6 built its
// markets through ethers and bypassed `spec.ts` entirely.
// ⚠️ **THE OBSERVED DAY IS THE ONE KNOB, AND IT DECIDES WHETHER THE MARKET IS STAKEABLE.**
// `questionCore` requires `closeTime <= dayStart(observedDay)` — the past-posting rule — and the
// contract's `_open` refuses once `block.timestamp >= closeTime`. So a market that accepts a stake
// is one whose observed day has **not started yet**, and its staking window is everything between
// now and the minute before that day opens.
//
// ⚠️ Read from the environment rather than argv **because this script re-invokes itself** for the
// wrong-wallet refusal test; `process.env` is inherited by that child and argv is not, so the two
// would otherwise disagree about which day they are planning.
//
//   MARKET_OBSERVED_DAY=2026-09-14 npx tsx --env-file=.env scripts/ops/commit-market.ts --dry-run
//
// The literal default is the day this harness was written against and is left alone so a bare run
// still verifies what it always verified.
const OBSERVED_DAY = process.env.MARKET_OBSERVED_DAY ?? '2026-09-12';
const CLOSE = dayStart(OBSERVED_DAY) - 60;                 // one minute before the day opens
const RESOLVE_DEADLINE = dayStart(OBSERVED_DAY) + 86_400 * 3;

const input = {
  reportHash: tokenized.hash,
  spec: { slug: SLUG, metric: METRIC as 'totalDepositBalanceUSD', comparison: 'above' as const, threshold, observedDay: OBSERVED_DAY },
  closeTime: CLOSE, resolveDeadline: RESOLVE_DEADLINE, amount: STAKE,
};

// ── The child process that tests a wrong CIRCLE_WALLET_ID ────────────────────────────────────────
// ⚠️ **A separate process, because `analystIdentity()` is memoized.** Reassigning the env var in
// this process would be read by nothing — the guard would never fire and the test would "pass" by
// failing somewhere else entirely. A cold process is the only way to reach Unit 4's guard.
if (WRONG_WALLET_CHILD) {
  await prepare(input).catch((e: unknown) => { console.error((e as Error).message); process.exit(3); });
  console.error('NO REFUSAL'); process.exit(0);
}

try {
  const identity = await analystIdentity();
  const before = await arcProvider().getBalance(identity.address);

  console.log('\n══ refusals — each at the guard it names');

  // 1 · an invalid spec. ⚠️ Reached at step 2, before any identity or chain work.
  await refuses('an illegal metric', () => prepare({ ...input, spec: { ...input.spec, metric: 'cumulativeTotalRevenueUSD' as never } }),
    'cannot be a market subject');
  await refuses('a threshold that is not a decimal string', () => prepare({ ...input, spec: { ...input.spec, threshold: '1e21' } }),
    'not a non-negative decimal');
  // ⚠️ Staking must close before the observed day starts — past-posting, research §6.
  await refuses('a closeTime inside the observed day', () => prepare({ ...input, closeTime: dayStart(OBSERVED_DAY) + 1 }),
    'inside or after the observed day');

  // 2 · ⚠️ the admission check, at step 8 — so the untokenized report must pass steps 1–7 first.
  await refuses('a report that was never tokenized (Unit 6c)', () => prepare({ ...input, reportHash: untokenized.hash }),
    'this report is not tokenized');

  // 3 · a wrong CIRCLE_WALLET_ID, in a cold child process
  const { stderr, code } = await promisify(execFile)(
    'npx', ['tsx', '--env-file=.env', 'scripts/ops/commit-market.ts', '--wrong-wallet-child'],
    { env: { ...process.env, CIRCLE_WALLET_ID: '00000000-0000-4000-8000-000000000000' } },
  ).then((r) => ({ ...r, code: 0 })).catch((e: { stderr: string; code: number }) => e);
  // ⚠️ **Circle THROWS for an unknown wallet id; it does not return an empty body.** So Unit 4's
  // `if (!wallet)` branch — "does not resolve to a wallet" — is unreachable for this case, and the
  // sentence the operator actually sees is Circle's own. The refusal is still correct and still
  // loud, and it still cannot fall through to signing as anybody; only the wording is not ours.
  // Asserting Unit 4's sentence here would have been asserting a branch that never runs.
  ok('a wrong CIRCLE_WALLET_ID is refused (cold child process)',
    code === 3 && /wallet/i.test(stderr),
    stderr.split('\n').find((l) => l.trim())?.slice(0, 68) ?? `exit ${code}`);

  // ── The plan ───────────────────────────────────────────────────────────────────────────────────
  console.log('\n══ the plan — what is about to happen');
  const plan = await prepare(input);
  console.log(`  report     ${plan.reportHash}`);
  console.log(`  question   is ${plan.spec.slug}.${plan.spec.metric} ${plan.spec.comparison} ${plan.spec.threshold}`);
  console.log(`             on ${plan.spec.observedDay} (UTC)?`);
  console.log(`  closes     ${new Date(plan.core.closeTime * 1000).toISOString()}`);
  console.log(`  observed   ends ${new Date(plan.core.observationEnd * 1000).toISOString()}`);
  console.log(`  deadline   ${new Date(plan.core.resolveDeadline * 1000).toISOString()}`);
  console.log(`  SIDE       ${plan.decision.side ? 'TRUE' : 'FALSE'}`);
  console.log(`  from       the ${plan.decision.decidedFromDay} daily snapshot: ${plan.decision.observed}`);
  console.log(`  report says ${plan.decision.reportFigure}  (observed ${plan.decision.reportObservedAt}, ${plan.decision.reportAgeHours}h old)`);
  console.log(`  because    ${plan.decision.reason}`);
  console.log(`  verdict    ${plan.verdict ?? 'null — a metric-across-deployments report carries none'}`);
  console.log(`  stake      ${ethers.formatUnits(plan.amount, 18)} USDC of the analyst's own money`);
  console.log(`  bound to   proxy ${plan.binding.proxyAddress}`);
  console.log(`             issued by ${plan.binding.issuerAddress} in ${plan.binding.deployTx.slice(0, 20)}…`);
  console.log(`  market id  ${plan.marketId}`);
  console.log(`  claim id   ${plan.claimId}`);
  ok('the plan is serializable — it crosses a request boundary intact',
    JSON.parse(JSON.stringify(plan)).marketId === plan.marketId);

  // ── ⚠️ The fix, proved: the side IS what settlement decides, on the same inputs ─────────────────
  //
  // Not "agrees with" — the side rule calls `settle()`, so this re-runs settlement for the day the
  // side came from and checks the two answers and the two FIGURES are identical. Before the fix the
  // figures came from different entities and differed by ~0.5%.
  console.log('\n══ the side rule against settlement, same inputs');
  const asSettlement = await settle(validateSpec({
    slug: SLUG, metric: METRIC, comparison: 'above', threshold: plan.spec.threshold,
    observedDay: plan.decision.decidedFromDay,
  }));
  if (asSettlement.kind !== 'settled') { console.error('\nSTOP  the decided-from day did not settle.\n'); process.exit(1); }
  console.log(`  side rule   ${plan.decision.observed}  → ${plan.decision.side ? 'TRUE' : 'FALSE'}`);
  console.log(`  settlement  ${asSettlement.observed}  → ${asSettlement.outcome ? 'TRUE' : 'FALSE'}`);
  console.log(`  report      ${plan.decision.reportFigure}  (balance-sheet entity — NOT what settles)`);
  ok('same figure, to the last digit', plan.decision.observed === asSettlement.observed);
  ok('same outcome', plan.decision.side === asSettlement.outcome);
  ok('⚠️ and it is NOT the report\'s figure — the two sources still differ',
    plan.decision.observed !== plan.decision.reportFigure,
    `snapshot ${plan.decision.observed.slice(0, 12)}… vs report ${plan.decision.reportFigure.slice(0, 12)}…`);

  if (DRY) {
    console.log(`\n  balance ${ethers.formatUnits(before, 18)} USDC — unchanged, nothing was sent.`);
    console.log(failures === 0 ? '\nPASS  dry run. Nothing spent.\n' : `\nFAIL  ${failures} check(s).\n`);
    process.exit(failures === 0 ? 0 : 1);
  }

  // ── The two writes ─────────────────────────────────────────────────────────────────────────────
  console.log('\n══ createMarket');
  const created = await create(plan).catch((e: unknown) => {
    console.error(`\n❌ STOP — createMarket failed: ${(e as Error).message}`);
    console.error('   Not adjusting and retrying. The market row records what landed.');
    process.exit(1);
  });
  console.log(`  on-chain market ${created.chainMarketId}${created.alreadyLanded ? '  (already landed — not re-created)' : ''}`);
  if (created.txHash) console.log(`  ${EXPLORER}/tx/${created.txHash}`);

  // ⚠️ **The callData round trip, read back off the chain.** We encoded a QuestionCore ourselves and
  // handed Circle finished bytes, so nothing server-side validated the packing for us. This is the
  // check that the struct arrived as the struct we meant: read the stored Market and compare all
  // four fields against the QuestionCore that went in.
  const onChain = new ethers.Contract(plan.contractAddress, ALPHA_MARKET_ABI, arcProvider());
  const m0 = await onChain.markets!(BigInt(created.chainMarketId));
  ok('callData round trip: specHash matches', (m0.specHash as string).toLowerCase() === `0x${plan.core.specHash}`,
    (m0.specHash as string).slice(0, 18) + '…');
  ok('callData round trip: closeTime matches', Number(m0.closeTime) === plan.core.closeTime, String(m0.closeTime));
  ok('callData round trip: observationEnd matches', Number(m0.observationEnd) === plan.core.observationEnd, String(m0.observationEnd));
  ok('callData round trip: resolveDeadline matches', Number(m0.resolveDeadline) === plan.core.resolveDeadline, String(m0.resolveDeadline));

  if (CREATE_ONLY) {
    const afterCreate = await arcProvider().getBalance(identity.address);
    console.log('\n══ what it cost');
    console.log(`  balance ${ethers.formatUnits(before, 18)} → ${ethers.formatUnits(afterCreate, 18)} USDC`);
    console.log(`  gas     ${ethers.formatUnits(before - afterCreate, 18)}  createMarket only`);
    console.log('  stake   none — the claim, and its stake, is what the browser control places');
    console.log(`\n  open for staking until ${new Date(plan.core.closeTime * 1000).toISOString()}`);
    console.log(`  /markets/${created.chainMarketId}`);
    console.log(failures === 0 ? '\nPASS  market created, no claim.\n' : `\nFAIL  ${failures} check(s).\n`);
    await closePool();
    process.exit(failures === 0 ? 0 : 1);
  }

  console.log('\n══ commitPrediction');
  const committed = await commit(plan, created.chainMarketId).catch((e: unknown) => {
    console.error(`\n❌ STOP — commitPrediction failed: ${(e as Error).message}`);
    console.error('   Not adjusting and retrying. The claim row records what landed.');
    process.exit(1);
  });
  console.log(`  on-chain claim ${committed.chainClaimId}${committed.alreadyLanded ? '  (already landed)' : ''}`);
  if (committed.txHash) console.log(`  ${EXPLORER}/tx/${committed.txHash}`);

  // ── What the rows say, read back ───────────────────────────────────────────────────────────────
  console.log('\n══ read back from the store');
  const [m] = await db()<{ chain_market_id: string | null; create_tx: string | null; landed_at: Date | null }[]>`
    SELECT chain_market_id, create_tx, landed_at FROM markets WHERE id = ${plan.marketId}`;
  const [c] = await db()<{ chain_claim_id: string | null; commit_tx: string | null; committed_at: Date | null; side: boolean }[]>`
    SELECT chain_claim_id, commit_tx, committed_at, side FROM claims WHERE id = ${plan.claimId}`;
  const [b] = await db()<{ arc_tx: string | null }[]>`
    SELECT arc_tx FROM binding_evidence WHERE claim_id = ${plan.claimId}`;
  ok('the market row carries its on-chain id', m?.chain_market_id === created.chainMarketId, m?.chain_market_id ?? 'null');
  ok('the claim row carries its on-chain claimId, read off the event', c?.chain_claim_id === committed.chainClaimId, c?.chain_claim_id ?? 'null');
  ok('the claim row records the side', c?.side === plan.decision.side);
  ok('committed_at is set', c?.committed_at != null);
  ok('binding_evidence carries the Arc transaction', b?.arc_tx === committed.txHash);

  // ⚠️ Idempotence, proved rather than claimed: prepare() must now refuse this exact market.
  await refuses('prepare() refuses an already-committed market', () => prepare(input), 'already committed');

  console.log('\n══ what it cost');
  const after = await arcProvider().getBalance(identity.address);
  const spent = before - after;
  const gas = spent - BigInt(plan.amount);
  console.log(`  balance ${ethers.formatUnits(before, 18)} → ${ethers.formatUnits(after, 18)} USDC`);
  console.log(`  stake   ${ethers.formatUnits(plan.amount, 18)}  (in the contract, claimable after settlement)`);
  console.log(`  gas     ${ethers.formatUnits(gas, 18)}  across create + commit, through Circle`);
  console.log(`  total   ${ethers.formatUnits(spent, 18)} USDC`);

  console.log(failures === 0 ? '\nPASS  market created and committed.\n' : `\nFAIL  ${failures} check(s).\n`);
} finally {
  await closePool();
}
process.exit(failures === 0 ? 0 : 1);

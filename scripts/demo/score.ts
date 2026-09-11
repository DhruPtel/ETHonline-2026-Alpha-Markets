// Unit 15's proof. `src/arc/score.ts` in, PASS or FAIL out.
//
//   npx tsx --env-file=.env scripts/demo/score.ts
//
// ⚠️ **SPENDS NOTHING AND TOUCHES NO CHAIN STATE.** Two `eth_call`s worth of reading happens in the
// truth check below and nothing else; this unit scores settled state and writes rows.
//
// ⚠️ **WHY THIS SEEDS FIXTURES, WHICH THE UNIT BRIEF DID NOT ANTICIPATE.** The brief said chain
// markets 2, 3, 5 and 8 are resolved and 4 and 9 voided, *"all available now"*. That is true of the
// CHAIN and false of the STORE: `scores` is keyed on `claims`, and **no settled market in the store
// has a claim.** `claims` holds exactly two rows, both for markets 6 and 7, which are unresolved and
// off-limits. Chain markets 2–5 were driven by Unit 6 through ethers and **no `markets` or `claims`
// rows were ever written for them**. So there is nothing to score and nothing to assert against.
//
// The fixtures below mirror what the chain says about markets 2–5, are asserted against it, and are
// **removed in a `finally`**. Precedent: Unit 9 seeded rehearsal rows, Unit 11's probes seeded and
// removed. ⚠️ Their ids carry `rehearsal-` so no query mistakes them for forecasts, and they exist
// for the seconds this script runs.
//
// ⚠️ **TWO DELIBERATE DEVIATIONS FROM THE CHAIN, because a faithful copy would prove less:**
//
//   1 · **`payouts` rows are seeded from the chain's `Claimed` events.** Nothing in `src/` writes
//       that table — it has read helpers and **zero rows** — so without this the `collected` branch
//       of trading return could not be exercised at all, and `returned` would read null everywhere
//       while the chain says the analyst really collected. ⚠️ **This script is not the writer that
//       table needs**; it seeds and removes, and the missing writer stays an open item.
//   2 · **Every fixture claim cites a report that is in the store, not the hash the chain carries.**
//       Unit 6's rehearsal committed `0xe7e0e5a7…`, which was never a stored report — and
//       ⚠️ **`claims.report_hash` is a FOREIGN KEY into `reports`, so such a claim cannot be
//       inserted at all.** That is the schema being stricter than this script first assumed, and it
//       is load-bearing for the unit: **a claim citing an unstored report is unrepresentable**, so a
//       null reconciliation score always means `verdict.call` was null and never "report missing".
//       It is also part of why Unit 6 never wrote claim rows for markets 2–5 in the first place.
//
// ⚠️ **The reconciliation score is null in every row below and that is NOT a bug.**
// `Report.verdict.call` is null on a metric-across-deployments report by the 2026-09-07 schema
// decision, and **all nine reports this project has produced are that shape** — checked, not
// assumed. The signal that would distinguish them lives in `verdict.coverage`, which `scores` has no
// column for. Recorded as a finding rather than worked around.

import { ethers } from 'ethers';
import { ALPHA_MARKET_ABI } from '../../src/arc/abi.js';
import { arcProvider } from '../../src/arc/arc.js';
import { scoreMarket, scoreSettled } from '../../src/arc/score.js';
import { specHash, validateSpec } from '../../src/arc/spec.js';
import { db } from '../../src/store/db.js';
import { close } from '../../src/store/markets.js';
import { requiredEnv } from '../../src/config/env.js';

let failures = 0;
const ok = (label: string, condition: boolean, detail = ''): void => {
  console.log(`  ${condition ? '✅' : '❌'} ${label}${detail ? `   ${detail}` : ''}`);
  if (!condition) failures += 1;
};

const CONTRACT = requiredEnv('ARC_MARKET_ADDRESS');
const ANALYST = '0x1B7035bBe0DA8F3bcb721863D42e1079e4A116A7';
const DEPLOYER = '0xA6B12d8418dF7F6C827AFEB3D8955A881e448079';
/** A report that IS in the store. Its `verdict.call` is null, like every other. */
const STORED_REPORT = '24041ca282d260d3ad843d197086f595d6a2fab46d4e5aadf3e1c1517bfdd3e5';
/** What chain claims 1–5 actually carry. ⚠️ Never a stored report — see the header. */
const CHAIN_REPORT = 'e7e0e5a70691f5d527f9d3b3f53c05e66206c1e6d075322e1ffbeaddeb66805b';
const CENT = '10000000000000000';          // 0.01 USDC at 18-dp
const TWO_CENT = '20000000000000000';      // 0.02

const mid = (chain: number) => `m/rehearsal-chain-${chain}`;
const cid = (chain: number) => `c/rehearsal-chain-${chain}`;

const spec = validateSpec({
  slug: 'aave-v3-ethereum', metric: 'totalDepositBalanceUSD', comparison: 'above',
  threshold: '20000000000', observedDay: '2026-09-10',
});

/** What the chain says about markets 2–5, so the fixtures are checked rather than trusted. */
interface Truth { resolved: boolean; outcome: boolean; voided: boolean }

async function readChain(): Promise<Map<number, Truth>> {
  const contract = new ethers.Contract(CONTRACT, ALPHA_MARKET_ABI, arcProvider());
  const out = new Map<number, Truth>();
  for (const id of [2, 3, 4, 5]) {
    const m = await contract.markets!(BigInt(id));
    out.set(id, { resolved: m[5] as boolean, outcome: m[6] as boolean, voided: m[7] as boolean });
  }
  return out;
}

async function seed(truth: Map<number, Truth>): Promise<void> {
  for (const chain of [2, 3, 4, 5]) {
    const t = truth.get(chain)!;
    await db()`
      INSERT INTO markets (id, spec_hash, spec_json, observed_day, close_time, observation_end,
                           resolve_deadline, contract_address, chain_market_id, landed_at,
                           resolved_at, voided_at, outcome)
      VALUES (${mid(chain)}, ${specHash(spec)}, ${JSON.stringify(spec)}, ${spec.observedDay},
              '2026-09-10T00:00:00Z', '2026-09-11T00:00:00Z', '2026-09-13T00:00:00Z',
              ${CONTRACT}, ${String(chain)}, now(),
              ${t.resolved ? new Date() : null}, ${t.voided ? new Date() : null},
              ${t.resolved ? t.outcome : null})`;
  }
  // Chain claims 1–5, with their real market, author and side.
  const claims: [number, number, string, boolean, string][] = [
    [1, 2, ANALYST, true, STORED_REPORT], [2, 3, ANALYST, true, STORED_REPORT],
    [3, 4, ANALYST, true, STORED_REPORT], [4, 5, ANALYST, true, STORED_REPORT],
    // ⚠️ The chain's own `0xe7e0e5a7…` CANNOT be used: `claims.report_hash` is a foreign key into
    // `reports` and that hash was never a stored report. See the header.
    [5, 2, DEPLOYER, false, STORED_REPORT],
  ];
  for (const [claimId, market, author, side, report] of claims) {
    await db()`
      INSERT INTO claims (id, market_id, chain_claim_id, author, report_hash, side, amount, committed_at)
      VALUES (${cid(claimId)}, ${mid(market)}, ${String(claimId)}, ${author}, ${report}, ${side},
              ${CENT}, now())`;
  }
  // ⚠️ From the chain's `Claimed` events, amounts exactly as emitted. See the header.
  const payouts: [number, string, string][] = [
    [2, ANALYST, TWO_CENT], [3, ANALYST, CENT], [3, DEPLOYER, TWO_CENT],
    [4, ANALYST, CENT], [4, DEPLOYER, CENT], [5, ANALYST, CENT],
  ];
  for (const [market, account, amount] of payouts) {
    await db()`
      INSERT INTO payouts (market_id, account, recipient, amount, claimed_at)
      VALUES (${mid(market)}, ${account}, ${account}, ${amount}, now())`;
  }
}

/**
 * ⚠️ The foreign key proven by reaching it, not by reading the DDL. Rolled back either way, so it
 * leaves nothing behind even when it does what it is supposed to.
 */
async function refusesUnstoredReport(): Promise<string> {
  try {
    await db().begin(async (tx) => {
      // ⚠️ `mid(3)` + DEPLOYER because `claims` carries `UNIQUE (market_id, author)` — the
      // contract's one-claim-per-author rule, in the schema. Any pair that already has a claim is
      // refused by THAT constraint first and the foreign key is never reached.
      await tx`INSERT INTO claims (id, market_id, chain_claim_id, author, report_hash, side, amount)
               VALUES ('c/fk-probe', ${mid(3)}, '99', ${DEPLOYER}, ${CHAIN_REPORT}, true, ${CENT})`;
      throw new Error('rolled-back');
    });
    return 'INSERTED';
  } catch (e) {
    // ⚠️ Returns the CODE rather than a boolean. `23514` here would mean the row was refused by the
    // amount check one guard above the foreign key — a pass for the wrong reason, and indent for
    // indent the failure this phase has paid for six times. The caller asserts on `23503` by name.
    return (e as { code?: string }).code ?? (e as Error).message;
  }
}

async function remove(): Promise<void> {
  const ids = [2, 3, 4, 5].map(mid);
  await db()`DELETE FROM scores  WHERE market_id = ANY(${ids})`;
  await db()`DELETE FROM payouts WHERE market_id = ANY(${ids})`;
  await db()`DELETE FROM claims  WHERE market_id = ANY(${ids})`;
  await db()`DELETE FROM markets WHERE id = ANY(${ids})`;
}

// ─── Run ─────────────────────────────────────────────────────────────────────────────────────────

console.log('\n══ Phase 0 · what the chain says, so the fixtures are checked rather than trusted');
const truth = await readChain();
ok('chain 2 resolved TRUE', truth.get(2)!.resolved && truth.get(2)!.outcome);
ok('chain 3 resolved FALSE', truth.get(3)!.resolved && !truth.get(3)!.outcome);
ok('chain 4 voided', truth.get(4)!.voided && !truth.get(4)!.resolved);
ok('chain 5 resolved TRUE', truth.get(5)!.resolved && truth.get(5)!.outcome);

await remove();   // in case an earlier run died before its finally
try {
  await seed(truth);
  console.log('\n══ Phase 1 · scoring');
  const scored = [
    ...await scoreMarket(mid(2)), ...await scoreMarket(mid(3)),
    ...await scoreMarket(mid(4)), ...await scoreMarket(mid(5)),
  ];
  const byClaim = new Map(scored.map((s) => [s.claimId, s]));
  ok('five claims scored across four markets', scored.length === 5, String(scored.length));

  const c1 = byClaim.get(cid(1))!, c2 = byClaim.get(cid(2))!;
  const c3 = byClaim.get(cid(3))!, c4 = byClaim.get(cid(4))!, c5 = byClaim.get(cid(5))!;

  console.log('\n  ── a CORRECT forecast that collected (chain market 2, claim 1)');
  ok('forecastCorrect true', c1.forecastCorrect === true);
  ok('staked 0.01', c1.staked === CENT);
  ok('returned 0.02, collected', c1.returned === TWO_CENT && c1.returnState === 'collected');

  console.log('\n  ── ⚠️ an INCORRECT forecast that still got money back (chain market 3, claim 2)');
  ok('forecastCorrect FALSE', c2.forecastCorrect === false);
  ok('⚠️ returned 0.01 — refunded, NOT zero', c2.returned === CENT && c2.returnState === 'collected',
    'the winning pool was empty, so the loser was refunded its stake');

  console.log('\n  ── ⚠️ a VOIDED market is not a wrong forecast (chain market 4, claim 3)');
  ok('⚠️ forecastCorrect is NULL, not false', c3.forecastCorrect === null);
  ok('settlement reads voided', c3.settlement === 'voided');
  ok('returned 0.01 — the refund', c3.returned === CENT);

  console.log('\n  ── a correct forecast on a one-sided pool (chain market 5, claim 4)');
  ok('forecastCorrect true', c4.forecastCorrect === true);
  ok('returned 0.01, collected', c4.returned === CENT && c4.returnState === 'collected');

  console.log('\n  ── ⚠️ a loser that never collected reads NULL, never zero (market 2, claim 5)');
  ok('forecastCorrect false', c5.forecastCorrect === false);
  ok('⚠️ returned is NULL, not 0', c5.returned === null && c5.returnState === 'no-payout-recorded',
    'earned-nothing and not-collected are the same row; see the unit header');

  console.log('\n  ── reconciliation quality is COPIED off a report that is guaranteed to exist');
  ok('the report loaded and its verdict.call was copied', c1.reconciliationQuality === null);
  ok('⚠️ all nine stored reports have verdict.call null — so the score carries no signal today',
    (await db()<{ n: number }[]>`SELECT count(*)::int n FROM reports
       WHERE canonical_json::jsonb -> 'verdict' ->> 'call' IS NOT NULL`)[0]!.n === 0);
  const fk = await refusesUnstoredReport();
  ok('⚠️ a claim citing an unstored report is unrepresentable — claims.report_hash is a FK',
    fk === '23503', `refused with ${fk} — so null never means "report missing"`);

  console.log('\n══ Phase 2 · idempotent on (market_id, claim_id)');
  const before = await db()<{ claim_id: string; scored_at: Date }[]>`
    SELECT claim_id, scored_at FROM scores WHERE market_id = ANY(${[2, 3, 4, 5].map(mid)}) ORDER BY claim_id`;
  ok('five rows after the first run', before.length === 5, String(before.length));
  for (const chain of [2, 3, 4, 5]) await scoreMarket(mid(chain));
  const after = await db()<{ claim_id: string; scored_at: Date }[]>`
    SELECT claim_id, scored_at FROM scores WHERE market_id = ANY(${[2, 3, 4, 5].map(mid)}) ORDER BY claim_id`;
  ok('still five rows, not ten', after.length === 5, String(after.length));
  ok('⚠️ scored_at did not move — the second run changed nothing',
    before.every((b, i) => b.scored_at.getTime() === after[i]!.scored_at.getTime()));

  console.log('\n══ Phase 3 · an unresolved market produces NO score, not a null one');
  const [live] = await db()<{ id: string }[]>`SELECT id FROM markets WHERE chain_market_id = '6'`;
  const none = await scoreMarket(live!.id);
  ok('scoreMarket returns []', none.length === 0);
  const [leaked] = await db()<{ n: number }[]>`SELECT count(*)::int n FROM scores WHERE market_id = ${live!.id}`;
  ok('⚠️ and wrote no row for market 6', leaked!.n === 0);

  console.log('\n══ Phase 4 · scoreSettled finds exactly the settled claims');
  const swept = await scoreSettled();
  ok('five scores across every settled market', swept.length === 5, String(swept.length));
  ok('markets 8, 9 and 10 contribute none — they carry no claims',
    swept.every((s) => s.marketId.startsWith('m/rehearsal-chain-')));
} finally {
  console.log('\n══ Cleanup');
  await remove();
  const [left] = await db()<{ n: number }[]>`
    SELECT (SELECT count(*) FROM markets WHERE id LIKE 'm/rehearsal-chain-%')
         + (SELECT count(*) FROM claims  WHERE id LIKE 'c/rehearsal-chain-%')
         + (SELECT count(*) FROM payouts WHERE market_id LIKE 'm/rehearsal-chain-%')
         + (SELECT count(*) FROM scores  WHERE market_id LIKE 'm/rehearsal-chain-%') AS n`;
  ok('every fixture row removed', Number(left!.n) === 0, `${left!.n} left`);
  const [real] = await db()<{ stakes: number; claims: number; scores: number }[]>`
    SELECT (SELECT count(*)::int FROM stakes) stakes, (SELECT count(*)::int FROM claims) claims,
           (SELECT count(*)::int FROM scores) scores`;
  ok('⚠️ the real store is untouched — 1 stake, 2 claims, 0 scores',
    real!.stakes === 1 && real!.claims === 2 && real!.scores === 0, JSON.stringify(real));
}

console.log(failures === 0 ? '\nPASS\n' : `\n${failures} FAILED\n`);
await close();
process.exit(failures === 0 ? 0 : 1);

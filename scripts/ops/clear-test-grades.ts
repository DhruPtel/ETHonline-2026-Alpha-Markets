// Delete the grades that belong to test data, and only those. ⚠️ **Writes `scores`. Spends nothing and
// touches no chain.**
//
//   npx tsx --env-file=.env scripts/ops/clear-test-grades.ts            ← plan: every row, kept or deleted, and why
//   npx tsx --env-file=.env scripts/ops/clear-test-grades.ts --apply    ← deletes the rows marked DELETE
//
// ── ⚠️ WHAT IS REMOVED IS DECIDED BY ARITHMETIC ON THE MARKET, NEVER BY A LIST OF IDS ───────────
//
//   market has no chain id           KEEP    the seeded demo record (`seed-demo-record.ts`) — what makes
//                                            `/analyst` and the context block render
//   on chain, `isRehearsal` true     DELETE  a rehearsal: the answer was knowable when it was created
//   on chain, `pastPosted` true      DELETE  a demo market: staking was open after the day it measures
//   on chain, neither                KEEP    a forecast — markets 6, 7, 11 and 12, the real record
//
// ⚠️ **So it is safe to run again after 6 and 7 are graded.** Their grades are forecasts by the same two
// predicates `/analyst`, `GradeMarker` and `context.ts` use, and land in KEEP without anyone having to
// remember them. The protected ids are asserted anyway, the way `demo-market.ts` does: a DELETE on
// one of them stops the run before anything is written.
//
// ⚠️ **Joined on `markets.id`, never `chain_market_id`** — two market rows share chain id 8.
//
// ── ⚠️ A DELETED GRADE COMES BACK IF SOMETHING RE-GRADES ─────────────────────────────────────────
//
// Scores are reconciliation. `scoreSettled()` grades every settled market from scratch; the resolve cron
// calls it on every run, and so does `score.ts` without `--market`. A demo market still resolved on
// chain is graded again by either. This script is idempotent, so running it again removes them again;
// stopping them for good means `scoreSettled()` skipping test markets, which is a change to
// `src/arc/score.ts` and is not made here.
//
// ⚠️ **Every deleted row is printed as JSON before it goes**, so the output is the record of what was
// there — and a row is re-derivable anyway, since `scoreMarket()` recomputes it from chain and store.

import { db } from '../../src/store/db.js';
import { close } from '../../src/store/markets.js';
import { isRehearsal, pastPosted } from '../../src/arc/rehearsal.js';

const APPLY = process.argv.includes('--apply');
const PROTECTED = ['6', '7', '11', '12'];

interface Row {
  market_id: string; claim_id: string; forecast_correct: boolean | null; reconciliation_quality: string | null;
  staked: string; returned: string | null; scored_at: Date;
  chain_market_id: string | null; observation_end: Date; created_at: Date; close_time: Date; observed_day: string;
}

const rows = await db()<Row[]>`
  SELECT s.market_id, s.claim_id, s.forecast_correct, s.reconciliation_quality, s.staked, s.returned, s.scored_at,
         m.chain_market_id, m.observation_end, m.created_at, m.close_time, m.observed_day
    FROM scores s JOIN markets m ON m.id = s.market_id
   ORDER BY s.scored_at`;

const verdict = (r: Row): { action: 'KEEP' | 'DELETE'; why: string } =>
  !r.chain_market_id ? { action: 'KEEP', why: 'seeded demo record — no chain id' }
  : isRehearsal(r.observation_end, r.created_at) ? { action: 'DELETE', why: 'rehearsal' }
  : pastPosted(r.close_time, r.observed_day) ? { action: 'DELETE', why: 'demo market — past-posted' }
  : { action: 'KEEP', why: 'forecast' };

console.log(`\n══ ${rows.length} score row(s)${APPLY ? ' — ⚠️ DELETING test data' : ' — plan only'}\n`);
const doomed: Row[] = [];
for (const r of rows) {
  const v = verdict(r);
  if (v.action === 'DELETE') doomed.push(r);
  console.log(`  ${v.action.padEnd(6)} ${r.market_id.padEnd(28)} chain ${String(r.chain_market_id ?? '—').padEnd(4)} ${v.why}`);
}

const reached = doomed.filter((r) => r.chain_market_id && PROTECTED.includes(r.chain_market_id));
if (reached.length > 0) {
  console.error(`\n❌ STOP  the rule marked a grade on protected market(s) ${reached.map((r) => r.chain_market_id).join(', ')} for deletion. Nothing written.\n`);
  process.exit(1);
}

const seeded = rows.filter((r) => !r.chain_market_id).length;
console.log(`\n  keep ${rows.length - doomed.length} (${seeded} seeded) · delete ${doomed.length}`);

if (!APPLY || doomed.length === 0) {
  console.log(APPLY ? '  nothing to delete.\n' : '  plan only — add --apply to delete.\n');
} else {
  console.log('\n  the rows being deleted, whole:');
  for (const r of doomed) console.log(`  ${JSON.stringify(r)}`);
  await db().begin(async (tx) => {
    for (const r of doomed) await tx`DELETE FROM scores WHERE market_id = ${r.market_id} AND claim_id = ${r.claim_id}`;
  });
  const [left] = await db()<{ n: string }[]>`SELECT count(*)::text AS n FROM scores`;
  console.log(`\n  ✅ deleted ${doomed.length}; ${left!.n} score row(s) remain.\n`);
}

await close();

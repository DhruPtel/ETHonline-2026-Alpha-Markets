// Grade what has settled, by hand. The same `scoreSettled()` the resolve cron calls.
//
//   npx tsx --env-file=.env scripts/ops/score.ts                  ← grades everything settled
//   npx tsx --env-file=.env scripts/ops/score.ts --dry-run        ← lists the work, writes nothing
//   npx tsx --env-file=.env scripts/ops/score.ts --market=m/…     ← one market
//
// ⚠️ **SPENDS NOTHING AND TOUCHES NO CHAIN.** `score.ts` reads settled state that the units which
// did spend already wrote down, and writes `scores` rows. There is no provider here and no Circle
// client, which is a property of `score.ts` this script inherits rather than a promise it makes.
//
// ⚠️ **THIS SCRIPT DOES NOT RESOLVE ANYTHING.** A market becomes gradeable when something puts its
// outcome on chain and writes the landmark — the resolve cron, or `resolve-market.ts --send`. Run
// against an unsettled market this prints "nothing has settled" and exits 0. **That is the honest
// answer and not a failure**: a grade is derived from a settlement, so no settlement means no grade.
//
// ── ⚠️ WHY `--dry-run` LISTS ROWS AND NOT VALUES ─────────────────────────────────────────────────
//
// It prints **which (market, claim) pairs would be graded and whether each already has a row** — and
// deliberately **not what the grades would be**. Computing a grade to preview it would mean deriving
// forecast accuracy outside `scoreMarket()`, which is the one place that owns it, and `score.ts`'s
// header is explicit about why that is the failure mode: *two numbers that should agree are how they
// stop agreeing*. A preview that recomputed the answer could disagree with the run that followed it,
// and nobody could say which was the grade.
//
// So the preview answers *how much work is outstanding*, which is what a dry run is actually for
// here, and the real run is safe to just do: it writes to one table, spends nothing, and is
// idempotent.
//
// ── ⚠️ THE REHEARSAL RULE LIVES HERE, AND IT IS A RECORD FILTER — NEVER A SCORING SKIP ───────────
//
// **A market created over a day that had already closed is not a forecast**, because the answer was
// knowable at commit time. The test is arithmetic and never a name: `observationEnd <= createdAt`.
// ⚠️ A stored market whose id literally contains "rehearsal" can still be a forecast by that
// arithmetic, which is exactly why the name is not the test. `app/markets/page.tsx` already computes
// this same comparison for its own split; this is the second place it appears and Task 2's
// `/analyst` page is the third, which is one more than is comfortable — **the moment a fourth caller
// needs it, it should become a helper rather than a fourth copy.**
//
// ⚠️ **Rehearsals are still SCORED.** `scoreSettled()` is reconciliation from scratch and a function
// that silently skips rows is worse than one that writes them — a skipped row is invisible, a
// written-and-excluded row is checkable. The exclusion happens **when a record is totalled**, here
// and on every surface Phase 7 builds, and it is **printed beside the counts rather than applied
// silently** so a reader who counts the markets themselves can see why their number differs.
//
// Today this is a distinction without rows: the three settled rehearsals carry **zero claims between
// them**, so nothing scores them either way. The rule exists for the next one that carries a claim.
//
// ── ⚠️ WHAT A BLANK MEANS, IN EVERY COLUMN THIS PRINTS ───────────────────────────────────────────
//
//   `forecast` VOID    the market voided — no outcome, so neither right nor wrong. **Never a loss.**
//   `returned` —       ⚠️ **no payout recorded, which is NOT zero.** `payouts` has no writer, so this
//                      is every claim today. Rendered as an em dash, never as `0.00`.
//   `quality`  —       the report's `verdict.call` was null, which is true of every stored report:
//                      they are all the metric-across-deployments shape, whose verdict has no single
//                      figure to stand behind. A fact about the report, not a missing grade.

import { ethers } from 'ethers';
import { scoreMarket, scoreSettled, type Score } from '../../src/arc/score.js';
import { claimsFor, close, marketById, type Market } from '../../src/store/markets.js';
import { db } from '../../src/store/db.js';

const argv = process.argv.slice(2);
const flag = (name: string): string | undefined =>
  argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`))?.split('=')[1]
  ?? (argv.includes(`--${name}`) ? '' : undefined);

const DRY = flag('dry-run') !== undefined;
const ONLY = flag('market');

/** ⚠️ Matches `app/markets/page.tsx`'s own helper. 18-dp, because that is what this USDC is. */
const usdc = (wei: string): string => ethers.formatUnits(BigInt(wei), 18);

/** ⚠️ The rehearsal test, and it is arithmetic. See the header — the name is never the test. */
const afterTheFact = (m: Market): boolean => m.observationEnd.getTime() <= m.createdAt.getTime();

const short = (s: string, n = 18): string => (s.length > n ? `${s.slice(0, n)}…` : s);

/** ⚠️ Never `0` for an absent value. An em dash is an absence; a zero is a measurement. */
const dash = (v: string | null): string => (v === null ? '—' : v);

async function settledMarkets(): Promise<Market[]> {
  const rows = await db()<{ id: string }[]>`
    SELECT id FROM markets
    WHERE (resolved_at IS NOT NULL OR voided_at IS NOT NULL)
    ORDER BY COALESCE(resolved_at, voided_at)`;
  const out: Market[] = [];
  for (const row of rows) {
    if (ONLY && row.id !== ONLY) continue;
    const m = await marketById(row.id);
    if (m) out.push(m);
  }
  return out;
}

/** When each row was graded, so a second run is visibly a no-op. */
async function scoredAt(): Promise<Map<string, Date>> {
  const rows = await db()<{ claim_id: string; scored_at: Date }[]>`
    SELECT claim_id, scored_at FROM scores`;
  return new Map(rows.map((r) => [r.claim_id, r.scored_at]));
}

// ─── Run ─────────────────────────────────────────────────────────────────────────────────────────

const started = new Date();
console.log(`\n── ${DRY ? 'dry run' : 'scoring'} · ${started.toISOString()}${ONLY ? ` · ${ONLY} only` : ''}`);

try {
  const markets = await settledMarkets();

  if (markets.length === 0) {
    console.log(ONLY
      ? `\n  ${ONLY} has not settled — it is neither resolved nor voided, so there is nothing to grade.`
      : '\n  no market has settled yet. Nothing to grade, and no row is the honest answer.');
    console.log('\n  A grade is derived from a settlement. The resolve cron (02:00Z daily) or');
    console.log('  `resolve-market.ts --market=<id> --send` puts an outcome on chain first.\n');
    await close();
    process.exit(0);
  }

  const before = await scoredAt();

  // ── What is outstanding, before anything is written ────────────────────────────────────────────
  console.log(`\n  ${markets.length} settled market${markets.length === 1 ? '' : 's'} in the store:\n`);
  let claimCount = 0;
  for (const m of markets) {
    const claims = await claimsFor(m.id);
    claimCount += claims.length;
    const settlement = m.voidedAt ? 'voided  ' : `resolved ${m.outcome ? 'TRUE ' : 'FALSE'}`;
    console.log(
      `    ${short(m.id, 30).padEnd(31)} chain ${String(m.chainMarketId ?? '—').padStart(3)}`
      + `  ${settlement}  ${afterTheFact(m) ? 'REHEARSAL' : 'forecast '}`
      + `  ${claims.length} claim${claims.length === 1 ? ' ' : 's'}`,
    );
    for (const c of claims) {
      const had = before.get(c.id);
      console.log(
        `        ${short(c.id, 22).padEnd(23)} chain claim ${String(c.chainClaimId ?? '—').padStart(2)}`
        + `  side ${c.side ? 'TRUE ' : 'FALSE'}  staked ${usdc(c.amount)}`
        + `  ${had ? `already graded ${had.toISOString()}` : 'NOT YET GRADED'}`,
      );
    }
  }

  if (DRY) {
    console.log(`\n  ⚠️ DRY RUN — nothing written. ${claimCount} claim${claimCount === 1 ? '' : 's'} across `
      + `${markets.length} settled market${markets.length === 1 ? '' : 's'} would be graded`);
    console.log('     (which rows, not which grades — see the header for why the values are not previewed).\n');
    await close();
    process.exit(0);
  }

  // ── Grade ──────────────────────────────────────────────────────────────────────────────────────
  const scores: Score[] = ONLY
    ? await scoreMarket(ONLY)
    : await scoreSettled();

  const after = await scoredAt();
  console.log(`\n  graded ${scores.length} claim${scores.length === 1 ? '' : 's'}:`);
  if (scores.length === 0) {
    console.log('\n    none — every settled market carries zero claims, so there is nothing to grade.');
    console.log('    ⚠️ Not a failure. `scoreSettled()` wrote no row because no row was owed.');
  }
  for (const s of scores) {
    const moved = before.get(s.claimId)?.getTime() !== after.get(s.claimId)?.getTime();
    const forecast = s.forecastCorrect === null ? 'VOID ' : s.forecastCorrect ? 'RIGHT' : 'WRONG';
    console.log(
      `    ${short(s.claimId, 22).padEnd(23)} ${forecast}`
      + `  staked ${usdc(s.staked)}`
      + `  returned ${dash(s.returned && usdc(s.returned))} (${s.returnState})`
      + `  quality ${dash(s.reconciliationQuality)}`
      + `  ${moved ? 'WROTE' : 'unchanged'}`,
    );
  }

  // ── The record. ⚠️ Three counts, never a percentage — see §4.2. ────────────────────────────────
  const byId = new Map(markets.map((m) => [m.id, m]));
  const forecasts = scores.filter((s) => !afterTheFact(byId.get(s.marketId)!));
  const right = forecasts.filter((s) => s.forecastCorrect === true).length;
  const wrong = forecasts.filter((s) => s.forecastCorrect === false).length;
  const void_ = forecasts.filter((s) => s.forecastCorrect === null).length;
  const excluded = scores.length - forecasts.length;

  console.log('\n  ── the analyst\'s record');
  console.log(forecasts.length === 0
    ? '     no claim has been graded yet — which is not a zero score.'
    : `     ${forecasts.length} settled — ${right} right, ${wrong} wrong, ${void_} voided`);
  console.log(`     rehearsals excluded${excluded > 0 ? ` (${excluded} graded and not counted)` : ''}`);
  console.log('     ⚠️ three counts, never a percentage. A void had no outcome and is neither.\n');
} finally {
  await close();
}

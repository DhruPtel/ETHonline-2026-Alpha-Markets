// Persistent demo grades, so the record and the planning prompt have content before the real ones land.
//
//   npx tsx --env-file=.env scripts/ops/seed-demo-record.ts            ← seed (idempotent)
//   npx tsx --env-file=.env scripts/ops/seed-demo-record.ts --list     ← what demo rows exist
//   npx tsx --env-file=.env scripts/ops/seed-demo-record.ts --remove   ← take them out again
//
// ⚠️ **SPENDS NOTHING AND TOUCHES NO CHAIN.** No provider, no Circle client, no transaction. Store
// rows only. Nothing is staked, committed, resolved or voided anywhere.
//
// ⚠️ **THESE ROWS PERSIST.** Every fixture this phase used removed itself in a `finally`; this one
// does not, which is the whole point. It still ships `--remove`, because demo rows that cannot be
// taken out again are worse than none — that is an operator's control, not the script tidying up
// behind itself.
//
// ── ⚠️ HOW A DEMO GRADE IS TOLD FROM A REAL ONE — BY ABSENCE, NOT BY A LABEL ─────────────────────
//
// The schema has no `is_demo` column and this script may not add one, so the distinction cannot be a
// flag. **It is better than a flag anyway: a demo grade is a grade with nothing on chain behind it.**
// Four independent columns say so, and every one of them is an absence rather than an assertion:
//
//   `markets.chain_market_id`   **NULL** — it never landed, so there is no market id to name.
//   `markets.contract_address`  **NULL** — no deployment issued it.
//   `markets.resolve_tx`        **NULL** — nothing settled it on chain.
//   `claims.chain_claim_id`     **NULL** — no `Committed` event carries it.
//
// ⚠️ **A label can be copied; a settlement transaction cannot be faked into existence.** A real grade
// carries a chain market id and a transaction hash that resolves on the Arc RPC. A demo grade carries
// neither and cannot be made to. That is the check, and it is arithmetic on the data rather than
// trust in a naming convention — the same reasoning the rehearsal rule uses.
//
// The ids are `m/demo-*` and `c/demo-*` as the human-readable convention on top of that, so
// `--list`, a `LIKE 'm/demo-%'` query and this script all agree about which rows are which.
//
// ⚠️ **`claims.amount` is `1000000000000` — 0.000001 USDC, the smallest the schema permits.**
// `CHECK (amount > 0 AND amount % 1000000000000 = 0)` forbids zero, which would have been the honest
// figure since nothing was staked. The minimum is the closest available, and it is six orders of
// magnitude below any real position here (0.01 and 1.00 USDC), so it reads as what it is at a glance.
//
// ── ⚠️ WHAT THIS LOOKS LIKE ON EACH SURFACE, INCLUDING THE ONE THAT READS ODDLY ──────────────────
//
//   `/analyst` graded table   Market `—`, claim `—`, staked `0.000001 USDC`, settlement
//                             **"settled, no transaction recorded"**. ⚠️ That copy was written to
//                             flag a *bug* — a settled market whose transaction went missing. On a
//                             demo row the sentence is literally true and there is no bug. Naming it
//                             here because the page cannot be changed to say so.
//   `/markets`                They appear under **"Not on chain"**, which is exactly right. ⚠️ That
//                             section's copy says a market "waits here until the commit cron reaches
//                             it", which is not true of these — they are never going on chain.
//   marketplace + report page The green / terracotta / grey markers, which is the point.
//   the context block         Real lines with real directives and real subjects.
//
// ── ⚠️ THEY ARE FORECASTS BY ARITHMETIC, WHICH IS WHAT MAKES ANY OF THIS RENDER ─────────────────
//
// **`observationEnd > createdAt` or every surface excludes them and the exercise renders blank.**
// `isRehearsal()` is the test everywhere now, so a fixture created *after* its observation window
// closed — the obvious way to write one — would be silently dropped from the record, the markers and
// the planning prompt, and the page would look exactly as empty as before.
//
// So `created_at` is set **before** `observation_end`: created 2026-09-05, observing through
// 2026-09-11. Asserted below rather than assumed, because getting it backwards fails silently.
//
// ── ⚠️ THE CONSEQUENCE WORTH SAYING OUT LOUD ────────────────────────────────────────────────────
//
// **These rows reach `agent/context.ts`, so the next report is planned against a partly invented
// record.** That is what "populate the context block" means and it is not a side effect. Run
// `--remove` before generating a report whose planning you care about. After markets 6 and 7 settle,
// the real grades sort above these anyway — `build()` orders by settlement time and these are dated
// 2026-09-11.

import { scoreMarket } from '../../src/arc/score.js';
import { specHash, validateSpec } from '../../src/arc/spec.js';
import { isRehearsal } from '../../src/arc/rehearsal.js';
import { close } from '../../src/store/markets.js';
import { db } from '../../src/store/db.js';
import { ANALYSTS } from '../../src/config/analysts.js';

const argv = process.argv.slice(2);
const LIST = argv.includes('--list');
const REMOVE = argv.includes('--remove');

const ANALYST = ANALYSTS[0]!.arcAddress;
/** ⚠️ The schema's minimum. See the header — zero is forbidden and would have been the true figure. */
const DUST = '1000000000000';

/** ⚠️ created BEFORE observationEnd, so `isRehearsal()` says forecast. Asserted at the bottom. */
const CREATED = '2026-09-05T00:00:00Z';
const CLOSE = '2026-09-09T23:59:00Z';
const OBSERVATION_END = '2026-09-11T00:00:00Z';
const DEADLINE = '2026-09-13T00:00:00Z';
const OBSERVED_DAY = '2026-09-10';
/** Dated so real grades, settled later, sort above these everywhere. */
const SETTLED = '2026-09-11T12:00:00Z';

interface Case {
  readonly key: string;
  /** First ten characters of a published report's hash. ⚠️ Never `24041ca282` — see below. */
  readonly report: string;
  readonly metric: string;
  readonly threshold: string;
  /** `null` voids the market. */
  readonly outcome: boolean | null;
  readonly side: boolean;
}

/**
 * ⚠️ **`24041ca282…` is deliberately absent.** It is the report markets 6 and 7 both cite, so a demo
 * claim on it would mix invented counts with the first two real grades **on one marker** — the one
 * report where a reader could not tell which half was which. Every other published report is fair.
 */
const CASES: readonly Case[] = [
  { key: 'right', report: '65fb085d26', metric: 'totalDepositBalanceUSD', threshold: '21000000000', outcome: true, side: true },
  { key: 'wrong', report: '9ccc3a394d', metric: 'totalBorrowBalanceUSD', threshold: '9500000000', outcome: false, side: true },
  { key: 'void', report: '600935014c', metric: 'totalDepositBalanceUSD', threshold: '3200000000', outcome: null, side: true },
  // ⚠️ Two claims on ONE report that disagree — the case the neutral marker exists for.
  { key: 'split-hit', report: '348482a526', metric: 'totalDepositBalanceUSD', threshold: '19000000000', outcome: true, side: true },
  { key: 'split-miss', report: '348482a526', metric: 'totalBorrowBalanceUSD', threshold: '30000000000', outcome: false, side: true },
];

const mid = (key: string) => `m/demo-${key}`;
const cid = (key: string) => `c/demo-${key}`;

async function existing(): Promise<{ markets: number; claims: number; scores: number }> {
  const [row] = await db()<{ markets: number; claims: number; scores: number }[]>`
    SELECT (SELECT count(*)::int FROM markets WHERE id LIKE 'm/demo-%')   AS markets,
           (SELECT count(*)::int FROM claims  WHERE id LIKE 'c/demo-%')   AS claims,
           (SELECT count(*)::int FROM scores  WHERE market_id LIKE 'm/demo-%') AS scores`;
  return row!;
}

async function remove(): Promise<void> {
  // ⚠️ Scoped to the `demo-` prefix in all three tables, and in FK order. Nothing else can match.
  await db()`DELETE FROM scores WHERE market_id LIKE 'm/demo-%'`;
  await db()`DELETE FROM claims WHERE market_id LIKE 'm/demo-%'`;
  await db()`DELETE FROM markets WHERE id LIKE 'm/demo-%'`;
}

async function publishedHashes(): Promise<Map<string, string>> {
  const rows = await db()<{ hash: string }[]>`
    SELECT hash FROM reports WHERE published_at IS NOT NULL`;
  return new Map(rows.map((r) => [r.hash.slice(0, 10), r.hash]));
}

// ─── Run ─────────────────────────────────────────────────────────────────────────────────────────

try {
  if (LIST) {
    const rows = await db()<{
      market_id: string; claim_id: string; forecast_correct: boolean | null;
      chain_market_id: string | null; resolve_tx: string | null; report_hash: string;
    }[]>`
      SELECT s.market_id, s.claim_id, s.forecast_correct, m.chain_market_id, m.resolve_tx, c.report_hash
        FROM scores s
        JOIN markets m ON m.id = s.market_id
        JOIN claims  c ON c.id = s.claim_id
       ORDER BY s.market_id`;
    console.log(`\n  ${rows.length} score row${rows.length === 1 ? '' : 's'} in the store:\n`);
    for (const r of rows) {
      // ⚠️ The real test is the absence of chain evidence, not the id prefix. Both are printed so a
      // reader can see they agree — if they ever disagreed, the chain columns would be the truth.
      const onChain = r.chain_market_id !== null || r.resolve_tx !== null;
      console.log(
        `    ${r.market_id.padEnd(22)} ${String(r.forecast_correct ?? 'VOID').padEnd(5)}`
        + `  report ${r.report_hash.slice(0, 10)}`
        + `  chainMarket ${String(r.chain_market_id ?? '—').padStart(4)}`
        + `  tx ${r.resolve_tx ? r.resolve_tx.slice(0, 10) : '—'}`
        + `  → ${onChain ? 'REAL' : 'DEMO'}${r.market_id.startsWith('m/demo-') === !onChain ? '' : '  ⚠️ PREFIX AND CHAIN EVIDENCE DISAGREE'}`,
      );
    }
    console.log();
    process.exit(0);
  }

  if (REMOVE) {
    const before = await existing();
    await remove();
    const after = await existing();
    console.log(`\n  removed — markets ${before.markets}→${after.markets}, claims ${before.claims}→${after.claims}, scores ${before.scores}→${after.scores}\n`);
    process.exit(0);
  }

  // ⚠️ Idempotent by rebuild: the demo set is removed and re-seeded, so running twice leaves exactly
  // one copy. It cannot touch a real row — every statement is scoped to the `demo-` prefix.
  await remove();

  const published = await publishedHashes();
  console.log('\n── seeding the demo record · nothing on chain, nothing spent\n');

  for (const c of CASES) {
    const hash = published.get(c.report);
    if (!hash) {
      console.error(`  STOP  no published report begins ${c.report}. Nothing seeded; run --remove if partial.`);
      process.exit(1);
    }

    const spec = validateSpec({
      slug: 'aave-v3-ethereum', metric: c.metric, comparison: 'above',
      threshold: c.threshold, observedDay: OBSERVED_DAY,
    });

    await db()`
      INSERT INTO markets (id, spec_hash, spec_json, observed_day, close_time, observation_end,
                           resolve_deadline, created_at, resolved_at, voided_at, outcome)
      VALUES (${mid(c.key)}, ${specHash(spec)}, ${JSON.stringify(spec)}, ${OBSERVED_DAY},
              ${CLOSE}, ${OBSERVATION_END}, ${DEADLINE}, ${CREATED},
              ${c.outcome === null ? null : SETTLED}, ${c.outcome === null ? SETTLED : null},
              ${c.outcome})`;

    await db()`
      INSERT INTO claims (id, market_id, author, report_hash, side, amount, committed_at)
      VALUES (${cid(c.key)}, ${mid(c.key)}, ${ANALYST}, ${hash}, ${c.side}, ${DUST}, ${CLOSE})`;

    // ⚠️ **Through `scoreMarket()`, never an INSERT into `scores`.** A fixture whose shape differs
    // from what the real path writes is a fixture that proves nothing — the grade, the return state
    // and the copied reconciliation quality all have to come from the same function the cron calls.
    const [score] = await scoreMarket(mid(c.key));
    if (!score) {
      console.error(`  STOP  scoreMarket wrote nothing for ${mid(c.key)}.`);
      process.exit(1);
    }
    console.log(
      `  ${c.key.padEnd(11)} report ${hash.slice(0, 10)}`
      + `  ${score.forecastCorrect === null ? 'VOID ' : score.forecastCorrect ? 'RIGHT' : 'WRONG'}`
      + `  settlement ${score.settlement}  returned ${score.returned ?? '—'} (${score.returnState})`,
    );
  }

  // ── ⚠️ Assertions, because each of these fails SILENTLY into a blank page ──────────────────────
  const markets = await db()<{ id: string; observation_end: Date; created_at: Date; chain_market_id: string | null; resolve_tx: string | null }[]>`
    SELECT id, observation_end, created_at, chain_market_id, resolve_tx
      FROM markets WHERE id LIKE 'm/demo-%'`;
  const rehearsals = markets.filter((m) => isRehearsal(m.observation_end, m.created_at));
  const onChain = markets.filter((m) => m.chain_market_id !== null || m.resolve_tx !== null);
  const counted = await existing();

  console.log('\n  ── checks');
  console.log(`     ${rehearsals.length === 0 ? '✅' : '❌'} all ${markets.length} demo markets are FORECASTS by arithmetic`
    + `${rehearsals.length ? ` — ${rehearsals.length} would be excluded and render nothing` : ''}`);
  console.log(`     ${onChain.length === 0 ? '✅' : '❌'} none carries a chain market id or a settlement transaction`
    + ' — which is how a demo grade is told from a real one');
  console.log(`     ✅ ${counted.scores} score rows, ${counted.claims} claims, ${counted.markets} markets, all prefixed demo-`);
  console.log('\n     ⚠️ These persist. `--remove` takes them out; `--list` shows real vs demo.');
  console.log('     ⚠️ They reach the planning prompt — remove them before generating a report that matters.\n');

  if (rehearsals.length > 0 || onChain.length > 0) process.exit(1);
} finally {
  await close();
}

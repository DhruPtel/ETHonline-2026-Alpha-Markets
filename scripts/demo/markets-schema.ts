// Unit 5's proof, extended by Unit 6's migration. `005_markets.sql` + `006_market_landmarks.sql`
// and `src/store/markets.ts` in, PASS or FAIL out.
//
//   npx tsx --env-file=.env scripts/ops/migrate.ts     ← run this first
//   npx tsx --env-file=.env scripts/demo/markets-schema.ts
//
// ⚠️ **Reads the schema as the DATABASE reports it, not as the SQL declares it.** A migration file
// says what was intended; `information_schema` says what is there. Those differ whenever a statement
// was skipped by IF NOT EXISTS against an object that already existed in another shape — which is
// exactly the case a proof reading the .sql file back would be blind to.
//
// ⚠️ **The NUMERIC round-trip is the point of this script**, not a formality. `NUMERIC(78,0)` was
// chosen over BIGINT because an 18-dp USDC amount overflows BIGINT at ~9.22 USDC, and over TEXT
// because the spend cap is a SUM. Both are worthless if the driver hands the value back as a float.
//
// ⚠️ **And the obvious way to demonstrate that is wrong, which is worth stating because the first
// draft of this script got it wrong.** `String(Number('2500000000000000000'))` returns that string
// back unchanged — 2.5×10^18 happens to land exactly on a representable float, so an assertion that
// `Number()` mangles it FAILS. Being past `Number.MAX_SAFE_INTEGER` does not mean a value prints
// wrong; it means values near it stop being *distinguishable*. The honest demonstration is that
// `Number()` cannot tell 2500000000000000000 from 2500000000000000001 — and one of those is a legal
// stake while the other reverts `NotAUsdcUnit`. That is the assertion below.
//
// ⚠️ **Writes to a temporary table and drops it.** The seven real tables are not touched: this proof
// must not leave a market row behind that a cron would later find as work.

import { closePool, db, pooledClientsCreated } from '../../src/store/db.js';
import {
  claimsFor, marketById, payoutFor, payoutsFor, settlementEvidenceFor, spentSince, stakesFor,
} from '../../src/store/markets.js';
// ⚠️ The two reconciliation queries moved here from `markets.ts`. This import line is the whole
// caller-side cost of that split, and it is the reason this script is in the split's scope at all.
import { marketsAwaitingCommit, marketsAwaitingResolve } from '../../src/store/outstanding.js';

let failures = 0;
const ok = (label: string, condition: boolean, detail = ''): void => {
  console.log(`  ${condition ? '✅' : '❌'} ${label}${detail ? `   ${detail}` : ''}`);
  if (!condition) failures += 1;
};

const sql = db();
/** 005's seven, plus 006's `payouts`. ⚠️ The amount-column sweep below is keyed off this list. */
const TABLES = [
  'markets', 'claims', 'stakes', 'scores',
  'settlement_evidence', 'binding_evidence', 'spend_ledger',
  'payouts',
] as const;

try {
  // ─── 1 · the schema as the database reports it ─────────────────────────────────────────────────
  console.log('\n── 1 · what information_schema says is actually there');

  const present = await sql<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' ORDER BY table_name`;
  const names = present.map((t) => t.table_name);
  console.log(`  tables: ${names.join(', ')}`);
  for (const t of TABLES) ok(`${t} exists`, names.includes(t));
  // ⚠️ 001–004's four are still there. A migration that dropped one would pass every check above.
  ok('001–004 survived', ['reports', 'report_tokens', 'quotes', 'purchases'].every((t) => names.includes(t)));

  // ⚠️ Every amount column, checked by type rather than by name. This is the assertion that fails if
  // someone later adds an amount as BIGINT because "it fits".
  const amounts = await sql<{ table_name: string; column_name: string; data_type: string; numeric_precision: number; numeric_scale: number }[]>`
    SELECT table_name, column_name, data_type, numeric_precision, numeric_scale
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ANY(${TABLES as unknown as string[]})
      AND column_name IN ('amount', 'staked', 'returned', 'chain_market_id', 'chain_claim_id')
    ORDER BY table_name, column_name`;
  console.log(`\n  amount-shaped columns (${amounts.length}):`);
  for (const c of amounts) {
    console.log(`    ${c.table_name}.${c.column_name}  ${c.data_type}(${c.numeric_precision},${c.numeric_scale})`);
  }
  ok('every one is NUMERIC(78,0)',
    amounts.length > 0 && amounts.every((c) => c.data_type === 'numeric' && c.numeric_precision === 78 && c.numeric_scale === 0));

  // ⚠️ The landmarks must be NULLABLE. A NOT NULL landmark cannot mean "has not happened", and both
  // crons' find-work queries are `WHERE … IS NULL`.
  const landmarks = await sql<{ table_name: string; column_name: string; is_nullable: string }[]>`
    SELECT table_name, column_name, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name IN ('committed_at', 'resolved_at', 'voided_at', 'landed_at', 'claimed_at')
    ORDER BY table_name, column_name`;
  console.log(`\n  landmarks: ${landmarks.map((c) => `${c.table_name}.${c.column_name}=${c.is_nullable}`).join(' ')}`);
  ok('every landmark is nullable', landmarks.length >= 5 && landmarks.every((c) => c.is_nullable === 'YES'));

  // ⚠️ TEXT and never jsonb, on the three columns a hash is taken over.
  const canonical = await sql<{ table_name: string; column_name: string; data_type: string }[]>`
    SELECT table_name, column_name, data_type FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name IN ('spec_json', 'raw') ORDER BY table_name`;
  console.log(`  canonical bytes: ${canonical.map((c) => `${c.table_name}.${c.column_name}=${c.data_type}`).join(' ')}`);
  ok('spec_json and raw are text, never jsonb',
    canonical.length === 3 && canonical.every((c) => c.data_type === 'text'));

  // ⚠️ stakes.tx_hash UNIQUE is what makes a re-record a no-op. Read from the constraint catalogue,
  // because a UNIQUE that was declared and silently skipped is the failure this whole section is for.
  const uniques = await sql<{ table_name: string; constraint_name: string }[]>`
    SELECT tc.table_name, tc.constraint_name
    FROM information_schema.table_constraints tc
    WHERE tc.table_schema = 'public' AND tc.constraint_type = 'UNIQUE'
      AND tc.table_name = ANY(${TABLES as unknown as string[]})`;
  const uniqueOn = async (table: string, col: string): Promise<boolean> => {
    const [hit] = await sql<{ n: string }[]>`
      SELECT count(*)::text AS n
      FROM information_schema.constraint_column_usage
      WHERE table_schema = 'public' AND table_name = ${table} AND column_name = ${col}
        AND constraint_name IN ${sql(uniques.map((u) => u.constraint_name))}`;
    return Number(hit?.n ?? 0) > 0;
  };
  ok('stakes.tx_hash is UNIQUE', await uniqueOn('stakes', 'tx_hash'));
  ok('claims (market_id, author) is UNIQUE — one claim per author', await uniqueOn('claims', 'author'));

  // ⚠️ No ON DELETE CASCADE anywhere. Read from the catalogue rather than trusted.
  const cascades = await sql<{ constraint_name: string; delete_rule: string }[]>`
    SELECT rc.constraint_name, rc.delete_rule
    FROM information_schema.referential_constraints rc
    JOIN information_schema.table_constraints tc ON tc.constraint_name = rc.constraint_name
    WHERE tc.table_schema = 'public' AND tc.table_name = ANY(${TABLES as unknown as string[]})`;
  console.log(`  ${cascades.length} foreign keys, delete rules: ${[...new Set(cascades.map((c) => c.delete_rule))].join(', ')}`);
  ok('no ON DELETE CASCADE', cascades.length > 0 && cascades.every((c) => c.delete_rule === 'NO ACTION'));

  // ─── 2 · the NUMERIC round trip, which is what the column type exists for ──────────────────────
  console.log('\n── 2 · NUMERIC(78,0) round-trip — the check the column type exists for');

  const MEASURED = '2500000000000000000';   // SM-08's msg.value, 18-dp. Past MAX_SAFE_INTEGER.
  const UINT256_MAX = (2n ** 256n - 1n).toString();  // 78 digits — the ceiling the precision is for.

  await sql`CREATE TEMP TABLE numeric_probe (label TEXT PRIMARY KEY, amount NUMERIC(78,0))`;
  await sql`INSERT INTO numeric_probe VALUES ('measured', ${MEASURED}), ('uint256max', ${UINT256_MAX})`;
  const back = await sql<{ label: string; amount: string }[]>`
    SELECT label, amount FROM numeric_probe ORDER BY label`;

  for (const row of back) {
    console.log(`    ${row.label.padEnd(11)} ${row.amount}   typeof = ${typeof row.amount}`);
  }
  const measured = back.find((r) => r.label === 'measured')!;
  const max = back.find((r) => r.label === 'uint256max')!;

  ok('comes back as a JavaScript string', typeof measured.amount === 'string', `typeof ${typeof measured.amount}`);
  ok('byte-identical to what went in', measured.amount === MEASURED, measured.amount);
  ok('the driver did not make it a float', !Number.isFinite(measured.amount as unknown as number));
  // ⚠️ The assertion that would catch a float, stated as the property that is actually true. See the
  // header: this value survives `Number()` by luck, and its NEIGHBOUR is what it cannot survive.
  ok('BigInt round-trips it exactly', BigInt(measured.amount) === 2500000000000000000n);
  ok('Number() cannot tell it from the value one wei higher',
    Number(MEASURED) === Number('2500000000000000001'),
    `both → ${Number('2500000000000000001')}, and only one of the two is a legal stake`);
  ok('BigInt can', BigInt(MEASURED) !== BigInt('2500000000000000001'));
  ok('…and Number() visibly destroys uint256 max',
    String(Number(UINT256_MAX)) !== UINT256_MAX, `Number() → ${String(Number(UINT256_MAX)).slice(0, 22)}`);
  ok('uint256 max survives all 78 digits', max.amount === UINT256_MAX, `${max.amount.length} digits`);

  // ⚠️ SUM is the spend cap's shape, and the reason TEXT was not viable. It must stay exact.
  const [summed] = await sql<{ total: string }[]>`SELECT SUM(amount)::text AS total FROM numeric_probe`;
  ok('SUM stays exact across both rows',
    summed!.total === (BigInt(MEASURED) + BigInt(UINT256_MAX)).toString(), summed!.total);

  await sql`DROP TABLE numeric_probe`;

  // ─── 3 · the module reads, against the real (empty) tables ─────────────────────────────────────
  // ⚠️ Empty is the honest state — nothing has been committed yet and this script must not write a
  // market row a cron would later find as work. What is proved here is that every query PARSES and
  // RUNS against the schema as migrated: a column typo would fail right here.
  console.log('\n── 3 · every read in markets.ts and outstanding.ts runs against the migrated schema');

  ok('marketById returns null for an unknown id', (await marketById('no-such-market')) === null);
  ok('marketsAwaitingCommit runs (the LEFT JOIN)', (await marketsAwaitingCommit('0x0')).length === 0);
  ok('marketsAwaitingResolve runs', (await marketsAwaitingResolve(new Date())).length === 0);
  ok('claimsFor runs', (await claimsFor('no-such-market')).length === 0);
  ok('stakesFor runs', (await stakesFor('no-such-claim')).length === 0);
  ok('settlementEvidenceFor returns null', (await settlementEvidenceFor('no-such-market')) === null);

  const spent = await spentSince('0x0', 'arc', 'USDC', new Date(0));
  ok('spentSince returns "0", not null, over no rows', spent === '0', `"${spent}" (${typeof spent})`);
  ok('payoutsFor runs', (await payoutsFor('no-such-market')).length === 0);
  ok('payoutFor returns null', (await payoutFor('no-such-market', '0x0')) === null);

  // ─── 4 · 006's two fixes, as the database reports them ────────────────────────────────────────
  console.log('\n── 4 · 006 — the void\'s evidence, and where a payout lands');

  const voidCols = await sql<{ column_name: string; data_type: string; is_nullable: string }[]>`
    SELECT column_name, data_type, is_nullable FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'markets'
      AND column_name IN ('void_tx', 'voided_by', 'voided_at') ORDER BY column_name`;
  console.log(`  markets: ${voidCols.map((c) => `${c.column_name}=${c.data_type}/${c.is_nullable}`).join(' ')}`);
  ok('markets gained void_tx and voided_by', voidCols.length === 3);
  ok('all three void columns are nullable', voidCols.every((c) => c.is_nullable === 'YES'));

  // ⚠️ The PK is the contract's own key: `claimed[marketId][msg.sender]` is a bool per
  // (market, address), and this is that statement in a database.
  const pk = await sql<{ column_name: string }[]>`
    SELECT kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
    WHERE tc.table_schema = 'public' AND tc.table_name = 'payouts' AND tc.constraint_type = 'PRIMARY KEY'
    ORDER BY kcu.ordinal_position`;
  console.log(`  payouts PK: (${pk.map((c) => c.column_name).join(', ')})`);
  ok('payouts is keyed (market_id, account) — the grain the contract pays at',
    pk.map((c) => c.column_name).join(',') === 'market_id,account');
  ok('payouts.tx_hash is UNIQUE — and here it is meaningful', await uniqueOn('payouts', 'tx_hash'));

  // ⚠️ The assertion that stops someone copying the stake rule onto a payout. A stake must be a
  // whole 6-dp USDC unit because `_checkAmount` reverts otherwise; a payout is
  // `mine + (mine * losingPool) / winningPool` and is under no such constraint.
  const checks = await sql<{ table_name: string; def: string }[]>`
    SELECT rel.relname AS table_name, pg_get_constraintdef(con.oid) AS def
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = rel.relnamespace
    WHERE ns.nspname = 'public' AND con.contype = 'c'
      AND rel.relname IN ('claims', 'stakes', 'payouts')
      AND pg_get_constraintdef(con.oid) LIKE '%1000000000000%'`;
  console.log(`  %1e12 checks on: ${checks.map((c) => c.table_name).sort().join(', ') || '(none)'}`);
  ok('claims and stakes require whole 6-dp USDC units',
    ['claims', 'stakes'].every((t) => checks.some((c) => c.table_name === t)));
  ok('payouts does NOT — a payout is a ratio, not a unit',
    !checks.some((c) => c.table_name === 'payouts'));

  // ─── 5 · one pooled client, across a run that touched both modules ────────────────────────────
  // ⚠️ **Demonstrated with the counter, not argued from the code shape.** `db.ts` has kept
  // `pooledClientsCreated()` since the Phase 3 consolidation — three modules each memoized their own
  // client, so a request touching all three opened three — and its own comment recorded that nothing
  // read it. Splitting one store module into two is exactly the change that would quietly undo that
  // work, and "I imported `db()` rather than `pooled()`" is a claim about code, not a measurement.
  //
  // ⚠️ Every read above has already run: sections 1–4 touched `markets.ts`, `outstanding.ts` and
  // this script's own `sql` handle. If any of the three had constructed its own, the count would be
  // above one by now.
  console.log('\n── 5 · one pooled client for the whole run');
  const clients = pooledClientsCreated();
  console.log(`  modules touched: db.ts (this script), markets.ts, outstanding.ts`);
  ok('exactly one pooled client was ever constructed', clients === 1, `pooledClientsCreated() = ${clients}`);

  console.log(failures === 0 ? '\nPASS  005 + 006 + markets.ts + outstanding.ts.\n' : `\nFAIL  ${failures} assertion(s).\n`);
} finally {
  await closePool();
}

process.exit(failures === 0 ? 0 : 1);

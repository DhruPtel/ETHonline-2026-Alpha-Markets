// Run the migrations, in filename order, through the DIRECT connection.
//
//   npx tsx --env-file=.env scripts/ops/migrate.ts
//
// ⚠️ **This is not a migration framework and should not become one.** No version table, no down
// migrations, no checksums: every run applies every file in `src/store/migrations/`. Each is written
// to be idempotent — `IF NOT EXISTS`, `IF EXISTS`, `ON CONFLICT DO NOTHING` — and that property is what
// a version table would otherwise buy. When a migration needs to be non-idempotent, that is the moment
// to reconsider, not before.
//
// ⚠️ **Re-running is NOT a pure no-op on a database that has used `unpublish()`.** 009's backfill sets
// `published_at` again on any unlisted report created on or before 2026-09-12 18:42 UTC that has a
// token, a settled purchase or an on-chain claim — so it re-lists reports that were deliberately
// unlisted. See `src/store/README.md`.
//
// ⚠️ **Direct connection, never pooled.** Neon's pooled endpoint is PgBouncer in transaction mode and
// does not carry the session state DDL needs. The failure is not clean: it surfaces as errors about
// prepared statements that read like a fault in the `.sql` file.

import { readFileSync, readdirSync } from 'node:fs';
import { direct } from '../../src/store/db.js';

const DIR = new URL('../../src/store/migrations/', import.meta.url);

const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
if (!files.length) {
  console.error('FAIL  no .sql files in src/store/migrations/');
  process.exit(1);
}

const sql = direct();
try {
  const host = /@([^/?]+)/.exec(process.env.DATABASE_URL_DIRECT ?? '')?.[1] ?? '(unparsed)';
  console.log(`\n── migrating via ${host}`);
  // ⚠️ Asserted, not assumed. Running DDL through the pooler is the exact failure this file exists to
  // avoid, and a copied-over connection string is how it happens — it already happened once.
  if (host.includes('-pooler')) {
    console.error('\nSTOP  DATABASE_URL_DIRECT points at the POOLED host (it contains "-pooler").');
    console.error('      DDL through PgBouncer fails in ways that read like a schema bug. Use the');
    console.error('      direct endpoint — the same string with "-pooler" removed from the host.');
    process.exit(1);
  }

  for (const file of files) {
    const text = readFileSync(new URL(file, DIR), 'utf8');
    // `sql.unsafe` because this is a whole file of DDL, not a parameterised query. The input is a
    // file in this repo, never anything a user supplied.
    await sql.unsafe(text);
    console.log(`  applied  ${file}  (${text.split('\n').length} lines)`);
  }

  const tables = await sql<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' ORDER BY table_name`;
  console.log(`\n  tables now: ${tables.map((t) => t.table_name).join(', ')}`);
  console.log('\nPASS  migrations applied.');
} finally {
  await sql.end();
}

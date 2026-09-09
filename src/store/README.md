# store — a report cannot be regenerated, so this is the only copy

Neon Postgres. Four tables: `reports`, `report_tokens`, `quotes`, `purchases`.

⚠️ **Narration is inside the report hash, and the model call that produces it is not
deterministic.** Re-running the same directive at the same block yields a *different* report with a
different identity. So this is not a cache of something reproducible — it is the only place a
published report exists, and losing a row loses the thing a token commits to and a market would
settle on.

That single fact explains most of the design here.

## Read in this order

1. **`reports.ts`** — `save`, `load`, `list`. The canonical **string** goes into a `TEXT` column,
   never `jsonb`: jsonb reorders keys, normalises numbers and drops duplicates, which would silently
   change the identity of every report stored. `load` parses that string and **re-derives the hash**,
   then refuses to serve a row whose bytes no longer canonicalize to its own primary key. A tampered
   report is not a report with a caveat.
2. **`db.ts`** — the connections, and the two Neon URLs. ⚠️ `DATABASE_URL` is the **pooled** endpoint
   (PgBouncer, for route handlers) and `DATABASE_URL_DIRECT` is the **direct** one (migrations only).
   They are not interchangeable, and the pooled endpoint fails DDL in a way that reads like a bug in
   the `.sql` file. Clients are lazy and shared — never constructed at module scope, because a
   missing variable would then be a cold-start crash on every route that transitively imports this.

**Then:** `tokens.ts` reads `report_tokens` (which report has an ATS asset, and where). `migrations/`
is applied in filename order by `scripts/ops/migrate.ts`; every statement is idempotent, so re-running
is a no-op.

## What a reviewer should know is unfinished

- **`quotes.state` is never written.** Every row reads `'open'` for ever. Liveness is decided by
  `expires_at` alone, which is correct; the column is inert and its index covers a constant. No money
  consequence today — the Own tier is cut, so two paid reads of one report are both valid — and it is
  recorded at the code rather than only here.
- **`purchases.delivered_at` is never written either.** A server cannot observe that a response
  arrived. Closing that gap is the unbuilt recovery unit.
- **`001_init.sql` creates a column that no longer exists** (`rendered_md`, dropped by `002`). That is
  deliberate: a migration that has run against a live database is history, and rewriting it would
  make a fresh database and an existing one disagree with nothing recording which is which.

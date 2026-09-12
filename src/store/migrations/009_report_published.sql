-- 009 — when a report was put in the marketplace. Idempotent: ADD COLUMN IF NOT EXISTS.
--
-- Run with:  npx tsx --env-file=.env scripts/ops/migrate.ts
-- ⚠️ Through DATABASE_URL_DIRECT. The pooled endpoint is PgBouncer and cannot carry DDL reliably.
--
-- ⚠️ No existing migration is edited. Eight have run against the live database, and 002's header
-- gives the reason: a migration that has run is history, and rewriting it means a fresh database and
-- an existing one no longer agree with nothing recording which is which.
--
-- ── ⚠️ WHY THIS IS A COLUMN AND NOT A FIELD ON `Report` ─────────────────────────────────────────
--
-- Until now `/` listed every row in `reports`, so generating a report published it. That is wrong:
-- an analyst that runs five drafts should choose which one the market sees.
--
-- ⚠️ **OUTSIDE THE HASH, DELIBERATELY, AND IT CANNOT MOVE INSIDE LATER.** `context_digest` (007) and
-- `title` (008) are the precedents and the reasoning is identical. A field on `Report` changes the
-- canonical bytes of every report and invalidates every hash already written — and **four of those
-- are committed in ATS creation events on Hedera**, where nothing can amend them. A column on the
-- row is invisible to `canonical()`, which serialises the report object and never reads the row, so
-- `load()`'s two integrity checks are unaffected.
--
-- ⚠️ **And it would be wrong even if it were free.** Publishing is a decision taken about a report
-- after it exists. Two runs of one directive at one block are the same report and must hash the
-- same whether one was listed and the other was not. What a report IS cannot depend on whether
-- somebody chose to sell it.
--
-- ── ⚠️ A LANDMARK, NOT A BOOLEAN, AND NOT A STATE ──────────────────────────────────────────────
--
-- `TIMESTAMPTZ NULL` is the shape `purchases.settled_at` and `markets.resolved_at`/`voided_at`
-- already use in this database: written once, describing something that happened, and a null means
-- exactly what it looks like.
--
-- ⚠️ **`quotes.state` is the cautionary tale and it is in this same database** (001_init, and
-- 005_markets' header spells it out): a state column that was specified, indexed, and never written
-- by anything, so every one of its 22 rows still reads its initial value. A state column has to be
-- *maintained*; a landmark is set once and is then a fact. `published_at` is set exactly once, by
-- `publish()` in `src/store/reports.ts`, and there is exactly one caller.
--
-- ⚠️ **There is no `unpublish`, and that is a decision rather than an omission.** Undoing this would
-- mean writing NULL back, which does not record a withdrawal — it erases the fact that the report
-- was ever listed. Five of the rows below have **settled x402 purchases** against them; a store that
-- said those reports had never been listed would contradict payments that are on Hedera. Withdrawal,
-- if it is ever wanted, is its own landmark (`withdrawn_at`) beside this one, never the absence of
-- this one.
--
-- ── ⚠️ THE BACKFILL, AND WHY IT IS NEITHER "ALL" NOR "NONE" ────────────────────────────────────
--
-- Nineteen rows exist and none of them was ever *published*, because until today there was nothing
-- to publish with. So neither obvious default is honest:
--
--   all NULL       empties the marketplace, and retroactively unlists five reports that have
--                  **twelve settled purchases** between them and one that backs two live Arc
--                  markets — including market 6, which carries 1.00 USDC from a human wallet.
--                  Our index would then contradict what two public chains already record.
--   all published  makes the column inert on arrival and, worse, asserts that an analyst chose to
--                  list twelve drafts it never chose anything about. Absence of a control is not
--                  consent.
--
-- ⚠️ **So the backfill is keyed to evidence a stranger can already check**: a report is marked
-- published if it has an ATS token, a settled purchase, or an on-chain claim. Each of those is a
-- public artefact that only exists because the report was out in the world. Measured before writing
-- this: **7 of 19 qualify, 12 do not.**
--
-- ⚠️ **The timestamp is `created_at`, not `now()`.** There was no publication event to date, and
-- `created_at` is the moment the row became visible under the behaviour that existed until today.
-- `now()` would claim these were published on the day the column was added, which is false.
--
-- ⚠️ **THE BACKFILL USING `report_tokens` DOES NOT MEAN MINTING PUBLISHES.** It does not, and the
-- surfaces must not imply it — a report can be tokenized and unlisted (the security exists on Hedera
-- regardless of our shopfront) and published and untokenized (the common case: 12 of the 19 have no
-- token, and x402 sells a read without one). This is a one-time historical inference about rows that
-- pre-date the column, not a rule.

ALTER TABLE reports ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

-- ⚠️ Partial: the marketplace asks for published rows newest-listed-first and nothing queries the
-- nulls by this column. `reports_analyst_created_idx` still serves the console's own listing.
CREATE INDEX IF NOT EXISTS reports_published_idx
  ON reports (published_at DESC) WHERE published_at IS NOT NULL;

-- ⚠️ **THE CUTOFF IS LOAD-BEARING, NOT DECORATION.** `scripts/ops/migrate.ts` runs every `.sql` file
-- on every invocation, so without a fixed upper bound this statement would fire again on the next
-- migration and silently publish any *future* report that happened to get tokenized — overriding an
-- author who deliberately left it unlisted. The literal is the newest `created_at` among the
-- nineteen rows that existed when this migration was written (measured: 2026-09-12 18:42:11.917558Z),
-- which makes the statement history rather than a standing rule.
UPDATE reports r
   SET published_at = r.created_at
 WHERE r.published_at IS NULL
   AND r.created_at <= TIMESTAMPTZ '2026-09-12 18:42:12+00'
   AND (
        EXISTS (SELECT 1 FROM report_tokens t WHERE t.report_hash = r.hash)
     OR EXISTS (SELECT 1 FROM purchases p
                 WHERE p.report_hash = r.hash AND p.settled_at IS NOT NULL)
     OR EXISTS (SELECT 1 FROM claims c
                 WHERE c.report_hash = r.hash AND c.chain_claim_id IS NOT NULL)
   );

COMMENT ON COLUMN reports.published_at IS
  'When the author listed this report in the marketplace. Outside the hash — a decision about a report, not part of one. NULL means unlisted: the report exists, its page and its paywall work, it is simply not on /. Set once by store/reports.ts publish(); there is deliberately no unpublish.';

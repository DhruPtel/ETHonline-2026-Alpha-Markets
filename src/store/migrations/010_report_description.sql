-- 010 — the description an author writes for a listing. Idempotent: ADD COLUMN IF NOT EXISTS.
--
-- Run with:  npx tsx --env-file=.env scripts/ops/migrate.ts
-- ⚠️ Through DATABASE_URL_DIRECT. The pooled endpoint is PgBouncer and cannot carry DDL reliably.
--
-- ⚠️ No existing migration is edited. Nine have run against the live database, and 002's header
-- gives the reason: a migration that has run is history, and rewriting it means a fresh database and
-- an existing one no longer agree with nothing recording which is which.
--
-- ── ⚠️ OUTSIDE THE HASH, FOR THE SAME REASON AS `title` (008) AND `published_at` (009) ──────────
--
-- The console's Description field was typed into and saved by nothing. A field on `Report` would
-- change the canonical bytes of every report and invalidate every hash already written — and **four
-- of those are committed in ATS creation events on Hedera**, where nothing can amend them. A column
-- on the row is invisible to `canonical()`, so `load()`'s two integrity checks are unaffected.
--
-- ⚠️ **A LABEL, NOT IDENTITY.** What an author says to sell a report is not what the report measured;
-- two listings of one report with different copy are still one report.
--
-- ── ⚠️ WRITTEN ONCE, AT PUBLISH ─────────────────────────────────────────────────────────────────
--
-- `recordDescription()` in `src/store/reports.ts` writes only while `published_at IS NULL`, and the
-- console's publish action calls it immediately before `publish()`. Publishing is one-way (009), so
-- the description a buyer first saw is the one that stays.
--
-- ⚠️ **NULL is the normal case for everything that exists today.** Nineteen reports, none described.
-- NULL means no description was written — a report published before this migration, or one listed
-- with the field empty — and every surface renders nothing for it rather than a placeholder.

ALTER TABLE reports ADD COLUMN IF NOT EXISTS description TEXT;

COMMENT ON COLUMN reports.description IS
  'The author''s listing description. Outside the hash — a label, not identity. Written once, at publish. NULL = none.';

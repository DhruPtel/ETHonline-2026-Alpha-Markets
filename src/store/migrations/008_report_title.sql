-- 008 — the title the narrator wrote for its own report. Idempotent: ADD COLUMN IF NOT EXISTS.
--
-- Run with:  npx tsx --env-file=.env scripts/ops/migrate.ts
-- ⚠️ Through DATABASE_URL_DIRECT. The pooled endpoint is PgBouncer and cannot carry DDL reliably.
--
-- ⚠️ No existing migration is edited. Seven have run against the live database, and 002's header
-- gives the reason: a migration that has run is history, and rewriting it means a fresh database and
-- an existing one no longer agree with nothing recording which is which.
--
-- ── ⚠️ WHY THIS IS A COLUMN AND NOT A FIELD ON `Report` ─────────────────────────────────────────
--
-- The heading on a report sheet was the raw directive, so a long prompt became a paragraph-length
-- heading. The agent should name its own report — but the name must not change what a report IS.
--
-- ⚠️ **OUTSIDE THE HASH, DELIBERATELY, FOR THE SAME REASON `context_digest` IS.** Adding a field to
-- `Report` changes the canonical bytes of every report and invalidates every hash already written —
-- and **four of those are committed in ATS creation events on Hedera**, where nothing can amend
-- them. A column on the row is invisible to `canonical()`, which serialises the report object and
-- never reads the row, so `load()`'s two integrity checks are unaffected.
--
-- ⚠️ **The title is a LABEL, not part of the report's identity.** Two runs of one directive at one
-- block are the same report and must hash the same; if the narrator named them differently that is
-- a difference in the label, not in what was measured. Putting the title inside the hash would make
-- the model's choice of words part of what a token commits to.
--
-- ⚠️ **NULL is the normal case for everything written before today.** Eleven reports exist and none
-- has a title. The panel derives a heading from the directive for those rather than rendering a
-- blank — see `app/console/page.tsx`. NULL means "written before the narrator named reports", and
-- nothing backfills it: a title invented now by different code would be a worse label than an
-- honest absence.

ALTER TABLE reports ADD COLUMN IF NOT EXISTS title TEXT;

COMMENT ON COLUMN reports.title IS
  'The narrator''s own short name for the report. Outside the hash — a label, not identity. NULL for reports written before 008.';

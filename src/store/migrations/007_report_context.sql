-- 007 — what history the planner saw. Idempotent: ADD COLUMN IF NOT EXISTS.
--
-- Run with:  npx tsx --env-file=.env scripts/ops/migrate.ts
-- ⚠️ Through DATABASE_URL_DIRECT. The pooled endpoint is PgBouncer and cannot carry DDL reliably.
--
-- ⚠️ 001_init.sql is NOT edited, for the reason 002's header gives: a migration that has run is
-- history, and rewriting it means a fresh database and an existing one no longer agree with nothing
-- recording which is which.
--
-- ── ⚠️ WHY THIS COLUMN EXISTS, AND WHY IT IS OUTSIDE THE HASH ───────────────────────────────────
--
-- Unit 15b gives `compose` a third argument: a block of the analyst's own settled record. So a
-- report's PLAN now depends on state outside the directive and the block it was read at — two runs
-- of one directive at one block can plan differently, because the analyst has learned something in
-- between. **That is the point of the unit, not a defect**, but it means a reader can no longer
-- reconstruct why a plan looked the way it did from the report alone.
--
-- This column is that missing fact: `sha256` of the exact context block that was supplied, so a
-- reader can tell what history the plan saw.
--
-- ⚠️ **OUTSIDE THE HASH, DELIBERATELY, AND IT CANNOT MOVE INSIDE LATER.** Putting it in `Report`
-- would change the canonical bytes of every report and invalidate every hash already written — and
-- **four of those are committed in ATS creation events on Hedera**, where nothing can amend them.
-- A column on the row is invisible to `canonical()`, which serialises the report object and never
-- reads the row, so `load()`'s two checks are unaffected. Proven rather than asserted, in
-- `scripts/demo/context.ts`.
--
-- ⚠️ **NULL is the normal case and means exactly one thing: no context block was supplied.** It does
-- NOT mean "supplied and empty" — an analyst with no settled claims gets no block at all, and the
-- digest of an absent block is an absent digest, never the hash of an empty string. Every report
-- written before this unit existed is legitimately null, and so is every report by an analyst that
-- has not yet had a market settle.
--
-- ⚠️ There is no index and no CHECK beyond the shape. Nothing queries by digest — it is read beside
-- a report a reader already has, which is what `reports_analyst_created_idx` already serves.

ALTER TABLE reports ADD COLUMN IF NOT EXISTS context_digest TEXT;

-- ⚠️ Applied separately from the column so a re-run against a database that already has the column
-- still installs the constraint. `NOT VALID` is deliberately NOT used: the column is null on every
-- existing row and null passes a CHECK, so there is nothing to validate against history.
DO $$
BEGIN
  ALTER TABLE reports ADD CONSTRAINT reports_context_digest_check
    CHECK (context_digest IS NULL OR context_digest ~ '^[0-9a-f]{64}$');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

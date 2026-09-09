-- 004 — a token's transfers become a history. Idempotent: IF NOT EXISTS + ON CONFLICT DO NOTHING.
--
-- Run with:  npx tsx --env-file=.env scripts/ops/migrate.ts
-- ⚠️ Through DATABASE_URL_DIRECT. The pooled endpoint is PgBouncer and cannot carry DDL reliably.
--
-- ── Why a table rather than a wider column ───────────────────────────────────────────────────────
--
-- `report_tokens.transfer_tx` is one column and a token can move more than once. Until now that was
-- not merely lossy, it was WRONG: `transfer.send()` wrote the column unconditionally, so a second
-- hop overwrote the first and the record claimed the token had moved once, to wherever it now was.
-- Three tokens sit with the buyer today and cannot come back without producing exactly that bug.
--
-- The alternatives, and why this one:
--
--   a jsonb array on report_tokens   one row per token stays true, but every append is a
--                                    read-modify-write on a column two other readers already use,
--                                    and a concurrent second transfer silently drops one of them
--   a wider column (transfer_tx_2…)  answers "twice" and not "n times"
--   ✅ a child table                  one row per hop, ordered, appended never rewritten, and a
--                                    unique tx hash makes a re-record a no-op rather than a duplicate
--
-- ⚠️ **`report_tokens.transfer_tx` is KEPT and still written**, and that is deliberate rather than
-- laziness. Two readers outside this migration's scope depend on it — `scripts/ops/move-token.ts`
-- and `app/api/console/state` — and its meaning does not change so much as narrow: it is now
-- *the most recent* transfer. Dropping it would break callers this change is not allowed to edit,
-- and `002` already records what this project thinks of rewriting history to tidy a column.

-- ── token_transfers — one row per hop ────────────────────────────────────────────────────────────
-- ⚠️ `seq` is the order, not `transferred_at`. Two hops in the same second are possible and a
-- timestamp would not separate them; a serial cannot tie. The clock is for reading, the seq is for
-- ordering.
--
-- ⚠️ `tx_hash` is UNIQUE, which is what makes re-running this migration — and re-recording a hop
-- after a retry — a no-op instead of a duplicate row. A transaction hash identifies one transfer on
-- one chain; two rows carrying it would be two claims about one event.
CREATE TABLE IF NOT EXISTS token_transfers (
  seq             BIGSERIAL   PRIMARY KEY,
  report_hash     TEXT        NOT NULL REFERENCES reports (hash),
  tx_hash         TEXT        NOT NULL UNIQUE,
  -- ⚠️ Nullable ONLY for the backfilled rows below. Every row this codebase writes from now on
  -- carries all three, because `send()` knows them and asserts the balances they describe.
  from_address    TEXT,
  to_address      TEXT,
  -- 'analyst' | 'buyer' — which configured account signed. Null on backfill; see the note there.
  signer          TEXT,
  transferred_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  note            TEXT
);

CREATE INDEX IF NOT EXISTS token_transfers_report_idx ON token_transfers (report_hash, seq);

-- ── Backfill: the three hashes that already exist are real and are not dropped ───────────────────
--
-- ⚠️ **The direction of these hops is deliberately left NULL rather than guessed.** It is *inferable*
-- — `transfer.prepare()` built its wallet from HEDERA_SELLER_KEY and refused any other signer until
-- 004 landed, so every recorded hop was analyst → somewhere — but the recipient was a caller's
-- argument and was never stored. Writing an inferred sender and a null recipient would make the row
-- look authoritative about a fact nobody recorded. The `note` says what the row is and what it is
-- missing; the hash, which is the part that is real, survives and is checkable on HashScan.
--
-- ⚠️ `transferred_at` takes `issued_at`, which is the token's mint time and NOT the transfer's.
-- It is a lower bound and the note says so. The alternative — now() — would date a 2026-09-08
-- transfer to whenever the migration happened to run, which is worse because it looks precise.
INSERT INTO token_transfers (report_hash, tx_hash, transferred_at, note)
SELECT
  report_hash,
  transfer_tx,
  issued_at,
  'backfilled by 004 from report_tokens.transfer_tx. Direction was never recorded: prepare() could ' ||
  'only sign as the analyst before 004, and the recipient was an argument. transferred_at is the ' ||
  'token''s issued_at — a lower bound, not the transfer time.'
FROM report_tokens
WHERE transfer_tx IS NOT NULL
ON CONFLICT (tx_hash) DO NOTHING;

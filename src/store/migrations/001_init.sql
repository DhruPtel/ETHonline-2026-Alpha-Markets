-- 001_init — the four tables Phase 3 needs. Idempotent: every statement is IF NOT EXISTS.
--
-- Run with:  npx tsx --env-file=.env scripts/ops/migrate.ts
-- ⚠️ Through DATABASE_URL_DIRECT. The pooled endpoint is PgBouncer and cannot carry DDL reliably.
--
-- ── Column-type decisions, none of them silent ──────────────────────────────────────────────────
--
-- TEXT for canonical JSON, never jsonb.  jsonb does not preserve what was written: it reorders
--   keys, normalises numbers and drops duplicate keys. The report hash is SHA-256 over the RFC 8785
--   canonical BYTES, so a jsonb round trip would silently change the identity of every report
--   stored. Unit 5's proof is that a Report survives save/load with its hash intact, and this
--   column type is what makes that possible to pass rather than a thing to work around.
--
-- TEXT for hashes and addresses, not CHAR(n) or BYTEA.  They are compared and rendered as lowercase
--   hex strings everywhere in this codebase; storing bytes would mean encoding at every boundary and
--   a CHAR(64) pads on read. Length is asserted by CHECK where it is fixed and known.
--
-- BIGINT for prices in tinybars.  ⚠️ Atomic units, exact integer, and money never touches a float —
--   the standing rule this project has held since `ops.ts`. One HBAR is 10^8 tinybars, so BIGINT's
--   ~9.2×10^18 ceiling is ~92 billion HBAR: far past anything a report costs. NUMERIC would also be
--   exact but invites a decimal point into a column whose whole point is that it has none.
--
-- BIGINT for block numbers.  Ethereum is ~26M today and INTEGER's 2.1B ceiling would last centuries,
--   but a block number is an identifier we do arithmetic on and the cost of BIGINT is 4 bytes.
--
-- TIMESTAMPTZ for every time column, never TIMESTAMP.  ⚠️ `observed_at` comes from
--   `eth_getBlockByNumber` and is a real instant on a public chain; a naive TIMESTAMP would record
--   it in whatever zone the writing process believed in, and two servers would disagree about when
--   a report was read. TIMESTAMPTZ stores UTC and is unambiguous. `expires_at` sits inside Hedera's
--   ~120-second validity window, where a one-hour zone error is not a rounding difference.
--
-- No ON DELETE CASCADE anywhere.  A report is the thing everything else refers to and deleting one
--   out from under a sold token or a settled purchase is not a cleanup, it is losing the record of
--   something that happened on a chain. The FKs restrict by default and that is the intent.

-- ── reports — the thing that is sold ──────────────────────────────────────────────────────────────
-- ⚠️ The hash IS the primary key. A report has no other identity: `domain/canonical.ts` produces the
-- 32 bytes that go into the ATS creation event and into Arc's commitPrediction, and re-running the
-- pipeline cannot reproduce them because narration is inside the hash and the model call is not
-- deterministic. Once a report exists it is stored and never regenerated.
CREATE TABLE IF NOT EXISTS reports (
  hash            TEXT        PRIMARY KEY CHECK (hash ~ '^[0-9a-f]{64}$'),
  analyst         TEXT        NOT NULL,
  directive       TEXT        NOT NULL,
  -- RFC 8785 canonical JSON, byte-for-byte as hashed. See the TEXT note above.
  canonical_json  TEXT        NOT NULL,
  -- The rendered markdown a buyer receives. A view of the object, not the report.
  rendered_md     TEXT        NOT NULL,
  block           BIGINT      NOT NULL,
  observed_at     TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reports_analyst_created_idx ON reports (analyst, created_at DESC);

-- ── report_tokens — one ATS asset per report ─────────────────────────────────────────────────────
-- ⚠️ `report_hash` is UNIQUE, not just a foreign key. `maxSupply: 1` stops a second issue against one
-- proxy; nothing on-chain stops a second PROXY being deployed for the same report, so this column is
-- what enforces one-report-one-token. SM-07 named that gap and this is where it closes.
CREATE TABLE IF NOT EXISTS report_tokens (
  report_hash     TEXT        PRIMARY KEY REFERENCES reports (hash),
  proxy_address   TEXT        NOT NULL UNIQUE CHECK (proxy_address ~ '^0x[0-9a-fA-F]{40}$'),
  isin            TEXT        NOT NULL,
  -- The four transactions SM-07 established as the lifecycle, each recorded the moment it lands so a
  -- half-finished run cannot be retried into a second asset.
  deploy_tx       TEXT        NOT NULL,
  grant_role_tx   TEXT        NOT NULL,
  issue_tx        TEXT        NOT NULL,
  transfer_tx     TEXT,       -- null until the lifecycle transfer happens; it is a separate step
  issued_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── quotes — what is being sold, frozen before the 402 ───────────────────────────────────────────
-- ⚠️ `tier` and `recipient` are nullable and nothing populates them. The Own tier is cut for this
-- phase (DECISIONS.md, 2026-09-08) so there is no recipient to bind and no inventory to reserve.
-- Kept rather than dropped: re-adding a column is cheaper than re-deriving why it was there.
CREATE TABLE IF NOT EXISTS quotes (
  id              TEXT        PRIMARY KEY,
  report_hash     TEXT        NOT NULL REFERENCES reports (hash),
  tier            TEXT        CHECK (tier IN ('read', 'own')),
  -- ⚠️ Tinybars. Atomic units, exact integer, never a float. Positive by construction.
  price_tinybars  BIGINT      NOT NULL CHECK (price_tinybars > 0),
  recipient       TEXT,
  -- ⚠️ Inside Hedera's ~120s transaction validity window, so the zone must be unambiguous.
  expires_at      TIMESTAMPTZ NOT NULL,
  state           TEXT        NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'settled', 'expired')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS quotes_report_state_idx ON quotes (report_hash, state);

-- ── purchases — what was actually paid for, and whether it arrived ───────────────────────────────
-- ⚠️ `payment_id` is the PRIMARY KEY and that is the idempotency mechanism. `@x402/extensions`'
-- payment-identifier lets a client retry with the same id; a repeated request must return the cached
-- body rather than settle twice, and Hedera has no refund primitive to undo the second one.
--
-- ⚠️ `native_tx_id` is NOT NULL and is written BEFORE settle is called (§5.8). Every Hedera settle
-- failure returns `{success: false, transaction: ""}` — including a timeout AFTER the transaction was
-- broadcast — so the id recovered from the signed bytes is the only thing left to reconcile against.
-- A row with a native_tx_id and a null settled_at is exactly the ambiguous case recover.ts resolves.
CREATE TABLE IF NOT EXISTS purchases (
  payment_id      TEXT        PRIMARY KEY,
  report_hash     TEXT        NOT NULL REFERENCES reports (hash),
  payer           TEXT        NOT NULL,
  native_tx_id    TEXT        NOT NULL,
  settled_at      TIMESTAMPTZ,   -- null = broadcast but not confirmed; ask Mirror Node, never assume failed
  delivered_at    TIMESTAMPTZ,   -- null = paid but the response was lost; this is the §5.9 retry case
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS purchases_report_idx ON purchases (report_hash);
CREATE INDEX IF NOT EXISTS purchases_unsettled_idx ON purchases (created_at) WHERE settled_at IS NULL;

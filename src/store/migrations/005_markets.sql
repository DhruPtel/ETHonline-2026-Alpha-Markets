-- 005_markets — the seven tables Phase 4 needs. Idempotent: every statement is IF NOT EXISTS.
--
-- Run with:  npx tsx --env-file=.env scripts/ops/migrate.ts
-- ⚠️ Through DATABASE_URL_DIRECT. The pooled endpoint is PgBouncer and cannot carry DDL reliably.
--
-- ⚠️ SEAM NAMED AND ACCEPTED: seven tables is more than one thing. They go together because they
-- share foreign keys and the runner has no version table — only idempotent DDL — so a half-applied
-- set is worse than a large one. There is no `005a`/`005b` that leaves the database consistent
-- between them.
--
-- ── Where this disagrees with 001, and why that is not a contradiction ──────────────────────────
--
-- NUMERIC(78,0) for every amount, never BIGINT.  ⚠️ 001's rule was BIGINT for atomic money and that
--   reasoning was sound *about tinybars*: one HBAR is 10^8 tinybars, so BIGINT's ~9.22×10^18 ceiling
--   is ~92 billion HBAR. On Arc the same reasoning gives the opposite answer, because USDC is the
--   NATIVE token and `msg.value` arrives at 18 decimals (SM-08, measured). BIGINT overflows at
--   ~9.22 USDC. 78 digits covers `uint256` — 2^256-1 is 78 digits — so every amount the contract can
--   hold fits. Scale 0 keeps what BIGINT was chosen for: exact integers, no decimal point, and money
--   that never touches a float. ⚠️ The driver returns NUMERIC as a JavaScript *string* for the same
--   reason it returns BIGINT as one, and `markets.ts` keeps it that way.
--
-- ⚠️ TEXT is NOT viable for these, which is why this is a column type and not a convention. The
--   spend ledger's cap is a `SUM`, and summing text means casting on every read — a cast that is
--   either wrong or is NUMERIC arriving through the back door.
--
-- TEXT for canonical JSON, never jsonb.  001's first rule, and it binds harder here. `evidenceHash`
--   is SHA-256 over canonical BYTES and goes onto the chain irreversibly; jsonb reorders keys,
--   normalises numbers and drops duplicates, so a jsonb round trip would silently change the hash a
--   settlement is defended by. Applies to `spec_json`, `settlement_evidence.raw` and
--   `binding_evidence.raw` alike.
--
-- TIMESTAMPTZ everywhere, never TIMESTAMP.  001's rule unchanged. ⚠️ `close_time`,
--   `observation_end` and `resolve_deadline` are `uint64` UNIX seconds on chain; TIMESTAMPTZ stores
--   them as unambiguous instants and round-trips whole seconds exactly. The plan's whole calendar is
--   UTC and a naive column would record it in whatever zone the writing process believed in.
--
-- No ON DELETE CASCADE anywhere.  001's rule unchanged. A market with stakes against it is a record
--   of money that moved on a public chain; deleting one is not a cleanup.
--
-- ── Landmark timestamps, never a mutable state enum ─────────────────────────────────────────────
--
-- ⚠️ `quotes.state` is the cautionary tale and it is in this same database. It was specified,
-- CHECK-constrained and indexed — and it has no writer, so every row reads 'open' forever and
-- `quotes_report_state_idx` covers a constant column. A state enum has to be *maintained*: it is
-- one value that must be moved, by someone, at the right moment, and when that write is missed the
-- row lies without looking wrong.
--
-- `purchases`' nullable landmarks are the shape that worked. `committed_at`, `resolved_at`,
-- `voided_at`, `landed_at` — a null means exactly what it looks like, and the column cannot silently
-- not-be-written because writing it *is* the event being recorded. ⚠️ Both crons' find-work queries
-- are `WHERE … IS NULL`, so this is not a style preference: it is what makes reconciliation-based
-- scheduling (Units 10 and 11) expressible at all.
--
-- ⚠️ The CHECK-constrained columns below — `rail`, `asset`, `kind` — are NOT state. They are written
-- once, at insert, describing what a row already is. `quotes.state`'s failure was a value that had
-- to change later and never did.

-- ── markets — one question, and where it lives on chain ──────────────────────────────────────────
--
-- ⚠️ The row exists BEFORE `createMarket` is called, which is why `chain_market_id` is nullable.
-- `report_tokens.transfer_tx` is the precedent: a column that is null until the chain says otherwise.
-- The cron cannot be idempotent without this — a reconciliation-based run has to be able to ask "did
-- I already start this?", and a row that only appears after the call cannot answer.
--
-- ⚠️ `create_idempotency_key` lives here for the same reason. Unit 4 requires the key from its
-- caller and refuses to invent one, because it has to survive a cold start and come back in on the
-- retry. This column is where it survives.
--
-- ⚠️ `contract_address` is on the row, not in config. R17: a deployment republished after market
-- creation is a void condition, and `marketId` is only meaningful against the contract that issued
-- it. A market created against a previous deployment must stay readable as such.
CREATE TABLE IF NOT EXISTS markets (
  id                    TEXT        PRIMARY KEY,
  -- The question. `spec_hash` is over the canonical bytes in `spec_json` — see the TEXT note above.
  spec_hash             TEXT        NOT NULL CHECK (spec_hash ~ '^[0-9a-f]{64}$'),
  spec_json             TEXT        NOT NULL,
  observed_day          TEXT        NOT NULL CHECK (observed_day ~ '^\d{4}-\d{2}-\d{2}$'),
  -- §5.2's QuestionCore times. ⚠️ Ordering is enforced by `spec.ts::questionCore` and by the
  -- contract; it is NOT re-derived here, because a CHECK that disagrees with either would refuse a
  -- market the chain already accepted.
  close_time            TIMESTAMPTZ NOT NULL,
  observation_end       TIMESTAMPTZ NOT NULL,
  resolve_deadline      TIMESTAMPTZ NOT NULL,
  -- ⚠️ How a human points the analyst at a market. The commit cron's find-work query is this column
  -- LEFT JOINed against `claims`. Null means nobody asked the analyst for a prediction, which is the
  -- correct state for a market created by anyone else.
  directed_at           TEXT,
  contract_address      TEXT        CHECK (contract_address ~ '^0x[0-9a-fA-F]{40}$'),
  -- Null until `createMarket` lands. uint256, so NUMERIC(78,0) — see the header.
  chain_market_id       NUMERIC(78,0),
  question_id           TEXT        CHECK (question_id ~ '^[0-9a-f]{64}$'),
  create_tx             TEXT,
  create_circle_tx_id   TEXT,
  create_idempotency_key TEXT,
  -- ── The landmarks. Null means it has not happened. ──
  landed_at             TIMESTAMPTZ,
  resolved_at           TIMESTAMPTZ,
  voided_at             TIMESTAMPTZ,
  -- The settled answer. Null while `resolved_at` is null; meaningless if `voided_at` is set.
  outcome               BOOLEAN,
  evidence_hash         TEXT        CHECK (evidence_hash ~ '^[0-9a-f]{64}$'),
  resolve_tx            TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The commit cron's find-work half. Partial, because a market nobody directed is never its work.
CREATE INDEX IF NOT EXISTS markets_directed_idx
  ON markets (directed_at, created_at) WHERE directed_at IS NOT NULL;

-- ⚠️ The resolve cron's find-work query, as an index. Past `observation_end`, neither resolved nor
-- voided — which is exactly the predicate, so the index is the query rather than a guess at it.
CREATE INDEX IF NOT EXISTS markets_unresolved_idx
  ON markets (observation_end) WHERE resolved_at IS NULL AND voided_at IS NULL;

-- ── claims — a prediction, staked ────────────────────────────────────────────────────────────────
--
-- ⚠️ `chain_claim_id` is nullable for the same reason `chain_market_id` is, and it matters more:
-- `claimId` is a return value, and a return value is not readable from a receipt. The contract emits
-- `PredictionCommitted` precisely because Circle's API returns no logs at all, so the id arrives by
-- reading the event afterwards — strictly after this row exists.
--
-- ⚠️ UNIQUE (market_id, author) mirrors the contract's one-claim-per-author rule. It is a BACKSTOP,
-- not the mechanism — like 003's ISIN index, it fires after the gas is spent. Unit 7's preflight is
-- what prevents the spend; this is what stops two rows disagreeing about one author's position.
--
-- ⚠️ `report_hash` REFERENCES reports because Unit 6c binds a claim to a report that this project
-- actually wrote. A claim citing a report we do not hold is exactly what the admission check refuses.
CREATE TABLE IF NOT EXISTS claims (
  id                TEXT        PRIMARY KEY,
  market_id         TEXT        NOT NULL REFERENCES markets (id),
  chain_claim_id    NUMERIC(78,0),
  author            TEXT        NOT NULL CHECK (author ~ '^0x[0-9a-fA-F]{40}$'),
  report_hash       TEXT        NOT NULL REFERENCES reports (hash),
  -- true = the proposition holds. Derived from the report, never chosen by a staker (§5.2).
  side              BOOLEAN     NOT NULL,
  -- ⚠️ 18-dp native, and a whole number of 6-dp USDC units. `AlphaMarket.sol:93` sets
  -- `UNIT_SCALE = 1e12` and `_checkAmount` reverts `NotAUsdcUnit` on a remainder, so a row that
  -- could not have been the amount sent is refused here rather than stored as a record of it.
  amount            NUMERIC(78,0) NOT NULL CHECK (amount > 0 AND amount % 1000000000000 = 0),
  commit_tx         TEXT,
  commit_circle_tx_id TEXT,
  commit_idempotency_key TEXT,
  -- The landmark. Null = the row exists and the commit has not landed.
  committed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (market_id, author)
);

CREATE INDEX IF NOT EXISTS claims_market_idx ON claims (market_id, created_at);
-- The commit cron asks "which of my directed markets have I not claimed yet". Partial: a claim that
-- has not landed is still a claim in progress and must not be started twice.
CREATE INDEX IF NOT EXISTS claims_uncommitted_idx ON claims (created_at) WHERE committed_at IS NULL;

-- ── stakes — one row per stake transaction ───────────────────────────────────────────────────────
--
-- ⚠️ 004's lesson, verbatim rather than re-derived. `seq` is the order and `staked_at` is not: two
-- stakes in the same second are possible and a timestamp cannot separate them, while a serial cannot
-- tie. `tx_hash` is UNIQUE, which is what makes re-recording a stake after a retry a no-op instead of
-- a second claim on the pool — the same property that made 004 a child table rather than a column.
--
-- ⚠️ `side` is recorded even though it is derivable from the claim. It is what the chain *said* in
-- the `Staked` event, and a stored copy is how a later disagreement between our claim row and the
-- event is visible at all rather than resolved silently in favour of whichever we read second.
CREATE TABLE IF NOT EXISTS stakes (
  seq           BIGSERIAL   PRIMARY KEY,
  market_id     TEXT        NOT NULL REFERENCES markets (id),
  claim_id      TEXT        NOT NULL REFERENCES claims (id),
  staker        TEXT        NOT NULL CHECK (staker ~ '^0x[0-9a-fA-F]{40}$'),
  side          BOOLEAN     NOT NULL,
  amount        NUMERIC(78,0) NOT NULL CHECK (amount > 0 AND amount % 1000000000000 = 0),
  tx_hash       TEXT        NOT NULL UNIQUE,
  block         BIGINT,
  staked_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stakes_claim_idx ON stakes (claim_id, seq);
CREATE INDEX IF NOT EXISTS stakes_market_idx ON stakes (market_id, seq);

-- ── scores — §5.12's three, keyed (market_id, claim_id) ──────────────────────────────────────────
--
-- ⚠️ Keyed on the CLAIM, explicitly not on the report. Two authors can cite one report, so
-- `(market_id, report_hash)` would collide two different people's positions into one score. The key
-- is what makes Unit 15 idempotent, which matters because the cron that fills it has no retry.
--
-- ⚠️ `reconciliation_quality` is READ, not derived. It is `Report.verdict`, already computed and
-- stored by Phase 2; copying it here records what the verdict was at scoring time rather than
-- re-deriving a number that could since have changed.
CREATE TABLE IF NOT EXISTS scores (
  market_id               TEXT    NOT NULL REFERENCES markets (id),
  claim_id                TEXT    NOT NULL REFERENCES claims (id),
  reconciliation_quality  TEXT,
  -- The claim's side against the resolved outcome. Null while the market is unresolved.
  forecast_correct        BOOLEAN,
  -- What the position actually cost and what came back. ⚠️ Both atomic 18-dp; the net is a
  -- subtraction the reader does, not a third column that can disagree with the two it came from.
  staked                  NUMERIC(78,0),
  returned                NUMERIC(78,0),
  scored_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (market_id, claim_id)
);

-- ── settlement_evidence — what the resolver saw, kept before it is committed to ──────────────────
--
-- ⚠️ THE IRREVERSIBLE SEAM. `resolve` puts `evidenceHash` on chain and it cannot be amended, so the
-- bytes behind that hash are written HERE FIRST. A hash on a public chain with nothing behind it is
-- a claim nobody — including us — can check.
--
-- ⚠️ `raw` is TEXT and never jsonb, and this is the row where that rule earns its keep. §5.18's
-- record+raw tier exists because a hash proves integrity and NOT content: it cannot answer a dispute
-- about what the number was once the subgraph has pruned. jsonb would reorder the keys the hash was
-- taken over, so the stored bytes would no longer produce the stored hash.
--
-- ⚠️ `observed_value` is a decimal STRING. The same rule `spec.ts` holds for thresholds: a float
-- ties two figures that differ in their 20th significant digit, and this is the number an outcome
-- turns on.
CREATE TABLE IF NOT EXISTS settlement_evidence (
  market_id        TEXT        PRIMARY KEY REFERENCES markets (id),
  evidence_hash    TEXT        NOT NULL CHECK (evidence_hash ~ '^[0-9a-f]{64}$'),
  raw              TEXT        NOT NULL,
  observed_value   TEXT,
  -- What the outcome would be, recorded before `resolve` is called with it.
  outcome          BOOLEAN,
  block            BIGINT,
  -- `_meta.block.timestamp` — §5.16's freshness is this instant, never a block number.
  meta_block_time  TIMESTAMPTZ,
  recorded_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── binding_evidence — Unit 6c's, what the admission check saw ───────────────────────────────────
--
-- ⚠️ The check runs BEFORE a commit and this is its record. Without it the product's central
-- sentence is not true: "the analyst stakes on a market with that token identifying the work" needs
-- the token to actually identify the work, and the contract accepts `reportHash` as a parameter
-- without knowing what it means.
--
-- ⚠️ Bound to ISSUANCE, never to current holding — `proxy_address`, `deploy_tx` and `issuer_address`
-- are facts about the token being minted for this report and do not change when it is sold. A check
-- against who holds it now would fail the moment the token is transferred, which is the thing the
-- token exists to do.
CREATE TABLE IF NOT EXISTS binding_evidence (
  claim_id        TEXT        PRIMARY KEY REFERENCES claims (id),
  report_hash     TEXT        NOT NULL REFERENCES reports (hash),
  proxy_address   TEXT        NOT NULL CHECK (proxy_address ~ '^0x[0-9a-fA-F]{40}$'),
  deploy_tx       TEXT        NOT NULL,
  issuer_address  TEXT        NOT NULL,
  -- The Arc transaction the admission check cleared. Null until the commit lands.
  arc_tx          TEXT,
  -- Canonical bytes of everything above as it was read. TEXT, never jsonb — same rule, same reason.
  raw             TEXT        NOT NULL,
  checked_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── spend_ledger — what the analyst's wallet has parted with ─────────────────────────────────────
--
-- ⚠️ GAS IS NOT A SEPARATE BUDGET ON ARC. USDC is the native token, so a `resolve` spends the
-- analyst's balance while staking nothing, and so does a transaction that reverts. A ledger that
-- counted only stakes would report a wallet as untouched while it drained — which is the failure
-- mode a cap exists to prevent.
--
-- ⚠️ Keyed on actor, rail, asset and amount, so the cap is a `SUM` over a window. This is the
-- column type's whole justification: TEXT would mean casting on every read.
--
-- ⚠️ SUMMING ACROSS RAILS OR ASSETS IS MEANINGLESS and there is deliberately no `decimals` column
-- saying so. Arc USDC is 18-dp and Hedera HBAR is 8-dp tinybars; a scale stored per row would be a
-- second source of truth about a number's units, which is the exact bug this project keeps finding.
-- The scale is a fact about `(rail, asset)` and lives in code beside the conversion site.
--
-- ⚠️ `rail`, `asset` and `kind` are CHECK-constrained and that does NOT make them `quotes.state`.
-- They are written once at insert and describe what the row already is. `quotes.state` failed
-- because it was a value that had to be moved later and never was.
CREATE TABLE IF NOT EXISTS spend_ledger (
  seq           BIGSERIAL   PRIMARY KEY,
  -- The address that paid. Not an analyst id: the wallet is what a cap is enforced against.
  actor         TEXT        NOT NULL,
  rail          TEXT        NOT NULL CHECK (rail IN ('arc', 'hedera')),
  asset         TEXT        NOT NULL CHECK (asset IN ('USDC', 'HBAR')),
  -- 'stake' includes the analyst's own commit. 'gas' is what a reverted duplicate still costs.
  kind          TEXT        NOT NULL CHECK (kind IN ('stake', 'gas')),
  amount        NUMERIC(78,0) NOT NULL CHECK (amount >= 0),
  -- Attribution, both nullable: a gas spend on a failed create belongs to no claim yet.
  market_id     TEXT        REFERENCES markets (id),
  claim_id      TEXT        REFERENCES claims (id),
  tx_hash       TEXT,
  circle_tx_id  TEXT,
  note          TEXT,
  spent_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ⚠️ UNIQUE on (tx_hash, kind), not on tx_hash alone. One Arc transaction spends a stake AND its
-- gas, so it is legitimately two rows; two rows of the SAME kind for one hash would be one spend
-- counted twice. Partial, because a spend whose hash is not known yet has nothing to collide on.
CREATE UNIQUE INDEX IF NOT EXISTS spend_ledger_tx_kind_key
  ON spend_ledger (tx_hash, kind) WHERE tx_hash IS NOT NULL;

-- The cap's query: one actor, one rail, one asset, over a window.
CREATE INDEX IF NOT EXISTS spend_ledger_actor_idx ON spend_ledger (actor, rail, asset, spent_at);

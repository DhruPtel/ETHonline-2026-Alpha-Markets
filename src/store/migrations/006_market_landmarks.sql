-- 006 — the void's evidence, and somewhere for a payout to land. Idempotent: ADD COLUMN IF NOT
-- EXISTS and CREATE TABLE IF NOT EXISTS.
--
-- Run with:  npx tsx --env-file=.env scripts/ops/migrate.ts
-- ⚠️ Through DATABASE_URL_DIRECT. The pooled endpoint is PgBouncer and cannot carry DDL reliably.
--
-- ⚠️ 005_markets.sql is NOT edited. It has run against the live database, and 002's header says why
-- that settles it: a migration that has run is history, and rewriting it means a fresh database and
-- an existing one no longer agree with nothing recording which is which. 005 created the tables and
-- 006 completes them, and the pair is the honest record of what was learned when.
--
-- Both of these were reported by Unit 5 as things the schema could not express. They are fixed now
-- rather than later because Unit 6 drives void and claim by hand, and a path exercised without
-- anywhere to record it is a path whose evidence exists only in a terminal buffer.
--
-- ── ⚠️ THE THIRD GAP IS NOT FIXED, AND THIS IS THE ASSUMPTION IT LEAVES STANDING ────────────────
--
-- `scores` is keyed `(market_id, claim_id)` per §5.12, while the contract pays out per ADDRESS:
-- `claimed[marketId][msg.sender]` guards one claim per address per market, and
-- `payoutOf(marketId, account)` returns `staked[marketId][true][account] + staked[marketId][false][account]`
-- — one number covering that address's whole position, including its committed prediction, because
-- `commitPrediction` and `stake` both run through the same `_add`.
--
-- ⚠️ **So `scores.returned` is fillable only while an address holds exactly one position in a
-- market.** That holds for Phase 4: the analyst commits and does not also stake. If it ever stakes
-- alongside its own claim, its single payout does not decompose and `scores.returned` has no honest
-- value to take.
--
-- ⚠️ **Enforcing it here was considered and rejected.** A constraint stopping an author from also
-- staking would be the schema policing something the contract permits — the database refusing a
-- transaction the chain would accept, which makes the record disagree with the ledger it describes.
-- Recorded as an assumption instead. `payouts` below is where the real, aggregate number lives, and
-- it is the source `scores.returned` should be derived from rather than a second measurement of it.

-- ── 1 · markets: who voided it, and which transaction ────────────────────────────────────────────
--
-- ⚠️ `voidMarket` is PERMISSIONLESS after `resolveDeadline` — anyone may call it — so unlike
-- `resolve`, whose caller is the immutable resolver and therefore already known, the caller here is
-- a fact that has to be recorded to be knowable. `voided_at` said that it happened; these say who
-- did it and what to check.
--
-- ⚠️ **This is the one settlement path that does not depend on the cron working**, which makes it
-- MORE likely to be exercised than resolve, not less: it is what a market falls back to when a run
-- is silently not delivered. A fallback whose evidence is not recorded is a fallback nobody can
-- audit afterwards.
--
-- ⚠️ No UNIQUE on `void_tx`, and that is not an oversight. It sits on `markets`, one row per market,
-- and the contract reverts `AlreadySettled` on a second void — so re-recording is an UPDATE of the
-- same row, which is idempotent by construction. `stakes.tx_hash` needs UNIQUE because a re-record
-- there would INSERT a second row; there is no second row to insert here.
ALTER TABLE markets ADD COLUMN IF NOT EXISTS void_tx   TEXT;
ALTER TABLE markets ADD COLUMN IF NOT EXISTS voided_by TEXT CHECK (voided_by ~ '^0x[0-9a-fA-F]{40}$');

-- ── 2 · payouts — one row per claim() call ───────────────────────────────────────────────────────
--
-- ⚠️ **A TABLE RATHER THAN COLUMNS ON `stakes`, and the contract is what decides that.** A payout is
-- per `(market, address)`: `claim(marketId, recipient)` pays `payoutOf(marketId, msg.sender)`, which
-- aggregates every position that address holds in that market. An address that staked three times
-- has three `stakes` rows and receives ONE transfer.
--
-- Putting the payout on `stakes` would mean one of two wrong things:
--
--   the aggregate on each of the three rows   `SUM(stakes.payout)` is then three times the money
--                                             that actually moved — a false number in the one place
--                                             an accounting query would look
--   the aggregate split pro-rata              inventing an apportionment the chain never made, and
--                                             storing it as though it were observed
--
-- ⚠️ It is also what makes the UNIQUE work rather than backfire. `stakes.claim_tx` could NOT take a
-- UNIQUE — three legitimate rows share one claim transaction and the constraint would reject two of
-- them. Here one transaction is exactly one row, so `tx_hash UNIQUE` means what it says: a
-- re-recorded claim is a no-op instead of a second row, which is `stakes.tx_hash`'s property
-- arriving at the grain where it is actually true.
--
-- ⚠️ The primary key IS the contract's key. `claimed[marketId][msg.sender]` is a bool per
-- `(market, address)`; `PRIMARY KEY (market_id, account)` is the same statement in a database, so a
-- double-claim cannot be recorded even if one were somehow attempted.
--
-- ⚠️ **`amount` deliberately carries NO `% 1e12` check**, unlike `claims.amount` and `stakes.amount`.
-- A stake must be a whole 6-dp USDC unit because `_checkAmount` reverts otherwise. A payout is
-- `mine + (mine * losingPool) / winningPool` — integer division on a ratio — and is under no such
-- constraint. Copying the check here would reject legitimate payouts.
CREATE TABLE IF NOT EXISTS payouts (
  market_id   TEXT          NOT NULL REFERENCES markets (id),
  -- `msg.sender` of `claim()`: the position holder, and who the payout is computed for.
  account     TEXT          NOT NULL CHECK (account ~ '^0x[0-9a-fA-F]{40}$'),
  -- ⚠️ `claim(marketId, recipient)` — the money may be directed elsewhere, and who received it is a
  -- different fact from whose position it was. Null until the claim lands.
  recipient   TEXT          CHECK (recipient ~ '^0x[0-9a-fA-F]{40}$'),
  -- 18-dp native, atomic, exact. NUMERIC(78,0) because 18-dp USDC overflows BIGINT at ~9.22 USDC.
  amount      NUMERIC(78,0) NOT NULL CHECK (amount >= 0),
  -- ⚠️ UNIQUE, and meaningfully so — see the note above. Null until the claim lands; Postgres allows
  -- many nulls in a unique column, so rows written ahead of their transaction do not collide.
  tx_hash     TEXT          UNIQUE,
  -- The landmark. Null = the payout is computed and has not been collected.
  claimed_at  TIMESTAMPTZ,
  recorded_at TIMESTAMPTZ   NOT NULL DEFAULT now(),
  PRIMARY KEY (market_id, account)
);

-- One account's record across every market — Unit 15's record surface, and the analyst's own row.
-- ⚠️ The primary key already serves `WHERE market_id = …`; this is the other direction.
CREATE INDEX IF NOT EXISTS payouts_account_idx ON payouts (account, claimed_at);

-- report_tokens.isin becomes UNIQUE.
--
-- The ISIN is a pure function of report_hash (Unit 7: base-36 of the hash mod 36^9, then the ISO
-- 6166 check digit), and report_hash is already the PRIMARY KEY. So two rows sharing an ISIN cannot
-- mean a duplicate report — it can only mean a genuine base-36 collision, which the Unit 7
-- arithmetic puts at ~4.9e-9 for a thousand reports and does not put at zero.
--
-- ⚠️ This is a BACKSTOP, not the mechanism. Unit 8 deploys the proxy and then records the row, so a
-- constraint violation would fire AFTER the gas is spent. `ats.ts`'s prepare() is what actually
-- prevents the spend, by selecting on report_hash and isin before any transaction. This exists for
-- the case prepare() cannot cover: two runs racing, where both preflights pass before either
-- inserts. Then the second insert fails and one asset is orphaned on-chain — which is bad, and is
-- strictly better than two rows disagreeing about which proxy holds a report's token.
--
-- Idempotent like every other statement in this directory: the runner re-applies all of them and
-- IF NOT EXISTS makes a second run a no-op.

CREATE UNIQUE INDEX IF NOT EXISTS report_tokens_isin_key ON report_tokens (isin);

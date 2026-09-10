// The row shapes of Phase 4's eight tables, and the plain reads over them. What `tokens.ts` is for
// `report_tokens`.
//
// ⚠️ **The two reconciliation queries are NOT here — they are in `outstanding.ts`.** This file had
// grown to 215 lines against a ~120 guideline, and the seam was named twice before it was taken:
// every read here is a SELECT and a mapper, while those two carry real logic (a LEFT JOIN, a
// three-predicate window) and answer a different kind of question. `MarketRow` and `toMarket` are
// exported for that module and for no other reason — they are the seam, not a public API.
//
// ⚠️ **This module is READ-ONLY, and that is a decision rather than an unfinished state.** Every
// write in this phase is a chain call with a row on either side of it — Unit 7 inserts a market
// before `createMarket` and updates it after, Unit 8 stores evidence before `resolve` commits to its
// hash irreversibly. A writer here would be a second place that could put a row in the database
// without the transaction it describes, which is the ordering those units exist to get right.
// `tokenize/ats.ts` writes `report_tokens` in the same call that deploys the proxy for the same
// reason, and `tokens.ts` beside it stayed read-only.
//
// ⚠️ **The shared client from `db.ts`, never a memoized one of this module's own.** Three modules
// each kept their own until 2026-09-08, so a request touching all three opened three connections
// against a Neon pool that caps them — and a connection-limit failure presents as a *timeout*, not
// as a limit error. `db()` keeps the lazy, never-at-module-scope property that mattered before.
//
// ⚠️ **Amounts stay strings, all the way out of this file.** The driver returns NUMERIC as a
// JavaScript string for the same reason it returns BIGINT as one — the value can exceed
// `Number.MAX_SAFE_INTEGER`, and an 18-dp USDC amount does so at about 9.22 USDC. `reports.ts`
// coerces `block` at exactly one place and calls it display-only; there is no equivalent here,
// because every number in these tables is money and money is never a float in this project.
// Callers that need arithmetic use `BigInt(...)`.

import { closePool, db } from './db.js';

// For scripts, which have to exit. A route handler should never call this. ⚠️ Idempotent.
export { closePool as close };

/**
 * One market. ⚠️ `chainMarketId` is null until `createMarket` lands, and the landmarks are null
 * until the thing they name happens — a null means exactly that and nothing else.
 */
export interface Market {
  readonly id: string;
  readonly specHash: string;
  readonly specJson: string;
  readonly observedDay: string;
  readonly closeTime: Date;
  readonly observationEnd: Date;
  readonly resolveDeadline: Date;
  readonly directedAt: string | null;
  readonly contractAddress: string | null;
  /** uint256 as a decimal string. Null until it lands. */
  readonly chainMarketId: string | null;
  readonly landedAt: Date | null;
  readonly resolvedAt: Date | null;
  readonly voidedAt: Date | null;
  readonly outcome: boolean | null;
  readonly evidenceHash: string | null;
  /** ⚠️ `voidMarket` is permissionless, so unlike `resolve` the caller is not knowable in advance. */
  readonly voidedBy: string | null;
  readonly voidTx: string | null;
  readonly createdAt: Date;
}

export interface MarketRow {
  id: string; spec_hash: string; spec_json: string; observed_day: string;
  close_time: Date; observation_end: Date; resolve_deadline: Date;
  directed_at: string | null; contract_address: string | null; chain_market_id: string | null;
  landed_at: Date | null; resolved_at: Date | null; voided_at: Date | null;
  outcome: boolean | null; evidence_hash: string | null;
  voided_by: string | null; void_tx: string | null; created_at: Date;
}

export const toMarket = (r: MarketRow): Market => ({
  id: r.id,
  specHash: r.spec_hash,
  specJson: r.spec_json,
  observedDay: r.observed_day,
  closeTime: r.close_time,
  observationEnd: r.observation_end,
  resolveDeadline: r.resolve_deadline,
  directedAt: r.directed_at,
  contractAddress: r.contract_address,
  chainMarketId: r.chain_market_id,
  landedAt: r.landed_at,
  resolvedAt: r.resolved_at,
  voidedAt: r.voided_at,
  outcome: r.outcome,
  evidenceHash: r.evidence_hash,
  voidedBy: r.voided_by,
  voidTx: r.void_tx,
  createdAt: r.created_at,
});

/** One market by our id, or `null`. */
export async function marketById(id: string): Promise<Market | null> {
  const [row] = await db()<MarketRow[]>`
    SELECT id, spec_hash, spec_json, observed_day, close_time, observation_end, resolve_deadline,
           directed_at, contract_address, chain_market_id, landed_at, resolved_at, voided_at,
           outcome, evidence_hash, voided_by, void_tx, created_at
    FROM markets WHERE id = ${id}`;
  return row ? toMarket(row) : null;
}

/** A prediction on a market. ⚠️ `amount` is 18-dp atomic, as a string. */
export interface Claim {
  readonly id: string;
  readonly marketId: string;
  readonly chainClaimId: string | null;
  readonly author: string;
  readonly reportHash: string;
  readonly side: boolean;
  readonly amount: string;
  readonly commitTx: string | null;
  readonly committedAt: Date | null;
  readonly createdAt: Date;
}

interface ClaimRow {
  id: string; market_id: string; chain_claim_id: string | null; author: string;
  report_hash: string; side: boolean; amount: string; commit_tx: string | null;
  committed_at: Date | null; created_at: Date;
}

const toClaim = (r: ClaimRow): Claim => ({
  id: r.id,
  marketId: r.market_id,
  chainClaimId: r.chain_claim_id,
  author: r.author,
  reportHash: r.report_hash,
  side: r.side,
  amount: r.amount,
  commitTx: r.commit_tx,
  committedAt: r.committed_at,
  createdAt: r.created_at,
});

/** Every claim on a market, oldest first. Usually one — the analyst's. */
export async function claimsFor(marketId: string): Promise<Claim[]> {
  const rows = await db()<ClaimRow[]>`
    SELECT id, market_id, chain_claim_id, author, report_hash, side, amount, commit_tx,
           committed_at, created_at
    FROM claims WHERE market_id = ${marketId} ORDER BY created_at`;
  return rows.map(toClaim);
}

/** One stake transaction. ⚠️ `seq` is the order; `stakedAt` is for reading, not for sorting. */
export interface Stake {
  readonly seq: string;
  readonly claimId: string;
  readonly staker: string;
  readonly side: boolean;
  readonly amount: string;
  readonly txHash: string;
  readonly stakedAt: Date;
}

interface StakeRow {
  seq: string; claim_id: string; staker: string; side: boolean;
  amount: string; tx_hash: string; staked_at: Date;
}

/** Every stake behind one claim, in the order the chain produced them. */
export async function stakesFor(claimId: string): Promise<Stake[]> {
  const rows = await db()<StakeRow[]>`
    SELECT seq, claim_id, staker, side, amount, tx_hash, staked_at
    FROM stakes WHERE claim_id = ${claimId} ORDER BY seq`;
  return rows.map((r) => ({
    seq: r.seq,
    claimId: r.claim_id,
    staker: r.staker,
    side: r.side,
    amount: r.amount,
    txHash: r.tx_hash,
    stakedAt: r.staked_at,
  }));
}

/**
 * What the resolver saw, by market. ⚠️ `raw` is the canonical bytes `evidenceHash` was taken over —
 * returned as the string it was stored as, because re-serialising it would change the hash.
 */
export interface SettlementEvidence {
  readonly marketId: string;
  readonly evidenceHash: string;
  readonly raw: string;
  readonly observedValue: string | null;
  readonly outcome: boolean | null;
  readonly recordedAt: Date;
}

export async function settlementEvidenceFor(marketId: string): Promise<SettlementEvidence | null> {
  const [row] = await db()<{
    market_id: string; evidence_hash: string; raw: string;
    observed_value: string | null; outcome: boolean | null; recorded_at: Date;
  }[]>`
    SELECT market_id, evidence_hash, raw, observed_value, outcome, recorded_at
    FROM settlement_evidence WHERE market_id = ${marketId}`;
  return row
    ? {
        marketId: row.market_id,
        evidenceHash: row.evidence_hash,
        raw: row.raw,
        observedValue: row.observed_value,
        outcome: row.outcome,
        recordedAt: row.recorded_at,
      }
    : null;
}

/**
 * Total spent by one wallet on one rail in one asset since `since`, as an atomic decimal string.
 *
 * ⚠️ **This is the only reason the amount columns are NUMERIC rather than TEXT.** A cap is a SUM,
 * and summing text means a cast on every read — a cast that is either wrong or is NUMERIC arriving
 * through the back door.
 *
 * ⚠️ **`COALESCE` because SUM over no rows is NULL, not zero**, and a spend guard that reads null as
 * "no limit reached" is a guard that does nothing on the first run of the day. Returned as a string
 * for the same reason every other amount is: 18-dp USDC passes `Number.MAX_SAFE_INTEGER` at about
 * 9.22 USDC.
 *
 * ⚠️ **Gas counts.** On Arc USDC is the native token, so a resolve spends while staking nothing —
 * and so does a transaction that reverts. `kind` is not filtered here on purpose.
 */
export async function spentSince(
  actor: string,
  rail: 'arc' | 'hedera',
  asset: 'USDC' | 'HBAR',
  since: Date,
): Promise<string> {
  const [row] = await db()<{ total: string }[]>`
    SELECT COALESCE(SUM(amount), 0)::text AS total
    FROM spend_ledger
    WHERE actor = ${actor} AND rail = ${rail} AND asset = ${asset} AND spent_at >= ${since}`;
  return row?.total ?? '0';
}

/**
 * What one address was paid for its whole position in one market.
 *
 * ⚠️ **Per `(market, account)`, not per stake, because that is the grain the contract pays at.**
 * `claim(marketId, recipient)` transfers `payoutOf(marketId, msg.sender)`, which sums
 * `staked[marketId][true][account]` and `staked[marketId][false][account]` — every stake that
 * address made in the market, plus its committed prediction if it made one, since `commitPrediction`
 * and `stake` both run through the same `_add`. An address with three stakes has three `stakes` rows
 * and exactly one row here.
 */
export interface Payout {
  readonly marketId: string;
  /** `msg.sender` of `claim()` — whose position this was. */
  readonly account: string;
  /** Where the money was sent. ⚠️ A different fact from `account`. Null until the claim lands. */
  readonly recipient: string | null;
  /** 18-dp atomic, as a string. ⚠️ Not a whole USDC unit — a payout is a ratio, see the migration. */
  readonly amount: string;
  readonly txHash: string | null;
  /** The landmark. Null = computed and not yet collected. */
  readonly claimedAt: Date | null;
}

interface PayoutRow {
  market_id: string; account: string; recipient: string | null;
  amount: string; tx_hash: string | null; claimed_at: Date | null;
}

const toPayout = (r: PayoutRow): Payout => ({
  marketId: r.market_id,
  account: r.account,
  recipient: r.recipient,
  amount: r.amount,
  txHash: r.tx_hash,
  claimedAt: r.claimed_at,
});

/** Every payout on a market, largest first. Uncollected ones have a null `claimedAt`. */
export async function payoutsFor(marketId: string): Promise<Payout[]> {
  const rows = await db()<PayoutRow[]>`
    SELECT market_id, account, recipient, amount, tx_hash, claimed_at
    FROM payouts WHERE market_id = ${marketId} ORDER BY amount DESC`;
  return rows.map(toPayout);
}

/**
 * One address's payout in one market, or `null`.
 *
 * ⚠️ **A non-null row is not the same as a collected payout** — `claimedAt` is what says the money
 * moved. The row can exist with `claimedAt` null, meaning `payoutOf` returned a figure and nobody has
 * called `claim()` yet, which is the normal state between resolution and collection.
 */
export async function payoutFor(marketId: string, account: string): Promise<Payout | null> {
  const [row] = await db()<PayoutRow[]>`
    SELECT market_id, account, recipient, amount, tx_hash, claimed_at
    FROM payouts WHERE market_id = ${marketId} AND account = ${account}`;
  return row ? toPayout(row) : null;
}

// The outcome onto the chain. ⚠️ **This is the file that spends on a settlement.**
//
// ⚠️ **SEPARATE FROM UNIT 8 ON PURPOSE: ONE DECIDES, ONE SPENDS.** `settle.ts` reads the day and
// writes the evidence and has no path to a chain — asserted structurally by its own proof. This file
// has no opinion about what the answer is. It takes the row Unit 8 wrote and puts 32 bytes of it
// somewhere nobody can amend.
//
// ⚠️ **`evidenceHash` COMES OFF THE STORED ROW AND IS NEVER RECOMPUTED HERE.** The bytes were
// written before the chain call precisely so the hash commits to something that exists. Re-deriving
// it at this point — from a fresh read, from the record in memory, from anything — would make the
// on-chain hash a claim about bytes nobody kept, which is the one failure `settle.ts`'s header calls
// worse than no evidence at all. What this file does instead is **re-check that the stored bytes
// still produce the stored hash**, and refuse if they do not.
//
// ── ⚠️ Every guard here exists because a revert costs USDC ────────────────────────────────────────
//
// Gas on Arc is USDC, so `resolve` reverting is money gone for nothing. The contract's four guards
// are `NotResolver → AlreadySettled → TooEarlyToResolve → NoEvidence`, and `prepare()` reaches each
// of them off-chain first. ⚠️ **The ordering below is not arbitrary**: a refusal that fires one
// guard above the one being tested looks exactly like a passing test, and that has broken four
// negative tests this phase.
//
// ⚠️ **`now` is the CHAIN's latest block timestamp, not `Date.now()`.** The contract compares
// `block.timestamp`; a local clock running even slightly ahead would pass our check and revert on
// theirs, which is the exact class of mistake these guards exist to stop paying for.
//
// ── ⚠️ What this unit could NOT do, said rather than reached around ───────────────────────────────
//
// **R17's republished-deployment void is NOT implemented, because nothing stores what it compares
// against.** R17 voids a market whose subgraph deployment was republished after creation. The
// settlement evidence carries `deployment`; the `markets` row does not, `spec_json` does not (a spec
// names a `slug`, never a deployment id), and `specHash` therefore does not pin one either. There is
// no honest comparison to make from stored state, and inventing one — against the cited report's
// provenance, say, which was read at a different time for a different purpose — would be a void
// trigger nobody could defend. ⚠️ It needs a column, which is a migration, which this unit was told
// not to write.
//
// **The idempotency key is derived and NOT stored, because there is no column for it.** `markets`
// carries `create_idempotency_key` and nothing else; 006 added `void_tx` and `voided_by` and no key.
// That is survivable here and would not have been in Unit 7: the key is `sha256` over the call bytes,
// so a retry recomputes the identical value from the same inputs with nothing to remember. The row
// was only ever the audit trail of what was used, never the thing that decided it.
//
// ⚠️ **`landed()` is duplicated from `market.ts` deliberately.** It is private there, and this unit
// may not modify that file to export it. Eleven lines of receipt-waiting is a better cost than
// reaching into another unit's module.

import { createHash } from 'node:crypto';
import { ethers } from 'ethers';
import { ALPHA_MARKET_ABI } from './abi.js';
import { analystIdentity, arcProvider, submit } from './arc.js';
import { verifyStoredEvidence } from './settle.js';
import { marketById, settlementEvidenceFor } from '../store/markets.js';
import { db } from '../store/db.js';

/** ⚠️ Refusals from `prepare()`. Nothing here has spent when one is thrown. */
export class ResolveRefused extends Error {
  constructor(why: string) { super(why); this.name = 'ResolveRefused'; }
}

/**
 * What the chain is about to be told, and by which call.
 *
 * ⚠️ **`reconcile` is not a third outcome — it is the crash-recovery case.** A run that submits and
 * dies before its `UPDATE` leaves the chain settled and our row still saying otherwise, and the
 * resolve cron's find-work query is `WHERE resolved_at IS NULL`, so that row would be retried every
 * day forever. Reconciling writes the landmark from what the chain already says and spends nothing.
 */
export interface ResolvePlan {
  readonly action: 'resolve' | 'void' | 'reconcile';
  readonly marketId: string;
  readonly chainMarketId: string;
  /** ⚠️ The contract that ISSUED this id, off the row — never the one the env currently names. */
  readonly contractAddress: string;
  /** The answer going on chain. Null on a void: `voidMarket` carries no outcome. */
  readonly outcome: boolean | null;
  /** ⚠️ Off the stored row. Null on a void. */
  readonly evidenceHash: string | null;
  /** The figure the outcome turned on, for the operator to read before spending. Null on a void. */
  readonly observedValue: string | null;
  /** Why this action and not the other one. */
  readonly reason: string;
}

const iface = new ethers.Interface(ALPHA_MARKET_ABI);

/** ⚠️ Derived from the call bytes. A stored random key pins the request BODY and replays a cached
 *  failure forever after a bug fix — the trap that cost Unit 7 two runs. */
function idempotencyKeyFor(scope: string, body: string): string {
  const h = createHash('sha256').update(`${scope}\n${body}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** ⚠️ `submit()` returns at SENT, so the transaction is NOT mined when the hash arrives. */
async function landed(txHash: string, event: string, label: string): Promise<ethers.LogDescription> {
  const receipt = await arcProvider().waitForTransaction(txHash, 1, 120_000);
  if (!receipt) throw new Error(`${label}: no receipt for ${txHash} within 120s — it may still be in flight.`);
  if (receipt.status !== 1) throw new Error(`${label}: ${txHash} reverted on chain (status 0).`);
  const found = receipt.logs
    .map((log) => { try { return iface.parseLog(log); } catch { return null; } })
    .find((parsed) => parsed?.name === event);
  if (!found) throw new Error(`${label}: no ${event} event in ${txHash}. The call landed and emitted nothing.`);
  return found;
}

/**
 * Every check that can stop a settlement. ⚠️ **Touches no chain state and spends nothing** — two
 * `eth_call`s and a `getBlock`, all free.
 */
export async function prepare(marketId: string): Promise<ResolvePlan> {
  const market = await marketById(marketId);
  if (!market) throw new ResolveRefused(`no market ${marketId} in the store.`);

  // 1 · Our own landmarks. The cron's find-work query excludes these, so reaching this means
  //     somebody asked for this market by name.
  if (market.resolvedAt || market.voidedAt) {
    throw new ResolveRefused(
      `market ${marketId} is already settled in the store — ` +
      `${market.resolvedAt ? `resolved at ${market.resolvedAt.toISOString()}` : `voided at ${market.voidedAt!.toISOString()}`}. ` +
      'There is nothing to put on chain.',
    );
  }

  // 2 · A market that never landed has no id to name in a call.
  if (!market.chainMarketId) {
    throw new ResolveRefused(
      `market ${marketId} has no chain_market_id: createMarket never landed for it, so there is no ` +
      'market on chain to settle. Unit 7 owns getting it there.',
    );
  }

  // 3 · ⚠️ The contract off the ROW. A `marketId` is only meaningful against the deployment that
  //     issued it, and resolving id 4 on a republished contract would settle a different question.
  if (!market.contractAddress) {
    throw new ResolveRefused(
      `market ${marketId} records no contract_address, so which deployment its chain id belongs to ` +
      'is unknown. Refusing rather than assuming the one in the environment.',
    );
  }

  // 4 · Unit 8's row. ⚠️ Its absence is not an error state — it means settlement has not run.
  const evidence = await settlementEvidenceFor(marketId);
  if (!evidence) {
    throw new ResolveRefused(
      `no settlement_evidence row for market ${marketId}. The read has not happened, so there is no ` +
      'outcome and no hash. Unit 8 runs first — this file never reads the day itself.',
    );
  }

  // 5 · ⚠️ The bytes must still produce the hash. This is the last moment it can be checked: after
  //     the submit the hash is on chain and cannot be amended.
  const check = verifyStoredEvidence(evidence.raw, evidence.evidenceHash);
  if (!check.evidenceMatches || !check.responseMatches) {
    throw new ResolveRefused(
      `the stored evidence for ${marketId} no longer hashes to ${evidence.evidenceHash} ` +
      `(record ${check.evidenceMatches ? 'ok' : 'MISMATCH'}, response ${check.responseMatches ? 'ok' : 'MISMATCH'}). ` +
      'Putting that hash on chain would commit to bytes that changed. Refusing.',
    );
  }

  // 6 · The contract's `NoEvidence`, reached before it costs gas.
  if (/^0+$/.test(evidence.evidenceHash)) {
    throw new ResolveRefused(`the stored evidence hash for ${marketId} is all zeroes, which the contract refuses as NoEvidence.`);
  }

  const contract = new ethers.Contract(market.contractAddress, ALPHA_MARKET_ABI, arcProvider());
  const onChain = await contract.markets!(BigInt(market.chainMarketId));
  const base = { marketId, chainMarketId: market.chainMarketId, contractAddress: market.contractAddress } as const;

  // 7 · ⚠️ The chain already settled and our row does not know. Crash recovery, not a refusal — and
  //     what gets recorded is what the CHAIN says, because that is what landed.
  if (onChain.resolved === true || onChain.voided === true) {
    return {
      ...base, action: 'reconcile',
      outcome: onChain.resolved === true ? Boolean(onChain.outcome) : null,
      evidenceHash: onChain.resolved === true ? (onChain.evidenceHash as string).slice(2) : null,
      observedValue: evidence.observedValue,
      reason:
        `chain market ${market.chainMarketId} is already ${onChain.voided === true ? 'voided' : 'resolved'} ` +
        'and the store has no landmark for it. Recording what the chain says; nothing to submit.',
    };
  }

  // ⚠️ The chain's clock, not ours. The contract compares `block.timestamp`.
  const block = await arcProvider().getBlock('latest');
  if (!block) throw new Error('could not read the latest Arc block to check the chain clock.');
  const now = block.timestamp;

  // 8 · ⚠️ A null outcome on the evidence row is a MISSING_OBSERVATION — a fact about the data, and
  //     the only thing that ever votes for a void.
  if (evidence.outcome === null) {
    const deadline = Math.floor(market.resolveDeadline.getTime() / 1000);
    if (now < deadline) {
      throw new ResolveRefused(
        `market ${marketId} has no observation for ${market.observedDay} and its resolveDeadline ` +
        `(${market.resolveDeadline.toISOString()}) has not passed — chain clock is ` +
        `${new Date(now * 1000).toISOString()}. A missing snapshot is retried until the deadline, ` +
        'never voided early: the indexer may still catch up.',
      );
    }
    return {
      ...base, action: 'void', outcome: null, evidenceHash: null, observedValue: null,
      reason:
        `no snapshot for ${market.observedDay} and the resolveDeadline passed at ` +
        `${market.resolveDeadline.toISOString()}. Voiding returns every stake.`,
    };
  }

  // 9 · ⚠️ The contract's `TooEarlyToResolve`, off our row. **Currently unreachable and kept
  //     anyway**: `settle()` throws `SettlementTooEarly` for a day that has not finished plus the
  //     freshness margin, so an evidence row with an outcome implies the day is over. It survives
  //     because it would only ever fire on state that disagrees with itself, and a revert costs USDC.
  const observationEnd = Math.floor(market.observationEnd.getTime() / 1000);
  if (now < observationEnd) {
    throw new ResolveRefused(
      `market ${marketId} carries an outcome but its observationEnd ` +
      `(${market.observationEnd.toISOString()}) is still ahead of the chain clock ` +
      `(${new Date(now * 1000).toISOString()}). The contract would revert TooEarlyToResolve. ` +
      'Evidence and row disagree about which day this is — refusing rather than paying to find out.',
    );
  }

  // 10 · ⚠️ The contract's `NotResolver`, and it is immutable with no setter. If this ever fails the
  //      answer is a new contract, not a config change.
  const identity = await analystIdentity();
  const resolver = await contract.resolver!() as string;
  if (resolver.toLowerCase() !== identity.address.toLowerCase()) {
    throw new ResolveRefused(
      `${market.contractAddress} names ${resolver} as its immutable resolver and this analyst is ` +
      `${identity.address}. Only the resolver may call resolve; the contract would revert NotResolver.`,
    );
  }

  return {
    ...base, action: 'resolve', outcome: evidence.outcome, evidenceHash: evidence.evidenceHash,
    observedValue: evidence.observedValue,
    reason:
      `${market.observedDay} settled ${evidence.outcome ? 'TRUE' : 'FALSE'} on an observed ` +
      `${evidence.observedValue}, evidenced by ${evidence.evidenceHash}.`,
  };
}

/** Write what landed. ⚠️ **This unit owns these columns** — `store/markets.ts` is read-only. */
async function recordResolved(marketId: string, outcome: boolean, evidenceHash: string, tx: string | null): Promise<void> {
  await db()`
    UPDATE markets SET resolved_at = now(), outcome = ${outcome},
      evidence_hash = ${evidenceHash}, resolve_tx = ${tx}
    WHERE id = ${marketId}`;
}

/** ⚠️ `by` is NULL when we did not watch it happen. The `Market` struct records no voider — only
 *  the `Voided` event does — so a reconcile has no honest answer and writes none rather than
 *  guessing at the wallet this process happens to hold. */
async function recordVoided(marketId: string, by: string | null, tx: string | null): Promise<void> {
  await db()`
    UPDATE markets SET voided_at = now(), voided_by = ${by}, void_tx = ${tx}
    WHERE id = ${marketId}`;
}

/**
 * Put the outcome on chain. ⚠️ **Spends.**
 *
 * ⚠️ `resolve(uint256,bool,bytes32)` is all scalars, so Circle encodes it server-side through
 * `abiParameters`. `callData` exists for tuples and `createMarket`'s `QuestionCore` is the only one
 * in this contract — using it here would be encoding by hand for no reason.
 */
export async function resolveMarket(plan: ResolvePlan): Promise<{ txHash: string | null; alreadyLanded: boolean }> {
  if (plan.action === 'reconcile') {
    if (plan.outcome === null || plan.evidenceHash === null) {
      await recordVoided(plan.marketId, null, null);
    } else {
      await recordResolved(plan.marketId, plan.outcome, plan.evidenceHash, null);
    }
    return { txHash: null, alreadyLanded: true };
  }
  if (plan.action !== 'resolve') throw new Error(`resolveMarket called with a ${plan.action} plan.`);

  const call = {
    abiFunctionSignature: 'resolve(uint256,bool,bytes32)',
    abiParameters: [plan.chainMarketId, plan.outcome!, `0x${plan.evidenceHash!}`],
  } as const;
  const sent = await submit({
    contractAddress: plan.contractAddress, ...call, abiParameters: [...call.abiParameters],
    idempotencyKey: idempotencyKeyFor(plan.marketId, JSON.stringify(call)),
  });

  // ⚠️ Nothing is recorded as landed until the receipt says it did.
  await landed(sent.txHash, 'Resolved', 'resolve');
  await recordResolved(plan.marketId, plan.outcome!, plan.evidenceHash!, sent.txHash);
  return { txHash: sent.txHash, alreadyLanded: false };
}

/**
 * Void it. ⚠️ **Spends.**
 *
 * ⚠️ **`voidMarket` is permissionless after `resolveDeadline`, so this is the one settlement path
 * that does not depend on the cron working.** We call it as the analyst because that is the wallet
 * this process holds; anybody could. `voided_by` records who actually did.
 */
export async function voidMarket(plan: ResolvePlan): Promise<{ txHash: string; alreadyLanded: boolean }> {
  if (plan.action !== 'void') throw new Error(`voidMarket called with a ${plan.action} plan.`);

  const call = { abiFunctionSignature: 'voidMarket(uint256)', abiParameters: [plan.chainMarketId] } as const;
  const sent = await submit({
    contractAddress: plan.contractAddress, ...call, abiParameters: [...call.abiParameters],
    idempotencyKey: idempotencyKeyFor(plan.marketId, JSON.stringify(call)),
  });

  const event = await landed(sent.txHash, 'Voided', 'voidMarket');
  await recordVoided(plan.marketId, (event.args[1] as string), sent.txHash);
  return { txHash: sent.txHash, alreadyLanded: false };
}

// Creating a market and committing the analyst's own money to a side of it.
//
// ⚠️ **`tokenize/ats.ts`'s prepare/spend split, and it matters more here.** On Hedera a reverted
// deploy cost HBAR; on Arc gas IS USDC, so a reverted call spends the same asset the analyst is
// staking. Everything that can refuse runs in `prepare()`, which touches nothing and costs nothing.
// `create()` and `commit()` are the only functions that can spend.
//
// ⚠️ **Two chain writes, so a run can die between them** — the same shape as `ats.tokenize()`'s
// deploy → grantRole → issue. The market row records which landed, both idempotency keys live on
// their rows so they survive a cold start and come back in on retry, and **nothing retries blindly**:
// a row that already carries a `chain_market_id` is returned rather than re-created.
//
// ⚠️ **The plan is serializable, and that is a real difference from Hedera.** `ats.prepare()` returns
// an `ethers.Wallet`, so a `TokenPlan` cannot cross HTTP and the console has to prepare twice. A
// Circle signer is an API call with no local object, so a `MarketPlan` is data all the way down and
// survives a request boundary intact. ⚠️ It does NOT survive time: `binding` records what the
// admission check saw at `checkedAt`, so a plan left sitting should be re-prepared rather than
// submitted.

import { createHash } from 'node:crypto';
import { ethers } from 'ethers';
import { ALPHA_MARKET_ABI } from './abi.js';
import { type BindingEvidence, checkBinding, recordArcTransaction, recordBinding } from './admission.js';
import { analystIdentity, arcProvider, submit, usdcFromNative } from './arc.js';
import { type MarketSpec, type QuestionCore, holds, metricFromFactId, questionCore, specHash, validateSpec } from './spec.js';
import { analystByArcAddress, type AnalystConfig } from '../config/analysts.js';
import { hashCanonical } from '../domain/canonical.js';
import { load } from '../store/reports.js';
import { db } from '../store/db.js';
import { requiredEnv } from '../config/env.js';
import { type Report } from '../types/report.js';

/** ⚠️ Refusals from `prepare()`. Distinct from `BindingRefused`, which 6c throws for its own. */
export class MarketRefused extends Error {
  constructor(why: string) { super(why); this.name = 'MarketRefused'; }
}

/**
 * ⚠️ **Headroom over the stake, and the number is measured rather than guessed.** Unit 6 ran
 * identical `commitPrediction` calls at **0.0043–0.0058 USDC through Circle** (`feeLevel: MEDIUM`)
 * against **0.00375 through ethers** — Circle is a real premium and every cron write uses that rail.
 * This budget covers a create, a commit and a later claim at the higher figure with room over.
 *
 * ⚠️ Not a reason to change rails. The analyst signs through Circle by design (A3), and the premium
 * is the price of that.
 */
const GAS_HEADROOM = ethers.parseUnits('0.05', 18);

// ─── How the analyst picks a side ────────────────────────────────────────────────────────────────
//
// ⚠️ **NOTHING IN THE PLAN EVER SPECIFIED THIS, AND THIS FILE OWNS IT.** A1 is about decision logic
// tied to real signals, so it cannot be arbitrary and it cannot be a coin flip.
//
// **The rule: the report's own headline figure, compared against the market's threshold.** The
// report says what the number is today; the market asks where it will be at the end of the observed
// day; the analyst predicts that its own measurement still holds. `holds()` is the same function
// settlement uses, so the analyst is judged by exactly the comparison it predicted with.
//
// ⚠️ **Deterministic, and no second model call — taken deliberately.** A 60-second Vercel function
// cannot afford another round trip to a model, and a deterministic rule is **auditable in a way a
// model call is not**: anyone holding the report and the spec can recompute the side and get the
// same answer, forever. The report is the justification and the assessment is the words; the side is
// arithmetic over the figure the report already published.
//
// ⚠️ **The honest cost:** the analyst cannot predict a REVERSAL. A report saying "TVL is 25.1B" can
// only ever commit to "still above 25B", never to "about to fall through it". That is a real
// limitation of the rule and not a bug in it — and it is why the threshold is chosen when the market
// is created, which is where the judgement actually lives.

/** Why the analyst took the side it took. Recorded so a reader can recompute it. */
export interface SideDecision {
  readonly side: boolean;
  readonly headline: string;
  readonly observed: string;
  readonly reason: string;
}

export function decideSide(report: Report, spec: MarketSpec): SideDecision {
  // ⚠️ **The fact the MARKET asks about, not the report's headline — and that correction came from
  // the data.** The first draft required `subject.headline` to be the market subject. Every one of
  // the nine reports in the store has the headline `metric.totalDepositBalanceUSD`: the `metric.`
  // sentinel `compose.ts` mints when a report is about a metric ACROSS deployments and none leads.
  // `metricFromFactId` refuses that by design, so the rule would have refused **every report we
  // have** — a side rule that never fires.
  //
  // The market names a deployment and a metric. The report's answer to that exact question is
  // `facts['{slug}.{metric}']`, and those are present and measured — `aave-v3-ethereum.
  // totalDepositBalanceUSD` and `.totalBorrowBalanceUSD` both carry values in every report.
  //
  // ⚠️ **Stated plainly because it is a real weakening:** the figure the analyst stakes on may not be
  // the figure its report LEADS with. It is still a figure that report measured, corroborated and
  // published — the fact table is the only place a digit exists in a report — but "the report is the
  // justification" is now "the report measured this", not "the report is about this".
  const factId = `${spec.slug}.${spec.metric}`;

  // ⚠️ Still routed through `metricFromFactId`, which round-trips the id through `figureRef` and
  // refuses a per-market figure or the `metric.` sentinel. Building the string ourselves and
  // trusting it would skip the one check that knows what is settleable.
  metricFromFactId(factId);

  const fact = report.facts[factId];
  if (!fact) {
    throw new MarketRefused(
      `report ${report.subject.headline.split('.')[0] === 'metric' ? '(metric-across-deployments)' : ''} ` +
      `has no fact ${factId}. It never measured the figure this market asks about, so it cannot ` +
      'justify a side on it.',
    );
  }
  // ⚠️ A withheld figure is a real state (§5.13), not a missing one — and it is a refusal here
  // because a side taken without a number is a guess wearing a justification.
  if (fact.value === null) {
    throw new MarketRefused(
      `fact ${fact.id} is WITHHELD (${fact.withheld?.code ?? 'no code'}: ` +
      `${fact.withheld?.rationale ?? 'no rationale'}), so the report publishes no figure to ` +
      'compare against the threshold.',
    );
  }

  const side = holds(spec, fact.value);
  const isHeadline = report.subject.headline === factId;
  return {
    side,
    headline: fact.id,
    observed: fact.value,
    reason:
      `the report measured ${fact.id} at ${fact.value} (block ${fact.block}, corroboration ` +
      `${fact.corroboration})${isHeadline ? ', which is its headline figure' : ', which is a measured figure but not its headline'}; ` +
      `the market asks whether it is ${spec.comparison} ${spec.threshold} on ${spec.observedDay}. ` +
      `${side ? 'It already is, so the analyst predicts it still will be.' : 'It is not, so the analyst predicts it will not be.'}`,
  };
}

// ─── prepare ─────────────────────────────────────────────────────────────────────────────────────

/** Everything `create` and `commit` need, and nothing that cannot cross a request boundary. */
export interface MarketPlan {
  readonly marketId: string;
  readonly claimId: string;
  readonly contractAddress: string;
  readonly reportHash: string;
  readonly spec: MarketSpec;
  readonly core: QuestionCore;
  readonly decision: SideDecision;
  /** 18-dp native. A whole number of 6-dp USDC units, or the contract reverts `NotAUsdcUnit`. */
  readonly amount: string;
  readonly analyst: AnalystConfig;
  readonly binding: BindingEvidence;
  /** ⚠️ `null` on a metric-across-deployments report. Surfaced, never assumed to exist. */
  readonly verdict: string | null;
}

const idFor = (prefix: string, parts: unknown): string => `${prefix}/${hashCanonical(parts).slice(0, 24)}`;

/**
 * ⚠️ **The idempotency key is DERIVED FROM THE CALL, and that is a correction paid for in a stuck
 * transaction.** Unit 7's first attempt stored a `randomUUID()` on the row and reused it. When the
 * call shape changed — `abiParameters` to `callData`, because Circle cannot pack a struct — the
 * retry sent the new body under the **old key**, and Circle returned the *cached outcome of the
 * original request*: the same transaction id, the same `ABI_SIGNATURE_PARAMS_MISMATCH`, created
 * minutes earlier. **The new body was never looked at.**
 *
 * ⚠️ **So a stored key pins the request body, not just the row.** A cron that stored a key before a
 * bug fix would replay the old failure forever and never send the fixed call — a permanently wedged
 * job whose logs say only that Circle failed. Deriving the key from the call makes a genuine retry
 * reuse the key (identical body ⇒ identical key ⇒ no second spend, which is the whole point) and a
 * *changed* call get a fresh one automatically.
 *
 * ⚠️ **Shaped as a v4 UUID on purpose.** Unit 4's brief said not to derive a key "until someone has
 * checked whether Circle validates the UUID shape". Nobody has, and this sidesteps the question
 * rather than answering it: the value is a hash, and it is a well-formed UUID either way.
 */
function idempotencyKeyFor(scope: string, body: string): string {
  const h = createHash('sha256').update(`${scope}\n${body}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/**
 * Every read-only check that can stop the run. ⚠️ **Touches no chain state and spends nothing.**
 *
 * ⚠️ **Ids are derived, not random**, so a retry after a crash lands on the same rows rather than
 * creating a second market for one question. The market id is the question and the contract; the
 * claim id is the market and the author, which mirrors the contract's one-claim-per-author rule.
 */
export async function prepare(input: {
  readonly reportHash: string;
  readonly spec: Omit<MarketSpec, 'schema'>;
  readonly closeTime: number;
  readonly resolveDeadline: number;
  /** 18-dp native, as a decimal string. ⚠️ No default — nobody commits a default stake size. */
  readonly amount: string;
}): Promise<MarketPlan> {
  const contractAddress = requiredEnv('ARC_MARKET_ADDRESS', 'Deployed by Unit 6.');

  // 1 · the report loads and passes its own hash check (`load` throws if it does not).
  const report = await load(input.reportHash);
  if (!report) throw new MarketRefused(`no report ${input.reportHash} in the store.`);

  // 2 · the spec validates — legal metric, live deployment, decimal threshold, real date.
  const spec = validateSpec(input.spec);
  // 3 · the times are legal: staking closes before the observed day, deadline two days after it.
  const core = questionCore(spec, { closeTime: input.closeTime, resolveDeadline: input.resolveDeadline });

  // 4 · the analyst row resolves AND matches the Circle wallet (Unit 4's guard throws on mismatch).
  const identity = await analystIdentity();
  const analyst = analystByArcAddress(identity.address);
  if (report.analyst.toLowerCase() !== analyst.arcAddress.toLowerCase()) {
    throw new MarketRefused(
      `report ${input.reportHash} is attributed to ${report.analyst} but this wallet is ` +
      `${analyst.arcAddress}. The analyst would be staking on somebody else's report.`,
    );
  }

  // 5 · the side, from the report's own figure. Throws rather than guessing.
  const decision = decideSide(report, spec);

  // 6 · the amount is a legal stake before the contract is asked to say so.
  const amount = BigInt(input.amount);
  usdcFromNative(amount);   // ⚠️ throws unless it is a whole 6-dp USDC unit — the contract's rule
  if (amount <= 0n) throw new MarketRefused('amount must be positive.');

  const marketId = idFor('m', { specHash: specHash(spec), core, contractAddress });
  const claimId = idFor('c', { marketId, author: analyst.arcAddress });

  // 7 · not already committed. ⚠️ Checked against the row, which exists before the chain call.
  const [existing] = await db()<{ committed_at: Date | null; chain_claim_id: string | null }[]>`
    SELECT committed_at, chain_claim_id FROM claims WHERE id = ${claimId}`;
  if (existing?.committed_at) {
    throw new MarketRefused(
      `claim ${claimId} already committed at ${existing.committed_at.toISOString()} ` +
      `(on-chain claim ${existing.chain_claim_id}). The contract allows one claim per author per ` +
      'market and would revert AlreadyCommitted; refusing before spending gas to find that out.',
    );
  }

  // 8 · ⚠️ THE ADMISSION CHECK. Unit 6c, and the reason it precedes this unit: a commit not bound to
  // a tokenized report is the thing the product claims it never makes. Free, and it throws its own.
  const binding = await checkBinding(input.reportHash);

  // 9 · the balance covers the stake plus Circle's measured premium.
  const balance = await arcProvider().getBalance(analyst.arcAddress);
  if (balance < amount + GAS_HEADROOM) {
    throw new MarketRefused(
      `balance ${ethers.formatUnits(balance, 18)} USDC does not cover a stake of ` +
      `${ethers.formatUnits(amount, 18)} plus ${ethers.formatUnits(GAS_HEADROOM, 18)} of gas ` +
      'headroom. Circle signs at feeLevel MEDIUM, measured at 0.0043–0.0058 per commit in Unit 6.',
    );
  }

  return {
    marketId, claimId, contractAddress,
    reportHash: input.reportHash, spec, core, decision,
    amount: amount.toString(), analyst, binding,
    // ⚠️ Read defensively. `Verdict.call` is null on a metric-across-deployments report — which
    // `metricFromFactId` already refuses in step 5, so this should be unreachable. "Should be" is
    // not a reason to write `.call!`.
    verdict: report.verdict.call ?? null,
  };
}

// ─── The two writes ──────────────────────────────────────────────────────────────────────────────

const iface = new ethers.Interface(ALPHA_MARKET_ABI);

/**
 * ⚠️ Unit 4's `submit()` returns at **`SENT`**, so the transaction is not mined when the hash
 * arrives — Unit 6's script died on exactly this, reading a receipt that did not exist yet. Circle
 * returns no logs at all, so the only way to an event is: wait for the hash, fetch the receipt over
 * the Arc RPC ourselves, decode with the committed ABI. **This unit owns the off-chain half of that
 * seam**, which is why `claimId` is emitted rather than merely returned.
 */
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
 * Create the market on chain. ⚠️ **Spends.**
 *
 * The row is written BEFORE the call — 005's design, and what makes a retry idempotent: a run that
 * dies after submitting still leaves a row carrying the idempotency key it used.
 */
export async function create(plan: MarketPlan): Promise<{ chainMarketId: string; txHash: string; alreadyLanded: boolean }> {
  await db()`
    INSERT INTO markets (id, spec_hash, spec_json, observed_day, close_time, observation_end,
                         resolve_deadline, contract_address, directed_at, create_idempotency_key)
    VALUES (${plan.marketId}, ${plan.core.specHash}, ${JSON.stringify(plan.spec)}, ${plan.spec.observedDay},
            ${new Date(plan.core.closeTime * 1000)}, ${new Date(plan.core.observationEnd * 1000)},
            ${new Date(plan.core.resolveDeadline * 1000)}, ${plan.contractAddress},
            ${plan.analyst.arcAddress}, ${null})
    ON CONFLICT (id) DO NOTHING`;

  const [row] = await db()<{ chain_market_id: string | null; create_tx: string | null }[]>`
    SELECT chain_market_id, create_tx FROM markets WHERE id = ${plan.marketId}`;
  if (!row) throw new Error(`market row ${plan.marketId} vanished between insert and read.`);

  // ⚠️ Nothing retries blindly. A market that already landed is returned, not created again.
  if (row.chain_market_id) {
    return { chainMarketId: row.chain_market_id, txHash: row.create_tx ?? '', alreadyLanded: true };
  }

  // ⚠️ **`callData`, not `abiParameters`, and this is the one call in the project that needs it.**
  // `createMarket` takes a `QuestionCore` STRUCT, and Circle's server-side encoder handles only
  // "string, integer, boolean, and array" — it refused the tuple with
  // `ABI_SIGNATURE_PARAMS_MISMATCH`, at validation and before broadcast, so it cost nothing. Every
  // other analyst write here is flat and still goes the simple way.
  //
  // ⚠️ Encoded with the COMMITTED ABI, which is the same artifact the prebuild gate pins to the
  // deployed bytecode — so the bytes we hand Circle are built from the contract that is running.
  const callData = iface.encodeFunctionData('createMarket', [{
    specHash: `0x${plan.core.specHash}`,
    closeTime: plan.core.closeTime,
    observationEnd: plan.core.observationEnd,
    resolveDeadline: plan.core.resolveDeadline,
  }]) as `0x${string}`;

  // ⚠️ Derived from the bytes actually being sent, then recorded. The row stays the audit trail of
  // what was used; it is no longer the thing that decides it.
  const key = idempotencyKeyFor(plan.marketId, callData);
  await db()`UPDATE markets SET create_idempotency_key = ${key} WHERE id = ${plan.marketId}`;

  const sent = await submit({ contractAddress: plan.contractAddress, callData, idempotencyKey: key });

  const event = await landed(sent.txHash, 'MarketCreated', 'createMarket');
  const chainMarketId = (event.args[0] as bigint).toString();

  await db()`
    UPDATE markets SET chain_market_id = ${chainMarketId}, question_id = ${(event.args[1] as string).slice(2)},
      create_tx = ${sent.txHash}, create_circle_tx_id = ${sent.circleTransactionId}, landed_at = now()
    WHERE id = ${plan.marketId}`;

  return { chainMarketId, txHash: sent.txHash, alreadyLanded: false };
}

/**
 * Commit the analyst's prediction, backed by its own USDC. ⚠️ **Spends, and this is the one that
 * stakes.**
 *
 * ⚠️ Unit 6c's call order, exactly: the claims row first so `binding_evidence.claim_id` has a
 * foreign key to point at, then the evidence, then the submit, then the Arc transaction back onto
 * the evidence row.
 */
export async function commit(plan: MarketPlan, chainMarketId: string): Promise<{ chainClaimId: string; txHash: string; alreadyLanded: boolean }> {
  await db()`
    INSERT INTO claims (id, market_id, author, report_hash, side, amount, commit_idempotency_key)
    VALUES (${plan.claimId}, ${plan.marketId}, ${plan.analyst.arcAddress}, ${plan.reportHash},
            ${plan.decision.side}, ${plan.amount}, ${null})
    ON CONFLICT (id) DO NOTHING`;

  const [row] = await db()<{ chain_claim_id: string | null; commit_tx: string | null }[]>`
    SELECT chain_claim_id, commit_tx FROM claims WHERE id = ${plan.claimId}`;
  if (!row) throw new Error(`claim row ${plan.claimId} vanished between insert and read.`);
  if (row.chain_claim_id) {
    return { chainClaimId: row.chain_claim_id, txHash: row.commit_tx ?? '', alreadyLanded: true };
  }

  // ⚠️ What the admission check saw, recorded before the money moves rather than after.
  await recordBinding(plan.claimId, plan.binding);

  // ⚠️ Flat arguments, so this one still goes the simple way — Circle encodes it server-side and
  // Unit 6 proved that path four times. Only `createMarket`'s struct needs `callData`.
  const call = {
    abiFunctionSignature: 'commitPrediction(uint256,bytes32,bool)',
    abiParameters: [chainMarketId, `0x${plan.reportHash}`, plan.decision.side],
  } as const;
  const key = idempotencyKeyFor(plan.claimId, JSON.stringify([call, plan.amount]));
  await db()`UPDATE claims SET commit_idempotency_key = ${key} WHERE id = ${plan.claimId}`;

  const sent = await submit({
    contractAddress: plan.contractAddress, ...call,
    abiParameters: [...call.abiParameters],
    value: BigInt(plan.amount), idempotencyKey: key,
  });

  const event = await landed(sent.txHash, 'PredictionCommitted', 'commitPrediction');
  const chainClaimId = (event.args[1] as bigint).toString();

  await db()`
    UPDATE claims SET chain_claim_id = ${chainClaimId}, commit_tx = ${sent.txHash},
      commit_circle_tx_id = ${sent.circleTransactionId}, committed_at = now()
    WHERE id = ${plan.claimId}`;
  // ⚠️ The fifth identifier, now that it exists.
  await recordArcTransaction(plan.claimId, sent.txHash);

  return { chainClaimId, txHash: sent.txHash, alreadyLanded: false };
}

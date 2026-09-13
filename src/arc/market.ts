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
import { SettlementTooEarly, settle } from './settle.js';
import { type MarketSpec, type QuestionCore, demoQuestionCore, holds, metricFromFactId, questionCore, specHash, validateSpec } from './spec.js';
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
// **The rule: what settlement would decide for the most recent finished day.** `decideSide` calls
// `settle()` — the same function, the same series, the same `holds()` — against the latest day that
// has a snapshot, and the analyst predicts that answer still holds on the observed day.
//
// ⚠️ **THIS IS A CORRECTION, AND THE FIRST VERSION WAS WRONG IN A WAY THAT PASSED ITS TESTS.** It
// read the figure out of the report: `facts['{slug}.{metric}']`. That figure comes from the
// **`balance-sheet`** document — the protocol entity's live state. Settlement reads
// **`financialsDailySnapshots`**. Same metric NAME, different entity, and they disagree — 24.634B
// against 24.517B for the same day. **The analyst was deciding from one series and being scored on
// another**, which is a mismatch that happened to work rather than decision logic tied to a real
// signal. Market 6 is the cost. See `tracking/lessons.md`.
//
// ⚠️ **`settle()` is CALLED, never reimplemented.** Two reads of one series that could disagree is
// the bug being fixed; a second copy of the window arithmetic, the freshness rule and the comparison
// would be the same bug wearing a different file name.
//
// ⚠️ **THE REPORT IS STILL THE JUSTIFICATION AND NOTHING ABOUT THAT CHANGED.** The claim is bound to
// a tokenized report, admission still checks it, and the report is still what a reader is being
// asked to trust. What moved is only where the NUMBER comes from. The report must still speak to the
// figure the market asks about — a report with nothing to say about it is not a justification for
// this market — and both figures are recorded side by side, so a divergence is visible rather than
// silently resolved in favour of whichever was read second.
//
// ⚠️ **Deterministic, and no second model call — taken deliberately.** A 60-second Vercel function
// cannot afford another round trip to a model, and a deterministic rule is **auditable in a way a
// model call is not**: anyone holding the spec can recompute the side and get the same answer.
//
// ⚠️ **The honest cost:** the analyst still cannot predict a REVERSAL — it can only ever forecast
// that the latest answer persists. That is a real limitation of the rule, and it is why the
// threshold, chosen when the market is created, is where the judgement actually lives.

/** ⚠️ A week. A deployment with no snapshot for seven days is not one a market could settle on. */
const MAX_LOOKBACK_DAYS = 7;

/** Why the analyst took the side it took. Recorded so a reader can recompute it. */
export interface SideDecision {
  readonly side: boolean;
  /** ⚠️ The day the side was computed from — the latest FINISHED day, not the observed day. */
  readonly decidedFromDay: string;
  /** The snapshot figure the side was computed from. The series settlement will read. */
  readonly observed: string;
  /** What the REPORT said about the same metric. Recorded for comparison, not used for the side. */
  readonly reportFigure: string;
  readonly reportObservedAt: string;
  /** ⚠️ Recorded, never enforced. See `prepare()` on why there is no staleness refusal. */
  readonly reportAgeHours: number;
  readonly reason: string;
}

const utcDay = (msAgo: number): string => new Date(Date.now() - msAgo).toISOString().slice(0, 10);

export async function decideSide(report: Report, spec: MarketSpec): Promise<SideDecision> {
  // ── The report must speak to the figure the market asks about ──
  //
  // ⚠️ Still routed through `metricFromFactId`, which round-trips the id through `figureRef` and
  // refuses a per-market figure or the `metric.` sentinel — a report whose headline names no single
  // deployment cannot back a market, because settlement re-reads one deployment.
  const factId = `${spec.slug}.${spec.metric}`;
  metricFromFactId(factId);

  const fact = report.facts[factId];
  if (!fact) {
    throw new MarketRefused(
      `the report has no fact ${factId}. It never measured the figure this market asks about, so ` +
      'it cannot justify a prediction on it.',
    );
  }
  if (fact.value === null) {
    throw new MarketRefused(
      `fact ${fact.id} is WITHHELD (${fact.withheld?.code ?? 'no code'}: ` +
      `${fact.withheld?.rationale ?? 'no rationale'}), so the report stands behind no figure here.`,
    );
  }

  // ── The side, from the series that will judge it ──
  //
  // ⚠️ Walks back from yesterday. Today is unfinished, so `settle()` would refuse it as
  // `SettlementTooEarly` — correctly, and that refusal is caught and skipped rather than suppressed.
  let latest: { day: string; observed: string; side: boolean } | null = null;
  const missing: string[] = [];
  for (let back = 1; back <= MAX_LOOKBACK_DAYS && !latest; back += 1) {
    const day = utcDay(back * 86_400_000);
    try {
      const read = await settle({ ...spec, observedDay: day });
      if (read.kind === 'settled') latest = { day, observed: read.observed, side: read.outcome };
      else missing.push(day);
    } catch (error) {
      // ⚠️ Only "the day has not finished" is skippable. Anything else — a pinned read, a gateway
      // failure — is a reason to stop rather than to try an older day and pretend it is current.
      if (!(error instanceof SettlementTooEarly)) throw error;
      missing.push(`${day} (not finished)`);
    }
  }

  if (!latest) {
    throw new MarketRefused(
      `no daily snapshot for ${spec.slug}.${spec.metric} in the last ${MAX_LOOKBACK_DAYS} days ` +
      `(${missing.join(', ')}). There is no recent observation to forecast from, and a market on a ` +
      'series that has stopped publishing would void rather than settle.',
    );
  }

  const ageHours = (Date.now() - Date.parse(report.observedAt)) / 3_600_000;
  const diverges = latest.observed !== fact.value;
  return {
    side: latest.side,
    decidedFromDay: latest.day,
    observed: latest.observed,
    reportFigure: fact.value,
    reportObservedAt: report.observedAt,
    reportAgeHours: Math.round(ageHours * 10) / 10,
    reason:
      `the ${latest.day} daily snapshot put ${factId} at ${latest.observed}; the market asks ` +
      `whether it is ${spec.comparison} ${spec.threshold} on ${spec.observedDay}. ` +
      `${latest.side ? 'It is, so the analyst predicts it still will be.' : 'It is not, so the analyst predicts it will not be.'} ` +
      `The report (observed ${report.observedAt}, ${Math.round(ageHours)}h old) measured the same ` +
      `metric at ${fact.value}` +
      `${diverges ? ' — a DIFFERENT figure, because the report reads the protocol entity and settlement reads the daily snapshot.' : '.'}`,
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

/** What both paths need. ⚠️ **The TIMES are deliberately not here** — they are the only difference. */
interface PlanInput {
  readonly reportHash: string;
  readonly spec: Omit<MarketSpec, 'schema'>;
  /** 18-dp native, as a decimal string. ⚠️ No default — nobody commits a default stake size. */
  readonly amount: string;
}

/**
 * Plan a real market. ⚠️ **Touches no chain state and spends nothing.**
 *
 * `questionCore` enforces past-posting prevention — `closeTime <= dayStart(observedDay)` — so every
 * market this can build is a genuine forecast about a day that has not started.
 */
export async function prepare(input: PlanInput & {
  readonly closeTime: number;
  readonly resolveDeadline: number;
}): Promise<MarketPlan> {
  return planWith(input, (spec) =>
    questionCore(spec, { closeTime: input.closeTime, resolveDeadline: input.resolveDeadline }));
}

/**
 * Plan a **demo** market — a past-day question carried on future times, so a judge can stake on it
 * and settle it in minutes. ⚠️ **Past-posted by construction; never a forecast.**
 *
 * ⚠️ **A SIBLING OF `prepare`, NEVER A FLAG ON IT**, for the reason `spec.ts` gives at
 * `demoQuestionCore`: a boolean that switches off past-posting prevention is one somebody passes by
 * accident, and two names cannot be confused at a call site.
 *
 * ⚠️ **It runs every one of `prepare`'s nine guards, in the same order, and that is the point of
 * routing through here rather than hand-building a `MarketPlan` in a script.** Guard 8 is the
 * admission check — the thing that stops a commit against a report that was never tokenized — and a
 * demo path that skipped it would be a second, weaker way onto the chain. The only thing that
 * differs is which function builds step 3's `QuestionCore`.
 *
 * ⚠️ **`decideSide` still runs, and for a demo market it reads a DIFFERENT day than settlement
 * will.** The rule is "what settlement would decide for the most recent finished day", so the
 * analyst's side comes from yesterday while the question is about a day further back. That is not a
 * fault to fix here: the analyst is not forecasting, and the side it takes may well be wrong — which
 * is the honest thing for a demo whose answer was published before anyone staked.
 */
export async function prepareDemo(input: PlanInput & {
  readonly closeTime: number;
  readonly observationEnd: number;
  readonly resolveDeadline: number;
}): Promise<MarketPlan> {
  return planWith(input, (spec) => demoQuestionCore(spec, {
    closeTime: input.closeTime,
    observationEnd: input.observationEnd,
    resolveDeadline: input.resolveDeadline,
  }));
}

/**
 * Every read-only check that can stop the run. ⚠️ **Touches no chain state and spends nothing.**
 *
 * ⚠️ **Ids are derived, not random**, so a retry after a crash lands on the same rows rather than
 * creating a second market for one question. The market id is the question and the contract; the
 * claim id is the market and the author, which mirrors the contract's one-claim-per-author rule.
 *
 * ⚠️ **`buildCore` is a callback so the NUMBERED GUARD ORDER below does not move.** Validating the
 * spec in each wrapper instead would hoist step 2 above step 1, and this file's own header plus four
 * broken negative tests say what that costs: a refusal that fires one guard above the one being
 * tested looks exactly like a passing test.
 */
async function planWith(
  input: PlanInput,
  buildCore: (spec: MarketSpec) => QuestionCore,
): Promise<MarketPlan> {
  const contractAddress = requiredEnv('ARC_MARKET_ADDRESS', 'Deployed by Unit 6.');

  // 1 · the report loads and passes its own hash check (`load` throws if it does not).
  //
  // ⚠️ **THERE IS NO STALENESS REFUSAL, AND THAT IS A DECISION RATHER THAN AN OMISSION.** The report
  // used for market 6 was three days old, and that mattered *because the side was computed from it*.
  // It no longer is — the side comes from the latest daily snapshot — so **the correctness argument
  // for an age limit is gone at the source.** What remains is editorial: is week-old research a good
  // reason to stake? That is a product question nobody has answered, and refusing would stop an
  // analyst staking on work it published last week, which is a real capability to remove on a hunch.
  //
  // ⚠️ Adding a threshold "because it sounds prudent" is how an arbitrary number becomes a rule
  // nobody can justify later. **The age is recorded on the decision and printed instead** — visible
  // to an operator before spending, and available to Unit 15 when it scores. Visibility without
  // prohibition; if a limit is ever wanted, it should come from a scoring result rather than taste.
  const report = await load(input.reportHash);
  if (!report) throw new MarketRefused(`no report ${input.reportHash} in the store.`);

  // 2 · the spec validates — legal metric, live deployment, decimal threshold, real date.
  const spec = validateSpec(input.spec);
  // 3 · the times are legal. ⚠️ Which rules apply is the caller's choice of entry point, and each
  //     builder throws its own sentence: `questionCore` refuses a closeTime inside the observed day,
  //     `demoQuestionCore` refuses one before that day was settleable.
  const core = buildCore(spec);

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
  const decision = await decideSide(report, spec);

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

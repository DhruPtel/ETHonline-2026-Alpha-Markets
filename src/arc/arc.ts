// Talking to Arc safely. No market logic here — `market.ts` owns what a market is; this owns the
// plumbing every Arc write shares. `tokenize/hedera.ts`'s role for a different chain.
//
// ⚠️ **Promoted from `scripts/smoke/08-circle-payable-call.ts`, not reinvented.** SM-08 paid a
// deploy and a payable call to learn three things this file encodes: `msg.value` arrives at **18
// decimals** while the ERC-20 view at the same address reports 6, `createContractExecutionTransaction`
// returns an id and no transaction hash, and the hash appears part-way through a state machine you
// have to poll. SM-08 stays frozen and is not imported — it is a Phase 0 test and it deploys a
// contract if run.
//
// ── Why the RPC is an env var and the USDC address is a constant ─────────────────────────────────
//
// Both are hardcoded in SM-08 (lines 37 and 39) and neither had a home. They are not the same kind
// of value and they do not get the same treatment:
//
//   `ARC_RPC_URL`   **env.** An endpoint is an operational choice, not a fact about the chain. It
//                   rotates, it rate-limits, it differs between a public node and a paid one, and
//                   Arc mainnet (2026-09-16) is a different URL. Precedent: `HEDERA_TESTNET_RPC`
//                   and `ETHEREUM_RPC_URL` are both env vars for exactly this reason.
//
//   the USDC address **constant, and it lives inside `ARC` beside the chainId.** `0x3600…0000` is a
//                   predeploy — part of what Arc *is*, at a fixed address the chain defines. It
//                   cannot change without the chainId changing with it, so the two belong to one
//                   object. ⚠️ This is `payments/server.ts`'s `NETWORKS` shape and its reasoning:
//                   keying the record by chain makes the wrong combination unrepresentable. As an
//                   env var it would be a wrong-but-present value pointing at *something*, which is
//                   the failure mode `config/env.ts` exists to prevent.
//
// ⚠️ **`ARC_WALLET` in `.env` is NOT the analyst and must never be read here.** It is the address of
// `ARC_DEPLOYER_KEY` — verified by deriving it, 2026-09-10 — which SM-08 uses as a separate funded
// EOA to deploy with, because `deployContract` is in Circle's typings and not on the client. The
// analyst signs from `CIRCLE_WALLET_ID`, whose address is `config/analysts.ts`'s `arcAddress`. Two
// identities, and `ARC_WALLET` is the name someone reaches for when they want the other one.
// **It wants renaming to `ARC_DEPLOYER_ADDRESS`** — not done here, because it is Unit 11b's file and
// this unit touches `arc.ts` only. `analystIdentity()` below is what refuses if they are confused.

import { ethers } from 'ethers';
import {
  initiateDeveloperControlledWalletsClient,
  type TransactionState,
} from '@circle-fin/developer-controlled-wallets';
import { requiredEnv } from '../config/env.js';
import { analystByArcAddress, type AnalystConfig } from '../config/analysts.js';

/**
 * The chain, as one object. Selecting Arc selects its chainId and its USDC together.
 *
 * ⚠️ **Testnet only, and mainnet is deliberately absent rather than guessed.** Arc mainnet does not
 * exist until 2026-09-16 (DECISIONS.md 2026-09-08), three days after the deadline. A second row here
 * is that cutover, not a fix.
 */
export const ARC = {
  /** Circle's own name for the chain. What `getWallet` reports and what a wallet is scoped to. */
  blockchain: 'ARC-TESTNET',
  chainId: 5042002n,
  /** ⚠️ Native USDC. `msg.value` is 18-dp; `decimals()` at this same address returns 6 (SM-08). */
  nativeUsdc: '0x3600000000000000000000000000000000000000',
} as const;

/**
 * ⚠️ **18-dp native per 6-dp USDC unit, and it is the contract's number too** —
 * `AlphaMarket.sol:93` declares `UNIT_SCALE = 1e12` and `_checkAmount` reverts `NotAUsdcUnit` on
 * anything that is not a whole multiple of it. Converting here rather than at each call site is what
 * makes that one number appear once.
 */
const UNIT_SCALE = 10n ** 12n;

/** ⚠️ The one hint that is correct for this variable and no other. */
export const arcRpcUrl = (): string =>
  requiredEnv(
    'ARC_RPC_URL',
    'Arc testnet is https://rpc.testnet.arc.network. It reads receipts only — every write goes ' +
    'through Circle, which is told the wallet and never this URL.',
  );

// ── The conversion site. There is one, and this is it. ───────────────────────────────────────────
//
// ⚠️ **18-dp is canonical everywhere inside this project** — the contract stores `msg.value`, Unit
// 5's columns are `NUMERIC(78,0)` because an 18-dp amount overflows BIGINT at about 9.22 USDC, and
// PHASE-4 §5.2's accounting line is *"the bug is mixing units, not storing `msg.value`."* The 6-dp
// form is the ERC-20 view and a display scale. Nothing converts anywhere else.

/**
 * 18-dp native → 6-dp USDC units, exactly.
 *
 * ⚠️ **Refuses a remainder instead of rounding it away.** The contract reverts on the same
 * condition, so rounding here would turn a free local throw into a paid on-chain one — and a
 * silently-truncated stake is money the staker does not get back.
 */
export function usdcFromNative(wei: bigint): bigint {
  if (wei % UNIT_SCALE !== 0n) {
    throw new Error(
      `${wei} is not a whole 6-dp USDC unit (${UNIT_SCALE} wei each). AlphaMarket._checkAmount ` +
      'reverts NotAUsdcUnit on this exact condition, so sending it would spend gas to fail.',
    );
  }
  return wei / UNIT_SCALE;
}

/** 6-dp USDC units → 18-dp native. Always exact; the scale only grows. */
export const nativeFromUsdc = (units: bigint): bigint => units * UNIT_SCALE;

/**
 * 18-dp native → the decimal string Circle's `amount` field wants.
 *
 * ⚠️ **Circle takes a human decimal, not atomic units.** SM-08 sent `"2.50"` and the chain saw
 * `2500000000000000000`. Passing a wei figure into `amount` would send 10^18 times too much.
 */
export const nativeAmount = (wei: bigint): string => ethers.formatUnits(wei, 18);

/** The decimal string back to 18-dp native. `"2.50"` and `"2.5"` are the same number. */
export const nativeFromAmount = (amount: string): bigint => ethers.parseUnits(amount, 18);

// ── Clients. Lazy and memoized, never at module scope. ───────────────────────────────────────────
//
// ⚠️ `payments/server.ts`'s pattern and its reason: a missing env var evaluated at import time is a
// **cold-start crash loop on every route that imports this file**, and it reads like a platform
// outage rather than the configuration error it is. Calling the function is what constructs; a warm
// invocation reuses one client.

let provider: ethers.JsonRpcProvider | null = null;

/** Read-only. Receipts, logs and view calls — never a write; writes go through Circle. */
export const arcProvider = (): ethers.JsonRpcProvider =>
  (provider ??= new ethers.JsonRpcProvider(arcRpcUrl()));

let circle: ReturnType<typeof initiateDeveloperControlledWalletsClient> | null = null;

export const circleClient = (): ReturnType<typeof initiateDeveloperControlledWalletsClient> =>
  (circle ??= initiateDeveloperControlledWalletsClient({
    apiKey: requiredEnv('CIRCLE_API_KEY'),
    entitySecret: requiredEnv('CIRCLE_ENTITY_SECRET'),
  }));

// ── The analyst identity guard ───────────────────────────────────────────────────────────────────

/** Who `CIRCLE_WALLET_ID` actually is, once the chain and the analyst row both agree. */
export interface AnalystIdentity {
  readonly walletId: string;
  readonly address: string;
  readonly analyst: AnalystConfig;
}

/**
 * The address half of the guard, separated so it can be exercised without a wallet to be wrong with.
 *
 * ⚠️ **A mismatch stops rather than proceeds.** `Report.analyst` holds the `arcAddress` and the
 * address is inside the report hash, so an analyst committing from an unregistered address puts a
 * claim on chain that `analystByArcAddress` then throws on **at settlement** — after the money moved
 * and with nothing to do about it. `ats.ts:132` is the same check on the Hedera rail.
 */
export function analystForAddress(address: string): AnalystConfig {
  try {
    return analystByArcAddress(address);
  } catch {
    throw new Error(
      `CIRCLE_WALLET_ID resolves to ${address}, which is not an analyst in config/analysts.ts. ` +
      'Refusing to sign: the report hash carries the analyst address, so a claim staked from ' +
      'this one could never be attributed to a report, and settlement would throw on it after ' +
      'the stake was already on chain. ⚠️ If this is ARC_WALLET, that is the deployer EOA derived ' +
      'from ARC_DEPLOYER_KEY, not the analyst — they are two identities and only one may commit.',
    );
  }
}

let identity: AnalystIdentity | null = null;

/**
 * ⚠️ **Every signing call goes through this first.** Memoized — configuration cannot change under a
 * warm process, and this is a network round-trip.
 *
 * Checks what SM-08 checks and for the same reasons: the wallet resolves at all, it is on Arc, and
 * it is an **EOA** — the contract derives the author from `msg.sender` and only an EOA's Circle
 * address is deterministic. A stale `CIRCLE_WALLET_ID` is a wrong-author bug, not an inconvenience.
 */
export async function analystIdentity(): Promise<AnalystIdentity> {
  if (identity) return identity;
  const walletId = requiredEnv('CIRCLE_WALLET_ID');
  const wallet = (await circleClient().getWallet({ id: walletId })).data?.wallet;
  if (!wallet) {
    throw new Error(
      `CIRCLE_WALLET_ID=${walletId} does not resolve to a wallet. Refusing to sign. ⚠️ Do not let ` +
      'this fall through to creating one — a new wallet is a new address and a wrong author.',
    );
  }
  if (wallet.blockchain !== ARC.blockchain) {
    throw new Error(`wallet ${walletId} is on ${wallet.blockchain}, not ${ARC.blockchain}.`);
  }
  if (wallet.accountType !== 'EOA') {
    throw new Error(
      `wallet ${walletId} is ${wallet.accountType}, not EOA. msg.sender must come from an EOA — ` +
      'an SCA address is not deterministic and the contract derives the author from it.',
    );
  }
  return (identity = { walletId, address: wallet.address, analyst: analystForAddress(wallet.address) });
}

// ── submit ───────────────────────────────────────────────────────────────────────────────────────

/**
 * ⚠️ **Always carries the Circle transaction id**, because that is the only thing that survives a
 * wait that did not finish. `inFlight` is the difference between *reconcile this later* and *this
 * one is dead*: Circle's terminal failures are `FAILED`, `DENIED`, `CANCELLED`, `STUCK` and they do
 * not come back, while an abort means we stopped watching and the transaction did not.
 *
 * ⚠️ **A Circle failure is not a revert**, which is why there is no `landOrStop` here. That function
 * exists because a Hashio revert is unattributable without a Mirror Node lookup. Arc has no Mirror
 * Node and Circle does not hand back a receipt — it hands back a state machine with `errorReason`
 * and `errorDetails` on it, and the SDK's own wait already reads them into its message.
 */
export class ArcSubmitError extends Error {
  constructor(readonly circleTransactionId: string, readonly inFlight: boolean, message: string) {
    super(`${message}\n      circle transaction ${circleTransactionId}`);
    this.name = 'ArcSubmitError';
  }
}

/**
 * ⚠️ **TWO CALL SHAPES, AND WHICH ONE TO USE IS DECIDED BY THE ARGUMENT TYPES.**
 *
 *   `abiFunctionSignature` + `abiParameters`   **flat arguments only.** Circle encodes server-side
 *                                              and its encoder handles "string, integer, boolean,
 *                                              and array" — its words. Simplest, and what every
 *                                              scalar call should use.
 *   `callData`                                 **anything with a tuple.** We encode with the
 *                                              committed ABI and hand Circle finished bytes.
 *
 * ⚠️ **This is not a style choice; it is a limitation found the hard way.** `createMarket` takes a
 * `QuestionCore` struct, and Circle refused to build the transaction —
 * `ABI_SIGNATURE_PARAMS_MISMATCH: ABI function signature can't pack ABI parameter` — at validation,
 * before broadcast, so it cost nothing. `commitPrediction(uint256,bytes32,bool)`, `resolve` and
 * `claim` are all flat and all went through `abiParameters` fine in Unit 6. **`createMarket` is the
 * only function in this contract taking a struct**, which is why the gap took until Unit 7 to show.
 *
 * ⚠️ **A union, so sending both is UNREPRESENTABLE.** Circle's own field documentation says
 * *"the usage of `callData` is mutually exclusive with the `abiFunctionSignature` and
 * `abiParameters`"*, and a type that cannot express the invalid pair is worth more than a test that
 * observed it once.
 *
 * ⚠️ **`callData` was checked in the shipped bundle before being relied on, not inferred from Unit
 * 6b.** The client wrapper destructures exactly `idempotencyKey`, `fee` and `xRequestId` and spreads
 * **everything else** into the request object (`{entitySecretCiphertext, idempotencyKey, ...fee.config, ...rest}`),
 * and the API layer then serializes that whole object (`c.data = M(t, c, e)`) with no field
 * whitelist. So `callData` reaches the body. ⚠️ A grep count cannot tell a forwarded field from a
 * dropped one — only reading the mechanism can, and it was read again here rather than assumed.
 */
type SubmitCall =
  | { readonly abiFunctionSignature: string; readonly abiParameters: unknown[]; readonly callData?: never }
  | { readonly callData: `0x${string}`; readonly abiFunctionSignature?: never; readonly abiParameters?: never };

export type SubmitInput = SubmitCall & {
  /** The deployed AlphaMarket. ⚠️ Passed in — nothing is deployed yet and Unit 6 is what deploys. */
  readonly contractAddress: string;
  /** 18-dp native to send with the call. Converted here; callers never format an amount. */
  readonly value?: bigint;
  /**
   * ⚠️ **Required, and this file will not invent one.** The key has to survive a cold start, so it
   * is written on the row at the first attempt and passed back in on the retry — which means it
   * belongs to whoever owns the row (Unit 5's `markets`/`claims`, driven by Unit 7), not to a
   * helper that forgets it between invocations. Not derived from a clock, and not derived from a
   * hash until somebody has checked whether Circle validates the UUID shape; a stored key works
   * either way. Making it required is what stops a caller silently falling back on Circle's
   * per-call generation.
   */
  readonly idempotencyKey: string;
  /**
   * ⚠️ **Called with Circle's id after the transaction is created and before the wait begins.** If
   * the wait then aborts the transaction is still in flight, and this id is the only handle the
   * next run has to reconcile it. `purchases.native_tx_id` is written before settle on the other
   * rail for the same reason.
   */
  readonly onSubmitted?: (circleTransactionId: string) => Promise<void>;
  /**
   * ⚠️ **Bounded well under Vercel Hobby's 60-second ceiling** — a declared `maxDuration = 300` is
   * silently clamped to 60 and no API says so. The budget covers the create, this wait, and
   * persisting the outcome, so aborting ourselves at 45s leaves the error path time to run. A
   * platform kill at 60s runs nothing at all.
   */
  readonly timeoutMs?: number;
};

export interface Submitted {
  readonly circleTransactionId: string;
  readonly txHash: string;
  readonly state: TransactionState;
}

/**
 * One Arc write: create, record, wait for the hash.
 *
 * ⚠️ **Waits for `SENT`, not `COMPLETE`.** An EOA has its `txHash` at `SENT` (the SDK's own note on
 * `waitForTxHash`), and the SDK treats `SENT` as satisfied by `CONFIRMED` and `COMPLETE` too. Waiting
 * past it waits for nothing we need — the hash is what the caller stores and what the provider reads
 * a receipt with.
 *
 * ⚠️ **`waitForState` is the SDK's own poll loop and it was checked in the shipped bundles before
 * being used here** — `waitForState`, `waitForTxHash` and `pollingInterval` are all present in both
 * `.es.js` and `.cjs.js`, it advances along `INITIATED → CLEARED → QUEUED → SENT → CONFIRMED →
 * COMPLETE`, it rejects on the four terminal failures with `errorReason` and `errorDetails` in the
 * message, and its delay honours `signal`. ⚠️ **That check is not ceremony**: `generateIdempotencyKey`
 * is exported from this same package's typings and appears **zero times in either bundle** — it
 * typechecks and is `undefined` at runtime. Never import it. Verify, then use.
 */
export async function submit(input: SubmitInput): Promise<Submitted> {
  // ⚠️ `"" ?? ee()` is `""`, not a generated key — `??` falls back on `undefined` and never on the
  // empty string. This is `config/env.ts`'s bug on a different rail: a blank key would be *sent*,
  // and Circle's idempotency is then whatever it does with an empty one. Guarded, not assumed.
  if (!input.idempotencyKey.trim()) {
    throw new Error(
      'idempotencyKey is empty. The SDK reads `idempotencyKey: t ?? ee()`, so an empty string is ' +
      'passed through rather than replaced — and a duplicate cron delivery would then be a second ' +
      'transaction and a second spend. Store the key on the row and pass it back on retry.',
    );
  }

  const { walletId } = await analystIdentity();
  // What to call this call in an error. ⚠️ `callData` has no signature to name, so it names itself.
  const what = input.abiFunctionSignature ?? `callData ${input.callData.slice(0, 10)}…`;

  // ⚠️ Exactly one shape is spread in. The union above is what stops both reaching Circle together.
  const call = input.callData !== undefined
    ? { callData: input.callData }
    : { abiFunctionSignature: input.abiFunctionSignature, abiParameters: input.abiParameters as never[] };

  const created = await circleClient().createContractExecutionTransaction({
    walletId,
    contractAddress: input.contractAddress,
    ...call,
    ...(input.value === undefined ? {} : { amount: nativeAmount(input.value) }),
    idempotencyKey: input.idempotencyKey,
    fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
  } as Parameters<ReturnType<typeof circleClient>['createContractExecutionTransaction']>[0]);

  const id = created.data?.id;
  if (!id) throw new Error(`Circle returned no transaction id: ${JSON.stringify(created.data)}`);

  // ⚠️ Before the wait, and awaited. Everything after this point can fail without losing the id.
  await input.onSubmitted?.(id);

  let sent;
  try {
    sent = await circleClient().getTransaction({
      id,
      waitForState: 'SENT',
      signal: AbortSignal.timeout(input.timeoutMs ?? 45_000),
    });
  } catch (error) {
    // ⚠️ The SDK rejects an aborted wait with a DOMException named `AbortError` whose `cause` is the
    // signal's reason, so the name is `AbortError` even for `AbortSignal.timeout`. That is the one
    // signal separating *we stopped watching* from *Circle says it is dead*, and the two want
    // opposite handling: reconcile the first by id, never retry the second.
    const inFlight = (error as { name?: string }).name === 'AbortError';
    const why = inFlight
      ? `still in flight after ${(input.timeoutMs ?? 45_000) / 1000}s — this is not a failure. Do ` +
        'not resubmit: reconcile the id below on the next run.'
      : (error as Error).message;
    throw new ArcSubmitError(id, inFlight, `${what} — ${why}`);
  }

  const transaction = sent.data?.transaction;
  if (!transaction?.txHash) {
    throw new ArcSubmitError(id, true, `${what} reached SENT with no txHash.`);
  }
  return { circleTransactionId: id, txHash: transaction.txHash, state: transaction.state };
}

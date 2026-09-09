// Talking to Hedera safely. No assets here — `ats.ts` owns what a report token is; this owns the
// plumbing every write shares, and Unit 10's transfer needs all of it and none of that.
//
// ⚠️ **Promoted from `scripts/smoke/07-ats-issue-transfer.ts`, not reinvented.** SM-07 paid a
// reverted deploy — 948,129 gas — to learn that a Hedera revert is unattributable without a Mirror
// Node lookup. That lesson is the reason this file exists as a file.
//
// ⚠️ **One deliberate change from SM-07: `landOrStop` throws instead of calling `process.exit(1)`.**
// SM-07 is a script and exiting is right there. This is a library — `tokenize()` is meant to be
// callable from something that is not a CLI, and a `process.exit` inside it would take a server down
// mid-request. The discipline is unchanged and is the whole point: get the real reason from Mirror
// Node, say what already landed, and **never retry**. Only who prints it moved.

import { ethers } from 'ethers';
import { Factory__factory, IAsset__factory } from '@hashgraph/asset-tokenization-contracts';

/**
 * ⚠️ **The one definition of the Mirror Node host.** Consolidated 2026-09-09 — there were five, and
 * this is a URL that flips *wholesale* at the mainnet/USDC cutover (R12), so every extra copy was a
 * place to miss it. Importers: `ats.ts`, `transfer.ts`, `app/api/health`, `app/api/console/buy`,
 * `scripts/ops/buy.ts`, `scripts/ops/verify-analyst.ts`, `scripts/ops/verify-ats.ts`.
 *
 * ⚠️ **It stayed here rather than moving, and the objection to that turned out to be moot.** The
 * concern was that a caller wanting only a URL would have to import a tokenization module — but the
 * two callers named, `app/api/console/buy` and `scripts/ops/buy.ts`, **already import `fetchJson`
 * from this file**, so for them the edge existed and was already paid for. The two that gained a new
 * import, `verify-analyst.ts` and `verify-ats.ts`, are network-bound CLIs where the measured ~950 ms
 * of eager `ethers` + ATS-contracts loading is noise against a 20-second run. ⚠️ Nothing here reads
 * `process.env` at import time, so `verify-ats.ts`'s credential-free property survives untouched.
 *
 * ⚠️ `scripts/smoke/` keeps its own copy on purpose — those are frozen Phase 0 tests and their
 * constants are correct as they ran.
 */
export const MIRROR = 'https://testnet.mirrornode.hedera.com';
export const HEDERA_TESTNET_CHAIN_ID = 296n;

const HBAR_DECIMALS = 8;
/** Tinybars → a human HBAR string. Display only; every calculation stays in integer tinybars. */
export const hbar = (tinybars: bigint | number): string => (Number(tinybars) / 10 ** HBAR_DECIMALS).toFixed(8);

export async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} → ${response.status}`);
  return (await response.json()) as T;
}

export type MirrorContract = { evm_address: string; deleted: boolean; expiration_timestamp: string; nonce: number };
export type MirrorAccount = { evm_address: string; balance: { balance: number } };

/**
 * ⚠️ **One installed copy of ethers, two type identities.** Our code is ESM so `ethers` resolves to
 * `lib.esm`; the typechain `.d.ts` files are CJS so the same import resolves to `lib.commonjs` inside
 * them. TypeScript compares the two structurally, hits their `#private` fields, and calls them
 * incompatible. Nothing differs at runtime — `npm ls ethers` shows one deduped 6.16.0 — so the cast
 * is confined to this one boundary, exactly as SM-07 confined it.
 */
export type Runner = Parameters<typeof Factory__factory.connect>[1];
export const asRunner = (wallet: ethers.Wallet): Runner => wallet as unknown as Runner;

/** ATS reverts with custom errors, so a reason is a 4-byte selector. Decoding needs the ABI. */
export function decodeErrorData(data: string): string | null {
  for (const iface of [Factory__factory.createInterface(), IAsset__factory.createInterface()]) {
    try {
      const parsed = iface.parseError(data);
      if (parsed) return `${parsed.name}(${parsed.args.map(String).join(', ')})`;
    } catch {
      /* not this ABI's error */
    }
  }
  return null;
}

/**
 * ⚠️ **The only place a Hedera revert reason exists.** ethers gets nothing useful out of a reverted
 * transaction here: the Hashio relay reports a failure as a status-0 receipt with no revert data, so
 * `error.data` is `undefined` and the message is the useless "transaction execution reverted". The
 * selector lives at `/api/v1/contracts/results/{hash}` under `error_message`.
 *
 * ⚠️ Polls, because Mirror Node lags consensus — the SM-05 lesson, where a settled payment reported
 * unchanged balances at both ends.
 */
export async function revertReasonFromMirror(hash: string): Promise<string | null> {
  type MirrorResult = { error_message?: string | null; result?: string; gas_used?: number };
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const found = await fetchJson<MirrorResult>(`${MIRROR}/api/v1/contracts/results/${hash}`);
      if (found.error_message) {
        const decoded = decodeErrorData(found.error_message);
        return `${decoded ?? `unrecognised selector ${found.error_message}`}  [${found.result}, ${found.gas_used} gas]`;
      }
      if (found.result) return `${found.result} (no revert data), ${found.gas_used} gas`;
    } catch {
      /* not ingested yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}

/** Thrown by `landOrStop`. `landed` says what already exists, so a caller cannot retry blindly. */
export class ChainWriteError extends Error {
  constructor(readonly what: string, readonly reason: string, readonly txHash: string | undefined, readonly landed: string[]) {
    super(`${what} reverted — ${reason}${txHash ? `\n      tx ${txHash}` : ''}${landed.map((l) => `\n      ${l}`).join('')}`);
    this.name = 'ChainWriteError';
  }
}

/**
 * Every write goes through this. It resolves the real reason and throws; it never retries.
 *
 * ⚠️ `landed` is not decoration. A blind retry after a *partial* run deploys a second asset with
 * nothing on-chain to say the first one was ours, so each caller states what already exists.
 */
export async function landOrStop<T>(what: string, run: () => Promise<T>, landed: string[]): Promise<T> {
  try {
    return await run();
  } catch (error) {
    const err = error as { data?: string; shortMessage?: string; message?: string; receipt?: { hash: string } };
    const fromData = typeof err.data === 'string' && err.data.length > 2 ? decodeErrorData(err.data) : null;
    const hash = err.receipt?.hash;
    const reason = fromData ?? (hash ? await revertReasonFromMirror(hash) : null);
    throw new ChainWriteError(what, reason ?? err.shortMessage ?? err.message ?? String(error), hash, landed);
  }
}

/**
 * An account's HBAR balance once it has actually moved. ⚠️ Mirror Node lags consensus, so reading
 * once after a write returns the pre-write number and makes a spend look free.
 */
export async function settledBalance(accountId: string, before: bigint): Promise<bigint> {
  for (let attempt = 0; attempt < 15; attempt++) {
    const now = BigInt((await fetchJson<MirrorAccount>(`${MIRROR}/api/v1/accounts/${accountId}`)).balance.balance);
    if (now !== before) return now;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return BigInt((await fetchJson<MirrorAccount>(`${MIRROR}/api/v1/accounts/${accountId}`)).balance.balance);
}

/** USD per HBAR, from the network's own exchange rate. For printing a cost, never for pricing. */
export async function usdPerHbar(): Promise<number> {
  type MirrorRate = { current_rate: { cent_equivalent: number; hbar_equivalent: number } };
  const rate = await fetchJson<MirrorRate>(`${MIRROR}/api/v1/network/exchangerate`);
  return rate.current_rate.cent_equivalent / rate.current_rate.hbar_equivalent / 100;
}

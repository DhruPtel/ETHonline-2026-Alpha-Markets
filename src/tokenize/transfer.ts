// Move a report's token. The lifecycle operation H2.4 asks to see.
//
// ⚠️ **Standalone, and NOT part of any purchase path.** The Own tier is cut (DECISIONS.md
// 2026-09-08): a buyer pays to read and no token moves. H2.4 asks for issuance, configuration and
// ≥1 lifecycle operation — it does **not** ask for the lifecycle operation to be caused by a
// payment, and reading it that way was our own addition. This is that operation, demonstrated on
// its own.
//
// ⚠️ **SM-07 proved this against a token carrying `FAKE_REPORT_HASH`.** This moves a token whose
// creation event commits a real report someone can read at a URL — which is the difference between
// a working transfer and a working product.
//
// ⚠️ **Two phases, as Unit 8 established.** `prepare()` does every check that can stop the run —
// no token, wrong key, wrong chain, nothing to send, sending to yourself — and `send()` is the only
// thing that spends. Everything that can fail should fail before gas is paid.
//
// ── Either account can sign (2026-09-09) ─────────────────────────────────────────────────────────
//
// ⚠️ **This used to sign as the analyst and only the analyst.** The key came from
// `HEDERA_SELLER_KEY` inside `prepare()` and any other signer was refused, so a token that had moved
// to the buyer could never come back — and asking for it produced *"the recipient is the sender"*,
// because the signer was always the analyst and the analyst was the requested recipient. Three of
// four report tokens were stranded, which meant the transfer path could not be tested at its edges.
//
// ⚠️ **A caller names a ROLE, not a key.** `signer: 'analyst' | 'buyer'` is looked up here. A
// function that took a private key as an argument would let any caller sign as anything, move the
// key into logs and stack traces, and delete the one check that makes a shared key safe — that the
// key derives the address of the account it claims to be. That check is preserved per role below.
//
// ⚠️ **`config/analysts.ts` is deliberately NOT changed.** The buyer is not an analyst: it publishes
// nothing, has no Arc address, and `scripts/ops/verify-analyst.ts` asserts every row in that file
// against the live Circle API, which a buyer row would fail. Its identity is `HEDERA_BUYER_ID` /
// `HEDERA_BUYER_KEY`, and its EVM address is **read from Mirror Node** — the account's own answer
// about itself, the same provenance `analysts.ts` records for `hederaEvmAddress`.

import { ethers } from 'ethers';
import { IAsset__factory } from '@hashgraph/asset-tokenization-contracts';
import { analystByArcAddress, type AnalystConfig } from '../config/analysts.js';
// ⚠️ Empty is missing — `??` never falls back on `""`. One guard, shared; was a local copy until 2026-09-09.
import { requiredEnv as env } from '../config/env.js';
import { load } from '../store/reports.js';
import { tokenFor, type ReportToken } from '../store/tokens.js';
import { db } from '../store/db.js';
import {
  HEDERA_TESTNET_CHAIN_ID, MIRROR, asRunner, fetchJson, landOrStop, settledBalance,
  type MirrorAccount, type Runner,
} from './hedera.js';

/**
 * ⚠️ Structural, not `ethers.TransactionReceipt`, for the reason `asRunner` exists — typechain hands
 * back a `ContractTransactionReceipt` carrying the CJS ethers identity, which will not assign to our
 * ESM import of the same installed copy. `ats.ts` declares an identical shape; duplicating three
 * field names is cheaper than importing the whole tokenize/ats module for a type.
 */
export interface TxCost {
  readonly hash: string;
  readonly gasUsed: bigint;
  readonly gasPrice: bigint;
}

/**
 * Which configured account signs. ⚠️ **A role, resolved here — never a key from a caller.**
 *
 * `'analyst'` is the token's issuer, from the report's own `config/analysts.ts` row.
 * `'buyer'` is the x402 buyer agent, from `HEDERA_BUYER_ID` / `HEDERA_BUYER_KEY`.
 */
export type SignerRole = 'analyst' | 'buyer';

/** A resolved signer: who it claims to be, and a wallet proved to derive that account's address. */
export interface Signer {
  readonly role: SignerRole;
  readonly accountId: string;
  readonly evmAddress: string;
  readonly wallet: ethers.Wallet;
}

export interface TransferPlan {
  readonly reportHash: string;
  readonly token: ReportToken;
  /**
   * The token's ISSUER, always — this is who minted it, not who is sending it now.
   * ⚠️ Kept under this name because `scripts/ops/move-token.ts` reads it and is out of scope here.
   * For the account paying for THIS transfer, read `signer`.
   */
  readonly analyst: AnalystConfig;
  readonly signer: Signer;
  readonly wallet: ethers.Wallet;
  readonly from: string;
  readonly to: string;
  readonly fromBalance: bigint;
  readonly toBalance: bigint;
  /** The SIGNER's HBAR balance — whoever signs pays the gas. */
  readonly balanceTinybars: bigint;
}

export interface TransferResult {
  readonly transferTx: string;
  readonly fromBefore: bigint;
  readonly toBefore: bigint;
  readonly fromAfter: bigint;
  readonly toAfter: bigint;
  readonly receipt: TxCost;
}

/**
 * Everything that can stop the run, before anything costs.
 *
 * ⚠️ **The sender comes from the analyst row on the report, never from env.** Same rule as Unit 8:
 * each analyst owns its own tokens, and reading the holder from a shared variable would mean one
 * analyst signing away another's asset.
 */
/**
 * Resolve a role to a signing wallet, and refuse a key that is not the account it claims to be.
 *
 * ⚠️ **This is `ats.ts:132`'s guarantee, kept and generalised.** That check exists because one
 * shared key is only safe while something proves it derives the row's address; without it a wrong
 * `HEDERA_SELLER_KEY` would sign from an account nobody registered, silently and irreversibly. The
 * same rule now applies per role, against a *different* source of truth for each:
 *
 *   analyst  the address in `config/analysts.ts`, which `scripts/ops/verify-analyst.ts` already
 *            asserts against the live Circle API and Mirror Node
 *   buyer    the address Mirror Node reports for `HEDERA_BUYER_ID` — read, never derived, so the
 *            check compares our key against the network's answer rather than against itself
 */
async function resolveSigner(
  role: SignerRole,
  analyst: AnalystConfig,
  provider: ethers.JsonRpcProvider,
): Promise<Signer> {
  const [accountId, keyEnv] = role === 'analyst'
    ? [analyst.hederaAccountId, 'HEDERA_SELLER_KEY']
    : [env('HEDERA_BUYER_ID'), 'HEDERA_BUYER_KEY'];

  // ⚠️ For the buyer this is the ONLY statement of what its address is, so it is read rather than
  // assumed. For the analyst it double-checks config against the network at no extra cost.
  const account = await fetchJson<MirrorAccount>(`${MIRROR}/api/v1/accounts/${accountId}`);
  const expected = role === 'analyst' ? analyst.hederaEvmAddress : account.evm_address;

  const wallet = new ethers.Wallet(`0x${env(keyEnv).replace(/^0x/, '').slice(-64)}`, provider);
  if (wallet.address.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(
      `${keyEnv} derives ${wallet.address} but the ${role} account ${accountId} is ${expected}. ` +
      'The key and the account it claims to be are different accounts — refusing to sign.',
    );
  }
  if (role === 'analyst' && account.evm_address.toLowerCase() !== analyst.hederaEvmAddress.toLowerCase()) {
    throw new Error(
      `config/analysts.ts says ${analyst.id} is ${analyst.hederaEvmAddress} but Mirror Node reports ` +
      `${account.evm_address} for ${accountId}. Config and the network disagree about the same account.`,
    );
  }
  return { role, accountId, evmAddress: wallet.address, wallet };
}

/**
 * @param signer Which configured account sends. ⚠️ Defaults to `'analyst'` so existing callers —
 *   `scripts/ops/move-token.ts` — keep their exact previous behaviour.
 */
export async function prepare(
  reportHash: string,
  to: string,
  signer: SignerRole = 'analyst',
): Promise<TransferPlan> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(to)) {
    throw new Error(`"${to}" is not a 20-byte EVM address. The recipient must be given explicitly.`);
  }

  const report = await load(reportHash);
  if (!report) throw new Error(`no report ${reportHash} in the store.`);

  // ⚠️ Named precisely, because "transfer failed" for a report that was never tokenized sends
  // someone looking at the chain when the answer is that there is nothing on it.
  const token = await tokenFor(reportHash);
  if (!token) {
    throw new Error(
      `report ${reportHash} has no token — nothing in report_tokens. Tokenize it first: ` +
      `npx tsx --env-file=.env scripts/ops/tokenize.ts ${reportHash} --confirm`,
    );
  }

  const analyst = analystByArcAddress(report.analyst);

  const provider = new ethers.JsonRpcProvider(env('HEDERA_TESTNET_RPC'));
  const chainId = (await provider.getNetwork()).chainId;
  if (chainId !== HEDERA_TESTNET_CHAIN_ID) {
    throw new Error(`chainId ${chainId} is not Hedera testnet (${HEDERA_TESTNET_CHAIN_ID}).`);
  }

  const resolved = await resolveSigner(signer, analyst, provider);
  const wallet = resolved.wallet;

  if (to.toLowerCase() === wallet.address.toLowerCase()) {
    throw new Error(
      `the recipient is the sender — ${signer} is ${wallet.address}. A transfer to yourself ` +
      'demonstrates nothing. Did you mean to sign as the other account?',
    );
  }

  // ⚠️ **Balances read from the CHAIN before anything is sent.** SM-07's own finding was that proxy
  // creation is not issuance and a successful receipt is not a balance change; the corollary is that
  // a transfer is only worth sending if there is something to send.
  const contract = IAsset__factory.connect(token.proxyAddress, asRunner(wallet));
  const fromBalance = await contract.balanceOf(wallet.address);
  const toBalance = await contract.balanceOf(to);
  if (fromBalance !== 1n) {
    // ⚠️ Names the SIGNER, not the analyst. "analyst holds 0" was actively misleading once the buyer
    // could sign — it sent people to the wrong account.
    throw new Error(
      `the ${signer} (${resolved.accountId}, ${wallet.address}) holds ${fromBalance} of ` +
      `${token.isin}, not 1. ` +
      (fromBalance === 0n
        ? 'It does not hold this token — check token_transfers for where it went, and sign as ' +
          'whichever account holds it.'
        : ''),
    );
  }

  // ⚠️ The SIGNER's balance: whoever signs pays the gas.
  const account = await fetchJson<MirrorAccount>(`${MIRROR}/api/v1/accounts/${resolved.accountId}`);
  return {
    reportHash, token, analyst, signer: resolved, wallet,
    from: wallet.address, to, fromBalance, toBalance,
    balanceTinybars: BigInt(account.balance.balance),
  };
}

/**
 * ⚠️ **Balances asserted from the chain, never a receipt eyeballed.** A status-1 receipt says the
 * transaction executed, not that a token moved — SM-07 established that distinction and it is the
 * only thing that makes this proof worth anything.
 *
 * ⚠️ Polled, because a read taken the instant a receipt lands can be served from state that has not
 * caught up. The assertion is on the settled values, not the first ones offered.
 */
export async function send(plan: TransferPlan): Promise<TransferResult> {
  const runner: Runner = asRunner(plan.wallet);
  const contract = IAsset__factory.connect(plan.token.proxyAddress, runner);

  const receipt = await landOrStop('transfer', async () =>
    (await (await contract.transfer(plan.to, 1n, { gasLimit: 2_000_000 })).wait())!,
    [
      `The token still exists and is still held by ${plan.from}. Proxy ${plan.token.proxyAddress}.`,
      'Do NOT retry blind — read the balances first; the transfer may have landed.',
    ]);

  let fromAfter = plan.fromBalance;
  let toAfter = plan.toBalance;
  for (let attempt = 0; attempt < 15; attempt++) {
    fromAfter = await contract.balanceOf(plan.from);
    toAfter = await contract.balanceOf(plan.to);
    if (fromAfter === 0n && toAfter === plan.toBalance + 1n) break;
    await new Promise((r) => setTimeout(r, 1000));
  }

  if (fromAfter !== 0n || toAfter !== plan.toBalance + 1n) {
    throw new Error(
      `the transaction landed (${receipt.hash}) but the balances did not move as required: ` +
      `from ${plan.fromBalance} → ${fromAfter} (wanted 0), to ${plan.toBalance} → ${toAfter} ` +
      `(wanted ${plan.toBalance + 1n}). A receipt is not a balance change.`,
    );
  }

  // ⚠️ Recorded only AFTER the balances are asserted. A hash written against a transaction that
  // executed but moved nothing would be a row asserting something that did not happen. Unit 10
  // established this and it is unchanged by the history table below.
  //
  // ── Two writes, and the append is the real record (2026-09-09) ─────────────────────────────────
  //
  // ⚠️ **`token_transfers` is the history; `report_tokens.transfer_tx` is a pointer at the latest
  // hop.** Before 004 there was only the column, and `send()` overwrote it — so a token moving back
  // would have erased the outbound hash and left the row claiming a single transfer that never
  // happened in that direction. The append cannot lose a hop; `tx_hash` is UNIQUE, so re-recording
  // one after a retry is a no-op rather than a duplicate claim.
  //
  // ⚠️ The column is still written because two readers outside this file's scope use it —
  // `scripts/ops/move-token.ts` and `app/api/console/state`. Its meaning narrows from "the transfer"
  // to "the most recent transfer" and nothing about those callers breaks.
  await db()`
    INSERT INTO token_transfers (report_hash, tx_hash, from_address, to_address, signer)
    VALUES (${plan.reportHash}, ${receipt.hash}, ${plan.from}, ${plan.to}, ${plan.signer.role})
    ON CONFLICT (tx_hash) DO NOTHING`;
  await db()`
    UPDATE report_tokens SET transfer_tx = ${receipt.hash} WHERE report_hash = ${plan.reportHash}`;

  return {
    transferTx: receipt.hash,
    fromBefore: plan.fromBalance, toBefore: plan.toBalance,
    fromAfter, toAfter,
    receipt,
  };
}

export { settledBalance };

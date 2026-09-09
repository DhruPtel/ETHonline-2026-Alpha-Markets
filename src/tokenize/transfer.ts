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

export interface TransferPlan {
  readonly reportHash: string;
  readonly token: ReportToken;
  readonly analyst: AnalystConfig;
  readonly wallet: ethers.Wallet;
  readonly from: string;
  readonly to: string;
  readonly fromBalance: bigint;
  readonly toBalance: bigint;
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
export async function prepare(reportHash: string, to: string): Promise<TransferPlan> {
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

  const wallet = new ethers.Wallet(`0x${env('HEDERA_SELLER_KEY').replace(/^0x/, '').slice(-64)}`, provider);
  if (wallet.address.toLowerCase() !== analyst.hederaEvmAddress.toLowerCase()) {
    throw new Error(
      `HEDERA_SELLER_KEY derives ${wallet.address} but analyst ${analyst.id} holds this token at ` +
      `${analyst.hederaEvmAddress}. The key and the holder are different accounts.`,
    );
  }
  if (to.toLowerCase() === wallet.address.toLowerCase()) {
    throw new Error('the recipient is the sender. A transfer to yourself demonstrates nothing.');
  }

  // ⚠️ **Balances read from the CHAIN before anything is sent.** SM-07's own finding was that proxy
  // creation is not issuance and a successful receipt is not a balance change; the corollary is that
  // a transfer is only worth sending if there is something to send.
  const contract = IAsset__factory.connect(token.proxyAddress, asRunner(wallet));
  const fromBalance = await contract.balanceOf(wallet.address);
  const toBalance = await contract.balanceOf(to);
  if (fromBalance !== 1n) {
    throw new Error(
      `analyst ${analyst.id} holds ${fromBalance} of ${token.isin}, not 1. ` +
      (fromBalance === 0n ? 'It has already been transferred — check report_tokens.transfer_tx.' : ''),
    );
  }

  const account = await fetchJson<MirrorAccount>(`${MIRROR}/api/v1/accounts/${analyst.hederaAccountId}`);
  return {
    reportHash, token, analyst, wallet,
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

  // ⚠️ Recorded only AFTER the balances are asserted. A `transfer_tx` written against a transaction
  // that executed but moved nothing would be a row asserting something that did not happen.
  //
  // ⚠️ This makes `transfer.ts` a second writer of `report_tokens`; `store/tokens.ts`'s header still
  // says `ats.ts` is the only one. That comment is now stale and the file is out of this unit's scope.
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

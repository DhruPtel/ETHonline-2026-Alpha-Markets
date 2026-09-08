// The agent that pays. H1.3 wants a platform *or agent* consuming the service with at least one real
// paid request end to end, and this is it — it also closes Unit 14's other half, because a gate whose
// paid path nothing has walked is half a gate.
//
// ⚠️ **The autonomy claim is narrow and should stay narrow.** This decides, unattended, whether a
// quoted price is under its caps and whether the asset is one it holds. That is what "agent" means
// here. It is not a model deciding to shop, and nothing below asks one.
//
// ⚠️ **Promoted from `scripts/smoke/05-x402-purchase.ts`'s buyer half** — the signer, the
// `x402HTTPClient`, the spend controls, the handshake. SM-05's *seller* half does not promote: it is
// a hand-rolled `createServer` doing manual verify and settle, and the gate is `withX402`.
//
// ⚠️ **Every Hedera SDK type comes from `@x402/hedera`'s re-exports, never `@hiero-ledger/sdk`
// directly.** A second copy of the SDK cross-fails at runtime with `t.startsWith is not a function`.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { x402Client, x402HTTPClient } from '@x402/core/client';
import type { PaymentRequirements } from '@x402/core/types';
import { ExactHederaScheme as ExactHederaClientScheme } from '@x402/hedera/exact/client';
import {
  createClientHederaSigner, fetchJson, inspectHederaTransaction, mirrorNodeUrlForNetwork, PrivateKey,
} from '@x402/hedera';
import {
  appendPaymentIdentifierToExtensions, extractPaymentIdentifier, generatePaymentId,
} from '@x402/extensions/payment-identifier';

/** What the buyer will spend, in tinybars. Atomic integers as strings — never a float, never a `$…`. */
export interface Limits {
  /** Per payment. Also handed to the library's own control, which is the fail-closed backstop. */
  readonly perPaymentTinybars: string;
  /** Cumulative, per UTC day, across runs. ⚠️ The library has no such control — see `spent()`. */
  readonly dailyTinybars: string;
}

/** 0.01 HBAR a payment, 0.05 HBAR a day — ten and fifty reports at the current price. */
export const DEFAULT_LIMITS: Limits = { perPaymentTinybars: '1000000', dailyTinybars: '5000000' };

/** Which control refused, named. ⚠️ A refusal is a decision, not a failure. */
export class SpendRefused extends Error {
  constructor(readonly control: 'asset-not-allowlisted' | 'per-payment-cap' | 'daily-cap', message: string) {
    super(message);
    this.name = 'SpendRefused';
  }
}

export interface Purchase {
  readonly paymentId: string;
  readonly nativeTxId: string;
  readonly settledTransaction: string;
  readonly payer: string;
  readonly amountTinybars: string;
  readonly payTo: string;
  /** The report the gate served — the half the preview page does not. */
  readonly body: unknown;
}

// ─── The daily ledger ────────────────────────────────────────────────────────────────────────────
// ⚠️ **The library's spend control is PER PAYMENT ONLY.** A per-payment cap bounds one mistake; it
// does nothing about a thousand of them. This is the cumulative half, and it has to outlive the
// process or it bounds nothing.
//
// ⚠️ A file under the OS temp directory is right for a CLI agent and wrong for a fleet — it is local,
// per-machine and not durable. A deployed buyer keeps this in the database. Stated rather than
// implied, because "we had a daily cap" is exactly the kind of claim that should not be load-bearing
// without knowing where it lived.

const ledgerPath = (account: string): string => {
  const dir = join(tmpdir(), 'alpha-markets-buyer');
  mkdirSync(dir, { recursive: true });
  return join(dir, `${account.replace(/[^0-9.]/g, '_')}-${new Date().toISOString().slice(0, 10)}.json`);
};

/** Tinybars already spent by this account today, UTC. */
export function spent(account: string): bigint {
  try {
    return BigInt((JSON.parse(readFileSync(ledgerPath(account), 'utf8')) as { tinybars: string }).tinybars);
  } catch {
    return 0n;   // no file for today is a day with no spending
  }
}

function record(account: string, amount: bigint, entry: Record<string, unknown>): void {
  const path = ledgerPath(account);
  let prior: { tinybars: string; payments: unknown[] } = { tinybars: '0', payments: [] };
  try { prior = JSON.parse(readFileSync(path, 'utf8')) as typeof prior; } catch { /* first today */ }
  writeFileSync(path, JSON.stringify({
    tinybars: (BigInt(prior.tinybars) + amount).toString(),
    payments: [...prior.payments, entry],
  }, null, 2));
}

// ─── Buying ──────────────────────────────────────────────────────────────────────────────────────

export interface BuyOptions {
  readonly url: string;
  readonly accountId: string;
  readonly privateKey: string;
  readonly network: string;
  readonly asset: string;
  readonly limits?: Limits;
  /** Called with the decoded challenge before anything is signed, so a human can see the price. */
  readonly onChallenge?: (accepted: PaymentRequirements) => void;
  /** Called with the native transaction id the instant it exists — before the paid request goes out. */
  readonly onSigned?: (nativeTxId: string, paymentId: string) => void;
}

/**
 * ⚠️ **The checks that refuse BEFORE anything is signed**, so a refusal costs nothing and names its
 * own reason. The library's `spendControls` are the fail-closed backstop underneath — this is not a
 * replacement for them, it is the half that can say *which* control said no.
 */
export function vet(accepted: PaymentRequirements, opts: BuyOptions): void {
  const limits = opts.limits ?? DEFAULT_LIMITS;
  if (accepted.asset !== opts.asset) {
    throw new SpendRefused('asset-not-allowlisted',
      `quoted in asset ${accepted.asset}, which this buyer has not allowlisted (holds ${opts.asset}). ` +
      'Refused before signing — an asset we did not opt into is one we cannot value.');
  }
  const amount = BigInt(accepted.amount);
  if (amount > BigInt(limits.perPaymentTinybars)) {
    throw new SpendRefused('per-payment-cap',
      `quoted ${accepted.amount} tinybars against a per-payment cap of ${limits.perPaymentTinybars}.`);
  }
  const already = spent(opts.accountId);
  if (already + amount > BigInt(limits.dailyTinybars)) {
    throw new SpendRefused('daily-cap',
      `quoted ${accepted.amount} tinybars; ${already} already spent today against a daily cap of ` +
      `${limits.dailyTinybars}. The library's control is per-payment only and would have allowed this.`);
  }
}

/**
 * ⚠️ **Mirror Node lags consensus, and the facilitator preflights against Mirror Node.** A first
 * payment after any funding lands inside that window and fails for a reason that has nothing to do
 * with the payment. SM-05 was bitten at both ends of one settlement. Poll rather than assume.
 */
async function awaitIngestion(network: string, accountId: string): Promise<bigint> {
  const mirror = mirrorNodeUrlForNetwork(network as Parameters<typeof mirrorNodeUrlForNetwork>[0]);
  for (let attempt = 0; attempt < 15; attempt++) {
    try {
      const account = await fetchJson<{ balance?: { balance: number } }>(`${mirror}/api/v1/accounts/${accountId}`);
      if (account.balance && account.balance.balance > 0) return BigInt(account.balance.balance);
    } catch { /* not ingested yet */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`${accountId} is not visible on Mirror Node with a balance after 15s.`);
}

export async function buy(opts: BuyOptions): Promise<Purchase> {
  const limits = opts.limits ?? DEFAULT_LIMITS;
  const signer = createClientHederaSigner(
    opts.accountId, PrivateKey.fromStringECDSA(opts.privateKey), { network: opts.network as never },
  );

  // ⚠️ **`spendControls: false` must never appear here.** The error message helpfully suggests it,
  // and it turns an autonomous buyer into something that pays whatever it is asked. `@x402/core`
  // ships these controls ON and fail-closed: HBAR is not a default asset on hedera:testnet, so it has
  // to be opted in explicitly *with its own atomic cap* — which keeps the control working rather than
  // disabling it. That distinction is the whole reason this is safe to run unattended.
  const client = new x402HTTPClient(
    new x402Client()
      .register(opts.network as never, new ExactHederaClientScheme(signer))
      .setSpendControls({
        allowedAssets: [{
          network: opts.network as never,
          asset: opts.asset,
          maxAmountPerPayment: limits.perPaymentTinybars,
        }],
      }),
  );

  await awaitIngestion(opts.network, opts.accountId);

  const unpaid = await fetch(opts.url);
  if (unpaid.status !== 402) throw new Error(`expected 402 from ${opts.url}, got ${unpaid.status}. Not gated.`);

  const challenge = client.getPaymentRequiredResponse(
    (n) => unpaid.headers.get(n), await unpaid.clone().json().catch(() => undefined),
  );
  const accepted = challenge.accepts[0] as PaymentRequirements;
  opts.onChallenge?.(accepted);

  vet(accepted, opts);   // refuses before a single byte is signed

  // ⚠️ §5.9. The gate declares `payment-identifier` as REQUIRED and its `onBeforeSettle` aborts a
  // payment it cannot record, so a buyer that sends no id cannot pay at all. Appended to the
  // challenge's own extensions so `createPaymentPayload` carries it through.
  const paymentId = generatePaymentId();
  const withId = challenge as { extensions?: Record<string, unknown> };
  withId.extensions = appendPaymentIdentifierToExtensions(withId.extensions ?? {}, paymentId);

  const payment = await client.createPaymentPayload(challenge);

  // ⚠️ Checked before spending, not after: if the id did not survive into the payload the gate will
  // abort settlement, and finding that out from a failed payment is the expensive way to learn it.
  if (extractPaymentIdentifier(payment) !== paymentId) {
    throw new Error(`the payment identifier did not survive into the payload — the gate would abort. ` +
      `sent ${paymentId}, payload carries ${extractPaymentIdentifier(payment) ?? 'none'}.`);
  }

  // ⚠️ **The native transaction id, recovered from bytes we already hold and recorded BEFORE the
  // request goes out.** Every Hedera settle failure returns `{ success: false, transaction: "" }` —
  // including a timeout *after* successful broadcast — so a buyer that did not record it beforehand
  // has nothing to reconcile with and either pays twice or gets nothing (§5.8).
  const nativeTxId = inspectHederaTransaction((payment.payload as { transaction: string }).transaction).transactionId;
  record(opts.accountId, BigInt(accepted.amount), {
    at: new Date().toISOString(), paymentId, nativeTxId, url: opts.url,
    amountTinybars: accepted.amount, payTo: accepted.payTo, settled: false,
  });
  opts.onSigned?.(nativeTxId, paymentId);

  const paid = await fetch(opts.url, { headers: client.encodePaymentSignatureHeader(payment) });
  const result = await client.processResponse(paid);

  if (result.paymentStatus !== 'settled') {
    throw new Error(
      `payment did not settle (${result.paymentStatus}). HTTP ${result.status}. ` +
      `⚠️ Native transaction id for reconciliation: ${nativeTxId}. Do NOT retry blind — ` +
      'the money may have moved. Ask Mirror Node about that id first.',
    );
  }

  const settle = result.header as { transaction: string; payer?: string };
  record(opts.accountId, 0n, { at: new Date().toISOString(), paymentId, nativeTxId, settled: true,
    settledTransaction: settle.transaction });

  return {
    paymentId,
    nativeTxId,
    settledTransaction: settle.transaction,
    payer: settle.payer ?? opts.accountId,
    amountTinybars: accepted.amount,
    payTo: accepted.payTo,
    body: result.body,
  };
}

// The checkpoint. Unpaid gets a 402 naming a price and who to pay; paid gets the report.
//
// ⚠️ **Plain `withX402`, default `authorization` flow, exactly as the plan specifies.** Verified
// against the installed 2.25.0 on 2026-09-08 and **not to be re-opened**: `withX402` *is*
// `withX402FromHTTPServer` (`@x402/next/dist/esm/index.js:452` constructs the HTTP server and
// delegates), and eight of the nine hook-registration methods live on `x402ResourceServer`, which
// plain `withX402` already takes as its third argument. Only `onProtectedRequest` needs the other
// wrapper, and that is for serving a re-reader without charging — which Phase 3 does not do (§5.19:
// "serve once").
//
// ⚠️ **Never `paymentProxy`.** It charges for failed responses — measured, `x402-next-2.25.md`. The
// `authorization` flow cancels settle when the handler fails, and that is the only refund substitute
// that exists: Hedera has no refund primitive on any chain today.
//
// ⚠️ **Three branches, not seven.** Unpaid → 402; paid and verified → serve; anything else is the
// wrapper's. The four Own-tier rows of §5.19 are out of scope because the tier is cut, so `balanceOf`
// is never read, and there is no reserve, no already-owner and no 409.
//
// ⚠️ **The handler produces the body BEFORE settlement completes.** That is the `authorization` flow
// working as designed — a throwing handler means settle never runs and nobody is charged — but it
// means a settle that fails *after* a good handler leaves the buyer with the report and the seller
// with nothing. That is the accepted trade against `paymentProxy`, which would charge for failures
// instead. Noted, not solved here; Unit 17's `recover.ts` is what reconciles the ambiguous rows.

import { NextResponse, type NextRequest } from 'next/server.js';
import { withX402 } from '@x402/next';
import type { HTTPRequestContext, RoutesConfig } from '@x402/core/server';
import type { PaymentPayload } from '@x402/core/types';
import { inspectHederaTransaction } from '@x402/hedera';
import {
  PAYMENT_IDENTIFIER, declarePaymentIdentifierExtension, extractPaymentIdentifier,
} from '@x402/extensions/payment-identifier';
import { analystByArcAddress } from '../config/analysts.js';
import { load } from '../store/reports.js';
import { render } from '../agent/narrate.js';
import { db } from '../store/db.js';
import { network, paymentsServer } from './server.js';
import { quote, quoteAmount } from './quotes.js';

/** `/api/reports/<hash>` → `<hash>`. The route pattern is fixed, so the last segment is the hash. */
const hashFromPath = (path: string): string => path.split('/').filter(Boolean).pop() ?? '';

/** The report hash a payment was for, recovered from the resource URL the client echoes back. */
const hashFromPayload = (p: PaymentPayload): string | null => {
  const url = p.resource?.url;
  return url ? hashFromPath(new URL(url).pathname) : null;
};

/**
 * ⚠️ **The payer, derived from the signed bytes rather than waited for.** `SettleResponse.payer` is
 * authoritative but only exists *after* settle, and `purchases.payer` is `NOT NULL` on a row that
 * must be written *before* it. Under the `exact` scheme the buyer signs a transfer with exactly one
 * negative leg — itself — and the facilitator adds the fee afterwards, so the negative entry is the
 * payer. `onAfterSettle` overwrites this with the facilitator's answer as soon as there is one.
 */
const payerFromTransfers = (transaction: string): string | null =>
  inspectHederaTransaction(transaction).hbarTransfers.find((t) => BigInt(t.amount) < 0n)?.accountId ?? null;

const transactionOf = (p: PaymentPayload): string => (p.payload as { transaction?: string }).transaction ?? '';

/**
 * The gated handler. ⚠️ **It only ever reads an already-persisted body (§5.7).** If it ever
 * generated one, the ~120-second Hedera validity window would land on the critical path and "charged
 * with nothing delivered" would become reachable. Generation is `scripts/ops/report.ts`'s job.
 */
async function serveReport(request: NextRequest): Promise<NextResponse> {
  const hash = hashFromPath(new URL(request.url).pathname);
  const report = await load(hash);
  // Unreachable in practice — the route 404s before any payment machinery runs — but a handler that
  // returns >= 400 is also how the wrapper is told to cancel settlement, so this stays.
  if (!report) return NextResponse.json({ error: 'no such report' }, { status: 404 });

  return NextResponse.json({
    hash,
    directive: report.subject.directive,
    analyst: report.analyst,
    block: report.block,
    observedAt: report.observedAt,
    markdown: render(report, hash),
  });
}

/**
 * ⚠️ **Hooks are attached ONCE, and this memo is why.** `paymentsServer()` returns a memoized
 * instance and `onBeforeSettle` *appends* to a hook list — chaining per request would register the
 * hooks again on every call and write the `purchases` row N times for the Nth request. The gated
 * handler is built once and reused, which pins both.
 */
let gated: ((request: NextRequest) => Promise<NextResponse>) | null = null;

export function gate(): (request: NextRequest) => Promise<NextResponse> {
  if (gated) return gated;
  const cfg = network();

  const routes: RoutesConfig = {
    '/api/reports/[hash]': {
      description: 'One verified DeFi protocol report — figures, market table and analyst assessment.',
      mimeType: 'application/json',
      // ⚠️ §5.9. Required, so a client must supply an idempotency key it can retry with.
      // ⚠️ **Keyed by `PAYMENT_IDENTIFIER`, not spread.** Spreading puts `info` and `schema` at the
      // top of `extensions`, where `appendPaymentIdentifierToExtensions` cannot find the declaration
      // — the client would then send no id and `onBeforeSettle` would abort every payment as
      // unrecordable. Caught by decoding a live challenge rather than by reading the types.
      extensions: { [PAYMENT_IDENTIFIER]: declarePaymentIdentifierExtension(true) },
      accepts: [{
        scheme: 'exact',
        network: cfg.network,
        maxTimeoutSeconds: 120,
        // ⚠️ **payTo comes from the report's analyst row, never from env.** DECISIONS.md 2026-09-08:
        // each analyst has its own Hedera account, so reading it from a shared variable would mean a
        // second analyst's sales paying the first. This is also the field that was empty for eleven
        // units precisely because it was read from env with a fallback.
        payTo: async (ctx: HTTPRequestContext) => {
          const report = await load(hashFromPath(ctx.path));
          if (!report) throw new Error(`no report ${hashFromPath(ctx.path)} to price`);
          return analystByArcAddress(report.analyst).hederaAccountId;
        },
        // ⚠️ The price is the QUOTE's, frozen before the challenge — not the constant. Unit 13 reuses
        // a live quote rather than minting one per request, so this does not grow the table.
        price: async (ctx: HTTPRequestContext) => {
          const q = await quote(hashFromPath(ctx.path));
          if (!q) throw new Error(`no report ${hashFromPath(ctx.path)} to quote`);
          return quoteAmount(q, cfg.asset);
        },
      }],
    },
  };

  const server = paymentsServer()
    /**
     * ⚠️ **The native transaction id is written BEFORE settle, and this is the whole reason.** Every
     * Hedera settle failure returns `{ success: false, transaction: "" }` — *including a timeout
     * after the transaction was already broadcast*. So after a failure there is nothing left to
     * reconcile against, and the id is recoverable only from bytes we already hold. SM-05 proved
     * this against a real settlement (§5.8).
     *
     * ⚠️ **If the row cannot be written, settle is ABORTED rather than attempted.** An unrecorded
     * charge is worse than an uncharged reader: money would move with nothing tying it to a report.
     */
    .onBeforeSettle(async ({ paymentPayload }) => {
      const reportHash = hashFromPayload(paymentPayload as PaymentPayload);
      const paymentId = extractPaymentIdentifier(paymentPayload as PaymentPayload);
      const transaction = transactionOf(paymentPayload as PaymentPayload);
      const nativeTxId = transaction ? inspectHederaTransaction(transaction).transactionId : '';
      const payer = transaction ? payerFromTransfers(transaction) : null;

      if (!reportHash || !paymentId || !nativeTxId || !payer) {
        return {
          abort: true,
          reason: 'unrecordable_payment',
          message: 'Refusing to settle a payment that cannot be recorded — ' +
            `report=${reportHash ?? 'null'} paymentId=${paymentId ?? 'null'} ` +
            `nativeTxId=${nativeTxId || 'null'} payer=${payer ?? 'null'}.`,
        };
      }

      // ⚠️ `payment_id` is the PRIMARY KEY and that is §5.9's idempotency mechanism: a client
      // retrying with the same id must not produce a second row and must not settle twice.
      await db()`
        INSERT INTO purchases (payment_id, report_hash, payer, native_tx_id)
        VALUES (${paymentId}, ${reportHash}, ${payer}, ${nativeTxId})
        ON CONFLICT (payment_id) DO NOTHING`;
      return undefined;
    })
    /** Settlement landed. Record when, and replace the derived payer with the facilitator's. */
    .onAfterSettle(async ({ paymentPayload, result }) => {
      const paymentId = extractPaymentIdentifier(paymentPayload as PaymentPayload);
      if (!paymentId || !result.success) return;
      await db()`
        UPDATE purchases
        SET settled_at = now(), payer = ${result.payer ?? null}
        WHERE payment_id = ${paymentId} AND settled_at IS NULL`;
    });

  // ⚠️ `delivered_at` stays null in this unit, deliberately. Delivery is only true once the response
  // reaches the buyer, which a server cannot observe — that gap is exactly what §5.9's
  // payment-identifier retry exists for, and Unit 17 is what resolves it.
  gated = withX402(serveReport, routes, server);
  return gated;
}

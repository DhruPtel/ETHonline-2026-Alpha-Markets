// GET /api/console/state — everything the console displays about what already exists.
//
// ⚠️ **THROWAWAY, like everything under `app/console/` and `app/api/console/`.** Delete the two
// directories before submission. Nothing in the product imports this.
//
// ⚠️ **`list()` is the real reader and is used as-is.** The tables below it are read with raw SQL
// through the exported `db()` client, and that is deliberate rather than lazy: `store/tokens.ts`
// returns a `ReportToken` that omits the transaction hashes on purpose ("the tx hashes are ours"),
// and no reader exists for `quotes` or `purchases` at all. The console is the ours-side — it needs
// `transfer_tx` to say whether a token moved, and `deploy_tx`/`issue_tx` to link to HashScan. The
// alternative was adding readers to `src/`, which this unit may not do. `scripts/ops/tokenize.ts`
// and `scripts/ops/move-token.ts` both read these same tables the same way.
//
// ⚠️ **Never calls `close()`.** That is for scripts, which have to exit; `store/tokens.ts` says a
// route handler must not. Closing the pool here would break the next request.

import { NextResponse } from 'next/server.js';
import { list } from '../../../../src/store/reports.js';
import { db } from '../../../../src/store/db.js';
import { REPORT_PRICE_HBAR, REPORT_PRICE_TINYBARS } from '../../../../src/config/pricing.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The token row as the console needs it — the whole row, unlike `store/tokens.ts`'s reduced view. */
interface TokenRow {
  report_hash: string;
  proxy_address: string;
  isin: string;
  deploy_tx: string;
  issue_tx: string;
  transfer_tx: string | null;
  issued_at: Date;
}

interface QuoteRow {
  id: string;
  report_hash: string;
  price_tinybars: string;
  state: string;
  expires_at: Date;
  created_at: Date;
}

interface PurchaseRow {
  payment_id: string;
  report_hash: string;
  payer: string;
  native_tx_id: string;
  settled_at: Date | null;
  delivered_at: Date | null;
  created_at: Date;
}

export async function GET(): Promise<NextResponse> {
  try {
    const sql = db();
    // One round of queries, not one per report — the index page's `tokensFor` makes the same point.
    const [reports, tokens, quotes, purchases] = await Promise.all([
      list(),
      sql<TokenRow[]>`
        SELECT report_hash, proxy_address, isin, deploy_tx, issue_tx, transfer_tx, issued_at
        FROM report_tokens ORDER BY issued_at DESC`,
      sql<QuoteRow[]>`
        SELECT id, report_hash, price_tinybars, state, expires_at, created_at
        FROM quotes ORDER BY created_at DESC LIMIT 25`,
      sql<PurchaseRow[]>`
        SELECT payment_id, report_hash, payer, native_tx_id, settled_at, delivered_at, created_at
        FROM purchases ORDER BY created_at DESC LIMIT 25`,
    ]);

    const byHash = new Map(tokens.map((t) => [t.report_hash, t]));

    return NextResponse.json({
      price: { tinybars: REPORT_PRICE_TINYBARS, hbar: REPORT_PRICE_HBAR },
      reports: reports.map((r) => {
        const token = byHash.get(r.hash);
        return {
          hash: r.hash,
          directive: r.directive,
          analyst: r.analyst,
          block: r.block,
          createdAt: r.createdAt,
          token: token
            ? {
                isin: token.isin,
                proxyAddress: token.proxy_address,
                deployTx: token.deploy_tx,
                issueTx: token.issue_tx,
                // null here is the console's most-asked question: has this token ever moved?
                transferTx: token.transfer_tx,
                issuedAt: token.issued_at,
              }
            : null,
        };
      }),
      quotes,
      purchases,
    });
  } catch (error) {
    // A readable 503 rather than a thrown handler — same shape as `/api/health`.
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 503 },
    );
  }
}

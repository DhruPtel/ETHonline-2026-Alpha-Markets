// What is being sold, and at what price, frozen before the 402 goes out.
//
// ⚠️ **This unit does not decide a price.** `config/pricing.ts` holds it — 100,000 tinybars, the
// figure SM-05 settled a real payment with. What happens here is *recording* that a specific report
// was offered at a specific price at a specific moment, so a settlement can be matched back to what
// it was for.
//
// ⚠️ **Quote before work, always.** `upto` has no Hedera binding and `setSettlementOverrides` is not
// scheme-gated in code — calling it on a Hedera `exact` route produces a generated report, a 200 and
// a *failed settle*. A free report. The price is deterministic and stated up front, which is what
// makes that path unreachable rather than merely discouraged.
//
// ⚠️ **No recipient, no reservation, no tier.** The Own tier is cut (DECISIONS.md 2026-09-08), so
// nothing is held against a supply of one and there is no second identifier to bind. `tier` and
// `recipient` stay nullable and unwritten.
//
// ⚠️ **No `payTo` here** — the table has no such column and it is not this unit's to know. It belongs
// on the challenge, which Unit 14 resolves per request through `DynamicPayTo` from the report's
// analyst row via `analystByArcAddress()`.

import { randomUUID } from 'node:crypto';
import type { AssetAmount } from '@x402/core/types';
import { REPORT_PRICE_TINYBARS } from '../config/pricing.js';
import { pooled } from '../store/db.js';

/**
 * ⚠️ **A third memoized pool in this repo, and that is now worth fixing.** `store/reports.ts` and
 * `store/tokens.ts` each keep their own client and neither exports it, so every new module that
 * touches the database opens another. Three copies of this pattern is the point at which a shared
 * accessor in `db.ts` stops being a nicety — flagged rather than done, because `db.ts` is out of
 * scope for this unit.
 */
let client: ReturnType<typeof pooled> | null = null;
const db = () => (client ??= pooled());

/** For scripts, which have to exit. A route handler should never call this. */
export async function close(): Promise<void> {
  if (client) { await client.end(); client = null; }
}

/**
 * ⚠️ **90 seconds, deliberately under Hedera's ~120-second transaction validity window.** A quote
 * that outlives the window is a quote a buyer cannot act on, and the failure would surface as a
 * settlement error — the hardest kind to diagnose, because nothing about it says "stale quote".
 * The headroom is for the buyer: it receives the 402, signs and submits, and *its* transaction then
 * gets its own validity window on top of this.
 */
export const QUOTE_TTL_SECONDS = 90;

export interface Quote {
  readonly id: string;
  readonly reportHash: string;
  /**
   * ⚠️ **A string, not a number, and no coercion happens anywhere.** `price_tinybars` is `BIGINT`,
   * which the `postgres` driver returns as a JavaScript string, and `AssetAmount.amount` is typed
   * `string`. The two line up exactly — see `config/pricing.ts`. Do not "fix" either end.
   */
  readonly priceTinybars: string;
  readonly expiresAt: Date;
  /**
   * ⚠️ **`'expired'` is a value nothing writes, and that is intentional.** Expiry is a fact about
   * time, not a stored flag: nothing sweeps this table, so a stored `'expired'` would only ever be
   * as fresh as the last sweep that did not run. `state` records *settlement* — Unit 14 moves a row
   * to `'settled'`. A row that is `'open'` and past `expiresAt` is not a contradiction; it means the
   * offer lapsed without ever being paid. Read liveness through `isLive()`, never through `state`.
   */
  readonly state: 'open' | 'settled' | 'expired';
  readonly createdAt: Date;
}

interface QuoteRow {
  id: string; report_hash: string; price_tinybars: string;
  expires_at: Date; state: Quote['state']; created_at: Date;
}

const toQuote = (r: QuoteRow): Quote => ({
  id: r.id,
  reportHash: r.report_hash,
  priceTinybars: r.price_tinybars,
  expiresAt: r.expires_at,
  state: r.state,
  createdAt: r.created_at,
});

const COLUMNS = 'id, report_hash, price_tinybars, expires_at, state, created_at';

/** Is this offer still standing? ⚠️ Time decides, and `state` only says whether it was paid. */
export function isLive(q: Quote, at: Date = new Date()): boolean {
  return q.state === 'open' && q.expiresAt.getTime() > at.getTime();
}

/**
 * The quote's frozen price as an `AssetAmount`, for whatever builds the challenge.
 *
 * ⚠️ **From the QUOTE's price, never from the constant.** Freezing a price and then advertising a
 * different one would make the row a decoration. ⚠️ The asset arrives as a parameter for the same
 * reason it does in `pricing.ts`: importing `@x402/hedera` for one string pulled 2.24 MB of
 * `@hiero-ledger/sdk` into two pages, measured 2026-09-08. Unit 14 has it loaded already.
 */
export function quoteAmount(q: Quote, asset: string): AssetAmount {
  return { asset, amount: q.priceTinybars };
}

/**
 * Freeze what a report is being sold for. `null` if there is no such report.
 *
 * ⚠️ **The report is checked explicitly rather than left to the foreign key.** `quotes.report_hash`
 * references `reports(hash)`, so an insert for an unknown report would fail anyway — but a constraint
 * violation surfacing out of the payment path is a much worse error than declining at the boundary,
 * and it would arrive as a 500 where a 404 belongs.
 *
 * ⚠️ **An existing live quote at the current price is REUSED, not replaced or duplicated.** Every
 * unpaid request to a gated report produces a 402, every report is publicly linked from the index,
 * and a row per unpaid request would let anything that crawls the site grow this table without
 * bound. Reuse also gives a buyer that retries the same quote id to match a settlement against.
 * ⚠️ Reuse is filtered on the price as well as on liveness, so a price change stops reusing
 * immediately rather than serving the old figure for up to `QUOTE_TTL_SECONDS`.
 */
export async function quote(reportHash: string): Promise<Quote | null> {
  const [report] = await db()<{ hash: string }[]>`SELECT hash FROM reports WHERE hash = ${reportHash}`;
  if (!report) return null;

  const [existing] = await db()<QuoteRow[]>`
    SELECT ${db().unsafe(COLUMNS)} FROM quotes
    WHERE report_hash = ${reportHash}
      AND state = 'open'
      AND expires_at > now()
      AND price_tinybars = ${REPORT_PRICE_TINYBARS}
    ORDER BY expires_at DESC LIMIT 1`;
  if (existing) return toQuote(existing);

  // ⚠️ `expires_at` is computed by the DATABASE, not by this process. The row's `created_at` defaults
  // to the database's `now()`, and a quote whose lifetime was measured against a drifting application
  // clock could be born already expired relative to its own creation timestamp.
  const [row] = await db()<QuoteRow[]>`
    INSERT INTO quotes (id, report_hash, price_tinybars, expires_at)
    VALUES (${randomUUID()}, ${reportHash}, ${REPORT_PRICE_TINYBARS},
            now() + ${`${QUOTE_TTL_SECONDS} seconds`}::interval)
    RETURNING ${db().unsafe(COLUMNS)}`;
  return toQuote(row!);
}

/** One quote by id — what Unit 14 matches a settlement back against. */
export async function quoteById(id: string): Promise<Quote | null> {
  const [row] = await db()<QuoteRow[]>`
    SELECT ${db().unsafe(COLUMNS)} FROM quotes WHERE id = ${id}`;
  return row ? toQuote(row) : null;
}

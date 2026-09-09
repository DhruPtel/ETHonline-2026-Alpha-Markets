// Which report has a token, and where it lives on Hedera.
//
// ⚠️ **A separate file from `reports.ts`, deliberately.** That file is proved — a real 140-fact report
// round-trips through it with its identity intact — and Unit 8's brief kept out of it on purpose.
// `report_tokens` is a different table with a different lifecycle: a report exists the moment it is
// generated, and a token exists only if someone later paid 7.7 HBAR to mint one. Joining them inside
// `reports.ts` would make every read of a report also a read about its token.
//
// ⚠️ **This module is read-only; the table has two writers, and neither is here.** `tokenize/ats.ts`
// inserts the row in the same call that deploys the proxy, because a row written anywhere else could
// name an asset nobody minted. `tokenize/transfer.ts` then UPDATEs `transfer_tx` after it has
// asserted both balances moved. Both write through `db()` directly rather than through a writer on
// this file.
//
// ⚠️ **This header used to say "`tokenize/ats.ts` is the only writer", and Unit 10 made that false**
// on 2026-09-08 without touching this file — `transfer.ts` was the unit's scope and this was not.
// Corrected 2026-09-09. If a writer is ever added here, it should take both paths, not just the one
// a brief happens to name.

import { closePool, db } from './db.js';

// ⚠️ **The shared client, not one of this module's own.** Consolidated into `db.ts` on 2026-09-08:
// three modules each memoized their own, so a request touching all three opened three connections
// against a Neon pool that caps them — and a connection-limit failure presents as a timeout rather
// than as a limit error. `db()` keeps the lazy, never-at-module-scope property that mattered before.
//
// For scripts, which have to exit. A route handler should never call this. ⚠️ Idempotent.
export { closePool as close };

/** What a reader needs to know about a report's token. Not the whole row — the tx hashes are ours. */
export interface ReportToken {
  readonly reportHash: string;
  /** The ResolverProxy's EVM address. What HashScan and Sourcify are addressed by. */
  readonly proxyAddress: string;
  /** ISO 6166 identifier, derived from the report hash — see `tokenize/isin.ts`. */
  readonly isin: string;
  readonly issuedAt: Date;
}

interface TokenRow {
  report_hash: string;
  proxy_address: string;
  isin: string;
  issued_at: Date;
}

const toToken = (r: TokenRow): ReportToken => ({
  reportHash: r.report_hash,
  proxyAddress: r.proxy_address,
  isin: r.isin,
  issuedAt: r.issued_at,
});

/** The token for one report, or `null` if it was never tokenized. Most reports have no token. */
export async function tokenFor(reportHash: string): Promise<ReportToken | null> {
  const [row] = await db()<TokenRow[]>`
    SELECT report_hash, proxy_address, isin, issued_at
    FROM report_tokens WHERE report_hash = ${reportHash}`;
  return row ? toToken(row) : null;
}

/**
 * Tokens for a page of reports, keyed by report hash.
 *
 * ⚠️ **One query for the whole page, not one per row.** The index renders every report it lists, and
 * calling `tokenFor` in a loop would be a query per report — the shape that looks fine at two rows
 * and is a page-load problem at fifty. Absent keys mean "no token", which is the common case.
 */
export async function tokensFor(reportHashes: readonly string[]): Promise<Map<string, ReportToken>> {
  if (reportHashes.length === 0) return new Map();
  const rows = await db()<TokenRow[]>`
    SELECT report_hash, proxy_address, isin, issued_at
    FROM report_tokens WHERE report_hash IN ${db()(reportHashes as string[])}`;
  return new Map(rows.map((r) => [r.report_hash, toToken(r)]));
}

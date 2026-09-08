// Which report has a token, and where it lives on Hedera.
//
// ⚠️ **A separate file from `reports.ts`, deliberately.** That file is proved — a real 140-fact report
// round-trips through it with its identity intact — and Unit 8's brief kept out of it on purpose.
// `report_tokens` is a different table with a different lifecycle: a report exists the moment it is
// generated, and a token exists only if someone later paid 7.7 HBAR to mint one. Joining them inside
// `reports.ts` would make every read of a report also a read about its token.
//
// ⚠️ **Read-only. `tokenize/ats.ts` is the only writer** — it inserts the row in the same call that
// deploys the proxy, because a row written anywhere else could name an asset nobody minted.

import { pooled } from './db.js';

/**
 * ⚠️ **A second memoized pool, and that is a real cost of the file separation.** `reports.ts` keeps
 * its own client and does not export it, so this file cannot share one — `pooled()` constructs a new
 * client per call. Two clients means two connection pools in a warm serverless invocation. It is
 * acceptable at this size and it is not free; the fix, if it ever matters, is a shared accessor in
 * `db.ts` rather than a third copy of this pattern in the next store module.
 */
let client: ReturnType<typeof pooled> | null = null;
const db = () => (client ??= pooled());

/** For scripts, which have to exit. A route handler should never call this. */
export async function close(): Promise<void> {
  if (client) { await client.end(); client = null; }
}

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

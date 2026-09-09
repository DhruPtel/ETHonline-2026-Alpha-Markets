// The connections, and nothing else. No queries live here — `save`, `load` and `list` are Unit 5.
//
// Two endpoints and one shared client:
//
//   `pooled()` / `direct()`  construct. Every call builds a new client.
//   `db()`                   the SHARED pooled client — memoized, and what every module should use.
//   `closePool()`            closes it. Scripts only.
//
// ⚠️ **Two URLs, two purposes, and they are not interchangeable.** Neon's pooled endpoint goes
// through PgBouncer in transaction mode, which does not carry the session-level state DDL needs.
// Running a migration through the pooled URL does not fail cleanly — it fails on prepared statements
// and session settings, and the errors read like a schema bug in the `.sql` file rather than a
// connection one. Verified before this file was written: the pooled host contains `-pooler` and the
// direct host does not.
//
//   DATABASE_URL         pooled — route handlers, many short-lived connections
//   DATABASE_URL_DIRECT  direct — migrations only
//
// ⚠️ **An empty env var is a missing env var.** `??` falls back on `undefined` and never on `""`,
// and this project shipped a 402 challenge carrying an empty `payTo` for exactly that reason — it
// read as a facilitator error and was a config one. `required()` below treats empty as absent.

import postgres from 'postgres';
import { requiredEnv } from '../config/env.js';

/**
 * ⚠️ **The sentence that would have saved Unit 4's first attempt**, when `DATABASE_URL` and
 * `DATABASE_URL_DIRECT` were byte-identical and both pointed at the pooled host — a failure that
 * reads like a bug in the `.sql` file rather than a wrong connection.
 *
 * It lives here, at the call site, rather than inside the guard: it is correct for exactly these two
 * variables and wrong for every other one in the project. ⚠️ Neon advice must never appear on
 * `HEDERA_SELLER_KEY`. `config/env.ts` supplies the mechanism; this supplies the context.
 */
const NEON_ENDPOINTS =
  'DATABASE_URL is Neon\'s POOLED endpoint (host contains "-pooler") and DATABASE_URL_DIRECT is ' +
  'the direct one (host does not). They are different endpoints and are not interchangeable.';

/**
 * ⚠️ Throws at the point of use rather than returning a default. A connection string is not
 * something to guess at: a wrong-but-present value connects to something, and the failure surfaces
 * as missing rows rather than as a bad configuration.
 *
 * ⚠️ **This used to be a local copy of the guard, and five other files had their own.** Consolidated
 * into `config/env.ts` on 2026-09-09 — three documents had pointed at this copy as "the pattern"
 * while nothing imported it. The message is unchanged: the base sentence plus `NEON_ENDPOINTS`.
 */
const required = (name: string): string => requiredEnv(name, NEON_ENDPOINTS);

/**
 * ⚠️ **Lazy, not module scope.** Constructing a client at import time means a missing env var
 * becomes a crash on cold start of every route that transitively imports this file — the same shape
 * as §5.17's `initialize()` problem, where a config error reads as a platform outage. Calling the
 * function is what connects.
 *
 * `postgres` is lazy about the socket too: the pool opens on first query, not on construction.
 */
export const pooled = () => {
  clientsCreated += 1;
  return postgres(required('DATABASE_URL'), {
    // Neon terminates idle pooled connections; a serverless invocation is short and should not hold
    // one open waiting to be reaped.
    idle_timeout: 20,
    // ⚠️ Off because PgBouncer in transaction mode cannot guarantee the same backend across
    // statements, which is what a named prepared statement needs.
    prepare: false,
  });
};

// ─── The shared pooled client ────────────────────────────────────────────────────────────────────
//
// ⚠️ **`pooled()` CONSTRUCTS; `db()` is the one everything should call.** Every call to `pooled()`
// builds a new client with its own connection pool. Three modules — `store/reports.ts`,
// `store/tokens.ts` and `payments/quotes.ts` — each memoized their own, so a request touching all
// three opened three, and Unit 14's gate would have made it four.
//
// ⚠️ **Why that matters more on Vercel than it looks.** Each invocation is its own process and Neon
// caps concurrent connections, so four-per-request instead of one reaches the ceiling four times
// sooner — and a connection-limit failure presents as a *timeout*, not as a limit error. That is a
// confusing failure at exactly the moment the payment path is under load.

let client: ReturnType<typeof pooled> | null = null;

/**
 * How many pooled clients this process has constructed.
 *
 * ⚠️ **Nothing branches on it and, as of 2026-09-09, nothing reads it either** — it has no caller in
 * `src/`, `app/` or `scripts/`. Kept rather than deleted because the number it counts is the thing
 * this section of the file exists to keep at one, and a leak (see `tokenize/ats.ts`) is invisible
 * without it. Removing it is a code change and belongs in its own commit.
 */
let clientsCreated = 0;
export const pooledClientsCreated = (): number => clientsCreated;

/**
 * The shared pooled client. **Lazy and memoized — call this, do not call `pooled()`.**
 *
 * Same property `pooled()` has and for the same reason: constructing at module scope turns a missing
 * env var into a cold-start crash on every route that transitively imports this file. Calling the
 * function is what connects, and a warm invocation reuses one client.
 */
export function db(): ReturnType<typeof pooled> {
  return (client ??= pooled());
}

/**
 * Close the shared client. **For scripts, which have to exit — a route handler must never call it.**
 *
 * ⚠️ **Idempotent, because it has more than one caller now.** `reports.ts`, `tokens.ts` and
 * `quotes.ts` all re-export this as their own `close`, and a script that closes two of them would
 * otherwise call `end()` twice on the same client. The reference is cleared before awaiting, so a
 * second call is a no-op rather than a second `end()`.
 */
export async function closePool(): Promise<void> {
  if (!client) return;
  const closing = client;
  client = null;
  await closing.end();
}

/**
 * ⚠️ **Migrations only.** One connection, no pool: DDL is a single serial operation run by a human
 * or a script, never by a request.
 */
export const direct = () => postgres(required('DATABASE_URL_DIRECT'), {
  max: 1,
  idle_timeout: 5,
  // ⚠️ Idempotent DDL is noisy BY DESIGN — a second run emits `relation "x" already exists, skipping`
  // for every object. The default handler dumps the whole notice object, stack-frame fields and all,
  // which reads like a failure on the one run that is proving nothing broke. Printed as one line
  // instead: the information is kept, because a notice we did not expect is worth seeing.
  onnotice: (notice) => console.log(`  notice   ${notice.message}`),
});

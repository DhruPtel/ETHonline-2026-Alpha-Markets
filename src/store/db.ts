// The two connections, and nothing else. No queries live here — `save`, `load` and `list` are Unit 5.
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

/**
 * ⚠️ Throws at the point of use rather than returning a default. A connection string is not
 * something to guess at: a wrong-but-present value connects to something, and the failure surfaces
 * as missing rows rather than as a bad configuration.
 */
function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `${name} is not set (or is set to an empty string). ` +
      'DATABASE_URL is Neon\'s POOLED endpoint (host contains "-pooler") and DATABASE_URL_DIRECT is ' +
      'the direct one (host does not). They are different endpoints and are not interchangeable.',
    );
  }
  return value;
}

/**
 * ⚠️ **Lazy, not module scope.** Constructing a client at import time means a missing env var
 * becomes a crash on cold start of every route that transitively imports this file — the same shape
 * as §5.17's `initialize()` problem, where a config error reads as a platform outage. Calling the
 * function is what connects.
 *
 * `postgres` is lazy about the socket too: the pool opens on first query, not on construction.
 */
export const pooled = () => postgres(required('DATABASE_URL'), {
  // Neon terminates idle pooled connections; a serverless invocation is short and should not hold
  // one open waiting to be reaped.
  idle_timeout: 20,
  // ⚠️ Off because PgBouncer in transaction mode cannot guarantee the same backend across
  // statements, which is what a named prepared statement needs.
  prepare: false,
});

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

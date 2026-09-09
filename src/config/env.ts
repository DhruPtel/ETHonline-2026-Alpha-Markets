// Reading an environment variable that must be there.
//
// ⚠️ **An empty env var is a missing env var, and that is the whole reason this file exists.**
// `process.env.X ?? fallback` returns `""` when the variable is set-but-blank, because `??` falls
// back on `undefined` and never on `""`. This project has been bitten by that **five times** against
// four different variables — most visibly a live 402 challenge that advertised `payTo: ""`, which
// read as a facilitator fault and was a configuration one, and most recently `HEDERA_SELLER_KEY`
// found blank in Vercel Production on 2026-09-09. `??` is never the mechanism. This is.
//
// ── Why this is its own file, and why in `config/` ───────────────────────────────────────────────
//
// ⚠️ **There were SIX copies of this guard** — `store/db.ts`, `payments/server.ts`, `tokenize/ats.ts`,
// `tokenize/transfer.ts` and the two console routes — and three documents pointed at `db.ts`'s as
// "the pattern" while nobody imported it. Six copies of a guard that has already fired five times is
// how the seventh gets a subtly different message.
//
// Every other home was worse than the duplication, which is why this file was created rather than a
// copy being promoted:
//
//   `store/db.ts`                  the store is the wrong place for a general guard
//   `payments/server.ts`           store and tokenize would import payments for a string guard
//   `tokenize/ats.ts` / `transfer` both import `src/store/`, so `db.ts` importing back is a CYCLE
//   the console routes             throwaway; they are deleted before submission
//
// ⚠️ **This file imports NOTHING — not even a type.** That is the property that lets `store/`,
// `payments/`, `tokenize/` and the route handlers all import it without any possibility of a cycle,
// and it is the reason `config/` is the right neighbourhood: one concern per file, and the config
// layer sits underneath everything else. ⚠️ Keep it that way. An import here is a cycle waiting for
// the next module that needs a guard.
//
// ⚠️ `scripts/smoke/` is deliberately excluded. Those are frozen Phase 0 tests and their own copies
// are correct as they ran; rewriting a passing test to import a module written after it would make
// the test describe today rather than what it proved.

/**
 * The value of `name`, trimmed, or a throw naming the variable.
 *
 * ⚠️ **Empty and whitespace-only are both "missing".** `"   "` is what a copy-paste into a dashboard
 * field produces, and it is not a value. The trimmed string is what comes back, so a caller never
 * has to trim again.
 *
 * ⚠️ **Throws at the point of use rather than returning a default.** A connection string, a key or a
 * network name is not something to guess at: a wrong-but-present value connects to *something*, and
 * the failure then surfaces as missing rows or a payment that will not settle, rather than as the
 * configuration error it is. There is no fallback parameter and there should not be one.
 *
 * @param hint Optional extra sentence appended to the message. ⚠️ **The caller supplies the context;
 *   this function supplies the mechanism.** `store/db.ts` passes the Neon POOLED/DIRECT explanation
 *   — the sentence that would have saved Unit 4's first attempt, when both connection strings
 *   pointed at the pooled host and the failure read like a bug in the `.sql` file. That advice is
 *   correct for two variables and wrong for every other, so it lives at its call site and **must
 *   never appear on `HEDERA_SELLER_KEY`**.
 */
export function requiredEnv(name: string, hint?: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not set (or is set to an empty string).${hint ? ` ${hint}` : ''}`);
  }
  return value;
}

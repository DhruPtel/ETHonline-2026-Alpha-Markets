// ⚠️ ════ TEMPORARILY UNWIRED — 2026-09-12. NOTHING CALLS `locked()` RIGHT NOW. ════════════════
//
// **This module is intact and correct; the six console routes have their `locked(request)` call
// commented out.** The lock exists for a public deployment where `/console` is one click from the
// front door and its buttons spend real funds. That is not the situation while the frontend is
// being wired on one machine, and requiring a pasted secret on every console surface was costing
// more than it protected.
//
// ⚠️ **DO NOT DELETE THIS FILE, and do not delete `CONSOLE_SECRET` from `.env` or `.env.example`.**
// Re-wiring is two uncommented lines per route and nothing else.
//
// ⚠️ **What puts it back, and it is not a matter of taste:** the console being linked from the nav
// on a deployment a stranger can reach. `generate` burns Anthropic budget, `tokenize` mints a
// permanent ATS asset for ~7.7 HBAR, `transfer` moves one, and `source` spends Graph quota — all
// from any URL. `tracking/DECISIONS.md` 2026-09-12 carries the full entry.
//
// ⚠️ **Nothing else lost a guard.** `/api/reports/[hash]` is the x402 gate and is untouched — it
// works for a completely different reason, a settled on-chain payment verifiable by a stranger.
// Both cron routes keep `CRON_SECRET`, which is a different mechanism for a caller that is never
// a human at a keyboard.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// The console doorlock. ⚠️ **A shared secret, NOT authentication, and the difference is the point.**
//
// ⚠️ **What this defends against, exactly:** a stranger who finds `/console` — one click from the
// front door once the nav ships — pressing a button and spending our money out of curiosity.
// `/api/console/generate` burns Anthropic budget; `/api/console/tokenize` mints a permanent ATS
// asset for ~7.7 HBAR; `/api/console/transfer` moves one. Until now all three answered anybody.
//
// ⚠️ **What it is NOT, said here so nobody upgrades it by accident.** It identifies nobody. It is one
// value shared by every operator, with no rotation, no expiry, no audit trail and no rate limit.
// It is a lock on a door, not a record of who came through it. **`payments/auth.ts` is still the
// declared cut point and this does not reopen it.**
//
// ⚠️ **IT MUST NEVER TOUCH THE PAYWALL.** `/api/reports/[hash]` is gated by x402 and works for a
// completely different reason — a settled on-chain payment, verifiable by a stranger, with no shared
// state between the buyer and us. Putting a shared secret anywhere near that would replace a
// cryptographic boundary with a password. ⚠️ **`/api/buy` is also deliberately unlocked**: it moved
// out of this directory in Unit 1 and is what the paywall button on `/report/[hash]` calls, so a lock
// there would break the product's only purchase path.
//
// ── ⚠️ Where the secret lives, and the honest limit of that ──────────────────────────────────────
//
// **The operator types it into a field on `/console`. It is never built into anything.** That is the
// whole reason this is a lock rather than theatre: `NEXT_PUBLIC_CONSOLE_SECRET` would be **inlined
// into the client bundle at build time and served to every visitor**, which is not a secret, it is a
// string in a `<script>` tag. So the value only ever exists in the environment (server side) and in
// the operator's head (browser side), and the two meet in a request header.
//
// ⚠️ **The corollary: this works only because a human is at the keyboard.** It offers nothing to an
// automated caller, and the moment something unattended needs one of these routes, this is the wrong
// mechanism and `CRON_SECRET`'s shape is the right one.
//
// ── ⚠️ Ordering, and it is what makes the lock testable from outside ─────────────────────────────
//
// `requiredEnv` runs BEFORE the comparison. So a **500 means the secret is absent or blank in the
// environment** and a **401 means it is set and the caller got it wrong** — the same property that
// let `CRON_SECRET` be verified on the deployment without ever knowing its value (logs.md
// 2026-09-11T17:50Z). ⚠️ **An empty env var is a missing env var**: `??` falls back on `undefined`
// and never on `""`, which this project has shipped six times including once inside a vendor bundle.
// `config/env.ts` is the one guard and it is why this file imports nothing else.

import { NextResponse } from 'next/server.js';
import { createHash, timingSafeEqual } from 'node:crypto';
import { requiredEnv } from '../../../src/config/env.js';

/**
 * ⚠️ **A header of our own, not `Authorization: Bearer`.** Bearer names a token that stands for an
 * identity, and this stands for nobody — borrowing the spelling would invite the next reader to
 * treat it as a session. It also keeps it clearly distinct from the x402 flow's own headers.
 */
const HEADER = 'x-console-secret';

/**
 * `null` when the caller may proceed, or the 401 to return.
 *
 * ⚠️ **Compared as digests, so the check does not leak the secret's length** — `timingSafeEqual`
 * throws on a length mismatch, which on a raw comparison is an oracle for exactly that. Same
 * mechanism `app/api/cron/commit` uses, and deliberately the same, because a second spelling of one
 * comparison is how the subtly wrong third one gets written.
 */
export function locked(request: Request): NextResponse | null {
  const secret = requiredEnv('CONSOLE_SECRET',
    'The console page sends it as the `x-console-secret` header; an operator types it in.');
  const sha = (s: string) => createHash('sha256').update(s).digest();
  if (timingSafeEqual(sha(request.headers.get(HEADER) ?? ''), sha(secret))) return null;

  // ⚠️ The refusal names why it fired and what this is, because a bare 401 on a page full of spend
  // buttons reads as a broken deployment rather than as a locked door.
  return NextResponse.json({
    error: 'console secret required',
    detail: `This route spends real funds and is locked. Send the console secret as the \`${HEADER}\` ` +
      'header — the field at the top of /console does it for you. This is a shared doorlock, not ' +
      'authentication: it identifies nobody and grants nothing beyond this console.',
  }, { status: 401 });
}

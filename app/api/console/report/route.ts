// POST /api/console/report — the operator reads a report body without paying.
//
// ⚠️ **THIS IS A DOOR AROUND THE PAYWALL, AND IT IS OPEN.** It returns `render(report)` — **the same
// string the x402 gate sells** — with no payment, no quote and no challenge. It was bolted with
// `locked()` on 2026-09-11 and has been unlocked since 2026-09-12 with the rest of the console, so on
// the public deployment anyone can `curl` for free what a settled payment buys, which makes every
// settled payment prove nothing. ⚠️ Not theoretical: before the lock, Unit 2's own paywall probe used
// this route as an unauthenticated oracle to pull a paid figure out of the store. Nothing in `app/`
// calls it.
//
// ── ⚠️ Why this was LOCKED and not DELETED, and what the alternative actually cost ───────────────
//
// Deletion is the tidier position and it was rejected on one fact: **`/report/[hash]` is the
// PREVIEW.** It deliberately never calls `render()`, so it hands back an identity panel and coverage
// counts, never a body. Deleting this route does not move the capability somewhere else; it removes
// it, and the only remaining way for the operator to see a report body becomes **paying our own
// paywall, 0.001 HBAR at a time, to read work we published ourselves.**
//
// ⚠️ **The paywall's promise is about STRANGERS, and only the lock keeps it here.** `locked()` is
// fail-closed — `requiredEnv` runs before the comparison, so an absent or blank `CONSOLE_SECRET`
// yields 500, never an open door. Wired, the caller that gets through is the operator, who in this
// project is the publisher reading back their own work. **What must never happen is this shape
// appearing in `app/report/[hash]/` or on any unauthenticated route — and unwired, this is one.**
// `/api/reports/[hash]` itself is untouched and still requires a settled payment.
//
// ⚠️ **It exists at all because there is no identity system.** A purchase is served once, and
// `payments/auth.ts` — the unit that would let someone prove which address they are — is the declared
// cut point. A console that cannot show you the artefact under test is not a test surface.
//
// ⚠️ **Nothing is reimplemented.** `load()` is the store's reader and `render()` is the same function
// whose output the gate sells. A console door that rendered differently would be testing itself
// rather than the build.
//

import { NextResponse } from 'next/server.js';
// ⚠️ TEMPORARILY UNWIRED — see the note in the handler below and DECISIONS.md.
// import { locked } from '../lock.js';
import { load } from '../../../../src/store/reports.js';
import { render } from '../../../../src/agent/narrate.js';
import { tokenFor } from '../../../../src/store/tokens.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  // ⚠️ **THE PAYWALL BOUNDARY, AND IT IS COMMENTED OUT.** Everything below returns the same bytes a
  // settled x402 payment buys, so when re-wired the lock must be the first statement in this handler.
  // Unlocked since 2026-09-12 and open on the public deployment; `../lock.ts` and
  // `tracking/DECISIONS.md` 2026-09-12 say what puts it back.
  // const refusal = locked(request);
  // if (refusal) return refusal;

  const { reportHash } = (await request.json().catch(() => ({}))) as { reportHash?: string };
  const hash = reportHash?.trim();
  if (!hash) {
    return NextResponse.json({ error: 'a report hash is required' }, { status: 400 });
  }

  try {
    // ⚠️ `load` THROWS on a failed integrity check rather than returning a degraded row, and that
    // throw is deliberately not caught into a 200. A report whose stored bytes no longer canonicalize
    // to its own key has an unknown identity, and this console is exactly where you would want to
    // see that rather than a rendered document that looks fine.
    const report = await load(hash);
    if (!report) {
      return NextResponse.json({ stop: `no report ${hash} in the store.` }, { status: 404 });
    }

    const token = await tokenFor(hash);
    const markdown = render(report, hash);

    return NextResponse.json({
      source: 'console door — read from the store, no payment',
      reportHash: hash,
      directive: report.subject.directive,
      analyst: report.analyst,
      block: report.block,
      observedAt: report.observedAt,
      factCount: Object.keys(report.facts).length,
      coverage: report.verdict.coverage,
      token: token ? { isin: token.isin, proxyAddress: token.proxyAddress } : null,
      markdownChars: markdown.length,
      // ⚠️ The same string the gate returns for a settled payment, produced by the same function.
      markdown,
      // Handed back so the operator can paste it into the public page's HTML and find nothing.
      figure: markdown.match(/\$[0-9][0-9.]*[BMK]/)?.[0] ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      { fail: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

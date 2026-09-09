// POST /api/console/report — read any report's full body without paying.
//
// ⚠️ **THROWAWAY. Delete `app/console/` and `app/api/console/` before submission.**
//
// ⚠️ **THIS IS A DOOR AROUND THE PAYWALL AND IT IS NOT IN THE PRODUCT.** It reads the store
// directly and renders the same markdown a buyer receives, with no payment, no quote and no
// challenge. It exists for one reason: **there is no identity system.** A person testing this build
// cannot re-read a report they already paid for, because Phase 3 serves a purchase once and
// `payments/auth.ts` — the unit that would let someone prove which address they are — is the
// declared cut point and does not exist.
//
// ⚠️ **What this must never become.** It is fine here because `/console` is deleted before
// submission and because a console that cannot show you the artefact under test is not a test
// surface. It would not be fine in `app/report/[hash]/`, which is the public preview and is the
// thing the paywall protects. **The gate is untouched by this file** — `/api/reports/[hash]` still
// requires a settled payment, and the proof for this unit is that a figure from a body read here
// still appears zero times in the public page's HTML.
//
// ⚠️ **Nothing is reimplemented.** `load()` is the store's reader — the one that re-derives the hash
// and refuses a row whose bytes no longer match its own primary key — and `render()` is the same
// function whose output the gate sells. A console door that rendered differently would be testing
// itself rather than the build.

import { NextResponse } from 'next/server.js';
import { load } from '../../../../src/store/reports.js';
import { render } from '../../../../src/agent/narrate.js';
import { tokenFor } from '../../../../src/store/tokens.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
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

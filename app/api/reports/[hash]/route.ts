// GET /api/reports/[hash] — the paid read.
//
// ⚠️ **This file knows about Next and nothing about selling.** The gate, the price, the payTo, the
// hooks and the `purchases` writes all live in `src/payments/gate.ts`; Unit 15's buyer and Unit 17's
// recover both have to reason about what that file writes, and neither should have to read a route.
//
// ⚠️ **The preview at `/report/[hash]` is the public half.** A stranger sees the directive, the
// analyst, the block, the hash, coverage counts and tokenized state there. This route is the other
// half — the figures, the market table and the assessment — and it costs 0.001 HBAR.

import { NextResponse, type NextRequest } from 'next/server.js';
import { gate } from '../../../../src/payments/gate.js';
import { quote } from '../../../../src/payments/quotes.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * ⚠️ **60 is the real ceiling on this project, and 300 is fiction here.**
 *
 * This project is on Vercel's **Hobby** plan — confirmed 2026-09-09 from the API,
 * `billing.plan = hobby`, not inferred. Hobby caps a function at **60 seconds**, and a declared
 * `maxDuration = 300` is **silently clamped**: Vercel accepts it, the build does not warn, and the
 * deployment goes READY carrying 60. Four console routes declare 300 and every one of them is
 * getting 60. ⚠️ **Do not copy the 300 from them.** It is the fifth thing in this project that looked
 * live and was not, after `extensionAlias`, the gateway error strings, the empty env var and a
 * research note's summary cell.
 *
 * ⚠️ **Why this route needed a number at all, when it had none.** Without a declaration it took the
 * platform *default* — roughly 10 seconds — on the one route where money moves. The last real settle
 * took **8.6 seconds**. That is a 1.4-second margin on a request that transfers value.
 *
 * ⚠️ **And a timeout here is worse than a timeout elsewhere.** The `authorization` flow produces the
 * body *before* settlement completes, so a kill inside that window leaves the buyer holding the
 * report and the seller with an unsettled `purchases` row. `gate.ts`'s `onBeforeSettle` writes the
 * native transaction id precisely so that case is *reconcilable* — but reconcilable is not avoided,
 * and Unit 17, which would do the reconciling, is not built. Six times the headroom is the cheap fix.
 */
export const maxDuration = 60;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ hash: string }> },
): Promise<NextResponse> {
  const { hash } = await params;

  // ⚠️ **404 before ANY payment machinery runs.** Quoting a price for a report that does not exist
  // would advertise something unbuyable, and a buyer that paid against it would settle against
  // nothing. `quote()` returns null for an unknown hash without touching the body — the unpaid path
  // never loads a 70 KB report just to find out it exists.
  if (!(await quote(hash))) {
    return NextResponse.json({ error: `no report ${hash}` }, { status: 404 });
  }

  // ⚠️ Built once and memoized inside `gate()` — the settlement hooks append to a list, so wrapping
  // per request would register them again and write the purchase row once per prior request.
  return gate()(request);
}

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

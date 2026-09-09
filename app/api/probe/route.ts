// ⚠️ THROWAWAY, and **both questions are now answered** — M1 at 10.0 MB of 250 MB on 2026-09-08,
// M2 by a live 402 from Vercel the same day. Nothing imports it, nothing depends on it, and
// `rm app/api/probe/route.ts` is the whole removal.
//
// ⚠️ **It is still deployed and still returns a 402**, which is the honest state as of 2026-09-09.
// PHASE-3.md said it "stays until Unit 12 replaces it"; Unit 12 shipped `src/payments/server.ts` and
// `app/api/health/route.ts`, so the condition is met and the file has simply not been removed. It is
// also the last reader of `HEDERA_SELLER_ID` with a fallback — the `?? '0.0.10387690'` below is the
// exact shape that hid an empty variable for eleven units, and the gate stopped reading env for
// `payTo` in Unit 14. Deleting it is a code change and belongs in its own commit.
//
// It measures two things and does no work:
//
//   M1  Do Phase 3's heavy dependencies fit a Vercel function? They are already installed from
//       Phase 0, so what decides it is whether anything under `app/` IMPORTS them and pulls them
//       into a traced function. This route imports all five and touches each at runtime so nothing
//       is tree-shaken and the weight is honest.
//
//   M2  Does `withX402` behave on Next 16? Everything in docs/research/x402-next-2.25.md was
//       measured on Next 15 with --legacy-peer-deps. An unpaid GET here must return a 402 whose
//       challenge names hedera:testnet and feePayer 0.0.7162784.
//
// ⚠️ **Connects to nothing.** No database connection, no RPC call, no model call. Importing is the
// point; using is not. Every value below is computed locally.
//
// ⚠️ **The facilitator config here is DISPOSABLE and inline on purpose.** `src/payments/server.ts`
// is Unit 12 and has requirements this probe does not — a health route, a feePayer assertion, an
// ATS resolver check. Do not lift this into a module.

import { NextResponse, type NextRequest } from 'next/server.js';
import { withX402, x402ResourceServer } from '@x402/next';
import { HTTPFacilitatorClient } from '@x402/core/http';
import type { AssetAmount } from '@x402/core/types';

// ── The five weights ─────────────────────────────────────────────────────────────────────────────
import { HBAR_ASSET_ID } from '@x402/hedera';
import { ExactHederaScheme } from '@x402/hedera/exact/server';
import { Factory__factory } from '@hashgraph/asset-tokenization-contracts';
import { ethers } from 'ethers';
import postgres from 'postgres';
import Anthropic from '@anthropic-ai/sdk';

// ⚠️ Node runtime. @hiero-ledger/sdk, ethers and the ATS contracts package all need Node built-ins
// and none of them can run on the edge runtime.
export const runtime = 'nodejs';

const FACILITATOR = 'https://api.testnet.blocky402.com';
const NETWORK = 'hedera:testnet';
// 100000 tinybars = 0.001 HBAR. ⚠️ Not a "$…" string — `defaultMoneyConversion` throws on asset
// 0.0.0 because the network's default asset table knows only USDC (SM-05).
const PRICE: AssetAmount = { asset: HBAR_ASSET_ID, amount: '100000' };
const PAY_TO = process.env.HEDERA_SELLER_ID ?? '0.0.10387690';

/**
 * Reference every heavy import at runtime, locally. If these were only imported and never read,
 * the bundler could drop them and the size measurement would be a measurement of nothing.
 */
const weights = () => ({
  '@x402/hedera': HBAR_ASSET_ID,
  '@hashgraph/asset-tokenization-contracts': `Factory ABI entries: ${Factory__factory.abi.length}`,
  ethers: `keccak256("alpha-markets") = ${ethers.id('alpha-markets').slice(0, 18)}`,
  postgres: `${typeof postgres} — imported, never connected`,
  '@anthropic-ai/sdk': `${Anthropic.name} — imported, never called`,
});

const handler = async (_request: NextRequest): Promise<NextResponse> =>
  NextResponse.json({ probe: 'paid', weights: weights() });

/**
 * ⚠️ **The resource server is built INSIDE the handler, in a try/catch, and never at module scope.**
 *
 * `x402ResourceServer` calls `process.exit` on a permanent config mismatch. At module scope on
 * Vercel that is a cold-start crash loop on every request to this route, and it reads like a
 * platform outage rather than a config error. `scripts/smoke/05-x402-purchase.ts` builds it at
 * module scope (line 241) and awaits `initialize()` at line 245 — that is the line not to copy.
 *
 * `withX402` takes the server eagerly, so the wrapping happens per-request here too. That is fine
 * for a probe and is not a pattern to carry into Unit 12.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const server = new x402ResourceServer(new HTTPFacilitatorClient({ url: FACILITATOR }))
      .register(NETWORK, new ExactHederaScheme());

    // ⚠️ Default `authorization` flow — NOT `paymentProxy`, which charges for failed responses
    // (measured). Under `authorization` a handler that throws means settle never runs, and that is
    // the only refund substitute that exists: Hedera has no refund primitive on any chain today.
    const gated = withX402(
      handler,
      {
        '/api/probe': {
          accepts: [{ scheme: 'exact', payTo: PAY_TO, price: PRICE, network: NETWORK, maxTimeoutSeconds: 120 }],
          description: 'Phase 3 probe — M1 bundle weight, M2 withX402 on Next 16',
          mimeType: 'application/json',
        },
      },
      server,
    );

    return await gated(request);
  } catch (error) {
    // ⚠️ Report the failure as a response rather than letting it take the process down. A 503 with
    // a readable reason is the difference between "the config is wrong" and "Vercel is down".
    return NextResponse.json(
      {
        probe: 'resource-server-failed',
        detail: error instanceof Error ? error.message : String(error),
        weights: weights(),
      },
      { status: 503 },
    );
  }
}

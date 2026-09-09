// GET /api/holdings — which tokenized reports each account holds, read from the chain.
//
// ⚠️ **A product route, not the console's.** `/api/console/accounts` returns the same balances and
// could not be reused here: it also reports **which environment keys are set**, which is a useful
// reading on a throwaway surface and a configuration disclosure on a public one. The console also
// deliberately shows where the database and the chain *disagree*; a product page has no business
// airing that. Same measurement, different audience, so the shapes differ — this returns holdings
// and nothing about how the server is configured.
//
// ⚠️ **`balanceOf` on chain is the authority, never `report_tokens.transfer_tx`.** The column records
// what we last sent; the chain records what is. A token can also be sent somewhere neither account
// controls, which the column cannot express and a balance read simply shows as "held by neither".
//
// ⚠️ **The weight lives here, not on a page.** Reading a balance means `ethers` and an RPC provider.
// `/holdings` is a shell that fetches this at runtime, so the page stays at the framework floor
// instead of carrying a chain client to render a list.

import { NextResponse } from 'next/server.js';
import { ethers } from 'ethers';
import { ANALYSTS } from '../../../src/config/analysts.js';
import { fetchJson, MIRROR } from '../../../src/tokenize/hedera.js';
import type { MirrorAccount } from '../../../src/tokenize/hedera.js';
import { db } from '../../../src/store/db.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * ⚠️ A minimal ABI rather than the typechain factory, which would drag
 * `@hashgraph/asset-tokenization-contracts` in to call one standard ERC-20 view. `balanceOf` is not
 * ATS-specific and there is no logic here to share with `src/` — this is a read.
 */
const BALANCE_OF = ['function balanceOf(address) view returns (uint256)'];

interface HeldReport {
  readonly reportHash: string;
  readonly directive: string;
  readonly isin: string;
  readonly proxyAddress: string;
}

export async function GET(): Promise<NextResponse> {
  try {
    const analyst = ANALYSTS[0]!;
    const buyerId = process.env.HEDERA_BUYER_ID?.trim() || null;
    const rpc = process.env.HEDERA_TESTNET_RPC?.trim() || null;

    // The buyer has no config row — it is not an analyst. Its EVM form is READ from Mirror Node,
    // which is the account's own answer about itself.
    let buyerEvm: string | null = null;
    if (buyerId) {
      const mirror = await fetchJson<MirrorAccount>(`${MIRROR}/api/v1/accounts/${buyerId}`).catch(() => null);
      buyerEvm = mirror?.evm_address ?? null;
    }

    const tokens = await db()<{ report_hash: string; proxy_address: string; isin: string; directive: string }[]>`
      SELECT t.report_hash, t.proxy_address, t.isin, r.directive
      FROM report_tokens t
      JOIN reports r ON r.hash = t.report_hash
      ORDER BY t.issued_at DESC`;

    if (!rpc) {
      return NextResponse.json({
        error: 'HEDERA_TESTNET_RPC is not set — holdings cannot be read from the chain',
      }, { status: 503 });
    }

    const provider = new ethers.JsonRpcProvider(rpc);
    const held: Record<string, HeldReport[]> = { analyst: [], buyer: [], elsewhere: [] };

    await Promise.all(tokens.map(async (t) => {
      const contract = new ethers.Contract(t.proxy_address, BALANCE_OF, provider);
      const read = async (addr: string | null): Promise<bigint | null> => {
        if (!addr) return null;
        try { return BigInt(String(await contract.balanceOf!(addr))); } catch { return null; }
      };
      const [a, b] = await Promise.all([read(analyst.hederaEvmAddress), read(buyerEvm)]);
      const row: HeldReport = {
        reportHash: t.report_hash, directive: t.directive,
        isin: t.isin, proxyAddress: t.proxy_address,
      };
      // ⚠️ `elsewhere` is a legitimate outcome, not an error: the token exists and neither of these
      // two accounts has it. Omitting it would make the inventory quietly incomplete.
      if (a === 1n) held.analyst!.push(row);
      else if (b === 1n) held.buyer!.push(row);
      else held.elsewhere!.push(row);
    }));

    return NextResponse.json({
      readAt: new Date().toISOString(),
      accounts: [
        {
          role: 'analyst',
          label: analyst.displayName,
          accountId: analyst.hederaAccountId,
          evmAddress: analyst.hederaEvmAddress,
          note: 'issues report tokens and receives payment for reads',
          holds: held.analyst,
        },
        {
          role: 'buyer',
          label: 'Buyer agent',
          accountId: buyerId,
          evmAddress: buyerEvm,
          note: 'the agent that pays for reports over x402',
          holds: held.buyer,
        },
      ],
      elsewhere: held.elsewhere,
      tokenCount: tokens.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 503 },
    );
  }
}

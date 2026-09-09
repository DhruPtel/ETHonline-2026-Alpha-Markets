// GET /api/console/accounts — who the console signs as, and what each of them holds.
//
// ⚠️ **THROWAWAY. Delete `app/console/` and `app/api/console/` before submission.**
//
// ⚠️ **There is no wallet connection anywhere in this build, and that is the thing this route
// exists to make obvious.** Every operation signs server-side from a key in `.env`: the analyst
// from `HEDERA_SELLER_KEY`, the buyer from `HEDERA_BUYER_KEY`. A browser that shows spend buttons
// and never mentions an account invites the reader to assume a wallet is attached. Two accounts,
// named, with both address forms, is the correction.
//
// ⚠️ **Its own route rather than part of `/api/console/state`, because it costs weight.** Reading a
// balance means `ethers` and an RPC provider; `state` is a database read at ~1.75 MB traced and
// should stay that way. This one is called when the panel wants it.
//
// ⚠️ **Holdings are read from the CHAIN, never from `report_tokens.transfer_tx`.** The database
// records what we last sent; the chain records what is. SM-07's finding was that a status-1 receipt
// is not a balance change, and the corollary is that a recorded transfer is not a holding. Where the
// two disagree, the disagreement is the interesting reading — so both are returned and the panel
// shows them side by side.

import { NextResponse } from 'next/server.js';
import { ethers } from 'ethers';
import { ANALYSTS } from '../../../../src/config/analysts.js';
import { fetchJson, MIRROR, hbar } from '../../../../src/tokenize/hedera.js';
import type { MirrorAccount } from '../../../../src/tokenize/hedera.js';
import { db } from '../../../../src/store/db.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * ⚠️ **A minimal ABI rather than `IAsset__factory`, deliberately.** The typechain factory would drag
 * `@hashgraph/asset-tokenization-contracts` into this route — the package that takes the tokenize
 * route to 7.58 MB — to call one standard ERC-20 view. `balanceOf` is not ATS-specific and there is
 * no business logic here to share with `src/`; this is a read.
 */
const BALANCE_OF = ['function balanceOf(address) view returns (uint256)'];

/** Soft, unlike `config/env.ts`'s guard: this route REPORTS configuration rather than depending on it. */
const soft = (name: string): string | null => process.env[name]?.trim() || null;

interface Account {
  readonly role: 'analyst' | 'buyer';
  readonly label: string;
  readonly accountId: string | null;
  readonly evmAddress: string | null;
  readonly hbar: string | null;
  readonly keyEnv: string;
  readonly keySet: boolean;
  readonly note: string | null;
}

export async function GET(): Promise<NextResponse> {
  try {
    const analyst = ANALYSTS[0]!;
    const buyerId = soft('HEDERA_BUYER_ID');

    // ⚠️ The analyst's EVM address comes from the config row, which `scripts/ops/verify-analyst.ts`
    // already asserts against Mirror Node. The buyer has no config row, so its EVM form is READ from
    // Mirror Node rather than derived — the account's own answer about itself.
    const accounts: Account[] = [];

    const analystMirror = await fetchJson<MirrorAccount>(
      `${MIRROR}/api/v1/accounts/${analyst.hederaAccountId}`).catch(() => null);
    accounts.push({
      role: 'analyst',
      label: `${analyst.id} · ${analyst.displayName}`,
      accountId: analyst.hederaAccountId,
      evmAddress: analyst.hederaEvmAddress,
      hbar: analystMirror ? hbar(BigInt(analystMirror.balance.balance)) : null,
      keyEnv: 'HEDERA_SELLER_KEY',
      keySet: soft('HEDERA_SELLER_KEY') !== null,
      note: 'issues and holds report tokens; receives x402 payments',
    });

    let buyerEvm: string | null = null;
    if (buyerId) {
      const buyerMirror = await fetchJson<MirrorAccount>(
        `${MIRROR}/api/v1/accounts/${buyerId}`).catch(() => null);
      buyerEvm = buyerMirror?.evm_address ?? null;
      accounts.push({
        role: 'buyer',
        label: 'the buyer agent',
        accountId: buyerId,
        evmAddress: buyerEvm,
        hbar: buyerMirror ? hbar(BigInt(buyerMirror.balance.balance)) : null,
        keyEnv: 'HEDERA_BUYER_KEY',
        keySet: soft('HEDERA_BUYER_KEY') !== null,
        note: 'pays for reports over x402; the usual transfer recipient',
      });
    } else {
      accounts.push({
        role: 'buyer', label: 'the buyer agent', accountId: null, evmAddress: null, hbar: null,
        keyEnv: 'HEDERA_BUYER_KEY', keySet: soft('HEDERA_BUYER_KEY') !== null,
        note: 'HEDERA_BUYER_ID is not set — the buy control cannot run',
      });
    }

    // ── Holdings, per token, from the chain ────────────────────────────────────────────────────
    const tokens = await db()<{ report_hash: string; proxy_address: string; isin: string; transfer_tx: string | null }[]>`
      SELECT report_hash, proxy_address, isin, transfer_tx FROM report_tokens ORDER BY issued_at DESC`;

    const rpc = soft('HEDERA_TESTNET_RPC');
    let holdings: unknown[] = [];
    let holdingsError: string | null = null;

    if (!rpc) {
      holdingsError = 'HEDERA_TESTNET_RPC is not set — balances cannot be read from the chain';
    } else {
      const provider = new ethers.JsonRpcProvider(rpc);
      holdings = await Promise.all(tokens.map(async (t) => {
        const contract = new ethers.Contract(t.proxy_address, BALANCE_OF, provider);
        const read = async (addr: string | null): Promise<string | null> => {
          if (!addr) return null;
          try { return String(await contract.balanceOf!(addr)); } catch { return null; }
        };
        const [analystBalance, buyerBalance] = await Promise.all([
          read(analyst.hederaEvmAddress), read(buyerEvm),
        ]);

        // Who the chain says holds it, against who the database implies. A `transfer_tx` means we
        // sent it away from the analyst; no `transfer_tx` means it should still be here.
        const chainHolder = analystBalance === '1' ? 'analyst'
          : buyerBalance === '1' ? 'buyer'
          : analystBalance === null && buyerBalance === null ? 'unreadable' : 'neither';
        const dbImplies = t.transfer_tx ? 'buyer' : 'analyst';

        return {
          reportHash: t.report_hash,
          isin: t.isin,
          proxyAddress: t.proxy_address,
          analystBalance, buyerBalance,
          chainHolder,
          dbImplies,
          // ⚠️ The reading worth having. `neither` is legitimate — a token sent to a third address —
          // and is still a disagreement with what the row implies.
          agrees: chainHolder === dbImplies,
          transferTx: t.transfer_tx,
        };
      }));
    }

    return NextResponse.json({ accounts, holdings, holdingsError, tokenCount: tokens.length });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 503 },
    );
  }
}

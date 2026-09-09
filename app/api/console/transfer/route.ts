// POST /api/console/transfer — move a report's token. **Spends ~0.43 HBAR and moves a real asset.**
//
// ⚠️ **THROWAWAY. Delete `app/console/` and `app/api/console/` before submission.**
//
// ⚠️ **Two-step, like tokenize, and for the same reason.** `scripts/ops/move-token.ts` is dry by
// default; a console control that sent on the first click would be testing something this build does
// not do. `{ confirm: true }` is the `--confirm`, and it is checked here rather than in the browser.
//
// ⚠️ **The recipient is required and never defaulted** — `move-token.ts`'s rule, carried over
// verbatim. Defaulting one would move a real asset to an address nobody chose. `transfer.prepare()`
// rejects a malformed address, a recipient equal to the sender, a report with no token, and a
// sender that does not hold the unit, all before anything is sent.

import { NextResponse } from 'next/server.js';
import { prepare, send } from '../../../../src/tokenize/transfer.js';
import { ChainWriteError, hbar, settledBalance, usdPerHbar } from '../../../../src/tokenize/hedera.js';
import { db } from '../../../../src/store/db.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// SM-07's measured lifecycle. This is the fourth step; the first three are the tokenize route's.
const SM07_TRANSFER = 0.42696150;
const SM07_UNIT8 = 7.71195075;
const SM07_FULL = 8.13891225;

export async function POST(request: Request): Promise<NextResponse> {
  const { reportHash, to, confirm } = (await request.json().catch(() => ({}))) as
    { reportHash?: string; to?: string; confirm?: boolean };
  if (!reportHash?.trim() || !to?.trim()) {
    return NextResponse.json({ error: 'a report hash and a recipient address are both required' }, { status: 400 });
  }

  let plan;
  try {
    plan = await prepare(reportHash.trim(), to.trim());
  } catch (error) {
    return NextResponse.json({ stop: (error as Error).message }, { status: 409 });
  }

  const summary = {
    reportHash: plan.reportHash,
    isin: plan.token.isin,
    proxyAddress: plan.token.proxyAddress,
    from: plan.from,
    fromAnalyst: `${plan.analyst.id} · ${plan.analyst.hederaAccountId}`,
    to: plan.to,
    // Read from the chain by `prepare`, not from the database.
    fromBalance: plan.fromBalance.toString(),
    toBalance: plan.toBalance.toString(),
    gasAvailableHbar: hbar(plan.balanceTinybars),
    estimateHbar: SM07_TRANSFER.toFixed(5),
  };

  if (!confirm) {
    return NextResponse.json({ mode: 'dry', plan: summary, spent: false });
  }

  const before = plan.balanceTinybars;
  let result;
  try {
    result = await send(plan);
  } catch (error) {
    return NextResponse.json({
      fail: (error as Error).message,
      chainWrite: error instanceof ChainWriteError,
      guidance: 'Read the balances before doing anything else — the transfer may have landed.',
      plan: summary,
    }, { status: 502 });
  }

  const [row] = await db()<{ transfer_tx: string | null }[]>`
    SELECT transfer_tx FROM report_tokens WHERE report_hash = ${plan.reportHash}`;
  const tinybars = (result.receipt.gasUsed * result.receipt.gasPrice) / 10_000_000_000n;
  const after = await settledBalance(plan.analyst.hederaAccountId, before);
  const usd = await usdPerHbar();

  return NextResponse.json({
    mode: 'confirmed', spent: true, plan: summary,
    result: { transferTx: result.transferTx },
    // ⚠️ Balances from the chain, both sides, before and after — a status-1 receipt is not a move.
    checks: [
      { ok: result.fromBefore === 1n && result.fromAfter === 0n,
        label: 'sender 1 → 0', detail: `${result.fromBefore} → ${result.fromAfter}` },
      { ok: result.toBefore === 0n && result.toAfter === 1n,
        label: 'recipient 0 → 1', detail: `${result.toBefore} → ${result.toAfter}` },
      { ok: row?.transfer_tx === result.transferTx,
        label: 'transfer_tx written', detail: String(row?.transfer_tx) },
    ],
    cost: {
      gasUsed: result.receipt.gasUsed.toString(),
      hbar: hbar(tinybars),
      sm07: SM07_TRANSFER.toFixed(8),
      deltaHbar: (Number(tinybars) / 1e8 - SM07_TRANSFER).toFixed(8),
      balanceBeforeHbar: hbar(before), balanceAfterHbar: hbar(after), spentHbar: hbar(before - after),
      lifecycleSoFar: `${SM07_UNIT8.toFixed(5)} + ${(Number(tinybars) / 1e8).toFixed(5)} vs SM-07's full ${SM07_FULL.toFixed(5)}`,
      usdPerHbar: usd.toFixed(6), usd: ((Number(before - after) / 1e8) * usd).toFixed(4),
    },
    links: {
      hashscan: `https://hashscan.io/testnet/contract/${plan.token.proxyAddress}`,
      transaction: `https://hashscan.io/testnet/transaction/${result.transferTx}`,
      report: `/report/${plan.reportHash}`,
    },
  });
}

// POST /api/console/tokenize — deploy an ATS asset for a stored report. **Spends ~7.7 HBAR.**
//
// ⚠️ **THROWAWAY. Delete `app/console/` and `app/api/console/` before submission.**
//
// ⚠️ **Dry by default, and the gate is on the SERVER.** `{ confirm: true }` is this route's
// `--confirm`. Without it `prepare()` runs, the plan comes back, and nothing is sent — the same
// shape as `scripts/ops/tokenize.ts`, for the same reason: SM-07's first attempt reverted on a field
// from our own research note and burned 948,129 gas producing nothing. A confirm implemented only in
// the browser would be a confirm a mis-click, a stale tab or a curl can walk straight past.
//
// ⚠️ **`prepare()` runs again on the confirming request, and that is correct rather than wasteful.**
// A `TokenPlan` carries an `ethers.Wallet` and cannot cross HTTP, so the two-step is prepare-then-
// prepare-and-spend. It also means the preflight — already tokenized, key matches the analyst row,
// factory alive, balance sufficient — is evaluated against the state at the moment of spending
// rather than the state when the plan was drawn.

import { NextResponse } from 'next/server.js';
import { prepare, tokenize, FACTORY_ID, RESOLVER_ID } from '../../../../src/tokenize/ats.js';
import { ChainWriteError, hbar, settledBalance, usdPerHbar } from '../../../../src/tokenize/hedera.js';
import { db } from '../../../../src/store/db.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** Deploy, grantRole and issue are three sequential transactions against a public factory. */
export const maxDuration = 300;

// SM-07's measured lifecycle, per step — the same figures `scripts/ops/tokenize.ts` compares against.
const SM07 = { deployEquity: 7.04954250, grantRole: 0.18894645, issue: 0.47346180 };
const SM07_UNIT8 = SM07.deployEquity + SM07.grantRole + SM07.issue;   // 7.71195075

export async function POST(request: Request): Promise<NextResponse> {
  const { reportHash, confirm } = (await request.json().catch(() => ({}))) as
    { reportHash?: string; confirm?: boolean };
  if (!reportHash?.trim()) {
    return NextResponse.json({ error: 'a report hash is required' }, { status: 400 });
  }

  // ⚠️ A refusal here is the common case, not an exception — an already-tokenized report, a key that
  // does not match the analyst row, a dead factory. Each is a sentence an operator should read.
  let plan;
  try {
    plan = await prepare(reportHash.trim());
  } catch (error) {
    return NextResponse.json({ stop: (error as Error).message }, { status: 409 });
  }

  // A deploy alone is ~7.05 HBAR; refusing below twice the estimate avoids a half-finished lifecycle.
  const floor = BigInt(Math.ceil(SM07_UNIT8 * 2 * 1e8));
  const summary = {
    reportHash: plan.reportHash,
    directive: plan.report.subject.directive,
    analyst: { id: plan.analyst.id, hederaAccountId: plan.analyst.hederaAccountId },
    factory: { id: FACTORY_ID, address: plan.factoryAddress },
    resolver: { id: RESOLVER_ID, address: plan.resolverAddress },
    isin: plan.isin,
    info: plan.info,
    recipient: plan.analyst.hederaEvmAddress,
    maxSupply: 1, decimals: 0, regulation: 'REG_S / NONE',
    balanceHbar: hbar(plan.balanceTinybars),
    estimateHbar: SM07_UNIT8.toFixed(5),
    floorHbar: hbar(floor),
  };

  if (plan.balanceTinybars < floor) {
    return NextResponse.json({
      stop: `${hbar(plan.balanceTinybars)} HBAR is under the ${hbar(floor)} HBAR floor (2x the estimate). ` +
        'A run that dies between deploy and issue leaves an asset with no token in it.',
      plan: summary,
    }, { status: 409 });
  }

  if (!confirm) {
    return NextResponse.json({ mode: 'dry', plan: summary, spent: false });
  }

  // ── Spending ──────────────────────────────────────────────────────────────────────────────────
  const before = plan.balanceTinybars;
  let result;
  try {
    result = await tokenize(plan);
  } catch (error) {
    // ⚠️ Report the Mirror Node reason and STOP. Do not adjust a field and retry — that is exactly
    // how SM-07's first failure would have cost a second deploy.
    return NextResponse.json({
      fail: (error as Error).message,
      chainWrite: error instanceof ChainWriteError,
      guidance: 'Do NOT change a field and re-run. The reason above is the fact; work from it.',
      plan: summary,
    }, { status: 502 });
  }

  const [row] = await db()`SELECT * FROM report_tokens WHERE report_hash = ${plan.reportHash}`;
  const after = await settledBalance(plan.analyst.hederaAccountId, before);
  const usd = await usdPerHbar();
  const spentTinybars = before - after;

  return NextResponse.json({
    mode: 'confirmed', spent: true, plan: summary,
    result: {
      proxyAddress: result.proxyAddress, isin: result.isin, emittedInfo: result.emittedInfo,
      deployTx: result.deployTx, grantRoleTx: result.grantRoleTx, issueTx: result.issueTx,
      balance: result.balance.toString(),
    },
    // The same four assertions the script prints, computed here rather than restated in the browser.
    checks: [
      { ok: result.emittedInfo === `alpha:${plan.reportHash}`,
        label: 'EquityDeployed carries alpha:<hash>', detail: result.emittedInfo },
      { ok: result.emittedInfo.slice('alpha:'.length) === plan.reportHash,
        label: 'the emitted hash equals the report hash from the store', detail: 'byte-identical' },
      { ok: result.balance === 1n,
        label: `balanceOf(${plan.analyst.hederaEvmAddress.slice(0, 10)}…) == 1`, detail: `got ${result.balance}` },
      { ok: row !== undefined, label: 'report_tokens row written', detail: String(row?.isin ?? '—') },
    ],
    cost: {
      steps: result.receipts.map(([label, receipt]) => {
        const tinybars = (receipt.gasUsed * receipt.gasPrice) / 10_000_000_000n;
        const baseline = SM07[label === 'grantRole' ? 'grantRole' : label === 'issue' ? 'issue' : 'deployEquity'];
        return {
          label, gasUsed: receipt.gasUsed.toString(), hbar: hbar(tinybars),
          sm07: baseline.toFixed(8), deltaHbar: (Number(tinybars) / 1e8 - baseline).toFixed(8),
        };
      }),
      balanceBeforeHbar: hbar(before), balanceAfterHbar: hbar(after), spentHbar: hbar(spentTinybars),
      sm07Unit8: SM07_UNIT8.toFixed(8),
      usdPerHbar: usd.toFixed(6), usd: ((Number(spentTinybars) / 1e8) * usd).toFixed(4),
    },
    links: {
      hashscan: `https://hashscan.io/testnet/contract/${result.proxyAddress}`,
      report: `/report/${plan.reportHash}`,
      verify: `npx tsx scripts/ops/verify-ats.ts ${result.proxyAddress}`,
    },
  });
}

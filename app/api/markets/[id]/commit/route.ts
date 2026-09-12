// Commit a report to an existing market — the analyst backing its own research with its own USDC.
//
// ── ⚠️ WHY A ROUTE AND NOT A SERVER ACTION ───────────────────────────────────────────────────────
//
// Publishing a report is one timestamp and a single press, so it is a server action. This is not:
// it is **two presses with a plan in between**. `prepare()` runs every refusal that can stop the run
// and returns what is about to happen; a human reads that — the side the analyst picked, the stake,
// the token it is bound to — and only then confirms. A server action returning data to render would
// need `useActionState` and would still be a fetch; a route makes the boundary explicit and lets the
// whole refusal surface be exercised with `curl` without spending anything.
//
// ⚠️ **`/api/console/tokenize` is the precedent and this is deliberately the same shape**: always
// `prepare`, return `{mode:'dry', plan}` without `confirm`, spend only with `confirm: true`, and
// return refusals as 409 with a `stop` sentence. One spend path per action, and it looks like the
// other one.
//
// ⚠️ **Server-only by necessity.** `src/arc/market.ts` pulls Circle's SDK, `ethers` and the full
// `ALPHA_MARKET_ABI` (contract bytecode included). None of that may reach a browser, which is the
// same reason `app/markets/[id]/CommitControl.tsx` holds no ABI at all.
//
// ── ⚠️ WHAT SPENDS, AND WHOSE MONEY ──────────────────────────────────────────────────────────────
//
// **The analyst's own USDC, through Circle. No visitor wallet connects and nothing is charged to
// whoever presses this.** That is the opposite of `/markets/[id]`'s staking control, where the
// visitor signs from MetaMask. Measured on market 11: the stake plus ~0.0068 USDC of gas.
//
// ⚠️ **NOT LOCKED.** No console route is today — `app/api/console/lock.ts` has been unwired since
// 2026-09-12 and this sits beside the others. The doorlock decision covers it; if that is re-wired,
// this is one of the routes that takes `locked(request)`.

import { NextResponse } from 'next/server.js';
import { ethers } from 'ethers';
import { MarketRefused, commit, prepare } from '../../../../../src/arc/market.js';
import { BindingRefused } from '../../../../../src/arc/admission.js';
import { requiredEnv } from '../../../../../src/config/env.js';
import { db } from '../../../../../src/store/db.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** ⚠️ Circle's submit plus a 120s receipt wait. Vercel Hobby clamps this to 60; locally it is real. */
export const maxDuration = 300;

interface Spec {
  slug: string; metric: string; comparison: 'above' | 'below'; threshold: string; observedDay: string;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const { reportHash, amount, confirm } = (await request.json().catch(() => ({}))) as
    { reportHash?: string; amount?: string; confirm?: boolean };

  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: 'bad market id' }, { status: 400 });
  }
  // ⚠️ Same spelling the report page accepts: 32 bytes of lowercase hex, nothing normalised.
  if (!reportHash || !/^[0-9a-f]{64}$/.test(reportHash.trim())) {
    return NextResponse.json({ error: 'reportHash must be 64 lowercase hex characters' }, { status: 400 });
  }
  // ⚠️ **NO DEFAULT STAKE, and `market.ts` says why in its own signature: "nobody commits a default
  // stake size."** The caller states the amount or the route refuses.
  if (!amount || !/^\d+(\.\d+)?$/.test(amount.trim())) {
    return NextResponse.json({ error: 'amount must be a plain decimal string of USDC' }, { status: 400 });
  }

  const contractAddress = requiredEnv('ARC_MARKET_ADDRESS');
  const [market] = await db()<{
    spec_json: string; close_time: Date; resolve_deadline: Date;
    resolved_at: Date | null; voided_at: Date | null;
  }[]>`
    SELECT spec_json, close_time, resolve_deadline, resolved_at, voided_at
      FROM markets WHERE chain_market_id = ${id} AND contract_address = ${contractAddress}`;
  if (!market) return NextResponse.json({ error: `no market ${id}` }, { status: 404 });

  // ⚠️ **The three states that take no new claim, refused here rather than on chain.** `prepare`
  // cannot see them: it validates a question, not a market's lifecycle, so this is the one refusal
  // this route owns. A commit to a closed market reverts and the revert costs real USDC.
  const closed =
    market.voided_at ? 'This market is voided — there is no outcome to back.'
    : market.resolved_at ? 'This market has already resolved. A claim after the answer is known is not a forecast.'
    : Date.now() >= market.close_time.getTime()
      ? `Staking closed at ${market.close_time.toISOString()}. The contract reverts StakingClosed and the revert costs gas.`
      : null;
  if (closed) return NextResponse.json({ stop: closed }, { status: 409 });

  // ⚠️ **The market's OWN spec and times, rebuilt exactly.** `prepare` derives the market id from
  // `{specHash, core, contractAddress}` — so feeding it anything else would mint a plan for a
  // different market and `commit` would write a claim against a row that does not exist. The stored
  // row is the only acceptable source for these five fields and these two timestamps.
  const spec = JSON.parse(market.spec_json) as Spec;

  let plan;
  try {
    plan = await prepare({
      reportHash: reportHash.trim(),
      spec: {
        slug: spec.slug,
        metric: spec.metric as 'totalDepositBalanceUSD',
        comparison: spec.comparison,
        threshold: spec.threshold,
        observedDay: spec.observedDay,
      },
      closeTime: Math.floor(market.close_time.getTime() / 1000),
      resolveDeadline: Math.floor(market.resolve_deadline.getTime() / 1000),
      amount: ethers.parseUnits(amount.trim(), 18).toString(),
    });
  } catch (error) {
    // ⚠️ **Every refusal is a 409 with a sentence, never a 500.** `MarketRefused` covers the
    // already-committed and unit-rule cases; `BindingRefused` is Unit 6c's admission check — the
    // token exists, its creation event carries this report's hash, and this analyst issued it.
    // Anything else is a genuine fault and says which kind it was.
    const kind =
      error instanceof BindingRefused ? 'admission'
      : error instanceof MarketRefused ? 'refused'
      : 'error';
    return NextResponse.json({ stop: (error as Error).message, kind }, { status: 409 });
  }

  // ⚠️ The plan a human reads before the money moves. No secrets: an address, a hash, a side and a
  // number, every one of which is already on the page or on a public chain.
  const summary = {
    marketId: plan.marketId,
    chainMarketId: id,
    claimId: plan.claimId,
    reportHash: plan.reportHash,
    question: `Will ${plan.spec.slug}'s ${plan.spec.metric} be ${plan.spec.comparison} ${plan.spec.threshold} on ${plan.spec.observedDay}?`,
    // ⚠️ **The analyst picked this, not a human, and the plan says how.** `decideSide` runs
    // `settle()` against the latest finished day — the same series settlement will read — so the
    // side is by construction what settlement would decide on today's figure.
    side: plan.decision.side,
    decidedFromDay: plan.decision.decidedFromDay,
    observed: plan.decision.observed,
    reason: plan.decision.reason,
    reportFigure: plan.decision.reportFigure,
    reportObservedAt: plan.decision.reportObservedAt,
    verdict: plan.verdict,
    amountUsdc: ethers.formatUnits(plan.amount, 18),
    analyst: plan.analyst.arcAddress,
    binding: {
      proxyAddress: plan.binding.proxyAddress,
      issuerAddress: plan.binding.issuerAddress,
      deployTx: plan.binding.deployTx,
    },
  };

  if (!confirm) return NextResponse.json({ mode: 'dry', plan: summary, spent: false });

  // ── ⚠️ PAST THIS LINE MONEY MOVES ─────────────────────────────────────────────────────────────
  //
  // ⚠️ `commit()` writes the claim row and the binding evidence BEFORE it submits, so a crash
  // between the two leaves a record of what was attempted rather than a silent gap. And the
  // **`chainClaimId` comes back from the `Committed` event, not from a return value** — Circle
  // returns no logs, so `market.ts` fetches the receipt over the Arc RPC and decodes it with the
  // committed ABI. That is already how it works and this route does not reimplement it.
  try {
    const committed = await commit(plan, id);
    return NextResponse.json({
      mode: 'confirmed',
      spent: true,
      plan: summary,
      chainClaimId: committed.chainClaimId,
      txHash: committed.txHash,
      alreadyLanded: committed.alreadyLanded,
      links: {
        arcscan: committed.txHash ? `https://testnet.arcscan.app/tx/${committed.txHash}` : null,
        market: `/markets/${id}`,
      },
    });
  } catch (error) {
    // ⚠️ The claim row and the idempotency key survive this. A retry with the same body reuses the
    // key, so Circle will not send a second transaction for one claim.
    return NextResponse.json({ fail: (error as Error).message, plan: summary }, { status: 502 });
  }
}

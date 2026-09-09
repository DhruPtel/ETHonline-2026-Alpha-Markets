// POST /api/console/buy — the buyer agent pays for one report. **Spends real testnet HBAR.**
//
// ⚠️ **THROWAWAY. Delete `app/console/` and `app/api/console/` before submission.**
//
// ⚠️ **Server-side, and there is no browser alternative.** `@x402` ships EVM, Solana and Aptos
// paywall flavours and no Hedera export, so a browser-side payment is not a thing that can be built
// here. It is also not what the product does: the buyer is an agent, and this route runs the same
// `buy()` that `scripts/ops/buy.ts` runs, with the same caps and the same callbacks.
//
// ⚠️ **The target URL is a parameter, defaulting to the deployed alias.** `buy.ts` hardcodes it and
// says why — a localhost round trip proves the code, not the deployment — so the default is that,
// and the override exists because a console that can only talk to production cannot test a change
// before it ships.
//
// ⚠️ **The target is unauthenticated, operator-supplied, and the caps are what bound it.** A URL
// this route has never seen can quote its own `payTo` and this buyer will sign for it. What stops
// that mattering is `buyer.ts`'s own controls, which refuse before signing: 1,000,000 tinybars per
// payment and 5,000,000 per UTC day — 0.01 and 0.05 HBAR of testnet funds. That is the blast radius,
// deliberately, and it is the reason the caps are not raised for convenience.
//
// ⚠️ **The daily cap is weaker here than on a CLI.** `buyer.ts` keeps its ledger in a file under the
// OS temp directory — it says so at its own head — and a serverless instance does not keep that file
// between cold starts. So on Vercel the cumulative cap bounds a burst on one warm instance rather
// than a day. The per-payment cap is unaffected. Not fixed here: fixing it means a `purchases`-backed
// ledger in `src/payments/buyer.ts`, which this unit may not touch.

import { NextResponse } from 'next/server.js';
import { buy, spent, vet, DEFAULT_LIMITS, SpendRefused, type BuyOptions } from '../../../../src/payments/buyer.js';
import { fetchJson, MIRROR } from '../../../../src/tokenize/hedera.js';
// ⚠️ Empty is missing. One guard, shared; was a local copy until 2026-09-09.
import { requiredEnv as env } from '../../../../src/config/env.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Where `scripts/ops/buy.ts` points. Aliased, so it survives a redeploy. */
const DEFAULT_SITE = 'https://et-honline-2026-alpha-markets.vercel.app';
const NETWORK = 'hedera:testnet';
const HBAR = '0.0.0';

const hbar = (t: string | bigint | number) => (Number(t) / 1e8).toFixed(8);

type Tx = { result: string; charged_tx_fee: number; transfers: { account: string; amount: number }[] };

export async function POST(request: Request): Promise<NextResponse> {
  const { reportHash, site, confirm } = (await request.json().catch(() => ({}))) as
    { reportHash?: string; site?: string; confirm?: boolean };
  if (!reportHash?.trim()) {
    return NextResponse.json({ error: 'a report hash is required' }, { status: 400 });
  }

  const base = (site?.trim() || DEFAULT_SITE).replace(/\/+$/, '');
  if (!/^https?:\/\//.test(base)) {
    return NextResponse.json({ error: `"${base}" is not an http(s) URL` }, { status: 400 });
  }

  // Everything the challenge and the signing step report, in the order they happen.
  const trace: Record<string, unknown>[] = [];
  let opts: BuyOptions;
  try {
    opts = {
      url: `${base}/api/reports/${reportHash.trim()}`,
      accountId: env('HEDERA_BUYER_ID'),
      privateKey: env('HEDERA_BUYER_KEY'),
      network: NETWORK,
      asset: HBAR,
      onChallenge: (a) => trace.push({
        event: 'quoted', amountTinybars: a.amount, amountHbar: hbar(a.amount), asset: a.asset,
        payTo: a.payTo, feePayer: (a.extra as { feePayer?: string }).feePayer,
        network: a.network, maxTimeoutSeconds: a.maxTimeoutSeconds,
      }),
      // ⚠️ Recorded BEFORE the paid request goes out — that ordering is what makes a failed run
      // reconcilable rather than ambiguous.
      onSigned: (tx, id) => trace.push({ event: 'signed', nativeTxId: tx, paymentId: id }),
    };
  } catch (error) {
    return NextResponse.json({ stop: (error as Error).message }, { status: 409 });
  }

  const plan: Record<string, unknown> = {
    url: opts.url,
    buyer: opts.accountId,
    perPaymentTinybars: DEFAULT_LIMITS.perPaymentTinybars,
    dailyTinybars: DEFAULT_LIMITS.dailyTinybars,
    spentTodayTinybars: spent(opts.accountId).toString(),
    ledgerNote: 'the daily ledger is a temp file; a serverless instance does not keep it between cold starts',
  };

  // ── The gate probe. ⚠️ **A dry run that passes where the spend fails is not a dry run.** ────────
  //
  // This used to validate the shape of the URL and nothing else, so a Gate pointing at an origin
  // with no such report — or at something that is not this app at all — planned cleanly and then
  // failed on the spend step, after the operator had been told the plan was good.
  //
  // `buy()`'s first act is `fetch(url)` and a hard requirement that the status is 402; everything
  // after that depends on it. So the probe here is exactly that request, made without paying:
  // an unpaid GET costs nothing, moves nothing, and answers the only question the plan could not.
  //
  // ⚠️ It also lets the plan show the REAL quoted price, payTo and feePayer — decoded from the live
  // challenge rather than assumed — which is the thing an operator actually wants to check before
  // authorising a spend.
  try {
    const probe = await fetch(opts.url, { headers: { accept: 'application/json' } });
    plan.gateStatus = probe.status;

    if (probe.status === 404) {
      return NextResponse.json({
        stop: `the gate answered 404 for this report. ${base} has no report ${reportHash.trim()} — ` +
          'either the hash is wrong or that origin is a different deployment with a different store.',
        plan,
      }, { status: 409 });
    }
    if (probe.status !== 402) {
      return NextResponse.json({
        stop: `the gate answered ${probe.status}, not 402. buy() requires a 402 challenge and would ` +
          `refuse this URL. Check that ${base} is this app and that the route is gated.`,
        plan,
      }, { status: 409 });
    }

    // The challenge is public — it is what an unpaid caller is meant to receive.
    const header = probe.headers.get('payment-required');
    if (header) {
      const padded = header + '='.repeat((4 - (header.length % 4)) % 4);
      const decoded = JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as
        { accepts?: { amount?: string; asset?: string; payTo?: string; network?: string; extra?: { feePayer?: string } }[] };
      const accepted = decoded.accepts?.[0];
      if (accepted) {
        plan.quotedTinybars = accepted.amount;
        plan.quotedHbar = accepted.amount ? hbar(accepted.amount) : undefined;
        plan.payTo = accepted.payTo;
        plan.network = accepted.network;
        plan.feePayer = accepted.extra?.feePayer;
        // ⚠️ Checked here rather than discovered by `vet()` after a round trip.
        plan.withinPerPaymentCap = accepted.amount
          ? BigInt(accepted.amount) <= BigInt(DEFAULT_LIMITS.perPaymentTinybars) : undefined;
      }
    }
  } catch (error) {
    return NextResponse.json({
      stop: `the gate at ${base} could not be reached: ${(error as Error).message}`,
      plan,
    }, { status: 409 });
  }

  if (!confirm) {
    return NextResponse.json({ mode: 'dry', plan, spent: false });
  }

  let purchase;
  try {
    purchase = await buy(opts);
  } catch (error) {
    // ⚠️ STOP and report. Do not retry blind — the native id was recorded before the attempt.
    if (error instanceof SpendRefused) {
      return NextResponse.json({ refused: { control: error.control, message: error.message }, plan, trace }, { status: 402 });
    }
    return NextResponse.json({ fail: (error as Error).message, plan, trace }, { status: 502 });
  }

  // ── The report body — the half the preview does not serve ────────────────────────────────────
  const body = purchase.body as { hash?: string; markdown?: string };
  const md = body.markdown ?? '';

  // ── Money moved, from the transaction record and never a balance diff ────────────────────────
  // ⚠️ SM-05 reported unchanged balances across a settlement that demonstrably succeeded, because the
  // read happened at consensus finality rather than Mirror Node ingestion.
  const [feeAccount, consensus] = purchase.settledTransaction.split('@');
  let record: Tx | undefined;
  for (let attempt = 0; attempt < 20 && !record; attempt++) {
    try {
      const found = await fetchJson<{ transactions?: Tx[] }>(
        `${MIRROR}/api/v1/transactions/${feeAccount}-${consensus!.replace('.', '-')}`);
      record = found.transactions?.[0];
    } catch { /* not ingested yet */ }
    if (!record) await new Promise((r) => setTimeout(r, 1000));
  }

  // ── The refusals, which cost nothing ─────────────────────────────────────────────────────────
  const quoted = {
    scheme: 'exact', network: NETWORK, asset: HBAR, amount: purchase.amountTinybars,
    payTo: purchase.payTo, maxTimeoutSeconds: 120, extra: {},
  } as unknown as Parameters<typeof vet>[0];
  const refusals = ([
    ['price above the per-payment cap', { ...quoted, amount: '999999999' }],
    ['an asset the buyer never allowlisted', { ...quoted, asset: '0.0.429274' }],
  ] as const).map(([label, mutate]) => {
    try { vet(mutate, opts); return { label, refused: false, control: null, detail: 'NOT refused' }; }
    catch (e) { const r = e as SpendRefused; return { label, refused: true, control: r.control, detail: r.message }; }
  });

  return NextResponse.json({
    mode: 'confirmed', spent: true, plan, trace,
    purchase: {
      paymentId: purchase.paymentId, nativeTxId: purchase.nativeTxId,
      settledTransaction: purchase.settledTransaction, payer: purchase.payer,
      amountHbar: hbar(purchase.amountTinybars), payTo: purchase.payTo,
    },
    body: {
      hashMatchesRequested: body.hash === reportHash.trim(),
      markdownChars: md.length,
      // The market table is the thing the public page provably does not carry.
      tableLines: md.split('\n').filter((l) => l.startsWith('|')).slice(0, 4),
      figure: md.match(/\$[0-9][0-9.]*[BM]/)?.[0] ?? null,
      markdown: md,
    },
    moved: record
      ? {
          result: record.result,
          networkFeeHbar: hbar(record.charged_tx_fee),
          feeBearer: record.transfers.find((t) => t.amount === -record!.charged_tx_fee)?.account ?? 'unknown',
          transfers: record.transfers,
        }
      : { note: 'not ingested within 20s. The settlement succeeded; the Mirror Node record is lagging.' },
    refusals,
    links: {
      hashscan: `https://hashscan.io/testnet/transaction/${purchase.settledTransaction}`,
      report: `/report/${reportHash.trim()}`,
    },
  });
}

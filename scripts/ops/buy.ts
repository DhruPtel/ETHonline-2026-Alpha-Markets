// Buy one report, as an agent, against the DEPLOYED gate.
//
//   npx tsx --env-file=.env scripts/ops/buy.ts <reportHash>            ← prints the plan, spends nothing
//   npx tsx --env-file=.env scripts/ops/buy.ts <reportHash> --confirm  ← spends real testnet HBAR
//
// ⚠️ **Against the deployed app, not localhost.** The point is a real request crossing a network to a
// live gated service — a localhost round trip proves the code, not the deployment.
//
// ⚠️ **Dry by default**, the same shape as `scripts/ops/tokenize.ts`: everything that can be checked
// without spending is checked and printed first, and `--confirm` is a separate human decision.

import { buy, spent, vet, DEFAULT_LIMITS, SpendRefused, type BuyOptions } from '../../src/payments/buyer.js';
import { fetchJson, MIRROR } from '../../src/tokenize/hedera.js';

const SITE = 'https://et-honline-2026-alpha-markets.vercel.app';
const NETWORK = 'hedera:testnet';
const HBAR = '0.0.0';

const env = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) { console.error(`FAIL  ${name} is not set (or is empty).`); process.exit(1); }
  return value;
};

const reportHash = process.argv[2];
const confirmed = process.argv.includes('--confirm');
if (!reportHash) { console.error('usage: buy.ts <reportHash> [--confirm]'); process.exit(1); }

const hbar = (t: string | bigint | number) => (Number(t) / 1e8).toFixed(8);

const opts: BuyOptions = {
  url: `${SITE}/api/reports/${reportHash}`,
  accountId: env('HEDERA_BUYER_ID'),
  privateKey: env('HEDERA_BUYER_KEY'),
  network: NETWORK,
  asset: HBAR,
  onChallenge: (a) => {
    console.log(`\n── The gate quoted`);
    console.log(`  price       ${a.amount} tinybars (${hbar(a.amount)} HBAR)`);
    console.log(`  asset       ${a.asset}`);
    console.log(`  payTo       ${a.payTo}          ← the report's analyst`);
    console.log(`  feePayer    ${(a.extra as { feePayer?: string }).feePayer}`);
    console.log(`  network     ${a.network}   timeout ${a.maxTimeoutSeconds}s`);
  },
  onSigned: (tx, id) => {
    console.log(`\n── Signed, recorded, about to send`);
    console.log(`  native tx   ${tx}   ← recorded BEFORE the request goes out`);
    console.log(`  payment id  ${id}`);
  },
};

console.log(`\n── About to buy a report over x402`);
console.log(`  url         ${opts.url}`);
console.log(`  buyer       ${opts.accountId}`);
console.log(`  caps        ${DEFAULT_LIMITS.perPaymentTinybars} tinybars/payment · ` +
  `${DEFAULT_LIMITS.dailyTinybars}/day  (spent today: ${spent(opts.accountId)})`);

if (!confirmed) {
  console.log(`\nDRY RUN — nothing was sent. Re-run with --confirm to spend real testnet HBAR.\n`);
  process.exit(0);
}

let purchase;
try {
  purchase = await buy(opts);
} catch (error) {
  // ⚠️ STOP and report. Do not retry blind — the native id was recorded before the attempt, which is
  // exactly what makes a failed run reconcilable rather than ambiguous.
  if (error instanceof SpendRefused) {
    console.error(`\nREFUSED by control "${error.control}" — ${error.message}\n`);
  } else {
    console.error(`\nFAIL  ${(error as Error).message}\n`);
  }
  process.exit(1);
}

console.log(`\n── Paid`);
console.log(`  settled tx  ${purchase.settledTransaction}`);
console.log(`  payer       ${purchase.payer}`);
console.log(`  paid        ${hbar(purchase.amountTinybars)} HBAR to ${purchase.payTo}`);

// ── The report the gate served — the half the preview does not ─────────────────────────────────
const body = purchase.body as { hash?: string; markdown?: string; directive?: string };
console.log(`\n── The report body, which the preview page does not serve`);
console.log(`  hash in body matches requested: ${body.hash === reportHash}`);
const md = body.markdown ?? '';
const table = md.split('\n').filter((l) => l.startsWith('|')).slice(0, 4);
console.log(`  markdown    ${md.length} chars`);
for (const line of table) console.log(`    ${line.slice(0, 96)}`);
const figure = md.match(/\$[0-9][0-9.]*[BM]/)?.[0];
console.log(`  a figure from it: ${figure ?? '(none found)'}`);

// ── Money moved — from the transaction record, never a balance diff ────────────────────────────
// ⚠️ SM-05 reported unchanged balances across a settlement that demonstrably succeeded, because the
// read happened at consensus finality rather than Mirror Node ingestion. The record is authoritative
// and gives fee attribution outright.
const [feeAccount, consensus] = purchase.settledTransaction.split('@');
type Tx = { result: string; charged_tx_fee: number; transfers: { account: string; amount: number }[] };
let record: Tx | undefined;
for (let attempt = 0; attempt < 20 && !record; attempt++) {
  try {
    const found = await fetchJson<{ transactions?: Tx[] }>(
      `${MIRROR}/api/v1/transactions/${feeAccount}-${consensus!.replace('.', '-')}`);
    record = found.transactions?.[0];
  } catch { /* not ingested yet */ }
  if (!record) await new Promise((r) => setTimeout(r, 1000));
}

console.log(`\n── Money moved (Mirror Node transaction record, not a balance diff)`);
if (!record) {
  console.log(`  ⚠️ not ingested within 20s. The settlement succeeded; the record is lagging.`);
} else {
  const feeBearer = record.transfers.find((t) => t.amount === -record!.charged_tx_fee);
  console.log(`  on-chain result  ${record.result}`);
  console.log(`  network fee      ${hbar(record.charged_tx_fee)} paid by ${feeBearer?.account ?? 'unknown'}` +
    (feeBearer?.account === feeAccount ? '  ← the facilitator, as designed' : ''));
  for (const t of record.transfers) {
    console.log(`    ${t.account.padEnd(14)} ${t.amount > 0 ? '+' : ''}${t.amount}`);
  }
}

console.log(`\n  HashScan  https://hashscan.io/testnet/transaction/${purchase.settledTransaction}`);

// ── The refusals, which cost nothing ───────────────────────────────────────────────────────────
console.log(`\n── Refusals (no payment attempted)`);
const quoted = {
  scheme: 'exact', network: NETWORK, asset: HBAR, amount: purchase.amountTinybars,
  payTo: purchase.payTo, maxTimeoutSeconds: 120, extra: {},
} as unknown as Parameters<typeof vet>[0];
for (const [label, mutate] of [
  ['price above the per-payment cap', { ...quoted, amount: '999999999' }],
  ['an asset the buyer never allowlisted', { ...quoted, asset: '0.0.429274' }],
] as const) {
  try {
    vet(mutate, opts);
    console.log(`  ⛔ ${label} — NOT refused`);
  } catch (e) {
    const r = e as SpendRefused;
    console.log(`  ✅ ${label}\n       refused by "${r.control}": ${r.message.slice(0, 96)}`);
  }
}

console.log(`\nPASS  one real paid request, end to end, against the deployed gate.\n`);

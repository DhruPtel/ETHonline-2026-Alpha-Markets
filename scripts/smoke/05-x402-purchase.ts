// SM-05 — a real x402 payment for a "hello" endpoint on Hedera testnet.
//
// Three steps, each of which can stop the run:
//   1. the facilitator advertises hedera:testnet with extra.feePayer
//   2. both accounts are associated with testnet USDC, and the buyer holds some
//   3. the handshake — unpaid request, 402, sign, retry, "hello"
//
// R12 is taken; this is testnet. See tracking/DECISIONS.md for the four values that move together.
// The seller runs in-process on localhost — this proves the payment handshake, not a deployment.

import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { x402Client, x402HTTPClient } from "@x402/core/client";
import {
  decodePaymentSignatureHeader,
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader,
  HTTPFacilitatorClient,
} from "@x402/core/http";
import { x402ResourceServer } from "@x402/core/server";
import type { AssetAmount, Network, PaymentPayload, PaymentRequirements } from "@x402/core/types";
import { ExactHederaScheme as ExactHederaClientScheme } from "@x402/hedera/exact/client";
import { ExactHederaScheme as ExactHederaServerScheme } from "@x402/hedera/exact/server";
import {
  AccountId,
  assertSupportedHederaNetwork,
  createClientHederaSigner,
  createHederaClient,
  fetchJson,
  HBAR_ASSET_ID,
  HEDERA_TESTNET_USDC,
  HEDERA_USDC_DECIMALS,
  inspectHederaTransaction,
  mirrorNodeUrlForNetwork,
  PrivateKey,
  TokenAssociateTransaction,
  TokenId,
} from "@x402/hedera";

// ⚠️ Every Hedera SDK type above comes from @x402/hedera's re-exports, never from @hiero-ledger/sdk
// directly. A second copy of the SDK cross-fails at runtime with "t.startsWith is not a function".

const FACILITATOR = "https://api.testnet.blocky402.com";

// ⚠️ This settles in HBAR, not USDC — see tracking/DECISIONS.md. The price cannot be a dollar string:
// "$0.02" resolves through the package's DEFAULT_ASSETS table, which on this network knows only USDC,
// and throws for HBAR. An explicit AssetAmount in atomic units bypasses the table entirely.
// HBAR carries 8 decimals, so 100000 tinybars = 0.001 HBAR.
const PRICE: AssetAmount = { asset: HBAR_ASSET_ID, amount: "100000" };
const HBAR_DECIMALS = 8;

const env = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    console.error(`FAIL  ${name} is not set. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
  return value;
};

const SELLER_ID = env("HEDERA_SELLER_ID");
const SELLER_KEY = env("HEDERA_SELLER_KEY");
const BUYER_ID = env("HEDERA_BUYER_ID");
const BUYER_KEY = env("HEDERA_BUYER_KEY");

// HEDERA_NETWORK is the SDK's name ("testnet"); x402 wants CAIP-2 ("hedera:testnet"). Deriving one
// from the other means the two can never drift apart, which is the whole point of R12's atomic switch.
const NETWORK_NAME = env("HEDERA_NETWORK");
const NETWORK = `hedera:${NETWORK_NAME}`;
assertSupportedHederaNetwork(NETWORK);

const usdc = (atomic: string | bigint): string =>
  (Number(atomic) / 10 ** HEDERA_USDC_DECIMALS).toFixed(6);
const hbar = (tinybars: string | bigint | number): string =>
  (Number(tinybars) / 10 ** HBAR_DECIMALS).toFixed(8);

// The asset decides whether step 2 has anything to do. HBAR is native to every account; an HTS token
// has to be associated first. Setting PRICE back to a dollar string flips this on again.
const NEEDS_ASSOCIATION = PRICE.asset !== HBAR_ASSET_ID;

// ─── Step 1 — the facilitator ────────────────────────────────────────────────────────────────────
// If it doesn't advertise our network, nothing below can work and the testnet decision loses its
// basis: H1.2 requires settlement through Blocky402 specifically.

type SupportedKind = { scheme: string; network: string; extra?: { feePayer?: string } };

console.log(`\n── Step 1 · facilitator ${FACILITATOR}/supported`);

const supported = await fetchJson<{ kinds: SupportedKind[]; signers?: Record<string, string[]> }>(
  `${FACILITATOR}/supported`,
);

for (const kind of supported.kinds) {
  const marker = kind.network === NETWORK ? "→" : " ";
  console.log(`  ${marker} ${kind.scheme.padEnd(6)} ${kind.network.padEnd(34)} feePayer ${kind.extra?.feePayer ?? "—"}`);
}

const ourKind = supported.kinds.find((k) => k.network === NETWORK && k.scheme === "exact");
if (!ourKind) {
  console.error(`\nFAIL  ${FACILITATOR} does not advertise "exact" on ${NETWORK}.`);
  console.error("      STOP — this is plan-level. H1.2 requires settlement through Blocky402, and");
  console.error("      testnet-over-mainnet (R12) rests on this host supporting it. Do not work around.");
  process.exit(1);
}

const feePayer = ourKind.extra?.feePayer;
if (!feePayer) {
  console.error(`\nFAIL  ${NETWORK} is advertised but carries no extra.feePayer.`);
  console.error("      The scheme copies that field into every 402 challenge and the client throws without it.");
  process.exit(1);
}

console.log(`  PASS  ${NETWORK} supported, feePayer ${feePayer}`);

// ─── Step 2 — asset availability ─────────────────────────────────────────────────────────────────
// For an HTS token this is association, and the trap is that an unassociated account does not report
// an association error: its token list comes back empty, which reads as insufficient_balance, and you
// go top up a wallet that is already funded. So association state and balance are reported as two
// separate facts, never collapsed into one.
//
// For HBAR there is nothing to do — it is native to every account. The association path below stays
// intact and is skipped, not deleted; it is correct and comes back the moment we price in USDC again.

console.log(`\n── Step 2 · asset ${PRICE.asset}` + (NEEDS_ASSOCIATION ? " association" : " (HBAR) — association skipped"));

type MirrorTokens = { tokens: { token_id: string; balance: number }[] };
type MirrorAccount = { balance?: { balance: number } };

const associate = async (label: string, accountId: string, keyString: string): Promise<void> => {
  const key = PrivateKey.fromStringECDSA(keyString);
  const client = createHederaClient(NETWORK).setOperator(AccountId.fromString(accountId), key);
  try {
    const submitted = await new TokenAssociateTransaction()
      .setAccountId(AccountId.fromString(accountId))
      .setTokenIds([TokenId.fromString(HEDERA_TESTNET_USDC)])
      .execute(client);
    const receipt = await submitted.getReceipt(client);
    console.log(`  ${label.padEnd(6)} ${accountId}  associated (${receipt.status.toString()})`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("TOKEN_ALREADY_ASSOCIATED_TO_ACCOUNT")) {
      console.log(`  ${label.padEnd(6)} ${accountId}  already associated`);
    } else {
      console.error(`  ${label.padEnd(6)} ${accountId}  FAILED — ${message}`);
      throw error;
    }
  } finally {
    client.close();
  }
};

// Mirror Node, not a consensus-node query: the SDK docs are explicit that consensus-node token
// queries no longer return association data dependably. This is the same source the facilitator's
// own preflight uses, so we see what it will see.
const mirror = mirrorNodeUrlForNetwork(NETWORK);

const hbarBalance = async (accountId: string): Promise<bigint> => {
  const account = await fetchJson<MirrorAccount>(`${mirror}/api/v1/accounts/${accountId}`);
  return BigInt(account.balance?.balance ?? 0);
};
const holdings = async (accountId: string): Promise<{ associated: boolean; balance: bigint }> => {
  const found = await fetchJson<MirrorTokens>(
    `${mirror}/api/v1/accounts/${accountId}/tokens?token.id=${HEDERA_TESTNET_USDC}`,
  );
  const row = found.tokens.find((t) => t.token_id === HEDERA_TESTNET_USDC);
  return { associated: row !== undefined, balance: BigInt(row?.balance ?? 0) };
};

// Mirror Node ingests from consensus with a lag of a second or two, so a read taken straight after
// the association transaction can still report the account as unassociated. That is not cosmetic:
// the facilitator preflights against this same source, so a payment fired immediately after
// associating fails with a reason that points at the wrong thing entirely. Wait for the write to land.
const settledHoldings = async (accountId: string): Promise<{ associated: boolean; balance: bigint }> => {
  for (let attempt = 0; attempt < 10; attempt++) {
    const found = await holdings(accountId);
    if (found.associated) return found;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return holdings(accountId);
};

if (NEEDS_ASSOCIATION) {
  await associate("seller", SELLER_ID, SELLER_KEY);
  await associate("buyer", BUYER_ID, BUYER_KEY);

  const sellerHoldings = await settledHoldings(SELLER_ID);
  const buyerHoldings = await settledHoldings(BUYER_ID);

  console.log(`\n  account          associated   USDC`);
  console.log(`  seller ${SELLER_ID.padEnd(12)} ${String(sellerHoldings.associated).padEnd(10)} ${usdc(sellerHoldings.balance)}`);
  console.log(`  buyer  ${BUYER_ID.padEnd(12)} ${String(buyerHoldings.associated).padEnd(10)} ${usdc(buyerHoldings.balance)}`);

  // Association and balance are reported as two separate facts on purpose. Collapsing them is the
  // trap this step exists to avoid: an unassociated account returns an empty token list, which reads
  // as insufficient_balance and sends you to top up a wallet that was already funded.
  if (!buyerHoldings.associated || !sellerHoldings.associated) {
    const unassociated = [
      !sellerHoldings.associated ? `seller ${SELLER_ID}` : null,
      !buyerHoldings.associated ? `buyer ${BUYER_ID}` : null,
    ].filter(Boolean).join(", ");
    console.error(`\nSTOP  Not associated with ${PRICE.asset} after 10s: ${unassociated}.`);
    console.error("      This is an association problem, not a funding one. Do not top up in response to it.");
    process.exit(1);
  }

  if (buyerHoldings.balance === 0n) {
    console.error(`\nSTOP  The buyer is associated with ${PRICE.asset} and holds none.`);
    console.error("      Association is confirmed on Mirror Node above, so this is a funding gap and");
    console.error(`      nothing else. Fund ${BUYER_ID} and re-run. No workaround here.`);
    process.exit(1);
  }
} else {
  console.log("  HBAR is native to every Hedera account, so there is nothing to associate and no");
  console.log(`  faucet in the path. The TokenAssociateTransaction code above is kept for USDC`);
  console.log(`  ${HEDERA_TESTNET_USDC} and is simply not exercised on this run.`);
  console.log("  Why HBAR: Circle's testnet faucet is not delivering USDC. See tracking/DECISIONS.md.");
}

// Read regardless of asset — the HBAR delta across the payment is measured either way, and for an
// HBAR payment this is the balance that has to cover it.
const sellerBefore = await hbarBalance(SELLER_ID);
const buyerBefore = await hbarBalance(BUYER_ID);

console.log(`\n  account          HBAR`);
console.log(`  seller ${SELLER_ID.padEnd(12)} ${hbar(sellerBefore)}`);
console.log(`  buyer  ${BUYER_ID.padEnd(12)} ${hbar(buyerBefore)}`);

if (!NEEDS_ASSOCIATION && buyerBefore < BigInt(PRICE.amount)) {
  console.error(`\nSTOP  The buyer holds ${hbar(buyerBefore)} HBAR, less than the ${hbar(PRICE.amount)} price.`);
  console.error(`      Fund ${BUYER_ID} from https://portal.hedera.com/faucet and re-run.`);
  process.exit(1);
}

// ─── Step 3 — the handshake ──────────────────────────────────────────────────────────────────────

console.log(`\n── Step 3 · handshake`);

// The seller is built from the facilitator URL and its own account id. No key, no fee-payer secret:
// the facilitator co-signs as fee payer and submits. Note 2 of the unit, verified by construction.
const seller = new x402ResourceServer(new HTTPFacilitatorClient({ url: FACILITATOR })).register(
  NETWORK,
  new ExactHederaServerScheme(),
);
await seller.initialize();

const requirements: PaymentRequirements[] = await seller.buildPaymentRequirements({
  scheme: "exact",
  payTo: SELLER_ID,
  price: PRICE,
  network: NETWORK,
  maxTimeoutSeconds: 120,
});

let nativeTransactionId = "";

const http = createServer((req, res) => {
  void (async () => {
    const signature = req.headers["payment-signature"];

    if (typeof signature !== "string") {
      const challenge = await seller.createPaymentRequiredResponse(
        requirements,
        { url: "http://localhost/hello", description: "SM-05 hello", mimeType: "text/plain" },
        "Payment required",
      );
      res.writeHead(402, {
        "content-type": "application/json",
        "PAYMENT-REQUIRED": encodePaymentRequiredHeader(challenge),
      });
      res.end(JSON.stringify(challenge));
      return;
    }

    const payload: PaymentPayload = decodePaymentSignatureHeader(signature);
    const matched = seller.findMatchingRequirements(requirements, payload);
    if (!matched) {
      res.writeHead(402).end("no matching requirements");
      return;
    }

    const verified = await seller.verifyPayment(payload, matched);
    console.log(`  seller · verify   isValid=${verified.isValid} payer=${verified.payer ?? "—"}` +
      (verified.invalidReason ? ` reason=${verified.invalidReason}` : ""));
    if (!verified.isValid) {
      res.writeHead(402).end(verified.invalidMessage ?? "invalid payment");
      return;
    }

    // ⚠️ Print the native transaction id BEFORE settling. Every Hedera settle failure — including a
    // timeout after the transaction was successfully broadcast — comes back as
    // { success: false, transaction: "" }, leaving nothing to reconcile against afterwards. The id is
    // recoverable from the signed bytes we already hold. In production this write goes to the DB first.
    const inspected = inspectHederaTransaction((payload.payload as { transaction: string }).transaction);
    nativeTransactionId = inspected.transactionId;
    console.log(`  seller · native tx ${nativeTransactionId}   ← recorded BEFORE settle`);

    const settled = await seller.settlePayment(payload, matched);
    console.log(`  seller · settle   success=${settled.success} tx=${settled.transaction || '""'}` +
      (settled.errorReason ? ` reason=${settled.errorReason}` : ""));
    if (!settled.success) {
      res.writeHead(502, { "PAYMENT-RESPONSE": encodePaymentResponseHeader(settled) });
      res.end(settled.errorMessage ?? "settlement failed");
      return;
    }

    res.writeHead(200, {
      "content-type": "text/plain",
      "PAYMENT-RESPONSE": encodePaymentResponseHeader(settled),
    });
    res.end("hello");
  })().catch((error) => {
    console.error("  seller · threw", error);
    if (!res.headersSent) res.writeHead(500);
    res.end("error");
  });
});

await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${(http.address() as AddressInfo).port}/hello`;
console.log(`  seller listening on ${url}`);
console.log(`  priced at ${PRICE.amount} atomic units of ${PRICE.asset} (${hbar(PRICE.amount)} HBAR), payTo ${SELLER_ID}`);

const signer = createClientHederaSigner(BUYER_ID, PrivateKey.fromStringECDSA(BUYER_KEY), {
  network: NETWORK,
});
// ⚠️ HBAR has to be allowlisted explicitly. The client's spend controls are on by default and allow
// only assets `findDefaultAsset` recognizes — on this network that is USDC alone, so an HBAR payment
// is refused before it is ever signed. That default is fail-closed and worth keeping: it is the only
// thing standing between an autonomous buyer and paying whatever it is asked in an asset nobody
// declared. So this opts HBAR in with its own atomic cap rather than passing `spendControls: false`.
const SPEND_CAP = (BigInt(PRICE.amount) * 10n).toString();
const buyer = new x402HTTPClient(
  new x402Client()
    .register(NETWORK, new ExactHederaClientScheme(signer))
    .setSpendControls({
      allowedAssets: [{ network: NETWORK, asset: PRICE.asset, maxAmountPerPayment: SPEND_CAP }],
    }),
);

try {
  const unpaid = await fetch(url);
  console.log(`  buyer  · unpaid request → ${unpaid.status}`);
  if (unpaid.status !== 402) {
    console.error(`FAIL  expected 402, got ${unpaid.status}. The endpoint is not gated.`);
    process.exit(1);
  }

  const body = await unpaid.clone().json().catch(() => undefined);
  const challenge = buyer.getPaymentRequiredResponse((n) => unpaid.headers.get(n), body);
  const accepted = challenge.accepts[0] as PaymentRequirements;

  console.log(`  buyer  · 402 challenge decoded:`);
  console.log(`             amount    ${accepted.amount} (${accepted.asset === HBAR_ASSET_ID ? `${hbar(accepted.amount)} HBAR` : `${usdc(accepted.amount)} USDC`})`);
  console.log(`             asset     ${accepted.asset}`);
  console.log(`             payTo     ${accepted.payTo}`);
  console.log(`             feePayer  ${(accepted.extra as { feePayer?: string }).feePayer ?? "MISSING"}`);
  console.log(`             timeout   ${accepted.maxTimeoutSeconds}s`);

  const payment = await buyer.createPaymentPayload(challenge);
  const inspected = inspectHederaTransaction((payment.payload as { transaction: string }).transaction);
  console.log(`  buyer  · signed partially — tx ${inspected.transactionId}`);
  // HBAR moves in hbarTransfers; an HTS token moves in tokenTransfers keyed by token id.
  for (const t of inspected.hbarTransfers) {
    console.log(`             HBAR       ${t.accountId.padEnd(14)} ${t.amount}`);
  }
  for (const [token, transfers] of Object.entries(inspected.tokenTransfers)) {
    for (const t of transfers) console.log(`             ${token.padEnd(10)} ${t.accountId.padEnd(14)} ${t.amount}`);
  }

  const paid = await fetch(url, { headers: buyer.encodePaymentSignatureHeader(payment) });
  const result = await buyer.processResponse(paid);

  console.log(`  buyer  · paid request → ${result.status}, paymentStatus=${result.paymentStatus}`);

  if (result.paymentStatus !== "settled") {
    console.error(`\nFAIL  payment did not settle (${result.paymentStatus}).`);
    console.error(`      Native transaction id, for reconciliation: ${nativeTransactionId || "not reached"}`);
    process.exit(1);
  }

  const settle = result.header as { transaction: string; payer?: string; amount?: string };
  console.log(`\n  content returned: ${JSON.stringify(result.body)}`);
  console.log(`  settled tx        ${settle.transaction}`);
  console.log(`  payer             ${settle.payer ?? "—"}`);

  // The facilitator is fee payer and submits, so the buyer should be down the payment and nothing
  // else. A delta larger than the price would mean the buyer paid network fees it was not supposed
  // to, which changes who bears the cost of every purchase we ever make.
  //
  // Same Mirror Node lag as step 2, at the other end of the payment: settlement has reached consensus
  // by the time we get here, but the REST API has not necessarily ingested it. Reading immediately
  // reports both balances unchanged and a nonsensical negative fee. Wait for the transfer to land.
  const settledBalance = async (accountId: string, before: bigint): Promise<bigint> => {
    for (let attempt = 0; attempt < 15; attempt++) {
      const now = await hbarBalance(accountId);
      if (now !== before) return now;
      await new Promise((r) => setTimeout(r, 1000));
    }
    return hbarBalance(accountId);
  };

  const buyerAfter = await settledBalance(BUYER_ID, buyerBefore);
  const sellerAfter = await settledBalance(SELLER_ID, sellerBefore);
  const spent = buyerBefore - buyerAfter;

  console.log(`\n  buyer  HBAR       ${hbar(buyerBefore)} → ${hbar(buyerAfter)}   (−${hbar(spent)})`);
  console.log(`  seller HBAR       ${hbar(sellerBefore)} → ${hbar(sellerAfter)}   (+${hbar(sellerAfter - sellerBefore)})`);
  console.log(`  price             ${hbar(PRICE.amount)}`);
  console.log(`  buyer's own fees  ${hbar(spent - BigInt(PRICE.amount))}`);

  // The transaction record is the authoritative answer on who paid the fee — a balance delta only
  // shows that the buyer didn't, not who did.
  const [feeAccount, consensus] = settle.transaction.split("@");
  const record = await fetchJson<{
    transactions?: { result: string; charged_tx_fee: number; transfers: { account: string; amount: number }[] }[];
  }>(`${mirror}/api/v1/transactions/${feeAccount}-${consensus.replace(".", "-")}`);
  const tx = record.transactions?.[0];

  if (tx) {
    const feeBearer = tx.transfers.find((t) => t.amount === -tx.charged_tx_fee);
    console.log(`\n  on-chain result   ${tx.result}`);
    console.log(`  network fee       ${hbar(tx.charged_tx_fee)} paid by ${feeBearer?.account ?? "unknown"}` +
      (feeBearer?.account === feePayer ? "  ← the facilitator, as designed" : "  ⚠️ NOT the facilitator"));
    for (const t of tx.transfers) {
      console.log(`    ${t.account.padEnd(14)} ${t.amount > 0 ? "+" : ""}${t.amount}`);
    }
  }

  console.log(`\nPASS  SM-05. Value moved on ${NETWORK}, settled through Blocky402.`);
  console.log(`      HashScan: https://hashscan.io/${NETWORK_NAME}/transaction/${settle.transaction}`);
  console.log(`      The seller never held a fee-payer key — it was built from the facilitator URL alone.`);
} finally {
  http.close();
}

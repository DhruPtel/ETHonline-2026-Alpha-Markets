// What a report costs to read.
//
// ⚠️ **Priced in HBAR, and that is not an oversight about pricing a security in a chain's native
// currency.** A `"$0.50"` string does not work here: `defaultMoneyConversion` resolves a USD price
// through a `DEFAULT_ASSETS` table that has no entry for HBAR, so a dollar-denominated price
// **throws** rather than converting. Testnet therefore prices in HBAR and the **mainnet cutover
// prices in USDC at the end of Phase 4** — DECISIONS.md 2026-09-06 and 2026-09-08. What moves at that
// cutover is the token id, this amount, the buyer's `allowedAssets` entry and the facilitator's
// advertised asset, together and in one commit (R12). ⚠️ The cost meanwhile is stated rather than
// implied: no USD-legible price on testnet, and H1.7 forfeited until the cutover.
//
// ── The split, and why it exists ─────────────────────────────────────────────────────────────────
//
// ⚠️ **This file used to export a ready-made `AssetAmount` and import `HBAR_ASSET_ID` from
// `@x402/hedera` to build it. That was measured and reverted on 2026-09-08.** The reasoning was
// sound — never restate a vendor constant — and the cost was not predicted: `@x402/hedera` hard-pins
// `@hiero-ledger/sdk`, so importing one string pulled in `@grpc/grpc-js`, `pino`, `sonic-boom` and
// `thread-stream`. Both app pages went from **~1.8 MB traced to ~4.0 MB, 111 files to 222**. It did
// not tree-shake. A marketplace listing page was carrying a gRPC client and a logging framework to
// render the characters `0.001`.
//
// So the file now has two halves:
//
//   `REPORT_PRICE_TINYBARS` / `REPORT_PRICE_HBAR`  — plain values, **no vendor import at runtime**.
//                                                    What a page displays, and what `quotes.ts`
//                                                    freezes into a row. Both are live.
//   `reportPrice(asset)`                           — assembles an `AssetAmount` from the constant.
//                                                    ⚠️ **UNUSED — see below.**
//
// ⚠️ **`reportPrice()` has no caller anywhere in the repo, and the split above is still the right
// shape.** It was written for Units 13 and 14. Unit 13 then wrote `quotes.ts`'s `quoteAmount(q, asset)`
// instead — correctly, and it is the one to copy: a challenge must advertise the price **frozen into
// the quote row**, not the current value of this constant, or the row is a decoration. Unit 14 calls
// `quoteAmount`. So the two units solved one problem twice and only the better answer is wired up.
//
// Kept rather than deleted for one reason: the mainnet/USDC cutover needs exactly this function for
// any price that is *not* coming off a quote, and re-deriving the two-halves reasoning would cost
// more than the eight lines. ⚠️ If the cutover arrives and still nothing calls it, delete it then.
// Recorded 2026-09-09.
//
// ⚠️ **The no-restated-vendor-constant property is kept, not traded away.** This file never writes
// HBAR's asset id down. `reportPrice` receives it, and the only correct argument is
// `HBAR_ASSET_ID` imported from `@x402/hedera` at the call site — which is exactly where the SDK is
// already paid for. `AssetAmount` below is an `import type` and erases at compile time.
//
// ⚠️ **One price, one place — and the split cannot create two numbers that disagree.**
// `REPORT_PRICE_TINYBARS` is the single definition. `REPORT_PRICE_HBAR` is *derived* from it by
// division rather than written out, and `reportPrice()` *returns* it rather than restating it. There
// is no second literal anywhere in this file to drift from the first.

import type { AssetAmount } from '@x402/core/types';

/** Tinybars per HBAR. Used once, to derive the display string below. */
const TINYBARS_PER_HBAR = 100_000_000;

/**
 * The price of one report, in tinybars. **The single definition — everything else here derives.**
 *
 * ⚠️ **100,000 tinybars = 0.001 HBAR, and the number is not newly chosen.** It is what SM-05 settled
 * a real payment with on 2026-09-06 and what `app/api/probe/route.ts` advertises in the live deployed
 * challenge today. Reusing it means the first priced report is priced at a figure already proven end
 * to end through Blocky402 rather than one this file invented.
 *
 * ⚠️ **A STRING, never a number.** `AssetAmount.amount` is typed `string` because an atomic amount is
 * exact and a float is not. `quotes.price_tinybars` is `BIGINT`, which the `postgres` driver also
 * returns as a string — so the two line up with no coercion, which is the opposite of the `block`
 * trap in `store/reports.ts`. Do not "fix" either end into a number.
 */
export const REPORT_PRICE_TINYBARS = '100000';

/**
 * The same price, formatted for a reader. ⚠️ **Derived, never written out** — that is what stops a
 * page and a challenge from ever quoting different numbers.
 *
 * `Number()` here is display, and display is the one place the no-floating-point rule does not apply
 * — same rule `narrate.ts` and `reconcile.ts` state at their own sites. Nothing returned by this is
 * stored, hashed, or sent to a facilitator.
 */
export const REPORT_PRICE_HBAR = (Number(REPORT_PRICE_TINYBARS) / TINYBARS_PER_HBAR).toFixed(3);

/**
 * The price as an `AssetAmount`, for whatever is building a payment challenge.
 *
 * ⚠️ **UNUSED as of 2026-09-09 — nothing calls this.** The gate takes its `AssetAmount` from
 * `payments/quotes.ts`'s `quoteAmount(q, asset)`, which reads the price frozen into the quote row
 * rather than this constant. That is the correct source for anything being *sold*; see the header.
 *
 * ⚠️ **Pass `HBAR_ASSET_ID` from `@x402/hedera`.** It is not defaulted and not restated here, because
 * a defaulted asset id would either re-import the SDK — the whole reason for this split — or hardcode
 * a vendor constant this file has no business owning. Any caller that needs a challenge amount
 * imports `@x402/hedera` regardless, so the import is free where it happens and expensive here.
 *
 * ⚠️ At the mainnet cutover this is called with USDC's token id instead, and `REPORT_PRICE_TINYBARS`
 * changes to USDC's atomic units in the same commit. The shape does not change.
 */
export function reportPrice(asset: string): AssetAmount {
  return { asset, amount: REPORT_PRICE_TINYBARS };
}

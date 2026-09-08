// What a report costs to read.
//
// ⚠️ **Priced in HBAR, and that is not an oversight about pricing a security in a chain's native
// currency.** A `"$0.50"` string does not work here: `defaultMoneyConversion` resolves a USD price
// through a `DEFAULT_ASSETS` table that has no entry for HBAR asset `0.0.0`, so a dollar-denominated
// price **throws** rather than converting. Testnet therefore prices in HBAR and the **mainnet cutover
// prices in USDC at the end of Phase 4** — DECISIONS.md 2026-09-06 and 2026-09-08. What moves at that
// cutover is the token id, this amount, the buyer's `allowedAssets` entry and the facilitator's
// advertised asset, together and in one commit (R12). ⚠️ The cost of pricing this way meanwhile is
// stated rather than implied: no USD-legible price on testnet, and H1.7 forfeited until the cutover.
//
// ── Why its own file ─────────────────────────────────────────────────────────────────────────────
//
// `src/config/` is one concern per file: `protocols.ts` is the deployment table, `analysts.ts` is the
// analyst table, `model.ts` is the model default. A price is none of those.
//
// ⚠️ **This file breaks `src/config/`'s dependency-free property, deliberately.** Every other config
// module imports only relative paths. This one imports `HBAR_ASSET_ID` from the vendor rather than
// restating `'0.0.0'`, because a restated vendor constant that silently disagrees with the package is
// the exact class of bug this project keeps finding. `AssetAmount` is a `import type` and erases
// entirely. ⚠️ Whoever wires this into a page (Unit 6b) should **measure** whether pulling
// `@x402/hedera` in for one string moves the traced size — Unit 1's 10.0 MB figure came from five
// heavy imports all referenced at runtime, which is not this, so guessing either way is wrong.

import type { AssetAmount } from '@x402/core/types';
import { HBAR_ASSET_ID } from '@x402/hedera';

/**
 * The price of one report, flat across the platform.
 *
 * ⚠️ **100,000 tinybars = 0.001 HBAR, and the number is not newly chosen.** It is what SM-05 settled
 * a real payment with on 2026-09-06 and what `app/api/probe/route.ts` advertises in the live
 * deployed challenge today (`amount=100000 asset=0.0.0 network=hedera:testnet`, read back from the
 * deployed 402). Reusing it means the first priced report is priced at a number already proven end to
 * end through Blocky402 rather than one this file invented.
 *
 * ⚠️ **Tinybars as a STRING, never a number.** `AssetAmount.amount` is typed `string` because an
 * atomic amount is exact and a float is not. `quotes.price_tinybars` is `BIGINT`, which the `postgres`
 * driver also returns as a string — so the two line up with no coercion, which is the opposite of the
 * `block` trap in `store/reports.ts`. Do not "fix" either end into a number.
 *
 * ⚠️ **Flat is a decision, not a placeholder — and per-analyst pricing is additive.** Each analyst
 * already has its own `payTo` (DECISIONS.md 2026-09-08), so an analyst charging its own price is the
 * obvious next step: it becomes a field on the row in `analysts.ts`, seeded from this constant, the
 * same shape `MODEL` and `AnalystConfig.model` already have. Nothing here forecloses that. One price
 * ships because one analyst ships, and a second analyst is when to revisit it.
 *
 * ⚠️ **A constant, not a row in `quotes`.** This is what a report costs; freezing that against a
 * particular report with an expiry is `payments/quotes.ts` (Unit 13), and nothing in this file may
 * import the store.
 */
export const REPORT_PRICE: AssetAmount = {
  asset: HBAR_ASSET_ID,   // '0.0.0' — native HBAR
  amount: '100000',
};

// What a thing costs, rendered in one place.
//
// ⚠️ **The references say "5 USDC per unlock" at six different prices. All of that is wrong here**
// and the correction is not cosmetic: `src/config/pricing.ts` records that a USD-denominated price
// **throws** on testnet — `defaultMoneyConversion` resolves USD through a `DEFAULT_ASSETS` table
// with no HBAR entry — and there is exactly **one** price, `REPORT_PRICE_TINYBARS`, for every report.
// Per-report pricing would need a `reports` column, a `quotes.ts` change and a decision about
// whether a price sits inside the report's hash. It does not, and that is a store unit's business.
//
// ⚠️ **Why a component rather than a string.** The mainnet cutover moves four things in one commit
// (R12): the token id, the amount, the buyer's `allowedAssets` entry and the facilitator's
// advertised asset. When it happens **this file changes and every surface follows.**
//
// ⚠️ **USDC on the market pages is correct and must not be "fixed" to match.** Arc's native gas token
// *is* USDC at 18 decimals. The same word means two rails on two screens and both are right.
//
// ⚠️ **A string amount, never a number.** `AssetAmount.amount` is typed `string` because an atomic
// amount is exact and a float is not, and `quotes.price_tinybars` comes back from the driver as a
// string for the same reason. Do not "fix" either end into a number.

export function Price({ amount, rail, size = 'md', note }: {
  /** Already formatted for display — `REPORT_PRICE_HBAR`, or USDC off a pool. */
  amount: string;
  rail: 'HBAR' | 'USDC';
  size?: 'sm' | 'md' | 'lg';
  /** ⚠️ Shown rather than implied: there is no USD-legible price until the cutover. */
  note?: string;
}) {
  return (
    <span className={`price price-${size}`}>
      <span className="price-amount">{amount}</span>
      <span className="price-rail">{rail}</span>
      {note ? <span className="price-note">{note}</span> : null}
    </span>
  );
}

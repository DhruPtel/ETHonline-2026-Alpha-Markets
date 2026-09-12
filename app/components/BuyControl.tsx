'use client';

import {Lock} from './Icons.js';

/**
 * The paywall control on /report/[hash]. Client-only because it owns the click
 * that will take payment. onBuy is the stub the x402 flow replaces.
 */
export function BuyControl({price, currency}: {price: number; currency: string}) {
  function onBuy() {
    // Takes payment for this report and unlocks the body for the account.
  }

  return (
    <div className="purchase-bar">
      <div>
        <strong>
          {price} {currency}
        </strong>
        <span>x402 · Paid access</span>
      </div>
      <button className="btn primary" type="button" onClick={onBuy}>
        <Lock size={15} /> Unlock for {price} {currency}
      </button>
    </div>
  );
}

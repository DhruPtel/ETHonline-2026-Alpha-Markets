'use client';

import {useState} from 'react';
import {ArrowRight} from './Icons.js';

/**
 * The position panel on /markets/[id]. Client-only: it owns the amount input,
 * the presets and the attach-report toggle.
 *
 * There is no side picker. A staker joins the side of the claim their attached
 * report backs, so the side is shown as text and comes in as a prop.
 *
 * The stake amount is local browser state because the payout preview is
 * computed from it as you type. onStake is the stub the Arc call replaces.
 */
export function StakeControl({
  side,
  sidePct,
  currency,
  presets,
  defaultAmount,
  backingReport,
  resolved,
}: {
  side: 'TRUE' | 'FALSE';
  sidePct: number;
  currency: string;
  presets: number[];
  defaultAmount: number;
  backingReport: {title: string; hash: string};
  resolved: boolean;
}) {
  const [amount, setAmount] = useState(String(defaultAmount));
  const [attach, setAttach] = useState(true);

  const value = Number(amount);
  const valid = Number.isFinite(value) && value > 0;
  const payout = valid && sidePct > 0 ? value / (sidePct / 100) : 0;

  function onStake() {
    // Places the stake on this side of the claim and records the receipt.
  }

  function onToggleAttachReport() {
    setAttach((on) => !on);
  }

  return (
    <>
      <label htmlFor="stake-side">Your side</label>
      <p className="stake-side" id="stake-side">
        <i className={side === 'TRUE' ? 'dot-true' : 'dot-false'} />
        <strong>{side}</strong>
        <span>{sidePct}% implied</span>
      </p>

      <label htmlFor="stake-amount">Stake amount</label>
      <div className="amount-field">
        <input
          id="stake-amount"
          type="number"
          min="1"
          step="1"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <span>{currency}</span>
      </div>

      <div className="amount-shortcuts">
        {presets.map((preset) => (
          <button
            key={preset}
            type="button"
            className={value === preset ? 'active' : undefined}
            onClick={() => setAmount(String(preset))}
          >
            {preset}
          </button>
        ))}
      </div>

      <div className="switch-row">
        <label htmlFor="attach-report">Attach supporting report</label>
        <button
          id="attach-report"
          className={attach ? 'switch on' : 'switch'}
          type="button"
          role="switch"
          aria-checked={attach}
          onClick={onToggleAttachReport}
        >
          <span className="switch-thumb" />
        </button>
      </div>

      {attach && (
        <p className="attached-report">
          <span>{backingReport.title}</span>
          <small>Backs {side}</small>
        </p>
      )}

      <div className="payout-estimate">
        <span>
          Potential total payout <small>Includes stake · No fees applied</small>
        </span>
        <strong>
          {payout.toLocaleString('en-US', {maximumFractionDigits: 2, minimumFractionDigits: 0})}
          <small>{currency}</small>
        </strong>
      </div>

      <button className="btn white full" type="button" onClick={onStake} disabled={resolved || !valid}>
        {resolved ? 'Market resolved' : `Stake on ${side}`}
        {!resolved && <ArrowRight size={16} />}
      </button>

      {!valid && <p className="validation-message">Enter a positive amount.</p>}
    </>
  );
}

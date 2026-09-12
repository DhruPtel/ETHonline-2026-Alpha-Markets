'use client';

import {useState} from 'react';
import {ArrowUpRight, Lock} from './Icons.js';

/**
 * The position panel on `/markets/[id]`.
 *
 * ⚠️ **THE STAKING CALL IS NOT WIRED THIS UNIT AND THE BUTTON SAYS SO.** Wiring it is the next task;
 * mixing the two would make a data problem look like a transaction problem. Everything the panel
 * *states* is real — the side, the claim, the report, the pools and the cap all come from the store
 * and the contract.
 *
 * ── ⚠️ THERE IS NO SIDE PICKER, AND ITS ABSENCE IS THE CONTRACT'S DOING ─────────────────────────
 *
 * `stake(marketId, claimId)` takes **no side**. The contract reads the side off the claim, so a
 * staker joins a claim and inherits its side. A picker would let two people back opposite sides of
 * one claim — a hole the contract closed and an interface must not reopen. The side is text.
 *
 * ── ⚠️ "ATTACH SUPPORTING REPORT" IS GONE, AND IT COULD NEVER HAVE WORKED ────────────────────────
 *
 * The design had a toggle that attached a report to your stake. **Nothing can attach anything.** The
 * chain of custody runs the other way: a claim cites exactly one report, and a staker joins the
 * claim — so the report is already fixed before anyone arrives, and there is no field on `stake()`
 * to carry a second one. A switch implying otherwise would promise a thing the contract has no
 * parameter for. In its place the panel **states the report this claim already cites**, with a link
 * to it, which is the true version of what the toggle was gesturing at.
 *
 * ── ⚠️ NO PAYOUT ESTIMATE ────────────────────────────────────────────────────────────────────────
 *
 * The design computed `stake / (impliedPct / 100)`. That is not this contract's arithmetic — a
 * parimutuel pays `stake × totalPool / winningPool`, and **when the winning pool is empty of anyone
 * else it returns each stake to the staker who made it**. Every pool in this deployment is one-sided,
 * so the design's formula would have printed a confident multiple of your money for a market that
 * would simply hand it back. The rule is stated in words against the real pools instead.
 */
export function StakeControl({
  side,
  sidePct,
  currency,
  poolTrue,
  poolFalse,
  maxStake,
  claimId,
  reportHash,
  reportTitle,
  open,
  standing,
}: {
  /** ⚠️ From the claim, never from a control. */
  side: 'TRUE' | 'FALSE';
  /** The live pool share of that side, or `null` when nothing is staked at all. */
  sidePct: number | null;
  currency: string;
  poolTrue: string;
  poolFalse: string;
  /** The contract's own `MAX_STAKE()`, read on this request. */
  maxStake: string;
  claimId: string;
  reportHash: string;
  reportTitle: string;
  open: boolean;
  standing: string;
}) {
  const [amount, setAmount] = useState('1');
  const value = Number(amount);
  const valid = Number.isFinite(value) && value > 0 && value <= Number(maxStake);

  return (
    <>
      <label htmlFor="stake-side">Your side</label>
      {/* ⚠️ Text, not a picker. The contract decides this, not the staker. */}
      <p className="stake-side" id="stake-side">
        <i className={side === 'TRUE' ? 'dot-true' : 'dot-false'} />
        <strong>{side}</strong>
        <span>{sidePct === null ? 'no pool yet' : `${sidePct}% of the pool`}</span>
      </p>

      <label htmlFor="stake-amount">Stake amount</label>
      <div className="amount-field">
        <input
          id="stake-amount"
          type="number"
          min="0"
          step="0.01"
          max={maxStake}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <span>{currency}</span>
      </div>

      {/* ⚠️ The shortcuts are scaled to what actually moves here. The design's 50/100/500 sat above a
          1.02 USDC market and above the analyst's own 0.01 stakes. */}
      <div className="amount-shortcuts">
        {['0.01', '0.1', '1', maxStake].map((preset) => (
          <button
            key={preset}
            type="button"
            className={amount === preset ? 'active' : undefined}
            onClick={() => setAmount(preset)}
          >
            {preset === maxStake ? `max ${preset}` : preset}
          </button>
        ))}
      </div>

      {/* ⚠️ **WHAT THE TOGGLE BECAME.** Not "attach a report" — the claim already cites one, and
          `stake()` has no parameter that could carry another. */}
      <p className="attached-report">
        <span>{reportTitle}</span>
        <small>
          CLAIM #{claimId} CITES IT · BACKS {side}
        </small>
      </p>
      <a className="text-link" href={`/report/${reportHash}`}>
        Read the report behind this claim <ArrowUpRight size={13} />
      </a>

      {/* ⚠️ The parimutuel rule in words against the real pools, rather than a payout number the
          contract would not pay. */}
      <div className="payout-estimate">
        <span>
          Parimutuel <small>TRUE {poolTrue} · FALSE {poolFalse} {currency}</small>
        </span>
        <strong style={{fontSize: 13, textAlign: 'right', lineHeight: 1.5}}>
          {poolTrue === '0.0' || poolFalse === '0.0'
            ? 'One-sided: if it settles this way every stake is returned to whoever made it'
            : 'A winning stake takes its share of the whole pool'}
        </strong>
      </div>

      {/* ⚠️ **INERT THIS UNIT, AND IT SAYS WHY RATHER THAN LOOKING BROKEN.** Markets 6 and 7 hold
          real money, including 1.00 USDC from a human wallet. A live-looking button on a control
          whose call is not wired is how a data page becomes a transaction incident. */}
      <span className="btn white full inert">
        <Lock size={15} /> {open ? 'Staking not wired yet' : standing}
      </span>
      <p className="balance-line">
        {open
          ? `The side, the claim, the pools and the ${maxStake} ${currency} cap above are read live. The call itself is the next unit.`
          : 'This market is not open for staking.'}
      </p>
      {!valid && open && (
        <p className="validation-message">
          Enter an amount above 0 and no more than the contract&rsquo;s {maxStake} {currency} cap.
        </p>
      )}
    </>
  );
}

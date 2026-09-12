'use client';

// The report document and the gate in front of it. ⚠️ **An AGENT pays. The visitor does not.**
//
// ⚠️ **This component owns both columns** — the paper and the purchase bar — because the bought body
// replaces the locked block *inside* the paper while the control that buys it sits *beside* it.
// Splitting them would mean two components sharing one piece of state.
//
// ── What the button actually does, because the distinction is the product ────────────────────────
//
// It asks the server to run the buyer agent, which pays from **its own** Hedera account. Nobody's
// wallet is connected, no browser signs anything, and the visitor is not charged. Saying otherwise
// on the page would be a lie about where the money came from.
//
// ⚠️ **A human cannot complete an x402 payment in a browser here, and that is a decision rather than
// a gap** (2026-09-08). `@x402/paywall` ships EVM, Solana and Aptos flavours and **no Hedera
// export**, so a browser payment would need a WalletConnect Hedera signer built from scratch — a
// project, not a unit. The requirement asks for "a platform **or** agent" consuming the service; the
// agent is what satisfies it, and this control is how you watch it happen.
//
// ⚠️ **One paid read grants no durable access, and the interface says so.** There is no identity
// system — `payments/auth.ts` is the declared cut point — so the server cannot know this visitor
// bought anything. Refreshing loses the body and buying again pays again.
//
// ⚠️ **The body arrives in this response and is never in the page.** The server component renders a
// preview and nothing else; the markdown exists only in the JSON returned to this fetch, held in
// component state. Nothing is rendered-then-hidden and nothing is inlined into the RSC payload —
// **the blurred rows below are drawn from nothing at all.**

import { useState, type ReactNode } from 'react';
import { Markdown } from '../../markdown.js';
import { Price } from '../../ui/price.js';

interface Bought {
  markdown: string;
  amountHbar: string;
  payer: string;
  payTo: string;
  paymentId: string;
  settledTransaction: string;
  networkFeeHbar: string | null;
  feeBearer: string | null;
}

interface Coverage {
  facts: number; marketsRead: number; corroborated: number;
  completeness: string; checksRun: number; checksAvailable: number;
}

export function BuyAndRead({
  reportHash, priceHbar, directive, analyst, block, observedAt, coverage, children,
}: {
  reportHash: string; priceHbar: string; directive: string; analyst: string;
  block: number | string; observedAt: string; coverage: Coverage; children: ReactNode;
}) {
  const [state, setState] = useState<'idle' | 'buying' | 'done' | 'error'>('idle');
  const [bought, setBought] = useState<Bought | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [stage, setStage] = useState<string>('');

  const buy = async () => {
    setState('buying');
    setMessage(null);
    setStage('asking the gate for a price…');
    try {
      // ⚠️ **ONE buyer path in this project, and this is it.** A second would mean the product and
      // the console could disagree about what a purchase is: different caps, a different record in
      // `purchases`, a different answer to "did it settle". It moved out of `app/api/console/` on
      // 2026-09-11 so that deleting the console cannot take the paywall with it.
      const res = await fetch('/api/buy', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // Its own origin: a page must buy from the deployment serving it, not from a default.
        body: JSON.stringify({ reportHash, site: window.location.origin, confirm: true }),
      });
      const j = await res.json();

      if (j.refused) { setState('error'); setMessage(`The buyer agent refused: ${String(j.refused.message)}`); return; }
      if (j.stop || j.fail || j.error) { setState('error'); setMessage(String(j.stop ?? j.fail ?? j.error)); return; }
      const md = (j.body as { markdown?: string } | undefined)?.markdown;
      if (!md) { setState('error'); setMessage('The payment settled but no report body came back.'); return; }

      const p = j.purchase as Bought;
      const moved = j.moved as { networkFeeHbar?: string; feeBearer?: string } | undefined;
      setBought({
        markdown: md,
        amountHbar: p.amountHbar, payer: p.payer, payTo: p.payTo,
        paymentId: p.paymentId, settledTransaction: p.settledTransaction,
        networkFeeHbar: moved?.networkFeeHbar ?? null,
        feeBearer: moved?.feeBearer ?? null,
      });
      setState('done');
    } catch (error) {
      setState('error');
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const paid = state === 'done' && bought !== null;

  return (
    <div className="report-layout">
      {/* ── The sheet ─────────────────────────────────────────────────────────────────────────── */}
      <article className="report-paper">
        <div className="paper-masthead">
          <span>ALPHA MARKETS</span>
          <span>RESEARCH REPORT</span>
        </div>

        <div className="paper-title">
          <span className="eyebrow">{paid ? 'Full report' : 'Preview'}</span>
          {/* Whole, never bounded — truncating the directive would misstate what the report answers. */}
          <h1>{directive}</h1>
          {/* ⚠️ The real analyst and the real hash. The reference's paper says "PREPARED BY ATLAS
              RESEARCH · DEMO DATA", which is a mockup's byline for invented numbers. */}
          <p className="paper-byline">
            Prepared by {analyst} · block {block} · observed {observedAt}
          </p>
          <p className="paper-byline">{reportHash}</p>
        </div>

        {/* ⚠️ The coverage counts stay on the SERVER and are public — they say how much of the
            picture the report rests on **without giving away a single figure**. */}
        <table className="financial-table">
          <thead><tr><th>What the report rests on</th><th>Count</th></tr></thead>
          <tbody>
            <tr><td>Figures measured</td><td className="mono">{coverage.facts}</td></tr>
            <tr><td>Markets read</td><td className="mono">{coverage.marketsRead}</td></tr>
            <tr><td>Corroborated on-chain</td><td className="mono">{coverage.corroborated}</td></tr>
            <tr><td>Population</td><td className="mono">{coverage.completeness}</td></tr>
            <tr><td>Checks run</td><td className="mono">{coverage.checksRun} of {coverage.checksAvailable}</td></tr>
          </tbody>
        </table>

        {paid ? (
          <div className="memo bought"><Markdown source={bought.markdown} /></div>
        ) : (
          /* ⚠️ **DRAWN FROM NOTHING.** There is no text under these bars — the figures, the market
             table and the assessment were never sent to this page. */
          <div className="locked-preview">
            <span className="locked-stamp">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor"
                   strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
              The figures, the market table and the analyst’s assessment
            </span>
            <div className="locked-rows" aria-hidden="true">
              {Array.from({ length: 9 }, (_, i) => <span key={i} />)}
            </div>
            <p className="position-sub" style={{ color: 'var(--muted-foreground)' }}>
              Not hidden — <strong>not sent</strong>. None of it is in this page.
            </p>
          </div>
        )}

        <div className="paper-footer">
          <span>{analyst}</span>
          <span>{paid ? 'Paid read' : 'Preview — public'}</span>
        </div>
      </article>

      {/* ── The aside ─────────────────────────────────────────────────────────────────────────── */}
      <div className="report-aside">
        <section className="panel purchase-bar">
          {paid ? (
            <>
              <div className="unlocked-bar">
                <strong>Paid.</strong> The buyer agent paid{' '}
                <strong>{bought.amountHbar} HBAR</strong>, settled on Hedera testnet over x402.
              </div>
              <div className="transaction-receipt">
                <div><span>payer</span><span>{bought.payer}</span></div>
                <div><span>payTo</span><span>{bought.payTo}</span></div>
                <div><span>payment id</span><span>{bought.paymentId}</span></div>
                <div><span>settled tx</span><span>{bought.settledTransaction}</span></div>
                {bought.networkFeeHbar && (
                  <div><span>network fee</span><span>{bought.networkFeeHbar} HBAR by {bought.feeBearer}</span></div>
                )}
              </div>
              <p className="settled-links">
                <a href={`https://hashscan.io/testnet/transaction/${bought.settledTransaction}`}
                   target="_blank" rel="noreferrer">View the settlement on HashScan →</a>
              </p>
              {/* ⚠️ Stated plainly. There is no identity system, so this cannot be remembered. */}
              <p className="no-durable">
                ⚠️ <strong>This read is not saved.</strong> There is no sign-in, so nothing here can
                know you bought it — refreshing loses the report, and buying again pays again.
              </p>
            </>
          ) : (
            <>
              <span className="eyebrow">x402 · paid access</span>
              <Price amount={priceHbar} rail="HBAR" size="lg" note="testnet" />
              <p>
                Buys <strong>one read</strong> — the figures, the market table and the analyst’s
                assessment. Settles on Hedera testnet over x402. A read is not a subscription and it
                does not transfer the token.
              </p>

              {/* ⚠️ The honest description of the button, above the button. */}
              <p className="agent-pays">
                <strong>An agent pays, not you.</strong> This asks the server to run our buyer agent,
                which pays from its own Hedera account. No wallet is connected and you are not
                charged. <span className="dim">x402 ships no Hedera paywall for browsers, so a human
                cannot complete one of these payments here — the agent is the buyer this service is
                built for.</span>
              </p>

              <button type="button" className="buy" onClick={() => void buy()} disabled={state === 'buying'}>
                {state === 'buying' ? 'The agent is paying…' : 'Have the agent buy this report'}
              </button>
              {state === 'buying' ? <p className="buy-stage">{stage}</p> : null}
              {state === 'error' && message ? <p className="buy-error">{message}</p> : null}

              <p className="no-durable">
                ⚠️ <strong>One read, not saved.</strong> There is no sign-in, so a purchase cannot be
                remembered — refreshing loses it and buying again pays again.
              </p>
            </>
          )}
        </section>

        {children}
      </div>
    </div>
  );
}

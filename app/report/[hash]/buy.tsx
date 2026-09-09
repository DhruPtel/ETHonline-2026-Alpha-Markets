'use client';

// The buy control on a report page. ⚠️ **An AGENT pays. The visitor does not.**
//
// ── What this button actually does, because the distinction is the product ───────────────────────
//
// It asks the server to run the buyer agent, which pays from **its own** Hedera account. Nobody's
// wallet is connected, no browser signs anything, and the visitor is not charged. Saying otherwise
// on the page would be a lie about where the money came from.
//
// ⚠️ **A human cannot complete an x402 payment in a browser here, and that is a decision rather than
// a gap** (2026-09-08). `@x402/paywall` ships EVM, Solana and Aptos flavours and **no Hedera export**,
// so a browser payment would need a WalletConnect Hedera signer built from scratch — a project, not
// a unit. The requirement asks for "a platform **or** agent" consuming the service; the agent is
// what satisfies it, and this control is how you watch it happen.
//
// ⚠️ **One paid read grants no durable access, and the interface says so rather than implying
// otherwise.** There is no identity system — `payments/auth.ts` is the declared cut point — so the
// server cannot know that this visitor bought anything. Refreshing loses the body and buying again
// pays again. An interface that looked like it remembered and did not would be worse than one that
// admits it.
//
// ⚠️ **The body arrives in this response and is never in the page.** The server component renders a
// preview and nothing else; the markdown exists only in the JSON returned to this fetch, held in
// component state. Nothing is rendered-then-hidden and nothing is inlined into the RSC payload.

import { useState } from 'react';
import { Markdown } from '../../markdown.js';

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

export function BuyAndRead({ reportHash, priceHbar }: { reportHash: string; priceHbar: string }) {
  const [state, setState] = useState<'idle' | 'buying' | 'done' | 'error'>('idle');
  const [bought, setBought] = useState<Bought | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [stage, setStage] = useState<string>('');

  const buy = async () => {
    setState('buying');
    setMessage(null);
    setStage('asking the gate for a price…');
    try {
      // ⚠️ **The console's buyer route, deliberately — there is ONE buyer path in this project.**
      // A second one would mean the product and the console could disagree about what a purchase is:
      // different caps, a different record in `purchases`, a different answer to "did it settle".
      // ⚠️ See logs.md 2026-09-09 — this makes that route load-bearing for the product, so the
      // console's "delete both directories" removal note is no longer accurate for it.
      const res = await fetch('/api/console/buy', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // Its own origin: a page must buy from the deployment serving it, not from a default.
        body: JSON.stringify({ reportHash, site: window.location.origin, confirm: true }),
      });
      const j = await res.json();

      if (j.refused) {
        setState('error');
        setMessage(`The buyer agent refused: ${String(j.refused.message)}`);
        return;
      }
      if (j.stop || j.fail || j.error) {
        setState('error');
        setMessage(String(j.stop ?? j.fail ?? j.error));
        return;
      }
      const md = (j.body as { markdown?: string } | undefined)?.markdown;
      if (!md) {
        setState('error');
        setMessage('The payment settled but no report body came back.');
        return;
      }
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

  if (state === 'done' && bought) {
    return (
      <section>
        <h2>The full report</h2>
        <p className="settled">
          <strong>Paid.</strong> The buyer agent{' '}
          <span className="mono">{bought.payer}</span> paid{' '}
          <strong>{bought.amountHbar} HBAR</strong> to{' '}
          <span className="mono">{bought.payTo}</span>, settled on Hedera testnet over x402.
          {bought.networkFeeHbar ? (
            <> The network fee of {bought.networkFeeHbar} HBAR was covered by the facilitator{' '}
              <span className="mono">{bought.feeBearer}</span>, not by the buyer.</>
          ) : null}
        </p>
        <p className="settled-links">
          <a href={`https://hashscan.io/testnet/transaction/${bought.settledTransaction}`}
             target="_blank" rel="noreferrer">View the settlement on HashScan →</a>
        </p>
        {/* ⚠️ Stated plainly. There is no identity system, so this cannot be remembered. */}
        <p className="no-durable">
          ⚠️ <strong>This read is not saved.</strong> There is no sign-in, so nothing here can know
          you bought it — refreshing loses the report below, and buying again pays again.
          Copy anything you want to keep.
        </p>
        <article className="memo bought">
          <Markdown source={bought.markdown} />
        </article>
      </section>
    );
  }

  return (
    <section>
      <h2>The report is behind a paywall</h2>
      <p>
        <strong>{priceHbar} HBAR</strong> buys <strong>one read</strong> — the figures, the market
        table and the analyst&rsquo;s assessment. Payment settles on Hedera testnet over x402.
        A read is not a subscription, and it does not transfer the token.
      </p>

      {/* ⚠️ The honest description of the button, above the button. */}
      <p className="agent-pays">
        <strong>An agent pays, not you.</strong> This asks the server to run our buyer agent, which
        pays from its own Hedera account. No wallet is connected and you are not charged.{' '}
        <span className="dim">
          x402 has no Hedera paywall for browsers, so a human cannot complete one of these payments
          here — the agent is the buyer this service is built for.
        </span>
      </p>

      <button type="button" className="buy" onClick={() => void buy()} disabled={state === 'buying'}>
        {state === 'buying' ? 'The agent is paying…' : `Have the agent buy this report — ${priceHbar} HBAR`}
      </button>
      {state === 'buying' ? <p className="buy-stage">{stage}</p> : null}
      {state === 'error' && message ? <p className="buy-error">{message}</p> : null}

      <p className="no-durable">
        ⚠️ <strong>One read, not saved.</strong> There is no sign-in, so a purchase cannot be
        remembered — refreshing loses it and buying again pays again.
      </p>
    </section>
  );
}

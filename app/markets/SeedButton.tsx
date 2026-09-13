'use client';

// Open the demo questions. ⚠️ **It spends, so it says what it costs before it is pressed.**
//
// ── ⚠️ NO SECRET, AND THE LIMITS ARE REAL RATHER THAN A PASSWORD ────────────────────────────────
//
// The operator-secret field was cut because a real market page has no lock on it and the demo has to
// look like one. Nothing here brings it back. What bounds this instead:
//
//   · **the cap** — at most `MAX_OPEN_DEMO_MARKETS` demo markets open for staking at once, and
//     every slot clears itself when its market closes a couple of minutes later;
//   · **the cost** — about 0.02 USDC of the analyst's own money per market, ~0.12 at full stretch;
//   · **the plan** — the count and the cost are read from the chain and rendered *before* the
//     button, so a press is never blind.
//
// ⚠️ **ONE MARKET PER PRESS.** It used to open every free slot at once, and the section filled with
// cards nobody was playing — several settled, several waiting, none of them obviously the one to
// start. A backlog reads as clutter rather than as a thing to play. The next question is named on
// the button's own line so a judge knows what they are about to open before they open it.

import {useEffect, useState} from 'react';
import {useRouter} from 'next/navigation.js';
import {demoSeedPlan, seedDemoMarkets, type SeedPlan} from './actions.js';

export function SeedButton() {
  const router = useRouter();
  const [plan, setPlan] = useState<SeedPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [stop, setStop] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => { void demoSeedPlan().then(setPlan).catch(() => setPlan(null)); }, []);

  async function run(): Promise<void> {
    setBusy(true); setStop(null);
    try {
      const r = await seedDemoMarkets();
      if (!r.ok) { setStop(r.why); return; }
      setDone(r.note);
      router.refresh();
    } catch (e) {
      setStop((e as Error).message);
    } finally { setBusy(false); }
  }

  if (done) {
    return <p className="market-statline" style={{display: 'block', lineHeight: 1.6}}>{done} Pick one below.</p>;
  }

  return (
    <p className="market-statline" style={{display: 'block', lineHeight: 1.6}}>
      <button
        className="btn white"
        type="button"
        disabled={busy || plan === null || plan.free === 0}
        onClick={() => void run()}
      >
        {busy
          ? 'Opening…'
          : plan === null
            ? 'Checking…'
            : plan.free === 0
              ? `${plan.open} already open`
              : 'Start a demo market'}
      </button>
      {plan && (
        <span className="holdings-sub" style={{marginLeft: 10}}>
          {plan.free === 0
            ? `That is the cap of ${plan.cap}.${plan.nextFrees ? ` The next frees at ${plan.nextFrees} UTC.` : ''} Play one of them.`
            : `${plan.nextLabel ? `Next: ${plan.nextLabel} · ` : ''}about ${plan.costUsdc} USDC · ${plan.open} of ${plan.cap} open`}
        </span>
      )}
      {stop && <span className="holdings-sub" style={{display: 'block', marginTop: 8}}>⚠️ {stop}</span>}
    </p>
  );
}

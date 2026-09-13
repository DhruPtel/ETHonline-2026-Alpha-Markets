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
// ⚠️ **It tops up rather than replacing.** An open market cannot be cancelled — `voidMarket` is
// permissionless only after `resolveDeadline`, and a judge who staked is entitled to settlement — so
// a button calling itself "replace" would either strand those stakes or quietly lie. It fills the
// free slots and says how many that was.

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
              : `Open ${plan.free} demo market${plan.free === 1 ? '' : 's'}`}
      </button>
      {plan && (
        <span className="holdings-sub" style={{marginLeft: 10}}>
          {plan.free === 0
            ? `That is the cap of ${plan.cap}.${plan.nextFrees ? ` The next frees at ${plan.nextFrees} UTC.` : ''} Play one of them.`
            : `Costs the analyst about ${plan.costUsdc} USDC · ${plan.open} of ${plan.cap} open now · they close one at a time`}
        </span>
      )}
      {stop && <span className="holdings-sub" style={{display: 'block', marginTop: 8}}>⚠️ {stop}</span>}
    </p>
  );
}

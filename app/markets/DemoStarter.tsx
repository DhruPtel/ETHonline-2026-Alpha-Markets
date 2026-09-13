'use client';

// Pick a question. ⚠️ **Pressing Start spends the analyst's USDC**, which is why there is a field.
//
// ── ⚠️ WHY A MARKET IS CREATED PER RUN RATHER THAN SIX SITTING READY ────────────────────────────
//
// A demo market is stakeable only while `block.timestamp < closeTime`, and `createMarket` requires
// `closeTime < observationEnd`. **A pool created an hour ago has a closeTime an hour ago and cannot
// be staked on at all** — pre-creating six would mean six dead markets by the time anyone arrived,
// and refreshing them every few minutes is impossible on a cron that fires once a day. So creation
// is on demand and the ~30 seconds Circle takes to land it is shown rather than hidden.
//
// ── ⚠️ THE SEVENTH RUN, AND IT IS NOT THE RULE PEOPLE EXPECT ────────────────────────────────────
//
// The six presets are **questions, not markets.** `AlreadyCommitted` is one claim per author per
// *market*, so picking a question a second time creates a **new** market with a later `closeTime`
// that the same wallet may commit to. That is not a loophole and is not a way around the contract's
// rule — the rule holds exactly as written; a judge is staking a new market, not restaking an old one.
//
// ⚠️ **What actually stops this looping is the cap and the gas, not a message.** Three demo markets
// may be open for staking at once, and each one costs the analyst a real `createMarket` plus a real
// `commitPrediction`. The refusal a judge hits names the cap and says when the next slot frees.

import {useState} from 'react';
import {useRouter} from 'next/navigation.js';
import {startDemoMarket} from './actions.js';
import {MAX_OPEN_DEMO_MARKETS, PRESETS} from './demo.js';
import {ArrowRight} from '../components/Icons.js';

const grouped = (dec: string) => Number(dec).toLocaleString('en-US');

const LABEL: Record<string, string> = {
  totalDepositBalanceUSD: 'total deposits',
  totalBorrowBalanceUSD: 'total borrows',
  dailyDepositUSD: 'daily deposits',
  dailyBorrowUSD: 'daily borrows',
};

export function DemoStarter({openCount}: {openCount: number}) {
  const router = useRouter();
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [stop, setStop] = useState<string | null>(null);

  async function start(id: string): Promise<void> {
    setStop(null); setBusy(id);
    try {
      const r = await startDemoMarket(id, secret);
      if (!r.ok) { setStop(r.why); return; }
      router.push(`/markets/${r.chainMarketId}`);
    } catch (e) {
      setStop((e as Error).message);
    } finally { setBusy(null); }
  }

  return (
    <div className="holdings-panel panel">
      <div className="section-title">
        <div>
          <span className="eyebrow">RUN THE WHOLE LOOP IN ABOUT THREE MINUTES</span>
          <h2>Pick a question</h2>
        </div>
        <span className="badge">{openCount}/{MAX_OPEN_DEMO_MARKETS} open</span>
      </div>

      <p className="market-statline" style={{display: 'block', lineHeight: 1.6, paddingTop: 0}}>
        Each question asks about a day that has <strong>already happened</strong>, so settlement can
        read the real snapshot the moment staking closes. ⚠️ <strong>We chose these thresholds around
        figures we had already read</strong>, so that some resolve each way — what you do not know is
        which, and that is the only thing this demo ever claimed. Starting one creates a real market
        on Arc and costs the analyst about 0.02 USDC, so the button is behind the operator secret.
      </p>

      <input
        type="password" value={secret} onChange={(e) => setSecret(e.target.value)}
        placeholder="Operator secret" aria-label="Operator secret"
        style={{marginBottom: 14, maxWidth: 320}}
      />

      <div className="table-scroll">
        <table className="financial-table">
          <thead>
            <tr><th>Question</th><th>Day</th><th>How close</th><th /></tr>
          </thead>
          <tbody>
            {PRESETS.map((p) => (
              <tr key={p.id}>
                <td>
                  Is aave-v3-ethereum&rsquo;s {LABEL[p.metric] ?? p.metric} above{' '}
                  <strong>${grouped(p.threshold)}</strong>?
                </td>
                <td><code>{p.observedDay}</code></td>
                <td><span className="holdings-sub">{p.distance}</span></td>
                <td>
                  <button className="btn white" disabled={busy !== null} onClick={() => void start(p.id)}>
                    {busy === p.id ? 'Creating…' : 'Start'} <ArrowRight size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {busy && (
        <p className="market-statline" style={{display: 'block', lineHeight: 1.6}}>
          Creating the market through Circle — this takes about 30 seconds, because Circle returns
          when the transaction is <em>sent</em> and we wait for the receipt before calling it landed.
        </p>
      )}
      {stop && <p className="market-statline" style={{display: 'block', lineHeight: 1.6}}>⚠️ {stop}</p>}
    </div>
  );
}

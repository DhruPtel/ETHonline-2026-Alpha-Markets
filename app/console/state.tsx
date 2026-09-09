'use client';

// What already exists: reports and their tokens, quotes, purchases, and whether the payment path is
// wired. Read-only — every control that changes something lives in the other two files.
//
// ⚠️ **THROWAWAY. Delete `app/console/` and `app/api/console/` before submission.**
//
// ⚠️ **Clicking a report sets the target for all three spending controls.** One target, chosen once,
// instead of the same 64-character hash pasted into three separate fields — which is how the wrong
// report gets tokenized.

import { useCallback, useEffect, useState } from 'react';
import type { Log } from './terminal.js';

interface Token {
  isin: string; proxyAddress: string; deployTx: string; issueTx: string;
  transferTx: string | null; issuedAt: string;
}
interface Report {
  hash: string; directive: string; analyst: string; block: number; createdAt: string; token: Token | null;
}
interface Quote { id: string; report_hash: string; price_tinybars: string; state: string; expires_at: string }
interface Purchase {
  payment_id: string; report_hash: string; payer: string;
  settled_at: string | null; delivered_at: string | null; created_at: string;
}
interface State { reports: Report[]; quotes: Quote[]; purchases: Purchase[]; price: { hbar: string } }

const short = (h: string) => `${h.slice(0, 10)}…${h.slice(-6)}`;
const when = (iso: string | null) => (iso ? `${iso.slice(0, 16).replace('T', ' ')}Z` : '—');

export function StateTables({ target, setTarget, log, refreshToken }: {
  target: string; setTarget: (h: string) => void; log: Log; refreshToken: number;
}) {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/console/state', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setState(json as State);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh, refreshToken]);

  const health = async () => {
    log.begin('health', 'GET /api/health');
    try {
      const res = await fetch('/api/health', { cache: 'no-store' });
      const j = await res.json();
      log.write('health', `HTTP ${res.status} · ok ${String(j.ok)} · network ${String(j.network)}`, j.ok ? 'good' : 'bad');
      if (j.facilitator) {
        log.write('health', `facilitator ${String(j.facilitator.host)}`, 'plain');
        log.write('health', `advertisesNetwork ${String(j.facilitator.advertisesNetwork)} · feePayerMatches ${String(j.facilitator.feePayerMatches)} (${String(j.facilitator.feePayerAdvertised)})`,
          j.facilitator.advertisesNetwork && j.facilitator.feePayerMatches ? 'good' : 'bad');
      }
      if (j.atsResolver) {
        log.write('health', `ATS resolver ${String(j.atsResolver.id)} · deleted ${String(j.atsResolver.deleted)} · expires ${String(j.atsResolver.expiresAtIso)} (${String(j.atsResolver.daysRemaining)} days)`, 'note');
      }
      for (const [k, v] of Object.entries((j.config?.env ?? {}) as Record<string, string>)) {
        log.write('health', `${k.padEnd(20)} ${v}`, v.startsWith('EMPTY') ? 'bad' : 'note');
      }
      if (j.detail) log.write('health', String(j.detail), 'bad');
    } catch (e) {
      log.write('health', e instanceof Error ? e.message : String(e), 'bad');
    } finally { log.end(); }
  };

  return (
    <section className="state">
      <header className="state-head">
        <h2>State</h2>
        <div>
          <button type="button" className="quiet" onClick={() => void refresh()}>Refresh</button>
          <button type="button" className="quiet" onClick={() => void health()}>Check health</button>
        </div>
      </header>

      {error ? <p className="bad-line mono">{error}</p> : null}
      {!state ? <p className="op-note">Loading…</p> : (
        <>
          <h3>Reports <span className="count">{state.reports.length}</span> <span className="op-note">· {state.price.hbar} HBAR each · click one to target it</span></h3>
          <div className="table-scroll">
            <table className="grid pick">
              <thead><tr><th>Directive</th><th>Hash</th><th>Block</th><th>Token</th><th>Moved</th><th>Created</th></tr></thead>
              <tbody>
                {state.reports.map((r) => (
                  <tr key={r.hash} onClick={() => setTarget(r.hash)}
                      className={r.hash === target ? 'picked' : undefined}>
                    <td className="directive">{r.directive}</td>
                    <td className="mono">{short(r.hash)}</td>
                    <td className="mono num">{r.block}</td>
                    <td className="mono">
                      {r.token ? (
                        <a href={`https://hashscan.io/testnet/contract/${r.token.proxyAddress}`}
                           target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{r.token.isin}</a>
                      ) : '—'}
                    </td>
                    <td className="mono">{r.token ? (r.token.transferTx ? 'yes' : 'no') : '—'}</td>
                    <td className="mono">{when(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3>Quotes <span className="count">{state.quotes.length}</span></h3>
          <div className="table-scroll">
            <table className="grid">
              <thead><tr><th>Id</th><th>Report</th><th>Tinybars</th><th>State</th><th>Expires</th></tr></thead>
              <tbody>
                {state.quotes.map((q) => (
                  <tr key={q.id}>
                    <td className="mono">{short(q.id)}</td><td className="mono">{short(q.report_hash)}</td>
                    <td className="mono num">{q.price_tinybars}</td><td className="mono">{q.state}</td>
                    <td className="mono">{when(q.expires_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3>Purchases <span className="count">{state.purchases.length}</span></h3>
          <div className="table-scroll">
            <table className="grid">
              <thead><tr><th>Payment</th><th>Report</th><th>Payer</th><th>Settled</th><th>Delivered</th></tr></thead>
              <tbody>
                {state.purchases.map((p) => (
                  <tr key={p.payment_id}>
                    <td className="mono">{short(p.payment_id)}</td><td className="mono">{short(p.report_hash)}</td>
                    <td className="mono">{p.payer}</td>
                    <td className="mono">{when(p.settled_at)}</td>
                    {/* null delivered_at on a settled row is the §5.9 retry case, not a failure. */}
                    <td className="mono">{when(p.delivered_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

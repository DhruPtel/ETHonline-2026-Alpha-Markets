'use client';

// Who the console is signing as, and what each account actually holds.
//
// ⚠️ **THROWAWAY. Delete `app/console/` and `app/api/console/` before submission.**
//
// ⚠️ **There is no wallet connection.** Every button on this page signs server-side from a key in
// `.env`. That is easy to miss on a page full of spend controls, and missing it makes the whole
// surface misleading — so the two accounts are named at the top, with both address forms, before any
// operation is offered. Clicking an EVM address fills the transfer recipient, which is the other
// half of the point: a recipient should be picked, not typed from memory.
//
// ⚠️ **Holdings come from the chain, and the database's opinion is shown beside them.** `transfer_tx`
// records what we last sent; `balanceOf` records what is true. A row where those disagree is the
// most interesting thing this panel can show, so it is called out rather than reconciled away.

import { useCallback, useEffect, useState } from 'react';

interface Account {
  role: 'analyst' | 'buyer';
  label: string;
  accountId: string | null;
  evmAddress: string | null;
  hbar: string | null;
  keyEnv: string;
  keySet: boolean;
  note: string | null;
}

interface Holding {
  reportHash: string; isin: string; proxyAddress: string;
  analystBalance: string | null; buyerBalance: string | null;
  chainHolder: string; dbImplies: string; agrees: boolean; transferTx: string | null;
}

interface Payload {
  accounts: Account[]; holdings: Holding[]; holdingsError: string | null; tokenCount: number;
}

export function Accounts({ onPickRecipient, refreshToken }: {
  onPickRecipient: (evm: string) => void; refreshToken: number;
}) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/console/accounts', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setData(json as Payload);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh, refreshToken]);

  return (
    <section className="accounts">
      <header className="state-head">
        <h2>Signing as</h2>
        <button type="button" className="quiet" onClick={() => void refresh()} disabled={loading}>
          {loading ? 'Reading…' : 'Refresh'}
        </button>
      </header>
      <p className="op-note">
        ⚠️ <strong>No wallet is connected.</strong> Every operation on this page is signed on the
        server from a key in <span className="mono">.env</span>. Click an EVM address to use it as
        the transfer recipient.
      </p>

      {error ? <p className="bad-line mono">{error}</p> : null}

      <div className="acct-grid">
        {(data?.accounts ?? []).map((a) => (
          <div key={a.role} className={`acct acct-${a.role}`}>
            <div className="acct-role">{a.role}</div>
            <div className="acct-label">{a.label}</div>
            <dl className="acct-facts">
              <div>
                <dt>account</dt>
                <dd className="mono">{a.accountId ?? <span className="dim">not set</span>}</dd>
              </div>
              <div>
                <dt>evm</dt>
                <dd>
                  {a.evmAddress ? (
                    <button type="button" className="addr" title="Use as transfer recipient"
                      onClick={() => onPickRecipient(a.evmAddress!)}>{a.evmAddress}</button>
                  ) : <span className="dim mono">unknown</span>}
                </dd>
              </div>
              <div>
                <dt>hbar</dt>
                <dd className="mono">{a.hbar ?? <span className="dim">—</span>}</dd>
              </div>
              <div>
                <dt>key</dt>
                <dd className="mono">
                  {a.keyEnv} {a.keySet
                    ? <span className="ok">set</span>
                    : <span className="miss">MISSING</span>}
                </dd>
              </div>
            </dl>
            {a.note ? <p className="acct-note">{a.note}</p> : null}
          </div>
        ))}
      </div>

      <h3>Holdings <span className="count">{data?.tokenCount ?? 0} token(s)</span>{' '}
        <span className="op-note">· balanceOf read from chain, not from transfer_tx</span></h3>

      {data?.holdingsError ? <p className="bad-line">{data.holdingsError}</p> : null}

      <div className="table-scroll">
        <table className="grid">
          <thead>
            <tr>
              <th>ISIN</th><th>Proxy</th><th>Analyst</th><th>Buyer</th>
              <th>Chain says</th><th>Row implies</th>
            </tr>
          </thead>
          <tbody>
            {(data?.holdings ?? []).map((h) => (
              <tr key={h.proxyAddress} className={h.agrees ? undefined : 'disagree'}>
                <td className="mono">{h.isin}</td>
                <td className="mono">
                  <a href={`https://hashscan.io/testnet/contract/${h.proxyAddress}`}
                     target="_blank" rel="noreferrer">{h.proxyAddress.slice(0, 12)}…</a>
                </td>
                <td className="mono num">{h.analystBalance ?? '?'}</td>
                <td className="mono num">{h.buyerBalance ?? '?'}</td>
                <td className="mono">{h.chainHolder}</td>
                <td className="mono">
                  {h.dbImplies}
                  {h.agrees ? null : <strong className="miss"> ≠</strong>}
                </td>
              </tr>
            ))}
            {(data?.holdings ?? []).length === 0 && !data?.holdingsError ? (
              <tr><td colSpan={6} className="dim">No tokens yet.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

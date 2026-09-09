'use client';

// The inventory, fetched at runtime.
//
// ⚠️ **A client component so the page stays light.** Reading `balanceOf` means `ethers` and an RPC
// provider; putting that in a server component would trace a chain client onto a page that renders a
// list of links. `/api/holdings` carries the weight and this fetches it.
//
// ⚠️ **The chain is the authority.** Every row here came from a `balanceOf` call, not from
// `report_tokens.transfer_tx`. The column records what we last sent; the chain records what is.

import { useEffect, useState } from 'react';

interface Held {
  reportHash: string; directive: string; isin: string; proxyAddress: string;
}
interface Account {
  role: string; label: string; accountId: string | null; evmAddress: string | null;
  note: string; holds: Held[];
}
interface Payload {
  readAt: string; accounts: Account[]; elsewhere: Held[]; tokenCount: number;
}

const bound = (s: string) => (s.length > 96 ? `${s.slice(0, 96)}…` : s);

function Holdings({ rows }: { rows: Held[] }) {
  if (rows.length === 0) return <p className="empty">Holds none.</p>;
  return (
    <ol className="reports">
      {rows.map((h) => (
        <li key={h.proxyAddress}>
          <a href={`/report/${h.reportHash}`}>{bound(h.directive)}</a>
          <div className="meta">
            <strong>{h.isin}</strong>
            <a href={`https://hashscan.io/testnet/contract/${h.proxyAddress}`}
               target="_blank" rel="noreferrer">HashScan ↗</a>
          </div>
          <div className="mono hash">{h.reportHash}</div>
        </li>
      ))}
    </ol>
  );
}

export function Inventory() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const res = await fetch('/api/holdings', { cache: 'no-store' });
        const json = await res.json();
        if (!live) return;
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        setData(json as Payload);
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { live = false; };
  }, []);

  if (error) return <p className="empty">Could not read holdings: {error}</p>;
  if (!data) return <p className="empty">Reading balances from Hedera…</p>;

  return (
    <>
      {data.accounts.map((a) => (
        <section key={a.role}>
          <h2>{a.label}</h2>
          <dl className="identity">
            <div><dt>Hedera account</dt><dd className="mono">{a.accountId ?? '—'}</dd></div>
            <div><dt>EVM address</dt><dd className="mono break">{a.evmAddress ?? '—'}</dd></div>
            <div><dt>Holds</dt><dd>{a.holds.length} of {data.tokenCount} report tokens</dd></div>
          </dl>
          <p className="lede">{a.note}</p>
          <Holdings rows={a.holds} />
        </section>
      ))}

      {/* ⚠️ Shown rather than omitted. A token neither account holds is a real state — it was sent
          somewhere else — and leaving it out would make the inventory quietly incomplete. */}
      {data.elsewhere.length > 0 ? (
        <section>
          <h2>Held elsewhere</h2>
          <p className="lede">
            These tokens exist and are held by an address that is neither of the accounts above.
          </p>
          <Holdings rows={data.elsewhere} />
        </section>
      ) : null}

      <p className="lede read-at">
        Balances read from Hedera testnet at {data.readAt.slice(0, 19).replace('T', ' ')} UTC, by
        calling <span className="mono">balanceOf</span> on each token — not from our own record of
        where we last sent one.
      </p>
    </>
  );
}

'use client';

// The console root: owns the transcript, the target report, and the one-at-a-time lock.
//
// ⚠️ **THROWAWAY. Delete `app/console/` and `app/api/console/` before submission.**
//
// ⚠️ **One operation at a time.** `busy` disables every control while any of them is running. Two
// concurrent spends against the same report would both pass their preflight and one would lose after
// the gas was spent — the exact race `003_report_tokens_isin_unique.sql` exists as a backstop for.

import { useState } from 'react';
import { Terminal, useLog } from './terminal.js';
import { Generate } from './generate.js';
import { Spend, buyExtra } from './spend.js';
import { StateTables } from './state.js';

export function Panel() {
  const log = useLog();
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState('');
  const [recipient, setRecipient] = useState('');
  const [site, setSite] = useState('');
  const [refreshToken, setRefreshToken] = useState(0);

  const refresh = () => setRefreshToken((n) => n + 1);
  const hash = target.trim();
  const targeted = /^[0-9a-f]{64}$/.test(hash);

  return (
    <>
      <div className="console-grid">
        <div className="ops">
          <Generate log={log} busy={busy} setBusy={setBusy}
            onSaved={(h) => { setTarget(h); refresh(); }} />

          <section className="op op-target">
            <h2>Target report</h2>
            <p className="op-note">
              The report the three operations below act on. Pick one from the table, or paste a hash.
            </p>
            <label className="field">
              <span>Report hash</span>
              <input className="mono" value={target} spellCheck={false}
                placeholder="64 hex characters"
                onChange={(e) => setTarget(e.target.value)} disabled={busy} />
            </label>
            {hash && !targeted ? <p className="bad-line">Not a 64-character hex hash.</p> : null}
          </section>

          <h2 className="band">Operations that spend</h2>

          <Spend id="tokenize" title="Tokenize" cost="7.71 HBAR" path="/api/console/tokenize"
            note={<>Deploys an ATS ResolverProxy, grants ISSUER, issues 1. <strong>Mints a permanent
              asset</strong> whose creation event commits this report&rsquo;s hash.</>}
            armKey={hash} body={() => (targeted ? { reportHash: hash } : null)}
            log={log} busy={busy} setBusy={setBusy} onDone={refresh} />

          <Spend id="transfer" title="Transfer" cost="0.43 HBAR" path="/api/console/transfer"
            note={<>Moves the token to another address. The recipient is <strong>never defaulted</strong> —
              picking one would move a real asset to an address nobody chose.</>}
            armKey={`${hash}|${recipient.trim()}`}
            body={() => (targeted && /^0x[0-9a-fA-F]{40}$/.test(recipient.trim())
              ? { reportHash: hash, to: recipient.trim() } : null)}
            fields={
              <label className="field">
                <span>Recipient (EVM address)</span>
                <input className="mono" value={recipient} spellCheck={false} placeholder="0x…40 hex characters"
                  onChange={(e) => setRecipient(e.target.value)} disabled={busy} />
              </label>
            }
            log={log} busy={busy} setBusy={setBusy} onDone={refresh} />

          <Spend id="buy" title="Buy" cost="0.001 HBAR + fee" path="/api/console/buy"
            note={<>Runs the server-side buyer agent against a gate: 402 → sign → pay → receive the
              body the preview withholds. <strong>Not a browser payment</strong> — x402 ships no Hedera
              paywall, and the product&rsquo;s buyer is an agent.</>}
            armKey={`${hash}|${site.trim()}`}
            body={() => (targeted ? { reportHash: hash, ...(site.trim() ? { site: site.trim() } : {}) } : null)}
            fields={
              <label className="field">
                <span>Gate (blank = the deployed alias)</span>
                <input className="mono" value={site} spellCheck={false}
                  placeholder="https://et-honline-2026-alpha-markets.vercel.app"
                  onChange={(e) => setSite(e.target.value)} disabled={busy} />
              </label>
            }
            extra={buyExtra} log={log} busy={busy} setBusy={setBusy} onDone={refresh} />
        </div>

        <Terminal lines={log.lines} onClear={log.clear} />
      </div>

      <StateTables target={hash} setTarget={setTarget} log={log} refreshToken={refreshToken} />
    </>
  );
}

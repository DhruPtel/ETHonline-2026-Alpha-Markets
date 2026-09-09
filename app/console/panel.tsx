'use client';

// The console root: owns the transcript, the target report, the document pane, and the
// one-at-a-time lock.
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
import { Accounts } from './accounts.js';
import { DocumentPane, type ConsoleDoc } from './document.js';

export function Panel() {
  const log = useLog();
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState('');
  const [recipient, setRecipient] = useState('');
  const [site, setSite] = useState('');
  const [refreshToken, setRefreshToken] = useState(0);
  const [doc, setDoc] = useState<ConsoleDoc | null>(null);

  const refresh = () => setRefreshToken((n) => n + 1);
  const hash = target.trim();
  const targeted = /^[0-9a-f]{64}$/.test(hash);

  /** The console door. Reads the store directly — no payment, no gate. See its route's header. */
  const viewUnpaid = async (h: string) => {
    if (busy) return;
    setBusy(true);
    log.begin('view', `read ${h.slice(0, 12)}… from the store, unpaid`);
    try {
      const res = await fetch('/api/console/report', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reportHash: h }),
      });
      const j = await res.json();
      if (j.stop) { log.write('view', `STOP  ${String(j.stop)}`, 'warn'); return; }
      if (j.fail || j.error) { log.write('view', String(j.fail ?? j.error), 'bad'); return; }
      log.write('view', `${String(j.markdownChars)} chars · ${String(j.factCount)} facts · block ${String(j.block)}`, 'good');
      log.write('view', '⚠️ read WITHOUT paying — this door is console-only and not in the product', 'warn');
      setDoc({
        source: 'door',
        reportHash: String(j.reportHash),
        markdown: String(j.markdown),
        figure: (j.figure as string | null) ?? null,
        facts: [
          ['directive', String(j.directive)],
          ['block', String(j.block)],
          ['facts', String(j.factCount)],
          ['token', j.token ? `${String((j.token as { isin: string }).isin)}` : 'not tokenized'],
        ],
      });
    } catch (e) {
      log.write('view', e instanceof Error ? e.message : String(e), 'bad');
    } finally {
      log.end();
      setBusy(false);
    }
  };

  return (
    <>
      <Accounts onPickRecipient={setRecipient} refreshToken={refreshToken} />

      <div className="console-grid">
        <div className="ops">
          <Generate log={log} busy={busy} setBusy={setBusy}
            onSaved={(h) => { setTarget(h); refresh(); }} />

          <section className="op op-target">
            <h2>Target report</h2>
            <p className="op-note">
              The report the operations below act on. Pick one from the table, or paste a hash.
            </p>
            <label className="field">
              <span>Report hash</span>
              <input className="mono" value={target} spellCheck={false}
                placeholder="64 hex characters"
                onChange={(e) => setTarget(e.target.value)} disabled={busy} />
            </label>
            {hash && !targeted ? <p className="bad-line">Not a 64-character hex hash.</p> : null}
            <div className="two-step">
              <button type="button" className="plan" disabled={busy || !targeted}
                onClick={() => void viewUnpaid(hash)}>
                View body (unpaid)
              </button>
              <a className="quiet-link" href={targeted ? `/report/${hash}` : '#'}
                 target="_blank" rel="noreferrer">Public preview ↗</a>
            </div>
            <p className="op-note dim">
              ⚠️ The unpaid read is a <strong>console-only door</strong> around the paywall. It exists
              because there is no identity system, so a purchase cannot be re-read. It is not in{' '}
              <span className="mono">app/report/</span> and the gate is unchanged.
            </p>
          </section>

          <h2 className="band">Operations that spend</h2>

          <Spend id="tokenize" title="Tokenize" cost="7.71 HBAR" path="/api/console/tokenize"
            note={<>Deploys an ATS ResolverProxy, grants ISSUER, issues 1. <strong>Mints a permanent
              asset</strong> whose creation event commits this report&rsquo;s hash.</>}
            armKey={hash} body={() => (targeted ? { reportHash: hash } : null)}
            log={log} busy={busy} setBusy={setBusy} onDone={refresh} />

          <Spend id="transfer" title="Transfer" cost="0.43 HBAR" path="/api/console/transfer"
            note={<>Moves the token to another address. The recipient is <strong>never defaulted</strong> —
              picking one would move a real asset to an address nobody chose. Click an EVM address in{' '}
              <strong>Signing as</strong> to fill it.</>}
            armKey={`${hash}|${recipient.trim()}`}
            body={() => (targeted && /^0x[0-9a-fA-F]{40}$/.test(recipient.trim())
              ? { reportHash: hash, to: recipient.trim() } : null)}
            fields={
              <>
                <label className="field">
                  <span>Recipient — EVM address (0x…, 40 hex)</span>
                  <input className="mono" value={recipient} spellCheck={false}
                    placeholder="0x683ee842…"
                    onChange={(e) => setRecipient(e.target.value)} disabled={busy} />
                </label>
                {/* ⚠️ Stated rather than hidden — see logs.md, 2026-09-09. */}
                <p className="op-note dim">
                  ⚠️ <strong>The analyst always signs.</strong>{' '}
                  <span className="mono">src/tokenize/transfer.ts</span> reads{' '}
                  <span className="mono">HEDERA_SELLER_KEY</span> itself and refuses any other signer,
                  so a token cannot be sent back from the buyer through this control.
                </p>
              </>
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
                {/* ⚠️ It wants an ORIGIN. The old label read like it wanted a report URL. */}
                <span>Gate origin — scheme and host only, no path</span>
                <input className="mono" value={site} spellCheck={false}
                  placeholder="https://et-honline-2026-alpha-markets.vercel.app"
                  onChange={(e) => setSite(e.target.value)} disabled={busy} />
                <small className="hint">
                  Blank uses the deployed alias. The route appends{' '}
                  <span className="mono">/api/reports/&lt;hash&gt;</span> itself — e.g.{' '}
                  <span className="mono">http://localhost:3000</span>. Plan probes it and fails here
                  if it does not answer 402.
                </small>
              </label>
            }
            extra={buyExtra(setDoc)} log={log} busy={busy} setBusy={setBusy} onDone={refresh} />
        </div>

        <Terminal lines={log.lines} onClear={log.clear} />
      </div>

      <DocumentPane doc={doc} onClose={() => setDoc(null)} />

      <StateTables target={hash} setTarget={setTarget} log={log} refreshToken={refreshToken}
        onView={(h) => void viewUnpaid(h)} busy={busy} />
    </>
  );
}

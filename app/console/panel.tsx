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
  /**
   * ⚠️ **The console secret, typed by the operator — never built in, never persisted.** Component
   * state only: it dies on reload and is retyped, which is the cost of not putting it in
   * `sessionStorage` where any script on the page could read it. A `NEXT_PUBLIC_` value would have
   * been inlined into the bundle and served to every visitor, which is not a secret at all.
   * See `app/api/console/lock.ts`.
   */
  const [secret, setSecret] = useState('');
  /** Which configured account signs a transfer. ⚠️ A ROLE — the browser never sees a key. */
  const [signer, setSigner] = useState<'analyst' | 'buyer'>('analyst');
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
      // ⚠️ **Locked since 2026-09-11 — this returns the same bytes the x402 gate sells.** Without
      // the secret it is a 401; the route's header says why it is locked rather than deleted.
      const res = await fetch('/api/console/report', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-console-secret': secret },
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
      {/* ⚠️ **The secret comes FIRST, above everything.** Five of the six console routes are now
          locked — the three that spend, the accounts panel, and the report door — so a console
          opened without it would show a wall of 401s and read as a broken deployment. */}
      <section className="op op-secret">
        <h2>Console secret</h2>
        <p className="op-note">
          Paste the value of <span className="mono">CONSOLE_SECRET</span> to use this console.
          Generate, Tokenize and Transfer spend real funds; Accounts reads our key state; and
          &ldquo;View body&rdquo; returns the same bytes the paywall sells. All five are locked.
        </p>
        <label className="field">
          <span>CONSOLE_SECRET</span>
          <input className="mono" type="password" value={secret} spellCheck={false}
            placeholder="the value set in the environment"
            autoComplete="off" onChange={(e) => setSecret(e.target.value)} disabled={busy} />
        </label>
        {/* ⚠️ Says what it is, so nobody mistakes it for a sign-in. */}
        <p className="op-note dim">
          A shared doorlock, not a sign-in — it identifies nobody and grants nothing beyond this
          console. It is held for this tab only: reloading loses it. ⚠️ The x402 paywall on{' '}
          <span className="mono">/api/reports/[hash]</span> is a separate mechanism, it is not
          affected by anything here, and nothing on this page can bypass it for a stranger.
        </p>
      </section>

      <Accounts onPickRecipient={setRecipient} onPickSigner={setSigner} signer={signer}
        refreshToken={refreshToken} secret={secret} />

      <div className="console-grid">
        <div className="ops">
          <Generate log={log} busy={busy} setBusy={setBusy} secret={secret}
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

          <Spend id="tokenize" title="Tokenize" cost="7.71 HBAR" path="/api/console/tokenize" secret={secret}
            note={<>Deploys an ATS ResolverProxy, grants ISSUER, issues 1. <strong>Mints a permanent
              asset</strong> whose creation event commits this report&rsquo;s hash.</>}
            armKey={hash} body={() => (targeted ? { reportHash: hash } : null)}
            log={log} busy={busy} setBusy={setBusy} onDone={refresh} />

          <Spend id="transfer" title="Transfer" cost="0.43 HBAR" path="/api/console/transfer" secret={secret}
            note={<>Moves the token between the two accounts, <strong>in either direction</strong>.
              The recipient is <strong>never defaulted</strong> — picking one would move a real asset
              to an address nobody chose. Use <em>send from</em> and <em>send to</em> above.</>}
            armKey={`${hash}|${recipient.trim()}|${signer}`}
            body={() => (targeted && /^0x[0-9a-fA-F]{40}$/.test(recipient.trim())
              ? { reportHash: hash, to: recipient.trim(), signer } : null)}
            fields={
              <>
                <div className="field">
                  <span>Signs the transfer</span>
                  {/* ⚠️ A role, not a key. `src/tokenize/transfer.ts` resolves it and refuses a key
                      that does not derive the account it claims to be. */}
                  <div className="seg">
                    {(['analyst', 'buyer'] as const).map((r) => (
                      <button key={r} type="button" disabled={busy}
                        className={`seg-opt${signer === r ? ' on' : ''}`}
                        onClick={() => setSigner(r)}>{r}</button>
                    ))}
                  </div>
                  <small className="hint">
                    The signer must hold the token — <strong>Holdings</strong> above says which
                    account does. Whoever signs pays the gas.
                  </small>
                </div>
                <label className="field">
                  <span>Recipient — EVM address (0x…, 40 hex)</span>
                  <input className="mono" value={recipient} spellCheck={false}
                    placeholder="0x683ee842…"
                    onChange={(e) => setRecipient(e.target.value)} disabled={busy} />
                </label>
              </>
            }
            log={log} busy={busy} setBusy={setBusy} onDone={refresh} />

          {/* ⚠️ `/api/buy`, not `/api/console/buy` — the route moved out of this directory on
              2026-09-11 because the product's paywall button calls it too, and one buyer path is
              the point. The console keeps calling it; it just is not the console's any more. */}
          <Spend id="buy" title="Buy" cost="0.001 HBAR + fee" path="/api/buy" secret={secret}
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

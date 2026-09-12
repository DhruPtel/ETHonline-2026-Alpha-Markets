'use client';

// The dark panel's interactive half, wired. ⚠️ **It occupies the slots the reference already
// provides and adds none.** `.agent-visual` · `.agent-status` · `.query-evidence` · the secret
// field · `.atlas-composer`, in that order, which is the reference's order.
//
// ⚠️ **`CONSOLE_SECRET` lives HERE, inside the layout, not above it.** The previous page put it in
// a section of its own above the workspace, which is how the reference layout ended up inserted
// into Phase 3's console rather than replacing it. It gates Generate, Generate is in this panel,
// so the field belongs in this panel.

import { useState } from 'react';
import { Generate } from './generate.js';
import { Terminal, useLog } from './terminal.js';
import { useGraph, useSecret } from './graph.js';

// ⚠️ **No function props.** A server component cannot hand a callback to a client one — Next throws
// *"Event handlers cannot be passed to Client Component props"* at render, which `next build` does
// not catch because it is a runtime boundary rule. The saved hash is held here instead.
export function AtlasPanel() {
  const log = useLog();
  // ⚠️ Shared with the Source data tab — one query, two slots. See `graph.tsx`.
  const { data: source, error: sourceError, busy: sourceBusy, read: readSource } = useGraph();
  const { secret, setSecret } = useSecret();
  const [savedHash, setSavedHash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The last line of each stage, which is what the status rows show.
  const last = (stage: string) => [...log.lines].reverse().find((l) => l.stage === stage)?.text ?? null;
  const graph = last('execute') ?? last('context');
  const checks = last('validate');
  const saved = last('save');

  return (
    <>
      {/* ⚠️ The orbit spins while a run is in flight — `running` is the reference's own modifier. */}
      <div className="agent-visual">
        <div className={`orbit ${busy ? 'running' : ''} `} aria-label="Atlas agent">
          <div className="orbit-track outer"><i /><i /></div>
          <div className="orbit-track inner"><i /></div>
          <span>ATLAS</span>
        </div>
        <p aria-live="polite">
          {busy ? 'Working…' : savedHash ? 'Report saved.' : 'Ready for your next question.'}
        </p>
        <span className="eyebrow">ATLAS RESEARCH AGENT</span>
      </div>

      {/* ⚠️ The reference's three rows, driven by the run's own NDJSON stages rather than a fixture.
          Before a run they say so instead of claiming "Data retrieved". */}
      <div className="agent-status">
        <div><span>The Graph</span><code>{graph ? graph.slice(0, 34) : 'no run yet'}</code></div>
        <div><span>Checks</span><code>{checks ? checks.slice(0, 34) : '—'}</code></div>
        <div><span>Report</span><code>{saved ? saved.slice(0, 34) : '—'}</code></div>
      </div>

      {/* ⚠️ **THE FIVE REAL VALUES.** `deployment`, `block`, `fetchedAt` and the row count all come
          off `buildEvidence`, which reads them from the subgraph's own `_meta` — **not from our
          clock and not derived from anything here.** That is what makes the block number and the
          retrieval time proof that the read was live. `requestedBlock` is null because the query is
          unpinned, which is the point: a pinned read would return whatever block we asked for.
          ⚠️ Before a read it says so; it does not show DEMO values and it does not show zeros. */}
      <div className="query-evidence">
        <span className="eyebrow">THE GRAPH / QUERY EVIDENCE</span>
        {source ? (
          <dl>
            <dt>Subgraph</dt><dd>{source.subgraph}</dd>
            <dt>Deployment</dt><dd>{source.evidence.deployment}</dd>
            <dt>Block</dt><dd>{source.evidence.block.toLocaleString('en-US')}</dd>
            <dt>Records</dt><dd>{source.evidence.rowCount ?? '—'}</dd>
            <dt>Retrieved</dt><dd>{source.evidence.fetchedAt.slice(11, 19)} UTC</dd>
          </dl>
        ) : (
          <dl>
            <dt>Subgraph</dt><dd>{sourceBusy ? 'querying…' : 'not read'}</dd>
            <dt>Deployment</dt><dd>—</dd>
            <dt>Block</dt><dd>—</dd>
            <dt>Records</dt><dd>—</dd>
            <dt>Retrieved</dt><dd>—</dd>
          </dl>
        )}
        {/* ⚠️ The reference's own "Inspect source data" link, now a real destination: the tab that
            ran the query. */}
        <button type="button" className="text-link" disabled={sourceBusy || !secret}
                onClick={() => void readSource(secret)}>
          {source ? 'Read again →' : 'Inspect source data →'}
        </button>
        {sourceError && <p className="buy-error">{sourceError}</p>}
      </div>

      {/* ⚠️ **RESTORED — the reference's `.mini-terminal` slot, which Unit 4c dropped.** Without it
          `log.lines` had nowhere to render, so a fifty-second generation showed only three status
          rows and no sign of what it was doing. The stage/elapsed line model is `terminal.tsx`'s. */}
      <div className="mini-terminal">
        <Terminal lines={log.lines} onClear={log.clear} />
      </div>

      {/* ⚠️ The doorlock, inside the panel whose actions it gates. Not a section above the page. */}
      <label className="field-label" htmlFor="console-secret">
        CONSOLE_SECRET
        <input id="console-secret" className="field mono" type="password" value={secret}
               autoComplete="off" spellCheck={false} placeholder="operator secret"
               onChange={(e) => setSecret(e.target.value)} disabled={busy} />
      </label>

      <Generate log={log} busy={busy} setBusy={setBusy} secret={secret} onSaved={setSavedHash} />
    </>
  );
}

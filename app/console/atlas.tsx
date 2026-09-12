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
import { useLog } from './terminal.js';
import { Unbuilt } from '../ui/unbuilt.js';

// ⚠️ **No function props.** A server component cannot hand a callback to a client one — Next throws
// *"Event handlers cannot be passed to Client Component props"* at render, which `next build` does
// not catch because it is a runtime boundary rule. The saved hash is held here instead.
export function AtlasPanel() {
  const log = useLog();
  const [savedHash, setSavedHash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState('');

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

      {/* ⚠️ MARKED, not filled. The reference shows a subgraph, a deployment, a block, a record
          count and a retrieval time. Those come off `/api/console/source`, which is not built — The
          Graph has no surface outside a generation run. Inventing five values here is exactly what
          this treatment exists to prevent. */}
      <div className="query-evidence">
        <span className="eyebrow">THE GRAPH / QUERY EVIDENCE</span>
        <Unbuilt label="Live subgraph evidence">
          <dl>
            <dt>Subgraph</dt><dd>—</dd>
            <dt>Deployment</dt><dd>—</dd>
            <dt>Block</dt><dd>—</dd>
            <dt>Records</dt><dd>—</dd>
            <dt>Retrieved</dt><dd>—</dd>
          </dl>
        </Unbuilt>
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

'use client';

// ⚠️ ════ `SecretField` IS TEMPORARILY NOT RENDERED — 2026-09-12 ═══════════════════════════════
//
// The six console routes have their `locked()` call commented out, so no route reads this value.
// **`SecretProvider` is still mounted and `useSecret()` still works** — `ConsoleViewer` reads it and
// still sends the header, which is ignored — but `AtlasPanel` no longer renders the input.
//
// ⚠️ **A field asking for a secret the routes ignore is worse than no field.** It implies a gate
// that is not there, and it makes every console surface look broken until something is pasted.
//
// **Nothing here is deleted.** Putting it back is one line in `AtlasPanel.tsx` — `<SecretField />`
// above the composer — plus uncommenting `locked()` in the six routes. See
// `app/api/console/lock.ts` and `tracking/DECISIONS.md` 2026-09-12.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// The console doorlock's browser half — one value, shared by two panels that are not siblings.
//
// ⚠️ **`CONSOLE_SECRET` is typed by a human and never built into anything.**
// `NEXT_PUBLIC_CONSOLE_SECRET` would be inlined into the client bundle at build time and served to
// every visitor, which is not a secret but a string in a `<script>` tag. The value exists only in
// the environment (server side) and in the operator's head (browser side), and the two meet in the
// `x-console-secret` header. `app/api/console/lock.ts` carries the rest of the reasoning, including
// the honest limit: this works only because a human is at the keyboard.
//
// ⚠️ **THE PROVIDER RENDERS NO DOM ELEMENT AT ALL**, and that is the whole reason it exists rather
// than the state living in one panel. The field is in the dark Atlas panel; the Source data tab that
// needs the same value is in the light viewer. They are in different subtrees, so the value cannot
// be lifted into either one — and a wrapper `<div>` here would insert an element into markup that
// was transcribed from the design and is checked against it token for token.
// `trash/app/console/graph.tsx` solved it this way and this is the same shape.

import {createContext, useContext, useState, type ReactNode} from 'react';

/**
 * ⚠️ **What the run is doing, shared with the document panel.** Generation happens in the Atlas
 * panel and the document panel is its sibling, so the state cannot be lifted into either — the same
 * reason the secret lives here. Without it the panel shows the previous report looking current
 * while a run is in flight, which is the console's most misleading possible state.
 */
export type RunState = 'idle' | 'running' | 'saved' | 'failed';

/**
 * ⚠️ **The evidence record from the console's last Graph read, shared with the Atlas panel.**
 *
 * ⚠️ **WHICH READ: the Source data roster, and only that one.** The block sits in the Atlas panel
 * beside a generation run, so the obvious choice would be the run's own Graph stage — but
 * `/api/console/generate`'s `execute` event emits only `{elapsedMs, queries, block, timings}`.
 * **It carries no deployment, no retrieval time and no row count**, so four of the block's five rows
 * could not be filled from it without inventing them, and inventing them is the exact fault this
 * block exists to fix. `/api/console/source` returns a whole `buildEvidence` record, so it is the
 * only read in this console that can honestly fill all five.
 *
 * ⚠️ **The block therefore names its own subject** — the eyebrow reads THE GRAPH / SOURCE READ, not
 * a bare "QUERY EVIDENCE" that a reader would attach to whatever is on screen. Evidence that does
 * not say what it is evidence of is not evidence.
 */
export type Evidence = {
  /**
   * ⚠️ **Which read this describes, and the block SAYS it.** Two different claims share one
   * five-row space: *"the evidence for the report you are looking at"* and *"the read you just
   * pressed"*. A block that switched between them silently would be worse than one left blank.
   */
  kind: 'report' | 'source';
  subgraph: string;
  deployment: string;
  block: number;
  requestedBlock: number | null;
  fetchedAt: string;
  records: string;
};

export type SourceEvidence = {
  subgraph: string;
  deployment: string;
  block: number;
  requestedBlock: number | null;
  fetchedAt: string;
  rowCount: number | null;
  documentHash: string;
  responseHash: string;
  answering: number;
  total: number;
  versions: number;
};

type Secret = {
  secret: string;
  setSecret: (s: string) => void;
  run: RunState;
  setRun: (r: RunState) => void;
  source: SourceEvidence | null;
  setSource: (e: SourceEvidence) => void;
  evidence: Evidence | null;
  setEvidence: (e: Evidence) => void;
  /** The viewer's open tab, here so the Atlas panel's "Inspect source data" can switch it. */
  tab: 'report' | 'data';
  setTab: (t: 'report' | 'data') => void;
};

const Ctx = createContext<Secret | null>(null);

export function SecretProvider({children}: {children: ReactNode}) {
  const [secret, setSecret] = useState('');
  const [run, setRun] = useState<RunState>('idle');
  const [source, setSource] = useState<SourceEvidence | null>(null);
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [tab, setTab] = useState<'report' | 'data'>('report');
  return (
    <Ctx.Provider value={{secret, setSecret, run, setRun, source, setSource, evidence, setEvidence, tab, setTab}}>
      {children}
    </Ctx.Provider>
  );
}

export function useSecret(): Secret {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSecret outside SecretProvider');
  return c;
}

/**
 * The field itself. ⚠️ **It lives inside the Atlas panel, above the composer it gates** — not in a
 * section of its own above the workspace. `logs.md` records why: putting it above the workspace is
 * precisely how the reference layout ended up inserted into the old console rather than replacing
 * it. It gates Generate, Generate is in this panel, so the field belongs in this panel.
 */
export function SecretField() {
  const {secret, setSecret} = useSecret();
  return (
    <label className="field-label" htmlFor="console-secret">
      CONSOLE_SECRET
      <input
        id="console-secret"
        className="field"
        type="password"
        value={secret}
        autoComplete="off"
        spellCheck={false}
        placeholder="operator secret"
        onChange={(e) => setSecret(e.target.value)}
      />
    </label>
  );
}

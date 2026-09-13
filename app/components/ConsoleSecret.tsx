'use client';

// ⚠️ ════ `SecretField` IS TEMPORARILY NOT RENDERED — 2026-09-12 ═══════════════════════════════
//
// The six console routes have their `locked()` call commented out, so no route reads this value.
// **`SecretProvider` is still mounted and `useSecret()` still works** — `ConsoleViewer` still sends
// the value as a header, which is ignored — but `AtlasPanel` no longer renders the input.
//
// ⚠️ **A field asking for a secret the routes ignore is worse than no field.** It implies a gate
// that is not there, and it makes every console surface look broken until something is pasted.
//
// **Nothing here is deleted.** Putting it back: `<SecretField />` above the composer in
// `AtlasPanel.tsx`, `locked()` uncommented in the six routes, and ⚠️ **the `x-console-secret` header
// added to the two fetches that do not send it** — `AtlasPanel`'s generate and `TokenizeForm`'s
// tokenize. Only `ConsoleViewer`'s source read still sends it; without the other two, Generate and
// Tokenize answer 401. See `app/api/console/lock.ts` and `tracking/DECISIONS.md` 2026-09-12.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// The console's shared client state — the doorlock's value, the run, the evidence record, the
// viewer's tab and the draft listing — for panels that are not siblings.
//
// ⚠️ **`CONSOLE_SECRET` is typed by a human and never built into anything.**
// `NEXT_PUBLIC_CONSOLE_SECRET` would be inlined into the client bundle at build time and served to
// every visitor, which is not a secret but a string in a `<script>` tag. The value exists only in
// the environment and in the operator's head, and the two meet in the `x-console-secret` header.
// `app/api/console/lock.ts` carries the rest, including the honest limit: this works only because a
// human is at the keyboard.
//
// ⚠️ **THE PROVIDER RENDERS NO DOM ELEMENT AT ALL**, and that is why the state lives here rather
// than in one panel. Its readers — the Atlas panel, the viewer, the tokenize section — are in
// different subtrees, so nothing can be lifted into any one of them, and a wrapper `<div>` here would
// insert an element into markup transcribed from the design and checked against it token for token.
// `trash/app/console/graph.tsx` solved it the same way.

import {createContext, useContext, useState, type ReactNode} from 'react';

/**
 * ⚠️ **The listing a person is composing, shared so the preview can show it as they type.**
 * The form and the Marketplace preview are siblings inside `.tokenize-grid`, so neither can hold it.
 *
 * ⚠️ **Only the description is persisted, and only by publishing** (migration 010). The title and
 * price edit the preview; `/api/console/tokenize` accepts `{reportHash, confirm}` and nothing else.
 *
 * ⚠️ **`hash` is the report the draft was typed for.** The provider outlives a generated report — the
 * page refreshes around it — so a draft typed for the previous report must not follow the next one.
 */
export type Draft = {hash: string; title: string; description: string; priceHbar: string};

/**
 * ⚠️ **What the run is doing, shared with the document panel.** Generation happens in the Atlas
 * panel and the document panel is its sibling. Without this the panel shows the previous report
 * looking current while a run is in flight, which is the console's most misleading possible state.
 */
export type RunState = 'idle' | 'running' | 'saved' | 'failed';

/**
 * ⚠️ **What the Atlas panel's five-row evidence block shows — one of two reads, never the run's.**
 * `kind: 'report'` is the displayed report's stored provenance, built by `app/console/page.tsx`;
 * `kind: 'source'` is the Source data read, set by `ConsoleViewer` and overriding the first.
 *
 * ⚠️ **Why not the generation run's own Graph stage:** `/api/console/generate`'s `execute` event
 * emits only `{elapsedMs, queries, block, timings}`. **It carries no deployment, no retrieval time
 * and no row count**, so four of the five rows could not be filled from it without inventing them,
 * and inventing them is the exact fault this block exists to fix.
 *
 * ⚠️ **The block therefore names its own subject in the eyebrow** — see `AtlasPanel`. Evidence that
 * does not say what it is evidence of is not evidence.
 */
export type Evidence = {
  /** ⚠️ Which read this describes. The eyebrow says it; `AtlasPanel` records why. */
  kind: 'report' | 'source';
  subgraph: string;
  deployment: string;
  block: number;
  requestedBlock: number | null;
  fetchedAt: string;
  records: string;
};

/**
 * The Source data read's summary. ⚠️ Only `AtlasPanel` reads it, and only to label its link —
 * `documentHash`, `responseHash` and `requestedBlock` are kept here and rendered nowhere.
 */
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
  draft: Draft | null;
  setDraft: (d: Draft) => void;
  /** ⚠️ A publish press in flight, so the badge in the preview card's heading can say so too. */
  publishing: boolean;
  setPublishing: (p: boolean) => void;
};

const Ctx = createContext<Secret | null>(null);

export function SecretProvider({children}: {children: ReactNode}) {
  const [secret, setSecret] = useState('');
  const [run, setRun] = useState<RunState>('idle');
  const [source, setSource] = useState<SourceEvidence | null>(null);
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [tab, setTab] = useState<'report' | 'data'>('report');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [publishing, setPublishing] = useState(false);
  return (
    <Ctx.Provider value={{secret, setSecret, run, setRun, source, setSource, evidence, setEvidence, tab, setTab, draft, setDraft, publishing, setPublishing}}>
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
 * The field itself — not rendered while the lock is unwired; see the top of this file.
 *
 * ⚠️ **It belongs inside the Atlas panel, above the composer it gates** — not in a section of its own
 * above the workspace. `logs.md` records why: putting it above the workspace is precisely how the
 * reference layout ended up inserted into the old console rather than replacing it.
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

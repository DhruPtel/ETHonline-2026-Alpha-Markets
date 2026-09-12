'use client';

import {Fragment, useRef, useState} from 'react';
import {useFitPanel} from '../hooks/useFitPanel.js';
import {ArrowDown, ArrowRight, ArrowUpRight, CheckCircle, Database, FileText, Terminal} from './Icons.js';

/**
 * The dark Atlas panel: the agent/terminal tabs, the status tiles, the query
 * evidence block and the prompt composer. Client-only — it owns the tabs and
 * the textarea.
 *
 * Scaled to its column by useFitPanel, the same as the report viewer.
 */
export type AtlasData = {
  run: string;
  idleMessage: string;
  status: {label: string; value: string}[];
  evidence: {label: string; value: string}[];
  terminal: {stamp: string; text: string}[];
  promptLimit: number;
};

const STATUS_ICONS = [Database, CheckCircle, FileText];

/** One line of a run. ⚠️ The design's terminal row is `{stamp, text}` and nothing else — no stage
 *  column and no tone class — so the stage is folded into the text rather than given a slot the
 *  stylesheet does not have. See the note in the panel's header comment. */
type RunLine = {id: number; stamp: string; text: string};

const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

/** One NDJSON event off `/api/console/generate`. */
type Event = {t: number; stage: string; status?: string; [k: string]: unknown};

let nextLineId = 0;

/**
 * One stream event → one line of text. ⚠️ Kept outside the component so the reader loop stays
 * readable, and lifted from `trash/app/console/generate.tsx`, which mapped the same nine stages.
 * The stage is folded into the text because the design's row has no stage column.
 */
function describe(e: Event): string {
  const n = (v: unknown) => secs(Number(v));
  switch (e.stage) {
    case 'limits':
      return `limits · analyst ${String(e.analyst)} · execute budget ${n(e.executeBudgetMs)}`;
    case 'context':
      return `context · ok in ${n(e.ms)}`;
    case 'compose':
      if (e.status === 'start') return 'compose · planning…';
      if (e.status === 'ok') {
        const checks = (e.checks as string[]) ?? [];
        return `compose · ok · ${String(e.headline)} · checks ${checks.join(', ') || 'none'}`;
      }
      return `compose · needs clarification — ${String(e.reason ?? 'missing detail')}`;
    case 'execute':
      if (e.status === 'start') return `execute · gathering… budget ${n(e.budgetMs)}`;
      if (e.status === 'ok') {
        return `execute · ok in ${n(e.elapsedMs)} · ${String(e.queries)} queries · block ${String(e.block)}`;
      }
      return `execute · ${String(e.outcome)} after ${n(e.elapsedMs)} — ${String(e.detail ?? '')}`;
    case 'narrate':
      if (e.status === 'start') return 'narrate · writing…';
      return `narrate · ok · ${String(e.facts)} facts · hash ${String(e.hash).slice(0, 16)}…`;
    case 'validate':
      return e.status === 'ok'
        ? 'validate · digit guard clean — every figure traces to a fact'
        : `validate · ${String(e.count)} violation(s) — saved anyway (warns, never blocks)`;
    case 'save':
      return `save · ${e.inserted ? 'SAVED' : 'ALREADY STORED'} · ${String(e.facts)} facts · block ${String(e.block)} · ${String(e.markdownChars)} chars${e.note ? ` · ${String(e.note)}` : ''}`;
    case 'hash':
      return `hash · ${String(e.hash)}`;
    case 'error':
      return `error · ${String(e.detail)}`;
    case 'done':
      return e.saved ? 'done · finished' : 'done · finished — nothing was saved';
    default:
      return `${e.stage} · ${JSON.stringify(e).slice(0, 120)}`;
  }
}

export function AtlasPanel({atlas}: {atlas: AtlasData}) {
  const [mode, setMode] = useState<'agent' | 'terminal'>('agent');
  const [prompt, setPrompt] = useState('');

  // ── The run ───────────────────────────────────────────────────────────────────────────────────
  // ⚠️ **The log is STATE, not a render side effect.** Both views read the same array, so switching
  // Agent view ↔ Terminal mid-run re-renders and loses nothing — the lines already written stay
  // written and the stream keeps appending to the same place.
  const [lines, setLines] = useState<RunLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<{hash: string} | null>(null);
  const started = useRef(0);

  // ⚠️ **The stamp is computed HERE, not inside the updater.** React runs the updater when it
  // flushes, which can be after the `finally` that zeroes the clock — `save` and `done` then print
  // with a blank gutter. `trash/app/console/terminal.tsx` records this as measured, not theorised.
  const write = (text: string) => {
    const stamp = started.current ? secs(Date.now() - started.current) : '';
    setLines((prior) => [...prior, {id: nextLineId++, stamp, text}]);
  };

  async function onGenerate() {
    const asked = prompt.trim();
    // ⚠️ **Pressing twice does nothing the second time.** `busy` guards here and the submit button
    // is disabled while a run is in flight, so a second press cannot start a second run or spend a
    // second time. There is no queue: the run in flight is the run.
    if (!asked || busy) return;

    setBusy(true);
    setSaved(null);
    started.current = Date.now();
    setLines([{id: nextLineId++, stamp: '0.0s', text: `generate · "${asked}"`}]);

    try {
      // ⚠️ No `x-console-secret` header: the doorlock is currently unwired on the console routes.
      // `lock.ts` is intact and this is where the header goes back. See DECISIONS.md 2026-09-12.
      const res = await fetch('/api/console/generate', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({directive: asked}),
      });

      if (!res.ok || !res.body) {
        const detail = await res.text();
        write(`generate · HTTP ${res.status} — ${detail.slice(0, 160)}`);
        return;
      }

      // ⚠️ **Read as it arrives.** Chunks do not align to lines: split on \n, keep the trailing
      // partial in the buffer, parse the rest. This is what makes a 34–47s run legible while it
      // runs instead of arriving all at once at the end.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let sawDone = false;

      for (;;) {
        const {done, value} = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, {stream: true});
        const parts = buffer.split('\n');
        buffer = parts.pop() ?? '';
        for (const part of parts) {
          if (!part.trim()) continue;
          let e: Event;
          try {
            e = JSON.parse(part) as Event;
          } catch {
            continue;
          }
          if (e.stage === 'done') sawDone = true;
          if (e.stage === 'save' && typeof e.hash === 'string') setSaved({hash: e.hash});
          write(describe(e));
          // ⚠️ The hash on its own line, whole and selectable. It is the report's identity — what
          // an ATS token commits and an Arc market settles against — and truncating it in the only
          // place it appears would make it useless.
          if (e.stage === 'save' && typeof e.hash === 'string') write(`hash · ${e.hash}`);
        }
      }

      // ⚠️ **A stream that ends without `done` is a TRUNCATION, not a finish.** The Hobby ceiling is
      // 60s — silently clamped from the 300 the route declares — and a run killed there stops
      // mid-response. `save()` is the last step, so nothing was stored and the tokens are spent.
      // ⚠️ **No retry control anywhere.** The ceiling forbids a resume, not a rerun; a control
      // implying the run could be picked up would be a lie. Ask again and it starts over.
      if (!sawDone) {
        write(
          'truncated · the stream ended without a done event — the function was killed or the ' +
          'connection dropped. Nothing was saved: save is the last step, so the model tokens are ' +
          'spent and no report exists. Ask again to start over.',
        );
      }
    } catch (error) {
      write(`generate · ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      started.current = 0;
      setBusy(false);
    }
  }

  function onReadSource() {
    // Opens the source-data tab on the viewer beside this panel.
  }

  const {frameRef, contentRef, contentStyle} = useFitPanel();

  const hasRun = lines.length > 0;

  // ── What the two views show ───────────────────────────────────────────────────────────────────
  // ⚠️ **Both are derived from `lines`, so neither view holds state the other lacks.** Switching
  // tabs mid-run recomputes from the same array.
  const lastFor = (prefix: string) =>
    [...lines].reverse().find((l) => l.text.startsWith(prefix))?.text ?? null;
  const trim = (s: string | null) => (s === null ? null : s.replace(/^[a-z]+ · /, ''));

  // The design's three rows, in its order: The Graph, Checks, Report.
  // ⚠️ Before a run they say so rather than claiming "Data retrieved" — a status row asserting a
  // result nothing produced is the one thing this panel must never do.
  const status = hasRun
    ? [
        {label: 'The Graph', value: trim(lastFor('execute ·') ?? lastFor('context ·')) ?? 'waiting…'},
        {label: 'Checks', value: trim(lastFor('validate ·')) ?? (busy ? 'waiting…' : '—')},
        {label: 'Report', value: trim(lastFor('save ·')) ?? (busy ? 'waiting…' : '—')},
      ]
    : atlas.status.map((row) => ({label: row.label, value: 'no run yet'}));

  // ⚠️ The terminal rows are the run's own lines; before a run, the design's placeholder stays.
  const terminal = hasRun
    ? lines.map((l) => ({stamp: l.stamp, text: l.text}))
    : atlas.terminal;

  return (
    <aside className="atlas-console">
      <div className="fit-panel" ref={frameRef}>
        <div className="fit-panel-content" ref={contentRef} style={contentStyle}>
          <div className="atlas-inner">
            <div className="atlas-top">
              <span>
                ATLAS <small>/ {atlas.run}</small>
              </span>
              <div className="tab-list" role="tablist">
                <button
                  className={mode === 'agent' ? 'tab active' : 'tab'}
                  type="button"
                  role="tab"
                  aria-selected={mode === 'agent'}
                  onClick={() => setMode('agent')}
                >
                  Agent view
                </button>
                <button
                  className={mode === 'terminal' ? 'tab active' : 'tab'}
                  type="button"
                  role="tab"
                  aria-selected={mode === 'terminal'}
                  onClick={() => setMode('terminal')}
                >
                  Terminal
                </button>
              </div>
            </div>

            {mode === 'agent' ? (
              <div className="agent-visual">
                <div className={busy ? 'orbit running' : 'orbit'} aria-label="Atlas agent">
                  <div className="orbit-track outer">
                    <i />
                    <i />
                  </div>
                  <div className="orbit-track inner">
                    <i />
                  </div>
                  <span>ATLAS</span>
                </div>
                {/* ⚠️ aria-live, so a screen reader hears the run change state. */}
                <p aria-live="polite">
                  {busy ? 'Working…' : saved ? 'Report saved.' : atlas.idleMessage}
                </p>
                <span className="eyebrow">ATLAS RESEARCH AGENT</span>
              </div>
            ) : (
              <div className="terminal-large">
                <div>
                  <Terminal size={15} />
                  ATLAS / SESSION
                </div>
                {terminal.map((line) => (
                  <p key={`${line.stamp}-${line.text}`}>
                    <span>{line.stamp}</span>
                    <b>›</b>
                    {line.text}
                  </p>
                ))}
                <i className="terminal-cursor" />
              </div>
            )}

            <div className="agent-status">
              {status.map((tile, i) => {
                const Icon = STATUS_ICONS[i % STATUS_ICONS.length];
                return (
                  <div key={tile.label}>
                    <Icon size={17} />
                    <span>{tile.label}</span>
                    <code>{tile.value}</code>
                  </div>
                );
              })}
            </div>

            <div className="query-evidence">
              <span className="eyebrow">THE GRAPH / QUERY EVIDENCE</span>
              <dl>
                {atlas.evidence.map((row) => (
                  <Fragment key={row.label}>
                    <dt>{row.label}</dt>
                    <dd>{row.value}</dd>
                  </Fragment>
                ))}
              </dl>
              <button className="text-link" type="button" onClick={onReadSource}>
                Inspect source data <ArrowUpRight size={14} />
              </button>
            </div>

            <div className="mini-terminal">
              {terminal.slice(-2).map((line) => (
                <p key={`${line.stamp}-${line.text}`}>
                  [{line.stamp}] {line.text}
                </p>
              ))}
            </div>

            <form
              className="atlas-composer"
              onSubmit={(e) => {
                e.preventDefault();
                onGenerate();
              }}
            >
              {/* ⚠️ **THE `CONSOLE_SECRET` FIELD IS TEMPORARILY NOT RENDERED — 2026-09-12.** The six
                  console routes have their `locked()` call commented out, so nothing reads this
                  value. **A field asking for a secret the routes ignore is worse than no field**: it
                  implies a gate that is not there and it makes every surface look broken until
                  something is pasted. `<SecretField />` goes back here, one line, when `lock.ts` is
                  re-wired — see `app/api/console/lock.ts` and DECISIONS.md 2026-09-12. */}
              <label htmlFor="research-brief">
                Ask Atlas <span>AGENT</span>
              </label>
              <textarea
                id="research-brief"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                maxLength={atlas.promptLimit}
                placeholder="Describe a report or request an edit…"
              />
              <div className="composer-meta">
                <span>⌘ / Ctrl + Enter</span>
                <span>
                  {prompt.length} / {atlas.promptLimit}
                </span>
              </div>
              <div className="composer-buttons">
                <button type="submit" className="btn primary" disabled={busy || !prompt.trim()}>
                  <ArrowRight size={15} />
                  {busy ? 'Running…' : 'Generate report'}
                </button>
                {/* ⚠️ **NO "read it" link, deliberately.** A saved report's page is
                    `/report/<hash>`, and that page still renders its demo `Record` — the real one
                    404s until PHASE-6 task 6 wires `load()`. Shipping a button that dead-ends is
                    worse than not shipping it. **The hash is written to the terminal whole**, which
                    is the thing that is actually real, and this becomes a link in task 6. */}
                <a href="#tokenize" className="btn outline">
                  Tokenize <ArrowDown size={15} />
                </a>
              </div>
            </form>
          </div>
        </div>
      </div>
    </aside>
  );
}

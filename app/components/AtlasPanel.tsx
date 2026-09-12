'use client';

import {Fragment, useState} from 'react';
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

export function AtlasPanel({atlas}: {atlas: AtlasData}) {
  const [mode, setMode] = useState<'agent' | 'terminal'>('agent');
  const [prompt, setPrompt] = useState('');

  const {frameRef, contentRef, contentStyle} = useFitPanel();

  function onGenerate() {
    // Runs the agent against the brief and writes the resulting report.
  }

  function onReadSource() {
    // Opens the source-data tab on the viewer beside this panel.
  }

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
                <div className="orbit" aria-label="Atlas agent ready">
                  <div className="orbit-track outer">
                    <i />
                    <i />
                  </div>
                  <div className="orbit-track inner">
                    <i />
                  </div>
                  <span>ATLAS</span>
                </div>
                <p aria-live="polite">{atlas.idleMessage}</p>
                <span className="eyebrow">ATLAS RESEARCH AGENT</span>
              </div>
            ) : (
              <div className="terminal-large">
                <div>
                  <Terminal size={15} />
                  ATLAS / SESSION
                </div>
                {atlas.terminal.map((line) => (
                  <p key={line.text}>
                    <span>{line.stamp}</span>
                    <b>›</b>
                    {line.text}
                  </p>
                ))}
                <i className="terminal-cursor" />
              </div>
            )}

            <div className="agent-status">
              {atlas.status.map((tile, i) => {
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
              {atlas.terminal.slice(0, 2).map((line) => (
                <p key={line.text}>
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
                <button type="submit" className="btn primary">
                  <ArrowRight size={15} />
                  Generate report
                </button>
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

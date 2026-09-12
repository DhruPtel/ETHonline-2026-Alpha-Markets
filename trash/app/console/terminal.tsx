'use client';

// The output pane, and the line model everything else in the console writes into.
//
// ⚠️ **THROWAWAY. Delete `app/console/` and `app/api/console/` before submission.**
//
// ⚠️ **Structured lines, not a JSON blob in a `<pre>`.** Every line carries an elapsed stamp, a
// stage, a message and optionally one link. That is what makes a fifty-second generation legible
// while it is running: the stamp column shows where the time is going, and the stage column lines up
// so a run reads as a sequence rather than as text. A pretty-printed response object would say the
// same things and be unreadable at the moment it matters.

import { useEffect, useRef, useState } from 'react';

/** Status is content in a terminal, so it is the one thing that carries colour here. */
export type Tone = 'plain' | 'good' | 'warn' | 'bad' | 'note';

export interface Line {
  readonly id: number;
  /** Elapsed within the current run, already formatted — `"4.2s"`. Blank for lines outside a run. */
  readonly at: string;
  readonly stage: string;
  readonly text: string;
  readonly tone: Tone;
  readonly href?: string;
  readonly hrefLabel?: string;
}

let nextId = 0;

/** Owns the transcript. Returned by the console root and passed down to every control. */
export function useLog() {
  const [lines, setLines] = useState<Line[]>([]);
  const started = useRef<number>(0);

  // ⚠️ **The stamp is computed HERE, not inside the updater.** React runs the updater when it
  // flushes, which can be after the `finally { log.end() }` that zeroes the clock — the last two
  // lines of a run then print with a blank gutter. Measured, not theorised: `save` and `done` lost
  // their stamps on the first real generation.
  const write = (stage: string, text: string, tone: Tone = 'plain', href?: string, hrefLabel?: string) => {
    const at = started.current ? `${((Date.now() - started.current) / 1000).toFixed(1)}s` : '';
    setLines((prior) => [...prior, { id: nextId++, at, stage, text, tone, href, hrefLabel }]);
  };

  /** Starts the elapsed clock and rules off the previous run. */
  const begin = (stage: string, text: string) => {
    started.current = Date.now();
    setLines((prior) => [...prior, { id: nextId++, at: '', stage: '', text: '', tone: 'plain' },
      { id: nextId++, at: '0.0s', stage, text, tone: 'note' }]);
  };

  const end = () => { started.current = 0; };

  return { lines, write, begin, end, clear: () => setLines([]) };
}

export type Log = ReturnType<typeof useLog>;

export function Terminal({ lines, onClear }: { lines: readonly Line[]; onClear: () => void }) {
  const pane = useRef<HTMLDivElement>(null);

  // Follow the tail. A run that scrolls off the bottom is a run you cannot watch.
  useEffect(() => { pane.current?.scrollTo({ top: pane.current.scrollHeight }); }, [lines]);

  return (
    <section className="term-wrap" aria-label="Run output">
      <header className="term-head">
        <span>Output</span>
        <button type="button" className="quiet" onClick={onClear} disabled={lines.length === 0}>Clear</button>
      </header>
      <div className="term" ref={pane}>
        {lines.length === 0 ? (
          <p className="term-empty">Nothing has run yet.</p>
        ) : lines.map((l) => (
          l.stage === '' && l.text === '' ? <hr key={l.id} className="term-rule" /> : (
            <div key={l.id} className={`term-line tone-${l.tone}`}>
              <span className="term-at">{l.at}</span>
              <span className="term-stage">{l.stage}</span>
              <span className="term-text">
                {l.text}
                {l.href ? (
                  <> <a href={l.href} target="_blank" rel="noreferrer">{l.hrefLabel ?? 'open →'}</a></>
                ) : null}
              </span>
            </div>
          )
        ))}
      </div>
    </section>
  );
}

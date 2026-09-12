'use client';

// The report body, rendered. Both the thing a purchase bought and the thing the console door reads.
//
// ⚠️ **THROWAWAY. Delete `app/console/` and `app/api/console/` before submission.**
//
// ⚠️ **This exists because the buyer used to pay for a body and throw it away.** The buy control
// received the markdown, printed four table lines into the terminal and dropped the rest — so the
// one artefact the whole payment path exists to deliver was the one thing you could not look at.
//
// ⚠️ **It renders with `app/markdown.tsx`, the product's own renderer**, rather than a second one.
// That component is the escaping boundary for indexer-supplied market names, and a console that
// rendered report markdown its own way would be testing its own parser instead of the build's.
//
// ⚠️ **The provenance banner is not decoration.** A body obtained by paying and a body obtained by
// walking around the paywall look identical — they are produced by the same `render()` call — so the
// pane says which one you are looking at. Reading one of these and assuming a payment happened is
// exactly the mistake this label prevents.

import { Markdown } from '../markdown.js';

export type DocSource = 'paid' | 'door';

export interface ConsoleDoc {
  readonly source: DocSource;
  readonly reportHash: string;
  readonly markdown: string;
  /** Short key/value pairs shown above the document — cost, payment id, fact count, whatever fits. */
  readonly facts: readonly (readonly [string, string])[];
  /** A figure to grep the public page for. Handed to the operator, not used here. */
  readonly figure: string | null;
}

export function DocumentPane({ doc, onClose }: { doc: ConsoleDoc | null; onClose: () => void }) {
  if (!doc) return null;

  const paid = doc.source === 'paid';
  return (
    <section className={`doc ${paid ? 'doc-paid' : 'doc-door'}`}>
      <header className="doc-head">
        <div>
          <strong>{paid ? 'Purchased body' : 'Console door — unpaid read'}</strong>
          <span className="doc-sub">
            {paid
              ? 'settled over x402, returned by the gate — this is what the buyer paid for'
              : 'read straight from the store, bypassing the gate. Not a product surface.'}
          </span>
        </div>
        <button type="button" className="quiet" onClick={onClose}>Close</button>
      </header>

      <dl className="doc-facts">
        <div><dt>report</dt><dd className="mono break">{doc.reportHash}</dd></div>
        {doc.facts.map(([k, v]) => (
          <div key={k}><dt>{k}</dt><dd className="mono break">{v}</dd></div>
        ))}
      </dl>

      {doc.figure ? (
        <p className="doc-probe">
          A figure from this body: <strong className="mono">{doc.figure}</strong>.
          {' '}⚠️ It should appear <strong>zero</strong> times in the HTML of{' '}
          <a href={`/report/${doc.reportHash}`} target="_blank" rel="noreferrer">
            /report/{doc.reportHash.slice(0, 10)}…
          </a>{' '}— that is what makes the paywall a boundary rather than a decoration.
        </p>
      ) : null}

      {/* ⚠️ `.memo` so globals.css's table and heading rules apply — the same look the paid body has
          on any other surface. No console-specific document styling. */}
      <article className="memo">
        <Markdown source={doc.markdown} />
      </article>
    </section>
  );
}

'use client';

// The viewer's two tabs. ⚠️ **The toolbar below is the reference's markup, lifted byte for byte** —
// the same buttons, the same Radix `data-slot`/`aria-controls` attributes, the same zoom and page
// controls. The only edits are that the two tab buttons now carry `onClick` and derive
// `data-state`/`aria-selected` from state instead of having them hardcoded.
//
// ⚠️ **The Source data tab was inert and marked. It is now the thing you press.** Before a query has
// run it says so and offers the control; while one is running it says that; afterwards it renders
// what came back. The panel it fills is the empty `hidden` tabpanel the reference already had —
// nothing was restructured to make room.

import { useState, type ReactNode } from 'react';
import { useGraph, useSecret } from './graph.js';

/** One field of the returned row. ⚠️ Every USD figure is a BigDecimal STRING — never `Number()` one
 *  before it is checked, which is why these are rendered as they arrived and only trimmed. */
function trim(v: unknown): string {
  const s = String(v);
  // A BigDecimal like 24749756259.0158073747162287544 is unreadable in a side panel at full length.
  const m = /^(-?\d+)\.(\d+)$/.exec(s);
  return m ? `${Number(m[1]).toLocaleString('en-US')}.${m[2].slice(0, 2)}` : s;
}

export function ConsoleViewer({ children }: { children: ReactNode }) {
  const [tab, setTab] = useState<'report' | 'data'>('report');
  const { data, error, busy, read } = useGraph();
  const { secret } = useSecret();

  return (
    <>
        <div className="viewer-toolbar">
          <div role="tablist" aria-orientation="horizontal" data-slot="tabs-list" data-variant="line" className="group/tabs-list inline-flex w-fit items-center justify-center rounded-lg p-[3px] text-muted-foreground group-data-[orientation=horizontal]/tabs:h-9 group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col data-[variant=line]:rounded-none gap-1 bg-transparent" tabIndex={-1} data-orientation="horizontal" style={{"outline": "none"}}>
            <button type="button" role="tab" aria-selected={tab === 'report'} aria-controls="radix-_R_2m_-content-report" data-state={tab === 'report' ? 'active' : 'inactive'} onClick={() => setTab('report')} id="radix-_R_2m_-trigger-report" data-slot="tabs-trigger" className="relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 group-data-[variant=default]/tabs-list:data-[state=active]:shadow-sm group-data-[variant=line]/tabs-list:data-[state=active]:shadow-none dark:text-muted-foreground dark:hover:text-foreground [&amp;_svg]:pointer-events-none [&amp;_svg]:shrink-0 [&amp;_svg:not([class*=&#x27;size-&#x27;])]:size-4 group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent dark:group-data-[variant=line]/tabs-list:data-[state=active]:border-transparent dark:group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent data-[state=active]:bg-background data-[state=active]:text-foreground dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 dark:data-[state=active]:text-foreground after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-[orientation=horizontal]/tabs:after:inset-x-0 group-data-[orientation=horizontal]/tabs:after:bottom-[-5px] group-data-[orientation=horizontal]/tabs:after:h-0.5 group-data-[orientation=vertical]/tabs:after:inset-y-0 group-data-[orientation=vertical]/tabs:after:-right-1 group-data-[orientation=vertical]/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-[state=active]:after:opacity-100" tabIndex={-1} data-orientation="horizontal" data-radix-collection-item="">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-file-text" aria-hidden="true">
                <path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z">
                </path>
                <path d="M14 2v5a1 1 0 0 0 1 1h5">
                </path>
                <path d="M10 9H8">
                </path>
                <path d="M16 13H8">
                </path>
                <path d="M16 17H8">
                </path>
              </svg>
              Report
            </button>
            <button type="button" role="tab" aria-selected={tab === 'data'} aria-controls="radix-_R_2m_-content-data" data-state={tab === 'data' ? 'active' : 'inactive'} onClick={() => setTab('data')} id="radix-_R_2m_-trigger-data" data-slot="tabs-trigger" className="relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 group-data-[variant=default]/tabs-list:data-[state=active]:shadow-sm group-data-[variant=line]/tabs-list:data-[state=active]:shadow-none dark:text-muted-foreground dark:hover:text-foreground [&amp;_svg]:pointer-events-none [&amp;_svg]:shrink-0 [&amp;_svg:not([class*=&#x27;size-&#x27;])]:size-4 group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent dark:group-data-[variant=line]/tabs-list:data-[state=active]:border-transparent dark:group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent data-[state=active]:bg-background data-[state=active]:text-foreground dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 dark:data-[state=active]:text-foreground after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-[orientation=horizontal]/tabs:after:inset-x-0 group-data-[orientation=horizontal]/tabs:after:bottom-[-5px] group-data-[orientation=horizontal]/tabs:after:h-0.5 group-data-[orientation=vertical]/tabs:after:inset-y-0 group-data-[orientation=vertical]/tabs:after:-right-1 group-data-[orientation=vertical]/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-[state=active]:after:opacity-100" tabIndex={-1} data-orientation="horizontal" data-radix-collection-item="">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-database" aria-hidden="true">
                <ellipse cx="12" cy="5" rx="9" ry="3">
                </ellipse>
                <path d="M3 5V19A9 3 0 0 0 21 19V5">
                </path>
                <path d="M3 12A9 3 0 0 0 21 12">
                </path>
              </svg>
              Source data
            </button>
          </div>
          <span className="file-name">
            lending-protocols-q2-2026.pdf
          </span>
          <div className="viewer-tools">
            <button aria-label="Zoom out">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-minus" aria-hidden="true">
                <path d="M5 12h14">
                </path>
              </svg>
            </button>
            <span>
              90%
            </span>
            <button aria-label="Zoom in">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-plus" aria-hidden="true">
                <path d="M5 12h14">
                </path>
                <path d="M12 5v14">
                </path>
              </svg>
            </button>
            <i>
            </i>
            <span>
              1 / 4
            </span>
            <button aria-label="Previous report page" disabled={true}>
              <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-chevron-left" aria-hidden="true">
                <path d="m15 18-6-6 6-6">
                </path>
              </svg>
            </button>
            <button aria-label="Next report page">
              <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-chevron-right" aria-hidden="true">
                <path d="m9 18 6-6-6-6">
                </path>
              </svg>
            </button>
            <button aria-label="Expand report">
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-maximize2 lucide-maximize-2" aria-hidden="true">
                <path d="M15 3h6v6">
                </path>
                <path d="m21 3-7 7">
                </path>
                <path d="m3 21 7-7">
                </path>
                <path d="M9 21H3v-6">
                </path>
              </svg>
            </button>
          </div>
        </div>
      {/* The Report panel — the transcribed document, handed in from the server component so its
          markup never crosses into a client bundle. */}
      <div data-state={tab === 'report' ? 'active' : 'inactive'} data-orientation="horizontal" role="tabpanel"
           aria-labelledby="radix-_R_2m_-trigger-report" id="radix-_R_2m_-content-report" hidden={tab !== 'report'}
           tabIndex={0} data-slot="tabs-content" className="flex-1 outline-none document-stage">
        {children}
      </div>

      {/* ⚠️ The Source data panel — the reference's own empty `hidden` tabpanel, now filled. */}
      <div data-state={tab === 'data' ? 'active' : 'inactive'} data-orientation="horizontal" role="tabpanel"
           aria-labelledby="radix-_R_2m_-trigger-data" id="radix-_R_2m_-content-data" hidden={tab !== 'data'}
           tabIndex={0} data-slot="tabs-content" className="flex-1 outline-none source-panel">
        <div className="section-title">
          <h2>Source data</h2>
          <button type="button" className="btn primary sm" disabled={busy || !secret}
                  onClick={() => void read(secret)}>
            {busy ? 'Querying…' : data ? 'Read again' : 'Read this deployment now'}
          </button>
        </div>

        {!secret && (
          <p className="notice">
            Paste <code>CONSOLE_SECRET</code> in the Atlas panel first — a query spends Graph quota,
            so the route is locked for the same reason Generate is.
          </p>
        )}
        {error && <p className="bad-line mono">{error}</p>}

        {busy && <p className="op-note">Querying the gateway — one document, one deployment, unpinned.</p>}

        {!data && !busy && !error && (
          <p className="op-note">
            Nothing read yet. This runs <code>balance-sheet</code> against{' '}
            <code>aave-v3-ethereum</code> through <code>graph/client.ts</code> and shows the response
            with the evidence record built for it. ⚠️ Nothing is written and no chain is touched.
          </p>
        )}

        {data && (
          <>
            <div className="source-meta">
              <span className="badge">{data.subgraph}</span>
              <span className="badge">{data.network}</span>
              <span className={`badge ${data.hasIndexingErrors ? 'warn' : 'good'}`}>
                {data.hasIndexingErrors ? 'indexing errors' : 'no indexing errors'}
              </span>
              <span className="badge">{data.evidence.rowCount} row</span>
            </div>

            {/* ⚠️ `protocols.ts` records this deployment's revenue as poisoned — one day in Jul 2024
                booked $1.63e15 and the cumulative never recovered — while its balances and flows are
                clean across 1,300+ days. The three revenue columns come back in the response, so the
                panel says which they are rather than quietly dropping them. */}
            {data.revenueAvailability === 'poisoned' && (
              <p className="notice">
                ⚠️ <strong>Revenue on this deployment is poisoned</strong> and the three{' '}
                <code>cumulative…RevenueUSD</code> rows below are known-wrong. Balances and flows are
                clean. This is recorded in <code>config/protocols.ts</code>, not inferred here.
              </p>
            )}

            <div className="table-scroll">
              <table className="financial-table">
                <thead><tr><th>Field</th><th>Value</th></tr></thead>
                <tbody>
                  {Object.entries(data.row ?? {}).map(([k, v]) => (
                    <tr key={k}>
                      <td className={/Revenue/.test(k) ? 'mono miss' : 'mono'}>{k}</td>
                      <td className="mono">{v === null ? '—' : trim(v)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="op-note dim">
              Document hash <code>{data.evidence.documentHash}</code> · response hash{' '}
              <code>{data.evidence.responseHash.slice(0, 16)}…</code> · evidence tier{' '}
              <code>record</code> — ⚠️ not <code>record+raw</code>: a console panel is not
              settlement-backing, so no payload is retained.
            </p>
          </>
        )}
      </div>
    </>
  );
}

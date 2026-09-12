// /console — ⚠️ **PASS ONE: A VERBATIM TRANSCRIPTION OF `front-end-design/console.html`.**
//
// ⚠️ **NOTHING HERE IS WIRED AND NOTHING HERE IS REAL.** Every string is the reference's own —
// "Lending protocols / Q2 2026", "Atlas Research", `DEMO-lending-eth`, `DEMO-deploy-01`,
// `24,800,000`, "RUN 042", the five-figure figures, all of it. **No real data, no handlers, no
// marked affordances, no operator panels.** This file exists so that the drift between the design
// and the build is a diff rather than an argument.
//
// ⚠️ **The previous version of this page kept Phase 3's console and inserted the reference layout
// into the middle of it** — a warning banner, an eyebrow, a heading, a description, a
// `CONSOLE_SECRET` section and an explanation paragraph above the workspace, then operator panels
// below. **The reference has none of those. It is a two-panel workspace, a footer of links, and the
// tokenize section. That is the entire page.** None of the old page survives into this pass; pass
// two decides what comes back and, crucially, *where inside this layout it goes*.
//
// ⚠️ **`console.html` already contains the tokenize section** — `tokenization.html` is the same
// markup exported again as its own file, not a separate screen. So it is transcribed here, below
// the workspace, and the footer's "Tokenize" link is the anchor to it.
//
// ⚠️ **The hrefs are the reference's own** (`console.html`, `reports.html`, `markets.html`). They do
// not resolve. Rewriting them is a wiring decision and belongs to pass two — keeping them verbatim
// is what makes this pass checkable against the file it came from.
//
// ⚠️ The mechanical conversions, and they are the only edits: `class` → `className`, `for` →
// `htmlFor`, `tabindex` → `tabIndex`, SVG's hyphenated attributes to camelCase, `value` on a form
// control to `defaultValue`, and `style="…"` to an object.

import { SiteHeader } from '../ui/chrome.js';
import { AtlasPanel } from './atlas.js';
import { ConsoleViewer } from './viewer.js';
import { GraphProvider, SecretProvider } from './graph.js';
import './console.css';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Console — Alpha Markets',
  description: 'The agent workspace.',
};

export default function ConsolePage() {
  return (
    <>
      {/* ⚠️ The transcribed header is replaced by the shared component so the site has ONE
          header. Same markup, same classes — `app/ui/chrome.tsx` now carries the
          reference's own mark and its three nav items. */}
      <SiteHeader current="/console" />
      {/* ⚠️ Two context providers. **Neither renders a DOM element**, which is what lets them wrap
          the transcribed markup without changing the class-token sequence the console was checked
          at. The secret is typed once in the Atlas panel and used by both fetches; the query result
          is read by the Source data tab and the Query Evidence block, which are not siblings. */}
      <SecretProvider><GraphProvider>
      <main className="console-page">
        <div className="workspace ">
          <section className="viewer">
            <div dir="ltr" data-orientation="horizontal" data-slot="tabs" className="group/tabs flex gap-2 data-[orientation=horizontal]:flex-col">
              {/* ⚠️ The toolbar and both tabpanels move into a CLIENT component so the Source
                  data tab can be pressed. **Its markup is the reference's, lifted byte for byte** —
                  see `viewer.tsx`. The report document is handed in as children so it never crosses
                  into a client bundle. */}
              <ConsoleViewer>
                    <div className="paper-scale">
                      <article className="report-paper">
                        <header className="paper-masthead">
                          <span className="brand">
                            <svg viewBox="0 0 100 100" aria-hidden="true">
                              <path d="M5 92 46 6 56 27 24 92ZM60 34 94 92 76 92 52 50Z" fill="currentColor">
                              </path>
                              <circle cx="50" cy="74" r="7" fill="currentColor">
                              </circle>
                            </svg>
                            <span>
                              ALPHA MARKETS
                            </span>
                          </span>
                          <span>
                            RESEARCH REPORT
                          </span>
                        </header>
                        <div className="paper-title">
                          <span className="eyebrow">
                            Lending / Q2 2026
                          </span>
                          <h1>
                            Lending protocols
                          </h1>
                          <p>
                            Comparative financial review
                          </p>
                          <span className="paper-byline">
                            PREPARED BY ATLAS RESEARCH · DEMO DATA
                          </span>
                        </div>
                        <h2>
                          1. Executive summary
                        </h2>
                        <p className="">
                          Lending remains a core pillar of onchain finance, with sustained activity in total loans and improving capital efficiency across leading protocols. This report compares Aave, Morpho, Compound and Spark using a common financial snapshot, and assesses their position ahead of 2027.
                        </p>
                        <div data-slot="table-container" className="relative w-full overflow-x-auto">
                          <table data-slot="table" className="w-full caption-bottom text-sm financial-table">
                            <thead data-slot="table-header" className="[&amp;_tr]:border-b">
                              <tr data-slot="table-row" className="border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted">
                                <th data-slot="table-head" className="h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&amp;:has([role=checkbox])]:pr-0 [&amp;&gt;[role=checkbox]]:translate-y-[2px]">
                                  Protocol
                                </th>
                                <th data-slot="table-head" className="h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&amp;:has([role=checkbox])]:pr-0 [&amp;&gt;[role=checkbox]]:translate-y-[2px]">
                                  Total loans (USDC)
                                </th>
                                <th data-slot="table-head" className="h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&amp;:has([role=checkbox])]:pr-0 [&amp;&gt;[role=checkbox]]:translate-y-[2px]">
                                  Revenue (USDC)
                                </th>
                                <th data-slot="table-head" className="h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&amp;:has([role=checkbox])]:pr-0 [&amp;&gt;[role=checkbox]]:translate-y-[2px]">
                                  Borrowers
                                </th>
                              </tr>
                            </thead>
                            <tbody data-slot="table-body" className="[&amp;_tr:last-child]:border-0">
                              <tr data-slot="table-row" className="border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted">
                                <td data-slot="table-cell" className="p-2 align-middle whitespace-nowrap [&amp;:has([role=checkbox])]:pr-0 [&amp;&gt;[role=checkbox]]:translate-y-[2px]">
                                  Aave
                                </td>
                                <td data-slot="table-cell" className="p-2 align-middle whitespace-nowrap [&amp;:has([role=checkbox])]:pr-0 [&amp;&gt;[role=checkbox]]:translate-y-[2px]">
                                  12.4B
                                </td>
                                <td data-slot="table-cell" className="p-2 align-middle whitespace-nowrap [&amp;:has([role=checkbox])]:pr-0 [&amp;&gt;[role=checkbox]]:translate-y-[2px]">
                                  18.2M
                                </td>
                                <td data-slot="table-cell" className="p-2 align-middle whitespace-nowrap [&amp;:has([role=checkbox])]:pr-0 [&amp;&gt;[role=checkbox]]:translate-y-[2px]">
                                  318,000
                                </td>
                              </tr>
                              <tr data-slot="table-row" className="border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted">
                                <td data-slot="table-cell" className="p-2 align-middle whitespace-nowrap [&amp;:has([role=checkbox])]:pr-0 [&amp;&gt;[role=checkbox]]:translate-y-[2px]">
                                  Morpho
                                </td>
                                <td data-slot="table-cell" className="p-2 align-middle whitespace-nowrap [&amp;:has([role=checkbox])]:pr-0 [&amp;&gt;[role=checkbox]]:translate-y-[2px]">
                                  5.8B
                                </td>
                                <td data-slot="table-cell" className="p-2 align-middle whitespace-nowrap [&amp;:has([role=checkbox])]:pr-0 [&amp;&gt;[role=checkbox]]:translate-y-[2px]">
                                  7.6M
                                </td>
                                <td data-slot="table-cell" className="p-2 align-middle whitespace-nowrap [&amp;:has([role=checkbox])]:pr-0 [&amp;&gt;[role=checkbox]]:translate-y-[2px]">
                                  142,000
                                </td>
                              </tr>
                              <tr data-slot="table-row" className="border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted">
                                <td data-slot="table-cell" className="p-2 align-middle whitespace-nowrap [&amp;:has([role=checkbox])]:pr-0 [&amp;&gt;[role=checkbox]]:translate-y-[2px]">
                                  Compound
                                </td>
                                <td data-slot="table-cell" className="p-2 align-middle whitespace-nowrap [&amp;:has([role=checkbox])]:pr-0 [&amp;&gt;[role=checkbox]]:translate-y-[2px]">
                                  4.1B
                                </td>
                                <td data-slot="table-cell" className="p-2 align-middle whitespace-nowrap [&amp;:has([role=checkbox])]:pr-0 [&amp;&gt;[role=checkbox]]:translate-y-[2px]">
                                  4.9M
                                </td>
                                <td data-slot="table-cell" className="p-2 align-middle whitespace-nowrap [&amp;:has([role=checkbox])]:pr-0 [&amp;&gt;[role=checkbox]]:translate-y-[2px]">
                                  111,000
                                </td>
                              </tr>
                              <tr data-slot="table-row" className="border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted">
                                <td data-slot="table-cell" className="p-2 align-middle whitespace-nowrap [&amp;:has([role=checkbox])]:pr-0 [&amp;&gt;[role=checkbox]]:translate-y-[2px]">
                                  Spark
                                </td>
                                <td data-slot="table-cell" className="p-2 align-middle whitespace-nowrap [&amp;:has([role=checkbox])]:pr-0 [&amp;&gt;[role=checkbox]]:translate-y-[2px]">
                                  3.6B
                                </td>
                                <td data-slot="table-cell" className="p-2 align-middle whitespace-nowrap [&amp;:has([role=checkbox])]:pr-0 [&amp;&gt;[role=checkbox]]:translate-y-[2px]">
                                  4.2M
                                </td>
                                <td data-slot="table-cell" className="p-2 align-middle whitespace-nowrap [&amp;:has([role=checkbox])]:pr-0 [&amp;&gt;[role=checkbox]]:translate-y-[2px]">
                                  96,000
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                        <h2>
                          2. Revenue quality
                        </h2>
                        <p className="">
                          Revenue quality remains a key differentiator across protocols. Aave’s revenue is more diversified, while Morpho shows growth momentum despite a smaller base. Compound is more sensitive to incentive emissions, and Spark benefits from integration with the Sky ecosystem.
                        </p>
                        <h2>
                          3. Outlook
                        </h2>
                        <p>
                          Competition in lending is likely to depend on risk management, capital efficiency and the ability to attract sustainable activity. Outstanding loans and recurring revenue should be evaluated together.
                        </p>
                        <footer className="paper-footer">
                          <span>
                            Atlas Research · Illustrative financials
                          </span>
                          <span>
                            01 / 04
                          </span>
                        </footer>
                      </article>
                    </div>
                <div className="edit-toolbar">
                  <button>
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-pencil" aria-hidden="true">
                      <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z">
                      </path>
                      <path d="m15 5 4 4">
                      </path>
                    </svg>
                    Edit paragraph
                  </button>
                  <span>
                  </span>
                  <button>
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-message-square" aria-hidden="true">
                      <path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z">
                      </path>
                    </svg>
                    Add note
                  </button>
                  </div>
              </ConsoleViewer>
            </div>
          </section>
          <aside className="atlas-console">
                <div className="atlas-inner">
                  <div className="atlas-top">
                    <span>
                      ATLAS
                      <small>
                        / RUN 042
                      </small>
                    </span>
                    <div dir="ltr" data-orientation="horizontal" data-slot="tabs" className="group/tabs flex gap-2 data-[orientation=horizontal]:flex-col">
                      <div role="tablist" aria-orientation="horizontal" data-slot="tabs-list" data-variant="default" className="group/tabs-list inline-flex w-fit items-center justify-center rounded-lg p-[3px] text-muted-foreground group-data-[orientation=horizontal]/tabs:h-9 group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col data-[variant=line]:rounded-none bg-muted" tabIndex={-1} data-orientation="horizontal" style={{"outline": "none"}}>
                        <button type="button" role="tab" aria-selected="true" aria-controls="radix-_R_4cm_-content-agent" data-state="active" id="radix-_R_4cm_-trigger-agent" data-slot="tabs-trigger" className="relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 group-data-[variant=default]/tabs-list:data-[state=active]:shadow-sm group-data-[variant=line]/tabs-list:data-[state=active]:shadow-none dark:text-muted-foreground dark:hover:text-foreground [&amp;_svg]:pointer-events-none [&amp;_svg]:shrink-0 [&amp;_svg:not([class*=&#x27;size-&#x27;])]:size-4 group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent dark:group-data-[variant=line]/tabs-list:data-[state=active]:border-transparent dark:group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent data-[state=active]:bg-background data-[state=active]:text-foreground dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 dark:data-[state=active]:text-foreground after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-[orientation=horizontal]/tabs:after:inset-x-0 group-data-[orientation=horizontal]/tabs:after:bottom-[-5px] group-data-[orientation=horizontal]/tabs:after:h-0.5 group-data-[orientation=vertical]/tabs:after:inset-y-0 group-data-[orientation=vertical]/tabs:after:-right-1 group-data-[orientation=vertical]/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-[state=active]:after:opacity-100" tabIndex={-1} data-orientation="horizontal" data-radix-collection-item="">
                          Agent view
                        </button>
                        <button type="button" role="tab" aria-selected="false" aria-controls="radix-_R_4cm_-content-terminal" data-state="inactive" id="radix-_R_4cm_-trigger-terminal" data-slot="tabs-trigger" className="relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 group-data-[variant=default]/tabs-list:data-[state=active]:shadow-sm group-data-[variant=line]/tabs-list:data-[state=active]:shadow-none dark:text-muted-foreground dark:hover:text-foreground [&amp;_svg]:pointer-events-none [&amp;_svg]:shrink-0 [&amp;_svg:not([class*=&#x27;size-&#x27;])]:size-4 group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent dark:group-data-[variant=line]/tabs-list:data-[state=active]:border-transparent dark:group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent data-[state=active]:bg-background data-[state=active]:text-foreground dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 dark:data-[state=active]:text-foreground after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-[orientation=horizontal]/tabs:after:inset-x-0 group-data-[orientation=horizontal]/tabs:after:bottom-[-5px] group-data-[orientation=horizontal]/tabs:after:h-0.5 group-data-[orientation=vertical]/tabs:after:inset-y-0 group-data-[orientation=vertical]/tabs:after:-right-1 group-data-[orientation=vertical]/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-[state=active]:after:opacity-100" tabIndex={-1} data-orientation="horizontal" data-radix-collection-item="">
                          Terminal
                        </button>
                      </div>
                    </div>
                  </div>
                  {/* ⚠️ **The reference's four slots, wired — and nothing added beside them.**
                      `.agent-visual` · `.agent-status` · `.query-evidence` · `.atlas-composer`,
                      in the reference's order. `CONSOLE_SECRET` sits inside, above the composer,
                      because it gates the composer. See `atlas.tsx`. */}
                  <AtlasPanel />
                </div>
          </aside>
        </div>
        <div className="workspace-footer">
          <span>
            Select report text to edit or add a note.
          </span>
          <nav className="workspace-links" aria-label="Explore Alpha Markets">
            <a href="reports.html">
              Report marketplace
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-arrow-up-right" aria-hidden="true">
                <path d="M7 7h10v10">
                </path>
                <path d="M7 17 17 7">
                </path>
              </svg>
            </a>
            <a href="markets.html">
              All predictions
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-arrow-up-right" aria-hidden="true">
                <path d="M7 7h10v10">
                </path>
                <path d="M7 17 17 7">
                </path>
              </svg>
            </a>
            <a href="#tokenize">
              Tokenize
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-arrow-down" aria-hidden="true">
                <path d="M12 5v14">
                </path>
                <path d="m19 12-7 7-7-7">
                </path>
              </svg>
            </a>
          </nav>
        </div>
        <section id="tokenize" className="tokenize-section">
          <div className="tokenize-heading">
            <span className="eyebrow">
              FROM RESEARCH TO CONVICTION
            </span>
            <h1>
              Tokenize your report.
            </h1>
            <p>
              Set the terms. Publish your research. Let the market read it.
            </p>
          </div>
          <div className="tokenize-grid">
            <div>
              <div className="publish-steps">
                <div className="complete">
                  <b>
                    01
                  </b>
                  <span>
                    <strong>
                      Report
                    </strong>
                    <small>
                      Choose your research
                    </small>
                  </span>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-arrow-right" aria-hidden="true">
                    <path d="M5 12h14">
                    </path>
                    <path d="m12 5 7 7-7 7">
                    </path>
                  </svg>
                </div>
                <div className="">
                  <b>
                    02
                  </b>
                  <span>
                    <strong>
                      Listing
                    </strong>
                    <small>
                      Set access &amp; details
                    </small>
                  </span>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-arrow-right" aria-hidden="true">
                    <path d="M5 12h14">
                    </path>
                    <path d="m12 5 7 7-7 7">
                    </path>
                  </svg>
                </div>
                <div className="">
                  <b>
                    03
                  </b>
                  <span>
                    <strong>
                      Publish
                    </strong>
                    <small>
                      Make it available
                    </small>
                  </span>
                </div>
              </div>
              <div className="tokenize-form panel">
                <div dir="ltr" data-orientation="horizontal" data-slot="tabs" className="group/tabs flex gap-2 data-[orientation=horizontal]:flex-col">
                  <label className="field-label">
                    Source
                  </label>
                  <div role="tablist" aria-orientation="horizontal" data-slot="tabs-list" data-variant="default" className="group/tabs-list inline-flex w-fit items-center justify-center rounded-lg p-[3px] text-muted-foreground group-data-[orientation=horizontal]/tabs:h-9 group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col data-[variant=line]:rounded-none bg-muted source-options" tabIndex={-1} data-orientation="horizontal" style={{"outline": "none"}}>
                    <button type="button" role="tab" aria-selected="true" aria-controls="radix-_R_clm_-content-generated" data-state="active" id="radix-_R_clm_-trigger-generated" data-slot="tabs-trigger" className="relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 group-data-[variant=default]/tabs-list:data-[state=active]:shadow-sm group-data-[variant=line]/tabs-list:data-[state=active]:shadow-none dark:text-muted-foreground dark:hover:text-foreground [&amp;_svg]:pointer-events-none [&amp;_svg]:shrink-0 [&amp;_svg:not([class*=&#x27;size-&#x27;])]:size-4 group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent dark:group-data-[variant=line]/tabs-list:data-[state=active]:border-transparent dark:group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent data-[state=active]:bg-background data-[state=active]:text-foreground dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 dark:data-[state=active]:text-foreground after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-[orientation=horizontal]/tabs:after:inset-x-0 group-data-[orientation=horizontal]/tabs:after:bottom-[-5px] group-data-[orientation=horizontal]/tabs:after:h-0.5 group-data-[orientation=vertical]/tabs:after:inset-y-0 group-data-[orientation=vertical]/tabs:after:-right-1 group-data-[orientation=vertical]/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-[state=active]:after:opacity-100" tabIndex={-1} data-orientation="horizontal" data-radix-collection-item="">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-file-text" aria-hidden="true">
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
                      Use generated report
                    </button>
                    <button type="button" role="tab" aria-selected="false" aria-controls="radix-_R_clm_-content-upload" data-state="inactive" id="radix-_R_clm_-trigger-upload" data-slot="tabs-trigger" className="relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 group-data-[variant=default]/tabs-list:data-[state=active]:shadow-sm group-data-[variant=line]/tabs-list:data-[state=active]:shadow-none dark:text-muted-foreground dark:hover:text-foreground [&amp;_svg]:pointer-events-none [&amp;_svg]:shrink-0 [&amp;_svg:not([class*=&#x27;size-&#x27;])]:size-4 group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent dark:group-data-[variant=line]/tabs-list:data-[state=active]:border-transparent dark:group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent data-[state=active]:bg-background data-[state=active]:text-foreground dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 dark:data-[state=active]:text-foreground after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-[orientation=horizontal]/tabs:after:inset-x-0 group-data-[orientation=horizontal]/tabs:after:bottom-[-5px] group-data-[orientation=horizontal]/tabs:after:h-0.5 group-data-[orientation=vertical]/tabs:after:inset-y-0 group-data-[orientation=vertical]/tabs:after:-right-1 group-data-[orientation=vertical]/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-[state=active]:after:opacity-100" tabIndex={-1} data-orientation="horizontal" data-radix-collection-item="">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-upload" aria-hidden="true">
                        <path d="M12 3v12">
                        </path>
                        <path d="m17 8-5-5-5 5">
                        </path>
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4">
                        </path>
                      </svg>
                      Upload your report
                    </button>
                  </div>
                  <div data-state="active" data-orientation="horizontal" role="tabpanel" aria-labelledby="radix-_R_clm_-trigger-generated" id="radix-_R_clm_-content-generated" tabIndex={0} data-slot="tabs-content" className="flex-1 outline-none" style={{"animationDuration": "0s"}}>
                    <div className="file-row">
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-file-text" aria-hidden="true">
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
                      <span>
                        Lending protocols / Q2 2026
                        <small>
                          Generated document · 4 pages
                        </small>
                      </span>
                      <button className="btn outline">
                        Preview
                      </button>
                    </div>
                  </div>
                  <div data-state="inactive" data-orientation="horizontal" role="tabpanel" aria-labelledby="radix-_R_clm_-trigger-upload" hidden={true} id="radix-_R_clm_-content-upload" tabIndex={0} data-slot="tabs-content" className="flex-1 outline-none">
                  </div>
                </div>
                <div className="form-grid">
                  <div>
                    <label htmlFor="report-title">
                      Report title
                    </label>
                    <input id="report-title" className="field" maxLength={100} defaultValue="Lending protocols / Q2 2026" />
                  </div>
                  <div>
                    <label htmlFor="category">
                      Category
                    </label>
                    <button type="button" role="combobox" aria-expanded="false" aria-autocomplete="none" dir="ltr" data-state="closed" data-slot="select-trigger" data-size="default" className="flex w-fit items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[placeholder]:text-muted-foreground data-[size=default]:h-9 data-[size=sm]:h-8 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:ring-destructive/40 [&amp;_svg]:pointer-events-none [&amp;_svg]:shrink-0 [&amp;_svg:not([class*=&#x27;size-&#x27;])]:size-4 [&amp;_svg:not([class*=&#x27;text-&#x27;])]:text-muted-foreground choice" id="category" aria-label="Report category">
                      <span data-slot="select-value" style={{"pointerEvents": "none"}}>
                      </span>
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-chevron-down size-4 opacity-50" aria-hidden="true">
                        <path d="m6 9 6 6 6-6">
                        </path>
                      </svg>
                    </button>
                    <select aria-hidden="true" tabIndex={-1} style={{"position": "absolute", "border": "0", "width": "1px", "height": "1px", "padding": "0", "margin": "-1px", "overflow": "hidden", "clip": "rect(0, 0, 0, 0)", "whiteSpace": "nowrap", "wordWrap": "normal"}}>
                    </select>
                  </div>
                  <div className="description-field">
                    <label htmlFor="description">
                      Description
                    </label>
                    <textarea id="description" className="field" maxLength={500}>
                      Comparative financial analysis of leading lending protocols.
                    </textarea>
                  </div>
                  <div>
                    <label htmlFor="access-price">
                      Access price
                    </label>
                    <div className="amount-field">
                      <input id="access-price" type="number" min="0.01" step="0.01" defaultValue="5" />
                      <span>
                        USDC
                      </span>
                    </div>
                    <label className="second-label" htmlFor="related-market">
                      Related market
                    </label>
                    <button type="button" role="combobox" aria-expanded="false" aria-autocomplete="none" dir="ltr" data-state="closed" data-slot="select-trigger" data-size="default" className="flex w-fit items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[placeholder]:text-muted-foreground data-[size=default]:h-9 data-[size=sm]:h-8 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:ring-destructive/40 [&amp;_svg]:pointer-events-none [&amp;_svg]:shrink-0 [&amp;_svg:not([class*=&#x27;size-&#x27;])]:size-4 [&amp;_svg:not([class*=&#x27;text-&#x27;])]:text-muted-foreground choice" id="related-market" aria-label="Related prediction market">
                      <span data-slot="select-value" style={{"pointerEvents": "none"}}>
                      </span>
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-chevron-down size-4 opacity-50" aria-hidden="true">
                        <path d="m6 9 6 6 6-6">
                        </path>
                      </svg>
                    </button>
                    <select aria-hidden="true" tabIndex={-1} style={{"position": "absolute", "border": "0", "width": "1px", "height": "1px", "padding": "0", "margin": "-1px", "overflow": "hidden", "clip": "rect(0, 0, 0, 0)", "whiteSpace": "nowrap", "wordWrap": "normal"}}>
                    </select>
                  </div>
                </div>
                <details className="integration-detail">
                  <summary>
                    <span>
                      HEDERA / TOKENIZATION RECEIPT
                    </span>
                    <span className="badge">
                      Awaiting publication
                    </span>
                  </summary>
                  <div className="receipt-grid">
                    <div>
                      <small>
                        Token ID
                      </small>
                      <code>
                        Created after publishing
                      </code>
                    </div>
                    <div>
                      <small>
                        Creation transaction
                      </small>
                      <code>
                        Not submitted
                      </code>
                    </div>
                  </div>
                </details>
                <details className="integration-detail">
                  <summary>
                    <span>
                      x402 / PAID ACCESS
                    </span>
                    <span>
                      5 USDC per unlock
                    </span>
                  </summary>
                  <p>
                    Readers use demo USDC to unlock this listing. Payment receipts show the access price and simulated settlement. No live x402 payment is sent.
                  </p>
                </details>
              </div>
            </div>
            <aside className="listing-preview dark-panel">
              <div className="section-title">
                <h2>
                  Marketplace preview
                </h2>
                <span className="badge">
                  Not listed
                </span>
              </div>
              <div className="mini-document">
                <div className="mini-heading">
                  <h3>
                    Lending protocols / Q2 2026
                  </h3>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-lock" aria-hidden="true">
                    <rect width="18" height="11" x="3" y="11" rx="2" ry="2">
                    </rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4">
                    </path>
                  </svg>
                </div>
                <p>
                  Comparative financial analysis of leading lending protocols.
                </p>
                <div className="mini-body blurred" aria-hidden="true">
                  <div className="mini-copy">
                    <span style={{"width": "95%"}}>
                    </span>
                    <span style={{"width": "88%"}}>
                    </span>
                    <span style={{"width": "81%"}}>
                    </span>
                    <span style={{"width": "74%"}}>
                    </span>
                    <span style={{"width": "89%"}}>
                    </span>
                  </div>
                  <div className="mini-chart">
                    <svg viewBox="0 0 140 65">
                      <rect x="0" y="43" width="15" height="22" fill="#949ba1">
                      </rect>
                      <rect x="23" y="30" width="15" height="35" fill="#949ba1">
                      </rect>
                      <rect x="46" y="36" width="15" height="29" fill="#949ba1">
                      </rect>
                      <rect x="69" y="18" width="15" height="47" fill="#949ba1">
                      </rect>
                      <rect x="92" y="9" width="15" height="56" fill="#949ba1">
                      </rect>
                      <rect x="115" y="4" width="15" height="61" fill="#949ba1">
                      </rect>
                    </svg>
                  </div>
                </div>
              </div>
              <h3>
                Lending protocols / Q2 2026
              </h3>
              <p>
                By Atlas Research
              </p>
              <strong className="listing-price">
                5
                <small>
                  USDC
                </small>
              </strong>
              <div className="related-preview">
                <span>
                  Related prediction market
                </span>
                <a href="prediction-lending-2027.html">
                  Who leads lending by end-2027?
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-arrow-right" aria-hidden="true">
                    <path d="M5 12h14">
                    </path>
                    <path d="m12 5 7 7-7 7">
                    </path>
                  </svg>
                </a>
              </div>
              <button className="btn white full">
                Connect wallet to tokenize
              </button>
              <button className="btn dark-outline full">
                Save draft
              </button>
              <div className="token-flow">
                <span>
                  Hedera
                  <br />
                  <b>
                    Tokenize
                  </b>
                </span>
                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-arrow-right" aria-hidden="true">
                  <path d="M5 12h14">
                  </path>
                  <path d="m12 5 7 7-7 7">
                  </path>
                </svg>
                <span>
                  Marketplace
                  <br />
                  <b>
                    List report
                  </b>
                </span>
                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-arrow-right" aria-hidden="true">
                  <path d="M5 12h14">
                  </path>
                  <path d="m12 5 7 7-7 7">
                  </path>
                </svg>
                <span>
                  x402
                  <br />
                  <b>
                    Unlock
                  </b>
                </span>
              </div>
              <p className="notice">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-info" aria-hidden="true">
                  <circle cx="12" cy="12" r="10">
                  </circle>
                  <path d="M12 16v-4">
                  </path>
                  <path d="M12 8h.01">
                  </path>
                </svg>
                Demo publication is local to this browser. Uploaded PDFs are available only for this session.
              </p>
            </aside>
          </div>
        </section>
      </main>
      </GraphProvider></SecretProvider>
      {/* ⚠️ The transcribed footer is dropped: `app/layout.tsx` renders one for every route,
          and keeping both gave this page two. */}
      
    </>
  );
}

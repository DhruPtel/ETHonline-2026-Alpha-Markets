import {AtlasPanel, type AtlasData} from '../components/AtlasPanel.js';
import {ConsoleViewer} from '../components/ConsoleViewer.js';
import {TokenizeForm, type Listing} from '../components/TokenizeForm.js';
import {MiniDocument, type PreviewChart} from '../components/MiniDocument.js';
import {ArrowDown, ArrowRight, ArrowUpRight, Info} from '../components/Icons.js';
import {SecretProvider} from '../components/ConsoleSecret.js';
import {list, load} from '../../src/store/reports.js';
import {render} from '../../src/agent/narrate.js';

/**
 * The operator console: the workspace (report viewer and Atlas panel) with the
 * tokenize section below it, as in the design — tokenize is a section of this
 * page, not a route of its own.
 *
 * A server component. The three interactive panels are client components.
 */

// ---------------------------------------------------------------------------
// Demo content. Swap this const for the database query; the markup below reads
// from it and from nothing else.
// ---------------------------------------------------------------------------
type Workspace = {
  atlas: AtlasData;
  listing: Listing;
  listingPreview: {title: string; subtitle: string; preview: PreviewChart; marketId: string};
  steps: {number: string; title: string; hint: string; complete: boolean}[];
};

const WORKSPACE: Workspace = {
  atlas: {
    run: 'RUN 042',
    idleMessage: 'Ready for your next question.',
    promptLimit: 1000,
    status: [
      {label: 'The Graph', value: 'Data retrieved'},
      {label: 'Checks', value: 'Passed'},
      {label: 'Report', value: 'Page 1'},
    ],
    evidence: [
      {label: 'Subgraph', value: 'DEMO-lending-eth'},
      {label: 'Deployment', value: 'DEMO-deploy-01'},
      {label: 'Block', value: '24,800,000'},
      {label: 'Records', value: '120'},
      {label: 'Retrieved', value: '14:02:08 UTC'},
    ],
    terminal: [
      {stamp: '14:02:08', text: 'Snapshot loaded · 120 records'},
      {stamp: '14:02:08', text: 'Reconciliation checks passed'},
      {stamp: '14:02:08', text: 'Report ready for review'},
    ],
  },
  listing: {
    title: 'Lending protocols / Q2 2026',
    category: 'Lending',
    description: 'Comparative financial analysis of leading lending protocols.',
    price: 5,
    currency: 'USDC',
    fileName: 'lending-protocols-q2-2026.pdf',
    filePages: 4,
    marketClaim: 'Aave leads lending by end-2027',
    tokenIdState: 'Created after publishing',
    transactionState: 'Not submitted',
    publishState: 'Awaiting publication',
  },
  listingPreview: {
    title: 'Lending protocols / Q2 2026',
    subtitle: 'Comparative financial analysis of leading lending protocols.',
    preview: 'bars',
    marketId: 'lending-2027',
  },
  steps: [
    {number: '01', title: 'Report', hint: 'Choose your research', complete: true},
    {number: '02', title: 'Listing', hint: 'Set access & details', complete: false},
    {number: '03', title: 'Publish', hint: 'Make it available', complete: false},
  ],
};

// ── ⚠️ THE REPORT THE PANEL SHOWS ────────────────────────────────────────────────────────────────
//
// **The most recently saved report in the store, rendered by `narrate.ts`'s `render()`.**
//
// ⚠️ **PHASE-6 D4 IS WRONG AS WRITTEN AND THIS REPLACES IT.** D4 said this panel should build
// `PaperBlock[]` from the fact table "with no parser", to avoid a second renderer. **Building blocks
// WAS the second renderer, and it was the wrong one.** It printed `{fact:…}` placeholders raw —
// substitution is `render()`'s entire job, because the model may never type a digit — and it dumped
// all 140 facts instead of the ten the narrator chose, which is how a two-page report became 52.
//
// ⚠️ **`app/markdown.tsx` was purpose-built for exactly this output.** Its own header: *"Not a
// markdown parser, and should not become one. It reads the output of ONE known generator —
// `narrate.ts`'s `render()` — which emits exactly four things: one `#` heading, one GFM pipe table,
// plain paragraphs, and `**bold**` inside cells."* So `render()` → `Markdown` is **one** renderer for
// one producer, shared with the bought body on `/report/[hash]`. There is no parser and no second
// answer to what a figure looks like: `show()` inside `render()` is the only one.
//
// ⚠️ **A run does not push its report here by itself.** The stream is client-side and this read is
// server-side, so a new report appears on the next request — reload.

export type DocMeta = {
  hash: string;
  directive: string;
  factCount: number;
  checksRun: number;
  checksTotal: number;
  /** For the sheet's eyebrow — what was read and at which block. */
  deployments: string;
  block: number;
  analyst: string;
};

async function latestDoc(): Promise<{markdown: string; meta: DocMeta} | null> {
  const listed = await list(1);
  if (listed.length === 0) return null;
  const hash = listed[0].hash;
  const report = await load(hash);
  if (!report) return null;

  return {
    // ⚠️ The hash is passed, so the rendered document carries its own identity — the 32 bytes an ATS
    // token commits and an Arc market settles against.
    markdown: render(report, hash),
    meta: {
      hash,
      directive: report.subject.directive,
      factCount: Object.keys(report.facts).length,
      checksRun: report.checks.filter((c) => c.outcome !== 'not_checked').length,
      checksTotal: report.checks.length,
      deployments: report.subject.deployments.join(' · ') || 'no deployments',
      block: report.block,
      analyst: report.analyst,
    },
  };
}

export default async function Console() {
  const {atlas, listing, listingPreview, steps} = WORKSPACE;
  // ⚠️ The mockup's paper, fileName and pages are gone from the render — the panel shows the real
  // latest report, or an empty state when the store has none.
  const doc = await latestDoc();

  return (
    <main className="console-page">
      {/* ⚠️ The doorlock's value is typed in the dark Atlas panel and used by the light viewer's
          Source data tab. They are not siblings, so it lives in a context whose provider
          **renders no DOM element at all** — see `ConsoleSecret.tsx`. */}
      <SecretProvider>
        <div className="workspace">
          <ConsoleViewer doc={doc} />
          <AtlasPanel atlas={atlas} />
        </div>
      </SecretProvider>

      <div className="workspace-footer">
        <span>Select report text to edit or add a note.</span>
        <nav className="workspace-links" aria-label="Explore Alpha Markets">
          <a href="/">
            Report marketplace <ArrowUpRight size={14} />
          </a>
          <a href="/markets">
            All predictions <ArrowUpRight size={14} />
          </a>
          <a href="#tokenize">
            Tokenize <ArrowDown size={14} />
          </a>
        </nav>
      </div>

      <section id="tokenize" className="tokenize-section">
        <div className="tokenize-heading">
          <span className="eyebrow">FROM RESEARCH TO CONVICTION</span>
          <h1>Tokenize your report.</h1>
          <p>Set the terms. Publish your research. Let the market read it.</p>
        </div>

        <div className="tokenize-grid">
          <div>
            <div className="publish-steps">
              {steps.map((step) => (
                <div key={step.number} className={step.complete ? 'complete' : undefined}>
                  <b>{step.number}</b>
                  <span>
                    <strong>{step.title}</strong>
                    <small>{step.hint}</small>
                  </span>
                  <ArrowRight size={16} />
                </div>
              ))}
            </div>

            <TokenizeForm listing={listing} />
          </div>

          <aside className="listing-preview dark-panel">
            <div className="section-title">
              <h2>Marketplace preview</h2>
              <span className="badge">{listing.publishState}</span>
            </div>

            <MiniDocument
              title={listingPreview.title}
              subtitle={listingPreview.subtitle}
              preview={listingPreview.preview}
            />

            <h3>{listing.title}</h3>
            <p>By Atlas Research</p>
            <strong className="listing-price">
              {listing.price} <small>{listing.currency}</small>
            </strong>

            <div className="related-preview">
              <span>Related prediction market</span>
              <a href={`/markets/${listingPreview.marketId}`}>
                {listing.marketClaim}
                <ArrowRight size={16} />
              </a>
            </div>

            <div className="token-flow">
              <span>
                Hedera
                <br />
                <b>Tokenize</b>
              </span>
              <ArrowRight size={15} />
              <span>
                Marketplace
                <br />
                <b>List report</b>
              </span>
              <ArrowRight size={15} />
              <span>
                x402
                <br />
                <b>Unlock</b>
              </span>
            </div>

            <p className="notice">
              <Info size={16} />
              Publication writes the token and the listing together. Uploaded PDFs are held for this session only.
            </p>
          </aside>
        </div>
      </section>
    </main>
  );
}

import {AtlasPanel, type AtlasData} from '../components/AtlasPanel.js';
import {ConsoleViewer, type SourceData} from '../components/ConsoleViewer.js';
import {TokenizeForm, type Listing} from '../components/TokenizeForm.js';
import {MiniDocument, type PreviewChart} from '../components/MiniDocument.js';
import {type Paper} from '../components/ReportPaper.js';
import {ArrowDown, ArrowRight, ArrowUpRight, Info} from '../components/Icons.js';
import {SecretProvider} from '../components/ConsoleSecret.js';

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
  fileName: string;
  pages: number;
  paper: Paper;
  source: SourceData;
  atlas: AtlasData;
  listing: Listing;
  listingPreview: {title: string; subtitle: string; preview: PreviewChart; marketId: string};
  steps: {number: string; title: string; hint: string; complete: boolean}[];
};

const WORKSPACE: Workspace = {
  fileName: 'lending-protocols-q2-2026.pdf',
  pages: 4,
  paper: {
    eyebrow: 'Lending / Q2 2026',
    title: 'Lending protocols',
    standfirst: 'Comparative financial review',
    byline: 'PREPARED BY ATLAS RESEARCH · DEMO DATA',
    footerNote: 'Atlas Research · Illustrative financials',
    pageLabel: '01 / 04',
    blocks: [
      {kind: 'heading', text: '1. Executive summary'},
      {
        kind: 'paragraph',
        text: 'Lending remains a core pillar of onchain finance, with sustained activity in total loans and improving capital efficiency across leading protocols. This report compares Aave, Morpho, Compound and Spark using a common financial snapshot, and assesses their position ahead of 2027.',
      },
      {
        kind: 'table',
        headers: ['Protocol', 'Total loans (USDC)', 'Revenue (USDC)', 'Borrowers'],
        rows: [
          ['Aave', '12.4B', '18.2M', '318,000'],
          ['Morpho', '5.8B', '7.6M', '142,000'],
          ['Compound', '4.1B', '4.9M', '111,000'],
          ['Spark', '3.6B', '4.2M', '96,000'],
        ],
      },
      {kind: 'heading', text: '2. Revenue quality'},
      {
        kind: 'paragraph',
        text: 'Revenue quality remains a key differentiator across protocols. Aave’s revenue is more diversified, while Morpho shows growth momentum despite a smaller base. Compound is more sensitive to incentive emissions, and Spark benefits from integration with the Sky ecosystem.',
      },
      {kind: 'heading', text: '3. Outlook'},
      {
        kind: 'paragraph',
        text: 'Competition in lending is likely to depend on risk management, capital efficiency and the ability to attract sustainable activity. Outstanding loans and recurring revenue should be evaluated together.',
      },
    ],
  },
  source: {
    block: '24,800,000',
    records: '120',
    refreshed: '14:02:08 UTC',
    meta: [
      {label: 'Subgraph', value: 'DEMO-lending-eth'},
      {label: 'Deployment ID', value: 'DEMO-deploy-01'},
      {label: 'Query', value: 'protocolFinancials'},
      {label: 'Network', value: 'Ethereum · Sample snapshot'},
    ],
    headers: ['Protocol', 'Total loans (USDC)', 'Revenue (USDC)', 'Borrowers'],
    rows: [
      ['Aave', '12.4B', '18.2M', '318,000'],
      ['Morpho', '5.8B', '7.6M', '142,000'],
      ['Compound', '4.1B', '4.9M', '111,000'],
      ['Spark', '3.6B', '4.2M', '96,000'],
    ],
    query: `query ReportSnapshot {
  protocolFinancials(
    block: { number: 24800000 }
    first: 120
  ) {
    protocol
    totalLoansUSD
    revenueUSD
    activeBorrowers
  }
}`,
  },
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

export default function Console() {
  const {fileName, pages, paper, source, atlas, listing, listingPreview, steps} = WORKSPACE;

  return (
    <main className="console-page">
      {/* ⚠️ The doorlock's value is typed in the dark Atlas panel and used by the light viewer's
          Source data tab. They are not siblings, so it lives in a context whose provider
          **renders no DOM element at all** — see `ConsoleSecret.tsx`. */}
      <SecretProvider>
        <div className="workspace">
          <ConsoleViewer fileName={fileName} paper={paper} pages={pages} source={source} />
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

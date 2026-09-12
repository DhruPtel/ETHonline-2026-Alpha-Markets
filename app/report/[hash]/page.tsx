import {notFound} from 'next/navigation.js';
import {BuyControl} from '../../components/BuyControl.js';
import {MiniDocument, type PreviewChart} from '../../components/MiniDocument.js';
import {ReportPaper, type Paper} from '../../components/ReportPaper.js';
import {ArrowLeft, ArrowRight, ArrowUpRight, Check, Lock} from '../../components/Icons.js';

/**
 * One report: the public preview, the paywall and the bought body.
 *
 * A server component. `access` on the record decides which of the three states
 * renders — that is the field the database and the x402 receipt will drive.
 * Only the buy control is a client component.
 */

// ---------------------------------------------------------------------------
// Demo content. Swap this const for the database query; the markup below reads
// from it and from nothing else.
// ---------------------------------------------------------------------------
type ReportRecord = {
  hash: string;
  title: string;
  subtitle: string;
  category: string;
  author: string;
  price: number;
  currency: string;
  tokenId: string;
  preview: PreviewChart;
  pages: number;
  /** 'preview' shows the excerpt only, 'paywall' adds the buy control,
   *  'owned' replaces both with the full sheet. */
  access: 'preview' | 'paywall' | 'owned';
  summary: string;
  provenance: {subgraph: string; deployment: string; block: string; records: string; retrieved: string};
  market: {id: string; claim: string; side: 'TRUE' | 'FALSE'};
  paper: Paper;
};

const LENDING_TABLE = {
  headers: ['Protocol', 'Total loans (USDC)', 'Revenue (USDC)', 'Borrowers'],
  rows: [
    ['Aave', '12.4B', '18.2M', '318,000'],
    ['Morpho', '5.8B', '7.6M', '142,000'],
    ['Compound', '4.1B', '4.9M', '111,000'],
    ['Spark', '3.6B', '4.2M', '96,000'],
  ],
};

const REPORTS_BY_HASH: Record<string, ReportRecord> = {
  '9f2c4a7e1b8d3056': {
    hash: '9f2c4a7e1b8d3056',
    title: 'Lending protocols / Q2 2026',
    subtitle: 'Market structure, growth and key risks',
    category: 'Lending',
    author: 'Atlas Research',
    price: 5,
    currency: 'USDC',
    tokenId: 'DEMO-lending-q2',
    preview: 'bars',
    pages: 4,
    access: 'paywall',
    summary:
      'Lending remains a core pillar of onchain finance, with sustained activity in total loans and improving capital efficiency across leading protocols. This report compares Aave, Morpho, Compound and Spark using a common financial snapshot, and assesses their position ahead of 2027.',
    provenance: {
      subgraph: 'DEMO-lending-eth',
      deployment: 'DEMO-deploy-01',
      block: '24,800,000',
      records: '120',
      retrieved: '14:02:08 UTC',
    },
    market: {id: 'lending-2027', claim: 'Aave leads lending by end-2027', side: 'TRUE'},
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
        {kind: 'table', ...LENDING_TABLE},
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
  },

  '3d81e6f09c24ab75': {
    hash: '3d81e6f09c24ab75',
    title: 'Aave / Revenue quality',
    subtitle: 'Assessing sustainability and drivers',
    category: 'Lending',
    author: 'Atlas Research',
    price: 3,
    currency: 'USDC',
    tokenId: 'DEMO-aave-revenue',
    preview: 'table',
    pages: 4,
    access: 'owned',
    summary:
      'Aave’s interest income is evaluated against active loans, utilization and reserve factors. This review separates recurring protocol revenue from incentives and one-off items.',
    provenance: {
      subgraph: 'DEMO-lending-eth',
      deployment: 'DEMO-deploy-01',
      block: '24,800,000',
      records: '86',
      retrieved: '14:06:41 UTC',
    },
    market: {id: 'aave-revenue-2026', claim: 'Aave revenue grows more than 20% in 2026', side: 'TRUE'},
    paper: {
      eyebrow: 'Lending / Q2 2026',
      title: 'Aave',
      standfirst: 'Revenue quality review',
      byline: 'PREPARED BY ATLAS RESEARCH · DEMO DATA',
      footerNote: 'Atlas Research · Illustrative financials',
      pageLabel: '01 / 04',
      blocks: [
        {kind: 'heading', text: '1. Executive summary'},
        {
          kind: 'paragraph',
          text: 'Aave’s interest income is evaluated against active loans, utilization and reserve factors. This review separates recurring protocol revenue from incentives and one-off items.',
        },
        {kind: 'table', ...LENDING_TABLE},
        {kind: 'heading', text: '2. Revenue quality'},
        {
          kind: 'paragraph',
          text: 'Higher borrowing activity is only useful when it translates into sustainable fee generation. Revenue concentration and market-level reserves remain central to this assessment.',
        },
        {kind: 'heading', text: '3. Outlook'},
        {
          kind: 'paragraph',
          text: 'Competition in lending is likely to depend on risk management, capital efficiency and the ability to attract sustainable activity. Outstanding loans and recurring revenue should be evaluated together.',
        },
      ],
      notes: ['Reserve factor changes after the snapshot block are not reflected in these figures.'],
    },
  },

  'b570c93a4e12d8f6': {
    hash: 'b570c93a4e12d8f6',
    title: 'Morpho / Growth & risk',
    subtitle: 'Scaling incentives, governance and tail risks',
    category: 'Lending',
    author: 'Atlas Research',
    price: 4,
    currency: 'USDC',
    tokenId: 'DEMO-morpho-growth',
    preview: 'line',
    pages: 4,
    access: 'preview',
    summary:
      'Morpho’s permissionless lending markets offer a different approach to capital allocation. This report considers the relationship between growth, vault concentration and risk curation.',
    provenance: {
      subgraph: 'DEMO-lending-eth',
      deployment: 'DEMO-deploy-01',
      block: '24,800,000',
      records: '94',
      retrieved: '14:11:23 UTC',
    },
    market: {id: 'lending-2027', claim: 'Aave leads lending by end-2027', side: 'FALSE'},
    paper: {
      eyebrow: 'Lending / Q2 2026',
      title: 'Morpho',
      standfirst: 'Growth and risk review',
      byline: 'PREPARED BY ATLAS RESEARCH · DEMO DATA',
      footerNote: 'Atlas Research · Illustrative financials',
      pageLabel: '01 / 04',
      blocks: [
        {kind: 'heading', text: '1. Executive summary'},
        {
          kind: 'paragraph',
          text: 'Morpho’s permissionless lending markets offer a different approach to capital allocation. This report considers the relationship between growth, vault concentration and risk curation.',
        },
        {kind: 'table', ...LENDING_TABLE},
        {kind: 'heading', text: '2. Revenue quality'},
        {
          kind: 'paragraph',
          text: 'Growth in deposits should be assessed alongside outstanding loans, curator concentration and incentives. Supply growth alone does not establish durable economics.',
        },
      ],
    },
  },
};

export default async function ReportDetail({params}: {params: Promise<{hash: string}>}) {
  const {hash} = await params;
  const report = REPORTS_BY_HASH[hash];
  if (!report) notFound();

  const bought = report.access === 'owned';

  return (
    <main className="page-container report-page">
      <a href="/" className="back-link">
        <ArrowLeft size={15} />
        Report marketplace
      </a>

      <div className="page-heading">
        <div>
          <span className="eyebrow">
            {report.category.toUpperCase()} / {report.author.toUpperCase()}
          </span>
          <h1>{report.title}</h1>
          <p>{report.subtitle}</p>
        </div>
        {bought && <span className="badge">Unlocked</span>}
      </div>

      <div className="panel">
        {bought ? (
          <>
            <div className="unlocked-bar">
              <span>
                <Check size={16} />
                Unlocked for this account
              </span>
              <a href="/console" className="text-link">
                Open in console <ArrowUpRight size={15} />
              </a>
            </div>
            <div className="report-body">
              <ReportPaper paper={report.paper} />
            </div>
          </>
        ) : (
          <>
            <div className="report-excerpt">
              <span className="eyebrow">PUBLIC PREVIEW</span>
              <h2>{report.subtitle}</h2>
              <p>{report.summary}</p>
              <div className="locked-preview">
                <MiniDocument title={report.title} subtitle={report.subtitle} preview={report.preview} />
                <div>
                  <Lock size={20} />
                  <span>
                    Full report · {report.pages} pages
                  </span>
                </div>
              </div>
            </div>
            {report.access === 'paywall' ? (
              <BuyControl price={report.price} currency={report.currency} />
            ) : (
              <div className="purchase-bar">
                <div>
                  <strong>
                    {report.price} {report.currency}
                  </strong>
                  <span>Not yet listed for access</span>
                </div>
                <span className="btn primary inert">Unlock</span>
              </div>
            )}
          </>
        )}
      </div>

      <div className="query-evidence panel">
        <span className="eyebrow">THE GRAPH / QUERY EVIDENCE</span>
        <dl>
          <dt>Subgraph</dt>
          <dd>{report.provenance.subgraph}</dd>
          <dt>Deployment</dt>
          <dd>{report.provenance.deployment}</dd>
          <dt>Block</dt>
          <dd>{report.provenance.block}</dd>
          <dt>Records</dt>
          <dd>{report.provenance.records}</dd>
          <dt>Retrieved</dt>
          <dd>{report.provenance.retrieved}</dd>
          <dt>Report hash</dt>
          <dd>{report.hash}</dd>
          <dt>Token</dt>
          <dd>{report.tokenId}</dd>
        </dl>
      </div>

      <div className="related-preview">
        <span>Backs this claim · {report.market.side}</span>
        <a href={`/markets/${report.market.id}`}>
          {report.market.claim}
          <ArrowRight size={16} />
        </a>
      </div>
    </main>
  );
}

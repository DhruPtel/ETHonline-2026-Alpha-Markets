import {MarketplaceFilters} from './components/MarketplaceFilters.js';
import {MiniDocument, type PreviewChart} from './components/MiniDocument.js';
import {ArrowRight, ArrowUpRight} from './components/Icons.js';

/**
 * The report marketplace. A server component: it holds the data and passes it
 * down, and only the filter bar crosses into the client.
 */

// ---------------------------------------------------------------------------
// Demo content. Swap this const for the database query; the markup below reads
// from it and from nothing else.
// ---------------------------------------------------------------------------
type ReportCard = {
  hash: string;
  title: string;
  subtitle: string;
  category: string;
  author: string;
  price: number;
  tokenId: string;
  preview: PreviewChart;
  owned: boolean;
  marketId: string;
  marketClaim: string;
};

const MARKETPLACE: {
  categories: string[];
  activeCategory: string;
  settlementNote: string;
  reports: ReportCard[];
} = {
  categories: ['All', 'Lending', 'Stablecoins', 'DEXs'],
  activeCategory: 'All',
  settlementNote: 'Hedera tokens · Access via x402',
  reports: [
    {
      hash: '9f2c4a7e1b8d3056',
      title: 'Lending protocols / Q2 2026',
      subtitle: 'Market structure, growth and key risks',
      category: 'Lending',
      author: 'Atlas Research',
      price: 5,
      tokenId: 'DEMO-lending-q2',
      preview: 'bars',
      owned: false,
      marketId: 'lending-2027',
      marketClaim: 'Aave leads lending by end-2027',
    },
    {
      hash: '3d81e6f09c24ab75',
      title: 'Aave / Revenue quality',
      subtitle: 'Assessing sustainability and drivers',
      category: 'Lending',
      author: 'Atlas Research',
      price: 3,
      tokenId: 'DEMO-aave-revenue',
      preview: 'table',
      owned: false,
      marketId: 'aave-revenue-2026',
      marketClaim: 'Aave revenue grows more than 20% in 2026',
    },
    {
      hash: 'b570c93a4e12d8f6',
      title: 'Morpho / Growth & risk',
      subtitle: 'Scaling incentives, governance and tail risks',
      category: 'Lending',
      author: 'Atlas Research',
      price: 4,
      tokenId: 'DEMO-morpho-growth',
      preview: 'line',
      owned: false,
      marketId: 'lending-2027',
      marketClaim: 'Aave leads lending by end-2027',
    },
    {
      hash: 'e4a1b26d70f5c839',
      title: 'Stablecoin reserves',
      subtitle: 'Composition, risk and market impact',
      category: 'Stablecoins',
      author: 'Atlas Research',
      price: 4,
      tokenId: 'DEMO-stablecoin-reserves',
      preview: 'bars',
      owned: false,
      marketId: 'stablecoins-2027',
      marketClaim: 'USDC grows the most of any stablecoin in 2027',
    },
    {
      hash: '6c08f5b3d9a21e74',
      title: 'DEX fee economics',
      subtitle: 'Revenue, incentives and competitive dynamics',
      category: 'DEXs',
      author: 'Atlas Research',
      price: 3,
      tokenId: 'DEMO-dex-fees',
      preview: 'table',
      owned: false,
      marketId: 'dex-volume',
      marketClaim: 'Uniswap leads DEX volume in Q4 2026',
    },
    {
      hash: 'a293e7c015b6d4f8',
      title: 'Spark / Lending outlook',
      subtitle: 'Growth drivers and market positioning',
      category: 'Lending',
      author: 'Atlas Research',
      price: 2,
      tokenId: 'DEMO-spark-outlook',
      preview: 'line',
      owned: false,
      marketId: 'spark-growth',
      marketClaim: 'Spark loans exceed $8B in 2027',
    },
  ],
};

export default function ReportMarketplace() {
  const {categories, activeCategory, settlementNote, reports} = MARKETPLACE;

  return (
    <main className="marketplace-page page-container">
      <div className="page-heading">
        <div>
          <span className="eyebrow">INDEPENDENT INTELLIGENCE</span>
          <h1>Report marketplace</h1>
          <p>Research worth reading. Conviction worth backing.</p>
        </div>
        <a href="/console#tokenize" className="btn outline">
          Publish a report <ArrowUpRight size={16} />
        </a>
      </div>

      <MarketplaceFilters categories={categories} activeCategory={activeCategory} />

      <div className="results-meta">
        <span>{reports.length} reports</span>
        <span>{settlementNote}</span>
      </div>

      <div className="report-grid">
        {reports.map((report) => (
          <article className="report-card" key={report.hash}>
            <a
              href={`/report/${report.hash}`}
              className="document-preview-button"
              aria-label={`Preview ${report.title}`}
            >
              <MiniDocument
                title={report.title}
                subtitle={report.subtitle}
                preview={report.preview}
                locked={!report.owned}
              />
            </a>

            <div className="report-card-info">
              <div className="report-card-title">
                <h2>{report.title}</h2>
                <strong>
                  {report.price} <small>USDC</small>
                </strong>
              </div>
              <p>By {report.author}</p>

              <div className="report-card-buttons">
                <a href={`/report/${report.hash}`} className="btn white">
                  {report.owned ? 'Read report' : 'Preview report'}
                </a>
                {!report.owned && (
                  <a href={`/report/${report.hash}`} className="text-link">
                    Unlock <ArrowUpRight size={14} />
                  </a>
                )}
                {report.owned && <span className="badge">Your report</span>}
              </div>

              <a className="report-market-link" href={`/markets/${report.marketId}`}>
                {report.marketClaim} <ArrowRight size={14} />
              </a>

              <details className="card-evidence">
                <summary>Hedera token · x402 access</summary>
                <div>
                  <span>Token</span>
                  <code>{report.tokenId}</code>
                </div>
                <span className="text-link inert">
                  View token receipt <ArrowUpRight size={13} />
                </span>
              </details>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}

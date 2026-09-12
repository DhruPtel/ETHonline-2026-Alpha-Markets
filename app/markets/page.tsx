import {MarketFilters} from '../components/MarketFilters.js';
import {ProbabilityChart, type Series} from '../components/ProbabilityChart.js';
import {ArrowRight, Check, Clock} from '../components/Icons.js';

/**
 * The market index. A server component; only the filter controls are client.
 *
 * Every market is a claim with two sides. There are no multi-outcome markets:
 * a card shows TRUE and FALSE and nothing else.
 */

// ---------------------------------------------------------------------------
// Demo content. Swap this const for the database query; the markup below reads
// from it and from nothing else.
// ---------------------------------------------------------------------------
type MarketCard = {
  id: string;
  claim: string;
  category: string;
  criterion: string;
  volume: string;
  reports: number;
  closes: string;
  status: 'Open' | 'Resolved';
  truePct: number;
  falsePct: number;
  series: Series;
};

const LABELS = ['Jun', 'Jul', 'Aug', 'Sep', 'Oct'];

const MARKETS: {
  categories: string[];
  activeCategory: string;
  status: string;
  settlementNote: string;
  markets: MarketCard[];
} = {
  categories: ['All', 'Lending', 'Stablecoins', 'DEXs'],
  activeCategory: 'All',
  status: 'All statuses',
  settlementNote: 'Settlement on Arc',
  markets: [
    {
      id: 'lending-2027',
      claim: 'Aave leads lending by end-2027',
      category: 'Lending',
      criterion: 'Most outstanding loans in USD',
      volume: '124,850',
      reports: 12,
      closes: '31 Dec 2027',
      status: 'Open',
      truePct: 54,
      falsePct: 46,
      series: {trueLine: [30.7, 36.7, 37.4, 37.0, 40.6, 43.8, 44.0, 45.0, 47.9, 49.7, 50.6, 52.3, 54.0], labels: LABELS},
    },
    {
      id: 'stablecoins-2027',
      claim: 'USDC grows the most of any stablecoin in 2027',
      category: 'Stablecoins',
      criterion: 'Highest percentage growth in circulating supply',
      volume: '82,420',
      reports: 8,
      closes: '31 Dec 2027',
      status: 'Open',
      truePct: 46,
      falsePct: 54,
      series: {trueLine: [37.3, 37.0, 40.8, 41.9, 40.0, 41.0, 43.5, 43.4, 42.9, 44.2, 45.3, 45.4, 46.0], labels: LABELS},
    },
    {
      id: 'dex-volume',
      claim: 'Uniswap leads DEX volume in Q4 2026',
      category: 'DEXs',
      criterion: 'Largest cumulative USD spot trading volume',
      volume: '68,310',
      reports: 6,
      closes: '31 Dec 2026',
      status: 'Open',
      truePct: 61,
      falsePct: 39,
      series: {trueLine: [42.7, 44.4, 49.2, 50.3, 49.3, 51.6, 54.6, 54.8, 55.2, 57.4, 58.9, 59.7, 61.0], labels: LABELS},
    },
    {
      id: 'spark-growth',
      claim: 'Spark loans exceed $8B in 2027',
      category: 'Lending',
      criterion: 'Outstanding loans above $8 billion at resolution',
      volume: '41,260',
      reports: 5,
      closes: '31 Dec 2027',
      status: 'Open',
      truePct: 64,
      falsePct: 36,
      series: {trueLine: [47.7, 52.8, 52.9, 51.8, 54.8, 57.5, 57.1, 57.5, 60.0, 61.2, 61.6, 62.8, 64.0], labels: LABELS},
    },
    {
      id: 'aave-revenue-2026',
      claim: 'Aave revenue grows more than 20% in 2026',
      category: 'Lending',
      criterion: 'Year-over-year protocol revenue growth in 2026',
      volume: '56,970',
      reports: 9,
      closes: '31 Dec 2026',
      status: 'Open',
      truePct: 72,
      falsePct: 28,
      series: {trueLine: [55.7, 59.4, 63.1, 62.1, 61.9, 65.2, 66.8, 66.3, 67.3, 69.4, 70.2, 70.8, 72.0], labels: LABELS},
    },
    {
      id: 'stablecoin-supply',
      claim: 'Stablecoin supply exceeded $250B at the Q2 2026 close',
      category: 'Stablecoins',
      criterion: 'Aggregate circulating supply at quarter end',
      volume: '96,140',
      reports: 4,
      closes: '30 Jun 2026',
      status: 'Resolved',
      truePct: 100,
      falsePct: 0,
      series: {trueLine: [68.7, 74.2, 79.3, 79.7, 80.8, 85.3, 88.1, 88.8, 91.0, 94.2, 96.0, 97.8, 100.0], labels: LABELS},
    },
  ],
};

export default function MarketIndex() {
  const {categories, activeCategory, status, settlementNote, markets} = MARKETS;
  const open = markets.filter((m) => m.status === 'Open').length;

  return (
    <main className="page-container markets-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">CONVICTION MEETS THE MARKET</span>
          <h1>Prediction markets</h1>
          <p>Back a claim. Let the evidence speak.</p>
        </div>
        <div className="market-count">
          <span>{open} OPEN MARKETS</span>
          <span>{settlementNote}</span>
        </div>
      </div>

      <MarketFilters
        categories={categories}
        activeCategory={activeCategory}
        status={status}
        marketCount={markets.length}
      />

      <div className="prediction-grid">
        {markets.map((market) => (
          <a key={market.id} href={`/markets/${market.id}`} className="prediction-card">
            <div className="prediction-card-meta">
              <span>{market.category}</span>
              <span className={market.status === 'Open' ? 'badge' : 'badge resolved'}>
                {market.status === 'Open' ? <Clock size={12} /> : <Check size={12} />} {market.status}
              </span>
            </div>

            <h2>{market.claim}</h2>
            <p>{market.criterion}</p>

            <ProbabilityChart series={market.series} truePct={market.truePct} falsePct={market.falsePct} compact />

            <div className="prediction-outcomes">
              <div>
                <span>
                  <i className="dot-true" />
                  TRUE
                </span>
                <b>{market.truePct}%</b>
              </div>
              <div>
                <span>
                  <i className="dot-false" />
                  FALSE
                </span>
                <b>{market.falsePct}%</b>
              </div>
            </div>

            <div className="prediction-card-footer">
              <span>{market.volume} USDC vol.</span>
              <span>{market.reports} reports</span>
            </div>

            <div className="market-open-action">
              {market.status === 'Open' ? 'View market & stake' : 'View market results'} <ArrowRight size={17} />
            </div>
          </a>
        ))}
      </div>
    </main>
  );
}

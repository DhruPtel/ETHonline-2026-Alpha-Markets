import {notFound} from 'next/navigation.js';
import {StakeControl} from '../../components/StakeControl.js';
import {MiniDocument, type PreviewChart} from '../../components/MiniDocument.js';
import {ProbabilityChart, type Series} from '../../components/ProbabilityChart.js';
import {ArrowLeft, ArrowRight, ArrowUpRight, Clock} from '../../components/Icons.js';

/**
 * One market. A server component; only the position panel is client.
 *
 * The claim has two sides and nothing else: the chart draws two lines, the
 * outcome table has two rows, and the position panel shows the side rather
 * than offering a choice of it.
 */

// ---------------------------------------------------------------------------
// Demo content. Swap this const for the database query; the markup below reads
// from it and from nothing else.
// ---------------------------------------------------------------------------
type SupportingReport = {
  hash: string;
  title: string;
  subtitle: string;
  author: string;
  price: number;
  preview: PreviewChart;
};

type MarketRecord = {
  id: string;
  claim: string;
  category: string;
  criterion: string;
  volume: string;
  reports: number;
  closes: string;
  status: 'Open' | 'Resolved';
  currency: string;
  truePct: number;
  falsePct: number;
  series: Series;
  ranges: string[];
  activeRange: string;
  /** The side the staker joins, derived from the claim the attached report backs. */
  position: {side: 'TRUE' | 'FALSE'; presets: number[]; defaultAmount: number; backingReport: {title: string; hash: string}};
  supporting: SupportingReport[];
  contract: {network: string; marketContract: string; state: string; resolutionData: string; resolution: string};
};

const LABELS = ['Jun', 'Jul', 'Aug', 'Sep', 'Oct'];
const RANGES = ['1D', '1W', '1M', 'All'];

const MARKETS_BY_ID: Record<string, MarketRecord> = {
  'lending-2027': {
    id: 'lending-2027',
    claim: 'Aave leads lending by end-2027',
    category: 'Lending',
    criterion: 'Most outstanding loans in USD',
    volume: '124,850',
    reports: 12,
    closes: '31 Dec 2027',
    status: 'Open',
    currency: 'USDC',
    truePct: 54,
    falsePct: 46,
    series: {trueLine: [30.7, 36.7, 37.4, 37.0, 40.6, 43.8, 44.0, 45.0, 47.9, 49.7, 50.6, 52.3, 54.0], labels: LABELS},
    ranges: RANGES,
    activeRange: 'All',
    position: {
      side: 'TRUE',
      presets: [25, 50, 100, 250],
      defaultAmount: 100,
      backingReport: {title: 'Lending protocols / Q2 2026', hash: '9f2c4a7e1b8d3056'},
    },
    supporting: [
      {
        hash: '9f2c4a7e1b8d3056',
        title: 'Lending protocols / Q2 2026',
        subtitle: 'Market structure, growth and key risks',
        author: 'Atlas Research',
        price: 5,
        preview: 'bars',
      },
      {
        hash: 'b570c93a4e12d8f6',
        title: 'Morpho / Growth & risk',
        subtitle: 'Scaling incentives, governance and tail risks',
        author: 'Atlas Research',
        price: 4,
        preview: 'line',
      },
    ],
    contract: {
      network: 'Arc testnet',
      marketContract: 'DEMO-lending-2027',
      state: 'No stake submitted',
      resolutionData: 'The Graph',
      resolution: 'Pending',
    },
  },

  'stablecoins-2027': {
    id: 'stablecoins-2027',
    claim: 'USDC grows the most of any stablecoin in 2027',
    category: 'Stablecoins',
    criterion: 'Highest percentage growth in circulating supply',
    volume: '82,420',
    reports: 8,
    closes: '31 Dec 2027',
    status: 'Open',
    currency: 'USDC',
    truePct: 46,
    falsePct: 54,
    series: {trueLine: [37.3, 37.0, 40.8, 41.9, 40.0, 41.0, 43.5, 43.4, 42.9, 44.2, 45.3, 45.4, 46.0], labels: LABELS},
    ranges: RANGES,
    activeRange: 'All',
    position: {
      side: 'TRUE',
      presets: [25, 50, 100, 250],
      defaultAmount: 100,
      backingReport: {title: 'Stablecoin reserves', hash: 'e4a1b26d70f5c839'},
    },
    supporting: [
      {
        hash: 'e4a1b26d70f5c839',
        title: 'Stablecoin reserves',
        subtitle: 'Composition, risk and market impact',
        author: 'Atlas Research',
        price: 4,
        preview: 'bars',
      },
    ],
    contract: {
      network: 'Arc testnet',
      marketContract: 'DEMO-stablecoins-2027',
      state: 'No stake submitted',
      resolutionData: 'The Graph',
      resolution: 'Pending',
    },
  },

  'dex-volume': {
    id: 'dex-volume',
    claim: 'Uniswap leads DEX volume in Q4 2026',
    category: 'DEXs',
    criterion: 'Largest cumulative USD spot trading volume',
    volume: '68,310',
    reports: 6,
    closes: '31 Dec 2026',
    status: 'Open',
    currency: 'USDC',
    truePct: 61,
    falsePct: 39,
    series: {trueLine: [42.7, 44.4, 49.2, 50.3, 49.3, 51.6, 54.6, 54.8, 55.2, 57.4, 58.9, 59.7, 61.0], labels: LABELS},
    ranges: RANGES,
    activeRange: 'All',
    position: {
      side: 'TRUE',
      presets: [25, 50, 100, 250],
      defaultAmount: 100,
      backingReport: {title: 'DEX fee economics', hash: '6c08f5b3d9a21e74'},
    },
    supporting: [
      {
        hash: '6c08f5b3d9a21e74',
        title: 'DEX fee economics',
        subtitle: 'Revenue, incentives and competitive dynamics',
        author: 'Atlas Research',
        price: 3,
        preview: 'table',
      },
    ],
    contract: {
      network: 'Arc testnet',
      marketContract: 'DEMO-dex-volume',
      state: 'No stake submitted',
      resolutionData: 'The Graph',
      resolution: 'Pending',
    },
  },

  'spark-growth': {
    id: 'spark-growth',
    claim: 'Spark loans exceed $8B in 2027',
    category: 'Lending',
    criterion: 'Outstanding loans above $8 billion at resolution',
    volume: '41,260',
    reports: 5,
    closes: '31 Dec 2027',
    status: 'Open',
    currency: 'USDC',
    truePct: 64,
    falsePct: 36,
    series: {trueLine: [47.7, 52.8, 52.9, 51.8, 54.8, 57.5, 57.1, 57.5, 60.0, 61.2, 61.6, 62.8, 64.0], labels: LABELS},
    ranges: RANGES,
    activeRange: 'All',
    position: {
      side: 'TRUE',
      presets: [25, 50, 100, 250],
      defaultAmount: 100,
      backingReport: {title: 'Spark / Lending outlook', hash: 'a293e7c015b6d4f8'},
    },
    supporting: [
      {
        hash: 'a293e7c015b6d4f8',
        title: 'Spark / Lending outlook',
        subtitle: 'Growth drivers and market positioning',
        author: 'Atlas Research',
        price: 2,
        preview: 'line',
      },
    ],
    contract: {
      network: 'Arc testnet',
      marketContract: 'DEMO-spark-growth',
      state: 'No stake submitted',
      resolutionData: 'The Graph',
      resolution: 'Pending',
    },
  },

  'aave-revenue-2026': {
    id: 'aave-revenue-2026',
    claim: 'Aave revenue grows more than 20% in 2026',
    category: 'Lending',
    criterion: 'Year-over-year protocol revenue growth in 2026',
    volume: '56,970',
    reports: 9,
    closes: '31 Dec 2026',
    status: 'Open',
    currency: 'USDC',
    truePct: 72,
    falsePct: 28,
    series: {trueLine: [55.7, 59.4, 63.1, 62.1, 61.9, 65.2, 66.8, 66.3, 67.3, 69.4, 70.2, 70.8, 72.0], labels: LABELS},
    ranges: RANGES,
    activeRange: 'All',
    position: {
      side: 'TRUE',
      presets: [25, 50, 100, 250],
      defaultAmount: 100,
      backingReport: {title: 'Aave / Revenue quality', hash: '3d81e6f09c24ab75'},
    },
    supporting: [
      {
        hash: '3d81e6f09c24ab75',
        title: 'Aave / Revenue quality',
        subtitle: 'Assessing sustainability and drivers',
        author: 'Atlas Research',
        price: 3,
        preview: 'table',
      },
    ],
    contract: {
      network: 'Arc testnet',
      marketContract: 'DEMO-aave-revenue-2026',
      state: 'No stake submitted',
      resolutionData: 'The Graph',
      resolution: 'Pending',
    },
  },

  'stablecoin-supply': {
    id: 'stablecoin-supply',
    claim: 'Stablecoin supply exceeded $250B at the Q2 2026 close',
    category: 'Stablecoins',
    criterion: 'Aggregate circulating supply at quarter end',
    volume: '96,140',
    reports: 4,
    closes: '30 Jun 2026',
    status: 'Resolved',
    currency: 'USDC',
    truePct: 100,
    falsePct: 0,
    series: {trueLine: [68.7, 74.2, 79.3, 79.7, 80.8, 85.3, 88.1, 88.8, 91.0, 94.2, 96.0, 97.8, 100.0], labels: LABELS},
    ranges: RANGES,
    activeRange: 'All',
    position: {
      side: 'TRUE',
      presets: [25, 50, 100, 250],
      defaultAmount: 100,
      backingReport: {title: 'Stablecoin reserves', hash: 'e4a1b26d70f5c839'},
    },
    supporting: [
      {
        hash: 'e4a1b26d70f5c839',
        title: 'Stablecoin reserves',
        subtitle: 'Composition, risk and market impact',
        author: 'Atlas Research',
        price: 4,
        preview: 'bars',
      },
    ],
    contract: {
      network: 'Arc testnet',
      marketContract: 'DEMO-stablecoin-supply',
      state: 'Settled',
      resolutionData: 'The Graph',
      resolution: 'Resolved TRUE',
    },
  },
};

export default async function MarketDetail({params}: {params: Promise<{id: string}>}) {
  const {id} = await params;
  const market = MARKETS_BY_ID[id];
  if (!market) notFound();

  const resolved = market.status === 'Resolved';
  const sidePct = market.position.side === 'TRUE' ? market.truePct : market.falsePct;

  return (
    <main className="page-container market-detail">
      <a href="/markets" className="back-link">
        <ArrowLeft size={15} />
        All predictions
      </a>

      <div className="market-detail-grid">
        <section className="market-main">
          <div className="market-title">
            <div className="eyebrow">
              {market.category} / {market.status.toUpperCase()} MARKET
            </div>
            <h1>{market.claim}</h1>
            <p>
              {market.criterion} · {market.closes}
            </p>
          </div>

          <div className="market-chart-panel panel">
            <div className="chart-top">
              <span className="eyebrow">IMPLIED PROBABILITY</span>
              <div className="range-buttons">
                {market.ranges.map((range) => (
                  <span
                    key={range}
                    className={range === market.activeRange ? 'active' : 'inert'}
                    aria-current={range === market.activeRange ? 'true' : undefined}
                  >
                    {range}
                  </span>
                ))}
              </div>
            </div>

            <ProbabilityChart series={market.series} truePct={market.truePct} falsePct={market.falsePct} />

            <div className="market-statline">
              <span>
                <Clock size={14} />
                {market.closes}
              </span>
              <span>{market.volume} USDC volume</span>
            </div>

            <div className="outcome-header">
              <span>OUTCOME</span>
              <span>PROBABILITY</span>
              <span>STATE</span>
            </div>

            <div className={market.position.side === 'TRUE' ? 'outcome-row chosen' : 'outcome-row'}>
              <div>
                <i className="dot-true" />
                <strong>TRUE</strong>
              </div>
              <b className="pct-true">{market.truePct}%</b>
              <span className="outcome-state">
                {resolved ? (market.truePct === 100 ? 'Winner' : 'Closed') : 'Open'}
              </span>
            </div>

            <div className={market.position.side === 'FALSE' ? 'outcome-row chosen' : 'outcome-row'}>
              <div>
                <i className="dot-false" />
                <strong>FALSE</strong>
              </div>
              <b className="pct-false">{market.falsePct}%</b>
              <span className="outcome-state">
                {resolved ? (market.falsePct === 100 ? 'Winner' : 'Closed') : 'Open'}
              </span>
            </div>
          </div>

          <div className="supporting-research panel">
            <div className="section-title">
              <h2>Supporting research</h2>
              <a href="/" className="text-link">
                All reports <ArrowRight size={14} />
              </a>
            </div>
            {market.supporting.map((report) => (
              <a href={`/report/${report.hash}`} className="supporting-row" key={report.hash}>
                <div className="supporting-thumbnail">
                  <MiniDocument title={report.title} subtitle={report.subtitle} preview={report.preview} />
                </div>
                <div>
                  <h3>{report.title}</h3>
                  <p>
                    {report.author} · {report.price} {market.currency}
                  </p>
                  <span>{report.subtitle}</span>
                </div>
                <ArrowUpRight size={18} />
              </a>
            ))}
          </div>

          <details className="resolution-rules panel">
            <summary>Resolution criteria</summary>
            <p>
              {market.criterion}, measured at the end of {market.closes}. Resolution reads the relevant data from{' '}
              {market.contract.resolutionData} and settles the market on Arc.
            </p>
            <p>The claim resolves TRUE or FALSE. There is no third outcome.</p>
          </details>
        </section>

        <aside className="position-panel dark-panel">
          <h2>Your position</h2>
          <p>
            {resolved
              ? 'This market has resolved.'
              : 'You join the side your attached research backs.'}
          </p>

          <StakeControl
            side={market.position.side}
            sidePct={sidePct}
            currency={market.currency}
            presets={market.position.presets}
            defaultAmount={market.position.defaultAmount}
            backingReport={market.position.backingReport}
            resolved={resolved}
          />

          <div className="arc-evidence">
            <span className="eyebrow">ARC / ONCHAIN EVIDENCE</span>
            <dl>
              <dt>Network</dt>
              <dd>{market.contract.network}</dd>
              <dt>Market contract</dt>
              <dd>{market.contract.marketContract}</dd>
              <dt>Status</dt>
              <dd>{market.contract.state}</dd>
            </dl>
            <div className="button-row">
              <span className="text-link inert">
                View contract <ArrowUpRight size={13} />
              </span>
              <a className="text-link" href="/holdings">
                My holdings <ArrowRight size={13} />
              </a>
            </div>
            <dl>
              <dt>Resolution data</dt>
              <dd>{market.contract.resolutionData}</dd>
              <dt>Resolution</dt>
              <dd>{market.contract.resolution}</dd>
            </dl>
          </div>
        </aside>
      </div>
    </main>
  );
}

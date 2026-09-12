import {ArrowRight} from '../components/Icons.js';

/**
 * Tokens held per account. No design exists for this screen, so it is built
 * from the helpers the rest of the site already uses — .page-container,
 * .page-heading, .section-title, .eyebrow, .badge and .financial-table — and
 * kept plain. A server component with nothing interactive on it.
 */

// ---------------------------------------------------------------------------
// Demo content. Swap this const for the database query; the markup below reads
// from it and from nothing else.
// ---------------------------------------------------------------------------
type Holding = {
  hash: string;
  title: string;
  author: string;
  tokenId: string;
  acquired: string;
  marketId: string;
  marketClaim: string;
};

const HOLDINGS: {account: string; network: string; tokens: Holding[]} = {
  account: '0x7a3f…c218',
  network: 'Hedera',
  tokens: [
    {
      hash: '3d81e6f09c24ab75',
      title: 'Aave / Revenue quality',
      author: 'Atlas Research',
      tokenId: 'DEMO-aave-revenue',
      acquired: '12 Jul 2026',
      marketId: 'aave-revenue-2026',
      marketClaim: 'Aave revenue grows more than 20% in 2026',
    },
    {
      hash: '9f2c4a7e1b8d3056',
      title: 'Lending protocols / Q2 2026',
      author: 'Atlas Research',
      tokenId: 'DEMO-lending-q2',
      acquired: '09 Jul 2026',
      marketId: 'lending-2027',
      marketClaim: 'Aave leads lending by end-2027',
    },
    {
      hash: 'e4a1b26d70f5c839',
      title: 'Stablecoin reserves',
      author: 'Atlas Research',
      tokenId: 'DEMO-stablecoin-reserves',
      acquired: '28 Jun 2026',
      marketId: 'stablecoins-2027',
      marketClaim: 'USDC grows the most of any stablecoin in 2027',
    },
  ],
};

export default function Holdings() {
  const {account, network, tokens} = HOLDINGS;

  return (
    <main className="page-container holdings-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">REPORT TOKENS</span>
          <h1>Holdings</h1>
          <p>Every report token held by this account.</p>
        </div>
      </div>

      <div className="holdings-panel panel">
        <div className="section-title">
          <div>
            <span className="eyebrow">{network.toUpperCase()} / ACCOUNT</span>
            <h2>{account}</h2>
          </div>
          <span className="badge">
            {tokens.length} {tokens.length === 1 ? 'token' : 'tokens'}
          </span>
        </div>

        <div className="table-scroll">
          <table className="financial-table">
            <thead>
              <tr>
                <th>Report</th>
                <th>Author</th>
                <th>Token ID</th>
                <th>Acquired</th>
                <th>Related market</th>
              </tr>
            </thead>
            <tbody>
              {tokens.map((token) => (
                <tr key={token.tokenId}>
                  <td>
                    <a href={`/report/${token.hash}`}>
                      <strong>{token.title}</strong>
                      <span className="holdings-sub">{token.hash}</span>
                    </a>
                  </td>
                  <td>{token.author}</td>
                  <td>
                    <code>{token.tokenId}</code>
                  </td>
                  <td>{token.acquired}</td>
                  <td>
                    <a href={`/markets/${token.marketId}`} className="text-link">
                      {token.marketClaim} <ArrowRight size={13} />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

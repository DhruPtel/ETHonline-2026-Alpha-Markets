// /markets/[id] — ⚠️ **PASS ONE: A VERBATIM TRANSCRIPTION** of the `prediction-stablecoins-2027`
// route from `single-frontend/alpha-markets.html`, whose stylesheet is byte-identical to
// `front-end-design/`'s and from which `app/globals.css` was extracted.
//
// ⚠️ **NOTHING HERE IS WIRED AND NOTHING HERE IS REAL.** No database call, no params, no handlers,
// no marked affordances. Every string is the reference's own — "Which stablecoin grows the most in
// 2027?", `100` USDC, `217.39`, `USDC 46% / USDT 36% / Other 18%`, the chart's polyline points,
// "Demo funds only. No transaction will be broadcast." **This file exists so that the drift between
// the design and the build is a diff rather than an argument.**
//
// ⚠️ **The previous version of this page had lost the skeleton entirely** — one narrow column, a
// small box floated top-right, panels stacked down the page. The reference is a two-column
// `.market-detail-grid`: a wide `.market-main` carrying the title, the chart panel with its
// 1D/1W/1M/All controls and the outcome rows; and a dark `.position-panel` aside. **None of the old
// page survives this pass.** Pass two decides what comes back and where inside this skeleton it fits.
//
// ⚠️ **Not tidied.** No wrapper collapsed, no class renamed, no two divs merged — a wrapper removed
// is a grid that stops working.
//
// ── The only edits, and they are mechanical ──────────────────────────────────────────────────────
//
//   `class` → `className` · `for` → `htmlFor` · void tags self-closed · `style="…"` → an object ·
//   `tabindex`/`maxlength` → numbers · SVG's hyphenated attributes → camelCase.
//
// ⚠️ **Two deviations, both from the COMBINER rather than the design, and both necessary:**
// `data-route="prediction-stablecoins-2027"` and `hidden` were added by the single-file build so its
// hash router could show one `<main>` at a time. There is no router here and a `hidden` `<main>`
// renders nothing. Removing them restores exactly the `<main>` that
// `front-end-design/prediction-stablecoins-2027.html` carries. ⚠️ The hrefs stay as the combined file
// has them (`#/markets`) — rewriting them is a wiring decision and belongs to pass two.

import { notFound } from 'next/navigation.js';
import { ethers } from 'ethers';
import { db } from '../../../src/store/db.js';
import { requiredEnv } from '../../../src/config/env.js';
import { Stake } from './stake.js';
import { SiteHeader } from '../../ui/chrome.js';
import { Unbuilt } from '../../ui/unbuilt.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** ⚠️ Only what this page reads and the one function it sends. NEVER `src/arc/abi.ts` — that
 *  artifact carries the creation and deployed bytecode and would ship it to every visitor. */
const MARKET_ABI = [
  'function markets(uint256) view returns (bytes32 questionId, bytes32 specHash, uint64 closeTime, uint64 observationEnd, uint64 resolveDeadline, bool resolved, bool outcome, bool voided, bytes32 evidenceHash, uint256 poolTrue, uint256 poolFalse)',
  'function MAX_STAKE() view returns (uint256)',
  'function stake(uint256 marketId, uint256 claimId) payable',
];

interface Spec { slug: string; metric: string; comparison: 'above' | 'below'; threshold: string; observedDay: string }

const usdc = (wei: bigint): string => ethers.formatUnits(wei, 18);
const when = (d: Date) => `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
const grouped = (dec: string) => Number(dec).toLocaleString('en-US');

export default async function MarketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();

  // ⚠️ **THE QUERIES ARE PHASE 4'S AND THEY DID NOT CHANGE.** `after_the_fact` is the rehearsal
  // test the index uses — `observation_end <= created_at` means the day was already over when the
  // market was created, so the commit could not have been a prediction.
  const [market] = await db()<{
    id: string; spec_json: string; close_time: Date; observation_end: Date; resolve_deadline: Date;
    contract_address: string; resolved_at: Date | null; voided_at: Date | null; outcome: boolean | null;
    after_the_fact: boolean;
  }[]>`
    SELECT id, spec_json, close_time, observation_end, resolve_deadline, contract_address,
           resolved_at, voided_at, outcome, (observation_end <= created_at) AS after_the_fact
    FROM markets WHERE chain_market_id = ${id} AND contract_address = ${requiredEnv('ARC_MARKET_ADDRESS')}`;
  if (!market) notFound();

  // ⚠️ One claim, and the page refuses rather than guessing if there is not exactly one.
  const claims = await db()<{
    id: string; chain_claim_id: string; author: string; side: boolean; amount: string;
    report_hash: string; directive: string | null; forecast_correct: boolean | null;
    reconciliation_quality: string | null; returned: string | null;
  }[]>`
    SELECT c.id, c.chain_claim_id, c.author, c.side, c.amount, c.report_hash, r.directive,
           s.forecast_correct, s.reconciliation_quality, s.returned
    FROM claims c
    LEFT JOIN reports r ON r.hash = c.report_hash
    LEFT JOIN scores  s ON s.market_id = c.market_id AND s.claim_id = c.id
    WHERE c.market_id = ${market.id} AND c.chain_claim_id IS NOT NULL ORDER BY c.created_at`;
  const claim = claims.length === 1 ? claims[0]! : null;

  const spec = JSON.parse(market.spec_json) as Spec;
  // ⚠️ The wallet gets this URL, so it must not be able to carry a credential. Checked, not trusted.
  const parsed = new URL(requiredEnv('ARC_RPC_URL'));
  const publicRpc = parsed.username || parsed.password || parsed.search || parsed.pathname !== '/'
    ? 'https://rpc.testnet.arc.network' : requiredEnv('ARC_RPC_URL');

  const contract = new ethers.Contract(market.contract_address, MARKET_ABI,
    new ethers.JsonRpcProvider(publicRpc, undefined, { staticNetwork: true }));
  const onChain = await contract.markets!(BigInt(id));
  const maxStake = await contract.MAX_STAKE!() as bigint;
  const poolTrue = onChain.poolTrue as bigint;
  const poolFalse = onChain.poolFalse as bigint;
  const total = poolTrue + poolFalse;

  const recorded = await db()<{ staker: string; amount: string; side: boolean; tx_hash: string }[]>`
    SELECT staker, amount, side, tx_hash FROM stakes WHERE market_id = ${market.id} ORDER BY seq`;

  const open = Date.now() < market.close_time.getTime() && !market.resolved_at && !market.voided_at;

  // ⚠️ A void is an ABSENCE of an outcome, never a wrong answer.
  const standing = market.voided_at ? 'Voided — no outcome, every stake refundable'
    : market.resolved_at ? `Resolved ${market.outcome ? 'TRUE' : 'FALSE'}`
    : open ? 'Open for staking'
    : Date.now() < market.observation_end.getTime() ? 'Staking closed — observing'
    : 'Awaiting settlement';

  return (
    <>
      <SiteHeader current="/markets" />
      <main className="page-container market-detail">
        <a href="/markets" className="back-link">
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m12 19-7-7 7-7" /><path d="M19 12H5" />
          </svg>
          All predictions
        </a>
        <div className="market-detail-grid">
          <section className="market-main">
            <div className="market-title">
              <div className="eyebrow">
                {market.after_the_fact ? 'Rehearsal' : 'Forecast'} · {open ? 'Open market' : 'Closed'}
              </div>
              <h1>Will {spec.slug}&rsquo;s {spec.metric} be {spec.comparison} ${grouped(spec.threshold)} on {spec.observedDay}?</h1>
              <p>
                Settled by re-reading the deployment&rsquo;s daily snapshot for {spec.observedDay} UTC
                from The Graph. A tie resolves FALSE.
              </p>
              {/* ⚠️ **A REHEARSAL MUST NEVER READ AS A FORECAST.** A market over an already-observed
                  day is indistinguishable on chain from a real one and nothing enforces the
                  distinction but us. This is where it is enforced for a reader. */}
              {market.after_the_fact && (
                <p className="no-durable">
                  ⚠️ <strong>This is a rehearsal, not a forecast.</strong> The observed day
                  ({spec.observedDay}) had already finished when this market was created, so the
                  answer was knowable at commit time. It counts towards nothing.
                </p>
              )}
              {market.voided_at && (
                <p className="no-durable">
                  ⚠️ <strong>Voided.</strong> The day could not be observed, so there is no outcome
                  and every stake is refundable. A void is never a wrong answer.
                </p>
              )}
            </div>
            <div className="market-chart-panel panel">
              <div className="chart-top">
                <span className="eyebrow">
                  IMPLIED PROBABILITY
                </span>
                {/* ⚠️ MARKED — a time range needs a time series and there is none. */}
                <Unbuilt label="Probability over time">
                  <span className="range-buttons">
                    <span>1D</span><span>1W</span><span>1M</span><span className="active">All</span>
                  </span>
                </Unbuilt>
              </div>
              {/* ⚠️ **The section stays and says so.** Nothing stores a probability series and
                  there is ONE human stake in the whole database, so a line here would be two points
                  on one market and flat everywhere else. What IS real is the pool split, read from
                  the contract on this request — so the slot carries that, at the same prominence,
                  and the missing series is marked rather than faked. */}
              <div className="prediction-chart">
                <div className="chart-container" role="img"
                     aria-label={total > 0n ? `Pool split: TRUE ${Number((poolTrue * 1000n) / total) / 10}%` : 'Nothing staked yet'}>
                  <Unbuilt label="Probability over time">
                    {/* ⚠️ No class here: borrowing `.market-statline` for marker text put that
                        class in the document before the real statline and made the section order
                        read wrong against the reference. */}
                    <span>no series is stored — the bar below is the pool, not a probability</span>
                  </Unbuilt>
                  {total > 0n ? (
                    <div className="pool-bar">
                      <div className="pool-track">
                        <span className="pool-true" style={{ width: `${Number((poolTrue * 1000n) / total) / 10}%` }} />
                        <span className="pool-false" style={{ width: `${Number((poolFalse * 1000n) / total) / 10}%` }} />
                      </div>
                      {/* ⚠️ **One-sided must not read as a landslide.** Every pool here is one-sided,
                          and `payoutOf`'s `winningPool == 0` branch then returns each stake to the
                          staker who made it. That is the contract working, not a fault. */}
                      {(poolTrue === 0n || poolFalse === 0n) && (
                        <p className="pool-onesided">
                          ⚠️ <strong>One-sided.</strong> Nobody has staked the other side, so this is
                          not a weight of opinion. If it settles this way the parimutuel returns every
                          stake to the staker who made it.
                        </p>
                      )}
                    </div>
                  ) : <p className="empty">Nothing staked on either side yet.</p>}
                </div>
              </div>
              {/* ⚠️ The reference's legend, statline and outcome table, in its order. */}
              <div className="chart-legend">
                <span><i style={{ background: '#526bd8' }} />TRUE <strong>{usdc(poolTrue)} USDC</strong></span>
                <span><i style={{ background: '#d18a3c' }} />FALSE <strong>{usdc(poolFalse)} USDC</strong></span>
              </div>
              <div className="market-statline">
                <span>{usdc(total)} USDC pool</span>
                <span>{recorded.length} recorded stake{recorded.length === 1 ? '' : 's'}</span>
                <span>{standing}</span>
              </div>
              {/* ⚠️ **SIDE / POOL / SHARE. The reference's third column is ACTION with a "Back"
                  button on every row and it is CUT — not disabled, not marked, removed.**
                  `stake(marketId, claimId)` takes no side; a per-row control would build the hole
                  the contract closed. **These rows are display.** And there are exactly two: the
                  contract is binary, so the reference's third outcome cannot exist. */}
              <div className="outcome-header">
                <span>Side</span><span>Pool</span><span>Share</span>
              </div>
              {([[true, poolTrue, '#526bd8'], [false, poolFalse, '#d18a3c']] as const).map(([side, amt, colour]) => (
                <div key={String(side)} className={`outcome-row ${claim?.side === side ? 'chosen' : ''}`}>
                  <span>
                    <i style={{ background: colour }} />
                    {side ? 'TRUE' : 'FALSE'}{claim?.side === side ? ' · the analyst’s side' : ''}
                  </span>
                  <b className="mono">{usdc(amt)} USDC</b>
                  <b className="mono">{total > 0n ? `${Number((amt * 1000n) / total) / 10}%` : '—'}</b>
                </div>
              ))}
            </div>
            <div className="supporting-research panel">
              <div className="section-title"><h2>Supporting research</h2></div>
              {claim ? (
                <>
                  <p className="lede">
                    The analyst committed <strong>{claim.side ? 'TRUE' : 'FALSE'}</strong> and staked{' '}
                    <strong>{usdc(BigInt(claim.amount))} USDC</strong> of its own money on it.
                  </p>
                  {/* ⚠️ **The tie between a stake and the research behind it.** Unit 6c refuses a
                      commit whose report was never tokenized, so this hash is not decoration. */}
                  <a className="supporting-row" href={`/report/${claim.report_hash}`}>
                    <span className="supporting-thumbnail" aria-hidden="true">
                      <span className="mini-body">{Array.from({ length: 7 }, (_, i) => <span key={i} />)}</span>
                    </span>
                    <span>
                      <h3>{claim.directive ?? 'The report behind this claim'}</h3>
                      <p className="mono break">{claim.report_hash}</p>
                    </span>
                  </a>
                  {/* ⚠️ **The score, and two of the three are ABSENT rather than zero.**
                      Reconciliation is null on every stored report by design; a null return is
                      "not collected", not "earned nothing" — the contract is pull-based. */}
                  {(claim.forecast_correct !== null || market.resolved_at || market.voided_at) && (
                    <dl className="identity">
                      <div><dt>Forecast</dt><dd>{claim.forecast_correct === null
                        ? 'No outcome — voided, so neither right nor wrong'
                        : claim.forecast_correct ? 'Right' : 'Wrong'}</dd></div>
                      <div><dt>Reconciliation</dt><dd>{claim.reconciliation_quality ?? 'Not recorded — this report carries no verdict call'}</dd></div>
                      <div><dt>Returned</dt><dd className="mono">{claim.returned === null ? 'Not collected yet' : `${usdc(BigInt(claim.returned))} USDC`}</dd></div>
                    </dl>
                  )}
                  {/* ⚠️ MARKED: a market cites ONE report through one claim. The reference's list of
                      several has no source and is not invented. */}
                  <Unbuilt label="More supporting research">
                    <span className="btn outline sm">All reports on this market</span>
                  </Unbuilt>
                </>
              ) : (
                <p className="empty">No committed claim, so no report backs this market.</p>
              )}
              {recorded.length > 0 && (
                <div className="table-wrap">
                  <table className="financial-table">
                    <thead><tr><th>Staker</th><th>Side</th><th>Amount</th><th>Transaction</th></tr></thead>
                    <tbody>
                      {recorded.map((r) => (
                        <tr key={r.tx_hash}>
                          <td className="mono break">{r.staker}</td>
                          <td>{r.side ? 'TRUE' : 'FALSE'}</td>
                          <td className="mono">{usdc(BigInt(r.amount))} USDC</td>
                          <td className="mono"><a href={`https://testnet.arcscan.app/tx/${r.tx_hash}`} target="_blank" rel="noreferrer">{r.tx_hash.slice(0, 14)}…</a></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <details className="resolution-rules panel">
              <summary>Resolution criteria</summary>
              <p>
                {spec.metric} for <span className="mono">{spec.slug}</span>, read back from the
                deployment&rsquo;s daily snapshot for {spec.observedDay} UTC and compared{' '}
                {spec.comparison} ${grouped(spec.threshold)}. A tie resolves FALSE. Freshness is the
                subgraph&rsquo;s own <span className="mono">_meta</span> block timestamp, never a
                block number. A day that cannot be observed is retried until the resolve deadline and
                then <strong>voided</strong> — ⚠️ an absence of an outcome, never a wrong answer.
              </p>
              <dl className="identity">
                <div><dt>Market</dt><dd className="mono">#{id}</dd></div>
                <div><dt>Contract</dt><dd className="mono break">{market.contract_address}</dd></div>
                <div><dt>Staking closes</dt><dd className="mono">{when(market.close_time)}</dd></div>
                <div><dt>Observation ends</dt><dd className="mono">{when(market.observation_end)}</dd></div>
                <div><dt>Resolve deadline</dt><dd className="mono">{when(market.resolve_deadline)}</dd></div>
              </dl>
            </details>
          </section>
          {/* ⚠️ **The reference's dark aside, rendered by Unit 14's working control.** Its wallet
              plumbing, its exact BigInt wei arithmetic and its four pre-flight refusals are
              unchanged — `stake.tsx` now renders the reference's own inner skeleton around them.
              ⚠️ **The Outcome label, its combobox and its hidden <select> are CUT, not marked.**
              `stake(marketId, claimId)` takes no side; the contract reads it off the claim. A picker
              would let two people back opposite sides of one claim. Their presence is a bug. */}
          {claim ? (
            <Stake
              marketId={id} claimId={claim.chain_claim_id} side={claim.side} open={open}
              contractAddress={market.contract_address} rpcUrl={publicRpc}
              maxStakeWei={maxStake.toString()}
              initialPoolTrue={poolTrue.toString()} initialPoolFalse={poolFalse.toString()}
              callData={new ethers.Interface(MARKET_ABI).encodeFunctionData('stake', [BigInt(id), BigInt(claim.chain_claim_id)])} />
          ) : (
            <aside className="position-panel dark-panel">
              <h2>Your position</h2>
              <p>This market does not carry exactly one claim, so there is no single side to stake
                 alongside and nothing can be staked here.</p>
            </aside>
          )}
        </div>
      </main>
      
    </>
  );
}

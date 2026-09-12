// One market: the store's record of it, and the contract's word on the pools.
//
// ── ⚠️ TAKEN FROM `trash/app/markets/[id]/page.tsx`, WHICH WORKED BEFORE THE REBUILD ─────────────
//
//   the **market lookup by `chain_market_id` AND `contract_address`** — a chain id alone is not an
//     identity, since a redeployed contract restarts its numbering;
//   the **claims join** onto `reports` and `scores`;
//   the **`after_the_fact`** arithmetic that tells a rehearsal from a forecast;
//   the **public-RPC swap**: `ARC_RPC_URL` may carry a key, so a URL with credentials, a query or a
//     path is replaced by the public endpoint before it reaches anything a browser can read;
//   the **`stakes` table read** for who actually staked, with arcscan links;
//   the **void and resolved statements**, which are distinct and both real.
//
// ⚠️ **POOLS COME FROM THE CHAIN.** The store records what we saw; the contract is what is true.
//
// ── ⚠️ WHAT IS REAL AND WHAT IS NOT ──────────────────────────────────────────────────────────────
//
//   question, criterion, dates, contract address, claim, side, stake, report  real, from store+spec
//   pools, TRUE/FALSE %, the pool total                                       real, from the chain
//   the chart's SHAPE                                                         ⚠️ illustrative, and
//                                                                             labelled inside itself
//   category, "12 reports", a volume figure beyond the pool sum               ⚠️ do not exist here
//   staker counts                                                             only the `stakes` rows
//   probability                                                               ⚠️ a pool RATIO; with
//                                                                             one-sided pools, 100/0

import {notFound} from 'next/navigation.js';
import {ethers} from 'ethers';
import {ProbabilityChart, illustrativeSeries} from '../../components/ProbabilityChart.js';
import {StakeControl} from '../../components/StakeControl.js';
import {ArrowLeft, ArrowRight, ArrowUpRight, Clock} from '../../components/Icons.js';
import {db} from '../../../src/store/db.js';
import {requiredEnv} from '../../../src/config/env.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MARKET_ABI = [
  'function markets(uint256) view returns (bytes32 questionId, bytes32 specHash, uint64 closeTime, uint64 observationEnd, uint64 resolveDeadline, bool resolved, bool outcome, bool voided, bytes32 evidenceHash, uint256 poolTrue, uint256 poolFalse)',
  'function MAX_STAKE() view returns (uint256)',
];

/**
 * ⚠️ **The one function the panel calls, and the whole reason it is spelled out here.**
 * `stake(uint256 marketId, uint256 claimId) payable` — `AlphaMarket.sol:241`. It takes **no side**:
 * the contract reads the side off the claim, which is why the panel has no picker.
 */
const STAKE_IFACE = new ethers.Interface(['function stake(uint256 marketId, uint256 claimId) payable']);

interface Spec {
  slug: string; metric: string; comparison: 'above' | 'below'; threshold: string; observedDay: string;
}

const usdc = (wei: bigint): string => ethers.formatUnits(wei, 18);
const when = (d: Date) => `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
const grouped = (dec: string) => Number(dec).toLocaleString('en-US');

export default async function MarketDetail({params}: {params: Promise<{id: string}>}) {
  const {id} = await params;
  // ⚠️ **A CHAIN MARKET ID IS AN INTEGER.** The design's slugs (`lending-2027`) addressed markets
  // that never existed; `stake(marketId, claimId)` takes a uint256 and nothing else.
  if (!/^\d+$/.test(id)) notFound();

  const [market] = await db()<{
    id: string; spec_json: string; created_at: Date; close_time: Date; observation_end: Date;
    resolve_deadline: Date; contract_address: string; resolved_at: Date | null;
    voided_at: Date | null; outcome: boolean | null; after_the_fact: boolean;
  }[]>`
    SELECT id, spec_json, created_at, close_time, observation_end, resolve_deadline,
           contract_address, resolved_at, voided_at, outcome,
           (observation_end <= created_at) AS after_the_fact
      FROM markets
     WHERE chain_market_id = ${id}
       AND contract_address = ${requiredEnv('ARC_MARKET_ADDRESS')}`;
  // ⚠️ Scoped to the DEPLOYED contract. A chain id is only an identity within one deployment.
  if (!market) notFound();

  const claims = await db()<{
    id: string; chain_claim_id: string; author: string; side: boolean; amount: string;
    report_hash: string; directive: string | null; title: string | null;
    forecast_correct: boolean | null; reconciliation_quality: string | null; returned: string | null;
  }[]>`
    SELECT c.id, c.chain_claim_id, c.author, c.side, c.amount, c.report_hash,
           r.directive, r.title, s.forecast_correct, s.reconciliation_quality, s.returned
      FROM claims c
      LEFT JOIN reports r ON r.hash = c.report_hash
      LEFT JOIN scores  s ON s.market_id = c.market_id AND s.claim_id = c.id
     WHERE c.market_id = ${market.id} AND c.chain_claim_id IS NOT NULL
     ORDER BY c.created_at`;
  // ⚠️ Exactly one, or none. Two claims on one market would mean two sides to "join" and the
  // position panel could not name one — that case says so rather than picking.
  const claim = claims.length === 1 ? claims[0]! : null;

  const spec = JSON.parse(market.spec_json) as Spec;

  // ⚠️ **THE RPC URL A BROWSER MAY SEE.** `ARC_RPC_URL` can carry a key in its userinfo, query or
  // path. Anything but a bare host is replaced by the public endpoint before it is handed to a
  // client component. Taken from `trash/` unchanged — the leak it prevents is silent.
  const parsed = new URL(requiredEnv('ARC_RPC_URL'));
  const publicRpc =
    parsed.username || parsed.password || parsed.search || parsed.pathname !== '/'
      ? 'https://rpc.testnet.arc.network'
      : requiredEnv('ARC_RPC_URL');

  const contract = new ethers.Contract(
    market.contract_address,
    MARKET_ABI,
    new ethers.JsonRpcProvider(publicRpc, undefined, {staticNetwork: true}),
  );
  const onChain = await contract.markets!(BigInt(id));
  const maxStake = (await contract.MAX_STAKE!()) as bigint;
  const poolTrue = onChain.poolTrue as bigint;
  const poolFalse = onChain.poolFalse as bigint;
  const total = poolTrue + poolFalse;
  const staked = total > 0n;
  const truePct = staked ? Number((poolTrue * 1000n) / total) / 10 : null;
  const oneSided = staked && (poolTrue === 0n || poolFalse === 0n);

  const recorded = await db()<{staker: string; amount: string; side: boolean; tx_hash: string}[]>`
    SELECT staker, amount, side, tx_hash FROM stakes WHERE market_id = ${market.id} ORDER BY seq`;

  const open = Date.now() < market.close_time.getTime() && !market.resolved_at && !market.voided_at;
  const standing = market.voided_at
    ? 'Voided — no outcome, every stake refundable'
    : market.resolved_at
      ? `Resolved ${market.outcome ? 'TRUE' : 'FALSE'}`
      : open
        ? 'Open for staking'
        : Date.now() < market.observation_end.getTime()
          ? 'Staking closed — observing'
          : 'Awaiting settlement';

  // ⚠️ **FOUR STATES, AND THEY ARE CHECKED IN THIS ORDER ON PURPOSE.** A voided market may also
  // carry a close time in the past; the void is the more important fact and is tested first. A
  // resolved market is likewise never merely "closed".
  const panelState: 'open' | 'closed' | 'resolved' | 'voided' = market.voided_at
    ? 'voided'
    : market.resolved_at
      ? 'resolved'
      : open
        ? 'open'
        : 'closed';

  const heading = claim?.title ?? claim?.directive ?? 'The report behind this claim';

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
              {market.after_the_fact ? 'REHEARSAL' : 'FORECAST'} / MARKET #{id} · {standing.toUpperCase()}
            </div>
            <h1>
              Will {spec.slug}&rsquo;s {spec.metric} be {spec.comparison} ${grouped(spec.threshold)} on{' '}
              {spec.observedDay}?
            </h1>
            <p>
              Settled by re-reading the deployment&rsquo;s daily snapshot for {spec.observedDay} UTC
              from The Graph. A tie resolves FALSE.
            </p>

            {/* ⚠️ **A REHEARSAL MUST NEVER READ AS A FORECAST.** On chain a market over an
                already-observed day is indistinguishable from a real one, and nothing enforces the
                distinction but this. `observation_end <= created_at` is the test — arithmetic, not a
                naming convention, because one stored market's id contains the word "rehearsal" while
                being a forecast by that arithmetic. */}
            {market.after_the_fact && (
              <p className="market-statline" style={{display: 'block', lineHeight: 1.6}}>
                ⚠️ <strong>This is a rehearsal, not a forecast.</strong> The observed day
                ({spec.observedDay}) had already finished when this market was created on{' '}
                {when(market.created_at)}, so the answer was knowable at commit time. It exists to
                drive resolve, void and refund on chain. <strong>It counts towards nothing.</strong>
              </p>
            )}

            {/* ⚠️ **VOID AND RESOLVED ARE DIFFERENT STATES AND BOTH ARE REAL.** A void is the day
                being unobservable — an absence of an outcome, never a wrong answer, and every stake
                becomes refundable. A resolve is an answer. */}
            {market.voided_at && (
              <p className="market-statline" style={{display: 'block', lineHeight: 1.6}}>
                ⚠️ <strong>Voided {when(market.voided_at)}.</strong> The day could not be observed
                before the resolve deadline, so there is no outcome and every stake is refundable. A
                void is never a wrong answer and it does not score against the analyst.
              </p>
            )}
            {market.resolved_at && (
              <p className="market-statline" style={{display: 'block', lineHeight: 1.6}}>
                <strong>Resolved {market.outcome ? 'TRUE' : 'FALSE'}</strong> on{' '}
                {when(market.resolved_at)}, by re-reading the snapshot for {spec.observedDay} and
                comparing it {spec.comparison} ${grouped(spec.threshold)}.
              </p>
            )}
          </div>

          <div className="market-chart-panel panel">
            <div className="chart-top">
              <span className="eyebrow">POOL SHARE</span>
              {/* ⚠️ INERT, and it has to be: a time range needs a time series and none is stored. */}
              <div className="range-buttons">
                {['1D', '1W', '1M', 'All'].map((r) => (
                  <span key={r} className={r === 'All' ? 'active' : 'inert'} title="No series is stored, so there is no range to pick">
                    {r}
                  </span>
                ))}
              </div>
            </div>

            {staked ? (
              <ProbabilityChart
                series={illustrativeSeries(id, truePct!)}
                truePct={truePct!}
                falsePct={Number((100 - truePct!).toFixed(1))}
                illustrative
              />
            ) : (
              <p className="market-statline" style={{display: 'block', lineHeight: 1.6}}>
                Nothing has been staked on either side, so there is no pool and no ratio. Nothing is
                drawn here rather than a line at 50% — an empty pool is not an even split.
              </p>
            )}

            {/* ⚠️ **ONE-SIDED MUST NOT READ AS A LANDSLIDE.** Every pool in this deployment is
                one-sided. `payoutOf`'s `winningPool == 0` branch then returns each stake to the
                staker who made it — the contract working, not a fault. */}
            {oneSided && (
              <p className="market-statline" style={{display: 'block', lineHeight: 1.6}}>
                ⚠️ <strong>One-sided.</strong> Nobody has staked the other side, so 100% is not a
                weight of opinion — it is the only side with money on it. If it settles this way the
                parimutuel returns every stake to the staker who made it.
              </p>
            )}

            <div className="market-statline">
              <span>
                <Clock size={14} />
                {open ? `Staking closes ${when(market.close_time)}` : standing}
              </span>
              <span>{usdc(total)} USDC pool</span>
              <span>
                {recorded.length} recorded stake{recorded.length === 1 ? '' : 's'}
              </span>
            </div>

            {/* ⚠️ **SIDE / POOL / SHARE, and the third column is STATE — not a Back button.**
                `stake(marketId, claimId)` takes no side; the contract reads it off the claim, so a
                per-row action would build the hole the contract closed. These rows are display.
                Two of them, never three: the contract is binary. */}
            <div className="outcome-header">
              <span>OUTCOME</span>
              <span>POOL</span>
              <span>SHARE</span>
            </div>
            {([[true, poolTrue], [false, poolFalse]] as const).map(([side, amt]) => {
              const pct = staked ? Number((amt * 1000n) / total) / 10 : null;
              return (
                <div key={String(side)} className={claim?.side === side ? 'outcome-row chosen' : 'outcome-row'}>
                  <div>
                    <i className={side ? 'dot-true' : 'dot-false'} />
                    <strong>{side ? 'TRUE' : 'FALSE'}</strong>
                    {claim?.side === side && <span className="outcome-state">the analyst&rsquo;s side</span>}
                  </div>
                  <b className={side ? 'pct-true' : 'pct-false'}>{usdc(amt)}</b>
                  <span className="outcome-state">
                    {pct === null
                      ? '—'
                      : market.voided_at
                        ? 'refundable'
                        : market.resolved_at
                          ? market.outcome === side
                            ? 'WON'
                            : 'lost'
                          : `${pct}%`}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="supporting-research panel">
            <div className="section-title">
              <h2>Supporting research</h2>
              <span className="eyebrow">ONE CLAIM · ONE REPORT</span>
            </div>
            {claim ? (
              <>
                <p>
                  The analyst committed <strong>{claim.side ? 'TRUE' : 'FALSE'}</strong> and staked{' '}
                  <strong>{usdc(BigInt(claim.amount))} USDC</strong> of its own money on it.
                </p>
                {/* ⚠️ The tie between a stake and the research behind it. A commit is refused if the
                    report was never tokenized, so this hash is not decoration. */}
                <a className="supporting-row" href={`/report/${claim.report_hash}`}>
                  <div>
                    <span className="badge">CLAIM #{claim.chain_claim_id}</span>
                  </div>
                  <div>
                    <h3>{heading}</h3>
                    <p>{claim.report_hash}</p>
                    <span>Staked by {claim.author}</span>
                  </div>
                  <ArrowUpRight size={18} />
                </a>

                {/* ⚠️ **THE SCORE — AND TWO OF THE THREE ARE ABSENT RATHER THAN ZERO.**
                    Reconciliation quality is null on every stored report by design. A null return is
                    "not collected", not "earned nothing": the contract is pull-based. */}
                {(claim.forecast_correct !== null || market.resolved_at || market.voided_at) && (
                  <div className="market-statline" style={{display: 'block', lineHeight: 1.8}}>
                    <span>
                      Forecast:{' '}
                      {claim.forecast_correct === null
                        ? 'no outcome — voided, so neither right nor wrong'
                        : claim.forecast_correct
                          ? 'right'
                          : 'wrong'}
                    </span>
                    <br />
                    <span>
                      Reconciliation: {claim.reconciliation_quality ?? 'not recorded — this report carries no verdict call'}
                    </span>
                    <br />
                    <span>
                      Returned:{' '}
                      {claim.returned === null ? 'not collected yet' : `${usdc(BigInt(claim.returned))} USDC`}
                    </span>
                  </div>
                )}
              </>
            ) : (
              <p>No committed claim, so no report backs this market and there is no side to join.</p>
            )}

            {recorded.length > 0 && (
              <div className="table-wrap">
                <table className="financial-table full">
                  <thead>
                    <tr>
                      <th>Staker</th>
                      <th>Side</th>
                      <th>Amount</th>
                      <th>Transaction</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recorded.map((r) => (
                      <tr key={r.tx_hash}>
                        <td>{r.staker}</td>
                        <td>{r.side ? 'TRUE' : 'FALSE'}</td>
                        <td>{usdc(BigInt(r.amount))} USDC</td>
                        <td>
                          <a href={`https://testnet.arcscan.app/tx/${r.tx_hash}`} target="_blank" rel="noreferrer">
                            {r.tx_hash.slice(0, 14)}…
                          </a>
                        </td>
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
              {spec.metric} for {spec.slug}, read back from the deployment&rsquo;s daily snapshot for{' '}
              {spec.observedDay} UTC and compared {spec.comparison} ${grouped(spec.threshold)}. A tie
              resolves FALSE. Freshness is the subgraph&rsquo;s own <code>_meta</code> block
              timestamp, never a block number. A day that cannot be observed is retried until the
              resolve deadline and then <strong>voided</strong> — an absence of an outcome, never a
              wrong answer.
            </p>
            <div className="receipt-grid">
              <div>
                <small>Created</small>
                <code>{when(market.created_at)}</code>
              </div>
              <div>
                <small>Staking closes</small>
                <code>{when(market.close_time)}</code>
              </div>
              <div>
                <small>Observation ends</small>
                <code>{when(market.observation_end)}</code>
              </div>
              <div>
                <small>Resolve deadline</small>
                <code>{when(market.resolve_deadline)}</code>
              </div>
            </div>
          </details>
        </section>

        <aside className="position-panel dark-panel">
          <h2>Your position</h2>
          <p>
            {claim
              ? `A staker joins the analyst's claim, so the side is fixed at ${claim.side ? 'TRUE' : 'FALSE'}. There is no side to pick.`
              : 'This market carries no single claim, so there is no side to stake alongside.'}
          </p>

          {claim && (
            /* ⚠️ **THE CALLDATA IS ENCODED HERE, ON THE SERVER, AND ARRIVES AS A STRING.**
               `src/arc/abi.ts` carries the contract's full bytecode and must never reach a client
               component — the established pattern, and `trash/` did the same. The minimal inline
               fragment above is the only ABI this page needs, and the browser gets 68 bytes of hex
               rather than a compiler artefact. */
            <StakeControl
              marketId={id}
              claimId={claim.chain_claim_id}
              side={claim.side}
              sidePct={staked ? (claim.side ? truePct! : Number((100 - truePct!).toFixed(1))) : null}
              poolTrue={poolTrue.toString()}
              poolFalse={poolFalse.toString()}
              maxStakeWei={maxStake.toString()}
              contractAddress={market.contract_address}
              rpcUrl={publicRpc}
              callData={STAKE_IFACE.encodeFunctionData('stake', [BigInt(id), BigInt(claim.chain_claim_id)])}
              reportHash={claim.report_hash}
              reportTitle={heading}
              state={panelState}
              standing={standing}
              outcome={market.outcome}
            />
          )}

          <div className="arc-evidence">
            <span className="eyebrow">ARC / ONCHAIN EVIDENCE</span>
            <dl>
              <dt>Network</dt>
              <dd>Arc testnet · chain 5042002</dd>
              {/* ⚠️ **THE DEPLOYED CONTRACT, NOT `DEMO-lending-2027`.** Verified before shipping the
                  link: `eth_getCode` at this address returns 4,783 bytes on chain 5042002, so it is
                  a real deployed contract. ⚠️ arcscan's own 200 proves nothing — it is a
                  client-routed SPA that serves the same 93,894-byte shell for a nonsense address —
                  so the chain is what was checked, the way HashScan was checked against the Mirror
                  Node. */}
              <dt>Market contract</dt>
              <dd>{market.contract_address}</dd>
              <dt>Market</dt>
              <dd>#{id}</dd>
              <dt>Status</dt>
              <dd>{standing}</dd>
              <dt>Resolution data</dt>
              <dd>
                The Graph · {spec.slug} daily snapshot for {spec.observedDay}
              </dd>
              <dt>Outcome</dt>
              <dd>
                {market.voided_at
                  ? 'Voided — no outcome'
                  : market.resolved_at
                    ? market.outcome
                      ? 'TRUE'
                      : 'FALSE'
                    : 'Not settled yet'}
              </dd>
            </dl>
            <div className="button-row">
              <a
                className="text-link"
                href={`https://testnet.arcscan.app/address/${market.contract_address}`}
                target="_blank"
                rel="noreferrer"
              >
                View contract <ArrowUpRight size={13} />
              </a>
              <a className="text-link" href="/holdings">
                My holdings <ArrowRight size={13} />
              </a>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}

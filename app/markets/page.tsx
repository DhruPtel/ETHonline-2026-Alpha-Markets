// The market index, reading the store and the chain.
//
// ── ⚠️ WHAT WAS TAKEN FROM `trash/app/markets/page.tsx`, WHICH WORKED BEFORE THE REBUILD ─────────
//
//   **one SQL join** over `markets`, `claims`, `reports` and `scores` — not a query per card;
//   **the dedupe** that keeps the row carrying a claim when a market joins more than one;
//   **the rehearsal test** — a rehearsal is told apart by ARITHMETIC, never by a naming convention.
//     ⚠️ That matters here and is not theoretical: a stored market whose id literally contains the
//     word "rehearsal" is, by that arithmetic, a **forecast**. The id string is not evidence.
//     ⚠️ **The comparison itself now lives in `src/arc/rehearsal.ts` and is imported.** It had grown
//     three spellings across this file, `scripts/ops/score.ts` and the analyst page; this one used
//     to be the SQL alias `(m.observation_end <= m.created_at) AS after_the_fact`. Same rule, same
//     results — the two timestamps are selected and the predicate is applied here;
//   **one batched `eth_call` per on-chain market** for the pools, run with `Promise.all`;
//   **`standing()`**, the five states a market can be in;
//   **the forecasts / rehearsals split**, and the analyst's record excluding rehearsals.
//
// ⚠️ **POOLS COME FROM THE CHAIN, NOT THE DATABASE, AND THE PAGE SAYS SO.** The store records what
// we saw; the contract is what is true. A pool that could not be read is rendered as unknown rather
// than as zero — those are different facts and a zero is a claim.
//
// ── ⚠️ WHAT EACH FIELD IN THE DESIGN MAPS TO, AND WHAT HAS NOTHING BEHIND IT ─────────────────────
//
//   category           **NOTHING.** There is no category column. The slot carries the market's
//                      chain id, which is the true thing that tells one card from another.
//   status badge       `standing()` — real.
//   claim              the question, built from `spec_json`. Real.
//   criterion          how it settles. Real, from the spec.
//   chart              ⚠️ **ILLUSTRATIVE AND LABELLED AS SUCH IN THE CHART ITSELF.** Nothing stores
//                      a probability series and a parimutuel pool has no running probability, only
//                      its current ratio. See `ProbabilityChart`'s own header.
//   TRUE / FALSE %     the **pool ratio**, read from the contract. Real. ⚠️ Every pool here is
//                      one-sided, so it reads 100/0 — which is not a weight of opinion.
//   volume             `poolTrue + poolFalse`. Real, and small: 1.02 USDC across everything.
//   report count       **a market cites ONE claim which cites ONE report.** "12 reports" had no
//                      source. The slot says `1 report` or `no report`.
//   categories filter  **NOTHING.** Only `All` is passed; there is no column to filter on.

import {MarketFilters} from '../components/MarketFilters.js';
import {ProbabilityChart, illustrativeSeries} from '../components/ProbabilityChart.js';
import {ArrowRight, Check, Clock} from '../components/Icons.js';
import {analystRecord, recordLine} from '../components/GradeMarker.js';
import {db} from '../../src/store/db.js';
import {isRehearsal, pastPosted} from '../../src/arc/rehearsal.js';
import {requiredEnv} from '../../src/config/env.js';
import {ethers} from 'ethers';

export const runtime = 'nodejs';

/** ⚠️ Pools are read per request. A build-time snapshot would freeze a number that moves on a stake. */
export const dynamic = 'force-dynamic';

const MARKET_ABI = [
  'function markets(uint256) view returns (bytes32 questionId, bytes32 specHash, uint64 closeTime, uint64 observationEnd, uint64 resolveDeadline, bool resolved, bool outcome, bool voided, bytes32 evidenceHash, uint256 poolTrue, uint256 poolFalse)',
];

interface Spec {
  slug: string; metric: string; comparison: 'above' | 'below'; threshold: string; observedDay: string;
}

interface Row {
  id: string;
  chain_market_id: string | null;
  spec_json: string;
  created_at: Date;
  close_time: Date;
  observation_end: Date;
  /** ⚠️ The column, not `spec.observedDay` parsed out of the JSON beside it — `pastPosted()` takes
      the stored day, and two ways of reading one date is two answers waiting to differ. */
  observed_day: string;
  resolved_at: Date | null;
  voided_at: Date | null;
  outcome: boolean | null;
  claim_id: string | null;
  side: boolean | null;
  report_hash: string | null;
  forecast_correct: boolean | null;
}

/** ⚠️ USDC on Arc is native gas at 18 decimals on a token the world knows as 6. */
const usdc = (wei: bigint): string => ethers.formatUnits(wei, 18);
const grouped = (decimal: string) => Number(decimal).toLocaleString('en-US');

/** The five states a market can be in. ⚠️ A void is an absence of an outcome, never a wrong answer. */
function standing(r: Row): string {
  if (r.voided_at) return 'Voided';
  if (r.resolved_at) return `Resolved ${r.outcome ? 'TRUE' : 'FALSE'}`;
  if (!r.chain_market_id) return 'Not on chain';
  if (Date.now() < r.close_time.getTime()) return 'Open';
  if (Date.now() < r.observation_end.getTime()) return 'Observing';
  return 'Awaiting settlement';
}

export default async function MarketIndex() {
  const rows = await db()<Row[]>`
    SELECT m.id, m.chain_market_id, m.spec_json, m.created_at, m.close_time, m.observation_end,
           m.observed_day,
           m.resolved_at, m.voided_at, m.outcome,
           c.id AS claim_id, c.side, c.report_hash,
           s.forecast_correct
      FROM markets m
      LEFT JOIN claims  c ON c.market_id = m.id
      LEFT JOIN reports r ON r.hash = c.report_hash
      LEFT JOIN scores  s ON s.market_id = m.id AND s.claim_id = c.id
     ORDER BY m.created_at DESC`;

  // ⚠️ One row per market: a market with two claims would otherwise render twice. The row carrying
  // a claim wins, because a claim is what a card has something to say about.
  const seen = new Map<string, Row>();
  for (const r of rows) {
    const key = r.chain_market_id ?? r.id;
    const held = seen.get(key);
    if (!held || (!held.claim_id && r.claim_id)) seen.set(key, r);
  }
  const all = [...seen.values()];
  const onChain = all.filter((r) => r.chain_market_id);
  const offChain = all.filter((r) => !r.chain_market_id);
  // ⚠️ **PAST-POSTED MARKETS LEAVE BOTH BUCKETS, AND THE HEADINGS ARE WHY.** "Forecasts" sits under
  // the eyebrow THE ANSWER WAS NOT KNOWABLE AT COMMIT TIME, which is **flatly false** of a demo
  // market — its staking was open after the day it measures. It is not a rehearsal either: something
  // was staked on it, by someone, for real. Leaving it in either section would put a true-looking
  // heading over a false claim, which is worse than not listing it.
  //
  // ⚠️ **SO IT IS CURRENTLY NOT LISTED ON THIS PAGE AT ALL, AND THAT IS A KNOWN GAP, NOT A FIX.**
  // PHASE-8 §2.9 specifies a third `Demo` section with its own copy, and that is Task 5's work — it
  // needs a new `kind` on `card()` and the section text written. Until then the record line below is
  // the only place these appear, and it names them. **Listing them wrongly is the one thing that
  // could not wait; listing them rightly can.**
  const demos = onChain.filter((r) => pastPosted(r.close_time, r.observed_day));
  const forecasts = onChain.filter(
    (r) => !isRehearsal(r.observation_end, r.created_at) && !pastPosted(r.close_time, r.observed_day),
  );
  const rehearsals = onChain.filter(
    (r) => isRehearsal(r.observation_end, r.created_at) && !pastPosted(r.close_time, r.observed_day),
  );

  // ⚠️ **THE POOLS, FROM THE CONTRACT, BATCHED.** One `eth_call` per on-chain market in parallel —
  // not one page-blocking round trip each. A failed read leaves the key absent, and an absent pool
  // renders as unknown rather than as zero.
  const contract = new ethers.Contract(
    requiredEnv('ARC_MARKET_ADDRESS'),
    MARKET_ABI,
    new ethers.JsonRpcProvider(requiredEnv('ARC_RPC_URL'), undefined, {staticNetwork: true}),
  );
  const pools = new Map<string, {t: bigint; f: bigint}>();
  await Promise.all(
    onChain.map(async (r) => {
      try {
        const m = await contract.markets!(BigInt(r.chain_market_id!));
        pools.set(r.chain_market_id!, {t: m.poolTrue as bigint, f: m.poolFalse as bigint});
      } catch {
        /* absent — rendered as unknown, never as zero */
      }
    }),
  );

  const totalPool = [...pools.values()].reduce((a, p) => a + p.t + p.f, 0n);
  // ⚠️ **"OPEN" MEANS OPEN FOR STAKING, NOT MERELY UNSETTLED.** I first counted every forecast that
  // was neither resolved nor voided, and the header then read "2 OPEN FORECASTS" over two cards
  // whose own badges said "Observing" — staking on both closed on 2026-09-11 23:59 UTC. A header
  // that contradicts the cards beneath it is worse than a zero.
  const openCount = forecasts.filter(
    (r) => !r.resolved_at && !r.voided_at && Date.now() < r.close_time.getTime(),
  ).length;

  // ⚠️ **THE ANALYST'S RECORD — ASKED IN ONE PLACE, NOT DERIVED FROM THE CARDS ABOVE.** This used to
  // be `forecasts.filter(...)`, counting only markets that had reached this page's `onChain` filter,
  // and it therefore said *"no forecast has settled yet"* while `/analyst` said *"5 settled"*. Two
  // pages answering one question differently is worse than either answer. `analystRecord()` counts
  // **graded claims**, which is what a grade is a property of — see its own header.
  const record = await analystRecord();

  const card = (r: Row, kind: 'forecast' | 'rehearsal' | 'offchain') => {
    const spec = JSON.parse(r.spec_json) as Spec;
    const p = r.chain_market_id ? pools.get(r.chain_market_id) : undefined;
    const total = p ? p.t + p.f : null;
    const staked = total !== null && total > 0n;
    const truePct = staked ? Number((p!.t * 1000n) / total!) / 10 : null;
    const question = `Will ${spec.slug}'s ${spec.metric} be ${spec.comparison} $${grouped(spec.threshold)} on ${spec.observedDay}?`;
    const resolved = r.resolved_at !== null || r.voided_at !== null;
    const Card = (r.chain_market_id ? 'a' : 'div') as 'a';

    return (
      <Card
        key={r.id}
        className="prediction-card"
        {...(r.chain_market_id ? {href: `/markets/${r.chain_market_id}`} : {})}
      >
        <div className="prediction-card-meta">
          {/* ⚠️ There is no category column. The chain id is the true identifier. */}
          <span>{r.chain_market_id ? `Market #${r.chain_market_id}` : 'Off chain'}</span>
          <span className={resolved ? 'badge resolved' : 'badge'}>
            {resolved ? <Check size={12} /> : <Clock size={12} />} {standing(r)}
          </span>
        </div>

        <h2>{question}</h2>
        <p>
          Settled by re-reading the deployment&rsquo;s daily snapshot for {spec.observedDay} UTC from
          The Graph. A tie resolves FALSE.
        </p>

        {/* ⚠️ No pool, no chart. A market nobody has staked has no ratio, and drawing 50/50 or 100/0
            over an empty pool would be the one invented number on this page. */}
        {staked ? (
          <ProbabilityChart
            series={illustrativeSeries(r.chain_market_id ?? r.id, truePct!)}
            truePct={truePct!}
            falsePct={100 - truePct!}
            compact
            illustrative
          />
        ) : (
          <p className="market-statline" style={{padding: '14px 0'}}>
            {p ? 'Nothing staked on either side' : 'Pool unavailable — the contract could not be read'}
          </p>
        )}

        <div className="prediction-outcomes">
          <div>
            <span>
              <i className="dot-true" />
              TRUE{r.side === true ? ' · analyst' : ''}
            </span>
            <b>{truePct === null ? '—' : `${truePct}%`}</b>
          </div>
          <div>
            <span>
              <i className="dot-false" />
              FALSE{r.side === false ? ' · analyst' : ''}
            </span>
            <b>{truePct === null ? '—' : `${(100 - truePct).toFixed(1).replace(/\.0$/, '')}%`}</b>
          </div>
        </div>

        <div className="prediction-card-footer">
          {/* ⚠️ Volume is the pool sum and nothing else. No invented figure. */}
          <span>{total === null ? 'no pool' : `${usdc(total)} USDC pool`}</span>
          {/* ⚠️ A market cites ONE claim which cites ONE report. */}
          <span>{r.report_hash ? '1 report' : 'no report'}</span>
        </div>

        <div className="market-open-action">
          {!r.chain_market_id
            ? 'Not on chain yet'
            : resolved
              ? 'View market results'
              : 'View market & stake'}{' '}
          <ArrowRight size={17} />
        </div>
      </Card>
    );
  };

  return (
    <main className="page-container markets-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">CONVICTION MEETS THE MARKET</span>
          <h1>Prediction markets</h1>
          <p>Back a claim. Let the evidence speak.</p>
        </div>
        <div className="market-count">
          <span>
            {forecasts.length} FORECAST{forecasts.length === 1 ? '' : 'S'} · {openCount} OPEN FOR STAKING
          </span>
          <span>{usdc(totalPool)} USDC staked in total</span>
        </div>
      </div>

      {/* ⚠️ Only `All` is passed. The design's Lending / Stablecoins / DEXs chips filter on a column
          that does not exist, and three chips that cannot narrow anything are three lies. */}
      <MarketFilters
        categories={['All']}
        activeCategory="All"
        status="All statuses"
        marketCount={all.length}
      />

      <div className="results-meta">
        <span>The analyst&rsquo;s record</span>
        {/* ⚠️ The same string `/analyst` renders, from the same function, so they cannot word it
            differently either. */}
        <span>{recordLine(record)}</span>
        <span>
          rehearsals excluded
          {demos.length > 0 ? ` · ${demos.length} demo market not listed yet` : ''}
        </span>
      </div>

      <div className="section-title">
        <h2>Forecasts</h2>
        <span className="eyebrow">THE ANSWER WAS NOT KNOWABLE AT COMMIT TIME</span>
      </div>
      {forecasts.length === 0 ? (
        <p className="market-statline">No forecasts on chain.</p>
      ) : (
        <div className="prediction-grid">{forecasts.map((r) => card(r, 'forecast'))}</div>
      )}

      {/* ⚠️ **A REHEARSAL MUST NOT READ AS A FORECAST, AND NOTHING ON CHAIN ENFORCES THAT BUT US.**
          A market created over a day that had already closed had a knowable answer when the analyst
          committed. Showing them in one undifferentiated grid would be a lie about the record. */}
      {rehearsals.length > 0 && (
        <>
          <div className="section-title">
            <h2>Rehearsals</h2>
            <span className="eyebrow">THE ANSWER WAS ALREADY KNOWN</span>
          </div>
          <p className="market-statline" style={{display: 'block', lineHeight: 1.6}}>
            Created over days that had <strong>already closed</strong>, so the answer was knowable
            when the analyst committed. They exist to drive resolve, void and refund on chain before a
            real market needed them. <strong>None is a forecast and none counts towards the record.</strong>
          </p>
          <div className="prediction-grid">{rehearsals.map((r) => card(r, 'rehearsal'))}</div>
        </>
      )}

      {offChain.length > 0 && (
        <>
          <div className="section-title">
            <h2>Not on chain</h2>
            <span className="eyebrow">NOTHING TO STAKE ON</span>
          </div>
          <p className="market-statline" style={{display: 'block', lineHeight: 1.6}}>
            Created in the store and never landed on chain, so there is no contract entry, no pool and
            nothing to stake. A directed market waits here until the commit cron reaches it.
          </p>
          <div className="prediction-grid">{offChain.map((r) => card(r, 'offchain'))}</div>
        </>
      )}

      <p className="market-statline" style={{display: 'block', lineHeight: 1.6}}>
        ⚠️ Pools are read from the contract on every request, not from our database — the store
        records what we saw and the contract is what is true. Two of the three scores are absent
        rather than shown as zero: reconciliation quality is null on every stored report by design,
        and trading return has no source until payouts are recorded.
      </p>
    </main>
  );
}

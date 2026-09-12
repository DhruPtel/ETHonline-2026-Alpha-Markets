// Every market, and the analyst's record across them.
//
// ⚠️ **THE QUERIES ARE PHASE 4'S AND THEY DID NOT CHANGE — the layout is `markets.html`'s.** One
// database query, one batched chain call, and the rule that tells a forecast from a rehearsal are
// exactly as Unit 13 wrote them. What changed is what the rows are rendered into.
//
// ⚠️ **A server component reading the store directly — no API route, and none should be added.**
// `app/page.tsx` argues this for the report index and the same argument holds: a route here would be
// a second copy of the query behind a fetch the server makes to itself. Routes start where a paying
// agent needs an HTTP contract, not where a browser reads HTML.
//
// ⚠️ **Plain `<a href>`, not `next/link`.** `app/page.tsx`'s header has the full reason: under
// `nodenext`, `next/link.js` is CJS and a default import binds `module.exports` rather than the
// component. Named imports from `next/navigation.js` are unaffected.
//
// ── ⚠️ TWO ROUND TRIPS, AND THAT IS THE POINT OF THE UNIT ────────────────────────────────────────
//
//   1 · **One SQL query** — markets, their claim, the report behind it and its score, in a single
//       `LEFT JOIN`. ⚠️ Not one query per row: `app/page.tsx` learned that with `tokensFor`, and a
//       list page that fans out per row is the thing that costs when a design arrives and the list
//       gets longer.
//   2 · **One batched `eth_call`** — every market's pools in a single HTTP request. `ethers`'
//       `JsonRpcProvider` coalesces calls made in one tick into a JSON-RPC batch, so `Promise.all`
//       over N markets is one round trip rather than N.
//
// ⚠️ **Pools come from the CHAIN, never from `stakes`.** Unit 14 set this and its page says why: the
// table records what we were told about, the contract records what it holds, and only one of those
// is the money.
//
// ⚠️ **A minimal inline ABI, never `src/arc/abi.ts`** — that artifact carries creation and deployed
// bytecode. This is a server component so nothing here ships to a browser either way, but the rule
// is about the traced function size as much as the bundle.
//
// ── ⚠️ EVERY MARKET IS NOT EQUAL, AND SHOWING THEM ALIKE WOULD BE A LIE ──────────────────────────
//
// PHASE-4 states it: *"a market over an already-observed day is indistinguishable on chain from a
// forecast. Nothing enforces the distinction but us."* So this page enforces it, and it does so from
// a **property of the data rather than from a naming convention**:
//
//   **`observation_end <= created_at`** — the day being measured had already finished when the
//   market was created, so the commit could not have been a prediction. That is a rehearsal.
//
// ⚠️ It agrees with the `m/rehearsal-` id prefix on every row today, and it is the better test:
// a prefix is a promise someone kept, and this is arithmetic on the row. A rehearsal is labelled as
// a machinery proof wherever it appears and is never counted in the record.
//
// ⚠️ **A market with no `chain_market_id` was never created on chain** — nothing to stake on, no
// pools to read, no transaction to link. Listed last and separately rather than hidden, because one
// of them is a real directed market still waiting for the commit cron.
//
// ⚠️ **Chain market 1 does not appear, and that is correct.** It is stranded and empty and has no
// store row, so there is no question text, no spec and no claim — nothing this page could say about
// it is known. The index shows what the store can describe; a market it cannot describe is one it
// should not invent a row for.

import { ethers } from 'ethers';
import { db } from '../../src/store/db.js';
import { requiredEnv } from '../../src/config/env.js';
import { SiteHeader } from '../ui/chrome.js';
import { Unbuilt } from '../ui/unbuilt.js';

export const runtime = 'nodejs';

// ⚠️ Per request, not per build — `app/page.tsx`'s reason applies unchanged: a prerendered list
// freezes at deploy time and reads as the store being broken.
export const dynamic = 'force-dynamic';

/** ⚠️ Only what this page reads. See the header. */
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
  resolved_at: Date | null;
  voided_at: Date | null;
  outcome: boolean | null;
  contract_address: string | null;
  directed_at: string | null;
  after_the_fact: boolean;
  claim_id: string | null;
  chain_claim_id: string | null;
  side: boolean | null;
  amount: string | null;
  report_hash: string | null;
  directive: string | null;
  forecast_correct: boolean | null;
  reconciliation_quality: string | null;
  returned: string | null;
}

const usdc = (wei: bigint): string => ethers.formatUnits(wei, 18);
const when = (d: Date) => `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
const grouped = (decimal: string) => Number(decimal).toLocaleString('en-US');
const BOUND = 120;
const bound = (s: string) => (s.length > BOUND ? `${s.slice(0, BOUND)}…` : s);

/** Where a market stands, in the words a reader needs. ⚠️ A void is never a wrong answer. */
function standing(r: Row): string {
  if (r.voided_at) return 'Voided — no outcome, every stake refunded';
  if (r.resolved_at) return `Resolved ${r.outcome ? 'TRUE' : 'FALSE'}`;
  if (!r.chain_market_id) return 'Not on chain yet';
  if (Date.now() < r.close_time.getTime()) return 'Open for staking';
  if (Date.now() < r.observation_end.getTime()) return 'Staking closed — observing';
  return 'Awaiting settlement';
}

export default async function MarketsIndex() {
  // ── 1 · One query. Market, its claim, the report behind it, and Unit 15's score for it. ────────
  const rows = await db()<Row[]>`
    SELECT m.id, m.chain_market_id, m.spec_json, m.created_at, m.close_time, m.observation_end,
           m.resolved_at, m.voided_at, m.outcome, m.contract_address, m.directed_at,
           (m.observation_end <= m.created_at) AS after_the_fact,
           c.id AS claim_id, c.chain_claim_id, c.side, c.amount, c.report_hash,
           r.directive,
           s.forecast_correct, s.reconciliation_quality, s.returned
    FROM markets m
    LEFT JOIN claims  c ON c.market_id = m.id
    LEFT JOIN reports r ON r.hash = c.report_hash
    LEFT JOIN scores  s ON s.market_id = m.id AND s.claim_id = c.id
    ORDER BY m.created_at DESC`;

  // ⚠️ **Two store rows can observe ONE chain market** — Unit 9's `reconcile` fixture is exactly
  // that, and listing chain market 8 twice would tell a reader something untrue. A market's public
  // identity is its chain id, so that is the key; the row carrying a claim wins, since it is the one
  // with something to show. Rows never created on chain keep their store id and cannot collide.
  const seen = new Map<string, Row>();
  for (const r of rows) {
    const key = r.chain_market_id ?? r.id;
    const held = seen.get(key);
    if (!held || (!held.claim_id && r.claim_id)) seen.set(key, r);
  }
  const all = [...seen.values()];

  const onChain = all.filter((r) => r.chain_market_id);
  const offChain = all.filter((r) => !r.chain_market_id);
  const forecasts = onChain.filter((r) => !r.after_the_fact);
  const rehearsals = onChain.filter((r) => r.after_the_fact);

  // ── 2 · One batched chain call. Every market's pools in a single JSON-RPC request. ─────────────
  const provider = new ethers.JsonRpcProvider(requiredEnv('ARC_RPC_URL'), undefined, { staticNetwork: true });
  const contract = new ethers.Contract(requiredEnv('ARC_MARKET_ADDRESS'), MARKET_ABI, provider);
  const pools = new Map<string, { t: bigint; f: bigint }>();
  await Promise.all(onChain.map(async (r) => {
    // ⚠️ Per market, so one unreadable market leaves the rest of the page standing. A list that
    // fails whole because one row failed is a worse page than one that says which row is unknown.
    try {
      const m = await contract.markets!(BigInt(r.chain_market_id!));
      pools.set(r.chain_market_id!, { t: m.poolTrue as bigint, f: m.poolFalse as bigint });
    } catch { /* left absent — rendered as unknown rather than as zero */ }
  }));

  // ⚠️ **The record counts SETTLED FORECASTS ONLY.** A rehearsal is a machinery proof and counting
  // one would inflate a track record with markets whose answer was already known.
  const scored = forecasts.filter((r) => r.forecast_correct !== null || r.voided_at);
  const right = scored.filter((r) => r.forecast_correct === true).length;
  const wrong = scored.filter((r) => r.forecast_correct === false).length;
  const voided = scored.filter((r) => r.voided_at).length;

  // ── The card. ⚠️ `markets.html`'s `.prediction-card`. ─────────────────────────────────────────
  //
  // ⚠️ **The reference's card carries a sparkline, a percentage per outcome, a five-figure USDC
  // volume and "12 reports". Three of those four have no source and are NOT invented:**
  //   sparkline  → nothing stores a probability series; there is ONE stake row in the database.
  //                The slot holds the POOL BAR instead — two real pools, read from the contract.
  //   volume     → real, and it is `poolTrue + poolFalse`. Today that is 1.01 USDC on market 6 and
  //                0.01 on market 7. Small numbers, truthfully.
  //   N reports  → a market has ONE claim citing ONE report. The card links to that report.
  //   category   → marked; no column exists.
  const card = (r: Row, kind: 'forecast' | 'rehearsal' | 'offchain') => {
    const spec = JSON.parse(r.spec_json) as Spec;
    const p = r.chain_market_id ? pools.get(r.chain_market_id) : undefined;
    const total = p ? p.t + p.f : null;
    const pct = (v: bigint) => (total && total > 0n ? Number((v * 1000n) / total) / 10 : null);
    const question = `Will ${spec.slug}’s ${spec.metric} be ${spec.comparison} $${grouped(spec.threshold)} on ${spec.observedDay}?`;
    const Card = r.chain_market_id ? 'a' : 'div';

    return (
      <Card key={r.id} className={`prediction-card${kind === 'forecast' ? '' : ` ${kind}`}`}
            {...(r.chain_market_id ? { href: `/markets/${r.chain_market_id}` } : {})}>
        {/* 1 · meta — the reference has a category left and a status badge right. ⚠️ There is no
               category column, so the left slot carries the market's chain identity, which is
               the true thing that distinguishes one card from another. */}
        <div className="prediction-card-meta">
          <span>{r.chain_market_id ? `Market #${r.chain_market_id}` : 'Off chain'}</span>
          <span className="badge">{standing(r)}</span>
        </div>

        {/* 2 · the question */}
        <h2>{question}</h2>

        {/* 3 · the criterion line */}
        <p>Settled by re-reading the deployment’s daily snapshot for {spec.observedDay} UTC from
           The Graph. A tie resolves FALSE.</p>

        {/* 4 · the chart area. ⚠️ **THE SECTION IS PRESENT.** The reference draws a probability
               series here; nothing stores one and there is one human stake in the database, so the
               same slot at the same height carries the two POOLS instead — real, read from the
               contract on this request, and the only thing here that moves when somebody stakes. */}
        <div className="prediction-chart compact">
          <div className="chart-container" role="img"
               aria-label={total && total > 0n ? `Pool split: TRUE ${pct(p!.t)}%, FALSE ${pct(p!.f)}%` : 'No stake on either side'}>
            {total && total > 0n ? (
              <>
                <div className="pool-track">
                  <span className="pool-true" style={{ width: `${pct(p!.t)}%` }} />
                  <span className="pool-false" style={{ width: `${pct(p!.f)}%` }} />
                </div>
                <span className="market-statline" style={{ border: 0, padding: 0 }}>
                  pool, not probability
                </span>
              </>
            ) : p ? (
              <p className="empty">No stake on either side yet.</p>
            ) : (
              // ⚠️ Unreadable is not zero.
              <p className="empty">Pool unavailable — the contract could not be read.</p>
            )}
          </div>
        </div>

        {/* 5 · outcome rows — the reference's dot, label and percentage. ⚠️ Two sides, never three:
               the contract is binary. And these are DISPLAY; there is no per-row action. */}
        <div className="prediction-outcomes">
          {([['TRUE', p?.t, 'var(--chart-1)'], ['FALSE', p?.f, 'var(--chart-2)']] as const).map(([label, amt, colour]) => (
            <div key={label}>
              <span><i style={{ background: colour }} />{label}
                {r.side !== null && ((label === 'TRUE') === r.side) ? ' · analyst' : ''}</span>
              <b>{amt === undefined ? '—' : pct(amt) === null ? `${usdc(amt)} USDC` : `${pct(amt)}%`}</b>
            </div>
          ))}
        </div>

        {/* 6 · footer — the reference's volume and report count. ⚠️ Volume is real and it is small:
               `poolTrue + poolFalse`. "12 reports" has no source — a market has ONE claim citing
               ONE report — so the slot says which. */}
        <div className="prediction-card-footer">
          <span>{total !== null ? `${usdc(total)} USDC vol.` : 'no pool'}</span>
          <span>{r.report_hash ? '1 report' : 'no report'}</span>
        </div>

        {/* 7 · the footer action */}
        <div className="market-open-action">
          {r.chain_market_id ? 'View market & stake' : 'Not on chain yet'}
          <span aria-hidden="true">→</span>
        </div>
      </Card>
    );
  };

  const openCount = forecasts.filter((r) => !r.resolved_at && !r.voided_at).length;

  return (
    <>
      <SiteHeader current="/markets" />
      <main className="page-container markets-page">
        <div className="page-heading">
          <div>
            <span className="eyebrow">Conviction meets the market</span>
            <h1>Prediction markets</h1>
            <p>Back an outcome. Let the evidence speak.</p>
          </div>
          <div className="market-count">
            <span>{openCount} open market{openCount === 1 ? '' : 's'}</span>
            <span>Settlement on Arc</span>
          </div>
        </div>

        <div className="market-tabs">
          <span className="active">All predictions<span className="count">{all.length}</span></span>
          {/* ⚠️ MARKED. "My positions" needs an identity system; there is none. */}
          <Unbuilt label="My positions">
            <span>My positions<span className="count">0</span></span>
          </Unbuilt>
        </div>

        <div className="filter-bar">
          <Unbuilt label="Search">
            <span className="search-field">Search markets</span>
          </Unbuilt>
          <Unbuilt label="Filtering by category">
            <span className="filter-chips">
              <span className="active">All</span><span>Lending</span><span>Stablecoins</span><span>DEXs</span>
            </span>
          </Unbuilt>
        </div>

        {/* ⚠️ **THE ANALYST'S RECORD, AND IT IS WHY A REPORT IS WORTH PAYING FOR.** Designed for its
            EMPTY case first, because `scores` has zero rows and the empty case is what ships until
            markets 6 and 7 settle. Never dressed as a zero. */}
        <div className="results-meta">
          <span>The analyst&rsquo;s record</span>
          <span>
            {scored.length === 0
              ? 'no forecast has settled yet'
              : `${scored.length} settled — ${right} right, ${wrong} wrong, ${voided} voided`}
          </span>
          <span>rehearsals excluded</span>
        </div>

        <h2 className="section-title"><span>Forecasts</span></h2>
        {forecasts.length === 0
          ? <p className="empty">No forecasts on chain.</p>
          : <div className="prediction-grid">{forecasts.map((r) => card(r, 'forecast'))}</div>}

        <h2 className="section-title"><span>Rehearsals</span></h2>
        <p className="meta">
          ⚠️ Created over days that had <strong>already closed</strong>, so the answer was knowable
          when the analyst committed. They exist to drive resolve, void and refund on chain before a
          real market needed them. <strong>None is a forecast and none counts towards the record.</strong>
        </p>
        {rehearsals.length === 0
          ? <p className="empty">No rehearsal markets.</p>
          : <div className="prediction-grid">{rehearsals.map((r) => card(r, 'rehearsal'))}</div>}

        {offChain.length > 0 && (
          <>
            <h2 className="section-title"><span>Not on chain</span></h2>
            <p className="meta">
              Created in the store and never landed on chain — nothing to stake on and no pools to
              read. A directed market waits here until the commit cron reaches it.
            </p>
            <div className="prediction-grid">{offChain.map((r) => card(r, 'offchain'))}</div>
          </>
        )}

        <p className="meta">
          Pools are read from the contract on every request, not from our database. ⚠️ Two of the
          three scores §5.12 defines are not shown because nothing produces them yet: reconciliation
          quality is null on every stored report by design, and trading return has no source until
          payouts are recorded. <strong>They are absent here rather than displayed as zero.</strong>
        </p>
      </main>
    </>
  );
}

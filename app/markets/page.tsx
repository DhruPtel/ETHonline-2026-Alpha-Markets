// Every market, and the analyst's record across them.
//
// ⚠️ **THE VISUALS HERE ARE DISPOSABLE AND THE QUERIES ARE NOT.** Designs land after this unit, so
// nothing below reaches for a new class — `globals.css` is untouched and every `className` already
// exists. What this file settles is the data: one database query, one batched chain call, and the
// rule that tells a forecast from a rehearsal.
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

  const card = (r: Row) => {
    const spec = JSON.parse(r.spec_json) as Spec;
    const p = r.chain_market_id ? pools.get(r.chain_market_id) : undefined;
    return (
      <li key={r.id}>
        {r.chain_market_id
          ? <a href={`/markets/${r.chain_market_id}`}>
              Will {spec.slug}&rsquo;s {spec.metric} be {spec.comparison} ${grouped(spec.threshold)} on {spec.observedDay}?
            </a>
          : <span>Will {spec.slug}&rsquo;s {spec.metric} be {spec.comparison} ${grouped(spec.threshold)} on {spec.observedDay}?</span>}
        <div className="meta">
          {r.chain_market_id ? <span>Market #{r.chain_market_id}</span> : <span>Not on chain</span>}
          <strong>{standing(r)}</strong>
          {r.after_the_fact && <strong>Rehearsal — not a forecast</strong>}
          {/* ⚠️ Pools read from the contract. An unreadable market says so rather than showing 0. */}
          {p
            ? <span>Pool {usdc(p.t + p.f)} USDC ({usdc(p.t)} TRUE / {usdc(p.f)} FALSE)</span>
            : r.chain_market_id ? <span>Pool unavailable</span> : null}
          {r.side !== null
            ? <span>Analyst said {r.side ? 'TRUE' : 'FALSE'}{r.amount ? ` · ${usdc(BigInt(r.amount))} USDC` : ''}</span>
            : <span>No analyst claim</span>}
          <span>{when(r.created_at)}</span>
        </div>
        {/* ⚠️ **The claim cites a report, and that tie is the product's central sentence.** A stake
            is backed by published research; without this link the page asserts that and shows it
            nowhere. */}
        {r.report_hash && (
          <div className="meta">
            <a href={`/report/${r.report_hash}`}>{r.directive ? bound(r.directive) : 'The report behind this claim'}</a>
          </div>
        )}
        {r.report_hash && <div className="mono hash">{r.report_hash}</div>}
      </li>
    );
  };

  return (
    <main>
      <header className="masthead">
        <h1>Markets</h1>
        <p className="lede">
          The analyst publishes research, then stakes its own USDC on a claim about what a
          deployment&rsquo;s figures will do. Settlement re-reads The Graph and scores it.
        </p>

        {/* ⚠️ **THE RECORD, AND IT IS WHY A REPORT IS WORTH PAYING FOR.** Unit 15 computes these and
            until now nothing read them. ⚠️ Two of §5.12's three scores are structurally blank today
            and are shown as ABSENT rather than as zero — see the note below, which stays until they
            have a source. */}
        <p className="lede">
          <strong>The analyst&rsquo;s record:</strong>{' '}
          {scored.length === 0
            ? 'no forecast has settled yet. Rehearsals are excluded — they are machinery proofs over days that had already closed.'
            : `${scored.length} settled forecast${scored.length === 1 ? '' : 's'} — ${right} right, ${wrong} wrong, ${voided} voided. A void is not a wrong answer: the data was missing, so there was no outcome.`}
        </p>
      </header>

      <h2>Forecasts</h2>
      {forecasts.length === 0
        ? <p className="empty">No forecasts on chain.</p>
        : <ol className="reports">{forecasts.map(card)}</ol>}

      <h2>Rehearsals</h2>
      <p className="meta">
        ⚠️ Created over days that had <strong>already closed</strong>, so the answer was knowable when
        the analyst committed. They exist to drive resolve, void and refund on chain before a real
        market needed them. <strong>None of these is a forecast and none counts towards the record.</strong>
      </p>
      {rehearsals.length === 0
        ? <p className="empty">No rehearsal markets.</p>
        : <ol className="reports">{rehearsals.map(card)}</ol>}

      {offChain.length > 0 && (
        <>
          <h2>Not on chain</h2>
          <p className="meta">
            Created in the store and never landed on chain — nothing to stake on and no pools to
            read. A directed market waits here until the commit cron reaches it.
          </p>
          <ol className="reports">{offChain.map(card)}</ol>
        </>
      )}

      <p className="meta">
        Pools are read from the contract on every request, not from our database. Two of the three
        scores §5.12 defines are not shown because nothing produces them yet: reconciliation quality
        is null on every stored report by design, and trading return has no source until payouts are
        recorded. They are absent here rather than displayed as zero.
      </p>
    </main>
  );
}

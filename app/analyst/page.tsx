// The analyst's own page — what it was graded on, what it holds, what it has written.
//
// This is where the loop becomes visible. Everything else on this site shows one step: the console
// generates, the marketplace sells, a market page takes a position. **This is the only page that
// shows the step closing** — a claim staked, settled on chain, graded, and the grade sitting beside
// the transaction a stranger can check it against.
//
// ── ⚠️ READS THE STORE AND THE CHAIN DIRECTLY. IT DOES NOT FETCH `/api/holdings` ─────────────────
//
// `app/api/holdings/route.ts` returns very nearly this section's data and **is deliberately not
// called here.** A server component fetching a route the same server serves is an HTTP round trip to
// itself to run a query it could run — `app/page.tsx`'s header refuses the same thing for the same
// reason. The route stays as a product API for callers that are not this page; the ~20 lines of
// `balanceOf` below are the cost of not going through it, and they are the cheaper half.
//
// ── ⚠️ THREE COUNTS. NEVER A PERCENTAGE. AT ANY LEVEL OF AGGREGATION ────────────────────────────
//
// **Right, wrong and void are three outcomes and this page reports three numbers.** A percentage
// needs a denominator and there is no honest one: counting voids punishes the analyst for a day the
// subgraph could not be read, and excluding them silently changes the denominator between two
// records that look comparable. `/markets` already states it as *"N settled — R right, W wrong"* and
// this page uses that same shape, because two surfaces phrasing one record differently is how a
// reader learns to trust neither.
//
// ⚠️ **A VOID IS NOT A LOSS.** It links `void_tx`, it reads *voided*, and it is counted in neither
// column. `score.ts` writes `forecast_correct = null` for exactly this reason and nothing here
// overrides it.
//
// ── ⚠️ EVERY GRADE CARRIES THE TRANSACTION IT RESTS ON, AND THE LINK WAS VERIFIED ON THE RPC ─────
//
// A grade is a judgement about a claim that settled on chain, and the settlement transaction is what
// a stranger follows to check it rather than take our word. `scores → claims → markets` yields
// `resolve_tx` on a resolved market and `void_tx` on a voided one — **one score shows one
// transaction and which one depends on how it settled.**
//
// ⚠️ **arcscan's status code proves nothing** — it is a client-routed SPA that serves the same shell
// for a nonsense path, the same trap HashScan set. So the three settlement transactions in the store
// were checked with `eth_getTransactionReceipt` on the Arc RPC before this page shipped a link to
// any of them: all three return `status 1` against contract `0x003e7Cb7…`, and a nonsense hash
// returns null from the same call. The RPC is the check; the link is only a convenience.
//
// ⚠️ A score whose market carries neither transaction is **surfaced as "no transaction recorded"
// rather than hidden.** That state is a bug in the settlement path, and a blank cell would be the
// one place this page quietly agreed to hide one.
//
// ── ⚠️ THE REHEARSAL RULE, AND WHY THIS IS THE THIRD COPY OF IT ─────────────────────────────────
//
// **A market created over a day that had already closed is not a forecast** — the answer was knowable
// at commit time — so it is excluded from the record. The test is arithmetic, `observationEnd <=
// createdAt`, and **never the name**: a stored market whose id literally contains "rehearsal" can be
// a forecast by that arithmetic.
//
// ⚠️ **This is the third place that comparison is written** — `app/markets/page.tsx` has it in SQL,
// `scripts/ops/score.ts` in TypeScript, and now here in SQL again. **It should be a helper and this
// task could not make it one**: the brief's files are `app/analyst/`, the nav and `app/holdings/`,
// and a shared helper belongs in `src/`, which is out of scope. Recorded rather than worked around —
// the next task that may touch `src/` should lift all three into one function.
//
// ⚠️ **The exclusion is printed, never applied silently**, so a reader who counts the settled
// markets themselves and gets a different number can see why.
//
// ── ⚠️ WHAT IS ABSENT, AND WHY NONE OF IT IS A ZERO ─────────────────────────────────────────────
//
//   trading return    `payouts` has no writer, so it is null for **every** claim. Rendered `—`.
//                     ⚠️ An analyst that has not collected has not lost. A `0.00` in this column
//                     would be a claim about money that nobody has measured.
//   reconciliation    `verdict.call` is null on every stored report — all of them are the
//                     metric-across-deployments shape, whose verdict has no single figure to stand
//                     behind. A fact about the report, not a missing grade.
//   an ungraded claim **no row at all.** `scoreMarket` writes nothing for an unsettled market, so an
//                     absent grade is absent rather than pending-looking.
//
// ── ⚠️ JOINS ON `markets.id`, NEVER `chain_market_id` ───────────────────────────────────────────
//
// Two market rows share `chain_market_id = '8'` on the same contract — one carries `resolve_tx` and
// one does not. Anything joining display data on the chain id picks whichever the planner returns
// first. `scores.market_id` is a foreign key to `markets.id` and that is what every join below uses.

import {ethers} from 'ethers';
import {ArrowUpRight} from '../components/Icons.js';
import {ANALYSTS} from '../../src/config/analysts.js';
import {fetchJson, MIRROR} from '../../src/tokenize/hedera.js';
import type {MirrorAccount} from '../../src/tokenize/hedera.js';
import {list} from '../../src/store/reports.js';
import {tokensFor} from '../../src/store/tokens.js';
import {db} from '../../src/store/db.js';

export const runtime = 'nodejs';

/**
 * ⚠️ **Load-bearing.** Without it Next prerenders this at build time and freezes the record at
 * whatever was in Neon when the deploy ran — which is exactly what left `/holdings` rendering a
 * static const. A page about a record that updates cannot be static.
 */
export const dynamic = 'force-dynamic';

/** ⚠️ One standard ERC-20 view. Not the typechain factory — see `/api/holdings`'s header. */
const BALANCE_OF = ['function balanceOf(address) view returns (uint256)'];

/** ⚠️ USDC on Arc is native gas at 18 decimals. Matches `app/markets/page.tsx`'s own helper. */
const usdc = (wei: string): string => ethers.formatUnits(BigInt(wei), 18);

/** ⚠️ An em dash is an absence. A zero is a measurement. These are not interchangeable. */
const DASH = '—';

interface ScoreRow {
  claim_id: string;
  chain_claim_id: string | null;
  chain_market_id: string | null;
  market_id: string;
  side: boolean;
  staked: string;
  returned: string | null;
  forecast_correct: boolean | null;
  reconciliation_quality: string | null;
  scored_at: Date;
  settled_at: Date | null;
  resolve_tx: string | null;
  void_tx: string | null;
  after_the_fact: boolean;
  report_hash: string;
  title: string | null;
  directive: string;
}

interface TokenRow {
  report_hash: string;
  proxy_address: string;
  isin: string;
  title: string | null;
  directive: string;
  issued_at: Date;
}

/** Cut a directive to a table-sized heading at a word boundary. Mirrors `app/page.tsx`. */
function shorten(text: string, max: number): string {
  const t = text.trim().replace(/[?.]+$/, '');
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}

export default async function Analyst() {
  const analyst = ANALYSTS[0]!;

  // ── 1 · The record. ⚠️ One join, on `markets.id`. ──────────────────────────────────────────────
  const scores = await db()<ScoreRow[]>`
    SELECT s.claim_id, s.staked, s.returned, s.forecast_correct, s.reconciliation_quality,
           s.scored_at,
           c.chain_claim_id, c.side, c.report_hash,
           m.id AS market_id, m.chain_market_id, m.resolve_tx, m.void_tx,
           COALESCE(m.resolved_at, m.voided_at) AS settled_at,
           (m.observation_end <= m.created_at) AS after_the_fact,
           r.title, r.directive
      FROM scores s
      JOIN claims  c ON c.id   = s.claim_id
      JOIN markets m ON m.id   = s.market_id
      JOIN reports r ON r.hash = c.report_hash
     ORDER BY COALESCE(m.resolved_at, m.voided_at) DESC`;

  // ⚠️ Rehearsals are excluded from the RECORD, not from the table — they are still shown, marked,
  // and left out of the counts. Hiding them would make the counts unauditable.
  const graded = scores.filter((s) => !s.after_the_fact);
  const right = graded.filter((s) => s.forecast_correct === true).length;
  const wrong = graded.filter((s) => s.forecast_correct === false).length;
  const voided = graded.filter((s) => s.forecast_correct === null).length;
  const rehearsed = scores.length - graded.length;

  // ── 2 · Holdings. ⚠️ `balanceOf` on chain, never `report_tokens.transfer_tx`. ──────────────────
  // The column records what we last sent; the chain records what is. A token can also be sent
  // somewhere neither account controls, which the column cannot express and a balance read shows
  // plainly as held by neither.
  const tokenRows = await db()<TokenRow[]>`
    SELECT t.report_hash, t.proxy_address, t.isin, t.issued_at, r.title, r.directive
      FROM report_tokens t
      JOIN reports r ON r.hash = t.report_hash
     ORDER BY t.issued_at DESC`;

  const rpc = process.env.HEDERA_TESTNET_RPC?.trim() || null;
  const buyerId = process.env.HEDERA_BUYER_ID?.trim() || null;

  // The buyer has no config row — it is not an analyst. Its EVM form is READ from Mirror Node,
  // which is the account's own answer about itself rather than ours about it.
  const buyerEvm = buyerId
    ? (await fetchJson<MirrorAccount>(`${MIRROR}/api/v1/accounts/${buyerId}`).catch(() => null))?.evm_address ?? null
    : null;

  /** ⚠️ `null` means the balance could not be read — which is not the same as a zero balance. */
  const heldBy = new Map<string, 'analyst' | 'buyer' | 'elsewhere' | null>();
  if (rpc) {
    const provider = new ethers.JsonRpcProvider(rpc);
    await Promise.all(tokenRows.map(async (t) => {
      const contract = new ethers.Contract(t.proxy_address, BALANCE_OF, provider);
      const read = async (addr: string | null): Promise<bigint | null> => {
        if (!addr) return null;
        try { return BigInt(String(await contract.balanceOf!(addr))); } catch { return null; }
      };
      const [a, b] = await Promise.all([read(analyst.hederaEvmAddress), read(buyerEvm)]);
      // ⚠️ Both reads failing is "unreadable", not "elsewhere". Two different facts.
      if (a === null && b === null) heldBy.set(t.report_hash, null);
      else if (a === 1n) heldBy.set(t.report_hash, 'analyst');
      else if (b === 1n) heldBy.set(t.report_hash, 'buyer');
      else heldBy.set(t.report_hash, 'elsewhere');
    }));
  }
  const stillHeld = [...heldBy.values()].filter((v) => v === 'analyst').length;

  // ── 3 · Reports generated. ⚠️ One `list()` and ONE batched `tokensFor` — never a lookup per row. ─
  const reports = await list(500);
  const tokens = await tokensFor(reports.map((r) => r.hash));
  const published = reports.filter((r) => r.publishedAt !== null).length;

  /** The settlement transaction for one score, and which one it is. */
  const settlement = (s: ScoreRow): {label: string; tx: string} | null =>
    s.resolve_tx ? {label: 'resolve', tx: s.resolve_tx}
      : s.void_tx ? {label: 'void', tx: s.void_tx}
        : null;

  return (
    <main className="page-container holdings-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">THE RECORD THAT MAKES THE NEXT REPORT WORTH READING</span>
          <h1>The analyst</h1>
          <p>
            {analyst.displayName} stakes its own USDC on claims drawn from its research. Settlement
            re-reads The Graph and grades them, and the grades go back into how the next report is
            planned.
          </p>
        </div>
        <div className="market-count">
          <span>
            {graded.length} CLAIM{graded.length === 1 ? '' : 'S'} GRADED · {reports.length} REPORT
            {reports.length === 1 ? '' : 'S'} WRITTEN
          </span>
          <span>
            <code>{analyst.arcAddress.slice(0, 10)}…</code> on Arc testnet
          </span>
        </div>
      </div>

      {/* ⚠️ Three counts, side by side, with the exclusion stated beside them — the same shape
          `/markets` uses. Never one percentage. */}
      <div className="results-meta">
        <span>The record</span>
        <span>
          {graded.length === 0
            ? 'no claim has been graded yet'
            : `${graded.length} settled — ${right} right, ${wrong} wrong, ${voided} voided`}
        </span>
        <span>rehearsals excluded{rehearsed > 0 ? ` · ${rehearsed} not counted` : ''}</span>
      </div>

      <div className="holdings-panel panel">
        <div className="section-title">
          <div>
            <span className="eyebrow">SETTLED ON CHAIN / GRADED</span>
            <h2>Graded claims</h2>
          </div>
          <span className="badge">
            {scores.length} {scores.length === 1 ? 'row' : 'rows'}
          </span>
        </div>

        {/* ⚠️ **THE EMPTY STATE IS THE ONE THIS PAGE IS BUILT FOR.** `scores` has no rows until
            markets 6 and 7 settle, and "no claim has been graded yet" is NOT a zero score — a
            record of nothing and a record of failure must never look alike. */}
        {scores.length === 0 ? (
          <div className="empty-state">
            <h2>No claim has been graded yet</h2>
            <p>
              This is not a score of zero — it is the absence of one. Two claims are staked on
              markets that settle once their observation day closes and the resolve cron reads The
              Graph. The moment one settles, its grade appears here beside the Arc transaction that
              settled it.
            </p>
            <a className="btn primary" href="/markets">See the open markets</a>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="financial-table">
              <thead>
                <tr>
                  <th>Grade</th>
                  <th>Report</th>
                  <th>Market</th>
                  <th>Side</th>
                  <th>Staked</th>
                  <th>Returned</th>
                  <th>Settlement</th>
                </tr>
              </thead>
              <tbody>
                {scores.map((s) => {
                  const tx = settlement(s);
                  const heading = s.title ?? shorten(s.directive, 46);
                  return (
                    <tr key={s.claim_id}>
                      <td>
                        {/* ⚠️ VOIDED is `.badge.off` — the existing greyed variant, which reads as
                            an absence. RIGHT and WRONG carry the word and no colour: the palette
                            has five neutral colours and no green or red, and inventing a pair here
                            would be inventing a look. The green/red/grey treatment is Task 4's,
                            and it should land on this table and the report cards together. */}
                        <span className={s.forecast_correct === null ? 'badge off' : 'badge'}>
                          {s.forecast_correct === null ? 'VOIDED'
                            : s.forecast_correct ? 'RIGHT' : 'WRONG'}
                        </span>
                        {s.after_the_fact && <span className="holdings-sub">rehearsal · not counted</span>}
                      </td>
                      <td>
                        <a href={`/report/${s.report_hash}`}>
                          <strong>{heading}</strong>
                          <span className="holdings-sub">{s.report_hash.slice(0, 16)}…</span>
                        </a>
                      </td>
                      <td>
                        {s.chain_market_id ? (
                          <a href={`/markets/${s.chain_market_id}`} className="text-link">
                            Market #{s.chain_market_id}
                          </a>
                        ) : DASH}
                        <span className="holdings-sub">
                          claim {s.chain_claim_id ?? DASH}
                        </span>
                      </td>
                      <td>{s.side ? 'TRUE' : 'FALSE'}</td>
                      <td>{usdc(s.staked)} USDC</td>
                      {/* ⚠️ Null is an em dash and a stated reason, never 0.00. `payouts` has no
                          writer, so this is every row. Not collected is not lost. */}
                      <td>
                        {s.returned === null ? DASH : `${usdc(s.returned)} USDC`}
                        {s.returned === null && <span className="holdings-sub">no payout recorded</span>}
                      </td>
                      <td>
                        {tx ? (
                          <a
                            className="text-link"
                            href={`https://testnet.arcscan.app/tx/${tx.tx}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {tx.label} <ArrowUpRight size={13} />
                          </a>
                        ) : (
                          /* ⚠️ Surfaced, not hidden. A settled market with no transaction is a bug
                             in the settlement path and a blank cell would conceal it. */
                          <span>settled, no transaction recorded</span>
                        )}
                        {s.settled_at && (
                          <span className="holdings-sub">
                            {s.settled_at.toISOString().slice(0, 10)}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Holdings ─────────────────────────────────────────────────────────────────────────── */}
      <div className="holdings-panel panel">
        <div className="section-title">
          <div>
            <span className="eyebrow">HEDERA / ATS SECURITIES ISSUED BY THIS ANALYST</span>
            <h2>Holdings</h2>
          </div>
          <span className="badge">
            {stillHeld} of {tokenRows.length} still held
          </span>
        </div>

        {tokenRows.length === 0 ? (
          <div className="empty-state">
            <h2>No report has been tokenized</h2>
            <p>Tokenizing a report issues an ATS security carrying the report&rsquo;s hash. None has been issued yet.</p>
            <a className="btn primary" href="/console#tokenize">Tokenize a report</a>
          </div>
        ) : (
          <>
            {!rpc && (
              <p className="market-statline" style={{display: 'block', lineHeight: 1.6}}>
                ⚠️ <strong>HEDERA_TESTNET_RPC is not set</strong>, so balances could not be read from
                the chain. The tokens below are listed from the store; where each one is now is
                unknown rather than assumed.
              </p>
            )}
            <div className="table-scroll">
              <table className="financial-table">
                <thead>
                  <tr>
                    <th>Report</th>
                    <th>ISIN</th>
                    <th>Held by</th>
                    <th>Issued</th>
                    <th>Security</th>
                  </tr>
                </thead>
                <tbody>
                  {tokenRows.map((t) => {
                    const where = heldBy.get(t.report_hash);
                    return (
                      <tr key={t.proxy_address}>
                        <td>
                          <a href={`/report/${t.report_hash}`}>
                            <strong>{t.title ?? shorten(t.directive, 46)}</strong>
                            <span className="holdings-sub">{t.report_hash.slice(0, 16)}…</span>
                          </a>
                        </td>
                        <td><code>{t.isin}</code></td>
                        {/* ⚠️ From `balanceOf`, not from our record of who we sent it to. An
                            unreadable balance says so rather than defaulting to "elsewhere". */}
                        <td>
                          {where === 'analyst' ? 'This analyst'
                            : where === 'buyer' ? 'Buyer agent'
                              : where === 'elsewhere' ? 'Neither account'
                                : 'Unreadable'}
                        </td>
                        <td>{t.issued_at.toISOString().slice(0, 10)}</td>
                        <td>
                          <a
                            className="text-link"
                            href={`https://hashscan.io/testnet/contract/${t.proxy_address}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            HashScan <ArrowUpRight size={13} />
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* ── Reports generated ────────────────────────────────────────────────────────────────── */}
      <div className="holdings-panel panel">
        <div className="section-title">
          <div>
            <span className="eyebrow">EVERYTHING THIS ANALYST HAS WRITTEN</span>
            <h2>Reports generated</h2>
          </div>
          <span className="badge">
            {published} of {reports.length} published
          </span>
        </div>

        {reports.length === 0 ? (
          <div className="empty-state">
            <h2>No reports yet</h2>
            <p>Generate one in the console and it appears here.</p>
            <a className="btn primary" href="/console">Open the console</a>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="financial-table">
              <thead>
                <tr>
                  <th>Report</th>
                  <th>Generated</th>
                  <th>Tokenized</th>
                  <th>Published</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => {
                  const token = tokens.get(r.hash);
                  return (
                    <tr key={r.hash}>
                      <td>
                        <a href={`/report/${r.hash}`}>
                          <strong>{r.title ?? shorten(r.directive, 52)}</strong>
                          <span className="holdings-sub">{r.hash.slice(0, 16)}…</span>
                        </a>
                      </td>
                      <td>{r.createdAt.toISOString().slice(0, 10)}</td>
                      {/* ⚠️ A tokenized report and an untokenized one must not look alike — the
                          second is not a faded version of the first. */}
                      <td>{token ? <code>{token.isin}</code> : <span className="badge off">No</span>}</td>
                      <td>
                        {r.publishedAt
                          ? r.publishedAt.toISOString().slice(0, 10)
                          : <span className="badge off">Not listed</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="market-statline" style={{display: 'block', lineHeight: 1.6}}>
        ⚠️ Grades come from <code>scores</code>, written when a market settles — never when this page
        is read. Holdings are <code>balanceOf</code> on Hedera, read per request, because the store
        records what we last sent and the chain records what is. Trading return is absent rather than
        zero on every row: <code>payouts</code> has no writer yet, and an analyst that has not
        collected has not lost. Reconciliation quality is null on every stored report by design.
        Rehearsals — markets created over a day that had already closed — are shown, marked, and
        counted towards nothing.
      </p>
    </main>
  );
}

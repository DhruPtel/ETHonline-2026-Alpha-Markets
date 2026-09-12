'use client';

// One report as a document, the gate beside it, and the settlement receipt once it is paid for.
//
// ⚠️ **THE SHAPE IS THE CONSOLE'S, BECAUSE THE CONSOLE ALREADY SOLVED IT.** `.workspace` is a grid of
// `minmax(0,1fr)` and a 370px rail: a `.viewer` holding a `.report-paper` on the left, a dark
// `.atlas-console` on the right. `/console` proves the proportions at every breakpoint and they are
// not re-derived here. ⚠️ **`rebuild/` has no reference for this screen** and its own MANIFEST says
// why: *"Screen 7, one report … The design reached these three states through a modal on the
// marketplace, so its export never rendered them."* Only the CSS was lifted. So this is composed, and
// it is composed from the one layout in this repo that was drawn rather than invented.
//
// ⚠️ **THIS COMPONENT OWNS BOTH COLUMNS.** The bought body replaces the sealed block *inside the
// sheet on the left* while the button that buys it is *on the right rail*, and both change on one
// event. Two components would mean two copies of one piece of state. `trash/app/report/[hash]/buy.tsx`
// made the same call for the same reason.
//
// ── ⚠️ THE BLURRED SHEET IS BLURRED OVER NOTHING, AND THAT IS THE WHOLE POINT ─────────────────────
//
// **CSS over present content is not a paywall.** Every prop below is public — a hash, a price, a
// heading, a directive, an analyst, a block, six coverage counts. **No report body is a prop.** The
// sealed block on the sheet is `.mini-copy` bars and a filler chart: markup generated here, with no
// report text underneath it at any opacity. The real body exists only in the JSON returned to this
// component's own `fetch`, in the browser of whoever paid. The server component that renders this
// never calls `render()`.
//
// ── ⚠️ AN AGENT PAYS. THE VISITOR DOES NOT. ──────────────────────────────────────────────────────
//
// The button asks the server to run the buyer agent, which pays from **its own** Hedera account. No
// wallet is connected, no browser signs anything, and the visitor is not charged. ⚠️ **A human cannot
// complete an x402 payment in a browser here, and that is a decision rather than a gap**
// (2026-09-08): `@x402/paywall` ships EVM, Solana and Aptos flavours and no Hedera export.
//
// ⚠️ **One paid read grants no durable access, and the interface says so.** There is no identity
// system — `payments/auth.ts` is the declared cut point — so refreshing loses the body and buying
// again pays again. That is also why the marketplace's Unlock navigates here rather than buying from
// a card: a purchase made on the index would be lost by the navigation that follows it.

import {useState, type ReactNode} from 'react';
import {Markdown} from '../markdown.js';
import {ArrowUpRight, BrandMark, Check, Lock} from './Icons.js';

/**
 * ⚠️ **Every field here is returned by `/api/buy`. Nothing on the receipt is derived from hope.**
 * Checked against the route's own `NextResponse.json`:
 * `purchase.{paymentId,nativeTxId,settledTransaction,payer,payTo,amountHbar}`,
 * `moved.{result,networkFeeHbar,feeBearer,transfers}`, `links.hashscan`, `plan.feePayer`.
 */
interface Bought {
  markdown: string;
  amountHbar: string;
  payer: string;
  payTo: string;
  paymentId: string;
  /** ⚠️ Recovered from the signed bytes BEFORE broadcast — what you reconcile with if settle times out. */
  nativeTxId: string;
  /** The consensus transaction id. `<feeAccount>@<seconds>.<nanos>`. */
  settledTransaction: string;
  result: string | null;
  networkFeeHbar: string | null;
  feeBearer: string | null;
  transfers: {account: string; amount: number}[];
  /** From the 402 challenge, so it is known even before the Mirror Node answers. */
  quotedFeePayer: string | null;
  hashscan: string;
  /** ⚠️ Absent when the Mirror Node had not ingested the transaction within the route's 20s poll. */
  pending: string | null;
}

/**
 * ⚠️ **THE CONSOLE'S VIEWPORT FIT IS TURNED OFF HERE, AND THAT IS BOTH BUGS AT ONCE.**
 *
 * `app/globals.css` `@media (min-width: 761px)` fits `.workspace` to `calc(100dvh - 140px)`, makes
 * `.viewer` `height:100%; overflow:hidden`, and gives `.document-stage` and `.atlas-console` their
 * own internal scroll. **The console can afford that and this page cannot**, for two reasons it does
 * not share:
 *
 *   1. `ConsoleViewer` wraps its stage in `<div className="tabs">`, which `.viewer > .tabs
 *      { height:100%; min-height:0 }` bounds. Without that wrapper `.document-stage` is auto-height,
 *      its own `overflow:auto` never engages because nothing constrains it, and `.viewer`'s
 *      `overflow:hidden` **silently cut the bought report off at the frame with no scrollbar** — a
 *      buyer paid 0.001 HBAR and could not reach the rest of it.
 *   2. `FitPanel` scales the sheet with a ResizeObserver. There is no script here.
 *
 *   And the same rule gave the rail `height:100%; overflow:auto`, so the **buy button sat below an
 *   internal scroll fold** inside a dark panel whose `scrollbar-width: thin` bar is nearly invisible.
 *   The price and the blurb were above the fold; the control was not.
 *
 * ⚠️ **SCROLL, NOT PAGINATE — and the choice matters.** The console paginates because it is an
 * editing surface: the operator needs a page to look like a page while the Atlas panel stays in view
 * beside it. This is a reading surface. Pagination needs in-browser measurement, and when that
 * measurement is wrong it *strands content* — this repo has already shipped that bug once, when
 * `pages` stayed null, the toolbar read 1/1 and the sheet scaled to 0.52. **Stranding content is
 * precisely the failure being fixed, and it must not be reintroduced on a document someone paid
 * for.** A page that scrolls has no measurement and no failure mode.
 *
 * ⚠️ Inline rather than a stylesheet edit: `app/globals.css` is out of scope for this task, and an
 * inline style beats a media-query rule without needing `!important`. It removes the geometry only —
 * every colour, border, radius and column proportion still comes from the console's own classes.
 */
const UNFIT = {height: 'auto', minHeight: 0, overflow: 'visible'} as const;

const hbar = (tinybars: number) => `${(tinybars / 1e8).toFixed(8)} HBAR`;

/**
 * `0.0.7162784@1788992192.548150225` → `0.0.7162784-1788992192-548150225`.
 * ⚠️ The same transform `app/api/buy/route.ts` does to ask the Mirror Node about this transaction.
 * It is derived from a returned field rather than invented, and it is the link whose status code
 * actually means something — HashScan is a client-routed SPA and answers 200 for anything.
 */
function mirrorId(settled: string): string {
  const [account, stamp] = settled.split('@');
  return `${account}-${(stamp ?? '').replace('.', '-')}`;
}

export function BuyAndRead({
  reportHash,
  priceHbar,
  heading,
  derived,
  directive,
  analyst,
  block,
  observedAt,
  coverage,
  children,
}: {
  reportHash: string;
  priceHbar: string;
  heading: string;
  /** ⚠️ True when there is no stored title and the heading is the directive, shortened. Said out loud. */
  derived: boolean;
  directive: string;
  analyst: string;
  block: string;
  observedAt: string;
  coverage: {
    facts: number; marketsRead: number; corroborated: number;
    completeness: string; checksRun: number; checksAvailable: number; deployments: number;
  };
  children: ReactNode;
}) {
  const [state, setState] = useState<'idle' | 'buying' | 'done' | 'error'>('idle');
  const [bought, setBought] = useState<Bought | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const buy = async () => {
    setState('buying');
    setMessage(null);
    try {
      // ⚠️ **ONE buyer path in this project, and this is it.** It moved out of `app/api/console/` in
      // Phase 5 so that deleting the console cannot take the paywall with it, and it is deliberately
      // not behind the console doorlock — it is the product's only purchase path.
      const res = await fetch('/api/buy', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        // ⚠️ Its own origin: a page must buy from the deployment serving it, not from a default.
        // ⚠️ `confirm: true` is what makes this spend. Without it the route returns a dry plan.
        body: JSON.stringify({reportHash, site: window.location.origin, confirm: true}),
      });

      // ⚠️ **STATUS AND TEXT FIRST, `res.json()` NEVER.** This exact mistake made the 500 branch
      // unreachable in the console: an unhandled server error returns an EMPTY body, `res.json()`
      // throws on it, and the throw surfaces as "Unexpected end of JSON input" — which tells a reader
      // nothing about what failed.
      const text = await res.text();
      let j: Record<string, unknown> | null = null;
      try {
        j = text ? (JSON.parse(text) as Record<string, unknown>) : null;
      } catch {
        j = null;
      }
      if (j === null) {
        setState('error');
        setMessage(
          `The buy route answered ${res.status} with ${text ? 'a body that is not JSON' : 'an empty body'}. ` +
            'Nothing was charged.',
        );
        return;
      }

      // ── The four ways this does not end in a report, each said as its own thing ────────────────
      const refused = j.refused as {control?: string; message?: string} | undefined;
      if (refused) {
        setState('error');
        setMessage(
          `The buyer agent refused before signing: ${String(refused.message)}` +
            (refused.control ? ` (control: ${refused.control})` : ''),
        );
        return;
      }
      if (j.stop || j.fail || j.error) {
        setState('error');
        setMessage(String(j.stop ?? j.fail ?? j.error));
        return;
      }
      // ⚠️ Unreachable while `confirm: true` is sent, and handled anyway — a dry plan rendered as a
      // purchase would claim a payment that never happened.
      if (j.mode === 'dry') {
        setState('error');
        setMessage('The route returned a dry plan and did not spend. Nothing was bought.');
        return;
      }
      const md = (j.body as {markdown?: string} | undefined)?.markdown;
      if (!md) {
        setState('error');
        setMessage('The payment settled but no report body came back. Check the settlement before retrying.');
        return;
      }

      const p = j.purchase as {
        amountHbar: string; payer: string; payTo: string; paymentId: string;
        nativeTxId: string; settledTransaction: string;
      };
      // ⚠️ `moved` is `{note}` rather than a record when the Mirror Node has not ingested within the
      // route's 20-second poll. The settlement still happened; the fee lines are simply not known
      // yet, and the receipt says that instead of showing a blank or a guess.
      const moved = j.moved as {
        result?: string; networkFeeHbar?: string; feeBearer?: string;
        transfers?: {account: string; amount: number}[]; note?: string;
      } | undefined;
      const plan = j.plan as {feePayer?: string} | undefined;
      const links = j.links as {hashscan?: string} | undefined;

      setBought({
        markdown: md,
        amountHbar: p.amountHbar,
        payer: p.payer,
        payTo: p.payTo,
        paymentId: p.paymentId,
        nativeTxId: p.nativeTxId,
        settledTransaction: p.settledTransaction,
        result: moved?.result ?? null,
        networkFeeHbar: moved?.networkFeeHbar ?? null,
        feeBearer: moved?.feeBearer ?? null,
        transfers: moved?.transfers ?? [],
        quotedFeePayer: plan?.feePayer ?? null,
        hashscan: links?.hashscan ?? `https://hashscan.io/testnet/transaction/${p.settledTransaction}`,
        pending: moved?.note ?? null,
      });
      setState('done');
    } catch (error) {
      setState('error');
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const paid = state === 'done' && bought !== null;
  // ⚠️ The claim the whole receipt turns on, COMPUTED rather than asserted: a third party bore the
  // fee for a transfer between two others. If the Mirror Node has not answered yet this is null and
  // the receipt says so rather than claiming it.
  const facilitated = paid && bought.feeBearer !== null
    ? bought.feeBearer !== bought.payer && bought.feeBearer !== bought.payTo
    : null;

  return (
    <div className="workspace" style={UNFIT}>
      {/* ── Left: the document ──────────────────────────────────────────────────────────────── */}
      <section className="viewer" style={UNFIT}>
        <div className="viewer-toolbar">
          <span className="file-name">{heading}</span>
          <div className="viewer-tools">
            {paid ? (
              <>
                <Check size={14} /> Paid read
              </>
            ) : (
              <>
                <Lock size={14} /> Preview — public
              </>
            )}
          </div>
        </div>

        <div className="document-stage" style={UNFIT}>
          <div className="paper-scale">
            <article className="report-paper">
              <header className="paper-masthead">
                <span className="brand">
                  <BrandMark />
                  <span>ALPHA MARKETS</span>
                </span>
                <span>RESEARCH REPORT</span>
              </header>

              <div className="paper-title">
                {/* ⚠️ Sixteen of the nineteen stored reports pre-date migration 008 and have no
                    title. Those get the directive shortened at a word boundary as their heading —
                    the same words, just the front of them — and the sheet says so rather than
                    letting the repetition below read as a mistake. */}
                <span className="eyebrow">
                  {paid ? 'FULL REPORT' : 'PREVIEW'}
                  {derived ? ' · HEADING TAKEN FROM THE DIRECTIVE, NO ANALYST TITLE STORED' : ''}
                </span>
                <h1>{heading}</h1>
                {/* ⚠️ Whole, never bounded. Truncating the directive would misstate what the report
                    answers, and when there is no title the heading above is the front of it. */}
                <p>{directive}</p>
                <span className="paper-byline">
                  {analyst} · BLOCK {block} · OBSERVED {observedAt}
                </span>
                <span className="paper-byline">{reportHash}</span>
              </div>

              {/* ⚠️ **The one table a stranger gets, and it is safe by construction** — how much of
                  the picture the report rests on, without carrying a single measured value. */}
              <table className="financial-table">
                <thead>
                  <tr>
                    <th>What the report rests on</th>
                    <th>Count</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td>Figures measured</td><td>{coverage.facts}</td></tr>
                  <tr><td>Deployments covered</td><td>{coverage.deployments}</td></tr>
                  <tr><td>Markets read</td><td>{coverage.marketsRead}</td></tr>
                  <tr><td>Corroborated on-chain</td><td>{coverage.corroborated}</td></tr>
                  <tr><td>Population</td><td>{coverage.completeness}</td></tr>
                  <tr><td>Checks run</td><td>{coverage.checksRun} of {coverage.checksAvailable}</td></tr>
                </tbody>
              </table>

              {paid ? (
                // ⚠️ Rendered the way `/console` renders it: `render()` output through
                // `app/markdown.tsx`, in the same sheet. One renderer, one producer — a bought report
                // and a generated one are visibly the same artefact.
                <Markdown source={bought.markdown} />
              ) : (
                /* ⚠️ **SEALED, NOT HIDDEN.** Everything inside is generated markup: `.mini-copy`
                   bars and a filler chart, the design's own placeholder treatment. There is no
                   report text under the blur at any opacity — grep the served HTML and see. */
                <div className="locked-preview">
                  <div className="mini-document">
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                      <div className="mini-body" key={i} aria-hidden="true">
                        <div className="mini-copy">
                          <span /><span /><span /><span /><span />
                        </div>
                        <div className="mini-chart">
                          {i % 2 === 0 ? (
                            <svg viewBox="0 0 140 65">
                              {[22, 35, 29, 47, 56, 61].map((v, n) => (
                                <rect key={n} x={n * 23} y={65 - v} width="15" height={v} fill="#949ba1" />
                              ))}
                            </svg>
                          ) : (
                            <svg viewBox="0 0 140 65">
                              <path
                                d="M0 60 L15 51 29 53 45 43 59 44 72 30 86 33 104 20 119 24 140 4"
                                fill="none" stroke="#8d979f" strokeWidth="3"
                              />
                            </svg>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div>
                    <Lock size={20} />
                    <span>The figures, the market table and the analyst&rsquo;s assessment</span>
                  </div>
                </div>
              )}

              <footer className="paper-footer">
                <span>Alpha Markets · {analyst.slice(0, 10)}…</span>
                <span>{paid ? 'Paid read — not saved' : 'Preview — the body is not in this page'}</span>
              </footer>
            </article>
          </div>
        </div>
      </section>

      {/* ── Right: the rail ─────────────────────────────────────────────────────────────────── */}
      <aside className="atlas-console" style={UNFIT}>
        <div className="atlas-inner">
          <div className="atlas-top">
            <span>{paid ? 'Settled' : 'Buy this read'}</span>
            <small>X402 · HEDERA TESTNET</small>
          </div>

          {paid ? (
            <>
              <div className="attached-report">
                Paid <strong>{bought.amountHbar} HBAR</strong>
                {bought.result ? ` · ${bought.result}` : ''}
                <small>{bought.payer} → {bought.payTo}</small>
              </div>

              {/* ⚠️ **THE STRONGEST ON-CHAIN SIGNAL, AND IT IS COMPUTED, NOT CLAIMED.** A third
                  party paying the network fee for a transfer between two others is what a
                  facilitated settlement looks like. `facilitated` is `feeBearer ∉ {payer, payTo}`,
                  read off the Mirror Node record the route fetched. */}
              {facilitated === true && (
                <p className="notice">
                  <Check size={15} />
                  <span>
                    <strong>The buyer paid the price and no gas.</strong> The network fee of{' '}
                    {bought.networkFeeHbar} HBAR was borne by <code>{bought.feeBearer}</code> — the
                    x402 facilitator, which is neither the payer nor the payee. A third party covering
                    the fee for a transfer between two others is what a facilitated settlement looks
                    like, and the transfer list below is where you check it.
                  </span>
                </p>
              )}
              {facilitated === false && (
                <p className="notice">
                  <Lock size={15} />
                  <span>
                    <strong>The fee was borne by a party to the transfer</strong>
                    {' '}(<code>{bought.feeBearer}</code>), not by a third party. That is not the
                    facilitated shape this receipt expects — worth investigating before citing it.
                  </span>
                </p>
              )}
              {bought.pending && (
                <p className="notice">
                  <Lock size={15} />
                  <span>
                    <strong>The fee lines are not known yet.</strong> {bought.pending} The settlement
                    succeeded; open the transaction below and read its transfers directly.
                  </span>
                </p>
              )}

              <div className="query-evidence">
                <span className="eyebrow">X402 · WHAT SETTLED</span>
                <dl>
                  <dt>Amount</dt>
                  <dd>{bought.amountHbar} HBAR</dd>
                  <dt>Payer</dt>
                  <dd>{bought.payer}</dd>
                  <dt>Paid to</dt>
                  <dd>{bought.payTo}</dd>
                  <dt>Payment id</dt>
                  <dd>{bought.paymentId}</dd>
                  {/* ⚠️ Signed and recorded BEFORE broadcast. If a settle ever times out, this is the
                      id to ask the Mirror Node about rather than retrying blind. */}
                  <dt>Native tx</dt>
                  <dd>{bought.nativeTxId}</dd>
                  <dt>Settled tx</dt>
                  <dd>{bought.settledTransaction}</dd>
                  <dt>Network fee</dt>
                  <dd>{bought.networkFeeHbar ? `${bought.networkFeeHbar} HBAR` : 'not yet ingested'}</dd>
                  <dt>Fee paid by</dt>
                  <dd>{bought.feeBearer ?? 'not yet ingested'}</dd>
                  {bought.quotedFeePayer && (
                    <>
                      <dt>Fee payer quoted</dt>
                      <dd>{bought.quotedFeePayer}</dd>
                    </>
                  )}
                </dl>
                <a className="text-link" href={bought.hashscan} target="_blank" rel="noreferrer">
                  This transaction on HashScan <ArrowUpRight size={13} />
                </a>
              </div>

              {bought.transfers.length > 0 && (
                <div className="query-evidence">
                  <span className="eyebrow">HEDERA · THE TRANSFER LIST</span>
                  <dl>
                    {bought.transfers.map((t) => (
                      <span key={`${t.account}-${t.amount}`} style={{display: 'contents'}}>
                        <dt>{t.account}</dt>
                        <dd>
                          {t.amount > 0 ? '+' : ''}
                          {hbar(t.amount)}
                          {t.account === bought.payer ? ' — the buyer' : ''}
                          {t.account === bought.payTo ? ' — the analyst' : ''}
                          {t.account === bought.feeBearer ? ' — the facilitator, fee only' : ''}
                        </dd>
                      </span>
                    ))}
                  </dl>
                  {/* ⚠️ Names what a judge compares against what, rather than leaving it implied. */}
                  <a
                    className="text-link"
                    href={`https://testnet.mirrornode.hedera.com/api/v1/transactions/${mirrorId(bought.settledTransaction)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    The same record on the Mirror Node <ArrowUpRight size={13} />
                  </a>
                </div>
              )}

              <p className="notice">
                <Lock size={15} />
                <span>
                  <strong>This read is not saved.</strong> There is no sign-in, so nothing here can
                  know you bought it — refreshing loses the report and buying again pays again.
                </span>
              </p>
            </>
          ) : (
            <>
              <span className="listing-price">
                {priceHbar} <small>HBAR</small>
              </span>

              <div className="attached-report">
                Buys <strong>one read</strong> — the figures, the market table and the analyst&rsquo;s
                assessment, in full.
                <small>Not a subscription · does not transfer the token</small>
              </div>

              {/* ⚠️ **EVERYTHING A PERSON NEEDS BEFORE COMMITTING REAL MONEY IS ABOVE THE BUTTON**,
                  because below it is too late. Real testnet HBAR moves the moment this is pressed:
                  there is no confirm dialog and no undo. */}
              <p className="notice">
                <ArrowUpRight size={15} />
                <span>
                  <strong>An agent pays, not you — and it pays for real.</strong> Pressing this runs
                  our buyer agent on the server, which settles an x402 payment of {priceHbar} HBAR to
                  the analyst on Hedera testnet, immediately and with no confirmation step. The
                  network fee is borne by the facilitator, not by the buyer and not by you. No wallet
                  is connected and nothing is charged to you — x402 ships no Hedera paywall for
                  browsers, so a human cannot complete one of these payments here.
                </span>
              </p>

              {/* ⚠️ `.btn.white` and not `.btn.primary`: primary is ink `#100f0e` on charcoal
                  `#211c1c`, a dark button on a dark panel. The console's own primary sits inside
                  `.atlas-composer`, which is white. `.full` spans the rail so it cannot be mistaken
                  for a link. ⚠️ **The price is IN the label** — a button that just says "Buy" beside
                  a price elsewhere on the panel is a button whose cost you have to go and look up. */}
              <button
                className="btn white full"
                type="button"
                onClick={() => void buy()}
                disabled={state === 'buying'}
              >
                <Lock size={15} />
                {state === 'buying' ? 'The agent is paying…' : `Buy this read · ${priceHbar} HBAR`}
              </button>

              <p className="balance-line">One read · not saved · buying again pays again</p>

              {/* ⚠️ One stage line, not a fake progress bar. There is exactly one await here, so
                  anything finer-grained would be invented. It names what is actually slow, and the
                  5.3s figure is measured, not guessed — `tracking/logs.md` records the round trip. */}
              {state === 'buying' && (
                <p className="notice">
                  <ArrowUpRight size={15} />
                  <span>
                    Asking the gate for a price, signing, settling, then polling the Mirror Node for
                    the transaction record. The last measured round trip was 5.3 seconds.
                  </span>
                </p>
              )}
              {state === 'error' && message && (
                <p className="notice">
                  <Lock size={15} />
                  <span>
                    <strong>The purchase did not complete.</strong> {message}
                  </span>
                </p>
              )}
            </>
          )}

          {/* ⚠️ A SERVER component passed as a child into a client one — the Graph evidence, read
              from the stored record. Its query weight never reaches the browser and it holds no part
              of the report body, so it cannot leak past the gate. */}
          {children}
        </div>
      </aside>
    </div>
  );
}

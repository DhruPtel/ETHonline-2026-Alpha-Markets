// The report marketplace — `front-end-design/reports.html`.
//
// ⚠️ **THE QUERIES ARE PHASE 4'S AND THEY DO NOT CHANGE.** `list()` plus **one** batched
// `tokensFor(hashes)` — not one lookup per row; `app/page.tsx` learned that before the list got
// long. What this unit changed is what the rows are rendered into.
//
// ⚠️ **A server component reading the store directly — no API route, and none should be added.** A
// route here would be a second copy of `list()` behind a fetch the server makes to itself, with its
// own serialisation, its own error shape and its own URL to keep working in production.
//
// ⚠️ **Plain `<a href>`, not `next/link`.** Under `tsconfig.app.json`'s `nodenext`, `next/link.js` is
// CJS with no `exports` map, so a default import binds `module.exports` rather than the component.
//
// ── ⚠️ WHAT THE REFERENCE ASSUMES AND WHAT ACTUALLY EXISTS ───────────────────────────────────────
//
// `reports.html` draws six cards, each with a title, a category, a one-line subtitle, a byline, its
// own price, and a linked prediction market. **The store has `hash, analyst, directive, block,
// observed_at, created_at` and one constant price.** So:
//
//   title       → the directive. It is the only human sentence a report carries.
//   subtitle    → ⚠️ **NOT INVENTED.** The reference's "Market structure, growth and key risks" has
//                 no column behind it. The slot holds the analyst id and the block instead, which
//                 are true and are what distinguishes two reports on the same protocol.
//   category    → ⚠️ marked. No column, and deriving one from the directive's words would be a
//                 guess rendered as a fact.
//   price       → one `Price`, one constant. See `app/ui/price.tsx`.
//   the market  → real: `claims.report_hash` is a foreign key, so a report that backs a market
//                 genuinely links to it. Most do not, and those simply have no link.
//
// ⚠️ **11 reports in a three-up grid is nearly four full rows — this page reads BEST of all of them.**
// The one hole is that 7 of 11 are untokenized, and the reference's card assumes a token chip on
// every one. So the chip is a real two-state thing rather than a decoration: *Tokenized · ISIN*
// against *Not tokenized*, both styled, the second not a faded version of the first. That
// distinction is the difference between a published document and a security.

import { list } from '../src/store/reports.js';
import { tokensFor } from '../src/store/tokens.js';
import { db } from '../src/store/db.js';
import { REPORT_PRICE_HBAR } from '../src/config/pricing.js';
import { SiteHeader } from './ui/chrome.js';
import { Unbuilt } from './ui/unbuilt.js';
import { Price } from './ui/price.js';

export const runtime = 'nodejs';

// ⚠️ **Per request, not per build.** Without this Next prerenders `/` at build time, which freezes
// the list at whatever was in Neon when the deploy ran — a published report would not appear until
// the next deploy, which reads as the store being broken.
export const dynamic = 'force-dynamic';

const when = (d: Date) => `${d.toISOString().slice(0, 10)}`;
const BOUND = 96;
const bound = (s: string) => (s.length > BOUND ? `${s.slice(0, BOUND)}…` : s);

export default async function Home() {
  const reports = await list();
  const tokens = await tokensFor(reports.map((r) => r.hash));

  // ⚠️ **One more query, and it is the reference's "related market" made real.** A claim cites a
  // report by foreign key, so this is a fact rather than a decoration. Batched over every hash for
  // the same reason `tokensFor` is — a list page that fans out per row is what costs once the list
  // gets long. `store/` is not modified: the join is written here, the way Units 13 and 13b write
  // theirs.
  const hashes = reports.map((r) => r.hash);
  const cited = hashes.length === 0 ? [] : await db()<{ report_hash: string; chain_market_id: string | null; spec_json: string }[]>`
    SELECT c.report_hash, m.chain_market_id, m.spec_json
    FROM claims c JOIN markets m ON m.id = c.market_id
    WHERE c.report_hash = ANY(${hashes}) AND m.chain_market_id IS NOT NULL
    ORDER BY m.created_at DESC`;
  const marketFor = new Map<string, { id: string; question: string }>();
  for (const c of cited) {
    if (marketFor.has(c.report_hash)) continue;
    const s = JSON.parse(c.spec_json) as { slug: string; metric: string; comparison: string; threshold: string; observedDay: string };
    marketFor.set(c.report_hash, {
      id: c.chain_market_id!,
      question: `Will ${s.slug}'s ${s.metric} be ${s.comparison} $${Number(s.threshold).toLocaleString('en-US')} on ${s.observedDay}?`,
    });
  }

  const tokenized = reports.filter((r) => tokens.has(r.hash)).length;

  return (
    <>
      <SiteHeader current="/" />
      <main className="page-container marketplace-page">
        <div className="page-heading">
          <div>
            <span className="eyebrow">Independent intelligence</span>
            <h1>Report marketplace</h1>
            <p>Research worth reading. Conviction worth backing.</p>
          </div>
          {/* ⚠️ MARKED. No product route generates or accepts a report — generation is a CLI job and
              an uploaded PDF has no canonical form this pipeline can hash. See `app/README.md`. */}
          <Unbuilt label="Publishing a report from the browser">
            <span className="btn outline">Publish a report</span>
          </Unbuilt>
        </div>

        {/* ⚠️ EVERY CONTROL IN THIS BAR IS MARKED. There is no search index and no category column,
            and "My reports" would need an identity system — `payments/auth.ts` is the declared cut
            point. Shown because a marketplace without them reads as unfinished rather than as
            honest; inert because inventing them would be worse. */}
        <div className="filter-bar">
          <Unbuilt label="Search">
            <span className="search-field">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
                   strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" />
              </svg>
              Search reports
            </span>
          </Unbuilt>
          <Unbuilt label="Filtering by category">
            <span className="filter-chips">
              <span className="active">All reports</span>
              <span>Lending</span><span>Stablecoins</span><span>DEXs</span>
            </span>
          </Unbuilt>
          <Unbuilt label="My reports">
            <span className="btn outline sm">My reports</span>
          </Unbuilt>
        </div>

        <div className="results-meta">
          <span>{reports.length} report{reports.length === 1 ? '' : 's'}</span>
          {/* ⚠️ The true split, not the reference's blanket "Hedera tokens · Access via x402". */}
          <span>{tokenized} tokenized on Hedera</span>
          <span>Access via x402</span>
        </div>

        {reports.length === 0 ? (
          <p className="empty">No reports published yet.</p>
        ) : (
          <div className="report-grid">
            {reports.map((r) => {
              const token = tokens.get(r.hash);
              const market = marketFor.get(r.hash);
              return (
                <article className="report-card" key={r.hash}>
                  {/* ⚠️ **The light half.** The reference has a `<button class="document-preview-button">`
                      wrapping `.mini-document`; here it is an anchor to the report, because that is
                      what pressing it does. Same element order: `.mini-heading` (h3 + icon), the
                      subtitle `<p>`, then `.mini-body.blurred` holding `.mini-copy` and `.mini-chart`. */}
                  <a className="document-preview-button" href={`/report/${r.hash}`}
                     aria-label={`Preview ${bound(r.directive)}`}>
                    <div className="mini-document">
                      <div className="mini-heading">
                        <h3>{bound(r.directive)}</h3>
                        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
                             strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                          <path d="M7 17 17 7M9 7h8v8" />
                        </svg>
                      </div>
                      {/* ⚠️ The reference's subtitle is "Market structure, growth and key risks" — a
                          field with no column behind it. This says what IS known instead of
                          inventing one: who published it and at which block. */}
                      <p>{r.analyst} · block {r.block}</p>
                      {/* ⚠️ Blurred over NOTHING. No part of the paid body reaches this page. */}
                      <div className="mini-body blurred" aria-hidden="true">
                        <div className="mini-copy">
                          {['95%', '88%', '81%', '74%', '89%'].map((w) => (
                            <span key={w} style={{ width: w }} />
                          ))}
                        </div>
                        <div className="mini-chart">
                          <svg viewBox="0 0 120 61" width="100%" height="61" fill="none" aria-hidden="true">
                            <polyline points="2,52 20,44 38,47 56,33 74,36 92,21 118,14"
                                      stroke="var(--chart-1)" strokeWidth="2.5" strokeLinecap="round" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  </a>

                  {/* ── ⚠️ **The dark half.** ───────────────────────────────────────────────── */}
                  <div className="report-card-info">
                    <div className="report-card-title">
                      <h2><a href={`/report/${r.hash}`}>{bound(r.directive)}</a></h2>
                      {/* The reference's price is `<strong>5<small>USDC</small></strong>`. Same
                          shape, one constant, and HBAR — see `app/ui/price.tsx`. */}
                      <strong>{REPORT_PRICE_HBAR}<small>HBAR</small></strong>
                    </div>

                    <p>By <span className="mono">{r.analyst}</span></p>

                    <div className="report-card-buttons">
                      <a className="btn white" href={`/report/${r.hash}`}>Preview report</a>
                      {/* ⚠️ MARKED. The reference unlocks from the card; there is no
                          unlock-from-index path here and building one would put a spend control on
                          a list. Unlocking happens on the report page. */}
                      <Unbuilt label="Unlocking from the card">
                        <span className="text-link">Unlock →</span>
                      </Unbuilt>
                    </div>

                    {/* ⚠️ Real, via `claims.report_hash`. Absent where no market cites the report. */}
                    {market ? (
                      <a className="report-market-link" href={`/markets/${market.id}`}>
                        {bound(market.question)} →
                      </a>
                    ) : (
                      <span className="report-market-link" style={{ opacity: 0.55 }}>
                        No market cites this report yet
                      </span>
                    )}

                    {/* ⚠️ The reference's `<details class="card-evidence">`, kept as a `<details>`.
                        Two real states: an issued token with its ISIN, or the absence of one. */}
                    <details className="card-evidence">
                      <summary>{token ? 'Hedera token · x402 access' : 'Not tokenized · x402 access'}</summary>
                      {token ? (
                        <>
                          <div><span>ISIN</span><code>{token.isin}</code></div>
                          <div><span>Proxy</span><code>{token.proxyAddress}</code></div>
                          <a className="text-link" target="_blank" rel="noreferrer"
                             href={`https://hashscan.io/testnet/contract/${token.proxyAddress}`}>
                            View token receipt →
                          </a>
                        </>
                      ) : (
                        <div><span>Token</span><code>none issued</code></div>
                      )}
                      <div><span>Report hash</span><code>{r.hash}</code></div>
                    </details>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}

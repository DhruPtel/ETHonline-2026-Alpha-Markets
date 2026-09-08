// One report's PREVIEW. Enough to decide whether to buy; not the report.
//
// ⚠️ **This page deliberately does not call `render()`.** x402's premise is paying for access to
// something you otherwise cannot see, so a paid route serving content this page already gave away
// would gate nothing and a settled payment would prove nothing. The line moves here, before Unit 14,
// because a gate with nothing behind it is not a gate.
//
// ⚠️ **The split needed no change to `Report` and none to `render()`.** It is already field-level:
// `subject.directive`, `analyst`, `block`, `observedAt` and `verdict.coverage` are separate fields
// from `sections`, `assessment` and `facts`. This page is the previous version composing its identity
// panel and simply not rendering the markdown. **Do not add a preview mode to `render()`** — that
// would put the paywall inside the one function whose output a paying buyer receives verbatim.
//
// ⚠️ **The body is never sent, not hidden.** `sections`, `assessment`, `facts`, `checks` and
// `provenance` are read server-side and never reach the response. A CSS-hidden table is not a
// paywall, so this unit's proof greps the served HTML for a known figure and finds nothing.

import { notFound } from 'next/navigation.js';
import { load } from '../../../src/store/reports.js';
import { tokenFor } from '../../../src/store/tokens.js';
import { REPORT_PRICE_HBAR } from '../../../src/config/pricing.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const when = (iso: string) => `${iso.slice(0, 16).replace('T', ' ')} UTC`;

export default async function ReportPage({ params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;

  // ⚠️ **`load` throws on a failed integrity check and that throw is deliberately NOT caught.** A row
  // whose stored JSON no longer canonicalizes to its own primary key is not a report with a caveat —
  // it is a report whose identity is unknown, and this hash is what an ATS token commits and an Arc
  // market settles against. Letting it propagate gives an HTTP 500 and no document, which is the
  // honest outcome. `notFound()` is for the different case of a hash nobody ever stored.
  const report = await load(hash);
  if (!report) notFound();

  const token = await tokenFor(hash);
  const { coverage } = report.verdict;
  const factCount = Object.keys(report.facts).length;

  return (
    <main>
      <p className="back"><a href="/">← All reports</a></p>

      {/* ⚠️ Wrapped in `.memo` so `globals.css`'s existing `h1`/`p` rules apply. `globals.css` is out
          of scope for this unit, so every class below is one the stylesheet already defines. */}
      <article className="memo">
      {/* Whole, not bounded — truncating the directive would misstate what the report answers. */}
      <h1>{report.subject.directive}</h1>

      <dl className="identity">
        <div><dt>Analyst</dt><dd className="mono">{report.analyst}</dd></div>
        <div><dt>Block</dt><dd className="mono">{report.block}</dd></div>
        {/* ⚠️ `observedAt`, not the row's `created_at`. `load()` returns a `Report`, which carries the
            instant the chain was read; the insert time exists only on `list()`, and reaching it here
            would mean changing `store/reports.ts`, which this unit may not touch. The index shows
            created-at. It is also the more meaningful of the two — when the figures were true. */}
        <div><dt>Observed at</dt><dd className="mono">{when(report.observedAt)}</dd></div>
        <div><dt>Report hash</dt><dd className="mono break">{hash}</dd></div>
      </dl>

      {/* ── What a payment buys, stated rather than left as a gap ────────────────────────────── */}
      <section>
        <h2>The report is behind a paywall</h2>
        <p>
          <strong>{REPORT_PRICE_HBAR} HBAR</strong> buys <strong>one read</strong> — the figures, the market
          table and the analyst&rsquo;s assessment. Payment settles on Hedera testnet over x402.
          A read is not a subscription, and it does not transfer the token.
        </p>
        <dl className="identity">
          <div><dt>Figures measured</dt><dd>{factCount}</dd></div>
          <div><dt>Markets read</dt><dd>{coverage.marketsRead}</dd></div>
          <div><dt>Corroborated on-chain</dt><dd>{coverage.marketsCorroborated}</dd></div>
          <div><dt>Population</dt><dd>{coverage.completeness}</dd></div>
          <div><dt>Checks run</dt><dd>{coverage.checksRun} of {coverage.checksAvailable}</dd></div>
        </dl>
        <p>
          These counts say how much of the picture the report rests on. The figures themselves, and
          what the analyst concludes from them, are what a payment buys.
        </p>
      </section>

      {/* ── The on-chain half, public by nature ──────────────────────────────────────────────── */}
      <section>
        <h2>Tokenization</h2>
        {token ? (
          <>
            <p>
              This report is an ATS security token on Hedera testnet. Its creation event commits this
              report&rsquo;s hash, so the token and the identity above name the same thing.
            </p>
            <dl className="identity">
              <div><dt>ISIN</dt><dd className="mono">{token.isin}</dd></div>
              <div><dt>Proxy</dt><dd className="mono break">{token.proxyAddress}</dd></div>
              <div><dt>Issued</dt><dd className="mono">{when(token.issuedAt.toISOString())}</dd></div>
            </dl>
            <p>
              <a href={`https://hashscan.io/testnet/contract/${token.proxyAddress}`}
                 target="_blank" rel="noreferrer">View on HashScan →</a>
            </p>
          </>
        ) : (
          <p>
            Not tokenized. The report is published and hashed; no ATS asset has been minted against it.
          </p>
        )}
      </section>
      </article>
    </main>
  );
}

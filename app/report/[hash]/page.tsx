// One report, rendered. The first page in this build a stranger can be handed a link to.

import { notFound } from 'next/navigation.js';
import { load } from '../../../src/store/reports.js';
import { render } from '../../../src/agent/narrate.js';
import { Markdown } from '../../markdown.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function ReportPage({ params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;

  // ⚠️ **`load` throws on a failed integrity check and that throw is deliberately NOT caught.** A row
  // whose stored JSON no longer canonicalizes to its own primary key is not a report with a caveat —
  // it is a report whose identity is unknown, and this hash is what an ATS token commits and an Arc
  // market settles against. Serving it with a warning banner would be the wrong shape: the reader
  // would be looking at text that no longer belongs to the hash beside it. Letting it propagate gives
  // an HTTP 500 and no document, which is the honest outcome. `notFound()` is for the different case
  // of a hash nobody ever stored.
  const report = await load(hash);
  if (!report) notFound();

  // ⚠️ **The hash shown is the VERIFIED one, not the URL string echoed back.** `load` re-derives the
  // hash from the stored bytes and refuses to return unless it equals the row's primary key, and the
  // row was selected by exact match on this value — so by the time this line runs, all three are the
  // same string and it has been checked rather than assumed.
  const markdown = render(report, hash);

  return (
    <main>
      <p className="back"><a href="/">← All reports</a></p>

      {/* ⚠️ The identity panel is deliberately ABOVE the memo and duplicated by the memo's own
          footer. They are two different jobs: this one tells a reader on the page what they are
          looking at, and the footer inside `render()` travels with the markdown when a buyer
          receives it over x402 in Unit 14, where this panel does not exist. */}
      <dl className="identity">
        <div><dt>Analyst</dt><dd className="mono">{report.analyst}</dd></div>
        <div><dt>Block</dt><dd className="mono">{report.block}</dd></div>
        <div><dt>Report hash</dt><dd className="mono break">{hash}</dd></div>
      </dl>

      <article className="memo">
        <Markdown source={markdown} />
      </article>
    </main>
  );
}

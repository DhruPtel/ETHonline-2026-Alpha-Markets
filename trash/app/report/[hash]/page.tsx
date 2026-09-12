// One report — the preview, the gate, and the document once it is paid for.
//
// ⚠️ **THIS SCREEN HAS NO REFERENCE.** `front-end-design/` contains ten files and none of them is
// the report reading page — the one screen the entire x402 argument rests on. What the package
// *does* carry is the CSS for it: `.locked-preview`, `.purchase-bar`, `.unlocked-bar`,
// `.transaction-receipt`, `.report-paper`, `.paper-masthead`, `.paper-title`, `.paper-byline`,
// `.paper-footer` and `.financial-table` are all defined in its stylesheet and **drawn in none of
// its ten files**. This page is composed from those parts so it reads as the same product.
//
// **What was composed, and what had to be decided:**
//
//   the sheet      `.report-paper` — the console's document look, so a bought report and a generated
//                  one are visibly the same artefact rather than two designs for one object.
//   the identity   `.paper-masthead` + `.paper-title` + `.paper-byline`. ⚠️ The reference's paper
//                  says "PREPARED BY ATLAS RESEARCH · DEMO DATA". That is a mockup's byline and it
//                  is replaced by the real analyst id, block and full hash.
//   the gate       `.locked-preview` in the paper where the body would be, `.purchase-bar` in the
//                  aside. ⚠️ **DECIDED: the control sits BESIDE the document, not inside it.** Put
//                  it inline and the page reads as an article interrupted by an advert; put it in
//                  the aside and it reads as a price on a thing.
//   the receipt    `.unlocked-bar` + `.transaction-receipt`, which is where the settlement lands.
//
// ⚠️ **THE LOCKED BLOCK IS CSS OVER AN ABSENCE, NOT OVER CONTENT.** This page deliberately never
// calls `render()`: `sections`, `assessment`, `facts`, `checks` and `provenance` are read
// server-side and never reach the response. The blurred rows are drawn from nothing — there is no
// text under them to reveal. **A CSS-hidden table is not a paywall**, and the probe for this is
// grepping the served HTML for a figure from the paid body and finding zero.
//
// ⚠️ **`load` throws on a failed integrity check and that throw is NOT caught.** A row whose stored
// JSON no longer canonicalizes to its own primary key is not a report with a caveat — it is a report
// whose identity is unknown, and this hash is what an ATS token commits and an Arc market settles
// against. An HTTP 500 and no document is the honest outcome. `notFound()` is for the different case
// of a hash nobody ever stored.

import { notFound } from 'next/navigation.js';
import { load } from '../../../src/store/reports.js';
import { REPORT_PRICE_HBAR } from '../../../src/config/pricing.js';
import { SiteHeader } from '../../ui/chrome.js';
import { Ledgers } from './ledgers.js';
import { BuyAndRead } from './buy.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const when = (iso: string) => `${iso.slice(0, 16).replace('T', ' ')} UTC`;

export default async function ReportPage({ params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;
  const report = await load(hash);
  if (!report) notFound();

  const { coverage } = report.verdict;
  const factCount = Object.keys(report.facts).length;

  return (
    <>
      <SiteHeader current="/" />
      <main className="page-container">
        <a className="back-link" href="/">← All reports</a>

        {/* ⚠️ **One client component owns BOTH columns** — the paper and the purchase bar — because
            the bought body replaces the locked block *inside the paper* while the control that buys
            it lives *in the aside*. Two components would mean two copies of one piece of state.
            ⚠️ It is handed the public fields only. The body is never a prop: it exists solely in the
            JSON returned to the component's own fetch, held in its state. Nothing is
            rendered-then-hidden and nothing is inlined into the RSC payload. */}
        <BuyAndRead
          reportHash={hash}
          priceHbar={REPORT_PRICE_HBAR}
          directive={report.subject.directive}
          analyst={report.analyst}
          block={report.block}
          observedAt={when(report.observedAt)}
          coverage={{
            facts: factCount,
            marketsRead: coverage.marketsRead,
            corroborated: coverage.marketsCorroborated,
            completeness: coverage.completeness,
            checksRun: coverage.checksRun,
            checksAvailable: coverage.checksAvailable,
          }}
        >
          {/* ⚠️ A SERVER component passed as a child into a client one. `Ledgers` owns its own reads
              — `report_tokens`, `claims` and `markets`, all public facts, none of which contain any
              part of the report body — so it cannot leak past the gate, and its query weight never
              reaches the browser. It renders nothing at all when a report has neither a token nor a
              market, which is most of them. */}
          <Ledgers hash={hash} />
        </BuyAndRead>
      </main>
    </>
  );
}

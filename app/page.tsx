import {MarketplaceFilters} from './components/MarketplaceFilters.js';
import {MiniDocument} from './components/MiniDocument.js';
import {ArrowRight, ArrowUpRight} from './components/Icons.js';
import {list, listPublished} from '../src/store/reports.js';
import {tokensFor} from '../src/store/tokens.js';
import {db} from '../src/store/db.js';
import {REPORT_PRICE_HBAR} from '../src/config/pricing.js';

export const runtime = 'nodejs';

/**
 * ⚠️ **PER REQUEST, NEVER PRERENDERED, AND THIS LINE IS LOAD-BEARING.** Without it Next renders `/`
 * once at build time and freezes the list at whatever was in Neon when the deploy ran — so a report
 * generated a minute ago does not appear until the next deploy, which is the whole point of the
 * page. `/console` lost this same directive once by accident and the symptom read as a refresh bug
 * for two tasks.
 */
export const dynamic = 'force-dynamic';

/** Cut a long directive to a card-sized heading at a word boundary. */
function shorten(text: string, max: number): string {
  const t = text.trim().replace(/[?.]+$/, '');
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}

export default async function ReportMarketplace() {
  // ── ⚠️ THREE QUERIES, AND THE BATCHING IS THE POINT ───────────────────────────────────────────
  // Taken from `trash/app/page.tsx`, which had this working before the rebuild: `list()`, then ONE
  // `tokensFor(hashes)`, then ONE claims join over every hash. ⚠️ **Not one lookup per row** — a
  // list page that fans out per card is what costs once the list gets long, and that file learned
  // it. `store/` is not modified; the join is written here, as that page wrote it.
  //
  // ⚠️ **A server component reading the store directly — no API route, and none should be added.**
  // A route here would be a second copy of `list()` behind a fetch the server makes to itself.
  // ⚠️ **`listPublished()`, NOT `list()` — the whole point of migration 009.** `/` used to render
  // every row in the store, so generating a report published it and an analyst had no way to keep a
  // draft out of the market. The marketplace now shows what an author decided to sell.
  // ⚠️ The counts below need to know how many are held back, and `listPublished` cannot say — so the
  // store is asked for both. Two cheap queries against nineteen rows; the alternative is a page that
  // can only say "nothing here" without saying whether that means empty or unlisted.
  const reports = await listPublished();
  const inStore = (await list(500)).length;
  const unpublished = inStore - reports.length;
  const hashes = reports.map((r) => r.hash);
  const tokens = await tokensFor(hashes);

  const cited = hashes.length === 0 ? [] : await db()<
    {report_hash: string; chain_market_id: string | null; spec_json: string}[]
  >`SELECT c.report_hash, m.chain_market_id, m.spec_json
      FROM claims c JOIN markets m ON m.id = c.market_id
     WHERE c.report_hash = ANY(${hashes}) AND m.chain_market_id IS NOT NULL
     ORDER BY m.created_at DESC`;

  const marketFor = new Map<string, {id: string; question: string}>();
  for (const c of cited) {
    if (marketFor.has(c.report_hash)) continue;
    const s = JSON.parse(c.spec_json) as {
      slug: string; metric: string; comparison: string; threshold: string; observedDay: string;
    };
    marketFor.set(c.report_hash, {
      id: c.chain_market_id!,
      question: `Will ${s.slug}'s ${s.metric} be ${s.comparison} $${Number(s.threshold).toLocaleString('en-US')} on ${s.observedDay}?`,
    });
  }

  const tokenized = reports.filter((r) => tokens.has(r.hash)).length;

  return (
    <main className="marketplace-page page-container">
      <div className="page-heading">
        <div>
          <span className="eyebrow">INDEPENDENT INTELLIGENCE</span>
          <h1>Report marketplace</h1>
          <p>Research worth reading. Conviction worth backing.</p>
        </div>
        {/* ⚠️ **REVERSED BY MIGRATION 009.** This button said "Tokenize a report" and carried a note
            that there was no separate publish step, which was true while this page listed every row
            in the store. There is now a publish step and it is the one that puts a report here, so
            the button names it again. Tokenizing is still a different decision, taken in the same
            console section. */}
        <a href="/console#tokenize" className="btn outline">
          Publish a report <ArrowUpRight size={16} />
        </a>
      </div>

      <MarketplaceFilters categories={['All']} activeCategory="All" />

      <div className="results-meta">
        {/* ⚠️ **The held-back count is stated, not hidden.** A marketplace showing 7 of 19 with no
            explanation reads as a broken query. Saying how many are unlisted is also the honest
            answer to "where did my report go" for the analyst who just generated one. */}
        <span>
          {reports.length} published · {tokenized} tokenized on Hedera
          {unpublished > 0 ? ` · ${unpublished} not listed` : ''}
        </span>
        {/* ⚠️ HBAR, one constant, every report. A USD-denominated price THROWS on testnet —
            `defaultMoneyConversion` resolves USD through a `DEFAULT_ASSETS` table with no HBAR
            entry — and the USDC cutover belongs to mainnet. The design's six different USDC prices
            had nothing behind them. */}
        <span>{REPORT_PRICE_HBAR} HBAR each · x402 on Hedera testnet</span>
      </div>

      {/* ⚠️ **TWO DIFFERENT EMPTIES, AND THEY MUST NOT SHARE A MESSAGE.** "No reports yet" told an
          analyst with twelve unpublished drafts to go and generate another one, which is the wrong
          instruction and reads as data loss. An empty store and a store where nothing has been
          listed are different problems with different next actions. */}
      {reports.length === 0 && (
        <div className="empty-state">
          {inStore === 0 ? (
            <>
              <h2>No reports yet</h2>
              <p>Generate one in the console and publish it, and it appears here.</p>
              <a className="btn primary" href="/console">Open the console</a>
            </>
          ) : (
            <>
              <h2>Nothing published yet</h2>
              <p>
                {inStore} report{inStore === 1 ? '' : 's'} {inStore === 1 ? 'is' : 'are'} in the
                store and none has been listed. Publishing is a decision the analyst makes, one
                report at a time, in the console.
              </p>
              <a className="btn primary" href="/console#tokenize">Publish a report</a>
            </>
          )}
        </div>
      )}

      <div className="report-grid">
        {reports.map((report) => {
          const token = tokens.get(report.hash);
          const market = marketFor.get(report.hash);
          // ⚠️ **The narrator's title, or the directive shortened.** Eleven rows pre-date migration
          // 008 and have none; those show the question they answer rather than a blank heading.
          const heading = report.title ?? shorten(report.directive, 58);
          return (
            <article className="report-card" key={report.hash}>
              <a
                href={`/report/${report.hash}`}
                className="document-preview-button"
                aria-label={`Preview ${heading}`}
              >
                {/* ⚠️ The thumbnail is decoration and always was — blurred bars and a stylised
                    chart. There is no per-report preview data and none is invented. `locked` is
                    always true: there is no identity system, so nothing is "owned". */}
                <MiniDocument
                  title={heading}
                  // ⚠️ NOT INVENTED. The design's one-line subtitle has no column behind it, so the
                  // slot carries the analyst and the block — true, and what distinguishes two
                  // reports on the same protocol.
                  subtitle={`${report.analyst.slice(0, 10)}… · block ${report.block.toLocaleString('en-US')}`}
                  preview="bars"
                  locked
                />
              </a>

              <div className="report-card-info">
                <div className="report-card-title">
                  <h2>{heading}</h2>
                  <strong>
                    {REPORT_PRICE_HBAR} <small>HBAR</small>
                  </strong>
                </div>
                <p>By {report.analyst.slice(0, 18)}…</p>

                <div className="report-card-buttons">
                  <a href={`/report/${report.hash}`} className="btn white">
                    Preview report
                  </a>
                  <a href={`/report/${report.hash}`} className="text-link">
                    Unlock <ArrowUpRight size={14} />
                  </a>
                </div>

                {/* ⚠️ REAL — `claims.report_hash` is a foreign key, so a report that backs a market
                    genuinely links to it. Most do not, and those simply have no link rather than a
                    placeholder one. */}
                {market && (
                  <a className="report-market-link" href={`/markets/${market.id}`}>
                    {market.question} <ArrowRight size={14} />
                  </a>
                )}

                {/* ⚠️ **A TOKENIZED REPORT AND AN UNTOKENIZED ONE MUST NOT LOOK ALIKE.** The design
                    showed "Hedera token · x402 access" on every card; five of eleven have a token.
                    A tokenized one has an ISIN and a contract a stranger can check — that is the
                    difference between a published document and a security, and the second state is
                    not a faded version of the first. */}
                <details className="card-evidence">
                  <summary>
                    {token ? `Tokenized · ${token.isin}` : 'Not tokenized · x402 access'}
                  </summary>
                  {token ? (
                    <>
                      <div>
                        <span>ISIN</span>
                        <code>{token.isin}</code>
                      </div>
                      <a
                        className="text-link"
                        href={`https://hashscan.io/testnet/contract/${token.proxyAddress}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View the security on HashScan <ArrowUpRight size={13} />
                      </a>
                    </>
                  ) : (
                    <>
                      <div>
                        <span>Hash</span>
                        <code>{report.hash.slice(0, 24)}…</code>
                      </div>
                      <a className="text-link" href={`/console?report=${report.hash}`}>
                        Tokenize it in the console <ArrowUpRight size={13} />
                      </a>
                    </>
                  )}
                </details>
              </div>
            </article>
          );
        })}
      </div>
    </main>
  );
}

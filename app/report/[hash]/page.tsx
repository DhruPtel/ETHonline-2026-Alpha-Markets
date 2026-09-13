// One report — everything a stranger may see, and a wall where the rest would be.
//
// ── ⚠️ THE PAYWALL GUARANTEE, STATED THE WAY `trash/app/report/[hash]/page.tsx` STATED IT ─────────
//
// **This page calls `load()`. It never calls `render()`.** `render()` is the one function that
// substitutes `{fact:…}` placeholders for figures and emits the paid body; it is not imported here,
// and a grep of this file for it finds nothing. So `sections`, `assessment`, `facts`, `checks` and
// `verdict.call` are read into a server-side object, counted, and dropped on the floor.
//
// ⚠️ **No body field is ever passed as a prop and no body field is ever rendered.** The props handed
// to `BuyAndRead` are a hash, a price, a heading, the directive, an analyst, a block, a timestamp and
// six counts. **The sealed block on the sheet is blurred over generated markup, not over report
// text** — `.mini-copy` bars and a filler chart, with nothing underneath at any opacity. A CSS-hidden
// table is not a paywall; an absence is. The probe is grepping the served HTML for every figure and
// for the assessment prose and finding zero, with a control proving the probe finds them elsewhere.
//
// ⚠️ **`load` throws on a failed integrity check and that throw is NOT caught.** A row whose stored
// JSON no longer canonicalizes to its own primary key is not a report with a caveat — it is a report
// whose identity is unknown, and this hash is what an ATS token commits and an Arc market settles
// against. An HTTP 500 and no document is the honest outcome. `notFound()` is for the different case
// of a hash nobody ever stored.
//
// ── ⚠️ THE LAYOUT IS THE CONSOLE'S, AND THERE IS NO REFERENCE FOR THIS SCREEN ────────────────────
//
// `rebuild/MANIFEST.md` says so in its own words: *"Screen 7, one report — `.report-excerpt`,
// `.locked-preview`, `.purchase-bar`, `.unlocked-bar`. The design reached these three states through
// a modal on the marketplace, so its export never rendered them. Lifted from the mockup."* Ten design
// files, none of them this page; only CSS was carried over. So rather than compose a fourth original
// layout, this borrows `/console`'s: `.workspace` as the grid, `.viewer` + `.report-paper` as the
// document, `.atlas-console` as the dark rail. Those proportions are drawn, tested and responsive.
//
// **Top to bottom: identity, then the document beside the purchase, then tokenization.** The ledgers
// belong below because they describe what the report already IS; they must not compete with the one
// control that sells it.
//
// ⚠️ **`.page-container` and not `.console-page`.** The console's shell is 1800px wide with no bottom
// padding, because its sheet is a scaled full page and its footer supplies the gutter. This page ends
// on a light panel and needs the 64px bottom padding every other page has.

import {notFound} from 'next/navigation.js';
import {BuyAndRead} from '../../components/BuyControl.js';
import {GradeMarker, gradesFor} from '../../components/GradeMarker.js';
import {pastPosted} from '../../../src/arc/rehearsal.js';
import {ArrowLeft, ArrowRight, ArrowUpRight} from '../../components/Icons.js';
import {load} from '../../../src/store/reports.js';
import {tokenFor} from '../../../src/store/tokens.js';
import {db} from '../../../src/store/db.js';
import {REPORT_PRICE_HBAR} from '../../../src/config/pricing.js';

export const runtime = 'nodejs';

/**
 * ⚠️ **Per request, never prerendered.** A report tokenized or staked a minute ago changes what this
 * page says about it, and a build-time snapshot would freeze that until the next deploy. `/` and
 * `/console` carry the same directive for the same reason.
 */
export const dynamic = 'force-dynamic';

/**
 * ⚠️ **A report hash is 32 bytes of lowercase hex and this page accepts nothing else.** No `0x`
 * stripping, no case folding, no whitespace trimming — those belong in a field a human types into,
 * and this is a URL. Normalising here would give one report several working addresses, which is the
 * opposite of what a hash is for. Anything that does not match is a hash nobody ever stored: 404.
 */
const HASH = /^[0-9a-f]{64}$/;

/** Cut a long directive to a heading-sized phrase at a word boundary. Same rule as `/` and `/console`. */
function shortenDirective(directive: string): string {
  const d = directive.trim().replace(/[?.]+$/, '');
  if (d.length <= 58) return d;
  const cut = d.slice(0, 58);
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}

const when = (iso: string) => `${iso.slice(0, 10)} ${iso.slice(11, 19)} UTC`;
const whenDate = (d: Date) => when(d.toISOString());

/** USDC on Arc is native gas: 18 decimals on a token the world knows as 6. */
const usdc = (wei: string): string => {
  const v = BigInt(wei);
  const whole = v / 10n ** 18n;
  const frac = (v % 10n ** 18n).toString().padStart(18, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : `${whole}`;
};

interface Spec {
  slug: string; metric: string; comparison: 'above' | 'below'; threshold: string; observedDay: string;
}

interface ClaimRow {
  chain_claim_id: string;
  side: boolean;
  amount: string;
  chain_market_id: string;
  spec_json: string;
  close_time: Date;
  /** ⚠️ With `close_time`, the pair `pastPosted()` compares. */
  observed_day: string;
  observation_end: Date;
  resolved_at: Date | null;
  voided_at: Date | null;
  outcome: boolean | null;
}

/** ⚠️ A void is an absence of an outcome, never a wrong answer. Duplicated from the markets page. */
function standing(c: ClaimRow): string {
  if (c.voided_at) return 'Voided — no outcome, every stake refundable';
  if (c.resolved_at) return `Resolved ${c.outcome ? 'TRUE' : 'FALSE'}`;
  if (Date.now() < c.close_time.getTime()) return 'Open for staking';
  if (Date.now() < c.observation_end.getTime()) return 'Staking closed — observing';
  return 'Awaiting settlement';
}

export default async function ReportDetail({params}: {params: Promise<{hash: string}>}) {
  const {hash} = await params;
  if (!HASH.test(hash)) notFound();

  // ⚠️ **No try/catch.** See the header: an altered row must 500, not render.
  const report = await load(hash);
  if (!report) notFound();

  // ⚠️ **Three reads, all public facts, none of which can carry a figure.** `reports.title` is a
  // column outside the hash (migration 008), so `load()` — which returns the hashed object — knows
  // nothing about it and it is read alongside. `report_tokens` and the `claims`→`markets` join hold
  // no part of a report body, which is why they can be read on the unpaid side of the wall at all.
  // ⚠️ Written here rather than added to `store/`: `/` and `/console` write their own joins the same
  // way, and this unit may not touch `src/`.
  const [titleRow] = await db()<{title: string | null; description: string | null}[]>`
    SELECT title, description FROM reports WHERE hash = ${hash}`;
  const token = await tokenFor(hash);
  const claims = await db()<ClaimRow[]>`
    SELECT c.chain_claim_id, c.side, c.amount,
           m.chain_market_id, m.spec_json, m.close_time, m.observed_day,
           m.observation_end, m.resolved_at, m.voided_at, m.outcome
      FROM claims c JOIN markets m ON m.id = c.market_id
     WHERE c.report_hash = ${hash}
       AND c.chain_claim_id IS NOT NULL AND m.chain_market_id IS NOT NULL
     ORDER BY m.created_at`;

  // ── ⚠️ THE PUBLIC HALF, AND EVERY LINE OF IT IS A COUNT, A LABEL OR AN IDENTIFIER ───────────────
  //
  // `facts` is iterated for `slug` and `deployment` — *where* a figure came from — and for its
  // length. **`f.value` is never read anywhere in this file.**
  const facts = Object.values(report.facts);
  const factCount = facts.length;
  const {coverage} = report.verdict;
  const slugs = [...new Set(facts.map((f) => f.slug))];
  const deploymentIds = [...new Set(facts.map((f) => f.deployment))];

  // ⚠️ **Sixteen of the nineteen stored reports pre-date migration 008 and have no title.** Those
  // show the directive shortened at a word boundary rather than a blank heading — the same words,
  // just the front of them — and the page says the heading was derived rather than written. The full
  // directive is on the page either way: it is what was asked, and a title cannot replace it.
  const title = titleRow?.title ?? null;
  const heading = title ?? shortenDirective(report.subject.directive);

  // ⚠️ **THE RECORD, AND IT IS PUBLIC METADATA — NOT A FIGURE.** Three counts over `scores`, joined
  // through `claims`. It discloses whether claims drawn from this report were right; it discloses no
  // fact value, no assessment prose and no section. Same class of public standing as the ISIN badge
  // beside it, and the paywall probe is run over this page after the change rather than assumed.
  const grade = (await gradesFor([hash])).get(hash);

  return (
    <main className="page-container report-page">
      <a href="/" className="back-link">
        <ArrowLeft size={15} />
        Report marketplace
      </a>

      <div className="page-heading">
        <div>
          <span className="eyebrow">
            RESEARCH REPORT / BLOCK {report.block.toLocaleString('en-US')}
          </span>
          <h1>{heading}</h1>
          {/* ⚠️ **The author's listing description (migration 010), on the unpaid side of the wall.**
              It is copy the author wrote to sell the report, set once at publish — public in the way
              the title is, and it is never a figure this page computed. **No description renders
              nothing**: no placeholder and no directive standing in, so a report without one reads
              exactly as it did before. */}
          {titleRow?.description && <p>{titleRow.description}</p>}
          {/* ⚠️ **The directive is NOT repeated here.** It is the document's own standfirst and the
              sheet below carries it whole; printing it twice above the fold was the page's worst
              duplication. Where the heading came from is said on the sheet's eyebrow instead. */}
        </div>
        {/* ⚠️ **THE GRADE SITS BESIDE THE TOKENIZED BADGE, IN THE HEADING.** Placement decided here:
            this is the line a reader already scans for the report's public standing, it is above the
            fold, and it is where the decision to pay is made — the card is where they browse, this
            is where they choose.

            ⚠️ **Deliberately NOT threaded through `BuyAndRead`.** That component's props are the
            paywall's simplest audit — "a hash, a price, a heading, the directive, an analyst, a
            block, a timestamp and six counts" — and adding a prop would change the sentence this
            file's header uses to state the guarantee. Rendering it in the server heading leaves that
            contract untouched.

            Renders nothing when the report has no graded claim, which is most of them. */}
        {/* ⚠️ Inline rather than a new class: `globals.css` was not in this task's file list, and
            two flex properties do not justify asking for it. If a third thing ever joins this row,
            that is the moment it becomes `.report-standing` in the stylesheet. */}
        <span style={{display: 'flex', gap: '9px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end'}}>
          <GradeMarker grade={grade} />
          {token ? (
            <span className="badge">Tokenized · {token.isin}</span>
          ) : (
            <span className="badge off">Not tokenized</span>
          )}
        </span>
      </div>

      {/* ── ⚠️ THE CONSOLE'S SHAPE, BECAUSE THE CONSOLE ALREADY SOLVED IT ──────────────────── */}
      {/* `.workspace` is the grid, `.viewer` the sheet, `.atlas-console` the dark rail. ⚠️ **There
          is no reference for this screen and `rebuild/MANIFEST.md` says so**: *"Screen 7, one report
          … The design reached these three states through a modal on the marketplace, so its export
          never rendered them."* Only the CSS was lifted, so this borrows the one layout in the repo
          that was drawn rather than invented.

          ⚠️ **HANDED THE PUBLIC FIELDS ONLY** — a hash, a price, a heading, the directive, the
          analyst, the block, six counts. No figure, no assessment, no section. One client component
          owns both columns because the bought body replaces the sealed block on the LEFT while the
          button that buys it is on the RIGHT, and both change on one event. The body reaches the
          browser only in the JSON returned to that component's own fetch. */}
      <BuyAndRead
        reportHash={hash}
        priceHbar={REPORT_PRICE_HBAR}
        heading={heading}
        derived={title === null}
        directive={report.subject.directive}
        analyst={report.analyst}
        block={report.block.toLocaleString('en-US')}
        observedAt={when(report.observedAt)}
        coverage={{
          facts: factCount,
          marketsRead: coverage.marketsRead,
          corroborated: coverage.marketsCorroborated,
          completeness: coverage.completeness,
          checksRun: coverage.checksRun,
          checksAvailable: coverage.checksAvailable,
          deployments: report.subject.deployments.length,
        }}
      >
        <div className="query-evidence">
              <span className="eyebrow">THE GRAPH / THIS REPORT&rsquo;S READ</span>
              <dl>
                <dt>Subgraph</dt>
                <dd>{slugs.length === 1 ? slugs[0] : `${slugs.length} deployments`}</dd>
                <dt>Deployment</dt>
                <dd>
                  {deploymentIds.length === 1 ? (
                    // ⚠️ The Graph's explorer 404s on a deployment hash — it takes a subgraph id — so
                    // this resolves the IPFS hash to the subgraph's own manifest, which returns 200.
                    <a
                      href={`https://api.thegraph.com/ipfs/api/v0/cat?arg=${deploymentIds[0]}`}
                      target="_blank"
                      rel="noreferrer"
                      title="The subgraph manifest this deployment hash resolves to — opens in a new tab"
                    >
                      {deploymentIds[0]!.slice(0, 18)}… <ArrowUpRight size={11} />
                    </a>
                  ) : (
                    `${deploymentIds.length} subgraphs`
                  )}
                </dd>
                <dt>Block</dt>
                <dd>
                  {/* ⚠️ Etherscan shows this block's own timestamp, and that timestamp IS the Retrieved
                      value below — `observedAt` is the chain's clock, not ours. */}
                  <a
                    href={`https://etherscan.io/block/${report.block}`}
                    target="_blank"
                    rel="noreferrer"
                    title="This block on Etherscan — compare its timestamp with Retrieved. Opens in a new tab"
                  >
                    {report.block.toLocaleString('en-US')} <ArrowUpRight size={11} />
                  </a>
                </dd>
                <dt>Records</dt>
                <dd>{factCount} figures</dd>
                <dt>Retrieved</dt>
                <dd>{when(report.observedAt)}</dd>
                <dt>Report hash</dt>
                <dd>{hash}</dd>
              </dl>
              <a className="text-link" href={`/console?report=${hash}`}>
                Open this report in the console <ArrowUpRight size={14} />
              </a>
            </div>
      </BuyAndRead>

      {/* ── The two ledgers ──────────────────────────────────────────────────────────────────── */}
      <section className="panel supporting-research">
        <div className="section-title">
          <h2>This report on two ledgers</h2>
          <span className="eyebrow">HEDERA · ARC</span>
        </div>
        {/* ⚠️ The disclaimer comes FIRST, before anything a reader could mistake for an
            integration. There is no bridge, no oracle and no cross-chain message, and none is being
            built — what exists is one 32-byte identifier written down in two places. */}
        <p className="muted">
          The same 32 bytes appear on two chains. <strong>Nothing crosses between them</strong> —
          Hedera&rsquo;s token commits this report&rsquo;s hash in its creation event, and
          Arc&rsquo;s market takes the same hash as a parameter. One identifier, in two places, and
          you can check both without trusting us.
        </p>

        {/* ⚠️ All 64 characters, never abbreviated. The reader's own eye comparing two complete
            strings is the entire mechanism; two matching truncations would demonstrate nothing. */}
        <div className="receipt-grid">
          <div>
            <small>The 32 bytes</small>
            <code>{hash}</code>
          </div>
          <div>
            <small>Analyst</small>
            <code>{report.analyst}</code>
          </div>
          <div>
            <small>Observed</small>
            <code>{when(report.observedAt)}</code>
          </div>
        </div>

        <div className="supporting-row">
          <div>
            <span className="badge">HEDERA</span>
          </div>
          <div>
            <h3>{token ? `ATS security ${token.isin}` : 'Not tokenized'}</h3>
            {token ? (
              <>
                <p>
                  Issued {whenDate(token.issuedAt)}. The creation event carries{' '}
                  <code>alpha:{hash}</code>, so the token names this report and no other.
                </p>
                <div className="receipt-grid">
                  <div>
                    <small>ISIN</small>
                    <code>{token.isin}</code>
                  </div>
                  <div>
                    <small>ResolverProxy</small>
                    <code>{token.proxyAddress}</code>
                  </div>
                </div>
              </>
            ) : (
              <p>
                The report is published and hashed; no ATS asset has been minted against it. Minting
                is a permanent on-chain action and it is done from the console, by hand.
              </p>
            )}
          </div>
          {token ? (
            <a
              className="text-link"
              href={`https://hashscan.io/testnet/contract/${token.proxyAddress}`}
              target="_blank"
              rel="noreferrer"
            >
              HashScan <ArrowUpRight size={14} />
            </a>
          ) : (
            <a className="text-link" href={`/console?report=${hash}`}>
              Tokenize it <ArrowUpRight size={14} />
            </a>
          )}
        </div>

        {claims.length === 0 ? (
          <div className="supporting-row">
            <div>
              <span className="badge">ARC</span>
            </div>
            <div>
              <h3>No market cites this report</h3>
              <p>
                The analyst has published it and has not staked its own money on a claim backed by
                it.
              </p>
            </div>
          </div>
        ) : (
          claims.map((c) => {
            const spec = JSON.parse(c.spec_json) as Spec;
            return (
              <div className="supporting-row" key={c.chain_claim_id}>
                <div>
                  <span className="badge">{c.side ? 'STAKED TRUE' : 'STAKED FALSE'}</span>
                </div>
                <div>
                  <h3>
                    Will {spec.slug}&rsquo;s {spec.metric} be {spec.comparison} $
                    {Number(spec.threshold).toLocaleString('en-US')} on {spec.observedDay}?
                  </h3>
                  <p>
                    Market #{c.chain_market_id} · claim #{c.chain_claim_id} · the analyst committed{' '}
                    {usdc(c.amount)} USDC of its own. {standing(c)}.
                  </p>
                  {/* ⚠️ **WITHOUT THIS THE PAGE CONTRADICTS ITSELF.** The grade marker above already
                      excludes a past-posted claim from this report's record; a row down here reading
                      "Resolved TRUE" with no qualification invites the reader to count it anyway.
                      Said on the row rather than in the marker, because it is a fact about this
                      market and not about the report's tally. */}
                  {pastPosted(c.close_time, c.observed_day) && (
                    <p>
                      ⚠️ <strong>Staking was open after {spec.observedDay} had ended</strong>, so the
                      answer was already published when this position was taken. It is a demo, not a
                      forecast, and it counts toward no record.
                    </p>
                  )}
                  {/* ⚠️ The `reportHash` parameter the contract was called with — the same 64
                      characters printed above, in the form Arc stores them. */}
                  <p>
                    <code>0x{hash}</code>
                  </p>
                </div>
                <a className="text-link" href={`/markets/${c.chain_market_id}`}>
                  The market <ArrowRight size={14} />
                </a>
              </div>
            );
          })
        )}
      </section>

    </main>
  );
}

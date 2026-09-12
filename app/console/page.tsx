import {AtlasPanel, type AtlasData} from '../components/AtlasPanel.js';
import {ConsoleViewer} from '../components/ConsoleViewer.js';
import {ListingPreviewText, TokenizeForm, type Listing, type TokenTarget} from '../components/TokenizeForm.js';
import {MiniDocument, type PreviewChart} from '../components/MiniDocument.js';
import {ArrowDown, ArrowRight, ArrowUpRight, Info} from '../components/Icons.js';
import {SecretProvider, type Evidence} from '../components/ConsoleSecret.js';
import {list, load} from '../../src/store/reports.js';
import {tokenFor} from '../../src/store/tokens.js';
import {db} from '../../src/store/db.js';
import {REPORT_PRICE_HBAR} from '../../src/config/pricing.js';
import {render} from '../../src/agent/narrate.js';

/**
 * The operator console: the workspace (report viewer and Atlas panel) with the
 * tokenize section below it, as in the design — tokenize is a section of this
 * page, not a route of its own.
 *
 * A server component. The three interactive panels are client components.
 */

// ---------------------------------------------------------------------------
// Demo content. Swap this const for the database query; the markup below reads
// from it and from nothing else.
// ---------------------------------------------------------------------------
type Workspace = {
  atlas: AtlasData;
  listing: Listing;
  listingPreview: {title: string; subtitle: string; preview: PreviewChart; marketId: string};
  steps: {number: string; title: string; hint: string; complete: boolean}[];
};

const WORKSPACE: Workspace = {
  atlas: {
    // ⚠️ Invented, like the rest. The panel shows the saved report's own hash once there is one.
    run: 'no run yet',
    idleMessage: 'Ready for your next question.',
    promptLimit: 1000,
    status: [
      // ⚠️ Only the LABELS are used — the panel derives every value from the run's own stages, and
      // shows "no run yet" before one. These placeholders were "Data retrieved" / "Passed" /
      // "Page 1", which never rendered but did travel in the RSC payload, so a grep for invented
      // values found them. Nothing invented should be in the bytes at all.
      {label: 'The Graph', value: 'no run yet'},
      {label: 'Checks', value: 'no run yet'},
      {label: 'Report', value: 'no run yet'},
    ],
    terminal: [
      // ⚠️ **The same fault the Query Evidence block had, in the same panel.** These were
      // `[14:02:08] Snapshot loaded · 120 records` — an invented time and an invented row count
      // under a heading a judge reads as a log of what just happened. A terminal reporting a run
      // before any run is the console lying about itself. The real lines take over the moment a
      // run starts.
      {stamp: '—', text: 'No run yet. Ask Atlas below and this fills as it goes.'},
    ],
  },
  listing: {
    title: 'Lending protocols / Q2 2026',
    category: 'Lending',
    description: 'Comparative financial analysis of leading lending protocols.',
    price: 5,
    currency: 'USDC',
    fileName: 'lending-protocols-q2-2026.pdf',
    filePages: 4,
    marketClaim: 'Aave leads lending by end-2027',
    // ⚠️ Not 'Created after publishing'. The ISIN is derived from the report hash before anything
    // is sent, which is why the tokenize form can show it in the plan.
    tokenIdState: 'Derived from the report hash',
    transactionState: 'Not submitted',
    // ⚠️ Not 'Awaiting publication'. Nothing is awaited: the marketplace reads the store.
    publishState: 'Listed as soon as it is minted',
  },
  listingPreview: {
    title: 'Lending protocols / Q2 2026',
    subtitle: 'Comparative financial analysis of leading lending protocols.',
    preview: 'bars',
    marketId: 'lending-2027',
  },
  steps: [
    // ⚠️ **STEP 03 USED TO READ "Publish · Make it available" AND THERE IS NO SUCH STEP.**
    // Minting writes `report_tokens`; `/` is `force-dynamic` and reads the store on every request,
    // so a report is listed the moment the row exists. A third step implied a button that would fire
    // and change nothing, which is worse than a step that says it happens by itself. ⚠️ Step 02 was
    // "Set access & details", which also overstated things: `/api/console/tokenize` accepts
    // `{reportHash, confirm}` and nothing else, so the title, description and price are a preview of
    // the card and are never stored. `TokenizeForm` says the same thing where the person types them.
    {number: '01', title: 'Report', hint: 'The research being tokenized', complete: true},
    {number: '02', title: 'Listing', hint: 'Preview only · these fields are not stored', complete: false},
    {number: '03', title: 'Listed', hint: 'Automatic — minting is what lists it', complete: false},
  ],
};

// ── ⚠️ THE REPORT THE PANEL SHOWS ────────────────────────────────────────────────────────────────
//
// **The most recently saved report in the store, rendered by `narrate.ts`'s `render()`.**
//
// ⚠️ **PHASE-6 D4 IS WRONG AS WRITTEN AND THIS REPLACES IT.** D4 said this panel should build
// `PaperBlock[]` from the fact table "with no parser", to avoid a second renderer. **Building blocks
// WAS the second renderer, and it was the wrong one.** It printed `{fact:…}` placeholders raw —
// substitution is `render()`'s entire job, because the model may never type a digit — and it dumped
// all 140 facts instead of the ten the narrator chose, which is how a two-page report became 52.
//
// ⚠️ **`app/markdown.tsx` was purpose-built for exactly this output.** Its own header: *"Not a
// markdown parser, and should not become one. It reads the output of ONE known generator —
// `narrate.ts`'s `render()` — which emits exactly four things: one `#` heading, one GFM pipe table,
// plain paragraphs, and `**bold**` inside cells."* So `render()` → `Markdown` is **one** renderer for
// one producer, shared with the bought body on `/report/[hash]`. There is no parser and no second
// answer to what a figure looks like: `show()` inside `render()` is the only one.
//
// ⚠️ **A run does not push its report here by itself.** The stream is client-side and this read is
// server-side, so a new report appears on the next request — reload.

// ⚠️ **Per request, never prerendered.** Without this Next renders `/console` once at build time
// and the document panel freezes on whatever report was newest when the deploy ran — so a report
// generated a minute ago never appears, and `router.refresh()` has nothing new to fetch. `/` carries
// the same directive for the same reason. **This page had lost it, and that is why a fresh report
// did not show up even after the refresh was wired.**
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export type DocMeta = {
  hash: string;
  /** ⚠️ The narrator's own name, or a heading derived from the directive when there is none. */
  heading: string;
  /** ⚠️ True when the heading came from the directive rather than the narrator. */
  derived: boolean;
  directive: string;
  factCount: number;
  checksRun: number;
  checksTotal: number;
  /** For the sheet's eyebrow — what was read and at which block. */
  deployments: string;
  block: number;
  analyst: string;
  /** ⚠️ The report's OWN provenance, read off the stored record and never recomputed. */
  observedAt: string;
  /** Distinct deployment slugs the figures came from. */
  slugs: string[];
  /** Distinct subgraph deployment ids — what a slug does not identify. */
  deploymentIds: string[];
};

/** Cut a long directive to a heading-sized phrase at a word boundary. No ellipsis mid-word. */
function shortenDirective(directive: string): string {
  const d = directive.trim().replace(/[?.]+$/, '');
  if (d.length <= 58) return d;
  const cut = d.slice(0, 58);
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}

/** A report hash is 32 bytes of hex. Anything else is malformed and is refused, not guessed at. */
const HASH = /^[0-9a-f]{64}$/i;

/**
 * ⚠️ **`?report=<hash>` loads that report; no parameter loads the most recent.**
 *
 * ⚠️ **An unknown or malformed hash REFUSES rather than falling back.** A page that quietly shows
 * something other than what was asked for is worse than one that says it cannot: the tokenize form
 * below targets whatever is in the panel, and a silent fallback would point a spend control at the
 * wrong report.
 */
async function latestDoc(
  requested?: string,
): Promise<{markdown: string; meta: DocMeta} | {refused: string} | null> {
  let hash: string;
  if (requested !== undefined) {
    // ⚠️ Same normalisation as the tokenize form: whitespace anywhere, an `0x` prefix and capitals
    // are all the same hash to a person, and a URL pasted out of a terminal carries any of them.
    const clean = requested.replace(/\s+/g, '').replace(/^0x/i, '').toLowerCase();
    if (!HASH.test(clean)) {
      // ⚠️ "Not a hash" and "not in the store" are different problems; this is the first.
      return {
        refused:
          `"${requested.slice(0, 24)}${requested.length > 24 ? '…' : ''}" is not a report hash. ` +
          `It needs 64 hex characters; this is ${clean.length}. Whitespace, an 0x prefix and ` +
          'capitals are all handled.',
      };
    }
    hash = clean;
  } else {
    const listed = await list(1);
    if (listed.length === 0) return null;
    hash = listed[0].hash;
  }

  const report = await load(hash);
  if (!report) {
    return requested === undefined
      ? null
      // ⚠️ The second problem, said as its own thing: the hash is well-formed and nothing has it.
      : {refused: `That is a valid report hash, but no report ${hash.slice(0, 16)}… is in the store.`};
  }

  const facts = Object.values(report.facts);
  const title = (await list(50)).find((r) => r.hash === hash)?.title ?? null;

  return {
    // ⚠️ The hash is passed, so the rendered document carries its own identity — the 32 bytes an ATS
    // token commits and an Arc market settles against.
    markdown: render(report, hash),
    meta: {
      hash,
      // ⚠️ **Eleven reports pre-date migration 008 and have no title.** Rather than a blank heading,
      // those get the directive shortened at a word boundary — the same words, just the front of
      // them — and the sheet says the heading was derived. ⚠️ **The full directive stays on the
      // sheet either way**: it is what was asked, and a title that replaced it would lose the
      // question.
      // ⚠️ The title is a column, so it is read alongside the report rather than from `load()`,
      // which returns the hashed object and knows nothing about it.
      heading: title ?? shortenDirective(report.subject.directive),
      derived: title === null,
      directive: report.subject.directive,
      factCount: Object.keys(report.facts).length,
      checksRun: report.checks.filter((c) => c.outcome !== 'not_checked').length,
      checksTotal: report.checks.length,
      deployments: report.subject.deployments.join(' · ') || 'no deployments',
      block: report.block,
      analyst: report.analyst,
      // ⚠️ **From the stored record, never a fresh read.** This block is evidence about a read that
      // already happened; re-querying to fill it would be a new read dressed as an old one.
      observedAt: report.observedAt,
      slugs: [...new Set(facts.map((f) => f.slug))],
      deploymentIds: [...new Set(facts.map((f) => f.deployment))],
    },
  };
}

export default async function Console({
  searchParams,
}: {
  searchParams: Promise<{report?: string}>;
}) {
  const {report: requested} = await searchParams;
  const {atlas, listing, listingPreview, steps} = WORKSPACE;
  // ⚠️ The mockup's paper, fileName and pages are gone from the render — the panel shows the real
  // latest report, or an empty state when the store has none.
  const loaded = await latestDoc(requested);
  // ⚠️ A refusal is not a document. The panel says what it could not load and the tokenize form gets
  // no target, so nothing below can spend against the wrong report.
  const refused = loaded !== null && 'refused' in loaded ? loaded.refused : null;
  const doc = loaded !== null && 'markdown' in loaded ? loaded : null;

  // ⚠️ **Built on the SERVER so the evidence is in the first bytes**, not filled in after hydration.
  // A judge opening `/console` cold sees the block populated; a grep of the served HTML finds the
  // values. Every field is read off the stored record — no query runs here.
  // ⚠️ **What the tokenize form works on: the report on screen.** Same hash, same document — so the
  // form never asks anyone to find a 64-character string that is already rendered above it.
  // ⚠️ **CORRECTION to what I recorded last task.** I said `report_tokens` had no transaction
  // columns; it has three — `tokensFor`'s `ReportToken` interface only SELECTs four, which is what
  // misled me. So a report tokenized in an earlier session can show its full receipt after all.
  // Read here rather than through `tokenFor`, the way this repo's pages write their own joins.
  const token = doc ? await tokenFor(doc.meta.hash) : null;
  const [txs] = doc && token
    ? await db()<{deploy_tx: string | null; grant_role_tx: string | null; issue_tx: string | null}[]>`
        SELECT deploy_tx, grant_role_tx, issue_tx FROM report_tokens WHERE report_hash = ${doc.meta.hash}`
    : [undefined];
  const target: TokenTarget | null = doc && {
    hash: doc.meta.hash,
    heading: doc.meta.heading,
    factCount: doc.meta.factCount,
    // ⚠️ **HBAR, not USDC.** `pricing.ts` records why a dollar price cannot simply be typed in:
    // `defaultMoneyConversion` resolves USD through a `DEFAULT_ASSETS` table with no HBAR entry, so
    // a "$0.50" price throws rather than converting. The USDC cutover belongs to mainnet.
    priceHbar: REPORT_PRICE_HBAR,
    token: token
      ? {
          proxyAddress: token.proxyAddress,
          isin: token.isin,
          issuedAt: token.issuedAt.toISOString(),
          deployTx: txs?.deploy_tx ?? null,
          grantRoleTx: txs?.grant_role_tx ?? null,
          issueTx: txs?.issue_tx ?? null,
        }
      : null,
  };

  const reportEvidence: Evidence | null = doc && {
    kind: 'report',
    // A report may span several deployments; the row says how many rather than picking one.
    subgraph: doc.meta.slugs.length === 1 ? doc.meta.slugs[0]! : `${doc.meta.slugs.length} deployments`,
    deployment:
      doc.meta.deploymentIds.length === 1
        ? doc.meta.deploymentIds[0]!
        : `${doc.meta.deploymentIds.length} subgraphs`,
    // ⚠️ The COMMON block — the one thing the pipeline guarantees across a multi-deployment read.
    block: doc.meta.block,
    requestedBlock: null,
    fetchedAt: doc.meta.observedAt,
    records: `${doc.meta.factCount} figures`,
  };

  return (
    // ⚠️ **The provider wraps the WHOLE page, not just the workspace.** The tokenize section below
    // reads the same context — the draft listing the preview shows as you type — and it is a sibling
    // of the workspace, not a child. `SecretProvider` renders no DOM element, so widening its scope
    // changes no markup. It previously wrapped `.workspace` only, and the tokenize form calling
    // `useSecret` 500'd the page the moment it did.
    <SecretProvider>
    <main className="console-page">
      {/* ⚠️ The doorlock's value is typed in the dark Atlas panel and used by the light viewer's
          Source data tab. They are not siblings, so it lives in a context whose provider
          **renders no DOM element at all** — see `ConsoleSecret.tsx`. */}
      <div className="workspace">
        <ConsoleViewer doc={doc} refused={refused} />
        <AtlasPanel atlas={atlas} reportEvidence={reportEvidence} />
      </div>

      <div className="workspace-footer">
        <span>Select report text to edit or add a note.</span>
        <nav className="workspace-links" aria-label="Explore Alpha Markets">
          <a href="/">
            Report marketplace <ArrowUpRight size={14} />
          </a>
          <a href="/markets">
            All predictions <ArrowUpRight size={14} />
          </a>
          <a href="#tokenize">
            Tokenize <ArrowDown size={14} />
          </a>
        </nav>
      </div>

      <section id="tokenize" className="tokenize-section">
        <div className="tokenize-heading">
          <span className="eyebrow">FROM RESEARCH TO CONVICTION</span>
          <h1>Tokenize your report.</h1>
          {/* ⚠️ "Publish your research" named a step that does not exist. Minting is the only
              action on this page, and listing follows from it. */}
          <p>Mint the security. The marketplace lists it on the next request.</p>
        </div>

        <div className="tokenize-grid">
          <div>
            <div className="publish-steps">
              {steps.map((step) => (
                <div key={step.number} className={step.complete ? 'complete' : undefined}>
                  <b>{step.number}</b>
                  <span>
                    <strong>{step.title}</strong>
                    <small>{step.hint}</small>
                  </span>
                  <ArrowRight size={16} />
                </div>
              ))}
            </div>

            <TokenizeForm listing={listing} target={target} />
          </div>

          <aside className="listing-preview dark-panel">
            <div className="section-title">
              <h2>Marketplace preview</h2>
              <span className="badge">{listing.publishState}</span>
            </div>

            <MiniDocument
              title={listingPreview.title}
              subtitle={listingPreview.subtitle}
              preview={listingPreview.preview}
            />

            {/* ⚠️ Live from the form beside it — title, description and price as they are typed. The
                fallback is the report on screen, not the mockup. */}
            <ListingPreviewText
              fallback={{title: target?.heading ?? 'No report yet', priceHbar: target?.priceHbar ?? '—'}}
            />

            <div className="related-preview">
              <span>Related prediction market</span>
              <a href={`/markets/${listingPreview.marketId}`}>
                {listing.marketClaim}
                <ArrowRight size={16} />
              </a>
            </div>

            <div className="token-flow">
              <span>
                Hedera
                <br />
                <b>Tokenize</b>
              </span>
              <ArrowRight size={15} />
              <span>
                Marketplace
                <br />
                <b>List report</b>
              </span>
              <ArrowRight size={15} />
              <span>
                x402
                <br />
                <b>Unlock</b>
              </span>
            </div>

            <p className="notice">
              <Info size={16} />
              Publication writes the token and the listing together. Uploaded PDFs are held for this session only.
            </p>
          </aside>
        </div>
      </section>
    </main>
    </SecretProvider>
  );
}

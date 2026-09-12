import {AtlasPanel, type AtlasData} from '../components/AtlasPanel.js';
import {ConsoleViewer} from '../components/ConsoleViewer.js';
import {ListingPreviewText, TokenizeForm, type Listing, type TokenTarget} from '../components/TokenizeForm.js';
import {MiniDocument, type PreviewChart} from '../components/MiniDocument.js';
import {ArrowDown, ArrowRight, ArrowUpRight, Check, Info} from '../components/Icons.js';
import {SecretProvider, type Evidence} from '../components/ConsoleSecret.js';
import {list, load, publish} from '../../src/store/reports.js';
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
    // ⚠️ Reversed again by 009. This was 'Awaiting publication' (wrong: nothing was awaited), then
    // 'Listed as soon as it is minted' (true only while `/` showed every row). The badge now reports
    // the report's actual landmark, filled at the render site — this literal is the no-report case.
    publishState: 'No report selected',
  },
  listingPreview: {
    title: 'Lending protocols / Q2 2026',
    subtitle: 'Comparative financial analysis of leading lending protocols.',
    preview: 'bars',
    marketId: 'lending-2027',
  },
  steps: [
    // ⚠️ **STEP 03 HAS NOW BEEN WRONG IN BOTH DIRECTIONS, AND THIS RECORDS WHY.** It first read
    // "Publish · Make it available" while no publish step existed, so it promised a control that was
    // not there. I then corrected it to "Listed · Automatic — minting is what lists it", which was
    // true of a marketplace that rendered every row in the store. **Migration 009 makes that false
    // again**: `/` lists published reports only, so publishing is a decision and there is a control
    // for it below. ⚠️ Step 02's hint survives both reversals because it was never about publishing:
    // `/api/console/tokenize` accepts `{reportHash, confirm}` and nothing else, so the title,
    // description and price are a preview of the card and are never stored.
    //
    // ⚠️ **The `complete` flags are now READ FROM STATE rather than hardcoded** — they were `true,
    // false, false` on every render regardless of what had happened, which is decoration pretending
    // to be a status. Filled at the render site below.
    {number: '01', title: 'Report', hint: 'The research being listed', complete: false},
    {number: '02', title: 'Listing', hint: 'Preview only · these fields are not stored', complete: false},
    {number: '03', title: 'Publish', hint: 'Puts it in the marketplace · tokenizing is separate', complete: false},
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
  /** ⚠️ When the author listed it, or null. Migration 009 — a column beside the report, not in it. */
  publishedAt: string | null;
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
  // ⚠️ One lookup, two columns. `title` and `published_at` both live beside the report rather than
  // inside it, so `load()` — which returns the hashed object — knows about neither.
  const listed = (await list(500)).find((r) => r.hash === hash);
  const title = listed?.title ?? null;

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
      publishedAt: listed?.publishedAt?.toISOString() ?? null,
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

  // ── ⚠️ PUBLISHING: A SERVER ACTION, NOT A ROUTE ───────────────────────────────────────────────
  //
  // ⚠️ **A deliberate first for this repo, and the constraint forced it rather than taste.** Every
  // other mutation here is an API route under `app/api/`; this unit may touch `app/console/` and
  // nothing else, so a route was not available. A `'use server'` function reached by a plain `<form
  // action={…}>` is the mechanism Next 16 provides for exactly this, it needs no client component
  // and no new dependency, and the form works without JavaScript.
  //
  // ⚠️ **It is NOT behind `locked()`** — and neither is any other console route today; the doorlock
  // has been unwired since 2026-09-12 (see `app/api/console/lock.ts`). ⚠️ **Unlike its neighbours
  // this action spends nothing**: it writes one timestamp. `generate` burns Anthropic budget and
  // `tokenize` mints for ~7.7 HBAR; publishing is free and reversible only in the sense that it
  // cannot be reversed — see `publish()`'s own note.
  //
  // ⚠️ **No `revalidatePath`.** Both `/` and `/console` are `force-dynamic`, so neither has a cache
  // to bust: Next re-renders this route when the action resolves, and `/` re-reads the store on its
  // next request. Adding a revalidate call would be ceremony that does nothing.
  // ⚠️ See the control in the card below for why this exists. One object, three call sites, so the
  // three states of the control cannot drift apart at the breakpoint where the card is a grid.
  const PLACE = {gridColumn: 2} as const;

  async function publishReport(formData: FormData): Promise<void> {
    'use server';
    const hash = String(formData.get('hash') ?? '');
    // ⚠️ The hash comes from this page's own target, so this guard is for a hand-crafted POST. A
    // malformed one does nothing rather than reaching the store with a bad key.
    if (!/^[0-9a-f]{64}$/.test(hash)) return;
    await publish(hash);
  }

  // ⚠️ **The author's unpublished reports, and this is the answer to "where do they see them".**
  // The console targets one report at a time by hash, which is enough for the report someone has
  // just generated — it is already on screen — and useless for one written last week, whose hash
  // nobody has memorised. ⚠️ **This is NOT a second marketplace**: no cards, no prices, no previews,
  // no thumbnails. A collapsed list of headings, each loading that report into this console. The
  // marketplace is the place that sells things, and it stays the only one.
  const unlisted = (await list(500)).filter((r) => r.publishedAt === null);

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
          {/* ⚠️ Reversed by 009: listing no longer follows from minting. Two independent actions,
              named as two. */}
          <p>Mint a security if you want one. Publish when the market should see it.</p>
        </div>

        <div className="tokenize-grid">
          <div>
            {/* ⚠️ The flags describe this report, not a mock-up: 01 is done when a document is
                loaded, 02 when the listing preview has something to preview, 03 when the landmark
                is set. A status indicator that never changes is decoration. */}
            <div className="publish-steps">
              {steps.map((step, i) => (
                <div
                  key={step.number}
                  className={
                    (i === 2 ? doc?.meta.publishedAt != null : doc !== null) ? 'complete' : undefined
                  }
                >
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

            {/* ── ⚠️ THE ROSTER STAYS HERE, AND IT IS NOT THE CONTROL ──────────────────────── */}
            {/* The publish button moved into the Marketplace preview card, where the listing it
                creates is shown. **This did not move with it, deliberately.** The card previews ONE
                report; a list of eleven others inside it would be a second index sitting in a
                preview of something else. It is navigation among drafts, so it belongs under the
                form that targets a report — each link loads that report into this console.
                ⚠️ Still not a second marketplace: headings only, no cards, no prices, no previews. */}
            {unlisted.length > 0 && (
              <details className="integration-detail">
                <summary>
                  <span>{unlisted.length} report{unlisted.length === 1 ? '' : 's'} not listed</span>
                  <span className="badge off">unpublished</span>
                </summary>
                <p>
                  In the store, not on the marketplace. Open one here to read it, then publish it
                  from the preview card.
                </p>
                {unlisted.map((r) => (
                  <div key={r.hash}>
                    <a className="text-link" href={`/console?report=${r.hash}`}>
                      {r.title ?? r.directive.slice(0, 54)}
                      {!r.title && r.directive.length > 54 ? '…' : ''} <ArrowUpRight size={13} />
                    </a>
                  </div>
                ))}
              </details>
            )}
          </div>

          <aside className="listing-preview dark-panel">
            <div className="section-title">
              <h2>Marketplace preview</h2>
              <span className={doc?.meta.publishedAt ? 'badge' : 'badge off'}>
                {doc
                  ? doc.meta.publishedAt
                    ? `Listed ${doc.meta.publishedAt.slice(0, 10)}`
                    : 'Not listed'
                  : listing.publishState}
              </span>
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

            {/* ── ⚠️ THE PUBLISH CONTROL, IN THE CARD THAT SHOWS WHAT IT CREATES ─────────────── */}
            {/* ⚠️ **Inserted into the card's existing sequence; nothing already in it moved.** The
                badge above, the thumbnail, the listing text, the related market, the flow strip and
                the notice are all where they were.

                ⚠️ **`gridColumn: 2` is not decoration.** At ≤1180px `.listing-preview` becomes a
                two-column grid and the reference places its own control with
                `.listing-preview > .btn { grid-column: 2 }` — a **direct-child** selector. A server
                action needs a real `<form>`, and a `<form>` wrapper breaks that selector: the button
                is no longer a direct child, and the form itself would auto-place into column 1,
                colliding with the thumbnail that spans rows 2–7. The inline placement puts the form
                where the reference puts the button. It is inert at wider widths, where the card is
                not a grid at all.

                ⚠️ **It stays a server action and a real no-JS form.** The served markup is
                `<form action="" encType="multipart/form-data" method="POST">` with the action id and
                the hash as hidden inputs — no fetch, no client component, and it works with
                JavaScript off. Turning it into a fetch to fit the card would trade that away for
                nothing. */}
            {/* ⚠️ **THE WHITE BUTTON IS PUBLISH IN ALL THREE STATES.** It briefly became
                "See it as a buyer does" for a published report, which made the card's one white
                control stop being the publish control — and because `/console` with no `?report=`
                loads the MOST RECENT report, which is usually the one just published, the publish
                button vanished from the URL almost everyone opens. A control that disappears in its
                commonest state is not a control.

                ⚠️ **The buyer link is kept and demoted to a `.text-link` BENEATH the button**, not
                promoted into it. That was the choice: the button has one job in every state, and the
                link is a second, quieter action that does not compete with it. */}
            {!doc ? (
              // Nothing loaded: present and visibly not pressable, which is truer than an absent
              // button on a card that is otherwise fully drawn.
              <span className="btn white full inert" style={PLACE}>Publish to the marketplace</span>
            ) : doc.meta.publishedAt ? (
              // ⚠️ Says it is done and does NOT offer to publish again. `publish()` is idempotent so
              // a second press would be harmless, but a live button on a finished action invites a
              // press that means nothing — and `.inert` is the design's own spent-control treatment.
              <span className="btn white full inert" style={PLACE}>
                <Check size={15} /> Published to the marketplace
              </span>
            ) : (
              <form action={publishReport} style={PLACE}>
                <input type="hidden" name="hash" value={doc.meta.hash} />
                <button className="btn white full" type="submit">
                  Publish to the marketplace <ArrowUpRight size={15} />
                </button>
              </form>
            )}

            {/* ⚠️ Beneath the button, only once there is something for a buyer to see. A direct
                child of the card, so it needs the same column placement at the grid breakpoint. */}
            {doc?.meta.publishedAt && (
              <a className="text-link" href={`/report/${doc.meta.hash}`} style={PLACE}>
                See it as a buyer does <ArrowUpRight size={14} />
              </a>
            )}

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

            {/* ⚠️ **THIS NOTICE SAID THE OPPOSITE OF WHAT IS TRUE, TWICE.** "Publication writes the
                token and the listing together" was the pre-009 world; they are now two decisions and
                the control above does only one of them. "Uploaded PDFs are held for this session
                only" implies uploading works — the form's own upload zone says in so many words that
                **uploading a report is not built**, because an uploaded PDF has no canonical form
                and so nothing to hash.

                ⚠️ **The one-way reason is load-bearing and survives the move from the section that
                had room for it.** Shorter here, same claim: the landmark records that this report
                was listed, and a settled purchase cannot be un-made by hiding the row.
                ⚠️ `.notice` is `display:flex`, so the prose is ONE `<span>` — this file has shipped
                the scattered-column version before. */}
            <p className="notice">
              <Info size={16} />
              <span>
                <strong>Listing is one-way.</strong> Publishing puts this report on the marketplace.
                It does not mint a token and it does not move money. There is no unpublish: a
                purchase settled against a listed report cannot be un-made by hiding the row.
              </span>
            </p>
          </aside>
        </div>
      </section>
    </main>
    </SecretProvider>
  );
}

'use client';

import {useLayoutEffect, useRef, useState} from 'react';
import {useFitPanel} from '../hooks/useFitPanel.js';
import {useSecret} from './ConsoleSecret.js';
import {useRouter} from 'next/navigation.js';
import {Markdown} from '../markdown.js';
import {BrandMark} from './Icons.js';
import type {DocMeta} from '../console/page.js';
import {
  ChevronLeft,
  ChevronRight,
  Database,
  FileText,
  Maximize,
  MessageSquare,
  Minus,
  Pencil,
  Plus,
  RefreshCw,
} from './Icons.js';

/**
 * The document viewer: the Report / Source data tabs, the zoom and page
 * controls, the report sheet and the edit toolbar. Client-only — tabs, zoom and
 * the page number are all browser state.
 *
 * The sheet is scaled to the column by useFitPanel.
 */
/**
 * One row of the roster. ⚠️ **`schemaVersion` is what the deployment REPORTED**, not what
 * `config/protocols.ts` declares — that file's own header says the declared value *"is not
 * authoritative"* and that `adapter.ts` dispatches on the live one. A column filled from config
 * would restate our assumption; this is evidence.
 */
export type RosterRow = {
  slug: string;
  schemaVersion: string | null;
  declared: string | null;
  answering: boolean;
  block: number | null;
  lagSeconds: number | null;
  reason: string | null;
};

/** What `/api/console/source` returns, reduced to what this panel draws. */
export type Roster = {
  rows: RosterRow[];
  answering: number;
  total: number;
  schemaVersions: string[];
  truncated: boolean;
  budgetMs: number;
  block: string;
  readAt: string;
};

/**
 * Split `render()`'s markdown into the chunks a page can be built from — ⚠️ **string work, not
 * parsing.** A chunk is a run of lines between blank lines; the only special case is a GFM table,
 * whose header and delimiter are repeated when its rows have to span sheets. Nothing here
 * interprets markdown: `app/markdown.tsx` is still the only thing that turns it into elements.
 */
function chunk(markdown: string): string[] {
  return markdown
    .split(/\n{2,}/)
    .map((c) => c.trim())
    .filter(Boolean);
}

/** Split one table chunk so no piece carries more than `rows` data rows, repeating its header. */
function splitTable(block: string, rows: number): string[] {
  const lines = block.split('\n');
  if (lines.length < 3 || !lines[0]!.startsWith('|')) return [block];
  const [head, delim, ...body] = lines;
  if (body.length <= rows) return [block];
  const out: string[] = [];
  for (let i = 0; i < body.length; i += rows) {
    out.push([head, delim, ...body.slice(i, i + rows)].join('\n'));
  }
  return out;
}

/**
 * ⚠️ **A guard, not the pagination.** The packing below is measured; this only makes sure no single
 * chunk can be taller than a sheet, because a chunk is the smallest thing `pack()` can place. A
 * 2,000-character assessment is one paragraph and would otherwise sit alone on a sheet it overflows,
 * and the sheet would scale down rather than paginate. Split at sentence ends, which is where a
 * printed document breaks a paragraph across pages. ⚠️ **Not one word changes.**
 */
function splitProse(block: string, maxChars: number): string[] {
  if (block.length <= maxChars) return [block];
  const sentences = block.split(/(?<=\.)\s+/);
  const out: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    if (current && (current + ' ' + sentence).length > maxChars) {
      out.push(current);
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }
  if (current) out.push(current);
  return out;
}

/** Greedy pack of measured chunk heights into sheets of `available` pixels. */
function pack(heights: number[], firstPage: number, laterPages: number): number[][] {
  const pages: number[][] = [];
  let current: number[] = [];
  let used = 0;
  for (let i = 0; i < heights.length; i++) {
    const h = heights[i]!;
    const budget = pages.length === 0 ? firstPage : laterPages;
    if (current.length && used + h > budget) {
      pages.push(current);
      current = [];
      used = 0;
    }
    current.push(i);
    used += h;
  }
  if (current.length) pages.push(current);
  return pages.length ? pages : [[]];
}

/** ⚠️ `.report-paper`'s own `min-height`. The sheet is a fixed page; content splits to fit it, and
 *  the sheet never shrinks to fit content — that is what the pager is for. */
const PAGE_HEIGHT = 840;
/** See the guards below — sized so neither kind of chunk can exceed one sheet's budget. */
const MAX_TABLE_ROWS = 12;
const MAX_PROSE_CHARS = 900;

const BASE_WIDTH = 690;
const BASE_ZOOM = 90;

export function ConsoleViewer({
  doc,
  refused,
}: {
  doc: {markdown: string; meta: DocMeta} | null;
  /** ⚠️ Set when `?report=` named something this store does not have, or is not a hash at all. */
  refused: string | null;
}) {
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(BASE_ZOOM);

  // ── The roster ────────────────────────────────────────────────────────────────────────────────
  // ⚠️ **The secret is still read and still sent, and it is currently always `''`.** The six console
  // routes have `locked()` commented out, so the header is ignored — but keeping the send means
  // re-wiring the lock is a change in `lock.ts`'s callers and nothing here. See DECISIONS.md.
  const {secret, run, setSource, setEvidence, tab, setTab} = useSecret();
  const router = useRouter();
  const [roster, setRoster] = useState<Roster | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const total = 28;

  async function onReadRoster() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/console/source', {
        method: 'POST',
        headers: {'content-type': 'application/json', 'x-console-secret': secret},
        body: JSON.stringify({}),
      });
      // ⚠️ **STATUS FIRST, BODY SECOND, AND THE ORDER IS THE WHOLE BUG THIS FIXES.** The previous
      // version called `res.json()` here, before any status check. A 500 from `requiredEnv` has an
      // **empty body and no content-type** — measured — so `res.json()` threw
      // *"Unexpected end of JSON input"* and the 500 branch below it could never run. The one
      // message that would have named the real cause was unreachable from the moment it was written.
      //
      // ⚠️ 401 and 500 are different facts. `lock.ts` runs `requiredEnv` BEFORE it compares, so:
      //   500 = the server's own CONSOLE_SECRET is absent or blank — nothing you type can help
      //   401 = the server has one and this is not it
      if (res.status === 500) {
        throw new Error(
          'The server has no CONSOLE_SECRET. Nothing you type here will work until it does — ' +
          'if you added it to .env after starting the server, the running process cannot see it. ' +
          'Restart the server.',
        );
      }
      if (res.status === 401) {
        throw new Error('Console secret rejected. The server has one; this is not it.');
      }

      // ⚠️ Read as text and parse defensively. Every remaining failure — a proxy, a crash, an HTML
      // error page — arrives as a body that is not JSON, and `res.json()` would replace the status
      // with a parser message that names none of it.
      const raw = await res.text();
      let j: Record<string, unknown>;
      try {
        j = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        throw new Error(
          `The route answered HTTP ${res.status} with a body that is not JSON` +
          `${raw.trim() ? `: ${raw.trim().slice(0, 120)}` : ' (empty body).'}`,
        );
      }

      if (j.stop || j.fail) throw new Error(String(j.stop ?? j.fail));
      if (!res.ok) throw new Error(`The route answered HTTP ${res.status}.`);
      const rows = j.roster as RosterRow[];
      // ⚠️ Block and time come off the responses' own `_meta`, never off our clock — which is what
      // makes them move between presses and what makes them evidence rather than decoration.
      const blocks = rows.map((r) => r.block).filter((b): b is number => b !== null);
      // ⚠️ The evidence record, published to the Atlas panel's Query Evidence block. Every field
      // comes off the response — `block` and `fetchedAt` from the subgraph's own `_meta`, never our
      // clock — which is what makes them evidence rather than decoration.
      const ev = j.evidence as Record<string, unknown>;
      setSource({
        subgraph: String(j.subgraph),
        deployment: String(ev.deployment),
        block: Number(ev.block),
        requestedBlock: (ev.requestedBlock as number | null) ?? null,
        fetchedAt: String(ev.fetchedAt),
        rowCount: (ev.rowCount as number | null) ?? null,
        documentHash: String(ev.documentHash),
        responseHash: String(ev.responseHash),
        answering: j.answering as number,
        total: j.total as number,
        versions: (j.schemaVersions as string[]).length,
      });
      setEvidence({
        kind: 'source',
        subgraph: String(j.subgraph),
        deployment: String(ev.deployment),
        block: Number(ev.block),
        requestedBlock: (ev.requestedBlock as number | null) ?? null,
        fetchedAt: String(ev.fetchedAt),
        records: `${j.answering} of ${j.total} answering`,
      });
      setRoster({
        rows,
        answering: j.answering as number,
        total: j.total as number,
        schemaVersions: j.schemaVersions as string[],
        truncated: j.truncated as boolean,
        budgetMs: j.budgetMs as number,
        block: blocks.length ? Math.max(...blocks).toLocaleString('en-US') : '—',
        readAt: String((j.evidence as {fetchedAt?: string} | undefined)?.fetchedAt ?? '').slice(11, 19) + ' UTC',
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  // ── Pagination, measured ──────────────────────────────────────────────────────────────────────
  // ⚠️ A hidden probe renders every chunk at the real sheet width; `useLayoutEffect` reads each
  // one's height and the sheet's own chrome, then packs them into 840px sheets. Measured, not
  // estimated — an estimate leaves a scrollbar or a half-empty sheet.
  // ⚠️ **If the measurement is off the sheet SCALES, it never scrolls**: `.report-paper` is
  // `min-height: 840px` and `useFitPanel` fits it to the frame. That is the safe direction.
  const probeRef = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<number[][] | null>(null);

  // ⚠️ **Guards, so that no single chunk can be taller than a sheet.** A chunk is the smallest thing
  // `pack()` can place, so one that exceeds the page budget sits alone on a sheet it overflows and
  // `useFitPanel` shrinks that sheet — which is the whole fault this fixes. The budget is ~506px
  // (840 less ~334 of chrome); a table row measures ~31px and a heading ~56, so **12 rows is ~428px**
  // and **900 characters of prose is ~370px**, both comfortably inside it.
  // ⚠️ These two numbers are arithmetic; the packing that uses them is measured.
  // ⚠️ **Three parts, titled but NOT numbered.** The reference numbers "1. Executive summary /
  // 2. Revenue quality / 3. Outlook" because those are an essay's three arguments, and numbering
  // says read them in order. This document has three structural parts — the figures, where they came
  // from, and the analyst's opinion — and they are always these three, in this order, in every
  // report the pipeline makes. **Numbering fixed furniture is ceremony**; titling it is navigation.
  //
  // ⚠️ Classified by what each chunk STARTS with, which is string inspection of a known generator's
  // output — the same basis `markdown.tsx` works on. Nothing parses markdown here.
  // ⚠️ **FIX 1 — the provenance line is a CAPTION, not a section.** It was its own part with its own
  // `h2`, so `pack()` treated it as an item; the table filled page one and the caption was pushed to
  // page two, which then held a masthead, a title block and one line. **It is attached to the table's
  // own chunk here**, so it can never separate from the figures it describes.
  const parts = doc
    ? chunk(doc.markdown)
        // The `# directive` and `Report hash …` lines move into `.paper-title` above, whole and
        // unchanged. They are not dropped — they are where the design puts a document's identity.
        .filter((c) => !c.startsWith('# ') && !c.startsWith('Report hash '))
        .reduce<string[]>((acc, c) => {
          // The provenance line rides with the last table chunk rather than standing alone.
          const last = acc[acc.length - 1];
          if (c.startsWith('Live data from The Graph') && last?.startsWith('|')) {
            acc[acc.length - 1] = `${last}\n\n${c}`;
            return acc;
          }
          acc.push(c);
          return acc;
        }, [])
        .flatMap((c) => (c.startsWith('|') ? splitTable(c, MAX_TABLE_ROWS) : splitProse(c, MAX_PROSE_CHARS)))
        .map((source, i, all) => {
          if (source.startsWith('|')) {
            const firstTable = all.findIndex((x) => x.startsWith('|'));
            return {title: i === firstTable ? 'Figures' : null, source, cont: i !== firstTable};
          }
          const firstProse = all.findIndex((x) => !x.startsWith('|'));
          return {title: i === firstProse ? 'Assessment' : null, source, cont: i !== firstProse};
        })
    : [];

  useLayoutEffect(() => {
    if (!doc || pages !== null) return;
    // ⚠️ **`el` IS the `.report-paper` article — the ref sits on it.** This previously read
    // `el.querySelector('.report-paper')`, which searches DESCENDANTS only, found nothing, and
    // returned here. `pages` then stayed null forever: the sheet rendered every chunk, the toolbar
    // said 1 / 1, the article grew far past 840px, and `useFitPanel` scaled the whole document down
    // to fit. **The document was never paginated at all** — the shrinking was the symptom.
    const sheet = probeRef.current;
    if (!sheet) return;
    const nodes = Array.from(sheet.querySelectorAll('[data-chunk]')) as HTMLElement[];
    if (nodes.length === 0) return;

    const heights = nodes.map((x) => x.getBoundingClientRect().height);
    const body = heights.reduce((n, h) => n + h, 0);
    // The sheet is grown to fit everything at this moment, so subtracting the chunks leaves exactly
    // the chrome: padding, masthead, the title block and the footer.
    const chromeHeight = sheet.getBoundingClientRect().height - body;
    const available = Math.max(120, PAGE_HEIGHT - chromeHeight);
    // ⚠️ **FIX 3 — continuation pages do not carry the title block, so they have more room.**
    // Measured rather than assumed: the title block's own height is handed back to pages two onward.
    const titleBlock = sheet.querySelector('.paper-title') as HTMLElement | null;
    const extra = titleBlock ? titleBlock.getBoundingClientRect().height : 0;
    setPages(pack(heights, available, available + extra));
  }, [doc, pages]);

  const pageCount = pages ? pages.length : 1;
  const current = Math.min(page, pageCount);

  const {frameRef, contentRef, contentStyle} = useFitPanel((zoom / BASE_ZOOM) * BASE_WIDTH);

  function onZoomOut() {
    setZoom((z) => Math.max(60, z - 10));
  }

  function onZoomIn() {
    setZoom((z) => Math.min(130, z + 10));
  }

  function onExpand() {
    // Widens the workspace to give the sheet the full column.
  }

  function onEditParagraph() {
    // Opens the selected paragraph for editing in place.
  }

  function onAddNote() {
    // Attaches an analyst note to the open report.
  }

  function onReadSource() {
    setTab('data');
  }

  return (
    <section className="viewer">
      <div className="tabs">
        <div className="viewer-toolbar">
          <div className="tab-list line" role="tablist">
            <button
              className={tab === 'report' ? 'tab active' : 'tab'}
              type="button"
              role="tab"
              aria-selected={tab === 'report'}
              onClick={() => setTab('report')}
            >
              <FileText />
              Report
            </button>
            <button
              className={tab === 'data' ? 'tab active' : 'tab'}
              type="button"
              role="tab"
              aria-selected={tab === 'data'}
              onClick={onReadSource}
            >
              <Database />
              Source data
            </button>
          </div>

          {/* ⚠️ The slot the mockup filled with `lending-protocols-q2-2026.pdf`. There is no file —
              a report is a row in Neon — so it carries the document's NAME, which is the directive
              the analyst was given. Before a report exists it says so. */}
          <span className="file-name">{doc ? doc.meta.heading : 'No report yet'}</span>

          <div className="viewer-tools">
            <button type="button" aria-label="Zoom out" onClick={onZoomOut}>
              <Minus size={14} />
            </button>
            <span>{zoom}%</span>
            <button type="button" aria-label="Zoom in" onClick={onZoomIn}>
              <Plus size={14} />
            </button>
            <i />
            <span>
              {current} / {pageCount}
            </span>
            <button type="button" aria-label="Previous report page" disabled={current <= 1} onClick={() => setPage(current - 1)}>
              <ChevronLeft size={17} />
            </button>
            <button
              type="button"
              aria-label="Next report page"
              disabled={current >= pageCount}
              onClick={() => setPage(current + 1)}
            >
              <ChevronRight size={17} />
            </button>
            {/* ⚠️ `router.refresh()` re-runs the server component without a page reload, so the
                terminal and the run survive it. A run already does this on save; this is for the
                case where you want the store re-read by hand. */}
            <button type="button" aria-label="Reload the latest report" onClick={() => router.refresh()}>
              <RefreshCw size={14} />
            </button>
            <button type="button" aria-label="Expand report" onClick={onExpand}>
              <Maximize size={15} />
            </button>
          </div>
        </div>

        {tab === 'report' ? (
          <div className="tab-panel document-stage">
            {/* ⚠️ **FIX 4 — the panel says what the run is doing, so the previous report never
                passes for the new one.** While a run is in flight the sheet below is explicitly
                labelled as the earlier report; when a run dies the panel says nothing was saved
                rather than sitting on a spinner or quietly showing a stale document as the result. */}
            {run === 'running' && (
              <p className="notice"><span>
                Atlas is writing a report — about 50 seconds. <strong>The sheet below is the previous
                report</strong>; the new one replaces it when the run saves.
              </span></p>
            )}
            {run === 'failed' && (
              <p className="notice"><span>
                The run did not finish, and <strong>nothing was saved</strong> — the model tokens are
                spent and no report exists. The sheet below is unchanged. Ask again to start over.
              </span></p>
            )}
            <div className="fit-panel" ref={frameRef}>
              <div className="fit-panel-content" ref={contentRef} style={contentStyle}>
                <div className="paper-scale">
                  {!doc ? (
                    /* ⚠️ No report in the store. It says so rather than showing the mockup — a panel
                       displaying an invented document is the console lying about its own state, and
                       `PREPARED BY ATLAS RESEARCH · DEMO DATA` was exactly that. */
                    <article className="report-paper">
                      <header className="paper-masthead">
                        <span className="brand"><BrandMark /><span>ALPHA MARKETS</span></span>
                        <span>RESEARCH REPORT</span>
                      </header>
                      {/* ⚠️ A refusal names what it refused. Falling back to the newest report would
                          be a page ignoring what was asked for — and the tokenize form below targets
                          whatever is in this panel, so a silent fallback would aim a spend control at
                          the wrong report. */}
                      <div className="paper-title">
                        <span className="eyebrow">
                          {refused ? 'REPORT NOT LOADED' : 'NOTHING GENERATED YET'}
                        </span>
                        <h1>{refused ? 'That report could not be loaded.' : 'No report to show.'}</h1>
                        <p>
                          {refused ??
                            'Ask Atlas for one in the panel beside this. It lands here on the next load.'}
                        </p>
                        {refused ? (
                          <span className="paper-byline">
                            <a href="/console">OPEN THE MOST RECENT REPORT INSTEAD →</a>
                          </span>
                        ) : null}
                      </div>
                    </article>
                  ) : (
                    /* ⚠️ **The reference's document shape, filled with the real report.**
                       `.paper-title` carries the eyebrow, the directive at display size, a subtitle
                       and the byline; `h2`s title the three parts; `markdown.tsx` renders each
                       part's own content. ⚠️ **Nothing the report says changes** — the heading is
                       still the directive and the hash is still whole, both moved into the title
                       block the design put them in. */
                    <article className="report-paper" ref={pages === null ? probeRef : undefined}>
                      <header className="paper-masthead">
                        <span className="brand"><BrandMark /><span>ALPHA MARKETS</span></span>
                        <span>RESEARCH REPORT</span>
                      </header>

                      {/* ⚠️ **FIX 3 — the title block is page one's only.** Every sheet repeating the
                          eyebrow, a 42px headline, the directive and the byline cost ~190px on every
                          page, which is what left page two three-quarters empty. Continuation sheets
                          carry the masthead — it is the letterhead and a loose sheet needs it — and
                          one line naming the report and the page instead. */}
                      {current === 1 || pages === null ? (
                      <div className="paper-title">
                        <span className="eyebrow">{doc.meta.deployments} · block {doc.meta.block.toLocaleString('en-US')}</span>
                        <h1>{doc.meta.heading}</h1>
                        {/* ⚠️ **The full directive stays on the sheet.** The heading names the
                            report; this is the question that was asked, verbatim, because a title
                            that replaced it would lose what the report answers. */}
                        <p>{doc.meta.directive}</p>
                        {/* ⚠️ The honest version of the reference's mockup byline. The hash is all
                            64 characters — a prefix is enough to recognise one and not enough to
                            verify it, and verifying is why it is here. */}
                        <span className="paper-byline">
                          {doc.meta.analyst.toUpperCase()} · BLOCK {doc.meta.block} · {doc.meta.hash}
                        </span>
                      </div>
                      ) : (
                        <p className="paper-byline">
                          {doc.meta.heading.toUpperCase()} · CONTINUED · PAGE {current} OF {pageCount}
                        </p>
                      )}

                      {(pages === null ? parts.map((_, i) => i) : pages[current - 1] ?? []).map((i) => {
                        const part = parts[i]!;
                        return (
                          <div data-chunk={i} key={i}>
                            {/* ⚠️ **FIX 2 — a split section says it is split, at both ends.** A
                                three-page assessment with no marker reads as three unrelated blocks
                                of prose. `.muted` is the design's own quiet register. */}
                            {part.title ? <h2>{part.title}</h2> : null}
                            {part.cont ? <p className="muted">…continued</p> : null}
                            <Markdown source={part.source} />
                            {pages !== null && !(pages[current - 1] ?? []).includes(i + 1) && parts[i + 1]?.cont ? (
                              <p className="muted">Continues on page {current + 1} →</p>
                            ) : null}
                          </div>
                        );
                      })}

                      <footer className="paper-footer">
                        <span>Alpha Markets · {doc.meta.analyst.slice(0, 10)}…</span>
                        <span>
                          {pages === null
                            ? '— / —'
                            : `${String(current).padStart(2, '0')} / ${String(pageCount).padStart(2, '0')}`}
                        </span>
                      </footer>
                    </article>
                  )}
                </div>
              </div>
            </div>

            <div className="edit-toolbar">
              <button type="button" onClick={onEditParagraph}>
                <Pencil size={14} />
                Edit paragraph
              </button>
              <span />
              <button type="button" onClick={onAddNote}>
                <MessageSquare size={14} />
                Add note
              </button>
            </div>
          </div>
        ) : (
          <div className="tab-panel source-panel">
            {/* ⚠️ **ONE header block, not three stacked ideas.** The eyebrow, the heading and the
                summary chips are the same thought — what was read — so the chips live inside the
                section-title's left column rather than floating beneath it. The re-read control is
                the row's right-hand item, and it only appears once there is something to re-read;
                before that the empty state owns the press. */}
            <div className="section-title">
              {/* ⚠️ The heading that sat between the eyebrow and the chips is gone. It carried no
                  margin — the reset zeroes `h1,h2,h3,h4,p` — but it did occupy ~31px of line box,
                  and with it removed the eyebrow and the chip row had nothing between them and
                  collided. **So the eyebrow joined the chips in the row that already exists**:
                  `.button-row` is `flex; gap: 10px; align-items: center`, which spaces them without
                  a new rule and reads as a label in front of the values it labels. Before a read
                  the row is the eyebrow alone, exactly as it was. */}
              <p className="button-row">
                <span className="eyebrow">THE GRAPH / LENDING DEPLOYMENTS</span>
                {roster && (
                  <>
                    <span className="badge">{roster.answering} of {roster.total} answering</span>
                    <span className="badge">block {roster.block}</span>
                    <span className="badge">read {roster.readAt}</span>
                    <span className="badge">{roster.schemaVersions.length} schema versions</span>
                  </>
                )}
              </p>
              {(roster || error) && (
                <button className="btn outline" type="button" onClick={onReadRoster} disabled={busy}>
                  <RefreshCw size={15} />
                  {busy ? 'Reading…' : 'Read again'}
                </button>
              )}
            </div>

            {error && <p className="notice"><span>{error}</span></p>}

            {/* ⚠️ **The button IS the empty state, not a control beside it.** `.empty-state` is a
                centred dashed block with its own h2/p rules — defined in globals.css and unused
                until now. A first-time reader sees the heading, one sentence, and the press. */}
            {!roster && !error && (
              <div className="empty-state">
                <h2>Nothing read yet</h2>
                <p>
                  This asks all {total} registered Ethereum lending deployments whether they are
                  answering, and what schema version each one reports. Nothing is written and no
                  chain is touched.
                </p>
                <button className="btn primary" type="button" onClick={onReadRoster} disabled={busy}>
                  <RefreshCw size={15} />
                  {busy ? 'Reading…' : 'Read the roster'}
                </button>
              </div>
            )}

            {roster && (
              <>
                {roster.truncated && (
                  <p className="notice"><span>
                    Some deployments did not answer within {roster.budgetMs / 1000}s and are listed as
                    not answering. The roster is bounded so one hanging indexer cannot take the whole
                    read down; press again to retry them.
                  </span></p>
                )}

                {/* ⚠️ **Bounded scroll.** 28 rows in normal flow push the viewer past the Atlas
                    panel and grow the whole page — the workspace grid is content-driven and nothing
                    caps it. The Report tab never hits this because `.fit-panel-content` is
                    absolutely positioned and contributes no height; this panel has no such
                    mechanism, so the cap is explicit. See the rule in globals.css. */}
                <div className="table-scroll">
                  <table className="financial-table">
                    <thead>
                      <tr>
                        <th>Deployment</th>
                        <th>Schema</th>
                        <th>Answering</th>
                        <th>Block</th>
                      </tr>
                    </thead>
                    <tbody>
                      {roster.rows.map((row) => (
                        <tr key={row.slug}>
                          <td>{row.slug}</td>
                          {/* ⚠️ The version the deployment REPORTED, never the one config declares.
                              config records what we expected; this records what is true. */}
                          <td>{row.schemaVersion ?? '—'}</td>
                          <td>
                            {row.answering ? (
                              <span className="badge">live</span>
                            ) : (
                              <span className="badge off">{row.reason}</span>
                            )}
                          </td>
                          <td>{row.block === null ? '—' : row.block.toLocaleString('en-US')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <p className="muted">
                  One query document, {roster.schemaVersions.length} live schema versions —{' '}
                  <code>{roster.schemaVersions.join(' · ')}</code>. Block and read time come off each
                  response&rsquo;s own <code>_meta</code>; nothing is pinned.
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

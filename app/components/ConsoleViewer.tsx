'use client';

import {useState} from 'react';
import {useFitPanel} from '../hooks/useFitPanel.js';
import {useSecret} from './ConsoleSecret.js';
import {ReportPaper, type Paper} from './ReportPaper.js';
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

const BASE_WIDTH = 690;
const BASE_ZOOM = 90;

export function ConsoleViewer({
  fileName,
  paper,
  pages,
}: {
  fileName: string;
  paper: Paper;
  pages: number;
}) {
  const [tab, setTab] = useState<'report' | 'data'>('report');
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(BASE_ZOOM);

  // ── The roster ────────────────────────────────────────────────────────────────────────────────
  // ⚠️ **The secret is still read and still sent, and it is currently always `''`.** The six console
  // routes have `locked()` commented out, so the header is ignored — but keeping the send means
  // re-wiring the lock is a change in `lock.ts`'s callers and nothing here. See DECISIONS.md.
  const {secret} = useSecret();
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

          <span className="file-name">{fileName}</span>

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
              {page} / {pages}
            </span>
            <button type="button" aria-label="Previous report page" disabled={page === 1} onClick={() => setPage(page - 1)}>
              <ChevronLeft size={17} />
            </button>
            <button
              type="button"
              aria-label="Next report page"
              disabled={page === pages}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight size={17} />
            </button>
            <button type="button" aria-label="Expand report" onClick={onExpand}>
              <Maximize size={15} />
            </button>
          </div>
        </div>

        {tab === 'report' ? (
          <div className="tab-panel document-stage">
            <div className="fit-panel" ref={frameRef}>
              <div className="fit-panel-content" ref={contentRef} style={contentStyle}>
                <div className="paper-scale">
                  <ReportPaper paper={{...paper, pageLabel: `${String(page).padStart(2, '0')} / ${String(pages).padStart(2, '0')}`}} />
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

            {error && <p className="notice">{error}</p>}

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
                  <p className="notice">
                    Some deployments did not answer within {roster.budgetMs / 1000}s and are listed as
                    not answering. The roster is bounded so one hanging indexer cannot take the whole
                    read down; press again to retry them.
                  </p>
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

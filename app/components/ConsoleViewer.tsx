'use client';

import {useState} from 'react';
import {useFitPanel} from '../hooks/useFitPanel.js';
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
export type SourceData = {
  block: string;
  records: string;
  refreshed: string;
  meta: {label: string; value: string}[];
  headers: string[];
  rows: string[][];
  query: string;
};

const BASE_WIDTH = 690;
const BASE_ZOOM = 90;

export function ConsoleViewer({
  fileName,
  paper,
  pages,
  source,
}: {
  fileName: string;
  paper: Paper;
  pages: number;
  source: SourceData;
}) {
  const [tab, setTab] = useState<'report' | 'data'>('report');
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(BASE_ZOOM);

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

  function onRefreshSnapshot() {
    // Re-reads the source snapshot and restamps the evidence block.
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
            <div className="section-title">
              <div>
                <span className="eyebrow">THE GRAPH / SOURCE EXPLORER</span>
                <h2>Follow the evidence.</h2>
              </div>
              <button className="btn outline" type="button" onClick={onRefreshSnapshot}>
                <RefreshCw size={15} />
                Refresh snapshot
              </button>
            </div>

            <p className="muted">A common-block sample dataset behind the open report.</p>

            <div className="source-stats">
              <div>
                <span>SNAPSHOT BLOCK</span>
                <strong>{source.block}</strong>
              </div>
              <div>
                <span>RECORDS RETRIEVED</span>
                <strong>{source.records}</strong>
              </div>
              <div>
                <span>LAST REFRESH</span>
                <strong>{source.refreshed}</strong>
              </div>
            </div>

            <div className="source-meta">
              {source.meta.map((row) => (
                <p key={row.label}>
                  <span>{row.label}</span>
                  <code>{row.value}</code>
                </p>
              ))}
            </div>

            <table className="financial-table">
              <thead>
                <tr>
                  {source.headers.map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {source.rows.map((row) => (
                  <tr key={row[0]}>
                    {row.map((cell, i) => (
                      <td key={i}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>

            <pre className="query-code">{source.query}</pre>

            <p className="source-disclaimer">Sample records for this demo. A live Graph integration is not connected.</p>
          </div>
        )}
      </div>
    </section>
  );
}

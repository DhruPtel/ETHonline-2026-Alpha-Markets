import {FileText, Lock} from './Icons.js';

/**
 * The document thumbnail used by the marketplace cards, the console's Marketplace preview and the
 * market page's supporting-research rows. No client boundary of its own.
 *
 * `preview` picks which of the design's three filler charts is drawn. The design chose it by card
 * index; ⚠️ every caller passes `'bars'`, because there is no per-report preview data and none is
 * invented.
 */
export type PreviewChart = 'bars' | 'table' | 'line';

const BARS = [22, 35, 29, 47, 56, 61];
const TABLE_ROWS = [12.4, 18.4, 24.4, 30.4, 36.4];

export function MiniDocument({
  title,
  subtitle,
  preview,
  locked = true,
}: {
  title: string;
  subtitle: string;
  preview: PreviewChart;
  locked?: boolean;
}) {
  return (
    <div className="mini-document">
      <div className="mini-heading">
        <h3>{title}</h3>
        {locked ? <Lock size={16} /> : <FileText size={16} />}
      </div>
      <p>{subtitle}</p>
      <div className={locked ? 'mini-body blurred' : 'mini-body'} aria-hidden="true">
        <div className="mini-copy">
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="mini-chart">
          {preview === 'bars' ? (
            <svg viewBox="0 0 140 65">
              {BARS.map((v, i) => (
                <rect key={i} x={i * 23} y={65 - v} width="15" height={v} fill="#949ba1" />
              ))}
            </svg>
          ) : preview === 'table' ? (
            <div className="mini-table">
              {TABLE_ROWS.map((v) => (
                <div key={v}>
                  <span>Revenue</span>
                  <span>{v}</span>
                </div>
              ))}
            </div>
          ) : (
            <svg viewBox="0 0 140 65">
              <path
                d="M0 60 L15 51 29 53 45 43 59 44 72 30 86 33 104 20 119 24 140 4"
                fill="none"
                stroke="#8d979f"
                strokeWidth="3"
              />
            </svg>
          )}
        </div>
      </div>
    </div>
  );
}

import {Fragment} from 'react';

/**
 * The implied-probability chart: two lines, TRUE and FALSE, as inline SVG.
 * A server component — no charting library, nothing interactive.
 *
 * The plot is drawn in a 0-100 x 0-100 viewBox with preserveAspectRatio="none"
 * so it fills any container width, and the strokes carry non-scaling-stroke so
 * they keep their weight. Axis labels are HTML rather than SVG text, so they
 * are not stretched by that scaling. Grid stroke, tick colour and the 45px
 * y-axis gutter are the design's own values.
 */
export type Series = {
  /** Implied probability of TRUE at each sample, oldest first, 0-100. */
  trueLine: number[];
  /** Sample labels along the x-axis, same length as trueLine. */
  labels: string[];
};

const Y_TICKS = [100, 75, 50, 25, 0];

function path(values: number[]) {
  const last = values.length - 1;
  return values
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${((i / last) * 100).toFixed(2)} ${(100 - v).toFixed(2)}`)
    .join(' ');
}

export function ProbabilityChart({
  series,
  truePct,
  falsePct,
  compact = false,
}: {
  series: Series;
  truePct: number;
  falsePct: number;
  compact?: boolean;
}) {
  const falseLine = series.trueLine.map((v) => 100 - v);

  const plot = (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      width="100%"
      height="100%"
      role="img"
      aria-label={`Implied probability over time. TRUE ${truePct}%, FALSE ${falsePct}%.`}
    >
      {!compact &&
        Y_TICKS.map((t) => (
          <line key={t} x1="0" x2="100" y1={100 - t} y2={100 - t} stroke="#e7ecf0" vectorEffect="non-scaling-stroke" />
        ))}
      <path d={path(falseLine)} className="line-false" fill="none" strokeWidth={compact ? 2 : 2.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      <path d={path(series.trueLine)} className="line-true" fill="none" strokeWidth={compact ? 2 : 2.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );

  if (compact) {
    return (
      <div className="prediction-chart compact">
        <div className="chart-container">{plot}</div>
      </div>
    );
  }

  return (
    <div className="prediction-chart">
      <div className="chart-container">
        <div className="chart-grid">
          <div className="chart-axis-y">
            {Y_TICKS.map((t) => (
              <span key={t}>{t}%</span>
            ))}
          </div>
          <div className="chart-plot">{plot}</div>
          <div className="chart-axis-x">
            {series.labels.map((l, i) => (
              <Fragment key={l + i}>
                <span>{l}</span>
              </Fragment>
            ))}
          </div>
        </div>
      </div>
      <div className="chart-legend">
        <span>
          <i className="dot-true" />
          TRUE <strong>{truePct}%</strong>
        </span>
        <span>
          <i className="dot-false" />
          FALSE <strong>{falsePct}%</strong>
        </span>
      </div>
    </div>
  );
}

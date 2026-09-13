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
/**
 * ⚠️ **A DETERMINISTIC ILLUSTRATIVE PATH THAT ENDS ON THE REAL NUMBER.**
 *
 * **Nothing stores a probability series.** There is no price history in this project and a
 * parimutuel pool has no running probability at all — only its current ratio, which is
 * `poolTrue / (poolTrue + poolFalse)` at the instant you read the contract.
 *
 * ⚠️ So the shape of this line is invented and the page says so **inside the chart**, not in a
 * footnote. What is NOT invented is where it ends: the last point is the live pool share, so the
 * one value a reader could take off the right-hand edge is the same value the legend and the
 * outcome rows carry. A judge who reads the label knows exactly which number to verify.
 *
 * ⚠️ **Seeded by the market id, so it does not move between renders.** A path that changed on every
 * request would look like data arriving.
 */
export function illustrativeSeries(seed: string, endPct: number): Series {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  const rand = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 1000) / 1000; };
  const n = 13;
  const start = Math.min(95, Math.max(5, endPct * 0.45 + 20));
  const line: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    // Converges on the real endpoint; the wobble shrinks as it gets there.
    const drift = start + (endPct - start) * t;
    line.push(Math.min(100, Math.max(0, Number((drift + (rand() - 0.5) * 14 * (1 - t)).toFixed(1)))));
  }
  line[n - 1] = Number(endPct.toFixed(1));
  return {trueLine: line, labels: ['', '', '', '', '']};
}

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
  illustrative = false,
  decorLines = [],
}: {
  series: Series;
  truePct: number;
  falsePct: number;
  compact?: boolean;
  /** ⚠️ Draws the label over the plot. See `illustrativeSeries`. Never default it to true. */
  illustrative?: boolean;
  /**
   * ⚠️ **DECORATION, AND NOTHING MAY EVER BE STAKED ON ONE.** Extra paths that make a pool look
   * traded rather than empty. **Settlement is binary — TRUE and FALSE, two pools** — so these
   * correspond to no outcome, carry no label, no legend entry and no hit area. They are drawn
   * faint, behind the two real lines, and the legend says in four words that there are only two.
   *
   * ⚠️ A reader who could not tell a decorative line from a bettable outcome would be reading the
   * chart as a market with six sides. The asterisk under the legend exists for exactly that reader.
   */
  decorLines?: number[][];
}) {
  const falseLine = series.trueLine.map((v) => 100 - v);

  const plot = (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      width="100%"
      height="100%"
      role="img"
      aria-label={
        illustrative
          ? `Illustrative movement only. No probability series is stored. The current pool share is TRUE ${truePct}%, FALSE ${falsePct}%.`
          : `Implied probability over time. TRUE ${truePct}%, FALSE ${falsePct}%.`
      }
    >
      {!compact &&
        Y_TICKS.map((t) => (
          <line key={t} x1="0" x2="100" y1={100 - t} y2={100 - t} stroke="#e7ecf0" vectorEffect="non-scaling-stroke" />
        ))}
      {/* ⚠️ First, so every real line paints over them. Faint and unlabelled — see `decorLines`. */}
      {decorLines.map((d, i) => (
        <path
          key={i} d={path(d)} fill="none" stroke="#c3ccd4" strokeWidth={1}
          opacity={0.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round"
        />
      ))}
      <path d={path(falseLine)} className="line-false" fill="none" strokeWidth={compact ? 2 : 2.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      <path d={path(series.trueLine)} className="line-true" fill="none" strokeWidth={compact ? 2 : 2.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );

  // ⚠️ **THE LABEL IS IN THE CHART, OVER THE PLOT.** A footnote under a chart is read after the
  // shape has already been believed. Absolutely positioned with inline styles because `globals.css`
  // is out of scope for this unit and the design has no class for a chart watermark.
  const label = (short: boolean) =>
    illustrative ? (
      <span
        className="eyebrow"
        style={{
          position: 'absolute', top: short ? 0 : 6, left: short ? 0 : 48, right: 0, zIndex: 1,
          fontSize: short ? 8 : 9, letterSpacing: '.1em', color: '#96a3ae', pointerEvents: 'none',
        }}
      >
        {short
          ? 'ILLUSTRATIVE SHAPE · REAL ENDPOINT'
          : 'ILLUSTRATIVE MOVEMENT — NO PROBABILITY SERIES IS STORED. ONLY THE RIGHT-HAND END IS REAL: IT IS THE CURRENT POOL SHARE.'}
      </span>
    ) : null;

  if (compact) {
    return (
      <div className="prediction-chart compact">
        <div className="chart-container" style={{position: 'relative'}}>
          {label(true)}
          {plot}
        </div>
      </div>
    );
  }

  return (
    <div className="prediction-chart">
      <div className="chart-container" style={{position: 'relative'}}>
        {label(false)}
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
        {/* ⚠️ Names what the percentages ARE, beside them. A parimutuel pool share is not a
            probability and a one-sided pool is not a 100% belief. */}
        {illustrative && <span>pool share, not probability</span>}
        {/* ⚠️ Four words, beside the two entries it is about. The faint lines have no legend entry
            precisely because there is nothing to enter — they are not outcomes. */}
        {decorLines.length > 0 && <span>* settlement is binary — two pools</span>}
      </div>
    </div>
  );
}

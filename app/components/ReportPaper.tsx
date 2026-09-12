import {BrandMark} from './Icons.js';

/**
 * The report sheet — the .report-paper document from the console design.
 * A server component, shared by /console and the bought state of /report/[hash].
 *
 * The body is a list of blocks so the caller's demo const carries the document
 * itself rather than the markup carrying it.
 */
export type PaperBlock =
  | {kind: 'heading'; text: string}
  | {kind: 'subheading'; text: string}
  | {kind: 'paragraph'; text: string}
  | {kind: 'table'; headers: string[]; rows: string[][]};

export type Paper = {
  eyebrow: string;
  title: string;
  standfirst: string;
  byline: string;
  blocks: PaperBlock[];
  notes?: string[];
  footerNote: string;
  pageLabel: string;
};

export function ReportPaper({paper}: {paper: Paper}) {
  return (
    <article className="report-paper">
      <header className="paper-masthead">
        <span className="brand">
          <BrandMark />
          <span>ALPHA MARKETS</span>
        </span>
        <span>RESEARCH REPORT</span>
      </header>

      <div className="paper-title">
        <span className="eyebrow">{paper.eyebrow}</span>
        <h1>{paper.title}</h1>
        <p>{paper.standfirst}</p>
        <span className="paper-byline">{paper.byline}</span>
      </div>

      {paper.blocks.map((block, i) => {
        if (block.kind === 'heading') return <h2 key={i}>{block.text}</h2>;
        if (block.kind === 'subheading') return <h3 key={i}>{block.text}</h3>;
        if (block.kind === 'paragraph') return <p key={i}>{block.text}</p>;
        return (
          <table className="financial-table" key={i}>
            <thead>
              <tr>
                {block.headers.map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row) => (
                <tr key={row[0]}>
                  {row.map((cell, c) => (
                    <td key={c}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        );
      })}

      {!!paper.notes?.length && (
        <aside className="paper-notes">
          <h3>Analyst notes</h3>
          {paper.notes.map((note, i) => (
            <p key={i}>
              {i + 1}. {note}
            </p>
          ))}
        </aside>
      )}

      <footer className="paper-footer">
        <span>{paper.footerNote}</span>
        <span>{paper.pageLabel}</span>
      </footer>
    </article>
  );
}

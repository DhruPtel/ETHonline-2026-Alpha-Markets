// Markdown → React elements. **The HTML boundary, and therefore the escaping boundary.**
//
// ⚠️ **No `dangerouslySetInnerHTML`, and that is the entire escaping story.** Every string below
// reaches the DOM as a React *child*, and React escapes children — `<`, `>`, `&`, `"` become entities
// before they are text nodes. The usual way this bites is a markdown library handing back an HTML
// string that then needs `dangerouslySetInnerHTML` to mount, which turns the library into the
// sanitiser and quietly makes escaping its problem rather than ours. Producing elements instead of a
// string means there is no HTML string in the pipeline at all, so there is nothing to sanitise.
//
// ⚠️ **Escaping cannot happen upstream.** `Market.name` and `Token.symbol` are indexer-supplied
// (§5.18) and travel inside reports; `store/reports.ts` says at its head why it must not touch them.
// Escaping on write changes the stored bytes, the stored bytes are what the hash is over, and the
// hash is what an ATS token commits. So it happens here, at the last possible moment, and nowhere
// earlier.
//
// ⚠️ **Not a markdown parser, and should not become one.** It reads the output of ONE known
// generator — `narrate.ts`'s `render()` — which emits exactly four things: one `#` heading, one GFM
// pipe table, plain paragraphs, and `**bold**` inside cells. A general parser would be a dependency
// bought to handle constructs this input cannot contain. If `render()` ever emits a fifth construct,
// this file is where that shows up, as literal text rather than as a security question.

import type { ReactNode } from 'react';

/**
 * ⚠️ **Escaping is not enough on its own — length is the other half.** React makes an indexer's
 * `name` inert; it does nothing about one that is 40,000 characters long, which is a table cell that
 * destroys the page as effectively as any injection. `narrate.ts` bounds the whole table at 40,000
 * characters, so the unbounded thing is any single cell within it. Bounded per cell, where the
 * untrusted value actually is.
 */
const CELL_MAX = 140;
const bound = (s: string) => (s.length > CELL_MAX ? `${s.slice(0, CELL_MAX)}…` : s);

/** `| a | b |` → `['a', 'b']`, each bounded. */
const cells = (line: string) =>
  line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => bound(c.trim()));

/** The delimiter row that makes a run of pipe lines a table rather than prose containing pipes. */
const isDelimiter = (line: string) => /^\|[\s:|-]+\|$/.test(line) && line.includes('-');

/**
 * `**bold**` → `<strong>`. The only inline construct `render()` produces — the narrator uses it for
 * the protocol-total row. `split` with a capturing group puts the captured halves at odd indices.
 */
const inline = (text: string): ReactNode[] =>
  text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : part));

export function Markdown({ source }: { source: string }) {
  const lines = source.split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) { i++; continue; }

    if (line.startsWith('# ')) {
      blocks.push(<h1 key={i}>{inline(line.slice(2).trim())}</h1>);
      i++;
      continue;
    }

    // A table is a pipe line whose successor is a delimiter. Checking the successor is what keeps a
    // paragraph that happens to start with `|` from being read as a one-column table.
    const next = lines[i + 1];
    if (line.startsWith('|') && next && isDelimiter(next)) {
      const head = cells(line);
      const start = i;
      i += 2;
      const body: string[][] = [];
      while (i < lines.length && lines[i]!.startsWith('|')) { body.push(cells(lines[i]!)); i++; }
      blocks.push(
        // ⚠️ The scroll container is the phone. A 4-column financial table does not fit 380px and
        // must not be what makes the whole document scroll sideways.
        <div className="table-wrap" key={start}>
          <table>
            <thead><tr>{head.map((c, n) => <th key={n}>{inline(c)}</th>)}</tr></thead>
            <tbody>
              {body.map((row, r) => (
                <tr key={r}>{row.map((c, n) => <td key={n}>{inline(c)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    // Anything else is a paragraph: consecutive lines up to the next blank, table or heading.
    const start = i;
    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !lines[i]!.startsWith('|') && !lines[i]!.startsWith('# ')) {
      para.push(lines[i]!.trim());
      i++;
    }
    blocks.push(<p key={start}>{inline(para.join(' '))}</p>);
  }

  return <>{blocks}</>;
}

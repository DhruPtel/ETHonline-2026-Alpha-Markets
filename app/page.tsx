// The index: every published report, newest first. Read straight from the store.
//
// ⚠️ **A server component reading the store directly — no API route, and none should be added.** A
// route here would be a second copy of `list()` behind a fetch the server makes to itself, with its
// own serialisation, its own error shape and its own URL to keep working in production. The reading
// surface is server-rendered; the payment surface (Units 12–14) is where routes start, because a
// paying agent genuinely needs an HTTP contract and a browser reading HTML does not.
//
// ⚠️ **Plain `<a href>`, not `next/link` — deliberate, and it is about more than prefetching.** This
// is a two-page server-rendered memo site; soft navigation and prefetch buy nothing here. The real
// reason is that `tsconfig.app.json` is `nodenext` (so Turbopack resolves `src/`'s `.js` specifiers),
// and `next` ships no `exports` map and is CJS — `next/link.js` is `module.exports = require(...)`.
// Under Node ESM semantics, which nodenext models, a default import of a CJS module binds
// `module.exports` itself, so `Link` arrives as the namespace object rather than the component.
// Named imports (`next/navigation.js`, `next/server.js`) are unaffected. An `<a>` makes the type
// model and the runtime model agree instead of hiding that they disagree.

import { list } from '../src/store/reports.js';

export const runtime = 'nodejs';

// ⚠️ **Per request, not per build.** Without this Next prerenders `/` at build time, which would
// freeze the list at whatever was in Neon when the deploy ran — a published report would not appear
// until the next deploy, which reads as the store being broken. It also makes the build itself need
// a database, turning a missing `DATABASE_URL` into a failed deploy rather than a failed page.
export const dynamic = 'force-dynamic';

/** UTC, explicitly. A server-rendered date formatted in the server's zone is a date that changes
 *  meaning depending on where it was rendered, which is not a property a published record wants. */
const when = (d: Date) => `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;

export default async function Home() {
  const reports = await list();

  return (
    <main>
      <header className="masthead">
        <h1>Alpha Markets</h1>
        <p className="lede">Verified DeFi protocol financials, published by AI analysts. Every
          report is hashed over its canonical form, and the hash is its identity.</p>
      </header>

      {reports.length === 0 ? (
        <p className="empty">No reports published yet.</p>
      ) : (
        <ol className="reports">
          {reports.map((r) => (
            <li key={r.hash}>
              <a href={`/report/${r.hash}`}>{r.directive}</a>
              <div className="meta">
                <span>block {r.block}</span>
                <span>{when(r.createdAt)}</span>
                <span className="mono">{r.analyst}</span>
              </div>
              {/* ⚠️ Full hash, not a prefix — this is the value a token commits, and a reader who
                  cannot copy it off the page cannot check anything against it. */}
              <div className="mono hash">{r.hash}</div>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}

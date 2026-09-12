// The site header and footer — the thing that makes these pages one product.
//
// ⚠️ **There was no nav at all.** `layout.tsx` rendered `{children}`, every page hand-rolled a
// `.back` link, and the complete set of internal links was `/`, `/holdings`, `/report/<hash>`,
// `/markets/<id>` and one `/markets` — so **`/markets` was unreachable from the homepage** and
// `/holdings` was reachable only through the Ledgers panel of a report that happened to be
// tokenized. Two finished surfaces were effectively hidden.
//
// ⚠️ **A SERVER component: no `'use client'`, no state, no effects.** It is links. That also keeps
// it out of every client bundle.
//
// ⚠️ **Plain `<a href>`, never `next/link`.** `app/page.tsx`'s header carries the full reason —
// `next` ships no `exports` map and is CJS, so under `tsconfig.app.json`'s `nodenext` a default
// import of `next/link.js` binds `module.exports` rather than the component. Named imports from
// `next/navigation.js` and `next/server.js` are unaffected.
//
// ⚠️ **This file and `layout.tsx` import NOTHING from `src/`.** The root layout is inherited by every
// route, so a store import here would be paid for by all of them — `/` traces 1.70 MB and the Hedera
// SDK routes 7.5–10 MB, and the difference is exactly this kind of import. If the nav ever wants a
// count badge, the count arrives as a prop from the page, not from a read in here.
//
// ⚠️ **"Connect wallet" is the reference's header action and it is MARKED, not built.** There is no
// session identity in this project — `payments/auth.ts` is the declared cut point — and the only
// wallet connection that exists is momentary, inside the stake flow, on one page. A header button
// implying a connected identity would be the most misleading thing on the site.
//
// ⚠️ **The reference's "Demo" toggle is CUT, not marked.** It belongs to a mockup whose data was
// invented. Everything here is real, so a control that offers to make it fake asserts the opposite
// of the product's whole claim.

import { Unbuilt } from './unbuilt.js';

/** The four destinations. ⚠️ Holdings is a departure from the reference's three and it is owned:
 *  it is finished product, and it answers *who holds the security*, which is the one question a
 *  tokenization story has to answer and which currently hides two clicks deep. */
/** ⚠️ **Three items, which is what the reference has.** A fourth — Holdings — was added here in an
 *  earlier unit and is not in the design. It is still reachable: `/holdings` is linked from the
 *  ledgers panel on a tokenized report and from the console's workspace footer. ⚠️ **Restoring it to
 *  the nav is a design change and belongs to whoever owns the design, not to this file.** */
const NAV = [
  { href: '/console', label: 'Console' },
  { href: '/', label: 'Reports' },
  { href: '/markets', label: 'Markets' },
] as const;

/** ⚠️ **The reference's own mark**, taken from `console.html`: an "A" built from one path plus a
 *  dot, on a 0 0 100 100 viewBox at 25×29. The house-shape drawn here before was invented. */
function Brand() {
  return (
    <span className="brand">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <path d="M5 92 46 6 56 27 24 92ZM60 34 94 92 76 92 52 50Z" fill="currentColor" />
        <circle cx="50" cy="74" r="7" fill="currentColor" />
      </svg>
      <span>ALPHA MARKETS</span>
    </span>
  );
}

/**
 * @param current the pathname of the page rendering this, so the nav can mark itself. Passed as a
 *   prop rather than read from `usePathname()`, which would make the whole header a client
 *   component and ship it to every visitor to render four links.
 */
export function SiteHeader({ current }: { current?: string }) {
  return (
    <header className="site-header">
      {/* ⚠️ The reference wraps the brand in an anchor with an aria-label. Same shape. */}
      <a href="/" className="brand-link" aria-label="Alpha Markets"><Brand /></a>

      <nav aria-label="Main navigation">
        {NAV.map((n) => (
          <a key={n.href} href={n.href}
             className={current === n.href ? 'active' : undefined}
             aria-current={current === n.href ? 'page' : undefined}>
            {n.label}
          </a>
        ))}
      </nav>

      <div className="header-actions">
        {/* ⚠️ Marked, not a button. See the header. */}
        <Unbuilt label="Connecting a wallet to this site">
          <span className="btn primary wallet-button">
            <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none"
                 stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h15a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5" />
              <path d="M18 12h.01" />
            </svg>
            Connect wallet
          </span>
        </Unbuilt>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <span><Brand /><span className="footer-tag">/ Research with conviction.</span></span>
      {/* ⚠️ The reference says "Demo data · Stored on this device". None of that is true here and
          saying it would undersell the one thing this build actually has. */}
      <span className="footer-net">
        Hedera testnet · Arc testnet · <a href="/api/health">health</a>
      </span>
    </footer>
  );
}

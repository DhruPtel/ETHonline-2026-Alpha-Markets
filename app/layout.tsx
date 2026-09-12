import type {Metadata} from 'next';
import './globals.css';
import {SiteNav} from './components/SiteNav.js';
import {BrandMark, Wallet} from './components/Icons.js';

// ⚠️ **No `icons` entry.** The reference pointed `metadata.icons` at `/favicon.svg` and this repo
// has no `public/` directory. Adding one for a single file is more surface than the favicon is
// worth, so the key is dropped rather than satisfied — a missing favicon costs a default icon in a
// tab; an unbacked `icons` entry costs a 404 on every page load.
export const metadata: Metadata = {
  title: 'Alpha Markets — Research with conviction.',
  description:
    'An agent research console, a tokenized report marketplace and two-sided prediction markets.',
};

/**
 * The shell: skip link, header, nav, footer. Held here once and not repeated
 * by any page.
 *
 * ⚠️ **A server component. Only `<SiteNav/>` crosses into the client**, and the reason is worth
 * naming rather than assuming: the design marks the current nav item, a layout cannot know the
 * pathname without `usePathname()`, and `usePathname()` is a client hook. Making the whole header
 * a client component to highlight one link would ship the brand mark, the wallet button and every
 * icon in them to every visitor. Isolating it in `SiteNav` ships **three links and a pathname
 * read** instead, and leaves the rest of the header — and the whole footer — on the server.
 *
 * ⚠️ **The wallet button stays and is MARKED `.inert`; the Demo toggle beside it is CUT.** The
 * distinction is the project's own: mark what a reviewer would think we forgot, cut what the system
 * forbids. A wallet connection is a coherent capability this build has not made — so it is shown,
 * inert, and labelled. A "Demo" switch is not an unbuilt feature: everything on this site is a real
 * receipt against a live network, and a control offering to make it fake asserts the opposite of
 * the product's whole claim. ⚠️ Its two `.demo-toggle` rules in `globals.css` are now orphan and
 * are deliberately left there — commit 2 established that a rule with no consumer today is not
 * evidence of a rule with no consumer.
 *
 * ⚠️ **Plain `<a href>`, never `next/link`** — `app/components/SiteNav.tsx` carries the full reason.
 */
export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#content">Skip to content</a>

        <header className="site-header">
          <a href="/console" aria-label="Alpha Markets console">
            <span className="brand">
              <BrandMark />
              <span>ALPHA MARKETS</span>
            </span>
          </a>

          <SiteNav />

          <div className="header-actions">
            <button className="btn primary wallet-button inert" type="button" aria-disabled="true">
              <Wallet size={15} /> Connect wallet
            </button>
          </div>
        </header>

        <div id="content">{children}</div>

        <footer className="site-footer">
          <span>
            ALPHA MARKETS <span className="footer-tag">/ Research with conviction.</span>
          </span>
          {/* ⚠️ The reference's second span said "Demo data · Stored on this device". **Not one
              clause of that is true here** — the reports are real, they are stored in Neon, the
              tokens are on Hedera and the stakes are on Arc — and saying it would undersell the
              only thing this build actually has. ⚠️ The span is REPLACED rather than removed:
              `.site-footer` is `justify-content: space-between` and expects two children, so
              deleting it would collapse the footer to one flush-left column. This is the line
              `trash/app/ui/chrome.tsx` already settled on, and `/api/health` is a live route. */}
          <span>
            Hedera testnet · Arc testnet · <a href="/api/health">health</a>
          </span>
        </footer>
      </body>
    </html>
  );
}

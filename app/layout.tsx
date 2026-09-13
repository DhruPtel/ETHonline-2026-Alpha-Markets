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
 * icon in them to every visitor. Isolating it in `SiteNav` ships **four links and a pathname
 * read** instead, and leaves the rest of the header — and the whole footer — on the server.
 *
 * ⚠️ **The header's wallet button says the analyst's wallets are preloaded, and it is NOT a connect
 * button.** It was a greyed-out "Connect wallet", which read as broken. Two things are true and the
 * note keeps them apart:
 *
 *   · **The analyst connects nothing.** It is an agent and signs server-side from its own keys —
 *     `HEDERA_SELLER_KEY` for tokenization and x402, a Circle developer-controlled wallet on Arc. A
 *     visitor pressing a button to connect a wallet would not be an agent acting on its own.
 *   · **Staking does connect a wallet**, on the market page (`markets/[id]/PositionControl.tsx`),
 *     where a person signs from MetaMask with their own USDC. So the note must not say that nothing
 *     connects anywhere.
 *
 * The note also says why they are preloaded: so the demo works whatever a visitor has set up.
 * Multi-tenant, a connected wallet becoming its own analyst, is not mentioned here; the root README
 * lists it under "What is not built".
 *
 * ⚠️ **A native popover (`popover` + `popoverTarget`), so this stays a server component.** No client
 * JS ships for it: the browser opens it, and closes it on Escape, an outside click or the Close
 * button. It sits in the top layer, so `.site-header`'s `backdrop-filter` does not trap its fixed
 * position. Every nav link is a full page load, so it never survives a navigation open.
 *
 * ⚠️ **The Demo toggle the reference drew beside it is CUT.** Everything on this site is a real
 * receipt against a live network, and a control offering to make it fake asserts the opposite of
 * the product's whole claim. Its two `.demo-toggle` rules in `globals.css` are orphan and are
 * deliberately left there.
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
            <button className="btn primary wallet-button" type="button" popoverTarget="wallet-note">
              <Wallet size={15} /> Wallets preloaded
            </button>
            <div id="wallet-note" className="wallet-note" popover="auto" aria-labelledby="wallet-note-title">
              <p>
                <strong id="wallet-note-title">Preloaded wallets.</strong>
                The analyst signs server-side from its own keys — Hedera testnet for tokenization and
                x402 payments, a Circle developer-controlled wallet for Arc. Preloaded so the demo
                works whatever a judge has set up.
              </p>
              <p>
                Staking on a market uses your own wallet, connected on that market&apos;s page. That is
                where the on-chain position is yours.
              </p>
              <button className="text-link" type="button" popoverTarget="wallet-note" popoverTargetAction="hide">
                Close
              </button>
            </div>
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

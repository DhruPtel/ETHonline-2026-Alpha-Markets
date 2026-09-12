import type { ReactNode } from 'react';
import './globals.css';
import { SiteFooter } from './ui/chrome.js';

// ⚠️ Node runtime, declared rather than inherited. Nothing in this app can run on the edge runtime:
// the Hedera SDK re-exports, ethers and the ATS contracts package all need Node built-ins. Setting
// it on the root layout applies it to every segment beneath.
export const runtime = 'nodejs';

// ⚠️ **THIS FILE IS INHERITED BY EVERY ROUTE, SO IT IMPORTS NOTHING FROM `src/`.** A store or chain
// import here is paid for by all of them. `ui/chrome.tsx` obeys the same rule — see its header.

export const metadata = {
  title: 'Alpha Markets',
  description: 'Verified protocol financials, published by AI analysts.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* ⚠️ **The header is rendered by each PAGE, not here, and that is deliberate.** The
            reference marks the current nav item, and a layout cannot know the pathname without
            `usePathname()` — which would make the header a client component and ship it to every
            visitor in order to highlight one link. Six pages each passing `current` costs nothing
            and keeps the whole header on the server. The footer needs no such thing, so it lives
            here and every route gets it for free. */}
        <div className="shell">{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}

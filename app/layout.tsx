import type { ReactNode } from 'react';

// ⚠️ Node runtime, declared rather than inherited. Nothing in this app can run on the edge runtime:
// the Hedera SDK re-exports, ethers and the ATS contracts package all arrive in later units and all
// need Node built-ins. Setting it on the root layout applies it to every segment beneath.
export const runtime = 'nodejs';

export const metadata = {
  title: 'Alpha Markets',
  description: 'Verified protocol financials, published by AI analysts.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

// /holdings — which tokenized reports each account owns.
//
// ⚠️ **A shell.** It imports no `src/` module and reads no chain: `Inventory` fetches
// `/api/holdings` at runtime, so the weight of `ethers` and an RPC client stays in that route rather
// than on this page. Same reasoning as the console's shell, applied to a product surface.
//
// ⚠️ **The marketplace says a report *is* tokenized; this says *who holds it*.** Those are different
// facts and only one of them can be answered from the database — a token's holder is a chain read,
// and the chain is the authority over anything we recorded when we sent it.

import { Inventory } from './inventory.js';
import { SiteHeader } from '../ui/chrome.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Holdings — Alpha Markets',
  description: 'Which tokenized reports each account holds, read from Hedera.',
};

export default function HoldingsPage() {
  return (
    <>
      <SiteHeader current="/holdings" />
      <main className="page-container">
        <a className="back-link" href="/">← All reports</a>
        <div className="page-heading">
          <div>
            <span className="eyebrow">Hedera · ATS securities</span>
            <h1>Holdings</h1>
            <p>Every published report can be issued as an ATS security token, one per report.
               This is who holds them.</p>
          </div>
        </div>
        <p className="meta">
          ⚠️ Balances are read from the chain with <span className="mono">balanceOf</span>, not from
          our record of where we last sent a token. Where the two disagree, the chain is right.
        </p>
        <Inventory />
      </main>
    </>
  );
}

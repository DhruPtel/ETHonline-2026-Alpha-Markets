// /console — the test surface. Every operation this build can perform, with a button on it.
//
// ⚠️ **THROWAWAY, and it says so on itself.** This is scaffolding for the play gaps: it exposes
// operations that spend real HBAR, it has no authentication, and the real UI gets designed once
// Phase 4's market exists. `rm -r app/console app/api/console` is the whole removal.
//
// ⚠️ **A shell, and deliberately nothing more.** It imports no `src/` module — every figure on the
// page arrives from `/api/console/state` at runtime. That is not only tidiness: `app/page.tsx`
// imports the store and traces ~1.8 MB, and a control panel that also pulled in the Anthropic SDK,
// ethers and the ATS contracts package to render its own chrome would be carrying the whole build
// to draw four buttons. The weight belongs in the routes, where each one is traced on its own.
//
// ⚠️ **Nothing here is `NEXT_PUBLIC_`.** `HEDERA_SELLER_KEY`, `CIRCLE_ENTITY_SECRET` and
// `ARC_DEPLOYER_KEY` are in the same `.env` these routes read, and that prefix inlines a value into
// the client bundle. Every operation runs server-side; the browser sends a hash and gets JSON back.

import { Panel } from './panel.js';
import './console.css';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Console — Alpha Markets',
  description: 'Internal test surface. Not product.',
};

export default function ConsolePage() {
  return (
    <main className="console">
      <p className="throwaway">
        <strong>Throwaway test surface.</strong> Not product, not gated, deleted before submission.
        The controls below spend real testnet HBAR and mint permanent assets. Anyone who can reach
        this URL can spend from the analyst account.
      </p>

      <header className="masthead">
        <h1>Console</h1>
        <p className="lede">
          Every operation this build can perform, and what it returned. The controls call the same
          functions <span className="mono">scripts/ops/*.ts</span> call — a control that did something
          different would be testing itself rather than the build.
        </p>
        <p className="lede">
          <a href="/">Marketplace</a> · <a href="/api/health">/api/health</a>
        </p>
      </header>

      <Panel />
    </main>
  );
}

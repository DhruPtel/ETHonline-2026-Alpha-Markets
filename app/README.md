# app — the website and its HTTP surface

A Next.js 16 App Router app, deployed at <https://et-honline-2026-alpha-markets.vercel.app>. Pages
read the store and the chains on the server. API routes exist only where something needs an HTTP
contract: a paying agent, a browser wallet's transaction, or a cron.

## Pages

| route | file | what it shows |
|---|---|---|
| `/` | `page.tsx` | The report marketplace: published reports, their token state, and grades on claims they backed |
| `/report/[hash]` | `report/[hash]/page.tsx` | One report's public preview: directive, analyst, block, hash, coverage counts, The Graph deployment it read, and the token. The buy control is `components/BuyControl.tsx`. |
| `/console` | `console/page.tsx` | The analyst's workspace. **Ask Atlas** generates a report, **Source data** runs one live Graph query, then **Tokenize** and **Publish**. |
| `/markets` | `markets/page.tsx` | Open forecasts and the newest demo market, with pools read from the contract. The **Start a demo market** button is `markets/SeedButton.tsx`. |
| `/markets/[id]` | `markets/[id]/page.tsx`, `markets/[id]/PositionControl.tsx` | One market: the question, pools, supporting research, the commit, stake or reveal control, and Arc evidence |
| `/analyst` | `analyst/page.tsx`, `analyst/ContextBlock.tsx` | The analyst's graded record, the tokens it holds, and the planning context block verbatim |
| `/holdings` | `holdings/page.tsx` | Redirects to `/analyst` |

## API routes

**Product**

| route | what it does | spends | guard |
|---|---|---|---|
| `GET /api/reports/[hash]` | The paid read (`src/payments/gate.ts`) | the buyer's 0.001 HBAR | x402 |
| `POST /api/buy` | Runs the buyer agent against the gate; called by "Buy this read" | our buyer account's HBAR | none; capped per payment and per day |
| `POST /api/markets/[id]/commit` | The analyst commits a chosen report to a market. The first press returns a plan; the second spends. | the analyst's USDC | none |
| `POST /api/markets/[id]/refresh` | Records a browser wallet's stake or commit from its transaction receipt | — | reads the chain, not the request body |
| `GET /api/holdings` | Which account holds which report token, read from the chain. Nothing in the app calls it: `/holdings` redirects to `/analyst`, which reads the balances itself. | — | — |
| `GET /api/health` | Does the facilitator still advertise our network and fee payer? Is the ATS resolver alive? Are seven env vars absent, empty or set — including `ANTHROPIC_API_KEY`, `GRAPH_API_KEY` and `ETHEREUM_RPC_URL`, which generation needs? | — | — |
| `GET /api/cron/commit` | Daily at 22:00 UTC (`vercel.json`) | the analyst's USDC | `CRON_SECRET` |
| `GET /api/cron/resolve` | Daily at 02:00 UTC | the analyst's gas | `CRON_SECRET` |

Server actions: `markets/actions.ts` handles **Start a demo market** and **Reveal answer**, both paid
from the analyst's USDC and capped at six open demo markets. `console/page.tsx` handles **Publish**,
which needs a minted token.

**Operator console**

| route | what it does | spends |
|---|---|---|
| `POST /api/console/generate` | The report pipeline, streamed a stage at a time | model tokens |
| `POST /api/console/source` | One live Graph query and its evidence record | a Graph query |
| `POST /api/console/tokenize` | ATS issuance for a stored report | about 7.7 HBAR |
| `POST /api/console/transfer` | Moves a report token. No page calls it; it answers anyone who posts to it. | about 0.43 HBAR |
| `POST /api/console/report` | Returns a report's body from the store, without payment. No page calls it; it answers anyone who posts to it. | — |
| `GET /api/console/state`, `GET /api/console/accounts` | Store and account state for the console. No page calls either. | — |

**Throwaway:** `/api/probe`, the deployment probe from Phase 3. It is still deployed.

⚠️ **The console doorlock has been unwired since 2026-09-12.** `api/console/lock.ts` exists, but no
route calls it (see `tracking/DECISIONS.md`, "TEMPORARY — the console doorlock is unwired"). Every
console route is open to anyone. That includes `/api/console/report`, which returns the body the
x402 gate sells. `CONSOLE_SECRET` is read by nothing while the lock is unwired.

## The paywall line

`report/[hash]/page.tsx` never calls `render()`. The figures, the market table and the assessment
are **not sent** to the browser; they are not merely hidden. They leave the server only through
`/api/reports/[hash]` after a payment settles, or through the unlocked console route above.

## Supporting files

| path | what it is |
|---|---|
| `components/` | UI pieces. Four call routes: `BuyControl` (`/api/buy`), `TokenizeForm` (`/api/console/tokenize`), and the two console panels, `AtlasPanel` (`/api/console/generate`) and `ConsoleViewer` (`/api/console/source`). `GradeMarker`, `ProbabilityChart`, `MiniDocument`, `SiteNav`, `Icons` and the two filter bars are display components. `ReportPaper` is imported by nothing. |
| `markdown.tsx` | Markdown to React elements. **This is the escaping boundary.** Indexer-supplied names travel inside hashed reports and cannot be escaped on write, so there is no `dangerouslySetInnerHTML` anywhere. |
| `markets/demo.ts` | The demo presets, the six-market cap, and the 150-second staking window |
| `hooks/useFitPanel.ts` | Scales a working surface to fit its column |
| `globals.css`, `layout.tsx` | One stylesheet and the root layout |

⚠️ **Never import `src/arc/abi.ts` into a client component.** It carries the contract's full
bytecode. Routes that decode events use a minimal inline ABI instead.

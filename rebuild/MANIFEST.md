# MANIFEST — Alpha Markets frontend

What to copy into the main repo, and the build settings it assumes.

Everything below lives under `rebuild/` in this workspace. `rebuild/` is a
container, not a path: its contents go at the **repo root**, so `rebuild/app/`
becomes `app/`, `rebuild/components/` becomes `components/`, and
`rebuild/hooks/` becomes `hooks/`.

(The output is in `rebuild/` rather than `out/` because the project's
`.gitignore` already ignores `/out/` — Next's static-export directory.)

---

## 1. Files to copy

### app/ — 8 files

| From | To | Notes |
|---|---|---|
| `rebuild/app/globals.css` | `app/globals.css` | The one stylesheet. **Replaces** the existing 51KB Tailwind one. |
| `rebuild/app/layout.tsx` | `app/layout.tsx` | Header, nav, footer. **Replaces** the existing one. |
| `rebuild/app/page.tsx` | `app/page.tsx` | `/` — report marketplace. **Replaces** the existing one (which renders the console). |
| `rebuild/app/report/[hash]/page.tsx` | `app/report/[hash]/page.tsx` | New. |
| `rebuild/app/markets/page.tsx` | `app/markets/page.tsx` | **Replaces** the existing one. |
| `rebuild/app/markets/[id]/page.tsx` | `app/markets/[id]/page.tsx` | **Replaces** the existing one. |
| `rebuild/app/console/page.tsx` | `app/console/page.tsx` | New. |
| `rebuild/app/holdings/page.tsx` | `app/holdings/page.tsx` | New. |

### components/ — 12 files

All go directly in `components/`, none in a subdirectory.

| File | Kind |
|---|---|
| `AtlasPanel.tsx` | client |
| `BuyControl.tsx` | client |
| `ConsoleViewer.tsx` | client |
| `MarketFilters.tsx` | client |
| `MarketplaceFilters.tsx` | client |
| `SiteNav.tsx` | client |
| `StakeControl.tsx` | client |
| `TokenizeForm.tsx` | client |
| `Icons.tsx` | server |
| `MiniDocument.tsx` | server |
| `ProbabilityChart.tsx` | server |
| `ReportPaper.tsx` | server |

### hooks/ — 1 file

| File | Kind |
|---|---|
| `useFitPanel.ts` | client |

### Not produced

No `app/api/`. No config files. No `lib/`, `db/`, `public/` or `vendor/`
changes.

---

## 2. What this replaces, and what it leaves behind

Copying `app/` and `components/` over the existing tree makes these unused:

- `components/alpha/*.tsx` — 8 files (`console`, `markets`, `reports`,
  `document`, `tokenization`, `common`, `store`, `fit-panel`). Nothing in the
  new output imports them.
- `components/ui/*` — 61 vendored shadcn files. Nothing imports them.
- `hooks/use-mobile.ts` — nothing imports it.
- `app/reports/page.tsx` — the marketplace moved to `/`. **Delete this file**,
  or `/reports` will keep serving the old page.

Delete them or leave them; they are inert either way, except `app/reports/`,
which is a live route.

`app/chatgpt-auth.ts` is untouched and unrelated.

---

## 3. Build settings the main repo needs

### 3.1 Required — the `@/*` path alias

Every import uses `@/components/...` and `@/hooks/...`. The main repo's
`tsconfig.json` must map `@/*` to the repo root:

```json
"paths": { "@/*": ["./*"] }
```

This workspace's `tsconfig.json` already has it. Nothing to change if the main
repo matches.

### 3.2 Required — drop Tailwind from the CSS pipeline, or leave it inert

`app/globals.css` has no `@import "tailwindcss"`, no `@tailwind` directives and
no utility classes. It is plain CSS.

If the main repo keeps `@tailwindcss/postcss` in `postcss.config.mjs`, the
stylesheet still passes through correctly — the plugin finds no directives and
emits the CSS unchanged. That was verified here. So this is optional cleanup,
not a blocker:

- `postcss.config.mjs` — the `@tailwindcss/postcss` plugin can be removed.
- `package.json` — `tailwindcss`, `@tailwindcss/postcss` and `tw-animate-css`
  become unused, as do `lucide-react`, `recharts`, `radix-ui`, `@base-ui/react`,
  `sonner`, `class-variance-authority`, `clsx`, `tailwind-merge`, `cmdk`,
  `vaul`, `embla-carousel-react`, `input-otp`, `react-day-picker`,
  `react-hook-form`, `@hookform/resolvers`, `react-resizable-panels`,
  `next-themes` and `@shadcn/react` — **but only once `components/ui/` and
  `components/alpha/` are deleted**, since those still import them.
- `components.json` (the shadcn config) becomes unused.

### 3.3 Not required — fonts

`app/globals.css` declares no `@font-face` and downloads nothing. The three
type roles resolve against system families only.

`public/fonts/editorial.otf` and `interface.otf` are no longer referenced.
They can stay or go.

Note for the record: those two files' internal names are **Nimbus Roman** and
**Nimbus Sans** (URW Base35), metric clones of Times and Helvetica — not the
Newsreader/Inter the brand sheet names. The system stacks here lead with Times
and Helvetica so the rendered proportions are unchanged from the design.

### 3.4 Not required — `next.config.ts`

No change. Nothing in the output needs image domains, rewrites or experimental
flags.

---

## 4. Build verification — and one blocker that is not mine

### What passed

Run against this workspace's own `tsconfig.json` compiler options and its
`eslint.config.mjs`, with the output placed at a project root:

| Check | Result |
|---|---|
| `tsc --noEmit` (project compiler options) | **0 errors** |
| `eslint app components hooks` | **20 files, 0 errors, 0 warnings** |
| `next build` (production) | **exit 0** — all 6 routes built |
| `next dev` — every route | **HTTP 200**; unknown hash and id return 404 |

Build output:

```
┌ ○ /
├ ○ /_not-found
├ ○ /console
├ ○ /holdings
├ ○ /markets
├ ƒ /markets/[id]
└ ƒ /report/[hash]
```

### The blocker

**`pnpm build` in this workspace fails, and would fail with no `app/` at all.**

```
[UNRESOLVED_IMPORT] Could not resolve './.openai/hosting.json' in vite.config.ts
```

`vite.config.ts:3` imports `./.openai/hosting.json`. That file does not exist
in this workspace, so the vinext/Vite build dies while loading its own config,
before it reads a single line of app code. Per the brief I did not create it or
edit `vite.config.ts`; the verification above uses `next build` instead, which
exercises the same App Router code.

The main repo has its own `next.config.ts` and build pipeline, so this is very
likely a non-issue there. If the main repo is also vinext-based, it needs
`.openai/hosting.json` present.

**Second, smaller one:** `pnpm install` fails here with `packages field missing
or empty`, because `pnpm-workspace.yaml` carries settings but no `packages:`
key. `pnpm install --ignore-workspace` works. Same situation — a workspace
config issue, not a code one.

---

## 5. Contract compliance

| Rule | Status |
|---|---|
| App Router, server components by default, TypeScript | Yes — no page or layout is a client component |
| Exactly the six routes | Yes |
| No `app/api/` | Yes |
| No new dependencies | Yes — every import is `next`, `next/link`, `next/navigation`, `react`, or a `@/` path |
| One stylesheet, imported once | Yes — `app/globals.css`, imported only in `app/layout.tsx` |
| No CSS modules, styled-components or per-component styles | Yes |
| No inline `style` except runtime-computed | Yes — two occurrences, both the fit-panel transform |
| Class names match the design's stylesheet | Yes |
| Light only, `color-scheme: light`, no dark variant | Yes |
| No web fonts | Yes |
| Header/nav/footer in the layout, not per page | Yes |
| Active nav derived from the path in one place | Yes — `SiteNav.tsx`, via `usePathname` |
| `'use client'` as far down as possible | Yes — 8 component leaves and 1 hook |
| One demo const per page, at the top | Yes |
| No invented API calls or data-fetching hooks | Yes |
| Handlers stubbed and named for what they will do | Yes — see §6 |
| Never-wired controls visibly inert, one treatment | Yes — `.inert`, defined once |
| No wallet logic, chain reads/writes, ABIs | Yes |
| No env reads, no `NEXT_PUBLIC_` | Yes |
| No side-picking control on staking | Yes — the side is text, from the backing report |
| Two sides only, TRUE and FALSE | Yes |

### Nav active state

| Route | Active |
|---|---|
| `/`, `/report/[hash]` | Reports |
| `/markets`, `/markets/[id]` | Markets |
| `/console` | Console |
| `/holdings` | nothing |

---

## 6. Stubbed handlers — the wiring list

Each is a named no-op function in the client component that owns the control.

| Component | Handlers |
|---|---|
| `BuyControl` | `onBuy` |
| `StakeControl` | `onStake`, `onToggleAttachReport` (works — local state) |
| `AtlasPanel` | `onGenerate`, `onReadSource` |
| `ConsoleViewer` | `onZoomIn`, `onZoomOut` (work — local state), `onExpand`, `onEditParagraph`, `onAddNote`, `onRefreshSnapshot`, `onReadSource` (works — switches tab) |
| `TokenizeForm` | `onTokenize`, `onSaveDraft`, `onChooseFile` |
| `MarketplaceFilters` | `onSearch`, `onSelectCategory`, `onToggleMyReports` |
| `MarketFilters` | `onSearch`, `onSelectCategory`, `onSelectStatus` |

Controls marked `.inert` carry no handler at all: the header wallet button and
demo menu, the chart range buttons, the "My positions" tab, the token-receipt
links, the category and related-market selects on the tokenize form, and the
"View contract" link.

---

## 7. Where the demo data is

One const per page file, immediately above the component, typed and shaped like
the real records.

| Page | Const | Shape |
|---|---|---|
| `app/page.tsx` | `MARKETPLACE` | object with `reports: ReportCard[]` |
| `app/report/[hash]/page.tsx` | `REPORTS_BY_HASH` | `Record<hash, ReportRecord>` |
| `app/markets/page.tsx` | `MARKETS` | object with `markets: MarketCard[]` |
| `app/markets/[id]/page.tsx` | `MARKETS_BY_ID` | `Record<id, MarketRecord>` |
| `app/console/page.tsx` | `WORKSPACE` | single object |
| `app/holdings/page.tsx` | `HOLDINGS` | object with `tokens: Holding[]` |

Three small shared literals sit beside them rather than being repeated inside:
`LENDING_TABLE` (report page), and `LABELS` / `RANGES` (both market pages).
They are demo content too and are swapped out with their const.

### Hashes

`/report/[hash]` is keyed by a hash, so the demo records carry one. Six exist;
three have full records on the report page:

| Hash | Report | State |
|---|---|---|
| `9f2c4a7e1b8d3056` | Lending protocols / Q2 2026 | paywall |
| `3d81e6f09c24ab75` | Aave / Revenue quality | bought |
| `b570c93a4e12d8f6` | Morpho / Growth & risk | preview |
| `e4a1b26d70f5c839` | Stablecoin reserves | listed only |
| `6c08f5b3d9a21e74` | DEX fee economics | listed only |
| `a293e7c015b6d4f8` | Spark / Lending outlook | listed only |

The last three appear on `/` and in holdings but have no record on the report
page, so their links 404 until real data is wired. The three that do exist
cover all three states, which is what the state machine needed to demonstrate.

---

## 8. The six markets, restated as TRUE/FALSE claims

The design had three yes/no markets and three "who leads" markets with three
outcomes each. The contract allows two sides only, so the three multi-outcome
markets became a claim about the leading name, keeping its probability as TRUE
and the remainder as FALSE.

| id | Design question | Claim | TRUE | FALSE |
|---|---|---|---|---|
| `lending-2027` | Who leads lending by end-2027? | Aave leads lending by end-2027 | 54 | 46 |
| `stablecoins-2027` | Which stablecoin grows the most in 2027? | USDC grows the most of any stablecoin in 2027 | 46 | 54 |
| `dex-volume` | Who leads DEX volume in Q4 2026? | Uniswap leads DEX volume in Q4 2026 | 61 | 39 |
| `spark-growth` | Will Spark loans exceed $8B in 2027? | Spark loans exceed $8B in 2027 | 64 | 36 |
| `aave-revenue-2026` | Will Aave revenue grow more than 20%? | Aave revenue grows more than 20% in 2026 | 72 | 28 |
| `stablecoin-supply` | Did stablecoin supply exceed $250B? | Stablecoin supply exceeded $250B at the Q2 2026 close *(resolved)* | 100 | 0 |

The FALSE share is the design's non-leading outcomes summed, so no probability
was invented. Line colours are the design's first two outcome colours:
TRUE `#526bd8`, FALSE `#d18a3c`.

---

## 9. Stylesheet notes

`app/globals.css` starts from `design/alpha-markets.css`, the de-Tailwinded
four-screen stylesheet, and adds what that file did not cover. Every addition
is commented in place. In order:

1. **Header and `:root`** — system font stacks, `color-scheme: light`. The
   `.chart-placeholder` block at the tail (marked "not part of the design") is
   removed.
2. **`.mini-copy` widths** — the design set these five with an inline `style`
   attribute. They are fixed values, so they are `:nth-child` rules now.
3. **Side colours** — the design carried each outcome colour as an inline
   `style` because it looped a variable-length outcome list. With a fixed pair
   they are classes: `.dot-true`, `.dot-false`, `.pct-*`, `.line-*`, `.fill-*`.
4. **Chart axis furniture** — `.chart-grid`, `.chart-axis-y`, `.chart-plot`,
   `.chart-axis-x`. The chart is inline SVG stretched by
   `preserveAspectRatio="none"`, so axis labels are HTML and sit outside it.
   The 45px gutter and `#7a8490` tick colour are the design's own values.
   `.chart-legend button` became `.chart-legend > span`: with two fixed sides a
   hide-toggle is meaningless.
5. **Screen 5, market index** — `.markets-page`, `.prediction-grid`,
   `.prediction-card*`, `.prediction-outcomes`, `.market-count`,
   `.market-tabs`, `.market-open-action`, plus their responsive rules. This
   screen had **no HTML export**; the rules come from the mockup's
   `app/globals.css`, which authored them in plain CSS. Its three remaining
   `[data-slot=…]` hooks resolve the same way as everywhere else, and
   `var(--border)` resolves to its literal `#dfe5ea`.
6. **Screen 6, holdings** — `.holdings-panel` and `.holdings-sub`. No design
   existed; the page is otherwise built from existing helpers.
7. **Screen 7, one report** — `.report-excerpt`, `.locked-preview`,
   `.purchase-bar`, `.unlocked-bar`. The design reached these three states
   through a modal on the marketplace, so its export never rendered them.
   Lifted from the mockup. `.report-body` is new: the design's
   `.modal-document` constrained the sheet to `65vh` inside a dialog, which is
   the wrong treatment on a page, so it applies the same ground and border
   without the scroll box.
8. **`.stake-side` and `.attached-report`** — take the place of the outcome
   select the contract removes, inheriting the dark panel's treatment.
9. **`.outcome-state`** — the outcome table's third column states each side's
   standing instead of offering a Back button; with two sides and a
   report-derived side there is nothing to pick. `.range-buttons > span`
   likewise, since the ranges are inert.
10. **`.inert`** — defined once, used everywhere.

### Two things fixed rather than carried over

- **`.badge.resolved`** was set by the mockup's markup but never had a rule, so
  a resolved market read identically to an open one. Given a value.
- The mockup's dead `.report-paper p[ondblclick]` rule is not carried over.
  React never renders that attribute, so it matched nothing.

---

## 10. Known gaps

- **Report pages 2–4.** `ReportPaper` renders one sheet from a block list. The
  console's pager counts to 4 and relabels the footer, but every page shows the
  same blocks, because the demo const carries one page of content. Real data
  supplies the rest; no markup change is needed.
- **Three report hashes 404**, as noted in §7.
- **Chart ranges are inert.** Making 1D/1W/1M real would mean inventing a
  separate series per range per market. The demo const carries one series, and
  the range buttons are `.inert`.
- **The design's modals are not built** — the receipt, contract, wallet and
  about dialogs. None is on a contract route, and all are wallet- or
  receipt-driven.

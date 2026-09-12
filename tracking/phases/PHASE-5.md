# Phase 5 — Front

*Every function this build already has, wired to the place the design drew for it — one function at
a time, so that after each unit there is one more thing you can actually do.*

**This document is the frontend spec. It supersedes nothing in PHASE-4.md** — Phase 4's twenty-one
units are the machine this phase puts a face on, and where a Phase 4 header states a property of a
page (*"the visuals are disposable and the queries are not"*, *"there is no side control anywhere on
this page"*) that header is law here.

**Three things feed this one:**

| | |
|---|---|
| `front-end-design/` | ⚠️ **a brand package, not an application** — ten standalone HTML files, no shared nav, 240 KB of base64 OTF inlined in every one, ~135 KB of dead Tailwind, and **~55 KB of real design system across 174 semantic classes**. The job is to take the design out and leave the rest |
| `logs.md`, 2026-09-11, *"Frontend references assessed"* | the survey — what maps, what conflicts, what has no data behind it |
| `app/README.md` | ⚠️ **one sentence of it is now false.** See Unit 1 |

⚠️ **The references are light-only, the app is dual-scheme, the references price in USDC, the app
prices in HBAR, and the references let a staker pick a side the contract does not accept.** Each of
those is decided below, in *Decisions this plan takes*, and each is owned rather than left to a unit
to discover.

---

## ⚠️ How this phase is sequenced, and why it is not dependency order

**The design has already made the layout decisions.** Three pages exist as drawn, every function
they need already works, and the work is wiring. So the units follow **the product's own flow**, not
the build graph:

> **Each unit is one function wired to its place. Not one page styled.**
> **After every unit there is one more control you can press and one more outcome you can see.**

Dependency order would give four half-wired pages and nothing working until the end. Function order
gives a working product that grows, and the point of this phase is watching it run.

⚠️ **The consequence, stated so it is not a surprise: pages arrive finished one at a time, and the
ones that have not had their unit yet sit in the old styling under the new chrome.** From Unit 6 the
nav links `/`, `/markets` and `/holdings`, and those three keep Phase 3's look until Units 12, 13 and
14 reach them. That is visible, it is temporary, and it is the price of every unit being a thing that
works rather than a thing that is half drawn.

⚠️ **Units 1–6 are the exception and they are deliberately the shape this phase otherwise refuses.**
Unit 3 restyles everything and wires nothing. It is first because it is what makes every later unit a
*wiring* unit instead of a wiring-plus-styling unit — do it once, at the start, or do a piece of it
seven times.

### ⚠️ Where the reordering hits a real dependency, and the one file it adds

Five constraints the sequence cannot bend, and one addition. Named rather than silently worked
around.

| | |
|---|---|
| **Unit 1 before Unit 16** | the buyer route move **must** precede any deletion — `buy.tsx` fetches `/api/console/buy` and deleting that directory breaks the paywall button |
| **Unit 2 before Unit 6** | the nav links `/console`; the doorlock goes on before the link does, never after |
| **Unit 5 before Unit 6** | the header's *Connect wallet* is the unbuilt marker's first consumer |
| **Unit 9 before Unit 11** | ⚠️ **the paper is built once and used twice.** `.report-paper` is the console's document stage *and* the bought body on `/report/[hash]`. Unit 9 builds it on the console, where a just-generated report is already sitting; Unit 11 drops it behind the paywall. ⚠️ **So Unit 9 puts `.report-paper` and `.financial-table` in `globals.css`, not in `console.css`** — §1's *check at the second consumer* rule is pre-empted here, knowingly, because we already know there are two |
| **Unit 15b after Unit 14** | the two-ledger panel links into `/markets/[id]`, and it reads as a dead end until that page is finished |
| ⚠️ **the one addition** | **`app/api/console/source/route.ts`.** Unit 7 asks for The Graph to be *visible and pressable*, and **there is no route in this repo that serves Graph data outside a generation run** — `/api/console/state` is the store, `/api/health` is the facilitator, and `settlement_evidence` is settlement-only with three rows. A static registry list has no control to press, which is the one thing this phase's units must each have. **One route, and it gives `graph/evidence.ts::buildEvidence` its second caller** — PHASE-4 records that *"the builder exists and its only caller is a demo script"*, and this closes that by using it rather than by writing anything new |

---

## Status

**Foundation — everything needs these and nothing works without them.**

| Unit | | Status |
|---|---|---|
| **1** | `app/api/buy/route.ts` — the buyer route move | ⬜ ⚠️ **FIRST, and before any deletion** |
| **2** | `CONSOLE_SECRET` — the doorlock on the two routes that spend | ⬜ ⚠️ **before `/console` is linked** |
| **3** | `app/globals.css` — the design system | ⬜ · **no `.tsx` changes at all** |
| **4** | the fonts, and the licence | ⬜ |
| **5** | `app/ui/unbuilt.tsx` + `app/ui/price.tsx` | ⬜ · **the two contracts every later unit inherits** |
| **6** | `app/ui/chrome.tsx` + `app/layout.tsx` — nav and footer | ⬜ · *smallest change, largest effect* |

**The product, in the order it runs.** One function each.

| Unit | the function | wired to | Status |
|---|---|---|---|
| **7** | `graph/client.ts::querySubgraph` + `graph/evidence.ts::buildEvidence` | the console's source-data and query-evidence panels | ⬜ |
| **8** | `compose → execute → narrate → validate → save`, streamed | the console's composer, terminal and agent status | ⬜ |
| **9** | `agent/narrate.ts::render` + `app/markdown.tsx` | the document stage — ⚠️ **and `/report/[hash]` later** | ⬜ |
| **10** | `tokenize/ats.ts` through `/api/console/tokenize` | the tokenize section, below on the same page | ⬜ |
| **11** | `payments/gate.ts` + `/api/buy` + `/api/reports/[hash]` | `/report/[hash]` — the preview and the paid read | ⬜ |
| **12** | `store/reports.ts::list` + `store/tokens.ts::tokensFor` | `/` — every published report, with its token state | ⬜ |
| **13** | `balanceOf` through `/api/holdings` | `/holdings` — who holds the security | ⬜ |
| **14** | one batched `eth_call` over every market's pools | `/markets` — the index and the analyst's record | ⬜ |
| **15** | `stake(marketId, claimId)` from a browser wallet, then `/api/markets/[id]/refresh` | `/markets/[id]` — the pool bar and the stake | ⬜ |
| **15b** | `store/tokens.ts::tokenFor` + the claims-to-markets join | the two-ledger panel — one hash in two places | ⬜ |

**Close.**

| Unit | | Status |
|---|---|---|
| **16** | deletions, and the `app/README.md` correction | ⬜ ⚠️ **last, not first** |
| **17** | PLAY GAP — walk it as a stranger | ⬜ |

---

## ⚠️ Decisions this plan takes

Six, and none is left for a unit to discover. Each says what is given up.

### D1 · Light-only wins, and the dark block is deleted rather than left to rot

`globals.css` is dual-scheme today: `color-scheme: light dark` plus two `@media (prefers-color-scheme:
dark)` blocks. The references have **zero** `prefers-color-scheme` rules and **zero** `.dark`
selectors — the palette is one committed light ground, `--background:#f3f9fd`, with a serif/sans
pairing tuned to it.

**Decided: adopt the reference's light palette whole, and drop dark mode.**

⚠️ **The mechanical half is the part that actually bites.** `color-scheme` must change from
`light dark` to `light` **in the same commit**. Leave it and a visitor on a dark-mode device gets
the *browser's* dark form controls, dark scrollbars and dark autofill painted over a light page —
which is worse than either scheme whole. That is the bug this decision exists to prevent, not a
tidiness point.

**What we give up, said plainly:** a dark-mode visitor gets a light page. The alternative is drawing
a dark counterpart to a palette nobody drew one for — the largest piece of un-briefed design work
available in this project — and getting it wrong in public. **Unit 3 owns it.**

### D2 · Pricing stays in HBAR on testnet, and the denomination becomes a component rather than a string

The references say "5 USDC", "3 USDC", "4 USDC" — six reports at six prices. The app has one
constant, `REPORT_PRICE_TINYBARS = '100000'` (0.001 HBAR), and `src/config/pricing.ts` records why a
dollar-denominated price cannot simply be typed in: `defaultMoneyConversion` resolves USD through a
`DEFAULT_ASSETS` table with **no HBAR entry**, so a `"$0.50"` price **throws** rather than converting.
The USDC cutover is scheduled for mainnet and R12 binds four things to move together in one commit —
the token id, the amount, the buyer's `allowedAssets` entry and the facilitator's advertised asset.

**Decided, three parts:**

1. ⚠️ **The USDC cutover is NOT part of this phase.** It is a payments change that lands on mainnet.
   A frontend commit that moves it would be a frontend commit that can break settlement.
2. ⚠️ **Per-report pricing is NOT built.** It needs a `reports` column, a `quotes.ts` change, and a
   decision about whether a price is inside the report's hash — it must not be, since a price is not
   part of a report's identity, and that is a store decision, not a page one.
3. **What this phase does build: one `Price` component** (Unit 5) that takes an atomic amount and a
   rail and renders it. Every surface goes through it. When the cutover happens, **one file changes
   and every page follows.**

⚠️ **And the honest bit.** The design's price slot is a big number and a ticker. `0.001 HBAR` in
that slot reads as a placeholder, and there is no dressing it up — `pricing.ts` says a USD-legible
price is forfeited until the cutover and says so in those words. **Render the real number, put
`testnet` beside it in the eyebrow style, and do not invent a dollar figure.** A wrong price on a
page selling a security is worse than an unfamiliar one.

⚠️ **USDC on the market pages is correct and must not be "fixed" to match.** Arc's native gas token
*is* USDC at 18 decimals. The same word means two rails on two screens and both are right.

### D3 · The outcome rows are display. There is no side control anywhere, and there never will be

`stake(marketId, claimId)` takes no side; `_add(m, marketId, c.side, msg.value)` reads it off the
claim. Both `app/markets/[id]/page.tsx` and `app/markets/[id]/stake.tsx` carry headers saying the
absence *is the feature* — a toggle lets two people back opposite sides of one claim and the claim
stops meaning anything.

**Decided: the design's `OUTCOME / PROBABILITY / ACTION` table becomes `SIDE / POOL / SHARE`, and the
ACTION column is removed entirely — not disabled, not marked, removed.**

⚠️ **This is a cut, not an unbuilt marker, and the distinction is the whole of D6.** Marking the
side-picker "not built yet" would assert a roadmap that does not exist and cannot exist without a
different contract. The reference got the system wrong; we do not memorialise that.

### D4 · No multi-outcome markets, and the third row is not drawn

`AlphaMarket.sol` is binary: `outcome BOOLEAN`, `side BOOLEAN`, `poolTrue`, `poolFalse`. Aave 54 /
Morpho 28 / Other 18 is a different contract. **Every market surface shows exactly two sides.**
Cut, like D3 — not marked.

### D5 · `/` stays the marketplace. Console lives at `/console`

The reference's README calls `console.html` the homepage. **Decided against.** The marketplace is
the product's front door; putting an operator tool in front of a buyer inverts what this thing is.
`/` is Reports, and it is the first nav item.

⚠️ **The sequence does not contradict this.** The console is wired first because it is where the
functions originate — a report has to be generated before there is anything to sell — and being
built first is not the same as being the front door.

### D6 · ⚠️ The line between *marked* and *cut*, drawn once

> **Mark what a reviewer would otherwise think we forgot or hid.
> Cut what the contract forbids.**

| | |
|---|---|
| **Marked** — coherent capability, simply not built | report upload · "Publish a report" · search · category filters · "My reports" · "My positions" · "Connect wallet" in the header · the probability-over-time chart · the 1D/1W/1M/All range buttons · the potential-payout estimate |
| **Cut** — the design was wrong about the system | the side picker and per-outcome Back buttons (D3) · outcomes beyond two (D4) · "attach supporting report" to a human stake — a stake carries no report, only a *claim* cites one, and `claims.report_hash` is a foreign key the analyst writes · the "Demo" toggle · every "Demo data" / "No transaction will be broadcast" string |

**Unit 5 specifies the marked treatment once. Every page inherits it.** The specification is in
§4 below.

---

## 1 · Structure

### Where the design system lives

**`app/globals.css` keeps the tokens, the reset, the type scale and every primitive shared by more
than one page group. Each page group gets its own stylesheet beside its page.**

⚠️ **This is not a new pattern — `app/console/console.css` already does exactly this** and is
imported by `app/console/page.tsx`. The precedent exists in the repo and the plan follows it rather
than inventing a second convention.

```
app/globals.css              tokens · reset · type · .mono .hash .break .identity
                             .masthead .lede .meta .memo .table-wrap .empty
                             the buttons, the notices, the unbuilt marker's own rules
                             ⚠️ .report-paper and .financial-table — TWO consumers, see Unit 9
app/console/console.css      the workspace, the source panel, the terminal, the publish steps
app/report/report.css        the gate and the two-ledger panel
app/reports.css              the marketplace grid and its card
app/holdings/holdings.css    the inventory table
app/markets/markets.css      the market card, the pool bar, the position panel
```

⚠️ **The rule for which file a class goes in: a class used by two or more page groups belongs in
globals.** Checked when the *second* group needs it, never guessed in advance. Moving a class up is
a one-line diff; discovering two divergent copies three units later is not.

⚠️ **The one place that rule is pre-empted is the paper**, because the sequence makes both consumers
known in advance — Unit 9 builds it on the console and Unit 11 uses it behind the paywall.

⚠️ **The guard that keeps this from becoming a specificity accident:** a page-group stylesheet
**never defines a custom property and never restyles a bare element selector**. Only its own
classes. Tokens and element defaults live in exactly one file.

### What happens to `globals.css`

208 lines today, and here is the thing that makes this phase cheap:

⚠️ **Every page in the app already uses only classes `globals.css` defines.** ⚠️ **Phase 4's** Units
13, 13b and 14 each say so in their own headers — *"nothing below reaches for a new class"*, *"every `className`
below already exists"*. That was written as a discipline for shipping fast and it turns out to be a
gift: **Unit 3 restyles the entire application without touching a single `.tsx` file.**

So `globals.css` is rewritten **keeping every existing class name**, changing only what those classes
look like. `.masthead`, `.lede`, `.reports`, `.meta`, `.mono`, `.hash`, `.identity`, `.memo`,
`.table-wrap`, `.buy`, `.buy-stage`, `.buy-error`, `.agent-pays`, `.no-durable`, `.settled`,
`.settled-links`, `.empty`, `.back`, `.break` — all survive with their names.

⚠️ **Renaming a class and restyling a page in the same commit is two subsystems in one commit.**
Names change later, per page group, in that page group's own unit, or not at all. There is no
renaming unit and none is wanted.

### What a reviewer sees opening `app/`

**Today:** 35 files. Seven of eleven routes are scaffolding. No nav. `console/` is the largest thing
in the directory by file count and it is labelled throwaway on every file.

**After Unit 16:**

```
app/
  layout.tsx        nav, footer, one stylesheet import — ⚠️ and NOTHING from src/
  globals.css       the design system
  page.tsx          the marketplace
  reports.css
  report/[hash]/    preview · buy · ledgers · report.css
  markets/          index · [id] · stake · markets.css
  holdings/         page · inventory · holdings.css
  console/          the agent workspace — product, gated
  ui/               chrome · unbuilt · price
  api/              buy · reports/[hash] · holdings · markets/[id]/refresh
                    console/source · console/generate · console/tokenize · console/state
                    cron/commit · cron/resolve · health
  markdown.tsx      the escaping boundary, untouched
  README.md         corrected
```

⚠️ **`app/ui/` is a folder with no `page.tsx` and no `route.ts`, so it produces no route.** Worth
saying because it looks like it should.

### ⚠️ New files this phase proposes

CLAUDE.md says name them and wait. These are the whole list:

`app/ui/chrome.tsx` · `app/ui/unbuilt.tsx` · `app/ui/price.tsx` · `app/api/buy/route.ts` (a move) ·
⚠️ **`app/api/console/source/route.ts`** (the one the reordering adds — see *Where the reordering
hits a real dependency*) · `app/reports.css` · `app/report/report.css` · `app/markets/markets.css` ·
`app/holdings/holdings.css` · and **`LICENSE`, only if the font decision lands on self-hosting**
(see §2).

---

## 2 · The fonts

240 KB of base64 OTF inlined in every one of ten files is not shippable, and it is also not the
interesting part of the problem.

### ⚠️ What the licence actually permits, and it is narrower than it looks

`FONT-LICENSE.txt` is the Debian copyright file for `urw-base35-fonts`. The fonts — renamed
`Editorial` and `Interface` in the export, actually **Nimbus Roman** and **Nimbus Sans** — are:

> **License: AGPL-3 with Font exception**
> *As a special exception, permission is granted to include these font programs in a **Postscript or
> PDF file** that consists of a document that contains text to be displayed or printed using this
> font…*

⚠️ **The exception covers PostScript and PDF. It does not mention the web, and a web page is neither.**
So serving these faces from the site is plain AGPL-3 distribution of the font programs: it obliges us
to carry the licence and offer the font source to recipients. That is workable — the OTFs *are* the
distributable form — but it is an obligation, and this repo **has no `LICENSE` file at all**
(PHASE-4 open item 9 already has `AlphaMarket.sol` declaring MIT against nothing).

### ⚠️ And the fonts are metric clones of faces every machine already has

Nimbus Sans is a Helvetica clone. Nimbus Roman is a Times clone. That is what URW Base35 *is*.

**Recommended: do not ship the fonts. Ship the stack.**

```css
--font-display: "Nimbus Roman", "Times New Roman", Times, Georgia, serif;
--font-body:    "Nimbus Sans", Helvetica, Arial, system-ui, sans-serif;
--font-mono:    SFMono-Regular, Consolas, "Liberation Mono", ui-monospace, monospace;
```

Zero bytes served, zero licence obligation, no `public/` directory (**there is none in this repo
today**), and on macOS, Windows and most Linux desktops the rendered letterforms are the reference's
letterforms, because the reference's letterforms are Helvetica and Times.

⚠️ **What we give up:** exact metric identity on a machine that has neither Helvetica nor a Nimbus
package — some Linux and some Android. The line lengths shift; the design does not break, because
the design's measure is set in `rem` and its rhythm in `line-height`, not in glyph widths.

**If that is rejected**, the fallback is: convert both OTFs to subset WOFF2 (~25–40 KB each), serve
from a new `public/fonts/`, add `LICENSE` and ship `FONT-LICENSE.txt` at a public URL. ⚠️ **Do not
reach for `next/font/local` to do it.** `next` ships no `exports` map and `next/font/local` resolves
to a *directory*; under `tsconfig.app.json`'s `nodenext` that is `ERR_UNSUPPORTED_DIR_IMPORT`
territory — the same class of trap that already forced plain `<a href>` instead of `next/link`, and
`node_modules/next/font/local/index.js` is a **zero-byte file** because the loader is a compile-time
transform keyed on the exact specifier. A plain `@font-face` in `globals.css` has none of that
surface. **Unit 4 owns the decision and lands whichever it is.**

---

## 3 · The nav

There is none. `app/layout.tsx` is 20 lines and renders `{children}`. Every page hand-rolls a
`.back` link. The complete set of internal links in the app today is `/`, `/holdings`,
`/report/${hash}`, `/markets/${id}` and one `/markets` — **so `/markets` is unreachable from the
homepage, and `/holdings` is reachable only from the Ledgers panel of a report that happens to be
tokenized.** Two finished product surfaces are effectively hidden.

**This is the smallest change with the largest effect in the phase and it is Unit 6.**

**Four items, not the reference's three:**

| item | href | why |
|---|---|---|
| **Reports** | `/` | the front door (D5) |
| **Markets** | `/markets` | currently unreachable |
| **Holdings** | `/holdings` | ⚠️ **a departure from the reference, owned here.** It is product, it is finished, and it answers *who holds the security* — which is the one question a tokenization story has to answer and currently hides behind two clicks |
| **Console** | `/console` | after Unit 2's doorlock, never before |

⚠️ **Plain `<a href>`, never `next/link`** — `app/page.tsx`'s header has the full reason and it has
not changed.

⚠️ **A server component with no `'use client'` and no state.** It is links.

⚠️ **"Connect wallet" in the reference header is the marked-unbuilt case, not a button.** There is no
session identity in this project — `payments/auth.ts` is the declared cut point — and the only wallet
connection that exists is momentary, inside the stake flow, on one page. A header button implying a
connected identity would be the single most misleading thing on the site.

⚠️ **`layout.tsx` imports nothing from `src/`.** See §7 — a store import here is inherited by every
route's traced size.

---

## 4 · ⚠️ The unbuilt treatment, specified once

**Unit 5 builds it. Every page after imports it. No page invents its own.**

**The rule:** *shown, obviously inert, unmistakable, and never a `<button>`.*

**The element.** `<Unbuilt label="…" >children</Unbuilt>` renders the designed thing in place at
**full contrast** — not greyed toward invisibility, because a thing you cannot read does not
communicate that it is unbuilt, it communicates that the CSS is broken. Around it:

1. ⚠️ **It is a `<span>` or `<div>`, never a `<button>`, `<a>` or `<input>`.** A disabled button
   invites a second click and reads as a temporary state. There must be nothing to click.
2. `aria-disabled="true"`, removed from the tab order, and an `<abbr>`-style accessible name that
   carries the label.
3. **One visual token, used nowhere else:** a dotted rule in `--muted-foreground` and a small
   `NOT BUILT` in the reference's own `.eyebrow` style — SFMono, 12px, `letter-spacing: .12em`,
   uppercase. The eyebrow is already the design's device for saying what a block *is*; this is that
   device saying one more thing.
4. **The label says what it would do, in one clause.** *"Uploading a report — not built"*, not
   *"Coming soon"*. This project does not promise.

⚠️ **What it is not for.** Not for empty data — a market with no stakes yet is not unbuilt, it is
empty, and `.empty` already exists for that. Not for anything in D6's **Cut** column. Not for a
capability we could build and chose not to this week: say that in copy, on the page, in a sentence.

---

## 5 · ⚠️ What the pages show given the real numbers

Read from Neon on 2026-09-11: **11 reports · 4 tokenized · 8 markets (6 on chain, 3 resolved,
1 voided) · 2 claims · 1 stake · 0 scores · 10 purchases · 0 payouts · 1.02 USDC of total volume.**

The references show six reports at six prices, six markets with five-figure volumes, and 4–12
supporting reports per market. **Anything that looks abundant in the reference will render nearly
blank.** That is a design problem the references do not solve and it is answered here, once, rather
than discovered six times.

### `/console` — 11 reports in the state table, a real generation, a real tokenize

Reads well, and it is the page the sequence starts on. The document stage has 11 real reports to show
and `document.tsx` already renders one through the product's own `markdown.tsx`. **The source panel
is the one place in this product where the numbers are genuinely large** — 25 live deployments — and
that is why Unit 7 leads.

### `/report/[hash]` — 11 pages, and ⚠️ **no design exists for any of them**

This is the screen the entire x402 argument rests on and the reference package does not contain it.

But it does contain **the CSS for it**: `.locked-preview`, `.purchase-bar`, `.unlocked-bar`,
`.transaction-receipt`, `.alpha-modal`, `.modal-document`, `.report-paper`, `.paper-masthead`,
`.paper-byline`, `.paper-footer`, `.financial-table` — **orphan classes, defined in the stylesheet
and drawn in none of the ten files.** Unit 11 is the unit that finds out whether they are usable, and
⚠️ **Unit 9 has already de-risked half of them** by building the paper on the console first.

**Treatment:** the preview keeps its identity panel and its five coverage counts; the gate uses
`.locked-preview` and `.purchase-bar`; the bought body renders into `.report-paper` with
`.financial-table` for the market table. ⚠️ **The paper's byline reads the real analyst id and the
real hash. It does not read "PREPARED BY ATLAS RESEARCH · DEMO DATA"**, which is baked into the
reference's own paper design.

⚠️ **The paywall is probed on every change to this page**, and Unit 11 changes it more than any other
unit in the phase. See its proof.

### `/` — 11 reports. **This page reads best of all of them.**

Eleven cards in a three-up grid is nearly four full rows. Genuinely fine.

⚠️ **The one hole: 7 of 11 are untokenized and the design's card assumes a token chip on every one.**
Treatment: **the chip is a real two-state control, not a decoration.** *Tokenized · `ISIN`* against
*Not tokenized*, both styled, both legible, the second not a faded version of the first. The
distinction is true and it is interesting — it is the difference between a published document and a
security.

⚠️ **And the card loses a button.** The reference has *Preview report* and *Unlock* side by side.
There is no unlock-from-index path in this app and building one would put a spend control on a list.
**One link, to the preview.** Unlocking happens on the report page, where the honest sentence about
who pays fits beside it.

### `/holdings` — 4 tokens, 2 accounts. Small and honest, and that is all it needs to be.

### `/markets` — 8 markets, of which **2 are forecasts**

The reference draws a grid of six rich equal cards. The truth is 2 forecasts, 4 rehearsals, 2 never
landed on chain — and ⚠️ **the reference has no idea the rehearsal/forecast distinction exists**,
which is the one distinction on this page that must not be lost. PHASE-4: *a market over an
already-observed day is indistinguishable on chain from a forecast; nothing enforces the distinction
but us.*

**Treatment: keep the three groups as sections with their own explanation, and let Forecasts be
small and prominent rather than padded out.** Two large cards under a heading that says these are the
real ones beats six identical cards that lie by symmetry. The rehearsal section is the majority of
the page and should look like what it is — a machinery proof, visually quieter, with the existing
copy about why it counts towards nothing.

⚠️ **`scores` has 0 rows, so the record strip reads *"no forecast has settled yet"* and will keep
reading that until markets 6 and 7 settle.** That is correct and it must not be dressed as a zero.
**Design the strip for the empty case first**, because the empty case is what ships unless Sunday's
resolve cron fires before the demo.

### `/markets/[id]` — reads fine for 6 and 7, and has a hole where the chart was

Market 6 has a claim, a backing report, a 1.01 USDC pool and one human stake. Market 7 has a claim
and 0.01 USDC. Both have a question, landmarks and a standing line. That is a real page.

⚠️ **The chart panel is roughly 40% of the reference's page height and there is no chart.** Nothing
stores a probability series; the closest derivable thing is a step function over `stakes.staked_at`,
and there is **one stake row in the entire database**. A two-point line on one market and a flat line
on every other is worse than no line.

**Decided (Unit 15): the chart panel becomes a pool bar.** Same slot, same prominence, real data —
two bars, the analyst's side and the other side, read from the contract on every request, with the
total beneath and the market's four landmarks as a timeline. It is the one thing on the page that
*moves* when somebody stakes.

⚠️ **And it must be labelled, not drawn as a race.** Every pool today is one-sided, so the bar is
100/0. That is `payoutOf`'s `winningPool == 0` branch working — the parimutuel pays each staker their
own stake back — and a bar chart showing a 100% winner implies a landslide of opinion when what it
actually shows is that nobody has taken the other side. **The copy beside it says which.**

The 1D/1W/1M/All range buttons and the payout estimate are `Unbuilt` (§4).

---

## 6 · The units

### ⚠️ How every proof below is written

Each unit ends with a **testing list**, not a description. Three parts, always in this order:

> **LIVE** — each control, and what it does when pressed.
> **MARKED** — each affordance that is visibly inert, so a missing one is a bug.
> **DO NOT PRESS** — anything on screen that spends, when spending is not part of the proof.

The point is that a finding reads *"this button did the wrong thing"* rather than *"something feels
off"*.

---

## Foundation

### ⚠️ Unit 1 · `app/api/buy/route.ts` — the buyer route move. **Before any deletion.**

`app/report/[hash]/buy.tsx` fetches **`/api/console/buy`**, deliberately — *"there is ONE buyer path
in this project"*, because a second one would let the product and the console disagree about what a
purchase is. ⚠️ **So `rm -r app/api/console/` breaks the paywall button on the product**, and
`app/README.md` still says *"`rm -r app/console app/api/console` is the whole removal"*. **That
sentence is wrong today and Unit 16 corrects it.**

**In it:** `app/api/console/buy/route.ts` moves to `app/api/buy/route.ts`. `buy.tsx` changes one
fetch URL. Nothing else.

⚠️ **Three things change in the move because it stops being throwaway:**

1. **`maxDuration = 300` becomes `60`.** Vercel Hobby's real ceiling. The 300 was always fiction —
   accepted, no build warning, deployment READY carrying 60 — and it must not be carried onto a
   product route that the product's own paid route (`/api/reports/[hash]`) declares 60 for and
   explains at length.
2. ⚠️ **The operator-supplied `site` parameter is dropped, and the origin is pinned to the request's
   own host.** On a throwaway console, "this buyer will sign a payment against any URL you name" was
   bounded by `buyer.ts`'s spend caps and that was an acceptable trade on an internal surface. **On a
   public product route it is an unauthenticated endpoint that signs against an attacker-chosen
   `payTo`.** The caps are 0.01 HBAR per payment and 0.05 per day, so the blast radius is small — but
   small is not a reason, and the parameter buys the product nothing.
3. The header stops saying THROWAWAY and starts saying what it is.

⚠️ **This is a payments-surface change, not a frontend one.** It is its own commit and it does not
share one with anything visual.

**Proof.**
**LIVE** — *Have the agent buy this report* on `/report/<hash>`: settles a real x402 payment through
`/api/buy` and returns the markdown with a HashScan link. One purchase, 0.001 HBAR, and `purchases`
gains exactly one row. `/api/console/buy` returns **404**.
**MARKED** — none yet; Unit 5 has not landed.
**DO NOT PRESS** — nothing else; the console is untouched this unit.

### ⚠️ Unit 2 · `CONSOLE_SECRET` — the doorlock, before `/console` is linked

`/console` is about to go in the nav. Today it is an unauthenticated surface that can spend real
testnet HBAR, mint permanent assets, and — through `/api/console/generate` — **burn the project's
Anthropic budget from a public URL.** Putting it in a nav without addressing that is publishing a
faucet.

**In it:** one shared-secret check on the routes that cost money — `/api/console/generate` and
`/api/console/tokenize`, and **`/api/console/source` when Unit 7 adds it**, since a live subgraph
query spends `GRAPH_API_KEY` quota. `CONSOLE_SECRET` read through `requiredEnv`. The page carries a
field; the value is held in component state for the session and sent as a header.

⚠️ **What it is and what it is not.** It is a doorlock. **It is not authentication, not a session,
not identity, and it must not come anywhere near the paywall** — `payments/auth.ts` is still the
declared cut point and this does not reopen it. It is the difference between a demo surface and an
open faucet, and it is about fifteen lines.

⚠️ **An empty env var is a missing env var.** `requiredEnv` is the one guard. Add the key to
`.env.example` in this commit. And ⚠️ **a variable added to Vercel takes effect on the next
deployment, not the current one** — logs.md 2026-09-11T17:50Z is the whole story.

**Proof.**
**LIVE** — `POST /api/console/generate` with no header → **401**. With a wrong header → **401**. With
`CONSOLE_SECRET` absent from the environment → **500**, the `requiredEnv`-before-compare ordering that
made `CRON_SECRET` testable from outside. Same three for `/api/console/tokenize`.
**MARKED** — none.
**DO NOT PRESS** — ⚠️ **nothing is generated and nothing is tokenized to prove this.** The 401s are
the whole proof.

### Unit 3 · `app/globals.css` — the design system

⚠️ **No `.tsx` file changes. Not one.** Every page already uses only classes this file defines, so
rewriting it restyles the whole application in a single commit that a reviewer can read.

**In it:** extract the ~55 KB of semantic CSS from `front-end-design/`'s shared stylesheet, keep what
the existing class names need, port the palette and the type scale, drop dark (D1).

⚠️ **Extract, do not copy.** The 174 reference classes are for screens we are not building; the ones
we need are the primitives — the panel, the eyebrow, the badge, the field, the button, the table, the
notice. The Tailwind utilities are not ported at all: **no Tailwind, no framework, no dependency.**

**The palette, taken whole from the reference's own `:root`:** `--background:#f3f9fd`
`--foreground:#100f0e` `--card:#fff` `--muted:#edf2f6` `--muted-foreground:#707984`
`--border:#dfe5ea` `--input:#d1d9df` `--ring:#9aa4b0` `--destructive:#b03d3d` `--radius:.5rem`,
charts `#526bd8` / `#d18a3c` / `#b15c98`.

⚠️ **Size: ~350–450 lines of CSS, and that exceeds the ~120-line unit guide.** Named here rather
than discovered: the guide is about **LOGIC**, and this file contains none. **The seam that keeps it
one sitting is that it is organised by the sections the existing stylesheet already has** — tokens,
reset, type, the index, one report, buying — so the diff reads as a replacement per section rather
than as 450 new lines.

⚠️ `color-scheme: light` in the same commit. See D1.

**Proof.**
**LIVE** — every control that worked before still works, because no `.tsx` changed: the buy button on
`/report/<hash>`, the staking control on `/markets/6`, every link. `git diff --stat` shows **one
file**. `/`, `/report/<hash>`, `/markets`, `/markets/6`, `/holdings` are all visibly the new design.
**MARKED** — none.
**DO NOT PRESS** — the buy button, unless you want to spend; its *appearance* is what this unit
changed.
⚠️ **And one specific check: on a dark-mode device the page is light and the form controls and
scrollbars are light with it.** That is D1's whole mechanical half.

### Unit 4 · The fonts, and the licence

**In it:** whichever of §2's two lands. If it is the stack, this is four lines in `globals.css` and
no new files. If it is self-hosting, it is `public/fonts/`, two `@font-face` rules, `LICENSE`, and
`FONT-LICENSE.txt` served at a public URL.

⚠️ **Recommended: the stack.** ⚠️ **Not `next/font/local`** — see §2 for why it will not resolve
under `nodenext`.

**Proof.**
**LIVE** — headings render in a serif display face, body in a sans face. DevTools' Network panel shows
**no font request**. A rendered `h1` measured beside the reference's `h1` at the same width lands
within a few pixels.
**MARKED** — none.
**DO NOT PRESS** — nothing.

### Unit 5 · `app/ui/unbuilt.tsx` + `app/ui/price.tsx`

**The two contracts every later unit inherits.** §4 specifies `Unbuilt` entirely; `Price` is D2's
one file — atomic amount in, rail in, a rendered amount and ticker out.

⚠️ **Both are presentational and neither reads anything.** `Price` takes a string amount, never a
number — `AssetAmount.amount` is typed `string` because an atomic amount is exact and a float is not,
and `quotes.price_tinybars` comes back from the driver as a string for the same reason. **Do not
"fix" either end into a number.**

**Proof.**
**LIVE** — `Price` renders `0.001 HBAR` from `REPORT_PRICE_TINYBARS` and `1.01 USDC` from a pool's
18-dp wei, with no second formatter anywhere in the app.
**MARKED** — the first `Unbuilt` in the codebase: **Tab past it and focus skips it; click it and
nothing happens; a screen reader reads its label.** If any of those three is false the component is
wrong and every later unit inherits the fault.
**DO NOT PRESS** — nothing.

### Unit 6 · `app/ui/chrome.tsx` + `app/layout.tsx` — the nav and the footer

**In it:** a server-component `SiteHeader` and `SiteFooter`, and `layout.tsx` wraps `{children}` in
them. Four nav items (§3). The footer carries the wordmark, `/api/health`, and the network the site
is talking to.

⚠️ **`layout.tsx` imports nothing from `src/`** — §7.
⚠️ **Plain `<a href>`.** ⚠️ **"Connect wallet" is `Unbuilt`, not a button** — which is why Unit 5 comes
first. The header is the marker's first consumer, and shipping the nav before the marker exists would
mean either a header with a live-looking wallet button or a second commit to fix one element.

**Proof.**
**LIVE** — Reports → `/`. Markets → `/markets`, **reachable from the homepage for the first time**.
Holdings → `/holdings`, reachable without going through a tokenized report. Console → `/console`,
which now demands the secret. The current page's nav item is marked as current. `/api/health` still
200s.
**MARKED** — *Connect wallet* in the header, and the *Demo* toggle is **cut**, not marked — if it is
on screen at all, that is a bug.
**DO NOT PRESS** — nothing.
⚠️ **Expected and correct at this point:** `/`, `/markets` and `/holdings` are the old design under
the new header. Their units are 12, 14 and 13.

---

## The product, in the order it runs

### Unit 7 · The Graph, visible — `querySubgraph` and `buildEvidence` wired to the source panel

**The function:** `src/graph/client.ts::querySubgraph` and `src/graph/evidence.ts::buildEvidence`.
**The place:** the console's `.source-panel` and `.query-evidence` blocks.

⚠️ **This has the most substance behind it and no visual surface at all today.** 25 live deployments,
a document set per deployment, an `_meta` block on every query — and not one pixel of it anywhere in
the app. `buildEvidence`'s only caller is a demo script; this gives it a second one.

**In it:** `app/api/console/source/route.ts` (the one new route — see *Where the reordering hits a
real dependency*), gated by Unit 2, which takes a deployment and runs **one** live query, returning
the rows, the `_meta` block, the record count and the elapsed time. The panel lists the registry
server-side — that part is free and static — and the control reads one deployment live.

⚠️ **Tier `record`, not `record+raw`.** PHASE-4's evidence rule is *record by default, record+raw for
settlement-backing queries only, and the tier is set by the caller, never inferred.* A console panel
is not settlement-backing. Getting this wrong means storing raw payloads for a browser click.

⚠️ **Nothing is cached, and that is the property being shown.** `graph/client.ts` caches nothing on
purpose, so a figure in a report traces to a query that actually happened. The panel's *Retrieved*
timestamp is the point, not decoration.

⚠️ **"Source data" upload is `Unbuilt`.** The design's file row (`lending-protocols-q2-2026.pdf`) is
an upload and upload is not built.

**Proof.**
**LIVE** — *Read this deployment now*: fires one real subgraph query and the panel fills with the
subgraph slug, the deployment id, the `_meta` block number, the record count and a UTC retrieval
stamp. Press it twice and **the timestamp changes and the block may too** — that is the no-cache
property, visible. Choose a different deployment and the numbers change with it.
**MARKED** — *Source data* upload · the file row.
**DO NOT PRESS** — *Generate report* and *Tokenize*; neither is wired yet.
⚠️ **Costs `GRAPH_API_KEY` quota per press.** Not free, just cheap.

### Unit 8 · The agent, running — the pipeline streamed into the composer, terminal and status

**The function:** `compose → execute → narrate → validate → save`, through `/api/console/generate`.
**The place:** the `.atlas-composer`, the terminal, the `.agent-visual` status block, and the
`.query-evidence` panel Unit 7 just built.

⚠️ **The machine already works and it already streams.** `/api/console/generate` runs the same
sequence `scripts/ops/report.ts` runs and emits **NDJSON** — one JSON object per line, nine stages,
each carrying elapsed milliseconds. `app/console/generate.tsx` already reads it line by line and
already reports a stream that ends without a `done` event as a truncation rather than as a finish.
**What this unit adds is the surface, not the pipeline.**

#### ⚠️ What 34–47 seconds against a real 60-second ceiling means for streaming

A routine generation measures **34.0 s and 46.7 s**. `/api/console/generate` declares
`maxDuration = 300` and **gets 60** — Hobby clamps silently, no build warning, deployment READY
carrying 60. So a 46.7-second run has **13.3 seconds of headroom** and the arithmetic in that route's
own header, which reasons from a 300-second ceiling and a 240,000 ms `execute` budget, is wrong by a
factor of four. ⚠️ **`execute`'s budget can never fire on this plan.** The platform kills first.

**What follows, and it is not what people expect:**

- ⚠️ **Streaming is what makes the ceiling survivable, not what breaks on it.** Under a plain POST a
  kill at 60 s is a dead request and nothing on screen. With NDJSON every stage up to the kill is
  already rendered, and the client can say *the function was killed, nothing was saved* — which is
  true, because `save()` is the last step.
- ⚠️ **Nothing may wait for completion before showing anything.** No spinner-then-result. The
  terminal, the stage chips and the evidence panel all fill as events arrive.
- ⚠️ **There is no resume and none can be built here.** A killed run saved nothing; the model tokens
  are spent and no report exists. The surface says exactly that and does not offer a retry that
  implies otherwise.
- **The one correction this unit must make:** `maxDuration` on that route goes from 300 to 60, and
  the header's arithmetic block is rewritten to the real ceiling. It is becoming product.

**In it:** the terminal on the existing `terminal.tsx` line model — ⚠️ **structured lines with an
elapsed stamp, a stage and a message, not a pretty-printed object in a `<pre>`.** That model is what
makes a fifty-second run legible while it is running and it is kept.

⚠️ **Every figure in the evidence panel comes off the stream, not off a second query.** The `execute`
event already carries `queries`, `block` and `timings`; `save` carries `facts`, `hash`, `block`,
`markdownChars` and `contextDigest`. **A panel that fetched its own copy would be showing a different
run than the terminal beside it** — and after Unit 7 there is a route it could wrongly call, which
makes this warning load-bearing rather than theoretical.

⚠️ **The composer sends a directive. It is not a chat and must not look like one.** There is no
conversation model, no history, no follow-up turn. One directive, one run. A chat transcript UI would
promise a thing that does not exist — and `compose` returning a `clarification` outcome is a *stop*,
not a reply.

**Proof.**
**LIVE** — type a directive, press *Generate report*: the terminal fills stage by stage with real
elapsed stamps — `limits`, `context`, `compose`, `execute`, `narrate`, `validate`, `save`, `done` —
the status chips advance beside it, the evidence panel fills from the same events, and it ends with a
hash that resolves at `/report/<hash>` a moment later. ⚠️ **Watch the elapsed column, not just the
end** — that is where the 60-second question gets answered.
**MARKED** — *Source data* upload.
**DO NOT PRESS** — *Tokenize*; not wired yet.
⚠️ **One generation, and make the directive a narrow one.** A wide plan is the thing that runs past
60 seconds, and a killed run costs model tokens and saves nothing.

### Unit 9 · The report as a document — `render()` and `markdown.tsx` wired to the paper

**The function:** `agent/narrate.ts::render` and `app/markdown.tsx`.
**The place:** the console's `.document-stage` — `.report-paper`, `.paper-masthead`, `.paper-byline`,
`.financial-table`, `.paper-footer`, and the pager.

⚠️ **Built here, used twice.** This is the same paper the bought report renders into on
`/report/[hash]` in Unit 11. **So `.report-paper` and `.financial-table` go in `globals.css`, not in
`console.css`** — §1's *check at the second consumer* rule is pre-empted knowingly, because both
consumers are already known.

⚠️ **It renders with `app/markdown.tsx`, the product's own renderer, and never a second one.** That
component is the escaping boundary for indexer-supplied market names and token symbols — they cannot
be escaped on write because the stored bytes are the hashed bytes, so escaping happens there, at the
last possible moment, by producing React elements rather than an HTML string. **There is no
`dangerouslySetInnerHTML` anywhere in this app and this unit does not introduce one.**

⚠️ **The byline reads the real analyst id and the real hash.** The reference's paper says
*"PREPARED BY ATLAS RESEARCH · DEMO DATA"* and that string is baked into its design. It goes.

⚠️ **The provenance banner is not decoration and it survives.** A body obtained by paying and a body
obtained by walking around the paywall look identical — same `render()` call — so the pane says which
one you are looking at. That label is what stops a reader assuming a payment happened.

**Proof.**
**LIVE** — pick a report in the console: the paper renders with its masthead, the real analyst and
hash in the byline, the market table in `.financial-table`, and the pager moving through it. Generate
a new report (Unit 8) and **it lands in the paper without a reload**. The provenance banner says
which door the body came through.
**MARKED** — *Source data* upload · *Edit paragraph* and *Add note* from the reference's edit
toolbar — ⚠️ there are no per-paragraph anchors and no editing path, so both are marked, not drawn
live.
**DO NOT PRESS** — *Tokenize*.

### Unit 10 · Tokenization — `tokenize/ats.ts` wired to the publish steps, below on the same page

**The function:** `src/tokenize/ats.ts` through `/api/console/tokenize`, gated by Unit 2.
**The place:** the `.tokenize-section` directly beneath the workspace — `.publish-steps`, the listing
form, the `HEDERA / TOKENIZATION RECEIPT` block and the marketplace preview.

⚠️ **The two-click confirm stays and stays server-side.** Plan posts without `confirm` and the route
sends nothing; the spend button arms only after a plan returns and disarms the moment any input
changes. ⚠️ **The `disabled` attribute is the convenience half; the control is the route ignoring
everything without `confirm: true`.** A redesign that moves the confirm into the client removes the
control and keeps the decoration.

⚠️ **The Access-price field is `Price` at the one constant, not an editable field.** Per-report
pricing is not built (D2) and an input that accepts a number the system then ignores is worse than no
input. Shown, marked.

⚠️ **"Related market" is display, not a picker.** A market cites a report through
`claims.report_hash`, written by the analyst's commit path; nothing here can create that tie.

⚠️ **"Upload your report" in the source options is `Unbuilt`.** `reports.canonical_json` is the hashed
identity and an uploaded PDF has no canonical form this pipeline can produce.

**Proof.**
**LIVE** — pick an untokenized report, press *Plan*: the three steps advance and a plan comes back
with nothing sent. Then press *Tokenize*: the receipt block fills with a real ISIN, proxy address and
creation transaction, and the same ISIN appears on `/` and the same proxy on `/holdings`. ⚠️ **Change
any input after planning and the spend button disarms** — check that, it is the control.
**MARKED** — *Upload your report* · the Access-price field · *Related market* · the *Publish a
report* CTA.
**DO NOT PRESS** — twice. ⚠️ **This spends real testnet HBAR and mints a permanent asset. One report,
and pick one no market cites.**

### Unit 11 · Payments — the gate wired to `/report/[hash]`

**The function:** `payments/gate.ts` behind `/api/reports/[hash]`, and the buyer agent behind
`/api/buy` (moved in Unit 1).
**The place:** `/report/[hash]` — the identity panel, the five coverage counts, `.locked-preview`,
`.purchase-bar`, and the paper from Unit 9 as the unlocked body.

⚠️ **THE PAYWALL IS THE PRODUCT BOUNDARY AND THIS UNIT TOUCHES BOTH SIDES OF IT.** The page
**deliberately never calls `render()`**; `sections`, `assessment`, `facts`, `checks` and `provenance`
are read server-side and never reach the response. ⚠️ **A CSS-hidden table is not a paywall** — if
this unit ever renders the body and hides it, the gate is gone and every settled payment stops
proving anything.

⚠️ **The three honest sentences on this page are copy, not decoration, and none of them is cut:**
*an agent pays, not you* · *x402 has no Hedera paywall for browsers* · *this read is not saved, there
is no sign-in*. The reference has no equivalent and would happily imply all three opposites.

⚠️ **Half the orphan CSS is already de-risked** — Unit 9 proved `.report-paper` and
`.financial-table` on the console. What is untried here is `.locked-preview` and `.purchase-bar`.

**Proof.**
**LIVE** — open `/report/<hash>` unpaid: directive, analyst, block, full hash, five coverage counts,
price through `Price`, and a locked body. ⚠️ **Then `curl` that URL and grep the served HTML for a
known figure from the paid body — find nothing.** That probe has run on every change to this page and
this is the largest change it has had. Then press *Have the agent buy this report*: a real settlement,
a HashScan link, and the body renders **into Unit 9's paper**.
**MARKED** — nothing new on this page; the honest sentences are copy, not markers.
**DO NOT PRESS** — the buy button, until the grep is done. ⚠️ **The grep is the proof; the purchase is
the demonstration.**

### Unit 12 · The market — `list()` and `tokensFor()` wired to `/`

**The function:** `store/reports.ts::list` plus one batched `store/tokens.ts::tokensFor`.
**The place:** `/` — the card grid.

⚠️ **No API route, and none should be added** — `app/page.tsx`'s header argues it and it still holds:
a route here would be a second copy of `list()` behind a fetch the server makes to itself.

⚠️ **One query for the page, not one per row.** `tokensFor` takes every hash at once, and that matters
more once the grid is long.

⚠️ **The full hash stays on the card.** It is the value a token commits and a reader who cannot copy
it cannot check anything. The reference's card has nowhere for 64 hex characters and it needs one.

**Proof.**
**LIVE** — 11 cards, newest first. 4 carry an ISIN chip and link through to HashScan; 7 read *Not
tokenized* and look deliberate rather than faded. Every card links to its preview, and the report
tokenized in Unit 10 is one of the four. Every price comes through `Price`.
**MARKED** — search · the category filter chips · *My reports* · *Publish a report*.
**DO NOT PRESS** — nothing on this page spends; ⚠️ **and if an *Unlock* button appears here, that is a
bug** — D5's card carries one link, not two.

### Unit 13 · Holdings — `balanceOf` wired to `/holdings`

**The function:** `balanceOf` on chain, through `/api/holdings`.
**The place:** `/holdings` — the inventory table.

⚠️ **Still a shell** — the page imports no `src/` module and `Inventory` fetches `/api/holdings` at
runtime, so `ethers` and the RPC client stay in the route. That property is the unit's constraint, not
an accident.

⚠️ **The chain is the authority, never `report_tokens.transfer_tx`.** The column records what we last
sent; the balance records what is. A token can also be sent somewhere neither account controls, which
the column cannot express and a balance read shows as held by neither.

**Proof.**
**LIVE** — 4 tokens across 2 accounts, each balance read with `balanceOf` at request time. Every row
links to its report and to HashScan. The page still says in words that where the chain and our record
disagree the chain is right.
**MARKED** — none.
**DO NOT PRESS** — nothing; this page has no controls that write.

### Unit 14 · The prediction market — the batched pool read wired to `/markets`

**The function:** one SQL `LEFT JOIN` across markets/claims/reports/scores, and **one batched
`eth_call`** — `ethers`' `JsonRpcProvider` coalesces calls made in one tick, so `Promise.all` over N
markets is one HTTP request rather than N.
**The place:** `/markets` — the card, the three sections, the record strip.

⚠️ **Pools come from the CHAIN, never from `stakes`.** The table records what we were told about; the
contract records what it holds, and only one of those is the money.

⚠️ **The rehearsal test is `observation_end <= created_at`** — arithmetic on the row, not a naming
convention — and it appears in three files already. This unit does not touch it and does not move it.

⚠️ **Each read is individually caught**, so one unreadable market leaves the rest of the page standing
and renders as *Pool unavailable*, never as `0`.

**Proof.**
**LIVE** — 2 forecasts, 4 rehearsals, 2 off-chain, each under its own heading with its own
explanation, and the rehearsal section visibly quieter than the forecast one. Live pools in USDC on
every on-chain card. Every card links through to its market and to the report behind its claim.
**MARKED** — *My positions* · the category filter · the per-card sparkline slot.
**DO NOT PRESS** — nothing on this page spends.
⚠️ **Read the record strip and check it looks deliberate.** It says *"no forecast has settled yet"*
because `scores` has 0 rows, and that sentence is what ships unless Sunday's cron fires first.

### Unit 15 · One market — `stake(marketId, claimId)` wired to `/markets/[id]`

**The function:** a browser wallet sending `stake(marketId, claimId)` on Arc, then
`/api/markets/[id]/refresh` recording it from the `Staked` event.
**The place:** `/markets/[id]` — the pool bar in the chart panel's slot, the `SIDE / POOL / SHARE`
table, the position panel, the landmark timeline, the score block, the recorded-stakes table.

⚠️ **`stake.tsx` is untouched in behaviour.** Its props, its server-encoded calldata, its exact
`BigInt` wei arithmetic, its four pre-flight refusals (`ZeroStake`, `NotAUsdcUnit`, `OverStakeCap`,
malformed input) and its post-then-reconcile discipline all stay exactly as they are. **This unit
restyles its markup and nothing else.**

⚠️ **No side control. No `ACTION` column. No third outcome.** D3 and D4.
⚠️ **The pool bar is labelled, not drawn as a race** — §5.
⚠️ **A rehearsal must never read as a forecast** — the warning block stays and stays prominent.
⚠️ **A void is an absence of an outcome, never a wrong answer**, and the score block renders absent
values as absent, never as zero. *Not collected yet* is not `0.00 USDC`: the contract is pull-based
and a resolved market can still hold the money.

⚠️ **This is the only browser-signed transaction in the project** and the nearest page argues the
opposite case — `buy.tsx` says *an agent pays, the visitor does not*. Both are true and the two pages
must not blur into each other.

**Proof.**
**LIVE** — `/markets/6`: the 1.01 USDC pool as a bar **labelled one-sided**, the human stake in the
recorded table linking to arcscan, the backing report linked by directive with its full hash, the
landmark timeline, and the staking control in the new styling. *Connect wallet and stake* opens the
wallet and asks to switch to Arc. ⚠️ **Stop there.** `/markets/7`, `/8`, `/9`, `/10` all 200;
`/markets/1` and `/markets/999` 404.
**MARKED** — the 1D/1W/1M/All range buttons · the potential-payout estimate · *My positions*.
⚠️ **CUT, and their presence is a bug:** an Outcome select, a *Back* button on any row, a third
outcome, *Attach supporting report*.
**DO NOT PRESS** — ⚠️ **do not complete a stake.** Markets 6 and 7 carry real stakes including one
from a human wallet. Opening the wallet proves the wiring; signing spends.

### Unit 15b · The two ledgers — one hash in two places

**The function:** `store/tokens.ts::tokenFor` and the claims-to-markets join.
**The place:** the `This report on two ledgers` panel on `/report/[hash]`.

⚠️ **After Unit 14, because it links into `/markets/[id]`** and reads as a dead end until that page is
finished.

⚠️ **The hash is never abbreviated, in any of its three appearances.** All three print the same full
64 hex characters in the same monospace — *the reader's own eye comparing two complete strings is the
entire mechanism.* A design that truncates them to fit a card destroys the only thing this panel
does.

⚠️ **The disclaimer comes first**, before anything that could be mistaken for an integration. There
is no bridge, no oracle and no cross-chain message, and none is being built — Hedera testnet has a
LayerZero endpoint and **Arc is not on LayerZero's deployed list at all**. The panel says so above
anything else.

⚠️ **It renders nothing at all when a report has neither a token nor a market**, which is most of
them. A heading over two "not yet" lines is worse than no heading.

**Proof.**
**LIVE** — on a report that is both tokenized and claimed, the `alpha:<hash>` string, the `0x<hash>`
parameter and the bare hash are **visibly the same 64 characters**, side by side. HashScan resolves
the token; arcscan resolves the commit transaction and the contract. On a report with neither, the
panel is absent — not empty, absent.
**MARKED** — none.
**DO NOT PRESS** — nothing.

---

## Close

### Unit 16 · Deletions, and the `app/README.md` correction. ⚠️ **Last, not first.**

**In it:** `app/api/probe/` goes — it answered its question, it is still deployed, and it advertises a
payment challenge. `app/api/console/buy` is already gone (Unit 1). Whatever of
`app/api/console/{accounts,transfer,report}` the rebuilt console does not use goes with it.

⚠️ **`/api/console/{source,generate,tokenize,state}` STAY.** They are the console's machine and the
console is product now. They are gated (Unit 2) and their `maxDuration` is corrected.

⚠️ **The spend surface that does not survive:** `transfer`, `accounts`, and the console's buy control.
The design's console has two actions — *Generate report* and *Tokenize* — and that is the right two.
A public page offering "send this security to that address" from a server-held key is not a thing to
ship.

**The README sentence.** `app/README.md` says *"`rm -r app/console app/api/console` is the whole
removal"* and lists `/console` under **Throwaway, deleted before submission**. Both are false after
this phase. The file's *"Which routes are product and which are scaffolding"* section is rewritten.

**Proof.**
**LIVE** — `/report/<hash>`'s buy button still settles a real payment. `/console`'s generate, source
and tokenize controls all still work. `next build` passes, and ⚠️ **the `prebuild` contract check
still passes** — no unit in this phase touches `src/arc/abi.ts` or `contracts/AlphaMarket.sol`, and if
one ever does the build refuses until `npm run build:contract` is re-run and the artifact committed.
**MARKED** — unchanged from earlier units.
**DO NOT PRESS** — ⚠️ **`/api/probe` should 404. If it answers, the deletion did not deploy.**

### Unit 17 · PLAY GAP — walk it as a stranger

⚠️ **Not a checklist. Open `/` cold and try to understand what this is, what it sells, and why the
numbers can be trusted, without opening a file.**

Specifically watch for: a page where the marked-unbuilt treatment reads as broken rather than as
honest · a rehearsal that reads as a forecast · a one-sided pool bar that reads as a landslide · any
page whose empty state looks like a failure · anything that implies a wallet is connected · and
⚠️ **the paywall, probed once more at the end**, because it has been probed on every change to that
page and this phase is the largest set of changes it has had.

**And one walk the sequence itself earns:** ⚠️ **go through the product in the order the units built
it** — read a deployment on the console, generate a report, watch it become a document, tokenize it,
find it on `/`, buy it, and follow its hash to Arc. **If every one of those works in that order, the
phase is done.** That walk is the demo.

---

## 7 · Vercel

**What does not change:** `vercel.json` entirely — the two cron entries stay as they are,
`0 22 * * *` and `0 2 * * *`. `next.config.ts` stays; `typescript.tsconfigPath` is what keeps the root
`tsconfig.json` intact and no unit here has any business near it. ⚠️ **Never edit the root
`tsconfig.json`** — NodeNext, and every import in `src/` and `scripts/` carries an explicit `.js`
extension.

**What changes:**

| | |
|---|---|
| **Functions** | ⚠️ **net fewer.** `/api/probe` and up to three console routes go; `/api/buy` is a move; **`/api/console/source` is the one addition** and it is the only route this phase adds. No page adds one — the reading surface is server-rendered and `app/page.tsx`'s argument against adding one still holds |
| **`maxDuration`** | ⚠️ **three routes are corrected from the fiction to the real ceiling.** `/api/buy` (Unit 1), `/api/console/generate` (Unit 8) and `/api/console/tokenize` (Unit 10) all declare 300 today and all get 60 |
| **Env** | **one new variable, `CONSOLE_SECRET`** — Vercel project env, Production, plus `.env.example`. ⚠️ **It takes effect on the next deployment, not the current one** |
| **Static assets** | ⚠️ **none, if §2's recommendation stands.** There is **no `public/` directory in this repo today** and the recommended font decision does not create one |

⚠️ **The one traced-size trap in the whole phase: `app/layout.tsx` is inherited by every route.**
Today it imports React and `./globals.css` and nothing else. The moment it imports anything from
`src/`, **every** route pays for it — `/` traces 1.70 MB, `/markets` 2.16 MB, and the Hedera SDK
routes 7.5–10 MB, and the difference is exactly this kind of import. **The rule: `layout.tsx` and
`app/ui/*` import nothing from `src/`.** If the nav ever wants a count badge, the count comes from
the page as a prop, not from the layout.

⚠️ **`.env` carries `ARC_RPC_URL` and `ARC_MARKET_ADDRESS` twice each** — lines 22–25. Both copies
are byte-identical today, so nothing is broken; the trap is that **editing the first copy would do
nothing** and the symptom would be a value that refuses to change. Worth one line of cleanup in
whichever unit next touches `.env`, alongside the `ARC_WALLET` deletion PHASE-4 already recorded.

⚠️ **Deploy after every unit, not at the end.** The whole premise of function order is pressing a
control and seeing an outcome, and half of these controls only tell the truth on Vercel — the 60-second
ceiling, the cron environment, the real facilitator. A unit that only works locally is not done.

---

## 8 · ⚠️ What cannot be decided without building, and which unit decides it

Five, and each is owned.

| # | | decided by |
|---|---|---|
| 1 | ⚠️ **Whether the orphan CSS is usable.** `.locked-preview`, `.purchase-bar`, `.unlocked-bar`, `.transaction-receipt`, `.report-paper` are defined in the stylesheet and drawn in **none** of the ten files. Whether they compose into a page nobody ever pictured is a thing you find out by trying | ⚠️ **split by the reordering, and that is an improvement.** **Unit 9** tries `.report-paper` and `.financial-table` on the console, where a failure costs one panel. **Unit 11** then tries `.locked-preview` and `.purchase-bar` on the page that matters, already knowing half the answer |
| 2 | **Whether the font stack is close enough.** §2's argument is that Nimbus is Helvetica and Times; the measurement is a rendered `h1` beside the reference's | **Unit 4** |
| 3 | **How many page-group stylesheets there actually are.** The rule is *two groups means globals*, checked when the second group needs it. The count falls out | **Units 7–15, cumulatively** |
| 4 | ⚠️ **Whether a full generation fits inside 60 seconds often enough to demo.** 34.0 s and 46.7 s are two measurements, not a distribution, and the second is 78% of the ceiling. If it does not, the answer is a narrower demo directive, not a longer timeout — the timeout is not ours to raise | **Unit 8**, and it is the unit's main risk |
| 5 | **Whether `/console`'s doorlock field belongs on the page or in a header the operator sets.** A field is friendlier and is one more thing on screen | **Unit 2** |

**Nothing else in this plan is open.** Where a thing is not built, D6 says whether it is marked or
cut; where a denomination is ambiguous, D2 says which rail; where the reference and the contract
disagree, the contract wins and D3 and D4 name the two cases.

---

## 9 · Cut order

⚠️ **Function order changes what cutting costs, and mostly for the better: every unit not reached is
a page in the old styling under the new nav, not a half-wired page.** Cut from the bottom.

⚠️ **Units 1 and 2 are not cuttable** — one keeps the paywall button working through a deletion, the
other keeps a public page from being a faucet.

| # | cut | what it costs |
|---|---|---|
| 1 | Unit 15b — the two ledgers | ⚠️ **expensive** — this is the cross-chain claim made checkable, and it is late only because it links into Unit 14's page |
| 2 | Unit 13 — `/holdings` | one product page in the old styling under the new nav |
| 3 | Unit 15 — the market page and the pool bar | `/markets/[id]` keeps its `dl` panels and loses its anchor; the stake still works |
| 4 | Unit 14 — `/markets` | ⚠️ **then Unit 15b goes too**, or it links into an unstyled page |
| 5 | Unit 12 — `/` | ⚠️ **the front door stays in Phase 3's design.** Visible on every visit, and the reason this one is cut fifth rather than second |
| 6 | Unit 10 — tokenization | the console keeps source and generate; tokenizing goes back to the CLI |
| — | ⚠️ **never cut** | Unit 3 (nothing later works without it) · Unit 5 (every page inherits both contracts) · Unit 6 (the nav is what makes this one product) · Unit 9 (Unit 11's body has nowhere to render) · Unit 11's paywall grep |

⚠️ **Units 7, 8, 9 and 11 are the demo.** Reading The Graph, generating a report, seeing it as a
document, and paying for it is the whole story end to end. Cutting any of them cuts the story, not
the polish — which is the argument for building them first and is why they sit above everything else
in this table.

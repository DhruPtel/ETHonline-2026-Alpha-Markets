# front-end-design — the design references, and what was taken from them

Ten HTML files that look like part of the application and are not. **Nothing in `app/` imports
anything here and nothing here runs.** They were generated separately as a mockup, exported from that
project, and stripped of its framework so they read as plain HTML and CSS. They are the spec the
shipped front end was built against, kept so a reviewer can compare.

`README.txt` beside this file is the exporter's own note, left as it arrived.

## The four screens, across ten files

| reference | what it specifies | what shipped |
|---|---|---|
| `console.html` | the agent workspace — document stage, terminal, query evidence | `app/console/` |
| `tokenization.html` | the tokenize flow — ⚠️ the same section `console.html` already carries, exported again | the section below the console |
| `reports.html` | the report marketplace | `app/page.tsx` |
| `prediction-*.html` ×6 | the market index and one market — six variants of two layouts | `app/markets/`, `app/markets/[id]/` |

⚠️ **Every value in them is placeholder.** `DEMO-lending-q2`, `DEMO-deploy-01`, "Atlas Research",
"RUN 042", `124,850 USDC vol.`, "12 reports", and `PREPARED BY ATLAS RESEARCH · DEMO DATA` show what a
field looks like. They are not data, and reading them as live values misreads the directory. The real
numbers are smaller by three orders of magnitude and the application shows them at that size.

## What was taken, and what was left

Line 3 of every file is **437,720 bytes and byte-identical across all ten**. It is three things:

- **~55 KB of design system** — 782 rules over 174 semantic classes. **Taken**, into `app/globals.css`.
- **~135 KB of compiled Tailwind v4 and shadcn plumbing.** Left. The shipped app has no framework and
  no CSS dependency.
- **~240 KB of base64 fonts.** Left, and deliberately.

⚠️ **The fonts are not served, and the reason is the licence.** `FONT-LICENSE.txt` is AGPL-3 with an
exception covering *"a Postscript or PDF file"* — it does not mention the web, and a web page is
neither, so shipping these faces would be plain AGPL-3 distribution of the application. They are
**Nimbus Roman and Nimbus Sans**, metric clones of Times and Helvetica, so a system font stack is the
design on nearly every machine at zero bytes and no licence exposure. That is what `globals.css` does.

## ⚠️ Where the application deliberately differs

Each of these is a decision, not an omission.

- **A side picker on staking, and a Back button per outcome row. Cut.** `stake(marketId, claimId)`
  takes no side — a staker joins the side of the claim they back, and the contract reads it off that
  claim. A toggle would let two people back opposite sides of one claim, and the claim would stop
  meaning anything. An Outcome select appearing anywhere is a bug.
- **Multi-outcome markets. Cut.** The contract is binary. Three outcomes is a different contract, not
  a frontend change.
- **Reports priced in USDC at six different prices.** There is **one** constant price, in HBAR: a
  USD-denominated price throws on testnet, and the USDC cutover belongs to mainnet and moves four
  things in one commit. ⚠️ USDC on the *market* pages is correct — Arc's native gas token is USDC at
  18 decimals. The same word means two rails on two screens.
- **Report upload. Not built.** A report's identity is the canonical form of its object, and an
  uploaded PDF has none.
- **A probability chart, volume figures, categories, search, "My positions", "Connect wallet".**
  **Marked as unbuilt in the application rather than faked** — shown, visibly inert, and labelled with
  what they would do. Nothing stores a probability series; there is one human stake in the database.

## ⚠️ What the application says that the references do not

Four things, each because showing them alike would be a lie:

- **Rehearsal versus forecast.** A market over an already-observed day is indistinguishable on chain
  from a real one. Nothing enforces the distinction but us, so the app labels it everywhere.
- **Void.** A day that could not be observed has no outcome. It is not a wrong answer.
- **Not on chain yet.** A market can exist in the store and never have landed.
- **Scores rendered absent, never zero.** Two of the three have no source today. "Not collected yet"
  is not `0.00 USDC`.

## ⚠️ One screen has no reference

**The report reading page** — the paywall, the locked preview and the bought document — is the screen
the whole x402 argument rests on, and the package does not contain it. What the reference stylesheet
*does* carry is its CSS, in two halves. **Four classes are defined here and drawn in none of the ten
files**: `.locked-preview`, `.purchase-bar`, `.unlocked-bar` and `.transaction-receipt`. The document
itself — `.report-paper`, `.paper-masthead`, `.paper-title`, `.paper-byline`, `.paper-footer` and
`.financial-table` — *is* drawn, in `console.html`'s document stage, and the same sheet is reused so
a bought report and a generated one are visibly the same artefact. `app/report/[hash]/` is composed
from both halves, and the layout around them was decided rather than copied.

The PNG in this directory is referenced by nothing and is not used.

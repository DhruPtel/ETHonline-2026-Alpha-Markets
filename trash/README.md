# trash — the first frontend, set aside on purpose

**Not abandoned work, and nothing runs it.** On 2026-09-12 the frontend built in Phase 5 was moved
here, so pages rebuilt directly from the design reference could take its place. It was moved rather
than deleted, and it is committed rather than ignored, so any part of it can come back with one `mv`.

Nothing outside this directory imports anything in it. That was checked in both directions before
the move, and `npx next build` passes with this directory untouched.

| path | what it was |
|---|---|
| `app/page.tsx` | The first report marketplace |
| `app/layout.tsx`, `app/globals.css` | The first root layout and design system |
| `app/report/[hash]/` | The first reading page: the preview, the buy button (`buy.tsx`) and a two-ledger panel (`ledgers.tsx`) |
| `app/markets/` | The first market index and market page, including the staking control `stake.tsx` |
| `app/console/` | The first agent workspace. Several files were already orphaned when they moved. |
| `app/holdings/` | Who holds each report token. That view is now part of `/analyst`. |
| `app/ui/` | The header and footer, plus two shared display components |
| `front-end-design/` | The ten-screen HTML design export the first frontend was built from |

## Why it is still here

- **Recovery is one move.** Paths mirror where each file came from, for example
  `mv trash/app/ui app/ui`.
- **Two pages were transcribed from the design, token for token:** `app/console/page.tsx` and
  `app/markets/[id]/page.tsx`. They are the most faithful record of the reference as first built.
- **`front-end-design/` holds four files that exist nowhere else:**
  - `FONT-LICENSE.txt`, the licence for the fonts embedded in the export (the app does not serve
    them);
  - the exporter's `README.txt`;
  - our `README.md` on what was taken from the export;
  - an unreferenced 1.4 MB image.

  The ten screens themselves are carried by `single-frontend/alpha-markets.html`.

⚠️ **Documents written before the move still name files here.** For example,
`docs/arc-deployment.md` names `app/markets/[id]/stake.tsx`. The live staking control is
`app/markets/[id]/PositionControl.tsx`.

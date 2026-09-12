# trash — set aside 2026-09-12, kept on purpose

**Nothing in here is abandoned code and nothing in here is dead by accident.** It is the frontend
that Phase 5 built between 2026-09-11 and 2026-09-12, moved out of the way so a Next app built
directly from the designs can take its place. It was **moved, never deleted**, and it is **committed
rather than gitignored**, because the point is that any of it can be brought back with a single `mv`.

⚠️ **`app/api/` was not touched and nothing here is imported by it.** That was checked before the
move, in both directions: no file under `app/api/` or `src/` imports anything below this directory.
The backend is exactly where it was.

## What is here

### `app/` — the replaced pages and their components

| path | what it was | why it is here |
|---|---|---|
| `page.tsx` | the report marketplace | rebuilt from the reference DOM, not transcribed |
| `layout.tsx` · `globals.css` | the root layout and the 928-line design system | the new app brings its own |
| `report/[hash]/` | the reading page — preview, paywall, ledgers | composed; ⚠️ **no reference screen exists for it**, so this is the only drawing of it we have |
| `markets/` | the market index and one market | ⚠️ `markets/[id]/page.tsx` was **transcribed verbatim** at 199/199 class tokens and then wired — the most faithful page in here |
| `console/` | the agent workspace | ⚠️ `console/page.tsx` was **transcribed verbatim** at 430/430 class tokens and then wired |
| `holdings/` | who holds each ATS security | composed; no reference screen exists for it either |
| `ui/` | `chrome.tsx` · `unbuilt.tsx` · `price.tsx` | the header/footer and the two contracts every page inherited |

⚠️ **Worth knowing before reusing any of it:**

- **The two transcribed pages are the ones worth reading.** `console/page.tsx` and
  `markets/[id]/page.tsx` came out of the reference markup mechanically and were checked against it
  token for token. The other pages were reconstructed from the DOM and drifted; that drift is why
  this directory exists.
- **`console/panel.tsx` was already orphaned when it moved here** — nothing imported it — and it was
  the only root of `console/spend.tsx`, `console/state.tsx` and `console/accounts.tsx`, with
  `console/document.tsx` hanging off those. 852 lines that no route reached.
- **`report/[hash]/page.tsx` is where the paywall lives.** It deliberately never calls `render()`,
  so the figures, the market table and the assessment are *not sent* rather than hidden. If any of
  that logic is rewritten rather than carried over, that property has to be re-proved.
- **`report/[hash]/buy.tsx` was the only live importer of `app/markdown.tsx`.** `markdown.tsx`
  **stayed** in `app/` — it is the escaping boundary, not a page — and currently has no importer
  until the new pages arrive.

### `front-end-design/` — the ten-file design reference

⚠️ **The ten HTML screens are fully carried by `single-frontend/alpha-markets.html`, which stays in
the repo.** That was verified before this directory was moved, not assumed:

```
CSS  line 3, all eleven files   md5 c29dab930c03e57769252b744fb1fd1f — byte-identical
markup  <main> class-token sequence, all ten routes   IDENTICAL, same length, same order
fonts   two base64 OTF payloads, identical byte lengths in both
```

⚠️ **But four things in here are NOT in `single-frontend/`, and this is the only copy of them:**

| file | what it is |
|---|---|
| `FONT-LICENSE.txt` | the AGPL-3-with-font-exception licence for Nimbus Roman / Nimbus Sans. **The app does not serve these fonts** — `globals.css` uses a system stack, so no obligation attaches — but this is the document that decision was made against |
| `README.txt` | the exporter's own note, left as it arrived |
| `README.md` | our account of what was taken from the package and what was deliberately left |
| `ChatGPT Image Sep 11, 2026, 02_50_41 PM.png` | 1.4 MB, unreferenced by anything |

The `*:Zone.Identifier` files are WSL download markers. They were already gitignored and untracked
before the move and they still are — they rode along with their directory rather than being
singled out.

## What did NOT come here

`single-frontend/` — the combined file the new pages are designed from and checked against.
`app/api/` — fourteen routes of backend. `app/markdown.tsx` and `app/README.md`. `src/`,
`contracts/`, `scripts/`, `tracking/`, and both migrations directories.

## Bringing something back

Every path mirrors where it came from, so recovery is the move in reverse:

```
mv trash/app/ui app/ui
mv trash/front-end-design front-end-design
```

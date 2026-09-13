# single-frontend — the design reference

**Not code.** One file: `alpha-markets.html` (about 626 KB). It is a self-contained HTML mock of the
product's screens: one stylesheet, the markup of each screen, and two embedded fonts.

The pages in `app/` were built from it and checked against it. Open it in a browser to see the
intended design. Nothing in it is wired to data.

## Why it is still here

It is the reference the frontend is measured against. When the earlier ten-file design export was
moved to `trash/`, this file was checked to carry all ten screens: the same CSS byte for byte, the
same class-token sequence in each screen's markup, and fonts of identical length. That check is
recorded in `trash/README.md`.

⚠️ **The app does not serve the embedded fonts.** `app/globals.css` uses system font stacks.

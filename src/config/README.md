# config — measurements, not settings

Five files that everything else reads and that read nothing themselves. ⚠️ **This directory imports
nothing from the rest of `src/` at runtime** — only type declarations, which erase at compile time —
which is why `store/`, `payments/`, `tokenize/`, the agent and the route handlers can all import it
with no possibility of a cycle. Keep it that way.

The interesting thing is what is in `protocols.ts`. It is not a settings file — it is **28 Ethereum
lending deployments, every field of which was read from a live subgraph** during the Phase 1 sweep.
25 answer today; the other three are recorded with why they do not.

That table is what makes the engine general. No rule anywhere tests a protocol by name — a zero token
price against a non-zero balance is a blocking data error on one deployment and entirely expected on
another, and the difference is a *measured* field in a row, not an `if (slug === …)`. **Adding a 29th
protocol is adding a row, not editing the adapter**, and that claim is only true because the quirks
live here.

## The rest

- **`analysts.ts`** — who publishes a report. One row today. Its Arc address is inside the report
  hash, so a typo there would hash perfectly cleanly and attribute a report to an address that can
  never claim it. ⚠️ That is why it is checked against the live Circle API by
  `scripts/ops/verify-analyst.ts` rather than trusted as a literal. It records addresses and
  deliberately never a balance.
- **`env.ts`** — one guard, and the reason it exists is a bug this project shipped five times.
  `process.env.X ?? fallback` returns `""` for a variable that is set-but-blank, because `??` falls
  back on `undefined` and never on the empty string — once producing a live payment challenge that
  advertised nobody to pay. Empty is missing, whitespace-only is missing, and the error names the
  variable. Callers may pass a hint; the Neon endpoint explanation is one, and it belongs to the
  database variables alone.
- **`pricing.ts`** — one price, in tinybars, as a string. ⚠️ Not a dollar amount: a `"$…"` price
  *throws* on HBAR, because the money-conversion table has no entry for it. USD pricing returns at
  the mainnet cutover.
- **`model.ts`** — which model this build calls. Its own file because an analyst's model and the
  platform default are two ideas that happen to share a value today.

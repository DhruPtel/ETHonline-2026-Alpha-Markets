# engine — the checking

Takes what the data layer produced and decides what can be stood behind. **Pure**: no network, no
model calls, every observation handed in.

## Read in this order

1. **`invariants.ts`** (114) — the checks, each with a severity and what it blocks. Rules are
   general; applicability comes from measured config, never from `if (slug === …)`.
2. **`reconcile.ts`** (226) — the verdict, and the one to read if you read one. Its header carries
   the measurement the whole engine rests on: aave-v3's revenue sides summed exactly on all 31 days
   measured while the total read $2.79e17 — so a source agreeing with *itself* can never prove a
   number right, and only an outside source can produce `ties_out`.

**Then:** `crosscheck.ts` (50) translates corroboration observations into findings — deliberately a
translator, not a second checker. `ops.ts` (118) is decimal arithmetic at 80 places, because a JS
number silently rounds figures carrying 23 decimals and those figures get hashed.

## Logic vs scaffolding

All four are logic; `crosscheck` is the thin one.

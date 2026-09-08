# types — the contracts

`report.ts` is the **published** shape: another team's analyst has to produce one of these for our
market to settle on it. `wire.ts` is the internal vocabulary this repo's own subsystems share.

## Read in this order

1. **`report.ts`** (369) — ⚠️ start here even if you read nothing else in the repo. It is written
   for someone who has never seen this codebase, and its header explains the whole design in five
   numbered rules: a report is an object not prose; money is a decimal string; unavailable is
   `null`, never an absent key; the token address is outside the hash; nothing is ever corrected.
2. **`wire.ts`** (144) — internal only. `Computed` is the engine's working view of a deployment,
   `Provenance` is where a figure came from.

## Logic vs scaffolding

All declarations, no logic. But `report.ts`'s comments carry more design reasoning than any code
file here — several of them record the measurement that forced the shape.

# engine — the checking

Takes what the data layer fetched and decides what can be stood behind. **Pure:** no network and no
model calls. Every observation is passed in.

| file | what it does |
|---|---|
| `invariants.ts` | The checks, each with a severity and what it blocks. Which checks apply to a deployment comes from measured config, never from its name. |
| `reconcile.ts` | The verdict. Read this one if you read one. |
| `crosscheck.ts` | Turns corroboration observations (subgraph against chain) into findings. It translates; it does not check a second time. |
| `ops.ts` | Decimal arithmetic at 80 places. A JS number silently rounds figures that carry 23 decimals, and those figures get hashed. |

## The measurement the verdict rests on

On all 31 days measured, aave-v3's revenue components summed exactly to the total, while that total
read $2.79e17. A source that agrees with itself cannot prove a number right. Only an outside source
can.

⚠️ **`Verdict.call` is nullable, and it is null on every report stored so far.** So the
"reconciliation quality" score recorded for a market claim (`src/arc/score.ts`) is blank on all of
them, and the site shows it as absent rather than as zero.

# types — the contracts

Declarations only, no logic.

| file | what it is |
|---|---|
| `report.ts` | **The published report shape.** Start here even if you read nothing else in the repo. Its header states the design in five rules: a report is an object, not prose; money is a decimal string; unavailable is `null`, never an absent key; the token address is outside the hash; nothing is ever corrected. |
| `wire.ts` | Internal vocabulary shared across `src/`. `Computed` is the engine's view of a deployment, and `Provenance` is where a figure came from. |

`report.ts` is written for a stranger. A second analyst whose reports were to be tokenized, sold and
staked here would have to produce exactly this object.

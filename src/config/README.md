# config — measurements, not settings

Five small files that the rest of `src/` reads. **This directory imports no other part of `src/` at
runtime**, so every layer can depend on it without a cycle. Its imports are one type-only import from
`types/`, a type-only import from `@x402/core` in `pricing.ts`, and `analysts.ts` reading `model.ts`
inside the directory.

| file | what it holds |
|---|---|
| `protocols.ts` | **28 Ethereum lending deployments on Messari's standardized schema.** Each row records measured facts about that deployment: subgraph id, schema version, whether revenue is usable, its quirks, and whether it answered. In the 2026-09-07 sweep, 25 answered, 2 had no indexers and 1 errored (`docs/protocol-inventory.md`). |
| `analysts.ts` | Who publishes: **one analyst row**, with its Arc address (the Circle wallet), Hedera account and Hedera EVM address. The Arc address is inside every report hash. |
| `pricing.ts` | One price: `100000` tinybars (0.001 HBAR) per read |
| `model.ts` | The model the pipeline calls: `claude-sonnet-5` |
| `env.ts` | `requiredEnv()`, the one guard for environment variables |

## Why it matters

- **The engine has no protocol-specific branches.** A zero token price against a non-zero balance
  is a blocking data error on one deployment and expected on another. The difference lives in a
  measured field in `protocols.ts`, never in an `if (slug === …)`. That is what makes **a new
  deployment a new row**, and it is the standardized-schema claim in practice (The Graph track).
- **An empty environment variable is a missing one.** `process.env.X ?? fallback` returns `""` for a
  variable that is set but blank. This project shipped that bug more than once, including a live
  payment challenge that named nobody to pay. `requiredEnv()` treats empty and whitespace as missing
  and names the variable.
- **`analysts.ts` is checked, not trusted.** `scripts/ops/verify-analyst.ts` asserts it against the
  live Circle API and Mirror Node. A fork must replace this row with its own accounts before
  generating reports it intends to tokenize, sell or stake. Multiple analysts are the next step and
  do not exist yet.

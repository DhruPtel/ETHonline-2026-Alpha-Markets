# Protocol inventory

Every Ethereum lending deployment in `src/config/protocols.ts`, measured rather than asserted.
**Swept 2026-09-07**, chain head 25922121. Every figure below came from a live query to The
Graph's decentralized gateway through `src/graph/client.ts` — no cache, no fixture, no local index.
Deployments are the 27 Ethereum `lending` entries in Messari's `deployment.json` that are both
`status: prod` and have a published query-id, plus morpho-blue, which Morpho publish themselves on
Messari's standardized template.

Regenerate with `npx tsx --env-file=.env scripts/sweep-protocols.ts --inventory`.

## Summary

**25 of 28 answered.** 2 lagging more than an hour. 0 returned nulls where figures were expected.

Live schema versions: `3.1.0` × 9 · `2.0.1` × 9 · `1.3.0` × 3 · `3.0.1` × 3 · `3.0.0` × 1

## All 28 deployments, by deposits

| deployment | schema | deposits | borrows | lag | status |
|---|---|---:|---:|---:|---|
| `aave-v3-ethereum` | 3.1.0 | $24.82B | $10.03B | 0m | live |
| `morpho-blue` | 3.0.0 | $13.09B | $11.42B | 2m | live |
| `spark-lend-ethereum` | 3.1.0 | $6.63B | $2.09B | 0m | live |
| `rari-fuse-ethereum` | 2.0.1 | $5.64B | $7.01B | 4.4h | live |
| `makerdao-ethereum` | 2.0.1 | $5.02B | $364.4M | 0m | live |
| `compound-v3-ethereum` | 3.1.0 | $1.89B | $579.9M | 0m | live |
| `liquity-ethereum` | 2.0.1 | $190.4M | $26.4M | 0m | live |
| `euler-finance-ethereum` | 1.3.0 | $188.1M | $175.9M | 0m | live |
| `iron-bank-ethereum` | 2.0.1 | $123.4M | $111.4M | 0m | live |
| `compound-v2-ethereum` | 2.0.1 | $117.4M | $12.1M | 0m | live |
| `goldfinch-ethereum` | 2.0.1 | $106.6M | $100.3M | 4.4h | live |
| `aave-v2-ethereum` | 3.1.0 | $97.6M | $14.0M | 0m | live |
| `maple-finance-v2-ethereum` | 3.0.1 | $8.3M | $0.0M | 0m | live |
| `truefi-ethereum` | 2.0.1 | $7.7M | $14.4M | 0m | live |
| `dforce-ethereum` | 2.0.1 | $7.1M | $0.5M | 0m | live |
| `aave-amm-ethereum` | 3.1.0 | $0.7M | $0.0M | 0m | live |
| `uwu-lend-ethereum` | 3.1.0 | $0.5M | $0.0M | 0m | live |
| `qidao-ethereum` | 1.3.0 | $0.2M | $0.2M | 0m | live |
| `morpho-aave-v2-ethereum` | 3.0.1 | $0.1M | $0.0M | 0m | live |
| `aave-arc-ethereum` | 3.1.0 | $0.1M | $0.0M | 0m | live |
| `morpho-aave-v3-ethereum` | 3.0.1 | $0.0M | $0.0M | 0m | live |
| `aave-rwa-ethereum` | 3.1.0 | $0.0M | $0.0M | 0m | live |
| `maple-finance-v1-ethereum` | 1.3.0 | $0.0M | $0.0M | 0m | live |
| `cream-finance-ethereum` | 2.0.1 | $0.0M | $0.0M | 0m | live |
| `zerolend-ethereum` | 3.1.0 | $0.0M | $0.0M | 0m | live |
| `abracadabra-ethereum` | — | — | — | — | no_indexers |
| `inverse-finance-ethereum` | — | — | — | — | error |
| `morpho-compound-ethereum` | — | — | — | — | no_indexers |

## Open questions for triage

Surfaced by the sweep and **not judged here** — the sweep asks who answers and what they say;
deciding what the numbers mean is triage.

**1.** **3 deployments report more borrowed than deposited.** Borrows exceeding deposits is PLAN-v4 §5.13's own worked example of a `SIGNAL` — the kind of finding a report exists to surface rather than a number to suppress. Either these are real findings about the protocols or they are broken mappings, and the difference decides whether each belongs in a report or in a bug list.

- `rari-fuse-ethereum` — $7.01B borrowed against $5.64B deposited (rank 4 of 28 by size)
- `truefi-ethereum` — $14.4M borrowed against $7.7M deposited (rank 14 of 28 by size)
- `maple-finance-v1-ethereum` — $0.0M borrowed against $0.0M deposited (rank 23 of 28 by size)

**2.** **`spark-lend-ethereum` is ranked 3 of 28 by deposits** at $6.63B. PLAN-v4 §5.18 excludes it on curation signal — 1.0 GRT against a recommended 3,000 — not on size. The exclusion may still be right; this records what it costs.

**3.** **Two deployments are lagging at the *same* block.** `rari-fuse-ethereum` and `goldfinch-ethereum` are both at block 25920801 — one stale indexer serving both, not two independent lags. Whether a single indexer failing can stall an unrelated pair of deployments matters for how the common-block rule is written.

**4.** **10 deployments hold under $1M.** They answer, they are well-formed, and there is nothing in them. The inventory is 28 rows; the *usable* universe is much smaller, and a comparison that silently includes an empty deployment is misleading in a way no invariant catches.

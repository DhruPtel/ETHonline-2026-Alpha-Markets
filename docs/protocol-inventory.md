# Protocol inventory

Every Ethereum lending deployment in `src/config/protocols.ts`, measured rather than asserted.
**Swept 2026-09-07**, chain head 25922158. Every figure below came from a live query to The
Graph's decentralized gateway through `src/graph/client.ts` — no cache, no fixture, no local index.
Deployments are the 27 Ethereum `lending` entries in Messari's `deployment.json` that are both
`status: prod` and have a published query-id, plus morpho-blue, which Morpho publish themselves on
Messari's standardized template.

Regenerate with `npx tsx --env-file=.env scripts/sweep-protocols.ts --inventory`.

## Summary

**25 of 28 answered.** 2 lagging more than an hour. 0 returned nulls where figures were expected.

Live schema versions: `3.1.0` × 9 · `2.0.1` × 9 · `1.3.0` × 3 · `3.0.1` × 3 · `3.0.0` × 1

## All 28 deployments, by deposits

| deployment | schema | type | deposits | borrows | lag | status | verdict |
|---|---|---|---:|---:|---:|---|---|
| `aave-v3-ethereum` | 3.1.0 | POOLED | $24.82B | $10.03B | 0m | live | ⚠️ flagged |
| `morpho-blue` | 3.0.0 | POOLED | $13.09B | $11.42B | 0m | live | ⛔ unusable |
| `spark-lend-ethereum` | 3.1.0 | POOLED | $6.63B | $2.09B | 0m | live | ⚠️ flagged |
| `rari-fuse-ethereum` | 2.0.1 | POOLED | $5.64B | $7.01B | 4.5h | live | ⛔ unusable |
| `makerdao-ethereum` | 2.0.1 | CDP | $5.02B | $364.4M | 0m | live | ⚠️ flagged |
| `compound-v3-ethereum` | 3.1.0 | POOLED | $1.89B | $579.9M | 0m | live | ✅ publishable |
| `liquity-ethereum` | 2.0.1 | CDP | $190.4M | $26.4M | 0m | live | ⚠️ flagged |
| `euler-finance-ethereum` | 1.3.0 | POOLED | $188.1M | $175.9M | 0m | live | ⛔ unusable |
| `iron-bank-ethereum` | 2.0.1 | POOLED | $123.4M | $111.4M | 0m | live | ⛔ unusable |
| `compound-v2-ethereum` | 2.0.1 | POOLED | $117.4M | $12.1M | 0m | live | ✅ publishable |
| `goldfinch-ethereum` | 2.0.1 | POOLED | $106.6M | $100.3M | 4.5h | live | ⛔ unusable |
| `aave-v2-ethereum` | 3.1.0 | POOLED | $97.6M | $14.0M | 0m | live | ✅ publishable |
| `maple-finance-v2-ethereum` | 3.0.1 | POOLED | $8.3M | $0.0M | 0m | live | ⛔ unusable |
| `truefi-ethereum` | 2.0.1 | POOLED | $7.7M | $14.4M | 0m | live | ⛔ unusable |
| `dforce-ethereum` | 2.0.1 | POOLED | $7.1M | $0.5M | 0m | live | ⛔ unusable |
| `aave-amm-ethereum` | 3.1.0 | POOLED | $0.7M | $0.0M | 0m | live | ⚠️ flagged |
| `uwu-lend-ethereum` | 3.1.0 | POOLED | $0.5M | $0.0M | 0m | live | ⚠️ flagged |
| `qidao-ethereum` | 1.3.0 | CDP | $0.2M | $0.2M | 0m | live | ⚠️ flagged |
| `morpho-aave-v2-ethereum` | 3.0.1 | POOLED | $0.1M | $0.0M | 0m | live | ⚠️ flagged |
| `aave-arc-ethereum` | 3.1.0 | POOLED | $0.1M | $0.0M | 0m | live | ⚠️ flagged |
| `morpho-aave-v3-ethereum` | 3.0.1 | POOLED | $0.0M | $0.0M | 0m | live | ⚠️ flagged |
| `aave-rwa-ethereum` | 3.1.0 | POOLED | $0.0M | $0.0M | 0m | live | ⚠️ flagged |
| `maple-finance-v1-ethereum` | 1.3.0 | POOLED | $0.0M | $0.0M | 0m | live | ⛔ unusable |
| `cream-finance-ethereum` | 2.0.1 | POOLED | $0.0M | $0.0M | 0m | live | ⛔ unusable |
| `zerolend-ethereum` | 3.1.0 | POOLED | $0.0M | $0.0M | 0m | live | ⛔ unusable |
| `abracadabra-ethereum` | — | — | — | — | — | no_indexers | — |
| `inverse-finance-ethereum` | — | — | — | — | — | error | — |
| `morpho-compound-ethereum` | — | — | — | — | — | no_indexers | — |

## Verdicts

`status` asks whether a deployment **answers**. The verdict asks whether it is **right** — a
different question, and the one that decides what can carry a report. Produced by
`scripts/triage-protocols.ts`, which reconciles deposits − borrows against DefiLlama as an external
reference, checks that borrows do not exceed deposits, asks for daily history over a recent window,
and records whether revenue is plausible, absurd or zero.

- **publishable** — 3
- **flagged** — 11
- **unusable** — 11

⚠️ **Revenue is deferred out of Phase 1 and gated by `RevenueAvailability`, so a deployment flagged
only on revenue can still carry a balance report.** On that basis **5 deployments are usable today**:
the three `publishable` rows plus `aave-v3-ethereum` and `spark-lend-ethereum`, whose balances
reconcile to within 5% and whose only fault is a poisoned revenue accumulator.

⚠️ **A percentage gap against a near-zero external reference reads larger than it is.** Where
DefiLlama reports under $1M the gap is computed against a $1M floor, so figures like "1218%" mean
"our subgraph says millions and the reference says roughly nothing" rather than a precise ratio. The
direction is the finding; the magnitude is not.

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

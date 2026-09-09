# graph — the data layer

Every number in the system enters through here. It reads Messari-standard lending subgraphs from
The Graph's decentralised gateway, and decides how far each figure can be trusted before anything
downstream sees it.

## Read in this order

1. **`client.ts`** (300) — everything stands on it, including Phase 4 settlement. Queries one
   deployment or many, and turns gateway failures into decisions: `PRUNED` and `LAGGING` come back
   as the *same message*, so the discriminator is arithmetic inside it.
2. **`queries/index.ts`** (32) — the document menu, plus the catalogue the planner reads. The agent
   picks a document; it never writes GraphQL.
3. **`adapter.ts`** (154) — the trust layer. It annotates and never adjusts; the header explains why
   it is not the renaming layer it was designed to be.
4. **`corroborate.ts`** (130) — reads the chain at the block the subgraph *wrote* the value. The
   only source outside the mapping code.

**Then as needed:** `blockwindow.ts` (one block the whole set can answer at, or a refusal) ·
`paginate.ts` (walks a population and says honestly whether it finished) · `evidence.ts` (a
traceable query record — ⚠️ built in Phase 1, not yet wired into the report path).

## Logic vs scaffolding

Logic is `client`, `adapter`, `corroborate`. The three `queries/*.ts` are GraphQL strings whose
comments record which fields survive all five live schema versions — skim them.

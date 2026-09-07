# scripts

**`ask.ts`** — ask the agent a question and watch it work. The one you actually run.

**`demo/`** — one proof per build unit, each demonstrating that unit against live data. Throwaway:
written to show a unit worked, kept as a record, not maintained.

**`ops/`** — tools run against the world, not proofs. `sweep-protocols` and `triage-protocols`
regenerate `docs/protocol-inventory.md` and the verdicts in `src/config/protocols.ts` and get re-run
whenever deployments change; `verify-ats` verifies a report token on Sourcify; `provision-circle` and
`check-market-level` are one-shots already run.

**`smoke/`** — Phase 0's nine isolated integration tests, each proving one external system works.
Closed; outcomes are in `tracking/smoke-results.md`. Run via `npm run smoke:NN`.

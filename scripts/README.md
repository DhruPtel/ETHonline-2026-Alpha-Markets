# scripts

**`ops/report.ts`** — generate a report and keep it. **The one you actually run.**

```bash
npx tsx --env-file=.env scripts/ops/report.ts "Balance overview for Aave v3 on Ethereum"
```

compose → execute → narrate → validate → `save`. It prints the hash, the public URL, and the
tokenize command with the hash already filled in. ⚠️ This used to say `ask.ts` was the one you
actually run; `ask.ts` is a demo of the data layer and nothing it does is persisted.

**`ask.ts`** — ask the agent a question in plain English and watch it work. A demonstration of the
data layer, not the product path: it uses `agent/loop.ts` + `tools.ts`, which the report pipeline
never touches (`src/agent/README.md`).

---

## `ops/` — tools run against the world

⚠️ **Four of these spend real money or mint permanent assets.** Each takes `--confirm`; without it
the preflight runs, prints its plan, and sends nothing.

| script | what it does | spends |
|---|---|---|
| `report.ts` | generate a report and persist it | model tokens |
| `tokenize.ts` | issue the ATS report token, hash in the creation event | **~7.9 HBAR** |
| `move-token.ts` | transfer a report token, balances asserted from chain | **~0.44 HBAR** |
| `buy.ts` | the buyer agent pays for one report over x402 | **0.001 HBAR** |
| `migrate.ts` | apply `src/store/migrations/*.sql` in filename order | — |
| `verify-ats.ts` | verify a report token on Sourcify | — |
| `verify-analyst.ts` | assert `config/analysts.ts` against the live Circle API and Mirror Node | — |
| `sweep-protocols.ts` | regenerate `docs/protocol-inventory.md` — who answers | — |
| `triage-protocols.ts` | regenerate the verdicts in `src/config/protocols.ts` — who is right | — |
| `provision-circle.ts` | one-shot, already run: create the analyst's Circle wallet | — |
| `check-market-level.ts` | one-shot, already run | — |

`migrate.ts` uses `DATABASE_URL_DIRECT` and refuses to run if that URL contains `-pooler`; the two
Neon endpoints are not interchangeable (`src/store/db.ts`).

⚠️ **`verify-ats.ts` is not automatic.** `tokenize.ts` only *prints* the command. As of 2026-09-09
**one of the four report tokens is verified on Sourcify** and three are not, which matters because
"contracts verified where applicable" is pass/fail on the Hedera track. Every report token is
byte-identical runtime bytecode, so the script verifies any of them unchanged.

---

## `demo/` — one proof per build unit

Each demonstrates one unit against live data. Throwaway: written to show a unit worked, kept as a
record, not maintained.

⚠️ **`demo/store.ts` is an assertion suite, not a generator.** It deliberately corrupts a stored row
by one character to prove `load()` refuses it, and the restore sits inside a `try` whose `finally`
only closes connections. It is correct as a proof and was wrongly used as the way reports got made
for nine units — `tracking/lessons.md`, *"Nine units passed their own proofs and the product did not
run"*. Use `ops/report.ts`.

⚠️ **`demo/skills.ts` is broken and has been since Phase 2.** It reads
`src/agent/skills/balance-overview.md`, which moved to `skills/unused/` when the report forms were
removed. It fails immediately on a missing file and blocks nothing.

---

## `smoke/` — Phase 0's nine isolated integration tests

Each proves one external system works. Closed; outcomes are in `tracking/smoke-results.md`. Run via
`npm run smoke:NN`. SM-09 is manual — no script exists, `tsx` cannot drive a wallet extension.

⚠️ **Do not run `smoke/08-circle-payable-call.ts`.** It deploys a contract and sends a payable
transaction, and without `CIRCLE_WALLET_ID` set it creates a *second* Circle wallet — which makes the
analyst's on-chain identity disagree with `config/analysts.ts`, a wrong-author bug rather than a
wasted transaction.

These predate `src/` and carry their own copies of helpers that now live in `src/tokenize/hedera.ts`
(`MIRROR`, `hbar`, `settledBalance`). That duplication is deliberate — a frozen test that still
passes is worth more than one refactored into a shared module it was written before.

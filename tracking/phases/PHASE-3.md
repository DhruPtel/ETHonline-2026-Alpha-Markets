# Phase 3 — Task by Task

*The report becomes a product.*

**This document supersedes PLAN-v4 §9's Phase 3 line.** That line was written before Phase 0 ran. Six
of the nine smoke tests measured something that changes it, and Phases 1 and 2 did not build what §9
assumed they would. Where this document and §9 disagree, the disagreements are named in *Where §9 is
now wrong*, and the plan should be amended rather than carried alongside this.

Phase 1 gave the agent eyes. Phase 2 gave it judgment — a directive becomes a hashed report. **Phase 3
gives the report an existence outside the process that made it.** Right now a report is printed to a
terminal and lost. Nothing stores it, nothing sells it, nothing can point at it, and the address of
the analyst that wrote it is a function argument.

Three things have to be true at the end, and the third is the one nobody has started:

1. **Tokenization** — a published report is an ATS asset on Hedera testnet, and its 32-byte hash is in
   the creation event.
2. **The x402 gate** — that report sells behind a paywall settled through Blocky402. ⚠️ **As a read:**
   pay, receive the body, done. The Own tier is cut (decision 3), so no token moves to a buyer.
3. **A web app** — ⚠️ *working frontend and backend* is **pass/fail on all three Arc prizes**, and
   nothing exists. Everything in this repo runs from the command line.

Plus **analyst identity**, which is not a fourth thing but a precondition for the other three.

---

## Status

| Unit | File | Kind | Status |
|---|---|---|---|
| **0** | **the accounts and services** | **SETUP** | ✅ Vercel + Neon provisioned; `postgres` declared |
| 1 | the deployment probe | PROBE | ✅ Next 16 scaffold + `app/api/probe`; **10.0 MB of 250 MB** |
| 2 | `config/analysts.ts` | SCAFFOLD | ✅ one row, checked live against Circle + Mirror Node |
| 3 | `agent/` — the split named | SCAFFOLD | ✅ README rewritten; `MODEL` → `config/model.ts` |
| 4 | `store/db.ts` + `store/migrations/001_init.sql` | SCAFFOLD | ✅ four tables live; `scripts/ops/migrate.ts` is the runner |
| 5 | `store/reports.ts` | LOGIC ★ | ✅ round trip proved on a **real** 140-fact report |
| 6 | `app/` — the reading surface | SCAFFOLD | ✅ list + report page, deployed; `app/markdown.tsx` is the escaping boundary |
| **6b** | **`app/` — preview + marketplace index** | **SCAFFOLD** | ⬜ ⚠️ **NEW — gating makes Unit 6's full page a preview** |
| 7 | `tokenize/isin.ts` | LOGIC | ✅ base-36 of the hash mod 36⁹; 1,000,002 hashes, 0 collisions |
| 8 | `tokenize/ats.ts` | LOGIC ★★ | ✅ token live, Sourcify `exact_match`; **split to `tokenize/hedera.ts`** |
| **8b** | **`scripts/ops/report.ts`** | **LOGIC** | ✅ ⚠️ **NOT PLANNED — the production entry point the sweep found missing** |
| **9** | **PLAY GAP — look at the asset** | **PLAY** | ✅ done as an investigation — see *Where the token is visible* |
| 10 | `tokenize/transfer.ts` | LOGIC | ⬜ |
| **11** | **PLAY GAP — move a real report** | **PLAY** | ⬜ |
| 12 | `payments/server.ts` + `app/api/health` | LOGIC | ⬜ **next** |
| 13 | `payments/quotes.ts` | LOGIC | ⬜ |
| 14 | `payments/gate.ts` + the gated route | LOGIC ★★ | ⬜ |
| 15 | `payments/buyer.ts` | LOGIC ★ | ⬜ |
| **16** | **PLAY GAP — buy one, then break it** | **PLAY** | ⬜ |
| 17 | `payments/recover.ts` | LOGIC ★ | ⬜ |
| 18 | `payments/auth.ts` — human **identity**, not human payment | LOGIC | ⬜ ⚠️ **the cut point** |

**Nineteen units: one setup, one probe, three play gaps, and fourteen files.** ⚠️ Phase 4 is CORE and
unstarted and the deadline is **2026-09-13**, so read *If it does not fit* at the end before starting,
not after. **Unit 18 is the declared cut point** — everything above it is the phase, and it is the one
thing designed to be dropped without a requirement moving.

The Own tier is **cut** (decision 3 below), which is why Unit 13 lost its star: with no inventory
reservation, no recipient binding and no two-buyers-one-unit race, quoting is bookkeeping rather than
judgment.

---

## Where this actually stands — 2026-09-08, end of session

⚠️ **Read this before touching anything.** Written so a session starting cold can trust it without
checking. Where a unit landed differently from the brief above, this section is right and the brief
above is what was planned.

### Deployed

| | |
|---|---|
| production | `https://et-honline-2026-alpha-markets-o1dz9goh5-alpha-markets.vercel.app` |
| aliased | **`https://et-honline-2026-alpha-markets.vercel.app`** ← use this |
| `GET /` | 200, renders the scaffold page |
| `GET /api/probe` | **402** with a `payment-required` header; challenge carries `network: hedera:testnet`, `extra.feePayer: 0.0.7162784` |

Vercel project `et-honline-2026-alpha-markets`, repo-linked (`.vercel/repo.json`). `vercel.json`
declares `{"framework": "nextjs"}` — the project preset was "Other" and deploys failed with *No Output
Directory named "public"* until it did.

### What landed, per unit — what actually happened, not what was planned

- **0 · accounts and services.** Vercel and Neon provisioned. `postgres@3.4.9` declared (it had
  arrived transitively during Unit 1's probe); confirmed a leaf — zero dependencies, zero peers.
- **1 · deployment probe.** Next 16.3.4 App Router scaffold (`app/layout.tsx`, `app/page.tsx`,
  `next.config.ts`, `tsconfig.app.json`) plus `app/api/probe/route.ts`. **M1 answered: 10.0 MB traced
  against a 250 MB limit, 4.0%.** Turbopack *bundles* server deps rather than tracing `node_modules`,
  which is why 110 MB of ATS+ethers becomes a 7.93 MB chunk; no native `.node`/`.wasm` traced.
  **M2 answered: `withX402` works on Next 16 unmodified** — none of the Next 15 friction in
  `docs/research/x402-next-2.25.md` reproduced. ⚠️ `@x402/next` pulled `@x402/extensions`, which
  depends on **`viem`** — now installed transitively, listed in the plan under Phase 4 and previously
  reported "not installed".
- **2 · `config/analysts.ts`.** One row, `alpha-1`. ⚠️ **Its `arcAddress` is checked against the live
  Circle API, not a constant** — `scripts/ops/verify-analyst.ts` asserts it equals
  `circle.getWallet({id})`, asserts `accountType === 'EOA'`, and checks `hederaEvmAddress` against
  Mirror Node. This closes the half of §5.18 SM-08 could not run. The EVM address was **read** from
  Mirror Node, not derived.
- **2b · `execute` takes an analyst id** *(not in the brief; a follow-on commit)*. `ExecuteState.analyst:
  string` (an address) became **`ExecuteState.analystId: string`**. `Report.analyst` still holds an
  address and is still inside the hash — only the caller's supply route changed. Proved by generating a
  real report before the change and re-running it at the same pinned block after: hash byte-identical.
  Three demo scripts updated; `demo/canonical.ts` deliberately keeps its literal because it is a hash
  fixture, not a caller.
- **3 · the `agent/` split named.** `src/agent/README.md` rewritten to state the decision — the report
  pipeline is the product, `loop.ts`/`tools.ts` are the demo surface behind `scripts/ask.ts` — rather
  than record an open question. No file moved. ⚠️ **`MODEL` moved to `src/config/model.ts`**, which also
  removed a dependency edge pointing backwards (`config/analysts.ts` had imported it from
  `agent/loop.ts` while `agent/execute.ts` imports `config/analysts.ts`).
- **4 · `store/db.ts` + `001_init.sql`.** Four tables live on Neon: `reports`, `report_tokens`,
  `quotes`, `purchases`. `scripts/ops/migrate.ts` is the runner — reads every `.sql` in filename order,
  no version table, every statement `IF NOT EXISTS` so re-running is a no-op. ⚠️ The unit **stopped on
  its first attempt**: `DATABASE_URL` and `DATABASE_URL_DIRECT` were byte-identical and both pointed at
  the pooled host. Fixed, and `migrate.ts` now refuses to run if the direct URL contains `-pooler`.
- **5 · `store/reports.ts`.** `save`, `load`, `list`, `close`. Round trip proved on a **real** report —
  140 facts, ~71 KB canonical, 26-place decimal tails — not a fixture. `load` parses `canonical_json`
  and never reassembles from columns, which is why the BIGINT-as-string trap does not exist on that
  path. Two checks on load: recomputed hash vs primary key, and stored-bytes-are-canonical. Both were
  made to fire.
- **5b · `rendered_md` dropped** *(not in the brief; a follow-on commit)*. `002_drop_rendered_md.sql`.
  It was a cache of `render()`, a pure function of the stored report, and filling it honestly would
  have made the store import from the agent. `save` now takes a `Report` and nothing else.
  ⚠️ **`001_init.sql` was not edited** — a migration that has run against a live database is history.

- **6 · the reading surface.** `app/page.tsx` (list), `app/report/[hash]/page.tsx`, `app/markdown.tsx`,
  `app/globals.css`. ⚠️ **`app/` importing `src/` collided with the root NodeNext convention**: Turbopack
  does no `.js` → `.ts` aliasing and died inside `src/store/reports.ts` on its own `./db.js`.
  `experimental.extensionAlias` is **webpack-only and Turbopack accepts and ignores it**. Fixed by
  setting `tsconfig.app.json` to `nodenext`, which cost dropping `next/link` for a plain `<a href>` —
  `next` is CJS with no `exports` map, so a default import binds `module.exports`. `next/server.js` in
  the probe route gained a `.js` suffix; nothing else changed. `render()`'s `_hash` got its job: the
  report hash is now in the markdown, because the markdown travels to a buyer where the page does not.
- **7 · `tokenize/isin.ts`.** SM-07's `makeIsin` promoted verbatim; the new part is the body —
  `BigInt(hash) % 36⁹`, base-36, uppercased, padded. **36⁹ not 16⁹**: a hex slice would use 0.0677% of
  the alphabet space. 1,000,002 hashes → 0 collisions, and the check digit verified under an
  independent implementation.
- **8 · `tokenize/ats.ts` + `tokenize/hedera.ts`** *(the split, named before writing)*. Token live at
  `0xE7aaEFB168F3E87975Fee1B0c932aE42776D8c6c`, Sourcify `exact_match`, `balanceOf == 1`, **7.71290100
  HBAR** against SM-07's 7.71195075 for the same three steps. `prepare()` / `tokenize()` are split as a
  safety property: everything that can stop the run happens before the first transaction. ⚠️ `landOrStop`
  **throws instead of `process.exit`** — it is a library now, and Unit 14 will call it from a request.
- **8b · `scripts/ops/report.ts`** *(not in any brief — see the sweep below)*. compose → execute →
  narrate → `save`, printing the hash, the public URL, and the tokenize command with the hash filled in.
  All four `execute` outcomes handled; only `completed` saves. **This is the first non-demo caller of
  the pipeline in the project.**

### Traps — the things that will cost a session if not known

1. ⚠️ **Do not edit the root `tsconfig.json`.** It is `module: NodeNext` / `moduleResolution: NodeNext`
   with `include: ["scripts/**/*", "src/**/*"]`, and every import in `src/` and `scripts/` carries an
   explicit `.js` extension because nodenext requires it. Next's defaults are `esnext` + `bundler`,
   which do not. **Next has its own config**: `next.config.ts` sets
   `typescript: { tsconfigPath: 'tsconfig.app.json' }`, so Next reads and rewrites *that* file. It
   already did — it set `jsx: react-jsx` and added `.next/dev/types` there, and the root file is
   untouched. `npm run typecheck` (`tsc -p tsconfig.json --noEmit`) is the regression guard.
2. ⚠️ **Two Neon URLs, not interchangeable.** `DATABASE_URL` is pooled (host contains `-pooler`) for
   route handlers; `DATABASE_URL_DIRECT` is direct (no `-pooler`) for migrations only. The pooled
   endpoint is PgBouncer in transaction mode and cannot carry DDL — it fails on prepared statements and
   session settings, which reads like a bug in the `.sql` file rather than a wrong connection.
3. ⚠️ **An empty env var is a missing env var.** `process.env.X ?? fallback` returns `""` because `??`
   falls back on `undefined` and never on `""`. This shipped a live 402 with an empty `payTo`. Check
   emptiness explicitly; `src/store/db.ts`'s `required()` and `scripts/ops/verify-analyst.ts`'s `env()`
   are the pattern.
4. ⚠️ **`MODEL` lives in `src/config/model.ts`**, not `src/agent/loop.ts`. Six importers.

### Open — the nine seams, from the 2026-09-08 loop sweep

⚠️ **Every unit passed its own proof and the product path did not run.** A full import-graph sweep
found nine seams nobody owned. Ordered by what blocks the most; **three are closed by
`scripts/ops/report.ts`.**

1. ✅ **CLOSED — `narrate` → `save` was unwired.** `demo/narrate.ts` printed the report and exited.
2. ✅ **CLOSED — the only `save()` caller was a test that corrupts a row.** `demo/store.ts` flips one
   character of `canonical_json` and restores it, with the restore inside a `try` whose `finally` only
   closes connections. It was the de-facto generator. It remains correct **as a proof** and is not to
   be used as a command.
3. ⬜ **`report_tokens` is invisible to the app.** `list()` is `SELECT … FROM reports` with no join and
   the report page imports only `load`. **A tokenized report renders identically to an untokenized
   one** — the cross-chain commitment does not appear on the product surface. **6b closes this.**
4. ⬜ **`Report.atsTokenAddress` is never populated.** `execute` sets `null`, `canonical()` strips it,
   `load()` reattaches `null`, Unit 8 writes `report_tokens` without touching it. Needs a decision on
   which is the source of truth — the column or the field — before both exist and disagree.
5. ✅ **CLOSED — `compose.ts` had no caller outside `scripts/demo/`.** The pipeline had no production
   entry point at all. `scripts/ops/report.ts` is it.
6. ⬜ **Nothing produces a price.** `quotes.price_tinybars` is `NOT NULL CHECK > 0` and no constant,
   config entry or function anywhere yields one. **Blocks Unit 13, and 14 and 15 behind it.**
7. ⚠️ ⬜ **`HEDERA_SELLER_ID` resolves empty in Vercel Production.** The deployed probe's challenge
   carries `payTo: ""`. **This is the empty-env-var trap on the route that will matter** — Unit 14's
   gate would advertise nobody to pay. Fix before Unit 14 is demoed.
8. ⬜ **The analyst-by-Arc-address lookup is inlined at `ats.ts:104`.** Units 12 and 13 both want it.
   ~5 lines to hoist into `config/analysts.ts`; a duplication about to happen, not a break.
9. ⬜ **`scripts/demo/skills.ts` is broken.** Reads `src/agent/skills/balance-overview.md`, at
   `skills/unused/` since Phase 2. Blocks nothing.

**Also still open, from earlier sessions:** `ARC_WALLET` is set in `.env` and read by nothing;
Vercel's Production env values have never been verified against local beyond `DATABASE_URL`, which is
now set and confirmed working; and `app/api/probe/route.ts` is throwaway and stays until Unit 12
replaces it (`rm app/api/probe/route.ts` is the whole removal).

**Not gaps, for the record:** the app never generating a report is decision 2. `validate.ts`,
`evidence.ts` and reconcile's tier 2 are parked. `loop.ts`/`tools.ts` are the `ask.ts` demo surface by
decision.

### Unit 6b — the preview and the marketplace index

⚠️ **New, and it exists because gating changes what Unit 6 built.** Unit 6's brief said "a page that
renders one", and it does — fully, publicly. **x402's premise is paying for access to something you
otherwise cannot see**, so a paid route serving the same content would gate nothing and the payment
would prove nothing. The public page becomes a preview.

**Public, and enough to decide:** the directive as the heading, the analyst address, the block, the
full hash, `verdict.coverage` counts, the fact *count*, whether it is tokenized (proxy, ISIN, HashScan
link), and the price.
**Behind the gate:** `sections` (the table — every figure), `assessment`, `facts`, `checks`,
`provenance`.

⚠️ **This needs nothing the `Report` object does not already have.** `render()` returns one string with
no seam, but the split is field-level and already exists, and `app/report/[hash]/page.tsx` **already**
composes its identity panel from fields and then renders the markdown. The preview is that page minus
the `<Markdown>` block. No schema change, no type change.

**It also closes seam 3** — showing tokenized state means the app finally reads `report_tokens`.

⚠️ **Gating loses nothing that was ever there.** Nothing public has ever exposed `canonical_json`, and
a hash cannot be recomputed from rendered markdown, so third-party verifiability was already absent
before the gate. Say that plainly rather than discover it in front of a judge.

---

## What Phases 0–2 changed

Pulled from `tracking/smoke-results.md`, `tracking/lessons.md` and `tracking/DECISIONS.md` — what was
measured, not what was planned.

### The x402 half

| Finding | Consequence for Phase 3 |
|---|---|
| **Blocky402 supports `hedera:testnet`** (SM-05). Our own research note said flatly that it does not — it had queried the mainnet host and generalised | The whole gate runs on testnet. R12 is taken. ⚠️ **The feePayer `0.0.7162784` is asserted at health-check time, never in the request path** — R12's "startup feePayer assertion still owed" is Unit 12 |
| **The payment settled in HBAR, not USDC** (SM-05, DECISIONS 2026-09-06). Circle's testnet faucet never delivered and Discord went unanswered | ✅ **Decided 2026-09-08 — testnet in HBAR, mainnet in USDC at the end of Phase 4.** Price in hand-computed tinybars; `"$0.50"` throws, because `defaultMoneyConversion` rejects asset `0.0.0`. **Cost: no USD pricing on testnet, and H1.7's "HTS in the settlement path" extra is forfeited.** H1.1/H1.2/H1.3 unaffected. ⚠️ Mainnet HBAR needs an exchange withdrawal with a lead time nobody controls — **start it early** |
| **`@x402/core` 2.25 ships client spend controls, on by default** (lessons 2026-09-06) — and they refused HBAR outright | The guard our research said we had to build already exists and is fail-closed. HBAR gets an explicit `allowedAssets` entry with its own atomic cap. ⚠️ **`spendControls: false` must never appear in product code.** The research note's "HBAR breaks spend controls" verdict is superseded: it breaks the *default*, and explicit opt-in restores it |
| **Every Hedera settle failure returns `{success: false, transaction: ""}`** (§5.8, SM-05) — including a timeout after successful broadcast | The native transaction id is read from the signed bytes and **persisted before `settlePayment` is called**. SM-05 proved this against a real settlement; Units 15 and 17 move it out of the smoke script |
| **Mirror Node lags consensus, and the facilitator preflights against Mirror Node** (lessons 2026-09-06). It bit at both ends of one payment | Any flow that provisions and then immediately pays hits the window, and **the buyer agent's first purchase is exactly that shape**. Poll, and read the transaction *record* rather than diffing balances |
| **`withX402` cancels settle when the handler fails; `paymentProxy` charges anyway** (x402-next research, measured) | ⚠️ **Use `withX402` with the default `authorization` flow. Never `paymentProxy`.** There is no refund primitive on Hedera, on any chain, today — failure-avoidance is the only remedy that exists |
| **`@x402/paywall` has no Hedera export** (x402 spec research) | A human hitting the gated route in a browser gets a static fallback, not a wallet prompt. ⚠️ **This is why x402 stays agent-to-agent, and that is a decision rather than a limitation** (decision 4): H1.3 asks for "a platform **or** agent", the buyer agent satisfies it, and a browser payment would need a WalletConnect Hedera signer built from scratch. Unit 18 makes a person *identifiable*, never a *payer* |
| **`initialize()` calls `process.exit` on a config mismatch** (§5.17) | On Vercel that is a cold-start crash loop that reads as a platform outage. The resource server is constructed **lazily inside the route**, wrapped, returning 503 with a diagnostic |
| **Bazaar discovery is a no-op, sale-splitting is hard-blocked at the facilitator, refunds do not exist** (x402 spec research) | Not risks to manage — capabilities to stop planning around. The royalty split in cut #4 is not merely cut, it is **impossible** |

### The tokenization half

| Finding | Consequence for Phase 3 |
|---|---|
| **The public ATS factory and resolver expire 2026-09-10** — resolver `0.0.9212226` at 10:51:29Z, 1,683 seconds before the factory (SM-07). Re-measured 2026-09-08: **nothing has moved, nothing is auto-renewing them, and the exposure is wider than we recorded** — a plain transfer of an *already-issued* token staticcalls the resolver and delegates through five more contracts, all expiring in the same 80-second window | ⚠️ **No contingency, and this is a measured conclusion rather than an optimistic one.** Hedera has not enabled smart-contract rent on any network — pending since a March 2023 target, no date, and a Council decision to turn on. The dates are real, unmoving and inert. **Not a decision in Unit 8; a one-line health check in Unit 12.** Full trace and citations in `DECISIONS.md`, 2026-09-08 |
| **Two values in our own research note revert on-chain** (SM-07, lessons) — `maxSupply: 0n` and `regulationType: 0`. The first cost a real reverted deploy | `maxSupply: 1n` and `REG_S`/`NONE`. **A cap of 1 is the better value anyway:** one report, one token, and a second mint against the same report becomes impossible at the contract level rather than by convention |
| **The report hash survives byte-identically in `additionalSecurityData.info`** — and it is **event-only**, validated and emitted, never written to storage (SM-07) | This is PLAN §1's Hedera half of the cross-chain commitment and it works. ⚠️ **Verifying it means reading a log**, which is fine for anyone with an indexer and awkward for anyone without. SM-07's open to-do — `setCustomData` as well, at the cost of a second transaction and a role grant — is decided in Unit 9, with the asset in front of us |
| **Sourcify verifies a ResolverProxy, `exact_match`, first attempt** (Unit A). Nobody had ever verified an ATS contract on Hedera testnet, including the ATS team | H2.3 is a pass/fail requirement that is now a 20-second script per token. `scripts/ops/verify-ats.ts` **already exists** — ⚠️ §9 lists it as Phase 3 work and it was built in Phase 0 |
| **Every report token is byte-identical runtime bytecode** — 390 bytes, same compiler, same sources; only the address changes (Unit A) | Verification is repeatable by construction, and the script re-derives and re-checks rather than trusting that |
| **Compliance off works: zero onboarding, no association** (SM-07) | ATS tokens are plain ERC-20 on the Hedera EVM. A buyer needs no KYC step, no identity registry, and no association transaction to receive one |
| **The ATS *SDK* is 1.4 GB, ships React Native and Solana, and has no server-side private-key signer** (research) | ⚠️ **The SDK must never be imported.** `@hashgraph/asset-tokenization-contracts` + `ethers@6` is 110 MB and has every function we need. It is already the dependency |
| ⚠️ **"The issued asset outlives the factory" was false comfort** — corrected 2026-09-08. The proxy's own 2026-12-05 expiry protects nothing, because the proxy holds only storage | Every executable line lives in the resolver and five facets, all expiring 2026-09-10. **The factory's expiry would cost new mints; the resolver's would cost every transfer of every already-issued token.** Moot while rent is disabled, and the reason the health check in Unit 12 exists rather than nothing |

### The Arc and Circle half — mostly Phase 4, one thing that binds here

| Finding | Consequence for Phase 3 |
|---|---|
| **Circle Agent Stack cannot run on Vercel** — no API key at all, interactive email+OTP into an OS keyring, a terms gate, and 252 MB for the CLI alone (research) | `@circle-fin/developer-controlled-wallets` is the component, it is already a dependency, and it is a genuine claim rather than name-dropping. ⚠️ **The analyst's Arc identity is its Circle wallet address** |
| **`msg.sender` is the Circle wallet, asserted** (SM-08) — and §5.18 requires `analysts.ts` to hold the same address | SM-08 left this half-run because `analysts.ts` did not exist. **Unit 2 closes it** |
| **`msg.value` arrives at 18 decimals while `decimals()` reports 6** (SM-08) | Phase 4's problem, but it is why `analysts.ts` records an address and never a balance |
| **SM-09's `next build` half is still open** — a stake under a production build, deferred because no app existed | ⚠️ Phase 3 builds the app, so the class of failure SM-09 was guarding against — ESM directory imports that only break outside `next dev` — **lands in Unit 1, earlier than the smoke test scheduled it** |

### What Phases 1 and 2 left

| Finding | Consequence for Phase 3 |
|---|---|
| ⚠️ **Nothing persists.** A report is generated, printed and lost | §5.7 says the paid endpoint only ever serves a **small, already-persisted body**. Nothing persists anything. **Storage is a Phase 3 prerequisite that §9 never scheduled**, and it is Units 4 and 5 |
| **`Report.analyst` is a caller parameter** and `config/analysts.ts` does not exist (Phase 2) | That address is what a leaderboard and an on-chain claim both key on. It cannot be bolted on after tokens exist — Unit 2 |
| **Narration is inside the report hash** (Phase 2 Unit 2 — one word of prose moves it) | ⚠️ **A report cannot be tokenized before it is narrated.** `execute`'s `dataHash` is explicitly not the identity a market settles against. The token commits `reportHash(report)`, over the complete object |
| **`src/agent/` holds two systems that never call each other** (lessons 2026-09-07) | A server has to expose one. **Decided below** — Unit 3 |
| **The digit guard warns rather than blocks** (DECISIONS 2026-09-08) | ⚠️ **Unchanged in Phase 3.** Enforcement moves to Phase 4, when a report backs a market, and it is gated on two missing fact ids plus the rank-ordinal question. Do not enforce here |
| **25 deployments answer, 5 are usable, reports exist and are readable** (Phases 1 and 2) | There is something to sell. This phase adds no data-layer work at all |

---

## Five decisions that shape everything

*All five taken 2026-09-08. Three of them are recorded in `DECISIONS.md` with what they cost.*

**1 · The report pipeline is the product; `ask.ts` is a demo surface.** `src/agent/` holds
`compose → execute → narrate` and, separately, `loop.ts` + `tools.ts` used only by `scripts/ask.ts`.
The server exposes the pipeline. ⚠️ **The split is named, not restructured** — eight import sites plus
every demo is a real cost days before a deadline, to buy legibility a paragraph buys for nothing. The
one real coupling is the `MODEL` constant, which lives in `loop.ts` and is imported by the two files
that do not use the loop. That moves (Unit 3).

**2 · Reports are generated by the CLI and persisted; the app never generates one.** §5.7 already
requires the paid endpoint to serve an already-persisted body. Taken seriously, that removes §5.1's
entire job-progression apparatus from this phase — **no external ticker, no leases, no
request-driven advance, no `workflow/`**. Those exist because a 300-second Vercel invocation cannot
hold a multi-deployment report generation, and in Phase 3 nothing asks it to. ⚠️ **Commissioning
through the app is Phase 4 or later.** What we give up: a visitor cannot ask for a new report. What we
get: the phase does not spend three units on a scheduler before the thing being scheduled exists.

**3 · A report is a read-only purchase — the Own tier is cut.** Pay, receive the body, done. **No
token moves to a buyer.** ⚠️ **ATS tokens are still issued per report, and the transfer is still
demonstrated as a standalone unit** (Unit 10) — because H2.4 asks for issuance, configuration and ≥1
lifecycle operation, and **does not require the lifecycle operation to be caused by a payment.**
Reading it that way was our own addition.

What goes with Own is all machinery and no product: inventory reservation against a supply of one,
§5.4's recipient binding (an x402 payer is a Hedera `0.0.x`, an ATS recipient is a testnet EVM
address, and the second cannot be derived from the first), R16's two-buyers-one-unit race, and a
`409`. With Phase 4 unstarted, that is the trade. **What it costs:** a weaker product story, R15's
payment-ok-transfer-fails path becoming unreachable, and §9's exit clause *"token-holder isn't charged
on either read"* — struck, because in Phase 3 no buyer holds a token. The branch table stays whole in
§5.19 so Own is additive later rather than a rewrite.

**4 · x402 stays agent-to-agent. Humans can identify themselves; agents buy.** ⚠️ **This is
deliberate and it satisfies the requirement — it is not a gap we ran out of time to close.**

**H1.3 asks for "a platform **or** agent" consuming the service, with ≥1 real paid request end to
end.** The buyer agent completing a real paid request *is* what the requirement asks for. A human
completing an x402 payment in a browser is a **product nicety, not a prize requirement**, and it would
need a WalletConnect Hedera signer that does not exist — `@x402/paywall` ships `evmPaywall`,
`svmPaywall` and `avmPaywall`, and **no Hedera export at all**. Building that signer is not a unit,
it is a project.

**And agent-to-agent is the stronger demo for this build anyway.** One analyst publishes a report;
a second agent, with its own wallet and its own spend cap, pays for it and reads it. **That is the
agent-economy pitch, stated rather than gestured at** — and SM-05 already proved the whole handshake
settles on Hedera through Blocky402, so it is the demo resting on the thing we have measured rather
than on the thing we would have to build.

**What Unit 18 therefore is:** a signed EIP-191 challenge that proves **which address a person is**,
so a purchase can be attributed to them and re-read. Nothing more. It is last, and it is the declared
cut point, because dropping it costs product surface and **no requirement**.

⚠️ This also resolves a contradiction that has been in the plan since it was written: §5.3 cut human
buying outright, §5.4 then specified an EIP-191 session so a *human* could prove an EVM address, and
both could not be true. **§5.3 was right about x402 and overstated it as "cut"** — human *identity*
is deferred to Unit 18; human *payment over x402* is genuinely not happening.

**If humans need a way in later, it does not have to be x402** — a sponsored read against a proven
address, a different rail, a free tier. ⚠️ **That is a Phase 5 question, not a Phase 3 one**, and it
should not be answered by quietly widening this unit.

**5 · Testnet in HBAR; Hedera flips to mainnet in USDC at the end of Phase 4. Arc stays testnet.**
Not a to-do — a decision. Three documents carried "switch to USDC" as scheduled Phase 3 work and
**none of it was going to happen, because the blocker was supply, not setup**: Circle's testnet faucet
did not deliver, Discord went unanswered, and SM-08 later found the faucet's API endpoint
rate-limiting independently of its web form. Mainnet at the end of Phase 4 means the submission shows
real settled value, after the whole system is proven and without the asset changing underneath it.

⚠️ **Mainnet HBAR has no faucet** — an exchange withdrawal, possibly behind KYC, on a clock nobody
controls. **Start it well before it is needed;** the cutover is gated on funds arriving, not on a
date. ⚠️ **Arc stays testnet, full stop** — Arc mainnet launches 2026-09-16, three days after the
deadline, so there is nothing to schedule.

**The swap is small, and that is what makes deferring it safe.** SM-05 already proved the part that
looked risky: spend controls reject non-default assets by default, and opting HBAR in explicitly with
its own atomic cap **kept the control working**. What remains is token id, price format
(`AssetAmount` in atomic units → a `"$…"` money string), the buyer's `allowedAssets` entry, and the
facilitator's advertised asset — moving together, per R12. SM-05's association path is kept and
skipped for exactly this. **Cost meanwhile:** no USD-legible pricing, and **H1.7 forfeited**.

---

## Measure before building

Four questions in the shape of SM-04's — settle them before the design that depends on them, not
after.

**M1 · Does everything fit in a Vercel function?** `@x402/hedera` (which hard-pins
`@hiero-ledger/sdk@2.85.0`), `@hashgraph/asset-tokenization-contracts` + `ethers@6` (110 MB measured),
`@anthropic-ai/sdk`, and `postgres` — in one Next 16 app against a **250 MB unzipped** limit.
`@vercel/nft` traces from the barrel index. **This is Unit 1 and it is first for a reason: if it does
not fit, the answer is splitting heavy routes or moving tokenization out of the app entirely, and both
are architecture, not cleanup.**

**M2 · Does a `Report` survive Postgres byte-identically?** The hash is over canonical JSON. ⚠️
`jsonb` does not preserve what was written — it reorders keys, normalises numbers and drops
duplicates. Store the **canonical string as text** and re-derive the hash on read. Measured in Unit 5
by saving a real report, reloading it, and comparing both the canonical bytes and the hash. This
repo has been bitten twice by JSON round-trips accusing correct code (SM-01's key ordering, Unit 1's
replacer array) — assume nothing here.

**M3 · Is the public ATS resolver still answering?** ✅ **Measured 2026-09-08 — settled, and it is a
health check rather than a decision.** `0.0.9212226` expires 2026-09-10 10:51:29Z, unmoved since
SM-07, never renewed, with no auto-renew account and a zero balance. It does not matter: **Hedera has
not enabled smart-contract rent on any network**, and doing so is a Council decision that has been
pending since a March 2023 target with no date since. The factory is meanwhile in daily use by 32
distinct accounts. Reasoning, the full call trace and the citations are in `DECISIONS.md`, 2026-09-08.
The one Mirror Node GET becomes part of `/api/health` in Unit 12 so the assumption stays visible.

**M4 · Does `withX402` behave on Next 16?** All the measured behaviour in
`docs/research/x402-next-2.25.md` was observed on Next 15 with `--legacy-peer-deps`. We chose Next 16,
which is the *supported* peer, so this should be easier — but "should be" is what M1 through M3 exist
to stop us saying. One gated route returning a 402 is the whole test, and it is inside Unit 1.

---

# Unit 0 — the accounts and services

**SETUP, no code**

**What we're doing:** provisioning the three things Unit 1 cannot run without, **as a unit rather than
as an assumption.** §7's provisioning inventory is thirteen items that were tracked as a table and
half-done, and the two that were never done are the two this phase opens on.

**What's in it:**

| | needs |
|---|---|
| **Vercel project** | linked to the repo, `nodejs` runtime, env vars mirrored from `.env`. ⚠️ The Graph's Studio key has a **domain allowlist that must include the Vercel production *and preview* domains** (§7) — a preview deploy that cannot query is a confusing first failure |
| **Neon project** | one database, **both URLs**: pooled for route handlers, direct for migrations (§5.18) |
| **`postgres`** | added to `package.json`. ⚠️ **A dependency is a decision** — flagged rather than assumed. Zero transitive deps, and it is the package §5.18 names |

⚠️ **§9's Phase 0 gate said "deploy empty app" and it never happened.** Neither did the ticker
workflow. This unit is the first half of that debt being paid; the ticker is not needed in this phase
at all (decision 2).

**Proof:** a deployed placeholder page on a public Vercel URL, and `psql`-equivalent connectivity to
Neon through **both** URLs from a script. Nothing else — this unit exists to stop Unit 1 discovering a
missing account halfway through a bundle measurement.

---

# Unit 1 — the deployment probe

**PROBE, throwaway**

**What we're doing:** finding out whether the thing we are about to build can be deployed, before
building it. A Next 16 app with one route that imports every dependency Phase 3 needs, pushed to
Vercel.

**What's in it:** a `create-next-app` skeleton, `app/api/probe/route.ts` importing `@x402/hedera`,
`@hashgraph/asset-tokenization-contracts`, `ethers`, `postgres` and `@anthropic-ai/sdk` and touching
one symbol from each so nothing is tree-shaken away, plus one route gated with `withX402` that returns
a 402. `runtime = "nodejs"` set explicitly rather than trusting tree-shaking.

⚠️ **This is also SM-09's deferred half arriving early.** A production build is where ESM directory
imports fail, and `@hashgraph/hedera-wallet-connect` is known to break in Node exactly that way. Better
to meet it here than in the staking page.

**Proof:** the deployed function's bundle size per route, printed. A 402 challenge captured from the
live URL advertising `hedera:testnet` and feePayer `0.0.7162784`. ⚠️ **If it does not fit, stop and
re-plan** — the branch is splitting heavy routes (R23) or keeping tokenization in `scripts/` and out
of the app.

---

# Unit 2 — `config/analysts.ts`

**SCAFFOLD, ~60 lines**

**What we're doing:** giving the analyst an identity that exists in a file rather than in a function
argument. This is the prerequisite for everything on-chain: `Report.analyst` is inside the report
hash, and the leaderboard and the Arc claim both key on it.

**What's in it:** one row per analyst — id, display name, **Arc address (the Circle developer-controlled
wallet)**, Hedera account id (the x402 `payTo` and the ATS issuer), and its Hedera EVM address. Same
shape as `config/protocols.ts`: adding an analyst is adding a row.

⚠️ **`execute` stops taking an address and starts taking an analyst id.** The address comes from
config, so a report cannot be attributed to something nobody registered.

**Proof:** SM-08's open assertion finally runs — `analysts.ts`'s Arc address **equals** the provisioned
Circle wallet `0x1b7035bbe0da8f3bcb721863d42e1079e4a116a7`, checked against the live Circle API rather
than a constant. The Hedera EVM address derives from the ATS issuer key. A report generated through
the CLI carries the config address and hashes.

---

# Unit 3 — `agent/` — the split named

**SCAFFOLD, ~30 lines**

**What we're doing:** answering the open question from `lessons.md` before a server has to pick a
side. The report pipeline is what gets exposed; `loop.ts` and `tools.ts` are the demo path behind
`scripts/ask.ts`.

**What's in it:** `MODEL` moves out of `loop.ts` — the two files that import it, `compose` and
`narrate`, are both in the half that does not use the loop — into `config/`. `src/agent/README.md`
records the decision rather than the open question. **No files move, no directory is split.**

**Proof:** nothing in the pipeline imports `loop.ts`. `scripts/ask.ts` still runs.

---

# Unit 4 — `store/db.ts` + `store/migrations/001_init.sql`

**SCAFFOLD, ~80 lines**

**What we're doing:** somewhere for a report to live. Neon Postgres, pooled URL for routes and direct
URL for migrations, per §5.18.

**What's in it:** a `postgres` client with the two URLs, and the first migration:

| table | holds |
|---|---|
| `reports` | hash (PK), analyst, directive, **canonical JSON as text**, rendered markdown, block, observed_at |
| `report_tokens` | report hash, proxy address, ISIN, the four transaction hashes, issued_at |
| `quotes` | id, report hash, tier, price in atomic units, recipient, expires_at, state |
| `purchases` | payment identifier, report hash, payer, native tx id, settled_at, delivered_at |

⚠️ **`postgres` is a new dependency** — the plan names it and it is 0 transitive deps, but it is a
decision and it is being flagged rather than assumed.

**Proof:** the migration runs against a live Neon branch and is idempotent on re-run. A script inserts
and reads a row through the pooled URL.

---

# Unit 5 — `store/reports.ts`

**LOGIC ★, ~90 lines**

**What we're doing:** the unit that makes a report a thing that exists. Put a `Report` in, get the same
`Report` back — and prove it is the same by re-deriving its hash rather than by inspecting it.

**What's in it:** `save(report)`, `load(hash)`, `list()`. The canonical string is what is stored;
`load` parses it and `reportHash` is recomputed on the way out and compared to the primary key.

⚠️ **The hash is the id.** A report has no other identity, which means the store cannot hold two
versions of one report and a re-save of identical content is a no-op rather than a conflict.

**Proof (M2):** generate a real report through `compose → execute → narrate`, save, reload, and assert
**the canonical bytes are identical and the hash matches**. Then the negative: a row whose stored JSON
has been altered by one character fails the check on load rather than being served.

---

# Unit 6 — `app/` — the reading surface

**SCAFFOLD, ~120 lines across a few files**

**What we're doing:** the app exists and is deployed and stays deployed. No payments yet — a list of
published reports and a page that renders one.

**What's in it:** `app/page.tsx` (the reports list, from `store/reports.ts`), `app/report/[hash]/page.tsx`
(the rendered markdown, plus the analyst, the block and the hash shown as the report's identity), and
whatever layout it takes to not be embarrassing. Server components reading the store directly; no API
route needed yet.

⚠️ **`Market.name` and `Token.symbol` are indexer-supplied and reach HTML** (§5.18). Escape and bound
them here, at the first place untrusted strings become a page.

**Proof:** a public URL a stranger can open, listing real reports read from Neon, with one report
readable end to end. Deployed, and it stays deployed from this unit onward.

---

# Unit 7 — `tokenize/isin.ts`

**LOGIC, ~50 lines**

**What we're doing:** giving each report token its own identifier. SM-07 minted under the fixed
`XXALPHA00015`, which makes two reports indistinguishable by ISIN.

**What's in it:** a deterministic ISIN derived from the report hash, with the check digit computed by
the Luhn variant ISINs use. The check digit is validated **on-chain**, so a wrong one reverts a paid
deploy.

**Proof:** the generator reproduces three known-good real ISINs (as the research note's did), and the
ISIN for a given report hash is stable across runs. ⚠️ **Uniqueness is ours to supply — nothing
on-chain enforces it.**

---

# Unit 8 — `tokenize/ats.ts`

**LOGIC ★★, ~110 lines**

**What we're doing:** a persisted report becomes an asset on Hedera testnet. This is the file the
Tokenization track is judged on.

**What's in it:** `deployEquity` through the public factory with `maxSupply: 1n`, `REG_S`/`NONE`,
compliance off, and **`additionalSecurityData.info = "alpha:" + reportHash`**; then `grantRole(ISSUER)`;
then `issue(1)` to the analyst's Hedera EVM address. The proxy address, ISIN and four transaction
hashes are written to `report_tokens`.

⚠️ **Every revert goes to Mirror Node for its reason.** ethers returns `"transaction execution
reverted"` with `error.data` undefined on the Hashio relay — the selector exists only in
`/api/v1/contracts/results/{hash}`. Without that lookup a failure is unattributable and the temptation
is to change something and pay for another deploy.

**No expiry contingency, settled 2026-09-08 (M3).** This unit used to carry a mint-before-the-10th
or self-deploy decision; it does not. Hedera has not enabled contract rent on any network, so the
public factory's 2026-09-10 date is inert. R3's own deploy stays the fallback, unchanged and untaken.

⚠️ **Pre-minting the demo tokens is a Phase 5 rehearsal item, and not for expiry reasons.** A live
mint on camera runs against a factory 32 distinct accounts are hammering daily, on a public relay,
with a 6.7M-gas transaction whose revert reasons only exist on Mirror Node — that has its own failure
modes, and none of them are ones you want to meet while recording. At **$0.66 for the full lifecycle**
it is the cheapest insurance in the project. Minting ahead and demonstrating against a token that
already exists costs nothing the video needs.

**Proof:** a token issued for a **real** report; the `EquityDeployed` log read back and the
`alpha:<hash>` string asserted equal to `reportHash(report)` from the store; `balanceOf(analyst) == 1`;
`scripts/ops/verify-ats.ts <address>` returns `exact_match`. Cost printed against SM-07's measured
8.139 HBAR so a drift is visible.

---

# Unit 9 — PLAY GAP: look at the asset

**PLAY — no file, and it is a numbered unit so it does not get skipped**

Publish one report token and then stop building. Open it on HashScan. Read the creation event and
find the hash in it by eye. Call `balanceOf`. Run the verifier and watch the source render. Look at
what an ATS asset with compliance off actually *is* before anything is wired to it.

**Two questions to come out with answers to:**

- **SM-07's open to-do:** the hash is event-only. Is that enough, or does it also go in
  `setCustomData(keccak256("report"), [hash])` — a second transaction and a `ROLE_CUSTOM_DATA_MANAGER`
  grant? ⚠️ Decide with the asset in front of you, not from the plan. PLAN §1 currently specifies the
  event.
- **What a buyer actually receives**, in enough detail to describe it on camera.

**Output:** a `logs.md` entry, and a `DECISIONS.md` entry if the `setCustomData` answer is yes.

---

# Unit 10 — `tokenize/transfer.ts`

**LOGIC, ~70 lines**

**What we're doing:** the lifecycle operation H2.4 asks to see, performed on a real report rather than
on SM-07's fixture.

**What's in it:** `transfer(reportHash, toEvmAddress)` — read the proxy from `report_tokens`, assert
the sender holds 1, transfer, assert both balances moved, record it. ⚠️ **Balances are asserted, never
eyeballed** — SM-07's own finding was that proxy creation is not issuance and a receipt is not a
balance change.

**Proof:** 1 → 0 and 0 → 1 on a token that carries a real report's hash, with the report readable at
its URL and the hash in the creation event matching what the page shows.

---

# Unit 11 — PLAY GAP: move a real report

**PLAY — numbered**

SM-07 moved a token with fake data. Do it with a report someone could actually read, in the shape the
video will need: issue, show the configuration, transfer, show the balance move.

**And break it on purpose, here rather than on camera:** transfer to an address that has never
touched the token (it should just work — compliance is off, and that is worth seeing rather than
trusting). Transfer twice. Transfer with the issuer out of HBAR. Point it at a report hash with no
token.

**Output:** a `logs.md` entry naming which failures are legible and which are not, and any that need a
better error before the demo.

---

# Unit 12 — `payments/server.ts` + `app/api/health/route.ts`

**LOGIC, ~70 lines**

**What we're doing:** the x402 resource server, constructed in the one way that does not take the
whole deployment down.

**What's in it:** a lazily-constructed `x402ResourceServer` with `HTTPFacilitatorClient` pointed at
`api.testnet.blocky402.com` and `ExactHederaScheme` registered for `hedera:testnet`, built **inside
the route** and wrapped in try/catch returning 503 with a diagnostic (§5.17, R26). Plus a health route
that fetches `/supported` and asserts the network **and the expected feePayer** are advertised.

**The health route also reports the ATS resolver.** One Mirror Node GET on `0.0.9212226` returning its
`expiration_timestamp` and `deleted` flag. It gates nothing and blocks nothing — it exists because the
whole ATS path rests on a third party's contract, and an assumption printed on a page is worth more
than the same assumption living in a decision record nobody re-reads. If Hedera ever enables contract
rent, this is where we find out.

⚠️ **This closes R12's outstanding startup feePayer assertion**, and it does it at health-check time
rather than in the request path — which is the whole point, because the alternative crash-loops every
gated route and looks like a platform outage.

**Proof:** `/api/health` reports the facilitator's advertised capability from the live host, and the
ATS resolver's expiry and `deleted` flag beside it. A deliberately wrong network string produces a
503 with a readable reason and **the rest of the app still serves.**

---

# Unit 13 — `payments/quotes.ts`

**LOGIC, ~60 lines** *(was ★ and ~90 — the Own tier took the judgment out of it)*

**What we're doing:** freezing what is being sold and at what price, before the 402 goes out.

**What's in it:** `quote(reportHash)` → a row in `quotes` with the price as an `AssetAmount` in
tinybars (⚠️ **never a `"$…"` string — it throws on HBAR**) and an expiry inside the ~120-second
Hedera validity window.

⚠️ **No recipient, no inventory reservation, no tier.** The Own tier is cut (decision 3), so nothing
is being held against a supply of one and there is no second identifier to bind. The `quotes` table
keeps its `tier` and `recipient` columns nullable rather than dropping them, because re-adding a
column is cheaper than re-deriving why it was there.

⚠️ **Pricing is deterministic and stated up front**, per the spec research: `upto` has no Hedera
binding, and `setSettlementOverrides` is not scheme-gated in code — calling it on a Hedera exact route
produces a generated report, a 200, and a failed settle. A free report. **Quote before work, always.**

**Proof:** a quote round-trips through the store and expires. A quote for a report that does not exist
returns nothing rather than a price. The same report quoted twice gives the same price.

---

# Unit 14 — `payments/gate.ts` + `app/api/reports/[hash]/route.ts`

**LOGIC ★★, ~110 lines**

**What we're doing:** the checkpoint. One route, one branch table (§5.19), and the rule that the
buyer is never charged for something they did not get.

⚠️ **`withX402` is CONFIRMED correct — verified against the installed 2.25.0 on 2026-09-08, do not
re-open this.** A recommendation was made to switch to `withX402FromHTTPServer`, on the strength of
this repo's own research note calling it *"Same, with a pre-built `x402HTTPResourceServer` (for
hooks)"*. Reading `node_modules` reversed it:

- **`withX402` IS `withX402FromHTTPServer`** — `@x402/next/dist/esm/index.js:452` constructs the HTTP
  server and delegates. One code path.
- Both take the identical handler type `(request: NextRequest) => Promise<NextResponse<T>>`, and
  `index.js:415` calls it with the bare request. **The handler gets no payment context either way.**
- **Eight of the nine hook methods live on `x402ResourceServer`** — the object `withX402` already
  takes: `onBeforeVerify`, `onAfterVerify`, `onVerifyFailure`, `onBeforeSettle`, `onAfterSettle`,
  `onSettleFailure`, `onVerifiedPaymentCanceled`, `registerExtension`. Runtime-verified on the
  prototype, not read off the types. So the `purchases` row is written by chaining
  `.onAfterSettle(…)` onto the server before wrapping — no construction change.
- `x402HTTPResourceServer` adds exactly one: `onProtectedRequest`, which can return
  `{grantAccess: true}`. **Phase 3 is "serve once" (§5.19), so it is not needed.** It becomes
  necessary only if re-access by address is ever built — which is Unit 18, the cut point.

**Also confirmed:** `payTo` accepts `string | DynamicPayTo`, so the route resolves the *report's own
analyst's* `payTo` per DECISIONS 2026-09-08 rather than an env var.

**What's in it:** `withX402` on the route with the default **`authorization`** flow, so a handler
failure means settle never runs and nobody is charged. ⚠️ **Three branches, not seven** (§5.19 as
amended): unpaid → **402**; just settled, payment-identifier matched → **serve once**; otherwise →
**preview**.

⚠️ **The four Own rows are out of scope** — holder-serves-free, reserve-and-402, already-owner, and
sold-409 all belong to a tier that is cut. `balanceOf` is therefore **not read at all in Phase 3**,
which also removes the never-cache-it rule and the ownership-RPC 503. When Own returns, those rows are
additive on a checkpoint that already exists.

⚠️ **The handler only ever reads an already-persisted body** (§5.7). If it ever generates, the
120-second validity window is on the critical path and the failure mode is a charge with no delivery.

**Proof:** an unpaid request returns **402, not 500**, with a challenge naming the price and the
feePayer. A handler forced to throw leaves the buyer uncharged — verified against the Mirror Node
record, not against our own log. The preview path serves something useful to a stranger who has not
paid.

---

# Unit 15 — `payments/buyer.ts`

**LOGIC ★, ~90 lines**

**What we're doing:** the agent that pays. H1.3 needs a platform **or agent** consuming the service
with at least one real paid request, and this is the on-camera payer.

**What's in it:** an `x402Client` with **explicit `spendControls`** — HBAR opted in by asset with its
own atomic per-payment cap, never `spendControls: false` — plus our own cumulative daily counter,
because the library's control is per-payment only. The native transaction id is recovered from the
signed bytes with `inspectHederaTransaction()` and **persisted before settle**. Mirror Node is polled
for ingestion before the first payment after any funding.

⚠️ **The autonomy claim is narrow and should stay narrow:** the buyer decides whether the quoted price
is worth paying against a cap, unattended. That is what "agent" means here. It is not a language model
deciding to shop.

**Proof:** one real paid request end to end against the deployed app, settled through Blocky402, with
the HashScan link. The buyer refuses a price above its cap and says which control refused it. A
payment quoted in an asset it has not allowlisted is refused **before anything is signed**.

---

# Unit 16 — PLAY GAP: buy one, then break it

**PLAY — numbered, and the most valuable of the three**

Run the buyer against the deployed app and watch the whole loop: 402, challenge, partial signature,
facilitator co-signs and submits, content returns, money moved. Check the Mirror Node record —
**not a balance diff**, which SM-05 already proved reads as a fee-free payment when it is really a
stale read.

**Then break it, deliberately, here rather than in a demo:**

- Kill the response after settlement. The buyer has paid and has nothing. What does a retry do today?
- Pay twice for the same report.
- Buy a report, then read it again.
- Point the buyer at a report hash that does not exist.
- Take the facilitator away mid-flight.

⚠️ **This is the unit that tells us what Unit 17 has to be.** Write down what actually happened for
each, because two of these are the exact failures §5.8 and §5.9 were written for and the third is one
nobody predicted.

**Output:** a `logs.md` entry per failure, and Unit 17's scope rewritten from it rather than from the
plan.

---

# Unit 17 — `payments/recover.ts`

**LOGIC ★, ~90 lines**

**What we're doing:** the hardening, sized by what Unit 16 found rather than by what §5.8 guessed.

**What's in it, expected:**

- **Ambiguous settlement (§5.8).** A Hedera settle failure returns `{success: false, transaction: ""}`
  whether it failed or timed out after broadcasting. Decode `payload.transaction` with
  `Transaction.fromBytes`, extract the native transaction id and its validity window, and **query
  Mirror Node before deciding "failed."** Without this a timed-out buyer either pays twice or gets
  nothing.
- **Read-delivery recovery (§5.9).** `@x402/extensions`' `payment-identifier` — server↔client, no
  facilitator involvement, works on Hedera — with a server cache keyed by payment id, so a retry
  returns the same response rather than a fresh 402.

⚠️ **Idempotency is the cleanest defence available**, precisely because Hedera's settle gives nothing
to reconcile against on timeout. There is no duplicate-settlement cache in the SDK for Hedera; it
relies on network-level transaction-id uniqueness.

**Proof:** replay Unit 16's failures and watch them recover. A settle that times out after broadcast
is resolved to the real outcome from Mirror Node rather than double-charged. A repeated request with
the same payment identifier returns the cached body and does not settle again.

---

# Unit 18 — `payments/auth.ts` — human identity

**LOGIC, ~70 lines** · ⚠️ **THE CUT POINT. Everything above this is the phase.**

**What we're doing:** letting a person **identify themselves** — not buy. A signed EIP-191 challenge
proving which address someone controls, so a purchase can be attributed to them and re-read later.
⚠️ **x402 stays agent-to-agent** (decision 4); this unit does not make a human a payer and is not
meant to.

**What's in it:** a challenge with a **nonce, domain binding, expiry and single consumption**, verified
with `ethers.verifyMessage`, and a session the gate can read. §5.4's four-step sequence minus the two
steps the Own tier owned — ⚠️ **there is no recipient to capture into a frozen quote and no inventory
to reserve**, so what is left is address proof and nothing else. That is why this is ~70 lines against
§5.4's implied sprawl.

**Why it is here and not earlier.** Ordering it last is the whole point: **cutting it costs product
surface and no requirement.** H1.3 accepts *"a platform **or** agent"* and Unit 15 already satisfies
it. ⚠️ If Phase 4 needs the days, this is what does not get built, and nothing above it moves.

**Proof:** a browser wallet signs the challenge and the server resolves it to the right address. A
replayed challenge is refused. An expired one is refused. A challenge signed for a different domain is
refused.

⚠️ **The boundary, stated so nobody reads it as unfinished work:** a person proving an address is not
a person paying, and that is the decision rather than the limitation. `@x402/paywall` has **no Hedera
export**, so a browser x402 payment would need a WalletConnect Hedera signer built from scratch — and
the requirement does not ask for one. **A human way in, if we want one, need not be x402 at all, and
it is a Phase 5 question.**

---

## The ending goal

**Hand a directive to the analyst and watch it publish a report to a public URL. Then watch a second
agent — with its own wallet and its own spend cap, unattended — hit the price, pay for it on Hedera
through Blocky402, and read it. Open that report's ATS token on HashScan and find the same 32-byte
hash in the creation event that the page shows.**

And the sharper one, which is the part that is hard:

**The buyer is never charged for a report it does not receive, and a lost response does not become a
second payment.**

Phase 1's goal was *ask a question, watch it query five protocols at a common block.* Phase 2's was
*a directive becomes a hashed report.* Phase 3's is **that report becoming something someone else can
find, buy, and verify without asking us.**

⚠️ **Not "own."** The Own tier is cut, so a buyer receives the report and not the token. The token
exists per report and its transfer is demonstrated (Unit 10) — which is what H2.4 asks for — but
nothing in the purchase path moves it.

---

## Requirements

### Closed by this phase

| # | Requirement | Closed by |
|---|---|---|
| **H1.1** | Live x402-gated service on Hedera testnet | Unit 14, deployed |
| **H1.2** | Settled through Blocky402 | Unit 12 — `api.testnet.blocky402.com`, asserted at health check |
| **H1.3** | A platform **or agent** consuming it, ≥1 real paid request end to end | Unit 15 |
| **H2.1** | Use ATS (SDK, contracts, web app, or combination) | Unit 8 — contracts + ethers |
| **H2.2** | Deploy and demonstrate on Hedera testnet | Unit 8 |
| **H2.3** | Contracts verified on HashScan where applicable | ⚠️ **Already satisfied by SM-07's token.** Unit 8 re-satisfies it per report |
| **G2.3** | Meaningful work | Was closed in Phase 2. A paid, tokenized report strengthens it |

### Set up, not closed

| # | Requirement | State after this phase |
|---|---|---|
| **H2.4** | Video showing issuance, **configuration**, and ≥1 lifecycle operation | ⚠️ All three are **demonstrable** after Unit 10. The video is Phase 6, and configuration must be on camera. **This requirement is why the Own tier could be cut:** it asks for a lifecycle operation, not a lifecycle operation *caused by a payment* — `transfer` standalone satisfies it |
| **A1–A6** | All three Arc prizes | ⚠️ **Not closed, and this is the honest limit of Phase 3.** *"Working frontend and backend"* is pass/fail on all three and Unit 6 delivers a real one — but A2 (autonomous USDC settlement), A4 (programmable money flows) and A5 (meaningful use of Arc) need value moving **on Arc**, which is Phase 4's market. A deployed app that sells Hedera reports does not satisfy an Arc prize |
| **H1.4** | README covering setup, architecture, **payment flow** | The payment flow becomes describable. Writing it is Phase 6 |
| **G1.6 · G2.5 · E-series** | Repo, README, video, attribution | Unchanged — Phase 6 |

### Not earned, and we do not claim it

| # | | |
|---|---|---|
| **H1.6** | Metering | Dropped — fixed pricing is a locked constraint, and `upto` has no Hedera binding |
| **H1.7** | HTS in the settlement path | ⚠️ **Forfeited on testnet by pricing in native HBAR (`0.0.0`).** Not permanently: it returns at the **mainnet/USDC cutover at the end of Phase 4**, since USDC is HTS. Stated plainly rather than left implied |
| **H2.5** | A secondary market ATS lacks | Issuer→first-buyer is a primary sale. **Unearned** |

---

## Where §9 is now wrong

Amend the plan rather than carrying two documents that disagree.

| § | Says | Reality |
|---|---|---|
| **§9 Phase 0** | "deploy empty app, **ticker workflow**" among the Phase 0 gates | ⚠️ **Neither was ever done.** No app, no `.github/workflows/ticker.yml`. Phase 3 inherits the app — **Unit 0 provisions it and Unit 1 proves it deploys**; the ticker is not needed in this phase at all |
| **§9 Phase 3** | file list: `ats.ts`, `auth.ts`, `quotes.ts`, `gate.ts`, `recover.ts`, `buyer.ts`, **`verify-ats.ts`** | `verify-ats.ts` **was built in Phase 0** (Unit A) and answered U11. Remove it from the phase |
| **§9 Phase 3** | that file list, entire | ⚠️ **Omits storage, the app, and analyst identity** — the three things without which none of the six listed files can run. §9 assumed an app deployed in Phase 0 |
| **§9 Phase 3 exit** | "token-holder isn't charged on either read" | ✅ **Struck 2026-09-08, and §9 is amended.** The Own tier is cut, so in Phase 3 no buyer holds a token and the clause has nothing to describe. The amended exit is in §9 |
| **§5.3 vs §5.4** | §5.3 cuts human buying entirely; §5.4 builds an EIP-191 EVM session so a **human** can prove an address for the Own tier | ✅ **Resolved 2026-09-08, and both are amended.** §5.3 overstated it: human buying is **deferred, not cut** — it is Unit 18 and the declared cut point. §5.4's scope narrows to address proof, because the recipient binding went with the Own tier |
| **§9 Phase 2** | "**Two forms:** balance overview, forecast attachment" · §5.18 "Two report forms, not four" | ⚠️ **Forms were removed entirely** in Phase 2. `Report.form` is always `null`. Both lines are superseded |
| **§5.11** | narrator returns `{sections:[{id,paragraphs:[{text,factRefs}]}]}` | The tool takes **one table string**; `narrate` maps it into the wire shape. The contract is unchanged, the description is stale |
| **§5.11** | "Deterministic template fallback when the narrator returns something unresolvable" | Never built, and Phase 2 found the failure it guards against is a schema bug rather than a model one. Drop it or schedule it |
| **§5.14 / R27** | (already amended) | Retired for Ethereum. ⚠️ **Arc's own RPC is not archive** — relevant to Phase 4, not here |
| **§1 chain table** | x402 in USDC; "mainnet remains a config revision if funding appears" | ✅ **Amended 2026-09-08.** Testnet in **HBAR**; the mainnet/USDC cutover is **scheduled for the end of Phase 4**, gated on an exchange withdrawal. H1.7 forfeited meanwhile. ⚠️ **Arc stays testnet** — Arc mainnet is 2026-09-16, after the deadline |
| **`docs/research/x402-next-2.25.md`** | "Install with `--legacy-peer-deps` on the existing Next 15", "Verdict: USDC" | ✅ **Both marked superseded in the note itself, 2026-09-08.** DECISIONS chose **Next 16** (the supported peer), and SM-05 measured HBAR working once opted into the spend-control allowlist |
| **`docs/research/x402-protocol-spec.md:258`** | "Blocky402 does not support `hedera:testnet`" | ✅ **Corrected 2026-09-08** with the original quoted, the live `/supported` response from the testnet host, and why it mattered. ⚠️ It was open for two days — the sentence R12 rests on, in the note someone reads first |

**Impossible or pointless, given what was measured** — stop planning around these: refunds (no
primitive on any chain today), splitting a sale between analyst and source (rejected at the
facilitator), bazaar discovery (Blocky402 advertises `extensions: []`), prepaid balances and
subscriptions (EVM/SVM only), and a browser wallet-connect purchase (`@x402/paywall` has no Hedera
export).

---

## Drift signals

- **A report generated inside a route handler.** §5.7 exists so the ~120-second Hedera validity window
  is never on the critical path. The moment generation moves into the gate, a charge with no delivery
  becomes reachable.
- **`spendControls: false` anywhere.** The error message helpfully suggests it. It turns an autonomous
  buyer into something that pays whatever it is asked.
- **`paymentProxy` appearing anywhere.** It charges for failed responses, measured, and the README says
  so.
- **`balanceOf` appearing in the gate at all.** It belongs to the Own tier, which is cut. If it shows
  up, the tier is creeping back in without a decision — and the never-cache-it rule comes back with it.
- **`auth.ts` being built before Unit 17.** It is the declared cut point. Building it early spends the
  days Phase 4 is meant to have, on the one unit that costs no requirement to drop.
- **A report hash that differs after a database round trip.** Canonicalization or the column type is
  wrong. Fix it here — in Phase 4 this is a settlement dispute.
- **Two ATS tokens carrying one report hash.** `maxSupply: 1` makes a second issue impossible on one
  proxy; nothing stops a second *proxy*. The store is what enforces it.
- **The ATS SDK in `package.json`.** 1.4 GB, no server-side signer, and it would end the deployment.
- **`setSettlementOverrides` on a Hedera route.** Not scheme-gated in code; produces a free report.
- **An analyst address in `analysts.ts` that differs from the Circle wallet.** Claims get attributed to
  an address the chain never saw.
- **The app growing features while the market is unbuilt.** Phase 4 is CORE and never-cut. A beautiful
  reports page and no market loses three prizes.
- **A play gap skipped because the next unit was ready.** They are numbered for this reason.

---

## If it does not fit

The deadline is **2026-09-13** and Phase 4 has not started. In cut order:

⚠️ **The Own tier was cut on 2026-09-08 and is no longer on this list** — it was item 1, and it is
taken. What remains, in order:

1. **Unit 18 (`auth.ts`)** — the declared cut point, and the reason it sits last in the phase. ⚠️
   Buying is agent-to-agent either way (decision 4), so what is lost is a person being able to
   *identify* themselves, not a person being able to buy. **Costs product surface and no
   requirement.**
2. **Unit 7 (`isin.ts`)** — mint every report under the fixed ISIN as SM-07 did. Nothing on-chain
   enforces uniqueness, and no requirement asks for it.
3. **Unit 11 folds into Unit 9** — one play gap covering issue, configure and transfer rather than two.
4. **Unit 17 shrinks to the payment-identifier cache only** — idempotency is the cleanest defence and
   it is half the file. ⚠️ Dropping §5.8's Mirror Node recovery entirely means a timed-out buyer can
   pay twice, so this is the last thing to cut, not the first.

**Never cut in this phase:** persistence (Unit 5 — nothing downstream exists without it), the gate's
`authorization` flow (the only refund-substitute available), the native-tx-id-before-settle rule, and
the deployed app.

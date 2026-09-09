# Phase 4 — where it attaches

*A seam sweep, done before the building instead of after.*

⚠️ **A sibling file rather than a section of `PHASE-4-draft.md`, and here is why.** The draft is a
**decision record** — five questions, three judgements, one reversal, three things open. This is a
**structural survey**: which existing export a new caller reaches for, what it returns, and where the
shape does not fit. The two get read at different moments — the draft when deciding, this when
writing a unit brief — and folding ~600 lines of attachment detail into the draft would bury the
decisions it exists to hold. `PHASE-3.md` set the same precedent: a per-phase working document beside
the decision record, not inside it. A pointer has been added to the draft so neither is findable
without the other.

⚠️ **Everything below was read before it was written.** This project has been wrong five times about
configuration that looked live and was not, and once about a package capability taken from a research
note rather than the installed source. Every claim about an existing function names its file; every
claim about a package quotes the installed typings or the shipped bundle. **Two findings in section 2
contradict things this project currently believes**, and both were found by reading
`node_modules/`.

⚠️ **This does not design the contract.** §5.2 holds the interface and the `msg.value` question is
deliberately open (draft 6.1). This is about how the subsystem attaches to the repo.

---

## The short version

**What is clean and needs nothing:** the report load path, the hashing primitives, the settlement
read, the analyst lookup, the evidence builder, and the server-component/client-component/API-route
shape the staking page needs.

**What has to be written from nothing:** the contract and its build, `src/arc/` entirely, `spec.ts`,
market persistence, scoring, two cron routes, and the browser wallet half — for which **this repo
contains no precedent at all**.

**The seams that would pass their own proofs and still not complete a cycle:** evidence has a builder
and no destination · `evidenceHash` commits bytes nothing stores · `claimId` has no round trip ·
the market subject cannot be rebuilt from a `FactId` · the analyst's Arc identity has no guard on an
unattended path · the ledger and the market row must share a transaction this repo has never used.

---

# 1 · The connection points

## 1.1 Reading a report to derive a market subject

| need | existing | verdict |
|---|---|---|
| load one report by hash | `src/store/reports.ts::load(hash) → Promise<Report \| null>` | ✅ **clean** |
| find reports without a market | `src/store/reports.ts::list(limit = 50) → Promise<ListedReport[]>` | ⚠️ **does not fit** |
| the figure the report is about | `Report.subject.headline: FactId` → `Report.facts[headline]: Fact` | ⚠️ **nearly fits** |

**`load` is exactly right and is better than "it works".** It parses the `Report` out of
`canonical_json` and never reassembles it from columns, then runs two checks — recomputed hash
against the primary key, and stored-bytes-are-canonical — and **throws** rather than warning on
either. Its own comment says why: *"this hash is the identity an ATS token commits and an Arc market
settles against."* A market binding to a report gets, for free, the guarantee that the 32 bytes it
commits are the 32 bytes of what is stored.

**`list()` cannot express the commit cron's question.** `ListedReport` is
`{hash, analyst, directive, block, createdAt}` — newest-first, limit 50. The cron needs *reports with
no market row*, which is a `LEFT JOIN` against a table that does not exist. ⚠️ **This is the kind
that needs a new query, not a new parameter** — adding a `hasMarket` filter to `list()` would make
the reports store import the market schema, which is the coupling `store/tokens.ts` was split out to
avoid. The right shape already exists to copy: `store/tokens.ts::tokensFor(hashes) → Map<string,
ReportToken>`, one query for a page rather than one per row.

**The subject is where it gets interesting.** `Fact` carries what a market subject needs and one
thing it does not:

```ts
export interface Fact {
  readonly id: FactId;  readonly label: string;      // "Total deposits" — "Never contains a number"
  readonly value: Decimal | null;  readonly unit: FactUnit;
  readonly slug: string;           // ✅ the deployment slug
  readonly deployment: string;     // ✅ the subgraph deployment hash
  readonly block: number;  readonly corroboration: CorroborationStatus;
  readonly withheld: Withheld | null;
}
```

⚠️ **There is no field name on a `Fact`.** To settle *"will `totalDepositBalanceUSD` on aave-v3-ethereum
exceed $T on day D"* the resolver must know which snapshot column to read. `Fact` gives the
deployment (`slug`), the scale (`unit`) and the value — but the column name exists only inside
`execute.ts`'s `FIGURES` / `MARKET_FIGURES` tuples (`execute.ts:114`, `:123`) and is folded into the
`FactId` string as a suffix (`${slug}.${field}`, or `${slug}.${marketId}.${field}` for a market row —
`execute.ts:270`). Nothing parses it back.

**Two options and both have a cost, so it is worth naming now:**

- **Parse the `FactId` suffix.** Free, and fragile: the delimiter is `.` and a market id can contain
  one, so a three-part id and a two-part id are not separable by splitting alone.
- **Add the field name to `Fact`.** ⚠️ **This changes `Report`, which changes the hash, which
  invalidates every stored report** — eight of them, four tokenized, with the hashes already
  committed in ATS creation events on chain. This is not a migration; it is a new schema version.

⚠️ **So the practical answer is a Phase 4-side mapping from `FactId` to a settlement subject, and
that mapping is a thing somebody has to own.** It does not belong in `Fact`.

**One more, and it is the `null` case:** `Report.verdict.call` is `VerdictCall | null`, and the type
comment records that it is **`null` on a report about a metric across deployments**. Any logic
deriving a committed side from the verdict must handle a report that has no verdict — and a ranking
report is exactly the kind a market would look attractive against.

## 1.2 `specHash` and `evidenceHash`

| need | existing | verdict |
|---|---|---|
| canonical bytes of anything | `src/domain/canonical.ts::canonical(value: unknown) → string` | ✅ **clean** |
| SHA-256 of those bytes | `src/domain/canonical.ts::hashCanonical(value: unknown) → string` (64 hex) | ✅ **clean** |
| the report's own identity | `reportHash(report) → string` · `reportHashBytes(report) → Uint8Array` | ⚠️ **one nearly-fits** |

**`canonical` takes `unknown` on purpose and this is the intended use.** Its header: *"JCS is
shape-agnostic, and the same bytes must come out whether the input is a `Report`, a raw query
response, or a conformance vector — one implementation serving every caller is the point."* So
`specHash = hashCanonical(spec)` and `evidenceHash = hashCanonical(record)` need **no new code**, and
writing a second hasher is explicitly forbidden by that file: *"If you find yourself writing another,
stop."*

⚠️ **One property to know rather than discover.** `canonical()` is *not* pure JCS — `strip()` removes
any key named `atsTokenAddress` **at every depth**. The header already records this is a no-op on
subgraph responses. It is equally a no-op on a market spec, unless a spec ever carries that key.
Clean today; a thing to not name a field.

⚠️ **`reportHashBytes` returns the wrong representation for Arc, and the fix is one line rather than
a rewrite.** It exists for the `bytes32` in the ATS path, where typechain/ethers takes bytes. Circle
does not: `CreateContractExecutionTransactionInput.abiParameters` is `Array<any>` and the typing's own
doc says *"Supported types include string, number, and boolean."* So the Arc call passes
`` `0x${reportHash(report)}` `` — a hex string off the existing function. **Signature fits, encoding
differs by caller.** Contrast with the `transfer.ts` signer problem, which was a module that could
not express the question; this is a string concat.

## 1.3 The settlement read

| need | existing | verdict |
|---|---|---|
| query one deployment | `src/graph/client.ts::querySubgraph<T>(slug, document, variables?, block?) → Promise<QueryResult<T>>` | ✅ **clean, and it is the intended caller** |
| the daily-snapshot document | `src/graph/queries/snapshots.ts::FINANCIAL_SNAPSHOTS`, registered `'financial-snapshots'` | ✅ **clean** |
| walk a population | `src/graph/paginate.ts::paginate<T>(...)` | ⛔ **wrong tool — and not needed** |

`client.ts`'s own header names this caller: *"Phase 4's settlement calls the same function to re-read
the value a market resolves against — which is what makes The Graph load-bearing end to end (G2.1)."*
Omit the `block` argument and the read is unpinned at the head — `client.ts:214`,
`const vars = block === undefined ? variables : {...}`.

⚠️ **Do not reach for `paginate()`, and the reason is specific.** It cursors on `lastId` —
`paginate.ts:56` sends `{ ...variables, first: pageSize, lastId }` and breaks only on a short page.
`FINANCIAL_SNAPSHOTS` declares `$first, $skip, $startTimestamp, $endTimestamp, $block` and **no
`$lastId`** (grep: 0 occurrences; `markets.ts` has 4). A day window returns one row, so
`querySubgraph` with `first: 1, skip: 0` is correct and pagination is not needed at all. Worth
stating because `execute.ts` reaches for `paginate` on markets and the habit transfers wrongly.

⚠️ **A boundary detail that belongs in `spec.ts` before it is a settlement dispute.** §5.16's
missing-day rule is `timestamp ∈ [D, D+86400)` — half-open. The document filters
`timestamp_gte: $startTimestamp, timestamp_lte: $endTimestamp` — **`lte`, closed.** A snapshot
written at exactly `D + 86400` satisfies both day `D`'s closed window and day `D+1`'s. The window
passed must be `D … D + 86399`, or one row belongs to two days.

⚠️ **The freshness signal exists only because settlement is unpinned.** §5.16 requires
`_meta.block.timestamp ≥ dayEnd + margin`. `QueryResult.meta` carries it — **but `client.ts` pins
`_meta(block: $block)` whenever a block is requested, and a pinned `_meta` returns a null timestamp,
measured consistently** (`execute.ts:130`, and `client.ts`'s own note that the freshness signal *"is
what this costs"* on a pinned read). Settlement reads unpinned, so it is fine. **Pinning it later
would silently delete the freshness check** rather than break it.

`BOTH_BOUNDS_REQUIRED` is exported from `snapshots.ts` and the document makes `$endTimestamp`
non-null, because SM-03 found `timestamp_gte` alone false-passes — rows come back looking right while
silently including everything newer. That mistake is already unavailable.

## 1.4 Evidence

`src/graph/evidence.ts::buildEvidence(result: QueryResult, opts?: { tier?, completeness?, rowCount? })
→ EvidenceRecord` — ✅ **already implements §5.18's two tiers and needs no change.** `EvidenceTier` is
`'record' | 'record+raw'`, set by the caller and never inferred, and the file's own doc names Phase
4's resolver as the `record+raw` caller. `raw` is `canonical(result.data)` when the tier asks for it.

⚠️ **And nothing anywhere persists an `EvidenceRecord`.** Its only caller in the repo is
`scripts/demo/evidence.ts`. What a `Report` stores is `Provenance` (`types/wire.ts`):

```ts
export interface Provenance {
  readonly deployment: string;  readonly block: number;  readonly timestamp: Timestamp;
  readonly document: string;    readonly variables: Readonly<Record<string, JsonScalar>>;
}
```

**No `responseHash`. No `raw`. No `completeness`. No `rowCount`.** So the settlement-grade evidence
the plan requires has a correct builder and no destination. This is seam 1 in section 3.

## 1.5 Persisting markets, claims, stakes and scores

**Nothing exists.** Five live tables — `reports`, `report_tokens`, `quotes`, `purchases`,
`token_transfers`. `db()` from `store/db.ts` is the shared, lazy, memoized pooled client every module
should use, and adding tables is a fifth `.sql` file applied in filename order by
`scripts/ops/migrate.ts`, every statement `IF NOT EXISTS`.

⚠️ **Two live writer conventions, and picking the wrong one is how `store/tokens.ts`'s header became
false for a day.** `store/reports.ts` reads *and* writes. `store/tokens.ts` is **read-only** and its
header says so explicitly — the table's two writers are `tokenize/ats.ts` (insert, in the same call
that deploys) and `tokenize/transfer.ts` (update, after asserting balances). The reasoning is sound:
*"a row written anywhere else could name an asset nobody minted."* The same argument applies to a
market row written outside the call that created the market on chain. Section 4.

⚠️ **`tokenize/ats.ts` leaks two `pooled()` clients** (documented at both sites, plus a third in
`scripts/ops/tokenize.ts:108`). `pooled()` **constructs**; `db()` is the memoized one. A new
subsystem copying `ats.ts` wholesale would copy the leak.

## 1.6 Resolving an analyst to its Arc address

`src/config/analysts.ts::analyst(id) → AnalystConfig` and `analystByArcAddress(addr) → AnalystConfig`
— ✅ **clean, and it is already the exact pattern Phase 4 wants.** `Report.analyst` holds the
`arcAddress`, so `analystByArcAddress(report.analyst)` returns the row; both `ats.ts::prepare` and
`transfer.ts::prepare` open this way. Both throw rather than returning `null`, deliberately, because
*"every caller is on a path that ends in a token, a payment challenge or an on-chain claim."* Case
handling is already right — the compare is case-insensitive because EIP-55 casing is checksum
information, not identity.

⚠️ **But the guard that makes this safe does not exist on an unattended path.** `AnalystConfig` has
no `circleWalletId`; the wallet is a single env var, `CIRCLE_WALLET_ID`. The assertion that it
resolves to the row's `arcAddress` lives in `scripts/ops/verify-analyst.ts` — **a read-only CLI that
a cron never runs.** Compare `ats.ts:132`, which refuses in-path when `HEDERA_SELLER_KEY` derives an
address other than the analyst row's, with the comment: *"A second analyst needs a per-analyst key
scheme; this check is what makes one shared variable safe until then, because a mismatch stops rather
than proceeds."* **The Arc equivalent of that check has no home in `src/`.** Seam 5.

## 1.7 What the browser staking page needs from the server

**The page shape is proven and transfers directly.** `app/report/[hash]/page.tsx` is a server
component doing the reads; `buy.tsx` is `'use client'` and holds interaction state; heavy chain reads
live in a route — `app/api/holdings/route.ts` uses a **minimal inline ABI** (`['function
balanceOf(address) view returns (uint256)']`) rather than a typechain factory, with the stated reason
that a page should stay at the framework floor instead of carrying a chain client. A market page
needs: contract address, chainId (`5042002` / `0x4cef52`), the committed ABI, market state and pool
totals, and the `claimId` to stake against — all a GET returning JSON, same as `/api/holdings`.

⚠️ **The wallet half has no precedent in this repo whatsoever, and the existing page argues against
itself as a template.** Verified: no `window.ethereum`, no `wagmi`, no WalletConnect, no
`eth_requestAccounts`, no `wallet_addEthereumChain` anywhere in `src/`, `app/` or `scripts/` — the
single grep hit is a comment in `buy.tsx` explaining why there isn't one. `viem@2.56.3` is installed
**transitively** via `@x402/extensions` and is **not a declared dependency** (neither `dependencies`
nor `devDependencies`).

And `buy.tsx`'s header is the opposite of what a staking page does: *"An AGENT pays. The visitor does
not… Nobody's wallet is connected, no browser signs anything, and the visitor is not charged."* Every
chain interaction in this repo today is server-signed. **The staking page is the first browser-signed
transaction in the project**, and SM-09 — the smoke test for exactly this — is a manual markdown
walkthrough with no script (`package.json`'s `smoke:09` is an `echo` saying so).

⚠️ **§5.18's ingestion shape has a precedent even though the code does not exist.** *"The stake UI
POSTs the tx hash to `/api/markets/[id]/refresh`"* is the same discipline as `gate.ts`: write the
transaction identifier **before** you can confirm it, reconcile after. `purchases.native_tx_id` is
`NOT NULL` and written in `onBeforeSettle`; `onAfterSettle` updates. Copy the discipline, not the
code.

---

# 2 · What has to be written, and what it resembles

`tokenize/` is the template for a chain subsystem here, and most of it transfers. **Three things do
not, and all three are Circle.**

| to write | nearest template | what transfers | ⚠️ where Arc differs |
|---|---|---|---|
| `src/arc/arc.ts` — plumbing | `tokenize/hedera.ts` | one definition of chain constants · `fetchJson` · a settled-read poller · a single write wrapper | `landOrStop` exists because a Hashio revert is **unattributable without Mirror Node**. Arc has no Mirror Node and a normal EVM RPC, so a revert reason is available directly. And a Circle failure is **not a revert at all** — it is a `TransactionState` plus `errorReason`/`errorDetails` |
| `src/arc/market.ts` — prepare/spend | `tokenize/ats.ts` | the split is a safety property and matters **more** here, because a reverted Arc call spends USDC | `ats.prepare()` returns an `ethers.Wallet` inside its plan, so *"a `TokenPlan` cannot cross HTTP"* and the console route must prepare twice. **A Circle signer is an API call with no local object, so an Arc plan is serializable** and the awkward double-prepare disappears |
| `src/arc/spec.ts` | nothing | — | §5.16's missing-day and freshness rules are specified and unbuilt. `domain/canonical.ts` is what hashes it |
| `src/arc/settle.ts` | `graph/corroborate.ts` | an adapter that fetches and returns observations, keeping `engine/` pure (§5.14) | nothing meaningful |
| `src/store/markets.ts` | `store/tokens.ts` or `store/reports.ts` | — | the writer-convention question, section 4 |
| `app/api/cron/*` | **nothing** | — | no cron route exists; `vercel.json` is `{"framework":"nextjs"}` with no `crons` key; there is no `.github/` |
| `contracts/` + build | `scripts/ops/verify-ats.ts` | trace an import closure, compile with pinned `solc`, compare byte-for-byte, refuse rather than warn | it writes an artifact instead of verifying one |
| the staking page | `report/[hash]/page.tsx` + `buy.tsx` + `api/holdings` | server reads · client interaction · heavy chain work in a route | **the wallet half has no template** — §1.7 |

## ⚠️ The genuine difference: Circle's async state — read from the installed SDK

Everything below is from `node_modules/@circle-fin/developer-controlled-wallets` **10.8.0**, typings
and shipped bundles, not from a research note.

**Submit returns no hash.** `createContractExecutionTransaction(input)` resolves to
`CreateContractExecutionTransactionForDeveloper` — `{ id, state }`. The `Transaction` type carries
`txHash?: string`, optional.

**⚠️ FINDING 1 — the SDK polls for you, and SM-08's hand-rolled loop is no longer the shape to copy.**
`GetTransactionInput` accepts:

```ts
type GetTransactionInput = {
  id: string;  txType?: TransactionType;
  pollingInterval?: number;   // "Defaults to 1000"
  signal?: AbortSignal;       // "Abort signal used to cancel polling"
} & GetTransactionWaitFor & Common;
```

with `waitForState?: TransactionState` or `waitForTxHash?: true` (mutually exclusive — *"supplying
both is a type error"*). The documented pipeline is
`INITIATED → CLEARED → QUEUED → SENT → CONFIRMED → COMPLETE`, and terminal failures are `CANCELLED`,
`DENIED`, `FAILED`, `STUCK` — on any of which **the returned promise rejects**, even if a `txHash` is
present (*"e.g. a reverted transaction"*).

Two consequences that matter against a 60-second ceiling:

- ⚠️ **`signal` is what bounds the wait.** `AbortSignal.timeout(n)` gives the resolver a hard stop.
  The Hedera path has no equivalent — `revertReasonFromMirror` polls 10×1s and `settledBalance`
  15×1s, both fixed-count and unbounded by the caller.
- ⚠️ **An EOA has its hash at `SENT`, not `COMPLETE`.** The typing says so directly: *"`txHash` only
  appears at `CONFIRMED` [for SCA] — an EOA already has it at `SENT`."* The analyst is asserted EOA
  (§5.18, `verify-analyst.ts`), so waiting past `SENT` for a hash is waiting for nothing.

**⚠️ FINDING 2 — idempotency is opt-in, the default is not idempotent, and the helper the typings
advertise does not exist at runtime.** This is the one to read twice.

From the shipped ESM bundle, the contract-execution wrapper:

```js
async ({idempotencyKey: t, fee: s, xRequestId: n, ...o}) => …
  createDeveloperTransactionContractExecution({
    entitySecretCiphertext: await z(e)(),
    idempotencyKey: t ?? ee(),        // ← caller's key, or a fresh one per call
    ...s.config, ...o
  }, i)
```

`idempotencyKey` is optional and the typing says *"We will generate one if you do not provide it."*
So **two identical calls with no key supplied are two distinct transactions** — two submissions, two
gas spends. On Arc, gas is USDC.

And the helper:

| | |
|---|---|
| declared | `dist/types/clients/core.d.ts:434` — `declare function generateIdempotencyKey(): \`${string}-${string}-…\`` |
| re-exported into the main entry | yes — `export * from './clients/core'` at `developer-controlled-wallets.d.ts:10` |
| present in `developer-controlled-wallets.es.js` | **0 occurrences** |
| present in `developer-controlled-wallets.cjs.js` | **0 occurrences** |
| `typeof m.generateIdempotencyKey` at runtime (ESM **and** CJS) | **`undefined`** |

⚠️ **So `import { generateIdempotencyKey } from '@circle-fin/developer-controlled-wallets'`
typechecks cleanly and is `undefined` when called.** This is the same shape as `extensionAlias`
accepted-and-ignored, the gateway error strings that never existed, the env var set to empty, the
research-note summary cell and the silently-clamped `maxDuration` — **the sixth instance, and the
first one found before it cost anything.** Supply the key yourself; do not import a generator.

**Also useful, also verified:** `refId?: string` is accepted on the input and comes back on the
`Transaction`, so a client reference survives the round trip. `amount?: string` is **optional** and
documented as *"decimal format"* — that is the boundary draft §5 is about.

⚠️ **And one absence that shapes a whole seam: `Transaction` has no logs, no receipt and no events
field** (checked across every field of the interface: `id, abiFunctionSignature, abiParameters,
amounts, amountInUSD, blockHash, blockHeight, blockchain, contractAddress, createDate, custodyType,
destinationAddress, errorReason, errorDetails, estimatedFee, feeLevel, firstConfirmDate, networkFee,
networkFeeInUSD, nfts, operation, refId, sourceAddress, state, tokenId, transactionType, txHash,
updateDate, userId, walletId, transactionScreeningEvaluation`). **Reading an event emitted by our own
call requires a separate Arc RPC receipt fetch.** Seam 3.

---

# 3 · The seams — the cycle walked end to end

*A report exists → a market is created → the analyst commits → a human stakes → the window closes →
the resolver fires → scores appear.*

| step | state today | what it needs |
|---|---|---|
| **a report exists** | ✅ **works** — 8 persisted, 4 tokenized, `scripts/ops/report.ts` is the entry | nothing |
| **a market is created** | ⛔ | a markets table · a subject · **a threshold** · dates · `createMarket` on chain (a spend) |
| **the analyst commits** | ⛔ | `src/arc/` · the contract · the commit cron · `claimId` back out |
| **a human stakes** | ⛔ | the ABI artifact · a market address · **browser wallet code that has no precedent here** · `claimId` |
| **the window closes** | ✅ free | a timestamp |
| **the resolver fires** | ⛔ | `spec.ts` · the settlement read wired · `evidenceHash` · the resolve cron |
| **scores appear** | ⛔ partly | reconciliation quality is **already in `Report.verdict`**; the other two need the chain and a table |

## The six seams nobody obviously owns

**1 · ⚠️ Evidence has a correct builder and no destination.** `buildEvidence` implements §5.18's two
tiers exactly, and its only caller is a demo script. Reports persist `Provenance`, which has no
`responseHash` and no `raw`. **A resolver unit could pass `tier: 'record+raw'`, receive a perfect
`EvidenceRecord`, pass its own proof, and drop it on the floor** — and the market would settle with
no retained proof of what it read. This is precisely the 2026-09-08 shape: every unit passes, the
loop does not run.

**2 · ⚠️ `evidenceHash` commits 32 bytes to bytes nothing stores.** §5.2 puts `evidenceHash` on chain
in `resolve`. If the record those bytes hash is not persisted, the chain commits to something that
exists nowhere and the commitment proves nothing. **Three units each assume another owns it**: the
contract unit assumes the resolver produces it, the resolver assumes the store keeps it, and there is
no store unit. ⚠️ This is worse than seam 1 because it is *irreversible* — the hash is on chain.

**3 · ⚠️ `claimId` has no round trip, and it crosses three components.** §5.2's `commitPrediction`
returns `uint256 claimId`. **A return value from a state-changing call is not readable off a
receipt** — it has to be emitted as an event. Getting it off-chain then requires: wait for a txHash
(`waitForTxHash`), fetch the receipt over a **separate Arc RPC** because Circle returns no logs
(section 2), and decode with the committed ABI. Three components, two subsystems, and no unit in §9's
Phase 4 list names the job. ⚠️ **And whether the contract emits it at all is a contract question
that has to be settled before the contract is written** — this section does not design it, but the
off-chain side cannot work without it.

**4 · ⚠️ The market subject cannot be rebuilt from a `FactId`.** §1.1. `Fact` has slug, deployment,
unit and value; it has no snapshot field name, and adding one changes `Report` and therefore every
stored hash. Somebody owns a `FactId` → settlement-subject mapping, or the resolver reads a column
nobody named.

**5 · ⚠️ The analyst's Arc identity has no in-path guard.** §1.6. `verify-analyst.ts` is a CLI; a cron
never runs it. `ats.ts:132` is the pattern to copy — refuse rather than proceed when the credential
does not derive the row's address. ⚠️ Without it, a wrong `CIRCLE_WALLET_ID` commits from an address
no report is attributed to, and `analystByArcAddress` at settlement then throws on a claim that is
already on chain.

**6 · ⚠️ The ledger and the market row must share a transaction, and this repo has never opened
one.** Reopened question 4 requires the cap read as a `SUM` **inside the same transaction that
records the spend** — otherwise it is a race, not a cap. Verified: **there is no `sql.begin(` anywhere
in `src/`, `app/` or `scripts/`.** Every write in this codebase is a single statement. `postgres`
supports transactions; nothing here has used one. **This would be the first, and it sits exactly
between two units that would each reasonably assume the other owns it.**

⚠️ **Two more that are smaller but would still stop a cycle:**

- **Nothing reconciles a Circle submission that was lost.** The precedent is a table design, not
  working code: `purchases` writes `native_tx_id` **before** settle, leaves `settled_at` nullable, and
  carries a partial index `purchases_unsettled_idx ON (created_at) WHERE settled_at IS NULL` for
  exactly this. §5.8 says recover, never assume failed. ⚠️ **`payments/recover.ts` was never built**
  (PHASE-3 Unit 17, ⬜), so Phase 4 inherits the *idea* with no implementation to copy.
- **`createMarket` and `commitPrediction` are two writes and a run can die between them.** Identical
  in shape to `ats.tokenize()`'s deploy → grantRole → issue, which handles it with `landOrStop`'s
  `landed` list and a hard *never retry blindly*. The Arc equivalent needs the market row to record
  which of the two landed.

---

# 4 · Data shape

Five tables — markets, claims, stakes, scores, and the outflow ledger question 4 reopened — plus a
home for evidence (seam 1). What each holds, and which Phase 3 lesson it repeats.

## ⚠️ The one that is not a repeat: BIGINT overflows

001_init's rule is *"BIGINT for prices in tinybars — atomic units, exact integer, and money never
touches a float"*, with NUMERIC rejected because it *"invites a decimal point into a column whose
whole point is that it has none."* **That reasoning was about a value that fits in BIGINT.**

⚠️ **An 18-decimal USDC amount does not.** 1 USDC = 10¹⁸; BIGINT's ceiling is ~9.22 × 10¹⁸ — so a
stake column storing native Arc values **overflows at about 9.22 USDC.** At 6 decimals the same
column holds ~9.2 trillion USDC and is never a concern.

So the schema choice is downstream of draft §6.1, the open `msg.value` question:

| if amounts are stored at | column | note |
|---|---|---|
| **6 dp** (USDC units) | `BIGINT` | matches the existing rule exactly, sums and orders natively |
| **18 dp** (native/`msg.value`) | `NUMERIC(78,0)` | 78 digits covers `uint256`; still exact, still no decimal point |
| — | ~~`TEXT`~~ | ⚠️ **not viable**: the ledger's cap is a `SUM` and the cap must order and add |

⚠️ **This is a second reason §6.1 must be settled before anything is written**, and it is one the
draft does not currently mention: the answer reaches into the schema, not only into the contract.

## The tables

**`markets`** — the question, its dates, and where it lives on chain.
- report hash (FK to `reports`, no cascade — 001's rule), the settlement subject (slug + field +
  threshold + comparison), `close_time` / `observation_end` / `resolve_deadline` as **TIMESTAMPTZ**.
- `spec_json` **TEXT, never jsonb** — 001's first rule, and it binds harder here: `specHash` is over
  canonical bytes and jsonb reorders keys, normalises numbers and drops duplicates.
- `spec_hash TEXT CHECK (spec_hash ~ '^[0-9a-f]{64}$')` — the same CHECK `reports.hash` carries.
- ⚠️ **The on-chain `marketId` is a `uint256` that does not exist until `createMarket` lands**, so it
  is **nullable-until-landed**, exactly like `report_tokens.transfer_tx`. The row's own key is ours.
  `purchases` solved the mirror-image problem by making the external identifier (`payment_id`) the PK;
  here the external identifier arrives late, so it cannot be.
- ⚠️ **State: do not add a mutable `state` enum.** `quotes.state` is the cautionary tale — specified,
  `CHECK`-constrained, indexed by `quotes_report_state_idx`, and **it has no writer**; every row is
  `'open'` forever, so `isLive()`'s state test is always true and the index covers a constant column.
  The shape that worked is `purchases`: **nullable landmark timestamps** — `committed_at`,
  `resolved_at`, `voided_at` — with state derived. It cannot silently not-be-written, because a null
  means exactly what it looks like. ⚠️ **The cron's "find work" query depends on this being true.**

**`claims`** — one per author per market (§5.2), so `(market, author)` is unique.
- `claim_id` from chain, nullable-until-landed (seam 3). `report_hash`, `side`, staked amount, the
  Circle transaction `id` and `txHash`.
- ⚠️ **The Circle `id` is written before the wait**, mirroring `purchases.native_tx_id NOT NULL`
  written before settle. That plus a partial index `WHERE tx_hash IS NULL` is what makes a lost
  submission findable.

**`stakes`** — the multi-write case, and 004's lesson applies verbatim.
- One row per stake transaction, **`tx_hash TEXT NOT NULL UNIQUE`** — which makes re-recording after a
  retry a no-op rather than a duplicate claim, exactly as `token_transfers` does.
- **`seq BIGSERIAL`** for ordering, because 004 established that two events in the same second are
  possible and *"the clock is for reading, the seq is for ordering."*
- ⚠️ **A staker can stake twice and the same address can appear many times** — this is the table that
  would be wrong as a column, which is the whole content of migration 004.

**`scores`** — §5.12 says writes are idempotent on **`(marketId, claimId)`**, explicitly *not*
`(marketId, reportRef)` since two authors can cite one report. That is the composite primary key,
directly. ✅ Clean and already specified.

**`spend_ledger`** — from the reopened question 4: one row per outflow, **actor · rail · asset ·
atomic amount · UTC day**, cap read as a `SUM` inside the writing transaction (seam 6).
- ⚠️ Must cover **gas**, not only stakes — section 6.
- The amount column inherits the BIGINT-vs-NUMERIC question above.

**Evidence** — seam 1 and 2's destination. `EvidenceRecord.raw` is canonical bytes, so **TEXT**, same
rule as `canonical_json`. Keyed to the resolution it backs, and `evidence_hash` gets the 64-hex CHECK.

**Rules that carry across all of them:** TIMESTAMPTZ everywhere, never TIMESTAMP · no
`ON DELETE CASCADE` · TEXT for hashes and addresses with a CHECK on the fixed-length ones · every
statement `IF NOT EXISTS` so `migrate.ts` stays a no-op on re-run.

---

# 5 · The two cron entry points

Both wake with **no arguments** — Vercel makes an HTTP GET to a path on the production deployment.
Auth is `CRON_SECRET`, sent automatically as `Authorization: Bearer …`; `config/env.ts::requiredEnv`
is the guard, since an empty value would compare equal to a missing one under `??`. Requests carry
`vercel-cron/1.0` and an `x-vercel-cron-schedule` header, which is how two entries can share one route.

⚠️ **Vercel does not retry a failed invocation, delivery can silently not happen, and the same run can
be delivered twice.** All three are Vercel's own documented behaviour (draft §3). Both routes must
therefore be **reconciliation-based** — find all outstanding work, not "work since I last ran".

## The commit cron

| question | answer |
|---|---|
| **how it finds work** | reports with no market row — a `LEFT JOIN`, which `list()` cannot express (§1.1) |
| **how it knows what it did** | the market row, written **before** the chain call, carrying the Circle transaction `id`; landmark timestamps rather than a state enum (§4) |
| **duplicate delivery** | ⚠️ **supply `idempotencyKey` explicitly** — the default is `?? ee()`, a fresh key per call, so a replay is a second transaction (§2) |

⚠️ **Two things it needs that nothing supplies.**

- **A policy for which reports deserve a market.** All of them? Only tokenized? Only
  `verdict.call === 'ties_out'` — which is `null` on a ranking (§1.1)? Nothing in the repo or the plan
  answers this, and it is the difference between one demo market and eight.
- **A threshold.** A market is *"will X exceed $T on day D"*, and **nothing produces T.** See the
  closing question.

⚠️ **On the idempotency key's format.** `generateIdempotencyKey`'s declared return type is
UUID-shaped, but the field is typed plainly `idempotencyKey?: string`, and **the typings do not
establish whether the API validates the shape.** A key derived from a report hash may or may not be
accepted. ⚠️ **Do not build on a derived key without checking against the API first.** The
format-independent version works regardless: generate a key once, store it on the market row, and
reuse that stored key on every retry — which is also what makes it survive a cold start.

⚠️ **Two chain writes per market** (`createMarket`, then `commitPrediction`), so a run can die between
them — seam 6's smaller sibling, and `ats.tokenize()`'s three-step is the shape to copy.

## The resolver cron

| question | answer |
|---|---|
| **how it finds work** | markets past `observation_end` with `resolved_at IS NULL` and `voided_at IS NULL` — pure timestamps, no enum |
| **how it knows what it did** | `resolved_at` / `voided_at` landmarks, plus the Circle `id` written before the wait |
| **duplicate delivery** | `require(!resolved)` reverts a second call — ⚠️ **but a revert costs gas and gas is USDC**, so read state before submitting, as Vercel's own guidance says |

⚠️ **`resolve_deadline` must sit at least two days after `observation_end`.** Once-daily with no retry
means a run that hits `MISSING_OBSERVATION` — the subgraph not yet indexed past `dayEnd + margin` —
waits 24 hours for its next attempt. §5.16's *retry until `resolveDeadline`, then VOID* still holds,
but "retry" now means a handful of attempts, not a loop. This is already recorded in the draft; it
lands **in `spec.ts`**, which is where it becomes real.

⚠️ **The 60-second ceiling is the binding constraint, and there is a correct answer for it.** A resolve
run is a Graph read plus a Circle submit plus a wait on a state machine with no upper bound. Bound the
wait with `signal: AbortSignal.timeout(…)` (§2) and **record the Circle `id` before waiting**. If the
wait aborts, the transaction is still in flight and the next run reconciles — which is exactly
`purchases`'s ambiguous-settle case, exactly what §5.8 requires, and exactly what `recover.ts` was
supposed to do and never did.

⚠️ **One piece of slack worth knowing: `voidMarket` is permissionless after `resolveDeadline`
(§5.2).** So the one path that absolutely must not depend on the cron does not — anyone can call it,
including a human on camera.

---

# 6 · Where money leaves the analyst's account

⚠️ **On Arc, USDC *is* the native token** — SM-08: *"the faucet's USDC is what pays for gas and what
`msg.value` is."* So every transaction is a USDC outflow, whether or not it stakes anything.

| # | site | what leaves | guard today |
|---|---|---|---|
| 1 | `createMarket` | gas | **none** |
| 2 | `commitPrediction` | gas **+ the stake** (`msg.value`) | **none** |
| 3 | `resolve` | gas | **none** |
| 4 | `voidMarket`, if the analyst calls it | gas | **none** |
| 5 | `claim` | gas — and it pulls value **in** | **none** |
| 6 | ⚠️ **a reverted duplicate of any of the above** | gas, for nothing | **none** |
| 7 | ⚠️ **a duplicate Circle submission with no `idempotencyKey`** | a whole second transaction | **none** — §2 |
| — | `stake` | a **human's** USDC, not ours | the human's wallet |
| — | contract deployment | ⚠️ **`ARC_DEPLOYER_KEY`, a different EOA** — `deployContract` is not exposed on the DCW client (SM-08), so the analyst does not pay for it | that key's own balance |
| — | existing, unchanged | Hedera HBAR: ~7.7 per tokenize, ~0.43 per transfer; buyer agent HBAR per purchase | `buyer.ts` per-payment + daily caps; `tokenize.ts`'s 2× floor |

**So: seven sites, zero guards.** `payments/buyer.ts`'s caps are HBAR, x402 and Hedera — a different
actor on a different rail in a different asset, as the draft's question 4 says.

⚠️ **And there is a second guard available that is not code, and it is already recorded as an unfinished
to-do aimed at exactly this moment.** `tracking/smoke-results.md`, SM-08's *To do*:

> **What:** Set a spend cap on the wallet set in Circle's console before anything autonomous runs on
> Arc. **Why:** Circle's limits are **server-side wallet-set policy**, not a client-side option —
> there is no `spendControls` on the developer-controlled-wallets client… The control that stops an
> agent overspending on Arc is a console setting nobody has made yet, so R8 has no Arc-side answer
> until it exists. This run spent 2.5 USDC on a single call with nothing standing in its way.
> **When:** before the agent commits on Arc unattended (Phase 4) · **Status:** open

**Its trigger condition is decision 3R.** It was written on 2026-09-06 predicting this exact moment,
and it is a console action rather than a unit — which means it can be done today, independently of
any code, and nothing in the unit plan will remind anyone.

**Three guards, and they are independent rather than alternatives:** the console wallet-set cap
(outside the code, unfinished) · the durable ledger (reopened question 4, unbuilt) · the
**prepare/spend split**, which is the cheapest of the three, transfers directly from `ats.ts`, and
costs nothing to adopt.

---

# ⬜ The one thing to decide before any unit is written

**What a market's subject and threshold are, and where they come from.**

Not the contract's `msg.value` units — that is open, flagged, and correctly waiting (draft §6.1).
This one is not recorded anywhere at all, and it is upstream of more:

- **`spec.ts`** cannot be written without it — the spec *is* the subject, the threshold and the dates.
- **The `markets` table** cannot be shaped without it — §4's subject columns are whatever this answer
  says they are.
- **The commit cron** cannot find work without it — "which reports deserve a market" is the same
  question wearing a different hat.
- **Seam 4** is a consequence of it: whether `Fact` needs a field name at all depends on whether the
  subject is derived from a `FactId` or authored separately.
- **A1 turns on it** — *"decision logic tied to real signals"*. If the threshold is arithmetic on the
  report's own figure, the analyst's "decision" is a formula. If a model picks it, the decision is a
  model call and the report's `assessment` becomes load-bearing in a way it is not today.

⚠️ **It changes the shape of the thing, not the label on it**, which is the test `CLAUDE.md` sets for
what to stop and ask about. And it is the one question where every unit downstream would otherwise
each invent a different answer, pass its own proof, and not fit together — which is the failure this
whole document exists to get ahead of.

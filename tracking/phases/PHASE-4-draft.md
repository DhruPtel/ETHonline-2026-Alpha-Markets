# Phase 4 — draft: five things investigated before the unit plan is written

*The analyst stakes its own money on its own conclusions.*

**This is not a unit plan.** It is the record of five open questions investigated against the code and
the installed packages on 2026-09-09, so that Phase 4's unit briefs can be written from measurements
rather than from first principles. Each answer carries one of three marks:

- ✅ **SETTLED** — the evidence decides it, and no judgement was required.
- 🟡 **DECIDED (provisional), 2026-09-09** — a judgement call, taken so the draft is complete.
  ⚠️ **All three were taken *before* Phase 3 testing finished, and testing may change one.** Each
  says what would make it wrong.
- ⬜ **OPEN** — a recommendation is offered and nothing has been decided.

⚠️ **Read the market shape first, because it decides question 1 and constrains the rest.**

## The market's shape

A market is a **metric question with a date**: *"will aave-v3's deposits exceed $X on
September 12?"* A threshold on a future observable, settled by reading that day's data, binary
outcome.

⚠️ **It is not "was the report's figure correct."** That distinction is what makes settlement a
forward read of a named day rather than a re-read of the block a report was written at — and it is
why question 1 dissolves.

---

## Status

| # | Question | Answer |
|---|---|---|
| **1** | Settlement reads | ✅ **SETTLED — not a problem.** Snapshots survive pruning completely. ⚠️ My own structural review was wrong about this · 🟡 **subjects are balance and flow only** |
| **2** | Solidity infrastructure | 🟡 **DECIDED** — `contracts/` at the root, one build script, a committed ABI artifact **written by the build** |
| **3** | Signing on Arc | ✅ **SETTLED on mechanism** (Circle is async, no hash on submit) · 🟡 **DECIDED: staking runs from the CLI** — ⚠️ the first thing to revisit |
| **4** | The spend ledger | ✅ **SETTLED — Phase 3 debt, and Phase 4 does not inherit it.** Decision 3 closes it: a human-run CLI needs no cumulative cap |
| **5** | USDC decimals | ✅ **SETTLED** — measured, with one correct place for the conversion · ⬜ the module shape is still a recommendation |

---

# 1 · Settlement reads — ✅ SETTLED on mechanism · 🟡 DECIDED on subjects

⚠️ **I flagged this in the structural review as "the structural one Phase 4 will trip over." That
flag was wrong, and the error was mine rather than the code's.** I applied `RETENTION_FLOOR` — which
governs *pinned reads at an arbitrary block* — to a settlement path that does not make one. Correcting
it here rather than carrying it forward.

### What the evidence says

**Daily snapshots survive pruning completely.** SM-03 asked whether a `financialsDailySnapshot` from
twelve months ago is still readable and the answer was total: full in-bounds windows at 6, 12, 18 and
24 months back, and aave-v3's **oldest snapshot is 2023-01-27 — the day it launched on Ethereum.**
Snapshots are written once per day and never superseded, so pruning cannot reach them. PLAN-v4 §12
already records this as answered (U4), and §5.16's primitive table says the same thing:

| primitive | survives prune | use for |
|---|---|---|
| `block: { number: N }` | ❌ | nothing we rely on |
| `financialsDailySnapshots` | ✅ | **balance metrics** |
| immutable events | ✅ | **flow metrics** |

**`RETENTION_FLOOR = 300` is about a different operation.** It exists so `commonBlock()` can pick one
block that a *set* of deployments can all answer at, for a cross-protocol comparison inside one
report. Settlement asks a different question of one deployment — *what did the daily row for
2026-09-12 say* — and answers it **unpinned**, filtering on `timestamp_gte`/`timestamp_lte`.

⚠️ **Verified from working callers rather than from the schema.** `client.ts:214` reads
`const vars = block === undefined ? variables : { ...variables, block: { number: block } }` — omit the
block and the variable is simply absent, which for a nullable `$block: Block_height` is an unpinned
read at the head. Both existing callers of this document — `scripts/ops/triage-protocols.ts` and
`scripts/demo/documents.ts` — pass **no block** and run against the live gateway today. Nothing about
that path touches the retained window.

**`blockAtTimestamp` (`corroborate.ts:62`) is not needed for this.** It exists to find the block whose
timestamp is the moment the subgraph *wrote* a value, because an aToken's `totalSupply()` accrues
continuously while the subgraph writes only when a handler fires — reading at the current block never
matches. That is a corroboration concern. A snapshot carries its own `blockNumber` and `timestamp`, so
settlement needs no block search. ⚠️ It becomes relevant only if Phase 4 wants an **optional
chain-corroboration tier** at settlement, which nothing requires.

### ⚠️ Revenue: narrower than "unsettleable", and worse than it looks

Revenue is **not** universally poisoned, and saying so would be as wrong as ignoring the problem.
Read from `config/protocols.ts` across the 25 live deployments:

| `revenueAvailability` | count | deployments |
|---|---|---|
| `usable` | 3 | aave-v2, compound-v2, compound-v3 |
| `poisoned` | 2 | **aave-v3**, **spark-lend** |
| `not_tracked` | 1 | morpho-blue |
| `null` — **not swept** | **19** | everything else |

So revenue is sound on three deployments, broken on two, and **unknown on nineteen**. The two broken
ones are the flagship and its fork: aave-v3's cumulative reads $2.79e17 after a mapping fault booked
$1.63e15 on one day in July 2024 and recurred 38 times since, most recently 2026-08-19. It is not one
event that could be subtracted out.

**Balances and flows are clean where measured** — 0 bad days for `totalDepositBalanceUSD`,
`totalBorrowBalanceUSD`, `dailyDepositUSD` and `dailyBorrowUSD` across 1,300+ days on aave-v3, against
38 bad days for `dailyTotalRevenueUSD` on the same rows.

### 🟡 DECISION 1 — market subjects are balance and flow metrics only *(provisional, 2026-09-09)*

**No revenue sweep.** Market subjects are **balance and flow metrics**; revenue is forbidden as a
subject for Phase 4.

**Why.** Nineteen unswept deployments is a measurement task four days from a deadline, and balance
and flow are already clean enough to settle on — **0 bad days across 1,300+ against revenue's 38 on
the same rows.** The three `usable` deployments are not worth the sweep it would take to trust the
other nineteen.

**What it costs.** The most interesting question a financial analyst would ask — *is this protocol
earning?* — is off the table for Phase 4. Markets are about size and movement, not profitability.

⚠️ **Cheap to add later, expensive to discover mid-phase.** Adding revenue subjects after the sweep
is additive: the settlement path does not change, only the set of legal subjects does. Discovering
mid-phase that a market was written against a poisoned accumulator is a settlement dispute.

**What would change it:** a revenue sweep landing across the 19 unswept and coming back mostly
`usable`. ⚠️ It would still leave aave-v3 and spark-lend out, and those are the two subjects anyone
would most want.

### What is still genuinely open here

⚠️ **§5.16's missing-day and freshness rules are specified and unbuilt.** No snapshot with
`timestamp ∈ [D, D+86400)` → `MISSING_OBSERVATION` → retry until `resolveDeadline` → **VOID**. And
freshness is `_meta.block.timestamp ≥ dayEnd + margin`, **not a block number**, precisely because the
day-end block cannot be requested by number later. §5.16 names a `spec.ts` that does not exist. This
is Phase 4 work, not a discovery — but it is the part of settlement nobody has written.

---

# 2 · Solidity infrastructure — 🟡 DECIDED *(provisional, 2026-09-09)*

### What exists today

**Nothing.** No `.sol` file anywhere outside `node_modules`, no `contracts/` directory, no compile
script in `package.json`, no hardhat and no foundry. `solc@0.8.28` and `@openzeppelin/contracts@4.9.6`
are pinned **devDependencies**.

There are two precedents, and they are not equally useful:

- **`scripts/smoke/08-circle-payable-call.ts`** compiles a three-line contract from a **source string**
  held in the script, in-process, and deploys it with an `ethers.ContractFactory`. Good enough for a
  ten-line receiver whose whole point was to be readable inline. It does not scale to a market
  contract and was never meant to. ⚠️ **Do not run it** — it deploys, sends a payable transaction, and
  without `CIRCLE_WALLET_ID` creates a second Circle wallet, which is a wrong-author bug.
- **`scripts/ops/verify-ats.ts`** is the more useful one and is already **most of a build step**. It
  assembles a Standard JSON Input by *tracing* an import closure from disk, compiles with pinned
  `solc`, and compares the result byte-for-byte against deployed bytecode before submitting anything.
  Everything a real build needs except somewhere to put the output.

### The constraint that decides the shape

⚠️ **Nothing compiled can ship to Vercel.** `solc` and `@openzeppelin/contracts` are devDependencies
and are not present in a deployed function — this is already established, and it is why
`src/tokenize/ats.ts` does not verify its own tokens and why a console-minted token arrives
unverified. **The same rule applies here: the ABI must reach the client as a committed artifact, not
by compiling at request time.**

### 🟡 DECISION 2 — `contracts/` at the root, one build script, a committed ABI *(provisional, 2026-09-09)*

- **Sources in `contracts/` at the repo root** — outside `src/`, because the root `tsconfig.json`
  includes `src/**/*` and `scripts/**/*` and Solidity is neither.
- **One `scripts/ops/build-contract.ts`**, reusing `verify-ats.ts`'s trace-and-compile machinery
  rather than reimplementing it.
- **A committed ABI artifact** — ABI plus bytecode — written into `src/` where TypeScript imports it
  as an ordinary typed module. ⚠️ It is committed because **nothing compiled ships to Vercel**: `solc`
  and `@openzeppelin/contracts` are devDependencies and are absent in a deployed function, so
  `next build` and the settlement code must both find the ABI already on disk.

**Rejected: hardhat or foundry.** Both are a dependency decision and a whole toolchain days from a
deadline, to do what already-proven code in `verify-ats.ts` does.

### ⚠️ CONSTRAINT ON THE UNIT — the build writes the artifact; a human never does

**This is a requirement of the unit, not a note attached to it.** The unit is not done until the ABI
cannot go stale without something failing loudly.

⚠️ **A generated file that drifts from its source is precisely the failure this project has already
shipped once.** `tokenize.ts` *printed* the verify command and trusted a person to run it, and three
of four report tokens sat unverified against a pass/fail requirement until someone went looking. A
committed ABI regenerated by memory is the same shape with a worse blast radius: a stale ABI decodes
the wrong fields against a live contract holding real USDC, and nothing about it looks broken.

So, concretely, the unit must satisfy **both**:

1. **The build writes the artifact** — no step whose completion depends on somebody remembering.
2. **Something fails loudly when the artifact does not match `contracts/`.** `verify-ats.ts` already
   demonstrates the shape: compile locally, compare byte for byte, and **refuse** rather than warn.
   The check belongs where it cannot be skipped — `npm run typecheck` and `next build` are the two
   gates every change already passes through.

⚠️ **A warning is not sufficient here**, for the same reason the digit guard's warning was not
sufficient to make anyone fix it: a check that fails soft is a check people learn to scroll past.

---

# 3 · Signing on Arc — ✅ SETTLED on mechanism · 🟡 DECIDED on placement

### What the installed SDK actually does

Read from `node_modules/@circle-fin/developer-controlled-wallets`, not from a research note:

```ts
circle.createContractExecutionTransaction({
  walletId, contractAddress, abiFunctionSignature, abiParameters, amount,
  fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
})
```

⚠️ **It returns `{ id, state: 'INITIATED' }` and no transaction hash.** The hash appears part-way
through a state machine you have to poll with `getTransaction({ id })`. SM-08 measured **4.4 seconds**
submit-to-complete — and explicitly recorded that this number is *not* evidence a request path can
block on it, because the state machine carries no upper bound. The failure mode to design against is
polling for a hash that does not exist yet.

**There are two signing paths, and they are not the same.**

| | analyst | human |
|---|---|---|
| identity | Circle developer-controlled EOA, `0x1b7035bb…` | whatever wallet the person has |
| mechanism | **an authenticated API call** — `CIRCLE_API_KEY` + `CIRCLE_ENTITY_SECRET` + `CIRCLE_WALLET_ID` | browser wallet signs directly |
| shape | async, poll for a hash | synchronous from the app's point of view |
| proved by | SM-08 ✅ | SM-09, walked on OKX ⚠️ **partial** |

⚠️ **`accountType` must stay `EOA`, never SCA** — a market contract deriving the author from
`msg.sender` needs a deterministic address, and `scripts/ops/verify-analyst.ts` already asserts the
config row equals the live Circle wallet. ⚠️ **`CIRCLE_WALLET_ID` must be set** or a run creates a
*second* wallet and the analyst's on-chain identity stops matching `config/analysts.ts`.

⚠️ **SM-09 is still partial.** Its wallet half passed; its `next build` half — a stake under a
production build — was deferred *to Phase 4* because no app existed. Phase 4's staking page is where
that closes.

### 🟡 DECISION 3 — staking runs from the CLI, not unattended *(provisional, 2026-09-09)*

**A new `src/arc/` subsystem**, peer to `tokenize/`, holding the Circle client and the market ABI —
**not** an addition to `tokenize/`, which is Hedera's. **The analyst's staking call sits behind a CLI
in `scripts/ops/`.** The human path is a browser page and shares only the ABI.

### ⚠️ The reasoning, which matters more than the answer

**The Arc requirement is that the agent spends its *own* USDC autonomously — the decision and the
funds are the agent's. It does not require that no human typed a command.**

That is the same shape as `scripts/ops/tokenize.ts` today: a person runs it, and the *analyst's*
account is what pays, from the analyst's own key, against the analyst's own row in config. Nobody
reads that as the human doing the spending. Staking is the same relationship on a different chain —
the analyst's wallet, the analyst's balance, the analyst's stake on its own published conclusion.

**What this buys.** Circle's `INITIATED → COMPLETE` state machine becomes **a script waiting**, which
is what scripts are for. A request handler cannot wait on a state machine with no upper bound, and
routing around that would mean bringing back the job-progression apparatus — the external ticker,
leases, request-driven advance — that **Phase 3 removed by decision** and never rebuilt. There is no
`.github/workflows/`, and §9's ticker was never built at all.

### ⚠️ This is the first decision to revisit, and here is what would overturn it

**If the Arc requirement is read more strictly than "the agent's funds and the agent's decision"** —
if it is read as requiring that no human initiates the transaction — this decision is wrong and the
scheduler comes back with it. That reading is not obviously incorrect; it is simply not the one taken
here.

⚠️ **Revisit this before anything else in Phase 4**, because it is upstream of two other things:
the job-progression apparatus, and the ledger question below. Everything else in this document
survives it being reversed; those two do not.

---

# 4 · The spend ledger — ✅ SETTLED, and decision 3 closes it

### What is actually true

`payments/buyer.ts` keeps its cumulative daily cap in a JSON file under the OS temp directory, keyed
by account and UTC date. On Vercel a cold start does not keep that file, so the cumulative cap bounds
a burst on one warm instance rather than a day. The per-payment cap is unaffected. The file says so at
its own head.

⚠️ **But Phase 4 does not inherit this, because it is a different actor on a different rail.**
`buyer.ts` caps **HBAR** spent **buying reports** over **x402 on Hedera**. The analyst staking caps
**USDC** committed **to a market** through **Circle on Arc**. They share no code today and no reason
to. Phase 4 would be writing a new spend path, not extending this one.

So the honest answer is: **this is a real Phase 3 debt and it is not a Phase 4 blocker.** The question
is only whether to fix it once, for both, or twice.

### ✅ CLOSED by decision 3 — no ledger is built in Phase 4 *(provisional with it, 2026-09-09)*

Decision 3 puts staking behind a CLI a human runs. **A human-run CLI needs no cumulative cap, because
the human is the cap** — the same reason `scripts/ops/tokenize.ts` has no daily limit on the ~7.9 HBAR
it spends. So:

- **Phase 4 builds no ledger.** The staking path gets no cumulative cap and does not need one.
- **`buyer.ts`'s temp-file ledger stays exactly where it is: Phase 3 debt.** It is real — a cold start
  loses the file, so on Vercel the cumulative cap bounds a burst on one warm instance rather than a
  day — and it is **not inherited by Phase 4**, which writes a different spend path on a different
  rail for a different actor. ⚠️ Its per-payment cap is unaffected and is the one doing the real work.

**What the durable version would have been**, recorded so it does not have to be re-derived if
decision 3 is reversed: one table, a row per outflow carrying actor, rail, asset, atomic amount and a
UTC day, with the cap read as a `SUM` inside the same transaction that records the spend. Roughly one
migration and one small module — and the only version that is correct across serverless instances.

⚠️ **If decision 3 is reversed and staking becomes unattended, this comes back immediately and is not
optional.** An agent spending unattended against a cap that a cold start forgets has no cap.

---

# 5 · USDC decimals on Arc — ✅ SETTLED

### The measurement

SM-08 sent `amount: "2.50"` through Circle and read the result back two ways:

| | |
|---|---|
| sent | `amount: "2.50"` |
| `msg.value` in the contract's own event | `2500000000000000000` |
| raw transaction `value` field | `2500000000000000000` |
| ERC-20 `balanceOf` on the same holding | `20000000` for 20 USDC |
| ERC-20 `decimals()` | **6** |

One balance, two authoritative presentations, **exactly 10^12 apart**. Confirmed twice — once from the
contract's emitted event and once from the bytes Circle actually signed.

⚠️ **And the trap is worse than a scale factor.** Arc mirrors every native value movement as a
standard ERC-20 `Transfer` log emitted by the synthetic address `0xffff…fffe` — **at 18 decimals**,
while the token those events appear to belong to reports `decimals() = 6`. An indexer doing the
entirely ordinary thing — match `Transfer`, look up `decimals()`, scale — is wrong by a trillion, and
nothing in either the event or the metadata says so.

### Where the conversion has to live

**Exactly one boundary: between Circle's `amount` string and anything that stores, compares or
displays a USDC figure.** Concretely — native/`msg.value`/`eth_getBalance` and the synthetic
`Transfer` stream are **18-decimal**; `balanceOf`, `decimals()` and anything a human reads are
**6-decimal**.

**What breaks if it is in the wrong place, in order of how bad:**

1. **Inside the contract, storing `msg.value` as a stake size.** Every stake is recorded 10^12 too
   large. Payouts computed from those numbers are wrong, and because it is on chain it is not
   editable — this is the one that cannot be fixed after the fact.
2. **In the settlement/payout arithmetic.** Two stakes compared at different scales makes the larger
   one win regardless of its actual size.
3. **At the display layer only.** A page reads `20000000000000000000` and prints twenty quintillion
   USDC. Embarrassing on camera, harmless to the data.
4. **In an indexer reading the synthetic `Transfer` stream.** Silent, and the one nobody would catch,
   because the numbers look plausible until compared with `balanceOf`.

> **Recommendation (⬜ your decision).** Do what the rest of this codebase already does with money:
> keep **atomic integers only**, never a float, and make the scale part of the name. `config/pricing.ts`
> holds `REPORT_PRICE_TINYBARS` as a *string* for exactly this reason and derives its display value
> rather than storing one. The Arc equivalent is one module owning `usdcFromNative` /
> `nativeFromUsdc` and every call site naming which scale it is in.
>
> ⚠️ **Also: filter on the market contract's own events, never on the `0xffff…fffe` stream.** That
> address carries every native transfer on the chain and hits Arc's row cap almost immediately —
> the `eth_getLogs` ceiling is a measured 30,000 blocks of span, and a quiet market contract gets the
> full span while a busy address does not.

---

## What this leaves for the unit plan

**Settled by evidence — build directly from it.** Settlement reads daily snapshots and retention is a
non-issue · Circle is an async API call with no hash on submit · the decimal conversion is 10^12 at
one named boundary.

**Decided 2026-09-09, provisional.** ⚠️ All three were taken **before Phase 3 testing finished** and
may change:

| | decision | what would overturn it |
|---|---|---|
| **1** | subjects are **balance and flow metrics only**; no revenue sweep | a sweep of the 19 unswept coming back mostly `usable` — and it would still exclude aave-v3 and spark-lend |
| **2** | `contracts/` at the root · one build script reusing `verify-ats.ts` · **a committed ABI the build writes** | little; the Vercel constraint that forces it is measured, not chosen |
| **3** | **staking runs from a CLI**, not unattended | ⚠️ the Arc requirement being read as *no human may initiate*, rather than *the funds and the decision are the agent's* |

**Consequences already taken, so they are not re-litigated:** decision 3 closes question 4 — no ledger
is built in Phase 4, and `buyer.ts`'s temp-file ledger stays Phase 3 debt. Decision 2 carries a
**constraint on its unit**, not a note: the build writes the ABI and something fails loudly when it
drifts from `contracts/`.

⚠️ **Revisit decision 3 first.** It is the only one of the three that is upstream of anything else —
reverse it and the job-progression apparatus and the durable ledger both come back. Decisions 1 and 2
survive being wrong; this one does not.

**Still a recommendation, not a decision:** the shape of the decimals module (5) — atomic integers
only, scale in the name. Nothing turns on it until there is a contract to call.

⚠️ **One thing outside these five, and it is a date.** Arc mainnet launches 2026-09-16 and the
submission deadline is 2026-09-13. **Arc stays testnet** — there is nothing to schedule and no
cutover to plan. Recorded so nobody rediscovers it as a surprise.

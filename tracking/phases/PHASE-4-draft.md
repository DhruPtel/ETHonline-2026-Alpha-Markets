# Phase 4 — draft: five things investigated, and what reversing one of them opened

*The analyst stakes its own money on its own conclusions.*

**This is not a unit plan.** It is the record of five open questions investigated against the code and
the installed packages on 2026-09-09, so that Phase 4's unit briefs can be written from measurements
rather than from first principles — **plus a sixth section added later the same day**, holding what
reversing one of the five opened up. Each answer carries one of three marks:

- ✅ **SETTLED** — the evidence decides it, and no judgement was required.
- 🟡 **DECIDED (provisional), 2026-09-09** — a judgement call, taken so the draft is complete.
  ⚠️ **All three were taken *before* Phase 3 testing finished.** Each said what would make it wrong,
  and **one of the three then turned out wrong and was reversed** — see the amendment note below.
  Decisions 1 and 2 stand.
- ⬜ **OPEN** — a recommendation is offered and nothing has been decided.

⚠️ **AMENDED 2026-09-09 — decision 3 is REVERSED, and question 4 is REOPENED with it.** Staking does
**not** run from the CLI. **Nothing below has been deleted.** The original decision and the argument
that produced it stand exactly where they were written, marked, with the correction underneath —
this record is worth keeping because it shows reasoning that turned out mistaken, not only
conclusions that held. **Decisions 1 and 2 are untouched by the reversal**; question 5 is unchanged.
Three things the reversal opened are recorded in a new question 6.

⚠️ **A sibling document holds the structural half: `PHASE-4-attachment.md`** *(2026-09-09)* — which existing export each new caller reaches for, what it returns, where a shape does not fit, the seams nobody owns, the table shapes, and the two cron entry points. **This file decides; that file attaches.** Neither is complete without the other.

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
| **3** | Signing on Arc | ✅ **SETTLED on mechanism** (Circle is async, no hash on submit) · ⚠️ **REVERSED 2026-09-09** — the CLI reading fails A2 as written. Replaced by **a daily scheduled route**, checked against Vercel's published limits |
| **4** | The spend ledger | ⚠️ **REOPENED 2026-09-09.** Its closure rested entirely on decision 3 and on nothing else. **Phase 4 builds the durable ledger and it is not optional** |
| **5** | USDC decimals | ✅ **SETTLED** — measured, with one correct place for the conversion · ⬜ the module shape is still a recommendation |
| **6** | ⚠️ **NEW 2026-09-09** — what the reversal opened | ⬜ **OPEN ×3** — the `msg.value` unit contradiction · the inherited digit-guard obligation · Arc's environment variables |

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

# 3 · Signing on Arc — ✅ SETTLED on mechanism · ⚠️ REVERSED on placement

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

### ⚠️ ~~🟡 DECISION 3~~ — SUPERSEDED 2026-09-09, kept verbatim below

⚠️ **This decision was reversed the same day it was taken. It is not deleted, and the argument that
produced it is not softened.** Read it as written, then read why it was wrong underneath. The whole
value of this record is that the reasoning is visible — a decision log that only keeps the
conclusions that held teaches nobody anything.

### ~~🟡 DECISION 3 — staking runs from the CLI, not unattended *(provisional, 2026-09-09)*~~

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

*(End of the superseded decision. What follows replaces it.)*

---

### ⚠️ DECISION 3R — the analyst commits unattended, from a daily scheduled route *(2026-09-09)*

**Decision 3 is reversed.** `commitPrediction` is not run by a person. It fires from a scheduled
route on the deployed app, on Vercel's cron, with no human in the loop. `scripts/ops/` may keep a
manual entry point for rehearsal and recovery, but **it is not the path the requirement is claimed
against** and nothing about the submission may depend on someone running it.

⚠️ **Only the placement is reversed. The module layout in decision 3 survives it** — a new `src/arc/`
subsystem, peer to `tokenize/`, holding the Circle client and the market ABI, and **not** an addition
to `tokenize/`, which is Hedera's; the human path stays a browser page sharing only the ABI. Nothing
about where the spend fires from touches any of that. If anything a scheduled route needs `src/arc/`
*more* than a script did, because a route handler cannot reach into `scripts/`.

#### Why the original was wrong — and it was wrong about the question, not the answer

Decision 3's reasoning was: *"the Arc requirement is that the agent spends its **own** USDC
autonomously — the decision and the funds are the agent's. It does not require that no human typed a
command."* As a reading of what Circle asks for, that is defensible and may even be right.

**It is not a reading of what PLAN §4 committed to.** A2 is **PASS/FAIL**, and its satisfied-by
column is the project's own promise about how it closes:

> **A2** · *Autonomous spending/settlement in USDC* · satisfied by **"Agent's `commitPrediction` is
> payable and unattended"**

Decision 3 argued about **whose money and whose decision**. A2 commits to **who pulls the trigger.**
Those are the same question everywhere except at a CLI — which is precisely where the decision put
the spend. The draft answered a real question carefully and it was the other one, and it never
noticed the substitution because both answers sound like "the agent is autonomous."

⚠️ **This is the failure mode to watch for, not the specific mistake.** A requirement's satisfied-by
column is a commitment, not a paraphrase. Reinterpreting the requirement it hangs off is an amendment
to the plan and has to be taken as one, in the open, rather than arrived at inside a paragraph of
reasoning about something else.

#### The `tokenize.ts` precedent does not carry

Decision 3 leaned on `scripts/ops/tokenize.ts`: a person runs it, the *analyst's* account pays, from
the analyst's own key against the analyst's own config row, and nobody reads that as the human doing
the spending. All true, and it settles nothing — because **no requirement in the Hedera table
contains the word autonomous or unattended.** H2.1 asks for *use of ATS*; H2.2 for a testnet
deployment; H2.3 for verification; H2.4 for issuance, configuration and a lifecycle operation on
camera. `tokenize.ts` is precedent from a case where autonomy was never being claimed, imported into
the one requirement that claims it by name.

#### And A4 fails independently, on a step decision 3 never scoped

A4 is *"programmable money flows — conditional, automated, multi-step"*, satisfied by *commit →
conditional resolution from Graph data → parimutuel payout → void/refund path.*

**"Conditional" and "multi-step" survive a CLI intact** — the contract computes a payout from an
outcome and no human does the arithmetic. **"Automated" lands on `resolve`**: the step that has to
fire when `observationEnd` passes plus a Graph read, whoever ran the commit.

⚠️ **Decision 3 decided where the analyst's *commit* runs and said nothing about the resolver at
all.** So even on its own terms it was incomplete: it closed a question about one of the two
agent-initiated on-chain actions and was written as though it had closed both. That is why question 4
below was also closed too broadly.

---

### The shape being taken — and it is much smaller than §5.1

"Unattended" needs **something that fires without a person**. It does not need §5.1's three
mechanisms — external ticker, request-driven advance, Vercel daily sweep as backstop — which were
sized for a job model with leases, turn-by-turn checkpoints and a resumable `messages[]` array.
⚠️ **Phase 3's decision 2 removed that apparatus and nobody rebuilt it. This does not bring it
back.**

**The shape: one scheduled route that finds work past its due time and does that work inline.** No
lease, no ticker, no queue, no `workflow/`, no `/api/operations/[id]/advance`. It reads the markets
whose observation window has closed, does the Graph read, and calls `resolve` in the same
invocation.

⚠️ **There is no concurrency to serialize, and that is a property of the deadline rather than of the
design.** One analyst, one or two demo markets, one invocation per day against a 60-second ceiling —
two runs cannot overlap, because the interval exceeds the ceiling by three orders of magnitude. So
**§5.18's *"serialize resolver txs through the job lease"* is a rule pointing at machinery that does
not exist and is not being built.** That line needs amending in PLAN §5.18; it is not satisfied by
this shape, it is made moot by it. ⚠️ If a second analyst or a real market population ever arrives,
the rule comes back and so does the thing it names.

### ⚠️ Verified against Vercel's published limits, not from memory (2026-09-09)

Read from `vercel.com/docs/cron-jobs/usage-and-pricing` (last updated 2026-07-15) and
`/docs/cron-jobs/manage-cron-jobs` (2026-08-11), because this project has now been bitten five times
by something that looked live and was not, and a scheduler nobody checked would have been the sixth.

| | Hobby | Pro |
|---|---|---|
| cron jobs per project | 100 | 100 |
| **minimum interval** | **once per day** | once per minute |
| **scheduling precision** | **per-hour, ±59 min** | per-minute |

- ⚠️ **A more frequent expression fails at deploy time**, not at runtime: *"Hobby accounts are limited
  to daily cron jobs. This cron expression would run more than once per day."* `0 * * * *` and
  `*/30 * * * *` are both refused. This is the same shape as the `maxDuration` trap and the opposite
  failure — loud rather than silent — which is the one piece of luck here.
- **`0 8 * * *` fires anywhere in `08:00:00`–`08:59:59`**, deliberately, to spread load across
  accounts. Timezone is always UTC. No `MON`/`JAN` aliases, and day-of-month and day-of-week cannot
  both be set.
- **Vercel GETs the production deployment URL** at the configured path. `CRON_SECRET` is sent
  automatically as `Authorization: Bearer …`, which is the whole auth mechanism and needs no
  dependency. Requests carry `vercel-cron/1.0` and an `x-vercel-cron-schedule` header.
- ⚠️ **Vercel does not retry a failed invocation.** "Vercel will not retry an invocation if a cron job
  fails."
- ⚠️ **Delivery is best effort in both directions** — a scheduled run can silently not happen (no
  function execution, no log), and the same run can be delivered more than once. Vercel's own guidance
  is to make the work idempotent and reconciliation-based: *"query and process all work since the last
  successful run to catch up after a missed invocation."*
- Duration is the ordinary function limit, so **60 seconds** here. Local `next dev` is unsupported;
  you run it by hitting the endpoint.

### Is the shape viable? Yes — and the reason is the market shape, not the scheduler

⚠️ **Once-per-day at ±59 minutes is adequate, and it is worth saying why rather than assuming it.**
A market is a metric question with a date, settled from that day's `financialsDailySnapshot`, and
**a daily snapshot is written once and never superseded** (question 1). §5.16's freshness rule is
`_meta.block.timestamp ≥ dayEnd + margin` — a **lower bound, not a window.** So a read taken 40
minutes late returns the same number as a read taken on the hour. **The precision limit costs
nothing for this market shape**, which is the opposite of the usual worry about coarse cron.

**What the once-daily limit does cost, in order of how much it matters four days out:**

1. ⚠️ **One automatic attempt per day, and no retry.** A run that hits `MISSING_OBSERVATION` because
   the subgraph has not yet indexed past `dayEnd + margin` waits **24 hours** for the next one.
   §5.16's rule — retry until `resolveDeadline`, then VOID — still holds, but "retry" now means once
   a day. **`resolveDeadline` must therefore sit at least two days after `observationEnd`**, or the
   first miss is also the last and the market voids for a transient reason. This is a constraint on
   `spec.ts`, and it is the sort of thing that is cheap now and a settlement dispute on the 12th.
2. **Worst-case latency from `observationEnd` to resolution is ~24h + 59min.** That, not precision,
   is the number the demo calendar has to be built backwards from. §9 Phase 5 already says *"calendar
   the demo market so one real cycle completes with receipts before recording"* — that line now
   carries a specific requirement: **at least one spare day** between the last resolution attempt and
   the 2026-09-13 deadline.
3. ⚠️ **A cron cannot be demoed live.** Nothing in a 2–4 minute video can wait for it. The video shows
   the receipts of a cycle that already completed, and the route is shown by its logs and its
   on-chain effect. Manually triggering the route for the camera would be filming the exact thing A2
   says is not how it works.
4. **Duplicate delivery must not double-spend.** On chain this is mostly free — §5.2 already gives
   `resolve` a `require(!resolved)` and `commitPrediction` one commitment per author per market, so a
   second call reverts. ⚠️ **But a revert still costs gas, and on Arc gas is USDC**, so the route
   should check state before submitting rather than relying on the contract to refuse.

⚠️ **What this shape does not yet cover, and it must not be discovered later.** The shape as stated
resolves markets. **A2 names `commitPrediction`, not `resolve`** — so the commit has to fire
unattended too, which means the same route (or a second cron entry; 100 are allowed) also has to find
published reports without a market, create one, and commit. That is a **spend** on a schedule, and it
is exactly what reopens question 4 below. Whether commit and resolve share one route or take two is
an implementation call and belongs in the unit plan; **that both must be unattended is not.**

---

# 4 · The spend ledger — ⚠️ REOPENED 2026-09-09, because decision 3 was what closed it

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

### ⚠️ ~~✅ CLOSED by decision 3~~ — SUPERSEDED 2026-09-09, kept verbatim below

⚠️ **This closure had exactly one load-bearing premise and it has been removed.** Left in place
because it names the durable design it was declining to build — and because it wrote down, correctly,
the condition that has now occurred.

### ~~✅ CLOSED by decision 3 — no ledger is built in Phase 4 *(provisional with it, 2026-09-09)*~~

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

*(End of the superseded closure. What follows replaces it.)*

---

### ⚠️ REOPENED — Phase 4 builds the durable ledger, and it is not optional *(2026-09-09)*

The condition the paragraph above names has occurred. Decision 3R puts the analyst's spend on a
schedule with no person watching it, so **the sentence that closed this question — "the human is the
cap" — has no referent any more.** There is no human in the path to be the cap.

⚠️ **A cumulative cap in a file under the OS temp directory is not a cap on Vercel.** A cold start
loses the file and the counter restarts at zero; what survives is a bound on a burst within one warm
instance. For `buyer.ts` that is tolerable because a person starts each run. For an agent that
commits its own USDC on a schedule, **a forgotten counter is indistinguishable from no counter**, and
the failure is silent and cumulative rather than loud and immediate.

**The design, taken from the paragraph above rather than re-derived:** one table, a row per outflow
carrying **actor, rail, asset, atomic amount and a UTC day**, with the cap read as a `SUM` **inside
the same transaction that records the spend**. Roughly one migration and one small module. It is the
only version that is correct across serverless instances, and the transaction boundary is the whole
point — a cap read before a spend and written after it is a race, not a cap.

Two things follow that were not true under decision 3:

- **`store/` already has everything this needs.** Migrations are idempotent `.sql` files applied in
  filename order by `scripts/ops/migrate.ts`, and `db.ts` gives pooled and direct connections. The
  ledger is a fifth migration, not new infrastructure.
- ⚠️ **Atomic integers only, and the scale in the name** — question 5's recommendation stops being
  advisory the moment a cap is compared against an amount. A ledger row holding an 18-dp native
  figure and a cap expressed in 6-dp USDC is the second failure in question 5's list, in a database
  instead of a contract.

### ⚠️ And the old closure was drawn too wide, which should be recorded on its own

Independent of the reversal: **question 4 was closed on reasoning that covered `commitPrediction` and
nothing else.** It said "a human-run CLI needs no cumulative cap" and then concluded "Phase 4 builds
no ledger" — a claim about every outflow on the Arc rail, resting on an argument about one of them.
`resolve` and `voidMarket` were never mentioned, because decision 3 never scoped the resolver at all.

⚠️ **That gap is not academic, because on Arc gas is USDC.** SM-08 recorded it plainly: *"On Arc,
USDC **is** the native token, so the faucet's USDC is what pays for gas and what `msg.value` is."* A
`resolve` transaction stakes nothing and still spends the analyst's USDC, and so does a reverted
duplicate. **Any outflow ledger has to cover gas, not only stakes** — which is exactly why the design
above keys a row on *actor, rail, asset, amount* rather than on "stake".

**`buyer.ts`'s temp-file ledger stays Phase 3 debt**, unchanged by any of this. It is a different
actor on a different rail in a different asset. ⚠️ **The open question the reversal creates is
whether the durable ledger is written once for both rails or twice** — Phase 4 needs one for Arc
regardless, and `buyer.ts` could adopt it or not. Cheap to share at the point of writing, and a
rewrite later. **Who decides:** you, when the ledger unit is briefed.

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

# 6 · What the reversal opened — ⬜ THREE OPEN, none decided here

⚠️ **New section, 2026-09-09.** Three things that were either invisible while decision 3 stood, or
were sitting in other documents with nobody owning them. **Each one records what it turns on and who
decides it, because Phase 3 left decisions implied rather than written down and it cost real time** —
the paywall design was never thought through until Unit 12 forced it, and a loop sweep found nine
seams nobody owned. Nothing here is settled in this document.

---

## 6.1 ⬜ OPEN — `msg.value` and the unit contradiction

⚠️ **Two documents give opposite instructions to whoever writes `AlphaMarket.sol`, and this is the
one mistake on the list that cannot be fixed after deployment.**

**PLAN §5.2 says store it:**

> **Accounting:** all native 18-dp. `require(msg.value % 1e12 == 0)` so 6-dp USDC converts cleanly.
> The UI presents 6-dp and converts. ⚠️ **The bug is mixing units, not storing `msg.value`.**

**Question 5 above says storing it is failure #1:**

> **Inside the contract, storing `msg.value` as a stake size.** Every stake is recorded 10^12 too
> large. Payouts computed from those numbers are wrong, and because it is on chain it is not
> editable — this is the one that cannot be fixed after the fact.

**What it turns on: whether the 10^12 factor genuinely cancels.** Parimutuel payout is

```
payout_i  =  stake_i × totalPool ÷ winningPool
```

If `stake_i`, `totalPool` and `winningPool` are all stored in the same unit, the ratio is
dimensionless and the payout comes out in that same unit — the factor cancels and §5.2 is right *for
this expression*. The scale is then a labelling question, not an arithmetic one, and §5.2's
`require(msg.value % 1e12 == 0)` is doing real work: it refuses any value that is not a whole number
of 6-dp USDC units, which is what makes the two presentations interconvertible without loss.

**Where it demonstrably does not cancel** — and this may be all question 5 was ever pointing at:
a minimum-stake or stake-cap constant written as a 6-dp literal; a figure emitted in an event and
read by an indexer; a row written to Postgres and compared against a report price; `balanceOf` on the
ERC-20 view at `0x3600…0000`, which reports 6 decimals on the same balance; anything a person reads.

⚠️ **The likely resolution is that the two are not in conflict about the same thing** — §5.2 is about
the payout arithmetic, question 5 is about interpreting a stored number as "a USDC amount" at a
boundary. **That is a hypothesis and it is deliberately not being adopted here**, because the two
texts as written still tell a contract author opposite things, and being approximately right about
scale is how you get a contract holding real USDC that pays out wrong.

⚠️ **Who decides: you, before `AlphaMarket.sol` is written — and explicitly not whoever writes it
first.** Whichever way it goes, the resolution belongs in `DECISIONS.md` and the losing text gets
amended, rather than both surviving for the next person to pick between.

---

## 6.2 ⬜ OPEN — the digit guard, which Phase 4 inherits and the draft never mentioned

`PHASE-3.md` moved enforcement here, in terms that name this phase precisely: the guard warns rather
than blocks, *"enforcement moves to Phase 4, when a report backs a market."* The 2026-09-08 decision
gated enforcement on closing two gaps first. **Checked 2026-09-09: both are still open.**

| gap | state in the code |
|---|---|
| **market population has no `unit: 'count'` fact** | `execute.ts:257` emits `${slug}:market-population` as a **check**, with the count inside a rationale string. A report that honestly says "23 of 63 markets shown" still has to type `63`, and the guard correctly rejects it |
| **no utilization or ratio fact is emitted anywhere** | `FIGURES` and `MARKET_FIGURES` (`execute.ts:114`, `:123`) are USD-only. `ops.ratio` exists and is exact, `FactUnit` includes `'ratio'`, and `show()` already renders one as a percentage — the machinery is present and unused, so the model divides and types the result |

Today `validate.ts` is pure and correct and `scripts/ops/report.ts:104` prints its violations and
continues.

⚠️ **What it turns on: `specHash`.** §5.2 binds a market to a report by hash. That is the moment a
figure a reader cannot trace stops being a warning in a terminal and becomes part of what someone
staked USDC against — and the 2026-09-08 decision said as much in advance: *"the same violation that
is acceptable in a printed memo is not acceptable in a tokenised artifact whose hash is committed
on-chain."* A market makes it stronger still, because now a third party has money on it.

**Three ways this can go and they are genuinely different sizes:** close both gaps and enforce
(two small `execute.ts` changes, then a switch); enforce only for reports that back a market and warn
otherwise; or defer again and record that a staked report may carry an untraceable figure. ⚠️ The
third is a legitimate choice four days out and is **only** legitimate if it is written down.

⚠️ **Also still undecided from 2026-09-08, and it blocks enforcement in practice:** a ranking's
`| Rank |` column produces one violation per row, because a rank is a digit no fact supplies. Exempt
ranks, promote them to facts, or drop the column. Today they are noise in a warning; under
enforcement they are a refusal to publish.

**Who decides:** you. ⚠️ **This is an inherited obligation with a named trigger, not a new idea** —
it was scheduled into this phase by a decision taken on 2026-09-08, and the draft simply did not
carry it forward.

---

## 6.3 ⬜ OPEN — Arc's environment variables, which are undecided rather than absent by design

**What is actually there today:**

| variable | in `.env` | in `.env.example` | read by |
|---|---|---|---|
| `ARC_DEPLOYER_KEY` | ✅ | ✅ | `scripts/smoke/08` only |
| `ARC_WALLET` | ✅ | ❌ | ⚠️ **nothing, anywhere in the repo** |
| an Arc RPC URL | ❌ | ❌ | — ⚠️ **SM-08 hardcodes `https://rpc.testnet.arc.network`** |
| `CIRCLE_API_KEY` · `CIRCLE_ENTITY_SECRET` · `CIRCLE_WALLET_ID` | ✅ | ✅ | `verify-analyst.ts`, SM-08 |

⚠️ **`ARC_WALLET` is the one to look at first.** It is set, it is read by nothing, and it is missing
from `.env.example`, so nobody setting the project up would know to provide it and nothing would fail
if they did not. Either it is a leftover and should go, or it means something nobody has written down.

**What Phase 4 will need on top of what exists:** an Arc RPC URL as a variable rather than a literal;
the market contract's deployed address; and `CRON_SECRET`, which decision 3R's scheduled route needs
and which Vercel sends automatically as a bearer token once it is set.

⚠️ **One thing that is settled and should be recorded before it is rediscovered: the contract cannot
be deployed through Circle.** SM-08's header says it plainly — *"`deployContract` ships in the
package's typings but is not exposed on the developer-controlled-wallets client"* — which is why SM-08
deploys with `ethers` and a separate funded EOA. **So the market contract's deployer is necessarily a
different identity from the analyst that commits on it.** That is fine and it is not a problem; it is
a fact that has to be true on purpose rather than by accident, because `verify-analyst.ts` exists
specifically to stop the analyst's address drifting from the Circle wallet.

**What it turns on:** whether `ARC_DEPLOYER_KEY` stays the deployer (it is the only thing that can
be), and whether `ARC_WALLET` has a meaning or is deleted. **Who decides:** you — and either way
`.env.example` is the record, since it is the file a fresh clone reads and the one place these have
already gone out of sync.

---

## What this leaves for the unit plan

**Settled by evidence — build directly from it.** Settlement reads daily snapshots and retention is a
non-issue · Circle is an async API call with no hash on submit · the decimal conversion is 10^12 at
one named boundary.

**The decisions, as they stand after the 2026-09-09 amendment:**

| | decision | status |
|---|---|---|
| **1** | subjects are **balance and flow metrics only**; no revenue sweep | 🟡 **UNCHANGED.** ⚠️ The reversal does not touch it — it was never downstream of where the spend runs. Still overturned only by a sweep of the 19 unswept coming back mostly `usable`, which would still exclude aave-v3 and spark-lend |
| **2** | `contracts/` at the root · one build script reusing `verify-ats.ts` · **an ABI artifact the build writes** | 🟡 **UNCHANGED.** ⚠️ The reversal does not touch it either. The Vercel constraint that forces it is measured, not chosen, and it is the same constraint whether a person or a cron starts the spend |
| **3** | ~~staking runs from a CLI~~ → **3R: the analyst commits unattended, from a daily scheduled route** | ⚠️ **REVERSED 2026-09-09.** The CLI reading answered a question A2 does not ask: A2's satisfied-by column commits to *who pulls the trigger*, and a CLI is the one place that comes apart from *whose funds and whose decision*. A4's "automated" fails independently on `resolve`, which the original never scoped |

⚠️ **Decisions 1 and 2 are stated as unchanged deliberately, rather than left for a reader to
infer.** A reversal in a document like this invites the question "what else moved" — nothing else
moved.

**Consequences of 3R, so they are not re-derived:**

- **Question 4 is reopened and Phase 4 builds the durable ledger.** Not optional. The old closure's
  single premise — "the human is the cap" — has no referent once nobody is watching. ⚠️ It was also
  drawn too wide: it covered `commitPrediction` and never mentioned `resolve` or `voidMarket`, **and
  on Arc gas is USDC**, so those spend too.
- **The job-progression apparatus does *not* come back.** 3R is one scheduled route doing work inline
  — no lease, no ticker, no queue. ⚠️ **§5.18's "serialize resolver txs through the job lease" needs
  amending in PLAN**: it names machinery that Phase 3's decision 2 removed and this phase is not
  rebuilding.
- **The commit has to be unattended too, not just the resolve.** A2 names `commitPrediction`. One
  route or two is an implementation call; that both fire without a person is not.
- **Decision 2's constraint on its unit still stands:** the build writes the ABI, and something fails
  loudly when it drifts from `contracts/`.

**⬜ Three things newly open, in question 6** — the `msg.value` unit contradiction between §5.2 and
question 5 (⚠️ unfixable once deployed, and not to be settled by whoever writes the contract first);
the digit-guard enforcement this phase inherited on a named trigger, with both gating gaps still
open; and Arc's environment variables, which are undecided rather than absent by design. Each records
what it turns on and who decides it.

**Still a recommendation, not a decision:** the shape of the decimals module (5) — atomic integers
only, scale in the name. ⚠️ **It stops being purely advisory now that question 4 is reopened**: a
ledger comparing a cap against an amount is the second failure in question 5's list, moved from a
contract into a database.

⚠️ **One thing outside these five, and it is a date.** Arc mainnet launches 2026-09-16 and the
submission deadline is 2026-09-13. **Arc stays testnet** — there is nothing to schedule and no
cutover to plan. Recorded so nobody rediscovers it as a surprise.

⚠️ **And a second date, which 3R creates.** A once-daily cron with no retry means the demo market's
resolution has **one automatic attempt per day**, landing anywhere in a 59-minute window, with a
worst case of ~24h + 59min from `observationEnd`. §9 Phase 5's *"calendar the demo market so one real
cycle completes with receipts before recording"* now carries a number: **at least one spare day**
before 2026-09-13, and a `resolveDeadline` at least two days after `observationEnd` so a single
`MISSING_OBSERVATION` does not void a market for a transient reason. Full reasoning in question 3.

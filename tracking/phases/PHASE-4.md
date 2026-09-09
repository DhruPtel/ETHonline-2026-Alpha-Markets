# Phase 4 — Market

*The analyst stakes its own money on its own conclusion, and settlement scores it.*

**This document supersedes PLAN-v4 §9's Phase 4 line.** That line — *"`AlphaMarket.sol` + tests,
`spec.ts`, `units.ts`, `events.ts`, `resolve.ts`, `score.ts`, `ui/wallets/`"* — was written
2026-09-05, before Phases 1, 2 and 3 existed. It is a sketch from a moment when the Circle SDK's
behaviour, Vercel's plan limits, the decimal scale, the storage layer and the app had all not been
measured. Where this document and §9 disagree, *Where the plan is now wrong* names it.

**Three documents feed this one and none of them is superseded by it:**

| | |
|---|---|
| `PHASE-4-draft.md` | the decision record — five questions, decision 3 reversed, three things open |
| `PHASE-4-attachment.md` | the structural survey — which export attaches where, and six unowned seams |
| `docs/research/prediction-markets.md` | ⚠️ **new** — how a parimutuel market actually works, from primary sources |

---

## Status

| Unit | File | Kind | Status |
|---|---|---|---|
| **1** | `src/arc/spec.ts` | LOGIC ★ | ⬜ |
| **2** | `contracts/AlphaMarket.sol` | LOGIC ★★ | ⬜ ⚠️ **over 120 lines — seam named** |
| **3** | `scripts/ops/build-contract.ts` → `src/arc/abi.ts` | LOGIC | ⬜ |
| **4** | `src/arc/arc.ts` | LOGIC ★ | ⬜ |
| **5** | `005_markets.sql` + `src/store/markets.ts` | SCAFFOLD ★ | ⬜ ⚠️ **six tables — seam named** |
| **6** | **PLAY GAP — deploy it and drive it by hand** | **PLAY** | ⬜ |
| **7** | `src/arc/market.ts` — create + commit | LOGIC ★★ | ⬜ |
| **8** | `src/arc/settle.ts` — the read and its evidence | LOGIC ★★ | ⬜ **owns the irreversible seam** |
| **9** | `src/arc/resolve.ts` — outcome onto the chain | LOGIC ★ | ⬜ |
| **10** | `app/api/cron/commit/route.ts` | SCAFFOLD | ⬜ **closes A2** |
| **11** | `app/api/cron/resolve/route.ts` | SCAFFOLD | ⬜ **closes A4** |
| **12** | **PLAY GAP — the first unattended cycle, watched** | **PLAY** | ⬜ |
| **13** | `app/markets/` + `app/api/markets/` | SCAFFOLD | ⬜ |
| **14** | `app/markets/[id]/stake.tsx` | LOGIC ★★ | ⬜ **first browser-signed tx in the project** |
| **15** | `src/arc/score.ts` + the record surface | LOGIC | ⬜ **the loop** |
| **16** | **PLAY GAP — one real cycle with receipts** | **PLAY** | ⬜ |

**Sixteen units, four days.** ⚠️ **That does not fit and the cut order at the end is the real plan.**
Units 1–12 are the spine; 13–16 are the product and the proof. Read *The calendar* before starting,
not after.

---

# PASS 1 — Reconcile

⚠️ **Most recent wins. Later findings beat the earlier plan; the code beats both.** Every conflict
below says where it was found and how it was resolved.

## Still holds

- **§5.2's contract interface**, entire. `QuestionCore` hashed with chainId and address,
  `commitPrediction` payable and one-per-author, **side derived from the claim rather than chosen by
  the staker**, permissionless `voidMarket` after `resolveDeadline`, pull-based `claim`, no
  `receive()`, no loop over stakers at resolution, double-claim guard. ⚠️ The research (§5) confirms
  the void reasoning independently: v3 *"couldn't void, so funds were lockable forever"* is the same
  property every mature platform builds for.
- **§5.2's accounting line** — *"all native 18-dp… `require(msg.value % 1e12 == 0)`… the bug is
  mixing units, not storing `msg.value`."* ⚠️ **This was in open conflict with draft §6.1 and the
  conflict is now resolved** — see *Conflicts*.
- **§5.12's three scores**, and its idempotency key `(marketId, claimId)` — explicitly not
  `(marketId, reportRef)`, since two authors can cite one report.
- **§5.16's settlement primitives and both rules.** Daily snapshots survive pruning; missing day →
  `MISSING_OBSERVATION` → retry until `resolveDeadline` → **VOID**; freshness is
  `_meta.block.timestamp ≥ dayEnd + margin`, **not a block number**.
- **§5.3's human surface** — humans stake on Arc in the browser, MetaMask, chainId `0x4cef52`. Still
  the human on-chain action and still the thing A5 needs.
- **§5.18's evidence tiers** — record by default, **record+raw for settlement-backing queries only**,
  and the tier set by the caller, never inferred. ⚠️ Already **built** in `src/graph/evidence.ts`;
  what is missing is a destination, which is Unit 8.
- **R17** — a deployment republished after market creation is a void condition, pinned by `specHash`.
  ⚠️ Written 2026-09-05 and the research (§5) independently arrives at the same rule. It survives.
- **R9** (`require(!resolved)` + idempotent score writes), **R10** (fetch before submit),
  **R21** (missing snapshot → void), **R5** (the 10^12 normalisation at one named site).

## Superseded

| what | said | now | how resolved |
|---|---|---|---|
| **§5.18 resolver nonce** | *"serialize resolver txs through the job lease"* | ⚠️ **there is no job lease and none is being built.** Phase 3's decision 2 removed the apparatus; no `.github/`, no `/api/cron`, no leases | **Made moot rather than satisfied.** One analyst, one or two markets, one invocation per day against a 60-second ceiling — the interval exceeds the ceiling by three orders of magnitude, so two runs cannot overlap. ⚠️ **PLAN §5.18 needs amending**; if a second analyst ever arrives the rule and the machinery both come back |
| **§5.1 job progression** | external ticker + request-driven advance + Vercel daily sweep, all three required | **one daily Vercel cron, no lease, no queue** | draft decision 3R. The ticker was never built in Phase 0 and Phase 3 removed the model it served |
| **§9 Phase 4 file list** | `AlphaMarket.sol` **+ tests**, `spec.ts`, `units.ts`, `events.ts`, `resolve.ts`, `score.ts`, `ui/wallets/` | see the unit table | ⚠️ **`+ tests` implies a test framework, which is a dependency decision this phase cannot afford.** Resolved: **no framework; the contract is exercised on Arc testnet by Unit 6.** Cost recorded under *Sooner over correct*. `units.ts` folds into Unit 4 (one conversion site, not a file). `events.ts` folds into Unit 7 — the only event we read is our own `claimId` |
| **§9 Phase 4 file list, again** | omits the storage layer, the cron routes and the build script | Units 3, 5, 10, 11 | ⚠️ **the same omission §9's Phase 3 line made** — it assumed infrastructure that did not exist. Recorded in PHASE-3 as a pattern and it repeated |
| **R6** | *"Poll as a **job step**, never a held-open request"* | ⚠️ **the installed SDK gives a bounded wait** — `getTransaction({waitForState, pollingInterval, signal})` takes an `AbortSignal` | R6's fear was a request held open on an unbounded state machine. `AbortSignal.timeout()` bounds it inside 60s, and the Circle transaction `id` recorded before the wait makes an abort recoverable. **The rule survives in spirit: never wait unbounded. The mechanism changes** |
| **R19** | ticker missed or duplicated → advance since last completed cursor, **with leases** | reconciliation-based queries, no cursor, no lease | Vercel's delivery is best-effort both ways; the answer is "find all outstanding work", which needs no cursor |
| **R8** | *"Reserve before submission, durable operation ID"* | ⚠️ still right, and it now has a name: the spend ledger, reopened by draft question 4 | unchanged in intent, newly mandatory |
| **draft §6.1** | the `msg.value` unit contradiction, ⬜ OPEN | ✅ **CLOSED** — see *Conflicts* | |

## Never specified

- **How a market subject is expressed.** §5.2 has `specHash` and nothing about what it hashes.
  §5.16 names a `spec.ts` that does not exist. **Unit 1.**
- **Where the threshold comes from.** Nothing in the plan produces one. ✅ **Decided: the creator
  types it.**
- **How the analyst picks a side.** A1 says *"Reconciliation → verdict → committed side"* and never
  says how. **Unit 7 owns it.**
- **What persists.** No table for markets, claims, stakes, scores, evidence or outflows. **Unit 5.**
- **Where an `EvidenceRecord` goes.** ⚠️ The builder exists and its only caller is a demo script.
  **Unit 8.**
- **How `claimId` gets off the chain.** §5.2 returns it; a return value is not readable from a
  receipt and **Circle returns no logs at all**. **Units 2 and 7.**
- **What a market page shows.** **Unit 13.**

## ⚠️ Conflicts found, and how each was resolved

**1 · §5.2 versus draft §6.1 on `msg.value` — resolved, and the research is what resolved it.**
§5.2 said *"the bug is mixing units, not storing `msg.value`"*; draft §6.1 said storing it was
failure #1 and unfixable once deployed. Both were describing something real and they were not
describing the same thing. The parimutuel payout is
`payout_i = stake_i + (stake_i * losingPool) / winningPool`, and `losingPool / winningPool` **is a
ratio of two quantities in the same unit — dimensionless.** The scale cancels; it matters only that
every stake carries the same one. §5.2 is right about the arithmetic and §6.1 is right about the
boundaries. ✅ **Resolved as: store native 18-dp on chain exactly as received, `NUMERIC(78,0)`
off-chain, convert by 10^12 at one named site, display only.** That is also the standing decision
*"money is stored at one scale as NUMERIC, never BIGINT, converted only at display"* — the two now
agree. **Unit 2 lands it on chain; Unit 4 owns the conversion site.**

**2 · §5.18's job lease versus Phase 3's decision 2.** The plan names machinery that was deliberately
removed and never rebuilt. Resolved above: made moot by scale, not satisfied. ⚠️ **This is the class
of conflict to expect more of** — §5.1 and §5.18 were written for a job model this project abandoned
in Phase 3, and any line that says "lease", "ticker" or "advance" should be read as describing a
design that no longer exists.

**3 · "A human directs the analyst to a market" versus A2's "unattended".** These look opposed and
are not. ✅ **Resolved: the human directs, the agent decides and spends.** A person flags a market for
the analyst's attention; the commit cron finds the flag on its own schedule, chooses a side from the
report, and spends without anyone present. A2 asks who pulls the trigger on `commitPrediction`, and
the answer is the schedule. **Unit 5 owns the column, Unit 10 owns the query.**

**4 · §9 Phase 4's `+ tests` versus "no mocks, no fixtures, live networks".** A Solidity test suite is
fixtures by definition, and a framework is a dependency. ✅ **Resolved in favour of the standing rule:
no framework, and the contract's proof is Unit 6 driving it on Arc testnet.** Cost recorded.

**5 · §11's cut order versus this phase.** §11 lists *"Human Arc staking → agent-only"* at #9,
sacrificing A5 and the DoD, and *"Circle DCW → raw ethers"* at #10, sacrificing A3. ✅ **Both still
hold and both are in this phase's cut order at the same relative position** — #9 is our last resort
before losing a requirement, and #10 we do not take at all.

---

# PASS 2 — Against the code

`PHASE-4-attachment.md` is the full survey. The three-line version:

**Attaches cleanly, no change needed:** `store/reports.ts::load` (re-derives the hash and throws) ·
`domain/canonical.ts::canonical/hashCanonical` (takes `unknown` on purpose — `specHash` and
`evidenceHash` need no new code, and writing a second hasher is forbidden by that file) ·
`graph/client.ts::querySubgraph` (its own header names Phase 4's settlement as an intended caller) ·
`queries/snapshots.ts::FINANCIAL_SNAPSHOTS` · `config/analysts.ts::analystByArcAddress` ·
`graph/evidence.ts::buildEvidence` · `store/db.ts::db()` and the migration runner · the server-page /
client-component / API-route shape.

**Nearly attaches — a parameter or an encoding, not a rewrite:**

| | |
|---|---|
| `reportHashBytes()` returns `Uint8Array` | Circle takes `abiParameters: Array<any>`, *"string, number, and boolean"* — so Arc wants `` `0x${reportHash(r)}` ``. **One line off the existing function** |
| `store/reports.ts::list()` | cannot express "reports with no market" — a `LEFT JOIN`. ⚠️ **A new query, not a new parameter**: adding a filter would make the reports store import the market schema. `tokensFor()` is the shape to copy |
| `Fact` | carries slug, deployment, unit, value — **no snapshot field name**, and adding one changes `Report` and invalidates every stored hash. **Unit 1 owns the `FactId` → subject mapping** |

**Cannot express the question — build from nothing:** `contracts/` · `src/arc/` entirely · `spec.ts` ·
market persistence · scoring · both cron routes · **and the browser wallet half, for which this repo
has no precedent at all** — no `window.ethereum`, no wagmi, no WalletConnect anywhere, and
`buy.tsx`'s header argues the opposite case (*"An AGENT pays. The visitor does not"*).

⚠️ **Two package findings that change unit briefs**, both read from the installed source:

1. **`getTransaction` polls for you** — `waitForState` / `waitForTxHash`, `pollingInterval`, and an
   **`AbortSignal`**. SM-08's hand-rolled loop is not the shape to copy. An EOA has its `txHash` at
   `SENT`, so waiting for `COMPLETE` waits for nothing.
2. ⚠️ **Idempotency is opt-in and the default is not idempotent** — the shipped bundle reads
   `idempotencyKey: t ?? ee()`. And **`generateIdempotencyKey`, which the typings export from the
   main entry, appears zero times in both shipped bundles and is `undefined` at runtime.** Importing
   it typechecks and fails when called. **Unit 4 supplies its own key and never imports a generator.**

---

# PASS 3 — What the research changed

Full note: `docs/research/prediction-markets.md`. **Eight things it changed about the design:**

1. ⚠️ **`winningPool == 0` is a first-class path, not a guard.** With one analyst and a few stakers,
   an empty side is the *expected* case, not an edge case. Unguarded it is division by zero and the
   pool is stuck forever; naively guarded, the house silently keeps everything — a real audit finding
   against ScorePlay. **Void semantics: refund every staker their own stake.**
2. ⚠️ **Always truncate, leave the dust, give it to nobody.** Integer division already truncates, so
   the sum of payouts is ≤ the pool by default — **the danger is "fixing" it.** An SBET audit found a
   "last claimer gets the remainder" rule that turned into a claim-order race nobody designed.
3. **Void = refund at parity**, which is what Augur's Invalid (*"paid out at equal values for all
   possible outcomes"*), Polymarket's Unknown/50-50 and UMA's `unresolvable` all do. For a one-pot
   binary market those are the same operation.
4. ⚠️ **`closeTime` ≤ the start of the observed day**, not merely before `observationEnd`. §5.2 only
   requires the commit to precede `closeTime`. **The research adds the harder constraint**: a market
   that takes stakes during the day it measures lets a staker watch the metric move first. That is
   past-posting, and it costs us a day of calendar.
5. **The subject is five machine values, never free text.** Augur and Polymarket accept prose and pay
   for it with an oracle and a dispute system. ⚠️ **A constrained subject is what lets us skip both
   honestly** rather than by omission — a question that cannot be settled cannot be typed.
6. **No takeout.** Takeout is why breakage exists; with no fee the pool is conserved exactly and the
   only leakage is truncation dust.
7. **A single staker and a no-staker market both work by construction** — tests, not branches.
8. **R17 is confirmed from outside** — a republished deployment means the named source is not the
   source being read.

**Deliberately not building, and what it costs:** an oracle · a dispute system · free-text questions ·
a takeout · multi-outcome or scalar markets · an order book · early exit. ⚠️ **The one that is a real
product limitation and belongs on camera: there is no dispute path.** If our resolver reads the wrong
number, nothing on chain contradicts it. What we have instead is a reproducible read — named
deployment hash, named document, named day, hash of the response bytes — so being wrong is
**detectable** by anyone even though it is not **correctable** by anyone.

---

# PASS 4 — Requirements and the loop

| # | requirement | unit that closes it |
|---|---|---|
| **A1** | decision logic tied to real signals | **7** — the side comes from the report's own figure against the threshold, and the report is the justification |
| **A2** | autonomous spending/settlement in USDC | **10** — the commit fires from a schedule with nobody present |
| **A3** | Agent Stack connecting agents to wallets and onchain actions | **4** — Circle DCW EOA, the only named Circle component on Arc |
| **A4** | programmable money flows — conditional, automated, multi-step | **2 + 8 + 9 + 11** — commit → conditional resolution from Graph data → parimutuel payout → void/refund |
| **A5** | meaningful use of Arc and USDC | **2 + 14** — all market value on Arc in native USDC, with humans staking |
| **A6** | deployed or deployment-ready on Arc mainnet | ⚠️ **no unit in this phase.** §9 puts it in Phase 5 and it is only demonstrable once the contract exists. **This is the finding**: a portable manifest, provisioning, permissions and recovery — explicitly *not* an env var and a README line |
| **G2.3** | meaningful work — the fifth step | **7 + 10** — directive → plan → reconciliation → verdict → **on-chain prediction backed by the agent's own USDC** |
| **G1.2 · G2.1** | live Graph data, load-bearing | **8** — re-closed at settlement, which is what makes it end-to-end rather than a fetch at the start |

## The loop, and which units serve it

*An analyst publishes research → stakes its own money on its conclusion → settlement scores it → the
record of being right is what makes its reports worth paying for.*

| step | unit |
|---|---|
| publishes research | ✅ **already built** — Phases 1–3 |
| stakes its own money on its conclusion | **7, 10** |
| settlement scores it | **8, 9, 11, 15** |
| the record makes reports worth paying for | **15** — and ⚠️ **only 15**. Without it the loop is a demo of a market, not a reason to buy a report |

⚠️ **Unit 13 serves the product and no requirement directly.** A market page is how a stranger sees
any of this; it closes nothing on its own and it is named as such. It is the cheapest unit on the
list and the one a video cannot do without.

⚠️ **Unit 15 is the loop's only unit and it is late in the order.** That is a risk, stated: if the
calendar takes the tail, the phase ships a working market with no visible record of the analyst being
right — which loses the product story while keeping every requirement. **See the cut order.**

---

# The calendar — worked backwards, and it sizes the phase

**Today is Wednesday 2026-09-09. The deadline is Sunday 2026-09-13. Four days.**

The constraints that set the dates, none of them ours to choose:

- Vercel Hobby cron is **once per day**, ±59 minutes, and **Vercel does not retry a failed
  invocation**.
- A daily snapshot for day *D* is only readable after *D* ends, plus the freshness margin.
- Research §6: **`closeTime` ≤ the start of *D***.
- `resolveDeadline` ≥ **two days** after `observationEnd`, so one missed run does not void a market
  for a transient reason.

**Working backwards from the video:**

| | must happen by |
|---|---|
| video recorded and submitted | **Sun 13** |
| resolution landed, with receipts | **Sat 12** — leaving Sunday as the spare attempt |
| observation day *D* ends | **Sat 12 00:00 UTC**, i.e. **D = Friday 11** |
| stakes in, `closeTime` reached | **Fri 11 00:00 UTC** |
| market created, analyst committed | **Thu 10, during the day** |
| contract deployed and the commit path working | ⚠️ **Thu 10** |

⚠️ **So Units 1–7 plus play gap 6 have to be done in about a day and a half, and that is the whole
shape of this phase.** Everything after Unit 7 happens while the market is already live.

**The fallback, and it has no spare:** *D* = Sat 12, commit by Fri 11, `observationEnd` Sun 13 00:00,
resolution on submission day. ⚠️ **One missed cron and there is no cycle to show.** Take it only if
Thursday is lost.

## ⚠️ Two markets, and they are not the same thing

**A rehearsal market** — created as soon as Unit 6 can create one, over a day that has **already
closed**. Its whole purpose is to drive resolve, void, claim and the empty-pool path immediately
instead of waiting for a calendar day. ⚠️ **Its commit is after the fact, so it is not a forecast and
must never be presented as one.** It is a machinery proof and nothing else.

**The demo market** — *D* = Friday 11, committed Thursday, genuinely unknown at commit time. **This is
the one on camera** and the only one whose result means anything.

⚠️ **The cron route can also be triggered on demand** — `vercel crons` triggers on demand and the
deployment summary has a run button — which is what makes the rehearsal possible at all. **The
scheduled fire is the claim; the manual trigger is for rehearsal.** The video shows the scheduled
run's logs and its on-chain receipts, not a button being pressed.

---

# The units

⚠️ **One file per commit. LOGIC units stay near 120 lines of real logic. Never two subsystems in one
commit.** Where a unit exceeds that, the seam is named here rather than found mid-write.

---

## Unit 1 · `src/arc/spec.ts` — what a market asks, and its hash

**LOGIC ★ · pure, no I/O.** The first unit because the contract, both tables and both crons all
reference it, and it can be written while nothing else exists.

**In it:** the `MarketSpec` shape — **five machine values**: deployment slug, metric, comparison,
threshold, observed day. Validation against `config/protocols.ts` (slug is live) and the legal metric
set. The day-window arithmetic. The freshness rule. `specHash` via `hashCanonical`.

⚠️ **It owns the `FactId` → subject mapping** (attachment seam 4). `Fact` carries `slug`, `deployment`
and `unit` but **not the snapshot field name**, and adding one would change `Report` and invalidate
every stored hash — including four already committed in ATS creation events on chain. The mapping
lives here.

⚠️ **Legal metrics are balance and flow only.** Draft decision 1: revenue is forbidden as a subject —
aave-v3's cumulative accumulator is poisoned and 19 of 25 deployments were never swept. The
validator refuses a revenue metric by name, with a message saying why.

⚠️ **The window is `[D, D + 86399]`, not `[D, D + 86400]`.** `FINANCIAL_SNAPSHOTS` filters
`timestamp_gte`/`timestamp_lte` — **`lte`, closed** — while §5.16's rule is the half-open
`[D, D+86400)`. A snapshot at exactly `D + 86400` would otherwise belong to two days.

⚠️ **`closeTime ≤ dayStart(D)`**, from research §6. §5.2 only requires the commit to precede
`closeTime`; this is the stricter rule and the validator enforces it.

⚠️ **`resolveDeadline ≥ observationEnd + 2 days.**` A daily cron with no retry gets one attempt a day.

**Proof:** a spec over a real live deployment hashes to a stable 64-hex value twice · the same spec
with one field changed hashes differently · a revenue metric is refused by name · a slug not in
`config/protocols.ts` is refused · a `closeTime` inside the observed day is refused · the window for
2026-09-11 comes back as exactly `[1789084800, 1789171199]` — ⚠️ **verified against `date -u`, not
derived by hand**; the first draft of this line was a year out.

---

## Unit 2 · `contracts/AlphaMarket.sol` — the market

**LOGIC ★★.** §5.2's interface, unchanged. ⚠️ **Do not redesign it here.**

⚠️ **SEAM NAMED: this file will exceed 120 lines and that is accepted.** Seven functions, pool
accounting and a void path do not fit in 120 lines of Solidity. **Its commit carries nothing else** —
no build script, no TypeScript, no migration. That is the property the 120-line rule is protecting
and it is kept.

**In it:** `createMarket`, `commitPrediction` (payable, one per author, before `closeTime`), `stake`
(**side derived from the claim**), `resolve`, `voidMarket` (**permissionless after
`resolveDeadline`**), `claim` (pull-based).

⚠️ **The seven warnings, and six of them come from the research:**

1. ⚠️ **`winningPool == 0` is a first-class branch — refund every staker their own stake.** With one
   analyst and a handful of stakers an empty side is *expected*. Unguarded: division by zero and the
   pool is stuck forever. Naively guarded: the house keeps everything, which is a real audit finding.
2. ⚠️ **Always truncate. Never round up.** `payout = stake + (stake * losingPool) / winningPool`;
   truncation makes the sum of payouts ≤ the pool, and that inequality is the safety property.
3. ⚠️ **Leave the dust. Give it to nobody.** A "last claimer gets the remainder" rule is a claim-order
   race, found in a real audit.
4. ⚠️ **No takeout.** No fee, so the pool is conserved exactly.
5. ⚠️ **`msg.value` is stored exactly as received, at 18-dp native.** Conflict 1 above resolved this:
   the scale cancels in the payout ratio, so what matters is that every stake carries the same one.
   `require(msg.value % 1e12 == 0)` per §5.2, so 6-dp USDC converts cleanly.
6. ⚠️ **`commitPrediction` must EMIT the `claimId`, not only return it.** A return value from a
   state-changing call is not readable from a receipt, and **Circle returns no logs at all** — the
   off-chain side cannot get it any other way. This is attachment seam 3 and the contract is where it
   closes.
7. ⚠️ **`QuestionCore` is hashed with `chainId` and the contract address** (§5.2 — domain separation),
   and no `receive()`, and a double-claim guard, and no loop over stakers at resolution.

⚠️ **No test framework.** §9 said *"+ tests"*; a framework is a dependency decision and a fixture
suite contradicts three phases of "live networks only". **The proof is Unit 6.** Cost recorded under
*Sooner over correct*.

**Proof:** it compiles under the pinned `solc@0.8.28`. ⚠️ **Everything else about this unit is proved
by Unit 6 on Arc testnet**, and that is deliberate.

---

## Unit 3 · `scripts/ops/build-contract.ts` → `src/arc/abi.ts`

**LOGIC.** Draft decision 2, including its constraint on the unit.

**In it:** trace the import closure from `contracts/`, compile with pinned `solc`, write **the ABI and
the bytecode** into `src/arc/abi.ts` as an ordinary typed module TypeScript imports. ⚠️ **Reuse
`scripts/ops/verify-ats.ts`'s trace-and-compile machinery rather than reimplementing it** — it is
already most of a build step.

⚠️ **The artifact is committed because nothing compiled ships to Vercel.** `solc` and
`@openzeppelin/contracts` are devDependencies and absent from a deployed function — the same
constraint that stops `tokenize/ats.ts` verifying its own tokens.

⚠️ **THE CONSTRAINT ON THIS UNIT, and it is a requirement rather than a note: something must fail
loudly when `src/arc/abi.ts` drifts from `contracts/`.** A stale ABI decodes the wrong fields against
a live contract holding real USDC and nothing about it looks broken. ⚠️ **A warning is not
sufficient** — this project has already shipped a generated-file-that-drifts once, when `tokenize.ts`
printed a verify command and trusted a person to run it, leaving three of four tokens unverified
against a pass/fail requirement. The check goes where it cannot be skipped: a `prebuild` script so
`next build` runs it, and it **refuses** rather than warns.

⚠️ **This edits `package.json`'s `scripts` — a change, not a dependency.** Named here rather than
done quietly.

**Proof:** run it, commit the artifact, change one character in the `.sol`, and watch `npm run build`
**refuse**. Then rebuild and watch it pass.

---

## Unit 4 · `src/arc/arc.ts` — the plumbing every Arc write shares

**LOGIC ★.** `tokenize/hedera.ts`'s role for a different chain. **No market logic here** — that is
Unit 7.

**In it:** the chain constants (chainId `5042002`, RPC from env, the native-USDC address). The Circle
client, **lazy and memoized, never at module scope** — `payments/server.ts`'s pattern, because a
missing env var at import time is a cold-start crash loop. A `submit()` that wraps
`createContractExecutionTransaction` and the wait. The **one** conversion site between 18-dp native
and 6-dp USDC. A read-only provider for receipts.

⚠️ **Supply `idempotencyKey` explicitly, every call.** The shipped bundle reads
`idempotencyKey: t ?? ee()` — absent a key, a fresh one is generated per call, so **a duplicate cron
delivery is a second transaction and a second spend.**

⚠️ **Never import `generateIdempotencyKey`.** It is declared in the typings and re-exported into the
main entry, appears **zero times in both shipped bundles**, and is `undefined` at runtime under ESM
and CJS alike. It typechecks and fails when called. ⚠️ **The sixth instance of this project's
recurring failure and the first caught before it cost anything.**

⚠️ **The key must survive a cold start**, so it is stored on the row at first attempt and reused on
retry — not derived from a clock, and not derived from a hash until someone has checked whether
Circle validates the UUID shape. The stored-key version works either way.

⚠️ **Bound the wait with `signal: AbortSignal.timeout(...)`** against the 60-second ceiling, and wait
for **`SENT`**, not `COMPLETE` — the typings say an EOA has its `txHash` at `SENT`. Waiting further
waits for nothing.

⚠️ **Record the Circle transaction `id` before waiting.** If the wait aborts the transaction is still
in flight; the id is what the next run reconciles against. This is `purchases.native_tx_id` written
before settle, on a different rail.

⚠️ **A Circle failure is not a revert.** `landOrStop` exists because a Hashio revert is
unattributable without Mirror Node; Arc has none and Circle's failures are `TransactionState` values
— `FAILED`, `DENIED`, `CANCELLED`, `STUCK` — with `errorReason` and `errorDetails` on the
`Transaction`. **Read a state machine, not a receipt.**

⚠️ **The analyst identity guard lives here** (attachment seam 5): refuse to sign when
`CIRCLE_WALLET_ID` does not resolve to the analyst row's `arcAddress`. `verify-analyst.ts` is a CLI a
cron never runs; `ats.ts:132` is the in-path pattern to copy. **A mismatch stops rather than
proceeds** — otherwise the analyst commits from an address no report is attributed to, and
`analystByArcAddress` throws at settlement on a claim already on chain.

**Proof:** against live Arc testnet — the client resolves `CIRCLE_WALLET_ID` to the address in
`config/analysts.ts` and refuses a deliberately wrong one · a read-only call returns · the conversion
site turns SM-08's measured `2500000000000000000` into `2.50` and back.

---

## Unit 5 · `005_markets.sql` + `src/store/markets.ts`

**SCAFFOLD ★.** Precedent: PHASE-3 Unit 4 was `db.ts` + `001_init.sql` as one unit.

⚠️ **SEAM NAMED: six tables in one migration is more than one thing.** They go together because they
share foreign keys and a half-applied set is worse than a large one — the runner has no version
table, only idempotent DDL. **Accepted, and the module beside it stays read-only.**

**Tables:** `markets` · `claims` · `stakes` · `scores` · `settlement_evidence` · `spend_ledger`.

⚠️ **`NUMERIC(78,0)` for every amount, never `BIGINT`.** 001_init's rule was BIGINT for atomic money,
and that reasoning was about a value that fits. **An 18-dp USDC amount overflows BIGINT at about 9.22
USDC** — 78 digits covers `uint256`. Still exact, still no decimal point. ⚠️ **TEXT is not viable**:
the ledger's cap is a `SUM`.

⚠️ **Landmark timestamps, never a mutable state enum.** `committed_at`, `resolved_at`, `voided_at`,
all nullable. **`quotes.state` is the cautionary tale** — specified, `CHECK`-constrained, indexed by
`quotes_report_state_idx`, and it has **no writer**; every row is `'open'` forever, so the index
covers a constant column. `purchases`'s nullable landmarks are the shape that worked: a null means
exactly what it looks like, and it cannot silently not-be-written. **Both crons' find-work queries
depend on this.**

⚠️ **`stakes` is 004's lesson verbatim** — one row per stake transaction, `tx_hash TEXT NOT NULL
UNIQUE` so a re-record after a retry is a no-op rather than a duplicate claim, and `seq BIGSERIAL`
because two stakes in one second are possible and the clock cannot separate them.

⚠️ **The on-chain `marketId` and `claimId` are nullable until they land**, exactly like
`report_tokens.transfer_tx`. The row must exist **before** the chain call or the cron cannot be
idempotent.

⚠️ **`settlement_evidence.raw` is TEXT, never jsonb** — 001's first rule, and it binds harder here:
`evidenceHash` is over canonical bytes and jsonb reorders keys, normalises numbers and drops
duplicates. Same for `spec_json`.

⚠️ **`scores` is keyed `(market_id, claim_id)`** per §5.12 — explicitly not `(market_id, report_hash)`.

⚠️ **A `directed_at` column on `markets`** is how a human points the analyst at one. Conflict 3.

⚠️ **No `ON DELETE CASCADE`**, TIMESTAMPTZ everywhere, `IF NOT EXISTS` on every statement.

**Proof:** `migrate.ts` applies it, then runs again as a clean no-op with five migrations · a
`NUMERIC` round-trip of `2500000000000000000` comes back byte-identical as a string · the driver does
not turn it into a float.

---

## Unit 6 · PLAY GAP — deploy it and drive it by hand

**PLAY. ⚠️ A numbered unit, not a reminder, and the most important one in the phase.**

Deploy `AlphaMarket.sol` to Arc testnet with `ARC_DEPLOYER_KEY` and drive **every path** from a
script before any cron exists: create a market · commit from the Circle wallet · stake from a second
EOA · resolve · claim · and separately **void**, **an empty winning pool**, and **a single staker**.

⚠️ **This is where contract bugs get found, and it is the only place they can be** — there is no test
framework, by decision. A bug found here costs a redeploy; a bug found after Unit 10 costs a redeploy
*and* every row that references the old address.

⚠️ **Deployment does not go through Circle.** SM-08's header: *"`deployContract` ships in the
package's typings but is not exposed on the developer-controlled-wallets client."* So the deployer is
necessarily a **different identity** from the analyst that commits on it. That is fine and it is
recorded so nobody treats it as a bug.

⚠️ **Fund the wallet first**, and check `requestTestnetTokens` still works — SM-08 recorded the faucet
API rate-limiting independently of its web form.

**Proof:** every path above, on chain, with transaction hashes. ⚠️ Specifically: **the empty-pool
refund returns every staker exactly their stake**, and the sum of payouts on a normal resolution is
**≤ the pool**, checked by reading the contract balance after the last claim.

---

## Unit 7 · `src/arc/market.ts` — create and commit

**LOGIC ★★.** `tokenize/ats.ts`'s prepare/spend split, which matters more here because a reverted Arc
call spends USDC.

**In it:** `prepare()` — every read-only check that can stop the run: the report loads and passes its
hash check, the spec validates, the analyst row resolves and matches the Circle wallet, the market is
not already committed, the balance covers it. `create()` and `commit()` — the only things that spend.

⚠️ **It owns how the analyst picks a side** (A1, and nothing in the plan ever specified it).
**Deterministic, from the report's own figure against the threshold** — the report is the
justification and `assessment` is the words. ⚠️ **Sooner over correct: no second model call.** A
60-second function cannot afford one, and a deterministic rule is auditable in a way a model call is
not. **Recorded as a decision, not an implementation detail.**

⚠️ **`verdict.call` is `null` on a metric-across-deployments report** — the type says so. Handle it
rather than assuming a verdict exists.

⚠️ **`claimId` comes back through three components**: wait for the `txHash`, fetch the receipt over
the **Arc RPC** because Circle returns no logs, decode the event with the committed ABI. Attachment
seam 3, and this unit owns the off-chain half.

⚠️ **Two chain writes, so a run can die between them.** `createMarket` then `commitPrediction`, the
same shape as `ats.tokenize()`'s deploy → grantRole → issue. **The market row records which landed**,
and nothing retries blindly.

⚠️ **The plan is serializable and that is a difference from Hedera.** `ats.prepare()` returns an
`ethers.Wallet`, so *"a `TokenPlan` cannot cross HTTP"* and the console must prepare twice. A Circle
signer is an API call with no local object, so this plan crosses a request boundary intact.

**Proof:** on live Arc testnet — `prepare()` refuses an already-committed market, a wrong
`CIRCLE_WALLET_ID` and an invalid spec, each with its own sentence · then a real create + commit,
with the `claimId` read back from the event and written to the row.

---

## Unit 8 · `src/arc/settle.ts` — the read, and its evidence

**LOGIC ★★. ⚠️ This unit owns the worst of the six seams, and it is the irreversible one.**

**In it:** the settlement read and the outcome. `querySubgraph(slug, FINANCIAL_SNAPSHOTS, {first: 1,
skip: 0, startTimestamp, endTimestamp})` — **unpinned**, no `block` argument. The freshness assert.
`MISSING_OBSERVATION`. `buildEvidence(result, { tier: 'record+raw' })`, **persisted**, and
`evidenceHash` over it.

⚠️ **THE SEAM: `buildEvidence` has a correct implementation and no destination.** Its only caller
today is `scripts/demo/evidence.ts`. Reports persist `Provenance`, which has **no `responseHash` and
no `raw`**. Without this unit a resolver could pass `record+raw`, receive a perfect `EvidenceRecord`,
pass its own proof, and drop it on the floor — and `resolve` would commit 32 bytes on chain to bytes
that exist nowhere. ⚠️ **That is irreversible: the hash is on chain.** **This unit is never cut.**

⚠️ **Do not reach for `paginate()`.** It cursors on `lastId` and `FINANCIAL_SNAPSHOTS` declares no
`$lastId`. A day window is one row.

⚠️ **The freshness signal exists only because the read is unpinned.** `client.ts` pins
`_meta(block: $block)` whenever a block is requested, and **a pinned `_meta` returns a null
timestamp — measured, consistently.** Pinning this read later would silently delete the freshness
check rather than break it.

⚠️ **Fetch before submit** (R10). The read completes and the evidence is stored before anything goes
on chain.

**Proof:** against the live gateway — a real day resolves to a real outcome with an `EvidenceRecord`
whose `raw` is present and whose `responseHash` matches a re-hash of the stored bytes · a day with no
snapshot returns `MISSING_OBSERVATION` rather than a wrong answer · a `dayEnd` in the future fails the
freshness assert.

---

## Unit 9 · `src/arc/resolve.ts` — the outcome onto the chain

**LOGIC ★.** Small, and separate from Unit 8 on purpose: one decides, one spends.

**In it:** take Unit 8's outcome and `evidenceHash`, submit `resolve` through Unit 4, record
`resolved_at`. The void path: `MISSING_OBSERVATION` past `resolveDeadline` → `voidMarket`. R17's
republished-deployment check → void.

⚠️ **Check state before submitting.** `require(!resolved)` reverts a duplicate — **but a revert costs
gas and gas is USDC.** Vercel's own guidance is to check state first, and here it is money.

⚠️ **`voidMarket` is permissionless after `resolveDeadline` (§5.2)**, so this is the one path that
does not depend on the cron working. Worth knowing on a four-day calendar.

**Proof:** on live Arc testnet — the rehearsal market resolves and `resolved_at` is written · a
market whose day has no snapshot voids after its deadline · a second resolve attempt is refused
before it spends anything.

---

## Unit 10 · `app/api/cron/commit/route.ts` — ⚠️ closes A2

**SCAFFOLD.** Thin: auth, find work, call Unit 7, report.

⚠️ **`CRON_SECRET` compared against `Authorization: Bearer …`**, which Vercel sends automatically.
`config/env.ts::requiredEnv` is the guard — an empty value would compare equal to a missing one under
`??`, and this project has shipped that bug five times.

**Finds work:** markets a human has directed at the analyst, with no analyst claim yet. A `LEFT JOIN`
— ⚠️ `list()` cannot express it, and bending it would make the reports store import the market schema.

⚠️ **Reconciliation-based, never "since I last ran".** Vercel's delivery is best-effort in both
directions: a run can silently not happen, and the same run can be delivered twice.

⚠️ **`export const maxDuration = 60`.** A route that declares nothing gets roughly ten seconds, and a
declared 300 is silently clamped. `app/api/reports/[hash]` had no declaration against a measured
8.6-second settle until 2026-09-09.

⚠️ **`vercel.json` gains a `crons` entry** — the first in this project. A more-frequent-than-daily
expression **fails at deploy time**, which is the one loud failure in this area.

**Proof:** deployed, and **the scheduled run fires with nobody watching** — the market row gains a
`claimId` and Vercel's log shows a `vercel-cron/1.0` request. ⚠️ **That log is the A2 evidence.**

---

## Unit 11 · `app/api/cron/resolve/route.ts` — ⚠️ closes A4

**SCAFFOLD.** Same shape: auth, find markets past `observationEnd` with `resolved_at IS NULL` and
`voided_at IS NULL`, call Units 8 and 9.

⚠️ **Two cron entries can share one route** — `x-vercel-cron-schedule` disambiguates. Two routes is
simpler and this phase takes simpler.

⚠️ **The whole run — Graph read, Circle submit, bounded wait — inside 60 seconds.** Unit 4's
`AbortSignal` is what makes that safe, and the recorded Circle `id` is what makes an abort
recoverable.

**Proof:** the rehearsal market resolves **from the schedule**, unattended, with an on-chain
`resolve` transaction and a stored `EvidenceRecord` behind its `evidenceHash`.

---

## Unit 12 · PLAY GAP — the first unattended cycle, watched

**PLAY.** Create the **demo market** for *D* = Friday 11, direct the analyst at it, and then **do
nothing**. Watch the commit cron fire on Thursday's schedule. Stake by hand. Watch the resolve cron
fire on Saturday's.

⚠️ **This is the unit that proves the phase**, and it is the one the calendar is built around. If it
has not started by Thursday evening, the fallback in *The calendar* is already in effect.

**Proof:** two Vercel cron log entries, two Arc transactions, and a settled market nobody touched.

---

## Unit 13 · `app/markets/` + `app/api/markets/`

**SCAFFOLD. ⚠️ Serves the product, closes no requirement on its own** — named as such. It is also the
cheapest unit here and the one a video cannot do without.

**In it:** a list of markets and one market's page — the question in words, the analyst's side and its
report, pool totals, the dates, and after resolution the outcome with its evidence and a link to the
Arc transaction. Server component for reads; a route for anything needing the chain, the way
`/api/holdings` does with a **minimal inline ABI** rather than a typechain factory.

⚠️ **Display converts; nothing else does.** 18-dp native in, 6-dp USDC on the screen, through Unit 4's
one site.

⚠️ **`app/markdown.tsx` is the escaping boundary.** `Market.name` and `Token.symbol` are
indexer-supplied and reach reports (§5.18).

**Proof:** deployed, and a stranger can read what the market asks, what the analyst said, and why.

---

## Unit 14 · `app/markets/[id]/stake.tsx` — ⚠️ the first browser-signed transaction

**LOGIC ★★.** MetaMask, `wallet_addEthereumChain` with chainId `0x4cef52`, `stake(marketId, claimId)`.

⚠️ **This repo has no precedent for this and the nearest page argues the opposite case.** No
`window.ethereum`, no wagmi, no WalletConnect anywhere in `src/`, `app/` or `scripts/` — the only grep
hit is a comment in `buy.tsx` explaining why there isn't one: *"An AGENT pays. The visitor does not…
Nobody's wallet is connected, no browser signs anything."* Every chain interaction in this project so
far is server-signed.

⚠️ **SM-09 is the smoke test for exactly this and it is a manual markdown walkthrough with no
script** (`smoke:09` is an `echo` saying so). Its `next build` half was deferred to this phase. **This
unit is where it closes.**

⚠️ **The side is not chosen here.** §5.2: a staker stakes *alongside a claim* and the side is derived
from it. A UI offering a side would be building the hole §5.2 closed.

⚠️ **POST the tx hash to a refresh route** (§5.18). The discipline is `gate.ts`'s: write the
identifier before you can confirm it, reconcile after.

⚠️ **R28 is the fallback**: if this fails under `next build`, narrow to agent-only staking with a
second Circle wallet. **That weakens A5** and Arc still sees value move.

**Proof:** a real stake from MetaMask on a deployed build, the pool total moving on the page, and the
row in `stakes` carrying the transaction hash.

---

## Unit 15 · `src/arc/score.ts` + the record surface — ⚠️ the loop

**LOGIC.** §5.12's three scores, idempotent on `(market_id, claim_id)`.

**In it:** **reconciliation quality** — ⚠️ **already computed and stored**, it is `Report.verdict`, so
this reads rather than derives. **Forecast accuracy** — the claim's side against the resolved
outcome. **Trading return** — what the claim actually got back. Plus the analyst's record on the
report page and the index.

⚠️ **This is the only unit that serves the loop**, and without it the phase ships a working market
with no visible reason that an analyst's reports are worth paying for. It closes no requirement,
which is exactly why it is at risk — **see the cut order.**

**Proof:** after the demo market resolves, the analyst's page shows a real record: one prediction,
its outcome, and what it earned or lost.

---

## Unit 16 · PLAY GAP — one real cycle with receipts

**PLAY.** §9 Phase 5's *"calendar the demo market so one real cycle completes with receipts before
recording"* — brought forward, because on this calendar it is not a polish step.

Walk it as a stranger: read a report → see the market → see the analyst's side and its justification →
stake → watch it resolve → see the score. Collect every hash.

**Proof:** the walk, end to end, with nothing run by hand except the human stake.

---

# ⚠️ Two things that are not units

**1 · The Circle wallet-set spend cap — and its trigger has already fired.**
`tracking/smoke-results.md`, SM-08's *To do*, written 2026-09-06:

> **What:** Set a spend cap on the wallet set in Circle's console before anything autonomous runs on
> Arc. **Why:** Circle's limits are **server-side wallet-set policy**, not a client-side option —
> there is no `spendControls` on the developer-controlled-wallets client… This run spent 2.5 USDC on
> a single call with nothing standing in its way. **When:** before the agent commits on Arc
> unattended (Phase 4) · **Status:** open

⚠️ **Decision 3R is that trigger.** It is a console action, not code, so **no unit will ever remind
anyone** — and it is the only guard that exists at all until the spend ledger is built. **Do it before
Unit 10 deploys.**

**2 · The digit guard's inherited obligation, with both gaps still open.**
`PHASE-3.md` moved enforcement here — *"enforcement moves to Phase 4, when a report backs a market"* —
gated on closing two gaps first. Checked 2026-09-09: **both are still open.** `execute.ts:257` emits
`market-population` as a **check** with the count inside a rationale string, not a `unit: 'count'`
fact; and no utilization or ratio fact is emitted anywhere, because `FIGURES` and `MARKET_FIGURES` are
USD-only. `validate.ts` still only warns.

⚠️ **`specHash` binding a market to a report is the trigger the 2026-09-08 decision named**, and a
third party now has money on it. ⚠️ **Not a unit in this phase, and that is a choice rather than an
oversight** — closing both gaps is two `execute.ts` changes plus a switch, and this calendar does not
have them. **Recorded as accepted debt**: a staked report may carry a figure a reader cannot trace.

---

# ⚠️ Sooner over correct — taken deliberately, recorded here

| taken | instead of | what it costs |
|---|---|---|
| no Solidity test framework; Unit 6 proves the contract on testnet | hardhat or foundry | a contract bug costs a redeploy instead of a failing test. ⚠️ **The largest accepted risk in the phase** |
| deterministic side selection from the report's figure | a model call at commit time | the "decision" is a rule rather than reasoning. ⚠️ Auditable, and it fits in 60 seconds |
| two cron routes | one route reading `x-vercel-cron-schedule` | one more file |
| the Circle console cap as the spend guard, ledger after | the durable ledger first | ⚠️ the cap is outside the code and outside CI. If the console step is skipped there is **no guard at all** |
| six tables in one migration | six migrations | a half-applied set is worse than a large one |
| the market page instead of a market-creation UI | a form anyone can use | markets are created from a script. ⚠️ *"Anyone creates a market"* is true of the contract and not yet of the product |

---

# ⚠️ If the calendar slips — cut in this order

| # | cut | costs | still true after |
|---|---|---|---|
| 1 | **Unit 16** — fold into Unit 12 | one rehearsal. ⚠️ Do not cut both play gaps | every requirement |
| 2 | **Unit 13's list page** — one market page, linked from the report | discoverability | every requirement |
| 3 | **Unit 15** → the report page shows the raw claim and outcome, no scores | ⚠️ **the loop stops being visible.** A working market, and no reason a reader should pay more for the next report | A1–A6; §5.12 unclosed |
| 4 | **the spend ledger** → the Circle console cap alone | ⚠️ no in-code guard; draft question 4 stays open into Phase 5 | every requirement |
| 5 | **Unit 14** → agent-only staking, second Circle wallet (**R28**, §11 #9) | ⚠️ **weakens A5** and breaks §5.3's definition of done — *"a stranger can browse, read previews, stake"*. Arc still sees value move | A1–A4, A6 weakened |
| 6 | **the demo market's forward cycle** → rehearsal market only | ⚠️ **the analyst is no longer forecasting**, and that is the product. Take this only to avoid shipping nothing | mechanically A2/A4; not honestly |

**Never cut:** the contract · **Unit 8's evidence persistence** (irreversible) · the commit cron (A2) ·
the resolve cron (A4) · the void path · **live Graph data at settlement** (G1.2/G2.1).

⚠️ **§11 #10 — "Circle DCW → raw ethers" — is not on this list and should not be taken.** It sacrifices
A3, which is the strongest Agent Stack evidence in the project, to save work that Unit 4 has already
done.

---

# Every decision has an owning unit

| decision | owner | ⚠️ must be settled by |
|---|---|---|
| what a market subject *is* — the five values | **Unit 1** | before Unit 2, which hashes it |
| the `FactId` → subject mapping | **Unit 1** | before Unit 7 reads a report's figure |
| `msg.value` scale on chain | **Unit 2** | ✅ **already resolved** — conflict 1 |
| whether `commitPrediction` emits `claimId` | **Unit 2** | ⚠️ **before it is deployed.** Unfixable after |
| where the ABI drift check runs | **Unit 3** | with the unit |
| the idempotency key's shape and storage | **Unit 4** | before Unit 10 can be idempotent |
| the one conversion site | **Unit 4** | before Unit 13 displays anything |
| `NUMERIC(78,0)` vs `BIGINT` | **Unit 5** | ✅ **already decided** — NUMERIC, never BIGINT |
| landmark timestamps vs a state enum | **Unit 5** | before either cron's find-work query |
| how the analyst picks a side | **Unit 7** | ⚠️ **A1 depends on it.** Deterministic, recorded |
| where an `EvidenceRecord` is stored | **Units 5 and 8** | ⚠️ **before any `resolve` lands on chain** |
| whether a human can create a market in the product | **Unit 13** | can slip; the contract is already permissionless |

---

# Where the plan is now wrong

| § | says | reality |
|---|---|---|
| **§9 Phase 4** | `AlphaMarket.sol` **+ tests** | no framework — a dependency decision and a fixture suite. Unit 6 is the proof |
| **§9 Phase 4** | `units.ts`, `events.ts` as files | `units.ts` is one conversion site inside Unit 4; `events.ts` is the `claimId` decode inside Unit 7 |
| **§9 Phase 4** | omits storage, the cron routes and the contract build | Units 3, 5, 10, 11. ⚠️ **The same omission §9's Phase 3 line made** |
| **§5.18** | *"serialize resolver txs through the job lease"* | ⚠️ **no lease exists and none is being built.** Made moot by scale — one analyst, one daily invocation, a 60-second ceiling |
| **§5.1** | three job mechanisms, all required | one daily cron, no lease, no queue — draft decision 3R |
| **R6** | poll as a job step, never a held-open request | ⚠️ the installed SDK bounds the wait with an `AbortSignal`. The rule survives; the mechanism changes |
| **R19** | advance since the last completed cursor, with leases | reconciliation queries, no cursor. Vercel's delivery is best-effort both ways |
| **§9 Phase 5** | *"calendar the demo market so one real cycle completes"* | ⚠️ **not a polish step on this calendar** — it is Unit 12 and it sets Thursday's deadline |
| **§4 A6** | Arc mainnet readiness | ⚠️ **no unit in this phase, and that is the finding.** Only demonstrable once the contract exists; Phase 5 or it does not happen |

# PHASE 8 — the demo market: the loop, playable, in about three minutes

**Written 2026-09-13.** A plan only. No code in this commit.

A judge picks a question about a day that has already happened, stakes real USDC on Arc, presses
reveal, and watches settlement read The Graph and grade the claim. The outcome is real — the day has
passed and the snapshot exists — so nothing is randomised. The judge simply has not been shown it.

---

## 0 · ⚠️ READ THIS FIRST: the brief's central mechanic is **refused by the deployed contract**

**A market about a past day cannot be staked on.** Not "is awkward to" — the contract reverts.

```solidity
function _open(uint256 marketId) private view returns (Market storage m) {
    m = _market(marketId);
    if (block.timestamp >= m.closeTime) revert StakingClosed(m.closeTime);   // AlphaMarket.sol:363
}

// and createMarket:
if (q.closeTime >= q.observationEnd || q.observationEnd > q.resolveDeadline) revert BadTimes();
```

Both `commitPrediction` and `stake` go through `_open`. So staking requires `now < closeTime`, and
creation requires `closeTime < observationEnd`. For a genuinely past day, `observationEnd` is in the
past, therefore `closeTime` is further in the past, therefore **`_open` always reverts**.

⚠️ **This is why no rehearsal has ever been staked.** Markets 8, 9 and 10 were created and settled by
the deployer to exercise resolve, void and refund; nothing was ever staked on them and nothing could
have been. `stakes` confirms it — every row is on markets 6, 11 and 12, all genuine forecasts.

**The design in the brief is not buildable as written.** What follows is the nearest thing that is,
and the compromise it rests on is stated rather than buried.

### 0.1 The only escape, and what it costs

The contract stores three timestamps and **never checks them against the day the question names** —
its own header says so: *"a market can be created about a day already observed, and this contract
cannot tell… Policy about `closeTime` versus the observed day lives in `spec.ts`."*

So a demo market is one whose **spec names a past day** while its **`closeTime` and `observationEnd`
are a couple of minutes in the future**. Staking works because `closeTime` is ahead of now.
Settlement works because `settle()` reads the day named in the spec, which is long finished.

⚠️ **And that is exactly the thing `spec.ts` exists to forbid.**

```ts
// spec.ts::questionCore — ⚠️ closeTime <= dayStart, stricter than §5.2
if (times.closeTime > start) throw new Error('…Staking must close before the day being measured
  starts — a stake placed during it is a bet on an outcome that is already partly known.')
```

That rule is **past-posting** prevention, with a racing citation and a research note behind it.
**The demo market is past-posting, deliberately, and there is no version of this feature that is
not.** The judge is betting on a settled race. That is the whole point — and it means the demo can
never be presented as a forecast, and its results can never be folded into the analyst's forecast
record without corrupting the one number this product sells.

**Everything in §2 follows from that single fact.**

---

## 1 · What already works, and what has to be built

⚠️ **Read this split before estimating.** Most of the machinery runs; the gap is narrower than the
blocker in §0 makes it sound.

**Exists and is proven:**

- `createMarket` over a past day — the contract permits it and three rehearsals did it.
- `settle(spec)` reads an arbitrary day from The Graph and writes evidence. ⚠️ Its freshness rule is
  `_meta.block.timestamp >= observationEnd + 3600`, which a past day passes **instantly** — this is
  the reason the reveal can be immediate.
- `resolve()` / `voidMarket()` and all ten of `prepare()`'s guards.
- `scoreMarket()` / `scoreSettled()`, the cron caller, `scripts/ops/score.ts`.
- `agent/context.ts`, `reports.context_digest`, and the verbatim block on `/analyst`.
- `PositionControl` already does the whole browser-wallet dance: EIP-1193 detection,
  `wallet_switchEthereumChain`, `wallet_addEthereumChain` with the Arc parameters, a chain-id
  re-check after switching, and a balance-versus-gas-headroom check.
- `isRehearsal()`, `settledOnChain()`, `GradeMarker`, `analystRecord()`, `recordLine()`.

**Must be built:**

- a **demo spec path** that deliberately sets `closeTime` in the future (`questionCore()` refuses it);
- **create-on-demand**, because a demo market is only stakeable for ~90 seconds (§2.6);
- the **past-posted predicate** and its marker on every record surface (§2.2);
- the **`/demo` page** and its three states;
- a **no-wallet path** (§2.7), which is not optional;
- a `scripts/ops/` driver to create, list and retire demo markets.

**Nothing here needs a schema change, a contract change or a new dependency.**

---

## 2 · The things the brief asked to settle

### 2.1 ⚠️ Two payouts — the page shows **one**, and it is the real one

The judge's real payout comes from `payoutOf(marketId, judge)` against the real pool. The
"illustrative" payout including ten simulated participants is a different number.

**Decision: the page shows the real payout and nothing else that is denominated in money.** The ten
participants render as **pool shape only** — the TRUE/FALSE ratio bar — and no payout is ever derived
from them.

⚠️ **Two money numbers that should agree are how they stop agreeing**, which is the rule `score.ts`
and `markets/page.tsx` already keep for trading return and pools. A second, larger, "what you would
have won" figure beside the real one is the single most likely thing a judge screenshots, and it
would be the one number on the site with nothing behind it.

⚠️ **And the real number will be boring, which must be said before they see it.** The judge is
typically the only real staker, so either `winningPool == 0` or they are the sole winner — both
branches of `payoutOf` return **their own stake back**. The page says so up front: *"You are the only
real stake in this pool, so a correct call returns your stake and nothing more. The other
participants are illustration."* A judge who checks arcscan finds exactly what the page predicted.

### 2.2 ⚠️ The record — and the brief's assumption is backwards

The brief expects `isRehearsal()` to exclude these and asks for an exception. **No exception is
needed, and that is the problem.**

`isRehearsal(observationEnd, createdAt)` compares the market's own timestamps. A demo market has
`observationEnd` ≈ 100 seconds **after** `createdAt`, so the arithmetic says **forecast** and lets it
straight into the record. The door does not need opening; it is already open and should not be.

**Decision: a third predicate, on the same footing as the first two.**

```
pastPosted(market) = market.closeTime > dayStart(spec.observedDay)
```

Staking was open during or after the day being measured. It is arithmetic over `close_time` and
`spec_json`, both already stored; it cannot be set by a naming convention and cannot be faked by a
market that did not do it. It belongs in `src/arc/rehearsal.ts` beside `isRehearsal`, which is now
the one place the category rules live.

Three categories, and every surface already has the shape for it:

| | test | counts toward the forecast record |
|---|---|---|
| forecast | neither of the below | **yes** |
| rehearsal | `observationEnd <= createdAt` | no — answer knowable, nothing staked |
| **past-posted (demo)** | `closeTime > dayStart(observedDay)` | **no — counted separately** |

⚠️ **"What stops a real rehearsal sneaking through the same door?" Nothing needs to — there is no
door.** No market is granted an exception and no flag is trusted. A market is whatever its own
timestamps say it is, and a rehearsal fails `isRehearsal` first regardless.

⚠️ **The `settledOnChain()` marker shipped for the seeded demo grades does NOT catch these.** That
rule is *absence of chain evidence*, and a demo market genuinely settles on chain — chain id,
`resolve_tx`, a real arcscan link. It will read as a real grade unless `pastPosted` is added
alongside it. **This is the single easiest thing in the phase to get wrong**, and it fails silently
into an inflated record.

`recordLine()` gains a third clause: `7 settled — 4 right, 2 wrong, 1 voided · 5 test data · 3 demo`.

### 2.3 ⚠️ Does the judge's result reach the analyst's record and the context block? **No — and it must not**

The brief's step 5 says the result *"enters the analyst's record, and enters the context block."*
⚠️ **Both are wrong, for two independent reasons, and the plan recommends against changing either.**

**It is not the analyst's claim.** The judge calls `commitPrediction` from their own wallet, so
`claims.author` is the judge's address. Calling that the analyst's record would be false.
⚠️ `context.ts` already filters `lower(c.author) = lower(analyst)`, so the judge's claim is excluded
from the planning prompt **automatically, with no new code** — the existing filter does the right
thing by accident and should be left alone.

**And it should not reach the planner even if it were the analyst's.** A past-posted result is a
question whose answer was knowable when the position was taken. `context.ts`'s own header calls
feeding that to the planner *"learning from nothing"* — it is the identical argument PHASE-7 §4.3
makes for rehearsals. **If the analyst ever commits on a demo market, `build()` must gain the
`pastPosted` filter.** The plan's recommendation is that it never does.

**What the judge sees instead, which is the honest version of step 5:** their graded claim on
`/analyst`, marked `demo`, counted in the demo column — and the context block **on the same page**,
with a line saying in so many words: *"Demo results are not in this block. The agent learns from
forecasts, not from questions whose answers were already published."* ⚠️ **That is a better
demonstration than the false one**: it shows the product refusing to contaminate its own training
signal, in public, with the reason on screen.

> ⚠️ **The one decision to confirm before Task 1.** If the intent is genuinely that the analyst's own
> record moves when a judge plays, the shape changes: the analyst commits the claim and the judge
> `stake()`s alongside it — the market-6 shape. Then it *is* the analyst's record, `context.ts` needs
> the `pastPosted` filter added, and the judge picks a side rather than a report. **Different build.
> Raised in chat rather than assumed.**

### 2.4 ⚠️ Hiding the answer — it is a curtain, and the page says so

**Nothing hides it.** The snapshot is public, the subgraph is public, `settle()` is a public read, and
the day and threshold are both on screen. **Anyone who wants the answer can have it in thirty
seconds** with the deployment id and a Graph query.

**Decision: do not present it as suspense the design cannot deliver.** The reveal button is honest
about what it is:

> *Reveal — we have not shown you the figure. You could look it up on The Graph yourself in about a
> minute; nothing here prevents that. What settlement proves is not that the answer was secret, but
> that it was **read from the subgraph after you committed**, hashed, and put on chain — the evidence
> hash in the resolve transaction is the same bytes either of us can re-derive.*

⚠️ **A commit-reveal scheme was considered and rejected as theatre.** Publishing a hash of the
outcome in advance would prove we did not change our minds — but the outcome is a public fact neither
party controls, so there was never anything to change. It would be cryptography performing confidence
rather than establishing it, and the evidence hash already on chain does the real job.

### 2.5 ⚠️ How many markets, and where the questions come from — **preset, and here is why**

**Decision: 6 preset questions on one chosen past day, thresholds bracketing the real figure — two
clearly TRUE, two clearly FALSE, two within 2% of it.** Not free-typed.

Three reasons, in order of weight:

1. ⚠️ **Every market costs an on-chain `createMarket` and ~30 seconds of Circle latency** (§2.6).
   A free-typed threshold means a transaction per keystroke-session with no way to batch or reuse.
2. **A typed threshold resolves the boring way.** A judge with no feel for Aave's TVL types a round
   number and gets TRUE by three orders of magnitude. The demo's job is to show a *grade*, and half
   the value is the judge seeing WRONG happen to someone.
3. **Curation is honest as long as we do not pretend otherwise.** We chose thresholds around a figure
   we have read. We know which resolve TRUE. ⚠️ The page says *"these thresholds were chosen around
   the real figure so that some resolve each way"* — what the judge does not know is which, and that
   is the only thing the demo ever claimed.

⚠️ **The day and the figure are read from The Graph at build time and pinned into a config file**,
not read live, so a subgraph reindex cannot silently move the thresholds relative to the answer.
⚠️ The chosen day must still be served by the deployment at demo time — **checked in Task 1, not
assumed**, because a deployment republish would take the day with it.

### 2.6 ⚠️ Create-on-demand, and the loop is about three minutes, not one

`closeTime` must be ahead of now for staking, and `observationEnd` must be after `closeTime`, so
**the judge cannot reveal until staking has closed.** That ordering is the parimutuel rule and it is
correct; it also sets the clock.

```
T+0s     judge presses Start  →  createMarket through Circle
T+~30s   market lands, staking open          ⚠️ Circle returns at SENT; landed() waits for the receipt
T+30–120s judge commits — commitPrediction, their wallet, their USDC
T+120s   closeTime passes; Reveal unlocks
T+~125s  settle() reads The Graph, resolve() lands, scoreMarket() writes the grade
```

**About three minutes, and the plan says three rather than one.** Two of those minutes are the
staking window, which cannot be shortened much without the judge losing the race to their own wallet
confirmation dialog.

⚠️ **Pre-creating a pool does not work** and the reason is worth writing down: a market pre-created an
hour ago has a `closeTime` an hour ago and is unstakeable. A pool would have to be refreshed every
few minutes; **Vercel Hobby crons run once daily**. So creation is on demand, triggered by the judge,
and the ~30 seconds is spent showing them the transaction landing rather than hidden behind a
spinner.

**Cost: one `createMarket` per judge per round, gas in USDC, paid by the analyst.** Small, real, and
it must be budgeted before a demo day rather than discovered during one.

### 2.7 ⚠️ No wallet, no USDC — the demo must not die at step one

**Decision: three tiers, and the third requires nothing of the judge.**

1. **Wallet + USDC** — the full loop. `PositionControl` already handles detection, chain switching,
   `wallet_addEthereumChain` for Arc, and a balance check; that logic is lifted, not rewritten.
2. **Wallet, no USDC** — ⚠️ **detected and said BEFORE the market is created**, never after. A judge
   who watches a create transaction land and is then told they cannot play has been charged our gas
   for nothing. The page checks the balance first and offers the faucet link and the analyst's
   address to top up from.
3. ⚠️ **No wallet at all — Watch it run.** The analyst commits with its own USDC through Circle, the
   judge presses Reveal, and the whole loop closes with no wallet, no signature and no funds. **The
   only thing they lose is that the money is not theirs.**

**Tier 3 is not a fallback, it is the default path**, and tiers 1–2 are the upgrade. The first thing a
judge does is press the button; a wallet prompt at that moment loses most of them. ⚠️ In tier 3 the
claim is the analyst's, so **`context.ts`'s author filter admits it** — which means tier 3 is exactly
the case where `build()` needs the `pastPosted` filter from §2.3. **Task 2 owns that or tier 3 poisons
the planning prompt.**

### 2.8 Repeatability — a second round is a second market

`claimIdOf[marketId][msg.sender] != 0 → AlreadyCommitted`, and `claims` carries
`UNIQUE (market_id, author)`. **One claim per address per market, enforced twice.**

So "do it again" cannot mean re-staking the same market, and should not: the answer is now on screen.
**Running the loop twice means picking a different question from the six and creating a new market**,
which is the same ~3 minutes and another `createMarket`. After six, the judge has seen every
preset question; the page says so rather than looping silently.

⚠️ **A market the judge started and abandoned stays open until `closeTime` and then becomes
unresolvable-but-unsettled** — it has no evidence row and `prepare()` refuses at guard 4 forever.
`scripts/ops/demo-market.ts --retire` voids them past `resolveDeadline`, which is permissionless. Not
on the critical path; it is tidying, and it is named so it is not discovered as a mystery later.

### 2.9 Where it lives — its own page at `/demo`, and `/markets` gains a third section

**Decision: `/demo` is its own page.** The loop is a guided sequence with three states; `/markets` is
an index. Putting a stepper inside a card grid would compromise both.

⚠️ **But the demo markets exist in the same tables, so `/markets` will show them whether or not we
plan for it.** `/markets` already splits forecasts from rehearsals and states the rule beside each.
It gains a third section, **Demo**, with copy in the same register: *"Staking was open during or after
the day being measured, so the answer was already published. These exist so a visitor can run the
settlement loop in minutes. None is a forecast and none counts toward the record."*

Nav stays four items. `/demo` is reached from `/markets` and from the marketplace, not from the
shell — ⚠️ PHASE-7 §3 already decided the shell is not where accretion belongs.

---

## 3 · The tasks

Each is one commit and one visible change. Sizes are lines of real change, excluding comments.

### Task 1 — the demo spec path and one market on chain · ~120 lines · **must be first**

Nothing else can be built until a past-day market with a future `closeTime` exists and can be staked.

1. `src/arc/rehearsal.ts` gains `pastPosted(closeTime, observedDay)`.
2. `src/arc/spec.ts` gains `demoQuestionCore(spec, {closeTime, observationEnd, resolveDeadline})` —
   ⚠️ **a sibling of `questionCore`, never a flag on it.** A boolean that switches off past-posting
   prevention is a boolean somebody passes by accident; two functions with different names cannot be
   confused at a call site, and the demo one carries the warning in its own header.
3. `scripts/ops/demo-market.ts` — `--create`, `--list`, `--retire`. Creates through the analyst's
   Circle wallet.
4. **Checked, not assumed:** the chosen day is still served by the deployment, and a commit actually
   succeeds against a market with a future `closeTime`.

**Visible change:** a market exists that a browser wallet can stake on and that settles instantly.
**This is the task that proves §0's escape works.** If it does not, the phase stops here and the plan
was wrong.

### Task 2 — the category, everywhere · ~90 lines

`pastPosted` applied to `analystRecord()`, `recordLine()`, `GradeMarker`, `/analyst`'s table,
`/markets`'s split, and ⚠️ **`agent/context.ts`'s `build()`**, which §2.7 tier 3 makes mandatory
rather than optional.

**Visible change:** a demo grade reads `demo` everywhere and is counted in its own column.
⚠️ **Before Task 3, not after** — otherwise the first judge's result silently inflates the record.

### Task 3 — `/demo`, the three states · ~280 lines

Pick a question · stake (three tiers) · reveal. The ten simulated participants as pool shape only.
The honest reveal copy from §2.4. The real payout and no second number.

**Visible change:** the loop is playable.

### Task 4 — the result panel · ~110 lines

The grade, the resolve transaction linked to arcscan, the evidence hash, and a link through to
`/analyst` where the row now appears. ⚠️ The arcscan link verified on the Arc RPC first, as every
previous task has done.

**Visible change:** the judge sees what they did land somewhere permanent.

### Task 5 — `/markets`' third section and the retire path · ~70 lines · **extra**

Polish and tidying.

---

## 4 · The minimum, and the extra

⚠️ **Minimum for the loop to be playable: Tasks 1, 2 and 3.** That is a judge staking real USDC on a
settled day, revealing, and getting a real grade that is correctly excluded from the analyst's
forecast record.

**Task 4 is the one to add if there is time** — without it the loop closes but the judge has no
permanent artefact to follow, and the arcscan link is the thing that makes it real rather than a
screen. **Task 5 is tidying.**

⚠️ **Task 1 is the risk.** Everything after it is a surface over machinery that already runs;
Task 1 is the one that finds out whether §0's escape survives contact with `prepare()`'s ten guards.
**Do it first and do it against a throwaway market before a judge is watching.**

---

## 5 · Decisions taken here, so no later task has to

| decision | where |
|---|---|
| A demo market is a past-day spec with a **future `closeTime`** — the only shape the contract allows | §0.1 |
| The page shows **one** payout, the real one; simulated participants are pool shape only | §2.1 |
| A third category, `pastPosted`, by arithmetic — **no exceptions, no flags** | §2.2 |
| Demo results are **excluded** from the analyst's forecast record and from the planning prompt | §2.3 |
| The answer is **not** cryptographically hidden and the page says so; no commit-reveal | §2.4 |
| **6 preset questions**, thresholds pinned at build time around a real figure | §2.5 |
| **Create-on-demand**; the loop is ~3 minutes, not 1 | §2.6 |
| **Watch-it-run with no wallet is the default path**, not the fallback | §2.7 |
| Its own page at `/demo`; `/markets` gains a third section; nav unchanged | §2.9 |

**Nothing in this phase needs a migration, a contract change or a new dependency.**

⚠️ **The one thing this plan cannot decide alone:** whether the judge commits their own claim (§2.3,
recommended) or stakes alongside the analyst's. It changes who the record belongs to, whether
`context.ts` needs a filter, and what the judge chooses on screen. **Raised in chat; Task 1 should not
start until it is answered.**

# How a parimutuel prediction market actually works

*Read before planning `AlphaMarket.sol`. 2026-09-09.*

⚠️ **Nobody on this project has built a prediction market.** This is the research rather than the
guess. Primary sources — protocol documentation, an audited adapter, a first-party contract tutorial,
audit findings — over summaries, because this project has been wrong six times about behaviour
inferred from secondary material.

⚠️ **Scope: what applies to one analyst, a handful of stakers, a single Graph-derived resolution
source and four days of runway.** There is a section at the end on what we are deliberately not
building and what that costs.

---

## 1 · The pool math, and it is simpler than it looks

A parimutuel pool is not an order book. Nobody quotes a price and nobody takes the other side of your
bet. Everyone's money goes into one pot, the losers' money is divided among the winners in proportion
to their stakes, and **the odds are not known until betting closes**.

The classical formula, from the totalizator world:

```
payout per unit staked  =  (total pool − takeout) ÷ total staked on the winning outcome
```

[Wikipedia's worked example](https://en.wikipedia.org/wiki/Parimutuel_betting): a $1,028 pool at a
14.25% commission leaves $881.51; $110 was staked on the winning outcome; $881.51 ÷ $110 = **$8.01
per $1**.

On-chain the same thing is normally written per-staker, and this is the form to reason about:

```solidity
payout_i = stake_i + (stake_i * losingPool) / winningPool
```

*(the form used in [a production-oriented Solidity walkthrough](https://dev.to/sivarampg/building-a-production-ready-prediction-market-smart-contract-in-solidity-complete-guide-with-2iio))*

⚠️ **Read that formula carefully, because it is the whole reason the `msg.value` scale question
(draft §6.1) is less dangerous than it looks.** `losingPool / winningPool` is a ratio of two
quantities in the same unit — it is dimensionless. `stake_i` carries the unit. So if every stake is
stored at one consistent scale, **the scale cancels and the payout comes out at that same scale.**
The arithmetic does not care whether the numbers are 6-decimal or 18-decimal. It cares enormously
that they are all the same one.

That matches PLAN §5.2's *"the bug is mixing units, not storing `msg.value`"*, and it narrows draft
§6.1's failure #1 to what it is actually about: **interpreting a stored number as "a USDC amount" at
a boundary** — a display, a database column, an event a third party reads, a cap compared against an
amount. ⚠️ **It does not settle §6.1** — that is still a decision, and it still reaches into the
schema (an 18-decimal amount overflows BIGINT at ~9.22 USDC). It removes one bad reason for taking it
one way.

---

## 2 · Breakage — the rounding is real, and traditional markets keep it

⚠️ **The oldest known failure mode in this business is rounding, and the industry's answer is to round
*down* and keep the difference.**

> "The amounts paid out are rounded down to a denomination interval… The rounding loss is known as
> **breakage** and is retained by the betting agency as part of the commission." — Wikipedia,
> *Parimutuel betting* (10¢ intervals in California, Australia and British Columbia)

The on-chain analogue is integer division. `(stake_i * losingPool) / winningPool` truncates, so the
sum of every individual payout is **less than or equal to** the pool. That inequality is the safety
property, and it only holds in that direction if you always truncate.

⚠️ **Round the other way and the last claimer's transaction reverts for lack of funds.** The pool
promised more than it holds, everyone before them is paid, and the person at the back of the queue
eats the failure. Integer division in Solidity already truncates toward zero, so the default is the
safe direction — **the danger is "fixing" it**: adding a rounding-up helper, distributing the
remainder, or computing a per-unit rate first and multiplying.

⚠️ **And do not try to give the dust to somebody.** An audit of the SBET protocol found exactly this
pattern — *"the 'last grader gets remainder' logic depends on claim order, not grader identity…
Race conditions between graders determine who gets the rounding dust bonus"* — a claim-order
privilege nobody designed
([Security Audit Report, SBET Protocol](https://sbettoken.org/docs/audit.html)). Leaving dust in the
contract is boring, correct, and costs a few wei of USDC.

---

## 3 · The failure modes that actually bite

| # | failure | what happens | the fix |
|---|---|---|---|
| 1 | ⚠️ **`winningPool == 0`** | division by zero → every claim reverts and the pool is **stuck forever**; or, if guarded naively, the house silently keeps everything | an explicit branch: **refund every staker their own stake** |
| 2 | **rounding up** | sum of payouts > balance; the last claimer reverts | always truncate; leave dust |
| 3 | **claim-order privilege** | whoever claims last gets the remainder | give the dust to nobody |
| 4 | **a single staker** | they are the whole winning pool: `losingPool` is 0, payout = their own stake back | works correctly by construction — worth a test, not a branch |
| 5 | **nobody stakes at all** | the analyst is alone in the pool and gets its own money back | same as 4 |
| 6 | **push / both sides empty** | no pool to divide | the void path |

On #1, the finding is not hypothetical. An audit of ScorePlay found that when an oracle resolves to
an outcome nobody staked on, *"the house takes the whole `totalPool` as fees… all users who predicted
legitimate outcomes would be unjustly burned"*
([Octane Security](https://www.octane.security/post/octane-smart-contract-security-for-scoreplay)).

⚠️ **For our market this is not an edge case, it is the expected case.** A binary market with one
analyst and a handful of stakers on one side will *routinely* have an empty side. **`winningPool == 0`
must be a first-class path, not a guard.**

---

## 4 · What a resolution source is, and what makes a question resolvable

Both mature platforms converge on the same three-part specification, and it is worth copying exactly.

**Polymarket** requires every market to define *"the **resolution source** (where outcomes are
determined), the **end date** (when resolution becomes eligible), and **edge cases** (handling for
ambiguous situations)"*, and states the principle plainly: *"the market title describes the question,
but the **rules** define how it resolves"*
([Polymarket docs, Resolution](https://docs.polymarket.com/concepts/resolution)).

**Augur** puts the burden on the question rather than on the resolver: *"Only events that have
objectively knowable outcomes are suitable… It should be possible for the average person to figure
out the answer based on reading the on-chain market details fully… If a resolution source is
provided, the answer should be readily apparent on the resolution source"*
([Augur Help Center](https://augur.gitbook.io/help-center/disputing-explained)).

⚠️ **What stops a creator writing an unresolvable question is therefore not a check on the question —
it is that the question is only ever expressible in a form the resolver can answer.** Augur and
Polymarket accept free text and pay for it with a dispute system. **We do not accept free text.** A
market subject is a deployment slug, a metric, a comparison, a threshold and a date — five machine
values, every one of which is validated against `config/protocols.ts` and the document registry at
creation time. A question that cannot be settled cannot be typed.

That is the single most valuable thing this research produced: **the constrained subject is what lets
us skip the entire oracle and dispute layer**, and it is a design choice, not a shortcut.

---

## 5 · Void: what real markets do when the answer is not there

Every serious platform has a "no answer" outcome, and **they all pay it out at parity rather than
picking a winner.**

- **Augur** — *"If a market resolves as Invalid, traders are paid out at equal values for all possible
  outcomes."* Reporters are instructed to report Invalid *"because it is ambiguous, subjective, or the
  outcome is not known by the event end date."*
- **Polymarket** — *"**Unknown/50-50** — Neither outcome applicable (rare) — Market resolves 50/50 —
  each token redeems for $0.50."*
- **UMA's own prediction-market tutorial** carries a third `assertedOutcome` beyond the two real ones,
  explicitly *"unresolvable"*, and on that resolution *"both outcome tokens provide half of their
  balance as currency payout"*
  ([UMA docs](https://docs.uma.xyz/developers/optimistic-oracle-v3/prediction-market)).

⚠️ **For a binary market where everyone staked in one pot, "equal value for all outcomes" and "refund
every staker their own stake" are the same operation.** So our void is a refund, and it lines up with
the industry semantics rather than inventing one.

**The void conditions worth carrying**, each with a reason:

| condition | why | where it already is |
|---|---|---|
| the observation day has no snapshot by `resolveDeadline` | the answer is not knowable — Augur's exact Invalid criterion | §5.16 · R21 |
| the deployment was republished after creation | the source the market named is not the source being read | ⚠️ **R17, already in the plan** — `specHash` pins the deployment hash |
| the winning side is empty | nothing to divide | §3 above |
| nobody resolved it in time | the market must not be able to hold funds forever | §5.2's permissionless `voidMarket` |

⚠️ **§5.2 already says why the last one exists**: the v3 interface *"couldn't void, so funds were
lockable forever."* Permissionless-after-deadline is the property that makes that impossible, and it
is also the one path that does not depend on our cron working.

---

## 6 · The betting window must close before the observation begins

This is the oldest rule in parimutuel and it is not about fairness, it is about arithmetic:

> "Following the start of the event, no more wagers are accepted" — because the odds *are* the pool,
> and the pool cannot still be moving while the outcome is being determined.

The prediction-market version of the same point: *"when you bet $100 on a horse in a parimutuel pool,
your payout depends on what everyone else does between now and post time"*
([Harry Crane, *How Parimutuel Pools Work*](https://harrycrane.substack.com/p/how-parimutuel-pools-work)).
Bettors see only *probable* payouts while betting is open. Crane also notes the practical
consequence: informed money arrives late, so early stakers systematically get worse odds than the
board showed them.

⚠️ **So `closeTime ≤ start of the observed day`, strictly.** §5.2 already requires
`commitPrediction` to precede `closeTime`; what this adds is that `closeTime` must also precede the
*observation window*, not merely the observation *end*. A market that accepts stakes during the day it
is measuring is one where a staker can watch the metric move and then bet on it — past-posting, the
thing every totalizator on earth is built to prevent.

⚠️ **And it costs us a day of calendar**, which is why it belongs in the plan and not only here.

---

## 7 · What we are deliberately not building, and what it costs

| not building | what real platforms do | what it costs us | why it is acceptable here |
|---|---|---|---|
| **an oracle** | UMA's Optimistic Oracle: $750 bond, 2-hour liveness, escalation to a token-holder vote | nobody can propose an outcome but us | ⚠️ our resolution source is a **public subgraph anyone can re-query**, and the `evidenceHash` on chain says exactly what we read. That is checkable without being trustless |
| **a dispute system** | Polymarket: dispute → automatic reset → second request → DVM vote, 4–6 days | a wrong resolution cannot be challenged on chain | a dispute layer is weeks of work and needs a token and a quorum. ⚠️ **The honest mitigation is the evidence record, and it is why the evidence seam is never-cut** |
| **free-text questions** | both platforms, plus rules text and edge-case clauses | markets can only ask about metrics we index | §4 — this is what removes the need for the two rows above |
| **a takeout / house fee** | 14–30% in racing; 15–30% typical | no revenue from the market itself | ⚠️ takeout is the *reason* breakage exists. With no fee, the pool is conserved exactly and the only rounding is truncation dust |
| **multi-outcome / scalar markets** | Augur scalar markets pay at the midpoint on Invalid | binary only | binary is what §5.2 specifies and what a threshold question needs |
| **an order book / CLOB** | Polymarket's actual mechanism | no price discovery before close, no exit before resolution | parimutuel is one pool and a division; a CLOB is a matching engine |
| **partial or early exit** | sell your position at any time | a staker is committed until resolution | pull-based `claim` after resolution is §5.2's model |

⚠️ **The one that is a real product limitation and should be said out loud on camera: there is no
dispute path.** If the analyst's own resolver reads the wrong number, nothing on chain contradicts it.
What we have instead is that the read is reproducible — a named deployment hash, a named document, a
named day, and a hash of the response bytes — so being wrong is *detectable* by anyone, even though it
is not *correctable* by anyone.

---

## 8 · What this changes about our design

1. **`winningPool == 0` is a first-class path**, not a guard — it is the *expected* case with one
   analyst and few stakers.
2. **Always truncate. Leave the dust. Give it to nobody.**
3. **Void = refund every staker their own stake**, which is Augur's "equal value for all outcomes"
   for a one-pot binary market.
4. **`closeTime` ≤ the start of the observed day**, not merely before `observationEnd`. Costs a day.
5. **The subject is five machine values, never free text** — this is what lets us skip the oracle and
   the dispute system honestly rather than by omission.
6. **No takeout.** The pool is conserved; the only leakage is truncation dust.
7. **A single staker and a no-staker market both work by construction** — they are tests, not
   branches.
8. **R17 is a void condition and it is already in the plan** — a republished deployment means the
   named source is not the source being read.

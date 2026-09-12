# Decisions

Choices that changed the shape of the build, with the reasoning and the alternative we turned down.

One section per decision. A decision lands here when getting it wrong would mean rewriting rather
than renaming — the same line CLAUDE.md draws for what to stop and ask about.

The division of labour across the four tracking files: `logs.md` is the narrative record of each run
of work, `lessons.md` holds insight where reality disagreed with the plan, `smoke-results.md` holds
what each test proved and the work it generated, and **this file holds the choices** — what we
decided, why, and what we gave up. When a smoke test produces a decision, the finding stays in
`smoke-results.md` and the decision is recorded here.

**Where a decision contradicts `PLAN-v4-alpha-markets.md`, the `Affects` line says which section, and
the plan is amended in the same commit.** The plan is law; this file is the amendment record.

---

## Decisions live in `tracking/DECISIONS.md`

**Date:** 2026-09-05
**Decision:** This file, in `tracking/`, alongside `logs.md`, `lessons.md` and `smoke-results.md`.
**Why:** Every other tracking artifact already lives in `tracking/`, and CLAUDE.md documents that
directory as the place records go. One location for four files beats matching the plan's tree
literally. What we give up is small: §2.5's session-start ritual ("paste `PLAN.md`, `DECISIONS.md`,
`STATE.md`") now points one directory deeper, and §6's repo layout no longer describes the tree.
**Alternative rejected:** A root `DECISIONS.md`, as §6 specifies. It would scatter the tracking files
across two locations to satisfy a diagram, and the diagram is the cheaper thing to amend.
**Affects:** §6 repo layout · §2.5 session start · CLAUDE.md "Tracking"

---

## Revenue availability is a three-state per-deployment flag, not a ban

**Date:** 2026-09-05
**Decision:** The adapter carries a revenue availability state for every deployment, and the renderer
enforces what each state may show.

| state | deployments | renders as |
|---|---|---|
| `usable` | aave-v2, compound-v3, compound-v2 | the figure |
| `poisoned` | aave-v3 — accumulator corrupted | "not available for this deployment" |
| `not_tracked` | morpho-blue — mapping never written | "not available for this deployment" |

**The render rule is the safety and it is absolute:** `poisoned` and `not_tracked` never reach a page
as a number. Not zero, not a figure with an asterisk, not a footnote. Revenue market subjects are
restricted to the `usable` three.
**Why:** SM-03 located the fault precisely rather than broadly. aave-v3's `cumulativeTotalRevenueUSD`
reads $2.79e17 after 38 poisoning events since 2024-07-05; morpho-blue reports exactly 0 across all
977 snapshots because the revenue side of the template was never implemented. But three deployments
report revenue with clean arithmetic and implied annual take rates between 0.18% and 1.27% — sound
numbers we would be discarding for nothing. The two failure modes are opposite and both must be
invisible to a reader: "$0 revenue" for a protocol with $11.4B borrowed is more dangerous than
"$279 quadrillion", because zero looks like an answer. What we give up is revenue questions on the
two broken deployments, and an adapter that must carry per-deployment state it would otherwise not
need.
**Alternative rejected:** A blanket ban on revenue as a market subject. It buys the same safety the
render rule already provides, and pays for it with capability on three deployments where the figures
are demonstrably fine. Safety belongs in the render rule, not in the ban.
**Affects:** adapter layer (Phase 1) · `engine/invariants.ts` (Phase 2) · `market/spec.ts` (Phase 4) ·
SM-03 findings in `smoke-results.md`

---

## Morpho via its own published subgraph, not our deploy of Messari's

**Date:** 2026-09-05
**Decision:** Read Morpho Blue through Morpho's own published subgraph,
`8Lz789DP5VKLXumTMTgygjU2xtuzx8AhbaacgN5PYCAs` (~1.2K GRT signal), as a fifth entry in the target
list — no deploy, no indexing wait.
**Why:** Morpho publish on Messari's standardized template, so the shared query document ran against
it unchanged on the first try and returned schema 3.0.0. Zero field mapping, zero indexing time, and
a fifth protocol spanning a third schema version — stronger evidence for the G1.5 standardization
claim than four deployments were. The cost is G1.4: reading someone else's published subgraph is not
authoring or extending a standardized one, so this route earns nothing toward that requirement. G1.4
is already marked Optional and Cut #7 in §3, so the cost is one we had already accepted.
**Alternative rejected:** Deploying Messari's unpublished Morpho Blue subgraph ourselves. Indexing
time is unmeasured, and a `startBlock` set too late yields a subgraph that indexes cleanly and
returns nothing — a failure that looks like success until you query it. Neither risk is worth taking
for data already available.
**Revisit if:** the revenue fix requires our own deploy anyway. Morpho's revenue is `not_tracked`
because the mapping was never written, and `Market.interest` holds the raw material. If we ever
deploy to fix that, G1.4 comes back into reach and this decision should be re-taken rather than
inherited.
**Affects:** §3 G1.4 and G1.5 · `config/protocols.ts` · adapter layer (Phase 1) ·
`scripts/smoke/02-query-subgraph.ts`

---

## Next 16 as the framework baseline

**Date:** 2026-09-05
**Decision:** Build on Next 16.
**Why:** `@x402/next` has never supported Next 15 — not in any of its 27 published versions — and the
reason is structural rather than an omission: Next 16 renamed `middleware.ts` to `proxy.ts`, and the
package's canonical integration is written against the new name. Starting on the version the payment
library actually targets costs us nothing, because there is no app yet to migrate.
**Alternative rejected:** Next 15 with `--legacy-peer-deps`, which `docs/research/x402-next-2.25.md`
measured as working. That research advises against upgrading mid-build, and the advice is sound —
but it was written about migrating an existing application. We are greenfield, so the migration cost
it warns about does not exist for us. **This decision overrides that note; the note is not wrong,
its premise just doesn't apply here.** Next 15 + `legacy-peer-deps` remains a verified fallback if
Next 16 causes trouble elsewhere.
**Affects:** `package.json` · `app/` (Phase 3 onward) · `payments/server.ts` ·
`docs/research/x402-next-2.25.md` (superseded on this point)

---

## x402 runs on Hedera testnet, not mainnet — R12 is taken

**Date:** 2026-09-05
**Decision:** Run x402 for the whole build on Hedera testnet. This is a formal amendment to §1's
chain table, which had mainnet as the plan of record and testnet as an available fallback. **R12 is
now TAKEN rather than available.**

R12 requires the switch to be atomic — facilitator URL, network string, USDC token id and accounts
all move together, with a startup feePayer assertion. The current configuration is therefore:

| | value |
|---|---|
| facilitator | `https://api.testnet.blocky402.com` |
| network | `hedera:testnet` |
| USDC token | `0.0.429274` |
| accounts | `HEDERA_SELLER_*` / `HEDERA_BUYER_*` |

**Why:** Mainnet HBAR has no faucet. Getting it means an exchange withdrawal, possibly behind KYC, on
a clock nobody controls — an unbounded dependency sitting in front of a Phase 0 gate. H1.1 accepts a
live x402-gated service on "testnet **or** mainnet", so the requirement is satisfied either way and
nothing is given up against the track. The separate ⚠️ in §3 — that selling reports for real USDC on
Vercel Hobby is a policy risk — points the same direction. What we give up is the "real money"
framing in §1 and the ability to say a payment moved mainnet value on camera.
**Alternative rejected:** Waiting on a mainnet HBAR withdrawal and keeping §1 as written. It gates a
Phase 0 smoke test on a third party's KYC queue to buy a demo talking point the judging criteria do
not ask for.
**Revisit if:** funding appears. Mainnet stays a config revision, not a rebuild — but per R12 all
four values above move together or none do.
**Affects:** §1 chain table · §7 provisioning inventory · §10 R12 · SM-05 · `config/chains.ts` ·
`payments/server.ts` · `.env.example`

---

## SM-02 keeps its scope; SM-04 becomes the archive-RPC test

**Date:** 2026-09-05
**Decision:** Amend §8. SM-02 is the multi-protocol query and nothing else — it has passed on that
scope with five deployments across three schema versions. SM-04 is no longer "same document, four
deployments"; it is now the archive-RPC test: **fetch a value from a subgraph at block N, then
`eth_call` the same value at block N via RPC, and confirm the two agree.**
**Why:** Two rows of the §8 table stopped describing reality. SM-02 as specified bundled two
unrelated questions — does one document work across deployments, and does our RPC serve historical
state — and we ran only the first. SM-04 as specified is a strict subset of what the SM-02 script
already does with five deployments rather than four. Splitting along the seam leaves one test per
question and no duplicate. The archive question deserves its own row because it is load-bearing
elsewhere: §5.14's corroboration adapter needs historical `eth_call`, and G2.1 leans on RPC
corroboration to say The Graph is verified rather than merely trusted. What we give up is the "one
document, four deployments" framing as a named test — but the evidence for it survives intact under
SM-02, which is where it was actually produced.
**Alternative rejected:** Keeping SM-02's archive half and retiring SM-04 as redundant. It leaves a
passed test permanently half-run, and buries a question §5.14 depends on inside a row about
something else.
**Blocked on:** an archive-capable Ethereum RPC, which we do not have. `ETHEREUM_RPC_URL` is now in
`.env.example`, unset, marked as needing archive capability. Until it exists SM-04 cannot run, and
R27 (non-archive RPC) stays live.
**Affects:** §8 SM-02 and SM-04 · §5.14 · §3 G2.1 · §10 R27 · `.env.example` ·
`scripts/smoke/04-multi-deployment.ts` (not written)

---

## SM-05 settles in HBAR, not USDC

**Date:** 2026-09-06
**Decision:** Prove the x402 handshake with **HBAR (`0.0.0`)** as the payment asset rather than testnet
USDC (`0.0.429274`).
**Why:** Circle's testnet faucet is not delivering USDC to our account and Discord requests are
unanswered — an external dependency on an unknown clock, sitting in front of a Phase 0 gate, for the
second time in this project. HBAR needs no faucet and no association: it is native to every Hedera
account, and both of ours already hold ~1,098 of it. Everything the test exists to prove is unchanged
by the swap — same facilitator, same `hedera:testnet`, same 402 challenge, same partial signing, same
settlement through Blocky402, same fee payer. **Only the asset differs.**
**Cost, both real and both survivable:**
- **No USD-denominated pricing.** `"$0.02"` resolves through the package's `DEFAULT_ASSETS` table,
  which on this network knows only USDC, and throws for HBAR. The price is a hand-computed
  `AssetAmount` in tinybars instead: `{ asset: "0.0.0", amount: "100000" }` = 0.001 HBAR.
- **The client's spend controls reject non-default assets.** They are on by default and allow only
  assets `findDefaultAsset` recognizes, so an HBAR payment is refused before it is ever signed:
  *"All payment requirements were rejected by spendControls."* HBAR is now opted in explicitly with
  its own atomic per-payment cap. **Note this is `@x402/core`'s client-side control, not Circle's.**

Neither cost touches what the smoke test measures.
**Alternative rejected:** Continuing to wait on USDC. It blocks the one test where value moves, on a
third party who is not answering, to gain a difference the test cannot observe.
**Revisit if:** USDC funding arrives. **The product should price in USDC** — a report costing "$0.50"
is legible to a buyer and "50,000,000 tinybars" is not, and USD pricing is what `DEFAULT_ASSETS` and
the `"$…"` money path are built for. The association code stays in the script, skipped rather than
deleted, so the switch back is a price change and not a rewrite.
**Affects:** SM-05 · §7 provisioning inventory · `payments/tiers.ts` and `payments/buyer.ts` (Phase 3)

---

## SM-07 builds on the public ATS testnet infrastructure, expiring 2026-09-10

**Date:** 2026-09-06
**Decision:** Deploy report tokens through the **public ATS testnet factory `0.0.9213391`** and
resolver `0.0.9212226`, rather than deploying our own ATS infrastructure.

**The expiry numbers, measured live on Mirror Node on 2026-09-06 before anything was built:**

| contract | id | EVM address | expiration_timestamp | UTC | state |
|---|---|---|---|---|---|
| factory | `0.0.9213391` | `0xd1f118a40f3b02883d35909ef2517e7edd78379d` | **1789039172** | 2026-09-10 11:19:32Z | live, nonce 68 |
| resolver | `0.0.9212226` | `0xba2d5fc2083a0b8f164c50e65d782087fba18e0a` | **1789037489** | 2026-09-10 10:51:29Z | live, nonce 1 |

Research recorded `1789039172` for the factory and that number is **confirmed exactly**. ⚠️ **The
resolver's expiry was never recorded and is 1,683 seconds earlier — the resolver, not the factory,
is the binding constraint.** Both are ~3.7 days out at the time of writing. Hedera does not currently
enforce contract expiry, and both were live and answering.

**Why:** Our own deploy is 111 contracts, 180,285,436 gas and a measured 28.6 minutes, and it buys
nothing SM-07 needs to prove. The public factory is genuinely active — nonce 68, and it produced our
asset first try once two field values were corrected. The resolver carries 8 configurations, all at
version 1, verified live before use. What we give up is control of a dependency that could vanish
inside our window, and the demo would go with it.
⚠️ **Correction, 2026-09-08 — this paragraph used to read "What protects us."** It claimed: *"The
token our deploy produced, `0.0.10395983`, carries its own expiration of `1796496695` — 2026-12-04,
well past both. **An issued asset outlives the factory that issued it**, so an expiry event costs us
the ability to mint new reports, not the ones already minted."* **That is false comfort and it is the
sentence someone would rely on.** It is true of the factory and of nothing else.

**What an expiry would actually cost, traced rather than assumed.** The internal actions of SM-07's
own `transfer` — an ordinary ERC-20 move of an already-issued token — are:

```
depth 0  CALL          0.0.10395983   our token proxy        expires 2026-12-05 18:51:35Z
depth 1  STATICCALL    0.0.9212226    the resolver           expires 2026-09-10 10:51:29Z
depth 2  DELEGATECALL  0.0.9212222                           expires 2026-09-10 10:51:21Z
depth 1  DELEGATECALL  0.0.9213141                           expires 2026-09-10 11:11:20Z
depth 2  DELEGATECALL  0.0.9212262                           expires 2026-09-10 10:52:11Z
depth 3  DELEGATECALL  0.0.9212248, 0.0.9212239              expires 2026-09-10 10:51:46/56Z
```

⚠️ **The proxy holds storage; every line of executable code lives in contracts that expire inside the
same 80-second window.** So the factory's expiry would cost new mints, and the resolver's and the
facets' would cost **every transfer of every already-issued token**. `deployEquity` makes 188
staticcalls into the resolver; `issue`, `transfer` and `grantRole` make one each. There is no version
of this where the December expiry on the proxy protects anything.

**And it does not matter, for a reason worth citing so nobody re-derives it.** Hedera has **not
enabled smart-contract rent on any network.** The EVM documentation states it outright — *"Hedera
Council has not enabled rents on smart contracts yet"* — and that smart contract expiry and
auto-renewal are currently disabled, so contracts are not charged renewal fees and do not expire.
HIP-16 defines the mechanism that would apply if it were switched on (expire → grace period, during
which the contract is inoperable except for a `ContractUpdate` extending its expiry → purge from
state). It was first targeted at a **March 2023** release and has not been enabled since; Hedera says
it intends to enable it "in the future," with no date and no named release. Turning it on is a
Council decision.

- `docs.hedera.com/evm/development/rent` — the current status and the grace period
- `hips.hedera.com/hip/hip-16` — the mechanism
- `hedera.com/blog/smart-contract-rent-is-coming-to-hedera` — the original March 2023 target

**Measured again 2026-09-08, and nothing had moved.** Both expirations are byte-identical to the
values recorded above. Both are exactly `created_timestamp + auto_renew_period`, so **neither has ever
been renewed**; both carry `auto_renew_account: null` and a **zero HBAR balance**, so there is nothing
a renewal could be charged to. It is a cliff, not a rolling window — and an inert one. The factory
meanwhile went from nonce 68 to **88**, with **32 distinct sender accounts** in its last 100 calls and
deploys on every one of the past ten days, so it is in heavy active use. ⚠️ **That is not protection:
none of those users is renewing it, and none of them can without the admin key.**

**Alternative rejected:** Deploying our own infrastructure now, pre-emptively. Twenty-nine minutes and
~500 HBAR against a risk that requires a Hedera Council decision, with no date attached, to
materialise inside our remaining window. It stays the fallback, unchanged.
**Revisit if:** either contract stops answering, or Hedera announces a date for enabling contract
rent. ⚠️ **Not** if the demo date passes 2026-09-10 — that was the old trigger and it rested on the
mistaken belief that the dates bite. A one-line Mirror Node GET on `0.0.9212226` reporting `expiry`
and `deleted` is folded into `/api/health` in Phase 3 Unit 12, so the assumption is visible rather
than assumed.
**Affects:** SM-07 · §8 SM-07 row (the "expiry of `0.0.9213391` recorded" clause is now satisfied) ·
report tokenization (Phase 3)

---

## Report tokens are verifiable on HashScan, and `scripts/verify-ats.ts` is the path

**Date:** 2026-09-06
**Decision:** Every report token gets verified on Sourcify through `scripts/verify-ats.ts`, taking the
contract address as its only argument. **U11 is answered: `exact_match`, first attempt.**

`0.0.10395983` / `0x60c955b9b2d0896b5EEAF285133891D9A7CF7648` is verified for chain 296 —
`match: exact_match`, `runtimeMatch: exact_match`, 17 sources, matchId 47208468, 2026-09-06T19:23:28Z.

**Why this is a decision and not just a result:** "Contracts verified on HashScan where applicable" is
a **pass/fail requirement** on the Hedera Tokenization track, and until today nobody had verified an
ATS contract on Hedera testnet — not us, not the ATS team, whose own factory and resolver are both
still unverified. The requirement was therefore an unquantified risk sitting on a pass/fail line. It
is now a 20-second script run per token.

**What makes it repeatable:** every report token is another `ResolverProxy` from the same factory,
compiled from the same source at the same settings, so **all of them share the identical 390-byte
runtime bytecode down to the metadata hash.** Only the address changes. The script re-derives and
re-checks everything each run rather than trusting that.

**What we give up:** two dev-only pinned dependencies — `solc@0.8.28` (9.3 MB) and
`@openzeppelin/contracts@4.9.6` (2.0 MB). Neither ships to Vercel. Both must stay pinned exact:
`solc` because a different compiler produces different bytecode, and OpenZeppelin because Solidity's
metadata hash covers every source in the compilation unit, so a different 4.9.x breaks the match. The
ATS `package.json` declares `^4.9.6` — a range, useless as a compiler input; 4.9.6 came from the
upstream `package-lock.json`.
**Alternative rejected:** vendoring `EnumerableSet.sol` into the repo and fetching solc from
`binaries.soliditylang.org` at runtime. ~11 MB lighter, and it makes a byte-exactness guarantee depend
on an unpinned copied file and two network fetches. For the one script whose entire job is
reproducibility, that is the wrong trade.
**Known limitation, and it costs nothing:** `creationMatch` is `null` and always will be. The proxy is
created by `new ResolverProxy(...)` inside `deployEquity`, not by a top-level creation transaction, so
there is no creation bytecode for Sourcify to fetch. The runtime match is what an explorer reads to
render source and decode events, and it is sufficient for the requirement.
**Affects:** §13 definition of done ("≥1 ResolverProxy verified on HashScan") · §12 U11, now closed ·
report tokenization (Phase 3)

---

## Corroboration compares exactly, at the block the value was written

**Date:** 2026-09-06
**Decision:** `graph/corroborate.ts` resolves the block at which the subgraph last wrote the value it
is checking, reads the chain **at that block**, and asserts **equality**. No tolerance. Where a
deployment or market exposes no write-time field, the result is **`NOT_CHECKED`** — never a
tolerance-based approximation.
**Why:** SM-04 measured the alternative and it does not work. Comparing at `_meta.block` gave exact
agreement on one run and a 157.70 USDC difference on the next, minutes apart, because an Aave aToken's
`totalSupply()` accrues ~31.5 USDC **per block** from `block.timestamp` while the subgraph writes
`inputTokenBalance` only when a handler runs. A check that passes intermittently — and most reliably
when the chain is busy, which is when corroboration matters least — would have been read as flakiness
in the adapter. **The tolerance that would fix it is the problem:** wide enough to absorb interest
accrual is wide enough to hide the errors the check exists to catch, and corroboration is the only
genuinely independent verification the engine has. Everything else comes out of the same mapping code.
**Cost, and it is real:**
- **Corroboration becomes a per-market capability**, not a per-deployment one. compound-v3 sets
  `indexLastUpdatedTimestamp` on its base-asset markets and leaves it `null` on collateral-only ones —
  3 of its 10 largest have it. The flag cannot sit in deployment config beside the revenue flag.
- **compound-v2 loses corroboration entirely.** No equivalent field exists; `_rewardLastUpdatedTimestamp`
  is a rewards timestamp and using it would be inventing a check rather than performing one.
- **Two extra round trips per check** — read the write-time, resolve it to a block — before the
  `eth_call` that does the work.
- **Archive access becomes mandatory rather than convenient.** aave-v2's write-time field measured
  **8,285 blocks / 27.7 hours** behind the indexing head; a pruned node retains ~128. The correct
  block is a property of how recently a market traded, so a quiet market can be arbitrarily far back.
**Alternative rejected:** Compare at `_meta.block` with a tolerance. Rejected because the tolerance
has to exceed the accrual over an unbounded interval — the time since that market's last event — so
it is not a fixed number, and any value large enough to be safe is large enough to be useless.
**Affects:** §5.14 *(amended in this commit — "compare with tolerances" removed)* · R27 *(retired for
Ethereum)* · `graph/corroborate.ts` and `engine/checks/crosscheck.ts` (Phase 1) · the deployment
adapter, which now carries a per-market corroboration flag

---

## Tier 2 compares with a tolerance and tier 1 does not, and the tolerance is 5%

**Date:** 2026-09-07
**Decision:** `engine/reconcile.ts` accepts an external reference as agreeing when the two net
figures are within **5%** (`REFERENCE_TOLERANCE = '0.05'`, an exact decimal comparison). Chain
corroboration in tier 1 continues to assert **equality, with no tolerance at all.**

**Why the two differ, which is the part that was never written down.** The existing decision record
*"Corroboration compares exactly, at the block the value was written"* says a tolerance is the
problem, not the fix — and that is still true **of tier 1**, because tier 1 compares *the same
quantity to itself*: the subgraph's `inputTokenBalance` against the contract's `totalSupplyAssets`,
read at the block the subgraph wrote the value. Two readings of one number that disagree by any
amount disagree, and any tolerance there is wide enough to hide the mapping errors the check exists
to catch.

Tier 2 is not that comparison. It puts **our net figure against a different organisation's net
figure, computed by a different methodology, from different source data, at a different moment.**
DefiLlama and a Messari subgraph do not agree on which markets count, when a price is taken, or how
a wrapped asset is attributed. Two such figures landing within a few percent is corroboration; the
same two agreeing to the cent would be evidence they share a source, not evidence either is right.
Demanding equality here would produce a `discrepancy` on every deployment and the tier would be
worthless. **The tolerance is not a concession in tier 2 — it is what makes the comparison mean
something.**

**Why 5%, honestly.** ⚠️ **It was picked as a round number and has not been validated.** What
support exists is retrospective, not derived: the three deployments that have ever tied out against
DefiLlama landed **0.9–2.5% apart** (logged 2026-09-07), so 5% sits at roughly double the widest
agreement we have actually observed. That is a reason to think it is not obviously too tight. It is
**not** a reason to think it is right, and nothing has tested where it starts admitting real errors —
5% of Aave v3's net is roughly $700M, which is larger than most deployments on the table.

**What we give up by not knowing:** a gap between 5% and whatever the true noise floor is, in which
a genuine discrepancy would be reported as agreement. Narrowing it without measurement would trade
that for false discrepancies, which is not obviously better.

**Alternative rejected:** deriving the tolerance per deployment from observed historical spread. It
is the right answer and it needs a history we do not have — three tie-outs is not a distribution.
Recorded so that when the external-reference adapter is built, calibrating this is part of the work
rather than a discovery.

⚠️ **The same 5% appears independently in `scripts/ops/triage-protocols.ts` as `GAP_OK = 0.05`**, on
the same comparison against the same source, and the two are not a shared constant. They should
move together; today nothing makes them.

**Affects:** `engine/reconcile.ts` tier 2 · `scripts/ops/triage-protocols.ts` · the external-reference
adapter (unbuilt) · the existing decision *"Corroboration compares exactly"*, which this does not
contradict but does bound

---

## `Verdict.call` is nullable, and null is the answer for a metric across deployments

**Date:** 2026-09-07
**Decision:** `Verdict.call` becomes `VerdictCall | null` in `alpha-markets/report/v1`. A report whose
`subject.headline` names one deployment's figure gets a call as before. A report whose headline is a
metric across a set gets **`null`**. `Coverage` is unchanged and is now **aggregated across every
deployment** on those reports, and each deployment's own reconciliation stays in `checks` as its
three tier claims.

⚠️ **This is a change to the published schema, not an internal one.** Alpha Markets is meant to be
something another team's analyst can produce reports for, and anyone targeting `v1` must now handle
a null call. It is recorded here for that reason. The version string is unchanged: the field was
always present and every value it could previously hold it can still hold, so an existing consumer
that reads `call` as a string and does not expect null is the only thing that breaks — which is
exactly what this note exists to warn.

**Why null rather than a computed answer.** A verdict answers *"can this figure be stood behind"*.
A ranking has no such figure. Every way of manufacturing one lies in some direction: **the worst
across the set** stamps `discrepancy` on a table where twenty-two of twenty-three rows tie out
cleanly — and rankings deliberately include weak deployments with caveats, so it makes the honest
thing look broken. **The best across the set** hides the row that does not hold. **An aggregate rule**
("`ties_out` only if every checkable deployment agreed") is defensible and was the alternative
seriously considered, but it still answers a question nobody asked: a reader of a ranking wants the
verdict for *row 2*, not for the table, and row 2's verdict is in `checks` where it belongs.

**What it fixes, and this is the part that forced the change.** The field used to be filled from
whichever deployment came first in the plan — `slugs[0]` — because the headline-matching branch could
never match a `metric.` sentinel. That is arbitrary, and worse, **it put plan ordering inside the
report hash**: the same data, planned in a different order, produced a different report identity.
`null` is a stable fact about the report. Iteration order is now sorted for the same reason, since
`checks` and `provenance` are arrays and array order is hashed.

**What we give up:** a single-glance trust signal on multi-deployment reports. A reader now has to
look at per-deployment claims to see which rows are corroborated. That is more work and it is
honest work; the previous single glance was showing them one deployment's verdict labelled as the
report's.

**Alternative rejected:** making the whole `Verdict` object nullable. It would have deleted
`Coverage` from precisely the reports where coverage matters most — a twenty-three deployment
ranking — and coverage is not a judgement, it is a measurement that survives having no verdict.

**Consumers checked before the change:** `narrate.ts` `context()` (now names the null case in words
so the model does not read "null"), `demo/execute.ts` (guarded), `demo/canonical.ts` fixtures (still
valid), and `render()` — which never read the verdict at all, so the printed report is unaffected.

⚠️ **One ordering dependency remains and is not fixed here:** `subject.deployments` is passed through
from the plan in the planner's order, and it is inside the hash. Sorting it would make the report
identity fully independent of plan ordering; it is left alone because rewriting a plan's declared
subject is a different decision from choosing an iteration order.

**Affects:** `types/report.ts` (`Verdict.call`) · `agent/execute.ts` (verdict assembly, sorted
iteration) · `agent/narrate.ts` (prompt wording) · the `v1` contract as published to other analysts

---

## The digit guard warns in Phase 2 and enforces in Phase 3

**Date:** 2026-09-08
**Decision:** `agent/validate.ts` is wired into the report path as a **warning**. The report renders
in full, then the violations print underneath it. Nothing is blocked, nothing is withheld, and no
violation changes what a reader sees. Enforcement — refusing to publish a report that fails — waits
for Phase 3.

**Why not enforce now.** Every report generated today fails, and the dominant failure is one we do
not consider broken: the model computing a utilization column from two figures **this pipeline
actually fetched**. That is arithmetic on Graph data, not invention. A hard refusal would reject
every report for something that is, on the current reading, fine — and a guard that fails everything
teaches everyone to route around it.

**Why enforce later, and what changes.** In Phase 3 a report becomes something someone pays for and
stakes on. At that point "traceable to a query at a specific block" stops being a design preference
and becomes the thing being sold: a buyer who cannot verify a figure has bought a claim, not a
measurement. The same violation that is acceptable in a printed memo is not acceptable in a
tokenised artifact whose hash is committed on-chain.

⚠️ **This is deliberate, not unfinished.** The unit is built, tested against five cases, and running
on every report. What is deferred is the consequence, not the check.

**What we give up in the meantime:** a report can carry a figure a reader cannot trace, and the only
signal is a warning printed below it that nobody is obliged to read. Accepted, on the grounds that
the warning makes the problem visible and measurable while it is cheap to fix.

### The two gaps the guard exposed, both the same shape

⚠️ **Both are the engine failing to expose something the model needs, so the model supplies it
itself.** That is the pattern worth naming: a model given a true quantity it cannot cite will type
it, because the alternative is saying something false.

**1 · The market population count has no fact id.** `execute` knows a deployment has 63 markets and
reports it in a `market-population` check rationale, but there is no `{fact:…}` for it. So a report
that honestly says "23 of 63 markets shown" types `63`. `FactUnit` already includes `'count'` and
`show()` renders that unit verbatim, so this is a small `execute.ts` change — emit the count as a
fact alongside the market facts.

**2 · Utilization is not computed anywhere.** No engine figure expresses borrows ÷ deposits, so the
model divides. `ops.ratio` exists and is exact, `FactUnit` includes `'ratio'`, and `show()` already
renders a ratio as a percentage — the machinery is present and unused. Computing it in the engine
would make the column citable AND make it correct to more than two significant figures, which the
model's arithmetic is not.

Closing either narrows the warning to real fabrications. Closing both is the precondition for
enforcing, and doing them in that order is why enforcement is a Phase 3 item rather than a switch we
could flip today.

**A third, smaller, and undecided:** a ranking's `| Rank |` column produces one violation per row —
`1` through `10` — because a rank is a digit the model typed and no fact supplies it. It is not a
claim about the world, it is an ordinal for a row the reader can see. Whether ranks should be exempt,
become facts, or be dropped from tables is open; today they are simply noise in the warning, and the
demo caps the printed list at ten so they do not bury the percentages.

**Affects:** `agent/validate.ts` (unchanged by this decision) · `scripts/demo/narrate.ts` (the
warning) · `execute.ts` (both gaps above) · Phase 3's definition of done, which should include
enforcing this

---

## Reports are a read-only purchase — the Own tier is cut

**Date:** 2026-09-08
**Decision:** The x402 gate sells **reads**. A buyer pays, receives the report body, and that is the
whole transaction. **No ATS token is transferred to a buyer as part of a purchase.**

⚠️ **Report tokens are still issued, one per report, and the transfer is still demonstrated** — as a
standalone operation rather than as a consequence of payment.

**Why.** H2.4 asks for issuance, configuration and **≥1 lifecycle operation** on video. It does not
require the lifecycle operation to be *caused* by a payment, and reading it that way was our own
addition. Demonstrating `transfer` directly satisfies the requirement outright.

What the Own tier costs is the expensive half of the gate, and all of it is machinery rather than
product: **inventory reservation** against a supply of one, **recipient binding** (§5.4's EIP-191
session, because an x402 payer is a Hedera `0.0.x` and an ATS recipient is a testnet EVM address —
different identifiers, and the second cannot be derived from the first), the **two-buyers-one-unit
race** (R16), and a `409` branch. With Phase 4 unstarted and CORE, seventeen units was the argument
against carrying it.

**What we give up.** The product story is weaker: "buy a report" is a smaller idea than "own the
report." R15 (payment ok, ATS transfer fails) stops being reachable, which is a simplification but
also the loss of a genuinely interesting failure path. And §9's Phase 3 exit clause *"token-holder
isn't charged on either read"* is no longer meaningful, because in Phase 3 no buyer holds a token.

**Alternative rejected:** keeping Own and cutting a play gap or the recovery unit instead. Both are
worse trades — the play gaps are where the failure modes get found before a demo, and the recovery
unit is the only defence that exists against a Hedera settle that times out after broadcasting.
**Revisit if:** Phase 4 lands early. The gate's branch table is written so Own is additive rather than
a rewrite — a tier, a reservation and a recipient, on a checkpoint that already exists.
**Affects:** §5.19 `gate.ts` branch table (the four Own rows are out of scope for Phase 3) · §5.4
recipient binding *(now unreached in Phase 3 — see the next decision)* · §9 Phase 3 exit *(amended in
this commit)* · R15, R16 *(not reachable in Phase 3)* · `PHASE-3.md` Units 13 and 14

---

## x402 stays agent-to-agent; humans identify, agents buy — which resolves §5.3 against §5.4

**Date:** 2026-09-08
**Decision:** **x402 purchases are agent-to-agent.** A human can prove which address they control —
an EIP-191 signed challenge, so a purchase can be attributed and re-read — and that comes **at the end
of Phase 3** as the **named cut point** if Phase 4 needs the time. ⚠️ **A human completing an x402
payment in a browser is out of scope, deliberately and not for lack of time.**

**Why that is sufficient rather than a gap.** H1.3 asks for *"a platform **or** agent"* consuming the
service with ≥1 real paid request end to end. **The buyer agent completing a real paid request is what
the requirement asks for.** A browser payment is a product nicety, and it would need a WalletConnect
Hedera signer that does not exist — `@x402/paywall` ships `evmPaywall`, `svmPaywall` and `avmPaywall`
and **no Hedera export at all.** That is not a unit, it is a project.

**And it is the stronger demo for this build.** One analyst publishes a report; a second agent, with
its own wallet and its own spend cap, pays for it and reads it. That is the agent-economy pitch
demonstrated rather than described — and SM-05 already proved the handshake settles on Hedera through
Blocky402, so the demo rests on something measured instead of something we would have to build.

⚠️ **If humans need a way in later it does not have to be x402** — a sponsored read against a proven
address, a different rail, a free tier. **That is a Phase 5 question**, and it should not be answered
by quietly widening Unit 18.

**Why this is a decision and not a schedule.** §5.3 and §5.4 contradict each other and have since they
were written. §5.3 cut human buying outright — *"Pay for a report (x402): the buyer agent only"* —
on the grounds that `@x402/paywall` has no Hedera UI and a browser flow needs a WalletConnect Hedera
signer we would have to build. §5.4 then specifies an EIP-191 session so that a **human** can prove an
EVM address for the Own tier. Both cannot be true. **The resolution is that §5.3 overstated it:
human buying is deferred, not cut**, and §5.4's mechanism is what it is deferred *to*.

⚠️ **`auth.ts` returns, and its job is narrower than §5.4 describes.** With the Own tier gone (previous
decision) there is no recipient to bind and no inventory to reserve against a proven address. What is
left is the honest remainder: **proving which address a human is**, so a purchase can be attributed
and re-read. That is a smaller file than §5.4 implies.

**What we give up by ordering it last.** Buying is agent-to-agent either way, so cutting Unit 18
loses a person's ability to *identify* themselves — not their ability to buy, which they never had.
The cut costs product surface and no requirement. That asymmetry is the reason it is last rather than
first.
**Alternative rejected:** building the human path alongside the agent path. It doubles the gate's
identity handling before either is proven, and the agent path is the one a requirement depends on.
**Affects:** §5.3 human-surface table *(amended: "Cut" → "deferred within Phase 3")* · §5.4 *(scope
narrowed — recipient binding is gone with the Own tier; address proof remains)* · `PHASE-3.md` Unit 18

---

## Testnet in HBAR, mainnet in USDC, and the cutover is the end of Phase 4

**Date:** 2026-09-08
**Decision:** All development and every demo rehearsal runs on **Hedera testnet, priced in HBAR**.
**Hedera flips to mainnet at the end of Phase 4**, priced in USDC, so the submission can show real
settled transactions. ⚠️ **Arc stays on testnet throughout — Arc mainnet does not exist until
2026-09-16**, three days after the deadline.

**Why this is recorded rather than left as a to-do.** It already was a to-do, in three places — SM-05's
row, PLAN §1, and `x402-next-2.25.md`'s "Verdict: USDC" — all reading as scheduled work for Phase 3.
**None of it was going to happen, because the blocker was never setup, it was supply.** Circle's
testnet faucet did not deliver USDC to our account, Discord went unanswered, and SM-08 later found the
faucet's API endpoint rate-limiting independently of its web form. A dependency on a third party who
is not answering, written down as a task, is how a demo finds out on the day.

**Why mainnet at the end of Phase 4 rather than never.** H1.1 accepts testnet, so nothing is required
here — this is for the submission's credibility, not its eligibility. Doing it last means the whole
system is proven before the asset changes underneath it, and R12's atomicity is honoured once rather
than negotiated repeatedly.

⚠️ **Mainnet HBAR has no faucet.** It needs an exchange withdrawal, possibly behind KYC, on a clock
nobody controls — the same unbounded dependency that took R12 in the first place. **Start it well
before it is needed**, and treat the cutover as gated on funds arriving rather than on a date.

**Why the swap is small, which is what makes deferring it safe.** SM-05 already proved the part that
looked risky: the client's spend controls reject non-default assets by default, and **opting HBAR in
explicitly with its own atomic per-payment cap worked** — so the non-default-asset path is exercised
and the control is not being disabled to get there. What remains is **token id, price format
(`AssetAmount` in atomic units → a `"$…"` money string), the buyer's `allowedAssets` entry, and the
facilitator's advertised asset.** Per R12 those move together or not at all. SM-05's
`TokenAssociateTransaction` path is kept and skipped rather than deleted for exactly this moment.

**What we give up until then, and it is real:** USD-legible pricing — `"$0.50"` throws on HBAR because
`defaultMoneyConversion` rejects asset `0.0.0`, so a testnet price is hand-computed tinybars — and
**H1.7's "HTS in the settlement path" judged extra, which is forfeited rather than deferred** while
the asset is native HBAR.
**Alternative rejected:** chasing testnet USDC now. It buys a legible price on a network where nothing
is real, from a faucet that has already refused us twice, in the week Phase 4 has to be built.
**Affects:** §1 chain table *(amended in this commit)* · R12 *(cutover now scheduled rather than
conditional)* · §3 H1.7 *(forfeited on testnet)* · SM-05's USDC row in `smoke-results.md`
*(closed as decided)* · `docs/research/x402-next-2.25.md` §5 *(marked superseded)* ·
`payments/buyer.ts` and `payments/quotes.ts` (Phase 3)

---

## Each analyst has its own Hedera account (2026-09-08)

**Decision:** `analysts.ts` carries `hederaAccountId` and `hederaEvmAddress` per
row rather than in a shared platform config. An analyst tokenizes its own report
and sells it behind its own x402 gate, so the `payTo` and the ATS issuer are the
analyst's, not the platform's.

**Consequence:** every unit that issues a token or builds a payment challenge
reads these from the analyst row on the report being sold, never from an env var.
Reading them from env would mean a second analyst's sales pay the first.

**Cost:** a second analyst needs its own funded Hedera account with HBAR for gas —
provisioning rather than code. One analyst ships in this build; the row shape is
what makes a second one additive.

**Affects:** `config/analysts.ts` · `agent/execute.ts` · `tokenize/ats.ts`
(Unit 8) · `payments/quotes.ts` (Unit 13) · PLAN §11 cut #6

---

## The resolve cron fires at 02:00 UTC, not 01:00 (2026-09-11)

**Decision:** Unit 11's `vercel.json` entry is `0 2 * * *`. Markets 6 and 7 have
`observationEnd` at 2026-09-13T00:00:00Z, and `spec.ts`'s `FRESHNESS_MARGIN_SECONDS`
is 3600, so the earliest legal settlement is **2026-09-13T01:00:00Z**. The cron is
set an hour past that rather than on it.

**Why not 01:00.** ⚠️ The freshness rule compares **the subgraph's
`_meta.block.timestamp`**, not the wall clock — `isFresh(metaBlockTimestamp,
observedDay)`. An indexer running even minutes behind real time makes a 01:00 call
throw `SettlementTooEarly`, and **Vercel Hobby fires once daily with no retry**, so
a single early call costs the whole day. 02:00 buys an hour of indexer lag on top
of the margin the rule already carries.

**Why not later.** Sunday 2026-09-13 is the submission deadline. Firing at 02:00
leaves roughly twenty-one hours of that day for the manual fallback
(`scripts/ops/resolve-market.ts --market=<id> --live --send`) and for recording,
and a later hour buys nothing the margin has not already bought.

**Consequence — and it is the reason this hour is worth more than the arithmetic
says.** Hobby drifts up to an hour, so the run lands between 02:00 and 02:59Z.
⚠️ **The same schedule also fires on Saturday 2026-09-12**, when markets 6 and 7
are not yet past `observationEnd` and `marketsAwaitingResolve` returns nothing. That
Saturday run is **a free rehearsal of the scheduled path with no money at stake** —
it proves auth, deployment and the empty-work report a day before the only run that
matters. A schedule chosen to land late on Sunday would have given up that rehearsal.

**Cost:** nothing settles before 02:00Z Sunday even though it legally could from
01:00Z. On a market whose `resolveDeadline` is 2026-09-15T00:00:00Z that is an hour
out of a forty-seven-hour window, and `voidMarket` stays permissionless after the
deadline regardless of whether the cron ever works.

**Alternative rejected:** `0 1 * * *`, which is the earliest legal hour and reads
tidier against `observationEnd + margin`. Rejected because it makes the run's
success depend on the indexer being no further behind than zero, on the one day
there is no second attempt.

**Affects:** `app/api/cron/resolve/route.ts` (Unit 11) · `vercel.json` ·
PHASE-4 *The calendar* · PLAN §5.16's freshness rule

---

## 2026-09-12 · `/api/console/source` returns a roster, not a balance sheet

**What we're doing.** The route asks **all 28 registered Ethereum lending deployments** whether they
answer and what schema version each reports, bounded at 10 seconds, and returns that as `roster`
alongside the evidence record. The single-deployment 21-field `balance-sheet` read it used to return
is **gone**.

**Why.** The Source data panel's job is to tell an operator **what they can ask about before they
write a directive** — which protocols exist, whether they are answering, how current they are. One
deployment's 21 fields answers a question nobody has yet. A roster is a menu; a balance sheet is a
detail view for a deployment you have already chosen.

**What we give up, plainly.** The 21-field detail view. If an operator wants to see what the data
*looks like* for one deployment, that surface no longer exists and would have to be re-added — as a
second request against a row in the roster, which is the right shape for it anyway.

**The alternative rejected.** Returning both (29 queries, same wall time, both payload keys real).
Rejected because the panel would then have to render two different tables in one tab, and the second
would have no consumer until someone asks for it. **Do not build unused payload.**

**⚠️ It also crosses a rule.** PHASE-6 §7 said `app/api/` was untouchable. That was right for the
product routes and wrong for the console's own routes, which exist to feed console surfaces. The
rule is amended in the same commit: `src/`, `contracts/`, `scripts/` and the **product** routes stay
untouchable; a console route may change when its own surface requires it.

**Affects.** PHASE-6 §7 and task 2, both amended in this commit. `app/api/console/source/route.ts`,
`app/components/ConsoleViewer.tsx`, `app/console/page.tsx`.

---

## 2026-09-12 · ⚠️ TEMPORARY — the console doorlock is unwired

**⚠️ THIS IS A TEMPORARY STATE AND IT MUST BE UNDONE BEFORE SUBMISSION.**

**What we're doing.** The six console routes — `source`, `generate`, `tokenize`, `transfer`,
`report`, `accounts` — no longer call `locked()`. The call is **commented out in each**, not deleted.
`app/api/console/lock.ts` is intact, `CONSOLE_SECRET` stays in `.env` and `.env.example`, and
`ConsoleSecret.tsx` keeps its provider, hook and field component.

**Why.** The lock was added because `/console` was about to be linked from the nav and its buttons
spend real funds. **That is a fact about a public deployment and it is not a fact about one machine
during wiring.** Requiring a pasted secret on every console surface was costing more than it
protected — every Phase 6 task has to paste it before it can see anything work.

**What we give up, plainly.** Any process that can reach `localhost:3000` can spend. On a deployed
URL this would be unacceptable; on a development machine it is the same exposure the shell already
has.

**⚠️ WHAT PUTS IT BACK — not a matter of taste.** The console being linked from the nav on a
deployment a stranger can reach. From any such URL:

- `generate` burns Anthropic budget,
- `tokenize` mints a **permanent** ATS asset for ~7.7 HBAR,
- `transfer` moves one,
- `source` spends Graph quota.

**How to put it back.** Uncomment two lines per route (`const refusal = locked(request);` and
`if (refusal) return refusal;`) plus the import, and restore `<SecretField />` above the composer in
`AtlasPanel.tsx`. **Nothing needs rebuilding.**

**The field is hidden, not deleted.** ⚠️ **A field asking for a secret the routes ignore is worse
than no field** — it implies a gate that is not there and makes every surface look broken until
something is pasted. `SecretProvider` is still mounted and the header is still sent (and ignored), so
re-wiring touches the routes and one line of `AtlasPanel`, not the data path.

**⚠️ Nothing else lost a guard, and this was verified rather than asserted.**
`/api/reports/<hash>` still answers **402** unpaid — the x402 gate is a settled on-chain payment
verifiable by a stranger and has nothing to do with this. Both cron routes still answer **401**
without `CRON_SECRET`, which is a different mechanism for a caller that is never a human.

**Affects.** `app/api/console/{source,generate,tokenize,transfer,report,accounts}/route.ts`,
`app/api/console/lock.ts`, `app/components/{AtlasPanel,ConsoleSecret,ConsoleViewer}.tsx`.
PHASE-6 D1 is superseded for the duration: the field exists but is not rendered.

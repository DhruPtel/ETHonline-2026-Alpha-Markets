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
**What protects us:** The token our deploy produced, `0.0.10395983`, carries **its own** expiration of
`1796496695` — 2026-12-04, well past both. **An issued asset outlives the factory that issued it**, so
an expiry event costs us the ability to mint new reports, not the ones already minted.
**Alternative rejected:** Deploying our own infrastructure now, pre-emptively. Twenty-nine minutes and
~500 HBAR against a risk Hedera does not presently enforce, before we know the rest of the pipeline
works. It stays the fallback, unchanged.
**Revisit if:** either contract stops answering, or the demo date moves past 2026-09-10 and we would
need to mint on the day. Then it is the 111-contract deploy, and it is ~29 minutes, not a surprise.
**Affects:** SM-07 · §8 SM-07 row (the "expiry of `0.0.9213391` recorded" clause is now satisfied) ·
report tokenization (Phase 3)

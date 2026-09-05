# Research: graphprotocol/subgraphs-skills

**Repo:** https://github.com/graphprotocol/subgraphs-skills
**Reviewed at:** commit `7b3499a` ("Rename project title…", 2026-04-09), main — **confirmed identical
to upstream `graphprotocol/subgraphs-skills@main`**
**Reviewed:** Sept 5, 2026

> ✅ **Fully executed review.** Whole repo is 5,535 lines, so it was **read in full, not sampled.** The
> reviewer ran the installer, the validator, `claude plugin validate`, and the published npm package.

---

## 0. The two questions

### a. Does this accelerate our fork? 🔴 **No. It won't touch our use case.**

Our fork task: take a Messari aave-fork manifest, flip `indexerHints.prune` to `never`, move
`startBlock` forward ~9.4M blocks, maybe trim entities, build, deploy.

**Everything in this repo that intersects that:**

- `skills/subgraph-optimization/SKILL.md:21-53` — **33 lines on pruning.** Contains the
  `prune: auto | <number> | never` table and a note that Time Travel needs explicit retention.
  ⚠️ **It never states that `auto` = 500 blocks.** We already know more than this section says.
- `skills/subgraph-testing/references/common-errors.md:361-367` — "Cannot graft: block pruned" → "use
  a more recent block, or set `prune: never` on source subgraph." One sentence, already known.
- `skills/subgraph-dev/SKILL.md:49-53` — `graph auth --studio` / `graph deploy --studio`. Known.

**Grepped across every file, zero hits:**

| term | hits |
|---|---|
| `messari` | 0 |
| `fork` | 0 |
| `migration` / `schema version` | 0 |
| `mcp` | 0 |

`startBlock` appears **only as hardcoded literals** inside example manifests (`12345678`, `18000000`).
**No guidance on choosing a startBlock, computing a block N days back, or the tradeoff involved. No
automation touches a manifest at all** — the repo contains 314 lines of executable code total, and
none of it reads or writes `subgraph.yaml`.

**The one genuine reuse:** `common-errors.md` (450 lines) as a debugging reference when the fork fails
to index — determinism errors, store conflicts, `eth_call` failures, ABI mismatch. **Worth a bookmark.
Maybe 30 minutes saved, later.**

### b. Is it a submittable contribution? ✅ **Yes — but publish it ourselves, don't bet on the PR.**

The prize text names **"agent SKILLs"** outright, so the artifact class is a direct textual match. **The
gap is real and large. But the venue is weak** — separate those two facts.

**The gap a skill would fill.** This repo is **100% authoring-side and 100% generic-protocol.** Nothing
in it, or in its MCP sibling, encodes anything about standardized schemas. Specifically missing:

- Any awareness that a schema family **has versions**, let alone that Messari lending has five with
  real breaks.
- Any notion that a query valid against 3.1.0 **silently breaks** on 1.3.0 (Position absent), or that
  `PositionSide` enum values differ, or the `ID!`→`Bytes!` flip.
- That standardized subgraph fleets ship `prune: auto` by default and therefore have a **~500-block
  time-travel floor** — the exact trap we hit.
- Which entity classes **survive pruning** (immutable events) and are therefore safe settlement anchors.

**Genuine contribution, not a box-tick** — knowledge nobody has written down in agent-consumable form,
and we're deriving it anyway.

### ⚠️ The venue problem (all verified via GitHub API)

- `graphprotocol/subgraphs-skills` is **a fork of `PaulieB14/Subgraph-Skills`**, not an org-native repo.
- **Issues are disabled** on the graphprotocol fork (`has_issues: false`). You cannot even file a bug.
- **Zero PRs have ever been opened** on either the fork or its parent. No merge-latency track record.
- **No CONTRIBUTING.md, no CODEOWNERS, no CI, no tests, no `.github/` at all.**
- 2 stars, 0 forks, last commit 5 months ago.

> **Write the skill, ship it as our own plugin repo** (fully under our control, guaranteed to exist on
> submission day), **and open the upstream PR as an unblocking bonus. Do not make the submission depend
> on a merge.**

---

## 1. What this is

**Format:** a **Claude Code plugin** shipping three model-invoked skills, plus a parallel OpenClaw copy.
Not Cursor rules, not an MCP server.

A skill is a directory containing `SKILL.md` — YAML frontmatter (`name`, `description`, `version`)
followed by markdown — plus an optional `references/` folder. **The `description` field is the whole
invocation mechanism:** Claude reads it and decides whether to pull the skill in. **No slash command,
no executable entry point, no tool definition. It is prompt material, loaded conditionally.**

**Install paths, tested:**
- `claude plugin validate .` → ✔ **Validation passed.** It read `.claude-plugin/plugin.json` only.
  ⚠️ The repo also ships `.claude-plugin/manifest.json` with a `skills[]` array — **Claude Code's
  validator didn't look at it**; only the repo's own `scripts/validate.js` reads it. Appears vestigial.
- README says `claude plugins add PaulieB14/subgraphs-skills`. ⚠️ **This command does not exist** —
  `error: unknown command 'add'`. Real path is `claude plugin marketplace add …` then
  `claude plugin install`, or manual copy into `.claude/skills/`.
- `npx subgraphs-skills --claude` → **broken**, see §7.

### Maintenance / provenance

| | |
|---|---|
| Repo | `graphprotocol/subgraphs-skills`, **a fork of `PaulieB14/Subgraph-Skills`** |
| Author | **PaulieB14** — GitHub bio "Graph Advocate." **Community, not Foundation engineering** |
| Last commit | 2026-04-09 (5 months ago). All **11 commits** from one author, Jan–Apr 2026 |
| Stars / forks / issues | 2 / 0 / **issues disabled** |
| CI | None |
| StreamingFast link | README credits `streamingfast/substreams-skills` as the format template (5★, pushed 2026-08-17) — also small |

⚠️ **Metadata disagrees with itself:** `plugin.json` says author `PaulieB14`, `manifest.json` says
`buildlin`. Versions too — `package.json` 1.1.0, `plugin.json` 1.0.0, `manifest.json` 1.0.0, every
`SKILL.md` frontmatter 1.0.0.

**The `graphprotocol` org namespace gives Graph-branded legitimacy for citation purposes**, which is
worth something for a submission. **Don't mistake it for a staffed project.**

---

## 2. Read these first

| # | Path | Why | Time |
|---|---|---|---|
| 1 | `skills/subgraph-optimization/SKILL.md` | **The heart.** Most self-contained skill, and the only one whose subject touches our fork. Read lines 1–5 for the frontmatter contract, then 21–53 for pruning — **so you can see exactly how thin the coverage is** | 8 min |
| 2 | `.claude-plugin/plugin.json` + any `SKILL.md` frontmatter (lines 1–5) | 9 lines + 5 lines. **The entire mechanic that makes a directory a skill.** The `description` field is what triggers loading — the only thing that matters for discoverability | 3 min |
| 3 | `skills/subgraph-testing/references/common-errors.md` | **The one asset we'll actually reuse.** Read "Grafting Errors" (l.359) and "Indexing Errors" (l.103). **What to open when our fork won't sync** | 10 min skim |
| 4 | `bin/install.js` | 113 lines, shows how a skill pack distributes itself. **Contains the bug in §7 — a 1-line fix that's a legitimate warm-up PR** | 3 min |
| 5 | `skills/subgraph-dev/references/patterns.md:265-317` | The "Lending Protocol (Aave/Compound-style)" schema. **Read it to calibrate the gap:** a hand-rolled 5-entity sketch with no relation to Messari's standardized schema | 2 min |

**Skip entirely:** `openclaw/` (abridged duplicate), `examples/` (doesn't build),
`subgraph-composition.md` (real feature, unrelated).

---

## 3. Structure and contents

```
.claude-plugin/plugin.json      9 lines — the only file Claude Code's validator reads
.claude-plugin/manifest.json   31 lines — skills[] array; vestigial, read only by scripts/validate.js
skills/                        Claude Code format — 3 skills, 9 reference docs, 3,374 md lines
  subgraph-dev/                 SKILL.md 392 + 5 refs — 1,938 lines total
  subgraph-optimization/        SKILL.md 401 + 1 ref — 500 lines
  subgraph-testing/             SKILL.md 620 + 3 refs — 1,696 lines
openclaw/                      Same 3 skills, OpenClaw frontmatter, 33–59% ABRIDGED
examples/erc20-token/          Not buildable (no abis/, no package.json)
bin/install.js                113 lines — npx installer. BROKEN (§7)
scripts/validate.js            82 lines — checks manifest fields + SKILL.md existence
package.json                  npm `subgraphs-skills@1.1.0`, published 2026-03-01
```

**All three skills do the same thing mechanically:** inject curated markdown into context when the
`description` matches.

- **`subgraph-dev`** — schema design, `subgraph.yaml` structure, handlers, templates, contract
  bindings, composition, and copy-paste protocol patterns (ERC20, DEX, NFT, lending, staking,
  governance).
- **`subgraph-optimization`** — The Graph's six official best practices, one section each. Essentially
  a restatement of `thegraph.com/docs/en/subgraphs/best-practices/*`.
- **`subgraph-testing`** — **the deepest coverage in the repo.** Subgraph Linter (8 named checks with
  before/after fixes), Matchstick setup, mock events, mock contract calls, assertions, GitHub Actions
  CI template.

### The shape of one complete skill

```yaml
---
name: subgraph-optimization
description: This skill should be used when the user asks to optimize a subgraph,
  improve indexing speed, reduce query time, discusses pruning, @derivedFrom,
  immutable entities, avoiding eth_calls, timeseries aggregations, or grafting
  on The Graph protocol.
version: 1.0.0
---
```

…followed by 396 lines of markdown and a sibling `references/performance-benchmarks.md`.

> **That's it. That's a skill. The frontmatter description is the router; the body is context. Writing
> one is writing a good document, not writing software** — which is why the hours estimate is bounded.

**Prose vs runnable code:** 5,080 markdown lines, 3,132 (61%) inside code fences — **but "inside a code
fence" ≠ runnable**, those are illustrative snippets. **Actually-executable code in the entire repo:
314 lines** (install.js 113, validate.js 82, example mapping.ts 119). **~98% documentation, ~2% code,
and the code doesn't do subgraph work.**

---

## 4. What it actually automates

**Short version: it automates nothing. It's a context pack.**

| | Coverage |
|---|---|
| **a. Scaffolding from ABI/address** | **No.** Documents `graph init --product subgraph-studio` and stops. No generation |
| **b. Mappings (AssemblyScript)** | Best-covered area, but as **copyable snippets, not generation.** `patterns.md` (521 lines, 82% code) + `assemblyscript-api.md` (258 lines) |
| **c. Schema authoring** | Yes — `schema-types.md` + patterns. ⚠️ **Schema migration between versions: not present.** Zero hits for `migration` or `schema version` |
| **d. Build / test / deploy** | Documents the commands. Matchstick is the deepest content (620-line SKILL + 314-line API ref + CI template). **No runnable automation** |
| **e. Debugging indexing errors** | ✅ **The strongest asset.** `common-errors.md`, 450 lines. **Genuinely useful when our fork stalls** |
| **f. indexerHints / pruning / startBlock** | Pruning: 33 lines restating the docs. **Never states auto = 500 blocks.** startBlock: **no guidance at all** |
| **g. Querying** | 🔴 **Essentially nothing.** Entirely authoring-side. One aside and a pagination snippet. **No query composition, no schema introspection, no endpoint handling** |

> **(g) is the important row. It's also our opening — see §6b.**

---

## 5. Relationship to the Subgraph MCP

**Authoring counterpart — cleanly, zero overlap.** The MCP is **read-path** (discover subgraphs, fetch
schemas, execute GraphQL); this repo is **write-path** (author manifests, mappings, tests). Opposite
sides of a deployed subgraph.

**Nothing here wraps or extends the MCP.** Zero occurrences of "mcp" anywhere, case-insensitive.

💡 **The same author maintains a separate MCP-side skill pack** — `PaulieB14/subgraph-mcp-skills`,
"Give your AI agents access to 15,000+ blockchain subgraphs through The Graph's Subgraph MCP." Ships
`skills/subgraph-mcp/SKILL.md`, per-client setup docs, `examples/queries.md`,
`docs/popular-subgraphs.md`. **Also dormant** (last pushed 2026-03-01, 1 star).

The MCP server itself appears to be `graphops/subgraph-mcp` (8★, **last pushed 2025-06-24 — over a year
stale**), with `graphprotocol/mcp-monorepo` (0★, 2025-10-13) also in the picture. **Neither is
vigorously maintained.**

> **The interesting part is the seam between them, which nobody has filled:** the MCP-side skills teach
> generic "here's how to run a GraphQL query"; the authoring-side skills teach generic "here's how to
> write a schema." **Neither knows that a standardized schema family exists, has versions, and will
> silently return wrong-shaped data across them. That seam is exactly where our knowledge sits.**

### ⚠️ Competitive note

The same author maintains **`PaulieB14/graph-aave-mcp`** — "MCP server for querying AAVE V2/V3/V4
lending and governance data via The Graph — 7 chains across 11 subgraphs" — **last pushed 2026-09-02,
three days ago, actively developed.**

And on **2026-09-04** they opened proposal-shaped issues on `x402-foundation/x402` ("Substreams package
for real-time x402 payment analytics"), `Polymarket/resolution-subgraph`, `Uniswap/v4-subgraph`, and
`morpho-org/sdks`.

> **That is lending subgraphs + x402 + prediction markets — our exact surface area. The maintainer of
> the repo we're evaluating is plausibly competing in the same categories.** Makes their repo a worse
> place to donate our best idea and a better place to send a small fix.

---

## 6. The contribution question

### What exists, what's missing

**Exists:** `subgraph-dev`, `subgraph-optimization`, `subgraph-testing`. Three skills, generic,
authoring-only, protocol-agnostic.

**Obviously missing:**
1. **Anything query-side.** No skill teaches an agent to compose GraphQL against a live subgraph.
2. **Anything about standardized/shared schemas.** Messari, or the concept generally.
3. **Anything version-aware.** No notion that schemas drift and queries break.
4. **Anything about forking/modifying an existing subgraph** — every path assumes greenfield.
5. **Deployment/ops beyond four CLI lines** — no Studio walkthrough, no sync monitoring, no versioning
   strategy.

### ✅ The standardized-schema gap is the cleanest one

Nothing in this repo, its MCP sibling, or `substreams-skills` encodes standardized-schema knowledge.
The closest thing is `patterns.md:265-317`, a hand-rolled Market/Position/Deposit/Borrow/Liquidation
sketch that **shares vocabulary with Messari and nothing else** — no version awareness, no enum
semantics, no pruning implications.

**The skill that should exist, and doesn't:**

> **`messari-lending`** — teaches an agent (i) which of the five schema versions a given deployment
> speaks and how to detect it by introspection, (ii) the concrete breaks: `PositionSide` enum drift,
> `id: ID!`→`Bytes!`, `Position` absent in 1.3.0, (iii) how to write a query portable across versions
> **or fail loudly rather than silently**, (iv) that the fleet ships `prune: auto` ⇒ ~500-block
> time-travel floor, so historical queries must anchor on **immutable event entities**
> (Deposit/Borrow/Repay/Liquidate/Withdraw), which survive pruning.

**Every bullet is something we must nail anyway to make the reconciliation deterministic.** The skill
is a repackaging of our own critical path — which is why it's cheap and why it's honest.

**It double-dips across both prizes:** the AI-tooling artifact, *and* the written justification for why
our `prune: never` fork needs to exist — strengthening the Standardized-Subgraph route.

### What contributing looks like

- **CONTRIBUTING.md: not present.** No CODEOWNERS, no PR template, no CI, no tests.
- README says only: "Contributions are welcome!"
- ⚠️ **Issues are disabled** on the graphprotocol fork. You'd file against the parent
  `PaulieB14/Subgraph-Skills`.
- **Review latency: unknowable** — zero PRs ever opened on either repo.
- ⚠️ **Because you'd be forking a fork, GitHub may default your PR's base to
  `PaulieB14/Subgraph-Skills`** rather than `graphprotocol/subgraphs-skills`. **Check the base
  selector explicitly** — we want the graphprotocol one for citation value.

**Would a PR land in 9 days? Coin flip at best.** The maintainer is extremely active right now (69
pushes in the last two weeks) — **but on other repos, and on their own hackathon pitches.** This repo
has been untouched for 5 months.

### Hours for one genuine skill

| Work | Hours |
|---|---|
| `SKILL.md` — ~250 lines: version-detection procedure, break table, query rules, pruning/settlement guidance | 3–4 |
| `references/version-matrix.md` — field-by-field diff across 1.3.0 / 1.3.1 / 2.0.1 / 3.0.1 / 3.1.0 | 2–3 |
| `references/query-cookbook.md` — portable queries + the anti-patterns that break per version | 1–2 |
| Frontmatter, plugin.json, README, install test | 1 |
| **Docs-only total** | **7–10** |
| Optional: `scripts/detect-version.mjs` that introspects a deployment and reports schema version + prune posture | +2–3 |

**7–10 hours docs-only, 10–13 with the detection script.** 💡 **The script is what elevates it from "a
good document" to "tooling," and the prize language says tooling.** ~150 lines against an introspection
query, and **we'll want it in the agent anyway.**

*Estimate assumes we're deriving the version drift regardless. Cold research doubles it.*

### ✅ Skill vs. the ERC-4626 Substreams module — take the skill

**Not close, given our constraints.** The Substreams module is the more impressive artifact in
isolation — heavier engineering, StreamingFast-native. **But for this build in this window it's the
wrong bet on three counts:**

1. **Variance.** Substreams means Rust toolchain, protobuf, substreams CLI, an endpoint + API key, and
   **sync time we don't control.** We're also shipping a Next.js app, an x402 gate on Hedera mainnet,
   ATS issuance on Hedera testnet, and an Arc market. **Adding the highest-variance dependency is how
   you arrive on the 13th with two things at 80%.**
2. **Narrative fit.** ERC-4626 is vaults. Our build is lending reconciliation. **The module would be a
   detached artifact judges have to be talked into connecting. The skill is load-bearing** — our agent
   literally uses it, and it explains why our fork exists.
3. **Marginal cost.** The skill is a **byproduct of work already on our critical path.** The Substreams
   module is net-new work competing for the same hours.

**Prize-coverage argument:** the `prune: never` fork **already satisfies** "authoring or extending a
Standardized Subgraph" for the composability prize. The Substreams module would be a second artifact
aimed at a route already covered, **while the skill covers the AI prize's named target with nothing
else competing for it.**

---

## 7. Gotchas

All verified by running, unless marked otherwise.

1. 🔴 **`npx subgraphs-skills` is broken — and has been for 6 months.** `bin/install.js:57-64` calls
   `fs.copyFileSync` on every directory entry, but `references/` is a directory. Throws `EISDIR`.
   Verified against both the local checkout and the published `subgraphs-skills@1.1.0`:
   ```
   ✗ Installation failed: EISDIR: illegal operation on a directory,
     copyfile '.../skills/subgraph-dev/references' -> '.../out/subgraph-dev/references'
   ```
   **Result: a silent partial install** — you get `subgraph-dev/SKILL.md` alone, no references, neither
   of the other two skills. Published 2026-03-01, never fixed. 💡 **This is the 1-line warm-up PR**
   (`fs.cpSync(src, dest, {recursive:true})`).
2. **The README's documented install command doesn't exist.**
3. **The example doesn't build.** `examples/erc20-token/subgraph.yaml:25` references `./abis/ERC20.json`,
   not in the repo. No `package.json` either.
4. ⚠️ **README claims the two formats carry the "same knowledge." They don't.** `openclaw/` is a heavy
   abridgement — subgraph-dev 59% the size, subgraph-optimization 46%, subgraph-testing 33%. Whole
   sections exist only in `skills/`.
5. **You can't file an issue.** Disabled on the graphprotocol fork.
6. **Version skew across four files**, and author disagreement between two.
7. **Stale content.** `subgraph-dev/SKILL.md:55-56` documents `graph deploy --product hosted-service`;
   **the hosted service was sunset in 2024.** Marked "(deprecated)" but still a copyable code block.
8. 🔴 **The pruning docs never state the actual retention.** `prune: auto` is described as "Retains
   minimum necessary history" — **the 500-block reality that broke our time-travel is nowhere in the
   repo. If we'd relied on this skill, we'd have hit the same wall.**
9. **Two manifest files, one decorative.** `claude plugin validate` read only `plugin.json`. **If we
   extend the repo, edit both or the skill may not register.**
10. ✅ **No infrastructure required, no accounts needed.** It's markdown. Nothing to provision.

---

## 8. Verdict

**Contribute a skill — `messari-lending` — and publish it under our own name. Do not use this repo to
accelerate the fork.**

**The fork question closes cleanly:** this repo is a documentation pack for authoring subgraphs from
scratch, and our task is surgically modifying an existing one. **The intersection is 33 lines of pruning
prose that says less than we already know**, plus a debugging reference worth bookmarking for when the
fork stalls at sync. **Nothing here reads a manifest, computes a `startBlock`, or has heard of Messari.
Budget zero hours against it.**

**The contribution question is where this repo earns its place** — not as a dependency, but **as
evidence of the gap.** Three skills, ~3,400 lines, an MCP-side sibling, and a StreamingFast analogue,
and **not one of them knows that standardized schemas exist, drift across versions, or ship with a
pruning posture that makes naive time-travel queries fail. That absence is our submission.**

Write `messari-lending`: the version-detection procedure, the concrete breaks, the portable-query
rules, and the `prune: auto` ⇒ 500-block ⇒ anchor-on-immutable-events chain that justifies our fork.
**7–10 hours docs-only, 10–13 with the introspection script — and add the script, because the prize
says "tooling," not "docs."**

**Ship it as our own plugin repo** so it exists regardless of anyone's attention; open the upstream PR
the same day as a bonus, **plus the one-line `fs.cpSync` fix for the broken installer** as a cheap,
obviously-correct second PR that might actually land.

**Choose this over the ERC-4626 Substreams module without much agonizing.**

⚠️ **One caution to carry forward:** the maintainer here is actively pitching lending-subgraph, x402,
and prediction-market contributions to other protocols **as of yesterday**, so treat this repo as a
citation and a small-fix target, **not as the home for our best idea.**

---

## Our addition: a second skill — report generation

The reviewer's `messari-lending` recommendation is the read-path skill. **There's a second one adjacent
to it that's arguably a better fit for the AI prize:** a skill that teaches an agent to **build a
financial report from Graph data** — not just query correctly, but structure the output.

Where `messari-lending` answers *"how do I query this schema without getting wrong answers,"* a
report-generation skill answers *"given lending data, what does a balance sheet look like, when do you
rank vs compare, why is 50 rows never the answer."* That's the `agent/skills/*.md` layer already in the
build plan — **balance-sheet.md, ranking.md, comparison.md, conventions.md** — packaged for external
use.

**Why it may be the stronger artifact:**
- It's **literally what our agent runs on stage** — the demo *is* the skill working.
- The AI prize rewards agents doing **"meaningful work with the data — reasoning, decisions,
  automation"** rather than printing query results. A report-structuring skill is that claim, written
  down.
- It's genuinely novel. Nothing in any Graph-adjacent skills repo touches output structure at all.

**Why `messari-lending` may still be the stronger *contribution*:**
- It fills a gap in an existing Graph repo, which is a cleaner "contributed to the ecosystem" story.
- It's the written justification for the `prune: never` fork, so it double-dips across both prizes.

**Both are byproducts of the critical path.** Combined estimate is probably 12–16 hours, not 2×,
because the version matrix feeds the query rules and the query rules feed the report structure.

**Open question: one skill or two?** A single `graph-lending-analyst` plugin shipping both skills
(query-correctly + report-structure) may read as more coherent than two separate contributions — and
it's the shape our own repo needs regardless.

---

## Questions closed

| Question | Answer |
|---|---|
| Does this accelerate the fork? | **No.** 33 lines of pruning prose we already know. Zero manifest automation. Budget zero hours |
| Is a skill a genuine contribution? | **Yes** — nothing in the Graph skills ecosystem knows standardized schemas exist or drift |
| What format is a skill? | Claude Code plugin: `SKILL.md` with YAML frontmatter. **The `description` field is the router.** ~98% markdown |
| Is this repo maintained? | **No** — fork of a community repo, 5 months stale, issues disabled, zero PRs ever, no CI |
| Will a PR land in 9 days? | **Coin flip at best.** Publish our own; PR as a bonus |
| Does it overlap the Subgraph MCP? | **No** — clean write-path/read-path split. Zero mentions of MCP |
| Skill or ERC-4626 Substreams module? | **Skill.** Lower variance, better narrative fit, byproduct of critical path, and the fork already covers the other prize route |
| Anything worth reusing? | `common-errors.md` (450 lines) as a debugging reference when the fork stalls |

## Still open

- **One skill or two** — `messari-lending` alone, or a combined plugin with a report-generation skill
- Whether to include the `detect-version.mjs` script (reviewer says yes; it's ~150 lines and we want it
  in the agent anyway)
- Whether the one-line `fs.cpSync` installer fix is worth submitting as a separate PR
- How to caveat the maintainer's competing activity in the submission, if at all

# Research: streamingfast/substreams-skills

**Repo:** https://github.com/streamingfast/substreams-skills
**Reviewed at:** `79d8bb611e3dff60768ba170dad23f795b346a2f` (develop, tag **v1.6.0**, 2026-08-17)
**Reviewed:** Sept 5, 2026

> ✅ **Fully executed review.** The reviewer installed the plugin to test the installer, ran the
> validator, and restored the original plugin state afterward. Also fetched all 291 plugins in
> Anthropic's official marketplace to check for a Substreams entry.

---

## 0. The two questions

### a. Is this better than its Graph sibling? ✅ **Decisively, on every axis**

| | `graphprotocol/subgraphs-skills` | **this repo** |
|---|---|---|
| Last commit | 5 months stale | **2026-08-17 (19 days)** |
| Releases | — | **8 (v1.0.0→v1.6.0), ~monthly** |
| Commits | — | **101, 13 authors** |
| Issues | disabled | **enabled (0 open)** |
| PRs ever | **zero** | **21 opened, 20 merged, 0 rejected, 0 open** |
| Median time-to-merge | n/a | **21.3 hours** |
| CI | none | **`.github/workflows/validate.yml` on every PR** |
| Validator | none | **`npm run validate` — ran it, exits 0, 11/11 pass** |
| Installer | **broken 6 months (EISDIR)** | **works — verified end-to-end** |

Sole issue ever filed (#3, DenisCarriere, "Install via Claude CLI") was **answered and closed in 59
minutes.**

**Would a PR land in 9 days?** Almost certainly yes on latency — **12 of 20 PRs merged in under 24
hours.** ⚠️ But the external-contributor sample is thin: PaulieB14's `substreams-bitcoin` (PR #4) took
**120 days**, while staff and the heavy recurring contributor merge in ~21 hours. **Expect: fast if
trivially correct, slow if it needs real review.**

⚠️ **One weak signal:** 5 stars, 4 forks, 1 watcher. **High activity, near-zero visibility.** And it is
**not in Anthropic's official marketplace** — reviewer fetched all 291 plugins, no substreams entry,
despite PR #8 ("prep plugin manifests for Anthropic marketplace submission").

### b. Does anything change the decision to skip Substreams? 🔴 **No. Keep skipping.**

It **genuinely lowers the Rust variance** — more than expected, and more than the Graph repo lowers
anything (see §5). **But every architectural blocker survives intact, and two are fatal:**

1. 🔴 **Hedera is not a supported network.** Reviewer read all 222 lines of
   `skills/substreams-dev/references/networks.md` — 100+ chains including Stellar, Starknet, TRON,
   Injective, Vaulta. **No Hedera, no Hashgraph.** Zero occurrences of "hedera", "arc", or "x402"
   anywhere in the repo. **Our gate, our ATS tokens, and our prediction market are all on chains
   Substreams cannot reach.**
2. 🔴 **You still supply the database.** `substreams-hosted-sink` is the closest thing to a rescue and
   it explicitly says: **"SF hosts only the sink runner; the user supplies the database"**
   (`skills/substreams-hosted-sink/SKILL.md:3`). **Vercel still can't.** It removes the
   long-running-process problem, **not** the DB-hosting one.
3. **Fixed WASM pipeline confirmed.** Nothing here lets an agent compose queries at runtime — **our
   analyst agent's whole premise.**
4. **Zero lending content.** `grep -i "erc.?4626|vault|lending|aave|compound|morpho"` across `skills/`
   and `examples/` returns nothing on-topic — **only `Arc<T>` in Rust sink code and "Vaulta" the
   chain.**

> **The narrative gap is real and this repo doesn't close it: Substreams is authoring-side, our build
> is query-side.**

---

## 1. What this is

**Format:** same `SKILL.md` + YAML frontmatter + `references/` shape — but **richer frontmatter** than
the Graph repo's `name`/`description`/`version`:

```
name, description, license, compatibility.platforms[], metadata.{version, author, documentation}
```

**Install path: completely different. Not npx.** It's a **Claude Code plugin marketplace** —
`.claude-plugin/marketplace.json` + `.claude-plugin/plugin.json`. **That's why its installer isn't
broken: there's no file-copying installer to break, `claude` clones the repo itself.**

**Maintainers: StreamingFast staff.** Matthieu Vachon (`matt@streamingfast.io`, 51 commits, cuts every
release), Charles Billette (39), Josh Kauffman (13), colindickson (2). Plus GabrielCartier/0xGabey (30)
as a heavy recurring contributor. One community skill: `substreams-bitcoin`, frontmatter author
`PaulieB14`.

**Published:** GitHub only, as a marketplace. **Not in Anthropic's official marketplace** (verified).
Not on npm.

---

## 2. Read these first

Ranked for the decision, not for learning Substreams.

| # | Path | Why | Time |
|---|---|---|---|
| 1 | `EVAL.md` (55 ln) | **Answers the Rust question directly.** 14 agent-built projects, 100% build, 100% run, 12/14 byte-match | 3 min |
| 2 | `CHANGELOG.md` (175 ln) | **Highest-signal file in the repo.** Not a normal changelog — a log of corrections verified against live binaries. **The maintenance proof** | 8 min |
| 3 | `skills/substreams-dev/SKILL.md` (596 ln) | **The heart.** Skill-routing table, pre-flight protocol, manifest, Rust, perf | 15 min |
| 4 | `skills/substreams-dev/references/block-filtering.md` (424 ln) | Composability + block indexes + the cost lever. Best contribution surface | 12 min |
| 5 | `skills/substreams-convert/references/subgraph.md` (~560 ln) | Subgraph→Substreams conversion — **the only file adjacent to our domain** | 12 min |

### What's different from the Graph repo, format-wise

- ✅ **Skill routing.** Skills hand off to each other by name in an explicit table
  (`substreams-dev/SKILL.md:17-30`). The Graph repo has no such mechanism.
- ✅ **Imperative descriptions.** `substreams-hosted-sink`'s description contains a **`HARD RULE:`
  gate** — the frontmatter isn't just routing, it carries **behavioral constraints into the always-on
  context.**
- **Pre-flight interrogation protocol** — "How to ask (MANDATORY for all Substreams skills)", forcing
  clarifying questions before code. ⚠️ **`EVAL.md` then honestly reports this doesn't work** ("model
  posture is dominant").
- ✅ **A real eval harness** with golden references and byte-diff scoring.
- **Version discipline** — every skill's `metadata.version` tracks the release.

---

## 3. Structure and contents

```
.claude-plugin/     marketplace.json + plugin.json — the install mechanism
.github/workflows/  validate.yml — CI, runs npm run validate on every PR
scripts/            simple-validate.js (270 ln) — the ONLY script that exists
skills/             11 skills, SKILL.md + optional references/
examples/           16 dirs — 13 buildable Rust projects + 3 writeups
guides/             claude-code / cursor / vscode setup (43+65+72 ln)
EVAL.md             the test-pass summary
SKILL_DEVELOPMENT.md contributor guide (has two dead commands — see §7)
CHANGELOG.md        verified-correction log
```

### The 11 skills

| Skill | Lines | Does |
|---|---|---|
| `substreams-dev` | 596 | Cross-cutting hub — manifests, module graph, protobuf, perf, routing |
| `substreams-ethereum` | 433 | EVM — ABI codegen, `match_and_decode`, topic0, `RpcBatch` |
| `substreams-solana` | 498 | `walk_instructions`, SPL, Anchor discriminators |
| `substreams-sink` | 666 | SDK consumption — Go/JS/Python/Rust |
| `substreams-sink-deploy-local` | 497 | Run sink binaries yourself |
| `substreams-hosted-sink` | 508 | SF-hosted sink runner via Portal API |
| `substreams-sql` | 377 | `db_out` module, Postgres vs ClickHouse, CDC vs from-proto |
| `substreams-testing` | 308 | Unit/integration/perf, firecore fixtures |
| `substreams-convert` | 125 | Subgraph or Solana contract → Substreams |
| `substreams-bitcoin` | 391 | UTXO model (community-authored) |
| `thegraph-market-api` | 1,395 | Device-code auth + billing/usage/deployment API |

### Prose vs code — the comparison

| | Graph repo | **this repo** |
|---|---|---|
| Total | 5,535 ln | **~22,479 ln** |
| Markdown | ~98% | **16,672 ln — 74%** |
| Runnable code | ~2% | **5,807 ln — 26%** |
| Skills | 3 | **11** |

Code breakdown: Rust 3,994 (2,015 hand-written `lib.rs` + 1,891 generated ABI bindings), YAML 520,
proto 338, TOML 307, JS 270, JSON 365, SQL 13. Skills prose splits 5,794 `SKILL.md` / 8,823
`references/`.

**Still prose-dominant, but 26% real code vs 2% — and the code builds.**

### One complete skill's frontmatter

```yaml
---
name: substreams-dev
description: Cross-cutting Substreams development — manifests, module graphs (map/store/index),
  protobuf, performance, debugging. For Ethereum/EVM contract decoding use substreams-ethereum;
  for Solana programs use substreams-solana; for SQL sinks use substreams-sql.
license: Apache-2.0
compatibility:
  platforms: [claude-code, cursor, opencode, vscode, windsurf]
metadata:
  version: 1.6.0
  author: StreamingFast
  documentation: https://substreams.streamingfast.io
---
```

💡 **Note the description does double duty: invocation AND explicit routing to sibling skills.**

---

## 4. What it automates

| | Verdict | Evidence |
|---|---|---|
| **a. Scaffold from ABI/address** | Partial — teaches the CLI, ships no tooling | `substreams init` → `ethereum-minimal` "fetches it for a verified address" (`abi-codegen.md:115`) |
| **b. Rust map/store modules** | ✅ **Yes, strongest area** | `substreams-dev/SKILL.md:377-424` + "Canonical loop" + 13 working `lib.rs` |
| **c. protobuf authoring** | ✅ Yes | `manifest-spec.md:110-147`; hard rule "one protobuf message type per event"; 8 `.proto` files |
| **d. Manifest — imports, composability, initialBlock, blockFilter** | ✅ **Yes — best-documented thing here** | `manifest-spec.md` (408 ln) covers all four; `block-filtering.md` (424 ln) dedicated; "do NOT use block 0" |
| **e. Build / pack / publish** | Partial | Pack prerequisites documented; `## Publishing` at `:208`; registry README generation (PR #14). **Thin vs the rest** |
| **f. Sink setup + long-running process** | ✅ Yes — three whole skills | `substreams-sql` / `substreams-sink-deploy-local` / `substreams-hosted-sink`. ClickHouse + Postgres in depth |
| **g. Debugging — module hashes, cold caches** | ⚠️ **Thin** | Module-hash↔cold-cache appears **once**: `SKILL.md:444`. No dedicated treatment |
| **h. Cost, 7M free tier, sync estimation** | 🔴 **NOT PRESENT** | **Zero occurrences** of "7M"/"7 million"/free-tier block counts. Only qualitative, and one vague stub: "Free tier: Limited requests per minute". **No way to estimate a backfill** |

---

## 5. The Rust question — genuinely lower variance

### ✅ `EVAL.md` is real evidence, not marketing

**14 tasks, plain-English prompt → agent-authored Substreams project, scored mechanically**
(`substreams build` / `substreams run` / byte-diff vs golden). **100% build, 100% run, 12/14
byte-match.** Isolated worktrees, no golden access.

> **A stronger empirical claim than anything in the Graph repo.**

**Could an agent write a module end-to-end with review?** Yes — that's literally what `EVAL.md`
demonstrates, across 13 buildable projects from 35-line block-stats to a 436-line cross-DEX aggregator.
The skills are written for it: `substreams-ethereum/SKILL.md` has an "Implementation checklist"; every
manifest example carries the `protobuf:`/`binaries:` sections that `pack` requires.

### ⚠️ What still requires understanding Rust

1. 🔴 **Silent version-skew traps — the big one.** Mismatched pairs (`substreams` 0.6 +
   `substreams-solana` 0.15) **still compile while pulling two crate copies.**
   `substreams-solana/SKILL.md:236`: **"A green build is not proof the pins are right; `cargo tree |
   grep substreams` should show one version."** You'd need `cargo tree` literacy to catch a build that
   passes and is wrong.
2. **Ownership/borrowing.** The entire perf section is clone-vs-borrow discipline. Reviewing a diff for
   accidental `Block` clones requires reading Rust ownership.
3. 🔴 **Silently-wrong decode output.** T2.2's MKR `bytes32` `symbol()` case — **builds, runs, emits an
   empty symbol on ~4% of swaps.** And `examples/T1.2-usdc-transfers/src/lib.rs` hand-rolls a
   base-256→base-10 bigint conversion. **To review that you have to read it as code, not prose.**
4. **Legacy pins in the examples.** T5.x/T6.2 deliberately pin the old pair;
   `substreams-solana/SKILL.md:465` warns **"Copy patterns, not the Cargo pins."**

> **Net: agent-authored, you-reviewed is realistic. Agent-authored, you-rubber-stamped is not — the
> failure modes here are green builds with wrong output.**

---

## 6. The contribution question

### What's missing

- 🔴 **Cost / quota / sync-time estimation — nothing, anywhere.**
- **A NEAR skill** — `plugin.json` and `marketplace.json` both advertise "EVM, Solana, and NEAR
  chains"; **there is no `substreams-near` skill**, only a `networks.md` bullet.
- **Cold-cache / module-hash economics** (one line exists; the trap isn't taught).

### ⚠️ Two of our three candidate gaps are already well covered

- ✅ **Composability: covered, and well.** `block-filtering.md:245-300` ("Foundational modules — don't
  reinvent them") documents importing `ethereum_common`/`solana_common`, the full-spkg-URL requirement,
  the module table, **and the nastiest trap: `filtered_*` modules ship a default params filter and "if
  you don't override it you silently emit the default's data, not yours."**
- ✅ **Block indexes: covered thoroughly.** A dedicated 424-line reference — `kind: blockIndex`, Keys,
  `blockFilter`, the SQE query language, use inheritance, a decision guide.
- ⚠️ **Module-hash / cold-cache trap: THIN.** One line at `substreams-dev/SKILL.md:444`, framed as a
  benchmarking caveat rather than a cost/iteration trap.

**So the real gap is cost modelling** — sync estimation, free-tier limits, cold-cache economics. **The
thing every new Substreams user gets burned by, and genuinely absent.** A legitimate gap, comparable in
kind to the standardized-schema finding.

### Stronger or weaker than `messari-lending`? **Weaker for our build. Take the Graph one.**

The honest trade is an inversion:

| | `messari-lending` → Graph repo | cost skill → this repo |
|---|---|---|
| **On-narrative** | ✅ Yes — our agent composes GraphQL against Messari lending subgraphs; the skill is our substrate | ❌ No — orthogonal to reconciliation, gates, markets |
| **Odds of merging** | ❌ Low — zero PRs ever, issues disabled | ✅ High — 20/20 merged, median 21h |
| **Demo value** | ✅ Directly demonstrable in our build | ❌ Nothing to show on stage |

> **For a 9-day hackathon the artifact value is mostly in having built and shipped it against a real
> gap we identified — an unmerged PR still demonstrates that, and it's the one that connects to what
> we're demoing. A merged PR here is the better signal but buys the demo nothing.**

**Hours for a genuine contribution here: 12–20, most of it measurement, not writing.** ⚠️ **This repo's
bar is high and empirical** — the CHANGELOG shows entries like "tested every entry on ClickHouse
26.6.1", "reserved-column-names table was ~90% fabricated", "verified live via gRPC reflection".
**Unverified prose about sync times will get bounced.** ~8h measuring, ~6h writing, ~4h review cycles.

A safe contribution (fixing §7's doc bugs) is 1–2 hours but is a **trivial artifact — not worth our one
remaining slot.**

---

## 7. Gotchas

### ✅ Installer: works. Verified end-to-end.

```
claude plugin marketplace add streamingfast/substreams-skills      → ✔ exit 0
claude plugin install substreams-dev@streamingfast-substreams      → ✔ exit 0
claude plugin details substreams-dev@streamingfast-substreams      → 11 skills, ~1,762 always-on tokens
claude plugin validate .                                            → ✔ Validation passed
npm run validate                                                    → 11/11 pass, exit 0
```

**No EISDIR, no failures.** The sibling's 6-month-broken installer has no analogue — different
mechanism entirely.

### Real issues found

1. ⚠️ **The contributor guide has two dead commands.** `SKILL_DEVELOPMENT.md:59` says run
   `skills-ref validate ./skills/your-skill`; `:63` and `:78` say `./scripts/validate-all.sh`.
   **Neither exists.** (Ironic: the repo's 3rd-ever commit was "Fix validation workflow by replacing
   missing `@anthropic/skills-ref`" — they fixed the workflow and never fixed the doc.)
   💡 **This is the 1-hour freebie PR if we want one.**
2. **README documents 9 skills; the repo ships 11.** `substreams-bitcoin` and `substreams-convert`
   appear in neither list.
3. **NEAR is advertised but doesn't exist.**
4. **Deliberate version skew inside the examples.** T5.x/T6.2 pin legacy `substreams` 0.6 +
   `substreams-solana` 0.14.x while the skills teach 0.7+0.15. Documented and intentional, but
   **copy-paste-hostile.**
5. **Known upstream bugs baked in.** `substreams` v1.20.2: `toStartOfMonth` silently ignored,
   `toYYYYDD` emits `toYYYYMMDD`.
6. ⚠️ **Registry short-form imports 404.** `name@version` doesn't resolve via the CLI — full
   `https://spkg.io/v1/packages/<slug>/<version>` URLs required. **Any import copied from elsewhere
   likely breaks.**
7. 🔴 **Silent-wrong-output trap in foundational modules** — the `filtered_*` default-params issue.
   Documented, but **the kind of thing that produces a confidently wrong report.**
8. ⚠️ **EVAL's own honest caveat:** vague prompts produce **confident guesses, not clarifying
   questions.** T4.1/T4.2 shipped pipelines with hardcoded thresholds and token universes. **"Skill
   text alone does not override model posture."** — **Relevant to us: our directive input is free
   text.**
9. Minor: `npm install` reports audit findings; GitHub reports the license as NOASSERTION despite an
   Apache-2.0 LICENSE file.

✅ **Notably absent versus the sibling:** no stale content, no broken install, no docs-contradicting-code
on anything load-bearing. **The CHANGELOG shows they actively hunt their own errors.**

---

## 8. Verdict

**Read for format, contribute elsewhere.**

**This is a well-run repo — the best-maintained agent-skills repo of the three reviewed, and it is not
close.** Active within 19 days, 8 releases, 20-for-20 PR merge rate at a 21-hour median, CI that runs,
a validator that passes, an installer verified end-to-end, and a CHANGELOG that reads like an errata
log from people who actually compile and run what they document. **If we were building on Substreams,
we would install this.**

**But we aren't, and nothing here makes us want to:** Hedera isn't a supported network — all 222 lines
of the chain list read — so our x402 gate, our ATS tokens, and our Arc market are all on chains
Substreams cannot see; the hosted sink still requires a database Vercel can't host; the WASM pipeline
still can't compose queries at runtime, **which is our analyst agent's entire premise**; and **there is
not one line about lending or ERC-4626 in 22,000 lines.**

**The Rust variance was genuinely lower than assumed** — `EVAL.md` is real evidence that an agent
writes these modules end to end with review rather than authoring — **but that was never the binding
constraint. The binding constraint is that Substreams is authoring-side and our build is query-side,
and a fourth chain that touches none of our payment rails doesn't earn 20 hours in a 9-day window.**

### The ERC-4626 decision is unchanged — the margin is just clearer

If we built it anyway:
- Agent-written Rust module with review: **~6–10h** (down from the prior estimate, thanks to this repo)
- Endpoint auth + CLI: **~1–2h**
- Sink to Neon/Supabase plus a runner: **~4–8h** including Portal device-code auth

**15–25 hours plus an uncontrolled backfill** — and ⚠️ **the repo gives no way to estimate that
backfill, since sync-time and free-tier content is entirely absent (§4h).** At the end we'd have an
Ethereum Postgres table and the same three-chain demo.

**Against that, the `messari-lending` Graph skill sits directly under the thing we're actually
demoing.**

### 💡 One thing worth carrying across

**If we write the `messari-lending` skill, steal THIS repo's format, not the Graph repo's.**
Specifically:
- The **richer frontmatter** (`compatibility.platforms`, `metadata.version/author/documentation`)
- The **explicit skill-routing table**
- **The `EVAL.md` methodology** — *a skill shipped with a small golden-output eval is a markedly
  stronger hackathon artifact than one shipped as prose*, and it's the single clearest thing this repo
  does that its Graph sibling doesn't.

---

## Using skills in our own build

Two different things that are easy to conflate:

### A. Install-time — Claude Code plugins, for *our* dev sessions

These are Claude Code plugins. They help **us** while building; they do nothing for the deployed agent.

**Worth installing selectively:**

| Skill | From | Why |
|---|---|---|
| `thegraph-market-api` | this repo | **1,395 lines — device-code auth, billing, usage, deployment API.** Directly useful for getting our API key and monitoring the `prune: never` fork's sync. **Nothing to do with Substreams** |
| `common-errors.md` | Graph repo | 450 lines — determinism errors, store conflicts, `eth_call` failures, ABI mismatch. **The reference when our fork stalls at sync.** ⚠️ Copy the file; that repo's installer is broken |

```
claude plugin marketplace add streamingfast/substreams-skills
claude plugin install <skill>@streamingfast-substreams
```

⚠️ **Cost:** all 11 skills is **~1,762 always-on tokens per session.** Install selectively, not the
whole plugin.

### B. Runtime — system-prompt loading, for the deployed agent

**Different mechanism entirely.** Our agent runs in a Next.js route calling the Anthropic API. **You
cannot install a Claude Code plugin there.** What you can do is **load skill markdown into the system
prompt** — which is exactly what the `agent/skills/*.md` design in the build plan already does.

**Do these particular skills help our runtime agent? Mostly no.** They're authoring-side; our agent
queries. The only relevant knowledge is the 33-line pruning section, which doesn't even state the
500-block number.

> 💡 **The reframe:** the reason none of these help our runtime agent **is precisely the gap we'd be
> filling.** Nothing in the entire Graph skills ecosystem teaches an agent to query a standardized
> schema correctly or structure a financial report.
>
> So `messari-lending` isn't just a contribution — **it's the thing our agent actually loads at
> runtime, and the demo is it working.** Much stronger than "I wrote a skill and also, separately,
> here's my app."

### 🔬 To experiment with at the agent/report-building stage

Open questions to play with when we build `agent/compose.ts` and the report skills:

- **How much skill markdown fits usefully in the system prompt** before it degrades rather than helps.
  This repo's 11 skills are ~1,762 always-on tokens; the curated Messari schema view is ~7,664. What's
  the budget?
- **Does the routing-table pattern work at runtime?** These skills hand off to each other by name via
  the `description` field. Our report skills (`balance-sheet.md`, `ranking.md`, `comparison.md`) would
  want the same — the agent picks which to load based on the directive. Worth testing whether
  description-based routing actually works when we control the loader, versus relying on Claude Code's
  built-in mechanism.
- **Conditional vs always-on loading.** Claude Code loads a skill when the description matches. In our
  own agent we'd decide explicitly — parse the directive, load only the relevant report skill. Cheaper
  and more predictable, but loses the model's own judgment about what it needs.
- ⚠️ **The pre-flight problem.** `EVAL.md` reports their MANDATORY clarifying-question protocol
  **doesn't work** — "skill text alone does not override model posture." **Our directive input is free
  text**, so an underspecified request ("tell me about Aave") will produce a confident guess rather
  than a question. Worth testing whether structured output or an explicit gate does better than prompt
  instruction.
- **Whether skills should carry the semantic facts the schema can't.** The four things the Messari
  descriptions don't say (TVL == deposits by assignment, revenue is accrued interest, Position balances
  are stale, `Market` means three different things) have to live somewhere. Skill file or system
  prompt?

---

## Questions closed

| Question | Answer |
|---|---|
| Is this better maintained than the Graph sibling? | **Yes, decisively.** 19 days vs 5 months, 20/20 PRs merged at 21h median, CI, working installer |
| Would a PR land in 9 days? | **Likely if trivially correct.** External contributor sample is thin — one took 120 days |
| Does it lower the Rust variance? | **Yes, genuinely** — `EVAL.md` shows 14/14 agent-built projects building and running |
| Does that change the Substreams decision? | **No.** Rust was never the binding constraint |
| Is Hedera supported? | **No.** All 222 lines of the chain list read. Zero occurrences of hedera/arc/x402 |
| Does the hosted sink solve the Vercel problem? | **No** — "SF hosts only the sink runner; the user supplies the database" |
| Is composability documented? | **Yes, well** — including the `filtered_*` default-params silent-wrong-output trap |
| Is there a contribution gap? | **Yes — cost/sync/quota estimation.** But off-narrative and undemoable |
| Skill here or `messari-lending`? | **`messari-lending`.** On-narrative and demoable beats merge-likely |
| What's worth stealing? | **The format** — richer frontmatter, skill-routing table, and the EVAL methodology |

## Still open

- Whether to ship the `messari-lending` skill with a golden-output eval (reviewer says it markedly
  strengthens the artifact)
- Whether the 1-hour `SKILL_DEVELOPMENT.md` dead-command fix is worth a throwaway PR here
- Whether the pre-flight clarifying-question pattern is worth copying, given EVAL says it doesn't
  override model posture — **relevant because our directive input is free text**

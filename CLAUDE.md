# CLAUDE.md

Notes for working in this repo. Read at the start of every session.

---

## Stop and ask before building

**If you're about to make a decision about how something should *work*, stop and ask.**

Not implementation detail — you should just make those calls. The line is whether getting it wrong
means **rewriting** or just **renaming**.

**Ask about things like:**

- How the agent is supposed to interact with a system — does it compose GraphQL itself, or select from
  pre-written documents? Very different builds.
- What a component is actually for. What's the goal of the query layer? What does "reconciliation"
  mean here?
- Which of two approaches the plan intends, when it could be read either way.
- Anything where you'd otherwise write "I assumed X."
- Anything that touches money, keys, or what gets committed on-chain.

**Just decide these yourself:**

- Naming. Files, variables, functions.
- Internal structure of a function.
- Whether something is a helper or inline.
- Error message wording, log formatting.

**The test:** if the answer changes the shape of the thing, ask. If it changes the label on the thing,
decide.

**When you ask:** say it in chat and wait. Don't write the question down, don't build a placeholder,
don't build both versions. Just stop. An unanswered question is cheaper than the wrong build.

---

## Build only what was asked

Each unit names specific files. Touch those files.

If you think another file is needed — a helper, a type, a config entry — **say so and wait.** Don't
write it. Half the reason units stay small is that nothing arrives uninvited.

---

## Commits are small on purpose

One commit is one thing a human can read in a sitting, and one thing that works.

This isn't a style preference. ETHGlobal's rules say large single commits or missing history may
disqualify a submission. Small commits are a requirement.

If a file is heading past ~120 lines of real logic, say so **before** writing it, not after.

---

## Dependencies are decisions

Ask before adding a package. Every one is a thing we have to justify, maintain, and fit inside a
serverless function.

---

## Tracking

**`tracking/logs.md`** — append after each run of work. Two or three sentences, plain English: what you
made, why, and anything that surprised you. Written so someone who hasn't seen the code understands
what happened. This doubles as our AI-attribution record, which the hackathon requires.

**`tracking/lessons.md`** — append only when reality disagreed with the plan. What we expected, what
happened, what changes. If a lesson invalidates something in the plan, say so explicitly.

**`tracking/DECISIONS.md`** — append when a choice is made that would mean *rewriting* to undo, not
renaming. The same line this file draws for what to stop and ask about. One section per decision:
date, what we're doing, why (including what we're giving up), the alternative rejected, and which
plan section or component it affects. If a decision contradicts the plan, amend the plan in the same
commit and say so on the `Affects` line.

None of these files is where questions go. Questions go in chat.

---

## The plan

`PLAN-v4-alpha-markets.md` is the spec.

The plan is law — but law gets amended when reality disagrees. If you find a contradiction, raise it
rather than picking an interpretation.

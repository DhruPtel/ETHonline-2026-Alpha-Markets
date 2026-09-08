# Architecture

One page, end to end. Read this before opening a directory; each subsystem then has its own README.

A plain-English directive goes in. A hashed, verifiable report comes out. Between them are **two
model calls and nothing else that is not deterministic.**

```mermaid
flowchart LR
  D(["directive<br/><i>plain English</i>"]) --> C["compose<br/>🧠 1 model call"]
  C --> P(["ReportPlan<br/><i>deployments · documents · headline</i>"])
  P --> E["execute<br/>⚙️ no model call"]
  G[("The Graph<br/>25 live deployments")] --> E
  CH[("Ethereum<br/>archive RPC")] --> E
  E --> DR(["DraftReport<br/><i>facts · checks · verdict · provenance</i>"])
  DR --> N["narrate<br/>🧠 1 model call"]
  N --> R(["Report<br/><i>+ table + paragraph</i>"])
  R --> H["reportHash<br/>32 bytes"]
  R --> RE["render<br/>markdown"]
```

## The four stages

| stage | in → out | model calls | what it decides |
|---|---|---|---|
| **compose** | directive → `ReportPlan` | 1 | which deployments, which documents, which metric the report is about. Reads no data |
| **execute** | plan → `DraftReport` | 0 | one block the whole set can share, then fetch, check, assemble. Can refuse, block, or run out of budget |
| **narrate** | draft → `Report` | 1 | the table's shape and the paragraph. Cannot write a number |
| **render** | report → markdown | 0 | substitutes `{fact:ID}` placeholders with values. One view of the object, not the report |

## The three guarantees, and where each lives

**Numbers enter once.** Every figure comes through `graph/client.ts` and nothing caches, so a figure
in a report traces to a query that actually happened. `graph/adapter.ts` then annotates what cannot
be trusted and **never adjusts it** — a wrong number stays wrong with a finding attached, because an
adjusted figure is one nobody can trace.

**No model ever types a digit.** The narrator is handed a fact table and can only reference it as
`{fact:ID}`; code substitutes the values. That is why an invented figure is unrepresentable rather
than unlikely. (The validator that enforces it on the prose is the one unbuilt unit.)

**The report is an object; the hash is over the object.** Markdown, a file, HTML — all renderings,
all must hash identically. `domain/canonical.ts` produces the 32 bytes that get committed on Hedera
in the ATS token and passed to Arc, which is what lets two chains refer to the same report.

## What is not built

Phases 3 and 4 — tokenising a report, selling it over x402, and settling a prediction market on it.
Nothing is deployed and there is no web app; everything runs from the command line against live
networks.

## Where to go next

| you want | read |
|---|---|
| the report shape another analyst must target | `src/types/README.md` → `report.ts` |
| how data is fetched and trusted | `src/graph/README.md` |
| how a verdict is decided | `src/engine/README.md` |
| the pipeline itself | `src/agent/README.md` |
| what to run | `scripts/README.md` |
| why a decision was made | `tracking/DECISIONS.md`, `tracking/lessons.md` |

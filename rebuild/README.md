# rebuild — the frontend handoff note

**Not code.** One tracked file: `MANIFEST.md`.

The first version of the pages and components under `app/` was produced in a separate workspace,
built from the design in `single-frontend/`, and then copied into this repo. Pages added later, such
as `/analyst`, did not come from it. `MANIFEST.md` is that workspace's handoff note:

| section | what it records |
|---|---|
| 1 · Files to copy | the pages, components and hook that arrived |
| 2 · What this replaces | what the copy made unused in the tree it was written for |
| 3 · Build settings | the path alias and CSS assumptions it made |
| 4 · Build verification | what was checked in that workspace, and a blocker in that workspace's own build config |
| 5 · Contract compliance | the rules the frontend was held to — no API routes, no new dependencies, one stylesheet |
| 6 · Stubbed handlers | the buttons left unwired, which Phase 6 wired (`tracking/phases/PHASE-6.md`) |
| 7–10 | where its demo data came from, the six sample markets, stylesheet notes, known gaps |

## Why it is still here

It records what came into this repo from outside its own sessions, and what was checked before it
did. That makes it part of the attribution trail. Nothing imports it and nothing builds from it.

## Reading it today

- **Paths are offset.** The manifest's `components/` and `hooks/` landed as `app/components/` and
  `app/hooks/`.
- **It describes the pre-wiring state.** Its stubs, demo data and six sample markets were replaced
  by live data in Phase 6 and later.

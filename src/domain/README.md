# domain — what a report *is*

One file. `canonical.ts` turns a `Report` into RFC 8785 canonical JSON and hashes it with SHA-256.
Those 32 bytes are the report's only identity:

| where | the hash appears as |
|---|---|
| Neon | `reports.hash`, the primary key (`src/store/`) |
| Hedera | `alpha:<hash>` in the ATS token's creation event (`src/tokenize/`) |
| Arc | `reportHash` in `commitPrediction` (`src/arc/`) |

**Nothing bridges the two chains.** Hedera and Arc refer to the same report because both carry the
same 32 bytes, and anyone holding the report can recompute them.

## Rules

- **Exactly one canonicalizer.** If our hasher and a verifier's differ by one byte, nobody can say
  which report a token or a claim refers to. The path is proved against RFC 8785's reference
  vectors, including the IEEE-754 number samples in its Appendix B (`scripts/smoke/01-canonicalize.ts`).
- **Lifecycle fields are stripped before hashing.** `atsTokenAddress` cannot be inside the hash
  that the token's own creation event carries. The denylist and its type are checked against each
  other at compile time.
- **Everything else is inside the hash, including the narration.** Change one word and it is a
  different report. That is why `src/store/` holds the only copy.

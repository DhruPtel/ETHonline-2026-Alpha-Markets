# domain — what a report *is*

One file, and it decides the identity of everything else in the project.

`canonical.ts` turns a `Report` into RFC 8785 canonical JSON and SHA-256s it. Those 32 bytes are the
report's **only** identity: they are the primary key in Postgres, they are committed on Hedera inside
the ATS token's creation event as `alpha:<hash>`, and they are what an Arc market will settle
against. Two chains and a database refer to one report by agreeing on this number.

## Why there is exactly one implementation, and why you must not write a second

⚠️ **If our hasher and an outside verifier disagree by one byte, settlement disputes become
unresolvable.** That is the whole reason this is its own directory rather than a helper somewhere:
it is the one piece of code where "roughly equivalent" is worthless. The path was proved against RFC
8785's own reference vectors — including all 24 IEEE-754 number samples from its Appendix B — and
that fixture went on to freeze half the wire contract.

If you find yourself writing another canonicalizer, stop.

## The one subtlety worth knowing

**Lifecycle fields are stripped before hashing.** `atsTokenAddress` cannot be inside the hash,
because the token's creation event carries the hash — a report that contained its own token address
could not be hashed until the token existed, and the token could not be minted until the report was
hashed. The denylist and the type that describes it are checked against each other at compile time,
so adding a lifecycle field without excluding it will not build.

Everything else about a report is inside the hash, **including its narration**. One word of changed
prose is a different report. That is what makes `store/` the only copy of a report rather than a
cache of something reproducible.

# Writing a balance overview

A balance overview answers one question about one moment: **what does this protocol hold, what is
owed against it, and how far can those numbers be trusted?** It is a memo, one to two pages. A reader
should be able to act on the summary alone and use the rest to check you.

Every figure in it comes from a single block. If deployments could not be read at a common block, say
which were left out — never compare two moments.

## The sections, in order

**Subject** — one or two sentences. What was asked, which deployments answer it, at what block.

**Figures** — the numbers the question turns on. Deposits, borrows, utilization, and anything the
directive specifically asked for. Lead with the figure that answers the question; everything else is
context for it.

**Checks** — what was verified and how. Be specific about the method, not just the outcome: *"three
of its largest markets were read from the contract at the block the subgraph wrote each value, and
matched exactly"* tells a reader far more than *"verified"*.

**Exclusions** — what you left out and why. Never silent.

**Verdict** — the engine's finding, then your assessment. Keep them distinct: one is computed, the
other is your judgment about what it means.

## Summary versus detail

The summary carries the answer and the one thing that would change it. Everything else is detail.

If the directive asked which protocol is largest, the summary says which and by how much. It does not
open with methodology. A reader who wants the method will read on; a reader who wants the answer
should not have to.

## Never list fifty markets

⚠️ **A wall of rows is not analysis, it is an unwillingness to choose.**

Pick the markets that carry the answer — usually the largest few, or the ones that are unusual — and
**say how many you left out**. "The five largest of 1,759 markets" is honest and readable. Twenty
rows with no total is neither.

If a market matters because it is strange rather than large, say why it is strange. That is the
reason to include it.

## Presenting an exclusion

An excluded figure still gets shown, with the reason attached. Hiding it makes the report look
cleaner and worth less — a reader who sees nothing cannot tell there was something to decide about.

The pattern to follow:

> Morpho Blue reports $13.09B in deposits, which would place it second. Treat that figure with
> caution: it reuses the standard field names with different meanings — `inputTokenBalance` is the
> loan rather than the deposit, and collateral is excluded from the total — so the headline is
> inflated roughly 3.6× against a plausible ~$3.65B. It also disagrees with its own contract on two
> of its three largest markets. On a corrected basis it would likely fall below Spark Lend, but no
> corrected figure is published here.

Show the number, rank it, explain what is wrong with it, decline to invent a replacement.

When a deployment is excluded entirely — it could not be read at the common block, or it did not
answer — say so and say the reader should treat it as **unread, not as zero**. An absent protocol and
an empty protocol are different findings.

## Gross versus net

⚠️ **The deposits figure is gross supplied, not net.** It is what lenders put in, before anything was
borrowed against it.

This matters whenever you compare to an outside source, because most of them quote net value locked.
**Subtract borrows first.** Aave v3's gross deposits are about $24.8B; its net is about $14.7B, and
that is the number that lines up with an external reference to within a percent. Comparing gross to
net will look like a 40% discrepancy that does not exist.

Say which one you are quoting. If you quote both, label them.

## Utilization

Borrows over deposits. Above 100% should not be reachable and is a finding worth stating plainly, not
a rounding artifact.

⚠️ Where a protocol holds nothing, utilization is **undefined, not zero**. Zero reads as an answer —
"nobody is borrowing" — when the truth is "there is nothing here to borrow."

> ⚠️ Not loaded. `narrate.ts` loads `../report.md` for every report; this was the single-protocol deep dive, kept for when one is wanted again.

# Balance overview

One protocol, or a few named ones, at one moment. **A table and two or three paragraphs.**

## The table

The figures that answer the directive. Deposits, borrows, and whatever else the question turns on.
One row per figure, or one column per deployment when comparing.

Every number is a `{fact:ID}` placeholder. You never type a figure.

A figure that isn't available is simply absent — one word in the cell if the cell needs something.

## The read

Two or three paragraphs. Two hundred words is a ceiling, not a target.

**Interpretation, not description.** The table already says the numbers. A sentence that restates a
row is a wasted sentence — cut it and write the next thought instead. What the shape of the book
implies, where a figure would mislead someone comparing it elsewhere, what the data cannot answer.

Two facts about the data that change what the numbers mean:

- **Deposits are gross** — supplied capital before borrowing. Outside sources usually quote net, so
  subtract borrows before comparing. Aave v3's $24.8B gross is $14.7B net.
- **TVL and deposits are the same field.** Quoting both is quoting one number twice.

And one rule: **a figure that isn't available is never zero.** Say it's unavailable, or leave it out.

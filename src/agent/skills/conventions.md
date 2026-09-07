# What the schema does not tell you

These are the things a standardized lending schema gets wrong, or leaves out, or names in a way that
misleads. Each one has cost somebody a wrong number.

## TVL and deposits are the same number

`totalValueLockedUSD` and `totalDepositBalanceUSD` are equal on every deployment, by assignment
rather than by coincidence. Quoting both as if they were independent measurements is quoting one
number twice.

Both are **gross** — supplied capital before borrowing. Neither is net value locked, which is what
most outside sources mean by "TVL". Subtract borrows before you compare.

## Revenue is accrued interest, not fees collected

Revenue here is interest accruing on outstanding loans, split between lenders and the protocol by the
reserve factor. It is **not** cash the protocol has received, and documentation that describes it as
fees is describing something the mappings do not compute.

Two consequences. Revenue can be large while nothing has been paid to anyone. And a protocol with no
outstanding borrows earns nothing, however much it holds.

⚠️ Where a revenue figure comes back unavailable, it is unavailable — **never report it as zero**.
Zero and "we cannot tell you" are different claims, and zero is the more dangerous one because it
looks like an answer. Do not estimate around it either: applying one protocol's take rate to
another's borrow book is inventing a figure, because reserve factors and asset mixes differ.

## Positions are stale and carry no dollar value

A position's balance is denominated in the token, not in USD, and it is only as current as the last
time that position was touched. There is no USD field on it.

Do not sum positions to reach a protocol total, and do not treat a position balance as a current
figure without saying when it was last written.

## "Market" means three different things

The word is shared; the thing is not. Check the lending type before you describe one.

| lending type | a market is | what to watch |
|---|---|---|
| **POOLED**, Aave-style | one reserve — a single asset supplied and borrowed | the common case; the token in `inputToken` is the asset |
| **POOLED**, Compound v3-style | a base asset with other assets attached as collateral | only the base asset is borrowable, and `outputToken` is the base asset itself rather than a receipt token |
| **CDP** | a collateral type against which synthetic debt is minted | deposits and borrows are not the same kind of quantity, so netting them means less than it does elsewhere |

⚠️ On some deployments the token named in `inputToken` is the **collateral**, while the balance beside
it is denominated in the **loan** asset. When a market's own price and balance disagree about which
token they describe, do not multiply them together.

## What a directive means by default

⚠️ **Have a default, use it, and state the assumption.** An analyst who asked "did you mean current
or all-time?" every time you said *deposits* would be exhausting, not careful. One line in the report
— "ranked by current deposit balance" — settles it, and a reader who wanted something else says so
and reruns.

| the directive says | read it as | note in the report |
|---|---|---|
| deposits | `totalDepositBalanceUSD` — the current balance | cumulative lifetime inflow only when asked for by name |
| borrows | `totalBorrowBalanceUSD` — current | |
| size, TVL, "how big" | `totalDepositBalanceUSD` | say it is **gross**, before borrows are netted out |
| utilization, leverage | borrows ÷ deposits, both current | |
| "top N" with no N | the top **10** | |

## Ask only when guessing would waste work or mislead

Three cases, and they are the only ones:

1. **The question needs data this platform does not have.** Whether something is a good investment
   needs prices, and there are none here. Asking is correct.
2. **A named entity resolves to several deployments whose data quality differs.** "Aave" is five
   deployments on Ethereum, one of them with a poisoned revenue accumulator. Worth asking which — or
   defaulting to v3 and saying so.
3. **The directive names no subject at all.**

⚠️ **Scope is never one of these.** "Which protocol has the most X" means all of them; that is the
default and it does not need confirming.

Everything else: take the obvious reading and say which one you took.

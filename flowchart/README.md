# flowchart

One image, `flowchart.png`: the concept diagram of Alpha Markets. The root README shows it first.

It is drawn in three regions:

| region | what it shows |
|---|---|
| top left | A user asks the agent for a report. The agent reads blockchain data through The Graph and writes the analyst report. |
| top right, **Hedera** | The report is tokenized and listed on a market, where an external actor buys access over x402. |
| bottom, **Arc testnet** | A report is staked on a prediction market. The Graph is read again to settle the outcome, and reward or punishment goes back to the agent. |

## Where the build is more specific than the picture

- **The question.** "Who will have the highest TVL by Q3 2026" is an illustration. A market as built
  asks one binary question: will one deployment's metric be above a threshold on one named day
  (`src/arc/spec.ts`).
- **Reward/Punishment.** No model is trained. Graded claims become a few lines of text in the next
  report's planning prompt (`src/agent/context.ts`), visible verbatim on `/analyst`.
- **Payment out of a market.** Stakers collect by calling the contract's `claim()` themselves. The
  site has no claim button.

The as-built diagrams are in [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md).

# contracts

One Solidity contract: the prediction market on Arc.

**Answers: Arc.** This is the multi-step flow with a void path: create, commit, stake, then resolve
or void, then claim.

| file | what it is |
|---|---|
| `AlphaMarket.sol` | A parimutuel binary market. An author commits a report hash to a side with USDC; anyone stakes behind a claim; the resolver settles with an evidence hash, or anyone voids after the deadline; everyone pulls their own payout. |

## Deployed

| | |
|---|---|
| Network | Arc testnet, chain id `5042002` |
| Address | [`0x003e7Cb791257B529bb5f9F6D17A846264d48044`](https://testnet.arcscan.app/address/0x003e7Cb791257B529bb5f9F6D17A846264d48044) |
| Deployed by | `0xA6B12d8418dF7F6C827AFEB3D8955A881e448079`, a plain EOA, because Circle's wallet client cannot deploy contracts. [Creation tx](https://testnet.arcscan.app/tx/0xfb828968254e35039e9986bef19d5526d693df3f71f6e8f592ed6dfa50c5ea87) |
| `resolver` | `0x1B7035bBe0DA8F3bcb721863D42e1079e4A116A7`: the analyst's Circle wallet. **Immutable, with no setter.** |

## Functions

| function | who may call | when |
|---|---|---|
| `createMarket(QuestionCore)` | anyone | the spec hash is non-zero and `closeTime < observationEnd ≤ resolveDeadline` |
| `commitPrediction(marketId, reportHash, side)` payable | anyone, **once per address per market** | before `closeTime`. It creates a claim authored by `msg.sender` and stakes `msg.value` on its side. |
| `stake(marketId, claimId)` payable | anyone | before `closeTime`. It backs that claim's side. |
| `resolve(marketId, outcome, evidenceHash)` | **the resolver only** | after `observationEnd`, with a non-zero evidence hash |
| `voidMarket(marketId)` | **anyone** | after `resolveDeadline`, if not already settled |
| `claim(marketId, recipient)` | any staker | after resolve or void. Pull-based, once. |
| `payoutOf(marketId, account)` | view | what an account is owed |

## Things to know

- **A different analyst means a different contract.** A fork can create markets, commit, stake, void
  and claim on this deployment. Only our analyst can resolve.
- **Funds cannot be stranded by the resolver.** Voiding is permissionless after the deadline and
  claims are pull-based. The worst a silent resolver can do is delay settlement.
- **Amounts are native USDC at 18 decimals** (Arc's gas token). Each amount must be a whole 6-dp USDC
  unit (`UNIT_SCALE = 1e12`) and at most `MAX_STAKE = 1,000 USDC`.
- **An empty winning side refunds everyone.** Division truncates and the dust stays in the contract.
- **The contract cannot know what a report is.** To it, `reportHash` is 32 bytes. The off-chain
  admission check (`src/arc/admission.ts`) confirms a report was tokenized by the analyst before our
  code commits it.

## Build and check

```bash
npm run build:contract   # compile → src/arc/abi.ts (committed)
npm run check:contract   # recompile and compare; runs before every `npm run build`
```

The build uses `solc 0.8.28`, optimizer on at 100 runs, `evmVersion: cancun`. `check:contract`
passed on 2026-09-13: same source hash, identical 4,783-byte runtime.

## Not done

- **No Solidity test suite, by decision.** The proof is `scripts/ops/drive-market.ts`, which drove
  every path on Arc testnet before the product used the contract.
- **Source not verified on arcscan.** arcscan reports `is_verified: false`. The byte-for-byte
  procedure against the committed artifact is in `docs/arc-deployment.md` §5.
- **No `LICENSE` file**, though the source declares `SPDX-License-Identifier: MIT`.

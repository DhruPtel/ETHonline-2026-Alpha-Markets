# SM-09 — a human signs on Arc from a browser wallet

**Manual.** There is no script. `tsx` cannot drive a wallet extension, so this is walked by hand and
the results are written into `tracking/smoke-results.md` like any other smoke test.

**Wallet: OKX.** MetaMask is the fallback, and only the fallback — it allows any custom chain, which
is exactly why it proves less. If OKX accepts Arc then any wallet will.

---

## What this proves, and what it does not

**Proves:** a person with an ordinary browser wallet can add Arc testnet, hold its native USDC, and
sign a transaction that lands. Everything in PLAN-v4 §13's "a stranger can browse, read previews,
**stake from MetaMask on Arc**, and watch a resolution" rests on that being true, and none of it is
worth building until it is.

⚠️ **Does not discharge §8's SM-09.** That row reads "MetaMask + `wallet_addEthereumChain` + a stake,
**under `next build`**" — a production Next.js build, because dev-mode bundling hides ESM
directory-import failures. There is no app yet. **This checklist is the wallet half only.** The
`next build` half stays open and belongs with Phase 4's staking page; SM-09 is not fully passed until
both have run. Record this run as a partial.

---

## Before you start

- OKX Wallet installed in the browser, with a wallet you are willing to use on a testnet.
- Nothing from `.env`. This test reads no credentials.
- ~10 minutes.

---

## 1 · Add Arc testnet to OKX

Custom network, entered by hand:

| field | value |
|---|---|
| Network name | `Arc Testnet` |
| RPC URL | `https://rpc.testnet.arc.network` |
| Chain ID | `5042002` — hex `0x4cef52` |
| Currency symbol | `USDC` |
| Decimals | **18** |
| Block explorer | `https://testnet.arcscan.app` |

⚠️ **The two unusual things, and the reason this step is worth doing at all.**

1. **The native gas token is a stablecoin.** Not ETH, not a testnet token with a silly name — USDC.
   Some wallets assume the native currency of an EVM chain is ether-like and will happily show a $
   value computed against the wrong asset, or refuse a symbol they already associate with an ERC-20.
2. **18 decimals, on a token everyone knows as 6.** SM-08 measured this: native value on Arc is 18dp
   while the ERC-20 view at `0x3600…0000` reports `decimals() = 6`, and both are correct for their
   own interface. A wallet that gets this wrong is off by a factor of a trillion, in either
   direction, and the number will still look plausible.

**Write down** whether OKX accepted the chain, and exactly what it did with the symbol and decimals.

> ⛔ **If OKX refuses to add the chain, stop here.** Do not switch to MetaMask and carry on as though
> the test passed — the refusal *is* the result, and it changes what Phase 4's UI can target. Record
> the refusal and what OKX said, then decide separately whether MetaMask becomes the documented
> wallet. Falling back quietly would hide the one thing this step exists to find out.

---

## 2 · Fund the account

<https://faucet.circle.com> → **Arc Testnet** → paste the OKX address → request USDC.

⚠️ **Use the web form, not the API.** SM-08 established that Circle rate-limits
`requestTestnetTokens()` on the API endpoint independently of the faucet itself:
the API returned `429 / code 5` for ~35 minutes while the web form funded the same address
immediately. Two front doors, two limits.

⚠️ **Check the address you paste.** In SM-08 the first grant went to the wrong one of two addresses
sitting in `.env` and read as a faucet failure for several minutes. Paste the OKX address, and
confirm afterwards that OKX's balance actually moved rather than assuming it did.

**Write down** how the balance renders once it lands. A 20 USDC grant arrives as
`20000000000000000000` base units. Does OKX show `20 USDC`, or `20000000000000` USDC, or `0.00002`,
or something else? **This is the finding most likely to affect the UI**: if a mainstream wallet
mis-renders an Arc balance, every staking screen needs to explain the number rather than just print
it.

---

## 3 · Sign a transaction

**The point is a browser wallet signing and broadcasting on Arc** — nothing more exotic.

### Preferred: call `ping()` on SM-08's receiver

Exercises the same payable path a stake will use — value attached to a contract call, author derived
from `msg.sender`.

| field | value |
|---|---|
| To | `0x5d72aDC37C90CA8A493dC8fD06986544ffCf8CfE` |
| Amount | something small and non-round, e.g. `0.25` |
| Hex data | `0x5c36b186` |

`0x5c36b186` is the selector for `ping()`. The contract is verified live: it holds `2500000000000000000`
(2.5 USDC) from SM-08's run and its dispatcher answers that selector.

If OKX will not let you attach hex data to a send — many wallets hide this in an "advanced" panel and
some remove it entirely — **that itself is worth writing down**, because Phase 4's UI will be asking
the wallet to do exactly this via `eth_sendTransaction`. A wallet refusing hand-entered data is not
the same as refusing programmatic data, so note which one you hit.

### Acceptable substitute: a plain transfer

Send a small amount of USDC to the same address with no data. It still proves signing and
broadcasting on Arc; it just does not exercise the payable-call path. Say which one you did.

**Write down** the amount you entered and what OKX said it was sending — this is the 18-decimal
question again, from the user's side. Entering `0.25` should produce `msg.value == 250000000000000000`.

---

## 4 · Confirm on arcscan

`https://testnet.arcscan.app/tx/<hash>`

Check:

- [ ] status is success
- [ ] `from` is your OKX address
- [ ] `to` is the receiver
- [ ] the **value** field reads as you intended — `0.25` should be `250000000000000000` base units
- [ ] if you called `ping()`, there are **two** logs: a `Transfer` from `0xffff…fffe` and a
      `Received` from the receiver. SM-08 found Arc mirrors every native value movement as a
      synthetic ERC-20 `Transfer`, so seeing only one log means the call did not reach `ping()`.

---

## What to record

Copy this block into `tracking/smoke-results.md` filled in.

```
Wallet + version      OKX ______________________
Chain accepted        yes / NO — if no, what it said: ______________________
Symbol shown as       ______________________
Decimals honoured     yes / no — balance of 20 USDC rendered as: ______________________
Funded via            faucet.circle.com web form
Transaction type      ping() with data / plain transfer
Amount entered        ______________________
msg.value on chain    ______________________
Transaction hash      0x____________________________________________________________
arcscan               https://testnet.arcscan.app/tx/<hash>
Friction a real user would hit:
  - ______________________________________________________________________
  - ______________________________________________________________________
```

---

## Stop conditions

Any of these ends the run — record it and stop rather than working around it:

- **OKX refuses the custom chain.** Changes what Phase 4 targets. Decide on MetaMask deliberately,
  as its own call, not as a silent fallback mid-checklist.
- **The faucet delivers nothing to the OKX address.** Confirm the address first; if it is right,
  this is the SM-08 faucet problem again and belongs in the record.
- **OKX renders the balance wrongly.** Not a stop in itself — keep going and finish — but it is the
  most consequential thing this checklist can find, because it lands in front of every user.

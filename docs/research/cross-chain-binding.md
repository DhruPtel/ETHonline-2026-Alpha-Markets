# Binding a Hedera report token to an Arc stake

*What is actually available, at each level. 2026-09-09.*

⚠️ **The question is not "can Arc read Hedera".** It cannot, that is understood, and saying so is not
an answer. The question is **what gives a stake a verified tie to a specific analyst's specific
tokenized report, and what a third party who does not trust us can check.**

---

## 1 · What is already true, and it is more than it looks

**Two public chains already carry the same 32 bytes**, and neither fact depends on us:

| chain | the fact | who can verify it |
|---|---|---|
| Hedera testnet | a ResolverProxy exists whose `EquityDeployed` event carries `additionalSecurityData.info = "alpha:<hash>"` | ⚠️ **anyone.** Public chain, public event, and the proxy is Sourcify-verified (`exact_match`, H2.3) |
| Arc testnet | address `A` called `commitPrediction(marketId, <hash>, side)` and staked USDC | ⚠️ **anyone.** Public chain, public calldata |

**So the report hash is already the binding, and it is already third-party checkable in both places.**
`domain/canonical.ts` says as much: *"This hash is the one thing that crosses between chains… Anyone
can check that both refer to the same bytes."*

⚠️ **Exactly one link in the chain is not publicly checkable: that the Arc address `A` and the Hedera
issuer are the same party.** They are different addresses on different chains, and the only thing
joining them today is `config/analysts.ts` — **our file, on our repo.** A sceptic has to take our word
for it.

**That single gap is the whole problem.** Everything below is about closing it, and the options are
not what they first appear.

---

## 2 · What our backend can read, and what each costs

We hold credentials on both chains, so all of this is available. **Every one is a read; none spends.**

| # | read | how | cost |
|---|---|---|---|
| 1 | the token exists and is not deleted | Mirror Node `GET /api/v1/contracts/{id}` — `fetchJson` + `MIRROR` already in `tokenize/hedera.ts` | free, ⚠️ **lags consensus** |
| 2 | ⚠️ **the creation event carries `alpha:<hash>`** | re-fetch the receipt for `report_tokens.deploy_tx` and re-parse `EquityDeployed` with `Factory__factory.createInterface()` | free. ⚠️ **The deploy tx hash is already stored**, so this needs nothing new |
| 3 | ⚠️ **who issued it** | `receipt.from` on that same deploy tx | free — **one fetch serves 2 and 3** |
| 4 | current holder | `balanceOf` over `HEDERA_TESTNET_RPC`, the minimal-ABI pattern `app/api/holdings` already uses | free |
| 5 | the ISIN | ⚠️ **do not bother — see below** | — |
| 6 | the Arc committer and the hash it passed | the Arc RPC: `eth_getTransactionReceipt` and the decoded event | free |

⚠️ **The ISIN proves nothing independent.** `isinFor()` is `BigInt(hash) % 36⁹` in base-36 — **a pure
function of the report hash.** Checking the ISIN against the hash is checking our own arithmetic, not
the chain. It is a nice identifier for a human and it is not evidence.

### ⚠️ And read 4 is a trap, which is the most useful thing in this note

**"Held by the analyst" is the wrong criterion, and requiring it would refuse most of our own
reports.** `004_token_transfers.sql` records the state plainly: *"Three tokens sit with the buyer
today."* Unit 10 transferred them **on purpose** — H2.4 asks for a lifecycle operation on camera, and
`transfer.ts` exists to provide one.

**So the act that satisfies H2.4 breaks an admission check built on current holding.** Two
requirements pulling opposite ways through one column.

⚠️ **Bind to issuance, not to holding.** Who *issued* a token is permanent and is in the deploy
transaction forever; who *holds* it is a lifecycle fact that is supposed to change. Reads 2 and 3 come
from one receipt and neither can be invalidated by a later transfer.

---

## 3 · What the contract can enforce with no external data

It sees `msg.sender` and a `bytes32`. That is all.

**It can enforce:** one claim per author per market · the author is `msg.sender` · the hash is
recorded immutably · the commit precedes `closeTime` · the stake is real money.

⚠️ **It cannot know that the 32 bytes mean anything.** To the contract, `reportHash` is an arbitrary
word. An analyst could commit the hash of a report that does not exist, was never tokenized, or was
written by someone else, and **the contract would accept all three.** No amount of Solidity fixes
that, because the fact lives on another chain.

---

## 4 · What a cross-chain messaging layer would actually give us

⚠️ **Investigated rather than dismissed, and the first finding is a surprise in our favour.**

### Hedera testnet has a LayerZero endpoint. Arc does not.

From [LayerZero's own deployed-contracts list](https://docs.layerzero.network/v2/deployments/deployed-contracts) —
the operational registry, not a blog post:

| chain | endpoint id |
|---|---|
| Hedera EVM mainnet | `10285` |
| **Hedera EVM testnet** | **`40285`** |
| **Arc** | ⚠️ **not present** |

There is an official [Hedera + LayerZero OApp tutorial](https://github.com/hedera-dev/tutorial-js-layer-zero-bridging-oapp),
so the Hedera half is real and documented.

⚠️ **Arc is the half that does not exist.** Circle's
[Arc public testnet announcement](https://www.circle.com/pressroom/circle-launches-arc-public-testnet)
names LayerZero among its developer-tool partners and names **Across, Stargate and Wormhole** as the
things connecting Arc to other networks. ⚠️ **A partner logo in a launch release is not a deployed
endpoint**, and this project has been wrong six times about exactly that distinction. The deployments
page is the authority and Arc is not on it.

*(An aside worth keeping: LayerZero's own Hedera entry warns "The Hedera EVM has 8 decimals while
their JSON RPC uses 18 decimals for `msg.value`" — the same class of trap as Arc's 6-versus-18. Even
the bridge has one.)*

### Suppose the endpoint existed. What would it buy?

A message from Hedera to Arc saying *"token P commits hash H and was issued by A_hedera"*, delivered
to an OApp receiver whose `_lzReceive` records the origin sender. Because only `A_hedera`'s key could
have sent it, **the Arc contract would learn the identity link cryptographically** and could refuse a
commit without it.

That is genuinely stronger than anything off-chain: **enforcement rather than verification.**

### What it would cost, honestly

An OApp sender on Hedera and a receiver on Arc, both written and deployed · peers wired in both
directions · gas funded on both chains · per-message fees · an endpoint on Arc that **does not exist**.
⚠️ **With a Sunday deadline and `AlphaMarket.sol` not yet written, this is not a close call.**

### ⚠️ And it would not be a one-time cost, which is the part that decides it

A message proves a fact **at the moment it was sent**. Identity is permanent, but *holding* is not —
so enforcement of "the analyst holds it" would need **a message per commit**, not one ever. And
enforcement of "the analyst issued it" needs the identity link, which is permanent and therefore
**does not need a messaging layer at all** — see §5.

**So the messaging layer buys contract-level enforcement of a fact that a single signature can make
publicly checkable.** That is a real difference, and it is not worth days we do not have.

---

## 5 · The thing that actually closes the gap, and it is cheap

⚠️ **Both keys can sign a message, so the identity link can be made third-party verifiable without
any bridge.**

- The Hedera side is an `ethers.Wallet` derived from `HEDERA_SELLER_KEY`, and `ats.ts:132` already
  asserts it derives the analyst row's address. `signMessage` is ordinary ethers.
- ⚠️ **The Arc side can sign too, and this was read from the installed SDK rather than assumed.**
  `@circle-fin/developer-controlled-wallets@10.8.0` exposes
  `client.signMessage({ walletId, message, encodedByHex, memo })` returning
  `response.data?.signature` — with `signTypedData`, `signTransaction` and `signDelegateAction`
  alongside it.

**So: a two-way attestation, produced once.**

```
Hedera key signs:  "alpha-markets analyst alpha-1 · arc=0x1b7035bb… · hedera=0x32838fe9…"
Circle wallet signs: the same sentence
```

Anyone can `ecrecover` both and check each recovers the address it claims. ⚠️ **That turns
`config/analysts.ts` from an assertion into a claim backed by two signatures**, and it costs two
signing calls, once, forever.

**What it still does not do:** it is *verification*, not *enforcement*. The Arc contract never sees
it, so a commit is still possible without it. **A verifier must choose to check.** That is the honest
difference from the messaging layer, and it is the whole trade.

---

## 6 · What each option can prove to a third party who does not trust us

⚠️ **This is the table that should decide it, rather than convenience.**

| claim | server check alone | server check + attestation | cross-chain message |
|---|---|---|---|
| a token exists carrying this report's hash | ✅ **already public on Hedera** — we do not make this true, we only check it before spending | ✅ same | ✅ same |
| the analyst issued that token | ✅ **already public** — `receipt.from` on the deploy tx | ✅ same | ✅ same |
| this Arc address committed this hash | ✅ **already public on Arc** | ✅ same | ✅ same |
| ⚠️ **the Arc committer and the Hedera issuer are one party** | ❌ **rests on our config file** | ✅ **two signatures anyone can recover** | ✅ enforced by the contract |
| the check actually ran before the money moved | ⚠️ our evidence record — trust us | ⚠️ same | ✅ a commit without it is impossible |
| the analyst *holds* the token now | ⚠️ **do not claim this** — the token is meant to move (H2.4) | ⚠️ same | would need a message per commit |

**Reading across:** three of the four substantive claims are **already publicly verifiable and always
were**. The server check does not create them — it **prevents the analyst spending on a claim it
cannot back**, which is a different and still valuable job. The attestation closes the one genuine
gap. The messaging layer only upgrades *verification* to *enforcement*, on the last two rows.

---

## 7 · Recommendation

1. **An admission check before any commit**, in the server, because it holds both sets of
   credentials. ⚠️ **Bind to issuance, never to current holding** — §2. Reads 1, 2, 3 and 6, all
   free, one Hedera receipt fetch doing most of the work.
2. **Record what it saw as evidence**, so the claim is checkable afterwards and so a third party can
   re-run every read themselves rather than taking the record's word for it. ⚠️ **The record's value
   is that it names what to re-check, not that it asserts a result.**
3. **A one-time two-way key attestation**, published. ⚠️ **This is the part that makes the instinct
   sound rather than merely convenient** — without it, the binding's last link is a file we wrote.
4. **No messaging layer.** Not because Arc cannot read Hedera, but because the endpoint does not exist
   on Arc, and because what it would buy — enforcement instead of verification — costs days we do not
   have for a gap two signatures close.

⚠️ **Say the residual limitation out loud rather than letting a judge find it.** Nothing stops the
contract accepting a commit whose hash means nothing; what stops *us* is a server check, and what
lets *anyone else* catch it is that all four facts are independently readable from two public chains.
**Detectable by anyone, enforced by no one** — the same shape as the settlement evidence, and the
same honest answer.

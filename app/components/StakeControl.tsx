'use client';

// The position panel on `/markets/[id]`. **The one control on this page that moves money.**
//
// ── ⚠️ WHAT WAS TAKEN FROM `trash/app/markets/[id]/stake.tsx` ────────────────────────────────────
//
// Its wallet plumbing, unchanged in substance because it worked:
//
//   `toWei` / `fromWei`  — **string-to-BigInt by hand, never `parseFloat`.** A float cannot hold
//                          18 decimal places and a stake is money;
//   `ensureArc()`        — `eth_chainId`, then `wallet_switchEthereumChain`, and **only on error
//                          code 4902** `wallet_addEthereumChain`, then a re-check. 4902 is "chain
//                          not added"; treating every failure as "add it" would spam the wallet;
//   `connect()`          — `eth_requestAccounts`, refusing an empty list;
//   the **four pre-flight refusals**, computed before the wallet is ever opened;
//   `eth_sendTransaction` with `value` as hex wei and server-encoded `data`;
//   `post()` → `/api/markets/[id]/refresh`, and a **"Record it" retry** that re-posts the same hash;
//   the four response shapes: `reverted`, `recorded`, `pending`, and not-recorded-with-a-reason.
//
// ⚠️ **NO SIDE PICKER, AND THE CONTRACT IS WHY.** `stake(uint256 marketId, uint256 claimId)` takes
// no side — it reads the side off the claim. A toggle would let two people back opposite sides of
// one claim, and the claim would stop meaning anything.
//
// ⚠️ **`src/arc/abi.ts` IS NOT IMPORTED HERE.** It carries the full contract bytecode and this is a
// client component. The calldata is encoded on the server and arrives as a prop; the only ABI-shaped
// thing in this file is nothing at all.
//
// ── ⚠️ THE DECIMAL TRAP, AND THE CHECK THAT CATCHES IT BEFORE THE WALLET OPENS ───────────────────
//
// **Arc's native gas is USDC at 18 decimals. The ERC-20 at the same address reports 6.** The two
// presentations differ by 10^12, and a wallet that gets it wrong is off by a factor of a trillion
// with a number that still looks plausible. `AlphaMarket.sol:93` declares `UNIT_SCALE = 1e12` and
// `_checkAmount` reverts `NotAUsdcUnit(amount)` on `amount % UNIT_SCALE != 0`.
//
// ⚠️ **So the check happens in the browser, before signing.** A revert costs the staker gas and
// returns nothing. All four conditions the contract can reject are computed here first, against the
// contract's own constants read on this request — not hardcoded.

import {useState} from 'react';
import {ArrowUpRight, Check, Lock} from './Icons.js';

/** Arc testnet, 5042002. Hex because EIP-1193 wants it that way. */
const ARC_CHAIN_ID = '0x4cef52';
/** ⚠️ `AlphaMarket.sol:93`'s own constant. 1e12 wei per 6-decimal USDC unit. */
const UNIT_SCALE = 1_000_000_000_000n;

interface Eip1193 {
  request(args: {method: string; params?: unknown[]}): Promise<unknown>;
}

/**
 * A decimal string → 18-decimal wei, exactly.
 * ⚠️ **No `Number`, no `parseFloat`.** A double holds ~15 significant digits and 1 USDC is
 * 1,000,000,000,000,000,000 wei; going through a float loses money silently.
 */
function toWei(input: string): bigint | null {
  const t = input.trim();
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const [whole, frac = ''] = t.split('.');
  if (frac.length > 18) return null;
  return BigInt(whole!) * 10n ** 18n + BigInt(frac.padEnd(18, '0') || '0');
}

/** 18-decimal wei → a decimal string, exactly. */
const fromWei = (wei: bigint): string => {
  const s = (wei / 10n ** 18n).toString();
  const f = (wei % 10n ** 18n).toString().padStart(18, '0').replace(/0+$/, '');
  return f ? `${s}.${f}` : s;
};

export function StakeControl({
  marketId,
  claimId,
  side,
  sidePct,
  poolTrue,
  poolFalse,
  maxStakeWei,
  contractAddress,
  rpcUrl,
  callData,
  reportHash,
  reportTitle,
  state,
  standing,
  outcome,
}: {
  marketId: string;
  claimId: string;
  /** ⚠️ From the claim, never from a control. */
  side: boolean;
  sidePct: number | null;
  poolTrue: string;
  poolFalse: string;
  /** The contract's own `MAX_STAKE()`, read on this request. */
  maxStakeWei: string;
  contractAddress: string;
  /** ⚠️ Already stripped of any key by the server. */
  rpcUrl: string;
  /** ⚠️ `stake(marketId, claimId)` encoded on the server. */
  callData: string;
  reportHash: string;
  reportTitle: string;
  state: 'open' | 'closed' | 'resolved' | 'voided';
  standing: string;
  outcome: boolean | null;
}) {
  const [amount, setAmount] = useState('1');
  const [account, setAccount] = useState<string | null>(null);
  const [stage, setStage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recorded, setRecorded] = useState<{staker: string; amount: string} | null>(null);
  const [pools, setPools] = useState({t: BigInt(poolTrue), f: BigInt(poolFalse)});

  const max = BigInt(maxStakeWei);
  const wei = toWei(amount);

  // ── ⚠️ THE FOUR REFUSALS, EACH NAMING THE CONTRACT ERROR IT PREVENTS ──────────────────────────
  const invalid: string | null =
    wei === null
      ? 'Enter a plain decimal amount, e.g. 1 or 0.5.'
      : wei === 0n
        ? 'A stake must be greater than zero — the contract reverts ZeroStake.'
        : wei % UNIT_SCALE !== 0n
          ? `Arc's native USDC is 18-decimal but a stake must be a whole 6-decimal USDC unit, so at most six decimal places. ${amount} is ${wei} wei, which leaves ${wei % UNIT_SCALE} over — the contract reverts NotAUsdcUnit.`
          : wei > max
            ? `The contract caps a single stake at ${fromWei(max)} USDC — it reverts OverStakeCap.`
            : null;

  const eth = (): Eip1193 => {
    const injected = (globalThis as {ethereum?: Eip1193}).ethereum;
    if (!injected) throw new Error('No browser wallet found. Install MetaMask (or any EIP-1193 wallet) and reload.');
    return injected;
  };

  const ensureArc = async (): Promise<void> => {
    const provider = eth();
    if ((await provider.request({method: 'eth_chainId'})) === ARC_CHAIN_ID) return;
    try {
      setStage('asking the wallet to switch to Arc testnet…');
      await provider.request({method: 'wallet_switchEthereumChain', params: [{chainId: ARC_CHAIN_ID}]});
    } catch (e) {
      // ⚠️ 4902 means "the wallet does not have this chain". Only then is adding it the right move.
      if ((e as {code?: number}).code !== 4902) throw e;
      setStage('asking the wallet to add Arc testnet…');
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: ARC_CHAIN_ID,
          chainName: 'Arc Testnet',
          // ⚠️ **18, and this is the number the whole panel turns on.** The ERC-20 at the same
          // address says 6; the native gas token is 18. Telling the wallet 6 would make every
          // amount it displays wrong by 10^12.
          nativeCurrency: {name: 'USDC', symbol: 'USDC', decimals: 18},
          rpcUrls: [rpcUrl],
          blockExplorerUrls: ['https://testnet.arcscan.app'],
        }],
      });
    }
    if ((await provider.request({method: 'eth_chainId'})) !== ARC_CHAIN_ID) {
      throw new Error('The wallet is still not on Arc testnet. Switch it by hand and try again.');
    }
  };

  const connect = async (): Promise<string> => {
    setStage('waiting for the wallet to connect…');
    const accounts = (await eth().request({method: 'eth_requestAccounts'})) as string[];
    const first = accounts[0];
    if (!first) throw new Error('The wallet returned no account.');
    setAccount(first);
    return first;
  };

  /**
   * ⚠️ **The server records from the `Staked` EVENT, never from this body.** All that is sent is the
   * transaction hash. The route reads the staker, the side and the amount off the log, checks the
   * side against the stored claim, and writes `ON CONFLICT (tx_hash) DO NOTHING` — so re-posting
   * after a timeout is a no-op rather than a double count. That is why the retry below is safe.
   */
  const post = async (hash: string): Promise<void> => {
    setStage('waiting for the transaction to be mined…');
    const res = await fetch(`/api/markets/${marketId}/refresh`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({txHash: hash}),
    });
    const text = await res.text();
    let body: Record<string, unknown> = {};
    try {
      body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      setStage('');
      setError(`The refresh route answered ${res.status} with a body that is not JSON. The hash is safe — press "Record it".`);
      return;
    }
    if (typeof body.poolTrue === 'string' && typeof body.poolFalse === 'string') {
      setPools({t: BigInt(body.poolTrue), f: BigInt(body.poolFalse)});
    }
    if (body.reverted) {
      setStage('');
      setError(`Transaction ${hash} reverted on chain. Nothing was staked; the gas is spent.`);
      return;
    }
    if (body.recorded) {
      setRecorded({staker: String(body.staker), amount: String(body.amount)});
      setStage('Staked, and recorded.');
      return;
    }
    setStage(
      body.pending
        ? 'Still not mined. The hash is safe — press "Record it" to try again.'
        : `Not recorded yet${body.error ? `: ${String(body.error)}` : ''}. Press "Record it" to try again.`,
    );
  };

  const go = async () => {
    setBusy(true);
    setError(null);
    setRecorded(null);
    try {
      const from = account ?? (await connect());
      await ensureArc();
      setStage('confirm the stake in your wallet…');
      const hash = (await eth().request({
        method: 'eth_sendTransaction',
        params: [{from, to: contractAddress, value: `0x${wei!.toString(16)}`, data: callData}],
      })) as string;
      // ⚠️ **THE HASH IS ON THE PAGE BEFORE ANYTHING IS CONFIRMED.** If the wait times out the
      // staker still has it, and "Record it" finishes the job. Losing a hash is losing the only
      // handle on money that has already moved.
      setTxHash(hash);
      await post(hash);
    } catch (e) {
      const err = e as {code?: number; message?: string};
      setError(err.code === 4001 ? 'You rejected the request in the wallet. Nothing was sent.' : (err.message ?? String(e)));
      setStage('');
    } finally {
      setBusy(false);
    }
  };

  const retry = async () => {
    if (!txHash) return;
    setBusy(true);
    setError(null);
    try {
      await post(txHash);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // ── What the claim cites. The same in every state: a stake joins a claim, and the claim's
  //    report is fixed before anybody arrives. `stake()` has no field that could carry another.
  const cited = (
    <>
      <p className="attached-report">
        <span>{reportTitle}</span>
        <small>CLAIM #{claimId} CITES IT · BACKS {side ? 'TRUE' : 'FALSE'}</small>
      </p>
      <a className="text-link" href={`/report/${reportHash}`}>
        Read the report behind this claim <ArrowUpRight size={13} />
      </a>
    </>
  );

  // ── ⚠️ THE THREE CLOSED STATES. Each says what is true of it, not "unavailable". ───────────────
  if (state !== 'open') {
    return (
      <>
        <p className="stake-side">
          <i className={side ? 'dot-true' : 'dot-false'} />
          <strong>{side ? 'TRUE' : 'FALSE'}</strong>
          <span>{sidePct === null ? 'no pool' : `${sidePct}% of the pool`}</span>
        </p>
        <p className="balance-line" style={{textAlign: 'left'}}>
          {state === 'voided'
            ? 'Voided: the day could not be observed, so there is no outcome and every stake is refundable. Nothing new can be staked and nothing was lost.'
            : state === 'resolved'
              ? `Resolved ${outcome ? 'TRUE' : 'FALSE'}. Staking is over. The parimutuel pays the winning side from the whole pool — and where one side is empty it returns each stake to whoever made it.`
              : `${standing}. The close time has passed, so the contract reverts StakingClosed on any new stake. Stakes already placed are unaffected.`}
        </p>
        {cited}
        <span className="btn white full inert">
          <Lock size={15} /> {state === 'voided' ? 'Voided' : state === 'resolved' ? 'Market resolved' : 'Staking closed'}
        </span>
      </>
    );
  }

  // ── ⚠️ OPEN. The live control. ────────────────────────────────────────────────────────────────
  return (
    <>
      <label htmlFor="stake-side">Your side</label>
      {/* ⚠️ Text, not a picker. `stake(marketId, claimId)` takes no side. */}
      <p className="stake-side" id="stake-side">
        <i className={side ? 'dot-true' : 'dot-false'} />
        <strong>{side ? 'TRUE' : 'FALSE'}</strong>
        <span>{sidePct === null ? 'no pool yet' : `${sidePct}% of the pool`}</span>
      </p>

      <label htmlFor="stake-amount">Stake amount</label>
      <div className="amount-field">
        <input
          id="stake-amount"
          value={amount}
          disabled={busy}
          inputMode="decimal"
          aria-label="Stake amount in USDC"
          onChange={(e) => setAmount(e.target.value)}
        />
        <span>USDC</span>
      </div>

      {/* ⚠️ Sized for a contract holding 1.02 USDC and a 6-decimal unit rule — not the design's
          50/100/500, which were sized for invented five-figure pools. */}
      <div className="amount-shortcuts">
        {['0.01', '0.1', '1', '10'].map((v) => (
          <button key={v} type="button" className={amount === v ? 'active' : undefined} onClick={() => setAmount(v)} disabled={busy}>
            {v}
          </button>
        ))}
      </div>

      {invalid && <p className="validation-message">{invalid}</p>}

      {cited}

      {/* ⚠️ The rule, not a payout figure. A parimutuel pays `stake × totalPool / winningPool`, and
          where the winning side has nobody else it returns each stake to whoever made it — which is
          every pool in this deployment today. A headline multiple would be a broken calculator. */}
      <div className="payout-estimate">
        <span>
          Parimutuel <small>TRUE {fromWei(pools.t)} · FALSE {fromWei(pools.f)} USDC</small>
        </span>
        <strong style={{fontSize: 13, textAlign: 'right', lineHeight: 1.5}}>
          {pools.t === 0n || pools.f === 0n
            ? 'One-sided: if it settles this way every stake is returned to whoever made it'
            : 'A winning stake takes its share of the whole pool'}
        </strong>
      </div>

      <button className="btn white full" type="button" onClick={() => void go()} disabled={busy || invalid !== null}>
        {busy ? 'Working…' : account ? `Stake ${amount} USDC on ${side ? 'TRUE' : 'FALSE'}` : 'Connect wallet and stake'}
      </button>

      {/* ⚠️ Only while a hash exists and is not yet recorded. Re-posting the same hash is a no-op:
          `stakes.tx_hash` is UNIQUE and the route inserts ON CONFLICT DO NOTHING. */}
      {txHash && !recorded && (
        <button className="btn dark-outline full" type="button" onClick={() => void retry()} disabled={busy}>
          Record it
        </button>
      )}

      {recorded && (
        <p className="attached-report">
          <span>
            <Check size={14} /> Staked {fromWei(BigInt(recorded.amount))} USDC on {side ? 'TRUE' : 'FALSE'}
          </span>
          <small>RECORDED FROM THE STAKED EVENT · {recorded.staker}</small>
        </p>
      )}
      {account && <p className="balance-line">Connected: {account}</p>}
      {stage && <p className="balance-line">{stage}</p>}
      {error && <p className="validation-message">{error}</p>}
      {txHash && (
        <a className="text-link" href={`https://testnet.arcscan.app/tx/${txHash}`} target="_blank" rel="noreferrer">
          Your transaction on arcscan <ArrowUpRight size={13} />
        </a>
      )}

      {/* ⚠️ The design's panel said "Demo funds only. No transaction will be broadcast." The
          opposite is true here, and it is the point of this control. */}
      <p className="balance-line" style={{textAlign: 'left'}}>
        ⚠️ <strong>Real funds.</strong> You sign from your own wallet on Arc testnet. The native gas
        token is USDC at 18 decimals — the ERC-20 at the same address reports 6, a factor of 10¹² — so
        a stake must be a whole 6-decimal unit of at most {fromWei(max)} USDC. It cannot be withdrawn
        before settlement.
      </p>
    </>
  );
}

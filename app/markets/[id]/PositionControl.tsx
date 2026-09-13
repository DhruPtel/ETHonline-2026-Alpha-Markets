'use client';

// **One position control.** A report, an amount, one button.
//
// ── ⚠️ WHICH CALL FIRES IS DECIDED BY STATE, NOT BY WHICH BUTTON SOMEBODY PRESSED ────────────────
//
// The contract has two calls and they are not interchangeable:
//
//   `commitPrediction(marketId, reportHash, side)` creates a claim **carrying a report**. One per
//     author per market. **The analyst's own USDC, through Circle — no wallet connects.**
//   `stake(marketId, claimId)` joins an existing claim's side and **carries no report**.
//     **The connected wallet's USDC, signed in MetaMask on Arc.**
//
// So this panel picks. Two controls each with their own amount field and their own button meant a
// person could stake USDC twice, in two places, for what is one action: *put money on this market,
// backed by a report.*
//
//   no claim by this analyst → COMMIT. The chosen report enters the market and becomes the thing
//                              that gets graded when it settles. The report is the point.
//   a claim exists           → JOIN. The amount goes onto that claim's side and **the report is
//                              already fixed by the claim** — `stake()` has no parameter that could
//                              carry another one.
//
// ⚠️ **So in JOIN the dropdown is DISABLED, showing the report the claim cites — not hidden.**
// Hiding it would make the panel a different shape on different markets and would hide the fact
// that this position *is* backed by a report. Disabled says both true things at once: here is the
// research you are backing, and no, you cannot swap it. **An enabled select whose value the call
// cannot carry would be a lie about what the button does.**
//
// ── ⚠️ NO ELIGIBILITY FILTERING ──────────────────────────────────────────────────────────────────
//
// The list is the analyst's tokenized reports, full stop. A report that turns out to be
// uncommittable is refused by `prepare()` **with the reason**, and a refusal that explains itself
// beats a shorter list that silently omits things.
//
// ⚠️ **The analyst picks the side, never the person.** `decideSide` reads the same daily series
// settlement will read, which is what makes the score mean anything.
//
// ⚠️ **Two presses in both branches.** The first can only describe or refuse; the second spends.
// In COMMIT the plan comes from `prepare()` over the route. In JOIN it is computed here from the
// live pools and the contract's own constants — and then **MetaMask is itself the second
// confirmation**, showing the amount in the wallet's own words before anything is signed.

import {useEffect, useState} from 'react';
import {resetDemoMarket, revealDemoMarket} from '../actions.js';
import {ArrowUpRight, Check, Clock, Lock} from '../../components/Icons.js';

export interface AnalystReport {
  hash: string;
  label: string;
  isin: string;
}

interface CommitPlan {
  claimId: string;
  side: boolean;
  decidedFromDay: string;
  observed: string;
  reason: string;
  verdict: string | null;
  amountUsdc: string;
  binding: {proxyAddress: string; issuerAddress: string};
}

interface Eip1193 {
  request(args: {method: string; params?: unknown[]}): Promise<unknown>;
}

/** Arc testnet, 5042002. */
const ARC_CHAIN_ID = '0x4cef52';
/** ⚠️ `AlphaMarket.sol:93`'s `UNIT_SCALE`: 1e12 wei per 6-decimal USDC unit. */
const UNIT_SCALE = 1_000_000_000_000n;

/**
 * ⚠️ Decimal string → 18-decimal wei, by hand. **No `parseFloat`**: a double holds ~15 significant
 * digits and 1 USDC is 1,000,000,000,000,000,000 wei.
 */
function toWei(input: string): bigint | null {
  const t = input.trim();
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const [whole, frac = ''] = t.split('.');
  if (frac.length > 18) return null;
  return BigInt(whole!) * 10n ** 18n + BigInt(frac.padEnd(18, '0') || '0');
}

const fromWei = (wei: bigint): string => {
  const s = (wei / 10n ** 18n).toString();
  const f = (wei % 10n ** 18n).toString().padStart(18, '0').replace(/0+$/, '');
  return f ? `${s}.${f}` : s;
};

/**
 * ⚠️ Native `<option>` colours, inline. The popup is drawn by the OS and inherits the select's
 * colours; this select's background is `#ffffff05`, nearly transparent over a dark panel, so several
 * browsers would render white on white. There is no reference rule for an option.
 */
const OPTION = {color: '#151515', background: '#ffffff'} as const;

export function PositionControl({
  chainMarketId,
  reports,
  claim,
  poolTrue,
  poolFalse,
  maxStakeWei,
  contractAddress,
  rpcUrl,
  callData,
  state,
  standing,
  outcome,
  demo = false,
  closeTimeMs,
  observationEndMs,
}: {
  chainMarketId: string;
  /** The analyst's tokenized reports. Not filtered further — see the header. */
  reports: AnalystReport[];
  /** The claim on this market, if there is one. Its presence chooses the call. */
  claim: {chainClaimId: string; side: boolean; reportHash: string; reportLabel: string} | null;
  poolTrue: string;
  poolFalse: string;
  maxStakeWei: string;
  contractAddress: string;
  rpcUrl: string;
  /** `stake(marketId, claimId)` encoded on the server. Empty when there is no claim to join. */
  callData: string;
  state: 'open' | 'closed' | 'resolved' | 'voided';
  standing: string;
  outcome: boolean | null;
  /**
   * ⚠️ **Past-posted, so the judge commits their OWN claim from their OWN wallet.** Every branch
   * this opens is gated on it, and a real market passes `false` and renders exactly what it always
   * did — that property is the check `/markets/6` exists to prove.
   */
  demo?: boolean;
  closeTimeMs?: number;
  observationEndMs?: number;
}) {
  // ⚠️ **A DEMO VISITOR NEVER JOINS.** The analyst's claim is already on a demo market, so the plain
  // `claim !== null` would put this panel in JOIN — disabling the report select, hiding the side, and
  // calling `stake()`, which carries no report at all. The whole point is the opposite: their wallet,
  // their report, their side. Non-demo markets read exactly as before.
  const joining = !demo && claim !== null;

  const [hash, setHash] = useState(claim?.reportHash ?? reports[0]?.hash ?? '');
  const [amount, setAmount] = useState(joining ? '1' : '0.01');
  const [plan, setPlan] = useState<CommitPlan | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [stop, setStop] = useState<{message: string; kind: string} | null>(null);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState('');
  const [account, setAccount] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [done, setDone] = useState<{what: 'committed' | 'staked'; id: string; arcscan: string | null} | null>(null);
  const [pools, setPools] = useState({t: BigInt(poolTrue), f: BigInt(poolFalse)});
  /** ⚠️ Demo only. `commitPrediction` carries a side and the contract will not guess one. */
  const [side, setSide] = useState<boolean | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [payout, setPayout] = useState<bigint | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!demo) return undefined;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [demo]);
  void tick;

  const max = BigInt(maxStakeWei);
  const wei = toWei(amount);
  const chosen = reports.find((r) => r.hash === hash) ?? null;

  // ── ⚠️ THE CONTRACT'S OWN REFUSALS, COMPUTED BEFORE ANY WALLET OPENS ──────────────────────────
  const invalid: string | null =
    wei === null
      ? 'Enter a plain decimal amount, e.g. 1 or 0.5.'
      : wei === 0n
        ? 'A stake must be greater than zero — the contract reverts ZeroStake.'
        : wei % UNIT_SCALE !== 0n
          ? `Arc's native USDC is 18-decimal but a stake must be a whole 6-decimal unit. ${amount} is ${wei} wei, ${wei % UNIT_SCALE} over — the contract reverts NotAUsdcUnit.`
          : wei > max
            ? `The contract caps a single stake at ${fromWei(max)} USDC — it reverts OverStakeCap.`
            : !joining && !hash
              ? 'Choose a report to commit.'
              : null;

  // ── the wallet, for the JOIN branch only ──────────────────────────────────────────────────────
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
      // ⚠️ 4902 means "the wallet does not have this chain". Only then is adding it right.
      if ((e as {code?: number}).code !== 4902) throw e;
      setStage('asking the wallet to add Arc testnet…');
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: ARC_CHAIN_ID,
          chainName: 'Arc Testnet',
          // ⚠️ 18, and this is the number the whole branch turns on. The ERC-20 at the same address
          // reports 6; telling the wallet 6 would make every amount it shows wrong by 10^12.
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

  /** ⚠️ The server records from the `Staked` EVENT, never from this body — only the hash is sent. */
  const record = async (h: string): Promise<void> => {
    setStage('waiting for the transaction to be mined…');
    const res = await fetch(`/api/markets/${chainMarketId}/refresh`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({txHash: h}),
    });
    const text = await res.text();
    let body: Record<string, unknown> = {};
    try {
      body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      setStage('Mined, but the refresh route did not answer in JSON. The hash is safe — press Record it.');
      return;
    }
    if (typeof body.poolTrue === 'string' && typeof body.poolFalse === 'string') {
      setPools({t: BigInt(body.poolTrue), f: BigInt(body.poolFalse)});
    }
    if (body.reverted) {
      setStage('');
      setStop({message: `Transaction ${h} reverted on chain. Nothing was staked; the gas is spent.`, kind: 'error'});
      return;
    }
    if (body.recorded) {
      setDone({what: 'staked', id: String(body.amount), arcscan: `https://testnet.arcscan.app/tx/${h}`});
      setStage('');
      return;
    }
    setStage(
      body.pending
        ? 'Still not mined. The hash is safe — press "Record it" to try again.'
        : `Not recorded yet${body.error ? `: ${String(body.error)}` : ''}. Press "Record it".`,
    );
  };

  /** COMMIT: `prepare()` over the route. `confirm` is the only difference between the two presses. */
  const commitPost = async (confirm: boolean) => {
    setBusy(true);
    setStop(null);
    if (!confirm) setPlan(null);
    try {
      const res = await fetch(`/api/markets/${chainMarketId}/commit`, {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({reportHash: hash, amount: amount.trim(), confirm}),
      });
      // ⚠️ Status and text first — `res.json()` on an empty 500 body throws about JSON, not about
      // what failed. Same fix the buy and stake controls needed.
      const text = await res.text();
      let j: Record<string, unknown> = {};
      try {
        j = text ? (JSON.parse(text) as Record<string, unknown>) : {};
      } catch {
        setStop({message: `The commit route answered ${res.status} with a body that is not JSON.`, kind: 'error'});
        return;
      }
      if (j.stop || j.error || j.fail) {
        setStop({message: String(j.stop ?? j.error ?? j.fail), kind: String(j.kind ?? 'error')});
        return;
      }
      if (j.plan) setPlan(j.plan as CommitPlan);
      if (j.mode === 'confirmed') {
        const links = j.links as {arcscan?: string | null} | undefined;
        setDone({what: 'committed', id: String(j.chainClaimId), arcscan: links?.arcscan ?? null});
      }
    } catch (e) {
      setStop({message: e instanceof Error ? e.message : String(e), kind: 'error'});
    } finally {
      setBusy(false);
    }
  };

  /** JOIN: the wallet signs. The plan for this branch was computed locally on the first press. */
  const joinSend = async () => {
    setBusy(true);
    setStop(null);
    try {
      const from = account ?? (await (async () => {
        setStage('waiting for the wallet to connect…');
        const accounts = (await eth().request({method: 'eth_requestAccounts'})) as string[];
        const first = accounts[0];
        if (!first) throw new Error('The wallet returned no account.');
        setAccount(first);
        return first;
      })());
      await ensureArc();
      setStage('confirm the stake in your wallet…');
      const h = (await eth().request({
        method: 'eth_sendTransaction',
        params: [{from, to: contractAddress, value: `0x${wei!.toString(16)}`, data: callData}],
      })) as string;
      // ⚠️ The hash is on the page before anything is confirmed. If the wait times out the staker
      // still holds the only handle on money that has already moved.
      setTxHash(h);
      await record(h);
    } catch (e) {
      const err = e as {code?: number; message?: string};
      setStop({
        message: err.code === 4001 ? 'You rejected the request in the wallet. Nothing was sent.' : (err.message ?? String(e)),
        kind: 'error',
      });
      setStage('');
    } finally {
      setBusy(false);
    }
  };

  /**
   * ⚠️ **The judge's own claim, from the judge's own wallet.** `commitPrediction(marketId,
   * reportHash, side)` — the one call `PositionControl` did not have: COMMIT above spends the
   * ANALYST's USDC through Circle and connects no wallet, and JOIN signs from the visitor's wallet
   * but calls `stake()`, which carries no report. A demo needs both halves at once.
   *
   * ⚠️ **Selector computed with `ethers.id()` and checked, not written from memory.** Two earlier
   * attempts at these by hand were both wrong, and a bad selector presents as an unexplained revert
   * *after* the judge has signed — the worst possible moment to find out.
   */
  const commitAsJudge = async () => {
    if (side === null) return;
    setBusy(true);
    setStop(null);
    try {
      const from = account ?? (await (async () => {
        setStage('waiting for the wallet to connect…');
        const accounts = (await eth().request({method: 'eth_requestAccounts'})) as string[];
        const first = accounts[0];
        if (!first) throw new Error('The wallet returned no account.');
        setAccount(first);
        return first;
      })());
      await ensureArc();
      const data = '0xcdb24e7d'
        + BigInt(chainMarketId).toString(16).padStart(64, '0')
        + hash.replace(/^0x/, '').padStart(64, '0')
        + (side ? 1n : 0n).toString(16).padStart(64, '0');
      setStage('confirm the stake in your wallet…');
      const h = (await eth().request({
        method: 'eth_sendTransaction',
        params: [{from, to: contractAddress, value: `0x${wei!.toString(16)}`, data}],
      })) as string;
      setTxHash(h);
      await record(h);
    } catch (e) {
      const err = e as {code?: number; message?: string};
      setStop({
        message: err.code === 4001 ? 'You rejected the request in the wallet. Nothing was sent.' : (err.message ?? String(e)),
        kind: 'error',
      });
      setStage('');
    } finally {
      setBusy(false);
    }
  };

  /** Settle it against the day that already happened. ⚠️ Spends ~0.0014 USDC of the analyst's gas. */
  const doReveal = async () => {
    setRevealing(true);
    setStop(null);
    try {
      const r = await revealDemoMarket(chainMarketId);
      if (!r.ok) { setStop({message: r.why, kind: 'refused'}); return; }
      setRevealed(r.note);
      if (account) {
        // ⚠️ `payoutOf(uint256,address)` — the real pool. The only figure here that is not illustrative.
        const data = '0x16df4910'
          + BigInt(chainMarketId).toString(16).padStart(64, '0')
          + account.replace(/^0x/, '').toLowerCase().padStart(64, '0');
        try {
          const res = await fetch(rpcUrl, {
            method: 'POST', headers: {'content-type': 'application/json'},
            body: JSON.stringify({jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{to: contractAddress, data}, 'latest']}),
          });
          const j = (await res.json()) as {result?: string};
          if (j.result) setPayout(BigInt(j.result));
        } catch { /* absent rather than zero */ }
      }
    } catch (e) {
      setStop({message: (e as Error).message, kind: 'error'});
    } finally { setRevealing(false); }
  };

  /** Play the same question again on a fresh market. ⚠️ Costs the analyst ~0.02 USDC. */
  const doReset = async () => {
    setRevealing(true);
    setStop(null);
    try {
      const r = await resetDemoMarket(chainMarketId);
      if (!r.ok) { setStop({message: r.why, kind: 'refused'}); return; }
      globalThis.location.href = `/markets/${r.chainMarketId}`;
    } catch (e) {
      setStop({message: (e as Error).message, kind: 'error'});
    } finally { setRevealing(false); }
  };

  // ── ⚠️ THE THREE CLOSED STATES. Neither call is available; each says what is true of it. ──────
  if (state !== 'open') {
    return (
      <>
        <h2>Your position</h2>
        <p>
          {state === 'voided'
            ? 'Voided: the day could not be observed, so there is no outcome and every stake is refundable. Nothing new can be staked and nothing was lost.'
            : state === 'resolved'
              ? `Resolved ${outcome ? 'TRUE' : 'FALSE'}. The parimutuel pays the winning side from the whole pool — and where one side is empty it returns each stake to whoever made it.`
              : `${standing}. The close time has passed, so the contract reverts StakingClosed on any new stake or claim. Stakes already placed are unaffected.`}
        </p>
        {claim && (
          <p className="stake-side">
            <i className={claim.side ? 'dot-true' : 'dot-false'} />
            <strong>{claim.side ? 'TRUE' : 'FALSE'}</strong>
            <span>claim #{claim.chainClaimId}</span>
          </p>
        )}
        {/* ⚠️ The status a real market shows, FIRST — the demo's extra control goes under it, not
            in front of it. A button above the sentence that explains the state reads as the primary
            action on a settled market, which it is not. */}
        {(!demo || (state !== 'closed' && !revealed)) && (
          <span className="btn white full inert">
            <Lock size={15} /> {state === 'voided' ? 'Voided' : state === 'resolved' ? 'Market resolved' : 'Staking closed'}
          </span>
        )}

        {/* ⚠️ **THE ONE CONTROL A REAL MARKET DOES NOT HAVE.** A forecast waits for the resolver's
            daily pass; a demo's day finished hours ago, so settlement can run the moment staking
            shuts. `revealDemoMarket` refuses anything that is not past-posted, so this cannot reach
            markets 6, 7, 11 or 12 whatever id it is handed. */}
        {demo && state === 'closed' && !revealed && (
          <button className="btn white full" type="button" disabled={revealing} onClick={() => void doReveal()}>
            {revealing ? 'Reading the day…' : 'Reveal answer'}
          </button>
        )}
        {demo && revealed && <p className="position-sub"><Check size={13} /> {revealed}</p>}
        {demo && payout !== null && (
          <p className="position-sub">Your payout is {fromWei(payout)} USDC, from the real pool.</p>
        )}
        {/* ⚠️ One claim per author per market, so the same market cannot be replayed. This creates a
            NEW market on the same question with a later closeTime — a different market, which leaves
            the contract's rule exactly as written. It costs the analyst ~0.02 USDC. */}
        {demo && (state === 'resolved' || state === 'voided' || revealed) && (
          <button className="btn dark-outline full" type="button" disabled={revealing} onClick={() => void doReset()}>
            {revealing ? 'Creating the next one…' : 'Play this question again'}
          </button>
        )}
        {stop && <p className="validation-message">{stop.message}</p>}
      </>
    );
  }

  if (done) {
    return (
      <>
        <h2>Your position</h2>
        <p className="position-sub">
          <Check size={13} />{' '}
          {done.what === 'committed'
            ? `Committed. On-chain claim #${done.id}. The analyst staked ${plan?.amountUsdc} USDC of its own money on ${plan?.side ? 'TRUE' : 'FALSE'}.`
            : `Staked ${fromWei(BigInt(done.id))} USDC on ${claim?.side ? 'TRUE' : 'FALSE'}, recorded from the Staked event.`}
        </p>
        {/* ⚠️ **Step 3 of the loop, named.** A report entering a market is what gets graded when it
            settles; if it does not appear as the evidence behind the position, the panel has not
            done its job however well the transaction went. */}
        <p className="position-sub">
          {done.what === 'committed'
            ? 'Reload and the report you staked appears in Supporting research at the bottom of this page — it is now the evidence behind this position, and the thing the market grades when it settles.'
            : 'The report behind this claim is in Supporting research at the bottom of this page. Reload to see the pool.'}
        </p>
        {done.arcscan && (
          <a className="text-link" href={done.arcscan} target="_blank" rel="noreferrer">
            Follow it on arcscan <ArrowUpRight size={13} />
          </a>
        )}
      </>
    );
  }

  // ── ⚠️ THE DEMO PANEL. Same labels, same classes, same one button as a real market. ───────────
  //
  // The only structural difference from a forecast is the **Outcome** control, and it is unavoidable
  // rather than decorative: `commitPrediction` takes a side and the contract will not guess one. On a
  // real market the side is either the analyst's (`decideSide` picks it) or the claim's (JOIN reads
  // it off), so there has never been anything for a visitor to choose.
  if (demo) {
    const closesIn = closeTimeMs ? Math.max(0, Math.ceil((closeTimeMs - Date.now()) / 1000)) : 0;
    // ⚠️ Illustrative, from the DISPLAYED pool, and marked — the same treatment the chart carries.
    // The only real money figure on this page is `payoutOf`, read after settlement.
    const win = side === true ? pools.t : pools.f;
    const lose = side === true ? pools.f : pools.t;
    const potential = wei !== null && side !== null && win + wei! > 0n
      ? fromWei(wei! + (wei! * lose) / (win + wei!))
      : null;

    return (
      <>
        <h2>Your position</h2>
        <p>
          You sign from your own wallet on Arc. <strong>The USDC is yours and so is the claim</strong> —
          the report you attach is what gets graded when this settles.
        </p>

        <label htmlFor="position-outcome">Outcome</label>
        <div className="amount-shortcuts" id="position-outcome">
          {([true, false] as const).map((v) => (
            <button
              key={String(v)} type="button" disabled={busy}
              className={side === v ? 'active' : undefined}
              onClick={() => setSide(v)}
            >
              {v ? 'TRUE' : 'FALSE'}
            </button>
          ))}
        </div>

        <label htmlFor="position-report">Attach supporting report</label>
        <select
          id="position-report" className="choice" value={hash} disabled={busy}
          onChange={(e) => { setHash(e.target.value); setStop(null); }}
        >
          {reports.map((r) => (
            <option key={r.hash} value={r.hash} style={OPTION}>{r.label}</option>
          ))}
        </select>
        <span className="position-sub">
          {reports.length} tokenized report{reports.length === 1 ? '' : 's'}{chosen ? ` · ${chosen.isin}` : ''}
        </span>

        <label htmlFor="position-amount">Stake amount</label>
        <div className="amount-field">
          <input
            id="position-amount" value={amount} disabled={busy} inputMode="decimal"
            onChange={(e) => { setAmount(e.target.value); setStop(null); }}
          />
          <span>USDC</span>
        </div>
        <div className="amount-shortcuts">
          {['0.01', '0.1', '1', '10'].map((v) => (
            <button
              key={v} type="button" disabled={busy}
              className={amount === v ? 'active' : undefined}
              onClick={() => { setAmount(v); setStop(null); }}
            >
              {v}
            </button>
          ))}
        </div>

        {invalid && <p className="validation-message">{invalid}</p>}

        {side !== null && !invalid && (
          <div className="transaction-receipt">
            <b><span>side</span><span>{side ? 'TRUE' : 'FALSE'}</span></b>
            <b><span>amount</span><span>{amount} USDC</span></b>
            <b><span>from</span><span>your wallet</span></b>
            <b>
              <span>potential total payout *</span>
              <span>{potential ? `${potential} USDC` : '—'}</span>
            </b>
          </div>
        )}

        {stop && <p className="validation-message">{stop.message}</p>}

        <button
          className="btn white full" type="button"
          disabled={busy || invalid !== null || side === null}
          onClick={() => void commitAsJudge()}
        >
          {busy
            ? 'Staking…'
            : side === null
              ? 'Pick an outcome'
              : `Stake ${amount} USDC on ${side ? 'TRUE' : 'FALSE'}`}
        </button>

        {account && <p className="balance-line">Connected: {account}</p>}
        {stage && <p className="balance-line">{stage}</p>}
        {txHash && (
          <a className="text-link" href={`https://testnet.arcscan.app/tx/${txHash}`} target="_blank" rel="noreferrer">
            Your transaction on arcscan <ArrowUpRight size={13} />
          </a>
        )}

        <p className="position-disclaimer">
          <Clock size={13} /> Staking closes in {Math.floor(closesIn / 60)}:{String(closesIn % 60).padStart(2, '0')},
          then <strong>Reveal answer</strong> settles it against the day&rsquo;s real snapshot.
          {' '}* Pool and payout above are illustrative; the settled figure is read from the contract.
        </p>
      </>
    );
  }

  const ready = !invalid && (joining ? reviewed : plan !== null);

  return (
    <>
      <h2>Your position</h2>

      {/* ⚠️ **WHOSE MONEY, SAID BEFORE ANYTHING IS TYPED.** The two branches spend different
          people's funds through different rails and a person must know which before pressing. */}
      <p>
        {joining
          ? "Claim #" + claim!.chainClaimId + " already backs this market, so your amount joins its side. " +
            "You sign from your own wallet on Arc and the USDC is yours."
          : 'No claim backs this market yet. Your report is committed with the analyst’s own USDC, through Circle — no wallet connects and you are not charged.'}
      </p>

      <label htmlFor="position-report">Supporting report</label>
      {/* ⚠️ Disabled in JOIN: `stake(marketId, claimId)` carries no report, and the claim's is
          already fixed. Shown rather than hidden so the position's evidence stays visible. */}
      <select
        id="position-report"
        className="choice"
        value={hash}
        disabled={busy || joining}
        onChange={(e) => {
          setHash(e.target.value);
          setPlan(null);
          setStop(null);
        }}
      >
        {joining ? (
          <option value={claim!.reportHash} style={OPTION}>
            {claim!.reportLabel}
          </option>
        ) : (
          reports.map((r) => (
            <option key={r.hash} value={r.hash} style={OPTION}>
              {r.label}
            </option>
          ))
        )}
      </select>
      <span className="position-sub">
        {joining
          ? `Fixed by claim #${claim!.chainClaimId} — stake() carries no report, so there is nothing to choose.`
          : `${reports.length} tokenized report${reports.length === 1 ? '' : 's'} by this analyst${chosen ? ` · ${chosen.isin}` : ''}`}
      </span>

      <label htmlFor="position-amount">{joining ? 'Your stake' : 'Analyst’s stake'}</label>
      <div className="amount-field">
        <input
          id="position-amount"
          value={amount}
          disabled={busy}
          inputMode="decimal"
          onChange={(e) => {
            setAmount(e.target.value);
            setPlan(null);
            setReviewed(false);
          }}
        />
        <span>USDC</span>
      </div>
      <div className="amount-shortcuts">
        {(joining ? ['0.01', '0.1', '1', '10'] : ['0.01', '0.1', '1']).map((v) => (
          <button
            key={v}
            type="button"
            className={amount === v ? 'active' : undefined}
            disabled={busy}
            onClick={() => {
              setAmount(v);
              setPlan(null);
              setReviewed(false);
            }}
          >
            {v}
          </button>
        ))}
      </div>

      {invalid && <p className="validation-message">{invalid}</p>}

      {/* ── the plan, in the narrow column ──────────────────────────────────────────────────── */}
      {!invalid && (joining ? reviewed : plan) && (
        <div className="transaction-receipt">
          <b>
            <span>side</span>
            <span>{joining ? (claim!.side ? 'TRUE' : 'FALSE') : plan!.side ? 'TRUE' : 'FALSE'}</span>
          </b>
          <b>
            <span>{joining ? 'joining claim' : 'from the ' + plan!.decidedFromDay + ' snapshot'}</span>
            <span>
              {joining
                ? `#${claim!.chainClaimId}`
                : Number(plan!.observed).toLocaleString('en-US', {maximumFractionDigits: 0})}
            </span>
          </b>
          <b>
            <span>amount</span>
            <span>{amount} USDC</span>
          </b>
          <b>
            <span>{joining ? 'from' : 'bound to proxy'}</span>
            <span>{joining ? 'your wallet' : plan!.binding.proxyAddress.slice(0, 12) + '…'}</span>
          </b>
          <b>
            <span>{joining ? 'pool after' : 'verdict'}</span>
            <span>
              {joining
                ? `${fromWei(claim!.side ? pools.t + wei! : pools.t)} / ${fromWei(claim!.side ? pools.f : pools.f + wei!)}`
                : (plan!.verdict ?? 'null')}
            </span>
          </b>
        </div>
      )}
      {!joining && plan && !invalid && <p className="position-sub">{plan.reason}</p>}

      {stop && (
        <p className="validation-message">
          <strong>
            {stop.kind === 'admission'
              ? 'Refused by the admission check. '
              : stop.kind === 'refused'
                ? 'Refused before spending. '
                : 'It did not run. '}
          </strong>
          {stop.message}
          {stop.kind === 'admission' && ' A prediction is only admitted if it is staked on tokenized work. Nothing was spent.'}
        </p>
      )}

      {/* ── ⚠️ ONE BUTTON. Its label says which call and whose money, and it only spends on the
             second press. ──────────────────────────────────────────────────────────────────── */}
      {!ready ? (
        <button
          className="btn dark-outline full"
          type="button"
          disabled={busy || invalid !== null}
          onClick={() => (joining ? setReviewed(true) : void commitPost(false))}
        >
          {busy ? 'Checking…' : 'Review this position'}
        </button>
      ) : (
        <button
          className="btn white full"
          type="button"
          disabled={busy}
          onClick={() => (joining ? void joinSend() : void commitPost(true))}
        >
          {busy
            ? joining ? 'Staking…' : 'Committing…'
            : joining
              ? `Stake ${amount} USDC from your wallet`
              : `Commit and stake ${amount} USDC of the analyst's`}
        </button>
      )}

      {txHash && !done && (
        <button className="btn dark-outline full" type="button" disabled={busy} onClick={() => void record(txHash)}>
          Record it
        </button>
      )}

      {account && <p className="balance-line">Connected: {account}</p>}
      {stage && <p className="balance-line">{stage}</p>}
      {txHash && (
        <a className="text-link" href={`https://testnet.arcscan.app/tx/${txHash}`} target="_blank" rel="noreferrer">
          Your transaction on arcscan <ArrowUpRight size={13} />
        </a>
      )}

      <p className="position-disclaimer">
        ⚠️ <strong>Real funds.</strong>{' '}
        {joining
          ? `You sign from your own wallet on Arc testnet. The native gas token is USDC at 18 decimals — the ERC-20 at the same address reports 6, a factor of 10¹² — so a stake must be a whole 6-decimal unit of at most ${fromWei(max)} USDC. It cannot be withdrawn before settlement.`
          : 'This spends the analyst’s own USDC through Circle, plus about 0.0068 USDC of gas. One claim per author per market, and it cannot be withdrawn before settlement.'}
      </p>
    </>
  );
}

'use client';

// The demo loop, played. Commit from the judge's own wallet, wait out the window, reveal.
//
// ── ⚠️ THREE TIERS, AND THE ONE THAT NEEDS NOTHING IS THE DEFAULT ───────────────────────────────
//
// §2.7, and the ordering is deliberate: the first thing a visitor does is press a button, and a
// wallet prompt at that moment loses most of them.
//
//   **watch it run**  no wallet, no USDC, no signature. The analyst has already committed its own
//                     claim, so there is a real position to settle and grade. Press Reveal.
//   wallet, no USDC   ⚠️ detected and said BEFORE anything is created or signed. A judge who is told
//                     after the fact has been charged our gas for nothing.
//   wallet + USDC     the full loop: their claim, their report, their side, their money.
//
// ── ⚠️ THE JUDGE COMMITS THEIR OWN CLAIM — `commitPrediction`, NOT `stake` ──────────────────────
//
// `stake(marketId, claimId)` joins an existing claim and **carries no report**: the side is read off
// the claim, so a staker picks a side rather than a piece of research. §2.3 settled this the other
// way — it is their wallet, their report, their bet — so this control calls
// `commitPrediction(marketId, reportHash, side)` from the connected wallet, which is a path
// `PositionControl` does not have: its COMMIT branch spends the **analyst's** money through Circle.
//
// ⚠️ **One claim per author per market, enforced by the contract and by a UNIQUE on `claims`.** A
// judge cannot commit twice here. They *can* pick the same question again — a new market with a
// later `closeTime` is a different market — and what stops that looping is the open-market cap and
// the gas behind it, not this rule.
//
// ── ⚠️ ONE MONEY NUMBER, AND IT IS THE REAL ONE ────────────────────────────────────────────────
//
// The ten participants are illustration and **no payout is ever derived from them**. The only figure
// in USDC on this surface is `payoutOf(marketId, account)` read from the contract. Two money numbers
// that ought to agree is exactly how they stop agreeing.
//
// ⚠️ **And the real number is usually boring, which is said BEFORE it is seen.** With the analyst and
// one judge, either the losing pool is empty and both get their stake back, or the judge picked the
// other side and the winner takes both. A judge who checks arcscan finds what the page predicted.

import {useEffect, useState} from 'react';
import {revealDemoMarket} from '../actions.js';
import {ArrowUpRight, Check, Clock} from '../../components/Icons.js';

export interface DemoReport {
  hash: string;
  label: string;
}

interface Eip1193 {
  request(args: {method: string; params?: unknown[]}): Promise<unknown>;
}

/** Arc testnet, 5042002. */
const ARC_CHAIN_ID = '0x4cef52';
/** ⚠️ `AlphaMarket.sol:93` — 1e12 wei per 6-decimal USDC unit. A stake that is not a whole unit
 *  reverts `NotAUsdcUnit`, so the field is checked against this before anything is signed. */
const UNIT_SCALE = 1_000_000_000_000n;
/** Gas headroom over the stake, so a judge is not left unable to pay for their own transaction. */
const GAS_HEADROOM = 50_000_000_000_000_000n; // 0.05 USDC

const OPTION = {color: '#151515', background: '#ffffff'} as const;

const fromWei = (wei: bigint): string => {
  const s = (wei / 10n ** 18n).toString();
  const f = (wei % 10n ** 18n).toString().padStart(18, '0').replace(/0+$/, '');
  return f ? `${s}.${f}` : s;
};

/** ⚠️ Decimal string → wei by hand. **No `parseFloat`** — a double holds ~15 significant digits. */
function toWei(input: string): bigint | null {
  const t = input.trim();
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const [whole, frac = ''] = t.split('.');
  if (frac.length > 18) return null;
  return BigInt(whole!) * 10n ** 18n + BigInt(frac.padEnd(18, '0') || '0');
}

/**
 * `commitPrediction(uint256,bytes32,bool)` — encoded by hand so no ABI blob reaches the client.
 *
 * ⚠️ **Three static 32-byte words and nothing dynamic**, which is the only reason hand-encoding is
 * defensible here. `PositionControl` receives its `stake` calldata pre-encoded from the server
 * because its arguments are fixed; these are not — the judge picks the report and the side — so the
 * bytes have to be built where the choice is made.
 *
 * ⚠️ **The selector was computed with `ethers.id()` and checked, not guessed.** The first two
 * attempts at these by hand were both wrong, which is exactly the failure that would present as an
 * unexplained revert after a judge had signed.
 */
function encodeCommit(marketId: string, reportHash: string, side: boolean): string {
  const sel = '0xcdb24e7d';
  const a = BigInt(marketId).toString(16).padStart(64, '0');
  const b = reportHash.replace(/^0x/, '').padStart(64, '0');
  const c = (side ? 1n : 0n).toString(16).padStart(64, '0');
  return `${sel}${a}${b}${c}`;
}

function useCountdown(target: number): number {
  const [left, setLeft] = useState(() => Math.max(0, Math.ceil((target - Date.now()) / 1000)));
  useEffect(() => {
    const t = setInterval(() => setLeft(Math.max(0, Math.ceil((target - Date.now()) / 1000))), 1000);
    return () => clearInterval(t);
  }, [target]);
  return left;
}

const mmss = (s: number): string => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export function DemoControl({
  chainMarketId,
  contractAddress,
  rpcUrl,
  reports,
  closeTimeMs,
  observationEndMs,
  state,
  outcome,
  observedDay,
  deployment,
}: {
  chainMarketId: string;
  contractAddress: string;
  rpcUrl: string;
  reports: DemoReport[];
  closeTimeMs: number;
  observationEndMs: number;
  state: 'open' | 'closed' | 'resolved' | 'voided';
  outcome: boolean | null;
  observedDay: string;
  deployment: string;
}) {
  const [account, setAccount] = useState<string | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [hash, setHash] = useState(reports[0]?.hash ?? '');
  const [side, setSide] = useState<boolean | null>(null);
  const [amount, setAmount] = useState('0.01');
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState('');
  const [stop, setStop] = useState<string | null>(null);
  const [committed, setCommitted] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<{note: string; graded?: number} | null>(null);
  const [payout, setPayout] = useState<bigint | null>(null);

  const toClose = useCountdown(closeTimeMs);
  const toReveal = useCountdown(observationEndMs);
  const stillOpen = state === 'open' && toClose > 0;
  const settled = state === 'resolved' || state === 'voided' || revealed !== null;

  const eth = (): Eip1193 | null =>
    typeof window === 'undefined' ? null : ((window as {ethereum?: Eip1193}).ethereum ?? null);

  async function rpc<T>(method: string, params: unknown[]): Promise<T> {
    const r = await fetch(rpcUrl, {
      method: 'POST', headers: {'content-type': 'application/json'},
      body: JSON.stringify({jsonrpc: '2.0', id: 1, method, params}),
    });
    const j = (await r.json()) as {result?: T; error?: {message: string}};
    if (j.error) throw new Error(j.error.message);
    return j.result as T;
  }

  /** ⚠️ Balance BEFORE anything is signed — tier 2's whole point. */
  async function connect(): Promise<void> {
    setStop(null);
    const provider = eth();
    if (!provider) {
      setStop('No browser wallet found. That is not a dead end — the analyst has already staked on this market, so Reveal below runs the whole loop without one.');
      return;
    }
    setBusy(true);
    try {
      const accounts = (await provider.request({method: 'eth_requestAccounts'})) as string[];
      const who = accounts[0]!;
      const chain = (await provider.request({method: 'eth_chainId'})) as string;
      if (chain !== ARC_CHAIN_ID) {
        try {
          await provider.request({method: 'wallet_switchEthereumChain', params: [{chainId: ARC_CHAIN_ID}]});
        } catch {
          await provider.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: ARC_CHAIN_ID, chainName: 'Arc Testnet',
              nativeCurrency: {name: 'USDC', symbol: 'USDC', decimals: 18},
              rpcUrls: [rpcUrl], blockExplorerUrls: ['https://testnet.arcscan.net'],
            }],
          });
        }
        const after = (await provider.request({method: 'eth_chainId'})) as string;
        if (after !== ARC_CHAIN_ID) { setStop('Still not on Arc testnet. Switch the network and try again.'); return; }
      }
      const bal = BigInt((await rpc<string>('eth_getBalance', [who, 'latest'])) ?? '0x0');
      setAccount(who);
      setBalance(bal);
      // ⚠️ Said now, not after a transaction. Charging our gas and then refusing them is the demo
      // failing at step one.
      if (bal < GAS_HEADROOM) {
        setStop(`This wallet holds ${fromWei(bal)} USDC on Arc, which will not cover a stake and its gas. You can still press Reveal — the analyst's own claim is what settles.`);
      }
    } catch (e) {
      setStop((e as Error).message);
    } finally { setBusy(false); }
  }

  async function commitAsJudge(): Promise<void> {
    setStop(null);
    const provider = eth();
    if (!provider || !account) return;
    if (side === null) { setStop('Pick TRUE or FALSE first — commitPrediction carries a side and the contract will not guess one.'); return; }
    const wei = toWei(amount);
    if (wei === null || wei <= 0n) { setStop('That is not an amount.'); return; }
    if (wei % UNIT_SCALE !== 0n) { setStop('The contract takes whole 6-decimal USDC units and reverts NotAUsdcUnit otherwise. Try 0.01.'); return; }
    if (balance !== null && balance < wei + GAS_HEADROOM) { setStop(`That is more than this wallet can cover with gas — it holds ${fromWei(balance)} USDC.`); return; }

    setBusy(true);
    try {
      setStage('Confirm in your wallet…');
      const tx = (await provider.request({
        method: 'eth_sendTransaction',
        params: [{from: account, to: contractAddress, value: `0x${wei.toString(16)}`, data: encodeCommit(chainMarketId, hash, side)}],
      })) as string;
      setStage('Waiting for the receipt…');
      // ⚠️ A hash is not a mined transaction. Poll until the receipt exists and says status 1.
      for (let i = 0; i < 60; i += 1) {
        const r = await rpc<{status: string} | null>('eth_getTransactionReceipt', [tx]);
        if (r) {
          if (r.status !== '0x1') throw new Error('The commit reverted on chain.');
          setCommitted(tx);
          setStage('');
          return;
        }
        await new Promise((res) => setTimeout(res, 2000));
      }
      throw new Error('No receipt within two minutes — it may still be in flight.');
    } catch (e) {
      setStop((e as Error).message);
      setStage('');
    } finally { setBusy(false); }
  }

  async function reveal(): Promise<void> {
    setStop(null); setBusy(true); setStage('Reading the day from The Graph…');
    try {
      const r = await revealDemoMarket(chainMarketId);
      if (!r.ok) { setStop(r.why); return; }
      setRevealed({note: r.note, graded: r.graded});
      if (account) {
        // ⚠️ `payoutOf(uint256,address)` — the real pool, the only money figure on this page.
        const data = `0x16df4910${BigInt(chainMarketId).toString(16).padStart(64, '0')}${account.replace(/^0x/, '').toLowerCase().padStart(64, '0')}`;
        try {
          const out = await rpc<string>('eth_call', [{to: contractAddress, data}, 'latest']);
          setPayout(BigInt(out));
        } catch { /* absent rather than zero */ }
      }
    } catch (e) {
      setStop((e as Error).message);
    } finally { setBusy(false); setStage(''); }
  }

  return (
    <div className="holdings-panel panel" style={{marginTop: 20}}>
      <div className="section-title">
        <div>
          <span className="eyebrow">RUN THE LOOP</span>
          <h2>{settled ? 'Settled' : stillOpen ? 'Staking is open' : 'Staking has closed'}</h2>
        </div>
        <span className="badge">
          {settled ? 'done' : stillOpen ? mmss(toClose) : toReveal > 0 ? `reveal in ${mmss(toReveal)}` : 'ready'}
        </span>
      </div>

      {/* ── ⚠️ SAID FIRST, BEFORE ANY NUMBER IS SEEN ─────────────────────────────────────────── */}
      <p className="market-statline" style={{display: 'block', lineHeight: 1.6, paddingTop: 0}}>
        ⚠️ <strong>The answer already exists.</strong> {observedDay} finished days ago and its
        snapshot is public — you could read it off The Graph yourself in about a minute, and nothing
        here stops you. What settlement proves is not that the figure was secret but that it was
        read <em>after</em> you committed, hashed, and put on chain: the evidence hash in the resolve
        transaction is the same bytes either of us can re-derive.
      </p>

      {!settled && (
        <p className="market-statline" style={{display: 'block', lineHeight: 1.6}}>
          ⚠️ <strong>You are one of two real stakes here at most.</strong> The analyst has committed
          0.01 USDC of its own; the ten participants below are illustration and hold nothing. So a
          correct call returns your stake and little or nothing more, and a wrong one loses it to the
          other side. Arcscan will show two stakers, not twelve.
        </p>
      )}

      {stillOpen && (
        <>
          {!account ? (
            <div style={{display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap'}}>
              <button className="btn white" onClick={() => void connect()} disabled={busy}>
                Connect a wallet to stake
              </button>
              <span className="holdings-sub">
                or skip it — the analyst&rsquo;s claim settles either way and Reveal needs no wallet
              </span>
            </div>
          ) : committed ? (
            <p className="market-statline" style={{display: 'block'}}>
              <Check size={14} /> <strong>Your claim is on chain.</strong>{' '}
              <a className="text-link" href={`https://testnet.arcscan.net/tx/${committed}`} target="_blank" rel="noreferrer">
                {committed.slice(0, 18)}… <ArrowUpRight size={13} />
              </a>{' '}
              Now wait for staking to close.
            </p>
          ) : (
            <div style={{display: 'grid', gap: 10}}>
              <label className="holdings-sub" htmlFor="demo-report">Back a report — this is what gets graded</label>
              <select id="demo-report" value={hash} onChange={(e) => setHash(e.target.value)} style={OPTION}>
                {reports.map((r) => (
                  <option key={r.hash} value={r.hash} style={OPTION}>{r.label}</option>
                ))}
              </select>
              <div style={{display: 'flex', gap: 8}}>
                <button className={`btn ${side === true ? 'white' : ''}`} onClick={() => setSide(true)}>TRUE</button>
                <button className={`btn ${side === false ? 'white' : ''}`} onClick={() => setSide(false)}>FALSE</button>
                <input
                  aria-label="Stake in USDC" value={amount} onChange={(e) => setAmount(e.target.value)}
                  style={{maxWidth: 110}} inputMode="decimal"
                />
              </div>
              <button className="btn white" onClick={() => void commitAsJudge()} disabled={busy || side === null}>
                {busy ? (stage || 'Working…') : `Commit ${amount} USDC on ${side === null ? '…' : side ? 'TRUE' : 'FALSE'}`}
              </button>
              <span className="holdings-sub">
                {account.slice(0, 10)}… · {balance === null ? 'balance unknown' : `${fromWei(balance)} USDC on Arc`}
              </span>
            </div>
          )}
        </>
      )}

      {/* ── ⚠️ THE WAIT. A countdown with nothing beside it is a page someone leaves. ─────────── */}
      {!settled && !stillOpen && toReveal > 0 && (
        <div className="empty-state" style={{textAlign: 'left'}}>
          <h2><Clock size={15} /> {mmss(toReveal)} until you can reveal</h2>
          <p>
            Staking had to close before settlement can run — that ordering is the parimutuel rule, not
            a loading screen. While it runs down, this is exactly what pressing Reveal will do:
          </p>
          <ol style={{lineHeight: 1.7, paddingLeft: 18}}>
            <li>
              Query deployment <code>{deployment.slice(0, 24)}…</code> for the{' '}
              <code>financialsDailySnapshot</code> covering {observedDay} UTC — one row, unpinned, so
              the read carries a block timestamp the freshness rule can check.
            </li>
            <li>
              Canonicalize the response, <code>sha256</code> it, and store those exact bytes before
              anything goes on chain. A hash on a public chain with nothing behind it is worse than
              no evidence at all.
            </li>
            <li>
              Call <code>resolve(marketId, outcome, evidenceHash)</code>. Those 32 bytes cannot be
              amended afterwards, which is why they are written down first.
            </li>
          </ol>
        </div>
      )}

      {!settled && !stillOpen && toReveal <= 0 && (
        <button className="btn white" onClick={() => void reveal()} disabled={busy}>
          {busy ? (stage || 'Working…') : 'Reveal — read the day and settle it'}
        </button>
      )}

      {revealed && (
        <div className="empty-state" style={{textAlign: 'left'}}>
          <h2>{revealed.note}</h2>
          <p>
            The market is resolved on chain and{' '}
            {revealed.graded ? `${revealed.graded} claim${revealed.graded === 1 ? '' : 's'} graded` : 'the claims are graded'}.
            {payout !== null && (
              <>
                {' '}Your payout is <strong>{fromWei(payout)} USDC</strong>, claimable from the
                contract — the real pool, not the illustration.
              </>
            )}
          </p>
          <p>
            ⚠️ This result is <strong>not</strong> in the analyst&rsquo;s forecast record and not in
            its planning prompt. What keeps it out is <code>pastPosted</code> — arithmetic over this
            market&rsquo;s own timestamps — and <strong>not</strong> the fact that the claim is yours.
            On a market the analyst commits to, the author filter does nothing at all.
          </p>
          <a className="text-link" href="/analyst">See it on the analyst&rsquo;s record <ArrowUpRight size={13} /></a>
        </div>
      )}

      {state === 'resolved' && !revealed && (
        <p className="market-statline" style={{display: 'block'}}>
          Already settled — this market resolved {outcome ? 'TRUE' : 'FALSE'}. Pick another question
          from <a className="text-link" href="/markets">the index</a> to run the loop again.
        </p>
      )}

      {stop && (
        <p className="market-statline" style={{display: 'block', lineHeight: 1.6}}>⚠️ {stop}</p>
      )}
    </div>
  );
}

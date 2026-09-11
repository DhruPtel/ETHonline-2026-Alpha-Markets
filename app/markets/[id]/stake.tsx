'use client';

// Connect a browser wallet and stake. ⚠️ **The visitor signs and the visitor pays.**
//
// ⚠️ **This is the opposite of `report/[hash]/buy.tsx` and that is deliberate.** There, an agent pays
// from its own Hedera account and no browser signs anything. Here the money is the visitor's, the
// signature is the visitor's, and the page must not blur that. A5 asks for value moving on Arc from
// somebody who is not us; nothing server-signed can demonstrate it.
//
// ⚠️ **NO LIBRARY. `window.ethereum` and nothing else** — no wagmi, no WalletConnect, no `ethers` in
// this bundle. The full calldata arrives already encoded from the server component, because
// `marketId` and `claimId` are fixed for the page, so there is no ABI work left for a browser to do.
// Decimal-to-wei is exact `BigInt` string arithmetic below; `parseUnits` would have cost 100 kB to
// pad a string.
//
// ⚠️ **NO SIDE CONTROL, AND ITS ABSENCE IS THE FEATURE.** `stake(marketId, claimId)` takes no side —
// the contract reads it off the claim. See the page header.
//
// ── ⚠️ The two things about Arc that break naive wallet code ─────────────────────────────────────
//
// 1. **The native gas token is USDC, not ether.** `wallet_addEthereumChain` is told so explicitly.
// 2. **It is 18 decimals, on a token the world knows as 6.** SM-08 measured it: `msg.value` is 18-dp
//    while `decimals()` at `0x3600…0000` returns 6, and both are right for their own interface. A
//    wallet that gets this wrong is off by a factor of a trillion and the number still looks
//    plausible. ⚠️ The contract's own rule follows from it: `msg.value % 1e12 != 0` reverts
//    `NotAUsdcUnit`, so a stake is a **whole 6-dp USDC unit** — at most six decimal places. That is
//    checked here, before signing, because a revert costs the staker gas for nothing.

import { useState } from 'react';

const ARC_CHAIN_ID = '0x4cef52';   // 5042002
const UNIT_SCALE = 1_000_000_000_000n;   // 1e12 — AlphaMarket.sol's own constant

interface Eip1193 {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

/**
 * Decimal USDC → 18-dp wei, exactly. ⚠️ **Never `Number`.** 18-dp USDC passes
 * `Number.MAX_SAFE_INTEGER` at about 9.22 USDC, which is inside the range someone would actually
 * type. Returns null on anything that is not a plain non-negative decimal.
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

export function Stake(props: {
  marketId: string; claimId: string; side: boolean; open: boolean;
  contractAddress: string; rpcUrl: string; maxStakeWei: string; callData: string;
  initialPoolTrue: string; initialPoolFalse: string;
}) {
  const [amount, setAmount] = useState('1');
  const [account, setAccount] = useState<string | null>(null);
  const [stage, setStage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pools, setPools] = useState({ t: BigInt(props.initialPoolTrue), f: BigInt(props.initialPoolFalse) });
  const [recorded, setRecorded] = useState(false);

  const max = BigInt(props.maxStakeWei);
  const wei = toWei(amount);

  // ⚠️ Every refusal the contract would charge for, decided here first. The messages name the
  // contract's own error so an operator reading a revert and a reader of this page see one thing.
  const invalid: string | null =
    wei === null ? 'Enter a plain decimal amount, e.g. 1 or 0.5.'
    : wei === 0n ? 'A stake must be greater than zero — the contract reverts ZeroStake.'
    : wei % UNIT_SCALE !== 0n ? `Arc’s native USDC is 18-decimal but a stake must be a whole 6-decimal USDC unit, so at most six decimal places. ${amount} is not one — the contract reverts NotAUsdcUnit.`
    : wei > max ? `The contract caps a single stake at ${fromWei(max)} USDC — it reverts OverStakeCap.`
    : null;

  const eth = (): Eip1193 => {
    const injected = (globalThis as { ethereum?: Eip1193 }).ethereum;
    if (!injected) throw new Error('No browser wallet found. Install MetaMask (or any EIP-1193 wallet) and reload.');
    return injected;
  };

  /** ⚠️ Switch first, add only if the wallet says it does not know the chain (EIP-1193 code 4902). */
  const ensureArc = async (): Promise<void> => {
    const provider = eth();
    if ((await provider.request({ method: 'eth_chainId' })) === ARC_CHAIN_ID) return;
    try {
      setStage('asking the wallet to switch to Arc testnet…');
      await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: ARC_CHAIN_ID }] });
    } catch (e) {
      if ((e as { code?: number }).code !== 4902) throw e;
      setStage('asking the wallet to add Arc testnet…');
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: ARC_CHAIN_ID,
          chainName: 'Arc Testnet',
          // ⚠️ USDC, 18 decimals. See the header — this is the pair wallets get wrong.
          nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
          rpcUrls: [props.rpcUrl],
          blockExplorerUrls: ['https://testnet.arcscan.app'],
        }],
      });
    }
    if ((await provider.request({ method: 'eth_chainId' })) !== ARC_CHAIN_ID) {
      throw new Error('The wallet is still not on Arc testnet. Switch it by hand and try again.');
    }
  };

  const connect = async (): Promise<string> => {
    setStage('waiting for the wallet to connect…');
    const accounts = await eth().request({ method: 'eth_requestAccounts' }) as string[];
    const first = accounts[0];
    if (!first) throw new Error('The wallet returned no account.');
    setAccount(first);
    return first;
  };

  /**
   * ⚠️ **Post the hash, then reconcile.** `gate.ts`'s discipline: the identifier is handed to the
   * server the moment it exists, before anything about it can be confirmed. The route waits for the
   * receipt and records the stake from the `Staked` event — the chain's own numbers, never the
   * browser's claim about them. `stakes.tx_hash` is UNIQUE, so posting the same hash again is a
   * no-op rather than a second row, which is what makes the retry button safe.
   */
  const post = async (hash: string): Promise<void> => {
    setStage('waiting for the transaction to be mined…');
    const res = await fetch(`/api/markets/${props.marketId}/refresh`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ txHash: hash }),
    });
    const body = await res.json() as {
      recorded?: boolean; pending?: boolean; reverted?: boolean; error?: string;
      poolTrue?: string; poolFalse?: string;
    };
    if (body.poolTrue && body.poolFalse) setPools({ t: BigInt(body.poolTrue), f: BigInt(body.poolFalse) });
    if (body.reverted) { setError(`Transaction ${hash} reverted on chain. Nothing was staked; the gas is spent.`); return; }
    if (body.recorded) { setRecorded(true); setStage('staked, and recorded.'); return; }
    setStage(body.pending
      ? 'Still not mined. The hash is safe — press “Record it” to try again.'
      : `Not recorded yet${body.error ? `: ${body.error}` : ''}. Press “Record it” to try again.`);
  };

  const go = async () => {
    setBusy(true); setError(null); setRecorded(false);
    try {
      const from = account ?? await connect();
      await ensureArc();
      setStage('confirm the stake in your wallet…');
      const hash = await eth().request({
        method: 'eth_sendTransaction',
        params: [{ from, to: props.contractAddress, value: `0x${wei!.toString(16)}`, data: props.callData }],
      }) as string;
      setTxHash(hash);
      await post(hash);
    } catch (e) {
      const err = e as { code?: number; message?: string };
      setError(err.code === 4001 ? 'You rejected the request in the wallet. Nothing was sent.' : err.message ?? String(e));
      setStage('');
    } finally {
      setBusy(false);
    }
  };

  const retry = async () => {
    if (!txHash) return;
    setBusy(true); setError(null);
    try { await post(txHash); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const analystPool = props.side ? pools.t : pools.f;
  const otherPool = props.side ? pools.f : pools.t;

  if (!props.open) {
    return (
      <section className="buy">
        <h2>Staking is closed</h2>
        <p className="empty">This market passed its close time. No further stakes can be accepted.</p>
      </section>
    );
  }

  return (
    <section className="buy">
      <h2>Stake alongside the analyst</h2>
      <p>
        Your stake joins the <strong>{props.side ? 'TRUE' : 'FALSE'}</strong> side, because that is
        the side of claim #{props.claimId}. You pay from your own wallet in Arc testnet USDC.
      </p>

      <p>
        <label>
          Amount (USDC){' '}
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal"
                 size={12} disabled={busy} aria-label="Stake amount in USDC" />
        </label>
      </p>

      {invalid && <p className="buy-error">{invalid}</p>}

      <p>
        <button className="buy" onClick={go} disabled={busy || invalid !== null}>
          {busy ? 'Working…' : account ? `Stake ${amount} USDC` : 'Connect wallet and stake'}
        </button>
        {txHash && !recorded && (
          <>{' '}<button className="buy" onClick={retry} disabled={busy}>Record it</button></>
        )}
      </p>

      {account && <p className="meta mono">Connected: {account}</p>}
      {stage && <p className="buy-stage">{stage}</p>}
      {error && <p className="buy-error">{error}</p>}

      {txHash && (
        <p className="settled-links mono">
          <a href={`https://testnet.arcscan.app/tx/${txHash}`} target="_blank" rel="noreferrer">
            {txHash.slice(0, 24)}… on arcscan →
          </a>
        </p>
      )}

      {recorded && (
        <dl className="identity">
          <div><dt>Analyst&rsquo;s side now</dt><dd className="mono">{fromWei(analystPool)} USDC</dd></div>
          <div><dt>Other side</dt><dd className="mono">{fromWei(otherPool)} USDC</dd></div>
          <div><dt>Total pool</dt><dd className="mono">{fromWei(pools.t + pools.f)} USDC</dd></div>
        </dl>
      )}
    </section>
  );
}

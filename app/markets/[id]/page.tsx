// One market, and enough of it to stake on.
//
// ⚠️ **THE FIRST BROWSER-SIGNED TRANSACTION IN THIS PROJECT, AND THE NEAREST PAGE ARGUES THE
// OPPOSITE CASE.** `report/[hash]/buy.tsx` says it plainly — *"An AGENT pays. The visitor does
// not… Nobody's wallet is connected, no browser signs anything."* That is true of the paywall and
// false here, deliberately: A5 wants value moving on Arc from a party that is not us, and an agent
// paying itself does not show that. Every other chain write in this repo is server-signed. This one
// is the exception and the exception is the point.
//
// ⚠️ **Unit 13 owns the real market pages.** This carries only what a staker must see to decide:
// what is being asked, what the analyst committed to, where the pools stand, and a control.
//
// ⚠️ **THE SIDE IS NOT CHOSEN HERE AND THERE IS NO SIDE CONTROL ANYWHERE ON THIS PAGE.** §5.2 has
// `stake(marketId, claimId)` — a staker stakes *alongside a claim*, and the contract reads the side
// off that claim (`_add(m, marketId, c.side, msg.value)`). Offering a TRUE/FALSE toggle would build
// the hole the contract closed: two people could then back opposite sides of one claim and the
// claim would no longer mean anything.
//
// ⚠️ **`[id]` IS THE CHAIN MARKET ID, NOT THE STORE ID.** Store ids are `m/4fad94e5…` and a slash
// cannot live in one route segment. The chain id is also the public identity of a market — the
// number in the contract, in the events and on arcscan — so `/markets/6` is the honest URL. Unit 13
// inherits this.
//
// ⚠️ **No `NEXT_PUBLIC_` anything, and none is needed.** A server component can hand a client
// component props, so the contract address, the chain id and the RPC URL cross that line as
// arguments rather than as build-time globals. `.env` holds `HEDERA_SELLER_KEY`,
// `CIRCLE_ENTITY_SECRET` and `ARC_DEPLOYER_KEY`; nothing from it is inlined into a bundle.
//
// ⚠️ **A minimal inline ABI, never `src/arc/abi.ts`.** That artifact carries creation and deployed
// bytecode — importing it here would ship the contract's bytes to every visitor. `/api/holdings`
// set this precedent for the same reason.

import { notFound } from 'next/navigation.js';
import { ethers } from 'ethers';
import { db } from '../../../src/store/db.js';
import { requiredEnv } from '../../../src/config/env.js';
import { Stake } from './stake.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** ⚠️ Only what this page reads and the one function it sends. See the header. */
const MARKET_ABI = [
  'function markets(uint256) view returns (bytes32 questionId, bytes32 specHash, uint64 closeTime, uint64 observationEnd, uint64 resolveDeadline, bool resolved, bool outcome, bool voided, bytes32 evidenceHash, uint256 poolTrue, uint256 poolFalse)',
  'function MAX_STAKE() view returns (uint256)',
  'function stake(uint256 marketId, uint256 claimId) payable',
];

interface Spec {
  slug: string; metric: string; comparison: 'above' | 'below'; threshold: string; observedDay: string;
}

const usdc = (wei: bigint): string => ethers.formatUnits(wei, 18);
const when = (d: Date) => `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
const grouped = (decimal: string) => Number(decimal).toLocaleString('en-US');

export default async function MarketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();

  const [market] = await db()<{
    id: string; spec_json: string; observed_day: string; close_time: Date; observation_end: Date;
    resolve_deadline: Date; contract_address: string; resolved_at: Date | null; voided_at: Date | null;
  }[]>`
    SELECT id, spec_json, observed_day, close_time, observation_end, resolve_deadline,
           contract_address, resolved_at, voided_at
    FROM markets WHERE chain_market_id = ${id} AND contract_address = ${requiredEnv('ARC_MARKET_ADDRESS')}`;
  if (!market) notFound();

  // ⚠️ **One claim, and the page refuses rather than guessing if there is not exactly one.** A
  // staker stakes alongside a specific claim; with two on a market, "the analyst's side" is not a
  // thing a page can name. The contract allows several authors — this unit does not.
  const claims = await db()<{ id: string; chain_claim_id: string; author: string; side: boolean; amount: string }[]>`
    SELECT id, chain_claim_id, author, side, amount FROM claims
    WHERE market_id = ${market.id} AND chain_claim_id IS NOT NULL ORDER BY created_at`;
  const claim = claims.length === 1 ? claims[0]! : null;

  const spec = JSON.parse(market.spec_json) as Spec;
  const rpcUrl = requiredEnv('ARC_RPC_URL');
  // ⚠️ **The wallet gets this URL, so it must not be able to carry a credential.** Today it is the
  // public endpoint SM-09 walked; if it is ever swapped for a keyed one, handing it to every visitor
  // would be a disclosure nobody would notice. Checked rather than trusted.
  const parsed = new URL(rpcUrl);
  const publicRpc = parsed.username || parsed.password || parsed.search || parsed.pathname !== '/'
    ? 'https://rpc.testnet.arc.network'
    : rpcUrl;

  const contract = new ethers.Contract(market.contract_address, MARKET_ABI, new ethers.JsonRpcProvider(publicRpc, undefined, { staticNetwork: true }));
  const onChain = await contract.markets!(BigInt(id));
  const maxStake = await contract.MAX_STAKE!() as bigint;
  const poolTrue = onChain.poolTrue as bigint;
  const poolFalse = onChain.poolFalse as bigint;

  const recorded = await db()<{ staker: string; amount: string; side: boolean; tx_hash: string; staked_at: Date }[]>`
    SELECT staker, amount, side, tx_hash, staked_at FROM stakes
    WHERE market_id = ${market.id} ORDER BY seq`;

  const closesAt = market.close_time;
  const open = Date.now() < closesAt.getTime() && !market.resolved_at && !market.voided_at;
  const analystPool = claim?.side ? poolTrue : poolFalse;
  const otherPool = claim?.side ? poolFalse : poolTrue;

  return (
    <main>
      <p className="back"><a href="/">← All reports</a></p>
      <article className="memo">
        <h1>
          Will {spec.slug}&rsquo;s {spec.metric} be {spec.comparison} ${grouped(spec.threshold)} on {spec.observedDay}?
        </h1>

        <p className="lede">
          Settled by re-reading the deployment&rsquo;s daily snapshot for {spec.observedDay} UTC from
          The Graph. A tie resolves FALSE.
        </p>

        <dl className="identity">
          <div><dt>Market</dt><dd className="mono">#{id}</dd></div>
          <div><dt>Contract</dt><dd className="mono break">{market.contract_address}</dd></div>
          <div><dt>Staking closes</dt><dd className="mono">{when(closesAt)}</dd></div>
          <div><dt>Observation ends</dt><dd className="mono">{when(market.observation_end)}</dd></div>
          <div><dt>Resolve deadline</dt><dd className="mono">{when(market.resolve_deadline)}</dd></div>
        </dl>

        <section>
          <h2>The analyst&rsquo;s position</h2>
          {claim ? (
            <>
              <p>
                The analyst committed <strong>{claim.side ? 'TRUE' : 'FALSE'}</strong> and staked{' '}
                <strong>{usdc(BigInt(claim.amount))} USDC</strong> of its own money on it.
              </p>
              <dl className="identity">
                <div><dt>Claim</dt><dd className="mono">#{claim.chain_claim_id}</dd></div>
                <div><dt>Author</dt><dd className="mono break">{claim.author}</dd></div>
              </dl>
              <p className="no-durable">
                ⚠️ Staking here backs <em>this claim</em>. The side is the claim&rsquo;s, read by the
                contract from the claim itself — there is nothing to choose. To take the other side
                somebody has to publish their own claim.
              </p>
            </>
          ) : (
            <p className="empty">
              This market has {claims.length === 0 ? 'no committed claim' : `${claims.length} claims`},
              so there is no single side to stake alongside. Nothing can be staked from this page.
            </p>
          )}
        </section>

        <section>
          <h2>The pool</h2>
          <dl className="identity">
            <div><dt>On the analyst&rsquo;s side</dt><dd className="mono">{usdc(analystPool)} USDC</dd></div>
            <div><dt>On the other side</dt><dd className="mono">{usdc(otherPool)} USDC</dd></div>
            <div><dt>Total</dt><dd className="mono">{usdc(poolTrue + poolFalse)} USDC</dd></div>
          </dl>
          {/* ⚠️ Read from the chain, not from `stakes`. The table records what we were told about;
              the contract records what it holds, and only one of those is the money. */}
          <p className="meta">Read from the contract, not from our database.</p>
        </section>

        {claim && (
          <Stake
            marketId={id}
            claimId={claim.chain_claim_id}
            side={claim.side}
            open={open}
            contractAddress={market.contract_address}
            rpcUrl={publicRpc}
            maxStakeWei={maxStake.toString()}
            initialPoolTrue={poolTrue.toString()}
            initialPoolFalse={poolFalse.toString()}
            /* ⚠️ The whole calldata, encoded on the SERVER from the minimal ABI above. The client
               therefore needs no encoder and no `ethers` — `marketId` and `claimId` are fixed for
               this page, so there is nothing left for a browser to compute. */
            callData={new ethers.Interface(MARKET_ABI).encodeFunctionData('stake', [BigInt(id), BigInt(claim.chain_claim_id)])}
          />
        )}

        <section>
          <h2>Stakes recorded</h2>
          {recorded.length === 0 ? (
            <p className="empty">No human stakes recorded yet.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Staker</th><th>Side</th><th>Amount</th><th>Transaction</th></tr></thead>
                <tbody>
                  {recorded.map((s) => (
                    <tr key={s.tx_hash}>
                      <td className="mono break">{s.staker}</td>
                      <td>{s.side ? 'TRUE' : 'FALSE'}</td>
                      <td className="mono">{usdc(BigInt(s.amount))} USDC</td>
                      <td className="mono">
                        <a href={`https://testnet.arcscan.app/tx/${s.tx_hash}`} target="_blank" rel="noreferrer">
                          {s.tx_hash.slice(0, 18)}…
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </article>
    </main>
  );
}

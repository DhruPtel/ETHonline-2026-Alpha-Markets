// POST /api/markets/[id]/refresh — take a stake or commit transaction hash, confirm it, record it.
//
// ⚠️ **WRITE THE IDENTIFIER BEFORE YOU CAN CONFIRM IT.** `gate.ts`'s discipline: the browser hands
// over the hash the moment `eth_sendTransaction` returns, which is *before* the transaction is
// mined. This route waits for the receipt and records what the chain says. If the wait runs out the
// answer is `pending` rather than an error — the hash is still good, the page keeps it, and posting
// it again finishes the job. ⚠️ `stakes.tx_hash` is UNIQUE and the insert is `ON CONFLICT DO
// NOTHING`, so a retry is a no-op rather than a duplicate row.
//
// ⚠️ **THE AMOUNTS COME OFF THE `Staked` EVENT, NEVER OFF THE REQUEST BODY.** The browser sends one
// thing — a transaction hash — and everything else is read from the chain: staker, side, amount,
// block. A client that lied about its stake would be recording a row the contract disagrees with,
// and this is a public endpoint.
//
// ⚠️ **The side is the CLAIM's, and it is checked rather than assumed.** The contract takes no side
// argument; `_add` uses `c.side`. The event echoes what was actually credited, and the row is
// refused if it disagrees with the claim we hold — that mismatch would mean our store and the chain
// disagree about what a claim is.
//
// ── ⚠️ A COMMIT IS RECORDED HERE TOO — THE JUDGE'S OWN CLAIM ON A DEMO MARKET ───────────────────
//
// A judge on a demo market calls `commitPrediction` from their own wallet, and that emits
// **`PredictionCommitted`, not `Staked`**. This route used to look only for `Staked`, so every such
// commit came back 422 and nothing wrote the claim: the report was on chain, in no list, and never
// graded. A commit now becomes a `claims` row — off the event, never the body — on three conditions:
// a demo market (a forecast's claims come through `prepare()`, and a second claim would make it
// unjoinable), a tokenized report (the admission rule), and `market.ts`'s id rule, so one author on
// one market has one id however the claim arrived.
//
// ⚠️ **A minimal inline ABI, not `src/arc/abi.ts`.** Same reason as the page: that artifact carries
// the bytecode. `/api/holdings` set the precedent.
//
// ⚠️ **`maxDuration = 60`, not 300.** Vercel Hobby's ceiling is 60 seconds and a declared 300 is
// silently clamped — accepted, no build warning, deployment READY carrying 60. The receipt wait
// below is bounded well inside it so the pending path has room to answer.

import { NextResponse } from 'next/server.js';
import type { NextRequest } from 'next/server.js';
import { ethers } from 'ethers';
import { db } from '../../../../../src/store/db.js';
import { requiredEnv } from '../../../../../src/config/env.js';
import { hashCanonical } from '../../../../../src/domain/canonical.js';
import { pastPosted } from '../../../../../src/arc/rehearsal.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MARKET_ABI = [
  'function markets(uint256) view returns (bytes32 questionId, bytes32 specHash, uint64 closeTime, uint64 observationEnd, uint64 resolveDeadline, bool resolved, bool outcome, bool voided, bytes32 evidenceHash, uint256 poolTrue, uint256 poolFalse)',
  'event Staked(uint256 indexed marketId, uint256 indexed claimId, address indexed staker, bool side, uint256 amount)',
  'event PredictionCommitted(uint256 indexed marketId, uint256 indexed claimId, address indexed author, bytes32 reportHash, bool side, uint256 amount)',
];

/** ⚠️ Bounded, and well under the 60s ceiling so the `pending` answer can still be written. */
const WAIT_MS = 40_000;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const { txHash } = (await request.json().catch(() => ({}))) as { txHash?: string };

  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'bad market id' }, { status: 400 });
  if (!txHash || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    return NextResponse.json({ error: 'txHash must be a 32-byte hex hash' }, { status: 400 });
  }

  const contractAddress = requiredEnv('ARC_MARKET_ADDRESS');
  const [market] = await db()<{ id: string; close_time: Date; observed_day: string }[]>`
    SELECT id, close_time, observed_day FROM markets WHERE chain_market_id = ${id} AND contract_address = ${contractAddress}`;
  if (!market) return NextResponse.json({ error: `no market ${id}` }, { status: 404 });

  const provider = new ethers.JsonRpcProvider(requiredEnv('ARC_RPC_URL'), undefined, { staticNetwork: true });
  const contract = new ethers.Contract(contractAddress, MARKET_ABI, provider);
  const iface = new ethers.Interface(MARKET_ABI);

  // Pools are read whatever happens, so even a pending answer refreshes the page's figures.
  const pools = async () => {
    const m = await contract.markets!(BigInt(id));
    return { poolTrue: (m.poolTrue as bigint).toString(), poolFalse: (m.poolFalse as bigint).toString() };
  };

  // ⚠️ **`waitForTransaction`, never `getTransactionReceipt`.** A hash exists before the transaction
  // is mined — in the browser exactly as it does behind Circle's `SENT`, which is the bug Unit 6
  // died on. Reading the receipt straight away returns null and reads like a chain fault.
  const receipt = await provider.waitForTransaction(txHash, 1, WAIT_MS).catch(() => null);
  if (!receipt) return NextResponse.json({ recorded: false, pending: true, ...(await pools()) });
  if (receipt.status !== 1) return NextResponse.json({ recorded: false, reverted: true, ...(await pools()) });

  const events = receipt.logs
    .map((log) => { try { return iface.parseLog(log); } catch { return null; } })
    .filter((parsed): parsed is ethers.LogDescription => parsed !== null && (parsed.args[0] as bigint).toString() === id);
  const staked = events.find((e) => e.name === 'Staked');
  const committed = events.find((e) => e.name === 'PredictionCommitted');

  // ── ⚠️ A COMMIT, NOT A STAKE: record the claim itself. See the header. ──────────────────────────
  if (!staked && committed) {
    if (!pastPosted(market.close_time, market.observed_day)) {
      return NextResponse.json(
        { recorded: false, error: `market ${id} is a forecast; a commit from a browser wallet is only recorded on a demo market`, ...(await pools()) },
        { status: 422 },
      );
    }
    const chainClaimId = (committed.args[1] as bigint).toString();
    const author = (committed.args[2] as string).toLowerCase();
    const reportHash = (committed.args[3] as string).slice(2).toLowerCase();
    const side = committed.args[4] as boolean;
    const amount = (committed.args[5] as bigint).toString();

    // ⚠️ The admission rule the analyst's commits meet in `prepare()`: a claim is only admitted on
    // tokenized work. The stake is on chain either way; this decides whether the store calls it one.
    const [token] = await db()<{ report_hash: string }[]>`
      SELECT report_hash FROM report_tokens WHERE report_hash = ${reportHash}`;
    if (!token) {
      return NextResponse.json(
        { recorded: false, error: `report ${reportHash.slice(0, 16)}… is not tokenized, so claim ${chainClaimId} is on chain but not admitted`, ...(await pools()) },
        { status: 422 },
      );
    }

    // ⚠️ `market.ts:195`'s id rule, spelled out because that helper is private: `c/` plus 24 hex of
    // `hashCanonical({marketId, author})`. A retry lands on the same id and does nothing.
    const claimId = `c/${hashCanonical({ marketId: market.id, author }).slice(0, 24)}`;
    await db()`
      INSERT INTO claims (id, market_id, chain_claim_id, author, report_hash, side, amount, commit_tx, committed_at)
      VALUES (${claimId}, ${market.id}, ${chainClaimId}, ${author}, ${reportHash}, ${side}, ${amount}, ${txHash}, now())
      ON CONFLICT DO NOTHING`;

    return NextResponse.json({
      recorded: true, kind: 'claim', chainClaimId, staker: author, side, amount, block: receipt.blockNumber, ...(await pools()),
    });
  }

  if (!staked) {
    return NextResponse.json(
      { recorded: false, error: `${txHash} mined but carries no Staked or PredictionCommitted event for market ${id}`, ...(await pools()) },
      { status: 422 },
    );
  }

  const chainClaimId = (staked.args[1] as bigint).toString();
  const staker = staked.args[2] as string;
  const side = staked.args[3] as boolean;
  const amount = (staked.args[4] as bigint).toString();

  const [claim] = await db()<{ id: string; side: boolean }[]>`
    SELECT id, side FROM claims WHERE market_id = ${market.id} AND chain_claim_id = ${chainClaimId}`;
  if (!claim) {
    return NextResponse.json(
      { recorded: false, error: `claim ${chainClaimId} is on chain but not in the store`, ...(await pools()) },
      { status: 422 },
    );
  }
  // ⚠️ Not a formality. If these disagree, the row we would write is a record of something that did
  // not happen, and the side is the whole point of staking alongside a claim.
  if (claim.side !== side) {
    return NextResponse.json(
      { recorded: false, error: `the chain credited ${side} and claim ${chainClaimId} is ${claim.side}`, ...(await pools()) },
      { status: 409 },
    );
  }

  await db()`
    INSERT INTO stakes (market_id, claim_id, staker, side, amount, tx_hash, block)
    VALUES (${market.id}, ${claim.id}, ${staker}, ${side}, ${amount}, ${txHash}, ${receipt.blockNumber})
    ON CONFLICT (tx_hash) DO NOTHING`;

  return NextResponse.json({
    recorded: true, staker, side, amount, block: receipt.blockNumber, ...(await pools()),
  });
}

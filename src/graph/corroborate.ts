// The only genuinely independent check we have. Everything a subgraph says comes out of the
// same mapping code, so a wrong number stays wrong however often we ask it — aave-v3's
// $279 quadrillion revenue and Morpho's 3.6x TVL both survived unlimited re-querying.
//
// ⚠️ A disagreement detector, NOT a one-way audit of The Graph (PLAN-v4 §5.14, amended
// 2026-09-06). The first thing this check ever found was Morpho disagreeing with its own
// contract. Which side is wrong is per-deployment and sometimes open; this file reports
// *these two sources disagree, by this much, here* and nothing more.
//
// ⚠️ The document is inline rather than in `graph/queries/`. Those are the agent's menu and
// their guarantee is that every one works on every live schema version. `indexLastUpdatedTimestamp`
// is 3.1.0/3.0.0 only and `outputToken` is absent on 3.0.0, so this belongs outside the menu.

import { querySubgraph } from './client.js';
import { PROTOCOLS } from '../config/protocols.js';
import type { CorroborationStatus } from '../types/wire.js';

const TOTAL_SUPPLY = '0x18160ddd';   // totalSupply()
const MARKET_STRUCT = '0x5c60e39a';  // market(bytes32) — Morpho Blue

export interface Corroboration {
  readonly slug: string;
  readonly marketId: string;
  readonly marketName: string | null;
  readonly status: CorroborationStatus;
  readonly subgraphValue: bigint | null;
  readonly chainValue: bigint | null;
  /** `chain − subgraph`. Negative means the subgraph reads higher than the chain. */
  readonly delta: bigint | null;
  readonly writeTimeBlock: number | null;
  readonly writeTimestamp: number | null;
  readonly contract: string | null;
  readonly note: string | null;
}

const rpcUrl = () => {
  const u = process.env.ETHEREUM_RPC_URL?.trim();
  if (!u) throw new Error('ETHEREUM_RPC_URL is not set — archive access is mandatory, not optional');
  return u;
};
async function rpc<T = string>(method: string, params: unknown[]): Promise<T> {
  const r = await fetch(rpcUrl(), { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  const j = (await r.json()) as { result?: T; error?: { message: string } };
  if (j.error) throw new Error(`${method}: ${j.error.message}`);
  return j.result as T;
}
const blockTs = async (n: number) =>
  Number((await rpc<{ timestamp: string }>('eth_getBlockByNumber', [`0x${n.toString(16)}`, false])).timestamp);

/**
 * The block whose timestamp is the write-time — the whole unit turns on this.
 *
 * ⚠️ Reading at the CURRENT block never matches: an aToken's `totalSupply()` accrues from
 * `block.timestamp`, roughly 31.5 USDC per block on a large market, while the subgraph writes
 * `inputTokenBalance` only when a handler fires. Same quantity, different moments (SM-04).
 *
 * Post-merge slots are 12s, so an estimate lands within the count of missed slots; the bisect
 * closes the rest. Returns the latest block at or before the target.
 */
const blockCache = new Map<number, number>();
export async function blockAtTimestamp(target: number): Promise<number> {
  const cached = blockCache.get(target);
  if (cached !== undefined) return cached;
  const head = Number(await rpc('eth_blockNumber', []));
  const headTs = await blockTs(head);
  let lo = Math.max(1, head - Math.ceil((headTs - target) / 12) - 600);
  let hi = Math.min(head, lo + 1400);
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if ((await blockTs(mid)) <= target) lo = mid; else hi = mid - 1;
  }
  blockCache.set(target, lo);
  return lo;
}

/** Sample the largest markets of one deployment and check each against the chain. */
export async function corroborate(slug: string, sample = 3): Promise<Corroboration[]> {
  const cfg = PROTOCOLS.find((p) => p.slug === slug);
  if (!cfg) throw new Error(`${slug} is not in config/protocols.ts`);
  const hint = cfg.corroborationHint;
  const base = 'id name inputTokenBalance';
  const extra = hint?.method === 'totalSupply()' ? ' outputToken { id }' : '';
  const field = hint ? ` ${hint.writeTimeField}` : '';
  const doc = `query($first: Int!) {
    _meta { deployment hasIndexingErrors block { number timestamp } }
    markets(first: $first, orderBy: totalDepositBalanceUSD, orderDirection: desc) { ${base}${extra}${field} }
  }`;
  type Row = Record<string, string | null | { id: string }>;
  const res = await querySubgraph<{ markets: Row[] }>(slug, doc, { first: sample });

  const out: Corroboration[] = [];
  for (const m of res.data.markets) {
    const row = { slug, marketId: m.id as string, marketName: (m.name as string) ?? null,
      subgraphValue: m.inputTokenBalance == null ? null : BigInt(m.inputTokenBalance as string),
      chainValue: null, delta: null, writeTimeBlock: null, writeTimestamp: null, contract: null };

    // NOT_CHECKED is a legitimate answer, and the only honest one where the check cannot run.
    // ⚠️ Never fall back to approximate agreement here — a check that silently weakens for some
    // protocols is worse than one that admits its limits.
    // ⚠️ "config has no hint" is not the same claim as "the schema has no field", and this file
    // cannot tell them apart. compound-v2 has a null hint because SM-04 measured that no
    // write-time field exists; an untested row has one because nobody has looked. Say the thing
    // that is actually known.
    if (!hint) { out.push({ ...row, status: 'not_checked', note: 'no corroboration hint in config' }); continue; }
    if (!hint.method) { out.push({ ...row, status: 'not_checked', note: 'contract accessor not established' }); continue; }
    const ts = m[hint.writeTimeField] as string | null;
    if (ts == null) { out.push({ ...row, status: 'not_checked', note: `${hint.writeTimeField} is null on this market` }); continue; }

    const contract = hint.method === 'totalSupply()' ? ((m.outputToken as { id: string } | null)?.id ?? null) : hint.contractSource;
    if (!contract) { out.push({ ...row, status: 'not_checked', note: 'no contract to call' }); continue; }

    const writeTimestamp = Number(ts);
    const writeTimeBlock = await blockAtTimestamp(writeTimestamp);
    const data = hint.method === 'totalSupply()'
      ? TOTAL_SUPPLY
      : MARKET_STRUCT + (m.id as string).replace('0x', '').padStart(64, '0');
    const raw = await rpc('eth_call', [{ to: contract, data }, `0x${writeTimeBlock.toString(16)}`]);
    // Morpho's `market()` returns a packed struct; `totalSupplyAssets` is the first word.
    const chainValue = raw && raw !== '0x' ? BigInt('0x' + raw.slice(2, 66)) : null;
    const subgraphValue = row.subgraphValue;
    const delta = chainValue != null && subgraphValue != null ? chainValue - subgraphValue : null;
    out.push({ ...row, contract, writeTimestamp, writeTimeBlock, chainValue, delta,
      // Exact equality. No tolerance — one wide enough to absorb accrual is wide enough to hide
      // the errors this exists to catch (§5.14, amended 2026-09-06).
      status: delta == null ? 'not_checked' : delta === 0n ? 'match' : 'mismatch',
      note: null });
  }
  return out;
}

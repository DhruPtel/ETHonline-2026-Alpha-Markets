// One block every deployment can answer at, or a refusal.
//
// Without this a cross-protocol comparison reads Aave at 3pm and Compound at 1pm and calls it
// analysis. Unit 7 showed the drift is real even inside one deployment: an eight-page walk of
// morpho-blue moved 5 blocks between its first page and its last.
//
// ⚠️ There is no per-protocol-as-of fallback here on purpose. If there is no common block the
// answer is no. A report that silently blends two moments is worse than one that declines,
// because the blend looks like a finding.

import { querySubgraph } from './client.js';
import { PROTOCOLS } from '../config/protocols.js';

/**
 * How far back a deployment can be read, conservatively. **Measured 2026-09-07** across the five
 * publishable deployments by probing pinned reads at increasing depth:
 *
 * | deployment | retained |
 * |---|---|
 * | aave-v3-ethereum | **439,844 blocks** (61 days) |
 * | aave-v2, compound-v2, compound-v3, spark-lend | between 300 and 600 blocks |
 *
 * ⚠️ aave-v3 is the outlier, not the rule, and the floor has to hold for the tightest deployment
 * in the set. 300 is the deepest depth confirmed answerable on all five. PLAN-v4 §5.15's
 * ~500-block estimate is right for four of the five.
 */
export const RETENTION_FLOOR = 300;

/**
 * Ethereum finality is ~2 epochs behind head. Pinning at the head risks a reorg changing a figure
 * we have already published and possibly settled a market against.
 *
 * ⚠️ **This is a real cost, not a free precaution:** 64 blocks is about a fifth of the ~300-block
 * window the tightest deployment retains. It is still the right trade — a published report
 * invalidated by a reorg is unrecoverable, while 13 minutes of staleness is merely stale, and
 * §5.16 settles on named dates rather than on the head.
 */
export const FINALITY_LAG = 64;

export type BlockWindow =
  | { readonly ok: true; readonly block: number; readonly lo: number; readonly hi: number;
      readonly heads: Record<string, number>; readonly spread: number }
  | { readonly ok: false; readonly reason: string; readonly lo: number | null; readonly hi: number | null;
      readonly heads: Record<string, number>; readonly spread: number | null };

/** Find a block every slug can answer at, or decline and say why. */
export async function commonBlock(
  slugs: readonly string[],
  opts: { retentionFloor?: number; finalityLag?: number } = {},
): Promise<BlockWindow> {
  const floor = opts.retentionFloor ?? RETENTION_FLOOR;
  const lag = opts.finalityLag ?? FINALITY_LAG;
  const heads: Record<string, number> = {};
  const failed: string[] = [];

  await Promise.all(slugs.map(async (slug) => {
    if (!PROTOCOLS.some((p) => p.slug === slug)) { failed.push(`${slug} (not configured)`); return; }
    try { heads[slug] = (await querySubgraph(slug, `query { _meta { deployment hasIndexingErrors block { number timestamp } } }`)).meta.blockNumber; }
    catch (err) { failed.push(`${slug} (${(err as Error).message.slice(0, 60)})`); }
  }));

  const values = Object.values(heads);
  if (failed.length) return { ok: false, reason: `deployment(s) did not answer: ${failed.join(', ')}`, lo: null, hi: null, heads, spread: null };
  if (!values.length) return { ok: false, reason: 'no deployments given', lo: null, hi: null, heads, spread: null };

  const hi = Math.min(...values);                 // nobody can answer above their own head
  const lo = Math.max(...values) - floor;         // nobody can answer below their own floor
  const spread = Math.max(...values) - hi;

  if (lo > hi) return {
    ok: false, lo, hi, heads, spread,
    reason: `no common block: heads are ${spread} blocks apart and the tightest deployment retains only ${floor}`,
  };
  const block = hi - lag;
  if (block < lo) return {
    ok: false, lo, hi, heads, spread,
    reason: `no common block at finality: ${lag}-block finality lag falls ${lo - block} blocks below the retained window`,
  };
  return { ok: true, block, lo, hi, heads, spread };
}

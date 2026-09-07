// Walk a population to exhaustion, and say honestly whether we got there.
//
// The paging is the easy half. The half that matters is `Completeness`, because the adapter
// and the engine refuse to publish a clean verdict on an incomplete set — so the flag has to
// be trustworthy in both directions. It says `complete` on exactly one piece of evidence: a
// page came back SHORTER than the page size, which is the only proof the population ran out.
// Stopping at the budget is `incomplete` even if we happened to have reached the end, because
// at that point we do not know that we did.

import { querySubgraph, type QueryMeta } from './client.js';
import type { Completeness } from '../types/wire.js';

/** A page size, never a ceiling on the population. The gateway allows 1,000; 250 keeps any
 *  single response small and predictable (PLAN-v4 §5.18, amended 2026-09-06). */
export const PAGE_SIZE = 250;
/** 40 pages × 250 = 10,000 rows before we stop and admit it. */
export const MAX_PAGES = 40;

export interface Paginated<T> {
  readonly rows: T[];
  readonly completeness: Completeness;
  readonly pages: number;
  /** Rows seen twice across pages, dropped. Non-zero means the population moved under us. */
  readonly duplicatesDropped: number;
  /** `_meta` from the LAST page fetched. */
  readonly meta: QueryMeta;
  /**
   * ⚠️ Indexing-head movement between the first and last page. Non-zero on an UNPINNED walk
   * means the pages are not all from the same moment — the rows are internally inconsistent
   * and any total computed from them is a blend of two states. Pin a block to make this 0.
   */
  readonly blockDrift: number;
}

/**
 * @param entity the response field being paged, e.g. `'markets'`
 * @param block  passed through to `querySubgraph`; pinning is not handled here
 */
export async function paginate<T extends { id: string }>(
  slug: string,
  document: string,
  entity: string,
  variables: Record<string, unknown> = {},
  opts: { pageSize?: number; maxPages?: number; block?: number } = {},
): Promise<Paginated<T>> {
  const pageSize = opts.pageSize ?? PAGE_SIZE;
  const maxPages = opts.maxPages ?? MAX_PAGES;
  const seen = new Set<string>();
  const rows: T[] = [];
  let lastId = '', pages = 0, duplicatesDropped = 0, exhausted = false;
  let firstBlock: number | null = null;
  let meta!: QueryMeta;

  while (pages < maxPages) {
    const page = await querySubgraph<Record<string, T[]>>(
      slug, document, { ...variables, first: pageSize, lastId }, opts.block,
    );
    pages++;
    meta = page.meta;
    firstBlock ??= page.meta.blockNumber;
    const batch = page.data[entity] ?? [];
    for (const row of batch) {
      if (seen.has(row.id)) duplicatesDropped++;
      else { seen.add(row.id); rows.push(row); }
    }
    // A short page is the only proof the population ran out. A full page proves nothing.
    if (batch.length < pageSize) { exhausted = true; break; }
    lastId = batch[batch.length - 1]!.id;
  }

  return {
    rows,
    completeness: exhausted ? 'complete' : 'incomplete',
    pages,
    duplicatesDropped,
    meta,
    blockDrift: firstBlock == null ? 0 : meta.blockNumber - firstBlock,
  };
}

// The file everything else stands on. The report engine calls it, corroboration calls it,
// and Phase 4's settlement calls the same function to re-read the value a market resolves
// against — which is what makes The Graph load-bearing end to end (G2.1) rather than a
// fetch step at the start.
//
// Two exports: one deployment, and many. `querySubgraph` throws a typed `SubgraphError`;
// `querySubgraphs` catches per slug and returns an outcome each, so one dead endpoint
// returns a failure for THAT deployment instead of taking the set down (finding #8).
//
// ⚠️ **Nothing is cached here, and nothing should be.** Every call is a real request to the
// gateway, which is what lets a figure in a report be traced to a query that actually happened —
// the property §5.18 depends on when it says provenance is a record of what we did, never a cache
// of what we got. A cache would be an easy speed win and it would quietly break that: two reports
// could cite the same block and the same deployment hash while only one of them ever asked. The
// retained window is roughly 500 blocks anyway, so a cache would mostly serve state the gateway
// can no longer confirm. If a run is slow, the answer is fewer queries in the plan, not remembered
// answers here.

import { PROTOCOLS } from '../config/protocols.js';

const GATEWAY = 'https://gateway.thegraph.com/api';
const TIMEOUT_MS = 20_000;

/**
 * Requested on every query, no exceptions — injected below if a document omits it.
 * `deployment` is the deployment hash: without it we cannot tell later that a subgraph was
 * republished under the same ID, and a report would silently cite a different index.
 *
 * ⚠️ **Pinned alongside the data whenever a block is requested** *(2026-09-07)*. Previously the
 * injected `_meta` was always unpinned, so on a pinned read `meta.blockNumber` was the indexing
 * head while the figures came from `requestedBlock` — and `block` in a persisted evidence record
 * meant the read block for menu documents and the head for off-menu ones. A field whose meaning
 * depends on which document produced it is a dispute waiting to happen, and evidence exists to
 * settle disputes. `meta.blockNumber` is now the block the data came from, always.
 *
 * The freshness signal is what this costs: on a pinned read `_meta` no longer reports the head.
 * It is available from a separate unpinned query when something actually needs it.
 */
const meta = (pinned: boolean) =>
  `_meta${pinned ? '(block: $block)' : ''} { deployment hasIndexingErrors block { number timestamp } }`;

// ⚠️ MEASURED 2026-09-06 against the live gateway, closing the "exact pruning error strings"
// lookup PLAN-v4 §8 still lists as open. Neither anticipated phrase exists. What the gateway
// actually returns for BOTH a block below the retained window and a block above the indexed
// head is the same message:
//
//   bad indexers: {0x3b9b…: Unavailable(missing block: 24921900, latest: 25921898), …}
//
// So PRUNED and LAGGING cannot be told apart by prose at all — the discriminator is the
// arithmetic inside it. `missing > latest` means we asked ahead of the head; `missing <
// latest` means we asked behind the retained window. A third, distinct case is a block below
// the subgraph's own genesis, which no snapshot recovers.
const UNAVAILABLE = /missing block:\s*(\d+),\s*latest:\s*(\d+)/gi;
const BEFORE_START = 'before minimum `startblock` of manifest';

// The phrases the plan anticipated. Never observed on this gateway; kept because a different
// gateway version may still emit them and they are unambiguous where they do. Both contain
// "only" and "block number", so match the full phrase, never a substring.
const PRUNED_PHRASE = 'only has data starting at block number';
const LAGGING_PHRASE = 'has only indexed up to block number';

export type SubgraphErrorKind =
  | 'CONFIG'      // unknown slug, or no API key — ours, not the network's
  | 'HTTP'        // non-200: the key, or the gateway itself
  | 'GRAPHQL'     // 200 with json.errors — the document, not the transport
  | 'NO_INDEXERS' // valid ID, nobody serving it. A curation problem, not a code problem
  | 'PRUNED'      // block below the retained window. Recoverable via a snapshot instead
  | 'LAGGING'     // block above the indexed head. Recoverable by waiting
  | 'BEFORE_START_BLOCK' // block below the subgraph's manifest genesis. NOT recoverable
  | 'TIMEOUT'     // timed out twice
  | 'NETWORK';    // anything else fetch threw

export class SubgraphError extends Error {
  constructor(
    readonly kind: SubgraphErrorKind,
    readonly slug: string,
    message: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = 'SubgraphError';
  }
}

export interface QueryMeta {
  /** The deployment hash — `Qm…`. Changes on republish even when the subgraph ID does not. */
  readonly deployment: string;
  /**
   * ⚠️ **The block these figures came from.** Not the indexing head — this comment said the
   * opposite until 2026-09-07 and was left behind by the pinning change recorded in the file
   * header. Phase 4 settlement reads this field to decide which block a disputed figure came
   * from, so the distinction is the difference between a resolvable dispute and an unresolvable
   * one.
   *
   * How it holds: when a `block` is requested, `_meta` is pinned to it — the three menu documents
   * declare `_meta(block: $block)` themselves, and `withMeta` injects a pinned one into any
   * document that does not. When no block is requested, the read ran against the head and the head
   * IS where these figures came from. Either way, this is the answer.
   *
   * ⚠️ One precondition, unenforced: an off-menu document that declares its OWN `_meta` **without**
   * `(block: $block)` is returned untouched by `withMeta`, so pinning it would report the head
   * here. No document in this repo does that — `blockwindow.ts` passes an unpinned `_meta` but
   * requests no block, which is the honest case. A new document must pin its `_meta` or omit it.
   *
   * `requestedBlock` on the result records whether a pin was ASKED for. It is not a better answer
   * to "which block", and nothing should fall back through it — verified 2026-09-07 that nothing
   * does.
   */
  readonly blockNumber: number;
  readonly blockTimestamp: number | null;
  readonly hasIndexingErrors: boolean;
}

/** Everything `evidence.ts` (Unit 9) needs to build a record, gathered but not assembled here. */
export interface QueryResult<T = unknown> {
  readonly slug: string;
  readonly data: T;
  readonly meta: QueryMeta;
  readonly document: string;
  readonly variables: Readonly<Record<string, unknown>>;
  readonly requestedBlock: number | null;
  readonly fetchedAt: string;
  /** 1 normally, 2 when the first attempt timed out. Worth carrying: a retried query is slow. */
  readonly attempts: number;
}

export type QueryOutcome<T = unknown> =
  | { readonly ok: true; readonly slug: string; readonly result: QueryResult<T> }
  | { readonly ok: false; readonly slug: string; readonly error: SubgraphError };

/**
 * Add `_meta` to a document that lacks it. String handling in the most load-bearing file is
 * not free, so the rule is narrow: insert after the selection set that opens the operation,
 * found by scanning for the first `{` outside the variable-definition parentheses. Documents
 * that already ask for `_meta` are returned untouched.
 */
function withMeta(document: string, pinned: boolean): string {
  if (/\b_meta\b/.test(document)) return document;
  let parens = 0;
  for (let i = 0; i < document.length; i++) {
    const c = document[i];
    if (c === '(') parens++;
    else if (c === ')') parens--;
    else if (c === '{' && parens === 0) {
      return `${document.slice(0, i + 1)}\n  ${meta(pinned)}${document.slice(i + 1)}`;
    }
  }
  throw new SubgraphError('GRAPHQL', '-', 'Document has no selection set to add _meta to');
}

function isTimeout(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === 'TimeoutError' || err.name === 'AbortError') return true;
  const code = (err.cause as { code?: string } | undefined)?.code;
  return code === 'ETIMEDOUT' || code === 'UND_ERR_CONNECT_TIMEOUT' || code === 'UND_ERR_HEADERS_TIMEOUT';
}

/** GraphQL does not use status codes for query failures, so the body decides the kind. */
function classify(slug: string, messages: string[]): SubgraphError {
  const joined = messages.join(' | ');
  const lower = joined.toLowerCase();
  if (lower.includes('no indexers found')) {
    return new SubgraphError('NO_INDEXERS', slug, 'No indexers are serving this deployment', joined);
  }
  if (lower.includes(BEFORE_START)) {
    return new SubgraphError('BEFORE_START_BLOCK', slug, 'Block predates the subgraph manifest', joined);
  }
  // ⚠️ A deployment can have many indexers and the message reports EVERY one, each with its own
  // head. Reading only the first pair classifies the deployment on whichever indexer the gateway
  // happened to list first — measured 2026-09-07 on aave-v2, where the first of ten indexers was
  // 57,859 blocks behind and lagging while eight others had passed the block and pruned it.
  // The deployment is only LAGGING if EVERY indexer is still short of the block; if any indexer
  // has passed it and still cannot serve it, waiting will not help and the answer is PRUNED.
  const pairs = [...joined.matchAll(UNAVAILABLE)].map((m) => ({ missing: Number(m[1]), latest: Number(m[2]) }));
  if (pairs.length) {
    const heads = pairs.map((p) => p.latest);
    const where = `indexer heads ${Math.min(...heads)}–${Math.max(...heads)} across ${pairs.length}`;
    return pairs.every((p) => p.missing > p.latest)
      ? new SubgraphError('LAGGING', slug, `Block ${pairs[0]!.missing} is above every indexed head (${where})`, joined)
      : new SubgraphError('PRUNED', slug, `Block ${pairs[0]!.missing} is retained by no indexer (${where})`, joined);
  }
  if (lower.includes(PRUNED_PHRASE)) {
    return new SubgraphError('PRUNED', slug, 'Block is below the retained window', joined);
  }
  if (lower.includes(LAGGING_PHRASE)) {
    return new SubgraphError('LAGGING', slug, 'Block is above the indexed head', joined);
  }
  return new SubgraphError('GRAPHQL', slug, joined || 'GraphQL error with no message', joined);
}

/**
 * Query one deployment. Takes a SLUG, never a URL or a subgraph ID — `config/protocols.ts`
 * is the only place a deployment is named.
 *
 * `block` pins the read to a past block, which is how settlement re-reads the value it
 * settles against. It is passed as the variable `$block`; a document that supports pinning
 * declares `$block: Block_height` and applies it to its fields.
 */
export async function querySubgraph<T = unknown>(
  slug: string,
  document: string,
  variables: Record<string, unknown> = {},
  block?: number,
): Promise<QueryResult<T>> {
  const key = process.env.GRAPH_API_KEY;
  if (!key) throw new SubgraphError('CONFIG', slug, 'GRAPH_API_KEY is not set');

  const config = PROTOCOLS.find((p) => p.slug === slug);
  if (!config) throw new SubgraphError('CONFIG', slug, `Unknown slug — not in config/protocols.ts`);

  const vars = block === undefined ? variables : { ...variables, block: { number: block } };
  // ⚠️ Injecting `_meta(block: $block)` makes a document that cannot honour a pin fail loudly
  // instead of silently ignoring the extra variable, which is what happened before.
  const body = JSON.stringify({ query: withMeta(document, block !== undefined), variables: vars });
  const url = `${GATEWAY}/${key}/subgraphs/id/${config.subgraphId}`;

  // One retry, and only on a timeout. SM-02 saw four of five parallel calls return ETIMEDOUT
  // on one run and 5/5 immediately after. Anything else is reported as it happened.
  let lastTimeout: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      if (isTimeout(err)) { lastTimeout = err; continue; }
      throw new SubgraphError('NETWORK', slug, `fetch failed: ${(err as Error).message}`);
    }

    if (!res.ok) {
      throw new SubgraphError('HTTP', slug, `HTTP ${res.status} ${res.statusText}`, (await res.text()).slice(0, 400));
    }

    const json = (await res.json()) as { data?: Record<string, unknown>; errors?: { message: string }[] };
    if (json.errors?.length) throw classify(slug, json.errors.map((e) => e.message));
    if (!json.data) throw new SubgraphError('GRAPHQL', slug, 'Response had neither data nor errors');

    // Named `metaResult` rather than `meta`: the module-level `meta()` at the top of this file
    // builds the _meta SELECTION, and this is the row that came back. Shadowing the two is safe
    // only because `withMeta` has already run, which is not a thing the next editor should have
    // to know.
    const metaResult = json.data._meta as
      | { deployment: string; hasIndexingErrors: boolean; block: { number: number; timestamp: number | null } }
      | null;
    if (!metaResult) throw new SubgraphError('GRAPHQL', slug, '_meta was requested but did not come back');

    const { _meta, ...data } = json.data;
    void _meta;
    return {
      slug,
      data: data as T,
      meta: {
        deployment: metaResult.deployment,
        blockNumber: metaResult.block.number,
        blockTimestamp: metaResult.block.timestamp,
        hasIndexingErrors: metaResult.hasIndexingErrors,
      },
      document,
      variables: vars,
      requestedBlock: block ?? null,
      fetchedAt: new Date().toISOString(),
      attempts: attempt,
    };
  }
  throw new SubgraphError('TIMEOUT', slug, `Timed out twice after ${TIMEOUT_MS}ms`, String(lastTimeout));
}

/**
 * Query many deployments at once. `Promise.all`, not a loop — a gateway call is ~200ms of
 * pure network, so five sequential is over 2s before any work happens.
 *
 * ⚠️ Per-protocol isolation: every slug gets its own outcome and nothing rejects. Seeing
 * which deployments failed is the result, not an interruption of it.
 */
export async function querySubgraphs<T = unknown>(
  slugs: readonly string[],
  document: string,
  variables: Record<string, unknown> = {},
  block?: number,
): Promise<QueryOutcome<T>[]> {
  return Promise.all(
    slugs.map(async (slug): Promise<QueryOutcome<T>> => {
      try {
        return { ok: true, slug, result: await querySubgraph<T>(slug, document, variables, block) };
      } catch (err) {
        const error = err instanceof SubgraphError
          ? err
          : new SubgraphError('NETWORK', slug, (err as Error).message);
        return { ok: false, slug, error };
      }
    }),
  );
}

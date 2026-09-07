// The file everything else stands on. The report engine calls it, corroboration calls it,
// and Phase 4's settlement calls the same function to re-read the value a market resolves
// against — which is what makes The Graph load-bearing end to end (G2.1) rather than a
// fetch step at the start.
//
// Two exports: one deployment, and many. `querySubgraph` throws a typed `SubgraphError`;
// `querySubgraphs` catches per slug and returns an outcome each, so one dead endpoint
// returns a failure for THAT deployment instead of taking the set down (finding #8).

import { PROTOCOLS } from '../config/protocols.js';

const GATEWAY = 'https://gateway.thegraph.com/api';
const TIMEOUT_MS = 20_000;

/**
 * Requested on every query, no exceptions — injected below if a document omits it.
 * `deployment` is the deployment hash: without it we cannot tell later that a subgraph was
 * republished under the same ID, and a report would silently cite a different index.
 */
const META = '_meta { deployment hasIndexingErrors block { number timestamp } }';

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
const UNAVAILABLE = /missing block:\s*(\d+),\s*latest:\s*(\d+)/i;
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
   * ⚠️ The INDEXING HEAD, not necessarily the block the data came from. `_meta` is injected
   * unpinned, so on a pinned read this is the head while the figures are from
   * `requestedBlock`. Anything recording "the block these numbers are from" wants
   * `requestedBlock ?? meta.blockNumber`, never this alone.
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
function withMeta(document: string): string {
  if (/\b_meta\b/.test(document)) return document;
  let parens = 0;
  for (let i = 0; i < document.length; i++) {
    const c = document[i];
    if (c === '(') parens++;
    else if (c === ')') parens--;
    else if (c === '{' && parens === 0) {
      return `${document.slice(0, i + 1)}\n  ${META}${document.slice(i + 1)}`;
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
  const unavailable = UNAVAILABLE.exec(joined);
  if (unavailable) {
    const missing = Number(unavailable[1]);
    const latest = Number(unavailable[2]);
    return missing > latest
      ? new SubgraphError('LAGGING', slug, `Block ${missing} is above the indexed head ${latest}`, joined)
      : new SubgraphError('PRUNED', slug, `Block ${missing} is below the retained window (head ${latest})`, joined);
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
  const body = JSON.stringify({ query: withMeta(document), variables: vars });
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

    const meta = json.data._meta as
      | { deployment: string; hasIndexingErrors: boolean; block: { number: number; timestamp: number | null } }
      | null;
    if (!meta) throw new SubgraphError('GRAPHQL', slug, '_meta was requested but did not come back');

    const { _meta, ...data } = json.data;
    void _meta;
    return {
      slug,
      data: data as T,
      meta: {
        deployment: meta.deployment,
        blockNumber: meta.block.number,
        blockTimestamp: meta.block.timestamp,
        hasIndexingErrors: meta.hasIndexingErrors,
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

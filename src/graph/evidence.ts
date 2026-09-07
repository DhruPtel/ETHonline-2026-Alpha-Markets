// What we looked at, recorded so a figure in a report can be traced to a specific query at a
// specific block months later.
//
// ⚠️ This matters more than it sounds because the source disappears. Unit 8 measured the retained
// window at 300–600 blocks on four of five deployments — roughly an hour. After that the state we
// read cannot be re-derived, and a re-run returns different data rather than the same data. Without
// a record, a settlement claim quietly becomes "trust us".
//
// ⚠️ **Never read back as data.** Provenance only. Anything downstream that starts reading evidence
// to answer a question is caching subgraph responses under another name, and that breaks G1.2.

import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
import type { Completeness } from '../types/wire.js';
import type { QueryResult } from './client.js';
import { DOCUMENTS, type DocumentId } from './queries/index.js';

/**
 * ⚠️ **Set by the CALLER, never inferred** (PLAN-v4 §5.18). Phase 4's resolver passes
 * `record+raw`; report generation does not. Inferring it from the query shape would mean a
 * settlement quietly losing its proof because a document got reused somewhere new.
 */
export type EvidenceTier = 'record' | 'record+raw';

export interface EvidenceRecord {
  readonly deployment: string;
  /** The registry id, or `null` for a document that is not on the agent's menu. */
  readonly document: DocumentId | null;
  /** Always present, so an off-menu document is still identifiable byte-for-byte. */
  readonly documentHash: string;
  readonly variables: Readonly<Record<string, unknown>>;
  /** The block the data came from. Unambiguous: `_meta` is pinned whenever the read is. */
  readonly block: number;
  /** The block asked for, or `null` when the read was unpinned. Equals `block` when pinned. */
  readonly requestedBlock: number | null;
  readonly fetchedAt: string;
  /** `null` when the response carried no list to count. */
  readonly rowCount: number | null;
  /** `null` when the caller did not paginate, so completeness is genuinely unknown. */
  readonly completeness: Completeness | null;
  /** SHA-256 over RFC 8785 canonical JSON. Proves integrity — that this is the response we saw. */
  readonly responseHash: string;
  /**
   * ⚠️ Settlement-backing queries only. A hash proves integrity and NOT content: it cannot answer
   * a dispute about what the number *was* once the source has pruned. Most queries never back a
   * market; the few that do keep the bytes.
   */
  readonly raw: string | null;
}

/** RFC 8785 JCS, the same path SM-01 proved against the RFC's own vectors. One canonicalizer. */
const canonical = (v: unknown) => canonicalize(v) as string;
export const hashResponse = (data: unknown) =>
  createHash('sha256').update(canonical(data), 'utf8').digest('hex');

const documentIdOf = (text: string): DocumentId | null =>
  (Object.keys(DOCUMENTS) as DocumentId[]).find((id) => DOCUMENTS[id] === text) ?? null;

/** Sum of every top-level list in the response. `null` when there is no list to count. */
const countRows = (data: unknown): number | null => {
  if (data == null || typeof data !== 'object') return null;
  const lists = Object.values(data as Record<string, unknown>).filter(Array.isArray);
  return lists.length ? lists.reduce((a, l) => a + l.length, 0) : null;
};

export function buildEvidence(
  result: QueryResult,
  opts: { tier?: EvidenceTier; completeness?: Completeness; rowCount?: number } = {},
): EvidenceRecord {
  const tier = opts.tier ?? 'record';
  return {
    deployment: result.meta.deployment,
    document: documentIdOf(result.document),
    documentHash: createHash('sha256').update(result.document, 'utf8').digest('hex').slice(0, 16),
    variables: result.variables,
    block: result.meta.blockNumber,
    requestedBlock: result.requestedBlock,
    fetchedAt: result.fetchedAt,
    rowCount: opts.rowCount ?? countRows(result.data),
    completeness: opts.completeness ?? null,
    responseHash: hashResponse(result.data),
    raw: tier === 'record+raw' ? canonical(result.data) : null,
  };
}

// The settlement read, and the outcome it produces. Nothing here touches a chain.
//
// ── ⚠️ THE SEAM THIS UNIT CLOSES, AND WHY IT IS NEVER CUT ────────────────────────────────────────
//
// `graph/evidence.ts` has a correct `buildEvidence` and, until this file, **no destination**. Its
// only caller was `scripts/demo/evidence.ts`. Reports persist `Provenance`, which carries neither a
// `responseHash` nor `raw` — so the record+raw tier had nowhere to land.
//
// ⚠️ **The failure that leaves is silent and permanent.** A resolver could pass `record+raw`,
// receive a perfect `EvidenceRecord`, satisfy its own proof, and drop it on the floor — and then
// `resolve` would put 32 bytes on chain committing to bytes that exist nowhere. **The hash is on
// chain and cannot be amended.** A hash with nothing behind it is not weaker evidence, it is the
// appearance of evidence, which is worse than none.
//
// **Fetch before submit.** The read completes and the evidence is stored before anything goes on
// chain. Unit 9 owns the chain write and this file must never reach for it.
//
// ── ⚠️ THE READ IS UNPINNED, AND THE FRESHNESS CHECK ONLY EXISTS BECAUSE OF THAT ─────────────────
//
// `client.ts` injects `_meta(block: $block)` whenever a block is requested, and **a pinned `_meta`
// returns a null timestamp — measured, consistently.** §5.16's freshness rule is
// `_meta.block.timestamp >= dayEnd + margin`, a TIMESTAMP and never a block number, so it has
// nothing to compare against on a pinned read.
//
// ⚠️ **Pinning this read later would silently DELETE the freshness check rather than break it.**
// `blockTimestamp` would be `null`, and any code that treated null as "skip the check" would settle
// a day that had not finished. That is why the null case below is a hard throw and not a fallback:
// the only honest reading of a null timestamp here is that somebody pinned the read.
//
// ⚠️ **`paginate()` is not used and must not be.** It cursors on `lastId`, and `FINANCIAL_SNAPSHOTS`
// declares no `$lastId`. A one-day window is one row; there is nothing to page.

import { createHash } from 'node:crypto';
import { type EvidenceRecord, buildEvidence } from '../graph/evidence.js';
import { querySubgraph } from '../graph/client.js';
import { FINANCIAL_SNAPSHOTS, type FinancialSnapshot, type FinancialSnapshotsResult } from '../graph/queries/snapshots.js';
import { type MarketSpec, holds, isFresh, observationEnd, observationWindow } from './spec.js';
import { canonical, hashCanonical } from '../domain/canonical.js';
import { db } from '../store/db.js';

/**
 * ⚠️ **Thrown, not returned, and the difference matters.** "Too early" is not information about the
 * data — it is information about *when we asked*. The day is not over, so there is no answer yet and
 * nothing to record. Unit 11's cron skips and comes back; `MISSING_OBSERVATION` is what it records
 * when the day IS over and the row is still not there.
 */
export class SettlementTooEarly extends Error {
  constructor(readonly observedDay: string, readonly readAt: number, readonly earliest: number) {
    super(
      `cannot settle ${observedDay} yet: the read ran at ${new Date(readAt * 1000).toISOString()} ` +
      `and the earliest honest settlement is ${new Date(earliest * 1000).toISOString()} ` +
      '(observationEnd plus the freshness margin). Reading now would answer a day that is still running.',
    );
    this.name = 'SettlementTooEarly';
  }
}

/**
 * What the read found. ⚠️ **Both shapes carry evidence**, including the missing one — the record of
 * having looked and found nothing is exactly what defends a void to somebody who was not there.
 */
export type Settlement =
  | {
      readonly kind: 'settled';
      readonly outcome: boolean;
      /** The figure the outcome turned on. ⚠️ A decimal STRING; never a float, never a Number. */
      readonly observed: string;
      readonly snapshot: FinancialSnapshot;
      readonly evidence: EvidenceRecord;
      readonly evidenceHash: string;
      readonly metaBlockTimestamp: number;
    }
  | {
      readonly kind: 'MISSING_OBSERVATION';
      /** Which of the two ways it is missing. Both are facts about the data, not failures to read. */
      readonly reason: string;
      readonly evidence: EvidenceRecord;
      readonly evidenceHash: string;
      readonly metaBlockTimestamp: number;
    };

/**
 * Read the observed day and decide the outcome.
 *
 * ⚠️ **The window and the freshness margin are `spec.ts`'s, called rather than recomputed.** It owns
 * the day arithmetic — including that the window is `[D, D+86399]` and closed, so one snapshot
 * cannot belong to two days — and two copies of that arithmetic could disagree about which day a row
 * belongs to. That disagreement would be invisible until two markets settled on one row.
 *
 * ⚠️ **`holds()` decides the comparison, including that a tie resolves FALSE.** Settlement
 * re-deciding what "above" means would be settlement inventing part of the question.
 */
export async function settle(spec: MarketSpec): Promise<Settlement> {
  const window = observationWindow(spec.observedDay);

  // ⚠️ No block argument. See the header: a pin deletes the freshness signal.
  const result = await querySubgraph<FinancialSnapshotsResult>(spec.slug, FINANCIAL_SNAPSHOTS, {
    first: 1, skip: 0, startTimestamp: String(window.start), endTimestamp: String(window.end),
  });

  // ⚠️ record+raw, and the tier is the CALLER's choice by design (§5.18) — never inferred from the
  // query shape, because a document reused somewhere new would quietly lose its proof. This is a
  // settlement-backing read, so it keeps the bytes.
  const evidence = buildEvidence(result, { tier: 'record+raw' });
  const evidenceHash = hashCanonical(evidence);

  const readAt = result.meta.blockTimestamp;
  if (readAt === null) {
    throw new Error(
      `${spec.slug}: _meta.block.timestamp came back null, which happens when the read is PINNED. ` +
      'This read must be unpinned — the freshness rule is a timestamp comparison and a pinned read ' +
      'has no timestamp to compare. Refusing to settle rather than skipping the check.',
    );
  }
  if (!isFresh(readAt, spec.observedDay)) {
    throw new SettlementTooEarly(spec.observedDay, readAt, observationEnd(spec.observedDay) + 3600);
  }

  const rows = result.data.financialsDailySnapshots;
  const base = { evidence, evidenceHash, metaBlockTimestamp: readAt } as const;

  // ⚠️ A day with no snapshot is INFORMATION, not an error. Returning a wrong answer instead — a
  // zero, a previous day's row, a guess — is the one thing that must never happen here.
  if (!rows?.length) {
    return {
      kind: 'MISSING_OBSERVATION', ...base,
      reason:
        `no financialsDailySnapshot for ${spec.slug} in [${window.start}, ${window.end}] ` +
        `(${spec.observedDay} UTC). The read succeeded and the day has no row.`,
    };
  }

  const snapshot = rows[0]!;
  const observed = snapshot[spec.metric];
  // ⚠️ The second way it can be missing: the row exists and the field is null. Same class of fact —
  // the deployment published no value for this metric that day — so the same outcome.
  if (observed === null) {
    return {
      kind: 'MISSING_OBSERVATION', ...base,
      reason:
        `the ${spec.observedDay} snapshot for ${spec.slug} exists (${snapshot.id}) and its ` +
        `${spec.metric} is null. The day was indexed and this figure was not published.`,
    };
  }

  return { kind: 'settled', outcome: holds(spec, observed), observed, snapshot, ...base };
}

/**
 * Persist what the read saw, keyed by market. ⚠️ **Before anything goes on chain.**
 *
 * ⚠️ **`raw` is TEXT and never jsonb**, which is the rule this row exists to honour: `evidenceHash`
 * is over canonical bytes, and jsonb reorders keys, normalises numbers and drops duplicates — so a
 * jsonb round trip would return bytes that no longer produce the stored hash, on the one row whose
 * whole job is to be re-checkable.
 *
 * ⚠️ **A row with `outcome` NULL is a MISSING_OBSERVATION**, not an unfinished write. This unit
 * always knows the outcome by the time it writes, so null is meaningful rather than absent. The
 * schema has no column for the outcome KIND — noted rather than migrated around; `raw` carries the
 * empty result set, which is the unambiguous discriminator.
 *
 * Idempotent on `market_id`: a retried settlement re-records rather than colliding.
 */
export async function recordSettlement(marketId: string, s: Settlement): Promise<void> {
  const settled = s.kind === 'settled';
  await db()`
    INSERT INTO settlement_evidence
      (market_id, evidence_hash, raw, observed_value, outcome, block, meta_block_time)
    VALUES (${marketId}, ${s.evidenceHash}, ${canonical(s.evidence)},
            ${settled ? s.observed : null}, ${settled ? s.outcome : null},
            ${s.evidence.block}, ${new Date(s.metaBlockTimestamp * 1000)})
    ON CONFLICT (market_id) DO UPDATE SET
      evidence_hash = EXCLUDED.evidence_hash, raw = EXCLUDED.raw,
      observed_value = EXCLUDED.observed_value, outcome = EXCLUDED.outcome,
      block = EXCLUDED.block, meta_block_time = EXCLUDED.meta_block_time`;
}

/**
 * Re-hash stored evidence bytes and say whether they still produce the hash beside them.
 *
 * ⚠️ **`responseHash` is `sha256(canonical(data))` and `raw` IS `canonical(data)`** — so verifying
 * the response half is a plain SHA-256 over the stored TEXT, with no re-canonicalization. Anything
 * that had to re-canonicalize before comparing would be testing our canonicalizer rather than the
 * bytes, and would paper over exactly the corruption this is looking for.
 */
export function verifyStoredEvidence(raw: string, evidenceHash: string): {
  readonly evidenceMatches: boolean; readonly responseMatches: boolean;
} {
  const record = JSON.parse(raw) as EvidenceRecord;
  return {
    evidenceMatches: hashCanonical(record) === evidenceHash,
    responseMatches: record.raw !== null
      && createHash('sha256').update(record.raw, 'utf8').digest('hex') === record.responseHash,
  };
}

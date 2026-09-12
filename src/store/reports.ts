// A report becomes a thing that exists. Put a `Report` in, get the same `Report` back — and "the
// same" is proved by re-deriving the hash, never by inspecting fields.
//
// ⚠️ **Why "the same" is strict.** The report hash is computed over canonical JSON, it is the
// report's only identity, and it is the 32 bytes that go into the ATS creation event on Hedera and
// into `commitPrediction` on Arc. A round trip that changes one byte changes the identity of the
// report, and it changes it silently.
//
// ⚠️ **A report is stored once and never regenerated.** `execute` returns a `dataHash`, not a report
// hash, because narration is inside the report hash and the model call that produces it is not
// deterministic. Re-running the pipeline yields a different report. This is the only copy.
//
// ⚠️ **Untrusted strings pass through here and are NOT escaped.** `Market.name` and `Token.symbol`
// are indexer-supplied and travel inside reports (§5.18). Escaping on write would make the stored
// bytes stop matching the hashed bytes, which is the one thing this file exists to prevent. Escaping
// happens at the HTML boundary, which is Unit 6.

import type { Report } from '../types/report.js';
import { canonical, reportHash } from '../domain/canonical.js';
import { closePool, db } from './db.js';
// ⚠️ **The shared client, not one of this module's own.** Consolidated into `db.ts` on 2026-09-08:
// three modules each memoized their own, so a request touching all three opened three connections
// against a Neon pool that caps them — and a connection-limit failure presents as a timeout rather
// than as a limit error. `db()` keeps the lazy, never-at-module-scope property that mattered before.
//
// For scripts, which have to exit. A route handler should never call this. ⚠️ Idempotent.
export { closePool as close };

/** Enough to render an index. ⚠️ Not a `Report` — see `block` below. */
export interface ListedReport {
  readonly hash: string;
  readonly analyst: string;
  readonly directive: string;
  /** ⚠️ The narrator's own name for the report, outside the hash. `null` for anything written
   *  before migration 008 — eleven rows — and for a title the digit guard rejected. */
  readonly title: string | null;
  /**
   * ⚠️ **Display only. Never rebuild a `Report` from this.** The driver returns `BIGINT` as a
   * JavaScript *string* — deliberately, since a bigint can exceed `Number.MAX_SAFE_INTEGER` — so
   * this is coerced at exactly one place, below. `{"block":25930486}` and `{"block":"25930486"}`
   * are different bytes and therefore different report identities; the only safe source for a
   * `Report`'s `block` is the canonical JSON, which `load` parses.
   */
  readonly block: number;
  readonly createdAt: Date;
  /**
   * ⚠️ **When the author listed it, or `null` for a report nobody has published.** A landmark, not
   * a flag — the shape `purchases.settled_at` and `markets.resolved_at` use. `null` does not mean
   * the report is unavailable: its page and its x402 gate both work. It means it is not on `/`.
   */
  readonly publishedAt: Date | null;
}

interface ReportRow {
  hash: string; analyst: string; directive: string; title: string | null;
  canonical_json: string;
  block: string; observed_at: Date; created_at: Date; published_at: Date | null;
}

/**
 * Store a report. Returns whether it was written or was already there.
 *
 * ⚠️ **The canonical string goes in the column, not a re-serialisation of the object.** The bytes
 * that were hashed are the bytes that are stored. Re-serialising later — even through the same
 * canonicalizer — would be a second chance to differ.
 *
 * ⚠️ **`ON CONFLICT (hash) DO NOTHING`, and that is safe rather than lossy.** The hash is derived
 * from the content, so a conflict means the incoming report is byte-identical to the stored one by
 * construction: there is nothing to overwrite. `DO UPDATE` would be the wrong choice — it would let
 * one hash hold two versions, which is exactly what the identity is supposed to make impossible.
 *
 * ⚠️ **A `Report` and nothing else.** There was briefly a `renderedMd` parameter, because
 * `rendered_md` was `NOT NULL` in 001_init; the column was dropped in 002 and the parameter with it.
 * Markdown is a *view* of a report, not part of one: `render()` is a pure function of what is stored
 * here, so caching its output could only diverge from its source, and filling the column honestly
 * would have meant the store importing from the agent. Unit 6 renders on read.
 */
export async function save(report: Report): Promise<{ hash: string; inserted: boolean }> {
  // ⚠️ Computed here, never taken from a caller. Both come from the same pure function of the same
  // object, so the key and the bytes cannot disagree.
  const json = canonical(report);
  const hash = reportHash(report);

  const rows = await db()<{ hash: string }[]>`
    INSERT INTO reports (hash, analyst, directive, canonical_json, block, observed_at)
    VALUES (${hash}, ${report.analyst}, ${report.subject.directive},
            ${json}, ${report.block}, ${report.observedAt})
    ON CONFLICT (hash) DO NOTHING
    RETURNING hash`;
  return { hash, inserted: rows.length === 1 };
}

/**
 * Load a report, or `null` if there is no such hash.
 *
 * ⚠️ **The `Report` is parsed from `canonical_json` and never reassembled from columns.** That is
 * the whole reason the BIGINT coercion trap does not exist on this path: `block` comes out of the
 * JSON as the number it was serialised as, not out of the driver as a string. The columns beside
 * `canonical_json` exist for querying and display; they are not a second source of truth for the
 * object, and treating them as one would be a silent identity change inside a hashed value.
 *
 * ⚠️ **Two checks, and a failure is a throw rather than a warning.** A row whose stored JSON has
 * been altered must not be served — this hash is what a market settles against.
 */
/**
 * The narrator's own name for a report. ⚠️ **Written AFTER `save()`, never inside `canonical()`** —
 * the same shape `recordContextDigest` uses and for the same reason: `Report` is the hashed object
 * and four of its hashes are committed in ATS creation events on Hedera. A column is invisible to
 * `canonical()`, so `load()`'s integrity checks are unaffected.
 *
 * A `null` title is a no-op rather than a write, so a narrator that produced an unusable one (a
 * digit, or nothing) leaves the column NULL — which already means "no title" and needs no second
 * spelling.
 */
export async function recordTitle(reportHash: string, title: string | null): Promise<void> {
  if (!title) return;
  await db()`UPDATE reports SET title = ${title} WHERE hash = ${reportHash}`;
}

export async function load(hash: string): Promise<Report | null> {
  const [row] = await db()<ReportRow[]>`
    SELECT hash, analyst, directive, canonical_json, block, observed_at, created_at
    FROM reports WHERE hash = ${hash}`;
  if (!row) return null;

  const parsed = JSON.parse(row.canonical_json) as Omit<Report, 'atsTokenAddress'>;

  // ⚠️ `canonical()` STRIPS lifecycle fields, so `atsTokenAddress` is not in the stored JSON and
  // comes back as an absent key rather than `null`. The contract says unavailable is `null`, spelled
  // out, never absent — so it is reattached. This does not affect either check below, because
  // `canonical()` strips it again on the way in: measured, both forms hash identically. Which token
  // (if any) belongs to this report lives in `report_tokens`, and joining it is Unit 8's business.
  const report: Report = { ...parsed, atsTokenAddress: null } as Report;

  // Check 1 — the content is what the key says it is.
  const recomputed = reportHash(report);
  if (recomputed !== row.hash) {
    throw new Error(
      `report ${row.hash} failed its hash check: the stored JSON canonicalizes to ${recomputed}. ` +
      'The row has been altered since it was written. Refusing to serve it — this hash is the ' +
      'identity an ATS token commits and an Arc market settles against.',
    );
  }

  // Check 2 — the stored bytes are canonical, not merely equivalent. Catches an edit that preserves
  // content while changing form (reordered keys, whitespace), which check 1 alone would pass because
  // canonicalization would normalise it away.
  const recanonicalized = canonical(report);
  if (recanonicalized !== row.canonical_json) {
    throw new Error(
      `report ${row.hash} is stored in non-canonical form: ${row.canonical_json.length} bytes ` +
      `stored against ${recanonicalized.length} bytes canonical. The hash still matches, so the ` +
      'content is intact and the bytes are not — which means something rewrote the column.',
    );
  }

  return report;
}

/**
 * Everything needed to render an index page, newest first. ⚠️ Not the full reports — a list of
 * twenty would otherwise be twenty canonical blobs, and this is the query an index makes.
 */
export async function list(limit = 50): Promise<ListedReport[]> {
  const rows = await db()<ReportRow[]>`
    SELECT hash, analyst, directive, title, block, created_at, published_at
    FROM reports ORDER BY created_at DESC LIMIT ${limit}`;
  return rows.map(toListed);
}

/**
 * The marketplace's own query: **published reports only, most recently listed first.**
 *
 * ⚠️ **A SECOND FUNCTION RATHER THAN A FLAG ON `list()`, AND THE CALLERS ARE WHY.** `list()` has
 * four other callers — the console's document panel, its title lookup, `/api/console/state` and two
 * demo scripts — and every one of them wants *every* report, including the unpublished ones. The
 * console is where an author works on a draft; filtering it would hide the very reports someone
 * opens the console to publish. So `list()` keeps meaning "what is in the store" and this one means
 * "what is for sale", and neither can be mistaken for the other at a call site.
 *
 * ⚠️ **Ordered by `published_at`, not `created_at`.** A shopfront is ordered by when things were put
 * in the window. An old report published today is new to the market and belongs at the top.
 */
export async function listPublished(limit = 50): Promise<ListedReport[]> {
  const rows = await db()<ReportRow[]>`
    SELECT hash, analyst, directive, title, block, created_at, published_at
    FROM reports WHERE published_at IS NOT NULL
    ORDER BY published_at DESC LIMIT ${limit}`;
  return rows.map(toListed);
}

/**
 * List a report in the marketplace. Returns the landmark and whether this call set it.
 *
 * ⚠️ **IDEMPOTENT, AND THE `IS NULL` GUARD IS THE WHOLE POINT.** Publishing twice must not move the
 * timestamp: the landmark records *when* a report was listed, and a second press is not a second
 * listing. `changed: false` with the original date is the honest answer to "publish this again".
 *
 * ⚠️ **There is no `unpublish`, deliberately.** 009's header carries the reasoning: writing NULL
 * back does not record a withdrawal, it erases the fact that the report was ever listed — and five
 * reports in this store have settled x402 purchases against them, which is money that moved on
 * Hedera against something that was for sale. A withdrawal is its own landmark if it is ever wanted.
 *
 * ⚠️ **Publishing is not tokenizing and neither implies the other.** A tokenized report can be
 * unlisted — the ATS security exists on Hedera whether or not our index shows it — and a published
 * report needs no token, which is the common case: x402 sells a read without one.
 *
 * Returns `null` when there is no such report, which a caller must not silently treat as success.
 */
export async function publish(reportHash: string): Promise<{ publishedAt: Date; changed: boolean } | null> {
  const [updated] = await db()<{ published_at: Date }[]>`
    UPDATE reports SET published_at = now()
     WHERE hash = ${reportHash} AND published_at IS NULL
     RETURNING published_at`;
  if (updated) return { publishedAt: updated.published_at, changed: true };

  // Either it was already published or the hash is unknown — and those are different answers.
  const [existing] = await db()<{ published_at: Date | null }[]>`
    SELECT published_at FROM reports WHERE hash = ${reportHash}`;
  if (!existing) return null;
  return { publishedAt: existing.published_at!, changed: false };
}

function toListed(r: ReportRow): ListedReport {
  return {
    hash: r.hash,
    analyst: r.analyst,
    directive: r.directive,
    title: r.title ?? null,
    // ⚠️ **The one coercion in this file, and it is display-only.** See `ListedReport.block`. Safe
    // because an Ethereum block number is ~2.6e7 against `Number.MAX_SAFE_INTEGER` of ~9.0e15, and
    // this value never re-enters a hashed object — `load` is the only path back to a `Report`.
    block: Number(r.block),
    createdAt: r.created_at,
    publishedAt: r.published_at ?? null,
  };
}

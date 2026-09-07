// A report's 32-byte fingerprint.
//
// ⚠️ This hash is the one thing that crosses between chains: it is committed on Hedera in the ATS
// creation event (`additionalSecurityData.info = "alpha:<hash>"`) and passed to `commitPrediction`
// on Arc. Anyone can check that both refer to the same bytes. **If our hasher and an outside
// verifier disagree by a single byte, settlement disputes become unresolvable** — so this file has
// one implementation and no alternatives.
//
// ⚠️ **Do not write a second canonicalizer.** SM-01 proved this path against RFC 8785's own
// reference vectors — 29 checks, including all 24 IEEE-754 number samples from Appendix B — and its
// fixture went on to freeze half the wire contract. Two canonicalizers that disagree is exactly the
// dispute nobody can resolve. If you find yourself writing another, stop.

import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
import type { LifecycleField, Report } from '../types/report.js';

/**
 * Fields that come into existence only AFTER the hash is committed, stripped before hashing.
 * The ATS creation event carries the hash, so the hash cannot carry the token — that is circular.
 */
const LIFECYCLE = ['atsTokenAddress'] as const satisfies readonly LifecycleField[];

// ⚠️ The runtime denylist and the type-level `HashableReport` must not drift. This fails to compile
// if a field is added to `LifecycleField` and not to the array above — the direction that matters,
// because a lifecycle field left in the hash makes the hash uncomputable before the token exists.
type Unstripped = Exclude<LifecycleField, (typeof LIFECYCLE)[number]>;
const _noUnstrippedLifecycleFields: Unstripped extends never ? true : never = true;
void _noUnstrippedLifecycleFields;

const denied = new Set<string>(LIFECYCLE);

/**
 * Remove lifecycle fields at every depth. Recursive rather than top-level to match SM-01 exactly —
 * the recorded hashes below are only reproducible if this behaves identically.
 */
const strip = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(strip);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([k]) => !denied.has(k))
        .map(([k, v]) => [k, strip(v)]),
    );
  }
  return value;
};

/**
 * RFC 8785 canonical JSON, lifecycle fields removed.
 *
 * ⚠️ Takes `unknown` on purpose. JCS is shape-agnostic, and the same bytes must come out whether the
 * input is a `Report`, a raw query response, or a conformance vector — one implementation serving
 * every caller is the point. `reportHash` below is the typed entry point for reports.
 *
 * ⚠️ **This is not pure JCS — it strips lifecycle fields first, so it is "canonicalize a report".**
 * On a subgraph response the strip is a no-op, because no query response contains a key named
 * `atsTokenAddress`. That is true today and is recorded here rather than left to be rediscovered.
 * The alternative was two entry points, one stripping and one not, and two paths that can diverge is
 * the worse trade — divergence is the failure this whole file exists to prevent.
 */
export function canonical(value: unknown): string {
  return canonicalize(strip(value)) as string;
}

/** SHA-256 over the canonical UTF-8 bytes. 64 hex characters — 32 bytes. */
export function hashCanonical(value: unknown): string {
  return createHash('sha256').update(canonical(value), 'utf8').digest('hex');
}

/**
 * The report's identity.
 *
 * ⚠️ **Narration is inside the hash**, along with everything else except lifecycle fields. If prose
 * were excluded, an analyst could publish a report, let a market open against its hash, and then
 * rewrite the words while keeping the same token — the same identity carrying a different claim.
 */
export function reportHash(report: Report): string {
  return hashCanonical(report);
}

/** The same hash as raw bytes, for the `bytes32` the Arc contract and the ATS event take. */
export function reportHashBytes(report: Report): Uint8Array {
  return Uint8Array.from(Buffer.from(reportHash(report), 'hex'));
}

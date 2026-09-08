// Unit 11. The guard that makes an invented figure impossible rather than unlikely.
//
// ⚠️ **Pure, and it never repairs.** A validator that silently fixes its input is one you cannot
// trust, and it would hide exactly the failures this exists to catch. `Report` in, violations out.
//
// ⚠️ **Not merged into `narrate.ts`'s presence gate, deliberately.** That gate asks whether a table
// and a summary came back at all; this asks whether what came back is honest. Same reason the
// narrator's header gives for keeping generation and checking apart: a bug in one hides in the other.
//
// ── The digit policy, and why this one ───────────────────────────────────────────────────────────
//
// The text validated here is PRE-SUBSTITUTION. `render()` fills `{fact:ID}` afterwards, so a
// legitimate figure appears here as `{fact:aave-v3-ethereum.totalDepositBalanceUSD}` and never as
// `$24.82B`. Any money or percentage in this text is fabricated by construction — which removes most
// of the ambiguity before any rule is written.
//
// So: strip placeholders, allow tokens the REPORT'S OWN DATA supplied, reject every digit left.
//
// The allowlist is derived from the report rather than hardcoded. That is the whole trick, and it
// buys three things: it cannot rot when a protocol is added, it cannot be gamed because the model
// cannot add facts, and a block number passes only if it is the block this report was read at.
//
// Rejected alternatives, so nobody re-litigates them:
//   - **Allowlist by context** (`block N`, `N of M`, protocol names) needs guessable regexes that a
//     fabricated figure can be phrased into. Clever where narrow was available.
//   - **Allowlist by magnitude** (small integers pass) fails on the merits: magnitude does not
//     correlate with legitimacy. `63` is fine and `25927842` is fine; `5` is not fine when it means
//     five billion dollars.
//
// ⚠️ A true-but-uncitable number — "63 markets" — is REJECTED, and that is the policy working. It
// says a fact is missing, not that the rule is too strict. The fix is to promote the count to a
// `unit: 'count'` fact so the model can cite it, not to loosen this.

import type { Report, Section, Assessment } from '../types/report.js';

export type ViolationKind = 'typed-digit' | 'unknown-fact' | 'unknown-basis' | 'bad-confidence';

export interface Violation {
  readonly kind: ViolationKind;
  /** Where it was found — `summary`, or `figures[2]` for the third paragraph of that section. */
  readonly where: string;
  /** The offending token or id, quoted, plus what was expected. */
  readonly detail: string;
}

const PLACEHOLDER = /\{fact:[^}]*\}/g;
const HAS_DIGIT = /[0-9]/;
/** Separators inside an identifier: `aave-v3-ethereum`, `makerdao · RWA015-A — deposits`. */
const PARTS = /[\s\-–—·|/,]+/;
const CONFIDENCE = ['low', 'medium', 'high'];

/**
 * Lowercase, drop the punctuation a word carries in prose but not in an identifier, and drop a
 * trailing possessive.
 *
 * ⚠️ The possessive is not cosmetic — measured 2026-09-08, a real report said "Compound v2's" and
 * the validator rejected `v2's` while `v2` was in the allowlist. A guard that fires on English
 * grammar teaches everyone to ignore it.
 */
const norm = (t: string) => t.toLowerCase().replace(/['’]s$/, '').replace(/^[^\w$%]+|[^\w%]+$/g, '');

/**
 * Every token the report's own data put on the page: slugs, market names inside labels, the
 * deployments it covers, and the block it was read at — each whole, and each split on separators so
 * `v3` clears from `aave-v3-ethereum` and `RWA015-A` clears from a market label.
 */
function allowed(report: Report): Set<string> {
  const sources = [
    ...Object.values(report.facts).flatMap((f) => [f.slug, f.label]),
    ...report.subject.deployments,
    String(report.block),
  ];
  const out = new Set<string>();
  for (const s of sources) {
    out.add(norm(s));
    // ⚠️ TWO splits, and both are needed. Whitespace-only keeps hyphenated identifiers whole, which
    // is how `RWA015-A` clears from the label `makerdao-ethereum · RWA015-A — deposits`. The
    // separator split then breaks those down, which is how `v3` clears from `aave-v3-ethereum`.
    // Measured 2026-09-08: with only the separator split, a real MakerDAO breakdown was rejected for
    // naming five of its own collateral types, because the split had eaten the hyphen inside them.
    for (const part of s.split(/\s+/)) if (part) out.add(norm(part));
    for (const part of s.split(PARTS)) if (part) out.add(norm(part));
  }
  return out;
}

/** Digit-bearing tokens in `text` that the report's own data does not account for. */
function typedDigits(text: string, ok: Set<string>): string[] {
  return text.replace(PLACEHOLDER, ' ').split(/\s+/)
    .map(norm).filter((t) => t && HAS_DIGIT.test(t) && !ok.has(t));
}

export function validate(report: Report): Violation[] {
  const v: Violation[] = [];
  const ok = allowed(report);
  const facts = report.facts;

  const scan = (text: string, where: string) => {
    for (const token of typedDigits(text, ok)) {
      v.push({ kind: 'typed-digit', where, detail: `"${token}" is a digit sequence with no {fact:ID} and no match in the report's own identifiers` });
    }
  };

  for (const sec of report.sections as readonly Section[]) {
    sec.paragraphs.forEach((p, i) => {
      scan(p.text, `${sec.id}[${i}]`);
      // ⚠️ `factRefs` are derived from the text by `narrate`, so an unresolvable one means the model
      // cited a fact that does not exist — which would render as `⟨unknown fact …⟩` to a reader.
      for (const id of p.factRefs) {
        if (!facts[id]) v.push({ kind: 'unknown-fact', where: `${sec.id}[${i}]`, detail: `{fact:${id}} resolves to nothing` });
      }
    });
  }

  const assessment = report.assessment as Assessment;
  scan(assessment.summary, 'summary');
  // An opinion pointing at nothing is worse than no opinion.
  for (const id of assessment.basis) {
    if (!facts[id]) v.push({ kind: 'unknown-basis', where: 'summary.basis', detail: `basis names "${id}", which is not a fact in this report` });
  }
  if (!CONFIDENCE.includes(assessment.confidence)) {
    v.push({ kind: 'bad-confidence', where: 'summary.confidence', detail: `"${assessment.confidence}" is not one of ${CONFIDENCE.join(', ')}` });
  }
  return v;
}

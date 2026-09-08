// Proof for `src/tokenize/isin.ts`. Five checks, no network — this unit is arithmetic, and a proof
// that needs a database or a chain would be proving something else.
//
// ⚠️ **The two real report hashes are inlined as fixtures rather than read from Neon.** They are the
// primary keys of the two reports Unit 5 stored, copied on 2026-09-08. Reading them live would make
// a pure-computation proof depend on a network round trip and on the database still holding those
// rows — and the point of the check is the arithmetic, which does not care where the hash came from.

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { completeIsin, isinFor } from '../../src/tokenize/isin.js';

/** Primary keys of the two reports in Neon, 2026-09-08. */
const REAL_HASHES = [
  '24041ca282d260d3ad843d197086f595d6a2fab46d4e5aadf3e1c1517bfdd3e5',
  'f2285b4e60905abf34fc2d503913421b13212951e6cf203d0d769d204ce3a84e',
];

// ── The child half of check 2 ────────────────────────────────────────────────────────────────────
// Re-entered as a subprocess so "stable across processes" is measured rather than asserted.
if (process.argv[2] === '--child') {
  console.log(process.argv.slice(3).map(isinFor).join('\n'));
  process.exit(0);
}

/**
 * ⚠️ **An INDEPENDENT check digit, and the independence is the point.** A generator that agrees with
 * itself proves nothing about what `isinValidator.sol` will accept. This shares no code with
 * `completeIsin`, and computes the same value a different way: it reverses the digit string and
 * doubles from the left of the reversed array rather than computing a `pairing` parity, and it folds
 * a doubled digit with the Luhn shortcut `x - 9` rather than `floor(x/10) + x%10`.
 *
 * ⚠️ It is also STRICTER than the contract on purpose. `_byteToCode` does no alphabet check — it
 * would happily consume lowercase, or `$`, and compute something. This throws, because the thing we
 * need to know is not "will the contract accept it" but "is it an ISIN".
 */
function independentCheckDigit(first11: string): string {
  const values = [...first11].map((ch) => {
    if (ch >= '0' && ch <= '9') return ch.charCodeAt(0) - 48;
    if (ch >= 'A' && ch <= 'Z') return ch.charCodeAt(0) - 55;
    throw new Error(`character ${JSON.stringify(ch)} is outside the ISIN alphabet 0-9A-Z`);
  });
  const digits = values.flatMap((v) => (v > 9 ? [Math.floor(v / 10), v % 10] : [v]));
  let sum = 0;
  digits.reverse().forEach((d, i) => {
    const x = i % 2 === 0 ? d * 2 : d;   // index 0 is the RIGHTMOST digit, and it doubles
    sum += x > 9 ? x - 9 : x;            // the digit sum of 10..18 is always x - 9
  });
  return String((10 - (sum % 10)) % 10);
}

let failed = 0;
const check = (ok: boolean, label: string, detail = '') => {
  console.log(`  ${ok ? '✅' : '❌'} ${label}${detail ? `  ${detail}` : ''}`);
  if (!ok) failed++;
};

// ── 1. Three real ISINs ──────────────────────────────────────────────────────────────────────────
console.log('\n1. reproduces three real ISINs (the same three SM-07 asserted against)');
for (const isin of ['US9311421039', 'GB0002634946', 'US0378331005']) {
  check(completeIsin(isin.slice(0, 11)) === isin, isin, `→ ${completeIsin(isin.slice(0, 11))}`);
}

// ── 2. Deterministic, in this process and another ────────────────────────────────────────────────
console.log('\n2. same hash → same ISIN, across runs and across processes');
const here = REAL_HASHES.map(isinFor);
const again = REAL_HASHES.map(isinFor);
check(here.join() === again.join(), 'stable within this process', here.join(' '));
const child = execFileSync('npx', ['tsx', fileURLToPath(import.meta.url), '--child', ...REAL_HASHES], {
  encoding: 'utf8',
}).trim().split('\n');
check(here.join() === child.join(), 'stable in a separate process', child.join(' '));

// ── 3. Distinct hashes → distinct ISINs ──────────────────────────────────────────────────────────
const SYNTHETIC = 1_000_000;
console.log(`\n3. distinct hashes → distinct ISINs  (${REAL_HASHES.length} real + ${SYNTHETIC.toLocaleString()} synthetic)`);
const seen = new Map<string, string>();
const collisions: string[] = [];
for (const h of REAL_HASHES) seen.set(isinFor(h), h);
for (let i = 0; i < SYNTHETIC; i++) {
  const h = createHash('sha256').update(`alpha-markets/synthetic/${i}`).digest('hex');
  const isin = isinFor(h);
  const prior = seen.get(isin);
  if (prior !== undefined) collisions.push(`${isin}: ${prior} vs ${h}`);
  else seen.set(isin, h);
}
check(collisions.length === 0, `${seen.size.toLocaleString()} distinct ISINs from ${(SYNTHETIC + REAL_HASHES.length).toLocaleString()} distinct hashes`,
  collisions.length ? `\n      ${collisions.slice(0, 3).join('\n      ')}` : '0 collisions');
console.log(`     real: ${REAL_HASHES.map((h) => `${h.slice(0, 8)}… → ${isinFor(h)}`).join('\n           ')}`);

// ── 4. The check digit under an independent implementation ───────────────────────────────────────
console.log('\n4. check digit validates under an independent implementation');
for (const isin of ['US9311421039', 'GB0002634946', 'US0378331005']) {
  check(independentCheckDigit(isin.slice(0, 11)) === isin[11], `${isin} (real)`);
}
let disagreed = 0;
for (const [isin] of seen) {
  if (independentCheckDigit(isin.slice(0, 11)) !== isin[11]) disagreed++;
}
check(disagreed === 0, `all ${seen.size.toLocaleString()} generated ISINs agree`, `${disagreed} disagreements`);

// Shape, checked separately from the digit: 12 characters, uppercase alphanumeric, XX prefix.
const badShape = [...seen.keys()].filter((i) => !/^XX[0-9A-Z]{9}[0-9]$/.test(i));
check(badShape.length === 0, 'all are 12 chars, XX + 9 uppercase alphanumeric + digit', `${badShape.length} malformed`);

console.log(`\n${failed === 0 ? 'PASS' : `FAIL — ${failed} check(s)`}\n`);
process.exit(failed === 0 ? 0 : 1);

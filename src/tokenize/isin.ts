// The ISIN a report's ATS token carries. Pure computation — no chain, no store, no network.
//
// ⚠️ **Why this is its own unit, ahead of the one that uses it.** The check digit is validated
// ON-CHAIN by the ATS factory (`factory/isinValidator.sol`), which reverts `WrongISINChecksum`.
// Unit 8's deploy costs real HBAR and a revert produces nothing, so the digit is proved here —
// against three real ISINs and against an independent implementation — before anything is paid for.
//
// ⚠️ **What was wrong before.** SM-07 minted under the hardcoded constant `"XXALPHA00015"`. Every
// report token would have carried the same identifier, making two reports indistinguishable by the
// one field whose entire purpose is to distinguish securities. The identifier is now derived from
// the report hash, which is the report's identity everywhere else in this system.

/**
 * ⚠️ ISO 6166's code for an unassigned issuer — the test/placeholder prefix, and SM-07's choice.
 * **Kept deliberately.** We are not a registered national numbering agency, and stamping a real
 * country prefix on a public testnet would be a false claim about who issued the security.
 */
const PREFIX = 'XX';

/** 2 prefix + 9 body + 1 check digit = 12. The contract's `_ISIN_LENGTH`. */
const BODY_LENGTH = 9;

/**
 * ⚠️ **36, not 16, and this is the whole design decision.** The ISIN alphabet is `0-9A-Z`, but a
 * report hash is hex — `0-9a-f`. Slicing nine characters off the hash would spend nine ISIN
 * positions carrying only 16 values each: 16⁹ ≈ 6.87e10 instead of 36⁹ ≈ 1.02e14, throwing away
 * **99.93% of the space** while looking like a nine-character identifier. So the hash is read as one
 * 256-bit integer and re-encoded in base 36, which uses every position the alphabet allows.
 *
 * 36⁹ = 101,559,956,668,416.
 */
const ALPHABET_SIZE = 36n;
const SPACE = ALPHABET_SIZE ** BigInt(BODY_LENGTH);

/**
 * The ISO 6166 check digit, appended to the first 11 characters.
 *
 * ⚠️ **Promoted from `scripts/smoke/07-ats-issue-transfer.ts`, not rewritten.** That version was
 * asserted against three real ISINs before SM-07 spent anything, and it mirrors
 * `factory/isinValidator.sol` line for line: the same letter expansion, the same `pairing` parity,
 * the same digit-sum, the same `(10 - sum % 10) % 10`. Reimplementing a validated algorithm to make
 * it look native here would trade a proven thing for a plausible one.
 *
 * The algorithm, for a reader who does not want to reverse-engineer it: each character becomes its
 * value (`0-9` → 0-9, `A-Z` → 10-35); a value above 9 expands into its two digits, so the digit
 * string is longer than the input; then, counting from the RIGHT, every second digit doubles, and
 * a doubled result above 9 is summed as its own two digits. `pairing` is what makes "from the right"
 * work on a left-indexed loop — `(length + 1) % 2` has the same parity as `length - 1`.
 */
export function completeIsin(first11: string): string {
  const conv: number[] = [];
  for (const ch of first11) {
    const c = ch.charCodeAt(0) > 57 ? ch.charCodeAt(0) - 55 : ch.charCodeAt(0) - 48;
    if (c > 9) conv.push(Math.floor(c / 10), c % 10);
    else conv.push(c);
  }
  const pairing = (conv.length + 1) % 2;
  let sum = 0;
  conv.forEach((d, i) => {
    const c = d * (i % 2 === pairing ? 2 : 1);
    sum += c > 9 ? Math.floor(c / 10) + (c % 10) : c;
  });
  return first11 + String((10 - (sum % 10)) % 10);
}

/**
 * The ISIN for a report, derived from its hash. Deterministic: the same hash always yields the same
 * ISIN, in this process and any other, because it is arithmetic over the hash and nothing else.
 *
 * Accepts the 64-character hex the store uses as a primary key, with or without a `0x` prefix.
 */
export function isinFor(reportHash: string): string {
  const hex = reportHash.startsWith('0x') ? reportHash.slice(2) : reportHash;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(
      `not a report hash: ${JSON.stringify(reportHash)} — expected 64 hex characters, got ${hex.length}. ` +
      'The ISIN is derived from the hash and there is no sensible fallback for a malformed one.',
    );
  }

  // ⚠️ **`% SPACE` rather than truncating the base-36 string.** Encoding the whole 256-bit value and
  // slicing the front would bias the leading characters toward the low end of the alphabet, because
  // the leading digits of a fixed-width number are not uniform. The remainder is. The modulo bias is
  // real but not worth a thought: 2²⁵⁶ / 36⁹ ≈ 1.14e63 complete cycles, so the residue classes
  // differ in frequency by about one part in 1e63.
  const value = BigInt(`0x${hex}`) % SPACE;

  // ⚠️ **`.toUpperCase()` is load-bearing, and `.padStart` is too.** JavaScript's `toString(36)`
  // emits LOWERCASE, and a small remainder emits fewer than nine characters. The contract would
  // accept both: `_byteToCode` does no alphabet check, and it maps lowercase to the same expansion
  // our generator would, so a lowercase ISIN is self-consistent and passes on-chain. It is still not
  // an ISIN — ISO 6166 is uppercase alphanumeric, and every validator that is not this one contract
  // rejects it. A short body would simply be the wrong length and revert `WrongISIN`.
  const body = value.toString(36).toUpperCase().padStart(BODY_LENGTH, '0');

  return completeIsin(`${PREFIX}${body}`);
}

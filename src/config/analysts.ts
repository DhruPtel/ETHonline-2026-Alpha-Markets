// Who publishes a report, in one place. Nothing downstream hardcodes an address; adding an analyst
// is adding a row, the same shape as `config/protocols.ts`.
//
// ⚠️ **`arcAddress` is inside the report hash.** `Report.analyst` carries it, `domain/canonical.ts`
// hashes it, and `scripts/demo/canonical.ts` proves a changed analyst changes the hash. A typo would
// hash perfectly cleanly and produce a report attributed to an address that can never claim it on
// Arc — which is why this is a file that gets checked against a live API rather than a literal that
// gets copied. `scripts/ops/verify-analyst.ts` is that check.
//
// ⚠️ **Addresses only, never balances.** On Arc `msg.value` arrives at 18 decimals while the ERC-20
// at the same address reports `decimals() = 6` — a factor of 10^12 (SM-08). A stored balance would
// be wrong at one of the two scales and this file has no business holding one.
//
// Provenance of every value below, so none of it is a guess:
//   arcAddress        read live from `circle.getWallet({ id: CIRCLE_WALLET_ID })`, 2026-09-08 —
//                     accountType EOA, blockchain ARC-TESTNET, custodyType DEVELOPER, state LIVE
//   hederaAccountId   `HEDERA_SELLER_ID`, the account SM-05 settled to and SM-07 issued from
//   hederaEvmAddress  READ from Mirror Node `/api/v1/accounts/0.0.10387690` → `evm_address`,
//                     not derived. Cross-checked once against `ethers.Wallet(key).address` and the
//                     two agree; Mirror Node is the recorded source because it is the account's own
//                     answer rather than ours about it.

import { MODEL } from './model.js';

/**
 * One analyst. The three addresses are three roles of one identity, not three identities.
 *
 * ⚠️ **`hederaAccountId` and `hederaEvmAddress` are two forms of ONE account**, not two accounts.
 * Hedera gives an ECDSA account both a `0.0.x` id and an EVM alias; the consensus-node world
 * (x402 settlement, `payTo`) speaks the first and the EVM world (ATS tokens, `balanceOf`,
 * `transfer`) speaks the second. Recording both is recording one fact twice on purpose, because
 * deriving one from the other at each call site is where they drift.
 */
export interface AnalystConfig {
  /** Short, stable handle. What other code refers to; never rendered to a reader. */
  readonly id: string;
  /** Presentation only. Nothing keys on it and nothing hashes it. */
  readonly displayName: string;
  /**
   * ⚠️ **The identity.** The Circle developer-controlled wallet that signs on Arc, and the value
   * that lands in `Report.analyst` and therefore inside the report hash.
   *
   * Must be an **EOA**, never an SCA (§5.18): `claimId` derives the author from `msg.sender`, and
   * only an EOA's Circle address is deterministic.
   */
  readonly arcAddress: string;
  /** The Hedera `0.0.x` account: the x402 `payTo`, and the ATS deployer / admin / issuer. */
  readonly hederaAccountId: string;
  /** The same account in EVM form — what receives and holds the ATS report token. */
  readonly hederaEvmAddress: string;
  /** Which model this analyst runs. Separate analysts running separate models is the premise. */
  readonly model: string;
}

export const ANALYSTS: readonly AnalystConfig[] = [
  { id: 'alpha-1', displayName: 'Alpha Markets House Analyst',
    arcAddress: '0x1b7035bbe0da8f3bcb721863d42e1079e4a116a7',
    hederaAccountId: '0.0.10387690',
    hederaEvmAddress: '0x32838fe90541567bbf77fa0570661f3c20e2b152',
    model: MODEL },
];

/**
 * Resolve an id to a row, or throw.
 *
 * ⚠️ **Throws rather than returning `null`, deliberately.** Every caller of this is on a path that
 * ends in a hashed report, a token, or an on-chain claim, and there is no sensible way to continue
 * without an author. A silent `undefined` would reach `Report.analyst` as the string `"undefined"`
 * and hash exactly as cleanly as a real address does.
 */
export function analyst(id: string): AnalystConfig {
  const found = ANALYSTS.find((a) => a.id === id);
  if (!found) {
    throw new Error(
      `unknown analyst "${id}" — registered ids are ${ANALYSTS.map((a) => a.id).join(', ')}. ` +
      'An unregistered analyst cannot be attributed: the address is inside the report hash and is ' +
      'what an on-chain claim is staked from.',
    );
  }
  return found;
}

/**
 * Resolve the analyst that WROTE a report, from the address the report carries.
 *
 * ⚠️ **`Report.analyst` holds the `arcAddress`**, so that is the key — not the Hedera account, even
 * though what most callers want off the row is `hederaAccountId`. The report is hashed with the Arc
 * address inside it because that is the identity an on-chain claim is staked from; the Hedera
 * account is the same identity in the other world (§5.18, and the note on `hederaEvmAddress` above).
 *
 * ⚠️ **Hoisted out of `tokenize/ats.ts` on 2026-09-08, before it was copied.** The loop sweep flagged
 * it as a duplication about to happen: Unit 8 had it inlined, and Units 13 and 14 both need the same
 * resolution to find a report's `payTo`. Three copies of a `.find()` is three places to forget the
 * case-insensitive compare.
 *
 * ⚠️ **Case-insensitive, deliberately.** An EVM address is hex and its casing is EIP-55 checksum
 * information, not identity. `analysts.ts` stores lowercase, a report carries whatever `execute`
 * wrote, and a strict compare would fail on a correctly-checksummed address.
 *
 * Throws rather than returning `null`, for the same reason `analyst()` does: every caller is on a
 * path that ends in a token, a payment challenge or an on-chain claim, and none of them can proceed
 * without an author.
 */
export function analystByArcAddress(arcAddress: string): AnalystConfig {
  const found = ANALYSTS.find((a) => a.arcAddress.toLowerCase() === arcAddress.toLowerCase());
  if (!found) {
    throw new Error(
      `no registered analyst has arcAddress ${arcAddress}. A report attributed to an unregistered ` +
      'address has no issuer and no payTo: both come from the analyst row, and there is no fallback.',
    );
  }
  return found;
}

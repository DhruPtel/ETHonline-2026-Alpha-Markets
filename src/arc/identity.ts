// The two-way key attestation. One sentence, signed by both of the analyst's keys.
//
// ── The one link that is not publicly checkable, and what this does about it ─────────────────────
//
// Everything else in the binding between a report and a stake is already a public fact on a public
// chain, and a sceptic can read each one without us:
//
//   the token carries `alpha:<hash>`      Hedera, in the ATS creation event
//   the analyst issued that token         Hedera, the issuer address on the proxy
//   an Arc address committed that hash    Arc, in `PredictionCommitted`
//
// ⚠️ **The join between the Arc address and the Hedera issuer is `config/analysts.ts` — our file, on
// our repo.** Every other step is verifiable against a chain; that one is verifiable against our
// word. This file replaces the word with two signatures anyone can recover.
//
// ⚠️ **THIS IS VERIFICATION, NOT ENFORCEMENT, AND THE DIFFERENCE IS THE WHOLE HONEST LIMIT.** The
// Arc contract never sees these signatures. `commitPrediction` takes a `bytes32` and does not care
// where it came from, so a commit remains perfectly possible without any attestation existing — a
// verifier has to *choose* to check this. What it buys is narrow and real: `config/analysts.ts`
// stops being an assertion and becomes a claim backed by two recoverable signatures. It does not
// stop anyone doing anything.
//
// ── Why there is no cross-chain message here, which was investigated rather than dismissed ───────
//
// Hedera testnet has a LayerZero endpoint (eid 40285). **Arc is not on LayerZero's deployed
// contracts list at all.** Circle's Arc testnet announcement names LayerZero as a developer-tool
// partner and Across, Stargate and Wormhole as the bridges — ⚠️ **a partner logo is not a deployed
// endpoint**, and this project has now been wrong six times about exactly that distinction.
//
// ⚠️ **And even with a bridge it would be the wrong tool.** A message proves a fact at send time.
// Enforcing "the analyst holds this token" would need one message per commit, priced and delayed per
// commit. The identity link is **permanent** — two keys belong to one analyst until the keys change
// — so it is signed once and read forever, and needs no bridge to be true.

import { ethers } from 'ethers';
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';
import { requiredEnv } from '../config/env.js';
import { type AnalystConfig } from '../config/analysts.js';
import { ARC } from './arc.js';

/** ⚠️ Bump this and every existing signature stops verifying, which is the intent of a version. */
export const ATTESTATION_SCHEMA = 'alpha-markets/identity-attestation/v1';

/** Hedera testnet. `tokenize/hedera.ts` holds the same number for the same account. */
const HEDERA_CHAIN_ID = 296n;

/**
 * The sentence. ⚠️ **Both keys sign these exact bytes and nothing else.**
 *
 * ⚠️ **Every part is load-bearing and a shorter message would prove less:**
 *
 *   the schema line      domain separation. A signature is just 65 bytes over a hash — without a
 *                        prefix naming what it is for, the same signature could be presented as an
 *                        attestation to something else entirely.
 *   **both addresses**   ⚠️ **the point of the whole file.** A signature over "I am the analyst"
 *                        proves nothing: it says a key signed a sentence. A signature over a
 *                        sentence *containing both addresses* is what ties them, because the Hedera
 *                        key is asserting the Arc address and the Arc key is asserting the Hedera
 *                        one. Neither could produce it alone.
 *   the analyst id       what `config/analysts.ts` keys on, so a reader can find the row this is
 *                        about rather than matching addresses by eye.
 *   both chain ids       an address is only meaningful on a chain. `0x1b70…` on Arc and the same
 *                        bytes somewhere else are not the same claim.
 *   `hederaAccountId`    the `0.0.x` form. The consensus-node world speaks it and the EVM world
 *                        speaks the alias; they are one account and the attestation says so.
 *
 * ⚠️ **No timestamp and no nonce, deliberately.** The claim is permanent — these two keys are one
 * analyst until a key changes — and a date inside the signed bytes would make a standing fact read
 * as a moment. When it was produced is recorded beside the signature, outside what was signed.
 */
export function attestationMessage(analyst: AnalystConfig): string {
  return [
    ATTESTATION_SCHEMA,
    '',
    `analyst:          ${analyst.id}`,
    `arc address:      ${analyst.arcAddress}   (chain ${ARC.chainId})`,
    `hedera address:   ${analyst.hederaEvmAddress}   (chain ${HEDERA_CHAIN_ID})`,
    `hedera account:   ${analyst.hederaAccountId}`,
    '',
    'These two addresses are one analyst. The Arc address commits predictions and stakes its own',
    'USDC on them; the Hedera address issues the report tokens those predictions cite. This message',
    'is signed by both keys, so each address vouches for the other.',
  ].join('\n');
}

/** One analyst's identity, claimed by both of its keys. ⚠️ `producedAt` is NOT inside `message`. */
export interface IdentityAttestation {
  readonly schema: string;
  readonly analyst: string;
  readonly arcAddress: string;
  readonly hederaEvmAddress: string;
  readonly hederaAccountId: string;
  /** The exact bytes that were signed. Rebuildable with `attestationMessage`, stored so a verifier
   *  does not have to trust that rebuild. */
  readonly message: string;
  /** EIP-191 personal_sign by the Circle wallet that commits on Arc. */
  readonly arcSignature: string;
  /** EIP-191 personal_sign by the Hedera key that issues report tokens. */
  readonly hederaSignature: string;
  /** ⚠️ Outside the signed bytes. Provenance, not a claim either key made. */
  readonly producedAt: string;
}

/**
 * Both signatures, recovered independently.
 *
 * ⚠️ **`ethers.verifyMessage` and nothing of ours.** The recovery must not run through any helper
 * this file writes, or the check becomes a check of our own arithmetic. This function only compares
 * what ethers recovered against what the attestation claims.
 *
 * ⚠️ It re-derives the message from the row rather than trusting `a.message`, and reports that
 * separately — a stored message that does not match the analyst row is a tampered attestation even
 * if both signatures over it recover perfectly.
 */
export function verifyAttestation(a: IdentityAttestation, analyst: AnalystConfig): {
  readonly arc: boolean; readonly hedera: boolean; readonly messageMatchesRow: boolean;
} {
  const recovered = (signature: string): string | null => {
    try { return ethers.verifyMessage(a.message, signature); } catch { return null; }
  };
  return {
    arc: recovered(a.arcSignature)?.toLowerCase() === a.arcAddress.toLowerCase(),
    hedera: recovered(a.hederaSignature)?.toLowerCase() === a.hederaEvmAddress.toLowerCase(),
    messageMatchesRow: a.message === attestationMessage(analyst),
  };
}

/**
 * Sign as the Arc identity, through Circle.
 *
 * ⚠️ **`signMessage` signs and does not send** — there is no transaction and no gas. It was read out
 * of the installed bundle rather than assumed: `POST /v1/w3s/developer/sign/message`, no fee field,
 * no `TransactionState`, and it returns a signature rather than a transaction id.
 *
 * ⚠️ **`encodedByHex` is deliberately not passed, and there is a trap worth naming here.** It
 * appears three times in the typings and **zero times in either shipped bundle** — which is the
 * exact shape of `generateIdempotencyKey`, the phantom export this project has been caught by. ⚠️
 * **But the conclusion does NOT transfer, and applying the heuristic blindly would be wrong.** That
 * rule is about *functions that must exist to be called*. `encodedByHex` is a request FIELD, and the
 * client spreads its whole input into the HTTP body (`{entitySecretCiphertext, ...s}`), so the
 * bundle never names it and does not need to. It is forwarded. We omit it anyway and sign plain
 * UTF-8, which sidesteps the question rather than answering it.
 */
export async function signAsArc(message: string): Promise<string> {
  const circle = initiateDeveloperControlledWalletsClient({
    apiKey: requiredEnv('CIRCLE_API_KEY'),
    entitySecret: requiredEnv('CIRCLE_ENTITY_SECRET'),
  });
  const signed = await circle.signMessage({ walletId: requiredEnv('CIRCLE_WALLET_ID'), message });
  const signature = signed.data?.signature;
  if (!signature) throw new Error(`Circle signMessage returned no signature: ${JSON.stringify(signed.data)}`);
  return signature;
}

/**
 * Sign as the Hedera identity, with the key that issues report tokens.
 *
 * ⚠️ **The same key and the same assertion `ats.ts:132` already makes.** That file refuses to
 * tokenize when `HEDERA_SELLER_KEY` derives an address other than the analyst row's — so the key
 * signing here is, by the same check, the key that issued every token this attestation is about.
 * Asserted rather than assumed, because a signature from the wrong key would recover cleanly and
 * attest to nothing.
 */
export async function signAsHedera(message: string, analyst: AnalystConfig): Promise<string> {
  const wallet = new ethers.Wallet(`0x${requiredEnv('HEDERA_SELLER_KEY').replace(/^0x/, '').slice(-64)}`);
  if (wallet.address.toLowerCase() !== analyst.hederaEvmAddress.toLowerCase()) {
    throw new Error(
      `HEDERA_SELLER_KEY derives ${wallet.address} but analyst ${analyst.id} is ` +
      `${analyst.hederaEvmAddress}. Refusing to sign: an attestation from the wrong key recovers ` +
      'perfectly and attests to nothing.',
    );
  }
  return wallet.signMessage(message);
}

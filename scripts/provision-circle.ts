// One-time setup: produce the "Entity Secret Ciphertext" Circle's console asks for.
//
//   npx tsx --env-file=.env scripts/provision-circle.ts
//
// Circle's console has a Register form that wants the 32-byte entity secret encrypted with Circle's
// entity public key, and the console does not generate it. This does — and stops there. Registration
// itself is manual, so the console flow hands back the recovery file.
//
// Two steps:
//   1. use CIRCLE_ENTITY_SECRET if it is already set, otherwise generate one and print it
//   2. fetch Circle's public key, encrypt, print the ciphertext to paste into the console
//
// ⚠️ This script creates no wallets. That is SM-08.
//
// ⚠️ The ciphertext is single-use in normal operation. Circle encrypts with RSA-OAEP, whose padding
// is randomised, so every API call needs a freshly generated ciphertext and the SDK does that for
// you at call time. The value printed here exists only to get through the console's Register form
// once. Do not store it, and do not treat it as a credential — the *secret* is the credential.

import { randomBytes } from "node:crypto";

import { generateEntitySecretCiphertext } from "@circle-fin/developer-controlled-wallets";

const CONSOLE_URL = "https://console.circle.com/wallets/dev/configurator";

// ─── Step 1 — the entity secret ──────────────────────────────────────────────────────────────────
// Reused if it already exists. Regenerating a registered secret would orphan every wallet derived
// from the old one, so this never overwrites.

console.log(`\n── Step 1 · entity secret`);

const existing = process.env.CIRCLE_ENTITY_SECRET?.trim();
let entitySecret: string;

if (existing) {
  if (!/^[0-9a-fA-F]{64}$/.test(existing)) {
    console.error(`\nSTOP  CIRCLE_ENTITY_SECRET is set but is not 32 bytes of hex.`);
    console.error(`      Expected 64 hex characters, got ${existing.length}.`);
    console.error(`      Fix it or unset it — this script will not overwrite a value that may already`);
    console.error(`      be registered with Circle.`);
    process.exit(1);
  }
  entitySecret = existing.toLowerCase();
  console.log(`  CIRCLE_ENTITY_SECRET is already set — reusing it, not regenerating.`);
  console.log(`  (a registered secret can never be rotated without re-provisioning every wallet)`);
} else {
  entitySecret = randomBytes(32).toString("hex");
  console.log(`  CIRCLE_ENTITY_SECRET is not set. Generated a new one.\n`);
  console.log(`  ┌─ SAVE THIS. It is shown once and cannot be recovered from Circle. ─────────────┐`);
  console.log(`  │                                                                                │`);
  console.log(`  │  CIRCLE_ENTITY_SECRET=${entitySecret}  │`);
  console.log(`  │                                                                                │`);
  console.log(`  └────────────────────────────────────────────────────────────────────────────────┘\n`);
  console.log(`  Put that line in .env before going any further. Losing it after registration means`);
  console.log(`  re-provisioning every wallet derived from it.`);
}

// ─── Step 2 — the ciphertext ─────────────────────────────────────────────────────────────────────
// The SDK fetches Circle's entity public key and does the RSA-OAEP encryption. We never handle the
// key ourselves, and the API key is only ever passed to the SDK — never printed.

console.log(`\n── Step 2 · ciphertext`);

const apiKey = process.env.CIRCLE_API_KEY?.trim();
if (!apiKey) {
  console.error(`\nSTOP  CIRCLE_API_KEY is not set, so Circle's public key cannot be fetched.`);
  if (!existing) {
    console.error(`\n      The secret above is still good — save it to .env now, add CIRCLE_API_KEY`);
    console.error(`      alongside it, and re-run. Step 1 will reuse the secret rather than make a new one.`);
  } else {
    console.error(`\n      Add CIRCLE_API_KEY to .env and re-run.`);
  }
  console.error(`\n      The key comes from ${CONSOLE_URL}.`);
  process.exit(1);
}

console.log(`  CIRCLE_API_KEY is present. Fetching Circle's entity public key…`);

let ciphertext: string;
try {
  ciphertext = await generateEntitySecretCiphertext({ apiKey, entitySecret });
} catch (error) {
  const err = error as { response?: { status?: number; data?: unknown }; message?: string };
  console.error(`\nFAIL  could not produce the ciphertext — ${err.message ?? String(error)}`);
  if (err.response?.status) {
    console.error(`      HTTP ${err.response.status}: ${JSON.stringify(err.response.data).slice(0, 300)}`);
    if (err.response.status === 401) {
      console.error(`      A 401 here means the API key is wrong or is for the other environment`);
      console.error(`      (sandbox keys and production keys are not interchangeable).`);
    }
  }
  process.exit(1);
}

console.log(`\n  Entity Secret Ciphertext — paste this into the console's Register form:\n`);
console.log(ciphertext);

// ─── Stop ────────────────────────────────────────────────────────────────────────────────────────

console.log(`\n── Next, by hand`);
console.log(`  1. ${CONSOLE_URL}`);
console.log(`  2. Register the ciphertext above.`);
console.log(`  3. Download the recovery file the console gives you and keep it somewhere durable.`);
console.log(`  4. Confirm CIRCLE_ENTITY_SECRET is in .env.`);
console.log(`\n  Registration is deliberately not automated: doing it in the console is what produces`);
console.log(`  the recovery file. Wallet creation is SM-08 and is not part of this script.`);

// Is the payment path actually wired? Three questions, none of which gate anything.
//
// ⚠️ **This is where R12's startup assertion lives, and that placement is the point.** The facilitator
// must advertise our network AND the feePayer our challenges copy. Asserting that in the request path
// would crash-loop every gated route the moment a third party changed something; a health route going
// red carries the same information without the outage.
//
// ⚠️ **The ATS resolver is reported and gates nothing.** The whole tokenization path rests on a
// contract nobody on this project deployed, whose expiry is a real date. An assumption printed on a
// page is worth more than the same assumption living in a decision record nobody re-reads — if Hedera
// ever enables contract rent, this is where we find out.

import { NextResponse } from 'next/server.js';
import { facilitatorCapability, network } from '../../../src/payments/server.js';
import { fetchJson, MIRROR } from '../../../src/tokenize/hedera.js';
import type { MirrorContract } from '../../../src/tokenize/hedera.js';
import { ANALYSTS } from '../../../src/config/analysts.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The public ATS testnet infrastructure. Not ours — SM-07 recorded the expiry and this re-reads it. */
const RESOLVER_ID = '0.0.9212226';

/**
 * ⚠️ **Reports whether a variable is set, empty or absent — never its value, except where the value
 * is a public account id.** `HEDERA_SELLER_ID` has been ambiguous since Unit 1 because the probe
 * route reads it as `process.env.HEDERA_SELLER_ID ?? '0.0.10387690'`: a correctly-set variable and a
 * *completely absent* one produce identical output, and only an empty string produces the old broken
 * `payTo: ""`. There is no fallback in this path, so what it prints is what Production has.
 */
const envState = (name: string): string => {
  const raw = process.env[name];
  if (raw === undefined) return 'absent';
  if (raw.trim() === '') return 'EMPTY — set but blank, which `??` will not fall back on';
  return 'set';
};

export async function GET(): Promise<NextResponse> {
  try {
    const cfg = network();
    const facilitator = await facilitatorCapability(cfg);

    const resolver = await fetchJson<MirrorContract>(`${MIRROR}/api/v1/contracts/${RESOLVER_ID}`);
    const expiry = Number(resolver.expiration_timestamp.split('.')[0]);

    // ⚠️ Both must hold for a challenge to be payable. A facilitator that no longer advertises our
    // network, or advertises a different feePayer, produces a 402 nobody can settle.
    const ok = facilitator.advertisesNetwork && facilitator.advertisesFeePayer;

    return NextResponse.json({
      ok,
      network: cfg.network,
      facilitator: {
        host: cfg.facilitator,
        advertisesNetwork: facilitator.advertisesNetwork,
        feePayerExpected: cfg.feePayer,
        feePayerAdvertised: facilitator.feePayerAdvertised,
        feePayerMatches: facilitator.advertisesFeePayer,
        kindsAdvertised: facilitator.kinds,
        asset: cfg.asset,
      },
      atsResolver: {
        id: RESOLVER_ID,
        deleted: resolver.deleted,
        expiresAt: expiry,
        expiresAtIso: new Date(expiry * 1000).toISOString(),
        daysRemaining: Number(((expiry - Date.now() / 1000) / 86400).toFixed(1)),
        note: 'Reported, not enforced. Third-party infrastructure the tokenization path rests on.',
      },
      config: {
        // ⚠️ The authoritative payTo. DECISIONS.md 2026-09-08: each analyst has its own Hedera
        // account, so a challenge takes payTo from the report's analyst row, never from env.
        analystPayTo: ANALYSTS.map((a) => ({ id: a.id, hederaAccountId: a.hederaAccountId })),
        env: {
          HEDERA_NETWORK: envState('HEDERA_NETWORK'),
          // Printed because it is a public account id and because settling this is overdue.
          HEDERA_SELLER_ID: `${envState('HEDERA_SELLER_ID')}${
            process.env.HEDERA_SELLER_ID?.trim() ? ` → ${process.env.HEDERA_SELLER_ID.trim()}` : ''}`,
          HEDERA_SELLER_KEY: envState('HEDERA_SELLER_KEY'),
          DATABASE_URL: envState('DATABASE_URL'),
        },
      },
    }, { status: ok ? 200 : 503 });
  } catch (error) {
    // ⚠️ A readable 503, never a thrown process. The difference between "the config is wrong" and
    // "Vercel is down" is this catch — and the rest of the app keeps serving either way.
    return NextResponse.json(
      { ok: false, detail: error instanceof Error ? error.message : String(error) },
      { status: 503 },
    );
  }
}

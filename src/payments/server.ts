// The x402 resource server. One construction, shared by every gated route.
//
// ⚠️ **Replaces the throwaway construction in `app/api/probe/route.ts`.** That one proved the shape
// works on Next 16 and returns a correct 402 from Vercel; it was never meant to be depended on. It
// builds a new server on every request, its facilitator host is a module constant while its network
// string comes from env, and it carries `process.env.HEDERA_SELLER_ID ?? '0.0.10387690'` — a fallback
// that makes a correctly-set variable and a completely absent one produce identical output. None of
// those survive being a real dependency, and Units 13, 14 and 15 all sit behind this file.

import { HTTPFacilitatorClient } from '@x402/core/http';
import { x402ResourceServer } from '@x402/core/server';
import { HBAR_ASSET_ID } from '@x402/hedera';
import { ExactHederaScheme } from '@x402/hedera/exact/server';

/**
 * ⚠️ **R12's atomic switch, expressed so the wrong combination cannot be written down.**
 *
 * The facilitator host, the network string and the settlement asset move together — testnet today,
 * mainnet with USDC at the end of Phase 4. Previously the host was a module constant while the
 * network came from `HEDERA_NETWORK`, so setting that variable to `mainnet` would have pointed a
 * **mainnet network string at the testnet facilitator** and failed somewhere deep in verification.
 *
 * Keying one record by network name makes that unrepresentable: you cannot select a network without
 * also selecting its facilitator and its asset, because they are the same object.
 *
 * ⚠️ **Only measured networks appear here.** `mainnet` is deliberately absent rather than guessed —
 * the mainnet facilitator advertises a different feePayer that nobody on this project has read, and
 * a wrong constant would be worse than a missing one. `HEDERA_NETWORK=mainnet` therefore fails
 * loudly, naming the cutover, which is the correct behaviour until the cutover actually happens.
 */
const NETWORKS = {
  'hedera:testnet': {
    facilitator: 'https://api.testnet.blocky402.com',
    /** Advertised by the facilitator and copied into every challenge. The health route asserts it. */
    feePayer: '0.0.7162784',
    /** Native HBAR. ⚠️ Never a `"$…"` price — `defaultMoneyConversion` has no entry for it. */
    asset: HBAR_ASSET_ID,
  },
} as const;

export type NetworkName = keyof typeof NETWORKS;
export type NetworkConfig = (typeof NETWORKS)[NetworkName] & { readonly network: NetworkName };

/**
 * ⚠️ **An empty env var is a missing env var.** `??` falls back on `undefined` and never on `""`,
 * which is how this project shipped a live 402 carrying `payTo: ""`. There is no fallback anywhere
 * in this file: a wrong-but-present value connects to something, and the failure then surfaces as a
 * payment that will not settle rather than as the configuration error it is.
 */
function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set (or is set to an empty string).`);
  return value;
}

/** The network this deployment settles on, with everything that must move with it. */
export function network(): NetworkConfig {
  const name = `hedera:${required('HEDERA_NETWORK')}`;
  const found = (NETWORKS as Record<string, (typeof NETWORKS)[NetworkName]>)[name];
  if (!found) {
    throw new Error(
      `HEDERA_NETWORK resolves to "${name}", which is not configured. Configured: ` +
      `${Object.keys(NETWORKS).join(', ')}. Moving to mainnet is R12's atomic cutover — the ` +
      'facilitator host, the network string, the asset and the funded accounts change together, ' +
      'and the mainnet feePayer has never been read. Adding a row here is that decision, not a fix.',
    );
  }
  return { ...found, network: name as NetworkName };
}

/**
 * ⚠️ **Lazily constructed and memoized — never at module scope.** `x402ResourceServer.initialize()`
 * calls `process.exit` on a permanent config mismatch. At module scope on Vercel that is a cold-start
 * crash loop on **every** gated route, and it reads like a platform outage rather than a config
 * error. `scripts/smoke/05-x402-purchase.ts` builds at module scope and awaits `initialize()` at
 * line 245 — that is the line not to copy.
 *
 * Same shape as `store/reports.ts`'s `let client = null; const db = () => (client ??= pooled())`:
 * calling the function is what constructs, and a warm invocation reuses one server.
 *
 * ⚠️ **`initialize()` is NOT called here.** `withX402` syncs with the facilitator itself on first
 * use; calling it eagerly would move the `process.exit` risk back into construction. Constructing is
 * local and cannot fail on the network.
 */
let server: x402ResourceServer | null = null;

export function paymentsServer(): x402ResourceServer {
  return (server ??= new x402ResourceServer(new HTTPFacilitatorClient({ url: network().facilitator }))
    .register(network().network, new ExactHederaScheme()));
}

/**
 * What the facilitator says it can do. Read by the health route, never by the request path.
 *
 * ⚠️ **This is R12's outstanding startup assertion**, and it lives at health-check time on purpose.
 * Asserting it in the request path would crash-loop every gated route on a facilitator change; a
 * health route that goes red is the same information without the outage.
 */
export interface FacilitatorCapability {
  readonly advertisesNetwork: boolean;
  readonly advertisesFeePayer: boolean;
  readonly feePayerAdvertised: string | null;
  readonly kinds: number;
}

export async function facilitatorCapability(cfg: NetworkConfig): Promise<FacilitatorCapability> {
  type Kind = { network: string; scheme: string; extra?: { feePayer?: string } };
  const res = await fetch(`${cfg.facilitator}/supported`);
  if (!res.ok) throw new Error(`${cfg.facilitator}/supported → ${res.status}`);
  const { kinds = [] } = (await res.json()) as { kinds?: Kind[] };
  const ours = kinds.find((k) => k.network === cfg.network && k.scheme === 'exact');
  const feePayerAdvertised = ours?.extra?.feePayer ?? null;
  return {
    advertisesNetwork: ours !== undefined,
    advertisesFeePayer: feePayerAdvertised === cfg.feePayer,
    feePayerAdvertised,
    kinds: kinds.length,
  };
}

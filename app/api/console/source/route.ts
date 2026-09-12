// POST /api/console/source — one real query against The Graph, and the evidence record for it.
//
// ⚠️ **The only route in this repo that serves Graph data outside a generation run.**
// `/api/console/state` reads the store, `/api/health` reads the facilitator, and
// `settlement_evidence` is settlement-only with three rows. Without this the console's Source data
// tab and its Query Evidence block have nothing to show but the mockup's `DEMO-lending-eth` and
// `24,800,000`, and there is nothing to press.
//
// ⚠️ **IT READS. NOTHING ELSE.** No write, no chain call, no row persisted, no token spent. If this
// file ever finds itself importing `store/` or `arc/`, something has gone wrong.
//
// ⚠️ **Locked with Unit 2's `locked()`.** It spends `GRAPH_API_KEY` quota from a public URL, which
// is the same reason `generate` is locked. One lock, one place.
//
// ── ⚠️ The two choices, and why ──────────────────────────────────────────────────────────────────
//
// **Document: `balance-sheet`.** The menu has three. `markets` is one row per market and is walked
// to exhaustion — a deployment with 1,700 markets costs seven queries and returns a table nothing
// could render in a side panel. `financial-snapshots` is one row per day and needs a window the
// operator would have to supply. `balance-sheet` is **one row per deployment, one query**, about
// eighteen fields: legible in the space the reference allows, and cheap.
//
// **Deployment: `aave-v3-ethereum` by default.** It is the flagship at ~$24.8B, it is what markets
// 6 and 7 settle against, and its `liveSchemaVersion` matches what config declares. ⚠️ `protocols.ts`
// records that its **revenue is poisoned** — one day in Jul 2024 booked $1.63e15 and the cumulative
// never recovered — while *"balances and flows are clean across 1,300+ days"*. The balance-sheet
// document returns both, so the response carries three revenue fields that are known-wrong on this
// deployment. **The panel says so rather than hiding them**: a console that quietly dropped columns
// would be teaching an operator to trust a number this project has already established is bad.
//
// ⚠️ **The slug is an optional parameter, not a fixed constant.** `querySubgraph` already refuses an
// unknown slug with a `CONFIG` error naming `config/protocols.ts`, so an operator can point this at
// any of the 29 registered deployments and a typo fails loudly rather than silently.
//
// ⚠️ **Tier `record`, never `record+raw`.** PHASE-4's rule: *record by default, record+raw for
// settlement-backing queries only, and the tier is set by the caller, never inferred.* A console
// panel is not settlement-backing. `record+raw` would mean storing a full response payload for a
// browser click.
//
// ⚠️ **This gives `buildEvidence` its second caller.** PHASE-4 open item: *"the builder exists and
// its only caller is a demo script."* Closed by using it rather than by writing anything.

import { NextResponse } from 'next/server.js';
import { locked } from '../lock.js';
import { querySubgraph, SubgraphError } from '../../../../src/graph/client.js';
import { buildEvidence } from '../../../../src/graph/evidence.js';
import { BALANCE_SHEET } from '../../../../src/graph/queries/balance-sheet.js';
import { PROTOCOLS } from '../../../../src/config/protocols.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** ⚠️ 60 is the real ceiling on Hobby; a declared 300 is silently clamped. One subgraph query is
 *  seconds, and the gateway's own timeout is well inside this. */
export const maxDuration = 60;

const DEFAULT_SLUG = 'aave-v3-ethereum';

export async function POST(request: Request): Promise<NextResponse> {
  // ⚠️ **Locked: this spends Graph quota.** See `../lock.ts`.
  const refusal = locked(request);
  if (refusal) return refusal;

  const { slug } = (await request.json().catch(() => ({}))) as { slug?: string };
  const chosen = slug?.trim() || DEFAULT_SLUG;

  try {
    // ⚠️ **Unpinned — no block argument.** Pinning would return whatever block was asked for, which
    // is exactly the wrong thing here: the point of this panel is that the block number and the
    // retrieval time are *live*. Both come off the response's own `_meta`, never off our clock.
    const result = await querySubgraph<{ lendingProtocols: Record<string, unknown>[] }>(
      chosen, BALANCE_SHEET,
    );
    const rows = result.data.lendingProtocols ?? [];
    const evidence = buildEvidence(result, { tier: 'record', rowCount: rows.length });

    const config = PROTOCOLS.find((p) => p.slug === chosen);

    return NextResponse.json({
      ok: true,
      // What the operator picked, and what the registry says about it.
      subgraph: chosen,
      subgraphId: config?.subgraphId ?? null,
      network: config?.network ?? null,
      // ⚠️ Carried through so the panel can warn on the exact fields this deployment gets wrong.
      revenueAvailability: config?.revenueAvailability ?? null,
      // ⚠️ **The evidence record, whole.** `deployment`, `block`, `fetchedAt` and `rowCount` are the
      // four the Query Evidence slot renders, and every one of them comes from the response rather
      // than from anything this route computed.
      evidence,
      // The row itself, for the Source data tab.
      row: rows[0] ?? null,
      // ⚠️ The subgraph's own answer about whether it is healthy, which a row count cannot tell you.
      hasIndexingErrors: result.meta.hasIndexingErrors ?? null,
    });
  } catch (error) {
    if (error instanceof SubgraphError) {
      return NextResponse.json({ stop: `${error.kind}: ${error.message}`, slug: chosen }, { status: 409 });
    }
    return NextResponse.json({ fail: (error as Error).message, slug: chosen }, { status: 502 });
  }
}

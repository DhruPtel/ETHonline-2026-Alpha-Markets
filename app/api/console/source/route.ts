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

// ── ⚠️ THE ROSTER — added 2026-09-12, and what it is for ────────────────────────────────────────
//
// **The Source data panel is a MENU, not a proof.** Someone opening the console needs to know what
// they can ask about before they write a directive: which deployments exist, whether they are
// answering right now, and how current they are. Four columns — deployment, schema version,
// answering, block — and the first three read as the menu.
//
// ⚠️ **The schema-version column is read from the RESPONSE, never from config.** `protocols.ts`
// says `declaredSchemaVersion` is *"what Messari's config DECLARES, which is not authoritative"* and
// that `adapter.ts` dispatches on the version reported live. A column filled from config restates
// our own assumption; filled from `lendingProtocols[0].schemaVersion` it is evidence. That is also
// what makes one query document spanning five live versions legible without being explained.
//
// ⚠️ **The roster document is two fields, and that is the trick.** `name` and `schemaVersion` are
// the two that every version answering the Unit 3 sweep already served, so **one document covers
// 3.1.0, 3.0.1, 3.0.0, 2.0.1 and 1.3.0 with no per-version branch.** Taken from
// `scripts/ops/sweep-protocols.ts`, which uses the same probe for the same reason.
//
// ── ⚠️ WHY IT IS BOUNDED, AND WHY A LATE DEPLOYMENT IS "NOT ANSWERING" RATHER THAN AN ERROR ──────
//
// Measured 2026-09-12, four runs of all 28 in parallel: **297–690ms.** That is not the number that
// matters. `client.ts` sets `TIMEOUT_MS = 20_000` and retries **once, only on a timeout**, and
// `querySubgraphs` is `Promise.all` — so **one hanging indexer costs 40 seconds and sets the floor
// for the whole request.** Against a 60-second ceiling that is 20 seconds of margin on a surface
// someone presses casually, and the failure mode is a dead request rather than a slow one.
//
// ⚠️ **So the roster has its own budget and a late deployment is reported, not raised.** A partial
// roster is a useful menu; a timeout is nothing. The budget deliberately **pre-empts `client.ts`'s
// own retry** — at 10s no second attempt can have run — and that is the right trade here: a menu
// wants a fast partial answer, and the operator's next press retries anyway.

import { NextResponse } from 'next/server.js';
import { locked } from '../lock.js';
import { querySubgraph, SubgraphError } from '../../../../src/graph/client.js';
import { buildEvidence } from '../../../../src/graph/evidence.js';
import { PROTOCOLS } from '../../../../src/config/protocols.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** ⚠️ 60 is the real ceiling on Hobby; a declared 300 is silently clamped. The roster bounds itself
 *  well inside this — see `ROSTER_BUDGET_MS`. */
export const maxDuration = 60;

const DEFAULT_SLUG = 'aave-v3-ethereum';

/**
 * ⚠️ **The whole roster answers within this or the stragglers are marked not-answering.**
 * 10s is ~14× the slowest full sweep measured (690ms) and leaves five-sixths of the function
 * ceiling unused. It is a deadline for the *set*, not a per-slug timeout, so the response time is
 * bounded no matter how many deployments hang.
 */
const ROSTER_BUDGET_MS = 10_000;

/** ⚠️ Two fields, present in all five live schema versions. See the header. */
const ROSTER_DOC = `query { lendingProtocols(first: 1) { name schemaVersion } }`;

type RosterProbe = { lendingProtocols: { name: string; schemaVersion: string }[] };

export interface RosterRow {
  slug: string;
  /** ⚠️ What the deployment REPORTED, not what config declares. `null` when it did not answer. */
  schemaVersion: string | null;
  /** What config expected, so a disagreement is visible rather than silent. */
  declared: string | null;
  answering: boolean;
  /** The indexed block, off the response's own `_meta`. `null` when it did not answer. */
  block: number | null;
  /** Seconds between the indexed block's timestamp and now — how stale this deployment is. */
  lagSeconds: number | null;
  /** Present only when `answering` is false: `no-indexers`, `late`, or the error code. */
  reason: string | null;
}

/**
 * Every deployment, asked at once, with a deadline on the set.
 *
 * ⚠️ **Nothing here rejects.** Per-slug isolation is the point — *"seeing which deployments failed
 * is the result, not an interruption of it."* A slug that errors, a slug with no indexers allocated
 * and a slug that ran past the budget are three different `reason`s and all three are rows.
 */
async function roster(): Promise<{ rows: RosterRow[]; truncated: boolean }> {
  const now = () => Math.floor(Date.now() / 1000);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let truncated = false;

  // ⚠️ ONE shared deadline for the whole set, cleared on the way out so the handler can settle.
  const deadline = new Promise<'late'>((resolve) => {
    timer = setTimeout(() => { truncated = true; resolve('late'); }, ROSTER_BUDGET_MS);
  });

  try {
    const rows = await Promise.all(PROTOCOLS.map(async (p): Promise<RosterRow> => {
      const base = { slug: p.slug, declared: p.declaredSchemaVersion ?? null };
      const miss = (reason: string): RosterRow => ({
        ...base, schemaVersion: null, answering: false, block: null, lagSeconds: null, reason,
      });

      const outcome = await Promise.race([
        querySubgraph<RosterProbe>(p.slug, ROSTER_DOC)
          .then((result) => ({ ok: true as const, result }))
          .catch((error: unknown) => ({ ok: false as const, error })),
        deadline,
      ]);

      if (outcome === 'late') return miss('late');
      if (!outcome.ok) {
        const e = outcome.error;
        // ⚠️ The gateway's own words distinguish "nobody is serving this" from "it broke", and the
        // difference matters to an operator choosing what to ask about. Same test the sweep uses.
        const message = e instanceof SubgraphError ? e.message : String((e as Error)?.message ?? e);
        const noIndexers = /no allocations|no status|not available|bad indexers/i.test(message);
        return miss(noIndexers ? 'no-indexers' : (e instanceof SubgraphError ? e.kind.toLowerCase() : 'error'));
      }

      const { result } = outcome;
      const reported = result.data.lendingProtocols?.[0]?.schemaVersion ?? null;
      const stamp = result.meta.blockTimestamp ?? null;
      return {
        ...base,
        schemaVersion: reported,
        answering: true,
        block: result.meta.blockNumber ?? null,
        lagSeconds: stamp === null ? null : now() - stamp,
        reason: null,
      };
    }));

    return { rows, truncated };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  // ⚠️ **Locked: this spends Graph quota.** See `../lock.ts`.
  const refusal = locked(request);
  if (refusal) return refusal;

  const { slug } = (await request.json().catch(() => ({}))) as { slug?: string };
  const chosen = slug?.trim() || DEFAULT_SLUG;

  try {
    // ⚠️ **The roster and the flagship read run together**, so the roster costs no extra wall time
    // and the flagship keeps `buildEvidence` its second caller — PHASE-4's open item, *"the builder
    // exists and its only caller is a demo script"*, stays closed.
    //
    // ⚠️ **Unpinned — no block argument, on either.** Pinning returns whatever block was asked for,
    // which is exactly wrong here: the point of this panel is that the block numbers and the
    // retrieval time are *live*. Both come off each response's own `_meta`, never off our clock,
    // and `requestedBlock` stays `null` — which is how a reader knows nothing was pinned.
    const [menu, result] = await Promise.all([
      roster(),
      querySubgraph<RosterProbe>(chosen, ROSTER_DOC),
    ]);

    const evidence = buildEvidence(result, {
      tier: 'record',
      rowCount: result.data.lendingProtocols?.length ?? 0,
    });
    const config = PROTOCOLS.find((p) => p.slug === chosen);
    const answering = menu.rows.filter((r) => r.answering);

    return NextResponse.json({
      ok: true,
      // What the operator picked, and what the registry says about it.
      subgraph: chosen,
      subgraphId: config?.subgraphId ?? null,
      network: config?.network ?? null,
      // ⚠️ Carried through so the panel can warn on the exact fields this deployment gets wrong.
      revenueAvailability: config?.revenueAvailability ?? null,
      // ⚠️ **The evidence record, whole.** Every field in it comes from the response rather than
      // from anything this route computed.
      evidence,
      hasIndexingErrors: result.meta.hasIndexingErrors ?? null,

      // ── The roster — the menu ────────────────────────────────────────────────────────────────
      roster: menu.rows,
      // ⚠️ `truncated` says the budget fired, so a reader can tell "these three have no indexers"
      // from "these three did not answer in ten seconds", which are different facts.
      truncated: menu.truncated,
      budgetMs: ROSTER_BUDGET_MS,
      answering: answering.length,
      total: menu.rows.length,
      // ⚠️ Derived from what the deployments REPORTED, never from config. One document, five
      // versions — this is the count that says so.
      schemaVersions: [...new Set(answering.map((r) => r.schemaVersion).filter(Boolean))]
        .sort()
        .reverse(),
    });
  } catch (error) {
    if (error instanceof SubgraphError) {
      return NextResponse.json({ stop: `${error.kind}: ${error.message}`, slug: chosen }, { status: 409 });
    }
    return NextResponse.json({ fail: (error as Error).message, slug: chosen }, { status: 502 });
  }
}

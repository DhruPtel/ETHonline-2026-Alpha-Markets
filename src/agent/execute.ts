// Running the plan. Fetch what it asks for, run the engine, assemble the object.
//
// ⚠️ **No narration.** This produces the structured report; prose is a rendering of it (Unit 10).
// Because narration is inside the report hash, what this hashes is a DRAFT hash over the data — see
// `dataHash` below. It is not the identity a market settles against.
//
// ⚠️ **State in, state out.** Vercel gives 300 seconds and one invocation is one step, so a report
// across several deployments will not fit in one call. Nothing here owns the run: a caller passes
// state and gets state back, exactly as `loop.ts` does with `messages[]`. There is no persistence
// layer yet; this is the shape one needs.

import type { CheckResult, Exclusion, Fact, Report, ReportPlan, Severity } from '../types/report.js';
import type { JsonScalar, Provenance } from '../types/wire.js';
import { PROTOCOLS } from '../config/protocols.js';
import { analyst } from '../config/analysts.js';
import { commonBlock } from '../graph/blockwindow.js';
import { querySubgraph } from '../graph/client.js';
import { paginate } from '../graph/paginate.js';
import { adapt } from '../graph/adapter.js';
import { corroborate } from '../graph/corroborate.js';
import { BALANCE_SHEET, MARKETS, type BalanceSheetResult, type MarketRow } from '../graph/queries/index.js';
import { check, blockedFigures, figureRef } from '../engine/invariants.js';
import { crosscheck } from '../engine/crosscheck.js';
import { reconcile } from '../engine/reconcile.js';
import { hashCanonical } from '../domain/canonical.js';

/** Everything a report is except its prose. Unit 10 supplies `sections` and `assessment`. */
export type DraftReport = Omit<Report, 'sections' | 'assessment'>;

export interface Budget { readonly maxQueries: number; readonly maxMarketPages: number; readonly maxWallClockMs: number }
// ⚠️ 40 was sized for a handful of named deployments and a ranking across all 25 blew straight
// through it. A ranking is ~25 balance sheets plus corroboration samples on the four deployments
// that support it.
export const DEFAULT_BUDGET: Budget = { maxQueries: 100, maxMarketPages: 10, maxWallClockMs: 240_000 };
// ⚠️ No token budget: this step makes no model calls. The planner and the narrator have those.

/**
 * ⚠️ **`analystId`, not an address — renamed 2026-09-08 and the rename is the point.** This field
 * used to be `analyst: string` and held a raw `0x…`, copied as a literal into four demo scripts. A
 * typo in any of them would hash perfectly cleanly and produce a report attributed to an address
 * that can never claim it on Arc.
 *
 * It now holds a `config/analysts.ts` id — `'alpha-1'` — which `execute` resolves to that row's
 * `arcAddress`. The name changed along with the type deliberately: `analyst: "alpha-1"` in a field
 * that used to hold an address is the same-name-different-meaning that Morpho's schema taught this
 * project to distrust, and every call site has to be looked at rather than silently still compiling.
 */
export interface ExecuteState { readonly plan: ReportPlan; readonly analystId: string; readonly block?: number }

/**
 * Wall-clock inside `execute`, so a slow run can be attributed rather than guessed at.
 *
 * ⚠️ Instrumentation only — nothing branches on these and they are not in the report or its hash.
 * The four buckets are disjoint and sum to slightly less than `elapsedMs`, the remainder being
 * assembly.
 */
export interface Timings {
  /** Resolving one block every deployment can answer at, plus the RPC call for its timestamp. */
  readonly blockMs: number;
  /** Every subgraph read — balance sheets and market pagination. */
  readonly fetchMs: number;
  /** Reading the chain to corroborate. `corroborateCalls === 0` means the check never ran. */
  readonly corroborateMs: number;
  readonly corroborateCalls: number;
  /** adapt, invariants, crosscheck, reconcile — all local, no I/O. */
  readonly engineMs: number;
}

export type ExecuteResult =
  | { readonly status: 'completed'; readonly draft: DraftReport; readonly dataHash: string; readonly queries: number; readonly elapsedMs: number; readonly timings: Timings }
  | { readonly status: 'blocked'; readonly reason: string; readonly figure: string; readonly elapsedMs: number }
  | { readonly status: 'declined'; readonly reason: string; readonly elapsedMs: number }
  | { readonly status: 'budget'; readonly detail: string; readonly state: ExecuteState; readonly gathered: Gathered; readonly elapsedMs: number };

/**
 * What a budget-stopped run had already collected. Returned instead of discarded — a run that
 * stops at deployment 20 of 25 has done twenty deployments of real work.
 *
 * ⚠️ **This is not the resumable path.** There is no persistence layer, and nothing yet merges a
 * `Gathered` into a second run: a caller that re-invokes `execute` still restarts, with only the
 * block carried over. What is missing to close it is a caller that passes this back in and a merge
 * that dedupes by fact id and by the slugs already covered. Phase 3's problem; the shape is here so
 * the work is not thrown away in the meantime.
 */
export interface Gathered {
  readonly facts: Readonly<Record<string, Fact>>;
  readonly checks: readonly CheckResult[];
  readonly exclusions: readonly Exclusion[];
  readonly provenance: readonly Provenance[];
  /** Deployments fully processed before the stop, so a merge knows what not to redo. */
  readonly completedSlugs: readonly string[];
}

// ⚠️ **Per-market figures, wired into the report path 2026-09-07.** `paginate` has walked markets
// since Phase 1 — 1,759 of Morpho's — but nothing ever turned a market row into a citable `Fact`,
// so a directive about markets got a protocol-level table and an apology. Two figures, not six: a
// market breakdown is a comparison of size and draw, and every extra column multiplies by the
// population.
const MARKET_FIGURES = [
  ['totalDepositBalanceUSD', 'deposits', 'USD'],
  ['totalBorrowBalanceUSD', 'borrows', 'USD'],
] as const;

/** ⚠️ Indexer-supplied and it reaches a report (§5.18) — bounded, and never left empty. */
const marketLabel = (m: MarketRow) =>
  (m.name ?? m.inputToken?.symbol ?? m.id).replace(/\s+/g, ' ').trim().slice(0, 48) || m.id;

const FIGURES = [
  ['totalValueLockedUSD', 'Total value locked', 'USD'], ['totalDepositBalanceUSD', 'Total deposits', 'USD'],
  ['totalBorrowBalanceUSD', 'Total borrows', 'USD'], ['cumulativeDepositUSD', 'Cumulative deposits', 'USD'],
  ['cumulativeBorrowUSD', 'Cumulative borrows', 'USD'], ['cumulativeTotalRevenueUSD', 'Cumulative revenue', 'USD'],
] as const;

/**
 * ⚠️ Pinned `_meta` returns a null timestamp — measured, consistently. So the read block's time
 * cannot come from the subgraph and must come from the chain. It is deterministic (a block's
 * timestamp never changes), which matters because `observedAt` is inside the hash.
 */
async function blockTime(block: number): Promise<string> {
  const url = process.env.ETHEREUM_RPC_URL?.trim();
  if (!url) throw new Error('ETHEREUM_RPC_URL is required: a pinned read carries no timestamp, and an invented one would be inside the hash');
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: [`0x${block.toString(16)}`, false] }) });
  const j = (await r.json()) as { result?: { timestamp: string } };
  if (!j.result) throw new Error(`no block ${block} from the RPC`);
  return new Date(Number(j.result.timestamp) * 1000).toISOString();
}

export async function execute(state: ExecuteState, budget: Budget = DEFAULT_BUDGET): Promise<ExecuteResult> {
  const started = Date.now();
  const { plan, analystId } = state;
  // ⚠️ Resolved BEFORE any query. An unknown id is a broken run whichever way it ends, and finding
  // that out after a hundred gateway requests costs the budget and tells you nothing extra. The
  // lookup throws rather than returning null, and its message says why.
  const analystAddress = analyst(analystId).arcAddress;
  const el = () => Date.now() - started;
  let queries = 0;
  const t = { blockMs: 0, fetchMs: 0, corroborateMs: 0, corroborateCalls: 0, engineMs: 0 };
  const since = (from: number) => Date.now() - from;

  const facts: Record<string, Fact> = {};
  const checks: CheckResult[] = [];
  const exclusions: Exclusion[] = [];

  // 1 · One block for the set, or no report.
  //
  // ⚠️ When the report is about ONE deployment's figure a refusal is the answer: the caller asked
  // about that deployment and quietly dropping it changes the question. When it is about a metric
  // across the set it is not — a stale outlier should leave the table with a reason rather than take
  // the other 23 down with it, so the furthest-behind is dropped and the block resolved again.
  //
  // ⚠️ **Replaces the form branch, 2026-09-07.** Forms are gone; the headline carries what they
  // carried. A headline naming one of the deployments means the report is ABOUT that figure. A
  // headline naming none means the question is about the metric across the set.
  const aboutOneFigure = plan.subject.deployments.includes(plan.subject.headline.split('.')[0]!);

  const tBlock = Date.now();
  // ⚠️ Sorted, because `checks` and `provenance` are ARRAYS and array order is inside the hash.
  // (Object key order is not — `canonical.ts` sorts keys — so `facts` is unaffected.) The plan may
  // list the same set in any order; the report should not change because of it.
  let slugs = [...plan.subject.deployments].sort();
  let window = state.block ? null : await commonBlock(slugs);
  while (window && !window.ok && !aboutOneFigure && slugs.length > 1) {
    const heads = window.heads;
    const furthestBehind = slugs.reduce((a, b) => ((heads[a] ?? -Infinity) < (heads[b] ?? -Infinity) ? a : b));
    exclusions.push({
      slug: furthestBehind, code: 'no_common_block',
      rationale: `${heads[furthestBehind] ?? 'no'} head against ${Math.max(...Object.values(heads))} elsewhere — too far behind to read at a shared block, so it is left out rather than read at a different moment`,
    });
    slugs = slugs.filter((s) => s !== furthestBehind);
    window = await commonBlock(slugs);
  }
  if (window && !window.ok) return { status: 'declined', reason: window.reason, elapsedMs: el() };
  const block = state.block ?? (window as { block: number }).block;
  const observedAt = await blockTime(block);
  t.blockMs = since(tBlock);

  // ⚠️ **Run what the plan picked, per deployment.** The balance sheet is always read because the
  // engine is built on it — `adapt` needs the protocol row — but everything beyond it comes from
  // `plan.reads`, and it comes from the read that NAMES this slug. `wantsMarkets` used to be one
  // global boolean, so a plan saying "markets for makerdao, balance-sheet for aave" walked every
  // market of both. The plan could express more than this step honoured, which is the same shape as
  // the bug where the planner could not name a document at all.
  const readFor = (slug: string, documentId: string) =>
    plan.reads.find((r) => r.documentId === documentId && r.slugs.includes(slug));

  // ⚠️ Forward only the variables the document actually declares. A document receives `$block` and
  // whatever it names in its operation; handing it an undeclared variable is a GraphQL error, and
  // the planner can supply snapshot bounds that `balance-sheet` and `markets` know nothing about.
  const declaredBy = (doc: string) => new Set([...doc.matchAll(/\$(\w+)\s*:/g)].map((m) => m[1]!));
  const varsFor = (doc: string, vars: Readonly<Record<string, JsonScalar>> | undefined) => {
    if (!vars) return {};
    const declared = declaredBy(doc);
    return Object.fromEntries(Object.entries(vars).filter(([k]) => declared.has(k)));
  };

  const provenance: Provenance[] = [];
  const completedSlugs: string[] = [];
  const gathered = (): Gathered => ({ facts, checks, exclusions, provenance, completedSlugs });

  const planned = new Set(plan.reads.map((r) => r.documentId));
  for (const id of planned) {
    if (id === 'balance-sheet' || id === 'markets') continue;
    checks.push({
      id: `plan:${id}`, description: `planned document ${id}`, outcome: 'not_checked',
      severity: null, delta: null, appliesTo: null,
      rationale: `the plan asked for ${id} and this step cannot yet turn its rows into facts, so nothing from it appears in the report`,
    });
  }
  let headlineReconciliation: ReturnType<typeof reconcile> | null = null;
  const allReconciliations: ReturnType<typeof reconcile>[] = [];

  for (const slug of slugs) {
    if (queries >= budget.maxQueries) return { status: 'budget', detail: `query limit ${budget.maxQueries}`, state: { ...state, block }, gathered: gathered(), elapsedMs: el() };
    if (el() >= budget.maxWallClockMs) return { status: 'budget', detail: `wall clock ${budget.maxWallClockMs}ms`, state: { ...state, block }, gathered: gathered(), elapsedMs: el() };
    const cfg = PROTOCOLS.find((p) => p.slug === slug)!;

    let sheet;
    const tSheet = Date.now();
    try { sheet = await querySubgraph<BalanceSheetResult>(slug, BALANCE_SHEET, varsFor(BALANCE_SHEET, readFor(slug, 'balance-sheet')?.variables), block); queries++; }
    catch (err) { t.fetchMs += since(tSheet); exclusions.push({ slug, code: 'not_answering', rationale: (err as Error).message.slice(0, 160) }); continue; }
    t.fetchMs += since(tSheet);
    provenance.push({ deployment: sheet.meta.deployment, block, timestamp: observedAt, document: 'balance-sheet', variables: { block } });

    // ⚠️ Only an exhausted population gives a true count — Phase 1 measured 48 markets at 100%
    // utilization from a complete walk against 1 from a sample of the same deployment.
    let markets: MarketRow[] | undefined;
    let completeness: 'complete' | 'incomplete' | undefined;
    const marketRead = readFor(slug, 'markets');
    if (marketRead) {
      const tWalk = Date.now();
      const walk = await paginate<MarketRow>(slug, MARKETS, 'markets', varsFor(MARKETS, marketRead.variables), { block, maxPages: budget.maxMarketPages });
      t.fetchMs += since(tWalk);
      queries += walk.pages; markets = walk.rows; completeness = walk.completeness;
      provenance.push({ deployment: walk.meta.deployment, block, timestamp: observedAt, document: 'markets', variables: { block } });
      // ⚠️ **The population count, not just the rows returned.** A table of eight markets implies
      // eight markets unless something says otherwise, and Phase 1 established that only an
      // exhausted walk knows the real number — a sample of one measured 48 markets at 100%
      // utilization as 1. The narrator reads this and mentions the tail; it is not a row cap, and
      // how many rows to show stays its decision.
      checks.push({
        id: `${slug}:market-population`,
        description: `market population for ${slug}`,
        outcome: walk.completeness === 'complete' ? 'passed' : 'not_checked',
        severity: null, delta: null, appliesTo: null,
        rationale: walk.completeness === 'complete'
          ? `${walk.rows.length} markets in total, read to exhaustion — this is the whole book`
          : `${walk.rows.length} markets read and the population was NOT exhausted at ${budget.maxMarketPages} pages, so the true total is higher than this`,
      });
      // ⚠️ Every market becomes a fact, with no cap. How many to SHOW is the narrator's decision and
      // the population check tells it the total, so a table of five out of sixty-three can say so.
      // The cost is real and lands here rather than in the walk: a deployment with 1,700 markets
      // puts 3,400 facts in the narrator's prompt.
      for (const m of walk.rows) {
        for (const [field, label, unit] of MARKET_FIGURES) {
          const id = `${slug}.${m.id}.${field}`;
          const value = m[field];
          facts[id] = {
            id, label: `${slug} · ${marketLabel(m)} — ${label}`, unit, slug, block,
            deployment: walk.meta.deployment,
            value: value ?? null,
            // Markets are not corroborated individually — `corroborate` samples three per deployment.
            corroboration: 'not_checked',
            withheld: value == null ? { code: 'not_reported', rationale: `this deployment returned no ${field} for this market` } : null,
          };
        }
      }
    }

    const tAdapt = Date.now();
    const { computed } = adapt({ slug, protocol: sheet.data.lendingProtocols[0]!, meta: sheet.meta, markets, completeness,
      provenance: { deployment: sheet.meta.deployment, block, timestamp: observedAt, document: 'balance-sheet', variables: { block } } });
    const findings = check({ config: cfg, computed, markets });
    t.engineMs += since(tAdapt);

    const tCorr = Date.now();
    const corr = plan.checks.includes('chain-corroboration') && cfg.corroborationHint?.method ? await corroborate(slug, 3) : undefined;
    if (corr) {
      t.corroborateMs += since(tCorr); t.corroborateCalls++;
      // ⚠️ **A FLOOR, not the true cost.** `queries += corr.length` counted one per sampled market
      // and the real shape is: one subgraph query for the sample, `eth_blockNumber` and one
      // `eth_getBlockByNumber` to set up, then PER MARKET a binary search over block time — each
      // iteration another `eth_getBlockByNumber` — plus the `eth_call` that does the work. The
      // search depth is a property of how far back the market last traded and execute cannot see
      // it, so 1 + 2 + 2 per market is a lower bound and the true figure is materially higher.
      // Exact accounting needs `corroborate` to report its own call count; flagged, not guessed.
      queries += 3 + corr.length * 2;
      const tX = Date.now(); findings.push(...crosscheck(slug, corr)); t.engineMs += since(tX);
    }

    const tRec = Date.now();
    const rec = reconcile({ config: cfg, computed, findings, corroboration: corr, marketsRead: markets?.length ?? 0 });
    t.engineMs += since(tRec);
    allReconciliations.push(rec);
    // ⚠️ Only a report ABOUT one deployment's figure has a verdict, and only that deployment's
    // reconciliation can be it. The old `else` took the first deployment in the plan when the
    // headline was a metric — arbitrary, and it put plan ordering inside the report hash.
    if (aboutOneFigure && slug === plan.subject.headline.split('.')[0]) headlineReconciliation = rec;

    for (const [field, label, unit] of FIGURES) {
      const id = figureRef(slug, field);
      const blockedHere = blockedFigures(findings).includes(id);
      const value = computed.figures[field]?.value ?? null;
      // ⚠️ **Why a figure is absent, said accurately.** Every null used to be reported as
      // `revenue_unavailable` with a rationale about revenue — on five of these six figures that is
      // simply false. Only a revenue field gated by config is a revenue problem.
      const isRevenueField = field === 'cumulativeTotalRevenueUSD';
      const withheld = blockedHere
        ? { code: 'data_error' as const, rationale: findings.find((f) => f.appliesTo === id)?.rationale ?? 'a data error applies to this figure' }
        : value != null ? null
          : isRevenueField && computed.revenue !== 'usable'
            ? { code: 'revenue_unavailable' as const, rationale: `revenue is ${computed.revenue} on this deployment; it is withheld rather than rendered, including as zero` }
            : { code: 'not_reported' as const, rationale: `this deployment returned no value for ${field} at block ${block}` };
      facts[id] = {
        id, label: `${slug} — ${label}`, unit, slug, block,
        deployment: sheet.meta.deployment,
        value: blockedHere ? null : value,
        // ⚠️ **A protocol total is never corroborated, because corroboration is per MARKET.**
        // This used to stamp `match` on all six protocol figures as soon as one sampled market
        // matched — claiming `totalDepositBalanceUSD` had been checked against the chain when
        // nothing of the sort happened, and contradicting the corroboration decision record.
        // Per-market facts could carry their own sampled status; they deliberately do not yet,
        // because the check reads the SUPPLY side and mapping it onto a borrows figure would
        // repeat the same overstatement one level down.
        corroboration: 'not_checked',
        withheld,
      };
    }
    // ⚠️ Indexed, because `${slug}:${severity}` gave every INFORMATIONAL finding on a deployment the
    // same id — and check ids are inside the report hash.
    findings.forEach((f, n) => checks.push({ id: `${slug}:finding:${n}`, description: f.appliesTo, outcome: f.severity === 'DATA_ERROR' ? 'failed' : 'passed', severity: f.severity as Severity, delta: null, appliesTo: f.appliesTo, rationale: f.rationale }));
    for (const c of rec.claims) checks.push({ id: `${slug}:tier${c.tier}`, description: c.description, outcome: c.outcome === 'agreed' ? 'passed' : c.outcome === 'disagreed' ? 'failed' : 'not_checked', severity: null, delta: c.delta, appliesTo: c.appliesTo, rationale: c.rationale });
    completedSlugs.push(slug);
  }

  // ⚠️ Blocking follows the HEADLINE, because "the headline" means two different things.
  //
  // It names a deployment: that deployment's figure is what the report is about. If it is
  // unreportable the report is — a partial report that looks complete is worse than none, because
  // the reader cannot tell which figure was the point.
  //
  // It names no deployment: the headline is a metric across the set. A `DATA_ERROR` on one leaves
  // that deployment out of the table with its reason, and the rest still answer what was asked.
  if (aboutOneFigure) {
    const headline = facts[plan.subject.headline];
    if (headline?.withheld?.code === 'data_error') return { status: 'blocked', figure: plan.subject.headline, reason: headline.withheld.rationale, elapsedMs: el() };
    if (!headline) return { status: 'blocked', figure: plan.subject.headline, reason: 'the headline figure was never produced — its deployment did not answer', elapsedMs: el() };
  } else if (!Object.keys(facts).length) {
    return { status: 'blocked', figure: plan.subject.headline, reason: 'no deployment produced a figure to rank', elapsedMs: el() };
  }

  const draft: DraftReport = {
    // ⚠️ `Report.analyst` is unchanged: still an address, still inside the hash. Only where the
    // caller got it from moved — from a literal it typed to a row it named.
    schema: 'alpha-markets/report/v1', form: null, analyst: analystAddress, subject: plan.subject, block, observedAt,
    facts, checks, exclusions,
    verdict: {
      // A metric headline has no single figure to stand behind, so no call — see `Verdict.call`.
      // `not_checked` survives for the case it always meant: a single-figure report whose
      // deployment produced no reconciliation at all.
      call: aboutOneFigure ? (headlineReconciliation?.call ?? 'not_checked') : null,
      // ⚠️ Coverage is aggregated across every deployment, so nothing is lost by the null above.
      // Order-independent by construction: sums and an `every`.
      coverage: headlineReconciliation
        ? headlineReconciliation.coverage
        : {
          marketsRead: allReconciliations.reduce((a, r) => a + r.coverage.marketsRead, 0),
          marketsCorroborated: allReconciliations.reduce((a, r) => a + r.coverage.marketsCorroborated, 0),
          completeness: allReconciliations.length && allReconciliations.every((r) => r.coverage.completeness === 'complete') ? 'complete' : 'incomplete',
          checksRun: allReconciliations.reduce((a, r) => a + r.coverage.checksRun, 0),
          checksAvailable: allReconciliations.reduce((a, r) => a + r.coverage.checksAvailable, 0),
        },
    },
    provenance, atsTokenAddress: null,
  };
  return { status: 'completed', draft, dataHash: hashCanonical(draft), queries, elapsedMs: el(), timings: t };
}

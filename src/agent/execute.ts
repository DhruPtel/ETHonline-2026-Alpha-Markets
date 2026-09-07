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
import type { Provenance } from '../types/wire.js';
import { PROTOCOLS } from '../config/protocols.js';
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
export const DEFAULT_BUDGET: Budget = { maxQueries: 40, maxMarketPages: 10, maxWallClockMs: 240_000 };
// ⚠️ No token budget: this step makes no model calls. The planner and the narrator have those.

export interface ExecuteState { readonly plan: ReportPlan; readonly analyst: string; readonly block?: number }

export type ExecuteResult =
  | { readonly status: 'completed'; readonly draft: DraftReport; readonly dataHash: string; readonly queries: number; readonly elapsedMs: number }
  | { readonly status: 'blocked'; readonly reason: string; readonly figure: string; readonly elapsedMs: number }
  | { readonly status: 'declined'; readonly reason: string; readonly elapsedMs: number }
  | { readonly status: 'budget'; readonly detail: string; readonly state: ExecuteState; readonly elapsedMs: number };

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
  const { plan, analyst } = state;
  const el = () => Date.now() - started;
  let queries = 0;

  // 1 · One block, or no report. A refusal is the answer, not a fallback.
  const window = state.block ? null : await commonBlock(plan.subject.deployments);
  if (window && !window.ok) return { status: 'declined', reason: window.reason, elapsedMs: el() };
  const block = state.block ?? (window as { block: number }).block;
  const observedAt = await blockTime(block);

  const wantsMarkets = plan.reads.some((r) => r.documentId === 'markets');
  const facts: Record<string, Fact> = {};
  const checks: CheckResult[] = [];
  const exclusions: Exclusion[] = [];
  const provenance: Provenance[] = [];
  let headlineReconciliation: ReturnType<typeof reconcile> | null = null;

  for (const slug of plan.subject.deployments) {
    if (queries >= budget.maxQueries) return { status: 'budget', detail: `query limit ${budget.maxQueries}`, state: { ...state, block }, elapsedMs: el() };
    if (el() >= budget.maxWallClockMs) return { status: 'budget', detail: `wall clock ${budget.maxWallClockMs}ms`, state: { ...state, block }, elapsedMs: el() };
    const cfg = PROTOCOLS.find((p) => p.slug === slug)!;

    let sheet;
    try { sheet = await querySubgraph<BalanceSheetResult>(slug, BALANCE_SHEET, {}, block); queries++; }
    catch (err) { exclusions.push({ slug, code: 'not_answering', rationale: (err as Error).message.slice(0, 160) }); continue; }
    provenance.push({ deployment: sheet.meta.deployment, block, timestamp: observedAt, document: 'balance-sheet', variables: { block } });

    // ⚠️ Only an exhausted population gives a true count — Phase 1 measured 48 markets at 100%
    // utilization from a complete walk against 1 from a sample of the same deployment.
    let markets: MarketRow[] | undefined;
    let completeness: 'complete' | 'incomplete' | undefined;
    if (wantsMarkets) {
      const walk = await paginate<MarketRow>(slug, MARKETS, 'markets', {}, { block, maxPages: budget.maxMarketPages });
      queries += walk.pages; markets = walk.rows; completeness = walk.completeness;
      provenance.push({ deployment: walk.meta.deployment, block, timestamp: observedAt, document: 'markets', variables: { block } });
    }

    const { computed } = adapt({ slug, protocol: sheet.data.lendingProtocols[0]!, meta: sheet.meta, markets, completeness,
      provenance: { deployment: sheet.meta.deployment, block, timestamp: observedAt, document: 'balance-sheet', variables: { block } } });
    const findings = check({ config: cfg, computed, markets });

    const corr = plan.checks.includes('chain-corroboration') && cfg.corroborationHint?.method ? await corroborate(slug, 3) : undefined;
    if (corr) { queries += corr.length; findings.push(...crosscheck(slug, corr)); }

    const rec = reconcile({ config: cfg, computed, findings, corroboration: corr, marketsRead: markets?.length ?? 0 });
    if (figureRef(slug, '').split('.')[0] === plan.subject.headline.split('.')[0]) headlineReconciliation = rec;

    for (const [field, label, unit] of FIGURES) {
      const id = figureRef(slug, field);
      const blockedHere = blockedFigures(findings).includes(id);
      facts[id] = {
        id, label: `${slug} — ${label}`, unit, slug, block,
        deployment: sheet.meta.deployment,
        value: blockedHere ? null : computed.figures[field]?.value ?? null,
        corroboration: corr?.find((c) => c.status === 'match') ? 'match' : corr?.some((c) => c.status === 'mismatch') ? 'mismatch' : 'not_checked',
        withheld: blockedHere ? { code: 'data_error', rationale: findings.find((f) => f.appliesTo === id)!.rationale }
          : computed.figures[field]?.value == null ? { code: 'revenue_unavailable', rationale: `revenue is ${computed.revenue} on this deployment` } : null,
      };
    }
    for (const f of findings) checks.push({ id: `${slug}:${f.severity}`, description: f.appliesTo, outcome: f.severity === 'DATA_ERROR' ? 'failed' : 'passed', severity: f.severity as Severity, delta: null, appliesTo: f.appliesTo, rationale: f.rationale });
    for (const c of rec.claims) checks.push({ id: `${slug}:tier${c.tier}`, description: c.description, outcome: c.outcome === 'agreed' ? 'passed' : c.outcome === 'disagreed' ? 'failed' : 'not_checked', severity: null, delta: c.delta, appliesTo: c.appliesTo, rationale: c.rationale });
  }

  // ⚠️ The headline is unreportable, so the report is. A partial report that looks complete is worse
  // than none — the reader cannot tell which figure was the point.
  const headline = facts[plan.subject.headline];
  if (headline?.withheld?.code === 'data_error') return { status: 'blocked', figure: plan.subject.headline, reason: headline.withheld.rationale, elapsedMs: el() };
  if (!headline) return { status: 'blocked', figure: plan.subject.headline, reason: 'the headline figure was never produced — its deployment did not answer', elapsedMs: el() };

  const draft: DraftReport = {
    schema: 'alpha-markets/report/v1', analyst, subject: plan.subject, block, observedAt,
    facts, checks, exclusions,
    verdict: headlineReconciliation
      ? { call: headlineReconciliation.call, coverage: headlineReconciliation.coverage }
      : { call: 'not_checked', coverage: { marketsRead: 0, marketsCorroborated: 0, completeness: 'incomplete', checksRun: 0, checksAvailable: 0 } },
    provenance, atsTokenAddress: null,
  };
  return { status: 'completed', draft, dataHash: hashCanonical(draft), queries, elapsedMs: el() };
}

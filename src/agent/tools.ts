// Exactly what the agent is allowed to ask for. Two tools, no free-form GraphQL, no URLs.
//
// ⚠️ The agent picks a document and supplies variables; it never writes a query. A model cannot
// emit a field that does not exist on a deployment if it never writes the query — that single
// decision removes an entire category of failure (PLAN-v4 §5.6).
//
// ⚠️ `run_document` takes `slugs`, plural, deliberately. A common block is a property of the SET
// being compared, so a tool that only ever saw one deployment at a time could not resolve one —
// and reading Aave at 3pm against Compound at 1pm is the failure `blockwindow.ts` exists to stop.

import type Anthropic from '@anthropic-ai/sdk';
import { querySubgraph, SubgraphError } from '../graph/client.js';
import { commonBlock } from '../graph/blockwindow.js';
import { paginate } from '../graph/paginate.js';
import { adapt, type Finding } from '../graph/adapter.js';
import { DOCUMENTS, DOCUMENT_IDS, MARKETS, BALANCE_SHEET, type DocumentId, type BalanceSheetResult, type MarketRow } from '../graph/queries/index.js';
import { PROTOCOLS } from '../config/protocols.js';

const MAX_MARKET_PAGES = 12;
const known = () => PROTOCOLS.filter((p) => p.status === 'live').map((p) => p.slug);

export const TOOLS: Anthropic.Tool[] = [
  {
    name: 'run_document',
    description:
      'Run one pre-written query document against one or more configured lending deployments. When several are given they are all read at a single common block so their figures are comparable; if no common block exists the call is refused rather than answered from different moments. Figures the deployment cannot be trusted on come back null, never as a number and never as zero.',
    input_schema: {
      type: 'object',
      properties: {
        slugs: { type: 'array', items: { type: 'string' }, description: `Deployment slugs. Known: ${known().join(', ')}` },
        documentId: { type: 'string', enum: [...DOCUMENT_IDS], description: 'Which pre-written document to run' },
        variables: { type: 'object', description: 'Document variables. financial-snapshots needs startTimestamp and endTimestamp (unix seconds, both bounds).' },
      },
      required: ['slugs', 'documentId'],
    },
  },
  {
    name: 'get_capabilities',
    description:
      'What a deployment can and cannot tell you — live schema version, whether its revenue is trustworthy, whether its figures can be checked against the chain, its triage verdict, and known semantic quirks. Ask this BEFORE quoting a figure, not after it comes back null.',
    input_schema: { type: 'object', properties: { slug: { type: 'string' } }, required: ['slug'] },
  },
];

const fail = (error: string, extra: Record<string, unknown> = {}) => JSON.stringify({ error, ...extra });

async function readOne(slug: string, documentId: DocumentId, variables: Record<string, unknown>, block: number) {
  // The balance sheet is fetched either way: the adapter's market-level rules — the oracle guard,
  // the utilization ceiling — are only meaningful against the protocol totals they belong to.
  const sheet = await querySubgraph<BalanceSheetResult>(slug, BALANCE_SHEET, {}, block);
  let markets: MarketRow[] | undefined;
  let completeness: 'complete' | 'incomplete' | undefined;
  let extra: unknown;
  if (documentId === 'markets') {
    const walk = await paginate<MarketRow>(slug, MARKETS, 'markets', {}, { block, maxPages: MAX_MARKET_PAGES });
    markets = walk.rows; completeness = walk.completeness;
    extra = { marketCount: walk.rows.length, pages: walk.pages, completeness: walk.completeness };
  } else if (documentId !== 'balance-sheet') {
    const res = await querySubgraph<Record<string, unknown[]>>(slug, DOCUMENTS[documentId], variables, block);
    extra = res.data;
  }
  const { computed, findings } = adapt({
    slug, protocol: sheet.data.lendingProtocols[0]!, meta: sheet.meta, markets, completeness,
    provenance: { deployment: sheet.meta.deployment, block: sheet.meta.blockNumber, timestamp: sheet.fetchedAt, document: documentId, variables: variables as Record<string, string | number | boolean | null> },
  });
  return {
    slug, block: computed.block, deployment: computed.deployment,
    revenueAvailability: computed.revenue, completeness: computed.completeness,
    figures: Object.fromEntries(Object.entries(computed.figures).map(([k, v]) => [k, v.value])),
    findings: findings.map((f: Finding) => `${f.severity}: ${f.appliesTo} — ${f.rationale}`),
    ...(extra ? { data: extra } : {}),
  };
}

export const execute = async (name: string, input: unknown): Promise<string> => {
  if (name === 'get_capabilities') {
    const { slug } = input as { slug: string };
    const p = PROTOCOLS.find((x) => x.slug === slug);
    if (!p) return fail(`unknown slug "${slug}"`, { known: known() });
    return JSON.stringify({
      slug: p.slug, liveSchemaVersion: p.liveSchemaVersion, lendingType: p.lendingType,
      status: p.status, triageVerdict: p.triageVerdict,
      revenue: p.revenueAvailability ?? 'not measured for this deployment',
      revenueUsable: p.revenueAvailability === 'usable',
      corroboration: p.corroborationHint
        ? (p.corroborationHint.method ? `checkable against the chain via ${p.corroborationHint.method}` : 'write-time field exists but no contract accessor is established')
        : 'not checkable — no write-time field recorded',
      depositBasis: p.depositBasis ?? 'not measured',
      semanticNotes: p.semanticNotes,
      lastSwept: p.lastSwept,
    });
  }
  if (name !== 'run_document') return fail(`unknown tool "${name}"`, { tools: TOOLS.map((t) => t.name) });

  const { slugs, documentId, variables = {} } = input as { slugs: string[]; documentId: string; variables?: Record<string, unknown> };
  if (!Array.isArray(slugs) || !slugs.length) return fail('slugs must be a non-empty array', { known: known() });
  const unknown = slugs.filter((s) => !PROTOCOLS.some((p) => p.slug === s));
  if (unknown.length) return fail(`unknown slug(s): ${unknown.join(', ')}`, { known: known() });
  if (!DOCUMENT_IDS.includes(documentId as DocumentId)) return fail(`unknown documentId "${documentId}"`, { documents: DOCUMENT_IDS });

  // ⚠️ A refusal is the correct answer here, not a fallback. Reading the set at different moments
  // and presenting it as a comparison is worse than declining to compare.
  const window = await commonBlock(slugs);
  if (!window.ok) return JSON.stringify({ refused: 'no common block across these deployments', reason: window.reason, heads: window.heads });

  const results = await Promise.all(slugs.map(async (slug) => {
    try { return await readOne(slug, documentId as DocumentId, variables, window.block); }
    catch (err) { return { slug, error: err instanceof SubgraphError ? `${err.kind}: ${err.message}` : (err as Error).message }; }
  }));
  return JSON.stringify({ block: window.block, blockWindow: { lo: window.lo, hi: window.hi, headSpread: window.spread }, results });
};

// The plan. One model turn, before any data is read.
//
// ⚠️ **The planner selects documents; it never authors GraphQL** (§5.6). It picks a `documentId`
// and supplies variables, which is what removes the whole class of failure where a model emits a
// field that does not exist on a deployment.
//
// ⚠️ **`needs_clarification` is a structural outcome, not a prompt instruction.** The model is given
// two tools and must call one of them — either it proposes a plan or it names what is missing.
// Asking politely in a system prompt gets a confident essay whenever the model would rather write
// one; forcing a choice between two typed outputs does not.
//
// ⚠️ **No I/O beyond the model call.** Capabilities come from `config/protocols.ts`, which is
// already measured — every field in it was read from a live deployment during the Phase 1 sweep, so
// planning does not need the network.

import { readFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import type { Capabilities, Clarification, PlannedCheck, ReportPlan } from '../types/report.js';
import { PROTOCOLS } from '../config/protocols.js';
import { DOCUMENT_IDS } from '../graph/queries/index.js';
import { figureRef } from '../engine/invariants.js';
import { MODEL } from './loop.js';

/** The figures a balance overview can be about. Narrower than the document, on purpose. */
const HEADLINE_FIELDS = [
  'totalDepositBalanceUSD', 'totalBorrowBalanceUSD', 'totalValueLockedUSD',
  'cumulativeDepositUSD', 'cumulativeBorrowUSD', 'cumulativeTotalRevenueUSD',
] as const;
const CHECKS: readonly PlannedCheck[] = ['internal-consistency', 'chain-corroboration', 'external-reference', 'market-population'];

export function capabilitiesOf(slug: string): Capabilities | null {
  const p = PROTOCOLS.find((x) => x.slug === slug);
  if (!p) return null;
  return {
    slug: p.slug, liveSchemaVersion: p.liveSchemaVersion, lendingType: p.lendingType,
    status: p.status, triageVerdict: p.triageVerdict,
    revenue: p.revenueAvailability ?? 'not measured for this deployment',
    revenueUsable: p.revenueAvailability === 'usable',
    corroboration: p.corroborationHint?.method
      ? `checkable against the chain via ${p.corroborationHint.method}`
      : 'not checkable — no contract accessor recorded',
    depositBasis: p.depositBasis ?? 'not measured',
    semanticNotes: p.semanticNotes, lastSwept: p.lastSwept,
  };
}

const PROPOSE: Anthropic.Tool = {
  name: 'propose_plan',
  description: 'Propose a plan for a balance overview that answers the directive.',
  input_schema: {
    type: 'object',
    properties: {
      subject: { type: 'string', description: 'What the report is about, one sentence. Specific to the directive, not a generic overview.' },
      deployments: { type: 'array', items: { type: 'string' }, description: 'Slugs the report covers. Leave empty to cover ALL live deployments.' },
      headlineSlug: { type: 'string', description: 'The one deployment whose figure answers the directive, when the directive is about a single deployment. Leave empty when the question is about the metric across the whole set.' },
      headlineField: { type: 'string', enum: [...HEADLINE_FIELDS], description: 'The metric the directive turns on.' },
      reads: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            documentId: { type: 'string', enum: [...DOCUMENT_IDS] },
            slugs: { type: 'array', items: { type: 'string' } },
            variables: { type: 'object' },
          },
          required: ['documentId', 'slugs'],
        },
      },
      checks: { type: 'array', items: { type: 'string', enum: [...CHECKS] } },
      rationale: { type: 'string', description: 'Why this scope answers the directive.' },
    },
    required: ['subject', 'headlineField', 'checks', 'rationale'],
  },
};

const CLARIFY: Anthropic.Tool = {
  name: 'need_clarification',
  description: 'Use when the directive cannot be turned into a report without guessing what was meant.',
  input_schema: {
    type: 'object',
    properties: {
      missing: { type: 'array', items: { type: 'string', enum: ['subject', 'deployment', 'question', 'scope'] } },
      reason: { type: 'string', description: 'What specifically cannot be determined.' },
      suggestions: { type: 'array', items: { type: 'string' }, description: 'Concrete directives that would work.' },
    },
    required: ['missing', 'reason', 'suggestions'],
  },
};

export type ComposeResult =
  | { readonly ok: true; readonly plan: ReportPlan }
  | { readonly ok: false; readonly clarification: Clarification };

// ⚠️ The planner reads the same conventions the narrator does. The defaults live in one file
// because the report STATES the assumption the planner made — if the two drifted, a memo would
// declare a reading its plan never took.
const conventions = () => readFileSync(new URL('./skills/conventions.md', import.meta.url), 'utf8');

const brief = (c: Capabilities) =>
  `- ${c.slug} (${c.liveSchemaVersion}, ${c.lendingType}, triage ${c.triageVerdict}) revenue ${c.revenue}; ${c.corroboration}`;

export async function compose(directive: string, client: Anthropic): Promise<ComposeResult> {
  const live = PROTOCOLS.filter((p) => p.status === 'live').map((p) => capabilitiesOf(p.slug)!);
  const system = `You plan financial reports on lending protocols.

${conventions()}

---
 You do not write them and you do not read data — you decide what a report should cover, and deterministic code executes it.

Available deployments:
${live.map(brief).join('\n')}

Available documents: ${DOCUMENT_IDS.join(', ')}.

⚠️ **There is no report template.** Decide what would actually answer the directive — one deployment's figure, a metric across every live deployment, two deployments side by side, the markets inside one — and name the deployments and documents that produce it. The report is whatever comes back, in a table. Do NOT narrow a wide question to a trustworthy subset; scope follows the directive, not the data quality.

⚠️ The **markets** document walks every market of every deployment named, which costs a great deal. Request it only when the directive is about markets within a deployment; **balance-sheet** answers everything at the protocol level.

⚠️ Apply the default readings above rather than asking. "Deposits" means the current balance; "size" means gross deposits; "top N" with no N means ten. Call need_clarification ONLY for the three cases the conventions name — data this platform does not have, an entity resolving to several deployments of differing quality, or no subject at all. Scope is never one of them.`;

  const response = await client.messages.create({
    model: MODEL, max_tokens: 2000, system, tools: [PROPOSE, CLARIFY],
    tool_choice: { type: 'any' },   // ⚠️ one of the two, never prose
    messages: [{ role: 'user', content: directive }],
  });

  const call = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
  if (!call) throw new Error(`planner returned no tool call (stop_reason ${response.stop_reason})`);

  if (call.name === 'need_clarification') return { ok: false, clarification: call.input as Clarification };

  const i = call.input as {
    subject: string; deployments?: string[];
    headlineSlug?: string; headlineField: string;
    reads?: { documentId: string; slugs: string[]; variables?: Record<string, string | number | boolean | null> }[];
    checks: PlannedCheck[]; rationale: string;
  };
  // ⚠️ Naming no deployment means every live one, not an error. The data layer already reads all 25
  // at a common block, and a report that silently covers four is answering a narrower question than
  // the one asked. Scope is not a reason to go back and ask.
  const deployments = i.deployments?.length ? i.deployments : live.map((c) => c.slug);
  // ⚠️ Validate against config rather than trusting the schema. An enum constrains the shape of a
  // slug, not whether that deployment exists or answers.
  const unknown = deployments.filter((s) => !PROTOCOLS.some((p) => p.slug === s && p.status === 'live'));
  if (unknown.length) return {
    ok: false,
    clarification: { missing: ['deployment'], reason: `not configured or not answering: ${unknown.join(', ')}`, suggestions: live.slice(0, 3).map((c) => `Balance overview for ${c.slug}`) },
  };

  // ⚠️ **The headline is what a failure costs, now that there is no form.** Naming a deployment
  // means the report is ABOUT that deployment's figure, so an error there blocks it. Naming none
  // means the question is about the metric across the set — nobody knows which deployment leads
  // until the data is read — and one bad deployment leaves the table rather than taking the rest
  // down. `execute` reads exactly that distinction off this string; the sentinel is load-bearing.
  const headline = i.headlineSlug
    ? figureRef(i.headlineSlug, i.headlineField)
    : figureRef('metric', i.headlineField);

  return {
    ok: true,
    plan: {
      subject: { directive, deployments, headline },
      reads: (i.reads?.length ? i.reads : [{ documentId: 'balance-sheet', slugs: deployments }])
        .map((r) => ({ documentId: r.documentId, slugs: r.slugs?.length ? r.slugs : deployments, variables: r.variables ?? {} })),
      checks: i.checks, rationale: i.rationale,
    },
  };
}

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
import { DOCUMENT_IDS, DOCUMENT_BRIEF } from '../graph/queries/index.js';
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
            documentId: { type: 'string', enum: [...DOCUMENT_IDS], description: 'Which document to run. See the catalogue in the system prompt for what each returns.' },
            slugs: { type: 'array', items: { type: 'string' } },
            variables: { type: 'object' },
          },
          required: ['documentId', 'slugs'],
        },
      },
      checks: { type: 'array', items: { type: 'string', enum: [...CHECKS] } },
      rationale: { type: 'string', description: 'Why this scope answers the directive, and — when the directive was ambiguous — which reading you took and why that one. "Health" read as utilization, say, rather than a question back.' },
    },
    // ⚠️ `reads` is required. Omitting it used to fall through to a balance-sheet default, so a
    // planner that never considered documents produced a protocol-level plan by construction and
    // nothing recorded that no choice had been made.
    required: ['subject', 'headlineField', 'reads', 'checks', 'rationale'],
  },
};

// ⚠️ **There is no `need_clarification` tool, deliberately (2026-09-07).** It existed and it worked
// — "what protocol has the best financial health?" got a well-reasoned refusal, which is the wrong
// answer. Health is not a quantity anyone holds and the proxies for it disagree, all true, and an
// analyst asked that question still picks a reading, says which, and answers. Refusing is a control
// worth adding back once we know what the agent does when it tries; it is not the ground floor.
//
// ⚠️ The `ok: false` arm below survives for ONE thing, and it is not a refusal to interpret: a plan
// naming a deployment that is not configured or not answering. That is a broken plan, not a vague
// directive.

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

Available documents — every report is built from one or more of these, and \`reads\` must name the ones that produce it:
${DOCUMENT_IDS.map((id) => `- **${id}** — ${DOCUMENT_BRIEF[id]}`).join('\n')}

⚠️ **There is no report template.** Decide what would actually answer the directive — one deployment's figure, a metric across every live deployment, two deployments side by side, the markets inside one — and name the deployments and documents that produce it. The report is whatever comes back, in a table. Do NOT narrow a wide question to a trustworthy subset; scope follows the directive, not the data quality.

⚠️ **You always produce a plan. You never ask.** A vague directive is not a reason to go back — it is a reading to choose. "Best financial health" is not a quantity this platform holds, and that is not a refusal: pick the proxy that answers it most usefully, plan against that, and put the reading and why you chose it in \`rationale\` so the report can state it. An analyst asked an imprecise question picks a reasonable interpretation, says what they picked, and answers.

⚠️ Apply the default readings above. "Deposits" means the current balance; "size" means gross deposits; "top N" with no N means ten. Scope is never in doubt either — "which protocol has the most X" means all of them.`;

  const response = await client.messages.create({
    model: MODEL, max_tokens: 2000, system, tools: [PROPOSE],
    tool_choice: { type: 'tool', name: 'propose_plan' },   // ⚠️ a plan, never prose and never a question
    messages: [{ role: 'user', content: directive }],
  });

  const call = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
  if (!call) throw new Error(`planner returned no tool call (stop_reason ${response.stop_reason})`);

  const i = call.input as {
    subject: string; deployments?: string[];
    headlineSlug?: string; headlineField: string;
    reads?: { documentId: string; slugs: string[]; variables?: Record<string, string | number | boolean | null> }[];
    checks: PlannedCheck[]; rationale: string;
  };
  // ⚠️ **Scope follows the reads when it is not stated.** Naming no deployment still means every
  // live one — a report that silently covers four is answering a narrower question than the one
  // asked — but a plan whose `reads` name `makerdao-ethereum` has already said what it is about, and
  // expanding that to all 25 makes the plan contradict itself. Measured 2026-09-07: it planned
  // `markets` on makerdao correctly, left `deployments` empty, and the run was declined because one
  // of the other 24 was too stale to share a block.
  const fromReads = [...new Set((i.reads ?? []).flatMap((r) => r.slugs ?? []))];
  const deployments = i.deployments?.length ? i.deployments : fromReads.length ? fromReads : live.map((c) => c.slug);
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

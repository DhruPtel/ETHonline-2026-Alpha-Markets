// The prose. A `DraftReport` in, a complete `Report` out.
//
// ⚠️ **The model never types a number.** It returns sections and paragraphs whose every financial
// figure is a `{fact:ID}` placeholder, and the renderer substitutes the computed value. That is what
// makes an invented figure impossible rather than unlikely — Unit 11 enforces it, but this output
// shape is what makes enforcement possible at all.
//
// ⚠️ **No validation here.** Mixing generation with checking means a bug in one hides in the other.
//
// ⚠️ **The skills do the shaping.** `balance-overview.md` and `conventions.md` carry the decisions —
// eight markets, how to present an exclusion, that `consistent_only` is ordinary, the semantic facts
// the schema does not state. If narration comes out wrong in a way a skill should have prevented,
// fix the skill rather than this prompt. That is what the skill is for.

import { readFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import type { Assessment, Fact, Report, Section } from '../types/report.js';
import type { DraftReport } from './execute.js';
import { MODEL } from './loop.js';

const skill = (name: string) => readFileSync(new URL(`./skills/${name}.md`, import.meta.url), 'utf8');

// ⚠️ The tool takes ONE body string per section, not a nested array of paragraph objects.
//
// Measured 2026-09-07: given a free schema the model reliably returns `{id, title, body}`, and given
// the nested `paragraphs: [{text, factRefs}]` shape it intermittently returns **zero sections** —
// the API drops items that do not conform and the report comes back empty. The wire contract in
// `types/report.ts` is unchanged (§5.11's shape); the mapping happens here.
//
// Deriving `factRefs` from the text rather than asking for them separately is the better half of
// this: a model-supplied list can disagree with the placeholders it actually wrote, and Unit 11
// checks the text. Extracting them makes the two incapable of drifting apart.
const WRITE: Anthropic.Tool = {
  name: 'write_report',
  description: 'Write the memo. Every financial figure must be a {fact:ID} placeholder, never a typed number.',
  input_schema: {
    type: 'object',
    properties: {
      sections: {
        type: 'array',
        description: 'One entry per section, in order.',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', enum: ['figures'] },
            body: { type: 'string', description: 'The markdown table, and nothing else. Every cell holding a number is a {fact:ID} placeholder.' },
          },
          required: ['id', 'body'],
        },
      },
      assessment: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'ONE paragraph about the protocols and the market — what they are, what the numbers mean, how they compare. No blank lines: one paragraph, not several. Nothing about what was queried or how the directive was read. Figures appear ONLY as {fact:ID}.' },
          basis: { type: 'array', items: { type: 'string' }, description: 'Fact ids this judgment rests on.' },
          confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
        },
        required: ['summary', 'basis', 'confidence'],
      },
    },
    required: ['sections', 'assessment'],
  },
};

const FACT_REF = /\{fact:([^}]+)\}/g;
/** Split a section body into paragraphs and derive each one's fact references from its own text. */
const toParagraphs = (body: string) =>
  body.split(/\n\s*\n/).map((t) => t.trim()).filter(Boolean).map((text) => ({
    text,
    factRefs: [...new Set([...text.matchAll(FACT_REF)].map((m) => m[1]!.trim()))],
  }));

/** What the model is given: the facts it may cite, and what the engine already concluded. */
function context(draft: DraftReport): string {
  const facts = Object.values(draft.facts).map((f) =>
    `  ${f.id}  "${f.label}"  ${f.value === null ? `WITHHELD — ${f.withheld?.rationale ?? 'unavailable'}` : `${f.value} ${f.unit}`}  corroboration:${f.corroboration}`);
  const checks = draft.checks.map((c) => `  [${c.outcome}${c.severity ? ` ${c.severity}` : ''}] ${c.description}: ${c.rationale}`);
  return `Block ${draft.block}, observed ${draft.observedAt}. Deployments: ${draft.subject.deployments.join(', ')}.
Directive: ${draft.subject.directive}
Headline figure (what the report is about): ${draft.subject.headline}

FACTS you may cite — reference these by id as {fact:ID}, never by typing the number:
${facts.join('\n')}

CHECKS the engine ran:
${checks.join('\n')}

VERDICT the engine computed: ${draft.verdict.call} — ${draft.verdict.coverage.marketsRead} markets read, ${draft.verdict.coverage.marketsCorroborated} corroborated, population ${draft.verdict.coverage.completeness}, ${draft.verdict.coverage.checksRun}/${draft.verdict.coverage.checksAvailable} checks ran.
${draft.exclusions.length ? `EXCLUSIONS: ${draft.exclusions.map((e) => `${e.slug} (${e.code}) ${e.rationale}`).join('; ')}` : 'EXCLUSIONS: none.'}`;
}

export async function narrate(draft: DraftReport, client: Anthropic): Promise<Report> {
  // ⚠️ One skill, no form. The table is whatever the plan fetched — the facts below decide its
  // shape, not a template chosen before the data was read.
  const system = `You are a lending-protocol analyst writing a report.

${skill('conventions')}

---

${skill('report')}

---

⚠️ You never type a financial figure. Every number is written as {fact:ID} using an id from the FACTS
list, and the renderer substitutes the value. A digit you type is a digit nobody can trace.

Produce one section — the table of what was fetched — and put your read in the assessment summary as
ONE paragraph about the protocols and the market. Not what was queried, not how you read the
directive, not a description of the checking that produced the figures.`;

  const response = await client.messages.create({
    // ⚠️ Sized for the widest table the plan can produce — every live deployment. An output cap
    // reached mid-tool-call returns a PARTIAL argument object rather than an error.
    model: MODEL, max_tokens: 16000, system, tools: [WRITE],
    tool_choice: { type: 'tool', name: 'write_report' },
    messages: [{ role: 'user', content: context(draft) }],
  });
  const call = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
  if (!call) throw new Error(`narrator returned no tool call (stop_reason ${response.stop_reason})`);
  const { sections, assessment } = call.input as { sections?: { id: Section['id']; body?: string }[]; assessment?: Assessment };
  // Structural integrity only — not the digit guard, which is Unit 11. Failing here names the cause
  // rather than throwing somewhere downstream that looks unrelated.
  if (!sections?.length || !assessment) {
    throw new Error(`narrator returned an incomplete report (stop_reason ${response.stop_reason}, ` +
      `${sections?.length ?? 0} section(s), assessment ${assessment ? 'present' : 'missing'})`);
  }
  const clean: Section[] = sections
    .filter((sec) => sec?.id && typeof sec.body === 'string' && sec.body.trim())
    .map((sec) => ({ id: sec.id, paragraphs: toParagraphs(sec.body!) }))
    .filter((sec) => sec.paragraphs.length);
  if (!clean.length) throw new Error('narrator returned sections but none carried usable prose');
  return { ...draft, sections: clean, assessment };
}

// ─── Rendering ───────────────────────────────────────────────────────────────────────────────────
// ⚠️ One rendering of the object, not the report. The hash is on the object — markdown now, a file
// in Phase 3, HTML when there is a UI, and all three must hash identically because none of them is
// the report.

/** ⚠️ Display rounds on purpose. The exact decimal string stays in the object and in the hash. */
function show(f: Fact): string {
  if (f.value === null) return 'unavailable';   // ⚠️ one word in the cell, never a paragraph
  const n = Number(f.value);
  if (f.unit === 'USD') return n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${n.toFixed(2)}`;
  if (f.unit === 'ratio') return `${(n * 100).toFixed(1)}%`;
  return f.value;
}

const TITLE: Record<string, string> = {
  subject: 'Subject', figures: 'Figures', checks: 'Checks', exclusions: 'Exclusions', verdict: 'Verdict',
};

/**
 * ⚠️ **A rendering decision, not a correctness one.** The engine still computes every check, verdict
 * and provenance record, and all of it stays in the `Report` object and inside the hash. This view
 * prints the table and the analyst's read and nothing else — a reader wants the data and a view on
 * it, not a tour of the checking apparatus. A UI with room can show the rest.
 */
export function render(report: Report, _hash?: string): string {
  const fill = (text: string) =>
    (text ?? '').replace(/\{fact:([^}]+)\}/g, (_m, id: string) => {
      const f = report.facts[id.trim()];
      return f ? show(f) : `⟨unknown fact ${id}⟩`;
    });
  const table = report.sections.flatMap((sec) => sec.paragraphs).map((p) => fill(p.text)).join('\n\n');

  // ⚠️ **One line, not a provenance block.** Where the numbers came from is worth saying once —
  // honestly, and because a judge looking for live Graph data should not have to take it on faith.
  // The rest of the provenance stays in the object.
  //
  // ⚠️ The count comes from the FACTS, not from `subject.deployments`. The plan names what was
  // asked for; the facts are what actually answered, and a deployment dropped for staleness must
  // not be counted here as though it had contributed.
  const answered = new Set(Object.values(report.facts).map((f) => f.slug)).size;
  const source = `Live data from The Graph · ${answered} deployment${answered === 1 ? '' : 's'} · block ${report.block}`;

  // ⚠️ The heading is the directive, not a form name. With no template there is no category to
  // announce, and what identifies a report is the question it answers.
  return [`# ${report.subject.directive}`, '', '', table, '', source, '', '', fill(report.assessment.summary), ''].join('\n');
}

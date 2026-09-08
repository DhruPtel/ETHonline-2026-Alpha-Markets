// The prose. A `DraftReport` in, a complete `Report` out.
//
// ⚠️ **The model never types a number.** It returns ONE markdown table string and one paragraph,
// whose every financial figure is a `{fact:ID}` placeholder, and the renderer substitutes the
// computed value. `narrate` maps that into the `Section[]` the wire contract expects. That is what
// makes an invented figure impossible rather than unlikely — Unit 11 enforces it, but this output
// shape is what makes enforcement possible at all.
//
// ⚠️ **Structural validation here; the digit guard is Unit 11's.** This file checks that a table
// and a non-empty summary came back at all, because a malformed return should name itself rather
// than fail somewhere downstream that looks unrelated. It does NOT check the content of the prose —
// that separation is the point: mixing generation with the digit guard means a bug in one hides in
// the other.
//
// ⚠️ **The skills do the shaping.** `report.md` and `conventions.md` carry the decisions — how many
// rows are worth showing, what the paragraph is about, the semantic facts the schema does not state.
// If narration comes out wrong in a way a skill should have prevented, fix the skill rather than
// this prompt. That is what the skill is for.

import { readFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import type { Assessment, Fact, Report, Section } from '../types/report.js';
import type { DraftReport } from './execute.js';
import { MODEL } from '../config/model.js';

const skill = (name: string) => readFileSync(new URL(`./skills/${name}.md`, import.meta.url), 'utf8');

// ⚠️ **The tool takes ONE table string. There is no array, and that is the point.**
//
// It used to take `sections: [{id, body}]` with no cardinality, and on 2026-09-07 a directive about
// Aave's markets by category returned **29 sections and no assessment** — one section per market.
// The schema was the bug: an array whose `id` had exactly one legal value carried no information and
// offered only repetition, so a model with 29 things to show read it as 29 tables. A scalar makes
// that unrepresentable rather than discouraged.
//
// ⚠️ `strict: true` is the other half. Without it `required` is advisory — the API returns whatever
// the model produced, which is how `assessment` went missing in the same call. Structure is now
// fixed; the ROW COUNT stays entirely the model's, which is the split we actually want.
//
// ⚠️ **`maxLength` is a strong hint and NOT a constraint — measured, do not trust it as a guard.**
// A/B on one prompt asking for the longest possible summary: with `maxLength: 1200` the model
// returned 10,027 characters on 3,622 output tokens; with no cap at all, 22,988 characters on 8,210.
// So the cap more than halves the output and is worth declaring, and it was exceeded eightfold, so
// the thing that actually binds is the length check in code below.
//
// The wire contract in `types/report.ts` is unchanged (§5.11's shape); the mapping happens here.
//
// Deriving `factRefs` from the text rather than asking for them separately is the better half of
// this: a model-supplied list can disagree with the placeholders it actually wrote, and Unit 11
// checks the text. Extracting them makes the two incapable of drifting apart.
const WRITE: Anthropic.Tool = {
  name: 'write_report',
  description: 'Write the report. Every financial figure must be a {fact:ID} placeholder, never a typed number.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      table: {
        type: 'string',
        maxLength: 20000,
        description: 'ONE markdown table, and nothing else. Show the rows that carry the answer — you choose how many. Every cell holding a number is a {fact:ID} placeholder.',
      },
      assessment: {
        type: 'object',
        additionalProperties: false,
        properties: {
          summary: { type: 'string', maxLength: 1800, description: 'ONE paragraph about the protocols and the market — what they are, what the numbers mean, how they compare. No blank lines: one paragraph, not several. Nothing about what was queried or how the directive was read. Figures appear ONLY as {fact:ID}.' },
          basis: { type: 'array', items: { type: 'string' }, description: 'Fact ids this judgment rests on.' },
          confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
        },
        required: ['summary', 'basis', 'confidence'],
      },
    },
    required: ['table', 'assessment'],
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

CHECKS the engine ran — the engine's own notes, and NOT citable:
⚠️ Figures inside these rationales have no fact id. They are sums, gaps and percentages the engine
computed while checking, and there is no {fact:ID} that resolves to them. If a number here matters
to your report it is either already in FACTS above under an id you can cite, or it belongs to the
checking apparatus and does not belong in the report at all. Never copy a figure out of a rationale.
${checks.join('\n')}

VERDICT the engine computed: ${draft.verdict.call ?? 'none — this report is about a metric across deployments, so there is no single figure to stand behind. Each deployment has its own tier claims in CHECKS above; read those rather than looking for one answer'} — ${draft.verdict.coverage.marketsRead} markets read, ${draft.verdict.coverage.marketsCorroborated} corroborated, population ${draft.verdict.coverage.completeness}, ${draft.verdict.coverage.checksRun}/${draft.verdict.coverage.checksAvailable} checks ran.
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

  // ⚠️ **Streamed, and not by choice.** The SDK refuses a non-streaming request whose `max_tokens`
  // could run past its ten-minute ceiling, so raising the budget to 24,000 forces `.stream()`. We
  // want no incremental events — `finalMessage()` waits for the whole thing — the streaming is
  // purely how the SDK permits a long request.
  const response = await client.messages.stream({
    // ⚠️ **24,000 is headroom, not the fix.** Measured 2026-09-07: five narrations of one 140-fact
    // draft at 16,000 produced ZERO usable reports — three exhausted the budget, one returned the
    // literal string "placeholder", one an empty summary — while the table they did produce was
    // 2,600 characters. The widest legitimate output this can be asked for is roughly 3,500 tokens
    // (a 63-row market table of placeholders plus one paragraph), so 16,000 was never too small for
    // real output; it was being consumed by degeneration. Raising it buys headroom for the honest
    // case and does not address the dishonest one — see `maxLength` on the tool and the fact cap
    // noted in `execute.ts`.
    model: MODEL, max_tokens: 24000, system, tools: [WRITE],
    tool_choice: { type: 'tool', name: 'write_report' },
    messages: [{ role: 'user', content: context(draft) }],
  }).finalMessage();
  const call = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
  if (!call) throw new Error(`narrator returned no tool call (stop_reason ${response.stop_reason})`);
  const { table, assessment } = call.input as { table?: string; assessment?: Assessment };
  // ⚠️ Validate BEFORE rendering, and say WHICH part failed. `strict: true` guarantees the keys
  // exist, so the interesting failure is no longer an absent field but an EMPTY one — a present
  // `assessment` whose summary is a blank string satisfies the schema and is still not a report.
  // Distinguishing the two is the difference between a five-minute diagnosis and an hour of it.
  const summary = assessment?.summary?.trim();
  if (!table?.trim() || !assessment || !summary) {
    throw new Error(`narrator returned an incomplete report (stop_reason ${response.stop_reason}, ` +
      `table ${table?.trim() ? `${table.trim().length} chars` : 'MISSING'}, ` +
      `assessment ${!assessment ? 'MISSING' : summary ? 'present' : 'present but summary EMPTY'})`);
  }
  // ⚠️ The binding length guard. `maxLength` on the schema is a hint the model overran eightfold in
  // measurement, so a degenerating generation is caught here rather than rendered. Generous on
  // purpose — this exists to reject pathology, not to enforce brevity, which is the skill's job.
  if (table.length > 40_000 || summary.length > 6_000) {
    throw new Error(`narrator returned an implausibly long report (table ${table.length} chars, ` +
      `summary ${summary.length} chars) — this is degeneration rather than a long answer`);
  }
  const paragraphs = toParagraphs(table);
  if (!paragraphs.length) throw new Error('narrator returned a table that carried no usable text');
  return { ...draft, sections: [{ id: 'figures', paragraphs }], assessment };
}

// ─── Rendering ───────────────────────────────────────────────────────────────────────────────────
// ⚠️ One rendering of the object, not the report. The hash is on the object — markdown now, a file
// in Phase 3, HTML when there is a UI, and all three must hash identically because none of them is
// the report.

/**
 * ⚠️ Display rounds on purpose. The exact decimal string stays in the object and in the hash.
 *
 * ⚠️ **`Number()` here is display, and display is the one place the no-floating-point rule does not
 * apply** — same rule as `adapter.ts` and `reconcile.ts` state at their own sites: use `ops` where a
 * value is computed, float only where a value is being shown or a threshold decided. Nothing this
 * function returns is stored, hashed, or read back; `$24.82B` is a label for `f.value`, not a
 * substitute for it. The uneven part is real and deliberate: USD and ratio cells round, every other
 * unit returns the exact string, so a `count` renders as itself while a dollar figure does not.
 */
function show(f: Fact): string {
  if (f.value === null) return 'unavailable';   // ⚠️ one word in the cell, never a paragraph
  const n = Number(f.value);
  if (f.unit === 'USD') return n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${n.toFixed(2)}`;
  if (f.unit === 'ratio') return `${(n * 100).toFixed(1)}%`;
  return f.value;
}

/**
 * ⚠️ **A rendering decision, not a correctness one.** The engine still computes every check, verdict
 * and provenance record, and all of it stays in the `Report` object and inside the hash. This view
 * prints the table and the analyst's read and nothing else — a reader wants the data and a view on
 * it, not a tour of the checking apparatus. A UI with room can show the rest.
 */
export function render(report: Report, _hash?: string): string {
  // ⚠️ **`_hash` is RESERVED, not stale — do not remove it because nothing reads it** (same status
  // as the unwired external-reference tier in `reconcile.ts`). It carried the footer that the
  // stripped format removed, and Phase 3 gives it a real job: the ATS token commits the report hash
  // in its creation event, so a rendering that shows a reader which hash this text belongs to is
  // exactly what a tokenised report wants. The three call sites already pass it. Kept so that when
  // the format gets its pass after Phase 4 the value is in hand rather than needing re-threading.
  void _hash;

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

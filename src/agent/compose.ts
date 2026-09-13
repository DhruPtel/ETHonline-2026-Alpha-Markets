// The plan. One model turn, before any data is read.
//
// ⚠️ **The planner selects documents; it never authors GraphQL** (§5.6). It picks a `documentId`
// and supplies variables, which removes the whole class of failure where a model emits a field that
// does not exist on a deployment.
//
// ⚠️ **One tool, forced. The planner cannot ask a question, because there is no shape for one.** A
// prompt asking politely for a plan gets a confident essay whenever the model would rather write one;
// `tool_choice` does not. Why `need_clarification` was removed, and what the surviving `ok: false`
// arm is for, is in the note above `ComposeResult`.
//
// ⚠️ **No network beyond the model call.** Capabilities come from `config/protocols.ts`, which is
// already measured (the Phase 0 smoke tests and the 2026-09-07 sweep), and the caller builds the
// analyst context.

import { readFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import type { Capabilities, Clarification, PlannedCheck, ReportPlan } from '../types/report.js';
import { PROTOCOLS } from '../config/protocols.js';
import { DOCUMENT_IDS, DOCUMENT_BRIEF } from '../graph/queries/index.js';
import { figureRef } from '../engine/invariants.js';
import { MODEL } from '../config/model.js';
// ⚠️ A TYPE-ONLY import, so `compose` gains no database dependency from `context.ts`. The caller
// builds the context and passes it; this file only places text in a prompt.
import type { AnalystContext } from './context.js';

/**
 * The figures a report can be ABOUT. Narrower than the document, on purpose.
 *
 * ⚠️ **KNOWN GAP, recorded rather than fixed (2026-09-07).** Every entry is a protocol-level
 * balance-sheet field, so two kinds of directive cannot state their own subject:
 *
 *   - **A derived ratio.** "Which protocol is most leveraged" has no expressible headline, so it
 *     plans as `totalBorrowBalanceUSD` every time — which is comparable, and is not what was asked.
 *     This is why the Morpho-denominator case has never once arisen in a proof.
 *   - **A market-level metric.** A directive about the markets inside a deployment gets a headline
 *     that is that deployment's protocol total.
 *
 * What it would take: a derived-metric option whose value `ops.ratio` computes into a `unit:
 * 'ratio'` fact, and a market-scoped headline id. Both are real design questions — a derived
 * headline changes what `aboutOneFigure` means in `execute`, and a market headline changes what a
 * `DATA_ERROR` blocks — so neither is a cleanup.
 */
const HEADLINE_FIELDS = [
  'totalDepositBalanceUSD', 'totalBorrowBalanceUSD', 'totalValueLockedUSD',
  'cumulativeDepositUSD', 'cumulativeBorrowUSD', 'cumulativeTotalRevenueUSD',
] as const;
// ⚠️ **Two choices, because only two are choices.** This listed four until 2026-09-07 and the
// planner dutifully picked all of them. `internal-consistency` is not optional — `reconcile` runs
// tier 0 on every report whatever the plan says — and `market-population` follows from asking for
// the `markets` document. A plan claiming a check nothing acts on overstates what was verified.
// ⚠️ `external-reference` stays, and nothing reads it yet: it names tier 2, which works but runs only
// when `reconcile` is handed a reference, and `execute` never supplies one.
const CHECKS: readonly PlannedCheck[] = ['chain-corroboration', 'external-reference'];

/**
 * ⚠️ **Exported for outside analysts, used only here today — leave it exported.** `Capabilities`
 * lives in `types/report.ts` beside the report contract because an outside analyst publishing into
 * this market needs to know what a deployment can and cannot tell them before planning against it.
 * One in-repo consumer is a fact about how far we have built, not about its value.
 */
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
  description: 'Propose the plan for a report that answers the directive: what it covers, which documents produce it, and the metric it turns on.',
  // ⚠️ `strict: true` makes `required` binding — without it the API returns whatever the model
  // produced, which is how `reads` went missing and silently became a balance-sheet plan. Verified
  // 2026-09-07 that strict permits properties absent from `required` (so `deployments` and
  // `headlineSlug` stay genuinely optional) and requires `additionalProperties: false` on every
  // object, which is why `variables` below is a closed shape rather than a free one.
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      subject: { type: 'string', description: 'What the report is about, one sentence. Specific to the directive, not a generic overview.' },
      deployments: { type: 'array', items: { type: 'string' }, description: 'Slugs the report covers. Leave empty to cover ALL live deployments.' },
      headlineSlug: { type: 'string', description: 'The one deployment whose figure answers the directive, when the directive is about a single deployment. Leave empty when the question is about the metric across the whole set.' },
      headlineField: { type: 'string', enum: [...HEADLINE_FIELDS], description: 'The metric the directive turns on.' },
      reads: {
        type: 'array',
        // ⚠️ `minItems: 1` and it is load-bearing. `strict` makes `reads` PRESENT, not non-empty —
        // measured 2026-09-07: asked "Is Aave a good investment?" the planner returned `reads: []`,
        // which is a refusal wearing a plan's clothes, and the throw below turned it into a crash.
        // With a floor of one the same directive plans something real. Constraining the container
        // beats instructing the model, again.
        minItems: 1,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            documentId: { type: 'string', enum: [...DOCUMENT_IDS], description: 'Which document to run. See the catalogue in the system prompt for what each returns.' },
            slugs: { type: 'array', items: { type: 'string' } },
            // ⚠️ Only `financial-snapshots` takes these, and `execute` does not run that document
            // yet. Kept and typed rather than dropped: the shape is what a snapshot read needs.
            variables: {
              type: 'object', additionalProperties: false,
              properties: { startTimestamp: { type: 'string' }, endTimestamp: { type: 'string' } },
              required: [],
            },
          },
          required: ['documentId', 'slugs'],
        },
      },
      checks: { type: 'array', items: { type: 'string', enum: [...CHECKS] } },
      rationale: { type: 'string', description: 'Why this scope answers the directive, and — when the directive was ambiguous — which reading you took and why that one. "Health" read as utilization, say, rather than a question back.' },
    },
    // ⚠️ `reads` is required — the throw in `compose()` says what omitting it used to hide.
    required: ['subject', 'headlineField', 'reads', 'checks', 'rationale'],
  },
};

// ⚠️ **There is no `need_clarification` tool, deliberately (2026-09-07).** It existed and it worked
// — "what protocol has the best financial health?" got a well-reasoned refusal, which is the wrong
// answer. Health is not a quantity anyone holds and the proxies for it disagree, all true, and an
// analyst asked that question still picks a reading, says which, and answers. Refusing is a control
// worth adding back once we know what the agent does when it tries; it is not the ground floor.
//
// ⚠️ The `ok: false` arm below survives for ONE thing, and it is not a refusal to interpret: a
// deployment that is not configured or not answering — named in the directive (`unknownDeployment`,
// before the model is asked) or in the plan (the `unknown` check after it). That is a broken request,
// not a vague one.

export type ComposeResult =
  | { readonly ok: true; readonly plan: ReportPlan }
  | { readonly ok: false; readonly clarification: Clarification };

// ── ⚠️ A DEPLOYMENT THE DIRECTIVE NAMES MUST EXIST — REFUSED IN CODE, BEFORE THE MODEL IS ASKED ──────
//
// The planner chooses slugs from the list it is shown, so a name that matches none of them is not
// refused — it is mapped to one. "Top 5 Markets for compund-v3" was planned on 2026-09-13 against a
// deployment the directive never named, read real Graph data for it, and gave the narrator facts about
// a different protocol. The `unknown` check in `compose()` cannot see that: it reads the slugs the model
// returned, and those came from the list. So the name is checked here, against config, first.
//
// ⚠️ **Refused:** words within a letter or two of a deployment's name without being it (`compund-v3`;
// `markerdao`, which is in the store as a saved report), a version nothing is configured at
// (`compound-v4`, `uniswap-v3`), and the slug or base name of a deployment that is configured but not
// answering. Near matches are LIVE deployments only — a suggestion that then fails at execute is worse
// than none. **Not refused:** a bare name that resembles nothing configured ("Radiant"). That reaches the
// planner, and the `unknown` check refuses it only if the planner passes it through unchanged.

const squash = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const VERSION = /^v\d+$/;
/** Words a deployment name never begins or ends with, so "compare v2" is not read as a name. */
const FILLER = new Set([
  'and', 'best', 'compare', 'for', 'from', 'how', 'list', 'show', 'the', 'top', 'what', 'which', 'with',
  'balance', 'borrows', 'deposits', 'ethereum', 'lending', 'market', 'markets', 'overview', 'protocol',
  'protocols',
]);

/** Damerau–Levenshtein (optimal string alignment): a transposed pair costs one edit, as a typo does. */
function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const row = d[i]!, up = d[i - 1]!;
      row[j] = Math.min(up[j]! + 1, row[j - 1]! + 1, up[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) row[j] = Math.min(row[j]!, d[i - 2]![j - 2]! + 1);
    }
  }
  return d[a.length]![b.length]!;
}

/**
 * Close enough to be a typo of `name` without being it. ⚠️ **No slack under six letters** — `rari` is
 * two edits from `rate` and `aave` one from `have` — one under nine, two beyond. A name with an
 * inflection on it (`compounds`, `compounded`) is a word, not a miss.
 */
function nearMiss(text: string, name: string): boolean {
  const shorter = Math.min(text.length, name.length);
  const slack = shorter < 6 ? 0 : shorter < 9 ? 1 : 2;
  if (slack === 0 || text === name) return false;
  if (text.startsWith(name) && /^(s|es|ed|ing|er|ers)$/.test(text.slice(name.length))) return false;
  return distance(text, name) <= slack;
}

/**
 * The directive names a deployment this platform does not read — as a refusal — or `null`.
 * ⚠️ Pure and exported: it runs before any token is spent, and the offline check in logs.md calls it.
 */
export function unknownDeployment(directive: string): Clarification | null {
  // Every way a directive names a deployment: the slug, the slug without its chain, family plus version,
  // and the family alone. The family is recognised but never refused on — `inverse` is also a word.
  const rows = PROTOCOLS.map((p) => {
    const base = p.slug.replace(/-ethereum$/, '');
    const parts = base.split('-');
    const versions = parts.filter((x) => VERSION.test(x));
    const exact = [p.slug, base, ...(versions.length ? [[parts[0], ...versions].join('-')] : [])].map(squash);
    return { slug: p.slug, status: p.status, exact, names: [...exact, squash(parts[0]!)] };
  });
  const words = directive.toLowerCase().replace(/'s\b/g, '').split(/[^a-z0-9]+/).filter((w) => w && !/^[a-z]$/.test(w));
  const spans: { from: number; to: number; text: string; known: boolean }[] = [];
  for (let from = 0; from < words.length; from++) {
    for (let to = from; to < Math.min(words.length, from + 4); to++) {
      const first = words[from]!;
      if (first.length < 3 || !/[a-z]/.test(first) || VERSION.test(first) || FILLER.has(first) || FILLER.has(words[to]!)) continue;
      const text = words.slice(from, to + 1).join('');
      spans.push({ from, to, text, known: rows.some((r) => r.names.includes(text)) });
    }
  }
  const indices = (s: { from: number; to: number }) => Array.from({ length: s.to - s.from + 1 }, (_, k) => s.from + k);
  const phrase = (s: { from: number; to: number }) =>
    directive.match(new RegExp(words.slice(s.from, s.to + 1).join('[^a-z0-9]+'), 'i'))?.[0] ?? words.slice(s.from, s.to + 1).join(' ');

  for (const s of spans) {
    const named = rows.filter((r) => r.exact.includes(s.text));
    if (named.length && named.every((r) => r.status !== 'live')) {
      return {
        missing: ['deployment'],
        reason: `"${phrase(s)}" is ${named.map((r) => `${r.slug} (${r.status})`).join(', ')} — configured, but not answering, so there is nothing to read. Nothing was planned and nothing was spent.`,
        suggestions: [],
      };
    }
  }

  const covered = new Set(spans.filter((s) => s.known).flatMap(indices));
  const names = rows.flatMap((r) => r.names);
  const misses = spans.filter((s) => !s.known && (
    // A version nothing is configured at ("compound-v4", "uniswap-v3") — unless that version belongs to a
    // name already recognised: "maple finance v2" also contains "finance v2".
    (s.to > s.from && VERSION.test(words[s.to]!) && !covered.has(s.to)) ||
    // A near miss — unless its words are a recognised name with more words beside it ("compound on"), or
    // it is any name with an ending on it: "compounded" is also two edits from "compoundv3".
    (!indices(s).some((i) => covered.has(i)) &&
      !names.some((n) => s.text.startsWith(n) && /^(s|es|ed|ing|er|ers)$/.test(s.text.slice(n.length))) &&
      names.some((n) => nearMiss(s.text, n)))));
  const miss = misses.find((s) => !misses.some((o) => o !== s && o.from <= s.from && o.to >= s.to));
  if (!miss) return null;

  const first = words[miss.from]!;
  const near = rows
    .filter((r) => r.status === 'live' && r.names.some((n) => n === first || nearMiss(miss.text, n) || nearMiss(first, n)))
    .map((r) => ({ slug: r.slug, d: Math.min(...r.names.map((n) => distance(miss.text, n))) }))
    .sort((x, y) => x.d - y.d || x.slug.localeCompare(y.slug))
    .slice(0, 3)
    .map((c) => c.slug);
  const said = phrase(miss);
  return {
    missing: ['deployment'],
    reason: `"${said}" is not a deployment this platform reads${near.length ? ` — did you mean ${near.join(' or ')}?` : ', and nothing configured is close to it.'} Nothing was planned and nothing was spent.`,
    suggestions: near.map((slug) => directive.replace(said, slug)),
  };
}

// ⚠️ The planner reads the same conventions the narrator does. The defaults live in one file
// because the report STATES the assumption the planner made — if the two drifted, a memo would
// declare a reading its plan never took.
const conventions = () => readFileSync(new URL('./skills/conventions.md', import.meta.url), 'utf8');

// ⚠️ **The semantic notes go in, and they are the reason this function is not a one-liner.**
// `capabilitiesOf` assembles everything measured about a deployment and `brief` used to
// drop all of it except the triage word — so the planner never learned that Morpho means different
// things by the standard field names, or that its deposits are the loan side, or that aave-v3's
// revenue accumulator is poisoned. Measured before adding them: 6 of 25 live deployments carry a
// note at all, 2,500 characters in total, and the whole system prompt goes 3,154 → 4,394 input
// tokens. A 39% prompt for the measurements the rest of the repo exists to produce is a bargain.
const brief = (c: Capabilities) =>
  `- ${c.slug} (${c.liveSchemaVersion}, ${c.lendingType}, triage ${c.triageVerdict}) revenue ${c.revenue}; ${c.corroboration}; deposit USD from ${c.depositBasis}`
  + (c.semanticNotes ? `\n    ⚠️ ${c.semanticNotes}` : '');

/**
 * @param context ⚠️ **The analyst's own settled record (`context.ts`), and it makes a report a function
 *   of history.** A plan depends on state outside the directive and the block it was read at, so two
 *   runs of one directive at one block can plan differently — **which is the loop working, not a
 *   defect**: an analyst that has learned something should plan differently. The report hash was
 *   already non-deterministic because narration is inside it; what this adds is that the PLAN varies
 *   too. What the plan saw is recorded in `reports.context_digest`, outside the hash.
 *
 *   ⚠️ **Optional, and absent is not empty.** Omitted or `null` adds nothing — the system prompt is
 *   byte-for-byte what it was before this argument existed, which keeps callers without a context
 *   correct and unmodified.
 */
export async function compose(
  directive: string, client: Anthropic, context?: AnalystContext | null,
): Promise<ComposeResult> {
  // ⚠️ First, before the prompt is built or a token is spent. See `unknownDeployment` above.
  const refused = unknownDeployment(directive);
  if (refused) return { ok: false, clarification: refused };

  const live = PROTOCOLS.filter((p) => p.status === 'live').map((p) => capabilitiesOf(p.slug)!);
  const system = `You plan financial reports on lending protocols.

${conventions()}

---
 You do not write them and you do not read data — you decide what a report should cover, and deterministic code executes it.

Available deployments:
${live.map(brief).join('\n')}

Available documents — every report is built from one or more of these, and \`reads\` must name the ones that produce it:
${DOCUMENT_IDS.map((id) => `- **${id}** — ${DOCUMENT_BRIEF[id]}`).join('\n')}
${context ? `\n---\n\n${context.block}\n` : ''}
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
  // ⚠️ **No balance-sheet fallback.** There used to be one, and it is what let a planner that never
  // considered documents produce a protocol-level plan while nothing recorded that no choice was
  // made. `strict` should make this unreachable; if it fires, the planner is broken and saying so
  // is more useful than quietly answering a narrower question than the one asked.
  if (!i.reads?.length) throw new Error('planner returned a plan with no reads — nothing to fetch, and substituting a default is what hid this before');
  const fromReads = [...new Set(i.reads.flatMap((r) => r.slugs ?? []))];
  const deployments = i.deployments?.length ? i.deployments : fromReads.length ? fromReads : live.map((c) => c.slug);
  // ⚠️ Validate against config rather than trusting the schema, which types a slug as any string
  // and cannot say whether that deployment exists or answers.
  const unknown = deployments.filter((s) => !PROTOCOLS.some((p) => p.slug === s && p.status === 'live'));
  if (unknown.length) return {
    ok: false,
    clarification: { missing: ['deployment'], reason: `not configured or not answering: ${unknown.join(', ')}`, suggestions: live.slice(0, 3).map((c) => `Report ${c.slug}'s deposits and borrows`) },
  };

  // ⚠️ **The headline is what a failure costs, now that there is no form.** Naming a deployment
  // means the report is ABOUT that deployment's figure, so an error there blocks it. Naming none
  // means the question is about the metric across the set — nobody knows which deployment leads
  // until the data is read — and one bad deployment loses its figure (or, if stale, its row) rather
  // than taking the rest down. `execute` reads exactly that distinction off this string; the
  // `metric` sentinel is load-bearing.
  const headline = i.headlineSlug
    ? figureRef(i.headlineSlug, i.headlineField)
    : figureRef('metric', i.headlineField);

  return {
    ok: true,
    plan: {
      subject: { directive, deployments, headline },
      reads: i.reads.map((r) => ({ documentId: r.documentId, slugs: r.slugs?.length ? r.slugs : deployments, variables: r.variables ?? {} })),
      checks: i.checks, rationale: i.rationale,
    },
  };
}

// POST /api/console/generate — the report pipeline, streamed a stage at a time.
//
// ⚠️ **THROWAWAY. Delete `app/console/` and `app/api/console/` before submission.**
//
// ⚠️ **The same sequence `scripts/ops/report.ts` runs, in the same order, with the same outcomes.**
// compose → execute → narrate → validate → save. The three not-a-report outcomes of `execute`
// (`blocked`, `declined`, `budget`) and compose's `clarification` all stop here exactly as they stop
// there, and nothing is saved on any of them. Nothing is reimplemented; the only thing this file
// adds is that it says where it has got to while it is getting there.
//
// ⚠️ **NDJSON, one JSON object per line, not SSE.** SSE would buy an EventSource client and a
// framing format for a stream this reads once and appends to a terminal pane. Lines are enough.
//
// ── The 300-second cliff, stated rather than discovered ──────────────────────────────────────────
//
// ⚠️ Vercel caps a function at 300s and this route asks for all of it. The arithmetic is tight and
// it is emitted as the first event so it is on screen rather than in a comment:
//
//     compose   ~5s      one model call, unbudgeted
//     execute   ≤240s    DEFAULT_BUDGET.maxWallClockMs — execute stops ITSELF at this and returns
//                        status 'budget', which is a clean reported outcome, not a crash
//     narrate   ~9s      one model call, unbudgeted
//     save      ~1s
//     ────────  ≤255s against a 300s ceiling
//
// So the budget's own ceiling fits. What does not fit is a slow compose or narrate stacked on top of
// a 240s execute. **When that happens Vercel kills the function mid-stream: the response ends with
// no `done` event, and nothing was saved** — `save()` is the last step, so the model tokens are
// spent and no report exists. The client is written to detect a stream that ends without a terminal
// event and say precisely that, because the failure is otherwise indistinguishable from a hang.

import Anthropic from '@anthropic-ai/sdk';
// ⚠️ TEMPORARILY UNWIRED — see the note in the handler below and DECISIONS.md.
// import { locked } from '../lock.js';
import { compose } from '../../../../src/agent/compose.js';
import { build, recordContextDigest } from '../../../../src/agent/context.js';
import { execute, DEFAULT_BUDGET } from '../../../../src/agent/execute.js';
import { narrate, render } from '../../../../src/agent/narrate.js';
import { validate } from '../../../../src/agent/validate.js';
import { analyst } from '../../../../src/config/analysts.js';
import { reportHash } from '../../../../src/domain/canonical.js';
import { recordTitle, save } from '../../../../src/store/reports.js';
// ⚠️ Empty is missing. One guard, shared; was a local copy until 2026-09-09.
import { requiredEnv as env } from '../../../../src/config/env.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** The whole of it. See the arithmetic above — this is the ceiling the budget is measured against. */
export const maxDuration = 300;

/** The analyst this console publishes as — the same one line `scripts/ops/report.ts` carries. */
const ANALYST_ID = 'alpha-1';

export async function POST(request: Request): Promise<Response> {
  // ⚠️ **This spends Anthropic budget.** The doorlock that guarded it is unwired below.
  // ⚠️ **TEMPORARILY UNLOCKED — 2026-09-12.** `locked(request)` used to run here and refuse
  // without the `x-console-secret` header. It is commented out rather than deleted while the
  // frontend is being wired: requiring a pasted secret on every console surface costs more than it
  // protects on a machine no stranger can reach. ⚠️ **`lock.ts` is intact and this is two lines
  // away from coming back.** See `tracking/DECISIONS.md` 2026-09-12 for what puts it back.
  // const refusal = locked(request);
  // if (refusal) return refusal;

  const { directive } = (await request.json().catch(() => ({}))) as { directive?: string };
  const asked = directive?.trim();
  if (!asked) {
    return Response.json({ error: 'a directive is required' }, { status: 400 });
  }

  const t0 = Date.now();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(`${JSON.stringify({ t: Date.now() - t0, ...event })}\n`));

      try {
        const client = new Anthropic({ apiKey: env('ANTHROPIC_API_KEY') });
        emit({
          stage: 'limits', directive: asked, analyst: ANALYST_ID,
          executeBudgetMs: DEFAULT_BUDGET.maxWallClockMs, functionCapMs: 300_000,
        });

        // ── The analyst's own record ────────────────────────────────────────────────────────────
        // ⚠️ **The same four lines `scripts/ops/report.ts` carries, in the same order, against the
        // same `ANALYST_ID` — two callers, one behaviour.** If the CLI and this route supplied
        // different history, two reports written the same day from one directive could see
        // different pasts and nothing would say why.
        //
        // ⚠️ **One `build`, and the same object reaches `compose` and `recordContextDigest`.** The
        // digest answers "what history did this plan see"; rebuilding it after the fact answers a
        // different question.
        //
        // ⚠️ **A database read, and it is small enough not to matter against the ceiling** — one
        // indexed SELECT with `LIMIT 5`, measured at single-digit to low-tens of milliseconds
        // against a generation that takes 34–47 seconds. It is emitted below rather than assumed.
        //
        // ⚠️ **`null` stays silent.** No settled claims means no block and no added prompt bytes.
        const tContext = Date.now();
        const context = await build(analyst(ANALYST_ID).arcAddress);
        emit({
          stage: 'context', status: 'ok', ms: Date.now() - tContext,
          claims: context?.count ?? 0,
          digest: context?.digest ?? null,
          note: context ? undefined : 'no settled claims — the planner sees no record section',
        });

        // ── Plan ────────────────────────────────────────────────────────────────────────────────
        emit({ stage: 'compose', status: 'start' });
        const planned = await compose(asked, client, context);
        if (!planned.ok) {
          // A first-class outcome, not an error: the directive named no answerable question.
          emit({
            stage: 'compose', status: 'stop', outcome: 'clarification',
            missing: planned.clarification.missing, reason: planned.clarification.reason,
            suggestions: planned.clarification.suggestions,
          });
          emit({ stage: 'done', saved: false });
          return;
        }
        emit({
          stage: 'compose', status: 'ok',
          headline: planned.plan.subject.headline, checks: planned.plan.checks,
        });

        // ── Gather ──────────────────────────────────────────────────────────────────────────────
        emit({ stage: 'execute', status: 'start', budgetMs: DEFAULT_BUDGET.maxWallClockMs });
        const ex = await execute({ plan: planned.plan, analystId: ANALYST_ID });
        if (ex.status !== 'completed') {
          // ⚠️ Three of four outcomes are not a report and none may be saved — §5.13.
          emit({
            stage: 'execute', status: 'stop', outcome: ex.status, elapsedMs: ex.elapsedMs,
            detail: ex.status === 'blocked' ? `${ex.figure}: ${ex.reason}`
              : ex.status === 'declined' ? ex.reason
              : `${ex.detail} — the plan is too wide for one run; narrow the directive`,
          });
          emit({ stage: 'done', saved: false });
          return;
        }
        emit({
          stage: 'execute', status: 'ok', elapsedMs: ex.elapsedMs, queries: ex.queries,
          block: ex.draft.block, timings: ex.timings,
        });

        // ── Narrate ─────────────────────────────────────────────────────────────────────────────
        emit({ stage: 'narrate', status: 'start' });
        const { report, title } = await narrate(ex.draft, client);
        const hash = reportHash(report);
        const facts = Object.keys(report.facts).length;
        emit({ stage: 'narrate', status: 'ok', hash, facts });

        // ⚠️ Warns, never blocks — DECISIONS.md 2026-09-08. The report is saved regardless.
        const violations = validate(report);
        emit({
          stage: 'validate', status: violations.length ? 'warn' : 'ok', count: violations.length,
          violations: violations.slice(0, 10).map((v) => `[${v.kind}] ${v.where}: ${v.detail}`),
        });

        // ── Save ────────────────────────────────────────────────────────────────────────────────
        const { inserted } = await save(report);

        // ⚠️ **After `save`, because the row is keyed by the hash and does not exist before it.** A
        // failure between the two leaves the report saved and correct with a null digest, which is
        // **indistinguishable from "no context was supplied"** — that ambiguity is the cost, and it
        // is one `UPDATE` by primary key wide. ⚠️ Re-running is not a faithful repair: `save` is a
        // no-op for a byte-identical report, so a second run records the digest of the block built
        // at THAT moment, which is the right shape and possibly the wrong history.
        //
        // ⚠️ Inside the same `try` as everything else, so a failure here reports as `stage: error`
        // with `saved: false` — which under-reports, since the report IS saved. Said rather than
        // hidden; splitting the catch is a change to this route's error contract and was not asked
        // for.
        await recordContextDigest(hash, context);
        emit({
          stage: 'save', status: 'ok', hash, inserted, facts, block: report.block, title,
          contextDigest: context?.digest ?? null,
          // Not a failure: the hash IS the id, so the same directive at the same block is the
          // same report and `save` is a no-op by design.
          note: inserted ? undefined : 'byte-identical to a report already stored',
          markdownChars: render(report, hash).length,
        });
        emit({ stage: 'done', saved: true, hash });
      } catch (error) {
        emit({ stage: 'error', detail: error instanceof Error ? error.message : String(error) });
        emit({ stage: 'done', saved: false });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-store, no-transform',
      // ⚠️ For any proxy that would otherwise buffer the whole body and defeat the point.
      'x-accel-buffering': 'no',
    },
  });
}

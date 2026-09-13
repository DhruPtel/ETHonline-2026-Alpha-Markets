// POST /api/console/generate — the report pipeline, streamed a stage at a time.
//
// Called by the console's Ask Atlas panel, `app/components/AtlasPanel.tsx`.
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
// ── ⚠️ The function ceiling, stated rather than discovered ───────────────────────────────────────
//
// ⚠️ **This declares 300 seconds and Vercel Hobby silently clamps it to 60.** Only locally is it 300.
//
//     compose   one model call, unbudgeted — ~14–24s, measured 2026-09-12
//     execute   ≤240s  DEFAULT_BUDGET.maxWallClockMs — execute stops ITSELF at this and returns
//                      status 'budget', which is a clean reported outcome, not a crash
//     narrate   one model call, unbudgeted — ~30–45s, measured 2026-09-12
//     save      ~1s
//
// Locally the budget's own ceiling fits unless a slow compose or narrate stacks on a 240s execute.
// Deployed, even a healthy run sits on the line: one took 58.0s and another 60.45s on 2026-09-12
// (lessons.md). **When the function is killed mid-stream the response ends with no `done` event, and
// nothing was saved** — `save()` is the last step, so the model tokens are spent and no report exists.
// `AtlasPanel` treats a stream that ends without `done` as a truncation and says so, because the
// failure is otherwise indistinguishable from a hang. ⚠️ The `limits` event's `functionCapMs` is the
// local 300,000, not the deployed 60,000.

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
/** ⚠️ Clamped to 60 on Vercel Hobby; 300 only locally. See the header. */
export const maxDuration = 300;

/** The analyst this console publishes as — the same one line `scripts/ops/report.ts` carries. */
const ANALYST_ID = 'alpha-1';

export async function POST(request: Request): Promise<Response> {
  // ⚠️ **This spends Anthropic budget, and it is UNLOCKED since 2026-09-12 — open on the public
  // deployment.** `locked(request)` refused without the `x-console-secret` header; it is commented
  // out, not deleted. `../lock.ts` and `tracking/DECISIONS.md` 2026-09-12 say what puts it back.
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
        // ⚠️ **The same calls `scripts/ops/report.ts` makes, in the same order, against the same
        // `ANALYST_ID` — two callers, one behaviour.** If the CLI and this route supplied
        // different history, two reports written the same day from one directive could see
        // different pasts and nothing would say why.
        //
        // ⚠️ **One `build`, and the same object reaches `compose` and `recordContextDigest`.** The
        // digest answers "what history did this plan see"; rebuilding it after the fact answers a
        // different question.
        //
        // ⚠️ **A database read, small against the ceiling** — one SELECT. When it read five rows it
        // measured single-digit to low-tens of milliseconds against a generation of 34–47 seconds;
        // `context.ts build()` now scans up to 200 and filters in memory. The time is emitted below
        // rather than assumed.
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
        // ⚠️ A retry is its own STAGE, not a narrate status. The console renders every `narrate`
        // status other than `start` as "narrate · ok", so a retry there would read as success; an
        // unknown stage prints its raw line, which says exactly what happened.
        const { report, title } = await narrate(ex.draft, client, {
          onRetry: (reason) => emit({ stage: 'narrate-retry', detail: `first attempt abandoned — ${reason}; retrying once` }),
        });
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
        // hidden; splitting the catch would change this route's error contract.
        await recordContextDigest(hash, context);
          // ⚠️ Beside the report, never inside it. A null title — the digit guard rejected it, or
          // the narrator gave none — is a no-op; NULL already means "no title".
          await recordTitle(hash, title);
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

// GET /api/cron/resolve — the analyst settles, on a schedule, with nobody watching.
//
// ⚠️ **THIS CLOSES A4**: *"programmable money flows — conditional, automated, multi-step."* The
// condition is real and nobody triggers it. A market becomes settleable when its observation day has
// ended **and** the subgraph has published a snapshot for that day, and both of those happen to us
// rather than because of us. The scheduled run finding that work and putting the outcome on chain is
// the whole of the claim — **and, like Unit 10, the evidence is the `vercel-cron/1.0` line in the
// Vercel log, not this file.**
//
// **Thin on purpose: auth, find work, call Units 8 and 9, report.** Every check that could stop a
// settlement already lives in `resolve.ts::prepare()` — ten guards, in the contract's own order,
// each one reached off-chain before it could cost gas.
//
// ── ⚠️ THE ORDERING IS THE IRREVERSIBLE PART ─────────────────────────────────────────────────────
//
// `settle()` → `recordSettlement()` → `prepare()` → `resolveMarket()` / `voidMarket()`, and the
// first arrow is the one that matters. `prepare()` takes `evidenceHash` **off the stored row** and
// never recomputes it, so the bytes have to be written before it runs. A route that called
// `prepare()` first would commit 32 bytes on chain to a record nobody kept — and once that hash is
// on chain it cannot be amended. `settle.ts`'s header calls that worse than no evidence at all.
//
// ── ⚠️ Reconciliation, never a cursor ────────────────────────────────────────────────────────────
//
// Vercel's cron delivery is best-effort **in both directions**: a run can silently not happen, and
// the same run can arrive twice. So the question is always *what is outstanding now*, asked from
// scratch — no high-water mark to get wrong. A duplicate delivery is safe because `recordSettlement`
// is idempotent on `market_id`, and because `prepare()` reads the chain before planning: a market
// the previous delivery already settled comes back as `reconcile` and spends nothing.
//
// ── ⚠️ THREE OUTCOMES THAT ARE NOT FAILURES, AND THEY MUST NOT READ AS FAILURES ──────────────────
//
// There is **one scheduled attempt that matters** and an operator reads its output once, at 02:00Z.
// Anything that looks like an error trains them to ignore the line that is one.
//
//   1 · **`SettlementTooEarly`** — the day has not finished, or the indexer is behind the freshness
//       margin. Information about *when we asked*, not about the data. Skip; tomorrow is fine.
//   2 · **`MISSING_OBSERVATION`** — the read succeeded and the day has no row. Recorded as evidence
//       (the record of having looked and found nothing is what defends a void to somebody who was
//       not there), then retried daily, and voided **only** past `resolveDeadline`. `prepare()`
//       owns that deadline comparison, against the chain clock rather than ours.
//   3 · ⚠️ **A market that never landed on chain.** `marketsAwaitingResolve` filters on
//       `resolved_at IS NULL AND voided_at IS NULL AND observation_end <= asOf` and has **no
//       `landed_at` predicate**, so from 2026-09-13T00:00:00Z it returns the seeded store-only
//       market `m/9e1469c4…` alongside markets 6 and 7 — for good, since its staking window shut at
//       23:59Z on the 11th and it can never be committed.
//
// ⚠️ **Case 3 is refused in THIS FILE rather than at `prepare()`'s guard 2, and that is deliberate.**
// The brief expected the refusal to come back from `prepare()`; it would, and it spends nothing
// either way. Two reasons it is better here:
//
//   · **Unit 10 set the precedent one layer up.** `marketsAwaitingCommit` had no `closeTime`
//     predicate, so the commit route checks `closeTime` off the row it already holds rather than
//     modifying `prepare()`. This is the identical shape: the route owns the predicate its find-work
//     query lacks. `Market.chainMarketId` is on the row `marketsAwaitingResolve` already returned.
//   · ⚠️ **It keeps a genuine refusal legible.** `ResolveRefused` carries a sentence and no code, so
//     if guard 2 could fire here, telling it apart from **guard 5 — the stored evidence no longer
//     hashes to the stored hash** — would mean string-matching another module's prose. Getting that
//     wrong reports tamper detection as a routine skip. Refusing case 3 before `prepare()` runs
//     makes guard 2 unreachable from this route, so every `ResolveRefused` that does fire is worth
//     an operator's attention. **That is the same trap that has broken five negative tests this
//     phase: a refusal firing for the wrong reason looks exactly like a passing one.**
//
// It also spares a Graph query and keeps `settlement_evidence` meaning *evidence behind a
// settlement* rather than *a day we happened to read*.
//
// ⚠️ **Case 2 is still classified from this route's own state, not from a message.** After
// `settle()` returns, the run knows `kind === 'MISSING_OBSERVATION'`; a `ResolveRefused` following
// that is guard 8 declining to void early. Nothing is parsed.
//
// ── ⚠️ One market's outcome never decides another's ──────────────────────────────────────────────
//
// Markets 6 and 7 settle in the same run and are independent questions. Every market gets its own
// try/catch, and the run reconciles everything it can reach.
//
// ⚠️ **`maxDuration = 60`, and 60 is the real Hobby ceiling** — a route declaring nothing gets
// roughly ten seconds, and a declared `300` is silently clamped with no API that will say so.
//
// ⚠️ **`resolve.ts::landed()` waits up to 120 seconds for a receipt, which is longer than this
// function may live, and that is survivable rather than fixed.** If the wait is cut off, Circle has
// already sent the transaction and it still lands; what is missing is our `UPDATE`. The next run's
// `prepare()` reads the chain, sees it settled, and returns `action: 'reconcile'` — which is exactly
// the hole Unit 9 built that action for. **So the failure mode of running out of clock is a late
// landmark, never a lost settlement.** Bounding that wait belongs to `resolve.ts`, which this unit
// may not modify.
//
// ── ⚠️ GRADING RUNS HERE, AND IT MAY NEVER FAIL A SETTLEMENT ─────────────────────────────────────
//
// Nothing called `scoreSettled()` before this, so a market could resolve on chain and no grade was
// ever written — and `agent/context.ts`, which tells the next report how the last ones did, reads
// that table and had never had a row. **This route is where the loop closes**, because it is the
// only place that knows a market just settled.
//
// ⚠️ **In its own `try`, after the resolve pass, and its failure is REPORTED rather than thrown.**
// The resolve is the irreversible on-chain act; the grade is derived from it. A scoring bug must not
// turn a settled market into a 500 that reads like the settlement failed. It surfaces as
// `scoring.status: 'failed'` beside a `summary` that still says what settled — **both facts in one
// response**, which is the only way an operator reading this once at 02:00Z can tell them apart.
//
// ⚠️ **AND IT RUNS ON THE NOTHING-OUTSTANDING PATH TOO, which is not an ornament.** Suppose the
// grade fails on the day market 6 resolves. Tomorrow `marketsAwaitingResolve` returns nothing —
// market 6 is settled now — so an early return that skipped grading would strand that failure
// forever, and the cheapest possible bug would cost the record permanently. `scoreSettled()` is
// reconciliation from scratch with no cursor, so running it on the quiet path is what makes a missed
// grade self-heal on the next run. **Every path through this function grades.**
//
// ⚠️ **Budget-guarded for the same reason the resolve loop is.** Grading is database-only and fast,
// but if the resolve pass has already spent its budget, starting it risks the 60-second ceiling
// killing the function before it can answer — and then the operator sees a timeout instead of the
// settlements that did happen. Deferred grading is reported and picked up by the next run; a
// swallowed response is not.

import { NextResponse } from 'next/server.js';
import type { NextRequest } from 'next/server.js';
import { createHash, timingSafeEqual } from 'node:crypto';
import { prepare, resolveMarket, voidMarket } from '../../../../src/arc/resolve.js';
import { scoreSettled } from '../../../../src/arc/score.js';
import { recordSettlement, settle } from '../../../../src/arc/settle.js';
import { validateSpec, type MarketSpec } from '../../../../src/arc/spec.js';
import { marketsAwaitingResolve } from '../../../../src/store/outstanding.js';
import { requiredEnv } from '../../../../src/config/env.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** ⚠️ Stop starting new markets here, leaving the rest for the next run. See `maxDuration`. */
const BUDGET_MS = 45_000;

/**
 * ⚠️ **Compared as digests, so the check does not leak the secret's length.** `timingSafeEqual`
 * throws on a length mismatch, which on a raw comparison would be an oracle for exactly that.
 */
function authorized(header: string | null, secret: string): boolean {
  const sha = (s: string) => createHash('sha256').update(s).digest();
  return timingSafeEqual(sha(header ?? ''), sha(`Bearer ${secret}`));
}

interface Result {
  readonly marketId: string;
  /** ⚠️ `skipped` is a normal day. `refused` and `error` are the two worth reading. */
  readonly status: 'resolved' | 'voided' | 'reconciled' | 'skipped' | 'refused' | 'deferred' | 'error';
  readonly chainMarketId?: string;
  readonly observedDay?: string;
  readonly outcome?: boolean | null;
  readonly observed?: string | null;
  readonly txHash?: string | null;
  readonly detail?: string;
}

/**
 * ⚠️ **`claims` is claims GRADED, not rows changed.** `scoreSettled()` returns every claim it
 * examined and `record()` is idempotent, so a run over already-graded claims reports the same count
 * while writing nothing. The count answers *how much was reconciled*, never *how much moved*.
 */
type Scoring =
  | { readonly status: 'graded'; readonly claims: number }
  | { readonly status: 'deferred'; readonly detail: string }
  | { readonly status: 'failed'; readonly detail: string };

/**
 * Grade every settled market. ⚠️ **Cannot throw** — see the header. A failure here is a fact in the
 * response beside the settlements, never an exception that buries them.
 */
async function grade(started: number): Promise<Scoring> {
  if (Date.now() - started > BUDGET_MS) {
    return {
      status: 'deferred',
      detail: 'the resolve pass used this invocation\'s budget. `scoreSettled()` is reconciliation '
        + 'from scratch, so the next run grades what settled today.',
    };
  }
  try {
    return { status: 'graded', claims: (await scoreSettled()).length };
  } catch (e) {
    return {
      status: 'failed',
      detail: `${(e as Error).message} — ⚠️ the settlements above still landed on chain and are `
        + 'recorded. Only the derived grade is missing, and the next run rewrites it from scratch.',
    };
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const started = Date.now();

  // ⚠️ `requiredEnv`, because `process.env.CRON_SECRET ?? x` falls back on undefined and NEVER on
  // the empty string — a blank value would sail through and compare equal to a missing one.
  const secret = requiredEnv('CRON_SECRET', 'Vercel sends it as `Authorization: Bearer …` on every cron invocation.');
  if (!authorized(request.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // ⚠️ One clock for the whole run, and it is only used to ASK the question. Every comparison that
  // decides a spend — the freshness margin, the resolve deadline, `observationEnd` — is made against
  // the subgraph's `_meta` or the chain's latest block, never against this.
  const asOf = new Date(started);
  const outstanding = await marketsAwaitingResolve(asOf);

  // ⚠️ **Nothing outstanding is the normal case and is not an error** — it is every day but two, and
  // it is Saturday's rehearsal of this exact path with no money at stake.
  if (outstanding.length === 0) {
    // ⚠️ **Grades anyway.** A grade that failed on the day a market settled would never be retried
    // if this path skipped it — the market is settled by then, so it is never outstanding again.
    return NextResponse.json({
      ok: true, asOf: asOf.toISOString(), outstanding: 0, results: [],
      summary: { resolved: 0, voided: 0, reconciled: 0, skipped: 0, refused: 0, deferred: 0, errors: 0 },
      scoring: await grade(started),
      note: 'no market is past its observation end and still unsettled.',
      ms: Date.now() - started,
    });
  }

  const results: Result[] = [];
  for (const market of outstanding) {
    const base = { marketId: market.id, observedDay: market.observedDay } as const;

    // ⚠️ Declared out here so the catch can tell a retryable refusal from one worth reading, from
    // what this run actually saw rather than from the text of a message. See the header.
    let settlementKind: 'settled' | 'MISSING_OBSERVATION' | null = null;

    if (Date.now() - started > BUDGET_MS) {
      // ⚠️ Deferred, not failed. The next run asks the same question from scratch and finds this
      // market still outstanding — which is the whole point of reconciliation.
      results.push({ ...base, status: 'deferred', detail: 'ran out of budget for this invocation.' });
      continue;
    }

    try {
      // ⚠️ **THE NEVER-LANDED SKIP. See the header — this is why it is here and not at guard 2.**
      // Without it the one run that matters reports an error beside two good settlements, every day,
      // for a market that can never be settled because it was never created.
      if (!market.chainMarketId) {
        results.push({
          ...base, status: 'skipped',
          detail: 'createMarket never landed for this market, so there is nothing on chain to settle. '
            + 'Unit 7 owns getting it there; nothing here can.',
        });
        continue;
      }

      // ⚠️ Validated rather than cast. The stored bytes are the question this market was created
      // for, and a spec that no longer validates must stop the settlement rather than settle a
      // subject `spec.ts` would now refuse.
      const spec: MarketSpec = validateSpec(JSON.parse(market.specJson) as Omit<MarketSpec, 'schema'>);

      // 1 · Read the day. ⚠️ Throws `SettlementTooEarly` when the day is unfinished or the indexer
      //     is behind the freshness margin — caught below as a skip, because it says nothing about
      //     the data and everything about when we asked.
      const settlement = await settle(spec);
      settlementKind = settlement.kind;

      // 2 · ⚠️ **Persist before anything can go on chain.** R10, and the irreversible half.
      await recordSettlement(market.id, settlement);

      // 3 · Every remaining guard, all free, none of them spending.
      const plan = await prepare(market.id);

      if (plan.action === 'void') {
        const sent = await voidMarket(plan);
        results.push({
          ...base, status: 'voided', chainMarketId: plan.chainMarketId,
          outcome: null, observed: null, txHash: sent.txHash, detail: plan.reason,
        });
        continue;
      }

      // ⚠️ `resolveMarket` handles `reconcile` itself: it writes the landmark from what the chain
      // says and submits nothing. The null `txHash` is what distinguishes the two here.
      const sent = await resolveMarket(plan);
      results.push({
        ...base,
        status: plan.action === 'reconcile' ? 'reconciled' : 'resolved',
        chainMarketId: plan.chainMarketId, outcome: plan.outcome,
        observed: plan.observedValue, txHash: sent.txHash, detail: plan.reason,
      });
    } catch (e) {
      const err = e as Error;

      // ⚠️ Not a failure: the day is not finished, or the indexer has not caught up to the margin.
      if (err.name === 'SettlementTooEarly') {
        results.push({ ...base, status: 'skipped', detail: err.message });
        continue;
      }

      // ⚠️ Not a failure either, and classified from THIS run's state rather than from the message.
      // A `ResolveRefused` reached after a MISSING_OBSERVATION settlement is guard 8 declining to
      // void before `resolveDeadline`, which is the rule working: the indexer may still catch up.
      // Any other refusal — tampered evidence, a missing contract address, a resolver mismatch —
      // is a thing a person has to look at, and reports as `refused` so it is visible.
      if (err.name === 'ResolveRefused') {
        const retryable = settlementKind === 'MISSING_OBSERVATION';
        results.push({ ...base, status: retryable ? 'skipped' : 'refused', detail: err.message });
        continue;
      }

      results.push({ ...base, status: 'error', detail: err.message });
    }
  }

  const count = (s: Result['status']) => results.filter((r) => r.status === s).length;
  const summary = {
    resolved: count('resolved'), voided: count('voided'), reconciled: count('reconciled'),
    skipped: count('skipped'), refused: count('refused'), deferred: count('deferred'),
    errors: count('error'),
  };

  // ⚠️ **After every settlement and outside the loop.** One sweep grades everything that has ever
  // settled, so a market this run resolved and a market an earlier run resolved without grading are
  // the same case. A void scores `forecast_correct = null` in `score.ts` — neither right nor wrong —
  // and nothing here overrides that.
  const scoring = await grade(started);

  return NextResponse.json({
    ok: true, asOf: asOf.toISOString(), outstanding: outstanding.length, summary, scoring, results,
    ms: Date.now() - started,
  });
}

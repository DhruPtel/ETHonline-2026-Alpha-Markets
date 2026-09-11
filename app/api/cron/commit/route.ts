// GET /api/cron/commit — the analyst commits, on a schedule, with nobody watching.
//
// ⚠️ **THIS CLOSES A2, WHICH IS PASS/FAIL ON ALL THREE ARC PRIZES**: *"Agent's `commitPrediction`
// is payable and unattended."* Everything else the analyst does is triggered by a person typing a
// command. This is the route that makes it fire on a schedule, and **the Vercel log showing a
// `vercel-cron/1.0` request is the evidence** — not this file.
//
// **Thin on purpose: auth, find work, call Unit 7, report.** Every refusal that matters already
// lives in `market.ts::prepare()` — the report loads and passes its own hash check, the metric is
// legal, the threshold is a decimal string, staking closes before the observed day, Unit 6c's
// admission check binds the claim to an issued token, and the analyst identity resolves. ⚠️ **A cron
// that skipped `prepare()` would be a cron that spends on a claim nobody verified.**
//
// ── ⚠️ Reconciliation, never "since I last ran" ──────────────────────────────────────────────────
//
// Vercel's cron delivery is best-effort **in both directions**: a run can silently not happen, and
// the same run can be delivered twice. So the question asked here is always *what is outstanding
// now*, from scratch — which is why the module is `store/outstanding.ts` rather than `cron.ts`, and
// why there is no cursor and no high-water mark to get wrong. A duplicate delivery is safe for the
// same reason: `create()` returns a market that already landed instead of creating a second one, and
// `commit()` returns a claim that already landed instead of staking twice.
//
// ── ⚠️ Two inputs `prepare()` needs that a market row does not carry ─────────────────────────────
//
// `marketsAwaitingCommit` returns the question, the times and the contract. It does **not** return
// which report justifies the claim, or how much to stake, and neither is anywhere in `store/` or
// `config/`. `market.ts` says so deliberately — *"No default — nobody commits a default stake
// size."* Both decisions are therefore made here, in the open:
//
//   **the report** — the newest tokenized report carrying a fact for this market's metric.
//   ⚠️ The pick is *verified rather than trusted*: `prepare()` refuses an untokenized report at
//   Unit 6c's admission check, and `decideSide` refuses a report with no fact for the metric. If
//   this query is wrong the run refuses; it cannot commit against a report that does not qualify.
//   This is also the "agent decides" half of the design — a human directs the *market*, and the
//   analyst chooses which of its own published work backs the claim.
//
//   **the stake** — a constant, below. A configurable one would be a sixth environment variable that
//   can be present-but-blank, and this project has shipped that bug five times plus once inside a
//   vendor bundle. A constant cannot fail at runtime and is one line to change.
//
// ⚠️ **`maxDuration = 60`, and 60 is the real ceiling.** A route that declares nothing gets roughly
// ten seconds — `app/api/reports/[hash]` ran on that default against a measured 8.6-second settle
// until someone noticed — and a declared `300` is **silently clamped** on Hobby with no API that
// will tell you. The budget below stops starting new markets before the ceiling rather than being
// killed mid-submit.

import { NextResponse } from 'next/server.js';
import type { NextRequest } from 'next/server.js';
import { createHash, timingSafeEqual } from 'node:crypto';
import { analystIdentity } from '../../../../src/arc/arc.js';
import { commit, create, prepare } from '../../../../src/arc/market.js';
import { marketsAwaitingCommit } from '../../../../src/store/outstanding.js';
import { load } from '../../../../src/store/reports.js';
import { db } from '../../../../src/store/db.js';
import { requiredEnv } from '../../../../src/config/env.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** 0.01 USDC at 18-dp — a whole 6-dp unit, and the stake markets 6 and 7 carry. See the header. */
const STAKE = '10000000000000000';

/** ⚠️ Stop starting new markets here, leaving the rest for the next run. See `maxDuration`. */
const BUDGET_MS = 45_000;

/** How many recent tokenized reports to consider before giving up on finding a qualifying one. */
const REPORT_CANDIDATES = 10;

interface Spec { slug: string; metric: string }

/**
 * ⚠️ **Compared as digests, so the check does not leak the secret's length.** `timingSafeEqual`
 * throws on a length mismatch, which on a raw comparison would be an oracle for exactly that.
 */
function authorized(header: string | null, secret: string): boolean {
  const sha = (s: string) => createHash('sha256').update(s).digest();
  return timingSafeEqual(sha(header ?? ''), sha(`Bearer ${secret}`));
}

/** The newest tokenized report that measured this market's metric, or null. */
async function reportFor(spec: Spec): Promise<string | null> {
  const rows = await db()<{ hash: string }[]>`
    SELECT r.hash FROM reports r JOIN report_tokens rt ON rt.report_hash = r.hash
    ORDER BY r.created_at DESC LIMIT ${REPORT_CANDIDATES}`;
  for (const row of rows) {
    // ⚠️ `load` throws when stored JSON no longer canonicalizes to its own hash. That is not a
    // report with a caveat, it is a report whose identity is unknown — let it reach the per-market
    // catch below rather than quietly trying the next one.
    const report = await load(row.hash);
    if (report?.facts[`${spec.slug}.${spec.metric}`]) return row.hash;
  }
  return null;
}

interface Result {
  readonly marketId: string;
  readonly status: 'committed' | 'already' | 'refused' | 'deferred' | 'error';
  readonly chainMarketId?: string;
  readonly chainClaimId?: string;
  readonly side?: boolean;
  readonly detail?: string;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const started = Date.now();

  // ⚠️ `requiredEnv`, because `process.env.CRON_SECRET ?? x` falls back on undefined and NEVER on
  // the empty string — a blank value would sail through and compare equal to a missing one.
  const secret = requiredEnv('CRON_SECRET', 'Vercel sends it as `Authorization: Bearer …` on every cron invocation.');
  if (!authorized(request.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const identity = await analystIdentity();
  const outstanding = await marketsAwaitingCommit(identity.address);

  // ⚠️ **No work is the normal case on most days and is not an error.** A run that reports a clean
  // zero is the cron working; anything that looked like a failure here would train an operator to
  // ignore the one that matters.
  if (outstanding.length === 0) {
    return NextResponse.json({
      ok: true, analyst: identity.address, outstanding: 0, results: [],
      note: 'nothing directed at this analyst is awaiting a commit.',
      ms: Date.now() - started,
    });
  }

  const results: Result[] = [];
  for (const market of outstanding) {
    if (Date.now() - started > BUDGET_MS) {
      // ⚠️ Deferred, not failed. The next scheduled run asks the same question from scratch and
      // finds this market still outstanding — which is the whole point of reconciliation.
      results.push({ marketId: market.id, status: 'deferred', detail: 'ran out of budget for this invocation' });
      continue;
    }
    try {
      // ⚠️ **A CLOSED MARKET IS REFUSED HERE, AND WITHOUT THIS THE CRON BURNS GAS DAILY FOREVER.**
      // `marketsAwaitingCommit` has no `closeTime` predicate and `prepare()` has no past-close
      // refusal — step 3 checks `closeTime <= dayStart(observedDay)`, never `closeTime > now`. So a
      // market whose window shut before a run reached it stays outstanding for good, and every run
      // would `create()` it on chain (spending) and then revert `StakingClosed` on `commit()`
      // (spending again). The contract already knows the answer; paying to hear it is the waste.
      //
      // ⚠️ Refused rather than hidden: the row stays outstanding and visible, and nothing is spent.
      if (market.closeTime.getTime() <= Date.now()) {
        results.push({
          marketId: market.id, status: 'refused',
          detail: `staking closed at ${market.closeTime.toISOString()}; the contract would revert StakingClosed.`,
        });
        continue;
      }

      const spec = JSON.parse(market.specJson) as Spec;
      const reportHash = await reportFor(spec);
      if (!reportHash) {
        results.push({
          marketId: market.id, status: 'refused',
          detail: `no tokenized report measures ${spec.slug}.${spec.metric}, so nothing can justify this claim.`,
        });
        continue;
      }

      const plan = await prepare({
        reportHash,
        spec: JSON.parse(market.specJson) as Parameters<typeof prepare>[0]['spec'],
        closeTime: Math.floor(market.closeTime.getTime() / 1000),
        resolveDeadline: Math.floor(market.resolveDeadline.getTime() / 1000),
        amount: STAKE,
      });

      // ⚠️ Both are idempotent and both are the reason a duplicate delivery is safe: a market that
      // already landed is returned rather than created, and so is a claim.
      const created = await create(plan);
      const committed = await commit(plan, created.chainMarketId);

      results.push({
        marketId: market.id,
        status: committed.alreadyLanded ? 'already' : 'committed',
        chainMarketId: created.chainMarketId,
        chainClaimId: committed.chainClaimId,
        side: plan.decision.side,
        detail: plan.decision.reason,
      });
    } catch (e) {
      const err = e as Error;
      // ⚠️ A refusal is the safety working; an error is the route failing. They are reported
      // differently so a log reader can tell them apart, and one market's outcome never stops the
      // others — the run still reconciles everything it can reach.
      const refused = err.name === 'MarketRefused' || err.name === 'BindingRefused';
      results.push({ marketId: market.id, status: refused ? 'refused' : 'error', detail: err.message });
    }
  }

  return NextResponse.json({
    ok: true, analyst: identity.address, outstanding: outstanding.length, results,
    ms: Date.now() - started,
  });
}

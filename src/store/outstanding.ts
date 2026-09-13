// What work is still outstanding, asked from scratch every time.
//
// ⚠️ **Named for what it holds, not for who calls it.** The obvious name was `cron.ts` and it would
// have been wrong on arrival: both paths were driven by hand before any cron existed. A file named
// after one caller has to be renamed or lied about the moment a second one appears. Today the callers
// are `app/api/cron/commit`, `app/api/cron/resolve` and `scripts/demo/markets-schema.ts`.
//
// ⚠️ **Split out of `markets.ts`, unchanged** — same SQL, same parameters, same return type. The row
// type and mapper still belong to `markets.ts`, which is why they are imported rather than copied.
// A second `toMarket` would be a second answer to what a market row means.
//
// ⚠️ **This module does NOT re-export `close()`.** There is one pooled client for the whole app
// (`db.ts`), and `markets.ts` already re-exports its closer for scripts.
//
// ⚠️ **Reconciliation, never "since I last ran".** Both queries ask what is outstanding *now*,
// from scratch. Vercel's cron delivery is best-effort in both directions — a run can silently not
// happen, and the same run can arrive twice — so a high-water mark would either skip work that was
// never done or redo work that was. That property is the reason these two sit together.

import { db } from './db.js';
import { type Market, type MarketRow, toMarket } from './markets.js';

/**
 * ⚠️ **The commit cron's find-work query (`app/api/cron/commit`), and the reason it is a LEFT JOIN.**
 * Markets a human directed at this analyst that the analyst has no claim on yet. `reports.ts`'s
 * `list()` cannot express this, and bending it to would make the reports store import the market
 * schema.
 *
 * ⚠️ Asked from scratch (see the header), so a row with a claim that has not landed counts as taken:
 * starting it again would be a second commit and a second spend.
 */
export async function marketsAwaitingCommit(analyst: string): Promise<Market[]> {
  const rows = await db()<MarketRow[]>`
    SELECT m.id, m.spec_hash, m.spec_json, m.observed_day, m.close_time, m.observation_end,
           m.resolve_deadline, m.directed_at, m.contract_address, m.chain_market_id, m.landed_at,
           m.resolved_at, m.voided_at, m.outcome, m.evidence_hash, m.voided_by, m.void_tx,
           m.created_at
    FROM markets m
    LEFT JOIN claims c ON c.market_id = m.id AND c.author = ${analyst}
    WHERE m.directed_at = ${analyst}
      AND c.id IS NULL
      AND m.voided_at IS NULL
    ORDER BY m.created_at`;
  return rows.map(toMarket);
}

/**
 * ⚠️ **The resolve cron's find-work query (`app/api/cron/resolve`).** Past `observation_end`,
 * neither resolved nor voided. `markets_unresolved_idx` is this predicate exactly.
 *
 * ⚠️ `asOf` is a parameter rather than `now()` so a caller can ask the question at a stated instant.
 * The freshness rule (§5.16) is about `_meta.block.timestamp`, not about when this query ran, and a
 * settlement that mixes the two is how a market resolves on data from before the day it measures.
 */
export async function marketsAwaitingResolve(asOf: Date): Promise<Market[]> {
  const rows = await db()<MarketRow[]>`
    SELECT id, spec_hash, spec_json, observed_day, close_time, observation_end, resolve_deadline,
           directed_at, contract_address, chain_market_id, landed_at, resolved_at, voided_at,
           outcome, evidence_hash, voided_by, void_tx, created_at
    FROM markets
    WHERE resolved_at IS NULL AND voided_at IS NULL AND observation_end <= ${asOf}
    ORDER BY observation_end`;
  return rows.map(toMarket);
}

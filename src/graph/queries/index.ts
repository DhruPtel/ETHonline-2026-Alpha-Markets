// The menu. The agent selects a document by id and supplies variables; it never writes
// GraphQL, which is what removes the class of failure where a model emits a field that does
// not exist on a deployment (PLAN-v4 §5.6).

import { BALANCE_SHEET } from './balance-sheet.js';
import { MARKETS } from './markets.js';
import { FINANCIAL_SNAPSHOTS } from './snapshots.js';

export const DOCUMENTS = {
  'balance-sheet': BALANCE_SHEET,
  markets: MARKETS,
  'financial-snapshots': FINANCIAL_SNAPSHOTS,
} as const;

export type DocumentId = keyof typeof DOCUMENTS;
export const DOCUMENT_IDS = Object.keys(DOCUMENTS) as DocumentId[];

/**
 * What each document returns, in the planner's terms. **Kept beside the registry on purpose** — a
 * catalogue that lives in the prompt drifts from the documents it describes, and a planner that
 * cannot see what a document returns cannot choose it. Until 2026-09-07 the planner was shown three
 * bare names and never once picked `markets`, even when a directive asked for markets outright.
 */
export const DOCUMENT_BRIEF: Record<DocumentId, string> = {
  'balance-sheet': 'ONE ROW PER DEPLOYMENT — protocol totals only: deposits, borrows, TVL, lifetime flows, lifetime revenue. One query per deployment. Answers any question at the level of the protocol as a whole.',
  markets: 'ONE ROW PER MARKET INSIDE A DEPLOYMENT — each market\'s own name, collateral token, deposits, borrows, lifetime flows, LTV and rates. The only way to see what is inside a deployment rather than its total. Walked to exhaustion at one query per 250 markets, so a deployment with 63 markets costs one query and one with 1,700 costs seven.',
  'financial-snapshots': 'ONE ROW PER DAY for a deployment, over a window supplied as startTimestamp and endTimestamp (unix seconds). Daily history rather than current state.',
};

export * from './balance-sheet.js';
export * from './markets.js';
export * from './snapshots.js';

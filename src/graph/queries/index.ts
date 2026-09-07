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

export * from './balance-sheet.js';
export * from './markets.js';
export * from './snapshots.js';

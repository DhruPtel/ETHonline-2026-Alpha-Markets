// Every Ethereum lending deployment we might query, in one place. Nothing downstream
// hardcodes a subgraph ID; adding a protocol is adding a row, which is the G1.5 demo.
//
// Source: Messari's `deployment/deployment.json` (github.com/messari/subgraphs), read
// 2026-09-06. The 27 Messari rows are every Ethereum `lending` deployment with BOTH
// `status: prod` AND a decentralized-network query-id. Four Ethereum lending entries are
// excluded because they are `dev`: morpho-blue-ethereum, silo-finance-ethereum and
// synthetix-ethereum have no decentralized query-id at all, and notional-finance-ethereum
// has one but is not prod. IDs are copied from that file, never transcribed by hand.
//
// The 28th row, morpho-blue, is not Messari's — Morpho publish it themselves on Messari's
// standardized template. Messari's own morpho-blue-ethereum entry is a different thing: dev
// status, schema 3.2.0, unpublished.

import type { RevenueAvailability } from '../types/wire.js';

/** ISO 8601 calendar date, `YYYY-MM-DD`. We know the day we swept, not the second. */
export type IsoDate = string;

/** Messari's `LendingType` enum. Not in `deployment.json` — see `lendingType` below. */
export type LendingType = 'POOLED' | 'CDP';

/** Filled by the sweep. Every row we have not queried says `untested` and asserts nothing else. */
export type DeploymentStatus = 'untested' | 'live' | 'lagging' | 'no_indexers' | 'error';

/**
 * Whether this deployment's numbers could back a published figure, from `scripts/triage-protocols.ts`.
 *
 * ⚠️ Not the same question as `status`. `status` asks whether it ANSWERS; this asks whether it is
 * RIGHT. aave-v3 answers beautifully and its cumulative revenue reads $2.79e17.
 *
 * | verdict | meaning |
 * |---|---|
 * | `publishable` | reconciles against an external reference, arithmetic holds, history present |
 * | `flagged` | answers, but something is wrong — the reasons live in `docs/protocol-inventory.md` |
 * | `unusable` | cannot back a published figure: impossible arithmetic, a broken external gap, or nothing in it |
 */
export type TriageVerdict = 'publishable' | 'flagged' | 'unusable';

/**
 * How to reach the chain for a corroboration check on this deployment FAMILY.
 *
 * ⚠️ A hint, not a promise. SM-04 established corroboration is decided PER MARKET, not per
 * deployment — compound-v3 carries the write-time field on 3 of its 10 largest markets and
 * `null` on the rest. Config says "this family may expose it"; whether a given market
 * actually does is decided at query time in `corroborate.ts`, which returns `not_checked`
 * where it does not.
 */
export interface CorroborationHint {
  /**
   * The subgraph field naming the block at which the balance was last written. The whole
   * check depends on reading the chain at THAT block rather than at `_meta.block` — an Aave
   * aToken accrues ~31.5 USDC per block from `block.timestamp`, so comparing at the indexing
   * head passes or fails on whether an event happened to land there (SM-04, PLAN-v4 §5.14).
   */
  readonly writeTimeField: string;
  /** How to find the contract to call, as a path through the subgraph. `null` = not established. */
  readonly contractSource: string | null;
  /** The accessor to `eth_call`. `null` = not established; do not guess one. */
  readonly method: string | null;
}

export interface ProtocolConfig {
  readonly slug: string;
  readonly subgraphId: string;
  readonly network: 'ethereum';
  /**
   * ⚠️ What Messari's config DECLARES, which is not authoritative. `adapter.ts` dispatches on
   * the `schemaVersion` the deployment reports LIVE, never on this. This field is for knowing
   * what we expected, so a disagreement is visible instead of silent.
   */
  readonly declaredSchemaVersion: string;
  /**
   * The `schemaVersion` the deployment actually SERVES, measured by `scripts/sweep-protocols.ts`.
   * `null` where the deployment did not answer. This is the value `adapter.ts` dispatch must
   * agree with; `declaredSchemaVersion` is only what Messari's config claimed.
   */
  readonly liveSchemaVersion: string | null;
  /**
   * ✅ **Measured 2026-09-07**, not assumed. `lendingType` is absent from `deployment.json`, so
   * Unit 2 left it null on all 28 rows rather than fill it from domain knowledge — a value from
   * a model's memory is indistinguishable later from one that came from a query. Unit 4's
   * introspection found it in the five-version intersection, so the sweep now reads it live.
   * `null` means the deployment did not answer, never "we did not bother".
   *
   * ⚠️ **`CDP` changes what reconciliation means.** Deposits − borrows against an external TVL
   * is a POOLED convention; on a CDP the two sides are not the same quantity, so triage records
   * `NOT_CHECKED` there rather than a passing number.
   */
  readonly lendingType: LendingType | null;
  /** Per-deployment, from SM-03's revenue sweep. `null` = not swept. */
  readonly revenueAvailability: RevenueAvailability | null;
  /** What this deployment means by the standard field names, where it differs. */
  readonly semanticNotes: string | null;
  readonly corroborationHint: CorroborationHint | null;
  readonly status: DeploymentStatus;
  /** `null` where the deployment did not answer, so triage had nothing to judge. */
  readonly triageVerdict: TriageVerdict | null;
  readonly lastSwept: IsoDate | null;
}

// ─── The five Phase 0 measured ───────────────────────────────────────────────────────────

export const PROTOCOLS: readonly ProtocolConfig[] = [
  {
    slug: 'aave-v3-ethereum',
    subgraphId: 'JCNWRypm7FYwV8fx5HhzZPSFaMxgkPuw4TnR3Gpi81zk',
    network: 'ethereum',
    declaredSchemaVersion: '3.1.0',
    liveSchemaVersion: '3.1.0',
    lendingType: 'POOLED',
    revenueAvailability: 'poisoned',
    semanticNotes:
      'The flagship at $24.8B, and its revenue is unusable. One day in Jul 2024 booked ' +
      '$1.63e15 and the cumulative never recovered; 38 recurrences since, most recently ' +
      '2026-08-19. Not one bad event that could be subtracted out — a recurring mapping ' +
      'fault, so a corrected cumulative would go stale at the next firing. Balances and ' +
      'flows are clean across 1,300+ days; only revenue is wrong (SM-03).',
    corroborationHint: {
      writeTimeField: 'indexLastUpdatedTimestamp',
      contractSource: 'market.outputToken.id',
      method: 'totalSupply()',
    },
    status: 'live', triageVerdict: 'flagged',
    lastSwept: '2026-09-07',
  },
  {
    slug: 'aave-v2-ethereum',
    subgraphId: 'C2zniPn45RnLDGzVeGZCx2Sw3GXrbc9gL4ZfL8B8Em2j',
    network: 'ethereum',
    declaredSchemaVersion: '3.1.0',
    liveSchemaVersion: '3.1.0',
    lendingType: 'POOLED',
    revenueAvailability: 'usable',
    semanticNotes:
      'Byte-identical schema to aave-v3, which is what makes this pair the G1.5 claim. ' +
      'But it is a WOUND-DOWN deployment at $97M against v3\'s $24.8B — fine as a data ' +
      'source, misleading if a report presents the two as peers. Its write-time field sat ' +
      '8,285 blocks / 27.7 hours behind the indexing head, which is the strongest single ' +
      'argument for archive access in the project (SM-04).',
    corroborationHint: {
      writeTimeField: 'indexLastUpdatedTimestamp',
      contractSource: 'market.outputToken.id',
      method: 'totalSupply()',
    },
    status: 'live', triageVerdict: 'publishable',
    lastSwept: '2026-09-07',
  },
  {
    slug: 'compound-v3-ethereum',
    subgraphId: 'AwoxEZbiWLvv6e3QdvdMZw4WDURdGbvPfHmZRc8Dpfz9',
    network: 'ethereum',
    declaredSchemaVersion: '3.1.0',
    liveSchemaVersion: '3.1.0',
    lendingType: 'POOLED',
    revenueAvailability: 'usable',
    semanticNotes:
      '$1.88B. The deployment that made corroboration a per-market capability: of its ten ' +
      'largest markets, the three base-asset ones carry a write-time timestamp and the seven ' +
      'collateral-only ones are null (SM-04).',
    corroborationHint: {
      writeTimeField: 'indexLastUpdatedTimestamp',
      // SM-04 surveyed field PRESENCE here; it never ran the eth_call, so the accessor is
      // not established. Leaving these null rather than assuming Aave's pattern transfers.
      contractSource: null,
      method: null,
    },
    status: 'live', triageVerdict: 'publishable',
    lastSwept: '2026-09-07',
  },
  {
    slug: 'compound-v2-ethereum',
    subgraphId: '4TbqVA8p2DoBd5qDbPMwmDZv3CsJjWtxo8nVSqF2tA9a',
    network: 'ethereum',
    declaredSchemaVersion: '2.0.1',
    liveSchemaVersion: '2.0.1',
    lendingType: 'POOLED',
    revenueAvailability: 'usable',
    semanticNotes:
      '$117M. The version-gap proof — the same document, one schema version behind, so any ' +
      'document touching 3.x-only fields must omit them or dispatch on the live version. ' +
      'Has no balance write-time field at all: `_rewardLastUpdatedTimestamp` is a rewards ' +
      'field and using it would be inventing a check rather than performing one (SM-04).',
    // No write-time field exists, so there is nothing to hint at. Corroboration on this
    // deployment is `not_checked`, and that is the honest answer rather than a weaker check.
    corroborationHint: null,
    status: 'live', triageVerdict: 'publishable',
    lastSwept: '2026-09-07',
  },
  {
    slug: 'morpho-blue',
    subgraphId: '8Lz789DP5VKLXumTMTgygjU2xtuzx8AhbaacgN5PYCAs',
    network: 'ethereum',
    // Not from deployment.json — this is what the deployment reports live (SM-02).
    declaredSchemaVersion: '3.0.0',
    liveSchemaVersion: '3.0.0',
    lendingType: 'POOLED',
    revenueAvailability: 'not_tracked',
    semanticNotes:
      'NOT a Messari deployment — Morpho publish it on Messari\'s standardized template, ' +
      'which is why it takes our documents unchanged and is the only 3.0.0 we have. It uses ' +
      'the standard field names and means different things by them: `inputToken` is the ' +
      'COLLATERAL token, `inputTokenBalance` is the LOAN, and collateral is absent from TVL ' +
      '— headline $13.06B against ~$3.65B plausible, inflated 3.6x. 28 markets report ' +
      'deposits exactly equal to borrows (100% utilisation, the marker). Revenue was never ' +
      'written: 0 across 977 snapshots. The oracle guard `inputTokenPriceUSD == 0 && ' +
      'inputTokenBalance > 0` is a DATA_ERROR on Aave and a FALSE POSITIVE here 337 times ' +
      'over, because the price is the collateral\'s and the balance is the loan\'s. And it ' +
      'disagrees with its own contract on 2 of 3 top markets, identically at both blocks so ' +
      'not drift, one difference exactly -10,000,000. CAUSE NOT ESTABLISHED — do not build ' +
      'on Morpho balances until it is.',
    corroborationHint: {
      writeTimeField: 'lastUpdate',
      // The Morpho Blue singleton address is not recorded anywhere in this repo, so it is
      // not written here. SM-04 reached it through a throwaway path.
      contractSource: null,
      method: 'market(bytes32).totalSupplyAssets',
    },
    status: 'live', triageVerdict: 'unusable',
    lastSwept: '2026-09-07',
  },

  // ─── The 23 Messari deployments we have not queried ────────────────────────────────────
  // `status: 'untested'` and nothing else asserted. We do not know their revenue
  // availability, their semantics or their lending type, and a plausible guess in this table
  // is worse than a null — it would be indistinguishable from a measurement.

  { slug: 'aave-amm-ethereum', subgraphId: '41ooPWnDYKwckqyG1mvg7ZEndy5zMemXinx6uQxscrBS',
    network: 'ethereum', declaredSchemaVersion: '3.1.0', lendingType: 'POOLED',
    liveSchemaVersion: '3.1.0',
    revenueAvailability: null, semanticNotes: null, corroborationHint: null,
    status: 'live', lastSwept: '2026-09-07', triageVerdict: 'flagged' },
  { slug: 'aave-arc-ethereum', subgraphId: '5hyqnEzjZbwFBU1rk4JBknCeiF2Mj93qBzsyQfpAa3QA',
    network: 'ethereum', declaredSchemaVersion: '3.1.0', lendingType: 'POOLED',
    liveSchemaVersion: '3.1.0',
    revenueAvailability: null, semanticNotes: null, corroborationHint: null,
    status: 'live', lastSwept: '2026-09-07', triageVerdict: 'flagged' },
  { slug: 'aave-rwa-ethereum', subgraphId: 'C8ynQrjVKcmqxb9fWrLvSCBFNf2ChFkxCg7Q8gknJrza',
    network: 'ethereum', declaredSchemaVersion: '3.1.0', lendingType: 'POOLED',
    liveSchemaVersion: '3.1.0',
    revenueAvailability: null, semanticNotes: null, corroborationHint: null,
    status: 'live', lastSwept: '2026-09-07', triageVerdict: 'flagged' },
  { slug: 'abracadabra-ethereum', subgraphId: 'GLAu42kvVs7ixfXcmkAsRiS7Xt1NCpgkKsnz3qiriuvV',
    network: 'ethereum', declaredSchemaVersion: '2.0.1', lendingType: null,
    liveSchemaVersion: null,
    revenueAvailability: null, semanticNotes: null, corroborationHint: null,
    status: 'no_indexers', lastSwept: '2026-09-07', triageVerdict: null },
  { slug: 'cream-finance-ethereum', subgraphId: '43NeT7UTACLUkohKBaG7auvkhsj4Kwux9kNTJr6sFdNe',
    network: 'ethereum', declaredSchemaVersion: '2.0.1', lendingType: 'POOLED',
    liveSchemaVersion: '2.0.1',
    revenueAvailability: null, semanticNotes: null, corroborationHint: null,
    status: 'live', lastSwept: '2026-09-07', triageVerdict: 'unusable' },
  { slug: 'dforce-ethereum', subgraphId: '6PaB6tKFqrL6YoAELEhFGU6Gc39cEynLbo6ETZMF3sCy',
    network: 'ethereum', declaredSchemaVersion: '2.0.1', lendingType: 'POOLED',
    liveSchemaVersion: '2.0.1',
    revenueAvailability: null, semanticNotes: null, corroborationHint: null,
    status: 'live', lastSwept: '2026-09-07', triageVerdict: 'unusable' },
  { slug: 'euler-finance-ethereum', subgraphId: '95nyAWFFaiz6gykko3HtBCyhRuP5vZzuKYsZiLxHxLhr',
    network: 'ethereum', declaredSchemaVersion: '1.3.0', lendingType: 'POOLED',
    liveSchemaVersion: '1.3.0',
    revenueAvailability: null, semanticNotes: null, corroborationHint: null,
    status: 'live', lastSwept: '2026-09-07', triageVerdict: 'unusable' },
  { slug: 'goldfinch-ethereum', subgraphId: 'GRwpFCPYyQPdz84sCnKemzrNvgFPuKkFLcRLR6jsRxHr',
    network: 'ethereum', declaredSchemaVersion: '2.0.1', lendingType: 'POOLED',
    liveSchemaVersion: '2.0.1',
    revenueAvailability: null, semanticNotes: null, corroborationHint: null,
    status: 'live', lastSwept: '2026-09-07', triageVerdict: 'unusable' },
  { slug: 'inverse-finance-ethereum', subgraphId: 'EXuutY6qkZbXjYeJZdiDBf2imJswTNdfm8YZCqhAthfW',
    network: 'ethereum', declaredSchemaVersion: '1.3.0', lendingType: null,
    liveSchemaVersion: null,
    revenueAvailability: null, semanticNotes: null, corroborationHint: null,
    status: 'error', lastSwept: '2026-09-07', triageVerdict: null },
  { slug: 'iron-bank-ethereum', subgraphId: '5YoxED3bbWV9byvn3x3S3ebZ3idrQmQmsJhL5LMyY26v',
    network: 'ethereum', declaredSchemaVersion: '2.0.1', lendingType: 'POOLED',
    liveSchemaVersion: '2.0.1',
    revenueAvailability: null, semanticNotes: null, corroborationHint: null,
    status: 'live', lastSwept: '2026-09-07', triageVerdict: 'unusable' },
  { slug: 'liquity-ethereum', subgraphId: '2D2dFCLjUt3MfFgTKW8cBxiRQ3Adss7KUtYh2rTcFVY',
    network: 'ethereum', declaredSchemaVersion: '2.0.1', lendingType: 'CDP',
    liveSchemaVersion: '2.0.1',
    revenueAvailability: null, semanticNotes: null, corroborationHint: null,
    status: 'live', lastSwept: '2026-09-07', triageVerdict: 'flagged' },
  { slug: 'makerdao-ethereum', subgraphId: '8sE6rTNkPhzZXZC6c8UQy2ghFTu5PPdGauwUBm4t7HZ1',
    network: 'ethereum', declaredSchemaVersion: '2.0.1', lendingType: 'CDP',
    liveSchemaVersion: '2.0.1',
    revenueAvailability: null, semanticNotes: null, corroborationHint: null,
    status: 'live', lastSwept: '2026-09-07', triageVerdict: 'flagged' },
  { slug: 'maple-finance-v1-ethereum', subgraphId: 'J9dtvE11PWNZH74frWyx9QZonyC1Db2UWDMUegmT3zkG',
    network: 'ethereum', declaredSchemaVersion: '1.3.0', lendingType: 'POOLED',
    liveSchemaVersion: '1.3.0',
    revenueAvailability: null, semanticNotes: null, corroborationHint: null,
    status: 'live', lastSwept: '2026-09-07', triageVerdict: 'unusable' },
  { slug: 'maple-finance-v2-ethereum', subgraphId: '94swSaaFChsQoZzb9Vc7Lo6FWFV6YZUMNSdFVTMAeRgj',
    network: 'ethereum', declaredSchemaVersion: '3.0.1', lendingType: 'POOLED',
    liveSchemaVersion: '3.0.1',
    revenueAvailability: null, semanticNotes: null, corroborationHint: null,
    status: 'live', lastSwept: '2026-09-07', triageVerdict: 'unusable' },
  { slug: 'morpho-aave-v2-ethereum', subgraphId: 'DsznTYxGdsqxWB6a474rSksvB7qWSth5Ff1PcxW28vZy',
    network: 'ethereum', declaredSchemaVersion: '3.0.1', lendingType: 'POOLED',
    liveSchemaVersion: '3.0.1',
    revenueAvailability: null, semanticNotes: null, corroborationHint: null,
    status: 'live', lastSwept: '2026-09-07', triageVerdict: 'flagged' },
  { slug: 'morpho-aave-v3-ethereum', subgraphId: 'FKe6ANnWmGPE6hajGLoTgPrVF2jYPHiRu2Jwcg9ZmG9A',
    network: 'ethereum', declaredSchemaVersion: '3.0.1', lendingType: 'POOLED',
    liveSchemaVersion: '3.0.1',
    revenueAvailability: null, semanticNotes: null, corroborationHint: null,
    status: 'live', lastSwept: '2026-09-07', triageVerdict: 'flagged' },
  { slug: 'morpho-compound-ethereum', subgraphId: '9dTy23tkahyiap1THgwnJuMwxNHVnQM57jFQQiUzjcY6',
    network: 'ethereum', declaredSchemaVersion: '3.0.1', lendingType: null,
    liveSchemaVersion: null,
    revenueAvailability: null, semanticNotes: null, corroborationHint: null,
    status: 'no_indexers', lastSwept: '2026-09-07', triageVerdict: null },
  { slug: 'qidao-ethereum', subgraphId: 'BmQSQaXsivq866kUobQSbyxycjk3D7CiaczKgu3P9ifB',
    network: 'ethereum', declaredSchemaVersion: '1.3.0', lendingType: 'CDP',
    liveSchemaVersion: '1.3.0',
    revenueAvailability: null, semanticNotes: null, corroborationHint: null,
    status: 'live', lastSwept: '2026-09-07', triageVerdict: 'flagged' },
  { slug: 'rari-fuse-ethereum', subgraphId: 'kecp6SPMvbB4GTqg9r5PXvztYriexj5F3ZCaATpjmb2',
    network: 'ethereum', declaredSchemaVersion: '2.0.1', lendingType: 'POOLED',
    liveSchemaVersion: '2.0.1',
    revenueAvailability: null, semanticNotes: null, corroborationHint: null,
    status: 'live', lastSwept: '2026-09-07', triageVerdict: 'unusable' },
  { slug: 'spark-lend-ethereum', subgraphId: 'GbKdmBe4ycCYCQLQSjqGg6UHYoYfbyJyq5WrG35pv1si',
    network: 'ethereum', declaredSchemaVersion: '3.1.0', lendingType: 'POOLED',
    liveSchemaVersion: '3.1.0',
    revenueAvailability: null, semanticNotes: null, corroborationHint: null,
    status: 'live', lastSwept: '2026-09-07', triageVerdict: 'flagged' },
  { slug: 'truefi-ethereum', subgraphId: '39F8fYCvLYmutjqpzEwx3dcEJTtFFVupvBzJqkEzftA7',
    network: 'ethereum', declaredSchemaVersion: '2.0.1', lendingType: 'POOLED',
    liveSchemaVersion: '2.0.1',
    revenueAvailability: null, semanticNotes: null, corroborationHint: null,
    status: 'live', lastSwept: '2026-09-07', triageVerdict: 'unusable' },
  { slug: 'uwu-lend-ethereum', subgraphId: 'CZBD7e8VGvNa6WkBHZAaC688bsZ35UvAM1AuDdVng2aE',
    network: 'ethereum', declaredSchemaVersion: '3.1.0', lendingType: 'POOLED',
    liveSchemaVersion: '3.1.0',
    revenueAvailability: null, semanticNotes: null, corroborationHint: null,
    status: 'live', lastSwept: '2026-09-07', triageVerdict: 'flagged' },
  { slug: 'zerolend-ethereum', subgraphId: '4Zf4doH54RDit9KVsfCp3MkjrP3szhJZwvw2z5PHczx9',
    network: 'ethereum', declaredSchemaVersion: '3.1.0', lendingType: 'POOLED',
    liveSchemaVersion: '3.1.0',
    revenueAvailability: null, semanticNotes: null, corroborationHint: null,
    status: 'live', lastSwept: '2026-09-07', triageVerdict: 'unusable' },
];

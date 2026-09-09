// A persisted report becomes an asset on Hedera testnet: deploy a ResolverProxy, grant ISSUER,
// issue 1, record it. The transfer is Unit 10 and deliberately not here.
//
// ⚠️ **Two phases, and the split is a safety property rather than a style.** `prepare()` does every
// read-only check — is there already a token, is the factory alive, does the key match the analyst,
// is there balance — and `tokenize()` is the only thing that spends. A deploy that reverts costs
// about a million gas and produces nothing, so everything that can stop the run stops it before the
// first transaction rather than between the second and the third.
//
// ⚠️ **The struct below was paid for.** SM-07 spent a reverted deploy finding two values in our own
// research note that revert on-chain. It is promoted with its reasoning attached; the comments on
// `maxSupply` and `regulationType` are the receipt.

import { ethers } from 'ethers';
import { Factory__factory, IAsset__factory } from '@hashgraph/asset-tokenization-contracts';
import type { Report } from '../types/report.js';
import { analystByArcAddress, type AnalystConfig } from '../config/analysts.js';
import { load } from '../store/reports.js';
import { pooled } from '../store/db.js';
import { isinFor } from './isin.js';
import {
  MIRROR, HEDERA_TESTNET_CHAIN_ID, asRunner, fetchJson, landOrStop, settledBalance,
  type MirrorAccount, type MirrorContract, type Runner,
} from './hedera.js';

/** The public ATS testnet infrastructure. Not ours — `prepare()` re-checks it is alive every run. */
const FACTORY_ID = '0.0.9213391';
const RESOLVER_ID = '0.0.9212226';

const ZERO = '0x0000000000000000000000000000000000000000';
const DEFAULT_ADMIN_ROLE = `0x${'00'.repeat(32)}`;
/** `constants/roles.sol:78`. Creation grants only DEFAULT_ADMIN, which is why grantRole exists. */
const ROLE_ISSUER = '0x5eeaf5602c75bf26e73b5206d0bd6ee82f621166255e5fd73cc06bc7bd84a95f';
/** Resolver configuration 1 = equity, at version 1. Verified live by SM-07. */
const EQUITY_CONFIG_ID = `0x${'00'.repeat(31)}01`;
const EQUITY_CONFIG_VERSION = 1n;

/**
 * ⚠️ `RegulationType.NONE` reverts. `_isValidTypeAndSubType` accepts only REG_S+NONE or
 * REG_D+{506_B, 506_C}; there is no "no regulation" option. REG_S is the honest pick for a report
 * sold to anyone — international investors allowed, no resale hold. Validated and emitted, never
 * stored, and it gates nothing on transfer.
 */
const REG_S = 1;
const REG_SUBTYPE_NONE = 0;

export interface TokenPlan {
  readonly reportHash: string;
  readonly report: Report;
  readonly analyst: AnalystConfig;
  readonly wallet: ethers.Wallet;
  readonly factoryAddress: string;
  readonly resolverAddress: string;
  readonly isin: string;
  /** ⚠️ PLAN §1's cross-chain commitment: the same 32 bytes Arc's `commitPrediction` will carry. */
  readonly info: string;
  readonly balanceTinybars: bigint;
}

export interface TokenizeResult {
  readonly proxyAddress: string;
  readonly isin: string;
  readonly emittedInfo: string;
  readonly deployTx: string;
  readonly grantRoleTx: string;
  readonly issueTx: string;
  readonly balance: bigint;
  readonly receipts: readonly (readonly [string, TxCost])[];
}

/**
 * ⚠️ **Structural, not `ethers.TransactionReceipt`, for the same reason `asRunner` exists.** Typechain
 * hands back a `ContractTransactionReceipt` carrying the CJS ethers identity; our ESM import of the
 * same installed copy is a different type to TypeScript, and their `#private` fields make them
 * unassignable. Only these three fields are ever read — cost reporting — so naming them is honest
 * and avoids a second cast at a boundary that does not need one.
 */
export interface TxCost {
  readonly hash: string;
  readonly gasUsed: bigint;
  readonly gasPrice: bigint;
}

/** Empty is missing — `??` falls back on `undefined` and never on `""`, which shipped an empty payTo. */
function env(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set (or is set to an empty string).`);
  return value;
}

/**
 * Everything that can stop the run, before anything costs. Returns what `tokenize()` needs.
 *
 * ⚠️ **The analyst comes from the report, not from an argument or an env var.** `Report.analyst`
 * holds the `arcAddress`, so the row is found by matching that; `hederaAccountId` and
 * `hederaEvmAddress` then come off the same row. DECISIONS.md 2026-09-08: each analyst has its own
 * Hedera account, and reading the issuer from env would mean a second analyst's tokens issuing from
 * the first's account.
 */
export async function prepare(reportHash: string): Promise<TokenPlan> {
  const report = await load(reportHash);
  if (!report) throw new Error(`no report ${reportHash} in the store. Nothing to tokenize.`);

  // Hoisted to `config/analysts.ts` in Unit 12 — Units 13 and 14 need the same resolution.
  const analyst = analystByArcAddress(report.analyst);

  const isin = isinFor(reportHash);

  // ⚠️ Both checked BEFORE deploying. `report_hash` is the primary key and (as of migration 003)
  // `isin` is UNIQUE, so a second tokenize would fail its insert *after* the gas was spent.
  //
  // ⚠️ **KNOWN, UNFIXED: this is a leaked client.** `pooled()` CONSTRUCTS — see `store/db.ts` — and
  // this call and the insert at the end of `tokenize()` each build a client with its own pool and
  // close neither. Every module that reads or writes should call the shared `db()` instead; these
  // two are the only holdouts in `src/`, and `scripts/ops/tokenize.ts:108` is a third in the same
  // flow. Two clients per tokenize run against a Neon pool that caps them, where a limit failure
  // presents as a timeout rather than as a limit error. Documented 2026-09-09; **fixing it is a
  // behaviour change and belongs in its own commit.**
  const existing = await pooled()<{ report_hash: string; proxy_address: string; isin: string }[]>`
    SELECT report_hash, proxy_address, isin FROM report_tokens
    WHERE report_hash = ${reportHash} OR isin = ${isin}`;
  if (existing.length > 0) {
    const row = existing[0]!;
    throw new Error(
      `already tokenized: report ${row.report_hash} holds ISIN ${row.isin} at proxy ${row.proxy_address}. ` +
      'Refusing to deploy a second asset — nothing on-chain would say which one was ours.',
    );
  }

  // ⚠️ The key is the one thing env supplies, and the row is what validates it. A key that derives a
  // different address than the analyst's row would issue from the wrong account, silently and
  // irreversibly. **A second analyst needs a per-analyst key scheme; this check is what makes one
  // shared variable safe until then, because a mismatch stops rather than proceeds.**
  const provider = new ethers.JsonRpcProvider(env('HEDERA_TESTNET_RPC'));
  const chainId = (await provider.getNetwork()).chainId;
  if (chainId !== HEDERA_TESTNET_CHAIN_ID) {
    throw new Error(`chainId ${chainId} is not Hedera testnet (${HEDERA_TESTNET_CHAIN_ID}).`);
  }
  const wallet = new ethers.Wallet(`0x${env('HEDERA_SELLER_KEY').replace(/^0x/, '').slice(-64)}`, provider);
  if (wallet.address.toLowerCase() !== analyst.hederaEvmAddress.toLowerCase()) {
    throw new Error(
      `HEDERA_SELLER_KEY derives ${wallet.address} but analyst ${analyst.id} is ` +
      `${analyst.hederaEvmAddress}. The key and the analyst row are different accounts.`,
    );
  }

  // The public infrastructure, re-measured rather than trusted. If either is gone the fallback is
  // deploying our own ATS — 111 contracts, ~29 minutes — which is a decision, not a retry.
  const live: Record<string, MirrorContract> = {};
  for (const [label, id] of [['factory', FACTORY_ID], ['resolver', RESOLVER_ID]] as const) {
    const contract = await fetchJson<MirrorContract>(`${MIRROR}/api/v1/contracts/${id}`);
    if (contract.deleted) throw new Error(`${label} ${id} is deleted. Deploying our own ATS is a decision, not a retry.`);
    live[label] = contract;
  }

  const account = await fetchJson<MirrorAccount>(`${MIRROR}/api/v1/accounts/${analyst.hederaAccountId}`);
  return {
    reportHash, report, analyst, wallet,
    factoryAddress: live.factory!.evm_address,
    resolverAddress: live.resolver!.evm_address,
    isin,
    info: `alpha:${reportHash}`,
    balanceTinybars: BigInt(account.balance.balance),
  };
}

/** The equity struct. Every field below was either measured or deliberately chosen. */
function equityData(plan: TokenPlan) {
  return {
    security: {
      resolver: plan.resolverAddress,
      // ⚠️ `maxSupply: 0` does NOT mean unlimited at creation, whatever CapStorageWrapper.sol:41
      // says. `Cap.initializeCap` carries `onlyValidNewMaxSupply`, which reverts
      // NewMaxSupplyCannotBeZero() — measured, selector 0x76f138fb, after 948,129 gas of a real
      // reverted deploy. The zero-bypass is only in `isCorrectMaxSupply`, which runs later at issue
      // time. 1 is the honest value anyway: one report, one token, and a second mint against this
      // report becomes impossible at the contract level rather than by convention.
      maxSupply: 1n,
      resolverProxyConfiguration: { key: EQUITY_CONFIG_ID, version: EQUITY_CONFIG_VERSION },
      erc20MetadataInfo: { name: 'Alpha Markets Report', symbol: 'ALPHA', isin: plan.isin, decimals: 0 },
      rbacs: [{ role: DEFAULT_ADMIN_ROLE, members: [plan.analyst.hederaEvmAddress] }],
      externalPauses: [], externalControlLists: [], externalKycLists: [],
      // Compliance off is what lets an arbitrary buyer receive with zero onboarding:
      // `verifyKycStatus` is (!internalKycActivated || matches) && isExternallyGranted(...), and the
      // latter returns true on an empty list because the loop never runs.
      compliance: ZERO,
      identityRegistry: ZERO,
      arePartitionsProtected: false,
      isMultiPartition: false,
      isControllable: true,   // keeps a force-transfer escape hatch if a buyer flow breaks
      isWhiteList: false,     // false = the control list is a deny-list, and it is empty
      clearingActive: false,
      internalKycActivated: false,
      erc20VotesActivated: false,
    },
    equityDetails: {
      votingRight: false, informationRight: false, liquidationRight: false, subscriptionRight: false,
      conversionRight: false, redemptionRight: false, putRight: false, dividendRight: 0,
      currency: '0x555344',   // "USD" as bytes3
      nominalValue: 0n, nominalValueDecimals: 0,
    },
  };
}

/**
 * Deploy, grant, issue, record. ⚠️ **This spends real HBAR — call `prepare()` first.**
 *
 * Nothing here retries. Each step tells `landOrStop` what already exists, because a blind retry
 * after a partial run deploys a second asset with nothing on-chain to distinguish it.
 */
export async function tokenize(plan: TokenPlan): Promise<TokenizeResult> {
  const runner: Runner = asRunner(plan.wallet);
  const factory = Factory__factory.connect(plan.factoryAddress, runner);

  const regulationData = {
    regulationType: REG_S,
    regulationSubType: REG_SUBTYPE_NONE,
    additionalSecurityData: { countriesControlListType: false, listOfCountries: '', info: plan.info },
  };

  const deployReceipt = await landOrStop('deployEquity', async () => {
    const tx = await factory.deployEquity(equityData(plan), regulationData, { gasLimit: 12_000_000 });
    return (await tx.wait())!;
  }, ['Nothing landed. A revert here deploys nothing, but do not retry blindly after a PARTIAL run.']);

  const deployed = deployReceipt.logs
    .map((log) => { try { return factory.interface.parseLog(log); } catch { return null; } })
    .find((parsed) => parsed?.name === 'EquityDeployed');
  if (!deployed) throw new Error(`no EquityDeployed event in ${deployReceipt.hash}. Nothing to issue against.`);

  const proxyAddress = deployed.args[1] as string;
  // ⚠️ `additionalSecurityData` is validated and emitted, never written to proxy storage. Reading it
  // back out of the log is the ONLY proof the report hash survived the round trip.
  const emittedInfo = deployed.args[3].additionalSecurityData.info as string;
  if (emittedInfo !== plan.info) {
    throw new Error(
      `the report commitment did not survive: emitted ${JSON.stringify(emittedInfo)}, sent ` +
      `${JSON.stringify(plan.info)}. Proxy ${proxyAddress} exists and does not commit to this report.`,
    );
  }

  const token = IAsset__factory.connect(proxyAddress, runner);
  const landed = [`The asset exists. Proxy ${proxyAddress}. Act against it; do not redeploy.`];

  const grantReceipt = await landOrStop('grantRole(ISSUER)', async () =>
    (await (await token.grantRole(ROLE_ISSUER, plan.analyst.hederaEvmAddress, { gasLimit: 1_000_000 })).wait())!, landed);

  const issueReceipt = await landOrStop('issue', async () =>
    (await (await token.issue(plan.analyst.hederaEvmAddress, 1n, '0x', { gasLimit: 2_000_000 })).wait())!,
    [...landed, 'ISSUER is granted.']);

  // ⚠️ The second leaked `pooled()` client — see the note in `prepare()`. Known, unfixed, and a
  // behaviour change to close.
  await pooled()`
    INSERT INTO report_tokens (report_hash, proxy_address, isin, deploy_tx, grant_role_tx, issue_tx)
    VALUES (${plan.reportHash}, ${proxyAddress}, ${plan.isin},
            ${deployReceipt.hash}, ${grantReceipt.hash}, ${issueReceipt.hash})`;

  return {
    proxyAddress, isin: plan.isin, emittedInfo,
    deployTx: deployReceipt.hash, grantRoleTx: grantReceipt.hash, issueTx: issueReceipt.hash,
    balance: await token.balanceOf(plan.analyst.hederaEvmAddress),
    receipts: [['deployEquity', deployReceipt], ['grantRole', grantReceipt], ['issue', issueReceipt]],
  };
}

export { FACTORY_ID, RESOLVER_ID, settledBalance };

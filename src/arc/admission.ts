// The check before a commit: is this report actually tokenized, by this analyst, carrying this hash.
//
// ⚠️ **The contract cannot help here and never will.** To `AlphaMarket`, `reportHash` is 32
// arbitrary bytes. An analyst could commit the hash of a report that does not exist, was never
// tokenized, or was written by somebody else, and `commitPrediction` would accept all three — it has
// no way to know and no business knowing. **This file is what stops that, and it stops it for us
// rather than for everyone.**
//
// ── Four reads, all free, none spending ──────────────────────────────────────────────────────────
//
//   0. our own `report_tokens` row      which proxy, which deploy transaction
//   1. the proxy exists and is alive    Mirror `GET /api/v1/contracts/{id}`
//   2. the creation event carries       Mirror `GET /api/v1/contracts/results/{deploy_tx}`, logs
//      `alpha:<hash>`                   re-parsed with `Factory__factory.createInterface()`
//   3. this analyst issued it           the SAME fetch as 2 — `from` and the event's `deployer`
//   4. the Arc committer is ours        Unit 4's identity guard, already built
//
// ⚠️ **Nothing here spends.** Two Mirror GETs, one Circle wallet lookup, one database read. If this
// unit ever finds itself sending a transaction, something is wrong.
//
// ── ⚠️ BIND TO ISSUANCE, NEVER TO CURRENT HOLDING ────────────────────────────────────────────────
//
// "Held by the analyst" is the wrong criterion and would refuse most of our own reports.
// `004_token_transfers.sql` records it plainly: **three of our four tokens sit with the buyer
// today.** Phase 3's Unit 10 moved them on purpose, because H2.4 asks for a lifecycle operation on
// camera.
//
// ⚠️ **So the act that satisfies H2.4 would break an admission check built on holding** — two
// requirements pulling opposite ways through one column. Who *issued* a token is permanent and sits
// in the deploy transaction forever; who *holds* it is a lifecycle fact that is supposed to change.
// This file reads the deploy transaction and never asks `balanceOf`.
//
// ── ⚠️ The ISIN is not checked, deliberately ─────────────────────────────────────────────────────
//
// `isinFor()` is `BigInt(hash) % 36^9` rendered in base-36 with a check digit — a **pure function of
// the report hash**. Checking it against the hash checks our own arithmetic, not the chain. It is an
// identifier for a human to quote and it is not evidence.
//
// ── ⚠️ What the evidence record is for, stated precisely ─────────────────────────────────────────
//
// **It does not prove the check ran.** A reader has to trust us for that, and no row in our database
// can fix it. Its value is different and narrower: it names **exactly what to re-check**, and every
// one of those is independently readable off two public chains by somebody who believes nothing we
// say. Detectable by anyone, enforced by no one.

import { Factory__factory } from '@hashgraph/asset-tokenization-contracts';
import { canonical } from '../domain/canonical.js';
import { MIRROR, type MirrorContract, fetchJson } from '../tokenize/hedera.js';
import { db } from '../store/db.js';
import { analystByArcAddress } from '../config/analysts.js';
import { analystIdentity } from './arc.js';

/** ⚠️ Thrown for every refusal. A caller must not be able to mistake this for a network blip. */
export class BindingRefused extends Error {
  constructor(readonly reportHash: string, why: string) {
    super(`refusing to commit to report ${reportHash}: ${why}`);
    this.name = 'BindingRefused';
  }
}

/**
 * What the check saw. ⚠️ Every field is a thing a stranger can re-read for themselves.
 *
 * `arcTransaction` is absent here on purpose — the commit has not happened yet when this is built,
 * which is the entire point of a check that runs *before* money moves. `recordArcTransaction`
 * completes the row once Unit 7 has a hash.
 */
export interface BindingEvidence {
  readonly reportHash: string;
  /** Hedera: the ResolverProxy holding the report token. */
  readonly proxyAddress: string;
  /** Hedera: the transaction that created it, and the one carrying the commitment. */
  readonly deployTx: string;
  /** Hedera: who deployed, as the event's ECDSA alias — equals the analyst row's `hederaEvmAddress`. */
  readonly issuerAddress: string;
  /** Hedera: the same signer as Mirror reports it, in long-zero form. See the note in `checkBinding`. */
  readonly issuerAccountAddress: string;
  /** The exact string the creation event carries. Must be `alpha:<reportHash>`. */
  readonly emittedInfo: string;
  /** Arc: the address that will commit. Read 4 — the identity guard already refused a mismatch. */
  readonly arcAddress: string;
  /** Which analyst row both sides resolved to. */
  readonly analyst: string;
  readonly checkedAt: string;
}

const longZero = (accountId: string): string => {
  const num = accountId.split('.')[2];
  if (!num) throw new Error(`hederaAccountId ${accountId} is not shaped 0.0.x`);
  return `0x${BigInt(num).toString(16).padStart(40, '0')}`;
};

/**
 * Run the four reads. Returns what it saw, or throws `BindingRefused` saying which one failed.
 *
 * ⚠️ **Mirror Node lags consensus, so an empty read is treated as a REFUSAL and never as a pass.**
 * These transactions are days old and it should not bite — but "should not" is not a guarantee, and
 * the failure mode of guessing wrong here is committing money against an unverified report. A read
 * that comes back empty says so in its own words, so an operator can tell a lagging mirror from a
 * report that was never tokenized. Retrying is the caller's decision, not ours.
 */
export async function checkBinding(reportHash: string): Promise<BindingEvidence> {
  // ── 0 · our own row. No row means nobody ever tokenized this report. ──
  const [row] = await db()<{ proxy_address: string; deploy_tx: string }[]>`
    SELECT proxy_address, deploy_tx FROM report_tokens WHERE report_hash = ${reportHash}`;
  if (!row) {
    throw new BindingRefused(reportHash,
      'it has no report_tokens row, so no ATS asset was ever issued against it. The product\'s ' +
      'claim is that a prediction is staked on tokenized work; this report is not tokenized.');
  }

  // ── 4 · who we would be committing as. Unit 4's guard throws on a mismatch of its own. ──
  const identity = await analystIdentity();

  // ── 1 · the proxy exists and is not deleted ──
  let contract: MirrorContract;
  try {
    contract = await fetchJson<MirrorContract>(`${MIRROR}/api/v1/contracts/${row.proxy_address}`);
  } catch (error) {
    throw new BindingRefused(reportHash,
      `Mirror Node did not return proxy ${row.proxy_address} (${(error as Error).message}). This is ` +
      'either a lagging or unavailable mirror or a proxy that is not there; the two are not ' +
      'distinguishable from here, so this refuses rather than guesses.');
  }
  if (contract.deleted) {
    throw new BindingRefused(reportHash, `proxy ${row.proxy_address} is DELETED on Hedera.`);
  }

  // ── 2 and 3 · ONE fetch serves both: the logs carry the commitment, `from` carries the signer ──
  type MirrorResult = { from?: string; result?: string; logs?: { topics: string[]; data: string }[] };
  let result: MirrorResult;
  try {
    result = await fetchJson<MirrorResult>(`${MIRROR}/api/v1/contracts/results/${row.deploy_tx}`);
  } catch (error) {
    throw new BindingRefused(reportHash,
      `Mirror Node did not return deploy transaction ${row.deploy_tx} (${(error as Error).message}). ` +
      'An unreadable creation event is an unverified commitment, so this refuses.');
  }
  if (!result.logs?.length) {
    throw new BindingRefused(reportHash,
      `deploy transaction ${row.deploy_tx} came back with no logs. Mirror Node lags consensus and ` +
      'may simply not have ingested it — but an empty read is not a pass, and retrying is the ' +
      'caller\'s decision.');
  }

  const iface = Factory__factory.createInterface();
  const deployed = result.logs
    .map((log) => { try { return iface.parseLog({ topics: log.topics, data: log.data }); } catch { return null; } })
    .find((parsed) => parsed?.name === 'EquityDeployed');
  if (!deployed) {
    throw new BindingRefused(reportHash,
      `no EquityDeployed event in ${row.deploy_tx}. Nothing in that transaction commits to a report.`);
  }

  // ⚠️ `additionalSecurityData` is validated and emitted, never written to proxy storage — so this
  // log is the ONLY place the report hash survives on Hedera. `ats.ts` checks it at issue time;
  // this re-checks it at commit time, against the chain rather than against our row.
  const emittedInfo = deployed.args[3].additionalSecurityData.info as string;
  const expected = `alpha:${reportHash}`;
  if (emittedInfo !== expected) {
    throw new BindingRefused(reportHash,
      `the creation event of ${row.deploy_tx} carries ${JSON.stringify(emittedInfo)}, not ` +
      `${JSON.stringify(expected)}. That proxy exists and commits to a different report.`);
  }

  // ── 3 · the issuer, checked in BOTH forms the analyst row carries ──
  //
  // ⚠️ **`from` is NOT the analyst's `hederaEvmAddress`, and assuming it was would refuse every
  // report we have.** Mirror reports the signer in **long-zero** form — the account number padded to
  // 20 bytes, `0x…009e80ea` for `0.0.10387690` — while the event's indexed `deployer` carries the
  // **ECDSA alias**, `0x32838fe9…`, which is what the analyst row calls `hederaEvmAddress`. Measured
  // across all four of our tokens, 2026-09-11.
  //
  // ⚠️ Checking both is strictly stronger than checking either: they are two independent encodings
  // of one identity, from two different parts of the same record, and `config/analysts.ts` already
  // stores both forms on purpose ("recording one fact twice, because deriving one from the other at
  // each call site is where they drift"). A mismatch in either is a refusal.
  const analyst = analystByArcAddress(identity.address);
  const issuerAddress = deployed.args[0] as string;
  const issuerAccountAddress = result.from ?? '';

  if (issuerAddress.toLowerCase() !== analyst.hederaEvmAddress.toLowerCase()) {
    throw new BindingRefused(reportHash,
      `the token was deployed by ${issuerAddress}, not by analyst ${analyst.id} ` +
      `(${analyst.hederaEvmAddress}). Committing would stake on somebody else's work.`);
  }
  if (issuerAccountAddress.toLowerCase() !== longZero(analyst.hederaAccountId).toLowerCase()) {
    throw new BindingRefused(reportHash,
      `the deploy transaction was signed by ${issuerAccountAddress}, which is not account ` +
      `${analyst.hederaAccountId} (${longZero(analyst.hederaAccountId)}). The event's deployer and ` +
      'the transaction\'s signer disagree, and one of them is not this analyst.');
  }

  return {
    reportHash,
    proxyAddress: row.proxy_address,
    deployTx: row.deploy_tx,
    issuerAddress,
    issuerAccountAddress,
    emittedInfo,
    arcAddress: identity.address,
    analyst: analyst.id,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Record what the check saw, against the claim it admits.
 *
 * ⚠️ **`raw` is canonical JSON as TEXT and never jsonb**, the same rule `settlement_evidence` holds
 * and for the same reason: jsonb reorders keys, normalises numbers and drops duplicates, so the
 * bytes you read back would not be the bytes that were written.
 *
 * ⚠️ **`arc_tx` is NULL here and that is correct.** The check runs before the commit — there is no
 * Arc transaction yet, which is the whole point of checking before money moves. Unit 7 calls
 * `recordArcTransaction` once it has a hash, and until then a null means "admitted, not yet
 * committed" rather than anything missing.
 *
 * ⚠️ Idempotent on `claim_id`, so a retried commit re-records rather than failing on the primary key.
 */
export async function recordBinding(claimId: string, e: BindingEvidence): Promise<void> {
  await db()`
    INSERT INTO binding_evidence (claim_id, report_hash, proxy_address, deploy_tx, issuer_address, raw)
    VALUES (${claimId}, ${e.reportHash}, ${e.proxyAddress}, ${e.deployTx}, ${e.issuerAddress},
            ${canonical(e)})
    ON CONFLICT (claim_id) DO UPDATE SET
      report_hash = EXCLUDED.report_hash, proxy_address = EXCLUDED.proxy_address,
      deploy_tx = EXCLUDED.deploy_tx, issuer_address = EXCLUDED.issuer_address, raw = EXCLUDED.raw`;
}

/** The fifth identifier, once it exists. ⚠️ Unit 7's to call, after the commit lands. */
export async function recordArcTransaction(claimId: string, arcTx: string): Promise<void> {
  await db()`UPDATE binding_evidence SET arc_tx = ${arcTx} WHERE claim_id = ${claimId}`;
}

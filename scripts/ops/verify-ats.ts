// Verify an ATS report token on Sourcify, which is what HashScan reads.
//
//   npx tsx scripts/ops/verify-ats.ts 0x60c955b9b2d0896b5EEAF285133891D9A7CF7648
//   npx tsx --env-file=.env scripts/ops/verify-ats.ts --all    ← sweep every row in report_tokens
//
// ⚠️ This works unchanged for EVERY report token. Each one is another ResolverProxy deployed by the
// same ATS factory from the same source at the same compiler settings, so all of them share the
// identical 390-byte runtime bytecode — including the trailing IPFS metadata hash. Only the address
// changes. Pass a different one and the whole sequence repeats.
//
// The sequence, and step 3 is the one that matters:
//   1. assemble the Standard JSON Input from pinned packages
//   2. compile locally with solc 0.8.28
//   3. ⚠️ assert byte-equality against the on-chain runtime bytecode BEFORE submitting anything
//   4. only on a match, POST to Sourcify
//   5. re-query to confirm, and print the HashScan link
//
// Nothing here needs a key or an .env — it reads public chain data and posts public source. ⚠️ The
// one exception is `--all`, which reads `report_tokens` and therefore needs `DATABASE_URL`. The
// single-address form stays credential-free, which is the property that lets anyone reproduce a
// verification without being us.
//
// ── This file is both a module and a script (2026-09-09) ─────────────────────────────────────────
//
// `verifyAts()` is exported so `scripts/ops/tokenize.ts` can run it as its final step rather than
// printing a command nobody runs. ⚠️ **The gate did not move and did not change** — it is the same
// comparison against the same bytes in the same place. What changed is that a refusal now THROWS a
// `VerificationError` instead of calling `process.exit(1)`, exactly as `landOrStop` was changed when
// it was promoted out of SM-07 into `src/tokenize/hedera.ts`: a library cannot exit a process that
// has other things to finish. The CLI below catches and exits, so running this script behaves
// identically to before.
//
// Where the compiler settings came from, since none of them are guessable: the package ships
// artifacts but excludes `artifacts/build-info/` in its `files` array, so there is no Standard JSON
// Input to reuse and no `metadata` field on the artifacts. The metadata is not on IPFS either — the
// CID in the bytecode resolves nowhere. Everything below is recovered from a pinned source:
//   solc 0.8.28              the CBOR trailer's `0x00081c`, and upstream hardhat.config.ts
//   optimizer on, runs 100   upstream hardhat.config.ts @ be4f860e
//   evmVersion cancun        same
//   bytecodeHash ipfs        solc's default; the CBOR trailer carries an `ipfs` key
//   @openzeppelin 4.9.6      upstream package-lock.json. package.json says "^4.9.6" — a range, and
//                            a different 4.9.x would change the metadata hash and break the match.

import { createRequire } from "node:module";
import { dirname, join, normalize } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

// ⚠️ `solc` and `@openzeppelin/contracts` are pinned **devDependencies** and are required lazily,
// inside the function that needs them. That is deliberate: it keeps merely importing this module
// free, so a caller can reference `VerificationError` or `sourcifyStatus` in an environment where
// the compiler is not installed. It does NOT make verification work in such an environment — see the
// note on `verifyAts` — it only moves the failure to the point of use, where it can be reported.
const loadSolc = () => require("solc");

const CHAIN_ID = 296; // Hedera testnet
const MIRROR = "https://testnet.mirrornode.hedera.com";
// HashScan's own verifier host 308-redirects here, so this one submission covers both.
const SOURCIFY = "https://sourcify.dev/server";

const CONTRACT_FILE = "contracts/infrastructure/proxy/ResolverProxy.sol";
const CONTRACT_NAME = "ResolverProxy";
const CONTRACT_IDENTIFIER = `${CONTRACT_FILE}:${CONTRACT_NAME}`;

const ATS_ROOT = dirname(require.resolve("@hashgraph/asset-tokenization-contracts/package.json"));
const OZ_ROOT = dirname(require.resolve("@openzeppelin/contracts/package.json"));

const fetchJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} → ${response.status} ${await response.text()}`);
  return (await response.json()) as T;
};

/**
 * A verification that did not happen, and which stage refused.
 *
 * ⚠️ **`stage` exists so a caller can tell a wrong-source refusal from a bad afternoon at Sourcify**,
 * and those two deserve opposite responses. `'gate'` means the bytes did not match and the thing on
 * chain is not what we compiled — never retry that, investigate it. `'submit'` and `'confirm'` mean
 * the bytes matched and a third party did not cooperate; retrying later is correct and costs nothing.
 * `'environment'` means the compiler is not installed here at all.
 */
export class VerificationError extends Error {
  constructor(
    readonly stage: "environment" | "compile" | "gate" | "submit" | "confirm",
    message: string,
  ) {
    super(message);
    this.name = "VerificationError";
  }
}

export interface VerifyResult {
  readonly address: string;
  /** `exact_match`, or whatever Sourcify's record reports. */
  readonly match: string;
  /** Sourcify returned 409 — someone had already verified this contract. Still a success. */
  readonly alreadyVerified: boolean;
}

/**
 * Cheap "is this already done?" check. One GET, no compile, no credentials.
 *
 * ⚠️ **Not a substitute for the gate.** It is a way to skip work that is already finished, used by
 * `--all` so a sweep over a hundred tokens does not compile a hundred times. Anything that actually
 * submits goes through `verifyAts`, which always compiles and always compares first.
 */
export async function sourcifyStatus(address: string): Promise<string | null> {
  const response = await fetch(`${SOURCIFY}/v2/contract/${CHAIN_ID}/${address}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`${SOURCIFY}/v2/contract/${CHAIN_ID}/${address} → ${response.status}`);
  const record = (await response.json()) as { match: string | null; runtimeMatch: string | null };
  return record.match ?? record.runtimeMatch;
}

/**
 * Compile, compare, submit, confirm. Throws `VerificationError` rather than exiting.
 *
 * ⚠️ **Needs `solc` and `@openzeppelin/contracts`, which are devDependencies.** They are installed
 * locally and by CI; they are **not** present in a Vercel function. Calling this from a route
 * handler throws `VerificationError('environment')` at the `require`, which is why nothing under
 * `src/` imports this file and why `src/tokenize/ats.ts` does not verify. See that file's header.
 */
export async function verifyAts(address: string): Promise<VerifyResult> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new VerificationError("gate", `"${address}" is not a 20-byte EVM address.`);
  }

  // ─── Step 1 — assemble the Standard JSON Input ─────────────────────────────────────────────────
  // The source *keys* are load-bearing: they are recorded verbatim in the metadata, so they have to
  // be the names hardhat used — `contracts/…` for the package's own files and
  // `@openzeppelin/contracts/…` for the one node_modules import. The artifact's own `sourceName`
  // confirms the first form.
  //
  // The closure is traced rather than listed. Listing 16 paths would work today and rot the moment
  // ATS changes an import; tracing is the same length and stays true.

  console.log(`\n── Step 1 · assemble Standard JSON Input`);

  const readSource = (sourceName: string): string => {
    const path = sourceName.startsWith("@openzeppelin/contracts/")
      ? join(OZ_ROOT, sourceName.slice("@openzeppelin/contracts/".length))
      : join(ATS_ROOT, sourceName);
    return readFileSync(path, "utf8");
  };

  const sources: Record<string, { content: string }> = {};
  const queue = [CONTRACT_FILE];
  while (queue.length > 0) {
    const sourceName = queue.pop()!;
    if (sources[sourceName]) continue;
    const content = readSource(sourceName);
    sources[sourceName] = { content };
    const imports = content.matchAll(/import\s+(?:\{[^}]*\}\s+from\s+)?["']([^"']+)["']/g);
    for (const [, target] of imports) {
      queue.push(target.startsWith(".") ? normalize(join(dirname(sourceName), target)) : target);
    }
  }

  const local = Object.keys(sources).filter((s) => s.startsWith("contracts/"));
  const external = Object.keys(sources).filter((s) => !s.startsWith("contracts/"));
  console.log(`  ${local.length} package sources + ${external.length} external`);
  for (const name of external) console.log(`    external  ${name}`);
  console.log(`  @openzeppelin/contracts ${require("@openzeppelin/contracts/package.json").version}`);

  const standardJsonInput = {
    language: "Solidity",
    sources,
    settings: {
      optimizer: { enabled: true, runs: 100 },
      evmVersion: "cancun",
      outputSelection: { "*": { "*": ["abi", "evm.deployedBytecode.object", "metadata"] } },
    },
  };

  // ─── Step 2 — compile ──────────────────────────────────────────────────────────────────────────

  console.log(`\n── Step 2 · compile`);

  let solc;
  try {
    solc = loadSolc();
  } catch (error) {
    throw new VerificationError(
      "environment",
      "solc is not available in this environment. It is a devDependency and is not installed in a " +
        `Vercel function. Verify from a machine that has it: npx tsx scripts/ops/verify-ats.ts ${address}. ` +
        `(${(error as Error).message})`,
    );
  }

  const compilerVersion = (() => {
    const matched = solc.version().match(/^(\d+\.\d+\.\d+)\+(commit\.[0-9a-f]+)/);
    if (!matched) throw new VerificationError("compile", `cannot parse solc version "${solc.version()}"`);
    return `${matched[1]}+${matched[2]}`;
  })();
  console.log(`  solc ${compilerVersion}   optimizer on, runs 100   evmVersion cancun`);

  const output = JSON.parse(solc.compile(JSON.stringify(standardJsonInput)));

  for (const error of output.errors ?? []) {
    if (error.severity === "error") {
      throw new VerificationError("compile", `compilation failed — ${error.formattedMessage ?? error.message}`);
    }
  }

  const compiled = output.contracts?.[CONTRACT_FILE]?.[CONTRACT_NAME];
  if (!compiled) {
    throw new VerificationError("compile", `${CONTRACT_IDENTIFIER} is not in the compiler output.`);
  }

  const compiledRuntime = `0x${compiled.evm.deployedBytecode.object}`;
  console.log(`  compiled runtime  ${(compiledRuntime.length - 2) / 2} bytes`);

  // ─── Step 3 — the gate ─────────────────────────────────────────────────────────────────────────
  // ⚠️ Nothing is submitted until these bytes are identical, metadata hash included. A near-match
  // verifies the wrong thing, and the fix for a mismatch is never "try different optimizer settings
  // until it passes" — that is how you certify source that was not what ran.
  //
  // ⚠️ There is no retry here and there must never be one. A mismatch is not a transient condition:
  // the same inputs produce the same bytes every time, so a second attempt can only differ if
  // somebody changed a setting to make it pass, which is the failure this gate exists to prevent.

  console.log(`\n── Step 3 · byte-equality against chain`);

  type MirrorContract = { contract_id: string; runtime_bytecode: string; deleted: boolean };
  const onChain = await fetchJson<MirrorContract>(`${MIRROR}/api/v1/contracts/${address}`);
  const chainRuntime = onChain.runtime_bytecode;

  console.log(`  ${onChain.contract_id}  ${address}`);
  console.log(`  on-chain runtime  ${(chainRuntime.length - 2) / 2} bytes`);

  if (compiledRuntime.toLowerCase() !== chainRuntime.toLowerCase()) {
    const lines = [
      `bytecode mismatch. Nothing submitted.`,
      `      compiled  ${(compiledRuntime.length - 2) / 2} bytes`,
      `      on-chain  ${(chainRuntime.length - 2) / 2} bytes`,
    ];
    const shorter = Math.min(compiledRuntime.length, chainRuntime.length);
    let firstDiff = -1;
    for (let i = 2; i < shorter; i++) {
      if (compiledRuntime[i].toLowerCase() !== chainRuntime[i].toLowerCase()) {
        firstDiff = i;
        break;
      }
    }
    if (firstDiff === -1) {
      lines.push(`      identical for ${(shorter - 2) / 2} bytes, then one is longer.`);
    } else {
      const byte = Math.floor((firstDiff - 2) / 2);
      const from = Math.max(2, firstDiff - 32);
      lines.push(`      first difference at byte ${byte} (nibble ${firstDiff - 2}):`);
      lines.push(`        compiled …${compiledRuntime.slice(from, firstDiff + 32)}`);
      lines.push(`        on-chain …${chainRuntime.slice(from, firstDiff + 32)}`);
      // The metadata hash is the last ~51 bytes. A difference confined to the tail means the code is
      // right and an input to the metadata is not — a source file, a setting, or a source *name*.
      const tailStarts = chainRuntime.length - 106;
      lines.push(
        byte * 2 + 2 >= tailStarts
          ? "      The difference is inside the CBOR metadata trailer, so the compiled code matches\n" +
              "      and something feeding the metadata does not: a source file's bytes, a source key,\n" +
              "      or a compiler setting. Do NOT start changing optimizer settings to close it."
          : "      The difference is in executable code, not the metadata trailer — this is not the\n" +
              "      same contract, or not the same compiler version.",
      );
    }
    throw new VerificationError("gate", lines.join("\n"));
  }

  console.log(`  MATCH — identical, including the CBOR metadata trailer.`);
  console.log(`  This is an exact-match submission, not a best-effort one.`);

  // ─── Step 4 — submit ───────────────────────────────────────────────────────────────────────────

  console.log(`\n── Step 4 · submit to Sourcify`);
  console.log(`  POST ${SOURCIFY}/v2/verify/${CHAIN_ID}/${address}`);

  const submission = await fetch(`${SOURCIFY}/v2/verify/${CHAIN_ID}/${address}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ stdJsonInput: standardJsonInput, compilerVersion, contractIdentifier: CONTRACT_IDENTIFIER }),
  });

  const submissionBody = await submission.text();
  console.log(`  → ${submission.status} ${submissionBody.slice(0, 400)}`);

  // 409 means someone already verified it — a success for our purposes, not a failure.
  const alreadyVerified = submission.status === 409;
  if (!submission.ok && !alreadyVerified) {
    throw new VerificationError(
      "submit",
      `Sourcify rejected the submission (${submission.status}).\n` +
        `      The bytecode matched exactly, so this is a Sourcify-side or structural\n` +
        `      rejection rather than a wrong-source one. That distinction is the finding —\n` +
        `      record the response body verbatim rather than retrying with other settings.\n` +
        `      ${submissionBody.slice(0, 400)}`,
    );
  }

  const verificationId = (() => {
    try {
      return (JSON.parse(submissionBody) as { verificationId?: string }).verificationId;
    } catch {
      return undefined;
    }
  })();

  if (verificationId) {
    for (let attempt = 0; attempt < 30; attempt++) {
      const job = await fetchJson<{ isJobCompleted?: boolean; error?: unknown; contract?: unknown }>(
        `${SOURCIFY}/v2/verify/${verificationId}`,
      );
      if (job.isJobCompleted) {
        console.log(`  job ${verificationId} completed`);
        if (job.error) console.log(`  job error: ${JSON.stringify(job.error)}`);
        break;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  // ─── Step 5 — confirm independently ────────────────────────────────────────────────────────────
  // The job result is Sourcify telling us what it did. This re-reads the contract record, which is
  // what HashScan will read.

  console.log(`\n── Step 5 · confirm`);

  type ContractRecord = { match: string | null; runtimeMatch: string | null; creationMatch: string | null };
  const record = await fetchJson<ContractRecord>(`${SOURCIFY}/v2/contract/${CHAIN_ID}/${address}`);
  console.log(`  match         ${record.match ?? "null"}`);
  console.log(`  runtimeMatch  ${record.runtimeMatch ?? "null"}`);
  console.log(`  creationMatch ${record.creationMatch ?? "null"}`);

  // creationMatch is expected to be null: the proxy was created by `new ResolverProxy(...)` inside
  // the factory's deployEquity call, not by a top-level creation transaction, so there is no
  // creation bytecode for Sourcify to fetch. A runtime match is what makes HashScan render source
  // and decode events, and it is sufficient.
  const match = record.match ?? record.runtimeMatch;
  if (!match) {
    throw new VerificationError(
      "confirm",
      `Sourcify still reports no match after an exact-bytecode submission.\n` +
        `      Record the response verbatim — this is the structural-rejection case.`,
    );
  }

  return { address, match, alreadyVerified };
}

/** Where a verified contract renders. Printed by every caller, so it lives here once. */
export const hashScanLink = (address: string): string =>
  `https://hashscan.io/testnet/contract/${address}`;
export const sourcifyLink = (address: string): string =>
  `https://repo.sourcify.dev/${CHAIN_ID}/${address}`;

// ─── CLI ─────────────────────────────────────────────────────────────────────────────────────────
// ⚠️ Only when run directly. Importing this file compiles nothing, submits nothing and reads no
// environment — `scripts/ops/tokenize.ts` imports `verifyAts` and must not inherit an argv parser.

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  const sweep = process.argv.includes("--all");
  const address = process.argv[2];

  if (!sweep && (!address || !/^0x[0-9a-fA-F]{40}$/.test(address))) {
    console.error("usage: npx tsx scripts/ops/verify-ats.ts <0x-contract-address>");
    console.error("       npx tsx --env-file=.env scripts/ops/verify-ats.ts --all");
    console.error("       any ATS report token works — they all share one bytecode.");
    process.exit(1);
  }

  if (!sweep) {
    try {
      const result = await verifyAts(address!);
      console.log(`\nPASS  ${result.address} verified on Sourcify (${result.match}).`);
      if (result.alreadyVerified) console.log(`      It was already verified — 409 is a success here.`);
      console.log(`      HashScan  ${hashScanLink(result.address)}`);
      console.log(`      Sourcify  ${sourcifyLink(result.address)}`);
    } catch (error) {
      const stage = error instanceof VerificationError ? error.stage : "unknown";
      console.error(`\n${stage === "gate" ? "STOP" : "FAIL"}  ${(error as Error).message}`);
      process.exit(1);
    }
  } else {
    // ⚠️ **The sweep exists because tokens are not only minted by this CLI.** `app/api/console/tokenize`
    // mints from a browser and cannot verify — solc is a devDependency and is not in a Vercel
    // function — so anything minted that way arrives here unverified. This is the command that
    // closes the gap for those, and it is idempotent: an already-verified token is skipped in one
    // GET, so running it costs nothing when there is nothing to do.
    const { db, closePool } = await import("../../src/store/db.js");
    const rows = await db()<{ report_hash: string; proxy_address: string; isin: string }[]>`
      SELECT report_hash, proxy_address, isin FROM report_tokens ORDER BY issued_at ASC`;
    await closePool();

    console.log(`\n── Sweeping ${rows.length} token(s) from report_tokens\n`);

    let verified = 0;
    let skipped = 0;
    const failures: { address: string; isin: string; stage: string; message: string }[] = [];

    for (const row of rows) {
      const existing = await sourcifyStatus(row.proxy_address);
      if (existing) {
        console.log(`  ✅ ${row.isin}  ${row.proxy_address}  already ${existing}`);
        skipped++;
        continue;
      }
      console.log(`\n══ ${row.isin}  ${row.proxy_address}  — not verified, submitting`);
      try {
        const result = await verifyAts(row.proxy_address);
        console.log(`\n  ✅ ${row.isin} verified (${result.match})`);
        verified++;
      } catch (error) {
        const stage = error instanceof VerificationError ? error.stage : "unknown";
        console.error(`\n  ❌ ${row.isin} FAILED at ${stage}: ${(error as Error).message}`);
        failures.push({ address: row.proxy_address, isin: row.isin, stage, message: (error as Error).message });
      }
    }

    console.log(`\n── Summary`);
    console.log(`  already verified  ${skipped}`);
    console.log(`  newly verified    ${verified}`);
    console.log(`  failed            ${failures.length}`);
    for (const f of failures) {
      console.log(`    ${f.isin}  ${f.address}  (${f.stage})`);
      console.log(`      retry: npx tsx scripts/ops/verify-ats.ts ${f.address}`);
    }
    console.log(`\n${failures.length === 0 ? "PASS  every report token is verified on Sourcify." : `FAIL — ${failures.length} token(s) unverified.`}\n`);
    process.exit(failures.length === 0 ? 0 : 1);
  }
}

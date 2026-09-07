// Verify an ATS report token on Sourcify, which is what HashScan reads.
//
//   npx tsx scripts/verify-ats.ts 0x60c955b9b2d0896b5EEAF285133891D9A7CF7648
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
// Nothing here needs a key or an .env — it reads public chain data and posts public source.
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

const require = createRequire(import.meta.url);
const solc = require("solc");

const CHAIN_ID = 296; // Hedera testnet
const MIRROR = "https://testnet.mirrornode.hedera.com";
// HashScan's own verifier host 308-redirects here, so this one submission covers both.
const SOURCIFY = "https://sourcify.dev/server";

const CONTRACT_FILE = "contracts/infrastructure/proxy/ResolverProxy.sol";
const CONTRACT_NAME = "ResolverProxy";
const CONTRACT_IDENTIFIER = `${CONTRACT_FILE}:${CONTRACT_NAME}`;

const ATS_ROOT = dirname(require.resolve("@hashgraph/asset-tokenization-contracts/package.json"));
const OZ_ROOT = dirname(require.resolve("@openzeppelin/contracts/package.json"));

const address = process.argv[2];
if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
  console.error("usage: npx tsx scripts/verify-ats.ts <0x-contract-address>");
  console.error("       any ATS report token works — they all share one bytecode.");
  process.exit(1);
}

const fetchJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} → ${response.status} ${await response.text()}`);
  return (await response.json()) as T;
};

// ─── Step 1 — assemble the Standard JSON Input ───────────────────────────────────────────────────
// The source *keys* are load-bearing: they are recorded verbatim in the metadata, so they have to be
// the names hardhat used — `contracts/…` for the package's own files and `@openzeppelin/contracts/…`
// for the one node_modules import. The artifact's own `sourceName` confirms the first form.
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

// ─── Step 2 — compile ────────────────────────────────────────────────────────────────────────────

console.log(`\n── Step 2 · compile`);

const compilerVersion = (() => {
  const matched = solc.version().match(/^(\d+\.\d+\.\d+)\+(commit\.[0-9a-f]+)/);
  if (!matched) throw new Error(`cannot parse solc version "${solc.version()}"`);
  return `${matched[1]}+${matched[2]}`;
})();
console.log(`  solc ${compilerVersion}   optimizer on, runs 100   evmVersion cancun`);

const output = JSON.parse(solc.compile(JSON.stringify(standardJsonInput)));

for (const error of output.errors ?? []) {
  if (error.severity === "error") {
    console.error(`\nSTOP  compilation failed — ${error.formattedMessage ?? error.message}`);
    process.exit(1);
  }
}

const compiled = output.contracts?.[CONTRACT_FILE]?.[CONTRACT_NAME];
if (!compiled) {
  console.error(`\nSTOP  ${CONTRACT_IDENTIFIER} is not in the compiler output.`);
  process.exit(1);
}

const compiledRuntime = `0x${compiled.evm.deployedBytecode.object}`;
console.log(`  compiled runtime  ${(compiledRuntime.length - 2) / 2} bytes`);

// ─── Step 3 — the gate ───────────────────────────────────────────────────────────────────────────
// ⚠️ Nothing is submitted until these bytes are identical, metadata hash included. A near-match
// verifies the wrong thing, and the fix for a mismatch is never "try different optimizer settings
// until it passes" — that is how you certify source that was not what ran.

console.log(`\n── Step 3 · byte-equality against chain`);

type MirrorContract = { contract_id: string; runtime_bytecode: string; deleted: boolean };
const onChain = await fetchJson<MirrorContract>(`${MIRROR}/api/v1/contracts/${address}`);
const chainRuntime = onChain.runtime_bytecode;

console.log(`  ${onChain.contract_id}  ${address}`);
console.log(`  on-chain runtime  ${(chainRuntime.length - 2) / 2} bytes`);

if (compiledRuntime.toLowerCase() !== chainRuntime.toLowerCase()) {
  console.error(`\nSTOP  bytecode mismatch. Nothing submitted.`);
  console.error(`      compiled  ${(compiledRuntime.length - 2) / 2} bytes`);
  console.error(`      on-chain  ${(chainRuntime.length - 2) / 2} bytes`);
  const shorter = Math.min(compiledRuntime.length, chainRuntime.length);
  let firstDiff = -1;
  for (let i = 2; i < shorter; i++) {
    if (compiledRuntime[i].toLowerCase() !== chainRuntime[i].toLowerCase()) {
      firstDiff = i;
      break;
    }
  }
  if (firstDiff === -1) {
    console.error(`      identical for ${(shorter - 2) / 2} bytes, then one is longer.`);
  } else {
    const byte = Math.floor((firstDiff - 2) / 2);
    const from = Math.max(2, firstDiff - 32);
    console.error(`      first difference at byte ${byte} (nibble ${firstDiff - 2}):`);
    console.error(`        compiled …${compiledRuntime.slice(from, firstDiff + 32)}`);
    console.error(`        on-chain …${chainRuntime.slice(from, firstDiff + 32)}`);
    // The metadata hash is the last ~51 bytes. A difference confined to the tail means the code is
    // right and an input to the metadata is not — a source file, a setting, or a source *name*.
    const tailStarts = chainRuntime.length - 106;
    console.error(
      byte * 2 + 2 >= tailStarts
        ? "      The difference is inside the CBOR metadata trailer, so the compiled code matches\n" +
            "      and something feeding the metadata does not: a source file's bytes, a source key,\n" +
            "      or a compiler setting. Do NOT start changing optimizer settings to close it."
        : "      The difference is in executable code, not the metadata trailer — this is not the\n" +
            "      same contract, or not the same compiler version.",
    );
  }
  process.exit(1);
}

console.log(`  MATCH — identical, including the CBOR metadata trailer.`);
console.log(`  This is an exact-match submission, not a best-effort one.`);

// ─── Step 4 — submit ─────────────────────────────────────────────────────────────────────────────

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
if (!submission.ok && submission.status !== 409) {
  console.error(`\nFAIL  Sourcify rejected the submission (${submission.status}).`);
  console.error(`      The bytecode matched exactly, so this is a Sourcify-side or structural`);
  console.error(`      rejection rather than a wrong-source one. That distinction is the finding —`);
  console.error(`      record the response body verbatim rather than retrying with other settings.`);
  process.exit(1);
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

// ─── Step 5 — confirm independently ──────────────────────────────────────────────────────────────
// The job result is Sourcify telling us what it did. This re-reads the contract record, which is
// what HashScan will read.

console.log(`\n── Step 5 · confirm`);

type ContractRecord = { match: string | null; runtimeMatch: string | null; creationMatch: string | null };
const record = await fetchJson<ContractRecord>(`${SOURCIFY}/v2/contract/${CHAIN_ID}/${address}`);
console.log(`  match         ${record.match ?? "null"}`);
console.log(`  runtimeMatch  ${record.runtimeMatch ?? "null"}`);
console.log(`  creationMatch ${record.creationMatch ?? "null"}`);

// creationMatch is expected to be null: the proxy was created by `new ResolverProxy(...)` inside the
// factory's deployEquity call, not by a top-level creation transaction, so there is no creation
// bytecode for Sourcify to fetch. A runtime match is what makes HashScan render source and decode
// events, and it is sufficient.
if (!record.match && !record.runtimeMatch) {
  console.error(`\nFAIL  Sourcify still reports no match after an exact-bytecode submission.`);
  console.error(`      Record the response verbatim — this is the structural-rejection case.`);
  process.exit(1);
}

console.log(`\nPASS  ${address} verified on Sourcify (${record.match ?? record.runtimeMatch}).`);
console.log(`      HashScan  https://hashscan.io/testnet/contract/${address}`);
console.log(`      Sourcify  https://repo.sourcify.dev/${CHAIN_ID}/${address}`);

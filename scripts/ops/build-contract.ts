// Compile `contracts/AlphaMarket.sol` into a committed TypeScript module, and refuse when the two
// drift apart.
//
//   npx tsx scripts/ops/build-contract.ts            ← compile and WRITE src/arc/abi.ts
//   npx tsx scripts/ops/build-contract.ts --check    ← compile and COMPARE; exits 1 on drift
//
// ⚠️ **The artifact is committed because nothing compiled ships to Vercel.** `solc` and
// `@openzeppelin/contracts` are devDependencies and are absent from a deployed function — the same
// constraint that stops `tokenize/ats.ts` verifying its own tokens. `next build` and the settlement
// code both have to find the ABI already on disk.
//
// ⚠️ **A stale ABI is the failure this file exists to prevent, and it does not look broken.** It
// decodes the wrong fields against a live contract holding real USDC and returns plausible garbage.
// This project has already shipped a generated-file-that-drifts once: `tokenize.ts` printed a verify
// command and trusted a person to run it, and three of four report tokens sat unverified against a
// pass/fail requirement until someone went looking. **So `--check` refuses; it never warns.**
//
// ── What this reuses from `scripts/ops/verify-ats.ts`, and what it deliberately does not ─────────
//
// Reused, as a pattern rather than an import: the lazy `createRequire` + `require("solc")`, the
// Standard JSON Input shape, the version assertion, and the compile-then-compare-bytes-and-refuse
// gate. That gate is the thing worth copying and four report tokens depend on the original.
//
// ⚠️ **NOT imported, and the reason is mechanical rather than stylistic.** `verify-ats.ts` resolves
// `@hashgraph/asset-tokenization-contracts` and `@openzeppelin/contracts` at MODULE SCOPE (its lines
// 69–70) and imports `MIRROR`, which pulls in `ethers` and the ATS typechain. Importing it here would
// execute two `require.resolve` calls on contract packages — one of them a devDependency — in the one
// code path that has to keep working when the compiler is missing. A prebuild check that dies on an
// unrelated missing package is worse than the drift it was added to catch.
//
// ⚠️ **The trace half is not reused because there is nothing to trace.** `AlphaMarket.sol` imports
// nothing at all — zero `import` statements, by decision in Unit 2 — so the closure is one file.
//
// ⚠️ **The SETTINGS below are OURS and are deliberately not shared with `verify-ats.ts`.** That
// file's settings are a *reproduction* of ATS's upstream hardhat config, reverse-engineered from a
// CBOR trailer because the package ships no build-info. Ours are an *original choice* about our own
// contract. They coincide today. Coupling them would mean a third party changing their build config
// silently changing the bytecode we deploy, which is exactly the class of surprise this codebase
// spends its comments avoiding.

import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const require = createRequire(import.meta.url);
// ⚠️ Lazy, inside a try. Merely running this script must not require the compiler — the `--check`
// path has a tier that works without it.
const loadSolc = () => require('solc');

const SOURCE = 'contracts/AlphaMarket.sol';
const CONTRACT = 'AlphaMarket';
const ARTIFACT = 'src/arc/abi.ts';

/**
 * ⚠️ **Pinned exactly, including the commit hash.** Unit 2 measured that `cancun` and `paris` produce
 * different bytecode for this source — 4,783 against 4,871 deployed bytes — so the compiler and the
 * target are part of what the artifact IS, not incidental to it. A different solc build produces
 * different bytes and this refuses rather than silently rewriting the artifact.
 */
const PINNED_SOLC = '0.8.28+commit.7893614a';

/** ⚠️ Recorded INTO the artifact, so a reader knows what produced the bytes they are about to deploy. */
const SETTINGS = { optimizer: { enabled: true, runs: 100 }, evmVersion: 'cancun' } as const;

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

interface Built {
  readonly abi: unknown[];
  readonly creation: string;
  readonly deployed: string;
  readonly compiler: string;
  readonly sourceHash: string;
}

/** ⚠️ Thrown for every refusal, so `--check` has exactly one exit path and one shape of message. */
class BuildError extends Error {}

function compile(): Built {
  if (!existsSync(SOURCE)) throw new BuildError(`${SOURCE} does not exist. There is nothing to build.`);
  const text = readFileSync(SOURCE, 'utf8');

  let solc;
  try {
    solc = loadSolc();
  } catch (error) {
    throw new BuildError(
      'solc is not available in this environment. It is a devDependency, so this runs on a machine ' +
      `with the full dependency tree and not inside a deployed function. (${(error as Error).message})`,
    );
  }

  const version = solc.version() as string;
  // ⚠️ Asserted, not reported. A different compiler build is a different artifact.
  if (!version.startsWith(PINNED_SOLC)) {
    throw new BuildError(
      `solc is ${version} but this build is pinned to ${PINNED_SOLC}. The pin is load-bearing: the ` +
      'bytecode in the artifact is what gets deployed, and a different compiler produces different ' +
      'bytes. Reinstall the pinned devDependency rather than changing this constant.',
    );
  }

  const output = JSON.parse(solc.compile(JSON.stringify({
    language: 'Solidity',
    sources: { [SOURCE]: { content: text } },
    settings: {
      ...SETTINGS,
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } },
    },
  })));

  // ⚠️ Warnings are printed and do not stop the build; errors do. Unit 2 compiled with zero of
  // either, so anything appearing here is new and worth reading before it is deployed.
  for (const d of output.errors ?? []) {
    if (d.severity === 'error') throw new BuildError(`compilation failed —\n${d.formattedMessage ?? d.message}`);
    console.log(`  ⚠️  ${d.severity}: ${(d.formattedMessage ?? d.message).trim().split('\n')[0]}`);
  }

  const compiled = output.contracts?.[SOURCE]?.[CONTRACT];
  if (!compiled) throw new BuildError(`${CONTRACT} is not in the compiler output for ${SOURCE}.`);

  return {
    abi: compiled.abi,
    creation: `0x${compiled.evm.bytecode.object}`,
    deployed: `0x${compiled.evm.deployedBytecode.object}`,
    compiler: version.match(/^(\d+\.\d+\.\d+\+commit\.[0-9a-f]+)/)?.[1] ?? version,
    sourceHash: sha256(text),
  };
}

/**
 * ⚠️ **No timestamp, no build id, nothing that changes when the inputs did not.** A generated file
 * that rewrites itself on every run produces a diff for every build, and a diff nobody reads is how
 * a real change gets waved through. This file changes only when the contract or the settings do.
 */
function render(b: Built): string {
  return `// GENERATED — DO NOT EDIT BY HAND.
//
// Written by \`scripts/ops/build-contract.ts\` from \`${SOURCE}\`.
// Regenerate with:  npm run build:contract
//
// ⚠️ **This file is committed because nothing compiled ships to Vercel.** \`solc\` is a
// devDependency and is absent from a deployed function, so the ABI and bytecode have to already be
// on disk for \`next build\` and for the settlement code that decodes this contract's events.
//
// ⚠️ **\`npm run build\` refuses if this file drifts from the contract.** See \`prebuild\` in
// package.json. Editing this by hand will be caught the next time anything is built.

/** The compile that produced the bytecode below. ⚠️ Part of what the artifact IS, not a comment. */
export const ALPHA_MARKET_BUILD = {
  contract: ${JSON.stringify(CONTRACT)},
  source: ${JSON.stringify(SOURCE)},
  /** sha256 of the source file, as UTF-8. What the drift check compares when solc is unavailable. */
  sourceHash: ${JSON.stringify(b.sourceHash)},
  compiler: ${JSON.stringify(b.compiler)},
  settings: ${JSON.stringify(SETTINGS)},
  /** ⚠️ 4783 under evmVersion cancun, 4871 under paris. If this reads 4871 the target is wrong. */
  deployedBytecodeLength: ${(b.deployed.length - 2) / 2},
} as const;

export const ALPHA_MARKET_ABI = ${JSON.stringify(b.abi, null, 2)};

/** Creation bytecode — what a deployment sends. The constructor takes \`address resolver_\`. */
export const ALPHA_MARKET_BYTECODE = ${JSON.stringify(b.creation)};

/** Runtime bytecode — what \`eth_getCode\` returns, for confirming a deployment is this build. */
export const ALPHA_MARKET_DEPLOYED_BYTECODE = ${JSON.stringify(b.deployed)};
`;
}

// ─── The two entry points ────────────────────────────────────────────────────────────────────────

const checking = process.argv.includes('--check');

async function main(): Promise<void> {
  if (!checking) {
    const built = compile();
    writeFileSync(ARTIFACT, render(built));
    console.log(`\n── built ${ARTIFACT}`);
    console.log(`  solc        ${built.compiler}`);
    console.log(`  settings    optimizer on, runs ${SETTINGS.optimizer.runs} · evmVersion ${SETTINGS.evmVersion}`);
    console.log(`  sourceHash  ${built.sourceHash}`);
    console.log(`  abi         ${built.abi.length} entries`);
    console.log(`  deployed    ${(built.deployed.length - 2) / 2} bytes`);
    console.log(`\nPASS  artifact written. ⚠️ Commit it — the app imports it and cannot compile one.\n`);
    return;
  }

  // ─── --check ───────────────────────────────────────────────────────────────────────────────────
  //
  // ⚠️ **Two tiers, because the compiler is not guaranteed to be here and a check that silently
  // passes without one is worse than no check at all.**
  //
  //   tier 1  no compiler needed — the artifact exists, parses, and its recorded sourceHash matches
  //           a hash of the .sol on disk. Catches the common case: someone edited the contract and
  //           did not rebuild.
  //   tier 2  needs solc — recompile and compare ABI and both bytecodes byte for byte. Catches a
  //           hand-edited artifact, a changed compiler and changed settings, none of which move the
  //           source hash.
  //
  // ⚠️ **Tier 2 being skipped is reported loudly and is never silent.** Tier 1 still has to pass.

  if (!existsSync(ARTIFACT)) {
    throw new BuildError(`${ARTIFACT} does not exist. Run: npm run build:contract`);
  }

  const existing = (await import('../../src/arc/abi.js')) as {
    ALPHA_MARKET_BUILD: { sourceHash: string; compiler: string; settings: unknown; deployedBytecodeLength: number };
    ALPHA_MARKET_ABI: unknown[];
    ALPHA_MARKET_BYTECODE: string;
    ALPHA_MARKET_DEPLOYED_BYTECODE: string;
  };

  console.log(`\n── checking ${ARTIFACT} against ${SOURCE}`);

  // ── tier 1 ──
  const onDisk = sha256(readFileSync(SOURCE, 'utf8'));
  if (onDisk !== existing.ALPHA_MARKET_BUILD.sourceHash) {
    throw new BuildError(
      `${SOURCE} has changed since ${ARTIFACT} was written.\n` +
      `        artifact records  ${existing.ALPHA_MARKET_BUILD.sourceHash}\n` +
      `        source hashes to  ${onDisk}\n\n` +
      '        The committed ABI and bytecode no longer describe the contract. A stale ABI decodes\n' +
      '        the wrong fields against a live contract holding real USDC and looks like it worked.\n\n' +
      '        Fix:  npm run build:contract   — then commit the regenerated artifact.',
    );
  }
  console.log(`  ✅ tier 1 · source hash matches   ${onDisk.slice(0, 16)}…`);

  // ── tier 2 ──
  let built: Built;
  try {
    built = compile();
  } catch (error) {
    if (error instanceof BuildError && error.message.startsWith('solc is not available')) {
      console.log('  ⚠️  tier 2 · SKIPPED — no compiler in this environment, so the bytecode was NOT');
      console.log('              re-derived. Tier 1 passed, which catches an edited contract but not');
      console.log('              an edited artifact. This is a weaker check and it is saying so.');
      console.log(`\nPASS  ${ARTIFACT} is consistent with ${SOURCE} as far as could be checked here.\n`);
      return;
    }
    throw error;
  }

  const differs: string[] = [];
  if (built.compiler !== existing.ALPHA_MARKET_BUILD.compiler) {
    differs.push(`compiler: artifact ${existing.ALPHA_MARKET_BUILD.compiler}, now ${built.compiler}`);
  }
  if (JSON.stringify(SETTINGS) !== JSON.stringify(existing.ALPHA_MARKET_BUILD.settings)) {
    differs.push(`settings: artifact ${JSON.stringify(existing.ALPHA_MARKET_BUILD.settings)}, now ${JSON.stringify(SETTINGS)}`);
  }
  if (JSON.stringify(built.abi) !== JSON.stringify(existing.ALPHA_MARKET_ABI)) differs.push('the ABI differs');
  if (built.creation !== existing.ALPHA_MARKET_BYTECODE) differs.push('the creation bytecode differs');
  if (built.deployed !== existing.ALPHA_MARKET_DEPLOYED_BYTECODE) {
    differs.push(
      `the deployed bytecode differs — artifact ${(existing.ALPHA_MARKET_DEPLOYED_BYTECODE.length - 2) / 2} bytes, ` +
      `recompiled ${(built.deployed.length - 2) / 2}`,
    );
  }

  if (differs.length > 0) {
    throw new BuildError(
      `${ARTIFACT} does not match a fresh compile of ${SOURCE}, even though the source hash agrees.\n` +
      differs.map((d) => `          · ${d}`).join('\n') +
      '\n\n        The source is unchanged, so either the artifact was edited by hand or the compiler\n' +
      '        settings moved. Both change what gets deployed.\n\n' +
      '        Fix:  npm run build:contract   — then commit the regenerated artifact.',
    );
  }

  console.log(`  ✅ tier 2 · recompiled and identical   ${(built.deployed.length - 2) / 2} deployed bytes`);
  console.log(`             solc ${built.compiler} · optimizer on runs ${SETTINGS.optimizer.runs} · evmVersion ${SETTINGS.evmVersion}`);
  console.log(`\nPASS  ${ARTIFACT} is the compile of ${SOURCE}.\n`);
}

try {
  await main();
} catch (error) {
  if (error instanceof BuildError) {
    // ⚠️ REFUSES, never warns. A soft-failing check is one people learn to scroll past, and this one
    // stands between a hand-edited ABI and a contract holding real money.
    console.error(`\nSTOP  ${error.message}\n`);
    process.exit(1);
  }
  throw error;
}

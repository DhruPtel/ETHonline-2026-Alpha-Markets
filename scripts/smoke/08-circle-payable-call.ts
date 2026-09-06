// SM-08 — a Circle developer-controlled wallet makes a payable call on Arc testnet.
//
// Six steps, each of which can stop the run:
//   1. provision — a wallet set and ONE EOA wallet, reused across runs
//   2. measure Arc's eth_getLogs ceiling (U10) — needs no funding, so it runs before the faucet
//   3. fund the wallet from Circle's faucet
//   4. deploy a receiver that logs msg.value
//   5. call it through Circle with a payable amount, polling the async state machine
//   6. read the emitted msg.value and say which decimal scale arrived
//
// ⚠️ THE QUESTION THIS TEST EXISTS TO ANSWER. Arc's native USDC is 18 decimals for gas; the ERC-20
// at the same address reports 6 (measured: decimals() on 0x3600…0000 returns 6). If the market
// contract stores msg.value as a USDC amount at the wrong scale every number is off by 10^12. We
// send "2.50" and read back what the chain saw.
//
// ⚠️ accountType is EOA, never SCA. The market contract derives the author from msg.sender, and an
// EOA's Circle wallet address is deterministic. Plan-level, not negotiable.
//
// Circle's SDK has no client-side spend controls — that was @x402/core's in SM-05 and it does not
// transfer. Circle's limits are server-side wallet-set policy, set in the console. Nothing to
// configure here; a cap on the wallet set is tracked as a to-do in smoke-results.md.
//
// Contract deployment does not go through Circle: `deployContract` ships in the package's typings
// but is not exposed on the developer-controlled-wallets client. Step 4 uses ethers with
// ARC_DEPLOYER_KEY, which is a separate funded EOA and touches nothing else in the test.

import { createRequire } from "node:module";

import { ethers } from "ethers";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

const require = createRequire(import.meta.url);
const solc = require("solc");

const BLOCKCHAIN = "ARC-TESTNET" as const;
const CHAIN_ID = 5042002n;
const RPC = "https://rpc.testnet.arc.network";
const EXPLORER = "https://testnet.arcscan.app";
const NATIVE_USDC = "0x3600000000000000000000000000000000000000";

// Deliberately not a round number of wei at either scale, so a misread is obvious.
const PAYABLE_AMOUNT = "2.50";

const env = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    console.error(`FAIL  ${name} is not set. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
  return value.trim();
};

const CIRCLE_API_KEY = env("CIRCLE_API_KEY");
const CIRCLE_ENTITY_SECRET = env("CIRCLE_ENTITY_SECRET");
const ARC_DEPLOYER_KEY = env("ARC_DEPLOYER_KEY");
const EXISTING_WALLET_ID = process.env.CIRCLE_WALLET_ID?.trim();

const circle = initiateDeveloperControlledWalletsClient({
  apiKey: CIRCLE_API_KEY,
  entitySecret: CIRCLE_ENTITY_SECRET,
});

const provider = new ethers.JsonRpcProvider(RPC);
const seconds = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;

// ─── Step 1 — provision ──────────────────────────────────────────────────────────────────────────
// ⚠️ Reused, never recreated. A second wallet would silently change msg.sender, and the market
// contract derives the author from it — so a stale CIRCLE_WALLET_ID is a wrong-author bug, not an
// inconvenience.

console.log(`\n── Step 1 · provision`);

const chainId = (await provider.getNetwork()).chainId;
console.log(`  ${RPC}  chainId ${chainId}`);
if (chainId !== CHAIN_ID) {
  console.error(`\nSTOP  chainId ${chainId} is not Arc testnet (${CHAIN_ID}).`);
  process.exit(1);
}

let walletId: string;
let walletAddress: string;

if (EXISTING_WALLET_ID) {
  const existing = await circle.getWallet({ id: EXISTING_WALLET_ID });
  const wallet = existing.data?.wallet;
  if (!wallet) {
    console.error(`\nSTOP  CIRCLE_WALLET_ID=${EXISTING_WALLET_ID} does not resolve to a wallet.`);
    console.error("      Do not let this fall through to creating a new one — clear the variable");
    console.error("      deliberately if you actually want a fresh wallet.");
    process.exit(1);
  }
  walletId = wallet.id;
  walletAddress = wallet.address;
  console.log(`  reusing CIRCLE_WALLET_ID  ${walletId}`);
  console.log(`  address ${walletAddress}  accountType ${wallet.accountType}  blockchain ${wallet.blockchain}`);
  if (wallet.accountType !== "EOA") {
    console.error(`\nSTOP  wallet ${walletId} is ${wallet.accountType}, not EOA.`);
    console.error("      msg.sender must come from an EOA. Provision a new wallet set.");
    process.exit(1);
  }
} else {
  const walletSet = await circle.createWalletSet({ name: `alpha-markets ${new Date().toISOString().slice(0, 10)}` });
  const walletSetId = walletSet.data?.walletSet?.id;
  if (!walletSetId) {
    console.error(`\nSTOP  createWalletSet returned no id: ${JSON.stringify(walletSet.data)}`);
    process.exit(1);
  }
  console.log(`  created wallet set ${walletSetId}`);

  const created = await circle.createWallets({
    walletSetId,
    blockchains: [BLOCKCHAIN],
    accountType: "EOA",
    count: 1,
  });
  const wallet = created.data?.wallets?.[0];
  if (!wallet) {
    console.error(`\nSTOP  createWallets returned nothing: ${JSON.stringify(created.data)}`);
    process.exit(1);
  }
  walletId = wallet.id;
  walletAddress = wallet.address;
  console.log(`  created wallet ${walletId}`);
  console.log(`  address ${walletAddress}  accountType ${wallet.accountType}`);
  console.log(`\n  ┌─ SAVE THIS so the next run reuses the wallet instead of making another ─────────┐`);
  console.log(`  │  CIRCLE_WALLET_ID=${walletId}                       │`);
  console.log(`  └────────────────────────────────────────────────────────────────────────────────┘`);
}

// ─── Step 2 — Arc's eth_getLogs ceiling ──────────────────────────────────────────────────────────
// U10, and PLAN-v4 §5.18's reason for asking it: the stake UI POSTs its tx hash and the app reads
// the receipt, but the ticker's backstop sweeps eth_getLogs over a "bounded range". Bounded needs a
// number, and the number has to come from Arc rather than from a default copied off another chain.
//
// ⚠️ Two ceilings, because Arc enforces two different limits and only one of them is about range.
// The quiet pass filters an address with no logs, so the result count can never bind and what gets
// measured is the block span alone. The busy pass filters native USDC, where the cap on returned
// logs bites first. A sweep has to respect whichever is lower for the address it is actually
// watching — and for a quiet market contract that is the span, not the count.
//
// Needs no funding, so it runs before the faucet gate and produces its answer even when the faucet
// is refusing.

console.log(`\n── Step 2 · Arc eth_getLogs ceiling`);

const head = await provider.getBlockNumber();
console.log(`  head block ${head}`);

// No contract, so no logs, so nothing but the span can make this fail.
const QUIET = "0x00000000000000000000000000000000000ab1e5";

type Refusal = { code: number | string; message: string };
type Sweep = { ok: true; logs: number } | { ok: false; refusal: Refusal };

const sweep = async (address: string, span: number): Promise<Sweep> => {
  const from = Math.max(0, head - span + 1);
  try {
    const logs: unknown[] = await provider.send("eth_getLogs", [
      { address, fromBlock: `0x${from.toString(16)}`, toBlock: `0x${head.toString(16)}` },
    ]);
    return { ok: true, logs: logs.length };
  } catch (error) {
    const err = error as { error?: Refusal; shortMessage?: string; message?: string };
    return {
      ok: false,
      refusal: err.error ?? { code: "?", message: err.shortMessage ?? err.message ?? String(error) },
    };
  }
};

// Double until it breaks, then bisect — doubling alone can only ever report a power of two.
const ceiling = async (label: string, address: string) => {
  let ok = 0;
  let okLogs = 0;
  let bad = 0;
  let refusal: Refusal | undefined;

  for (let span = 1; span <= head + 1; span *= 2) {
    const result = await sweep(address, span);
    if (!result.ok) {
      bad = span;
      refusal = result.refusal;
      break;
    }
    ok = span;
    okLogs = result.logs;
  }

  if (!bad) {
    console.log(`  ${label}  never refused, up to the whole chain (${ok} blocks)`);
    return { span: ok, logs: okLogs, refusal };
  }

  while (bad - ok > 1) {
    const mid = ok + Math.floor((bad - ok) / 2);
    const result = await sweep(address, mid);
    if (result.ok) {
      ok = mid;
      okLogs = result.logs;
    } else {
      bad = mid;
      refusal = result.refusal;
    }
  }

  console.log(`  ${label}  ${ok} blocks ok (${okLogs} logs), ${bad} refused`);
  console.log(`  ${label}  ${refusal!.code}  ${refusal!.message}`);
  return { span: ok, logs: okLogs, refusal };
};

const quiet = await ceiling("quiet ", QUIET);
const busy = await ceiling("busy  ", NATIVE_USDC);

// ⚠️ The two numbers are not the same kind of number. The quiet ceiling is a configured block-span
// limit and comes back identical on every run. The busy one is a block count standing in for a cap
// on rows returned, so it moves with traffic — the log count beside it is the figure that carries.
console.log(`\n  ⇒ U10 — Arc caps eth_getLogs at ${quiet.span} blocks of span.`);
console.log(`    A quiet contract, which is what a market is, gets the full ${quiet.span}.`);
console.log(`    Native USDC refused past ${busy.span} blocks / ${busy.logs} logs — a row cap, not a`);
console.log(`    span cap, so it drifts with traffic and only the log figure is worth carrying.`);
console.log(`\n  ⚠️ Arc's error strings understate both limits. Refusals cite "limited to a 10,000`);
console.log(`     range" and "max results 20000"; measured, the span limit is ${quiet.span} and a query`);
console.log(`     returning ${busy.logs} rows was accepted. Size sweeps from measurement, and on a`);
console.log(`     refusal follow the sub-range the server names rather than the number it quotes.`);

// ─── Step 3 — fund ───────────────────────────────────────────────────────────────────────────────
// On Arc, USDC *is* the native token, so the faucet's USDC is what pays for gas and what msg.value
// carries. Balance is read from the RPC rather than from Circle, so the number is the chain's.

console.log(`\n── Step 3 · fund`);

const rawBalance = async (): Promise<bigint> => provider.getBalance(walletAddress);
const before = await rawBalance();
console.log(`  balance before  ${before} raw`);

if (before === 0n) {
  console.log(`  requesting testnet USDC from Circle's faucet…`);
  try {
    await circle.requestTestnetTokens({ address: walletAddress, blockchain: BLOCKCHAIN, usdc: true });
  } catch (error) {
    const err = error as { response?: { status?: number; data?: unknown }; message?: string };
    console.error(`\nSTOP  faucet request failed — ${err.message ?? String(error)}`);
    if (err.response?.data) console.error(`      ${JSON.stringify(err.response.data).slice(0, 300)}`);
    console.error(`      Reporting rather than working around it, as the unit requires.`);
    process.exit(1);
  }

  // The faucet is asynchronous; it returns before the transfer lands.
  let funded = 0n;
  for (let attempt = 0; attempt < 60; attempt++) {
    funded = await rawBalance();
    if (funded > 0n) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (funded === 0n) {
    console.error(`\nSTOP  the faucet did not deliver within 120s. Balance is still 0.`);
    console.error(`      Not working around it. Fund ${walletAddress} and re-run.`);
    process.exit(1);
  }
  console.log(`  balance after   ${funded} raw`);
} else {
  console.log(`  already funded — skipping the faucet`);
}

const funded = await rawBalance();
// Printed both ways on purpose: this is the same ambiguity the whole test is about, and the wallet
// balance is the first place it shows up.
console.log(`  ${ethers.formatUnits(funded, 18)} at 18dp  ·  ${ethers.formatUnits(funded, 6)} at 6dp`);

// ─── Step 4 — deploy the receiver ────────────────────────────────────────────────────────────────
// Compiled in-process with the solc 0.8.28 already pinned for scripts/verify-ats.ts, so the contract
// is three lines of readable source rather than a hex blob nobody can check.

console.log(`\n── Step 4 · deploy receiver`);

const RECEIVER_SOURCE = `// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

contract Receiver {
    event Received(address sender, uint256 value);

    function ping() external payable {
        emit Received(msg.sender, msg.value);
    }
}
`;

const compiled = JSON.parse(
  solc.compile(
    JSON.stringify({
      language: "Solidity",
      sources: { "Receiver.sol": { content: RECEIVER_SOURCE } },
      settings: {
        optimizer: { enabled: true, runs: 200 },
        outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
      },
    }),
  ),
);
for (const error of compiled.errors ?? []) {
  if (error.severity === "error") {
    console.error(`\nSTOP  receiver failed to compile — ${error.formattedMessage}`);
    process.exit(1);
  }
}
const artifact = compiled.contracts["Receiver.sol"].Receiver;

const deployer = new ethers.Wallet(`0x${ARC_DEPLOYER_KEY.replace(/^0x/, "")}`, provider);
const deployerBalance = await provider.getBalance(deployer.address);
console.log(`  deployer ${deployer.address}  ${deployerBalance} raw`);
if (deployerBalance === 0n) {
  console.error(`\nSTOP  ARC_DEPLOYER_KEY has no balance and cannot pay for the deploy.`);
  console.error(`      Fund ${deployer.address} on Arc testnet and re-run.`);
  process.exit(1);
}

const factory = new ethers.ContractFactory(artifact.abi, artifact.evm.bytecode.object, deployer);
const receiver = await factory.deploy();
const deployTx = receiver.deploymentTransaction()!;
await receiver.waitForDeployment();
const receiverAddress = await receiver.getAddress();
console.log(`  deployed ${receiverAddress}`);
console.log(`  tx       ${deployTx.hash}`);

// ─── Step 5 — the payable call, through Circle ───────────────────────────────────────────────────
// ⚠️ The async model, and the reason this step is timed. createContractExecutionTransaction returns
// { id, state: "INITIATED" } — no transaction hash. The hash appears part-way through a state
// machine you have to poll. A serverless function cannot hold a request open for this, which is the
// Phase 4 problem this measurement is for.

console.log(`\n── Step 5 · payable call through Circle`);
console.log(`  ping() with amount "${PAYABLE_AMOUNT}" → ${receiverAddress}`);

const submittedAt = Date.now();
const execution = await circle.createContractExecutionTransaction({
  walletId,
  contractAddress: receiverAddress,
  abiFunctionSignature: "ping()",
  abiParameters: [],
  amount: PAYABLE_AMOUNT,
  fee: { type: "level", config: { feeLevel: "MEDIUM" } },
});

const transactionId = execution.data?.id;
console.log(`  → id ${transactionId}  state ${execution.data?.state}  (no hash yet)`);
if (!transactionId) {
  console.error(`\nSTOP  no transaction id returned: ${JSON.stringify(execution.data)}`);
  process.exit(1);
}

const TERMINAL = new Set(["COMPLETE", "CONFIRMED", "FAILED", "DENIED", "CANCELLED"]);
let state = execution.data?.state ?? "INITIATED";
let txHash: string | undefined;
let hashSeenAt: number | undefined;
let seen = state;

for (let attempt = 0; attempt < 120; attempt++) {
  const polled = await circle.getTransaction({ id: transactionId });
  const transaction = polled.data?.transaction;
  state = transaction?.state ?? state;
  if (transaction?.txHash && !txHash) {
    txHash = transaction.txHash;
    hashSeenAt = Date.now();
    console.log(`  ${seconds(hashSeenAt - submittedAt).padStart(6)}  hash ${txHash}`);
  }
  if (state !== seen) {
    console.log(`  ${seconds(Date.now() - submittedAt).padStart(6)}  ${seen} → ${state}`);
    seen = state;
  }
  if (TERMINAL.has(state)) break;
  await new Promise((r) => setTimeout(r, 1000));
}

const settledAt = Date.now();
console.log(`  final state ${state} after ${seconds(settledAt - submittedAt)}`);

if (state === "FAILED" || state === "DENIED" || state === "CANCELLED") {
  console.error(`\nFAIL  Circle reported ${state}.`);
  const failed = await circle.getTransaction({ id: transactionId });
  console.error(`      ${JSON.stringify(failed.data?.transaction).slice(0, 500)}`);
  process.exit(1);
}
if (!txHash) {
  console.error(`\nFAIL  reached ${state} without ever producing a transaction hash.`);
  process.exit(1);
}

// ─── Step 6 — read msg.value back off the chain ──────────────────────────────────────────────────
// ⚠️ The answer. Not what Circle says it sent — what the contract saw.

console.log(`\n── Step 6 · what arrived`);

const receipt = await provider.waitForTransaction(txHash);
if (!receipt) {
  console.error(`\nFAIL  no receipt for ${txHash}.`);
  process.exit(1);
}

const iface = new ethers.Interface(artifact.abi);
const received = receipt.logs
  .map((log) => {
    try {
      return iface.parseLog(log);
    } catch {
      return null;
    }
  })
  .find((parsed) => parsed?.name === "Received");

if (!received) {
  console.error(`\nFAIL  no Received event in ${txHash}. The call did not reach ping().`);
  process.exit(1);
}

const emittedSender = received.args[0] as string;
const emittedValue = received.args[1] as bigint;

console.log(`  sender     ${emittedSender}`);
console.log(`  msg.value  ${emittedValue}  (raw)`);
console.log(`  we sent    "${PAYABLE_AMOUNT}"`);
console.log();
console.log(`  read as  6 decimals →  ${ethers.formatUnits(emittedValue, 6)}`);
console.log(`  read as 18 decimals →  ${ethers.formatUnits(emittedValue, 18)}`);

const at6 = ethers.parseUnits(PAYABLE_AMOUNT, 6);
const at18 = ethers.parseUnits(PAYABLE_AMOUNT, 18);
const scale = emittedValue === at18 ? 18 : emittedValue === at6 ? 6 : null;

console.log();
if (scale === null) {
  console.error(`FAIL  msg.value matches neither scale.`);
  console.error(`      expected ${at6} (6dp) or ${at18} (18dp), got ${emittedValue}.`);
  console.error(`      Do not guess a scale from this — find out what it is before Phase 4 stores it.`);
  process.exit(1);
}
console.log(`  ⇒ msg.value arrives at ${scale} DECIMALS. "${PAYABLE_AMOUNT}" became ${emittedValue}.`);
console.log(
  scale === 18
    ? `    Native USDC on Arc is 18dp for value transfer, while the ERC-20 view at\n` +
        `    ${NATIVE_USDC} reports 6. Anything storing msg.value as a USDC\n` +
        `    amount must divide by 10^12 first.`
    : `    msg.value is already at the ERC-20 scale, so no conversion is needed —\n` +
        `    but assert it rather than assume it, because the gas denomination is 18dp.`,
);

if (emittedSender.toLowerCase() !== walletAddress.toLowerCase()) {
  console.error(`\nFAIL  msg.sender ${emittedSender} is not the Circle wallet ${walletAddress}.`);
  console.error(`      The market contract derives the author from msg.sender, so this must hold.`);
  process.exit(1);
}

console.log(`\n── Result`);
console.log(`  wallet      ${walletAddress}  (Circle ${walletId}, EOA)`);
console.log(`  receiver    ${receiverAddress}`);
console.log(`  deploy tx   ${EXPLORER}/tx/${deployTx.hash}`);
console.log(`  payable tx  ${EXPLORER}/tx/${txHash}`);
console.log(`  latency     ${seconds(settledAt - submittedAt)} submit → ${state}` +
  (hashSeenAt ? `, hash at ${seconds(hashSeenAt - submittedAt)}` : ""));

console.log(`\nPASS  SM-08. msg.sender is the Circle EOA and msg.value arrives at ${scale} decimals.`);

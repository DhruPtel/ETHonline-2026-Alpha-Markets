// SM-07 — issue an ATS report token on Hedera testnet and transfer it to a buyer.
//
// Six steps, each of which can stop the run:
//   1. the public factory and resolver are alive, and their expiry is recorded
//   2. both accounts resolve to EVM addresses that Mirror Node agrees with
//   3. deployEquity — one ResolverProxy, compliance off, report hash in the creation event
//   4. grantRole(ROLE_ISSUER) — creation grants only DEFAULT_ADMIN
//   5. issue 1 token to the seller
//   6. transfer it to the buyer — the lifecycle operation the track asks for
//
// ⚠️ PASS is not "visible on HashScan". Proxy creation is not issuance. PASS is
// balanceOf(buyer) 0 → 1 and balanceOf(seller) 1 → 0, asserted at the bottom.
//
// We drive the published ABI package with ethers over the JSON-RPC relay, not
// @hashgraph/asset-tokenization-sdk — see docs/research/asset-tokenization-studio.md for why
// (1.4 GB, no server-side private-key signer, escape hatches not exported). The Hedera track
// accepts "SDK, contracts, web application, or a combination"; the contracts are ATS.

import { ethers } from "ethers";
import { Factory__factory, IAsset__factory } from "@hashgraph/asset-tokenization-contracts";

// The public ATS testnet infrastructure. Not ours — see the expiry check in step 1.
const FACTORY_ID = "0.0.9213391";
const RESOLVER_ID = "0.0.9212226";
const MIRROR = "https://testnet.mirrornode.hedera.com";

// Research recorded this for the factory on 2026-09-04. Step 1 re-measures rather than trusts it.
const RECORDED_FACTORY_EXPIRY = 1789039172;

const ZERO = "0x0000000000000000000000000000000000000000";
const DEFAULT_ADMIN_ROLE = "0x" + "00".repeat(32);
// constants/roles.sol:78. Not granted at creation — step 4 exists because of that.
const ROLE_ISSUER = "0x5eeaf5602c75bf26e73b5206d0bd6ee82f621166255e5fd73cc06bc7bd84a95f";
// Resolver configuration 1 = equity. Verified live in step 1: the resolver carries 8
// configurations, all at version 1.
const EQUITY_CONFIG_ID = "0x" + "00".repeat(31) + "01";
const EQUITY_CONFIG_VERSION = 1n;

// ⚠️ RegulationType.NONE reverts. `_isValidTypeAndSubType` (factory/ERC3643/interfaces/
// regulation.sol:198) accepts only REG_S+NONE or REG_D+{506_B,506_C}; NONE+NONE reverts
// RegulationTypeAndSubTypeForbidden. REG_S is the honest pick for a report sold to anyone: it is
// the only combination with international investors allowed and no resale hold period. The field
// is validated and emitted, never stored — it gates nothing on transfer.
const REG_S = 1;
const REG_SUBTYPE_NONE = 0;

// A stand-in for the report hash. In production this is the JCS hash from SM-01, set at creation
// and immutable — it is the 32 bytes that also go into Arc's commitPrediction (PLAN-v4 §1).
const FAKE_REPORT_HASH = "49cfaa6c" + "00".repeat(27) + "3db9b7";
const REPORT_INFO = `alpha:${FAKE_REPORT_HASH}`;

const HBAR_DECIMALS = 8;
const hbar = (tinybars: bigint | number): string => (Number(tinybars) / 10 ** HBAR_DECIMALS).toFixed(8);

const env = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    console.error(`FAIL  ${name} is not set. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
  return value;
};

const SELLER_ID = env("HEDERA_SELLER_ID");
const SELLER_KEY = env("HEDERA_SELLER_KEY");
const BUYER_ID = env("HEDERA_BUYER_ID");
const BUYER_KEY = env("HEDERA_BUYER_KEY");
const RPC_URL = env("HEDERA_TESTNET_RPC");

const fetchJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} → ${response.status}`);
  return (await response.json()) as T;
};

// ISO 6166 check digit, mirroring factory/isinValidator.sol. The deploy reverts WrongISINChecksum
// without it. Asserted below against three real ISINs before it is used on anything that costs.
const makeIsin = (first11: string): string => {
  const conv: number[] = [];
  for (const ch of first11) {
    const c = ch.charCodeAt(0) > 57 ? ch.charCodeAt(0) - 55 : ch.charCodeAt(0) - 48;
    c > 9 ? conv.push(Math.floor(c / 10), c % 10) : conv.push(c);
  }
  const pairing = (conv.length + 1) % 2;
  let sum = 0;
  conv.forEach((d, i) => {
    const c = d * (i % 2 === pairing ? 2 : 1);
    sum += c > 9 ? Math.floor(c / 10) + (c % 10) : c;
  });
  return first11 + String((10 - (sum % 10)) % 10);
};

for (const reference of ["US9311421039", "GB0002634946", "US0378331005"]) {
  if (makeIsin(reference.slice(0, 11)) !== reference) {
    console.error(`FAIL  ISIN check digit is wrong for ${reference}. The deploy would revert.`);
    process.exit(1);
  }
}
const ISIN = makeIsin("XXALPHA0001");

// ⚠️ One installed copy of ethers, two type identities. Our script is ESM so `ethers` resolves to
// `lib.esm`; the typechain `.d.ts` files are CJS so the same import resolves to `lib.commonjs`
// inside them. TypeScript compares the two structurally, hits their `#private` fields, and calls
// them incompatible. Nothing differs at runtime — `npm ls ethers` shows one deduped 6.16.0 — so the
// cast is confined to the one boundary where a wallet is handed to a typechain factory.
type Runner = Parameters<typeof Factory__factory.connect>[1];
const asRunner = (wallet: ethers.Wallet): Runner => wallet as unknown as Runner;

// ATS reverts with custom errors, so the reason is a 4-byte selector. Decoding it needs the ABI.
const decodeErrorData = (data: string): string | null => {
  for (const iface of [Factory__factory.createInterface(), IAsset__factory.createInterface()]) {
    try {
      const parsed = iface.parseError(data);
      if (parsed) return `${parsed.name}(${parsed.args.map(String).join(", ")})`;
    } catch {
      /* not this ABI's error */
    }
  }
  return null;
};

// ⚠️ ethers gets nothing useful out of a reverted Hedera transaction — the relay returns a receipt
// with status 0 and no revert data, so `error.data` is undefined and the message is the useless
// "transaction execution reverted". Mirror Node's contract result carries the selector in
// `error_message`, and that is the only place the reason exists. Same ingestion lag as everywhere
// else, so it polls.
const revertReasonFromMirror = async (hash: string): Promise<string | null> => {
  type MirrorResult = { error_message?: string | null; result?: string; gas_used?: number };
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const found = await fetchJson<MirrorResult>(`${MIRROR}/api/v1/contracts/results/${hash}`);
      if (found.error_message) {
        const decoded = decodeErrorData(found.error_message);
        return `${decoded ?? `unrecognised selector ${found.error_message}`}` +
          `  [${found.result}, ${found.gas_used} gas]`;
      }
      if (found.result) return `${found.result} (no revert data), ${found.gas_used} gas`;
    } catch {
      /* not ingested yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
};

// Every write goes through this: it prints the revert reason and stops rather than retrying, and
// each caller states what already landed so a rerun cannot silently duplicate an asset.
const landOrStop = async <T>(what: string, run: () => Promise<T>, onFail: string[]): Promise<T> => {
  try {
    return await run();
  } catch (error) {
    const err = error as { data?: string; shortMessage?: string; message?: string; receipt?: { hash: string } };
    const fromData = typeof err.data === "string" && err.data.length > 2 ? decodeErrorData(err.data) : null;
    const hash = err.receipt?.hash;
    const reason = fromData ?? (hash ? await revertReasonFromMirror(hash) : null);
    console.error(`\nFAIL  ${what} reverted — ${reason ?? err.shortMessage ?? err.message ?? String(error)}`);
    if (hash) console.error(`      tx ${hash}`);
    for (const line of onFail) console.error(`      ${line}`);
    return process.exit(1);
  }
};

// ─── Step 1 — the public infrastructure ──────────────────────────────────────────────────────────
// We are building on someone else's testnet contracts. If either is gone the fallback is deploying
// our own ATS infrastructure — 111 contracts, ~29 minutes — and that is a decision, not a retry.

console.log(`\n── Step 1 · public ATS infrastructure`);

type MirrorContract = { evm_address: string; deleted: boolean; expiration_timestamp: string; nonce: number };

const contracts: Record<string, MirrorContract> = {};
for (const [label, id] of [["factory", FACTORY_ID], ["resolver", RESOLVER_ID]] as const) {
  const contract = await fetchJson<MirrorContract>(`${MIRROR}/api/v1/contracts/${id}`);
  contracts[label] = contract;
  const expiry = Number(contract.expiration_timestamp.split(".")[0]);
  const days = (expiry - Date.now() / 1000) / 86400;
  console.log(
    `  ${label.padEnd(8)} ${id}  ${contract.evm_address}` +
      `\n           deleted=${contract.deleted} nonce=${contract.nonce} expires ${expiry} ` +
      `(${new Date(expiry * 1000).toISOString().slice(0, 16)}Z, ${days.toFixed(1)}d)`,
  );
  if (contract.deleted) {
    console.error(`\nSTOP  ${label} ${id} is deleted. The fallback is deploying our own ATS`);
    console.error("      infrastructure — 111 contracts, ~29 minutes. That is a decision, not a retry.");
    process.exit(1);
  }
}

const FACTORY_ADDRESS = contracts.factory.evm_address;
const RESOLVER_ADDRESS = contracts.resolver.evm_address;
const factoryExpiry = Number(contracts.factory.expiration_timestamp.split(".")[0]);
const resolverExpiry = Number(contracts.resolver.expiration_timestamp.split(".")[0]);

console.log(
  `  research recorded factory expiry ${RECORDED_FACTORY_EXPIRY} — ` +
    (factoryExpiry === RECORDED_FACTORY_EXPIRY ? "confirmed" : `⚠️ NOW ${factoryExpiry}`),
);
// The earlier of the two is the one that binds. Research recorded only the factory's.
console.log(
  `  binding expiry is the ${resolverExpiry < factoryExpiry ? "resolver" : "factory"}'s, ` +
    `${Math.min(resolverExpiry, factoryExpiry)} — ${Math.abs(factoryExpiry - resolverExpiry)}s apart`,
);

const provider = new ethers.JsonRpcProvider(RPC_URL);
const chainId = (await provider.getNetwork()).chainId;
console.log(`  relay ${RPC_URL} chainId ${chainId}`);
if (chainId !== 296n) {
  console.error(`\nSTOP  chainId ${chainId} is not Hedera testnet (296).`);
  process.exit(1);
}

// ─── Step 2 — the two accounts ───────────────────────────────────────────────────────────────────
// ATS is plain ERC-20 on the Hedera EVM, so these are EVM addresses and there is no association
// step. Each is derived from its key and then checked against what Mirror Node says the account's
// EVM address actually is — an account whose alias disagrees with its key would fail confusingly
// several transactions later.

console.log(`\n── Step 2 · accounts`);

type MirrorAccount = { evm_address: string; balance: { balance: number } };

const wallets: Record<string, ethers.Wallet> = {};
for (const [label, accountId, key] of [
  ["seller", SELLER_ID, SELLER_KEY],
  ["buyer", BUYER_ID, BUYER_KEY],
] as const) {
  const wallet = new ethers.Wallet("0x" + key.trim().replace(/^0x/, "").slice(-64), provider);
  const account = await fetchJson<MirrorAccount>(`${MIRROR}/api/v1/accounts/${accountId}`);
  const agrees = account.evm_address.toLowerCase() === wallet.address.toLowerCase();
  console.log(
    `  ${label.padEnd(6)} ${accountId.padEnd(13)} ${wallet.address}  ` +
      `${hbar(BigInt(account.balance.balance))} HBAR  mirror ${agrees ? "agrees" : "DISAGREES"}`,
  );
  if (!agrees) {
    console.error(`\nSTOP  ${label} key derives ${wallet.address} but ${accountId} is ${account.evm_address}.`);
    console.error("      The key and the account id are not the same account. Fix .env; do not proceed.");
    process.exit(1);
  }
  wallets[label] = wallet;
}

const seller = wallets.seller;
const buyer = wallets.buyer;
const sellerHbarBefore = BigInt(
  (await fetchJson<MirrorAccount>(`${MIRROR}/api/v1/accounts/${SELLER_ID}`)).balance.balance,
);

// ─── Step 3 — deployEquity ───────────────────────────────────────────────────────────────────────
// One contract per asset: a thin ResolverProxy pointing at the shared resolver.
//
// Compliance is off, and that is what lets an arbitrary buyer receive with zero onboarding:
// compliance address(0), identityRegistry address(0), internalKycActivated false, isWhiteList
// false, all three external list arrays empty. KycStorageWrapper.verifyKycStatus is
// (!internalKycActivated || statusMatches) && isExternallyGranted(...), and isExternallyGranted
// returns true when the external list is empty because the loop never runs.

console.log(`\n── Step 3 · deployEquity`);
console.log(`  isin ${ISIN}   name "Alpha Markets Report"   symbol ALPHA   decimals 0`);
console.log(`  config ${EQUITY_CONFIG_ID} v${EQUITY_CONFIG_VERSION}   resolver ${RESOLVER_ADDRESS}`);
console.log(`  info  ${REPORT_INFO}`);

const equityData = {
  security: {
    resolver: RESOLVER_ADDRESS,
    // ⚠️ maxSupply 0 does NOT mean unlimited at creation, whatever CapStorageWrapper.sol:41's
    // comment says. `Cap.initializeCap` carries `onlyValidNewMaxSupply`, which reverts
    // NewMaxSupplyCannotBeZero() for 0 — measured, selector 0x76f138fb, after 948,129 gas. The
    // zero-bypass is only in `isCorrectMaxSupply`, which runs later at issue time. A cap of 1 is
    // the honest value anyway: one report, one token, and a second mint becomes impossible.
    maxSupply: 1n,
    resolverProxyConfiguration: { key: EQUITY_CONFIG_ID, version: EQUITY_CONFIG_VERSION },
    erc20MetadataInfo: { name: "Alpha Markets Report", symbol: "ALPHA", isin: ISIN, decimals: 0 },
    rbacs: [{ role: DEFAULT_ADMIN_ROLE, members: [seller.address] }],
    externalPauses: [],
    externalControlLists: [],
    externalKycLists: [],
    compliance: ZERO, // ← disables ERC-3643 compliance
    identityRegistry: ZERO, // ← disables identity checks
    arePartitionsProtected: false,
    isMultiPartition: false,
    isControllable: true, // keeps a force-transfer escape hatch if a buyer flow breaks
    isWhiteList: false, // false = the control list is a deny-list, and it is empty
    clearingActive: false,
    internalKycActivated: false, // ← the one that would otherwise block the transfer
    erc20VotesActivated: false,
  },
  equityDetails: {
    votingRight: false,
    informationRight: false,
    liquidationRight: false,
    subscriptionRight: false,
    conversionRight: false,
    redemptionRight: false,
    putRight: false,
    dividendRight: 0,
    currency: "0x555344", // "USD" as bytes3
    nominalValue: 0n,
    nominalValueDecimals: 0,
  },
};

const regulationData = {
  regulationType: REG_S,
  regulationSubType: REG_SUBTYPE_NONE,
  additionalSecurityData: { countriesControlListType: false, listOfCountries: "", info: REPORT_INFO },
};

// ⚠️ Every landed step prints its hash the moment it lands. A blind retry after a half-finished
// run deploys a second asset, and there is nothing on-chain that says the first one was ours.
const landed: string[] = [];
const note = (what: string, value: string): void => {
  landed.push(`${what.padEnd(12)} ${value}`);
  console.log(`  LANDED  ${what.padEnd(12)} ${value}`);
};

const factory = Factory__factory.connect(FACTORY_ADDRESS, asRunner(seller));

const deployReceipt = await landOrStop(
  "deployEquity",
  async () => {
    const tx = await factory.deployEquity(equityData, regulationData, { gasLimit: 12_000_000 });
    console.log(`  submitted ${tx.hash}`);
    return (await tx.wait())!;
  },
  [
    "Do not retry blindly. A revert here costs gas and deploys nothing, but a retry",
    "after a *partial* success deploys a second asset with nothing to distinguish it.",
  ],
);
note("deploy tx", deployReceipt.hash);

const deployedEvent = deployReceipt.logs
  .map((log) => {
    try {
      return factory.interface.parseLog(log);
    } catch {
      return null;
    }
  })
  .find((parsed) => parsed?.name === "EquityDeployed");

if (!deployedEvent) {
  console.error(`\nFAIL  no EquityDeployed event in ${deployReceipt.hash}. Nothing to issue against.`);
  process.exit(1);
}

const tokenAddress = deployedEvent.args[1] as string;
note("proxy", tokenAddress);

// The report hash is event-only — additionalSecurityData is validated and emitted by deployEquity
// and never written to proxy storage. Reading it back out of the log is the only proof it survived.
const emittedInfo = deployedEvent.args[3].additionalSecurityData.info as string;
console.log(`  info in event    ${emittedInfo}`);
console.log(`  info survived    ${emittedInfo === REPORT_INFO ? "yes — byte-identical" : "NO — CHANGED"}`);

// ─── Step 4 — grantRole(ISSUER) ──────────────────────────────────────────────────────────────────
// ⚠️ Creation grants only DEFAULT_ADMIN to the diamond owner, and deployEquity renounces the
// factory's own temporary admin role on the way out. issue() without this reverts at runtime.

console.log(`\n── Step 4 · grantRole(ROLE_ISSUER)`);

const token = IAsset__factory.connect(tokenAddress, asRunner(seller));
console.log(`  before  hasRole(ISSUER, seller) = ${await token.hasRole(ROLE_ISSUER, seller.address)}`);

const grantReceipt = await landOrStop(
  "grantRole",
  async () => (await (await token.grantRole(ROLE_ISSUER, seller.address, { gasLimit: 1_000_000 })).wait())!,
  [`The asset exists. Proxy ${tokenAddress}. Grant the role against it; do not redeploy.`],
);
note("grantRole tx", grantReceipt.hash);
console.log(`  after   hasRole(ISSUER, seller) = ${await token.hasRole(ROLE_ISSUER, seller.address)}`);

// ─── Step 5 — issue ──────────────────────────────────────────────────────────────────────────────
// Supply 1, decimals 0. One token, one report.

console.log(`\n── Step 5 · issue`);

const issueReceipt = await landOrStop(
  "issue",
  async () => (await (await token.issue(seller.address, 1n, "0x", { gasLimit: 2_000_000 })).wait())!,
  [`The asset exists and ISSUER is granted. Proxy ${tokenAddress}. Do not redeploy.`],
);
note("issue tx", issueReceipt.hash);
console.log(`  totalSupply ${await token.totalSupply()}  decimals ${await token.decimals()}`);

// ─── Step 6 — transfer, the lifecycle operation ──────────────────────────────────────────────────

console.log(`\n── Step 6 · transfer`);

const sellerBefore = await token.balanceOf(seller.address);
const buyerBefore = await token.balanceOf(buyer.address);
console.log(`  before  seller ${sellerBefore}   buyer ${buyerBefore}`);

const transferReceipt = await landOrStop(
  "transfer",
  async () => (await (await token.transfer(buyer.address, 1n, { gasLimit: 2_000_000 })).wait())!,
  [`The token is issued and held by the seller. Proxy ${tokenAddress}. Do not redeploy.`],
);
note("transfer tx", transferReceipt.hash);

const sellerAfter = await token.balanceOf(seller.address);
const buyerAfter = await token.balanceOf(buyer.address);
console.log(`  after   seller ${sellerAfter}   buyer ${buyerAfter}`);

// ─── Cost ────────────────────────────────────────────────────────────────────────────────────────
// Research estimated ~$0.60 per asset from an average of 8 real testnet deploys at 108 tinybars/gas.
// This is the measured number for our own deploy.
//
// Mirror Node lags consensus (the SM-05 lesson, twice over), so the balance read polls. The balance
// delta is what actually left the account; the per-transaction figures below are derived from
// receipts and are there to show where it went.

const receipts = [
  ["deployEquity", deployReceipt],
  ["grantRole", grantReceipt],
  ["issue", issueReceipt],
  ["transfer", transferReceipt],
] as const;

console.log(`\n── Cost`);
let derivedTinybars = 0n;
for (const [label, receipt] of receipts) {
  const tinybars = (receipt.gasUsed * receipt.gasPrice) / 10_000_000_000n;
  derivedTinybars += tinybars;
  console.log(`  ${label.padEnd(13)} gas ${String(receipt.gasUsed).padStart(9)}  ${hbar(tinybars)} HBAR`);
}

const settledBalance = async (accountId: string, before: bigint): Promise<bigint> => {
  for (let attempt = 0; attempt < 15; attempt++) {
    const now = BigInt((await fetchJson<MirrorAccount>(`${MIRROR}/api/v1/accounts/${accountId}`)).balance.balance);
    if (now !== before) return now;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return BigInt((await fetchJson<MirrorAccount>(`${MIRROR}/api/v1/accounts/${SELLER_ID}`)).balance.balance);
};

const sellerHbarAfter = await settledBalance(SELLER_ID, sellerHbarBefore);
const spent = sellerHbarBefore - sellerHbarAfter;

type MirrorRate = { current_rate: { cent_equivalent: number; hbar_equivalent: number } };
const rate = await fetchJson<MirrorRate>(`${MIRROR}/api/v1/network/exchangerate`);
const usdPerHbar = rate.current_rate.cent_equivalent / rate.current_rate.hbar_equivalent / 100;

console.log(`  ${"derived total".padEnd(13)} ${" ".repeat(13)}  ${hbar(derivedTinybars)} HBAR`);
console.log(`  seller balance  ${hbar(sellerHbarBefore)} → ${hbar(sellerHbarAfter)}  (−${hbar(spent)} HBAR)`);
console.log(`  HBAR at $${usdPerHbar.toFixed(6)}  →  $${(Number(spent) / 1e8 * usdPerHbar).toFixed(4)} for the whole run`);
console.log(
  `  deploy alone    $${(Number((deployReceipt.gasUsed * deployReceipt.gasPrice) / 10_000_000_000n) / 1e8 * usdPerHbar).toFixed(4)}` +
    `   — research estimated $0.60 per asset`,
);

// ─── Verdict ─────────────────────────────────────────────────────────────────────────────────────
// ⚠️ Not "it appeared on HashScan". Proxy creation is not issuance and issuance is not transfer.

console.log(`\n── Result`);
for (const line of landed) console.log(`  ${line}`);
console.log(`  HashScan  https://hashscan.io/testnet/contract/${tokenAddress}`);

const passed = buyerBefore === 0n && buyerAfter === 1n && sellerBefore === 1n && sellerAfter === 0n;
if (!passed) {
  console.error(`\nFAIL  SM-07. Balances did not move as required.`);
  console.error(`      seller ${sellerBefore} → ${sellerAfter} (wanted 1 → 0)`);
  console.error(`      buyer  ${buyerBefore} → ${buyerAfter} (wanted 0 → 1)`);
  process.exit(1);
}

console.log(`\nPASS  SM-07. balanceOf(buyer) 0 → 1 and balanceOf(seller) 1 → 0 on ${tokenAddress}.`);
console.log(`      The transfer is the lifecycle operation. Compliance, KYC and whitelisting were`);
console.log(`      off, so the buyer received with no onboarding and no token association.`);

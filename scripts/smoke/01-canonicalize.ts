// SM-01 — does our report hasher match RFC 8785 (JCS) exactly?
// The report hash is the only thing that crosses chains: it goes into the ATS token's
// creation event on Hedera and into commitPrediction on Arc. If our hasher and an
// outside verifier disagree by one byte, a settlement dispute has no resolution. So
// this tests conformance to the published standard, not agreement with ourselves —
// every vector below is copied from RFC 8785 itself, with the section cited.
// Runs offline. No network, no keys.

import canonicalize from "canonicalize";
import { createHash } from "node:crypto";

let failures = 0;
const check = (name: string, actual: string, expected: string) => {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`  ${ok ? "pass" : "FAIL"}  ${name}`);
  if (!ok) {
    console.log(`        expected  ${expected}`);
    console.log(`        actual    ${actual}`);
  }
};

// ---- RFC 8785 §3.2.2 + §3.2.4 — the worked example, checked as UTF-8 bytes ---------
// Comparing bytes rather than a TypeScript string literal is deliberate: the RFC
// publishes the expected output in hex, and re-escaping that by hand is exactly how a
// conformance test acquires a bug of its own. Both vectors are held as raw text and
// parsed, so nothing here depends on my transcription of an escape sequence.

const RFC_322_INPUT = String.raw`{"numbers":[333333333.33333329,1E30,4.50,2e-3,0.000000000000000000000000001],"string":"\u20ac$\u000F\u000aA'\u0042\u0022\u005c\\\"\/","literals":[null,true,false]}`;

const RFC_324_BYTES = `
  7b 22 6c 69 74 65 72 61 6c 73 22 3a 5b 6e 75 6c 6c 2c 74 72
  75 65 2c 66 61 6c 73 65 5d 2c 22 6e 75 6d 62 65 72 73 22 3a
  5b 33 33 33 33 33 33 33 33 33 2e 33 33 33 33 33 33 33 2c 31
  65 2b 33 30 2c 34 2e 35 2c 30 2e 30 30 32 2c 31 65 2d 32 37
  5d 2c 22 73 74 72 69 6e 67 22 3a 22 e2 82 ac 24 5c 75 30 30
  30 66 5c 6e 41 27 42 5c 22 5c 5c 5c 5c 5c 22 2f 22 7d`;

console.log("RFC 8785 §3.2.2 / §3.2.4 — worked example, as UTF-8 bytes");
const worked = canonicalize(JSON.parse(RFC_322_INPUT)) as string;
check(
  "primitive serialization + property sort + UTF-8",
  Buffer.from(worked, "utf8").toString("hex"),
  RFC_324_BYTES.replace(/\s+/g, ""),
);

// ---- RFC 8785 §3.2.3 — sorting on UTF-16 code units --------------------------------
// The RFC gives the input and the expected order of the *values* once the property
// names are sorted. Sorting is by UTF-16 code unit, which is why the emoji (a surrogate
// pair) lands before the Hebrew letter rather than after it.

const RFC_323_INPUT = String.raw`{"\u20ac":"Euro Sign","\r":"Carriage Return","\ufb33":"Hebrew Letter Dalet With Dagesh","1":"One","\ud83d\ude00":"Emoji: Grinning Face","\u0080":"Control","\u00f6":"Latin Small Letter O With Diaeresis"}`;

const RFC_323_ORDER = [
  "Carriage Return",
  "One",
  "Control",
  "Latin Small Letter O With Diaeresis",
  "Euro Sign",
  "Emoji: Grinning Face",
  "Hebrew Letter Dalet With Dagesh",
];

console.log();
console.log("RFC 8785 §3.2.3 — property sorting");
const sorted = canonicalize(JSON.parse(RFC_323_INPUT)) as string;
// Read the order out of the canonical TEXT. Parsing it back into an object and taking
// Object.values() would be wrong: JavaScript enumerates integer-like keys ("1") before
// string keys whatever the insertion order, so the round trip silently reorders the
// exact thing under test. Any verifier that checks key order this way will disagree
// with a correct canonicalizer.
const actualOrder = [...sorted.matchAll(/:"((?:[^"\\]|\\.)*)"/g)].map((m) => JSON.parse(`"${m[1]}"`));
check("value order after sorting", JSON.stringify(actualOrder), JSON.stringify(RFC_323_ORDER));

// ---- RFC 8785 Appendix B — number serialization, all 24 published samples ----------
// Each row is an IEEE 754 double in hex and the JSON form it must serialize to.
// Building the double from its bits is the only way to hit the edge cases exactly.

const APPENDIX_B: [string, string][] = [
  ["0000000000000000", "0"], ["8000000000000000", "0"],
  ["0000000000000001", "5e-324"], ["8000000000000001", "-5e-324"],
  ["7fefffffffffffff", "1.7976931348623157e+308"], ["ffefffffffffffff", "-1.7976931348623157e+308"],
  ["4340000000000000", "9007199254740992"], ["c340000000000000", "-9007199254740992"],
  ["4430000000000000", "295147905179352830000"],
  ["44b52d02c7e14af5", "9.999999999999997e+22"], ["44b52d02c7e14af6", "1e+23"],
  ["44b52d02c7e14af7", "1.0000000000000001e+23"],
  ["444b1ae4d6e2ef4e", "999999999999999700000"], ["444b1ae4d6e2ef4f", "999999999999999900000"],
  ["444b1ae4d6e2ef50", "1e+21"],
  ["3eb0c6f7a0b5ed8c", "9.999999999999997e-7"], ["3eb0c6f7a0b5ed8d", "0.000001"],
  ["41b3de4355555553", "333333333.3333332"], ["41b3de4355555554", "333333333.33333325"],
  ["41b3de4355555555", "333333333.3333333"], ["41b3de4355555556", "333333333.3333334"],
  ["41b3de4355555557", "333333333.33333343"],
  ["becbf647612f3696", "-0.0000033333333333333333"],
  ["43143ff3c1cb0959", "1424953923781206.2"],
];

const fromBits = (hex: string) => {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(`0x${hex}`));
  return buf.readDoubleBE(0);
};

console.log();
console.log(`RFC 8785 Appendix B — number serialization (${APPENDIX_B.length} samples)`);
let numbersOk = 0;
for (const [bits, expected] of APPENDIX_B) {
  const actual = canonicalize(fromBits(bits)) as string;
  if (actual === expected) numbersOk++;
  else {
    failures++;
    console.log(`  FAIL  ${bits}  expected ${expected}, got ${actual}`);
  }
}
console.log(`  ${numbersOk === APPENDIX_B.length ? "pass" : "FAIL"}  ${numbersOk}/${APPENDIX_B.length} samples`);

// §3.2.2.3 — NaN and Infinity MUST terminate with an error, not serialize to anything.
console.log();
console.log("RFC 8785 §3.2.2.3 — NaN and Infinity rejected");
for (const [name, value] of [["NaN", NaN], ["Infinity", Infinity]] as [string, number][]) {
  let threw = false;
  try {
    canonicalize(value);
  } catch {
    threw = true;
  }
  check(`${name} rejected`, String(threw), "true");
}

// ---- The report hash ---------------------------------------------------------------

// Fields that only come into existence AFTER the hash is committed. The ATS token's
// creation event carries the hash, so the hash cannot carry the token — that is
// circular. Anything with that property belongs in this set.
const LIFECYCLE = new Set(["atsTokenAddress"]);

const strip = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(strip);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([k]) => !LIFECYCLE.has(k))
        .map(([k, v]) => [k, strip(v)]),
    );
  }
  return value;
};

const canonicalOf = (report: unknown) => canonicalize(strip(report)) as string;
const hashReport = (report: unknown) =>
  createHash("sha256").update(canonicalOf(report), "utf8").digest("hex");

// Figures are strings because the gateway returns BigDecimals with 23 decimal places
// and a JS number silently rounds them. `null` means "not available for this
// deployment" — aave-v3's revenue accumulator is poisoned — and it is spelled out
// rather than omitted, because an absent key and a null key canonicalize to different
// bytes. Decision: explicit null, never omission.
const REPORT = {
  schema: "alpha-markets/report/v1",
  protocol: "aave-v3-ethereum",
  deployment: "QmcXE5QVcBcvcaJddPxd8mFs6W9xt7STmwfgguoiM6ddAd",
  block: 25916237,
  observedAt: "2026-09-06T02:14:11Z",
  figures: {
    totalDepositBalanceUSD: "24850226626.81",
    totalBorrowBalanceUSD: "10050176390.56",
    utilizationRatio: "0.404430",
    cumulativeTotalRevenueUSD: null,
  },
  verdict: { call: "overvalued", confidence: "medium" },
};

// The same report with every key written in a different order, and with the lifecycle
// field attached as it would be once the ATS token exists.
const SHUFFLED = {
  verdict: { confidence: "medium", call: "overvalued" },
  atsTokenAddress: "0.0.9213391",
  figures: {
    cumulativeTotalRevenueUSD: null,
    utilizationRatio: "0.404430",
    totalBorrowBalanceUSD: "10050176390.56",
    totalDepositBalanceUSD: "24850226626.81",
  },
  observedAt: "2026-09-06T02:14:11Z",
  block: 25916237,
  deployment: "QmcXE5QVcBcvcaJddPxd8mFs6W9xt7STmwfgguoiM6ddAd",
  protocol: "aave-v3-ethereum",
  schema: "alpha-markets/report/v1",
};

// One cent on one figure.
const CHANGED = {
  ...REPORT,
  figures: { ...REPORT.figures, totalBorrowBalanceUSD: "10050176390.57" },
};

console.log();
console.log("canonical JSON of the sample report");
console.log(`  ${canonicalOf(REPORT)}`);

console.log();
console.log("hash properties");
console.log(`  as written        ${hashReport(REPORT)}`);
console.log(`  keys reordered    ${hashReport(SHUFFLED)}`);
check("key order does not change the hash", hashReport(SHUFFLED), hashReport(REPORT));
check("lifecycle field excluded", String(canonicalOf(SHUFFLED).includes("atsTokenAddress")), "false");
console.log(`  one cent moved    ${hashReport(CHANGED)}`);
check("different content changes the hash", String(hashReport(CHANGED) !== hashReport(REPORT)), "true");

// ---- The rules the hash must follow --------------------------------------------------

const floats: string[] = [];
const nulls: string[] = [];
const walk = (value: unknown, path: string) => {
  if (value === null) {
    nulls.push(path);
    return;
  }
  if (typeof value === "number" && !Number.isInteger(value)) floats.push(`${path}=${value}`);
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      walk(v, path ? `${path}.${k}` : k);
    }
  }
};
walk(strip(REPORT), "");

const nonString = Object.entries(REPORT.figures)
  .filter(([, v]) => v !== null && typeof v !== "string")
  .map(([k]) => k);

console.log();
console.log("rules");
check("no floating-point numbers anywhere", floats.join(",") || "none", "none");
check("every figure is a string or null", nonString.join(",") || "none", "none");
console.log(
  `  note  null means unavailable, never omission — ${nulls.length} explicit null(s): ${nulls.join(", ") || "none"}`,
);

console.log();
console.log(failures === 0 ? "SM-01 PASS — all vectors and rules hold." : `SM-01 FAIL — ${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);

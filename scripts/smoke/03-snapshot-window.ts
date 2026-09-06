// SM-03 — can a daily snapshot from twelve months ago still be read?
// Live figures are pruned to roughly the last 500 blocks. Snapshots are written once
// per day as their own row and never superseded, so the theory is that pruning cannot
// reach them. That is a reading of graph-node's pruning SQL, not something anyone has
// queried. If it is wrong, no market can settle on a named day and Phase 4 rebuilds
// around immutable events only.
//
// The trap this test exists to avoid: `timestamp_gte` alone false-passes. Recent rows
// satisfy it, so rows come back and prove nothing. Both bounds, then assert.
// Throwaway proof, not the real client — src/graph/blockwindow.ts generalises this.

const ID = "JCNWRypm7FYwV8fx5HhzZPSFaMxgkPuw4TnR3Gpi81zk"; // aave-v3-ethereum
const WINDOW_DAYS = 7;
const PROBES = [6, 12, 18, 24];

const key = process.env.GRAPH_API_KEY;
if (!key) {
  console.error("GRAPH_API_KEY is not set.");
  console.error("Copy .env.example to .env and fill in a key from https://thegraph.com/studio");
  process.exit(1);
}

const iso = (ts: number | string) => new Date(Number(ts) * 1000).toISOString().slice(0, 10);
const usd = (v: string) => Number(v).toFixed(0).padStart(14);

// One retry, then report. SM-02 hit an ETIMEDOUT to the gateway that cleared immediately.
async function gql(query: string, variables: Record<string, string> = {}, deployment = ID) {
  let last: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(`https://gateway.thegraph.com/api/${key}/subgraphs/id/${deployment}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query, variables }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const json = await res.json();
      if (json.errors) throw new Error(json.errors.map((e: { message: string }) => e.message).join("; "));
      return json.data;
    } catch (e) {
      last = e;
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

// Midnight UTC, n months back, through WINDOW_DAYS later.
function window(months: number): [number, number] {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - months);
  d.setUTCHours(0, 0, 0, 0);
  const start = Math.floor(d.getTime() / 1000);
  return [start, start + WINDOW_DAYS * 86400];
}

const SNAPSHOTS = `query ($gte: BigInt!, $lt: BigInt!) {
  _meta { block { number timestamp } deployment }
  financialsDailySnapshots(
    where: { timestamp_gte: $gte, timestamp_lt: $lt }
    orderBy: timestamp
    orderDirection: asc
    first: 100
  ) {
    timestamp
    blockNumber
    totalDepositBalanceUSD
    totalBorrowBalanceUSD
    cumulativeTotalRevenueUSD
  }
}`;

type Snapshot = {
  timestamp: string;
  blockNumber: string;
  totalDepositBalanceUSD: string;
  totalBorrowBalanceUSD: string;
  cumulativeTotalRevenueUSD: string;
};

const outOfBounds = (rows: Snapshot[], gte: number, lt: number) =>
  rows.filter((r) => Number(r.timestamp) < gte || Number(r.timestamp) >= lt);

// ---- the headline: twelve months back, both bounds, then assert -------------------

const [gte, lt] = window(12);
const head = await gql(SNAPSHOTS, { gte: String(gte), lt: String(lt) });
const rows: Snapshot[] = head.financialsDailySnapshots;

console.log(`deployment:  ${head._meta.deployment}`);
console.log(`head block:  ${head._meta.block.number} at ${iso(head._meta.block.timestamp)}`);
console.log(`requested:   ${iso(gte)} … ${iso(lt)}  (${WINDOW_DAYS} days, 12 months back)`);
console.log();

if (rows.length === 0) {
  console.log("NO ROWS. Twelve-month-old snapshots did not survive — see tracking/lessons.md.");
} else {
  console.log("date".padEnd(12), "block".padStart(10), "deposits USD".padStart(14), "borrows USD".padStart(14), "cum revenue USD".padStart(14));
  for (const r of rows) {
    console.log(
      iso(r.timestamp).padEnd(12),
      r.blockNumber.padStart(10),
      usd(r.totalDepositBalanceUSD),
      usd(r.totalBorrowBalanceUSD),
      usd(r.cumulativeTotalRevenueUSD),
    );
  }
}

const strays = outOfBounds(rows, gte, lt);
const flat = rows.filter((r) => Number(r.totalDepositBalanceUSD) === 0 || Number(r.totalBorrowBalanceUSD) === 0);
// No lending protocol has earned a trillion dollars. A cumulative above that is a
// poisoned accumulator, not a figure — see the revenue note in tracking/lessons.md.
const absurd = rows.filter((r) => Number(r.cumulativeTotalRevenueUSD) > 1e12);

console.log();
console.log(`twelve months:  ${rows.length > 0 ? "SNAPSHOTS SURVIVE" : "GONE"}`);
console.log(`in window:      ${rows.length - strays.length}/${rows.length}${strays.length > 0 ? "  <- BOUNDS NOT RESPECTED" : ""}`);
console.log(`daily coverage: ${rows.length} of ${WINDOW_DAYS} days${rows.length < WINDOW_DAYS ? "  <- GAP, the missing-day rule will fire" : ""}`);
console.log(`zero balances:  ${flat.length === 0 ? "none" : `${flat.length} rows  <- ${flat.map((r) => iso(r.timestamp)).join(", ")}`}`);
console.log(`revenue sanity: ${absurd.length === 0 ? "plausible" : `${absurd.length}/${rows.length} rows report cumulative revenue above $1e12  <- NOT USABLE`}`);

// ---- how far back does it actually go? -------------------------------------------

console.log();
console.log("retention probe");
for (const months of PROBES) {
  const [a, b] = window(months);
  let result: string;
  try {
    const data = await gql(SNAPSHOTS, { gte: String(a), lt: String(b) });
    const rs: Snapshot[] = data.financialsDailySnapshots;
    const bad = outOfBounds(rs, a, b).length;
    result = rs.length === 0
      ? "empty"
      : `${String(rs.length).padStart(2)} rows  ${iso(rs[0].timestamp)} … ${iso(rs[rs.length - 1].timestamp)}  ${bad > 0 ? `${bad} OUTSIDE` : "in window"}`;
  } catch (e) {
    result = `FAILED — ${e instanceof Error ? e.message : String(e)}`;
  }
  console.log(`  ${String(months).padStart(2)} months back  ${iso(a)} … ${iso(b)}   ${result}`);
}

const oldest = await gql(`query {
  financialsDailySnapshots(first: 1, orderBy: timestamp, orderDirection: asc) {
    timestamp blockNumber totalDepositBalanceUSD totalBorrowBalanceUSD cumulativeTotalRevenueUSD
  }
}`);
const first: Snapshot | undefined = oldest.financialsDailySnapshots[0];

console.log();
console.log(first
  ? `oldest snapshot: ${iso(first.timestamp)}  block ${first.blockNumber}  deposits ${Number(first.totalDepositBalanceUSD).toFixed(0)}`
  : "oldest snapshot: none returned");

// ---- revenue sweep: is the fault Aave's mapping, or the shared template? ----------
// aave-v3's revenue accumulator is poisoned. Morpho is the discriminating case: same
// Messari template, different authors, schema 3.0.0. If the fault is in shared mapping
// code it should be there too. If it isn't, revenue survives everywhere but Aave.

const DEPLOYMENTS = [
  { slug: "aave-v3-ethereum", id: ID },
  { slug: "aave-v2-ethereum", id: "C2zniPn45RnLDGzVeGZCx2Sw3GXrbc9gL4ZfL8B8Em2j" },
  { slug: "compound-v3-ethereum", id: "AwoxEZbiWLvv6e3QdvdMZw4WDURdGbvPfHmZRc8Dpfz9" },
  { slug: "compound-v2-ethereum", id: "4TbqVA8p2DoBd5qDbPMwmDZv3CsJjWtxo8nVSqF2tA9a" },
  { slug: "morpho-blue", id: "8Lz789DP5VKLXumTMTgygjU2xtuzx8AhbaacgN5PYCAs" },
];

const ABSURD = 1e12; // no lending protocol earns a trillion dollars in a day
const SWEEP_DAYS = 30;

const REVENUE = `query ($gte: BigInt!) {
  financialsDailySnapshots(where: { timestamp_gte: $gte }, orderBy: timestamp, orderDirection: asc, first: 100) {
    timestamp
    dailyTotalRevenueUSD
    dailySupplySideRevenueUSD
    dailyProtocolSideRevenueUSD
    cumulativeTotalRevenueUSD
    totalDepositBalanceUSD
  }
}`;

type RevenueRow = {
  timestamp: string;
  dailyTotalRevenueUSD: string;
  dailySupplySideRevenueUSD: string;
  dailyProtocolSideRevenueUSD: string;
  cumulativeTotalRevenueUSD: string;
  totalDepositBalanceUSD: string;
};

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length === 0 ? 0 : s[Math.floor(s.length / 2)];
};

// The mappings define total as supplySide + protocolSide. BigDecimal is high precision,
// so anything past a cent or a part per billion is real drift, not rounding.
const sidesSum = (r: RevenueRow) => {
  const total = Number(r.dailyTotalRevenueUSD);
  const parts = Number(r.dailySupplySideRevenueUSD) + Number(r.dailyProtocolSideRevenueUSD);
  return Math.abs(parts - total) <= Math.max(0.01, Math.abs(total) * 1e-9);
};

const since = String(Math.floor(Date.now() / 1000) - SWEEP_DAYS * 86400);

console.log();
console.log(`revenue sweep — last ${SWEEP_DAYS} days, five deployments`);
console.log();
console.log(
  "deployment".padEnd(22), "cum revenue USD".padStart(16), "absurd".padStart(8),
  "sides sum".padStart(10), "implied APR".padStart(12), "  verdict",
);

for (const d of DEPLOYMENTS) {
  let rows: RevenueRow[];
  try {
    rows = (await gql(REVENUE, { gte: since }, d.id)).financialsDailySnapshots;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // A schema a version behind may simply not carry these fields. Say that, don't report zero.
    const absent = /has no field|Unknown field|Type .* has no field/i.test(msg);
    console.log(d.slug.padEnd(22), absent ? "  fields absent — this schema has no revenue breakdown" : `  FAILED — ${msg}`);
    continue;
  }

  if (rows.length === 0) {
    console.log(d.slug.padEnd(22), "  no snapshots in window");
    continue;
  }

  const absurdDays = rows.filter((r) => Number(r.dailyTotalRevenueUSD) > ABSURD);
  const sane = rows.filter((r) => Number(r.dailyTotalRevenueUSD) <= ABSURD);
  const drift = rows.filter((r) => !sidesSum(r));
  const cumulative = Number(rows[rows.length - 1].cumulativeTotalRevenueUSD);
  // Annualised take against deposits. A lending protocol lives somewhere near 0.05%–25%.
  const deposits = median(sane.map((r) => Number(r.totalDepositBalanceUSD)));
  const apr = deposits > 0 ? (median(sane.map((r) => Number(r.dailyTotalRevenueUSD))) * 365 * 100) / deposits : NaN;
  const plausibleApr = Number.isFinite(apr) && apr > 0.01 && apr < 25;
  const broken = cumulative > ABSURD || absurdDays.length > 0 || drift.length > 0 || !plausibleApr;
  // "BROKEN" covers two opposite faults — a poisoned accumulator and one never written
  // to at all. A report has to tell those apart, so the column does too.
  const why = !broken ? ""
    : cumulative === 0 ? " (never populated)"
    : cumulative > ABSURD ? " (poisoned accumulator)"
    : drift.length > 0 ? " (sides don't sum)"
    : " (implausible take rate)";

  console.log(
    d.slug.padEnd(22),
    cumulative.toExponential(3).padStart(16),
    `${absurdDays.length}/${rows.length}`.padStart(8),
    (drift.length === 0 ? "ok" : `${drift.length} off`).padStart(10),
    (Number.isFinite(apr) ? `${apr.toFixed(2)}%` : "n/a").padStart(12),
    (broken ? "  BROKEN" : "  USABLE") + why,
  );
}

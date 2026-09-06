// SM-02 — the same query document against five lending protocols, in parallel.
// Proves the standardized-schema claim: one document, five independent deployments,
// spanning three schema versions. It also shows the limit of that claim — morpho-blue
// answers the document unchanged and returns a number that is wrong, so the note under
// the table is as much a result as the table is. A failure is a row in the table, not
// an aborted run — seeing which deployments fail is the point.
// Throwaway proof, not the real client — src/graph/client.ts generalises this in Phase 1.

type Target = { slug: string; id: string; expected: string };

const PROTOCOLS: Target[] = [
  { slug: "aave-v3-ethereum", id: "JCNWRypm7FYwV8fx5HhzZPSFaMxgkPuw4TnR3Gpi81zk", expected: "3.1.0" },
  { slug: "aave-v2-ethereum", id: "C2zniPn45RnLDGzVeGZCx2Sw3GXrbc9gL4ZfL8B8Em2j", expected: "3.1.0" },
  { slug: "compound-v3-ethereum", id: "AwoxEZbiWLvv6e3QdvdMZw4WDURdGbvPfHmZRc8Dpfz9", expected: "3.1.0" },
  { slug: "compound-v2-ethereum", id: "4TbqVA8p2DoBd5qDbPMwmDZv3CsJjWtxo8nVSqF2tA9a", expected: "2.0.1" },
  // Not a Messari deployment — Morpho publish this themselves — but built on the same
  // standardized template, so it takes the document above with no changes at all.
  { slug: "morpho-blue", id: "8Lz789DP5VKLXumTMTgygjU2xtuzx8AhbaacgN5PYCAs", expected: "3.0.0" },
];

const QUERY = `query {
  _meta { block { number } deployment hasIndexingErrors }
  lendingProtocols(first: 1) {
    name
    schemaVersion
    totalDepositBalanceUSD
    totalBorrowBalanceUSD
  }
}`;

const key = process.env.GRAPH_API_KEY;
if (!key) {
  console.error("GRAPH_API_KEY is not set.");
  console.error("Copy .env.example to .env and fill in a key from https://thegraph.com/studio");
  process.exit(1);
}

type Row = Target & {
  name?: string;
  version?: string;
  deposits?: string;
  borrows?: string;
  block?: number;
  deployment?: string;
  indexingErrors?: boolean;
  error?: string;
};

// Never throws. Every failure mode comes back as `error` so one dead deployment
// can't take the other three down with it.
async function queryProtocol(target: Target): Promise<Row> {
  try {
    const res = await fetch(`https://gateway.thegraph.com/api/${key}/subgraphs/id/${target.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: QUERY }),
    });

    if (!res.ok) {
      return { ...target, error: `HTTP ${res.status} ${res.statusText}` };
    }

    // GraphQL answers 200 even when the query failed — the errors are in the body.
    const json = await res.json();
    if (json.errors) {
      const message = json.errors.map((e: { message: string }) => e.message).join("; ");
      return { ...target, error: message.includes("no indexers found") ? "no indexers found" : message };
    }

    const protocol = json.data?.lendingProtocols?.[0];
    if (!protocol) return { ...target, error: "query succeeded but returned no lendingProtocols row" };

    return {
      ...target,
      name: protocol.name,
      version: protocol.schemaVersion,
      deposits: protocol.totalDepositBalanceUSD,
      borrows: protocol.totalBorrowBalanceUSD,
      block: json.data._meta.block.number,
      deployment: json.data._meta.deployment,
      indexingErrors: json.data._meta.hasIndexingErrors,
    };
  } catch (e) {
    return { ...target, error: e instanceof Error ? e.message : String(e) };
  }
}

const rows = await Promise.all(PROTOCOLS.map(queryProtocol));

console.log(
  "protocol".padEnd(22),
  "name".padEnd(14),
  "ver".padEnd(7),
  "deposits USD".padStart(18),
  "borrows USD".padStart(18),
  "block".padStart(10),
);

for (const r of rows) {
  if (r.error) {
    console.log(r.slug.padEnd(22), `FAILED — ${r.error}`);
    continue;
  }
  const drift = r.version === r.expected ? "" : `  <- expected ${r.expected}`;
  const errors = r.indexingErrors ? "  <- hasIndexingErrors" : "";
  console.log(
    r.slug.padEnd(22),
    (r.name ?? "").padEnd(14),
    (r.version ?? "").padEnd(7),
    Number(r.deposits).toFixed(2).padStart(18),
    Number(r.borrows).toFixed(2).padStart(18),
    String(r.block).padStart(10),
    drift + errors,
  );
}

// Printed only when morpho answered, so it never sits under a FAILED row. The figures
// are from a market-level query run once during introspection, not recomputed here.
if (rows.some((r) => r.slug === "morpho-blue" && !r.error)) {
  console.log();
  console.log("note: morpho-blue's total is inflated. 28 of its markets report deposits exactly equal to");
  console.log("      borrows — every dollar supplied is borrowed, to the cent, which no real market does.");
  console.log("      Those 28 hold ~$9.5B of the total; without them Morpho is around $3.65B.");
}

const ok = rows.filter((r) => !r.error);
const blocks = ok.map((r) => r.block as number);
const drifted = ok.filter((r) => r.version !== r.expected);

console.log();
console.log(`answered:        ${ok.length}/${rows.length}`);
console.log(`schemaVersion:   ${drifted.length === 0 ? "all match expected" : drifted.map((r) => `${r.slug} reports ${r.version}, expected ${r.expected}`).join("; ")}`);
if (blocks.length > 1) {
  console.log(`block spread:    ${Math.max(...blocks) - Math.min(...blocks)} blocks (${Math.min(...blocks)} … ${Math.max(...blocks)})`);
}
console.log();
for (const r of ok) console.log(`${r.slug.padEnd(22)} ${r.deployment}`);

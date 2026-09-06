// SM-04 — can we read Ethereum state at the block a subgraph reported, after the fact?
//
// This is the only genuinely independent check the reconciliation engine has. Everything else a
// subgraph tells us comes out of the same mapping code, so a wrong number stays wrong however many
// times we ask. Comparing against the chain is the one question with an outside answer.
//
// ⚠️ A non-archive node serves state for roughly the last 128 blocks. Subgraph heads lag chain head,
// so reading at the block a subgraph reported means reaching past what a pruned node can answer.
// §5.14 says: verify with an eth_call at head-1000, or restrict corroboration to the retained window
// and mark NOT_CHECKED outside it. This decides which.
//
// Four things get reported: whether the two numbers agree, how far back archive access actually
// goes, how far the subgraph is behind head right now, and whether Alchemy's free tier is archive
// for our purposes.
//
// Throwaway proof, not the real client — graph/corroborate.ts is the Phase 1 version.

const SUBGRAPH_ID = "JCNWRypm7FYwV8fx5HhzZPSFaMxgkPuw4TnR3Gpi81zk"; // aave-v3-ethereum
const MARKET = "Aave Ethereum USDC";

// totalSupply() and balanceOf(address), as selectors.
const TOTAL_SUPPLY = "0x18160ddd";

// WETH. Deployed at block 4,719,568 in 2017, so it exists at every depth worth probing — which lets
// the depth ladder distinguish "the node cannot serve this block" from "the contract did not exist
// yet", two failures that look identical from the outside.
const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";

const graphKey = process.env.GRAPH_API_KEY;
if (!graphKey) {
  console.error("FAIL  GRAPH_API_KEY is not set.");
  process.exit(1);
}

if (!process.env.ETHEREUM_RPC_URL?.trim()) {
  console.error("FAIL  ETHEREUM_RPC_URL is not set. It must be a full, archive-capable URL — see .env.example.");
  process.exit(1);
}
const rpcUrl: string = process.env.ETHEREUM_RPC_URL.trim();

type RpcResult = { result?: string; error?: { code: number; message: string } };

async function rpc(method: string, params: unknown[]): Promise<RpcResult> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) return { error: { code: res.status, message: `HTTP ${res.status} ${res.statusText}` } };
  return res.json();
}

const callAt = (to: string, data: string, block: number) =>
  rpc("eth_call", [{ to, data }, `0x${block.toString(16)}`]);

// ─── 1. What the subgraph says ───────────────────────────────────────────────────────────────────

console.log(`\n── 1 · the subgraph's account`);

const QUERY = `query {
  _meta { block { number timestamp } hasIndexingErrors }
  markets(where: { name: "${MARKET}" }) {
    id
    name
    inputTokenBalance
    inputTokenPriceUSD
    inputToken { id symbol decimals }
    outputToken { id symbol decimals }
  }
}`;

const gqlRes = await fetch(`https://gateway.thegraph.com/api/${graphKey}/subgraphs/id/${SUBGRAPH_ID}`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ query: QUERY }),
});
const gql = await gqlRes.json();
if (gql.errors) {
  console.error(`FAIL  subgraph query failed — ${gql.errors.map((e: { message: string }) => e.message).join("; ")}`);
  process.exit(1);
}

const market = gql.data?.markets?.[0];
if (!market) {
  console.error(`FAIL  no market named "${MARKET}".`);
  process.exit(1);
}

const subgraphBlock: number = gql.data._meta.block.number;
const aToken: string = market.outputToken.id;
const decimals: number = Number(market.outputToken.decimals);
const reported = BigInt(market.inputTokenBalance);

console.log(`  ${market.name}`);
console.log(`  indexed through block  ${subgraphBlock}  (indexing errors: ${gql.data._meta.hasIndexingErrors})`);
console.log(`  aToken                 ${aToken}  ${market.outputToken.symbol}, ${decimals}dp`);
console.log(`  inputTokenBalance      ${reported}`);
console.log(`  inputTokenPriceUSD     ${market.inputTokenPriceUSD}`);

// ─── 2. What the chain says, at that same block ──────────────────────────────────────────────────
// ⚠️ The comparison the whole engine rests on. The Messari mapping stores aToken.totalSupply() as
// inputTokenBalance, so these are meant to be the same quantity read two ways.

console.log(`\n── 2 · the chain's account, at block ${subgraphBlock}`);

const chainHead = Number(BigInt((await rpc("eth_blockNumber", [])).result ?? "0x0"));
console.log(`  chain head             ${chainHead}`);

const supplyRes = await callAt(aToken, TOTAL_SUPPLY, subgraphBlock);
if (!supplyRes.result || supplyRes.result === "0x") {
  console.error(`\nFAIL  eth_call at block ${subgraphBlock} returned nothing.`);
  console.error(`      ${JSON.stringify(supplyRes.error ?? supplyRes)}`);
  console.error(`      This is the archive question failing. §5.14's fallback applies: restrict`);
  console.error(`      corroboration to the retained window and mark NOT_CHECKED outside it.`);
  process.exit(1);
}

const onChain = BigInt(supplyRes.result);
const diff = onChain - reported;
const units = (v: bigint) => (Number(v) / 10 ** decimals).toLocaleString("en-US", { maximumFractionDigits: 2 });

console.log(`  totalSupply()          ${onChain}`);
console.log(`  subgraph               ${reported}`);
console.log(`  difference             ${diff >= 0n ? "+" : ""}${diff}  (${diff >= 0n ? "+" : ""}${units(diff)} ${market.inputToken.symbol})`);

if (diff === 0n) {
  console.log(`  ⇒ exact agreement.`);
} else {
  const relative = Number(diff < 0n ? -diff : diff) / Number(reported);
  console.log(`  ⇒ ${(relative * 100).toPrecision(3)}% apart — chain reads ${diff > 0n ? "HIGHER" : "LOWER"} than the subgraph.`);
  console.log(`    Not adjusted to make them match; the size and direction are the finding.`);
}

// ─── 3. How far back the node will actually go ───────────────────────────────────────────────────
// ⚠️ The real question. Step 2 can pass on a pruned node if the subgraph happens to sit near head.
// Two ladders: the aToken at the depths §8 names, and WETH — old enough to exist at any depth — so
// a refusal deep in the chain is attributable to the node rather than to the contract's age.

console.log(`\n── 3 · archive depth`);

// ⚠️ Three outcomes, not two, and conflating the last two is how this probe lies. A JSON-RPC error
// means the node will not serve state that old — the archive failure we are actually testing for. An
// empty `0x` result means the call reached the block fine and there was simply no contract at that
// address yet, which says nothing about archive depth. The first run of this test called block 1 and
// counted WETH's non-existence as a refusal.
type Outcome = "ok" | "no-code" | "refused";
type Probe = { depth: number; block: number; outcome: Outcome; detail: string };

const probe = async (label: string, to: string, depths: number[]): Promise<Probe[]> => {
  const results: Probe[] = [];
  for (const depth of depths) {
    const block = chainHead - depth;
    if (block < 1) continue;
    const res = await callAt(to, TOTAL_SUPPLY, block);
    const outcome: Outcome = res.error ? "refused" : !res.result || res.result === "0x" ? "no-code" : "ok";
    const detail =
      outcome === "ok"
        ? BigInt(res.result!).toString()
        : outcome === "refused"
          ? JSON.stringify(res.error)
          : "no contract code at this block";
    results.push({ depth, block, outcome, detail });
    console.log(
      `  ${label}  head-${String(depth).padStart(8)}  block ${String(block).padStart(8)}  ` +
        `${outcome.padEnd(8)} ${detail}`,
    );
  }
  return results;
};

const shallow = await probe("aToken", aToken, [100, 1_000, 10_000, 100_000]);
// WETH was deployed at block 4,719,568, so the ladder stops above it — below that the address has no
// code and the answer would be about Ethereum's history, not about Alchemy's retention.
const deep = await probe("WETH  ", WETH, [1_000_000, 5_000_000, 10_000_000, 20_000_000]);

// The genesis-depth question needs a call that is meaningful at every block. Every address has a
// balance at every block, so eth_getBalance separates "this node has no state that old" from "there
// was nothing there" — which eth_call cannot do.
const genesisRes = await rpc("eth_getBalance", [WETH, "0x1"]);
const genesisOk = !genesisRes.error;
console.log(
  `  balance   block        1  ${genesisOk ? `ok       ${BigInt(genesisRes.result ?? "0x0")} wei` : `refused  ${JSON.stringify(genesisRes.error)}`}`,
);

const probes = [...shallow, ...deep];
const deepest = probes.filter((p) => p.outcome === "ok").sort((a, b) => b.depth - a.depth)[0];
const refused = probes.filter((p) => p.outcome === "refused");

// ─── 4. The gap that decides whether any of this is needed ───────────────────────────────────────

console.log(`\n── 4 · subgraph lag`);

const gap = chainHead - subgraphBlock;
console.log(`  chain head ${chainHead} − subgraph ${subgraphBlock} = ${gap} blocks`);
console.log(
  gap > 128
    ? `  ⇒ ${gap} blocks is past the ~128 a pruned node retains. Corroboration REQUIRES archive.`
    : `  ⇒ ${gap} blocks is inside the ~128 a pruned node retains — right now. That is a property of\n` +
      `    this moment, not a guarantee: the gap moves, and a check that only works when the\n` +
      `    subgraph is caught up is a check that fails exactly when the subgraph is struggling.`,
);

console.log(`\n── Result`);
console.log(
  `  agreement    ${diff === 0n ? "exact" : `${diff >= 0n ? "+" : ""}${diff} (${((Number(diff < 0n ? -diff : diff) / Number(reported)) * 100).toPrecision(3)}%)`}`,
);
console.log(
  `  archive      deepest successful read: head-${deepest?.depth ?? "none"}` +
    (deepest ? ` (block ${deepest.block})` : "") +
    (refused.length ? `; ${refused.length} refused` : "; nothing refused") +
    `; genesis-depth balance ${genesisOk ? "served" : "refused"}`,
);
console.log(`  subgraph lag ${gap} blocks`);

// The archive question is the one that decides §5.14, so it is the one that decides the exit code.
// The balance comparison is reported either way — a difference is a finding, not a failure.
const archiveWorks = refused.length === 0 && genesisOk;

if (!archiveWorks) {
  console.error(`\nFAIL  SM-04. ${refused.length} historical read(s) refused, deepest success head-${deepest?.depth ?? 0}.`);
  console.error(`      §5.14's fallback applies: restrict corroboration to the retained window and`);
  console.error(`      mark NOT_CHECKED outside it. R27 stays live.`);
  process.exit(1);
}

console.log(`\nPASS  SM-04. Historical state is servable to head-${deepest!.depth} and the two sources are comparable.`);

# Mini-report: The Graph's Subgraph MCP

**Researched:** Sept 5, 2026
**Method:** docs, GitHub, and search. ⚠️ **Nothing was executed.** No API key, no calls made. Every
claim is from published documentation or repo metadata — **treat runtime behaviour as unverified.**

---

## 1. What it is

An open-source implementation of MCP that exposes The Graph's subgraph data as tools any MCP client
can call. <cite index="29-1">The server itself does not hold a language model — it translates incoming MCP requests into subgraph queries and returns structured results, letting the client's LLM turn a natural-language prompt into blockchain data.</cite>

**Hosted endpoint:** `https://subgraphs.mcp.thegraph.com/sse` — SSE transport, `Authorization: Bearer
<API_KEY>`.
**Source:** `graphops/subgraph-mcp`. ⚠️ Earlier research put its last push at **2025-06-24 — over a
year stale**, though the hosted endpoint is current and documented under The Graph's AI Suite.

### The tools

<cite index="19-1">`get_schema_by_deployment_id`, `get_schema_by_subgraph_id`, `get_schema_by_ipfs_hash`, `execute_query_by_deployment_id`, `execute_query_by_subgraph_id`, `execute_query_by_ipfs_hash`, and `get_top_subgraph_deployments` (top subgraphs for a contract on a specific chain).</cite>
Plus <cite index="23-1">search by keyword across display names, ordered by signal</cite>, and <cite index="22-1">30-day query volumes for deployments.</cite>

**Shape of the intended loop:** <cite index="19-1">fetch the schema with the appropriate `get_schema_by_*` tool, convert the question into a GraphQL query, execute with the matching `execute_query_by_*` tool, present results.</cite>

---

## 2. ✅ Can our server-side agent use it? Yes.

**This was the open question, and the answer is yes.** Anthropic's Messages API has an MCP connector:
<cite index="48-1">connect to remote MCP servers without implementing an MCP client, with OAuth bearer token support for authenticated servers, and multiple servers in a single request.</cite>

```js
mcp_servers: [{
  type: "url",
  url: "https://subgraphs.mcp.thegraph.com/sse",
  name: "subgraph-mcp",
  authorization_token: process.env.GRAPH_API_KEY,
}]
```

<cite index="47-1">Anthropic's API connects to the server side-side, so you skip writing an MCP client entirely.</cite>

### ⚠️ Four constraints that matter

**1. Tools only — no resources, no prompts.** <cite index="48-1">Of the MCP specification's feature set, only tool calls are currently supported.</cite>

This is a real problem, because The Graph's own docs say: <cite index="23-1">Claude Desktop may not automatically utilize the Subgraph MCP. You must manually add the "Subgraph Server Instructions" resource to your chat context for each conversation where you want to use it.</cite>

**That instructions resource is an MCP *resource*, which the connector doesn't support.** So via the
API we'd have to fetch those instructions ourselves and inject them into the system prompt. Doable,
but it means the MCP isn't quite plug-and-play.

**2. Beta header, and it moves.** <cite index="44-1">The previous version (`mcp-client-2025-04-04`) is deprecated.</cite> Current is
`mcp-client-2025-11-20`. Pin it and watch for churn.

**3. Anthropic's infrastructure opens the connection, not ours.** <cite index="47-1">The TCP connection to the MCP server is opened by Anthropic's infrastructure, so firewall rules must allowlist Anthropic's outbound range.</cite> Not a problem for a
public gateway, but it means our API key travels to Anthropic and out from their IPs.

**4. Not covered by ZDR.** <cite index="44-1">Data exchanged with MCP servers, including tool definitions and execution results, is retained according to Anthropic's standard data retention policy.</cite> Irrelevant for a hackathon, worth knowing.

---

## 3. 🔴 The finding that changes a decision: the x402 gateway is live

This is the biggest thing in this research and it wasn't on our radar.

<cite index="30-1">The Graph's Subgraph Gateways accept x402 payments for per-query access. Agents and applications can pay in USDC over HTTP without an API key.</cite> Two access paths:

| | Endpoint | Auth |
|---|---|---|
| **API key** (best for humans) | `POST /api/subgraphs/id/{subgraph_id}` | `Authorization: Bearer <API_KEY>` |
| **x402** (best for agents) | `POST /api/x402/subgraphs/id/{subgraph_id}` | **None — payment is the auth** |

<cite index="30-1">Per-query access to any subgraph published on The Graph Network, USDC payments on Base mainnet and Base Sepolia, and no API keys, accounts, or sessions — payment and access happen in a single HTTP round trip.</cite>

<cite index="30-1">x402 suits autonomous agents and short-lived processes that can't store long-term credentials, per-query workloads where pre-purchased credits don't fit, and integrations that prefer HTTP-native payment over account management.</cite>

**Price and availability:** third-party sources put it at **$0.01 USDC per query on Base**, with the
public x402 gateway <cite index="35-1">live since 2026-05-08.</cite> ⚠️ **Unverified** — confirm against The Graph's own docs before
relying on the figure.

### Why this matters for us

I previously recommended **cutting Base** to avoid a third chain. **This is the argument for putting it
back**, and it's stronger than I gave it credit for:

- The prize text explicitly names it: <cite index="33-1">let your agent pay per query autonomously with x402</cite>, and lists <cite index="33-1">x402 payment tooling</cite> among the AI track's target artifacts.
- **It's a genuine agent-autonomy beat** — our analyst agent paying for its own data with no API key,
  on stage, is more convincing than an env var.
- It composes with our existing story: we already run an x402 gate on Hedera. **Being both an x402
  buyer (Base, for data) and an x402 seller (Hedera, for reports) is a much better narrative than
  either alone.**

**The cost:** a third chain, a Base wallet with USDC, and `@x402/evm` alongside `@x402/hedera` — which
brings back the `@hiero-ledger/sdk` pin question we resolved for ATS. **Not free, but the payoff is
larger than I estimated.**

---

## 4. What it gives us over direct GraphQL

Our current plan queries five known endpoints directly. The MCP adds:

| Capability | Useful to us? |
|---|---|
| **Schema introspection by ID** | Marginal — we've already extracted the curated schema (~7,664 tokens) and would inject it anyway |
| **Query execution** | Marginal — a `fetch` to the gateway is simpler and we control retries, timeouts, `_meta` |
| **Keyword search, ordered by signal** | ✅ **Genuinely useful** — this is how "add a protocol" becomes agent-driven rather than config-driven |
| **Top deployments by contract address** | ✅ Useful for discovery if the directive names a protocol we haven't configured |
| **30-day query volumes** | Nice signal for "is this deployment actually used" — complements the curation-signal check |

**Honest read: for the five protocols we've picked, the MCP buys us little.** We know the query IDs, we
have the schema, and direct `fetch` gives more control.

**Where it earns its place is discovery** — a directive naming a protocol outside our config, where the
agent searches, finds the deployment, introspects, and queries. **That's a real agent capability and
it's demoable.**

⚠️ **But note the tension with our own findings:** the MCP returns raw schemas. Our research established
that a raw Messari schema is a trap for an agent — `_`-prefixed fields, enum drift between versions,
four semantic facts the descriptions don't carry. **So MCP-for-discovery still needs our curation layer
on top.** The MCP finds the subgraph; our skill teaches the agent to query it correctly.

---

## 5. ⚠️ The competitive picture

The Graph's own blog on MCP and skills links four community MCP servers, all by the same author: <cite index="31-1">Subgraph Search MCP, Substreams Search MCP, Graph Lending MCP, and Graph Aave MCP.</cite>

That's the same maintainer flagged in the skills research. What exists already:

- **`graph-lending-mcp`** — Messari standardized lending subgraphs, the exact data layer we're building
  on. Featured in The Graph's own case study.
- **`graph-aave-mcp`** — Aave v2/v3/v4 across 7 chains, 11 subgraphs. Pushed 2026-09-02.
- **`subgraph-registry`** — <cite index="35-1">semantic classification of all 15K+ subgraphs with domain classification, protocol type detection, schema fingerprinting, and reliability scoring</cite>, published as SQLite + REST + MCP, and <cite index="35-1">every result includes an x402 query URL alongside the legacy one.</cite>
- **PayQL** — an MCP that does discovery, price preflight, paid query, and schema introspection, with a
  spend cap.

**What this means:** "build an MCP server for lending subgraphs" is taken, twice. **Our differentiation
isn't access to the data — it's what we do with it:** the reconciliation, the report structure, the
tokenized sale, the market settling on it. **The MCP layer is commodity; the analyst is not.**

It also reinforces the earlier call: **publish our skill under our own name.**

---

## 6. Verdict

**Use it, but for discovery — not as the primary data path.**

Three concrete recommendations:

**1. Direct `fetch` stays the primary path** for the five configured protocols. We control retries,
timeouts, `_meta`, and block pinning. The MCP adds a hop and a dependency for capabilities we don't
need there.

**2. Wire the MCP connector for discovery.** When a directive names a protocol outside our config, the
agent uses `search_subgraphs_by_keyword` and `get_top_subgraph_deployments` to find it, then
introspects. **~1–2 hours via `mcp_servers` in the Messages API, and it's a real demo beat** — "ask for
a protocol I never configured, watch it find one."

**3. Reconsider the x402 gateway on Base.** I said cut it. On this evidence I'd say **build it if the
core loop is done by Day 6.** It's explicitly named in the prize text, it's a genuine autonomy beat,
and being both an x402 buyer and seller is a stronger story than either alone. **But it's a third chain
and it stays behind the core loop.**

---

## What I'd verify before relying on any of this

- ⚠️ **The $0.01/query figure and the Base-mainnet-vs-Sepolia split** — from third-party sources, not
  The Graph's docs
- Whether `graphops/subgraph-mcp` being a year stale affects the hosted endpoint (probably not — it's
  under The Graph's AI Suite docs — but unconfirmed)
- Whether the MCP connector's tools-only limitation actually breaks the Subgraph MCP's intended flow,
  given its instructions live in an unsupported resource
- **Latency.** Anthropic's infra → MCP server → gateway → indexer is three hops. We measured ~200ms of
  pure network to the gateway alone. **For a multi-query report this could matter**
- Whether the x402 gateway path works with the same subgraph IDs we've already got

---

## Open questions for the build

- **Does MCP discovery belong in `discover.ts`, or is it a separate tool the agent calls?** The current
  design has `discover.ts` doing MCP introspection — this research suggests splitting: MCP for finding
  *unknown* subgraphs, direct introspection for *configured* ones
- **If we add the x402 Base path, does the agent choose between paths?** "Use the API key for
  configured protocols, pay x402 for discovered ones" is a coherent policy and a nice autonomy story
- **Where do the Subgraph Server Instructions go**, given the connector can't fetch them as a resource

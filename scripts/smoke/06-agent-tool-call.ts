// SM-06 — first contact between the agent and the data layer.
// Proves Claude will choose to call a tool, that the tool reaches a real subgraph, and
// that the returned data gets back into the conversation. Nothing more.
//
// The prompt deliberately forbids reasoning. This test separates WIRING from THINKING:
// if we asked the model to analyse, a wrong answer would be ambiguous between a broken
// tool and a confused model, and we would have learned nothing about either.
// Throwaway proof, not the real client — the agent loop proper lands in Phase 3.

import Anthropic from "@anthropic-ai/sdk";

const SUBGRAPH = "JCNWRypm7FYwV8fx5HhzZPSFaMxgkPuw4TnR3Gpi81zk"; // aave-v3-ethereum
const MODEL = "claude-opus-5";

// The same document SM-02 sends to all five deployments.
const DOCUMENT = `query {
  _meta { block { number } }
  lendingProtocols(first: 1) {
    name
    schemaVersion
    totalDepositBalanceUSD
    totalBorrowBalanceUSD
  }
}`;

const graphKey = process.env.GRAPH_API_KEY;
const anthropicKey = process.env.ANTHROPIC_API_KEY;
for (const [name, value] of [["GRAPH_API_KEY", graphKey], ["ANTHROPIC_API_KEY", anthropicKey]]) {
  if (!value) {
    console.error(`${name} is not set. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
}

const TOOL: Anthropic.Tool = {
  name: "run_document",
  description:
    "Query a lending protocol subgraph on The Graph and return its current totals. " +
    "Returns the protocol name, schema version, total deposit balance in USD, total " +
    "borrow balance in USD, and the block the data was read at.",
  input_schema: {
    type: "object",
    properties: {
      slug: {
        type: "string",
        enum: ["aave-v3-ethereum"],
        description: "Which deployment to query.",
      },
    },
    required: ["slug"],
    additionalProperties: false,
  },
  strict: true,
};

// The tool body. One deployment, one document — the slug is checked, not interpolated.
async function runDocument(slug: string): Promise<string> {
  if (slug !== "aave-v3-ethereum") return JSON.stringify({ error: `unknown slug: ${slug}` });
  const res = await fetch(`https://gateway.thegraph.com/api/${graphKey}/subgraphs/id/${SUBGRAPH}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: DOCUMENT }),
  });
  if (!res.ok) return JSON.stringify({ error: `HTTP ${res.status} ${res.statusText}` });
  const json = await res.json();
  if (json.errors) return JSON.stringify({ error: json.errors.map((e: { message: string }) => e.message).join("; ") });
  return JSON.stringify({ ...json.data.lendingProtocols[0], block: json.data._meta.block.number });
}

const client = new Anthropic({ apiKey: anthropicKey });

const messages: Anthropic.MessageParam[] = [
  { role: "user", content: "What's Aave v3's total deposit balance?" },
];

console.log(`model:  ${MODEL}`);
console.log(`asked:  ${messages[0].content}`);
console.log();

let turn = 0;
while (true) {
  turn++;
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: "low" }, // a wiring test, not a thinking test
    system:
      "You have one tool for reading live protocol data. Use it to answer, then state " +
      "exactly what it returned. Do not analyse, interpret, contextualise or comment on " +
      "the numbers — report them and stop.",
    tools: [TOOL],
    messages,
  });

  console.log(`turn ${turn} — stop_reason: ${response.stop_reason}`);

  const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  for (const block of response.content) {
    if (block.type === "text" && block.text.trim()) console.log(`  says: ${block.text.trim()}`);
  }

  if (response.stop_reason !== "tool_use") {
    console.log();
    console.log(toolUses.length === 0 && turn === 1
      ? "FAILED — the model answered without calling the tool."
      : "loop closed.");
    break;
  }

  // Echo the assistant turn back whole; thinking blocks have to survive the round trip.
  messages.push({ role: "assistant", content: response.content });

  const results: Anthropic.ToolResultBlockParam[] = [];
  for (const call of toolUses) {
    const { slug } = call.input as { slug: string };
    console.log(`  calls: ${call.name}(slug: "${slug}")`);
    const result = await runDocument(slug);
    console.log(`  tool:  ${result}`);
    results.push({ type: "tool_result", tool_use_id: call.id, content: result });
  }
  messages.push({ role: "user", content: results });
}

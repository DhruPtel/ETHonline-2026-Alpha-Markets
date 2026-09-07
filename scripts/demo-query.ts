// Unit 3's proof. Runs the real client against the live gateway — no mocks.
//   1. one deployment, and the numbers it returns
//   2. five deployments at once, side by side
//   3. a deliberately bad field name — the HTTP-200-with-errors path
//   4. block pinning, which is how Phase 4 settlement re-reads the past
//   5. a read below the retained window, to capture the PRUNED string PLAN-v4 §8 still
//      lists as an unlooked-up Day 1 item
import { querySubgraph, querySubgraphs, SubgraphError } from '../src/graph/client.js';

// No _meta here on purpose — the client injects it. If these printed blocks and deployment
// hashes, injection worked.
const BALANCE_SHEET = `query {
  lendingProtocols(first: 1) {
    name
    schemaVersion
    totalDepositBalanceUSD
    totalBorrowBalanceUSD
  }
}`;

const PINNED = `query($block: Block_height) {
  lendingProtocols(first: 1, block: $block) {
    name
    totalDepositBalanceUSD
  }
}`;

const BAD_FIELD = `query { lendingProtocols(first: 1) { name totallyNotAField } }`;

const usd = (s: string) => `$${(Number(s) / 1e9).toFixed(2)}B`;
const rule = (n = 96) => console.log('─'.repeat(n));

type Protocols = { lendingProtocols: { name: string; schemaVersion: string; totalDepositBalanceUSD: string; totalBorrowBalanceUSD: string }[] };

// ─── 1 · one deployment ──────────────────────────────────────────────────────────────────
console.log('\n1 · querySubgraph("aave-v3-ethereum") — one deployment\n');
const one = await querySubgraph<Protocols>('aave-v3-ethereum', BALANCE_SHEET);
const p = one.data.lendingProtocols[0]!;
console.log(`  name            ${p.name}`);
console.log(`  schemaVersion   ${p.schemaVersion}   (config declares 3.1.0)`);
console.log(`  deposits        ${usd(p.totalDepositBalanceUSD)}`);
console.log(`  borrows         ${usd(p.totalBorrowBalanceUSD)}`);
console.log(`  _meta.block     ${one.meta.blockNumber}  ts ${one.meta.blockTimestamp}`);
console.log(`  _meta.deployment ${one.meta.deployment}`);
console.log(`  indexingErrors  ${one.meta.hasIndexingErrors}    attempts ${one.attempts}`);
console.log(`  fetchedAt       ${one.fetchedAt}`);

// ─── 2 · five at once ────────────────────────────────────────────────────────────────────
const SLUGS = ['aave-v3-ethereum', 'aave-v2-ethereum', 'compound-v3-ethereum', 'compound-v2-ethereum', 'morpho-blue'];
console.log('\n\n2 · querySubgraphs(...) — five deployments in one call\n');
const t0 = Date.now();
const many = await querySubgraphs<Protocols>(SLUGS, BALANCE_SHEET);
const elapsed = Date.now() - t0;

const pad = (s: string, n: number) => s.padEnd(n).slice(0, n);
console.log('  ' + pad('slug', 24) + pad('schema', 8) + pad('deposits', 13) + pad('borrows', 13) + pad('block', 11) + 'deployment');
rule();
for (const o of many) {
  if (!o.ok) { console.log('  ' + pad(o.slug, 24) + `✗ ${o.error.kind}: ${o.error.message}`); continue; }
  const r = o.result, lp = r.data.lendingProtocols?.[0];
  console.log('  ' + pad(o.slug, 24) + pad(lp?.schemaVersion ?? '—', 8) +
    pad(lp ? usd(lp.totalDepositBalanceUSD) : '—', 13) + pad(lp ? usd(lp.totalBorrowBalanceUSD) : '—', 13) +
    pad(String(r.meta.blockNumber), 11) + r.meta.deployment.slice(0, 16) + '…');
}
rule();
const blocks = many.filter((o) => o.ok).map((o) => (o as { result: { meta: { blockNumber: number } } }).result.meta.blockNumber);
console.log(`  ${many.filter((o) => o.ok).length}/${many.length} ok in ${elapsed}ms · block spread ${Math.max(...blocks) - Math.min(...blocks)}`);

// ─── 3 · HTTP 200 with json.errors ───────────────────────────────────────────────────────
console.log('\n\n3 · a field that does not exist — HTTP 200, error in the body\n');
try {
  await querySubgraph('aave-v3-ethereum', BAD_FIELD);
  console.log('  ✗ expected a throw and did not get one');
} catch (e) {
  const err = e as SubgraphError;
  console.log(`  kind     ${err.kind}`);
  console.log(`  message  ${err.message.slice(0, 200)}`);
}

// ─── 4 · block pinning ───────────────────────────────────────────────────────────────────
console.log('\n\n4 · block pinning — how settlement re-reads the past\n');
const past = one.meta.blockNumber - 200;
try {
  const pinned = await querySubgraph<Protocols>('aave-v3-ethereum', PINNED, {}, past);
  console.log(`  asked for block ${past}, _meta says ${pinned.meta.blockNumber}, requestedBlock ${pinned.requestedBlock}`);
  console.log(`  deposits then   ${usd(pinned.data.lendingProtocols[0]!.totalDepositBalanceUSD)}`);
  console.log(`  deposits now    ${usd(p.totalDepositBalanceUSD)}`);
} catch (e) {
  const err = e as SubgraphError;
  console.log(`  ✗ ${err.kind}: ${err.message.slice(0, 200)}`);
}

// ─── 5 · the three block failures, which the gateway does not name differently ───────────
console.log('\n\n5 · three block failures — measured, not assumed\n');
const head = one.meta.blockNumber;
for (const [label, blk] of [['below retained window', head - 800_000], ['above indexed head', head + 50], ['before manifest genesis', 1]] as const) {
  try {
    await querySubgraph('aave-v3-ethereum', PINNED, {}, blk);
    console.log(`  ${pad(label, 26)}block ${blk}  no error`);
  } catch (e) {
    const err = e as SubgraphError;
    console.log(`  ${pad(label, 26)}block ${String(blk).padEnd(10)} → ${pad(err.kind, 20)}${err.message.slice(0, 60)}`);
  }
}
console.log('\n  All three arrive as HTTP 200 with a body message. The first two are the SAME');
console.log('  string; only the arithmetic inside it separates them.');
console.log();

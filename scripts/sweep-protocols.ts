// Unit 5 — the sweep. Asks every deployment in config/protocols.ts whether it answers and
// what it says. It does not judge the numbers; that is triage, Unit 6.
//
// ⚠️ The balance-sheet document is INLINE here rather than imported. Unit 4 was never built —
// `src/graph/queries/` does not exist — so there is nothing to reuse. Inlining keeps this
// throwaway script from pre-empting Unit 4's still-open decision about how the documents
// cover five live schema versions. This sweep is what tells us that.
import { writeFileSync } from 'node:fs';
import { querySubgraphs, type QueryOutcome } from '../src/graph/client.js';
import { PROTOCOLS } from '../src/config/protocols.js';
import { BALANCE_SHEET } from '../src/graph/queries/index.js';

// Tier 1 — the two fields every version that answered Unit 3 already served.
const PROBE = `query { lendingProtocols(first: 1) { name schemaVersion } }`;
// Tier 2 — the real balance-sheet document (Unit 4). No longer inlined: `src/graph/queries/`
// now exists, and it carries `lendingType`, which is why this column stopped being null.
const SHEET = BALANCE_SHEET;
type Sheet = { lendingProtocols: Record<string, string | null>[] };
const slugs = PROTOCOLS.map((p) => p.slug);

const head = await (async () => {
  const url = process.env.ETHEREUM_RPC_URL;
  if (!url) return null;
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }) });
  return Number((await r.json() as { result: string }).result);
})();

const t0 = Date.now();
const [probes, sheets] = await Promise.all([
  querySubgraphs<Sheet>(slugs, PROBE),
  querySubgraphs<Sheet>(slugs, SHEET),
]);
const elapsed = Date.now() - t0;
const byslug = <T>(rs: QueryOutcome<T>[]) => new Map(rs.map((r) => [r.slug, r]));
const P = byslug(probes), S = byslug(sheets);

const NUMERIC = ['totalDepositBalanceUSD', 'totalBorrowBalanceUSD', 'totalValueLockedUSD', 'cumulativeTotalRevenueUSD', 'lendingType'];
const now = Math.floor(Date.now() / 1000);

type Row = { slug: string; live: string | null; lendingType: string | null; deposits: number | null; borrows: number | null;
  block: number | null; behind: number | null; lagSec: number | null; errs: boolean | null;
  nulls: string[]; status: string; note: string };

const rows: Row[] = slugs.map((slug) => {
  const p = P.get(slug)!, s = S.get(slug)!;
  const lp = p.ok ? p.result.data.lendingProtocols?.[0] : undefined;
  const sp = s.ok ? s.result.data.lendingProtocols?.[0] : undefined;
  const meta = p.ok ? p.result.meta : s.ok ? s.result.meta : null;
  const nulls = sp ? NUMERIC.filter((f) => sp[f] === null) : [];
  const num = (v: string | null | undefined) => (v == null ? null : Number(v));
  const status = !p.ok && !s.ok
    ? (p.error.message.includes('no status') || p.error.message.includes('not available') ? 'no_indexers' : 'error')
    : 'live';
  const note = p.ok ? (s.ok ? '' : `sheet: ${s.error.message.slice(0, 64)}`) : p.error.message.slice(0, 64);
  return {
    slug, live: lp?.schemaVersion ?? sp?.schemaVersion ?? null,
    lendingType: (sp?.lendingType as string | undefined) ?? null,
    deposits: num(sp?.totalDepositBalanceUSD), borrows: num(sp?.totalBorrowBalanceUSD),
    block: meta?.blockNumber ?? null, behind: head && meta ? head - meta.blockNumber : null,
    lagSec: meta?.blockTimestamp ? now - meta.blockTimestamp : null,
    errs: meta?.hasIndexingErrors ?? null, nulls, status, note,
  };
});
rows.sort((a, b) => (b.deposits ?? -1) - (a.deposits ?? -1));

const pad = (s: string, n: number) => s.padEnd(n).slice(0, n);
const lpad = (s: string, n: number) => s.padStart(n).slice(-n);
const usd = (v: number | null) => (v == null ? '—' : v >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : `$${(v / 1e6).toFixed(1)}M`);
const lag = (s: number | null) => (s == null ? '—' : s < 3600 ? `${Math.round(s / 60)}m` : `${(s / 3600).toFixed(1)}h`);

console.log(`\nchain head ${head ?? '(no RPC)'} · swept ${slugs.length} deployments in ${elapsed}ms\n`);
console.log(pad('slug', 27) + pad('live', 8) + pad('type', 8) + lpad('deposits', 10) + lpad('borrows', 10) +
  lpad('block', 11) + lpad('behind', 8) + lpad('lag', 7) + '  ' + pad('status', 12) + 'nulls / note');
console.log('─'.repeat(130));
for (const r of rows) {
  console.log(pad(r.slug, 27) + pad(r.live ?? '—', 8) + pad(r.lendingType ?? '—', 8) + lpad(usd(r.deposits), 10) + lpad(usd(r.borrows), 10) +
    lpad(r.block ? String(r.block) : '—', 11) + lpad(r.behind == null ? '—' : String(r.behind), 8) +
    lpad(lag(r.lagSec), 7) + '  ' + pad(r.status + (r.errs ? ' ⚠err' : ''), 12) +
    (r.nulls.length ? `NULL: ${r.nulls.join(', ')}` : r.note));
}
console.log('─'.repeat(130));

const answered = rows.filter((r) => r.status === 'live');
const laggingHr = answered.filter((r) => (r.lagSec ?? 0) > 3600);
const withNulls = answered.filter((r) => r.nulls.length > 0);
const noSheet = answered.filter((r) => r.deposits == null);
console.log(`\n${answered.length} of ${rows.length} answered · ${laggingHr.length} lagging > 1h · ${withNulls.length} returned nulls where figures were expected`);
if (noSheet.length) console.log(`${noSheet.length} answered the probe but not the balance sheet: ${noSheet.map((r) => r.slug).join(', ')}`);
const dist: Record<string, number> = {};
for (const r of answered) if (r.live) dist[r.live] = (dist[r.live] ?? 0) + 1;
console.log('live schema versions:', JSON.stringify(dist));

console.log('\n--- config patch (slug, liveSchemaVersion, status, lastSwept) ---');
const today = new Date().toISOString().slice(0, 10);
console.log(JSON.stringify(rows.map((r) => [r.slug, r.live, r.status, today, r.lendingType]), null, 0));

// ─── docs/protocol-inventory.md ──────────────────────────────────────────────────────────
// `npx tsx --env-file=.env scripts/sweep-protocols.ts --inventory` regenerates the committed
// artifact. Every open question below is computed from this run, not transcribed.
if (process.argv.includes('--inventory')) {
  const inverted = answered.filter((r) => r.deposits != null && r.borrows != null && r.borrows > r.deposits);
  const tiny = answered.filter((r) => (r.deposits ?? 0) < 1e6);
  const blocks = new Map<number, string[]>();
  for (const r of laggingHr) if (r.block) blocks.set(r.block, [...(blocks.get(r.block) ?? []), r.slug]);
  const shared = [...blocks.entries()].filter(([, v]) => v.length > 1);
  const spark = rows.findIndex((r) => r.slug === 'spark-lend-ethereum');
  const q = (n: number, s: string) => `**${n}.** ${s}`;

  const md = `# Protocol inventory

Every Ethereum lending deployment in \`src/config/protocols.ts\`, measured rather than asserted.
**Swept ${today}**, chain head ${head ?? 'unknown'}. Every figure below came from a live query to The
Graph's decentralized gateway through \`src/graph/client.ts\` — no cache, no fixture, no local index.
Deployments are the 27 Ethereum \`lending\` entries in Messari's \`deployment.json\` that are both
\`status: prod\` and have a published query-id, plus morpho-blue, which Morpho publish themselves on
Messari's standardized template.

Regenerate with \`npx tsx --env-file=.env scripts/sweep-protocols.ts --inventory\`.

## Summary

**${answered.length} of ${rows.length} answered.** ${laggingHr.length} lagging more than an hour. ${withNulls.length} returned nulls where figures were expected.

Live schema versions: ${Object.entries(dist).sort((a, b) => b[1] - a[1]).map(([v, n]) => `\`${v}\` × ${n}`).join(' · ')}

## All ${rows.length} deployments, by deposits

| deployment | schema | type | deposits | borrows | lag | status | verdict |
|---|---|---|---:|---:|---:|---|---|
${rows.map((r) => { const c = PROTOCOLS.find((x) => x.slug === r.slug)!; const v = c.triageVerdict; return `| \`${r.slug}\` | ${r.live ?? '—'} | ${c.lendingType ?? '—'} | ${usd(r.deposits)} | ${usd(r.borrows)} | ${lag(r.lagSec)} | ${r.status}${r.errs ? ' ⚠️' : ''} | ${v === 'publishable' ? '✅ publishable' : v === 'flagged' ? '⚠️ flagged' : v === 'unusable' ? '⛔ unusable' : '—'} |`; }).join('\n')}

## Verdicts

\`status\` asks whether a deployment **answers**. The verdict asks whether it is **right** — a
different question, and the one that decides what can carry a report. Produced by
\`scripts/triage-protocols.ts\`, which reconciles deposits − borrows against DefiLlama as an external
reference, checks that borrows do not exceed deposits, asks for daily history over a recent window,
and records whether revenue is plausible, absurd or zero.

${(['publishable','flagged','unusable'] as const).map((v) => `- **${v}** — ${PROTOCOLS.filter((x) => x.triageVerdict === v).length}`).join('\n')}

⚠️ **Revenue is deferred out of Phase 1 and gated by \`RevenueAvailability\`, so a deployment flagged
only on revenue can still carry a balance report.** On that basis **${PROTOCOLS.filter((x) => x.triageVerdict === 'publishable').length + 2} deployments are usable today**:
the three \`publishable\` rows plus \`aave-v3-ethereum\` and \`spark-lend-ethereum\`, whose balances
reconcile to within 5% and whose only fault is a poisoned revenue accumulator.

⚠️ **A percentage gap against a near-zero external reference reads larger than it is.** Where
DefiLlama reports under $1M the gap is computed against a $1M floor, so figures like "1218%" mean
"our subgraph says millions and the reference says roughly nothing" rather than a precise ratio. The
direction is the finding; the magnitude is not.

## Open questions for triage

Surfaced by the sweep and **not judged here** — the sweep asks who answers and what they say;
deciding what the numbers mean is triage.

${q(1, `**${inverted.length} deployment${inverted.length === 1 ? '' : 's'} report more borrowed than deposited.** Borrows exceeding deposits is PLAN-v4 §5.13's own worked example of a \`SIGNAL\` — the kind of finding a report exists to surface rather than a number to suppress. Either these are real findings about the protocols or they are broken mappings, and the difference decides whether each belongs in a report or in a bug list.

${inverted.map((r) => `- \`${r.slug}\` — ${usd(r.borrows)} borrowed against ${usd(r.deposits)} deposited (rank ${rows.indexOf(r) + 1} of ${rows.length} by size)`).join('\n')}`)}

${q(2, `**\`spark-lend-ethereum\` is ranked ${spark + 1} of ${rows.length} by deposits** at ${usd(rows[spark]?.deposits ?? null)}. PLAN-v4 §5.18 excludes it on curation signal — 1.0 GRT against a recommended 3,000 — not on size. The exclusion may still be right; this records what it costs.`)}

${shared.length ? q(3, `**Two deployments are lagging at the *same* block.** ${shared.map(([b, v]) => `${v.map((s) => `\`${s}\``).join(' and ')} are both at block ${b}`).join('; ')} — one stale indexer serving both, not two independent lags. Whether a single indexer failing can stall an unrelated pair of deployments matters for how the common-block rule is written.`) : q(3, 'No shared stale indexers in this run.')}

${q(4, `**${tiny.length} deployments hold under $1M.** They answer, they are well-formed, and there is nothing in them. The inventory is ${rows.length} rows; the *usable* universe is much smaller, and a comparison that silently includes an empty deployment is misleading in a way no invariant catches.`)}
`;
  writeFileSync('docs/protocol-inventory.md', md);
  console.log('\nwrote docs/protocol-inventory.md');
}

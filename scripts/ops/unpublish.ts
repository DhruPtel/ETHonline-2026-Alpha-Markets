// Take reports off the marketplace, by hash. ⚠️ **Operator-only, and it exists for our own test data.**
//
//   npx tsx --env-file=.env scripts/ops/unpublish.ts                          ← lists what is published, free
//   npx tsx --env-file=.env scripts/ops/unpublish.ts <hash> [<hash> …]        ← the plan for those, writes nothing
//   npx tsx --env-file=.env scripts/ops/unpublish.ts <hash> [<hash> …] --apply
//
// ⚠️ **Read `unpublish()` in `src/store/reports.ts` first.** Publishing was built one-way and the reason
// is kept there: a purchase settled against a listed report cannot be un-made by hiding the row. That
// reason is about buyers, so this script **refuses any report with a purchase from anyone but our own
// buyer account** (`HEDERA_BUYER_ID`) — on that report the argument applies in full.
//
// ⚠️ **A script, not a console control.** Unlisting is cleanup, not something an author does beside
// Publish; a button next to it would turn the one-way rule into a formality. A script takes a batch in
// one command, prints what each report carries before writing, and does nothing without `--apply`.
//
// ⚠️ **Explicit hashes, never "everything published".** Replacement reports are being published while
// this runs, and a sweep would take them with the old ones. The bare run prints the list to copy from.
//
// ⚠️ **Hidden, not deleted.** The row, its page, its x402 gate, its ATS token and every claim it backs
// stay: a tokenized report's hash is in a Hedera creation event and a staked one backs a claim on Arc.

import { close, unpublish } from '../../src/store/reports.js';
import { db } from '../../src/store/db.js';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const hashes = argv.filter((a) => !a.startsWith('--')).map((h) => h.replace(/\s+/g, '').replace(/^0x/i, '').toLowerCase());
const buyer = process.env.HEDERA_BUYER_ID?.trim() || null;
if (!buyer) {
  console.error('\n❌ STOP  HEDERA_BUYER_ID is not set, so our own purchases cannot be told from a buyer\'s.\n');
  process.exit(1);
}

interface Row {
  hash: string; title: string | null; directive: string; published_at: Date | null; tokenized: boolean; claims: string;
}

const rowsWhere = async (hash: string | null): Promise<Row[]> => db()<Row[]>`
  SELECT r.hash, r.title, r.directive, r.published_at,
         EXISTS (SELECT 1 FROM report_tokens t WHERE t.report_hash = r.hash) AS tokenized,
         (SELECT count(*) FROM claims c WHERE c.report_hash = r.hash)::text AS claims
    FROM reports r
   WHERE ${hash === null ? db()`r.published_at IS NOT NULL` : db()`r.hash = ${hash}`}
   ORDER BY r.published_at`;

/** Prints what a report carries. Returns the payers that are not our buyer. */
async function describe(r: Row): Promise<string[]> {
  const payers = await db()<{ payer: string; n: string; settled: string }[]>`
    SELECT payer, count(*)::text AS n, count(settled_at)::text AS settled
      FROM purchases WHERE report_hash = ${r.hash} GROUP BY payer ORDER BY payer`;
  console.log(`  ${r.hash}  ${r.published_at ? `listed ${r.published_at.toISOString().slice(0, 16)}Z` : 'not listed'} · ${r.tokenized ? 'tokenized' : 'untokenized'} · ${r.claims} claim(s)`);
  console.log(`    ${(r.title ?? r.directive).slice(0, 96)}`);
  console.log(`    purchases: ${payers.length === 0 ? 'none' : payers.map((p) => `${p.payer === buyer ? 'our buyer' : `⚠️ ${p.payer}`} ×${p.n} (${p.settled} settled)`).join(', ')}`);
  return payers.filter((p) => p.payer !== buyer).map((p) => p.payer);
}

if (hashes.length === 0) {
  const rows = await rowsWhere(null);
  console.log(`\n══ ${rows.length} published report(s). Nothing is written without hashes and --apply.\n`);
  for (const r of rows) await describe(r);
  if (rows.length) console.log(`\n  hashes: ${rows.map((r) => r.hash).join(' ')}\n`);
} else {
  console.log(`\n══ unpublish ${hashes.length} report(s)${APPLY ? ' — ⚠️ WRITING' : ' — plan only'}\n`);
  let unlisted = 0;
  let refused = 0;
  for (const hash of hashes) {
    if (!/^[0-9a-f]{64}$/.test(hash)) {
      console.log(`  ❌ "${hash.slice(0, 24)}" is not a report hash (64 hex characters).`);
      refused += 1;
      continue;
    }
    const [r] = await rowsWhere(hash);
    if (!r) { console.log(`  ❌ ${hash.slice(0, 16)}… — no such report.`); refused += 1; continue; }
    const foreign = await describe(r);
    if (foreign.length > 0) {
      console.log('    ❌ REFUSED — bought by an account other than our buyer. The one-way argument applies; see unpublish().');
      refused += 1;
      continue;
    }
    if (!r.published_at) { console.log('    already not listed — nothing to do.'); continue; }
    if (!APPLY) { console.log('    plan only — add --apply to unlist.'); continue; }
    const result = await unpublish(hash);
    console.log(`    ${result?.changed ? '✅ unlisted' : 'no change — it was unlisted in the meantime'}`);
    if (result?.changed) unlisted += 1;
  }
  console.log(`\n  ${APPLY ? `${unlisted} unlisted` : 'plan only, nothing written'} · ${refused} refused\n`);
}

await close();

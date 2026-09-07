// Unit 6's proof — the three statuses, translated.
import { corroborate } from '../src/graph/corroborate.js';
import { crosscheck } from '../src/engine/crosscheck.js';
import { PROTOCOLS } from '../src/config/protocols.js';
const ICON = { DATA_ERROR: '⛔', INCONSISTENCY: '⚠️ ', SIGNAL: '📣', INFORMATIONAL: '· ' } as const;
for (const slug of ['aave-v3-ethereum', 'morpho-blue', 'compound-v3-ethereum', 'compound-v2-ethereum']) {
  const cfg = PROTOCOLS.find((p) => p.slug === slug)!;
  console.log(`\n${slug}  —  hint: ${cfg.corroborationHint?.method ?? 'none'}`);
  for (const f of crosscheck(slug, await corroborate(slug, 3)))
    console.log(`  ${ICON[f.severity]} ${f.severity.padEnd(14)}${f.rationale}`);
}
console.log();

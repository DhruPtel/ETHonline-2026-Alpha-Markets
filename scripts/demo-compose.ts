// Unit 8's proof. Four directives — three that should plan, one that should refuse.
//
// The fourth is the point: "is X a good investment" is not answerable here, and the planner has to
// say so structurally rather than write a confident essay around the gap.
import Anthropic from '@anthropic-ai/sdk';
import { compose } from '../src/agent/compose.js';

const DIRECTIVES = [
  ['narrow, one deployment', "What are Aave v3's total deposits on Ethereum right now?"],
  ['a specific finding, not an overview', "Does Morpho Blue's borrowing exceed what it holds? I want a report on that specifically."],
  ['a comparison', 'Compare deposits across aave-v2, compound-v2 and spark-lend.'],
  ['not answerable here', 'Is Aave a good investment?'],
] as const;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

for (const [label, directive] of DIRECTIVES) {
  console.log(`\n${'═'.repeat(80)}\n${label}\n  "${directive}"\n`);
  const r = await compose(directive, client);
  if (!r.ok) {
    console.log(`  ⛔ needs_clarification`);
    console.log(`     missing:  ${r.clarification.missing.join(', ')}`);
    console.log(`     reason:   ${r.clarification.reason}`);
    for (const s of r.clarification.suggestions) console.log(`     try:      "${s}"`);
    continue;
  }
  const p = r.plan;
  console.log(`  ✅ plan`);
  console.log(`     form        ${p.form}`);
  console.log(`     subject     ${p.subject.directive}`);
  console.log(`     headline    ${p.subject.headline}   ← an error here blocks the whole report`);
  console.log(`     deployments ${p.subject.deployments.join(', ')}`);
  for (const rd of p.reads) console.log(`     read        ${rd.documentId} on ${rd.slugs.join(', ')}${Object.keys(rd.variables).length ? ` ${JSON.stringify(rd.variables)}` : ''}`);
  console.log(`     checks      ${p.checks.join(', ')}`);
  console.log(`     rationale   ${p.rationale}`);
}
console.log();
await new Promise<void>((r) => process.stdout.write('', () => r()));

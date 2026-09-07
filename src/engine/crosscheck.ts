// Corroboration observations, folded into the engine's finding structure.
//
// ⚠️ **Verification is not what this build is for.** We connect to The Graph, read it, and report
// what it says — accurately reflecting the source, not proving the source correct. So this file
// translates; it does not extend. `graph/corroborate.ts` does the reading (§5.14: the engine is
// pure, corroboration is an adapter that hands it observations).
//
// ⚠️ **A mismatch is a `SIGNAL`, not a `DATA_ERROR`.** It does not block the figure, because
// blocking would mean asserting the contract is the correct side — and §5.14 settled that
// attribution is per-deployment and sometimes open. Morpho's subgraph reading higher than its own
// contract may be a mapping bug or a documented derivation; the check cannot tell, so it reports
// that two sources disagree and by how much. That is also exactly the kind of finding a report
// exists to surface.
//
// ⚠️ **Does not restate `reconcile.ts`.** That file reads the same observations to decide a verdict
// tier; this one produces the per-deployment findings a report shows. Different outputs, one input,
// no shared conclusion.

import type { Finding } from '../types/report.js';
import type { Corroboration } from '../graph/corroborate.js';
import { PROTOCOLS } from '../config/protocols.js';
import { figureRef } from './invariants.js';

export function crosscheck(slug: string, observations: readonly Corroboration[]): Finding[] {
  const at = figureRef(slug, 'markets');
  const by = (s: Corroboration['status']) => observations.filter((o) => o.status === s);
  const [matched, mismatched, unchecked] = [by('match'), by('mismatch'), by('not_checked')];
  const out: Finding[] = [];

  if (matched.length) out.push({
    severity: 'INFORMATIONAL', appliesTo: at,
    rationale: `${matched.length} of ${observations.length} sampled market(s) match the contract exactly, read at the block the subgraph wrote each value`,
  });

  for (const m of mismatched) out.push({
    severity: 'SIGNAL', appliesTo: at,
    rationale: `${m.marketName ?? m.marketId}: the subgraph reads ${m.subgraphValue} against ${m.chainValue} on chain at block ${m.writeTimeBlock} — a difference of ${m.delta}. Which side is wrong is not established`,
  });

  if (unchecked.length) {
    // ⚠️ Absence is not evidence of a problem, and a report should not let it read as one.
    const capable = PROTOCOLS.filter((p) => p.status === 'live' && p.corroborationHint?.method).length;
    const live = PROTOCOLS.filter((p) => p.status === 'live').length;
    out.push({
      severity: 'INFORMATIONAL', appliesTo: at,
      rationale: `${unchecked.length} of ${observations.length} sampled market(s) could not be checked against the chain — ${unchecked[0]!.note ?? 'no write-time field'}. This check is available on ${capable} of ${live} live deployments; its absence here says nothing about the figures`,
    });
  }
  return out;
}

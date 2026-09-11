// One report, named on two ledgers. ⚠️ **The product's central claim, made checkable.**
//
// ⚠️ **THE VISUALS ARE DISPOSABLE AND NOTHING HERE REACHES FOR THEM.** `globals.css` is untouched
// and every `className` below already exists. What this settles is what gets read and how the two
// halves are joined.
//
// ── ⚠️ NOTHING CROSSES BETWEEN THE CHAINS, AND THIS COMPONENT SAYS SO OUT LOUD ───────────────────
//
// **There is no bridge, no oracle, no cross-chain read, and none is being built.** What exists is
// **one identifier appearing in two places**: a 32-byte report hash that Hedera's ATS creation event
// commits as `alpha:<hash>` and that Arc's `commitPrediction` takes as its `reportHash` parameter.
//
// ⚠️ **This is stated in the rendered copy and not only here**, because a reader who infers an
// integration and then discovers there is none will discount everything else on the page — and they
// would be right to. `docs/research/cross-chain-binding.md` is where the investigation landed:
// Hedera testnet has a LayerZero endpoint and **Arc is not on LayerZero's deployed list at all**, so
// there is no messaging layer to have used. The tie is weaker than a bridge and it is *checkable*,
// which a bridge would not make it.
//
// ⚠️ **The panel never claims to have READ the Hedera creation event at render time.** It has not —
// that is a Mirror Node call, and putting one on every report page would be a network round trip to
// tell a reader something the HashScan link lets them confirm themselves. `src/arc/admission.ts`
// does read it, before any money moves, and that is the check that matters. What this shows is where
// to look.
//
// ── ⚠️ THE HASH IS THE POINT, SO IT IS NEVER ABBREVIATED ─────────────────────────────────────────
//
// All three appearances print the **same full 64 hex characters** in the same monospace. Two
// truncations that merely look alike would demonstrate nothing — the reader's own eye comparing two
// complete strings is the entire mechanism, and `domain/canonical.ts` puts it exactly right:
// *"Anyone can check that both refer to the same bytes."* The `alpha:` and `0x` prefixes differ
// because each chain stores the bytes in its own form; the hex between them is identical and is
// labelled as such.
//
// ── ⚠️ COMPOSITION, NOT NEW READING ──────────────────────────────────────────────────────────────
//
// The Hedera half is `store/tokens.ts::tokenFor`, already used by the page this replaces. The Arc
// half is the `claims`-to-`markets` join Unit 13 established, written inline the way Unit 13 and
// Unit 14 write theirs — `store/` is not modified and no join was added to it.
//
// ⚠️ **A report can back MORE THAN ONE market and that is real, not hypothetical**: report
// `24041ca2…` backs chain markets 6 and 7 today. The Arc half is a list for that reason.
//
// ⚠️ **`standing()` is duplicated from `app/markets/page.tsx` rather than imported.** It is a page
// module and this unit may touch only this component and its host; Unit 9 made the same trade with
// `landed()` for the same reason. Six lines is the cheaper cost.

import { db } from '../../../src/store/db.js';
import { tokenFor } from '../../../src/store/tokens.js';

interface Spec {
  slug: string; metric: string; comparison: 'above' | 'below'; threshold: string; observedDay: string;
}

interface ClaimRow {
  chain_claim_id: string;
  side: boolean;
  amount: string;
  commit_tx: string | null;
  chain_market_id: string | null;
  contract_address: string | null;
  spec_json: string;
  close_time: Date;
  observation_end: Date;
  resolved_at: Date | null;
  voided_at: Date | null;
  outcome: boolean | null;
  after_the_fact: boolean;
}

const usdc = (wei: string): string => {
  const v = BigInt(wei);
  const whole = v / 10n ** 18n;
  const frac = (v % 10n ** 18n).toString().padStart(18, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : `${whole}`;
};
const when = (d: Date) => `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
const grouped = (decimal: string) => Number(decimal).toLocaleString('en-US');

/** ⚠️ A void is an absence of an outcome, never a wrong answer. Unit 15 scores it null for this. */
function standing(c: ClaimRow): string {
  if (c.voided_at) return 'Voided — no outcome, every stake refundable';
  if (c.resolved_at) return `Resolved ${c.outcome ? 'TRUE' : 'FALSE'}`;
  if (Date.now() < c.close_time.getTime()) return 'Open for staking';
  if (Date.now() < c.observation_end.getTime()) return 'Staking closed — observing';
  return 'Awaiting settlement';
}

export async function Ledgers({ hash }: { hash: string }) {
  // ⚠️ Two reads, both public facts. **Neither touches the report body** — `sections`, `assessment`
  // and `facts` are not in either table, so nothing here can leak past the paywall.
  const token = await tokenFor(hash);
  const claims = await db()<ClaimRow[]>`
    SELECT c.chain_claim_id, c.side, c.amount, c.commit_tx,
           m.chain_market_id, m.contract_address, m.spec_json, m.close_time,
           m.observation_end, m.resolved_at, m.voided_at, m.outcome,
           (m.observation_end <= m.created_at) AS after_the_fact
    FROM claims c JOIN markets m ON m.id = c.market_id
    WHERE c.report_hash = ${hash} AND c.chain_claim_id IS NOT NULL
    ORDER BY m.created_at`;

  // ⚠️ **Neither half is a reason to render an empty panel.** Most reports are published and nothing
  // more, and a heading over two "not yet" lines is worse than no heading.
  if (!token && claims.length === 0) return null;

  return (
    <section>
      <h2>This report on two ledgers</h2>

      {/* ⚠️ The disclaimer comes FIRST, before anything that could be mistaken for an integration. */}
      <p>
        The same 32 bytes appear on two chains. <strong>Nothing crosses between them</strong> — there
        is no bridge, no oracle and no cross-chain message, and none is being built. Hedera&rsquo;s
        token commits this report&rsquo;s hash in its creation event; Arc&rsquo;s market takes the
        same hash as a parameter. <strong>One identifier, written down in two places, and you can
        check both without trusting us.</strong>
      </p>

      <dl className="identity">
        <div><dt>The 32 bytes</dt><dd className="mono break">{hash}</dd></div>
      </dl>

      <h3>On Hedera — the security</h3>
      {token ? (
        <>
          <p>
            An ATS security token. Its creation event carries the string below, so the token names
            this report and no other.
          </p>
          <dl className="identity">
            <div><dt>ISIN</dt><dd className="mono">{token.isin}</dd></div>
            <div><dt>Proxy</dt><dd className="mono break">{token.proxyAddress}</dd></div>
            <div><dt>Issued</dt><dd className="mono">{when(token.issuedAt)}</dd></div>
            {/* ⚠️ The full hash again, in the form the creation event stores it. Same 64 characters
                as above — that is the thing to compare, and it is why neither is shortened. */}
            <div><dt>In the creation event</dt><dd className="mono break">alpha:{hash}</dd></div>
          </dl>
          <p>
            <a href={`https://hashscan.io/testnet/contract/${token.proxyAddress}`} target="_blank" rel="noreferrer">
              View the token on HashScan →
            </a>
            {/* ⚠️ A link rather than a balance read — `/holdings` does that once, in a route, so
                `ethers` and an RPC client stay off every report page. */}
            {' · '}<a href="/holdings">Who holds it →</a>
          </p>
        </>
      ) : (
        <p>
          Not tokenized. The report is published and hashed; no ATS asset has been minted against it.
        </p>
      )}

      <h3>On Arc — the prediction</h3>
      {claims.length === 0 ? (
        <p>
          No market cites this report. The analyst has published it and has not staked its own money
          on a claim backed by it.
        </p>
      ) : (
        <>
          <p>
            The analyst committed its own USDC to {claims.length === 1 ? 'a claim' : `${claims.length} claims`} backed
            by this report. <strong>The hash below is the <span className="mono">reportHash</span>{' '}
            parameter the contract was called with</strong> — the same 64 characters as above.
          </p>
          {claims.map((c) => {
            const spec = JSON.parse(c.spec_json) as Spec;
            return (
              <div key={c.chain_claim_id}>
                <p>
                  {c.chain_market_id
                    ? <a href={`/markets/${c.chain_market_id}`}>
                        Market #{c.chain_market_id}: will {spec.slug}&rsquo;s {spec.metric} be{' '}
                        {spec.comparison} ${grouped(spec.threshold)} on {spec.observedDay}?
                      </a>
                    : <span>A market that never landed on chain.</span>}
                </p>
                <dl className="identity">
                  <div><dt>Side</dt><dd>{c.side ? 'TRUE' : 'FALSE'}</dd></div>
                  <div><dt>Analyst&rsquo;s stake</dt><dd className="mono">{usdc(c.amount)} USDC</dd></div>
                  <div><dt>Standing</dt><dd>{standing(c)}</dd></div>
                  <div><dt>Claim</dt><dd className="mono">#{c.chain_claim_id}</dd></div>
                  <div><dt>reportHash parameter</dt><dd className="mono break">0x{hash}</dd></div>
                </dl>
                {/* ⚠️ A rehearsal must never read as a forecast — PHASE-4, and nothing on chain
                    enforces it but us. Unreachable here today, since a rehearsal has no claim. */}
                {c.after_the_fact && (
                  <p className="no-durable">
                    ⚠️ <strong>A rehearsal, not a forecast.</strong> The observed day had already
                    finished when this market was created.
                  </p>
                )}
                <p>
                  {c.commit_tx && (
                    <a href={`https://testnet.arcscan.app/tx/${c.commit_tx}`} target="_blank" rel="noreferrer">
                      The commit transaction on arcscan →
                    </a>
                  )}
                  {c.commit_tx && c.contract_address && ' · '}
                  {c.contract_address && (
                    <a href={`https://testnet.arcscan.app/address/${c.contract_address}`} target="_blank" rel="noreferrer">
                      The market contract →
                    </a>
                  )}
                </p>
              </div>
            );
          })}
        </>
      )}

      <p className="meta">
        ⚠️ Both halves are read from our database, which records what we saw. The two links above are
        not: they go to public explorers, and the hash on this page is what you compare against what
        they show. Nothing here asks you to take our word for the tie.
      </p>
    </section>
  );
}

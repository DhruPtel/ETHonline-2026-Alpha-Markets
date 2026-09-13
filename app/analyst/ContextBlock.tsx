// The text the agent reads before it plans its next report — shown as the bytes, not as a rendering.
//
// ── ⚠️ WHY THE LITERAL BLOCK, AND NOT A PRETTIER VERSION OF THE SAME ROWS ────────────────────────
//
// **The point of showing this is that it is the same bytes the model was given.** `context.build()`
// returns `{block, digest}` where the digest is `sha256` over exactly those bytes, and
// `reports.context_digest` stores it. So a reader can take the block on this page, hash it, and find
// the reports that were planned with it. **That check is the only thing here that is checkable
// rather than asserted**, and it survives exactly as long as the bytes are untouched.
//
// ⚠️ **A prettier rendering of the underlying `scores` rows would destroy it twice over:** it would
// be a second path to one number — the thing `score.ts` and `context.ts` both refuse — and the
// digest would no longer be over anything on screen. So this component reformats nothing. It does
// not wrap, re-indent, re-order, prettify or truncate. `white-space: pre` and a horizontal scroll,
// because where the lines actually break is part of what the model saw.
//
// ⚠️ **Soft-wrapping was considered and rejected for the same reason.** `pre-wrap` would read more
// comfortably and would not change a byte — but it hides where the real newlines are, and on a page
// whose entire claim is *these are the bytes*, a reader cannot tell a soft wrap from a hard one. The
// scroll bar is the honest cost.
//
// ── ⚠️ WHERE THIS LIVES, AND WHY NOT THE CONSOLE ────────────────────────────────────────────────
//
// **`/analyst`, beside the record it is built from.** This block *is* the record turned into a
// prompt, so the grades and the text they produce belong on one page — a reader can look up from the
// block to the two rows it describes.
//
// **Rejected: the console, beside the generation stream.** Three reasons, and the first is fatal on
// its own: the block is built server-side inside `/api/console/generate` and **the NDJSON stream
// does not carry it**, so putting it there would mean changing a route to emit it. The console also
// already has a Query Evidence block in the Atlas panel that a second evidence block would compete
// with. And the console is where a report gets *written*; this is about what was known *before* it
// was.
//
// ── ⚠️ THIS IS NOT MODEL TRAINING, AND THE PAGE SAYS SO WHERE A READER WILL SEE IT ──────────────
//
// No weights, no fine-tuning, no gradient, no dataset. It is a few hundred characters placed in a
// prompt and discarded when the request ends; the next request rebuilds it from the database.
// ⚠️ The note is rendered **above the block**, not in a footnote, because "the agent learns from its
// record" is exactly the sentence a reader completes for themselves if nobody stops them.
//
// ── ⚠️ A STORED DIGEST CAN HAVE NO REPRODUCIBLE BLOCK BEHIND IT, AND TWO ALREADY DO ─────────────
//
// `context_digest` records what the planner saw **at the time**. The block changes as scores
// accumulate, so an older report's digest legitimately will not match today's block — that is the
// column working, not a fault. But there is a second case and it is not benign:
//
// ⚠️ **Reports `0fb5b9a8df13…` and `48057f007392…` carry `f28a93d4c583…`, which cannot be rebuilt
// from the `scores` table as it stands.** It was written by `scripts/demo/context.ts`, whose own
// fixtures were deleted in its cleanup; that script blanks the column for one report and evidently
// ran twice. **There is no block behind that digest and this component does not pretend there is.**
// It lists such reports as carrying a digest whose block cannot be reproduced, which is the true
// statement, rather than implying the bytes are recoverable.

import {build} from '../../src/agent/context.js';
import {analystRecord} from '../components/GradeMarker.js';
import {db} from '../../src/store/db.js';

interface CarrierRow {
  hash: string;
  title: string | null;
  directive: string;
  context_digest: string;
  created_at: Date;
}

/** Cut a directive to a line-sized heading at a word boundary. Mirrors `app/page.tsx`. */
function shorten(text: string, max: number): string {
  const t = text.trim().replace(/[?.]+$/, '');
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}

export async function ContextBlock({analyst}: {analyst: string}): Promise<React.JSX.Element> {
  // ⚠️ The same call the generators make, with the same argument. Not a reimplementation of it —
  // a second way of building this text is a second answer, and the digest would arbitrate between
  // two things that were supposed to be one.
  const context = await build(analyst);

  // ⚠️ **The test-data marker CANNOT go inside the block, and that is not an oversight.** The block
  // is bytes produced by `agent/context.ts` and the digest is taken over exactly those bytes — adding
  // a word to them would change the digest and break the one checkable thing this section has. So it
  // is said BESIDE the block instead. `agent/context.ts` is also `src/`, which this task may not
  // touch. **The lines themselves carry no marker; the count below is how a reader knows.**
  const record = await analystRecord();

  const carried = await db()<CarrierRow[]>`
    SELECT hash, title, directive, context_digest, created_at
      FROM reports WHERE context_digest IS NOT NULL
     ORDER BY created_at DESC`;

  // ⚠️ Split by whether the stored digest is the one the block above hashes to. A report planned
  // when the record was in a different state is a NON-match and that is correct.
  const planned = carried.filter((r) => context !== null && r.context_digest === context.digest);
  const others = carried.filter((r) => context === null || r.context_digest !== context.digest);

  return (
    <div className="holdings-panel panel">
      <div className="section-title">
        <div>
          <span className="eyebrow">WHAT THE AGENT READS BEFORE IT WRITES</span>
          <h2>Planning context</h2>
        </div>
        <span className="badge">
          {context === null ? 'no block' : `${context.count} claim${context.count === 1 ? '' : 's'}`}
        </span>
      </div>

      {/* ⚠️ ABOVE THE BLOCK, NOT IN A FOOTNOTE. See the header — a reader who is not told this
          completes the sentence themselves, and completes it wrong. */}
      <p className="market-statline" style={{display: 'block', lineHeight: 1.6, paddingTop: 0}}>
        ⚠️ <strong>This is not model training.</strong> No weights, no fine-tuning, no gradient, no
        dataset. It is a few hundred characters of text placed in the planning prompt, rebuilt from
        the database on every request and gone the moment that request ends. The model is not changed
        by it and does not remember it.
      </p>

      {context === null ? (
        /* ⚠️ **THE STATE THIS SHIPS IN.** `build()` returns null — not an empty block — because an
           empty section with a heading is a thing the model reads and reasons about, and "you have
           no track record" is a statement about the analyst nobody decided to make. */
        <div className="empty-state">
          <h2>Nothing is added to the planning prompt</h2>
          <p>
            The analyst has no graded claims, so <code>build()</code> returns nothing and the system
            prompt is byte-for-byte what it would be if this feature did not exist. It is not an
            empty section in the prompt — there is no section. The first graded claim creates one.
          </p>
        </div>
      ) : (
        <>
          {/* ⚠️ THE BYTES. `white-space: pre`, horizontal scroll, nothing reformatted. The sole
              child is the string itself so no JSX whitespace can reach the rendered text. */}
          <div className="table-scroll">
            <pre
              style={{
                font: '12px/1.7 var(--font-mono)',
                whiteSpace: 'pre',
                margin: 0,
                padding: '18px 20px',
                background: 'var(--ice)',
                border: '1px solid #e1e7ed',
                borderRadius: '6px',
                color: '#2b333a',
              }}
            >{context.block}</pre>
          </div>

          {record.testData > 0 && (
            <p className="market-statline" style={{display: 'block', lineHeight: 1.6, paddingBottom: 0}}>
              ⚠️ <strong>{record.testData} of the analyst&rsquo;s {record.right + record.wrong + record.voided} graded
              claims are test data</strong> — settled in the store with no chain market and no
              settlement transaction behind them, to demonstrate this surface before the first real
              grades land. They are in the block above because they are in the record, and the block
              is the record. ⚠️ <strong>The marker cannot be put inside the lines themselves</strong>:
              the digest is over exactly those bytes, so a word added for a reader would change what
              the agent is provably given.
            </p>
          )}

          {/* ⚠️ **THE REFUSAL, STATED WHERE IT IS DOING THE WORK.** PHASE-8 §2.3: showing the
              product decline to learn from a question whose answer was already public is a better
              demonstration than pretending it did. This renders only once a demo has been graded,
              so it is never an abstract promise — the number beside it is the claim it excluded. */}
          {record.pastPosted > 0 && (
            <p className="market-statline" style={{display: 'block', lineHeight: 1.6, paddingBottom: 0}}>
              ⚠️ <strong>{record.pastPosted} graded demo claim{record.pastPosted === 1 ? ' is' : 's are'} deliberately
              NOT in this block.</strong> Those markets took stakes after the day they measure had
              already ended, so the answer was public before anyone committed. The agent learns from
              forecasts, not from questions that were already answered — a line saying it had been
              right about one would read identically to a genuine hit, and the model could not tell
              them apart. They are excluded here and counted separately in the record above.
            </p>
          )}

          <p className="market-statline" style={{display: 'block', lineHeight: 1.6}}>
            <strong>sha256 of exactly those bytes</strong>
            <br />
            <code style={{overflowWrap: 'anywhere'}}>{context.digest}</code>
            <br />
            ⚠️ This is the value written to <code>reports.context_digest</code> beside a report
            planned while the record was in this state — <strong>beside the row, never inside the
            report hash</strong>, because four report hashes are already committed in ATS creation
            events on Hedera and cannot be amended.
          </p>
        </>
      )}

      {/* ── Which reports were planned with the block above ─────────────────────────────────── */}
      {planned.length > 0 && (
        <>
          <div className="section-title" style={{marginTop: '26px'}}>
            <h2 style={{fontSize: '19px'}}>Planned with this exact text</h2>
          </div>
          <div className="table-scroll">
            <table className="financial-table">
              <thead>
                <tr><th>Report</th><th>Generated</th><th>Digest</th></tr>
              </thead>
              <tbody>
                {planned.map((r) => (
                  <tr key={r.hash}>
                    <td>
                      <a href={`/report/${r.hash}`}>
                        <strong>{r.title ?? shorten(r.directive, 46)}</strong>
                        <span className="holdings-sub">{r.hash.slice(0, 16)}…</span>
                      </a>
                    </td>
                    <td>{r.created_at.toISOString().slice(0, 10)}</td>
                    <td><code>{r.context_digest.slice(0, 16)}…</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ⚠️ **STATED, NOT HIDDEN.** Two reports carry a digest with no reproducible block. Saying
          so is the difference between a checkable claim and a decorative one. */}
      {others.length > 0 && (
        <>
          <div className="section-title" style={{marginTop: '26px'}}>
            <h2 style={{fontSize: '19px'}}>Planned with a different record</h2>
          </div>
          <p className="market-statline" style={{display: 'block', lineHeight: 1.6}}>
            {context === null ? (
              /* ⚠️ There is no block on the page to compare against, so the copy must not claim
                 one. With `scores` empty these digests have nothing to be measured against at all. */
              <>
                These carry a <code>context_digest</code> from a record that no longer exists.{' '}
                ⚠️ <strong>There is no block behind them and it cannot be reproduced.</strong>{' '}
                <code>f28a93d4c583…</code> was written by a demo script whose fixture rows were
                deleted in its own cleanup, so the <code>scores</code> table it was built from is
                empty and hashing it again is impossible. A digest is only as good as the bytes
                still existing, and these bytes do not.
              </>
            ) : (
              <>
                These carry a <code>context_digest</code> that is <strong>not</strong> the digest of
                the block above. ⚠️ <strong>That is expected as the record grows</strong> — the block
                changes every time a claim is graded, so a report planned earlier hashes to something
                else, and the column is doing its job by recording which text that was.{' '}
                <strong>An older digest is not a broken one.</strong> ⚠️ Separately, and not the same
                thing: <code>f28a93d4c583…</code> on two reports came from a demo script whose
                fixtures were removed, so that one has no reproducible block behind it at all.
              </>
            )}
          </p>
          <div className="table-scroll">
            <table className="financial-table">
              <thead>
                <tr><th>Report</th><th>Generated</th><th>Digest</th><th>Block</th></tr>
              </thead>
              <tbody>
                {others.map((r) => (
                  <tr key={r.hash}>
                    <td>
                      <a href={`/report/${r.hash}`}>
                        <strong>{r.title ?? shorten(r.directive, 46)}</strong>
                        <span className="holdings-sub">{r.hash.slice(0, 16)}…</span>
                      </a>
                    </td>
                    <td>{r.created_at.toISOString().slice(0, 10)}</td>
                    <td><code>{r.context_digest.slice(0, 16)}…</code></td>
                    <td>not reproducible</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {carried.length === 0 && (
        <p className="market-statline" style={{display: 'block', lineHeight: 1.6}}>
          No stored report carries a <code>context_digest</code> — none has been planned with a
          record yet.
        </p>
      )}
    </div>
  );
}

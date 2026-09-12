'use client';

import {useState} from 'react';
import {useRouter} from 'next/navigation.js';
import {ArrowUpRight, ChevronDown, FileText, Upload} from './Icons.js';

/**
 * The tokenize form: the source tabs, the listing fields and the access price.
 * Client-only — tabs and text inputs.
 *
 * onTokenize is the stub the Hedera call replaces.
 */
/** What the console page knows about the report on screen — the thing this form tokenizes. */
export type TokenTarget = {
  hash: string;
  heading: string;
  factCount: number;
  /** The constant every report is sold at. ⚠️ HBAR, not USDC — see the notes in the form. */
  priceHbar: string;
  /** Present when this report already has a token. Minting again is refused by the route. */
  token: {proxyAddress: string; isin: string; issuedAt: string} | null;
};

type Minted = {
  proxyAddress: string;
  isin: string;
  emittedInfo: string;
  deployTx: string;
  grantRoleTx: string;
  issueTx: string;
  checks: {ok: boolean; label: string; detail: string}[];
};

type Plan = {
  reportHash: string;
  isin: string;
  estimateHbar: string;
  balanceHbar: string;
  floorHbar: string;
  recipient: string;
};

export type Listing = {
  title: string;
  category: string;
  description: string;
  price: number;
  currency: string;
  fileName: string;
  filePages: number;
  marketClaim: string;
  tokenIdState: string;
  transactionState: string;
  publishState: string;
};

export function TokenizeForm({listing, target}: {listing: Listing; target: TokenTarget | null}) {
  const router = useRouter();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [minted, setMinted] = useState<Minted | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ⚠️ **The hash comes from the report on screen, not from a field.** It is 64 characters and the
  // document sits directly above this panel; asking someone to find and paste it would be the
  // console making work it already has the answer to. `target` is the same report the document
  // panel renders, handed down by the page.
  async function post(confirm: boolean) {
    if (!target || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/console/tokenize', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({reportHash: target.hash, confirm}),
      });
      const raw = await res.text();
      let j: Record<string, unknown>;
      try {
        j = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        throw new Error(`HTTP ${res.status} with a body that is not JSON`);
      }
      if (j.stop || j.fail || j.error) throw new Error(String(j.stop ?? j.fail ?? j.error));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      if (j.mode === 'dry') {
        setPlan(j.plan as Plan);
        return;
      }
      const r = j.result as Minted;
      setMinted({...r, checks: (j.checks as Minted['checks']) ?? []});
      // The token row now exists; the page re-reads it so the form flips to its receipt state.
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  // ⚠️ **Already tokenized reports show their receipt, never an offer to mint.**
  // `report_tokens.report_hash` is the primary key and the route refuses a second attempt; a button
  // that exists only to be refused is worse than no button.
  const existing = target?.token ?? null;
  const done = minted ?? null;
  const [source, setSource] = useState<'generated' | 'upload'>('generated');

  function onTokenize() {
    // Mints the report token and lists it on the marketplace.
  }

  function onSaveDraft() {
    // Stores the listing without publishing it.
  }

  return (
    <div className="tokenize-form panel">
      <div className="tabs">
        <label className="field-label">Source</label>
        <div className="tab-list source-options" role="tablist">
          <button
            className={source === 'generated' ? 'tab active' : 'tab'}
            type="button"
            role="tab"
            aria-selected={source === 'generated'}
            onClick={() => setSource('generated')}
          >
            <FileText />
            Use generated report
          </button>
          <button
            className={source === 'upload' ? 'tab active' : 'tab'}
            type="button"
            role="tab"
            aria-selected={source === 'upload'}
            onClick={() => setSource('upload')}
          >
            <Upload />
            Upload your report
          </button>
        </div>

        <div className="tab-panel">
          {/* ⚠️ **The report on screen, by its own hash.** No one types a 64-character string. */}
          {source === 'generated' ? (
            <div className="file-row">
              <FileText size={20} />
              <span>
                {target ? target.heading : 'No report generated yet'}
                <small>
                  {target
                    ? `${target.factCount} measured figures · ${target.hash.slice(0, 16)}…`
                    : 'Ask Atlas for one above; this form tokenizes whatever is in the panel.'}
                </small>
              </span>
            </div>
          ) : (
            /* ⚠️ MARKED, not removed, and not built. A report's identity IS its canonical form — the
               hash an ATS creation event commits and an Arc market settles against. An uploaded PDF
               has none, so there is nothing to hash. Removing the tab would read as an oversight. */
            <div className="upload-zone">
              <Upload size={24} />
              <strong>Uploading a report is not built</strong>
              <span>
                A report&rsquo;s identity is its canonical form — the 32 bytes the token commits to.
                An uploaded PDF has none, so there is nothing to hash. Generated reports only.
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="form-grid">
        <div>
          <label htmlFor="report-title">Report title</label>
          {/* ⚠️ **REAL, and read-only because it is not this form's to set.** The narrator writes
              the title (migration 008) and it is stored beside the report. An editable box that the
              tokenize route ignores would be worse than a field that shows the truth. */}
          <input
            id="report-title"
            className="field"
            readOnly
            value={target ? target.heading : ''}
            placeholder="No report yet"
          />
        </div>
        <div>
          <label htmlFor="category">Category</label>
          <button id="category" className="choice inert" type="button" aria-label="Report category" aria-disabled="true">
            <span className="choice-value">{listing.category}</span>
            <ChevronDown size={16} />
          </button>
        </div>
        <div className="description-field">
          <label htmlFor="description">Description</label>
          {/* ⚠️ **MARKED — no column behind it.** `reports` has no description, and the route does
              not take one. Left visible and disabled rather than deleted. */}
          <textarea
            id="description"
            className="field inert"
            readOnly
            value="Not built — a report has no description column, and the tokenize route takes none."
          />
        </div>
        <div>
          <label htmlFor="access-price">Access price</label>
          <div className="amount-field">
            <input id="access-price" type="number" min="0.01" step="0.01" defaultValue={listing.price} />
            <span>{listing.currency}</span>
          </div>
          <label className="second-label" htmlFor="related-market">
            Related market
          </label>
          <button
            id="related-market"
            className="choice inert"
            type="button"
            aria-label="Related prediction market"
            aria-disabled="true"
          >
            <span className="choice-value">{listing.marketClaim}</span>
            <ChevronDown size={16} />
          </button>
        </div>
      </div>

      {/* ⚠️ **THE RECEIPT — the thing a stranger checks without trusting us.** Open by default once
          there is something in it; a collapsed receipt is a receipt nobody reads.
          ⚠️ HashScan is a client-routed SPA: every deep path, including `/testnet` itself, returns
          404 to a non-browser client, so its HTTP status proves nothing either way. The ENTITIES
          were verified instead, on Hedera's public mirror node — see logs.md. */}
      <details className="integration-detail" open={!!(done ?? existing)}>
        <summary>
          <span>HEDERA / TOKENIZATION RECEIPT</span>
          <span className={done ?? existing ? 'badge' : 'badge off'}>
            {done ? 'minted this session' : existing ? 'already tokenized' : 'not tokenized'}
          </span>
        </summary>

        {done ?? existing ? (
          <>
            <div className="receipt-grid">
              <div>
                <small>ISIN</small>
                <code>{(done ?? existing)!.isin}</code>
              </div>
              <div>
                <small>ResolverProxy</small>
                <code>
                  <a
                    href={`https://hashscan.io/testnet/contract/${(done ?? existing)!.proxyAddress}`}
                    target="_blank"
                    rel="noreferrer"
                    title="The deployed ATS security on HashScan — opens in a new tab"
                  >
                    {(done ?? existing)!.proxyAddress} <ArrowUpRight size={11} />
                  </a>
                </code>
              </div>
            </div>

            {done ? (
              <>
                {/* ⚠️ **The three writes, each linkable.** They come back from the route at mint
                    time and are NOT stored — `report_tokens` holds hash, proxy, isin and issued_at
                    and no transaction column. So a report tokenized in an earlier session shows its
                    proxy and ISIN but not these three; said rather than faked. */}
                <div className="receipt-grid">
                  {([['Deploy', done.deployTx], ['Grant ISSUER', done.grantRoleTx], ['Issue 1', done.issueTx]] as const).map(
                    ([label, tx]) => (
                      <div key={label}>
                        <small>{label}</small>
                        <code>
                          <a
                            href={`https://hashscan.io/testnet/transaction/${tx}`}
                            target="_blank"
                            rel="noreferrer"
                            title={`${label} transaction on HashScan — opens in a new tab`}
                          >
                            {tx.slice(0, 22)}… <ArrowUpRight size={11} />
                          </a>
                        </code>
                      </div>
                    ),
                  )}
                </div>

                {/* ⚠️ **THE CENTRAL CLAIM, AND THIS IS THE FIRST SURFACE IT IS VISIBLE ON.** The
                    creation event carries `alpha:<reportHash>` — the same 32 bytes an Arc market
                    commits. Not a bridge and not an oracle: one identifier in two places, which is
                    weaker than a bridge and checkable, which a bridge would not be. */}
                <p className="notice">
                  <strong>EquityDeployed carries</strong> <code>{done.emittedInfo}</code> — the same
                  32 bytes an Arc market commits as its <code>reportHash</code>. One identifier in two
                  places; there is no bridge and none is claimed.
                </p>

                {done.checks.length > 0 && (
                  <div className="receipt-grid">
                    {done.checks.map((c) => (
                      <div key={c.label}>
                        <small>{c.ok ? 'PASS' : 'FAIL'}</small>
                        <code>{c.label}</code>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="muted">
                Issued {new Date(existing!.issuedAt).toISOString().slice(0, 10)}. The three creation
                transactions are returned at mint time and are not stored, so they are not shown for a
                token minted in an earlier session — the contract above is the durable record.
              </p>
            )}
          </>
        ) : (
          <p className="muted">
            Nothing minted for this report. Tokenizing deploys an ATS ResolverProxy on Hedera testnet,
            grants ISSUER and issues a supply of 1.
          </p>
        )}
      </details>

      <details className="integration-detail">
        <summary>
          <span>x402 / PAID ACCESS</span>
          {/* ⚠️ **HBAR, not USDC, and the form used to say "5 USDC".** `pricing.ts`: a
              USD-denominated price THROWS on testnet — `defaultMoneyConversion` resolves USD through
              a `DEFAULT_ASSETS` table with no HBAR entry — and the USDC cutover belongs to mainnet,
              where four things move in one commit. One constant, every report. */}
          <span>{target ? `${target.priceHbar} HBAR per unlock` : '— per unlock'}</span>
        </summary>
        <p className="muted">
          Every report is {target ? target.priceHbar : '—'} HBAR, settled over x402 on Hedera testnet.
          ⚠️ <strong>Per-report pricing is not built</strong> — it needs a `reports` column and a
          decision about whether a price is inside the report&rsquo;s hash, which it must not be: a
          price is not part of what a report is.
        </p>
      </details>

      {error && <p className="notice">{error}</p>}

      {/* ⚠️ **TWO PRESSES, AND THE FIRST ONE SPENDS NOTHING.** Tokenizing mints a PERMANENT asset
          for ~7.7 HBAR, so it is not one click. The route already has the split — it returns
          `mode: 'dry'` without `confirm` — and this surface uses it: the first press prices the job
          and shows the balance and the floor, the second authorises it. Same shape as the CLI, which
          is dry by default and spends only on `--confirm`. */}
      {!(done ?? existing) && (
        <>
          {plan && (
            <p className="notice">
              <strong>This will spend about {plan.estimateHbar} HBAR and mint a permanent asset.</strong>{' '}
              Balance {plan.balanceHbar} HBAR, floor {plan.floorHbar}. ISIN <code>{plan.isin}</code>,
              issued to <code>{plan.recipient.slice(0, 12)}…</code>. Nothing has been spent yet.
            </p>
          )}
          <div className="button-row">
            {plan ? (
              <button className="btn primary full" type="button" onClick={() => void post(true)} disabled={busy}>
                {busy ? 'Minting…' : `Confirm — spend ~${plan.estimateHbar} HBAR`}
              </button>
            ) : (
              <button
                className="btn primary full"
                type="button"
                onClick={() => void post(false)}
                disabled={busy || !target}
              >
                {busy ? 'Pricing…' : target ? 'Price this tokenization' : 'No report to tokenize'}
              </button>
            )}
            {plan && (
              <button className="btn dark-outline full" type="button" onClick={() => setPlan(null)} disabled={busy}>
                Cancel
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

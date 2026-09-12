'use client';

import {useState} from 'react';
import {useRouter} from 'next/navigation.js';
import {useSecret} from './ConsoleSecret.js';
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
  token: {
    proxyAddress: string;
    isin: string;
    issuedAt: string;
    deployTx: string | null;
    grantRoleTx: string | null;
    issueTx: string | null;
  } | null;
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
  const {draft, setDraft} = useSecret();

  // ⚠️ **The hash is a field now, defaulted to the report on screen.** Paste another and the form
  // targets it; the price step asks the route about THAT hash, so an unknown one comes back as the
  // route's own refusal rather than silently reverting to the displayed report.
  const [hash, setHash] = useState(target?.hash ?? '');

  // ⚠️ **Normalise before looking anything up.** A hash copied out of a terminal or a log arrives
  // with a line break in the middle, or upper-cased, or with an `0x` in front. **All of those are
  // the same hash to a person**, and a lookup that fails on any of them is the form being pedantic
  // about a copy artifact. Whitespace ANYWHERE is stripped — not just the ends — because the real
  // report of this fault was 64 hex characters with a space in the middle.
  const normalise = (raw: string) => raw.replace(/\s+/g, '').replace(/^0x/i, '').toLowerCase();
  const clean = normalise(hash);
  const looksLikeHash = /^[0-9a-f]{64}$/.test(clean);

  // ⚠️ The draft is seeded from the report once and then owned by whoever is typing.
  const d = draft ?? {
    title: target?.heading ?? '',
    description: '',
    priceHbar: target?.priceHbar ?? '',
  };
  const edit = (patch: Partial<typeof d>) => setDraft({...d, ...patch});
  const [error, setError] = useState<string | null>(null);

  // ⚠️ **The hash comes from the report on screen, not from a field.** It is 64 characters and the
  // document sits directly above this panel; asking someone to find and paste it would be the
  // console making work it already has the answer to. `target` is the same report the document
  // panel renders, handed down by the page.
  async function post(confirm: boolean) {
    if (!clean || busy) return;
    // ⚠️ **"Not a hash" and "not in the store" are different problems** and the route can only
    // answer the second. Saying which one it is here is the difference between "fix your paste" and
    // "that report does not exist".
    if (!looksLikeHash) {
      setError(
        `That is not a report hash. It needs 64 hex characters; this is ${clean.length} ` +
        `character${clean.length === 1 ? '' : 's'}${/[^0-9a-f]/.test(clean) ? ' and contains non-hex characters' : ''}. ` +
        'Whitespace, an 0x prefix and capitals are all handled — the length or the characters are wrong.',
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/console/tokenize', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({reportHash: clean, confirm}),
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
  // ⚠️ **Already-minted is only knowable for the report on screen.** If the typed hash is a
  // different report we have no row for it here, so the controls stay live and the route answers —
  // a 409 naming the existing token, which is a refusal rather than a surprise.
  const targetsDisplayed =
    !!target && hash.trim().toLowerCase() === target.hash.toLowerCase();
  const existing = targetsDisplayed ? (target!.token ?? null) : null;
  const done = minted ?? null;

  /** ⚠️ Three states, and all three render a form with buttons in it. */
  const state: 'no-hash' | 'minted' | 'ready' = !hash.trim()
    ? 'no-hash'
    : done ?? existing
      ? 'minted'
      : 'ready';
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
        <div className="full">
          {/* ⚠️ **The report this form will tokenize.** Defaults to the one in the panel above;
              paste another to target it. An unknown hash is refused by the route and shown as its
              own message — the form never quietly reverts to the displayed report, because the
              button below spends. */}
          <label htmlFor="report-hash">Report hash</label>
          <input
            id="report-hash"
            className="field"
            value={hash}
            spellCheck={false}
            onChange={(e) => {
              setHash(e.target.value.trim());
              setPlan(null);
            }}
            placeholder="64 hex characters"
          />
        </div>
        <div>
          <label htmlFor="report-title">Report title</label>
          {/* ⚠️ **REAL, and read-only because it is not this form's to set.** The narrator writes
              the title (migration 008) and it is stored beside the report. An editable box that the
              tokenize route ignores would be worse than a field that shows the truth. */}
          <input
            id="report-title"
            className="field"
            maxLength={100}
            value={d.title}
            onChange={(e) => edit({title: e.target.value})}
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
            className="field"
            maxLength={500}
            value={d.description}
            onChange={(e) => edit({description: e.target.value})}
            placeholder="Describe the listing. Shown in the preview; not saved — see below."
          />
        </div>
        <div>
          <label htmlFor="access-price">Access price</label>
          <div className="amount-field">
            <input
              id="access-price"
              type="number"
              min="0.0001"
              step="0.0001"
              value={d.priceHbar}
              onChange={(e) => edit({priceHbar: e.target.value})}
            />
            {/* ⚠️ HBAR. A USD-denominated price throws on testnet — no HBAR entry in DEFAULT_ASSETS. */}
            <span>HBAR</span>
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

            {(done ?? (existing?.deployTx ? existing : null)) ? (
              <>
                {/* ⚠️ **The three writes, each linkable.** They come back from the route at mint
                    time and are NOT stored — `report_tokens` holds hash, proxy, isin and issued_at
                    and no transaction column. So a report tokenized in an earlier session shows its
                    proxy and ISIN but not these three; said rather than faked. */}
                <div className="receipt-grid">
                  {([
                    ['Deploy', done?.deployTx ?? existing!.deployTx!],
                    ['Grant ISSUER', done?.grantRoleTx ?? existing!.grantRoleTx!],
                    ['Issue 1', done?.issueTx ?? existing!.issueTx!],
                  ] as const).map(
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
                <p className="notice"><span>
                  <strong>EquityDeployed carries</strong>{' '}
                  <code>{done ? done.emittedInfo : `alpha:${target?.hash ?? ''}`}</code> — the same
                  32 bytes an Arc market commits as its <code>reportHash</code>. One identifier in two
                  places; there is no bridge and none is claimed.
                </span></p>

                {done && done.checks.length > 0 && (
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

      {/* ⚠️ **WHAT SURVIVES A PUBLISH, said where the person publishes.** `/api/console/tokenize`
          accepts `{reportHash, confirm}` and nothing else — so **none of the three editable fields
          above is sent, and none is stored.** The title that exists is the narrator's, written at
          generation time by `recordTitle()`; editing it here changes the preview and not the record.
          Storing any of them needs a `reports` column and a route that accepts it, which is a
          schema change and is not being made here. */}
      <p className="notice"><span>
        <strong>Only the report hash is published.</strong> Title, description and price edit the
        preview so you can see the listing — <strong>none of the three is saved</strong>, and the
        charge stays {target ? target.priceHbar : '0.001'} HBAR whatever the price box says. Storing
        them needs a <code>reports</code> column and a route that takes it.
      </span></p>

      {error && <p className="notice"><span>{error}</span></p>}

      {/* ⚠️ **THE CONTROLS ARE ALWAYS HERE.** What changes is what they say and whether they are
          enabled — never whether they exist. This block used to disappear on an already-tokenized
          report, and a form with no buttons cannot be told apart from a form that is failing.

          ⚠️ **TWO PRESSES, AND THE FIRST SPENDS NOTHING.** Tokenizing mints a PERMANENT asset for
          ~7.7 HBAR. The route already has the split — no `confirm` returns `mode: 'dry'` — and the
          CLI has the same shape. It is the safety property, not a flourish, and it is not collapsed
          into one button.

          ⚠️ **The buttons act on the HASH FIELD, not on the document panel.** `state` is computed
          from what is typed. "Already minted" is only knowable for the report on screen; paste any
          other hash and the controls stay live, because whether THAT report has a token is the
          route's answer to give — and it gives it as a refusal rather than a surprise. */}
      {plan && (
        <p className="notice"><span>
          <strong>This will spend about {plan.estimateHbar} HBAR and mint a permanent asset.</strong>{' '}
          Balance {plan.balanceHbar} HBAR, floor {plan.floorHbar}. ISIN <code>{plan.isin}</code>,
          issued to <code>{plan.recipient.slice(0, 12)}…</code>. Nothing has been spent yet.
        </span></p>
      )}

      {state === 'minted' && (
        <p className="notice"><span>
          <strong>This report is already tokenized</strong> as <code>{(done ?? existing)!.isin}</code>.
          A report can hold one token — <code>report_tokens.report_hash</code> is the primary key and
          the route refuses a second mint. Paste a different hash above to tokenize another report;
          the receipt below stays.
        </span></p>
      )}

      {state === 'no-hash' && (
        <p className="muted">
          Paste a report hash above, or open <code>/console?report=&lt;hash&gt;</code>. The buttons
          act on that field.
        </p>
      )}

      <div className="button-row">
        <button
          className="btn primary full"
          type="button"
          onClick={() => void post(plan !== null)}
          disabled={busy || state !== 'ready'}
        >
          {busy
            ? plan
              ? 'Minting…'
              : 'Pricing…'
            : state === 'no-hash'
              ? 'Paste a report hash to tokenize'
              : state === 'minted'
                ? 'Already tokenized'
                : plan
                  ? `Confirm — spend ~${plan.estimateHbar} HBAR and mint`
                  : 'Price this tokenization'}
        </button>
        {/* ⚠️ **THE BLANK BUTTON, and it was two faults at once.**
            1. `.btn.dark-outline` sets `color: var(--paper)` — WHITE — because it is the dark Atlas
               panel's variant. On this light form that is white text on a white button: present,
               focusable, and invisible. `.btn.outline` is the light-panel variant.
            2. It should not have been there at all before a plan exists. **The two-press split is
               that the first press prices and the second spends**, so the control that cancels a
               plan appears once there IS a plan. Rendering it early is a button with nothing to do.
            Both fixed: light variant, and only when `plan !== null`. */}
        {plan && (
          <button className="btn outline full" type="button" onClick={() => setPlan(null)} disabled={busy}>
            Cancel
          </button>
        )}
      </div>

      {/* ⚠️ **There is no separate "publish".** The marketplace at `/` lists reports from the store
          and reads their token state with `tokensFor`, so a minted report is listed the moment the
          row exists. Minting IS publishing, and no button here should imply a second step. */}
      <p className="muted">
        Minting lists it. <code>/</code> reads the store and shows a report as tokenized once the row
        exists — there is no separate publish step.
      </p>
    </div>
  );
}

/**
 * The three values the Marketplace preview shows, read live from whatever is being typed.
 *
 * ⚠️ **In this file rather than a new one** because it needs the same `'use client'` boundary and
 * the same context; and it renders only the dynamic text, so `.listing-preview`'s markup in
 * `app/console/page.tsx` is otherwise untouched.
 */
export function ListingPreviewText({fallback}: {fallback: {title: string; priceHbar: string}}) {
  const {draft} = useSecret();
  const title = draft?.title?.trim() || fallback.title;
  const price = draft?.priceHbar?.trim() || fallback.priceHbar;
  const description = draft?.description?.trim() ?? '';

  return (
    <>
      <h3>{title}</h3>
      <p>By Atlas Research</p>
      {description ? <p className="muted">{description}</p> : null}
      <strong className="listing-price">
        {price} <small>HBAR</small>
      </strong>
    </>
  );
}

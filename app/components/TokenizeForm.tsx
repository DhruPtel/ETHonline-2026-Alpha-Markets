'use client';

import {useState} from 'react';
import {ChevronDown, FileText, Upload} from './Icons.js';

/**
 * The tokenize form: the source tabs, the listing fields and the access price.
 * Client-only — tabs and text inputs.
 *
 * onTokenize is the stub the Hedera call replaces.
 */
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

export function TokenizeForm({listing}: {listing: Listing}) {
  const [source, setSource] = useState<'generated' | 'upload'>('generated');

  function onTokenize() {
    // Mints the report token and lists it on the marketplace.
  }

  function onSaveDraft() {
    // Stores the listing without publishing it.
  }

  function onChooseFile() {
    // Opens the file picker for an uploaded report.
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
          {source === 'generated' ? (
            <div className="file-row">
              <FileText size={20} />
              <span>
                {listing.title}
                <small>
                  Generated document · {listing.filePages} pages
                </small>
              </span>
              <span className="btn outline inert">Preview</span>
            </div>
          ) : (
            <div className="upload-zone">
              <Upload size={24} />
              <strong>Drop your report here</strong>
              <span>PDF up to 15 MB</span>
              <div className="button-row">
                <button className="btn outline" type="button" onClick={onChooseFile}>
                  Choose PDF
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="form-grid">
        <div>
          <label htmlFor="report-title">Report title</label>
          <input id="report-title" className="field" maxLength={100} defaultValue={listing.title} />
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
          <textarea id="description" className="field" maxLength={500} defaultValue={listing.description} />
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

      <details className="integration-detail">
        <summary>
          <span>HEDERA / TOKENIZATION RECEIPT</span>
          <span className="badge">{listing.publishState}</span>
        </summary>
        <div className="receipt-grid">
          <div>
            <small>Token ID</small>
            <code>{listing.tokenIdState}</code>
          </div>
          <div>
            <small>Creation transaction</small>
            <code>{listing.transactionState}</code>
          </div>
        </div>
      </details>

      <details className="integration-detail">
        <summary>
          <span>x402 / PAID ACCESS</span>
          <span>
            {listing.price} {listing.currency} per unlock
          </span>
        </summary>
        <p>
          Readers pay to unlock this listing. Payment receipts show the access price and settlement.
        </p>
      </details>

      <div className="button-row">
        <button className="btn primary" type="button" onClick={onTokenize}>
          Tokenize and list
        </button>
        <button className="btn outline" type="button" onClick={onSaveDraft}>
          Save draft
        </button>
      </div>
    </div>
  );
}

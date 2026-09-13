'use client';

import {ChevronDown, Search} from './Icons.js';

/**
 * The market index controls: the tab bar, the search box, the category chips
 * and the status select. Client-only because it owns tabs and a text input.
 *
 * "My positions" is present because the design has it, but this front end has
 * no positions view, so it carries .inert rather than a dead handler.
 *
 * ⚠️ **The search box, the chips and the status select are live but do nothing** — their handlers
 * are empty stubs. `/markets` passes only the `All` chip.
 */
export function MarketFilters({
  categories,
  activeCategory,
  status,
  marketCount,
}: {
  categories: string[];
  activeCategory: string;
  status: string;
  marketCount: number;
}) {
  function onSearch(term: string) {
    // Stub — would filter the market list by claim text.
    void term;
  }

  function onSelectCategory(category: string) {
    // Stub — would narrow the market list to one category.
    void category;
  }

  function onSelectStatus() {
    // Stub — would switch between all, open and resolved markets.
  }

  return (
    <>
      <div className="tab-list line market-tabs" role="tablist">
        <button className="tab active" type="button" role="tab" aria-selected="true">
          All predictions <span className="count">{marketCount}</span>
        </button>
        <span className="tab inert" role="tab" aria-selected="false" aria-disabled="true">
          My positions <span className="count">0</span>
        </span>
      </div>

      <div className="filter-bar">
        <div className="search-field">
          <Search size={17} />
          <input
            aria-label="Search predictions"
            placeholder="Search predictions…"
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>
        <div className="filter-chips">
          {categories.map((category) => (
            <button
              key={category}
              type="button"
              className={category === activeCategory ? 'active' : undefined}
              aria-pressed={category === activeCategory}
              onClick={() => onSelectCategory(category)}
            >
              {category}
            </button>
          ))}
        </div>
        <button className="choice" type="button" aria-label="Market status" onClick={onSelectStatus}>
          <span className="choice-value">{status}</span>
          <ChevronDown size={16} />
        </button>
      </div>
    </>
  );
}

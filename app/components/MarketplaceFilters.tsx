'use client';

import {FileText, Search} from './Icons.js';

/**
 * The marketplace filter bar: a search box, the category chips and the
 * "My reports" toggle. Client-only because it owns a text input.
 *
 * ⚠️ **ALL THREE ARE MARKED, NOT REMOVED.** There is nothing behind any of them: `reports` has no
 * category column, so a chip could only filter on a guess; search over a list that fits on one
 * screen (eleven rows when this was decided) would be a control with nothing to do; and "My reports"
 * needs an identity system — `payments/auth.ts` is the declared cut point. **A reviewer seeing them
 * gone would think we forgot them**, so they are visible, disabled, and say why.
 *
 * The handlers are empty stubs behind the disabled controls. The grid is rendered by `app/page.tsx`
 * from `listPublished()`.
 */
export function MarketplaceFilters({
  categories,
  activeCategory,
}: {
  categories: string[];
  activeCategory: string;
}) {
  function onSearch(term: string) {
    // Stub — would filter the report list by title, subtitle and author.
    void term;
  }

  function onSelectCategory(category: string) {
    // Stub — would narrow the report list to one category.
    void category;
  }

  function onToggleMyReports() {
    // Stub, and unreferenced — would limit the list to reports this account published or bought.
  }

  return (
    <div className="filter-bar">
      <div className="search-field">
        <Search size={17} />
        <input
          aria-label="Search reports"
          placeholder="Search — not built"
          disabled
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
            disabled
          >
            {category === 'All' ? 'All reports' : category}
          </button>
        ))}
      </div>
      <button className="btn outline my-reports inert" type="button" aria-disabled="true" title="Not built — there is no identity system, so there is no set of reports that are yours">
        <FileText size={16} />
        My reports
      </button>
    </div>
  );
}

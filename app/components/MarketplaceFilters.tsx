'use client';

import {FileText, Search} from './Icons.js';

/**
 * The marketplace filter bar: a search box, the category chips and the
 * "My reports" toggle. Client-only because it owns a text input.
 *
 * The handlers are stubs, named for what they will do. The grid they will
 * filter is rendered by the page from its own const; nothing is wired yet.
 */
export function MarketplaceFilters({
  categories,
  activeCategory,
}: {
  categories: string[];
  activeCategory: string;
}) {
  function onSearch(term: string) {
    // Filters the report list by title, subtitle and author.
    void term;
  }

  function onSelectCategory(category: string) {
    // Narrows the report list to one category.
    void category;
  }

  function onToggleMyReports() {
    // Limits the list to reports this account published or bought.
  }

  return (
    <div className="filter-bar">
      <div className="search-field">
        <Search size={17} />
        <input
          aria-label="Search reports"
          placeholder="Search reports, protocols…"
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
            {category === 'All' ? 'All reports' : category}
          </button>
        ))}
      </div>
      <button className="btn outline my-reports" type="button" aria-pressed={false} onClick={onToggleMyReports}>
        <FileText size={16} />
        My reports
      </button>
    </div>
  );
}

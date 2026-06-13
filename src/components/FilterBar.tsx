import type { FilterState, LogLevel, TimeWindow } from '../types';
import { ALL_LEVELS, TIME_WINDOWS } from '../logParser';
import './FilterBar.css';

interface FilterBarProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
}

export default function FilterBar({ filters, onChange }: FilterBarProps) {
  const update = (patch: Partial<FilterState>) =>
    onChange({ ...filters, ...patch });

  return (
    <div className="filterbar" id="filter-bar">
      {/* Time Window */}
      <div className="filterbar__section">
        <label className="filterbar__label">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2"/>
            <path d="M7 4V7.5L9.5 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
          Window
        </label>
        <div className="filterbar__chips" id="window-chips">
          {TIME_WINDOWS.map(tw => (
            <button
              key={tw.value}
              className={`filterbar__chip ${filters.window === tw.value ? 'filterbar__chip--active' : ''}`}
              onClick={() => update({ window: tw.value as TimeWindow })}
              type="button"
            >
              {tw.label}
            </button>
          ))}
        </div>
      </div>

      {/* Level Filter */}
      <div className="filterbar__section">
        <label className="filterbar__label">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 10L7 3L12 10H2Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
            <path d="M7 7V8M7 9.5V9.51" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
          Level ≥
        </label>
        <div className="filterbar__chips" id="level-chips">
          {ALL_LEVELS.map(lvl => (
            <button
              key={lvl}
              className={`filterbar__chip filterbar__chip--level-${lvl.toLowerCase()} ${filters.minLevel === lvl ? 'filterbar__chip--active' : ''}`}
              onClick={() => update({ minLevel: lvl as LogLevel })}
              type="button"
            >
              {lvl === 'DEBUG' ? 'Debug / All' : lvl}
            </button>
          ))}
        </div>
      </div>

      {/* Search Row */}
      <div className="filterbar__row">
        <div className="filterbar__search-wrapper">
          <svg className="filterbar__search-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M11 11L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <input
            id="search-input"
            className="filterbar__search"
            type="text"
            placeholder="Search logger or message (regex ok)…"
            value={filters.search}
            onChange={e => update({ search: e.target.value })}
          />
          {filters.search && (
            <button
              className="filterbar__search-clear"
              onClick={() => update({ search: '' })}
              type="button"
              aria-label="Clear search"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M3.5 3.5L10.5 10.5M10.5 3.5L3.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

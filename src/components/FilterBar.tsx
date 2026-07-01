import type { FilterState, LineLimit, LogLevel } from '../types';
import { ALL_LEVELS } from '../logParser';
import './FilterBar.css';

interface FilterBarProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
}

export default function FilterBar({ filters, onChange }: FilterBarProps) {
  const update = (patch: Partial<FilterState>) =>
    onChange({ ...filters, ...patch });

  const today = new Date();
  const todayValue = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const lineOptions: { label: string; value: LineLimit }[] = [
    { label: '100', value: 100 },
    { label: '250', value: 250 },
    { label: '500', value: 500 },
    { label: '1,000', value: 1000 },
    { label: '2,500', value: 2500 },
    { label: '5,000', value: 5000 },
    { label: 'All', value: 'all' },
  ];

  return (
    <div className="filterbar" id="filter-bar">
      {/* Display controls */}
      <div className="filterbar__section">
        <label className="filterbar__label">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M2.5 3.5H11.5M2.5 7H11.5M2.5 10.5H8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          Display lines
        </label>
        <div className="filterbar__chips" id="line-limit-chips">
          {lineOptions.map(option => (
            <button
              key={option.value}
              className={`filterbar__chip ${filters.lineLimit === option.value ? 'filterbar__chip--active' : ''}`}
              onClick={() => update({ lineLimit: option.value })}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom date range */}
      <div className="filterbar__section">
        <label className="filterbar__label">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <rect x="2.25" y="3" width="9.5" height="8.5" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
            <path d="M4.5 1.75V4.25M9.5 1.75V4.25M2.5 5.5H11.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
          Date range
        </label>
        <div className="filterbar__custom-date">
          <div className="filterbar__date-field">
            <label className="filterbar__custom-label" htmlFor="custom-from-date-input">
              From
            </label>
            <input
              id="custom-from-date-input"
              className="filterbar__date-input"
              type="date"
              value={filters.customFromDate}
              max={filters.customToDate || todayValue}
              onChange={e => update({ customFromDate: e.target.value, window: e.target.value || filters.customToDate ? 'custom' : 'all' })}
            />
          </div>
          <div className="filterbar__date-field">
            <label className="filterbar__custom-label" htmlFor="custom-to-date-input">
              To
            </label>
            <input
              id="custom-to-date-input"
              className="filterbar__date-input"
              type="date"
              value={filters.customToDate}
              min={filters.customFromDate || undefined}
              max={todayValue}
              onChange={e => update({ customToDate: e.target.value, window: filters.customFromDate || e.target.value ? 'custom' : 'all' })}
            />
          </div>
          <button
            className="filterbar__custom-clear"
            onClick={() => update({ customFromDate: '', customToDate: '', window: 'all' })}
            type="button"
          >
            Clear
          </button>
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
            placeholder="Search by message, logger, request ID… (regex ok)"
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

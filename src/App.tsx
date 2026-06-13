import { useState, useMemo, useCallback } from 'react';
import DropZone from './components/DropZone';
import FilterBar from './components/FilterBar';
import SummaryBar from './components/SummaryBar';
import LogTable from './components/LogTable';
import UserGuide from './components/UserGuide';
import { filterEntries, countLevels } from './logParser';
import type { LogEntry, FilterState } from './types';
import './App.css';

const DEFAULT_FILTERS: FilterState = {
  window: 'all',
  minLevel: 'INFO',
  search: '',
};

export default function App() {
  const [allEntries, setAllEntries] = useState<LogEntry[]>([]);
  const [fileName, setFileName] = useState('');
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);

  const handleFileParsed = useCallback((entries: LogEntry[], name: string) => {
    setAllEntries(entries);
    setFileName(name);
  }, []);

  const handleNewFile = useCallback(() => {
    setAllEntries([]);
    setFileName('');
    setFilters(DEFAULT_FILTERS);
  }, []);

  const filtered = useMemo(
    () => filterEntries(allEntries, filters),
    [allEntries, filters]
  );

  const counts = useMemo(() => countLevels(filtered), [filtered]);

  const hasData = allEntries.length > 0;

  return (
    <div className="app">
      {/* Background ambient orbs */}
      <div className="app__ambient app__ambient--1" />
      <div className="app__ambient app__ambient--2" />

      {/* Header */}
      <header className="app__header" id="app-header">
        <div className="app__header-left">
          <div className="app__logo">
            <img
              src="/logo.jpg"
              alt="Oreyeon TraceLens"
              className="app__logo-img"
            />
          </div>
          <div className="app__title-group">
            <h1 className="app__title">Oreyeon <span className="app__title-accent">TraceLens</span></h1>
            <p className="app__subtitle">CloudWatch Log Analysis</p>
          </div>
        </div>

        {hasData && (
          <button
            id="new-file-button"
            className="app__new-file-btn"
            onClick={handleNewFile}
            type="button"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1V13M1 7H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            New File
          </button>
        )}
      </header>

      {/* Main Content */}
      <main className="app__main">
        {!hasData ? (
          <>
            <DropZone onFileParsed={handleFileParsed} />
            <UserGuide />
          </>
        ) : (
          <div className="app__viewer">
            <FilterBar filters={filters} onChange={setFilters} />
            <SummaryBar
              filtered={filtered.length}
              total={allEntries.length}
              counts={counts}
              fileName={fileName}
            />
            <LogTable entries={filtered} />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="app__footer">
        <span>Oreyeon</span>
        <span className="app__footer-dot">•</span>
        <span>TraceLens v1.0.0</span>
      </footer>
    </div>
  );
}

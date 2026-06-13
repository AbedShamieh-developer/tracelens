import { useState, useCallback, useRef, useEffect } from 'react';
import type { LogEntry } from '../types';
import './LogTable.css';

interface LogTableProps {
  entries: LogEntry[];
}

const MAX_RENDER = 500;
const BATCH_SIZE = 200;

export default function LogTable({ entries }: LogTableProps) {
  const [visibleCount, setVisibleCount] = useState(MAX_RENDER);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const sentinelRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Reset visible count when entries change
  useEffect(() => {
    setVisibleCount(MAX_RENDER);
    setExpandedRows(new Set());
  }, [entries]);

  // Infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (observerEntries) => {
        if (observerEntries[0].isIntersecting) {
          setVisibleCount(prev => Math.min(prev + BATCH_SIZE, entries.length));
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [entries.length]);

  const toggleRow = useCallback((idx: number) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  // Show last N entries (most recent first display, but sorted chronologically)
  const visible = entries.slice(0, visibleCount);

  if (entries.length === 0) {
    return (
      <div className="logtable__empty">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <circle cx="24" cy="24" r="18" stroke="currentColor" strokeWidth="1.5" opacity="0.3"/>
          <path d="M16 24H32M24 16V32" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.3"/>
        </svg>
        <p>No log entries match the current filters</p>
        <span>Try adjusting the time window, level, or search terms</span>
      </div>
    );
  }

  return (
    <div className="logtable-wrapper" ref={containerRef}>
      {/* Column Header */}
      <div className="logtable__header">
        <div className="logtable__col logtable__col--ts">Timestamp</div>
        <div className="logtable__col logtable__col--logger">Logger</div>
        <div className="logtable__col logtable__col--level">Level</div>
        <div className="logtable__col logtable__col--msg">Message</div>
      </div>

      {/* Rows */}
      <div className="logtable__body" id="log-entries">
        {visible.map((entry, idx) => {
          const isExpanded = expandedRows.has(idx);
          const hasExtra = entry.extra.trim().length > 0;

          return (
            <div
              key={`${entry.epoch}-${idx}`}
              className={`logtable__row logtable__row--${entry.level.toLowerCase()} ${isExpanded ? 'logtable__row--expanded' : ''}`}
              onClick={() => hasExtra && toggleRow(idx)}
              style={{ cursor: hasExtra ? 'pointer' : 'default' }}
            >
              <div className="logtable__cell logtable__cell--ts">
                <span className="logtable__ts-text">{entry.ts}</span>
              </div>
              <div className="logtable__cell logtable__cell--logger" title={entry.logger}>
                {entry.logger}
              </div>
              <div className="logtable__cell logtable__cell--level">
                <span className={`logtable__badge logtable__badge--${entry.level.toLowerCase()}`}>
                  {entry.level}
                </span>
              </div>
              <div className="logtable__cell logtable__cell--msg">
                <span className="logtable__msg-text">{entry.msg}</span>
                {hasExtra && (
                  <button
                    className="logtable__expand-btn"
                    aria-label={isExpanded ? 'Collapse extra' : 'Expand extra'}
                    onClick={(e) => { e.stopPropagation(); toggleRow(idx); }}
                    type="button"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 14 14"
                      fill="none"
                      style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 200ms' }}
                    >
                      <path d="M3.5 5.25L7 8.75L10.5 5.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                )}
              </div>

              {isExpanded && hasExtra && (
                <div className="logtable__extra">
                  <pre className="logtable__extra-pre">{entry.extra}</pre>
                </div>
              )}
            </div>
          );
        })}

        {/* Infinite scroll sentinel */}
        {visibleCount < entries.length && (
          <div ref={sentinelRef} className="logtable__sentinel">
            <div className="logtable__loading-dots">
              <span /><span /><span />
            </div>
            Loading more entries…
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="logtable__footer">
        Showing {Math.min(visibleCount, entries.length).toLocaleString()} of {entries.length.toLocaleString()} entries
      </div>
    </div>
  );
}

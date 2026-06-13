import { useState, useCallback, useRef, useEffect } from 'react';
import type { LogEntry } from '../types';
import './LogTable.css';

interface LogTableProps {
  entries: LogEntry[];
}

const MAX_RENDER = 500;
const BATCH_SIZE = 200;

function CopyIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
      <rect x="4" y="4" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M3 8H2C1.44772 8 1 7.55228 1 7V2C1 1.44772 1.44772 1 2 1H7C7.55228 1 8 1.44772 8 2V3" stroke="currentColor" strokeWidth="1.4"/>
    </svg>
  );
}

function RequestIdChip({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [id]);

  return (
    <span className="logtable__reqid">
      <span className="logtable__reqid-text" title={id}>{id}</span>
      <button
        className={`logtable__reqid-copy ${copied ? 'logtable__reqid-copy--done' : ''}`}
        onClick={copy}
        type="button"
        aria-label="Copy request ID"
        title={copied ? 'Copied!' : 'Copy request ID'}
      >
        {copied
          ? <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          : <CopyIcon />
        }
      </button>
    </span>
  );
}

function CopyEntryButton({ entry }: { entry: LogEntry }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const text = [
      `[${entry.level}] ${entry.ts} — ${entry.logger}`,
      entry.requestId ? `Request ID: ${entry.requestId}` : '',
      `Message: ${entry.msg}`,
      entry.metadata ? `Metadata: ${JSON.stringify(entry.metadata, null, 2)}` : '',
      entry.extra.trim() ? entry.extra : '',
    ].filter(Boolean).join('\n');

    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [entry]);

  return (
    <button
      className={`logtable__copy-entry ${copied ? 'logtable__copy-entry--done' : ''}`}
      onClick={copy}
      type="button"
      aria-label="Copy entry"
      title={copied ? 'Copied!' : 'Copy entry'}
    >
      {copied
        ? <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        : <CopyIcon />
      }
    </button>
  );
}

function MetadataTable({ data }: { data: Record<string, unknown> }) {
  return (
    <table className="logtable__meta-table">
      <tbody>
        {Object.entries(data).map(([k, v]) => (
          <tr key={k} className="logtable__meta-row">
            <td className="logtable__meta-key">{k}</td>
            <td className="logtable__meta-val">
              {typeof v === 'object' && v !== null
                ? <pre className="logtable__meta-nested">{JSON.stringify(v, null, 2)}</pre>
                : String(v)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function LogTable({ entries }: LogTableProps) {
  const [visibleCount, setVisibleCount] = useState(MAX_RENDER);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const sentinelRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setVisibleCount(MAX_RENDER);
    setExpandedRows(new Set());
  }, [entries]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (obs) => {
        if (obs[0].isIntersecting)
          setVisibleCount(prev => Math.min(prev + BATCH_SIZE, entries.length));
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
      <div className="logtable__body" id="log-entries">
        {visible.map((entry, idx) => {
          const isExpanded = expandedRows.has(idx);
          const hasExtra = entry.extra.trim().length > 0 || !!entry.metadata;
          const isErrorLevel = entry.level === 'ERROR' || entry.level === 'CRITICAL';

          return (
            <div
              key={`${entry.epoch}-${idx}`}
              className={`logtable__row logtable__row--${entry.level.toLowerCase()} ${isExpanded ? 'logtable__row--expanded' : ''}`}
            >
              {/* Header: badge · timestamp · logger · requestId · copy · expand */}
              <div className="logtable__entry-header">
                <span className={`logtable__badge logtable__badge--${entry.level.toLowerCase()}`}>
                  {entry.level}
                </span>
                <span className="logtable__entry-ts">{entry.ts}</span>
                <span className="logtable__entry-sep">·</span>
                <span className="logtable__entry-logger">{entry.logger}</span>
                {entry.requestId && (
                  <>
                    <span className="logtable__entry-sep">·</span>
                    <RequestIdChip id={entry.requestId} />
                  </>
                )}

                <div className="logtable__entry-actions">
                  {isErrorLevel && <CopyEntryButton entry={entry} />}
                  {hasExtra && (
                    <button
                      className="logtable__expand-btn"
                      aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
                      onClick={() => toggleRow(idx)}
                      type="button"
                    >
                      <svg
                        width="12" height="12" viewBox="0 0 12 12" fill="none"
                        style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 200ms' }}
                      >
                        <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  )}
                </div>              </div>

              {/* Message — click to expand/collapse when there's extra data */}
              <div
                className={`logtable__entry-msg ${hasExtra ? 'logtable__entry-msg--clickable' : ''}`}
                onClick={() => hasExtra && toggleRow(idx)}
              >
                {entry.msg}
              </div>

              {/* Expanded details */}
              {isExpanded && hasExtra && (
                <div className="logtable__extra">
                  {entry.metadata && (
                    <div className="logtable__extra-section">
                      <div className="logtable__extra-label">metadata</div>
                      <MetadataTable data={entry.metadata} />
                    </div>
                  )}
                  {entry.extra.trim() && (
                    <div className="logtable__extra-section">
                      <div className="logtable__extra-label">additional fields</div>
                      <pre className="logtable__extra-pre">{entry.extra}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {visibleCount < entries.length && (
          <div ref={sentinelRef} className="logtable__sentinel">
            <div className="logtable__loading-dots"><span /><span /><span /></div>
            Loading more entries…
          </div>
        )}
      </div>

      <div className="logtable__footer">
        Showing {Math.min(visibleCount, entries.length).toLocaleString()} of {entries.length.toLocaleString()} entries
      </div>
    </div>
  );
}

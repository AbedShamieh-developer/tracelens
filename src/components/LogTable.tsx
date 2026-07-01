import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { LineLimit, LogEntry } from '../types';
import IncidentReport from './IncidentReport';
import './LogTable.css';

interface LogTableProps {
  entries: LogEntry[];
  sourceEntries?: LogEntry[];
  displayLimit?: LineLimit;
  fileName?: string;
  analyzerName?: string;
  focusedEntry?: LogEntry;
  focusToken?: number;
  onOpenInFullLog?: (entry: LogEntry) => void;
}

const DEFAULT_RENDER = 500;
const CONTEXT_RADIUS = 3;

type TracedEntry = {
  requestId: string;
  sourceIndex: number;
  entry: LogEntry;
};

function hasSameEntryContent(a: LogEntry, b: LogEntry) {
  return (
    a.epoch === b.epoch &&
    a.ts === b.ts &&
    a.level === b.level &&
    a.logger === b.logger &&
    a.msg === b.msg &&
    a.requestId === b.requestId
  );
}

function isSameTraceTarget(target: TracedEntry | null, entry: LogEntry, sourceIndex: number) {
  if (!target) {
    return false;
  }

  if (target.sourceIndex >= 0 && sourceIndex >= 0) {
    return target.sourceIndex === sourceIndex;
  }

  return hasSameEntryContent(target.entry, entry);
}

function CopyIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
      <rect x="4" y="4" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M3 8H2C1.44772 8 1 7.55228 1 7V2C1 1.44772 1.44772 1 2 1H7C7.55228 1 8 1.44772 8 2V3" stroke="currentColor" strokeWidth="1.4"/>
    </svg>
  );
}

function LocateIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <circle cx="6" cy="6" r="3.5" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M6 1V3M6 9V11M1 6H3M9 6H11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
}

function TraceIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <circle cx="2.5" cy="3" r="1.4" stroke="currentColor" strokeWidth="1.3"/>
      <circle cx="9.5" cy="6" r="1.4" stroke="currentColor" strokeWidth="1.3"/>
      <circle cx="2.5" cy="9" r="1.4" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M3.9 3.35L8.1 5.35M8.1 6.65L3.9 8.65" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  );
}

function ReportIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M3 1.5H7.25L10 4.25V10.5H3V1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
      <path d="M7.25 1.5V4.25H10M4.5 6H8.5M4.5 8H7.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
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
      `[${entry.level}] ${entry.ts} - ${entry.logger}`,
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

export default function LogTable({
  entries,
  sourceEntries = entries,
  displayLimit = DEFAULT_RENDER,
  fileName = 'Log source',
  analyzerName = 'TraceLens analyst',
  focusedEntry,
  focusToken = 0,
  onOpenInFullLog,
}: LogTableProps) {
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [locatedSourceIndex, setLocatedSourceIndex] = useState<number | null>(null);
  const [tracedEntry, setTracedEntry] = useState<TracedEntry | null>(null);
  const [caseReportEntry, setCaseReportEntry] = useState<LogEntry | null>(null);
  const [spotlightEntry, setSpotlightEntry] = useState<LogEntry | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef(new Map<LogEntry, HTMLDivElement>());
  const handledFocusTokenRef = useRef(0);
  const maxRows = displayLimit === 'all' ? entries.length : Math.min(displayLimit, entries.length);

  const sourceIndexes = useMemo(() => {
    const indexes = new Map<LogEntry, number>();
    sourceEntries.forEach((entry, index) => indexes.set(entry, index));
    return indexes;
  }, [sourceEntries]);

  const requestTrails = useMemo(() => {
    const trails = new Map<string, LogEntry[]>();

    for (const entry of sourceEntries) {
      if (!entry.requestId) {
        continue;
      }

      const trail = trails.get(entry.requestId);
      if (trail) {
        trail.push(entry);
      } else {
        trails.set(entry.requestId, [entry]);
      }
    }

    return trails;
  }, [sourceEntries]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setExpandedRows(new Set());
      setLocatedSourceIndex(null);
      setTracedEntry(null);
      setCaseReportEntry(null);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [entries, displayLimit]);

  useEffect(() => {
    if (!focusedEntry || focusToken === 0 || handledFocusTokenRef.current === focusToken) {
      return;
    }

    const timer = window.setTimeout(() => {
      const row = rowRefs.current.get(focusedEntry);
      if (!row) {
        return;
      }

      handledFocusTokenRef.current = focusToken;
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setSpotlightEntry(focusedEntry);
    }, 80);

    const clearTimer = window.setTimeout(() => {
      setSpotlightEntry((current) => current === focusedEntry ? null : current);
    }, 3200);

    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(clearTimer);
    };
  }, [focusedEntry, focusToken]);

  const toggleRow = useCallback((idx: number) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const openCaseReport = useCallback((entry: LogEntry) => {
    setCaseReportEntry(entry);
  }, []);

  const visible = entries.slice(0, maxRows);

  if (entries.length === 0) {
    return (
      <div className="logtable__empty">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <circle cx="24" cy="24" r="18" stroke="currentColor" strokeWidth="1.5" opacity="0.3"/>
          <path d="M16 24H32M24 16V32" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.3"/>
        </svg>
        <p>No log entries match the current filters</p>
        <span>Try adjusting the date range, level, or search terms</span>
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
          const sourceIndex = sourceIndexes.get(entry) ?? -1;
          const canLocate = isErrorLevel && sourceIndex >= 0 && sourceEntries.length > entries.length;
          const isLocated = canLocate && locatedSourceIndex === sourceIndex;
          const isTraced = isSameTraceTarget(tracedEntry, entry, sourceIndex);
          const isSpotlighted = spotlightEntry === entry;
          const contextStart = isLocated ? Math.max(0, sourceIndex - CONTEXT_RADIUS) : 0;
          const contextEnd = isLocated ? Math.min(sourceEntries.length, sourceIndex + CONTEXT_RADIUS + 1) : 0;
          const contextEntries = isLocated ? sourceEntries.slice(contextStart, contextEnd) : [];
          const isCurrentTrailEntry = (trailEntry: LogEntry) => {
            const trailSourceIndex = sourceIndexes.get(trailEntry) ?? -1;
            return isSameTraceTarget(tracedEntry, trailEntry, trailSourceIndex);
          };
          const trailEntries = isTraced && tracedEntry
            ? requestTrails.get(tracedEntry.requestId) ?? []
            : [];
          const trailHasProblem = trailEntries.some(
            (trailEntry) => trailEntry.level === 'ERROR' || trailEntry.level === 'CRITICAL',
          );

          return (
            <div
              key={`${entry.epoch}-${idx}`}
              ref={(node) => {
                if (node) {
                  rowRefs.current.set(entry, node);
                } else {
                  rowRefs.current.delete(entry);
                }
              }}
              className={`logtable__row logtable__row--${entry.level.toLowerCase()} ${isExpanded ? 'logtable__row--expanded' : ''} ${hasExtra ? 'logtable__row--clickable' : ''} ${isSpotlighted ? 'logtable__row--spotlight' : ''}`}
              onClick={() => hasExtra && toggleRow(idx)}
            >
              <div className="logtable__entry-header">
                <span className={`logtable__badge logtable__badge--${entry.level.toLowerCase()}`}>
                  {entry.level}
                </span>
                <span className="logtable__entry-ts">{entry.ts}</span>
                <span className="logtable__entry-sep">|</span>
                <span className="logtable__entry-logger">{entry.logger}</span>
                {entry.requestId && (
                  <>
                    <span className="logtable__entry-sep">|</span>
                    <RequestIdChip id={entry.requestId} />
                  </>
                )}

                <div className="logtable__entry-actions">
                  {canLocate && (
                    <button
                      className={`logtable__locate-btn ${isLocated ? 'logtable__locate-btn--active' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setLocatedSourceIndex((current) => current === sourceIndex ? null : sourceIndex);
                      }}
                      type="button"
                      aria-label={isLocated ? 'Hide source section' : 'Locate source section'}
                      title={isLocated ? 'Hide source section' : 'Locate source section'}
                    >
                      <LocateIcon />
                    </button>
                  )}
                  {isErrorLevel && <CopyEntryButton entry={entry} />}
                  {isErrorLevel && (
                    <button
                      className="logtable__report-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        openCaseReport(entry);
                      }}
                      type="button"
                      aria-label="Create case report"
                      title="Create case report"
                    >
                      <ReportIcon />
                    </button>
                  )}
                  {entry.requestId && (
                    <button
                      className={`logtable__trace-btn ${isTraced ? 'logtable__trace-btn--active' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setTracedEntry((current) =>
                          isSameTraceTarget(current, entry, sourceIndex) || !entry.requestId
                            ? null
                            : { requestId: entry.requestId, sourceIndex, entry },
                        );
                        setLocatedSourceIndex(null);
                      }}
                      type="button"
                      aria-label={isTraced ? 'Hide request trail' : 'Trace request ID'}
                      title={isTraced ? 'Hide request trail' : 'Trace request ID'}
                    >
                      <TraceIcon />
                    </button>
                  )}
                  {hasExtra && (
                    <button
                      className="logtable__expand-btn"
                      aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleRow(idx);
                      }}
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
                </div>
              </div>

              <div className="logtable__entry-msg">
                {entry.msg}
              </div>

              {isTraced && entry.requestId && (
                <div className="logtable__trail" onClick={(e) => e.stopPropagation()}>
                  <div className="logtable__trail-header">
                    <div>
                      <span>Request ID Trail</span>
                      <strong title={entry.requestId}>{entry.requestId}</strong>
                    </div>
                    <div className="logtable__trail-stats" aria-label="Request trail summary">
                      <span>{trailEntries.length.toLocaleString()} steps</span>
                      <span className={trailHasProblem ? 'logtable__trail-state--hot' : 'logtable__trail-state--calm'}>
                        {trailHasProblem ? 'Needs review' : 'Clean path'}
                      </span>
                    </div>
                  </div>

                  <div className="logtable__trail-line" aria-hidden="true">
                    {trailEntries.map((trailEntry, trailIdx) => {
                      const isCurrent = isCurrentTrailEntry(trailEntry);

                      return (
                        <span
                          key={`${trailEntry.epoch}-${trailIdx}-marker`}
                          className={`logtable__trail-marker logtable__trail-marker--${trailEntry.level.toLowerCase()} ${isCurrent ? 'logtable__trail-marker--current' : ''}`}
                        />
                      );
                    })}
                  </div>

                  <div className="logtable__trail-list">
                    {trailEntries.map((trailEntry, trailIdx) => {
                      const isCurrent = isCurrentTrailEntry(trailEntry);

                      return (
                        <button
                          key={`${trailEntry.epoch}-${trailIdx}-trail`}
                          type="button"
                          className={`logtable__trail-step ${isCurrent ? 'logtable__trail-step--current' : ''}`}
                          onClick={() => {
                            if (onOpenInFullLog) {
                              onOpenInFullLog(trailEntry);
                            }
                          }}
                          disabled={!onOpenInFullLog}
                        >
                          <span className="logtable__trail-index">{trailIdx + 1}</span>
                          <span className={`logtable__source-level logtable__source-level--${trailEntry.level.toLowerCase()}`}>
                            {trailEntry.level}
                          </span>
                          <span className="logtable__trail-time">{trailEntry.ts}</span>
                          <span className="logtable__trail-message">{trailEntry.msg}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {isLocated && (
                <div className="logtable__source-section" onClick={(e) => e.stopPropagation()}>
                  <div className="logtable__source-heading">
                    <div>
                      <span>Source section</span>
                      <small>Nearby entries from the unfiltered log stream</small>
                    </div>
                    <span>
                      Entry {(sourceIndex + 1).toLocaleString()} of {sourceEntries.length.toLocaleString()}
                    </span>
                  </div>
                  <div className="logtable__source-list">
                    {contextEntries.map((contextEntry, contextIdx) => {
                      const originalIndex = contextStart + contextIdx;
                      const isCurrent = originalIndex === sourceIndex;

                      return (
                        <div
                          key={`${contextEntry.epoch}-${originalIndex}`}
                          className={`logtable__source-line ${isCurrent ? 'logtable__source-line--current' : ''}`}
                        >
                          <span className="logtable__source-line-number">
                            {(originalIndex + 1).toLocaleString()}
                          </span>
                          <span className={`logtable__source-level logtable__source-level--${contextEntry.level.toLowerCase()}`}>
                            {contextEntry.level}
                          </span>
                          <span className="logtable__source-time">{contextEntry.ts}</span>
                          <span className="logtable__source-message">{contextEntry.msg}</span>
                        </div>
                      );
                    })}
                  </div>
                  {onOpenInFullLog && (
                    <div className="logtable__source-actions">
                      <button
                        type="button"
                        className="logtable__source-open-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenInFullLog(entry);
                        }}
                      >
                        <LocateIcon />
                        Open in Debug / All
                      </button>
                      {isErrorLevel && (
                        <button
                          type="button"
                          className="logtable__source-open-btn logtable__source-open-btn--report"
                          onClick={(e) => {
                            e.stopPropagation();
                            openCaseReport(entry);
                          }}
                        >
                          <ReportIcon />
                          Create Case Report
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

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

        {maxRows < entries.length && (
          <div className="logtable__limit-note">
            Increase the display lines selector to show more matching entries.
          </div>
        )}
      </div>

      <div className="logtable__footer">
        Showing {maxRows.toLocaleString()} of {entries.length.toLocaleString()} entries
      </div>

      {caseReportEntry && (
        <IncidentReport
          entry={caseReportEntry}
          fileName={fileName}
          analyzerName={analyzerName}
          sourceEntries={sourceEntries}
          sourceIndex={sourceIndexes.get(caseReportEntry) ?? -1}
          onClose={() => setCaseReportEntry(null)}
        />
      )}
    </div>
  );
}

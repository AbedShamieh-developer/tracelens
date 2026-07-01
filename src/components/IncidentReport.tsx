import { useCallback, useMemo, useState } from 'react';
import type { LogEntry } from '../types';
import './IncidentReport.css';

interface IncidentReportProps {
  entry: LogEntry;
  fileName: string;
  analyzerName: string;
  sourceEntries: LogEntry[];
  sourceIndex: number;
  onClose: () => void;
}

type ReportSection = 'context' | 'trail' | 'metadata';

const REPORT_CONTEXT_RADIUS = 5;
const MAX_TRAIL_ROWS = 80;

function formatDuration(start: number, end: number) {
  const duration = Math.max(0, end - start);
  if (duration < 1000) return `${duration} ms`;
  if (duration < 60000) return `${(duration / 1000).toFixed(2)} s`;
  return `${(duration / 60000).toFixed(1)} min`;
}

function safeFilePart(value: string) {
  return value.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'incident';
}

function buildReportId(entry: LogEntry) {
  const seed = `${entry.epoch}-${entry.logger}-${entry.requestId ?? entry.msg}`.split('');
  const hash = seed.reduce((value, char) => ((value << 5) - value + char.charCodeAt(0)) | 0, 0);
  return `TL-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.abs(hash).toString(36).toUpperCase().slice(0, 6)}`;
}

function buildEvidence(entry: LogEntry, sourceEntries: LogEntry[], sourceIndex: number) {
  const contextStart = sourceIndex >= 0 ? Math.max(0, sourceIndex - REPORT_CONTEXT_RADIUS) : 0;
  const contextEnd = sourceIndex >= 0 ? Math.min(sourceEntries.length, sourceIndex + REPORT_CONTEXT_RADIUS + 1) : 0;
  const contextEntries = sourceIndex >= 0 ? sourceEntries.slice(contextStart, contextEnd) : [];

  let trailCount = 0;
  let trailStart = entry.epoch;
  let trailEnd = entry.epoch;
  const trailEntries: LogEntry[] = [];

  if (entry.requestId) {
    for (const sourceEntry of sourceEntries) {
      if (sourceEntry.requestId !== entry.requestId) continue;
      if (trailCount === 0) {
        trailStart = sourceEntry.epoch;
        trailEnd = sourceEntry.epoch;
      } else {
        trailStart = Math.min(trailStart, sourceEntry.epoch);
        trailEnd = Math.max(trailEnd, sourceEntry.epoch);
      }
      trailCount += 1;
      if (trailEntries.length < MAX_TRAIL_ROWS) {
        trailEntries.push(sourceEntry);
      }
    }
  }

  return {
    contextStart,
    contextEntries,
    trailCount,
    trailEntries,
    trailDuration: formatDuration(trailStart, trailEnd),
    trailTruncated: trailCount > trailEntries.length,
  };
}

export default function IncidentReport({ entry, fileName, analyzerName, sourceEntries, sourceIndex, onClose }: IncidentReportProps) {
  const reportId = useMemo(() => buildReportId(entry), [entry]);
  const [primaryFinding, setPrimaryFinding] = useState(
    `${entry.level} detected in ${entry.logger}. Review the captured evidence and request trail before escalation.`,
  );
  const [notes, setNotes] = useState('');
  const [sections, setSections] = useState<Record<ReportSection, boolean>>({
    context: true,
    trail: Boolean(entry.requestId),
    metadata: Boolean(entry.metadata || entry.extra.trim()),
  });
  const [downloading, setDownloading] = useState(false);
  const generatedAt = useMemo(() => new Date().toLocaleString(), []);
  const evidence = useMemo(
    () => buildEvidence(entry, sourceEntries, sourceIndex),
    [entry, sourceEntries, sourceIndex],
  );

  const updateSection = useCallback((section: ReportSection, enabled: boolean) => {
    setSections((current) => ({ ...current, [section]: enabled }));
  }, []);

  const downloadPdf = useCallback(async () => {
    setDownloading(true);
    try {
      const { generateIncidentReportPdf } = await import('./incidentReportPdf');
      const blob = await generateIncidentReportPdf({
        entry,
        fileName,
        analyzerName,
        reportId,
        primaryFinding,
        sourceEntries,
        sourceIndex,
        notes,
        generatedAt,
        sections,
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `tracelens-incident-${safeFilePart(entry.requestId || entry.logger)}-${Date.now()}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }, [analyzerName, entry, fileName, generatedAt, notes, primaryFinding, reportId, sections, sourceEntries, sourceIndex]);

  return (
    <div className="incident-report" role="dialog" aria-modal="true" aria-label="Incident case report">
      <div className="incident-report__shell">
        <button type="button" className="incident-report__close" onClick={onClose} aria-label="Close case report">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        </button>

        <section className="incident-report__hero">
          <img src="/mdu-tracelens-logo.png" alt="MDU TraceLens" />
          <div>
            <span>Case composer</span>
            <h2>Incident Case Report</h2>
            <p>{generatedAt} | Analyst: {analyzerName}</p>
          </div>
          <strong className={`incident-report__severity incident-report__severity--${entry.level.toLowerCase()}`}>
            {entry.level}
          </strong>
        </section>

        <div className="incident-report__body">
          <aside className="incident-report__rail">
            <div className="incident-report__metric incident-report__metric--id">
              <span>Report ID</span>
              <strong title={reportId}>{reportId}</strong>
            </div>
            <div className="incident-report__metric">
              <span>Source</span>
              <strong title={fileName}>{fileName}</strong>
            </div>
            <div className="incident-report__metric">
              <span>Logger</span>
              <strong title={entry.logger}>{entry.logger}</strong>
            </div>
            <div className="incident-report__metric">
              <span>Analyst</span>
              <strong title={analyzerName}>{analyzerName}</strong>
            </div>
            <div className="incident-report__metric">
              <span>Request Trail</span>
              <strong>{entry.requestId ? `${evidence.trailCount.toLocaleString()} steps` : 'Not available'}</strong>
            </div>
            <div className="incident-report__metric">
              <span>Duration</span>
              <strong>{entry.requestId ? evidence.trailDuration : 'Unknown'}</strong>
            </div>
          </aside>

          <main className="incident-report__workspace">
            <div className="incident-report__section incident-report__section--finding">
              <div className="incident-report__section-title">
                <span>Primary finding</span>
                <strong>Executive brief</strong>
              </div>
              <textarea
                value={primaryFinding}
                onChange={(event) => setPrimaryFinding(event.target.value)}
                placeholder="Summarize what happened, why it matters, and what should be checked next..."
              />
            </div>

            <div className="incident-report__section incident-report__section--primary">
              <div className="incident-report__section-title">
                <span>Primary evidence</span>
                <strong>{entry.ts}</strong>
              </div>
              <code>{entry.msg}</code>
              {entry.requestId && <p>Request ID: {entry.requestId}</p>}
            </div>

            <div className="incident-report__section">
              <div className="incident-report__section-title">
                <span>Analyst notes</span>
                <strong>{notes.length.toLocaleString()} chars</strong>
              </div>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Write the investigation summary, suspected cause, next action, or handoff notes..."
              />
            </div>

            <div className="incident-report__toggles">
              <label>
                <input
                  type="checkbox"
                  checked={sections.context}
                  onChange={(event) => updateSection('context', event.target.checked)}
                />
                <span>Source context</span>
              </label>
              <label className={!entry.requestId ? 'incident-report__toggle-disabled' : ''}>
                <input
                  type="checkbox"
                  checked={sections.trail}
                  onChange={(event) => updateSection('trail', event.target.checked)}
                  disabled={!entry.requestId}
                />
                <span>Request trail</span>
              </label>
              <label className={!entry.metadata && !entry.extra.trim() ? 'incident-report__toggle-disabled' : ''}>
                <input
                  type="checkbox"
                  checked={sections.metadata}
                  onChange={(event) => updateSection('metadata', event.target.checked)}
                  disabled={!entry.metadata && !entry.extra.trim()}
                />
                <span>Metadata</span>
              </label>
            </div>

            <div className="incident-report__preview">
              <div className="incident-report__preview-head">
                <span>PDF evidence preview</span>
                <strong>{sourceIndex >= 0 ? `Entry ${(sourceIndex + 1).toLocaleString()}` : 'Filtered entry'}</strong>
              </div>
              {sections.context && evidence.contextEntries.slice(0, 5).map((contextEntry, index) => (
                <div
                  key={`${contextEntry.epoch}-${index}-context-preview`}
                  className={`incident-report__preview-row ${contextEntry === entry ? 'incident-report__preview-row--active' : ''}`}
                >
                  <span>{evidence.contextStart + index + 1}</span>
                  <strong className={`incident-report__level incident-report__level--${contextEntry.level.toLowerCase()}`}>
                    {contextEntry.level}
                  </strong>
                  <code>{contextEntry.msg}</code>
                </div>
              ))}
              {sections.trail && entry.requestId && evidence.trailEntries.slice(0, 5).map((trailEntry, index) => (
                <div
                  key={`${trailEntry.epoch}-${index}-trail-preview`}
                  className={`incident-report__preview-row ${trailEntry === entry ? 'incident-report__preview-row--active' : ''}`}
                >
                  <span>{index + 1}</span>
                  <strong className={`incident-report__level incident-report__level--${trailEntry.level.toLowerCase()}`}>
                    {trailEntry.level}
                  </strong>
                  <code>{trailEntry.msg}</code>
                </div>
              ))}
            </div>
          </main>
        </div>

        <footer className="incident-report__actions">
          <button type="button" className="incident-report__action" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="incident-report__action incident-report__action--primary"
            onClick={downloadPdf}
            disabled={downloading}
          >
            {downloading ? 'Generating PDF...' : 'Download PDF'}
          </button>
        </footer>
      </div>
    </div>
  );
}

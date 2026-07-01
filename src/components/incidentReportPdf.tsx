import { Document, Image, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer';
import type { LogEntry } from '../types';

type ReportSection = 'context' | 'trail' | 'metadata';

interface GenerateIncidentReportPdfArgs {
  entry: LogEntry;
  fileName: string;
  analyzerName: string;
  reportId: string;
  primaryFinding: string;
  sourceEntries: LogEntry[];
  sourceIndex: number;
  notes: string;
  generatedAt: string;
  sections: Record<ReportSection, boolean>;
}

const REPORT_CONTEXT_RADIUS = 5;
const MAX_TRAIL_ROWS = 80;

function formatDuration(start: number, end: number) {
  const duration = Math.max(0, end - start);
  if (duration < 1000) return `${duration} ms`;
  if (duration < 60000) return `${(duration / 1000).toFixed(2)} s`;
  return `${(duration / 60000).toFixed(1)} min`;
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

function levelColor(level: LogEntry['level']) {
  if (level === 'CRITICAL') return '#9f1239';
  if (level === 'ERROR') return '#b42318';
  if (level === 'WARNING') return '#b7791f';
  if (level === 'INFO') return '#047857';
  return '#4b5563';
}

const pdfStyles = StyleSheet.create({
  page: {
    padding: '28 30 38',
    fontSize: 9,
    fontFamily: 'Helvetica',
    color: '#111827',
    backgroundColor: '#f8fafc',
  },
  severityRail: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 8,
    backgroundColor: '#b42318',
  },
  header: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
    padding: 16,
    borderRadius: 10,
    marginBottom: 12,
    backgroundColor: '#07111f',
  },
  logo: {
    width: 46,
    height: 46,
    objectFit: 'contain',
  },
  brand: {
    fontSize: 8,
    color: '#7be2ff',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 20,
    fontWeight: 700,
    marginTop: 2,
    color: '#ffffff',
  },
  generated: {
    marginTop: 4,
    color: '#cbd5e1',
  },
  severity: {
    marginLeft: 'auto',
    padding: '7 11',
    borderRadius: 12,
    color: '#ffffff',
    backgroundColor: '#b42318',
    fontWeight: 700,
  },
  reportId: {
    marginTop: 4,
    fontSize: 8,
    color: '#e5e7eb',
    fontFamily: 'Courier',
  },
  finding: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    backgroundColor: '#fff7ed',
    borderLeft: '5 solid #b42318',
  },
  findingLabel: {
    fontSize: 8,
    color: '#9a3412',
    textTransform: 'uppercase',
    letterSpacing: 1.1,
    marginBottom: 5,
    fontWeight: 700,
  },
  findingText: {
    fontSize: 12,
    lineHeight: 1.35,
    fontWeight: 700,
  },
  grid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  stat: {
    flex: 1,
    padding: 9,
    border: '1 solid #e5e7eb',
    borderRadius: 8,
    backgroundColor: '#ffffff',
  },
  statLabel: {
    fontSize: 7,
    color: '#6b7280',
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  statValue: {
    fontSize: 9,
    fontWeight: 700,
  },
  section: {
    marginTop: 10,
    padding: 11,
    border: '1 solid #e5e7eb',
    borderRadius: 8,
    backgroundColor: '#ffffff',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 700,
    marginBottom: 8,
    color: '#0f172a',
  },
  messageBox: {
    padding: 9,
    borderRadius: 6,
    backgroundColor: '#fef2f2',
    border: '1 solid #fecaca',
  },
  mono: {
    fontFamily: 'Courier',
    fontSize: 8,
  },
  row: {
    flexDirection: 'row',
    gap: 6,
    padding: '6 4',
    borderBottom: '1 solid #eef2f7',
  },
  rowIndex: {
    width: 36,
    color: '#6b7280',
    fontFamily: 'Courier',
  },
  rowLevel: {
    width: 52,
    fontFamily: 'Courier',
    fontWeight: 700,
  },
  rowTime: {
    width: 118,
    color: '#4b5563',
    fontFamily: 'Courier',
  },
  rowMessage: {
    flex: 1,
    fontFamily: 'Courier',
    fontSize: 7,
  },
  selectedRow: {
    backgroundColor: '#fff1f2',
  },
  pre: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: '#f9fafb',
    border: '1 solid #e5e7eb',
    fontFamily: 'Courier',
    fontSize: 7,
  },
  footer: {
    position: 'absolute',
    bottom: 16,
    left: 30,
    right: 30,
    borderTop: '1 solid #e5e7eb',
    paddingTop: 6,
    color: '#6b7280',
    fontSize: 7,
  },
});

function createReportPdfDocument({
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
}: GenerateIncidentReportPdfArgs) {
  const evidence = buildEvidence(entry, sourceEntries, sourceIndex);

  return (
    <Document title="MDU TraceLens Incident Report" author="MDU TraceLens">
      <Page size="A4" style={pdfStyles.page}>
        <View style={[pdfStyles.severityRail, { backgroundColor: levelColor(entry.level) }]} fixed />
        <View style={pdfStyles.header}>
          <Image src="/mdu-tracelens-logo.png" style={pdfStyles.logo} />
          <View>
            <Text style={pdfStyles.brand}>MDU TraceLens</Text>
            <Text style={pdfStyles.title}>Incident Case Report</Text>
            <Text style={pdfStyles.generated}>Generated {generatedAt}</Text>
            <Text style={pdfStyles.reportId}>Report ID: {reportId}</Text>
          </View>
          <Text style={[pdfStyles.severity, { backgroundColor: levelColor(entry.level) }]}>{entry.level}</Text>
        </View>

        <View style={pdfStyles.finding}>
          <Text style={pdfStyles.findingLabel}>Primary Finding</Text>
          <Text style={pdfStyles.findingText}>{primaryFinding.trim() || 'No primary finding was provided.'}</Text>
        </View>

        <View style={pdfStyles.grid}>
          <View style={pdfStyles.stat}>
            <Text style={pdfStyles.statLabel}>Source</Text>
            <Text style={pdfStyles.statValue}>{fileName}</Text>
          </View>
          <View style={pdfStyles.stat}>
            <Text style={pdfStyles.statLabel}>Logger</Text>
            <Text style={pdfStyles.statValue}>{entry.logger}</Text>
          </View>
          <View style={pdfStyles.stat}>
            <Text style={pdfStyles.statLabel}>Analyst</Text>
            <Text style={pdfStyles.statValue}>{analyzerName}</Text>
          </View>
          <View style={pdfStyles.stat}>
            <Text style={pdfStyles.statLabel}>Entry</Text>
            <Text style={pdfStyles.statValue}>
              {sourceIndex >= 0 ? `${sourceIndex + 1} of ${sourceEntries.length}` : 'Filtered view'}
            </Text>
          </View>
        </View>
        <View style={pdfStyles.grid}>
          <View style={pdfStyles.stat}>
            <Text style={pdfStyles.statLabel}>Request Trail</Text>
            <Text style={pdfStyles.statValue}>
              {entry.requestId ? `${evidence.trailCount} steps` : 'Not available'}
            </Text>
          </View>
          <View style={pdfStyles.stat}>
            <Text style={pdfStyles.statLabel}>Duration</Text>
            <Text style={pdfStyles.statValue}>{entry.requestId ? evidence.trailDuration : 'Unknown'}</Text>
          </View>
          <View style={pdfStyles.stat}>
            <Text style={pdfStyles.statLabel}>Timestamp</Text>
            <Text style={pdfStyles.statValue}>{entry.ts}</Text>
          </View>
          <View style={pdfStyles.stat}>
            <Text style={pdfStyles.statLabel}>Report ID</Text>
            <Text style={pdfStyles.statValue}>{reportId}</Text>
          </View>
        </View>

        <View style={pdfStyles.section}>
          <Text style={pdfStyles.sectionTitle}>Primary Error</Text>
          <View style={pdfStyles.messageBox}>
            <Text style={pdfStyles.mono}>{entry.msg}</Text>
          </View>
          {entry.requestId && <Text style={{ marginTop: 6 }}>Request ID: {entry.requestId}</Text>}
          <Text style={{ marginTop: 6 }}>Timestamp: {entry.ts}</Text>
        </View>

        {notes.trim() && (
          <View style={pdfStyles.section}>
            <Text style={pdfStyles.sectionTitle}>Analyst Notes</Text>
            <Text>{notes}</Text>
          </View>
        )}

        {sections.trail && entry.requestId && evidence.trailEntries.length > 0 && (
          <View style={pdfStyles.section}>
            <Text style={pdfStyles.sectionTitle}>
              Request ID Trail ({evidence.trailCount} steps, {evidence.trailDuration})
            </Text>
            {evidence.trailEntries.map((trailEntry, index) => (
              <View
                key={`${trailEntry.epoch}-${index}-trail-pdf`}
                style={trailEntry === entry ? [pdfStyles.row, pdfStyles.selectedRow] : pdfStyles.row}
              >
                <Text style={pdfStyles.rowIndex}>{index + 1}</Text>
                <Text style={[pdfStyles.rowLevel, { color: levelColor(trailEntry.level) }]}>{trailEntry.level}</Text>
                <Text style={pdfStyles.rowTime}>{trailEntry.ts}</Text>
                <Text style={pdfStyles.rowMessage}>{trailEntry.msg}</Text>
              </View>
            ))}
            {evidence.trailTruncated && (
              <Text style={{ marginTop: 6, color: '#6b7280' }}>
                Trail preview limited to the first {MAX_TRAIL_ROWS} rows.
              </Text>
            )}
          </View>
        )}

        {sections.context && evidence.contextEntries.length > 0 && (
          <View style={pdfStyles.section}>
            <Text style={pdfStyles.sectionTitle}>Surrounding Source Context</Text>
            {evidence.contextEntries.map((contextEntry, index) => (
              <View
                key={`${contextEntry.epoch}-${index}-context-pdf`}
                style={contextEntry === entry ? [pdfStyles.row, pdfStyles.selectedRow] : pdfStyles.row}
              >
                <Text style={pdfStyles.rowIndex}>{evidence.contextStart + index + 1}</Text>
                <Text style={[pdfStyles.rowLevel, { color: levelColor(contextEntry.level) }]}>{contextEntry.level}</Text>
                <Text style={pdfStyles.rowTime}>{contextEntry.ts}</Text>
                <Text style={pdfStyles.rowMessage}>{contextEntry.msg}</Text>
              </View>
            ))}
          </View>
        )}

        {sections.metadata && (entry.metadata || entry.extra.trim()) && (
          <View style={pdfStyles.section}>
            <Text style={pdfStyles.sectionTitle}>Metadata</Text>
            {entry.metadata && <Text style={pdfStyles.pre}>{JSON.stringify(entry.metadata, null, 2)}</Text>}
            {entry.extra.trim() && <Text style={pdfStyles.pre}>{entry.extra}</Text>}
          </View>
        )}

        <Text style={pdfStyles.footer}>
          Generated by MDU TraceLens for analyst {analyzerName}. Evidence is based on the currently loaded local log source.
        </Text>
      </Page>
    </Document>
  );
}

export async function generateIncidentReportPdf(args: GenerateIncidentReportPdfArgs) {
  return await pdf(createReportPdfDocument(args)).toBlob();
}

/* =============================================
   CSV Parsing & Filtering Logic
   (Port of the Python log_viewer.py logic)
   ============================================= */

import type { LogEntry, LogLevel, TimeWindow, FilterState, LevelCounts } from './types';

// ── Constants ──────────────────────────────────

export const LEVEL_ORDER: Record<LogLevel, number> = {
  DEBUG: 10,
  INFO: 20,
  WARNING: 30,
  ERROR: 40,
  CRITICAL: 50,
};

export const ALL_LEVELS: LogLevel[] = ['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'];

export const TIME_WINDOWS: { label: string; value: TimeWindow }[] = [
  { label: '5m',  value: '5m'  },
  { label: '15m', value: '15m' },
  { label: '30m', value: '30m' },
  { label: '1h',  value: '1h'  },
  { label: '2h',  value: '2h'  },
  { label: '3h',  value: '3h'  },
  { label: '4h',  value: '4h'  },
  { label: '5h',  value: '5h'  },
  { label: '12h', value: '12h' },
  { label: '1d',  value: '1d'  },
  { label: 'All', value: 'all' },
];

const WINDOW_MINUTES: Record<TimeWindow, number> = {
  '5m': 5, '15m': 15, '30m': 30, '1h': 60, '2h': 120, '3h': 180,
  '4h': 240, '5h': 300, '12h': 720, '1d': 1440, 'all': 0,
};

const LINE_RE = /^(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}[,.]\d{3})\s+-\s+(\S+)\s+-\s+(DEBUG|INFO|WARNING|ERROR|CRITICAL)\s+-\s+(.*)$/s;
const LAMBDA_REQUEST_RE = /\b(?:START|END|REPORT)\s+RequestId:\s+([^\s]+)/;

// ── Helpers ────────────────────────────────────

function epochToTs(epochMs: number): string {
  try {
    const d = new Date(epochMs);
    const iso = d.toISOString(); // "2024-01-15T12:34:56.789Z"
    return iso.replace('T', ' ').replace('Z', '').replace('.', ',');
  } catch {
    return String(epochMs);
  }
}

function inferLevel(msg: string): { level: LogLevel; logger: string | null } {
  const head = msg.trim().split(/\s+/)[0] || '';
  if (['START', 'END', 'REPORT', 'INIT_START', 'INIT_REPORT'].includes(head)) {
    return { level: 'DEBUG', logger: 'lambda.runtime' };
  }
  for (const lvl of ALL_LEVELS) {
    if (new RegExp(`\\b${lvl}\\b`).test(msg)) {
      return { level: lvl, logger: null };
    }
  }
  return { level: 'INFO', logger: null };
}

// Returns true if the string contains a high ratio of non-printable/binary characters
function isBinaryCorrupted(text: string): boolean {
  if (!text || text.length === 0) return false;
  const sample = text.slice(0, 200);
  let binary = 0;
  for (let i = 0; i < sample.length; i++) {
    const code = sample.charCodeAt(i);
    // Only flag ASCII control characters (excluding tab, newline, carriage return)
    // and the Unicode replacement character — not extended Unicode
    if ((code < 9) || (code > 13 && code < 32) || code === 0xfffd) binary++;
  }
  // Require at least 3 binary chars AND >15% ratio to avoid false positives
  return binary >= 3 && binary / sample.length > 0.15;
}

function parseTimestampValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 10000000000 ? value * 1000 : value;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().replace('T', ' ').replace('Z', '').replace('+0000', '').replace(',', '.');
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseLocalDateBounds(value: string): { start: number; end: number } | null {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(year, month - 1, day, 0, 0, 0, 0);

  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  const start = parsed.getTime();
  const end = new Date(year, month - 1, day + 1, 0, 0, 0, 0).getTime();

  return { start, end };
}

function getRuntimeOrder(msg: string): number {
  const head = msg.trim().split(/\s+/)[0] || '';

  if (head === 'START') return 0;
  if (head === 'END') return 2;
  if (head === 'REPORT') return 3;
  return 1;
}

export function sortEntriesForTimeline(entries: LogEntry[]): LogEntry[] {
  const groups = new Map<string, { entries: LogEntry[]; latestEpoch: number; firstIndex: number }>();

  entries.forEach((entry, index) => {
    const key = entry.requestId ?? `entry:${index}`;
    const group = groups.get(key);

    if (group) {
      group.entries.push(entry);
      group.latestEpoch = Math.max(group.latestEpoch, entry.epoch);
    } else {
      groups.set(key, { entries: [entry], latestEpoch: entry.epoch, firstIndex: index });
    }
  });

  return Array.from(groups.values())
    .sort((a, b) => b.latestEpoch - a.latestEpoch || a.firstIndex - b.firstIndex)
    .flatMap((group) =>
      group.entries.sort(
        (a, b) =>
          getRuntimeOrder(a.msg) - getRuntimeOrder(b.msg) ||
          a.epoch - b.epoch,
      ),
    );
}

function parseLogText(text: string): LogEntry[] {
  const trimmed = text.trim();

  if (!trimmed) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed);
    return parseJsonLogPayload(parsed);
  } catch {
    return parseLineLogText(text);
  }
}

export function parseFlexibleLogText(text: string): LogEntry[] {
  return parseLogText(text)
}

function parseJsonLogPayload(payload: unknown): LogEntry[] {
  if (Array.isArray(payload)) {
    const entries = payload.flatMap((item) => {
      if (typeof item === 'string') {
        return parseLineLogText(item);
      }

      if (!item || typeof item !== 'object') {
        return [];
      }

      const record = item as Record<string, unknown>;

      if (Array.isArray(record.logEvents)) {
        return parseCloudWatchExportJson({ logEvents: record.logEvents });
      }

      if (Array.isArray(record.records)) {
        return parseJsonLogPayload(record.records);
      }

      const timestamp = parseTimestampValue(
        record.timestamp ??
          record.time ??
          record['@timestamp'] ??
          record.date ??
          record.createdAt ??
          record.lastModified,
      );

      if (Object.keys(record).length === 0) {
        return [];
      }

      // Drop Firehose processing-failed records — they have no message and contain
      // errorCode + rawData from failed delivery attempts, not app logs
      if (typeof record.errorCode === 'string' && typeof record.rawData === 'string') {
        return [];
      }

      const epoch = timestamp ?? Date.now();
      return [parseMessage(epoch, JSON.stringify(record))];
    });

    return sortEntriesForTimeline(entries.filter(e => !isBinaryCorrupted(e.msg)));
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error('Not a CloudWatch log export file');
  }

  const record = payload as Record<string, unknown>;

  if (Array.isArray(record.logEvents)) {
    return parseCloudWatchExportJson(record);
  }

  if (Array.isArray(record.records)) {
    return parseJsonLogPayload(record.records);
  }

  if (typeof record.message === 'string' || typeof record.msg === 'string') {
    const epoch = parseTimestampValue(
      record.timestamp ?? record.time ?? record['@timestamp'] ?? record.date ?? record.createdAt,
    ) ?? Date.now();

    return [parseMessage(epoch, JSON.stringify(record))];
  }

  if (typeof record.body === 'string' || typeof record.content === 'string') {
    return parseLogText(String(record.body ?? record.content));
  }

  throw new Error('Not a CloudWatch log export file');
}

function parseLineLogText(text: string): LogEntry[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return [];
  }

  const entries: LogEntry[] = [];

  for (const line of lines) {
    const jsonTimestampMatch = line.match(
      /^(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:[,.]\d{3,6})?(?:Z|[+-]\d{2}:?\d{2})?)\s*(.*)$/,
    );

    if (jsonTimestampMatch) {
      const epoch = parseTimestampValue(jsonTimestampMatch[1]) ?? Date.now();
      entries.push(parseMessage(epoch, jsonTimestampMatch[2] || line));
      continue;
    }

    try {
      const parsedLine = JSON.parse(line) as unknown;

      if (parsedLine && typeof parsedLine === 'object') {
        const record = parsedLine as Record<string, unknown>;
        const epoch = parseTimestampValue(
          record.timestamp ?? record.time ?? record['@timestamp'] ?? record.date ?? record.createdAt,
        ) ?? Date.now();
        entries.push(parseMessage(epoch, JSON.stringify(record)));
        continue;
      }
    } catch {
      // fall through to raw line parsing
    }

    entries.push(parseMessage(Date.now(), line));
  }

  return sortEntriesForTimeline(entries.filter(e => !isBinaryCorrupted(e.msg)));
}

// ── GZ (CloudWatch S3 export) Parsing ─────────

export async function parseGZ(buffer: ArrayBuffer): Promise<LogEntry[]> {
  // Decompress using native browser DecompressionStream
  const ds = new DecompressionStream('gzip');
  const writer = ds.writable.getWriter();
  writer.write(buffer);
  writer.close();

  const reader = ds.readable.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  const total = chunks.reduce((n, c) => n + c.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  const text = new TextDecoder().decode(merged);
  return parseFlexibleLogText(text);
}

export function parseCloudWatchExportJson(json: unknown): LogEntry[] {
  if (!json || typeof json !== 'object') {
    throw new Error('Not a CloudWatch log export file')
  }

  const record = json as Record<string, unknown>

  if (!Array.isArray(record.logEvents)) {
    throw new Error('Not a CloudWatch log export file')
  }

  const entries: LogEntry[] = record.logEvents.map((event) => {
    const logEvent = event as Record<string, unknown>
    const epoch = parseTimestampValue(logEvent.timestamp) ?? Date.now()
    const message = String(logEvent.message ?? logEvent.msg ?? '')
    return parseMessage(epoch, message)
  })

  return sortEntriesForTimeline(entries.filter(e => !isBinaryCorrupted(e.msg)))
}

// ── CSV Parsing ────────────────────────────────

function parseMessage(epochMs: number, rawMsg: string): LogEntry {
  const msg = (rawMsg || '').replace(/\n+$/, '').trimEnd();
  const stripped = msg.trim();

  // 1) JSON structured app log
  if (stripped.startsWith('{') && stripped.endsWith('}')) {
    try {
      const obj = JSON.parse(stripped) as Record<string, unknown>;
      let ts = String(obj.timestamp || epochToTs(epochMs));
      ts = ts.replace('+0000', '').trim();
      const level = String(obj.level || 'INFO').toUpperCase() as LogLevel;
      const logger = String(obj.function || obj.logger || 'lambda_function');
      const metadata: Record<string, unknown> | undefined =
        obj.metadata && typeof obj.metadata === 'object' ? (obj.metadata as Record<string, unknown>) : undefined;
      const requestId = obj.requestId;
      const requestid = obj.requestid;
      const msgText = typeof obj.message === 'string'
        ? obj.message
        : typeof obj.msg === 'string'
          ? obj.msg
          : String(obj.text ?? obj.body ?? '');
      const resolvedRequestId: string | undefined =
        typeof requestId === 'string' ? requestId :
        typeof requestid === 'string' ? requestid : undefined;
      const extraFields = { ...obj };
      delete extraFields.timestamp;
      delete extraFields.level;
      delete extraFields['function'];
      delete extraFields.logger;
      delete extraFields.message;
      delete extraFields.msg;
      delete extraFields.metadata;
      delete extraFields.requestId;
      delete extraFields.requestid;
      return {
        epoch: epochMs, ts, logger,
        level: LEVEL_ORDER[level] !== undefined ? level : 'INFO',
        msg: msgText,
        extra: Object.keys(extraFields).length > 0 ? JSON.stringify(extraFields, null, 2) : '',
        requestId: resolvedRequestId,
        metadata,
      };
    } catch { /* fall through */ }
  }

  // 2) Classic python logger line
  const m = stripped.match(LINE_RE);
  if (m) {
    return {
      epoch: epochMs, ts: m[1], logger: m[2],
      level: m[3] as LogLevel, msg: m[4], extra: '',
    };
  }

  // 3) Lambda runtime / plain line
  const { level, logger } = inferLevel(stripped);
  return {
    epoch: epochMs, ts: epochToTs(epochMs),
    logger: logger || 'lambda.runtime', level,
    msg: stripped, extra: '',
    requestId: stripped.match(LAMBDA_REQUEST_RE)?.[1],
  };
}

export function parseCSV(text: string): LogEntry[] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          currentField += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        currentField += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        currentRow.push(currentField);
        currentField = '';
      } else if (ch === '\n' || (ch === '\r' && text[i + 1] === '\n')) {
        if (ch === '\r') i++; // skip \n
        currentRow.push(currentField);
        if (currentRow.length > 0 && currentRow.some(f => f.trim().length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
      } else {
        currentField += ch;
      }
    }
  }
  
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField);
    if (currentRow.some(f => f.trim().length > 0)) {
      rows.push(currentRow);
    }
  }

  if (rows.length < 2) return [];

  const headerFields = rows[0];
  const colMap: Record<string, number> = {};
  headerFields.forEach((h, i) => { colMap[h.trim().toLowerCase()] = i; });

  const tsIdx = colMap['timestamp'] ?? colMap['@timestamp'] ?? colMap['time'] ?? colMap['date'] ?? 0;
  const msgIdx = colMap['message'] ?? colMap['@message'] ?? colMap['log'] ?? headerFields.length - 1;

  const entries: LogEntry[] = [];

  for (let i = 1; i < rows.length; i++) {
    const fields = rows[i];
    if (fields.length < 2) continue;
    let epoch = parseInt(fields[tsIdx], 10);
    // If it parsed to a tiny number (like 2023 or 2026), it's a date string starting with a year
    if (isNaN(epoch) || epoch < 10000000000) {
      // Replace comma with dot for ms parsing, common in AWS logs
      const parsedDate = Date.parse(fields[tsIdx].replace(',', '.'));
      if (!isNaN(parsedDate)) {
        epoch = parsedDate;
      } else {
        continue;
      }
    }
    entries.push(parseMessage(epoch, fields[msgIdx] || ''));
  }

  return sortEntriesForTimeline(entries);
}

// ── Filtering ──────────────────────────────────

function compileSearch(s: string): RegExp | null {
  if (!s) return null;
  try {
    return new RegExp(s, 'i');
  } catch {
    return new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  }
}

export function filterEntries(entries: LogEntry[], filters: FilterState): LogEntry[] {
  if (!entries.length) return [];

  const now = Date.now();
  const windowMin = filters.window === 'custom' ? 0 : WINDOW_MINUTES[filters.window];
  const customFromBounds = filters.window === 'custom' ? parseLocalDateBounds(filters.customFromDate) : null;
  const customToBounds = filters.window === 'custom' ? parseLocalDateBounds(filters.customToDate) : null;
  const cutoff = windowMin > 0 ? now - windowMin * 60 * 1000 : 0;
  const minLvl = LEVEL_ORDER[filters.minLevel] ?? 20;
  const re = compileSearch(filters.search);

  return entries.filter(e => {
    if (customFromBounds && e.epoch < customFromBounds.start) return false;
    if (customToBounds && e.epoch >= customToBounds.end) return false;
    if (cutoff && e.epoch < cutoff) return false;
    if ((LEVEL_ORDER[e.level] ?? 20) < minLvl) return false;
    if (re && !(re.test(e.logger) || re.test(e.msg) || (e.extra && re.test(e.extra)) || (e.requestId && re.test(e.requestId)))) return false;
    return true;
  });
}

export function countLevels(entries: LogEntry[]): LevelCounts {
  const counts: LevelCounts = { DEBUG: 0, INFO: 0, WARNING: 0, ERROR: 0, CRITICAL: 0 };
  for (const e of entries) {
    if (counts[e.level] !== undefined) counts[e.level]++;
  }
  return counts;
}


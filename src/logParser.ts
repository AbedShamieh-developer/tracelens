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
  const json = JSON.parse(text);

  // CloudWatch S3 export format: { logEvents: [{ timestamp, message }] }
  if (!json.logEvents || !Array.isArray(json.logEvents)) {
    throw new Error('Not a CloudWatch log export file');
  }

  const entries: LogEntry[] = json.logEvents.map(
    (ev: { timestamp: number; message: string }) =>
      parseMessage(ev.timestamp, ev.message)
  );

  entries.sort((a, b) => a.epoch - b.epoch);
  return entries;
}

// ── CSV Parsing ────────────────────────────────

function parseMessage(epochMs: number, rawMsg: string): LogEntry {
  const msg = (rawMsg || '').replace(/\n+$/, '').trimEnd();
  const stripped = msg.trim();

  // 1) JSON structured app log
  if (stripped.startsWith('{') && stripped.endsWith('}')) {
    try {
      const obj = JSON.parse(stripped);
      let ts = obj.timestamp || epochToTs(epochMs);
      ts = ts.replace('+0000', '').trim();
      const level = ((obj.level || 'INFO').toUpperCase()) as LogLevel;
      const logger = obj.function || obj.logger || 'lambda_function';
      const metadata: Record<string, unknown> | undefined =
        obj.metadata && typeof obj.metadata === 'object' ? obj.metadata : undefined;
      // Build the display message from remaining fields
      const { timestamp: _t, level: _l, function: _f, logger: _lg, message, metadata: _m, requestId, requestid, ...rest } = obj;
      const msgText = message || obj.msg || '';
      const resolvedRequestId: string | undefined =
        typeof requestId === 'string' ? requestId :
        typeof requestid === 'string' ? requestid : undefined;
      const extraFields = Object.keys(rest).length > 0 ? rest : undefined;
      return {
        epoch: epochMs, ts, logger,
        level: LEVEL_ORDER[level] !== undefined ? level : 'INFO',
        msg: msgText,
        extra: extraFields ? JSON.stringify(extraFields, null, 2) : '',
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

  entries.sort((a, b) => a.epoch - b.epoch);
  return entries;
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
  const windowMin = WINDOW_MINUTES[filters.window];
  const cutoff = windowMin > 0 ? now - windowMin * 60 * 1000 : 0;
  const minLvl = LEVEL_ORDER[filters.minLevel] ?? 20;
  const re = compileSearch(filters.search);

  return entries.filter(e => {
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

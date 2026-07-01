/* =============================================
   Types for the CloudWatch Log Viewer
   ============================================= */

export type LogLevel = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

export interface LogEntry {
  epoch: number;
  ts: string;
  logger: string;
  level: LogLevel;
  msg: string;
  extra: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
}

export interface LevelCounts {
  DEBUG: number;
  INFO: number;
  WARNING: number;
  ERROR: number;
  CRITICAL: number;
}

export type TimeWindow = '5m' | '15m' | '30m' | '1h' | '2h' | '3h' | '4h' | '5h' | '12h' | '1d' | 'all';
export type LineLimit = 100 | 250 | 500 | 1000 | 2500 | 5000 | 'all';

export interface FilterState {
  window: TimeWindow | 'custom';
  customFromDate: string;
  customToDate: string;
  lineLimit: LineLimit;
  minLevel: LogLevel;
  search: string;
}

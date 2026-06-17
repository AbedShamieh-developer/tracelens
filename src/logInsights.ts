/* =============================================
   Error Fingerprinting & Insights
   ============================================= */

import type { LogEntry, LogLevel } from './types'

export interface ErrorGroup {
  fingerprint: string   // normalized pattern
  pattern: string       // human-readable pattern
  count: number
  level: LogLevel       // highest severity in group
  firstSeen: number     // epoch
  lastSeen: number      // epoch
  examples: LogEntry[]  // up to 3 representative entries
}

// Strip dynamic tokens from a message to produce a stable pattern
function normalize(msg: string): string {
  return msg
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '?') // UUIDs
    .replace(/\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}[^\s,]*/g, '?')               // timestamps
    .replace(/\b\d+\.\d+\.\d+\.\d+\b/g, '?')                                          // IPs
    .replace(/https?:\/\/[^\s"')]+/g, '?')                                             // URLs
    .replace(/"[^"]{8,}"/g, '"?"')                                                     // long quoted strings
    .replace(/\b[0-9a-f]{16,}\b/gi, '?')                                               // hex IDs
    .replace(/\b\d+\b/g, '?')                                                          // bare numbers
    .replace(/\s+/g, ' ')
    .trim()
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  DEBUG: 10, INFO: 20, WARNING: 30, ERROR: 40, CRITICAL: 50,
}

function higherLevel(a: LogLevel, b: LogLevel): LogLevel {
  return LEVEL_ORDER[a] >= LEVEL_ORDER[b] ? a : b
}

export function buildInsights(entries: LogEntry[]): ErrorGroup[] {
  const map = new Map<string, ErrorGroup>()

  for (const entry of entries) {
    if (!entry.msg.trim()) continue

    const pattern = normalize(entry.msg)
    const existing = map.get(pattern)

    if (existing) {
      existing.count++
      existing.level = higherLevel(existing.level, entry.level)
      if (entry.epoch < existing.firstSeen) existing.firstSeen = entry.epoch
      if (entry.epoch > existing.lastSeen) existing.lastSeen = entry.epoch
      if (existing.examples.length < 3) existing.examples.push(entry)
    } else {
      map.set(pattern, {
        fingerprint: pattern,
        pattern,
        count: 1,
        level: entry.level,
        firstSeen: entry.epoch,
        lastSeen: entry.epoch,
        examples: [entry],
      })
    }
  }

  return Array.from(map.values()).sort((a, b) => b.count - a.count)
}

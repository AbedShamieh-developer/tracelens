import { useMemo, useState } from 'react'
import { buildInsights } from '../logInsights'
import type { LogEntry } from '../types'
import './InsightsView.css'

interface InsightsViewProps {
  entries: LogEntry[]
  onSelectGroup: (pattern: string) => void
}

const LEVEL_COLORS: Record<string, string> = {
  DEBUG:    'var(--level-debug)',
  INFO:     'var(--level-info)',
  WARNING:  'var(--level-warning)',
  ERROR:    'var(--level-error)',
  CRITICAL: 'var(--level-critical)',
}

const LEVEL_BG: Record<string, string> = {
  DEBUG:    'var(--level-debug-bg)',
  INFO:     'var(--level-info-bg)',
  WARNING:  'var(--level-warning-bg)',
  ERROR:    'var(--level-error-bg)',
  CRITICAL: 'var(--level-critical-bg)',
}

function formatTs(epoch: number) {
  return new Date(epoch).toISOString().replace('T', ' ').replace('Z', '').slice(0, 19)
}

export default function InsightsView({ entries, onSelectGroup }: InsightsViewProps) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const groups = useMemo(() => buildInsights(entries), [entries])
  const maxCount = groups[0]?.count ?? 1

  if (groups.length === 0) {
    return (
      <div className="insights__empty">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <circle cx="24" cy="24" r="18" stroke="currentColor" strokeWidth="1.5" opacity="0.3"/>
          <path d="M16 24H32M24 16V32" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.3"/>
        </svg>
        <p>No log entries to analyze</p>
      </div>
    )
  }

  return (
    <div className="insights">
      <div className="insights__header">
        <div className="insights__header-left">
          <span className="insights__title">Error Fingerprints</span>
          <span className="insights__subtitle">{groups.length} unique patterns · {entries.length.toLocaleString()} entries</span>
        </div>
        <span className="insights__hint">Click a pattern to filter the log table</span>
      </div>

      <div className="insights__list">
        {groups.map((group) => {
          const isOpen = expanded === group.fingerprint
          const barWidth = Math.max(4, (group.count / maxCount) * 100)
          const color = LEVEL_COLORS[group.level]
          const bg = LEVEL_BG[group.level]

          return (
            <div
              key={group.fingerprint}
              className={`insights__group ${isOpen ? 'insights__group--open' : ''}`}
              style={{ borderLeftColor: color }}
            >
              <div className="insights__group-main">
                {/* Bar + count */}
                <div className="insights__count-col">
                  <div className="insights__bar-wrap">
                    <div
                      className="insights__bar"
                      style={{ width: `${barWidth}%`, background: color }}
                    />
                  </div>
                  <span className="insights__count">{group.count.toLocaleString()}</span>
                </div>

                {/* Pattern */}
                <button
                  type="button"
                  className="insights__pattern"
                  onClick={() => onSelectGroup(group.pattern)}
                  title="Filter log table to this pattern"
                >
                  <span
                    className="insights__badge"
                    style={{ color, background: bg }}
                  >
                    {group.level}
                  </span>
                  <span className="insights__pattern-text">{group.pattern}</span>
                </button>

                {/* Time range + expand */}
                <div className="insights__meta">
                  <span className="insights__time">
                    {formatTs(group.lastSeen)}
                  </span>
                  <button
                    type="button"
                    className="insights__expand-btn"
                    onClick={() => setExpanded(isOpen ? null : group.fingerprint)}
                    aria-label={isOpen ? 'Collapse examples' : 'Show examples'}
                    title={isOpen ? 'Hide examples' : 'Show examples'}
                  >
                    <svg
                      width="12" height="12" viewBox="0 0 12 12" fill="none"
                      style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 200ms' }}
                    >
                      <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
              </div>

              {/* Examples */}
              {isOpen && (
                <div className="insights__examples">
                  <div className="insights__examples-label">examples</div>
                  {group.examples.map((ex, i) => (
                    <div key={i} className="insights__example">
                      <span className="insights__example-ts">{ex.ts}</span>
                      <span className="insights__example-msg">{ex.msg}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

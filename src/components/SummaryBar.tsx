import type { ReactElement } from 'react'
import type { LevelCounts } from '../types'
import { ALL_LEVELS } from '../logParser'
import './SummaryBar.css'

interface SummaryBarProps {
  filtered: number
  total: number
  counts: LevelCounts
  fileName: string
}

const LEVEL_ICONS: Record<string, ReactElement> = {
  DEBUG: (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="6" cy="6" r="1.5" fill="currentColor" />
    </svg>
  ),
  INFO: (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M6 5V8.5M6 3.5V3.51" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
  WARNING: (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M1.5 10L6 2L10.5 10H1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M6 6V7.5M6 9V9.01" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    </svg>
  ),
  ERROR: (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4 4L8 8M8 4L4 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
  CRITICAL: (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M6 1L11 6L6 11L1 6L6 1Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M6 4V7M6 8.5V8.51" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    </svg>
  ),
}

export default function SummaryBar({ filtered, total, counts, fileName }: SummaryBarProps) {
  return (
    <div className="summary-bar" id="summary-bar">
      <div className="summary-bar__left">
        <div className="summary-bar__file">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3 2H8L11 5V12H3V2Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
            <path d="M8 2V5H11" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
          </svg>
          <span className="summary-bar__filename">{fileName}</span>
        </div>
        <div className="summary-bar__count">
          Showing <strong>{filtered.toLocaleString()}</strong> of <span>{total.toLocaleString()}</span> entries
        </div>
      </div>

      <div className="summary-bar__levels">
        {ALL_LEVELS.map((lvl) => (
          <div key={lvl} className={`summary-bar__level summary-bar__level--${lvl.toLowerCase()}`}>
            {LEVEL_ICONS[lvl]}
            <span className="summary-bar__level-name">{lvl}</span>
            <strong className="summary-bar__level-count">{counts[lvl].toLocaleString()}</strong>
          </div>
        ))}
      </div>
    </div>
  )
}

import { useCallback, useState } from 'react'
import './BucketLogsView.css'
import type { LogFile } from '../api'

interface LogsListProps {
  logs: LogFile[]
  loading?: boolean
  error?: string | null
  onRetry?: () => void
}

function formatLastModified(value?: string) {
  if (!value) {
    return 'Unknown'
  }

  const parsed = new Date(value)

  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString()
}

function formatSize(bytes?: number) {
  if (typeof bytes !== 'number' || Number.isNaN(bytes)) {
    return 'Unknown'
  }

  if (bytes < 1024) {
    return `${bytes.toLocaleString()} B`
  }

  const units = ['KB', 'MB', 'GB', 'TB']
  let size = bytes / 1024
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }

  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unitIndex]}`
}

function shortenUrl(url: string) {
  try {
    const parsed = new URL(url)
    const pathname = parsed.pathname.length > 28 ? `${parsed.pathname.slice(0, 28)}…` : parsed.pathname
    return `${parsed.origin}${pathname}${parsed.search ? '…' : ''}`
  } catch {
    return url.length > 56 ? `${url.slice(0, 56)}…` : url
  }
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)

  const copy = useCallback(async () => {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }, [value])

  return (
    <button
      type="button"
      className={`bucket-view__copy-btn ${copied ? 'bucket-view__copy-btn--done' : ''}`}
      onClick={copy}
      aria-label={copied ? 'Copied' : 'Copy presigned URL'}
      title={copied ? 'Copied' : 'Copy URL'}
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

export default function LogsList({ logs, loading = false, error = null, onRetry }: LogsListProps) {
  if (loading) {
    return (
      <div className="bucket-view__state">
        <div className="bucket-view__spinner" />
        <p>Loading log files...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bucket-view__state bucket-view__state--error">
        <p>{error}</p>
        {onRetry && (
          <button type="button" className="bucket-view__refresh-btn" onClick={onRetry}>
            Retry
          </button>
        )}
      </div>
    )
  }

  if (logs.length === 0) {
    return (
      <div className="bucket-view__state">
        <p>No log files were returned for this client.</p>
      </div>
    )
  }

  return (
    <div className="bucket-view__table-shell">
      <table className="bucket-view__table">
        <thead>
          <tr>
            <th>Key</th>
            <th>Last modified</th>
            <th>Size</th>
            <th>Presigned URL</th>
            <th>Download</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={`${log.key}-${log.url}`}>
              <td>{log.key}</td>
              <td>{formatLastModified(log.lastModified)}</td>
              <td>{formatSize(log.size)}</td>
              <td>
                <div className="bucket-view__url-cell">
                  <a
                    className="bucket-view__url-link"
                    href={log.url}
                    target="_blank"
                    rel="noreferrer"
                    title={log.url}
                  >
                    {shortenUrl(log.url)}
                  </a>
                  <CopyButton value={log.url} />
                </div>
              </td>
              <td>
                <a
                  className="bucket-view__download-btn"
                  href={log.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Download
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

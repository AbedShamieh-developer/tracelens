import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchClients, fetchLogs } from '../api/logs'
import {
  countLevels,
  filterEntries,
  parseCloudWatchExportJson,
  parseFlexibleLogText,
  parseGZ,
} from '../logParser'
import type { FilterState, LogEntry } from '../types'
import FilterBar from './FilterBar'
import InsightsView from './InsightsView'
import LogTable from './LogTable'
import SummaryBar from './SummaryBar'
import './BucketLogsView.css'

const DEFAULT_FILTERS: FilterState = {
  window: 'all',
  customDate: '',
  minLevel: 'INFO',
  search: '',
}

const FALLBACK_CLIENTS = ['coimbra', 'yuma', 'dev']

interface BucketSource {
  key: string
  client?: string
  bucket?: string
  lastModified?: string
  size?: number
  url?: string
  content?: string
  body?: unknown
  entries?: unknown
}

interface BucketPayload {
  sources: BucketSource[]
  client?: string
  bucket?: string
  count?: number
}

function isGzipBuffer(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b
}

function pickString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  return undefined
}

function getLabel(source: BucketSource) {
  return source.key || source.url || 'S3 bucket logs'
}

function formatTenantLabel(client?: string, bucket?: string) {
  if (client && bucket) {
    return `${client} / ${bucket}`
  }

  return bucket || client || 'S3 bucket logs'
}

function normalizeBucketSources(payload: unknown): BucketPayload {
  if (payload && typeof payload === 'object' && 'logEvents' in payload) {
    return { sources: [{ key: 'S3 export', entries: payload }] }
  }

  const items = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object'
      ? ((payload as Record<string, unknown>).logs ??
        (payload as Record<string, unknown>).items ??
        (payload as Record<string, unknown>).objects ??
        (payload as Record<string, unknown>).files)
      : []

  if (!Array.isArray(items)) {
    return { sources: [] }
  }

  const payloadRecord = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : undefined
  const client = payloadRecord ? pickString(payloadRecord, ['client', 'tenant', 'tenantId']) : undefined
  const bucket = payloadRecord ? pickString(payloadRecord, ['bucket', 'bucketName', 'name']) : undefined
  const count = payloadRecord && typeof payloadRecord.count === 'number' ? payloadRecord.count : undefined

  const sources = items
    .map<BucketSource | null>((item) => {
      if (typeof item === 'string') {
        return item.startsWith('http')
          ? ({ key: item, url: item, client, bucket } as BucketSource)
          : ({ key: item, client, bucket } as BucketSource)
      }

      if (!item || typeof item !== 'object') {
        return null
      }

      const record = item as Record<string, unknown>
      const nested = record.data && typeof record.data === 'object' ? (record.data as Record<string, unknown>) : undefined

      const key =
        pickString(record, ['key', 'Key', 'name']) ??
        (nested ? pickString(nested, ['key', 'Key', 'name']) : undefined) ??
        pickString(record, ['url', 'presignedUrl', 'presigned_url', 'downloadUrl', 'download_url', 'signedUrl', 'signed_url']) ??
        (nested ? pickString(nested, ['url', 'presignedUrl', 'presigned_url', 'downloadUrl', 'download_url', 'signedUrl', 'signed_url']) : undefined) ??
        ''

      const url =
        pickString(record, ['url', 'presignedUrl', 'presigned_url', 'downloadUrl', 'download_url', 'signedUrl', 'signed_url']) ??
        (nested ? pickString(nested, ['url', 'presignedUrl', 'presigned_url', 'downloadUrl', 'download_url', 'signedUrl', 'signed_url']) : undefined)

      return {
        key,
        client: pickString(record, ['client', 'tenant', 'tenantId']) ?? client,
        bucket: pickString(record, ['bucket', 'bucketName', 'name']) ?? bucket,
        lastModified:
          pickString(record, ['lastModified', 'LastModified', 'last_modified']) ??
          (nested ? pickString(nested, ['lastModified', 'LastModified', 'last_modified']) : undefined),
        size:
          typeof record.size === 'number'
            ? record.size
            : typeof record.Size === 'number'
              ? record.Size
              : typeof record.size_bytes === 'number'
                ? record.size_bytes
                : nested && typeof nested.size === 'number'
                  ? nested.size
                  : nested && typeof nested.Size === 'number'
                    ? nested.Size
                    : nested && typeof nested.size_bytes === 'number'
                      ? nested.size_bytes
                      : typeof record.size === 'string'
                        ? Number(record.size)
                        : undefined,
        url,
        content:
          typeof record.content === 'string'
            ? record.content
            : typeof record.body === 'string'
              ? record.body
              : nested && typeof nested.content === 'string'
                ? nested.content
                : nested && typeof nested.body === 'string'
                  ? nested.body
                  : undefined,
        body: record.body ?? nested?.body,
        entries: record.entries ?? record.logEntries ?? nested?.entries ?? nested?.logEntries,
      } as BucketSource
    })
    .filter((item): item is BucketSource => Boolean(item && (item.key || item.url || item.content || item.entries || item.body)))

  return { sources, client, bucket, count }
}

function isLogEntry(value: unknown): value is LogEntry {
  if (!value || typeof value !== 'object') {
    return false
  }

  const record = value as Partial<LogEntry>
  return (
    typeof record.epoch === 'number' &&
    typeof record.ts === 'string' &&
    typeof record.logger === 'string' &&
    typeof record.level === 'string' &&
    typeof record.msg === 'string' &&
    typeof record.extra === 'string'
  )
}

function extractErrorMessage(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason)
}

function formatDownloadHint(url?: string) {
  if (!url) {
    return ''
  }

  try {
    const { origin } = new URL(window.location.href)
    return ` The browser tried to read ${new URL(url).origin} from ${origin}, which usually means the S3 bucket needs a CORS rule allowing this site, or the download must be proxied through your backend.`
  } catch {
    return ' The browser could not read the S3 object directly, which usually means the bucket needs a CORS rule or the download must be proxied through your backend.'
  }
}

async function parseSource(source: BucketSource, signal: AbortSignal): Promise<LogEntry[]> {
  if (source.entries) {
    if (Array.isArray(source.entries) && source.entries.every(isLogEntry)) {
      return source.entries
    }

    if (typeof source.entries === 'object') {
      return parseCloudWatchExportJson(source.entries)
    }
  }

  if (source.content) {
    return parseFlexibleLogText(source.content)
  }

  if (source.body) {
    if (typeof source.body === 'string') {
      return parseFlexibleLogText(source.body)
    }

    if (Array.isArray(source.body) && source.body.every(isLogEntry)) {
      return source.body
    }

    if (typeof source.body === 'object') {
      return parseCloudWatchExportJson(source.body)
    }
  }

  if (!source.url) {
    throw new Error(`No downloadable content returned for ${getLabel(source)}.`)
  }

  const response = await fetch(source.url, {
    signal,
    headers: {},
  })
  const downloadUrl = source.url

  if (!response.ok) {
    throw new Error(`Failed to download ${getLabel(source)} (${response.status})${formatDownloadHint(downloadUrl)}`)
  }

  const label = source.key || source.url
  const buffer = await response.arrayBuffer()

  if (label.toLowerCase().endsWith('.gz') || isGzipBuffer(buffer)) {
    try {
      return await parseGZ(buffer)
    } catch (gzipError) {
      const fallbackText = new TextDecoder().decode(buffer)

      try {
        return parseFlexibleLogText(fallbackText)
      } catch (textError) {
        if (textError instanceof Error) {
          textError.message = `Failed to parse ${label} as gzip (${extractErrorMessage(gzipError)}) or text (${textError.message})`
        }

        throw textError
      }
    }
  }

  const text = new TextDecoder().decode(buffer)

  try {
    return parseFlexibleLogText(text)
  } catch (textError) {
    throw new Error(`Failed to parse ${label} (${extractErrorMessage(textError)})`, { cause: textError })
  }
}

function formatSourceLabel(sources: BucketSource[], client?: string, bucket?: string) {
  if (bucket || client) {
    return formatTenantLabel(client, bucket)
  }

  if (sources.length === 0) {
    return 'S3 bucket logs'
  }

  if (sources.length === 1) {
    return getLabel(sources[0])
  }

  return `${sources.length.toLocaleString()} S3 objects`
}

export default function BucketLogsView() {
  const [sources, setSources] = useState<BucketSource[]>([])
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [deliveryFailures, setDeliveryFailures] = useState<LogEntry[]>([])
  const [failuresOpen, setFailuresOpen] = useState(false)
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [downloadedCount, setDownloadedCount] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)
  const [viewTab, setViewTab] = useState<'logs' | 'insights'>('logs')
  const [clients, setClients] = useState<string[]>(FALLBACK_CLIENTS)
  const [selectedClient, setSelectedClient] = useState('coimbra')
  const [bucketName, setBucketName] = useState<string>('')
  const [clientsLoading, setClientsLoading] = useState(true)
  const [clientMenuOpen, setClientMenuOpen] = useState(false)
  const clientMenuRef = useRef<HTMLDivElement>(null)

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), [])

  useEffect(() => {
    const controller = new AbortController()
    let active = true

    async function loadClients() {
      if (active) {
        setClientsLoading(true)
      }

      try {
        const remoteClients = await fetchClients(controller.signal)
        if (!active) {
          return
        }

        const nextClients = Array.from(new Set(remoteClients.length > 0 ? remoteClients : FALLBACK_CLIENTS))
        setClients(nextClients)
        setSelectedClient((current) => (nextClients.includes(current) ? current : nextClients[0] ?? ''))
      } catch {
        if (!active) {
          return
        }

        setClients(FALLBACK_CLIENTS)
        setSelectedClient((current) => (FALLBACK_CLIENTS.includes(current) ? current : FALLBACK_CLIENTS[0]))
      } finally {
        if (active) {
          setClientsLoading(false)
        }
      }
    }

    loadClients()

    return () => {
      active = false
      controller.abort()
    }
  }, [])

  useEffect(() => {
    function onDocumentPointerDown(event: PointerEvent) {
      if (!clientMenuRef.current?.contains(event.target as Node)) {
        setClientMenuOpen(false)
      }
    }

    function onDocumentKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setClientMenuOpen(false)
      }
    }

    document.addEventListener('pointerdown', onDocumentPointerDown)
    document.addEventListener('keydown', onDocumentKeyDown)

    return () => {
      document.removeEventListener('pointerdown', onDocumentPointerDown)
      document.removeEventListener('keydown', onDocumentKeyDown)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    let active = true

    async function loadBucketLogs() {
      if (!selectedClient) {
        return
      }

      if (active) {
        setLoading(true)
        setError(null)
        setNote(null)
        setDownloadedCount(0)
        setTotalCount(0)
      }

      try {
        const payload = await fetchLogs(selectedClient, controller.signal)
        const nextPayload = normalizeBucketSources(payload)
        const nextSources = nextPayload.sources

        if (!nextSources.length) {
          throw new Error('No S3 objects were returned by the API')
        }

        const nextBucket = nextPayload.bucket ?? ''
        const nextObjectCount = nextPayload.count ?? nextSources.length

        if (active) {
          setSources(nextSources)
          setTotalCount(nextObjectCount)
          setBucketName(nextBucket)
        }

        const results = await Promise.all(
          nextSources.map(async (source) => {
            try {
              const value = await parseSource(source, controller.signal)
              return { source, status: 'fulfilled' as const, value }
            } catch (reason) {
              return { source, status: 'rejected' as const, reason }
            } finally {
              if (active) {
                setDownloadedCount((current) => current + 1)
              }
            }
          }),
        )

        if (!active) {
          return
        }

        const nextEntries: LogEntry[] = []
        const nextFailures: LogEntry[] = []
        const failures: { label: string; reason: string }[] = []

        for (const result of results) {
          if (result.status === 'fulfilled') {
            for (const entry of result.value) {
              if (!entry.msg && entry.extra.includes('"errorCode"') && entry.extra.includes('"rawData"')) {
                nextFailures.push(entry)
              } else {
                nextEntries.push(entry)
              }
            }
          } else {
            failures.push({
              label: getLabel(result.source),
              reason: extractErrorMessage(result.reason),
            })
          }
        }

        nextEntries.sort((a, b) => b.epoch - a.epoch)
        nextFailures.sort((a, b) => b.epoch - a.epoch)
        setEntries(nextEntries)
        setDeliveryFailures(nextFailures)

        if (failures.length > 0 && nextEntries.length === 0) {
          const firstFailure = failures[0]
          setError(
            `Could not parse any logs from the bucket objects. First failure: ${firstFailure.label} (${firstFailure.reason}).`,
          )
        } else if (failures.length > 0) {
          setNote(`Skipped ${failures.length} object(s) that could not be parsed.`)
        } else {
          setNote(
            `Loaded ${nextEntries.length.toLocaleString()} log entries from ${nextObjectCount.toLocaleString()} objects in ${formatTenantLabel(nextPayload.client ?? selectedClient, nextBucket)}.`,
          )
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return
        }

        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to load bucket logs')
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    loadBucketLogs()

    return () => {
      active = false
      controller.abort()
    }
  }, [refreshKey, selectedClient])

  const filtered = useMemo(() => filterEntries(entries, filters), [entries, filters])
  const counts = useMemo(() => countLevels(filtered), [filtered])
  const fileName = formatSourceLabel(sources, selectedClient, bucketName)

  return (
    <section className="bucket-view">
      <div className="bucket-view__hero">
        <p className="app__eyebrow">S3 bucket mode</p>
        <h2 className="bucket-view__title">TraceLens object log viewer</h2>
        <p className="bucket-view__copy">
          This mode loads each tenant&apos;s S3 bucket, downloads the presigned .gz objects, and
          shows the same filters, summary, and log table as manual upload.
        </p>
      </div>

      <div className="bucket-view__controls-bar">
        <div className="bucket-view__controls-group">
          <span className="bucket-view__control-label">Client</span>
          <div className="bucket-view__client-picker-shell" ref={clientMenuRef}>
            <button
              type="button"
              className="bucket-view__client-trigger"
              onClick={() => setClientMenuOpen((open) => !open)}
              disabled={clientsLoading || loading}
              aria-haspopup="listbox"
              aria-expanded={clientMenuOpen}
            >
              <span className="bucket-view__client-trigger-value">{selectedClient || 'Choose client'}</span>
              <svg
                className={`bucket-view__client-trigger-icon ${clientMenuOpen ? 'bucket-view__client-trigger-icon--open' : ''}`}
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
              >
                <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {clientMenuOpen && (
              <div className="bucket-view__client-menu" role="listbox" aria-label="Choose client">
                {clients.map((client) => {
                  const active = client === selectedClient
                  return (
                    <button
                      key={client}
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={`bucket-view__client-option ${active ? 'bucket-view__client-option--active' : ''}`}
                      onClick={() => {
                        setSelectedClient(client)
                        setClientMenuOpen(false)
                      }}
                    >
                      <span className="bucket-view__client-option-name">{client}</span>
                      {active && (
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M2.5 6L4.8 8.3L9.5 3.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          className="bucket-view__refresh-btn"
          onClick={refresh}
          disabled={loading}
          aria-label="Refresh logs"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            style={{ animation: loading ? 'spin 0.8s linear infinite' : 'none' }}
          >
            <path d="M12 2.5A5.5 5.5 0 1 1 8.5 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M8.5 1.5V4.5H11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {loading ? 'Refreshing' : 'Refresh'}
        </button>
      </div>

      {!clientsLoading && clients.length > 0 && (
        <div className="bucket-view__meta">
          <span>Tenant: {selectedClient}</span>
          {bucketName && <span>Bucket: {bucketName}</span>}
          {totalCount > 0 && <span>Objects: {totalCount.toLocaleString()}</span>}
        </div>
      )}

      {loading ? (
        <div className="bucket-view__state">
          <div className="bucket-view__spinner" />
          <p>Loading logs from S3...</p>
          {totalCount > 0 && (
            <p className="bucket-view__progress">
              Downloaded {downloadedCount.toLocaleString()} of {totalCount.toLocaleString()} objects
            </p>
          )}
        </div>
      ) : error ? (
        <div className="bucket-view__state bucket-view__state--error">
          <p>{error}</p>
          <button type="button" className="bucket-view__refresh-btn" onClick={refresh}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M12 2.5A5.5 5.5 0 1 1 8.5 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M8.5 1.5V4.5H11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Retry
          </button>
        </div>
      ) : (
        <>
          {note && (
            <div className="bucket-view__note">
              <p>{note}</p>
            </div>
          )}
          <div className="app__viewer">
            <div className="app__view-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={viewTab === 'logs'}
                className={`app__view-tab ${viewTab === 'logs' ? 'app__view-tab--active' : ''}`}
                onClick={() => setViewTab('logs')}
              >
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <rect x="1" y="3" width="11" height="1.5" rx="0.75" fill="currentColor" opacity="0.7" />
                  <rect x="1" y="6" width="8" height="1.5" rx="0.75" fill="currentColor" opacity="0.7" />
                  <rect x="1" y="9" width="9" height="1.5" rx="0.75" fill="currentColor" opacity="0.7" />
                </svg>
                Logs
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={viewTab === 'insights'}
                className={`app__view-tab ${viewTab === 'insights' ? 'app__view-tab--active' : ''}`}
                onClick={() => setViewTab('insights')}
              >
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <path d="M2 10L5 6L7.5 8L10 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Insights
              </button>
            </div>

            {viewTab === 'logs' ? (
              <>
                <FilterBar filters={filters} onChange={setFilters} />
                <SummaryBar
                  filtered={filtered.length}
                  total={entries.length}
                  counts={counts}
                  fileName={fileName}
                />
                <LogTable entries={filtered} />
              </>
            ) : (
              <>
                <SummaryBar
                  filtered={filtered.length}
                  total={entries.length}
                  counts={counts}
                  fileName={fileName}
                />
                <InsightsView
                  entries={filtered.length < entries.length ? filtered : entries}
                  onSelectGroup={(pattern) => {
                    setFilters((f) => ({ ...f, search: pattern }))
                    setViewTab('logs')
                  }}
                />
              </>
            )}
          </div>

          {deliveryFailures.length > 0 && (
            <div className="bucket-view__failures">
              <button
                type="button"
                className="bucket-view__failures-toggle"
                onClick={() => setFailuresOpen((o) => !o)}
                aria-expanded={failuresOpen}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  style={{ transform: failuresOpen ? 'rotate(180deg)' : 'none', transition: 'transform 200ms' }}
                >
                  <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>Delivery failures</span>
                <span className="bucket-view__failures-count">{deliveryFailures.length}</span>
              </button>
              {failuresOpen && (
                <div className="bucket-view__failures-body">
                  <p className="bucket-view__failures-note">
                    These records failed Firehose delivery and contain no app log data.
                  </p>
                  <LogTable entries={deliveryFailures} />
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  )
}

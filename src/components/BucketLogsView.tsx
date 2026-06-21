import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { ApiError, fetchClients, fetchLogs } from '../api'
import {
  countLevels,
  filterEntries,
} from '../logParser'
import type { FilterState, LogEntry } from '../types'
import { createLogParsePool } from '../lib/logParsePool'
import ClientDropdown from './ClientDropdown'
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
  lastModified?: string
  size?: number
  url: string
}

const FETCH_CONCURRENCY = 10
const PARSE_WORKERS = Math.min(8, Math.max(4, navigator.hardwareConcurrency ?? 4))

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong'
}

function isUnauthorizedError(err: unknown) {
  return err instanceof ApiError && err.status === 401
}

function extractMessage(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason)
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

function normalizeBucketSources(payload: unknown): BucketSource[] {
  const items =
    Array.isArray(payload)
      ? payload
      : payload && typeof payload === 'object'
        ? ((payload as Record<string, unknown>).files ??
          (payload as Record<string, unknown>).logs ??
          (payload as Record<string, unknown>).items ??
          (payload as Record<string, unknown>).objects)
        : []

  if (!Array.isArray(items)) {
    return []
  }

  return items
    .map<BucketSource | null>((item) => {
      if (typeof item === 'string') {
        return item.trim() ? { key: item.trim(), url: item.trim() } : null
      }

      if (!item || typeof item !== 'object') {
        return null
      }

      const record = item as Record<string, unknown>
      const key =
        pickString(record, ['key', 'Key', 'name', 'fileName', 'filename']) ??
        pickString(record, ['url', 'presignedUrl', 'presigned_url', 'downloadUrl', 'download_url', 'signedUrl', 'signed_url']) ??
        ''

      const url =
        pickString(record, ['url', 'presignedUrl', 'presigned_url', 'downloadUrl', 'download_url', 'signedUrl', 'signed_url']) ??
        key

      if (!url) {
        return null
      }

      return {
        key: key || url,
        url,
        lastModified:
          pickString(record, ['lastModified', 'LastModified', 'last_modified']) ||
          pickString(record, ['modified', 'updatedAt']),
        size:
          typeof record.size === 'number'
            ? record.size
            : typeof record.Size === 'number'
              ? record.Size
              : typeof record.size_bytes === 'number'
                ? record.size_bytes
                : undefined,
      }
    })
    .filter((item): item is BucketSource => Boolean(item))
}

function formatSourceLabel(sources: BucketSource[], client?: string) {
  if (!client) {
    return 'S3 bucket logs'
  }

  if (sources.length === 0) {
    return `${client} bucket logs`
  }

  if (sources.length === 1) {
    return sources[0].key
  }

  return `${client} • ${sources.length.toLocaleString()} objects`
}

async function fetchObject(source: BucketSource, signal: AbortSignal): Promise<ArrayBuffer> {
  const response = await fetch(source.url, {
    signal,
    headers: {
      Accept: 'application/json,text/plain,*/*',
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to download ${source.key} (${response.status})`)
  }

  return await response.arrayBuffer()
}

async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
) {
  let nextIndex = 0
  const active = Math.max(1, Math.min(limit, items.length))

  const runners = Array.from({ length: active }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex
      nextIndex += 1

      const item = items[currentIndex]
      await worker(item, currentIndex)
    }
  })

  await Promise.all(runners)
}

export default function BucketLogsView() {
  const parserPoolRef = useRef<ReturnType<typeof createLogParsePool> | null>(null)

  useEffect(() => {
    parserPoolRef.current = createLogParsePool(PARSE_WORKERS)
    return () => {
      parserPoolRef.current?.destroy()
      parserPoolRef.current = null
    }
  }, [])

  const { isLoaded, isSignedIn, getToken } = useAuth()
  const [clients, setClients] = useState<string[]>([])
  const [selectedClient, setSelectedClient] = useState('')
  const [sources, setSources] = useState<BucketSource[]>([])
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [deliveryFailures, setDeliveryFailures] = useState<LogEntry[]>([])
  const [failuresOpen, setFailuresOpen] = useState(false)
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS)
  const [clientsLoading, setClientsLoading] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [refreshTick, setRefreshTick] = useState(0)
  const [downloadedCount, setDownloadedCount] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [viewTab, setViewTab] = useState<'logs' | 'insights'>('logs')
  const refresh = useCallback(() => setRefreshTick((value) => value + 1), [])

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      return
    }

    const controller = new AbortController()
    let active = true

    async function loadClients() {
      setClientsLoading(true)
      setError(null)

      try {
        const nextClients = await fetchClients(getToken, controller.signal)
        if (!active) {
          return
        }

        const deduped = Array.from(new Set(nextClients.length > 0 ? nextClients : FALLBACK_CLIENTS))
        setClients(deduped)
        setSelectedClient((current) => (current && deduped.includes(current) ? current : deduped[0] ?? ''))
      } catch (err) {
        if (!active || (err instanceof DOMException && err.name === 'AbortError')) {
          return
        }

        const fallback = Array.from(new Set(FALLBACK_CLIENTS))
        setClients(fallback)
        setSelectedClient(fallback[0] ?? '')
        setError(
          isUnauthorizedError(err)
            ? 'Authorization failed. Your Clerk token was not accepted by the backend.'
            : getErrorMessage(err),
        )
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
  }, [getToken, isLoaded, isSignedIn])

  useEffect(() => {
    if (!selectedClient || !isLoaded || !isSignedIn) {
      return
    }

    const controller = new AbortController()
    let active = true

    async function loadBucketLogs() {
      setLoading(true)
      setError(null)
      setNote(null)
      setDownloadedCount(0)
      setTotalCount(0)
      setSources([])
      setEntries([])
      setDeliveryFailures([])

      try {
        const payload = await fetchLogs(selectedClient, getToken, controller.signal)
        if (!active) {
          return
        }

        const nextSources = normalizeBucketSources(payload)
        if (!nextSources.length) {
          throw new Error('No presigned objects were returned by the API')
        }

        setSources(nextSources)
        setTotalCount(nextSources.length)
        const failures: { source: BucketSource; reason: string }[] = []
        let parsedEntries = 0

        const allEntries: LogEntry[] = []
        const allFailures: LogEntry[] = []

        await mapWithConcurrency(nextSources, FETCH_CONCURRENCY, async (source) => {
          try {
            const buffer = await fetchObject(source, controller.signal)
            const parsed = await parserPoolRef.current!.parse(source.key, buffer)
            const entriesChunk: LogEntry[] = []
            const failuresChunk: LogEntry[] = []

            for (const entry of parsed) {
              if (!entry.msg && entry.extra.includes('"errorCode"') && entry.extra.includes('"rawData"')) {
                failuresChunk.push(entry)
              } else {
                entriesChunk.push({ ...entry, extra: '' })
              }
            }

            parsedEntries += entriesChunk.length
            allEntries.push(...entriesChunk)
            allFailures.push(...failuresChunk)

            if (!active) {
              return
            }

            startTransition(() => {
              setDownloadedCount((current) => current + 1)
            })
          } catch (reason) {
            failures.push({ source, reason: extractMessage(reason) })
            if (active) {
              setDownloadedCount((current) => current + 1)
            }
          }
        })

        if (!active) {
          return
        }

        startTransition(() => {
          setEntries(allEntries.sort((a, b) => b.epoch - a.epoch))
          setDeliveryFailures(allFailures.sort((a, b) => b.epoch - a.epoch))
        })

        if (failures.length > 0 && parsedEntries === 0) {
          const firstFailure = failures[0]
          throw new Error(`Could not parse any logs from ${firstFailure.source.key}: ${firstFailure.reason}`)
        }

        if (failures.length > 0) {
          setNote(`Skipped ${failures.length} object(s) that could not be parsed.`)
        } else {
          setNote(
            `Loaded ${parsedEntries.toLocaleString()} log entries from ${nextSources.length.toLocaleString()} object(s) in ${selectedClient}.`,
          )
        }
      } catch (err) {
        if (!active || (err instanceof DOMException && err.name === 'AbortError')) {
          return
        }

        setEntries([])
        setDeliveryFailures([])
        setError(
          isUnauthorizedError(err)
            ? 'Authorization failed. Your Clerk token was not accepted by the backend.'
            : getErrorMessage(err),
        )
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
  }, [getToken, isLoaded, isSignedIn, refreshTick, selectedClient])

  const filtered = useMemo(() => filterEntries(entries, filters), [entries, filters])
  const counts = useMemo(() => countLevels(filtered), [filtered])
  const fileName = formatSourceLabel(sources, selectedClient)

  return (
    <section className="bucket-view">
      <div className="bucket-view__hero">
        <p className="app__eyebrow">S3 bucket mode</p>
        <h2 className="bucket-view__title">TraceLens object log viewer</h2>
        <p className="bucket-view__copy">
          This mode downloads each presigned .gz object, decompresses it, and renders the same parsed log experience as upload mode.
        </p>
      </div>

      <div className="bucket-view__controls-bar">
        <button
          type="button"
          className="bucket-view__refresh-btn"
          onClick={refresh}
          disabled={clientsLoading || loading}
        >
          <svg
            className={`bucket-view__refresh-btn-icon ${loading ? 'bucket-view__refresh-btn-icon--spinning' : ''}`}
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M12 3.25A5.25 5.25 0 1 0 11 9.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <path
              d="M8.75 2.5H12V5.75"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>{loading ? 'Refreshing' : 'Refresh logs'}</span>
        </button>

        <ClientDropdown
          clients={clients}
          selectedClient={selectedClient}
          loading={clientsLoading}
          onChange={setSelectedClient}
        />
      </div>

      {!clientsLoading && selectedClient && (
        <div className="bucket-view__meta">
          <span>Tenant: {selectedClient}</span>
          {totalCount > 0 && <span>Objects: {totalCount.toLocaleString()}</span>}
          {loading && totalCount > 0 && (
            <span>
              Downloaded {downloadedCount.toLocaleString()} of {totalCount.toLocaleString()}
            </span>
          )}
        </div>
      )}

      {error ? (
        <div className="bucket-view__state bucket-view__state--error">
          <p>{error}</p>
          <button type="button" className="bucket-view__refresh-btn" onClick={refresh}>
            Retry
          </button>
        </div>
      ) : loading ? (
        <div className="bucket-view__state">
          <div className="bucket-view__spinner" />
          <p>Loading and parsing presigned log objects...</p>
          {totalCount > 0 && (
            <p className="bucket-view__progress">
              Downloaded {downloadedCount.toLocaleString()} of {totalCount.toLocaleString()} objects
            </p>
          )}
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
                    setFilters((current) => ({ ...current, search: pattern }))
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
                onClick={() => setFailuresOpen((value) => !value)}
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
                    These records failed Firehose delivery and do not contain app log data.
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

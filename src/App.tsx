import { useState, useMemo, useCallback } from 'react'
import { useAuth } from 'react-oidc-context'
import DropZone from './components/DropZone'
import FilterBar from './components/FilterBar'
import SummaryBar from './components/SummaryBar'
import LogTable from './components/LogTable'
import UserGuide from './components/UserGuide'
import BucketLogsView from './components/BucketLogsView'
import InsightsView from './components/InsightsView'
import { filterEntries, countLevels } from './logParser'
import type { LogEntry, FilterState } from './types'
import './App.css'

const DEFAULT_FILTERS: FilterState = {
  window: 'all',
  customFromDate: '',
  customToDate: '',
  lineLimit: 500,
  minLevel: 'INFO',
  search: '',
}

type AppMode = 'upload' | 'bucket'

type CognitoUser = ReturnType<typeof useAuth>['user']

function getAppBaseUrl() {
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:5174/'
  }

  return `${window.location.origin}/`
}

function getDisplayName(user: CognitoUser) {
  if (!user) {
    return 'there'
  }

  const profile = user.profile
  const name = profile.given_name?.trim() || profile.name?.trim()

  if (name) {
    return name.split(/\s+/)[0]
  }

  const fallbackName = (
    profile.preferred_username?.trim() ||
    profile.email?.split('@')[0]?.trim() ||
    ''
  )
    .replace(/\d+$/, '')
    .replace(/^abdulrahmanshamieh$/i, 'abdulrahman')
    .split(/[._-]+/)[0]

  return fallbackName || 'there'
}

function LoadingState() {
  return (
    <div className="app__loading-shell">
      <div className="app__loading-card">
        <div className="app__loading-ring" />
        <p className="app__eyebrow">Loading secure session</p>
        <h2 className="app__loading-title">Checking access</h2>
        <p className="app__loading-copy">
          We are verifying your Cognito session before opening MDU TraceLens.
        </p>
      </div>
    </div>
  )
}

function SignedOutState({ onSignIn }: { onSignIn: () => void }) {
  return (
    <section className="app__access-screen">
      <div className="app__access-card">
        <p className="app__eyebrow">Secure workspace</p>
        <h2 className="app__access-title">Sign in to open MDU TraceLens</h2>
        <p className="app__access-copy">
          The log viewer stays locked until you authenticate with the MDU workspace.
        </p>
        <div className="app__access-actions">
          <button type="button" className="app__auth-btn app__auth-btn--primary" onClick={onSignIn}>
            Sign in
          </button>
        </div>
        <p className="app__access-note">Authentication is handled through the MDU Cognito workspace.</p>
      </div>
    </section>
  )
}

export default function App() {
  const [allEntries, setAllEntries] = useState<LogEntry[]>([])
  const [fileName, setFileName] = useState('')
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS)
  const [mode, setMode] = useState<AppMode>('upload')
  const [viewTab, setViewTab] = useState<'logs' | 'insights'>('logs')
  const [focusedEntry, setFocusedEntry] = useState<{ entry: LogEntry; token: number } | null>(null)
  const auth = useAuth()

  const handleSignIn = useCallback(() => {
    void auth.signinRedirect({ redirect_uri: getAppBaseUrl() })
  }, [auth])

  const handleSignOut = useCallback(async () => {
    const clientId = '4570btirsf7kejc3fjkbb6f9jc'
    const logoutUri = getAppBaseUrl()
    const cognitoDomain = 'https://eu-central-1umr2kprl8.auth.eu-central-1.amazoncognito.com'

    await auth.removeUser()

    const logoutUrl =
      `${cognitoDomain}/logout` +
      `?client_id=${encodeURIComponent(clientId)}` +
      `&logout_uri=${encodeURIComponent(logoutUri)}`

    window.location.assign(logoutUrl)
  }, [auth])

  const handleFileParsed = useCallback((entries: LogEntry[], name: string) => {
    setAllEntries(entries)
    setFileName(name)
    setFocusedEntry(null)
  }, [])

  const handleNewFile = useCallback(() => {
    setAllEntries([])
    setFileName('')
    setFilters(DEFAULT_FILTERS)
    setViewTab('logs')
    setFocusedEntry(null)
  }, [])

  const handleOpenEntryInFullLog = useCallback((entry: LogEntry) => {
    setViewTab('logs')
    setFilters((current) => ({
      ...current,
      window: 'all',
      customFromDate: '',
      customToDate: '',
      lineLimit: 'all',
      minLevel: 'DEBUG',
      search: '',
    }))
    setFocusedEntry((current) => ({ entry, token: (current?.token ?? 0) + 1 }))
  }, [])

  const filtered = useMemo(() => filterEntries(allEntries, filters), [allEntries, filters])
  const counts = useMemo(() => countLevels(filtered), [filtered])
  const hasData = allEntries.length > 0
  const displayName = getDisplayName(auth.user)
  const isSignedIn = auth.isAuthenticated
  const canUsePlatform = Boolean(isSignedIn)
  const isUploadMode = mode === 'upload'

  return (
    <div className="app">
      <div className="app__ambient app__ambient--1" />
      <div className="app__ambient app__ambient--2" />

      <header className="app__header" id="app-header">
        <div className="app__header-left">
          <div className="app__logo">
            <img src="/mdu-tracelens-logo.png" alt="MDU TraceLens" className="app__logo-img" />
          </div>
          <div className="app__title-group">
            <h1 className="app__title">
              MDU <span className="app__title-accent">TraceLens</span>
            </h1>
            <p className="app__subtitle">CloudWatch Log Analysis</p>
          </div>
        </div>

        {canUsePlatform && (
          <div className="app__mode-switch" role="tablist" aria-label="TraceLens mode">
            <button
              type="button"
              role="tab"
              aria-selected={isUploadMode}
              className={`app__mode-button ${isUploadMode ? 'app__mode-button--active' : ''}`}
              onClick={() => setMode('upload')}
            >
              Upload mode
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={!isUploadMode}
              className={`app__mode-button ${!isUploadMode ? 'app__mode-button--active' : ''}`}
              onClick={() => setMode('bucket')}
            >
              S3 bucket mode
            </button>
            {isUploadMode && hasData && (
              <button
                id="new-file-button"
                className="app__new-file-btn"
                onClick={handleNewFile}
                type="button"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path
                    d="M7 1V13M1 7H13"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
                New File
              </button>
            )}
          </div>
        )}

        <div className="app__header-right">
          {!isSignedIn && (
            <div className="app__auth-actions">
              <button type="button" className="app__auth-btn app__auth-btn--primary" onClick={handleSignIn}>
                Sign in
              </button>
            </div>
          )}
          {isSignedIn && (
            <div className="app__user-area">
              <span className="app__status-pill app__status-pill--welcome">
                Welcome {displayName}
              </span>
              <button type="button" className="app__auth-btn app__auth-btn--secondary" onClick={handleSignOut}>
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="app__main">
        {auth.isLoading ? (
          <LoadingState />
        ) : auth.error ? (
          <section className="app__access-screen">
            <div className="app__access-card app__access-card--pending">
              <p className="app__eyebrow">Authentication error</p>
              <h2 className="app__access-title">We could not open your session</h2>
              <p className="app__access-copy">{auth.error.message}</p>
              <div className="app__access-actions">
                <button type="button" className="app__auth-btn app__auth-btn--primary" onClick={handleSignIn}>
                  Try again
                </button>
              </div>
            </div>
          </section>
        ) : !isSignedIn ? (
          <SignedOutState onSignIn={handleSignIn} />
        ) : isUploadMode ? !hasData ? (
          <>
            <DropZone onFileParsed={handleFileParsed} />
            <UserGuide />
          </>
        ) : (
          <div className="app__viewer">
            <div className="app__view-tabs" role="tablist">
              <button
                type="button" role="tab"
                aria-selected={viewTab === 'logs'}
                className={`app__view-tab ${viewTab === 'logs' ? 'app__view-tab--active' : ''}`}
                onClick={() => setViewTab('logs')}
              >
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <rect x="1" y="3" width="11" height="1.5" rx="0.75" fill="currentColor" opacity="0.7"/>
                  <rect x="1" y="6" width="8" height="1.5" rx="0.75" fill="currentColor" opacity="0.7"/>
                  <rect x="1" y="9" width="9" height="1.5" rx="0.75" fill="currentColor" opacity="0.7"/>
                </svg>
                Logs
              </button>
              <button
                type="button" role="tab"
                aria-selected={viewTab === 'insights'}
                className={`app__view-tab ${viewTab === 'insights' ? 'app__view-tab--active' : ''}`}
                onClick={() => setViewTab('insights')}
              >
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <path d="M2 10L5 6L7.5 8L10 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Insights
              </button>
            </div>

            {viewTab === 'logs' ? (
              <>
                <FilterBar filters={filters} onChange={setFilters} />
                <SummaryBar
                  filtered={filtered.length}
                  total={allEntries.length}
                  counts={counts}
                  fileName={fileName}
                />
                <LogTable
                  entries={filtered}
                  sourceEntries={allEntries}
                  displayLimit={filters.lineLimit}
                  fileName={fileName}
                  analyzerName={displayName}
                  focusedEntry={focusedEntry?.entry}
                  focusToken={focusedEntry?.token ?? 0}
                  onOpenInFullLog={handleOpenEntryInFullLog}
                />
              </>
            ) : (
              <>
                <SummaryBar
                  filtered={filtered.length}
                  total={allEntries.length}
                  counts={counts}
                  fileName={fileName}
                />
                <InsightsView
                  entries={filtered.length < allEntries.length ? filtered : allEntries}
                  onSelectGroup={(pattern) => {
                    setFilters(f => ({ ...f, search: pattern }))
                    setViewTab('logs')
                  }}
                />
              </>
            )}
          </div>
        ) : (
          <BucketLogsView analyzerName={displayName} />
        )}
      </main>

      <footer className="app__footer">
        <span>MDU</span>
        <span className="app__footer-dot">|</span>
        <span>MDU TraceLens v2.1.1</span>
      </footer>
    </div>
  )
}

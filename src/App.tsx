import { useState, useMemo, useCallback } from 'react'
import { ClerkLoading, SignInButton, SignOutButton, SignUpButton, UserButton, useUser } from '@clerk/clerk-react'
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
  minLevel: 'INFO',
  search: '',
}

type AppMode = 'upload' | 'bucket'

type ClerkUser = ReturnType<typeof useUser>['user']

function isApprovedUser(user: ClerkUser) {
  if (!user) {
    return false
  }

  const metadata = user.publicMetadata as Record<string, unknown> | undefined
  return metadata?.approved === true || metadata?.approvalStatus === 'approved'
}

function getDisplayName(user: ClerkUser) {
  if (!user) {
    return 'there'
  }

  return (
    user.firstName?.trim() ||
    user.fullName?.trim() ||
    user.username?.trim() ||
    user.primaryEmailAddress?.emailAddress.split('@')[0] ||
    'there'
  )
}

function LoadingState() {
  return (
    <div className="app__loading-shell">
      <ClerkLoading>
        <div className="app__loading-card">
          <div className="app__loading-ring" />
          <p className="app__eyebrow">Loading secure session</p>
          <h2 className="app__loading-title">Checking access</h2>
          <p className="app__loading-copy">
            We are verifying your Clerk session before opening MDU TraceLens.
          </p>
        </div>
      </ClerkLoading>
    </div>
  )
}

function SignedOutState() {
  return (
    <section className="app__access-screen">
      <div className="app__access-card">
        <p className="app__eyebrow">Secure workspace</p>
        <h2 className="app__access-title">Sign in to open MDU TraceLens</h2>
        <p className="app__access-copy">
          The log viewer stays locked until you create an account and receive approval.
        </p>
        <div className="app__access-actions">
          <SignInButton mode="modal">
            <button type="button" className="app__auth-btn app__auth-btn--secondary">
              Sign in
            </button>
          </SignInButton>
          <SignUpButton mode="modal" unsafeMetadata={{ approvalStatus: 'pending' }}>
            <button type="button" className="app__auth-btn app__auth-btn--primary">
              Request access
            </button>
          </SignUpButton>
        </div>
        <p className="app__access-note">New accounts enter an approval queue for the admin team.</p>
      </div>
    </section>
  )
}

function PendingApprovalState() {
  return (
    <section className="app__access-screen">
      <div className="app__access-card app__access-card--pending">
        <p className="app__eyebrow">Approval required</p>
        <h2 className="app__access-title">Your account is waiting on admin review</h2>
        <p className="app__access-copy">
          You are signed in, but the workspace is locked until an admin marks your account as approved in Clerk.
        </p>
        <div className="app__access-actions">
          <UserButton />
          <SignOutButton>
            <button type="button" className="app__auth-btn app__auth-btn--secondary">
              Sign out
            </button>
          </SignOutButton>
        </div>
        <p className="app__access-note">Once approval is set, refresh the page to continue.</p>
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
  const { isLoaded, isSignedIn, user } = useUser()

  const handleFileParsed = useCallback((entries: LogEntry[], name: string) => {
    setAllEntries(entries)
    setFileName(name)
  }, [])

  const handleNewFile = useCallback(() => {
    setAllEntries([])
    setFileName('')
    setFilters(DEFAULT_FILTERS)
    setViewTab('logs')
  }, [])

  const filtered = useMemo(() => filterEntries(allEntries, filters), [allEntries, filters])
  const counts = useMemo(() => countLevels(filtered), [filtered])
  const hasData = allEntries.length > 0
  const approved = isApprovedUser(user)
  const displayName = getDisplayName(user)
  const canUsePlatform = Boolean(isLoaded && isSignedIn && approved)
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
              <SignInButton mode="modal">
                <button type="button" className="app__auth-btn app__auth-btn--secondary">
                  Sign in
                </button>
              </SignInButton>
              <SignUpButton mode="modal" unsafeMetadata={{ approvalStatus: 'pending' }}>
                <button type="button" className="app__auth-btn app__auth-btn--primary">
                  Request access
                </button>
              </SignUpButton>
            </div>
          )}
          {isSignedIn && (
            <div className="app__user-area">
              {approved ? (
                <span className="app__status-pill app__status-pill--welcome">
                  Welcome {displayName}
                </span>
              ) : (
                <span className="app__status-pill app__status-pill--pending">
                  Pending approval
                </span>
              )}
              <UserButton />
            </div>
          )}
        </div>
      </header>

      <main className="app__main">
        {!isLoaded ? (
          <LoadingState />
        ) : !isSignedIn ? (
          <SignedOutState />
        ) : !approved ? (
          <PendingApprovalState />
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
                <LogTable entries={filtered} />
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
          <BucketLogsView />
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

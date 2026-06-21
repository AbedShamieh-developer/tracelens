import { useState, useRef, useEffect } from 'react'
import './BucketLogsView.css'

interface ClientDropdownProps {
  clients: string[]
  selectedClient: string
  loading?: boolean
  disabled?: boolean
  onChange: (client: string) => void
}

export default function ClientDropdown({
  clients,
  selectedClient,
  loading = false,
  disabled = false,
  onChange,
}: ClientDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="bucket-view__controls-group" ref={dropdownRef}>
      <span className="bucket-view__control-label">Client</span>
      <div className="bucket-view__client-picker-shell">
        <button
          type="button"
          className="bucket-view__client-trigger"
          disabled={disabled || loading}
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
        >
          <span className="bucket-view__client-trigger-value">
            {selectedClient || (loading ? 'Loading...' : 'Select a client')}
          </span>
          <svg
            className={`bucket-view__client-trigger-icon ${isOpen ? 'bucket-view__client-trigger-icon--open' : ''}`}
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
          >
            <path
              d="M2.5 4.5L6 8L9.5 4.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        {isOpen && (
          <div className="bucket-view__client-menu" role="listbox">
            {clients.length === 0 ? (
              <div className="bucket-view__client-option" style={{ pointerEvents: 'none', opacity: 0.5 }}>
                <span className="bucket-view__client-option-name">No clients available</span>
              </div>
            ) : (
              clients.map((client) => (
                <button
                  key={client}
                  type="button"
                  className={`bucket-view__client-option ${
                    client === selectedClient ? 'bucket-view__client-option--active' : ''
                  }`}
                  role="option"
                  aria-selected={client === selectedClient}
                  onClick={() => {
                    onChange(client)
                    setIsOpen(false)
                  }}
                >
                  <span className="bucket-view__client-option-name">{client}</span>
                  {client === selectedClient && (
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ color: 'var(--text-primary)' }}>
                      <path d="M2.5 7.5L5.5 10.5L11.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}

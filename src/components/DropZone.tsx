import { useCallback, useState, useRef } from 'react';
import { parseCSV } from '../logParser';
import type { LogEntry } from '../types';
import './DropZone.css';

interface DropZoneProps {
  onFileParsed: (entries: LogEntry[], fileName: string) => void;
}

export default function DropZone({ onFileParsed }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith('.csv')) {
      setError('Please drop a .csv file');
      setTimeout(() => setError(null), 3000);
      return;
    }
    setError(null);
    setIsParsing(true);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const entries = parseCSV(text);
        if (entries.length === 0) {
          setError('No valid log entries found in this CSV');
          setIsParsing(false);
          return;
        }
        onFileParsed(entries, file.name);
      } catch {
        setError('Failed to parse CSV file');
      } finally {
        setIsParsing(false);
      }
    };
    reader.onerror = () => {
      setError('Failed to read file');
      setIsParsing(false);
    };
    reader.readAsText(file);
  }, [onFileParsed]);

  const onDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDragging(false);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const onClickBrowse = () => fileInputRef.current?.click();

  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  };

  return (
    <div className="dropzone-wrapper">
      <div
        id="drop-zone"
        className={`dropzone ${isDragging ? 'dropzone--dragging' : ''} ${isParsing ? 'dropzone--parsing' : ''} ${error ? 'dropzone--error' : ''}`}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onClick={onClickBrowse}
        role="button"
        tabIndex={0}
        aria-label="Drop CSV file here or click to browse"
      >
        {/* Animated border */}
        <div className="dropzone__border" />

        {/* Corner accents */}
        <div className="dropzone__corner dropzone__corner--tl" />
        <div className="dropzone__corner dropzone__corner--tr" />
        <div className="dropzone__corner dropzone__corner--bl" />
        <div className="dropzone__corner dropzone__corner--br" />

        <div className="dropzone__content">
          {isParsing ? (
            <div className="dropzone__parsing">
              <div className="dropzone__spinner" />
              <p className="dropzone__title">Parsing log entries…</p>
            </div>
          ) : (
            <>
              <div className="dropzone__icon-wrapper">
                <img src="/logo.jpg" alt="Oreyeon Logo" className="dropzone__icon" />
                <div className="dropzone__icon-glow" />
              </div>

              <h2 className="dropzone__title">
                {isDragging ? 'Release to analyze' : 'Drop your CloudWatch CSV'}
              </h2>
              <p className="dropzone__subtitle">
                {isDragging
                  ? 'We\'ll parse and visualize your logs instantly'
                  : 'Drag & drop your csv here'}
              </p>

              <div className="dropzone__divider">
                <span className="dropzone__divider-line" />
                <span className="dropzone__divider-text">or</span>
                <span className="dropzone__divider-line" />
              </div>

              <button
                id="browse-button"
                className="dropzone__browse-btn"
                onClick={(e) => { e.stopPropagation(); onClickBrowse(); }}
                type="button"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M2 10V12.5C2 13.3284 2.67157 14 3.5 14H12.5C13.3284 14 14 13.3284 14 12.5V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  <path d="M8 2V10M8 2L5 5M8 2L11 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Browse Files
              </button>

              <p className="dropzone__hint">Supports .csv files from CloudWatch Logs Insights</p>
            </>
          )}

          {error && (
            <div className="dropzone__error">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M8 4.5V8.5M8 11V11.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              {error}
            </div>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={onFileSelect}
          className="dropzone__input"
          aria-hidden="true"
        />
      </div>
    </div>
  );
}

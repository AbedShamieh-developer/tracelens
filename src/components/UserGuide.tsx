import './UserGuide.css';

export default function UserGuide() {
  return (
    <div className="userguide" id="user-guide">
      <div className="userguide__header">
        <div className="userguide__badge">OPERATIONS PORTAL</div>
        <h3 className="userguide__title">Oreyeon TraceLens Guide</h3>
        <p className="userguide__subtitle">
          Internal protocol for parsing, analyzing, and auditing CloudWatch log telemetry.
        </p>
      </div>

      <div className="userguide__grid">
        {/* Step 1 */}
        <div className="userguide__card">
          <div className="userguide__card-num">01</div>
          <h4 className="userguide__card-title">Extract Log Telemetry</h4>
          <p className="userguide__card-text">
            Run your query in <strong>AWS CloudWatch Logs Insights</strong>. Export the results directly as a <strong>CSV</strong> format. Ensure the export contains at least <code>timestamp</code> (or <code>@timestamp</code>) and <code>message</code> fields.
          </p>
        </div>

        {/* Step 2 */}
        <div className="userguide__card">
          <div className="userguide__card-num">02</div>
          <h4 className="userguide__card-title">Ingest & Parse File</h4>
          <p className="userguide__card-text">
            Drag and drop the exported CSV file directly into the landing zone above, or select it manually. The client-side parser will securely process and structure the log entries entirely offline.
          </p>
        </div>

        {/* Step 3 */}
        <div className="userguide__card">
          <div className="userguide__card-num">03</div>
          <h4 className="userguide__card-title">Query & Filter</h4>
          <p className="userguide__card-text">
            Refine telemetry streams in real time. Use <strong>Regex</strong> for full-text search, filter logs dynamically relative to the current time, or adjust log levels to isolate critical failures instantly.
          </p>
        </div>
      </div>

      <div className="userguide__security">
        <svg className="userguide__security-icon" width="14" height="16" viewBox="0 0 14 16" fill="none">
          <path d="M7 1L1 3.5V8C1 11.5 3.5 14.5 7 15C10.5 14.5 13 11.5 13 8V3.5L7 1Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M7 5V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <circle cx="7" cy="11.5" r="0.75" fill="currentColor"/>
        </svg>
        <span><strong>Oreyeon security protocol:</strong> Data parsing is performed locally. No log payloads or system telemetry are transmitted to external servers.</span>
      </div>
    </div>
  );
}

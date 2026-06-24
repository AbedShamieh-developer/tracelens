import './UserGuide.css';

export default function UserGuide() {
  return (
    <div className="userguide" id="user-guide">
      <div className="userguide__header">
        <div className="userguide__badge">OPERATIONS PORTAL</div>
        <h3 className="userguide__title">MDU TraceLens Guide</h3>
        <p className="userguide__subtitle">
          Internal protocol for parsing, analyzing, and auditing CloudWatch log telemetry.
        </p>
      </div>

      <div className="userguide__grid">
        {/* Step 1 */}
        <div className="userguide__card">
          <div className="userguide__card-num">01</div>
          <h4 className="userguide__card-title">Choose Your Source</h4>
          <p className="userguide__card-text">
            Use <strong>Upload mode</strong> for exported CSV files, or switch to <strong>S3 bucket mode</strong> to load aviation log objects directly from the configured client bucket.
          </p>
        </div>

        {/* Step 2 */}
        <div className="userguide__card">
          <div className="userguide__card-num">02</div>
          <h4 className="userguide__card-title">Upload CSV Logs</h4>
          <p className="userguide__card-text">
            Export from <strong>AWS CloudWatch Logs Insights</strong> as <strong>CSV</strong>, then drag the file into the landing zone. Include at least <code>timestamp</code> or <code>@timestamp</code> and <code>message</code>.
          </p>
        </div>

        {/* Step 3 */}
        <div className="userguide__card">
          <div className="userguide__card-num">03</div>
          <h4 className="userguide__card-title">Load From S3</h4>
          <p className="userguide__card-text">
            In <strong>S3 bucket mode</strong>, select the aviation client, refresh the bucket listing, and open the available log objects. TraceLens downloads authorized objects and parses them into the same viewer.
          </p>
        </div>

        {/* Step 4 */}
        <div className="userguide__card">
          <div className="userguide__card-num">04</div>
          <h4 className="userguide__card-title">Query & Filter</h4>
          <p className="userguide__card-text">
            Refine upload or S3 telemetry in real time. Use <strong>Regex</strong> search, date filters, log levels, and insights to isolate critical aviation events instantly.
          </p>
        </div>
      </div>

      <div className="userguide__security">
        <svg className="userguide__security-icon" width="14" height="16" viewBox="0 0 14 16" fill="none">
          <path d="M7 1L1 3.5V8C1 11.5 3.5 14.5 7 15C10.5 14.5 13 11.5 13 8V3.5L7 1Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M7 5V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <circle cx="7" cy="11.5" r="0.75" fill="currentColor"/>
        </svg>
        <span><strong>MDU security protocol:</strong> Upload parsing stays local in the browser. S3 mode only loads authorized bucket objects for the selected client workspace.</span>
      </div>
    </div>
  );
}

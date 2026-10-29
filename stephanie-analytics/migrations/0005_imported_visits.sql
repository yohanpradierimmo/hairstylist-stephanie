-- Privacy-sanitized Matomo visit log. No IP, visitorId or fingerprint is stored.
CREATE TABLE IF NOT EXISTS imported_visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  visit_key TEXT NOT NULL UNIQUE,
  report_month TEXT NOT NULL,
  started_at TEXT NOT NULL,
  last_seen_at TEXT,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  actions INTEGER NOT NULL DEFAULT 0,
  pageviews INTEGER NOT NULL DEFAULT 0,
  entry_page TEXT,
  exit_page TEXT,
  pages_json TEXT NOT NULL DEFAULT '[]',
  country TEXT,
  region TEXT,
  city TEXT,
  device TEXT,
  browser TEXT,
  os TEXT,
  screen TEXT,
  referrer_type TEXT,
  referrer_name TEXT,
  source TEXT,
  medium TEXT,
  campaign TEXT,
  imported_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_imported_visits_started_at ON imported_visits(started_at);
CREATE INDEX IF NOT EXISTS idx_imported_visits_month ON imported_visits(report_month);
INSERT OR REPLACE INTO schema_meta(key,value) VALUES ('schema_version','6');

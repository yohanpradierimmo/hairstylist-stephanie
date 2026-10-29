-- Privacy-first event store. No IP, cookie, fingerprint or precise location is stored.
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  day TEXT NOT NULL DEFAULT (date('now')),
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('pageview','page_exit','contact_click')),
  page TEXT NOT NULL,
  referrer_host TEXT,
  source TEXT,
  medium TEXT,
  campaign TEXT,
  device TEXT,
  browser TEXT,
  os TEXT,
  screen TEXT,
  language TEXT,
  country TEXT,
  region TEXT,
  city TEXT,
  contact_type TEXT,
  duration_ms INTEGER NOT NULL DEFAULT 0 CHECK (duration_ms >= 0 AND duration_ms <= 86400000)
);

CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);
CREATE INDEX IF NOT EXISTS idx_events_day_type ON events(day,event_type);
CREATE INDEX IF NOT EXISTS idx_events_session_page ON events(session_id,page);
CREATE INDEX IF NOT EXISTS idx_events_page_day ON events(page,day);

CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT OR IGNORE INTO schema_meta(key,value) VALUES ('schema_version','3');

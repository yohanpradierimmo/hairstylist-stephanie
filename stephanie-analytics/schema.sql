-- Privacy-first event store. No IP, cookie, fingerprint or precise location is stored.
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  day TEXT NOT NULL DEFAULT (date('now')),
  session_id TEXT NOT NULL,
  visitor_id TEXT,
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
CREATE INDEX IF NOT EXISTS idx_events_visitor_day ON events(visitor_id,day);
CREATE INDEX IF NOT EXISTS idx_events_page_day ON events(page,day);

CREATE TABLE IF NOT EXISTS profile_groups (
  member_visitor_id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  label TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_profile_groups_profile ON profile_groups(profile_id);

CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT OR IGNORE INTO schema_meta(key,value) VALUES ('schema_version','7');

CREATE TABLE IF NOT EXISTS imported_reports (
  report_date TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  imported_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  unique_visitors INTEGER NOT NULL DEFAULT 0,
  visits INTEGER NOT NULL DEFAULT 0,
  actions INTEGER NOT NULL DEFAULT 0,
  pageviews INTEGER NOT NULL DEFAULT 0,
  avg_duration_seconds REAL NOT NULL DEFAULT 0,
  bounce_rate REAL NOT NULL DEFAULT 0,
  countries_json TEXT NOT NULL DEFAULT '[]',
  cities_json TEXT NOT NULL DEFAULT '[]',
  devices_json TEXT NOT NULL DEFAULT '[]',
  browsers_json TEXT NOT NULL DEFAULT '[]',
  operating_systems_json TEXT NOT NULL DEFAULT '[]',
  pages_json TEXT NOT NULL DEFAULT '[]',
  channels_json TEXT NOT NULL DEFAULT '[]'
);

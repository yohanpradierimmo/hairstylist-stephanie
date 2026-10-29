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
INSERT OR REPLACE INTO schema_meta(key,value) VALUES ('schema_version','5');

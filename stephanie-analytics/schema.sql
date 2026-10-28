CREATE TABLE IF NOT EXISTS events (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 day TEXT NOT NULL DEFAULT (date('now')),
 session_id TEXT NOT NULL,
 event_type TEXT NOT NULL CHECK (event_type IN ('pageview','contact_click')),
 page TEXT NOT NULL,
 referrer_host TEXT,
 source TEXT,
 medium TEXT,
 campaign TEXT,
 device TEXT,
 browser TEXT,
 language TEXT,
 contact_type TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_day ON events(day);
CREATE INDEX IF NOT EXISTS idx_events_session ON events(day,session_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(day,event_type);

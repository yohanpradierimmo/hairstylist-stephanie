-- Some early site events predate the stable visitor identifier.  Exclude the
-- sessions explicitly confirmed as private administration activity.
CREATE TABLE IF NOT EXISTS excluded_sessions (
  session_id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

DROP VIEW IF EXISTS analytics_events;
CREATE VIEW analytics_events AS
SELECT e.* FROM events e
WHERE NOT EXISTS (
  SELECT 1 FROM profile_groups groups
  WHERE groups.member_visitor_id = e.visitor_id
    AND groups.exclude_from_analytics = 1
)
AND NOT EXISTS (
  SELECT 1 FROM excluded_sessions sessions
  WHERE sessions.session_id = e.session_id
);

INSERT OR REPLACE INTO schema_meta(key,value) VALUES ('schema_version','9');

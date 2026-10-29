-- Omit the site's private administration profiles from all analytics results.
ALTER TABLE profile_groups ADD COLUMN exclude_from_analytics INTEGER NOT NULL DEFAULT 0 CHECK (exclude_from_analytics IN (0,1));

CREATE VIEW IF NOT EXISTS analytics_events AS
SELECT e.* FROM events e
WHERE NOT EXISTS (
  SELECT 1 FROM profile_groups groups
  WHERE groups.member_visitor_id = e.visitor_id
    AND groups.exclude_from_analytics = 1
);

INSERT OR REPLACE INTO schema_meta(key,value) VALUES ('schema_version','8');

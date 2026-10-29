-- Regroupements manuels de profils pseudonymes dans le tableau privé.
CREATE TABLE IF NOT EXISTS profile_groups (
  member_visitor_id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  label TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_profile_groups_profile ON profile_groups(profile_id);

INSERT OR REPLACE INTO schema_meta(key,value) VALUES ('schema_version','7');

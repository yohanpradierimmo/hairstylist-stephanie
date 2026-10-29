ALTER TABLE events ADD COLUMN os TEXT;
ALTER TABLE events ADD COLUMN screen TEXT;
INSERT OR REPLACE INTO schema_meta(key,value) VALUES ('schema_version','4');

-- Migration for databases initialized with schema version 1.
ALTER TABLE events ADD COLUMN country TEXT;
ALTER TABLE events ADD COLUMN region TEXT;
ALTER TABLE events ADD COLUMN city TEXT;
INSERT OR REPLACE INTO schema_meta(key,value) VALUES ('schema_version','3');

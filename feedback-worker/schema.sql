-- D1 schema for MakerLens feedback (wrangler d1 execute makerlens-feedback --remote --file=schema.sql).
-- Deliberately stores no IP, user agent, cookie or identifier, and only the day of submission.
CREATE TABLE IF NOT EXISTS feedback (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  created_day  TEXT    NOT NULL,                       -- 'YYYY-MM-DD' (UTC), no time of day
  kind         TEXT    NOT NULL CHECK (kind IN ('rating', 'idea', 'bug')),
  rating       INTEGER CHECK (rating BETWEEN 1 AND 5), -- NULL for idea/bug sent from About
  comment      TEXT    NOT NULL DEFAULT '' CHECK (length(comment) <= 1000),
  lang         TEXT    NOT NULL DEFAULT '',            -- 2-letter browser language, e.g. 'vi'
  opens        TEXT    NOT NULL DEFAULT '',            -- games opened so far: '1','2','3-5','6-10','11+'
  browser      TEXT    NOT NULL DEFAULT ''             -- only if the user ticked it, e.g. 'Chrome 131 · Windows'
);
CREATE INDEX IF NOT EXISTS feedback_day ON feedback (created_day);

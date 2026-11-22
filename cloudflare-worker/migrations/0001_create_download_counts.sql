CREATE TABLE download_counts (
  path TEXT PRIMARY KEY,
  downloads INTEGER NOT NULL DEFAULT 0 CHECK (downloads >= 0)
);

CREATE TABLE IF NOT EXISTS readmes (
    repo_id     INTEGER PRIMARY KEY REFERENCES repositories(id),
    content     TEXT,
    html        TEXT,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

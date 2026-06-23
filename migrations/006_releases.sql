CREATE TABLE IF NOT EXISTS releases (
    id            BIGSERIAL PRIMARY KEY,
    repo_id       INTEGER NOT NULL REFERENCES repositories(id),
    tag           TEXT NOT NULL,
    author        TEXT,
    is_draft      BOOLEAN NOT NULL DEFAULT FALSE,
    is_prerelease BOOLEAN NOT NULL DEFAULT FALSE,
    published_at  TIMESTAMPTZ NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(repo_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_releases_repo ON releases(repo_id, published_at DESC);

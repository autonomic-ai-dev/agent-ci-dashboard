CREATE TABLE IF NOT EXISTS pull_requests (
    id          BIGSERIAL PRIMARY KEY,
    repo_id     INTEGER NOT NULL REFERENCES repositories(id),
    number      INTEGER NOT NULL,
    title       TEXT NOT NULL,
    author      TEXT NOT NULL,
    state       TEXT NOT NULL DEFAULT 'open',
    is_draft    BOOLEAN NOT NULL DEFAULT FALSE,
    mergeable   TEXT,
    head_ref    TEXT,
    base_ref    TEXT,
    labels      TEXT[] DEFAULT '{}',
    assignees   TEXT[] DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL,
    merged_at   TIMESTAMPTZ,
    closed_at   TIMESTAMPTZ,
    UNIQUE(repo_id, number)
);

CREATE INDEX IF NOT EXISTS idx_prs_repo_state ON pull_requests(repo_id, state);
CREATE INDEX IF NOT EXISTS idx_prs_updated ON pull_requests(updated_at DESC);

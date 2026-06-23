CREATE TABLE IF NOT EXISTS issues (
    id          BIGSERIAL PRIMARY KEY,
    repo_id     INTEGER NOT NULL REFERENCES repositories(id),
    number      INTEGER NOT NULL,
    title       TEXT NOT NULL,
    author      TEXT NOT NULL,
    state       TEXT NOT NULL DEFAULT 'open',
    labels      TEXT[] DEFAULT '{}',
    assignees   TEXT[] DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL,
    closed_at   TIMESTAMPTZ,
    UNIQUE(repo_id, number)
);

CREATE INDEX IF NOT EXISTS idx_issues_repo_state ON issues(repo_id, state);
CREATE INDEX IF NOT EXISTS idx_issues_updated ON issues(updated_at DESC);

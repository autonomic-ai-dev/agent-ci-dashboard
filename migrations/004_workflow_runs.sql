CREATE TABLE IF NOT EXISTS workflow_runs (
    id              BIGSERIAL PRIMARY KEY,
    run_id          BIGINT NOT NULL,
    repo_id         INTEGER NOT NULL REFERENCES repositories(id),
    run_number      INTEGER NOT NULL,
    workflow_name   TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'queued',
    conclusion      TEXT,
    head_sha        TEXT NOT NULL,
    branch          TEXT,
    actor           TEXT,
    event           TEXT,
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    duration_seconds INTEGER,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(repo_id, run_id)
);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_repo ON workflow_runs(repo_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_status ON workflow_runs(status);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_conclusion ON workflow_runs(conclusion);

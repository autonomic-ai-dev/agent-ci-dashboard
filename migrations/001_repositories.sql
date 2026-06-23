CREATE TABLE IF NOT EXISTS repositories (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    owner       TEXT NOT NULL DEFAULT 'autonomic-ai-dev',
    default_branch TEXT NOT NULL DEFAULT 'main',
    head_sha    TEXT,
    latest_tag  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(owner, name)
);

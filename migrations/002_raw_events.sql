CREATE TABLE IF NOT EXISTS raw_events (
    id          BIGSERIAL PRIMARY KEY,
    event_type  TEXT NOT NULL,
    action      TEXT,
    repo        TEXT NOT NULL,
    delivery_id TEXT NOT NULL,
    payload     JSONB NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(delivery_id)
);

CREATE INDEX IF NOT EXISTS idx_raw_events_repo ON raw_events(repo);
CREATE INDEX IF NOT EXISTS idx_raw_events_type ON raw_events(event_type);
CREATE INDEX IF NOT EXISTS idx_raw_events_received ON raw_events(received_at);

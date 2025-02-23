-- +goose Up
CREATE TABLE policies (
    id SERIAL PRIMARY KEY,
    policy_name TEXT NOT NULL UNIQUE,
    is_administrator BOOLEAN,
    is_disabled BOOLEAN,
    enable_all_folders BOOLEAN,
    enabled_folders TEXT [],
    max_active_sessions INTEGER,
    remote_client_bitrate_limit INTEGER
);
CREATE TABLE invites (
    id TEXT PRIMARY KEY,
    referrer TEXT NOT NULL,
    policy_id INTEGER NOT NULL,
    created_at TIMESTAMP NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    use_limit INTEGER,
    times_used INTEGER,
    CONSTRAINT fk_policy FOREIGN KEY(policy_id) REFERENCES policies(id) ON DELETE RESTRICT
);
-- +goose Down
DROP TABLE IF EXISTS invites;
DROP TABLE IF EXISTS policies;
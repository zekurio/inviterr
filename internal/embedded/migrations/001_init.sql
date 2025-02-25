-- +goose Up
CREATE TABLE invites (
    id TEXT PRIMARY KEY,
    template_user_id TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    use_limit INTEGER,
    times_used INTEGER
);
-- +goose Down
DROP TABLE IF EXISTS invites;
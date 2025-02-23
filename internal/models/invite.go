package models

import "time"

// Invite is an invite to the jellyfin and jellyseerr instance,
// it contains the ID of the invite, a jellyfin
type Invite struct {
	// ID is the ID of the invite, which is also part of the URL
	ID string

	// Policy is the policy used to create accounts with
	Policy DehydratedPolicy

	// New fields
	CreatedAt time.Time
	ExpiresAt time.Time
	UseLimit  int
	TimesUsed int
}

// DehydratedPolicy is a slimmed down version of the policy,
// we only want to set the admin status, disabled status, library access, number of sessions and remote streaming
// bitrate limit
type DehydratedPolicy struct {
	PolicyName               string   `json:"policy_name"`
	IsAdministrator          bool     `json:"is_administrator"`
	IsDisabled               bool     `json:"is_disabled"`
	EnableAllFolders         bool     `json:"enable_all_folders"`
	EnabledFolders           []string `json:"enabled_folders"`
	MaxActiveSessions        int32    `json:"max_active_sessions"`
	RemoteClientBitrateLimit int32    `json:"remote_client_bitrate_limit"`
}

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
	PolicyName               string
	IsAdministrator          bool
	IsDisabled               bool
	EnableAllFolders         bool
	EnabledFolders           []string
	MaxActiveSessions        int32
	RemoteClientBitrateLimit int32
}

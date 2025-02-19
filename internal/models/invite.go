package models

// Invite is an invite to the jellyfin and jellyseerr instance,
// it contains the ID of the invite, a jellyfin
type Invite struct {
	// ID is the ID of the invite, which is also part of the URL
	ID string

	// Referrer is the userId of the user who created the invite
	Referrer string

	// Policy is the policy used to create accounts with
	Policy DehydratedPolicy
}

// DehydratedPolicy is a slimmed down version of the policy,
// we only want to set the admin status, disabled status, library access, number of sessions and remote streaming
// bitrate limit
type DehydratedPolicy struct {
	PolicyName               string
	IsAdministrator          *bool
	IsDisabled               *bool
	EnableAllFolders         *bool
	EnabledFolders           []string
	MaxActiveSessions        *int32
	RemoteClientBitrateLimit *int32
}

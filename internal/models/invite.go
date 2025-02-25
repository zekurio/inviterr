package models

import "time"

// Invite is an invite to the jellyfin and jellyseerr instance,
// it contains the ID of the invite, a jellyfin
type Invite struct {
	// ID is the ID of the invite.
	ID string

	// TemplateUserID holds the user id to use as a template.
	TemplateUserID string

	CreatedAt time.Time
	ExpiresAt time.Time
	UseLimit  int
	TimesUsed int
}

func (i *Invite) IsExpired() bool {
	return i.ExpiresAt.Before(time.Now())
}

func (i *Invite) IsUsed() bool {
	return i.TimesUsed >= i.UseLimit && i.UseLimit != 0
}

package database

import (
	"errors"

	"github.com/zekurio/inviterr/internal/models"
)

var (
	ErrUnsupportedProviderType = errors.New("unsupported database provider type")
	ErrNotFound                = errors.New("not found")
)

type Database interface {
	Close() error

	// Invites
	CreateInvite(invite models.Invite) error
	GetInviteByID(id string) (models.Invite, error)
	GetInviteByReferrer(referrer string) (models.Invite, error)
	DeleteInvite(id string) error
}

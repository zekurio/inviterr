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
	AddUpdateInvite(invite models.Invite) error
	GetAllInvites() ([]models.Invite, error)
	GetInviteByID(id string) (models.Invite, error)
	DeleteInvite(id string) error

	// Policies
	AddUpdatePolicy(policy models.DehydratedPolicy) error
	GetAllPolicies() ([]models.DehydratedPolicy, error)
	GetPolicyByName(name string) (models.DehydratedPolicy, error)
	DeletePolicyByName(name string) error
}

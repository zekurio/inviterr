package invites

import (
	"errors"
	"time"

	"github.com/sarulabs/di/v2"
	"github.com/zekurio/inviterr/internal/models"
	"github.com/zekurio/inviterr/internal/services/database"
	"github.com/zekurio/inviterr/internal/util/static"
	"github.com/zekurio/inviterr/pkg/random"
)

var (
	ErrInvalidInvite      = errors.New("invalid invite")
	ErrInviteExpired      = errors.New("invite expired")
	ErrInviteLimitReached = errors.New("invite limit reached")
)

type InviteService struct {
	db      database.Database
	invites map[string]models.Invite
}

func New(ctn di.Container) (*InviteService, error) {
	invites := make(map[string]models.Invite)
	db := ctn.Get(static.DiDatabase).(database.Database)

	// load all invites into the in-memory map
	allInvites, err := db.GetAllInvites()
	if err != nil {
		return nil, err
	}
	for _, invite := range allInvites {
		invites[invite.ID] = invite
	}

	return &InviteService{
		db:      db,
		invites: invites,
	}, nil
}

// CheckInvite validates an invite, updates its usage, and deletes it if the limit is reached.
func (i *InviteService) CheckInvite(id string) (bool, error) {
	invite, ok := i.invites[id]
	if !ok {
		return false, ErrInvalidInvite
	}
	if invite.ExpiresAt.Before(time.Now()) {
		return false, ErrInviteExpired
	}
	if invite.UseLimit != 0 && invite.TimesUsed >= invite.UseLimit {
		return false, ErrInviteLimitReached
	}

	// increment use count if applicable
	if invite.UseLimit != 0 {
		invite.TimesUsed++
	}
	i.invites[id] = invite

	if err := i.db.AddUpdateInvite(invite); err != nil {
		return false, err
	}
	// remove the invite if the use limit is reached after increment
	if invite.UseLimit != 0 && invite.TimesUsed >= invite.UseLimit {
		if err := i.db.DeleteInvite(id); err != nil {
			// if we can't delete the invite, we should return an error
			// but the user can still go on
			return true, err
		}
		delete(i.invites, id)
	}

	return true, nil
}

// CreateInvite creates a new invite and stores it in the database.
func (i *InviteService) CreateInvite(req models.InviteRequest) (models.Invite, error) {
	id := random.MustGetRandBase64Str(6)
	invite := models.Invite{
		ID:        id,
		Policy:    models.DehydratedPolicy{PolicyName: req.PolicyName},
		CreatedAt: time.Now(),
		ExpiresAt: req.ExpiresAt,
		UseLimit:  req.UseLimit,
		TimesUsed: 0,
	}

	if err := i.db.AddUpdateInvite(invite); err != nil {
		return models.Invite{}, err
	}

	i.invites[id] = invite

	return invite, nil
}

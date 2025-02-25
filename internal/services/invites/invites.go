package invites

import (
	"errors"
	"time"

	"github.com/sarulabs/di/v2"
	"github.com/sj14/jellyfin-go/api"
	"github.com/zekurio/inviterr/internal/models"
	"github.com/zekurio/inviterr/internal/services/database"
	"github.com/zekurio/inviterr/internal/services/jellyfin"
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
	jf      *jellyfin.Wrapper
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
		jf:      ctn.Get(static.DiJellyfin).(*jellyfin.Wrapper),
		invites: invites,
	}, nil
}

// CheckInvite validates an invite, updates its usage, and deletes it if the limit is reached.
func (i *InviteService) CheckInvite(id string) (bool, error) {
	invite, ok := i.invites[id]
	if !ok {
		return false, ErrInvalidInvite
	}
	if invite.IsExpired() {
		return false, ErrInviteExpired
	}
	if invite.IsUsed() {
		return false, ErrInviteLimitReached
	}

	return true, nil
}

// ConsumeInvite increments the usage counter of an invite and deletes it if the limit is reached.
func (i *InviteService) ConsumeInvite(id string) error {
	invite, ok := i.invites[id]
	if !ok {
		return ErrInvalidInvite
	}

	invite.TimesUsed++
	if err := i.db.AddUpdateInvite(invite); err != nil {
		return err
	}

	return nil
}

// CreateInvite creates a new invite and stores it in the database.
func (i *InviteService) CreateInvite(req models.InviteRequest) (models.Invite, error) {
	id := random.MustGetRandBase64Str(6)
	invite := models.Invite{
		ID:             id,
		TemplateUserID: req.TemplateUserID,
		CreatedAt:      time.Now(),
		ExpiresAt:      req.ExpiresAt,
		UseLimit:       req.UseLimit,
		TimesUsed:      0,
	}

	if err := i.db.AddUpdateInvite(invite); err != nil {
		return models.Invite{}, err
	}

	i.invites[id] = invite

	return invite, nil
}

// GetInvitePolicy retrieves the user policy template from Jellyfin.
func (i *InviteService) GetInvitePolicy(id string) (*api.UserPolicy, error) {
	return i.jf.GetUserPolicy(i.invites[id].TemplateUserID)
}

package jellyfin

import (
	"context"

	"github.com/charmbracelet/log"
	"github.com/sarulabs/di/v2"
	jf "github.com/sj14/jellyfin-go/api"

	"github.com/zekurio/inviterr/internal/services/config"
	"github.com/zekurio/inviterr/internal/util/static"
)

type Wrapper struct {
	client     *jf.APIClient
	ctx        context.Context
}

func New(ctn di.Container) *Wrapper {
	cfg := ctn.Get(static.DiConfig).(config.Provider).Config()

	jfConfiguration := &jf.Configuration{
		Servers:       jf.ServerConfigurations{{URL: cfg.Jellyfin.BaseURL}},
		DefaultHeader: map[string]string{"Authorization": `MediaBrowser Token="` + cfg.Jellyfin.APIKey + `"`},
	}

	apiClient := jf.NewAPIClient(jfConfiguration)

	return &Wrapper{
		client:     apiClient,
		ctx:        context.Background(),
	}
}

// ListUsers fetches a list of users from the Jellyfin server.
// GET /Users
func (w *Wrapper) ListUsers() ([]jf.UserDto, error) {
	result, resp, err := w.client.UserAPI.GetUsers(w.ctx).Execute()
	if err != nil || resp.StatusCode != 200 {
		log.Error("Failed to list users", "error", err, "status", resp.StatusCode)
		return nil, err
	}

	return result, nil
}

// UpdateUserPolicy updates the policy of a user.
// POST /Users/{userId}/Policy
func (w *Wrapper) UpdateUserPolicy(userId string, policy jf.UserPolicy) error {
	resp, err := w.client.UserAPI.UpdateUserPolicy(w.ctx, userId).UserPolicy(policy).Execute()

	if err != nil || resp.StatusCode != 204 {
		log.Error("Failed to update user policy", "error", err, "status", resp.StatusCode)
		return err
	}

	return nil
}

// BulkUpdateUsersPolicies updates the policies of multiple users.
// POST /Users/{userId}/Policy
func (w *Wrapper) BulkUpdateUsersPolicies(users []jf.UserDto, policy jf.UserPolicy) error {
	for _, user := range users {
		if err := w.UpdateUserPolicy(*user.Id, policy); err != nil {
			return err
		}
	}

	return nil
}
package jellyfin

import (
	"context"

	"github.com/sarulabs/di/v2"
	jf "github.com/sj14/jellyfin-go/api"

	"github.com/zekurio/inviterr/internal/models"
	"github.com/zekurio/inviterr/internal/util/static"
)

type Wrapper struct {
	client     *jf.APIClient
	ctx        context.Context
}

func New(ctn di.Container) *Wrapper {
	cfg := ctn.Get(static.DiConfig).(models.Config)

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

func (w *Wrapper) AuthenticateUserByName(username, password string) (user *jf.NullableUserDto, accessToken string, err error) {
	res, resp, err := w.client.UserAPI.AuthenticateUserByName(w.ctx).AuthenticateUserByName(jf.AuthenticateUserByName{
		Username: *jf.NewNullableString(&username),
		Pw:       *jf.NewNullableString(&password),
	}).Execute()
	if err != nil || resp.StatusCode != 200 {
		return
	}

	user = &res.User
	accessToken = *res.AccessToken.Get()

	return
}

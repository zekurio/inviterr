package jellyfin

import (
	"context"
	"errors"

	"github.com/sarulabs/di/v2"
	jf "github.com/sj14/jellyfin-go/api"

	"github.com/zekurio/inviterr/internal/models"
	"github.com/zekurio/inviterr/internal/util/static"
)

type Wrapper struct {
	client *jf.APIClient
	ctx    context.Context
}

func New(ctn di.Container) *Wrapper {
	cfg := ctn.Get(static.DiConfig).(models.Config)

	jfConfiguration := &jf.Configuration{
		Servers:       jf.ServerConfigurations{{URL: cfg.Jellyfin.BaseURL}},
		DefaultHeader: map[string]string{"Authorization": `MediaBrowser Token="` + cfg.Jellyfin.APIKey + `"`},
	}

	apiClient := jf.NewAPIClient(jfConfiguration)

	return &Wrapper{
		client: apiClient,
		ctx:    context.Background(),
	}
}

func (w *Wrapper) AuthenticateUserByName(username, password string) (user *jf.NullableUserDto, accessToken string, err error) {
	res, resp, err := w.client.UserAPI.AuthenticateUserByName(w.ctx).AuthenticateUserByName(jf.AuthenticateUserByName{
		Username: *jf.NewNullableString(&username),
		Pw:       *jf.NewNullableString(&password),
	}).Execute()
	if err != nil || resp.StatusCode != 200 {
		return nil, "", errors.New("failed to authenticate user")
	}

	user = &res.User
	accessToken = *res.AccessToken.Get()

	return
}

func (w *Wrapper) CreateUser(username, password string) (user *jf.UserDto, err error) {
	user, resp, err := w.client.UserAPI.CreateUserByName(w.ctx).CreateUserByName(
		jf.CreateUserByName{
			Name:     username,
			Password: *jf.NewNullableString(&password),
		}).Execute()
	if err != nil || resp.StatusCode != 200 {
		return nil, errors.New("failed to create user")
	}

	return
}

func (w *Wrapper) GetUserByName(userId string) (user *jf.UserDto, err error) {
	user, resp, err := w.client.UserAPI.GetUserById(w.ctx, userId).Execute()
	if err != nil || resp.StatusCode != 200 {
		return nil, errors.New("failed to get user")
	}

	return
}

func (w *Wrapper) ApplyUserPolicy(userId string, policy jf.UserPolicy) (err error) {
	resp, err := w.client.UserAPI.UpdateUserPolicy(w.ctx, userId).UserPolicy(policy).Execute()
	if err != nil || resp.StatusCode != 200 {
		return errors.New("failed to apply user policy")
	}

	return
}

func (w *Wrapper) GetUserPolicy(userId string) (policy *jf.UserPolicy, err error) {
	user, err := w.GetUserByName(userId)
	if err != nil {
		return nil, err
	}

	policy = user.Policy.Get()

	return
}

func (w *Wrapper) DeleteUser(userId string) (err error) {
	resp, err := w.client.UserAPI.DeleteUser(w.ctx, userId).Execute()
	if err != nil || resp.StatusCode != 200 {
		return errors.New("failed to delete user")
	}

	return
}

func (w *Wrapper) DisableUser(userId string) (err error) {
	policy, err := w.GetUserPolicy(userId)
	if err != nil {
		return err
	}

	// check if user is already disabled
	if *policy.IsDisabled {
		return errors.New("user is already disabled")
	}

	boolVar := true
	policy.IsDisabled = &boolVar

	return w.ApplyUserPolicy(userId, *policy)
}

func (w *Wrapper) EnableUser(userId string) (err error) {
	policy, err := w.GetUserPolicy(userId)
	if err != nil {
		return err
	}

	// check if user is already enabled
	if !*policy.IsDisabled {
		return errors.New("user is already enabled")
	}

	boolVar := false
	policy.IsDisabled = &boolVar

	return w.ApplyUserPolicy(userId, *policy)
}

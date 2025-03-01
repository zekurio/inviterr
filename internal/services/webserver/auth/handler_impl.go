package auth

import (
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v4"
	"github.com/sarulabs/di/v2"
	jf_api "github.com/sj14/jellyfin-go/api"
	"github.com/zekurio/inviterr/internal/models"
	"github.com/zekurio/inviterr/internal/services/jellyfin"
	"github.com/zekurio/inviterr/internal/util/static"
)

var (
	TokenValidity   = 20 * time.Minute
	RefreshValidity = 24 * time.Hour
)

type AuthHandler struct {
	jf     *jellyfin.Wrapper
	secret string
}

func NewAuthHandler(ctn di.Container) (*AuthHandler, error) {
	jf := ctn.Get(static.DiJellyfin).(*jellyfin.Wrapper)
	cfg := ctn.Get(static.DiConfig).(models.Config)

	return &AuthHandler{
		jf:     jf,
		secret: cfg.WebServer.Secret,
	}, nil
}

func (h *AuthHandler) HandleLogin(ctx *fiber.Ctx) error {
	var req models.LoginRequest
	if err := ctx.BodyParser(&req); err != nil {
		return ctx.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request payload"})
	}

	user, jfAccessToken, err := h.jf.AuthenticateUserByName(req.Username, req.Password)
	if err != nil {
		return ctx.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid credentials"})
	}

	accessToken, refreshToken, err := h.createTokens(user, jfAccessToken)
	if err != nil {
		return ctx.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to generate tokens"})
	}

	ctx.Cookie(&fiber.Cookie{
		Name:     static.CookieName,
		Value:    refreshToken,
		Expires:  time.Now().Add(RefreshValidity),
		HTTPOnly: true,
		Secure:   true,
		Path:     "/",
	})

	return ctx.JSON(fiber.Map{"token": accessToken})
}

func (h *AuthHandler) HandleLogout(ctx *fiber.Ctx) error {
	ctx.Cookie(&fiber.Cookie{
		Name:     static.CookieName,
		Value:    "",
		Expires:  time.Now().Add(-time.Hour),
		HTTPOnly: true,
		Secure:   true,
		Path:     "/",
	})

	return ctx.SendStatus(fiber.StatusOK)
}

func (h *AuthHandler) createTokens(user *jf_api.NullableUserDto, jfAccessToken string) (accessToken string, refreshToken string, err error) {
	// Create claims for the access token
	accessClaims := jwt.MapClaims{
		"valid":    true,
		"user_id":  user.Get().Id,
		"jf_token": jfAccessToken, // include Jellyfin access token just in case
		"exp":      time.Now().Add(TokenValidity).Unix(),
		"type":     "bearer",
	}
	accessJWT := jwt.NewWithClaims(jwt.SigningMethodHS256, accessClaims)
	accessToken, err = accessJWT.SignedString([]byte(h.secret))
	if err != nil {
		return "", "", err
	}

	refreshClaims := jwt.MapClaims{
		"valid":    true,
		"user_id":  user.Get().Id,
		"jf_token": jfAccessToken,
		"exp":      time.Now().Add(RefreshValidity).Unix(),
		"type":     "refresh",
	}
	refreshJWT := jwt.NewWithClaims(jwt.SigningMethodHS256, refreshClaims)
	refreshToken, err = refreshJWT.SignedString([]byte(h.secret))
	if err != nil {
		return "", "", err
	}
	return accessToken, refreshToken, nil
}

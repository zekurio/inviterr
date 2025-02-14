package auth

import (
	"github.com/gofiber/fiber/v2"
	"github.com/sarulabs/di/v2"
	"github.com/zekurio/inviterr/internal/services/jellyfin"
	"github.com/zekurio/inviterr/internal/util/static"
)

type AuthMiddleware struct {
	jellyfinClient *jellyfin.Wrapper
}

func NewAuthMiddleware(ctn di.Container) *AuthMiddleware {
	return &AuthMiddleware{
		jellyfinClient: ctn.Get(static.DiJellyfin).(*jellyfin.Wrapper),
	}
}

func (a *AuthMiddleware) Handle(ctx *fiber.Ctx) error {
	return ctx.Next()
}
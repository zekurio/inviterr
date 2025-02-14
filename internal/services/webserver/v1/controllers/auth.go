package controllers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/sarulabs/di/v2"
	"github.com/zekurio/inviterr/internal/services/webserver/auth"
	"github.com/zekurio/inviterr/internal/util/static"
)

type AuthController struct {
	authHandler auth.RequestHandler
}

// Setup injects the containers and registers API routes.
func (ac *AuthController) Setup(ctn di.Container, r fiber.Router) {
	// Retrieve the auth handler from the container.
	ac.authHandler = ctn.Get(static.DiAuthHandler).(auth.RequestHandler)

	r.Post("/login", ac.authHandler.HandleLogin)
	r.Post("/logout", ac.authHandler.HandleLogout)
}

package auth

import "github.com/gofiber/fiber/v2"

// RequestHandler provides fiber endpoints and handlers
// to authenticate users via Jellyfin
type RequestHandler interface {
	// HandleLogin handles the login request
	HandleLogin(ctx *fiber.Ctx) error

	// HandleLogout handles the logout request
	HandleLogout(ctx *fiber.Ctx) error
}

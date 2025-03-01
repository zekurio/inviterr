package v1

import (
	"github.com/gofiber/fiber/v2"
	"github.com/sarulabs/di/v2"
	"github.com/zekurio/inviterr/internal/services/webserver/auth"
	"github.com/zekurio/inviterr/internal/services/webserver/v1/controllers"
	"github.com/zekurio/inviterr/internal/util/static"
)

type Router struct {
	ctn di.Container
}

func (r *Router) SetContainer(ctn di.Container) {
	r.ctn = ctn
}

func (r *Router) Route(router fiber.Router) {
	authMw := r.ctn.Get(static.DiAuthMiddleware).(auth.Middleware)

	// Unprotected API routes

	new(controllers.OthersController).Setup(r.ctn, router)
	new(controllers.AuthController).Setup(r.ctn, router.Group("/auth"))
	new(controllers.RegisterController).Setup(r.ctn, router.Group("/register"))

	// Protected API routes

	router.Use(authMw.Handle)

	new(controllers.InviteController).Setup(r.ctn, router.Group("/invites"))
}

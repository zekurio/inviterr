package v1

import (
	"github.com/gofiber/fiber/v2"
	"github.com/sarulabs/di/v2"
	"github.com/zekurio/inviterr/internal/services/webserver/auth"
	"github.com/zekurio/inviterr/internal/services/webserver/v1/controllers"
	"github.com/zekurio/inviterr/internal/util/static"
)

type Router struct {
	container di.Container
}

func (r *Router) SetContainer(container di.Container) {
	r.container = container
}

func (r *Router) Route(router fiber.Router) {
	authMw := r.container.Get(static.DiAuthMiddleware).(auth.Middleware)

	new(controllers.AuthController).Setup(r.container, router.Group("/auth"))

	router.Use(authMw.Handle)
}

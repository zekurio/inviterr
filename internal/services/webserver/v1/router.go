package v1

import (
	"github.com/gofiber/fiber/v2"
	"github.com/sarulabs/di/v2"
	"github.com/zekurio/inviterr/internal/services/webserver/v1/controllers"
)

type Router struct {
	ctn di.Container
}

func (r *Router) SetContainer(ctn di.Container) {
	r.ctn = ctn
}

func (r *Router) Route(router fiber.Router) {
	new(controllers.InviteController).Setup(r.ctn, router.Group("/invite"))

	new(controllers.PolicyController).Setup(r.ctn, router.Group("/policies"))

	new(controllers.RegisterController).Setup(r.ctn, router.Group("/register"))
}

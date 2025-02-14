package v1

import (
	"github.com/gofiber/fiber/v2"
	"github.com/sarulabs/di/v2"
)

type Router struct {
	container di.Container
}

func (r *Router) SetContainer(container di.Container) {
	r.container = container
}

func (r *Router) Route(router fiber.Router) {}
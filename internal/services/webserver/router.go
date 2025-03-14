package webserver

import (
	"github.com/gofiber/fiber/v2"
	"github.com/sarulabs/di/v2"
)

type Router interface {

	// SetContainer sets a di.Container to be
	// used for dependency injection
	SetContainer(container di.Container)

	// Route registers the API controller
	// endpoints to the passed fiber router.
	Route(router fiber.Router)
}
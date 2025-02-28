package controllers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/sarulabs/di/v2"
)

type OthersController struct {
}

func (oc *OthersController) Setup(ctn di.Container, r fiber.Router) {
	r.Get("/healthcheck", oc.HealthCheck)
}

// @Summary Health Check
// @Description Check if the service is running
// @Tags Others
// @Accept json
// @Produce json
// @Success 200 {object} fiber.Map
func (oc *OthersController) HealthCheck(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{"status": "ok"})
}

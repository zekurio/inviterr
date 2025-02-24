package controllers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/sarulabs/di/v2"
	"github.com/zekurio/inviterr/internal/models"
	"github.com/zekurio/inviterr/internal/services/invites"
	"github.com/zekurio/inviterr/internal/services/jellyfin"
	"github.com/zekurio/inviterr/internal/util/static"
)

type RegisterController struct {
	invites *invites.InviteService
	jf      *jellyfin.Wrapper
}

func (rc *RegisterController) Setup(ctn di.Container, r fiber.Router) {
	rc.invites = ctn.Get(static.DiInvites).(*invites.InviteService)
	rc.jf = ctn.Get(static.DiJellyfin).(*jellyfin.Wrapper)

	r.Post("/", rc.Register)
}

// @Summary Register User
// @Description Register user using the given invite ID
// @Tags Register
// @Accept json
// @Produce json
// @Param id path string true "Invite ID"
// @Success 200 {object} models.RegisterResponse
// @Failure 400 {object} fiber.Map
// @Failure 403 {object} fiber.Map
func (rc *RegisterController) Register(c *fiber.Ctx) error {
	inviteID := c.Query("id")
	if inviteID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invite id is required"})
	}

	valid, err := rc.invites.CheckInvite(inviteID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	if !valid {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "invalid invite"})
	}

	// register user
	err = rc.invites.ConsumeInvite(inviteID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	// create user in Jellyfin
	var req models.RegisterRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(models.Error{Error: "invalid request", Code: fiber.StatusBadRequest})
	}

	user, err := rc.jf.CreateUser(req.Username, req.Password)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(models.RegisterResponse{Username: user.GetName(), UserID: *user.Id})
}

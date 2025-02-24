package controllers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/sarulabs/di/v2"
	"github.com/zekurio/inviterr/internal/models"
	"github.com/zekurio/inviterr/internal/services/invites"
	"github.com/zekurio/inviterr/internal/util/static"
)

type InviteController struct {
	invites *invites.InviteService
}

func (ic *InviteController) Setup(ctn di.Container, r fiber.Router) {
	ic.invites = ctn.Get(static.DiInvites).(*invites.InviteService)

	r.Post("/create", ic.CreateInvite)
	r.Get("/:id/check", ic.CheckInvite)
}

// @Summary Create Invite
// @Description Create a new invite.
// @Tags Invite
// @Accept json
// @Produce json
// @Param body body models.InviteRequest true "Invite Request"
// @Success 200 {object} fiber.Map
// @Failure 400 {object} models.Error
// @Failure 500 {object} models.Error
func (ic *InviteController) CreateInvite(c *fiber.Ctx) error {
	var req models.InviteRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}

	// Call the invite service to create the invite.
	invite, err := ic.invites.CreateInvite(req)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create invite"})
	}

	// construct the full invite URL. Assumes c.BaseURL() returns the server base URL.
	inviteURL := c.BaseURL() + "/invite/" + invite.ID
	return c.JSON(fiber.Map{"invite_url": inviteURL})
}

// @Summary Check Invite Validity
// @Description Check if the invite is valid and not expired.
// @Tags Invite
// @Accept json
// @Produce json
// @Param id path string true "Invite ID"
// @Success 200
// @Failure 400 {object} models.Error
func (ic *InviteController) CheckInvite(c *fiber.Ctx) error {
	id := c.Params("id")
	valid, err := ic.invites.CheckInvite(id)
	if err != nil || !valid {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid invite"})
	}
	// redirect to the user creation page and pass the invite id as query param.
	return c.Status(fiber.StatusOK).JSON(fiber.Map{"message": "invite is valid"})
}

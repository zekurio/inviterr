package controllers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/sarulabs/di/v2"
	"github.com/zekurio/inviterr/internal/models"
	"github.com/zekurio/inviterr/internal/services/invites"
	"github.com/zekurio/inviterr/internal/services/jellyfin"
	"github.com/zekurio/inviterr/internal/util/static"
)

type InviteController struct {
	invites *invites.InviteService
	jf      *jellyfin.Wrapper
}

func (ic *InviteController) Setup(ctn di.Container, r fiber.Router) {
	ic.invites = ctn.Get(static.DiInvites).(*invites.InviteService)
	ic.jf = ctn.Get(static.DiJellyfin).(*jellyfin.Wrapper)
}

// CreateInvite handles POST /invite to create a new invite.
// Expects JSON body with policy_name, expires_at (ISO8601) and use_limit.
// It now uses the InviteService.CreateInvite method.
func (ic *InviteController) CreateInvite(c *fiber.Ctx) error {
	var req models.InviteRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid request"})
	}

	// Call the invite service to create the invite.
	invite, err := ic.invites.CreateInvite(req)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to create invite"})
	}

	// construct the full invite URL. Assumes c.BaseURL() returns the server base URL.
	inviteURL := c.BaseURL() + "/invite/" + invite.ID
	return c.JSON(fiber.Map{"invite_url": inviteURL})
}

// ProcessInvite handles GET /invite/:id.
// It validates the invite and redirects the user to the account creation page with the invite id.
func (ic *InviteController) ProcessInvite(c *fiber.Ctx) error {
	id := c.Params("id")
	valid, err := ic.invites.CheckInvite(id)
	if err != nil || !valid {
		return c.Status(400).JSON(fiber.Map{"error": "invalid or expired invite"})
	}
	// redirect to the user creation page and pass the invite id as query param.
	return c.Redirect("/register?inviteid=" + id)
}

package controllers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/sarulabs/di/v2"
	"github.com/zekurio/inviterr/internal/models"
	"github.com/zekurio/inviterr/internal/services/database"
	"github.com/zekurio/inviterr/internal/util/static"
)

type PolicyController struct {
	db database.Database
}

func (pc *PolicyController) Setup(ctn di.Container, r fiber.Router) {
	db := ctn.Get(static.DiDatabase).(database.Database)
	pc.db = db

	r.Post("/", pc.CreateOrUpdatePolicy)
	r.Get("/", pc.GetAllPolicies)
	r.Get("/:policyName", pc.GetPolicy)
	r.Delete("/:policyName", pc.DeletePolicy)
}

// CreateOrUpdatePolicy handles creation or updating of a policy.
func (pc *PolicyController) CreateOrUpdatePolicy(c *fiber.Ctx) error {
	var policy models.DehydratedPolicy
	if err := c.BodyParser(&policy); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}

	if err := pc.db.AddUpdatePolicy(policy); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.Status(fiber.StatusOK).JSON(policy)
}

// GetAllPolicies retrieves all policies.
func (pc *PolicyController) GetAllPolicies(c *fiber.Ctx) error {
	policies, err := pc.db.GetAllPolicies()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(fiber.StatusOK).JSON(policies)
}

// GetPolicy retrieves a policy by its name.
func (pc *PolicyController) GetPolicy(c *fiber.Ctx) error {
	policyName := c.Params("policyName")
	policy, err := pc.db.GetPolicyByName(policyName)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(fiber.StatusOK).JSON(policy)
}

// DeletePolicy deletes a policy by its name.
func (pc *PolicyController) DeletePolicy(c *fiber.Ctx) error {
	policyName := c.Params("policyName")
	if err := pc.db.DeletePolicyByName(policyName); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.SendStatus(fiber.StatusNoContent)
}

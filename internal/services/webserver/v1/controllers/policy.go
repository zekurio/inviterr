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

	r.Post("/", pc.CreatePolicy)
	r.Put("/:id", pc.UpdatePolicy)
	r.Get("/", pc.GetAllPolicies)
	r.Get("/:id", pc.GetPolicy)
	r.Delete("/:id", pc.DeletePolicy)
}

// @Summary Create Policy
// @Description Create a new policy.
// @Tags Policy
// @Accept json
// @Produce json
// @Param body body models.DehydratedPolicy true "New Policy data"
// @Success 201 {object} models.DehydratedPolicy
// @Failure 400 {object} models.Error
// @Failure 500 {object} models.Error
func (pc *PolicyController) CreatePolicy(c *fiber.Ctx) error {
	var policy models.DehydratedPolicy
	if err := c.BodyParser(&policy); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(models.Error{Error: "invalid request", Code: fiber.StatusBadRequest})
	}

	if err := pc.db.AddUpdatePolicy(policy); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(models.Error{Error: err.Error(), Code: fiber.StatusInternalServerError})
	}

	return c.Status(fiber.StatusCreated).JSON(policy)
}

// @Summary Update Policy
// @Description Update an existing policy.
// @Tags Policy
// @Accept json
// @Produce json
// @Param id path string true "Policy ID"
// @Param body body models.DehydratedPolicy true "Updated Policy data"
// @Success 200 {object} models.DehydratedPolicy
// @Failure 400 {object} models.Error
// @Failure 500 {object} models.Error
func (pc *PolicyController) UpdatePolicy(c *fiber.Ctx) error {
	policyName := c.Params("id")
	var policy models.DehydratedPolicy
	if err := c.BodyParser(&policy); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(models.Error{Error: "invalid request", Code: fiber.StatusBadRequest})
	}

	policy.PolicyName = policyName

	if err := pc.db.AddUpdatePolicy(policy); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(models.Error{Error: err.Error(), Code: fiber.StatusInternalServerError})
	}

	return c.Status(fiber.StatusOK).JSON(policy)
}

// @Summary Get All Policies
// @Description Get all policies.
// @Tags Policy
// @Accept json
// @Produce json
// @Success 200 {object} []models.DehydratedPolicy
// @Failure 500 {object} models.Error
func (pc *PolicyController) GetAllPolicies(c *fiber.Ctx) error {
	policies, err := pc.db.GetAllPolicies()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(models.Error{Error: err.Error(), Code: fiber.StatusInternalServerError})
	}
	return c.Status(fiber.StatusOK).JSON(policies)
}

// @Summary Get Policy
// @Description Get a policy by its id.
// @Tags Policy
// @Accept json
// @Produce json
// @Param id path string true "Policy ID"
// @Success 200 {object} models.DehydratedPolicy
// @Failure 404 {object} models.Error
func (pc *PolicyController) GetPolicy(c *fiber.Ctx) error {
	policyName := c.Params("id")
	policy, err := pc.db.GetPolicyByName(policyName)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(fiber.StatusOK).JSON(policy)
}

// @Summary Delete Policy
// @Description Delete a policy by its id.
// @Tags Policy
// @Accept json
// @Produce json
// @Param id path string true "Policy ID"
// @Success 204
// @Failure 500 {object} models.Error
func (pc *PolicyController) DeletePolicy(c *fiber.Ctx) error {
	policyName := c.Params("id")
	if err := pc.db.DeletePolicyByName(policyName); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.SendStatus(fiber.StatusNoContent)
}

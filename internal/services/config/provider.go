package config

import "github.com/zekurio/inviterr/internal/models"

type Provider interface {
	Config() *models.Config
	Parse() error
}
package config

import (
	"os"

	"github.com/joho/godotenv"
	"github.com/traefik/paerser/env"
	"github.com/traefik/paerser/file"
	"github.com/zekurio/inviterr/internal/models"
)

type Paerser struct {
	cfg        *models.Config
	configFile string
	envPrefix  string
}

func NewPaerser(configFile string, envPrefix string) *Paerser {
	return &Paerser{
		configFile: configFile,
		envPrefix:  envPrefix,
	}
}


func (p *Paerser) Config() *models.Config {
	return p.cfg
}


func (p *Paerser) Parse() (err error) {
	cfg := models.DefaultConfig

	if err = file.Decode(p.configFile, &cfg); err != nil && !os.IsNotExist(err) {
		return
	}

	godotenv.Load()
	if err = env.Decode(os.Environ(), p.envPrefix, &cfg); err != nil {
		return
	}

	p.cfg = &cfg

	return
}
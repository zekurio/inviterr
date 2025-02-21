package inits

import (
	"strings"

	"github.com/sarulabs/di/v2"
	"github.com/zekurio/inviterr/internal/models"
	"github.com/zekurio/inviterr/internal/services/database"
	"github.com/zekurio/inviterr/internal/services/database/postgres"
	"github.com/zekurio/inviterr/internal/util/static"
)

func InitDatabase(ctn di.Container) (database.Database, error) {
	var (
		db  database.Database
		err error
	)

	cfg := ctn.Get(static.DiConfig).(models.Config)

	switch strings.ToLower(cfg.Database.Type) {
	case "postgres", "pg", "postgresql":
		db, err = postgres.New(ctn)
	default:
		err = database.ErrUnsupportedProviderType
	}

	return db, err
}

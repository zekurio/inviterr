package inits

import (
	"github.com/charmbracelet/log"
	"github.com/sarulabs/di/v2"
	"github.com/zekurio/inviterr/internal/models"
	"github.com/zekurio/inviterr/internal/services/webserver"
	"github.com/zekurio/inviterr/internal/util/static"
)

func InitWebserver(ctn di.Container) (interface{}, error) {
	cfg := ctn.Get(static.DiConfig).(models.Config)
	l := ctn.Get(static.DiLogger).(*log.Logger)

	l.SetPrefix("webserver")

	l.Infof("Starting webserver on %s", cfg.WebServer.BindAddr)

	ws, err := webserver.New(ctn)
	if err != nil {
		return nil, err
	}

	go func() {
		if err = ws.ListenAndServeBlocking(); err != nil {
			log.Fatal("Failed starting up web server")
		}
	}()

	log.Info("Webserver running", "addr", cfg.WebServer.BindAddr,
		"public_addr", cfg.WebServer.PublicAddr)

	return ws, nil
}
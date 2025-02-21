package main

import (
	"flag"
	"os"
	"os/signal"
	"syscall"

	"github.com/charmbracelet/log"
	"github.com/sarulabs/di/v2"

	"github.com/zekurio/inviterr/internal/inits"
	"github.com/zekurio/inviterr/internal/models"
	"github.com/zekurio/inviterr/internal/services/config"
	"github.com/zekurio/inviterr/internal/services/invites"
	"github.com/zekurio/inviterr/internal/services/jellyfin"
	"github.com/zekurio/inviterr/internal/util/startuptime"
	"github.com/zekurio/inviterr/internal/util/static"
)

var (
	flagConfigPath = flag.String("c", "/etc/inviterr/config.yaml", "The path to the config file")
)

func main() {
	flag.Parse()

	diBuilder, _ := di.NewBuilder()

	logger := log.NewWithOptions(os.Stderr, log.Options{
		ReportTimestamp: true,
	})

	// Initialize logger
	diBuilder.Add(di.Def{
		Name: static.DiLogger,
		Build: func(ctn di.Container) (interface{}, error) {
			return logger, nil
		},
	})

	// Initialize config
	diBuilder.Add(di.Def{
		Name: static.DiConfig,
		Build: func(ctn di.Container) (interface{}, error) {
			return config.Parse(*flagConfigPath, "INVITERR_", models.DefaultConfig)
		},
	})

	// Initialize database
	diBuilder.Add(di.Def{
		Name: static.DiDatabase,
		Build: func(ctn di.Container) (interface{}, error) {
			return inits.InitDatabase(ctn)
		},
	})

	// Initialize jellyfin client
	diBuilder.Add(di.Def{
		Name: static.DiJellyfin,
		Build: func(ctn di.Container) (interface{}, error) {
			return jellyfin.New(ctn), nil
		},
	})

	// Initialize invites service
	diBuilder.Add(di.Def{
		Name: static.DiInvites,
		Build: func(ctn di.Container) (interface{}, error) {
			return invites.New(ctn)
		},
	})

	// Initialize webserver
	diBuilder.Add(di.Def{
		Name: static.DiWebServer,
		Build: func(ctn di.Container) (interface{}, error) {
			return inits.InitWebserver(ctn)
		},
	})

	ctn := diBuilder.Build()
	// Tear down dependency instances
	defer ctn.DeleteWithSubContainers()

	// Setting log level from config
	ctn.Get(static.DiConfig)

	// Start database
	ctn.Get(static.DiDatabase)

	// Start webserver
	ctn.Get(static.DiWebServer)

	// Block main go routine until one of the following

	// specified exit syscalls occure.
	log.Info("Started event loop. Stop with CTRL-C...")

	log.Info("Initialization finished", "took", startuptime.Took())
	sc := make(chan os.Signal, 1)
	signal.Notify(sc, syscall.SIGINT, syscall.SIGTERM, os.Interrupt, os.Kill)
	<-sc
}

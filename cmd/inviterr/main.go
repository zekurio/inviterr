package main

import (
	"flag"
	"os"
	"os/signal"
	"syscall"

	"github.com/charmbracelet/log"
	"github.com/sarulabs/di/v2"

	"github.com/zekurio/inviterr/internal/services/config"
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
		ReportCaller: true,
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
			return config.NewPaerser(*flagConfigPath, "MF_"), nil
		},
	})

	// Initialize jellyfin client
	diBuilder.Add(di.Def{
		Name: static.DiJellyfinClient,
		Build: func(ctn di.Container) (interface{}, error) {
			return jellyfin.New(ctn), nil
		},
	})
	
	ctn := diBuilder.Build()
	// Tear down dependency instances
	defer ctn.DeleteWithSubContainers()


	// Setting log level from config
	cfg := ctn.Get(static.DiConfig).(config.Provider)
	if err := cfg.Parse(); err != nil {
		log.Fatalf("Failed to parse config: %v", err)
	}

	jf := ctn.Get(static.DiJellyfinClient).(*jellyfin.Wrapper)

	users, err := jf.ListUsers()
	if err != nil {
		log.Fatalf("Failed to get users: %v", err)
	}

	for _, user := range users {
		log.Info("User", "user", *user.Name.Get())
	}

	// Block main go routine until one of the following

	// specified exit syscalls occure.
	log.Info("Started event loop. Stop with CTRL-C...")

	log.Info("Initialization finished", "took", startuptime.Took())
	sc := make(chan os.Signal, 1)
	signal.Notify(sc, syscall.SIGINT, syscall.SIGTERM, os.Interrupt, os.Kill)
	<-sc
}
package webserver

import (
	"github.com/gofiber/fiber/v2"
	"github.com/sarulabs/di/v2"
	"github.com/zekurio/inviterr/internal/models"
	"github.com/zekurio/inviterr/internal/services/config"
	"github.com/zekurio/inviterr/internal/util/static"
)

type WebServer struct {
	app       *fiber.App
	cfg       config.Provider
	container di.Container
}

func New(container di.Container) (ws *WebServer, err error) {
	ws = new(WebServer)

	ws.container = container
	ws.cfg = container.Get(static.DiConfig).(config.Provider)

	ws.app = fiber.New(fiber.Config{
		AppName:               "inviterr",
		ErrorHandler:          ws.errorHandler,
		ServerHeader:          "inviterr",
		DisableStartupMessage: true,
		ProxyHeader:           "X-Forwarded-For",
	})


	return ws, nil
}

func (ws *WebServer) errorHandler(ctx *fiber.Ctx, err error) error {
	if fErr, ok := err.(*fiber.Error); ok {
		if fErr == fiber.ErrUnprocessableEntity {
			fErr = fiber.ErrBadRequest
		}

		ctx.Status(fErr.Code)
		return ctx.JSON(&models.Error{
			Error: fErr.Message,
			Code:  fErr.Code,
		})
	}


	return ws.errorHandler(ctx,
		fiber.NewError(fiber.StatusInternalServerError, err.Error()))
}
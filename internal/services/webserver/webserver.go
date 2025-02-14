package webserver

import (
	"errors"

	"github.com/gofiber/fiber/v2"
	"github.com/sarulabs/di/v2"
	"github.com/zekurio/inviterr/internal/models"
	"github.com/zekurio/inviterr/internal/util/static"
)

type WebServer struct {
	app       *fiber.App
	cfg       models.Config
	container di.Container
}

func New(container di.Container) (ws *WebServer, err error) {
	ws = new(WebServer)

	ws.container = container
	ws.cfg = container.Get(static.DiConfig).(models.Config)

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

func (ws *WebServer) registerRouter(router Router, routes []string, middlewares ...fiber.Handler) {
	router.SetContainer(ws.container)
	for _, r := range routes {
		router.Route(ws.app.Group(r, middlewares...))
	}
}

func (ws *WebServer) ListenAndServeBlocking() error {
	tls := ws.cfg.WebServer.TLS

	if tls.Enabled {
		if tls.Cert == "" || tls.Key == "" {
			return errors.New("cert file and key file must be specified")
		}
		return ws.app.ListenTLS(ws.cfg.WebServer.BindAddr, tls.Cert, tls.Key)
	}

	return ws.app.Listen(ws.cfg.WebServer.BindAddr)
}
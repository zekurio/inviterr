package auth

import (
	"errors"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v4"
	"github.com/sarulabs/di/v2"
	"github.com/zekurio/inviterr/internal/models"
	"github.com/zekurio/inviterr/internal/util/static"
)

type AuthMiddleware struct {
	secret string
}

func NewAuthMiddleware(ctn di.Container) *AuthMiddleware {
	cfg := ctn.Get(static.DiConfig).(models.Config)

	return &AuthMiddleware{
		secret: cfg.WebServer.Secret,
	}
}

func (m *AuthMiddleware) Handle(ctx *fiber.Ctx) error {
	// Extract the Authorization header
	authHeader := ctx.Get("Authorization")
	if authHeader == "" {
		return ctx.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Missing authorization header"})
	}

	// Expect header in the format "Bearer <token>"
	parts := strings.Split(authHeader, " ")
	if len(parts) != 2 || parts[0] != "Bearer" {
		return ctx.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid authorization header format"})
	}

	tokenString := parts[1]
	// Parse and validate the JWT
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		// Ensure the signing method is HMAC
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return m.secret, nil
	})

	if err != nil || !token.Valid {
		return ctx.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid token"})
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return ctx.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid token claims"})
	}

	if claims["type"] != "bearer" {
		return ctx.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid token type"})
	}

	exp := int64(claims["exp"].(float64))
	if time.Unix(exp, 0).Before(time.Now()) {
		return ctx.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Token expired"})
	}

	ctx.Locals("user_id", claims["user_id"])
	ctx.Locals("jf_token", claims["jf_token"])

	return ctx.Next()
}

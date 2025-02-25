package models

import "time"

type Error struct {
	Error string `json:"error"`
	Code  int    `json:"code"`
}

type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type InviteRequest struct {
	TemplateUserID string    `json:"template_user_id"`
	ExpiresAt      time.Time `json:"expires_at"`
	UseLimit       int       `json:"use_limit"`
}

type RegisterRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type RegisterResponse struct {
	Username string `json:"username"`
	UserID   string `json:"user_id"`
}

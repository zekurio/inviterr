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
	PolicyName string    `json:"policy_name"`
	ExpiresAt  time.Time `json:"expires_at"`
	UseLimit   int       `json:"use_limit"`
}

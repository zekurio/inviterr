package models

type Error struct {
	Error string `json:"error"`
	Code  int    `json:"code"`
}

type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

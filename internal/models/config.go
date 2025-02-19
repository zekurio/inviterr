package models

import "github.com/zekurio/inviterr/pkg/random"

var DefaultConfig = Config{
	WebServer: WebServer{
		BindAddr:   "0.0.0.0:8080",
		PublicAddr: "http://invite.me",
		Secret:     random.MustGetRandBase64Str(64),
		TLS: WebServerTLS{
			Enabled: false,
			Cert:    "",
			Key:     "",
		},
	},
	Jellyfin: JellyfinConfig{
		BaseURL: "http://jellyfin:8096",
		APIKey:  "API_KEY",
	},
}

type Config struct {
	WebServer  WebServer
	Jellyfin   JellyfinConfig
	Jellyseerr JellyseerrConfig
	Database   DatabaseConfig
}

type WebServer struct {
	BindAddr   string
	PublicAddr string
	Secret     string
	TLS        WebServerTLS
}

type WebServerTLS struct {
	Enabled bool
	Cert    string
	Key     string
}

type JellyfinConfig struct {
	BaseURL string
	APIKey  string
}

type JellyseerrConfig struct {
	BaseURL string
	APIKey  string
}

type DatabaseConfig struct {
	Type     string
	Postgres PostgresConfig
}

type PostgresConfig struct {
	Host     string
	Port     int
	Database string
	Username string
	Password string
}

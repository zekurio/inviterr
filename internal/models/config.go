package models

var DefaultConfig = Config{}

type Config struct {
	WebServer  WebServer
	Jellyfin   JellyfinConfig
	Jellyseerr JellyseerrConfig
}

type WebServer struct {
	Addr string
	TLS  WebServerTLS
}

type WebServerTLS struct {
	Enabled bool
	Cert    string
	Key     string
}

type JellyfinConfig struct {
	Enabled  bool
	BaseURL  string
	APIKey   string
	Username string
	Password string
}

type JellyseerrConfig struct {
	Enabled bool
	BaseURL string
	APIKey  string
}

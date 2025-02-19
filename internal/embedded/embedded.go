package embedded

import "embed"

//go:embed migrations
var Migrations embed.FS

//go:embed AppVersion.txt
var AppVersion string

//go:embed AppCommit.txt
var AppCommit string

//go:embed AppBuildTime.txt
var AppBuildTime string

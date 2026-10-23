// Production server entry. Mirrors Nitro's node-server preset entry
// (nitro/dist/presets/node/runtime/node-server.mjs) minus the websocket,
// scheduled-task and tracing wiring the app does not use, so that the app
// owns shutdown: srvx's built-in handler closes the listener on SIGINT/SIGTERM
// but never exits, and the process lingered until systemd killed it (#39).
import { useNitroApp } from "nitro/app"
import { serve } from "srvx/node"

import { createChildLogger } from "@/server/logger"
import { createShutdown } from "@/server/shutdown"

const log = createChildLogger({ module: "server" })
const nitroApp = useNitroApp()

const parsedPort = Number.parseInt(
  process.env.NITRO_PORT ?? process.env.PORT ?? "",
  10,
)
const cert = process.env.NITRO_SSL_CERT
const key = process.env.NITRO_SSL_KEY

const server = serve({
  port: Number.isNaN(parsedPort) ? 3000 : parsedPort,
  hostname: process.env.NITRO_HOST || process.env.HOST,
  tls: cert && key ? { cert, key } : undefined,
  fetch: nitroApp.fetch,
  gracefulShutdown: false,
})

const shutdown = createShutdown({
  close: () => server.close(),
  beforeExit: async () => {
    await nitroApp.hooks?.callHook("close")
  },
  exit: (code) => process.exit(code),
})

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => void shutdown(signal))
}

process.on("unhandledRejection", (error) => {
  captureError(error, "unhandledRejection")
})
process.on("uncaughtException", (error) => {
  captureError(error, "uncaughtException")
})

function captureError(error: unknown, type: string): void {
  log.error({ err: error, type }, "Unhandled error")
  nitroApp.captureError?.(
    error instanceof Error ? error : new Error(String(error)),
    { tags: [type] },
  )
}

export default {}

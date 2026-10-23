import { createChildLogger } from "@/server/logger"

const log = createChildLogger({ module: "shutdown" })

// Upper bound for in-flight requests to finish after a stop signal. Past it the
// process exits with them still open, so a stuck upstream call cannot hold the
// service until systemd's TimeoutStopSec (90 s by default) kills it.
export const SHUTDOWN_GRACE_MS = 10_000

type ShutdownOptions = {
  // Stops accepting connections and resolves once in-flight requests finish.
  close: () => Promise<void>
  // Runs after the listener closed, right before the process exits.
  beforeExit?: () => Promise<unknown>
  exit: (code: number) => void
  graceMs?: number
}

// Builds the signal handler that stops the server and then exits the process.
// Exiting explicitly matters: installing a signal listener disables the
// runtime's default termination, and React's server renderer keeps a started
// MessagePort around that pins the Deno event loop even after the listener is
// closed, so the process would otherwise linger forever. A second signal while
// shutting down exits immediately.
export function createShutdown(
  options: ShutdownOptions,
): (signal: string) => Promise<void> {
  const graceMs = options.graceMs ?? SHUTDOWN_GRACE_MS
  let shuttingDown = false

  return async (signal) => {
    if (shuttingDown) {
      log.warn({ signal }, "Received another stop signal, exiting immediately")
      options.exit(1)
      return
    }

    shuttingDown = true
    log.info({ signal }, "Stopping server")

    try {
      const closedInTime = await settlesWithin(options.close(), graceMs)
      if (!closedInTime) {
        log.warn({ graceMs }, "Exiting with requests still in flight")
      }
      await options.beforeExit?.()
      log.info("Server stopped")
      options.exit(0)
    } catch (err) {
      log.error({ err }, "Shutdown failed, exiting anyway")
      options.exit(1)
    }
  }
}

async function settlesWithin(
  promise: Promise<unknown>,
  ms: number,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), ms)
  })
  // A rejection after the timeout won fires as an unhandled rejection otherwise.
  promise.catch(() => undefined)

  try {
    return await Promise.race([promise.then(() => true), timeout])
  } finally {
    clearTimeout(timer)
  }
}

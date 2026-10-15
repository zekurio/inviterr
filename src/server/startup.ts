import { configManager } from "@/lib/server/config.server"
import { pruneExpiredAccessRequests } from "@/server/access-requests"
import { kickOffAuditPruning } from "@/server/audit"
import { createChildLogger } from "@/server/logger"
import { startPasswordResetNotificationWatcher } from "@/server/password-reset-notifications"
import {
  runUserStartupMaintenance,
  startUserExpiryMaintenanceScheduler,
} from "@/server/user-lifecycle"

const log = createChildLogger({ module: "startup" })

let startupPromise: Promise<void> | null = null

export function runStartupTasks(): void {
  if (startupPromise !== null) {
    return
  }

  if (!configManager.isConfigured()) {
    if (configManager.needsOnboarding()) {
      log.info("Skipping startup tasks until onboarding is complete")
    } else if (configManager.hasError()) {
      log.warn(
        { error: configManager.getError() },
        "Skipping startup tasks due to config error",
      )
    }

    return
  }

  startupPromise = (async () => {
    log.info("Running startup tasks")
    startPasswordResetNotificationWatcher()
    startUserExpiryMaintenanceScheduler()
    // Independent of Jellyfin, so a failed user sync does not skip pruning.
    kickOffAuditPruning()
    // Local-only cleanup runs first so a Jellyfin outage cannot keep expired
    // applicant data around.
    await pruneExpiredAccessRequests().catch((err: unknown) => {
      log.warn({ err }, "Failed to prune expired access requests")
    })
    await runUserStartupMaintenance()

    log.info("Jellyfin user sync complete")
  })().catch((err) => {
    log.error({ err }, "Startup tasks failed")
    startupPromise = null
  })
}

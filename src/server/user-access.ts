import { SYSTEM_AUDIT_ACTOR } from "@/lib/audit"
import { recordAuditEvent } from "@/server/audit"
import { updateUserPolicy } from "@/server/jellyfin"
import { createChildLogger } from "@/server/logger"
import { revokeAllUserSessions } from "@/server/session"
import { isUserExpired } from "@/server/user-expiry"

const log = createChildLogger({ module: "user-access" })

type EnforceExpiredUserAccessInput = {
  userId: string
  userName?: string | null
  expiresAt: Date | null
  isAdmin: boolean
  isDisabled: boolean
}

export async function enforceExpiredUserAccess(
  input: EnforceExpiredUserAccessInput,
  now = new Date(),
): Promise<boolean> {
  if (!isUserExpired({ expiresAt: input.expiresAt }, input.isAdmin, now)) {
    return false
  }

  let disableError: unknown = null
  if (!input.isDisabled) {
    try {
      await updateUserPolicy(input.userId, { isDisabled: true })
      log.info(
        {
          userId: input.userId,
          userName: input.userName ?? null,
          expiresAt: input.expiresAt,
        },
        "Disabled expired Jellyfin user",
      )
      // Only the enabled -> disabled transition is recorded; repeated sweeps
      // over an already disabled user do not add rows.
      await recordAuditEvent(SYSTEM_AUDIT_ACTOR, {
        action: "user.expired",
        target: { id: input.userId, label: input.userName },
        details: { expiresAt: input.expiresAt?.toISOString() ?? null },
      })
    } catch (err) {
      disableError = err
      log.warn(
        {
          err,
          userId: input.userId,
          userName: input.userName ?? null,
          expiresAt: input.expiresAt,
        },
        "Failed to disable expired Jellyfin user before revoking sessions",
      )
    }
  }

  await revokeAllUserSessions(input.userId)

  if (disableError) {
    throw disableError
  }

  return true
}

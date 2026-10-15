import { and, count, eq, gt, inArray, isNull, lt, lte, or } from "drizzle-orm"
import type { StaticDecode } from "typebox"

import {
  ErrorCode,
  error,
  success,
  type ActionResult,
} from "@/lib/api/contracts/errors"
import { resolveLocale } from "@/lib/i18n"
import { accessRequestFormSchema, normalizeEmail } from "@/lib/schemas"
import { configManager } from "@/lib/server/config.server"
import { safeParse } from "@/lib/validation"
import { db, ensureMigrated, getUserByEmail } from "@/server/db"
import { access_requests, invites, users } from "@/server/db/schema"
import { isEmailConfigured } from "@/server/email"
import { sendConfiguredEmail } from "@/server/email/messages"
import { getAllUsers } from "@/server/jellyfin"
import { createChildLogger } from "@/server/logger"

const log = createChildLogger({ module: "access-requests" })

const ACCESS_REQUEST_TTL_MS = 14 * 24 * 60 * 60 * 1000
// Bounds the rows and admin emails an unauthenticated caller can create
// when many client IPs bypass the per-IP limiter.
const MAX_PENDING_ACCESS_REQUESTS = 100

export function isAccessRequestDeliveryReady(): boolean {
  return isEmailConfigured() && configManager.appUrl !== undefined
}

export function isAccessRequestsEnabled(): boolean {
  return (
    configManager.isConfigured() &&
    configManager.accessRequests.enabled &&
    isAccessRequestDeliveryReady()
  )
}

export async function submitAccessRequest(
  input: StaticDecode<typeof accessRequestFormSchema>,
): Promise<ActionResult<null>> {
  const parsed = safeParse(accessRequestFormSchema, input)
  if (!parsed.success) {
    return error(ErrorCode.VALIDATION_FAILED, parsed.error.issues[0]?.message)
  }

  if (!isAccessRequestsEnabled()) {
    return error(
      ErrorCode.FORBIDDEN,
      "Access requests are not available",
      "errors.accessRequestsUnavailable",
    )
  }

  const email = normalizeEmail(parsed.data.email)
  const now = new Date()
  await pruneExpiredAccessRequests(now)

  // Checked before the dedupe below so a full queue rejects every address
  // alike instead of revealing which ones are already known.
  const [pending] = await db.select({ total: count() }).from(access_requests)
  if ((pending?.total ?? 0) >= MAX_PENDING_ACCESS_REQUESTS) {
    log.warn("Rejected access request because the pending queue is full")
    return error(ErrorCode.RATE_LIMITED)
  }

  // Every outcome below returns the same success response, so the public
  // endpoint never reveals whether an address has an account, an open
  // request, or an outstanding invite.
  if (await hasAccessOrOutstandingInvite(email, now)) {
    log.info("Ignored access request for an address that already has access")
    return success(null)
  }

  const [created] = await db
    .insert(access_requests)
    .values({
      id: crypto.randomUUID(),
      email,
      message: parsed.data.message || null,
      expires_at: new Date(now.getTime() + ACCESS_REQUEST_TTL_MS),
      created_at: now,
    })
    .onConflictDoNothing()
    .returning({ id: access_requests.id })

  if (!created) {
    log.info("Ignored duplicate access request")
    return success(null)
  }

  log.info({ requestId: created.id }, "Recorded access request")
  // Admin lookup and SMTP stay off the request path so response timing does
  // not depend on Jellyfin or the mail server.
  void notifyAdminsOfAccessRequest(email).catch((err: unknown) => {
    log.warn({ err, requestId: created.id }, "Failed to notify admins")
  })

  return success(null)
}

async function hasAccessOrOutstandingInvite(
  email: string,
  now: Date,
): Promise<boolean> {
  if (await getUserByEmail(email)) {
    return true
  }

  const [invite] = await db
    .select({ id: invites.id })
    .from(invites)
    .where(
      and(
        eq(invites.email, email),
        eq(invites.isDisabled, false),
        or(isNull(invites.expiresAt), gt(invites.expiresAt, now)),
        or(isNull(invites.useLimit), lt(invites.useCount, invites.useLimit)),
      ),
    )
    .limit(1)

  return invite !== undefined
}

// Jellyfin owns admin status and Inviterr owns email addresses, so recipients
// are enabled Jellyfin admins with a verified address on file here.
async function notifyAdminsOfAccessRequest(
  applicantEmail: string,
): Promise<void> {
  const appUrl = configManager.appUrl
  if (!appUrl || !isEmailConfigured()) {
    return
  }

  const adminIds = (await getAllUsers())
    .filter((user) => user.isAdmin && !user.isDisabled)
    .map((user) => user.id)
  if (adminIds.length === 0) {
    return
  }

  const recipients = await db
    .select({ userId: users.userId, email: users.email, locale: users.locale })
    .from(users)
    .where(and(inArray(users.userId, adminIds), eq(users.emailVerified, true)))
  const reviewUrl = new URL("/dashboard/users", appUrl).toString()

  await Promise.all(
    recipients.map(async (recipient) => {
      if (!recipient.email) {
        return
      }

      await sendConfiguredEmail(recipient.email, {
        type: "accessRequestReceived",
        payload: {
          applicantEmail,
          reviewUrl,
          locale: resolveLocale(recipient.locale, configManager.defaultLocale),
        },
      }).catch((err: unknown) => {
        log.warn(
          { err, userId: recipient.userId },
          "Failed to email admin about an access request",
        )
      })
    }),
  )
}

export async function pruneExpiredAccessRequests(
  now = new Date(),
): Promise<number> {
  await ensureMigrated()
  const removed = await db
    .delete(access_requests)
    .where(lte(access_requests.expires_at, now))
    .returning({ id: access_requests.id })

  if (removed.length > 0) {
    log.info({ count: removed.length }, "Pruned expired access requests")
  }

  return removed.length
}

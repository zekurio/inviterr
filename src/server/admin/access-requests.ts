import { and, asc, count, eq, gt } from "drizzle-orm"

import {
  ErrorCode,
  error,
  success,
  type ActionResult,
} from "@/lib/api/contracts/errors"
import {
  denyAccessRequestSchema,
  type DenyAccessRequestInput,
} from "@/lib/schemas"
import { configManager } from "@/lib/server/config.server"
import { safeParse } from "@/lib/validation"
import { isAccessRequestDeliveryReady } from "@/server/access-requests"
import { insertInviteWithGeneratedCode } from "@/server/admin/invites"
import type {
  AccessRequestDecisionDto,
  AccessRequestsSettingsDto,
  PendingAccessRequestsDto,
  UpdateAccessRequestsSettingsInput,
} from "@/server/api/schemas/admin-schemas"
import { db, ensureMigrated } from "@/server/db"
import {
  access_requests,
  invites,
  profiles,
  type AccessRequest,
} from "@/server/db/schema"
import { isEmailConfigured } from "@/server/email"
import { sendConfiguredEmail } from "@/server/email/messages"
import { formatExpiryEmailDate } from "@/server/email/notifications"
import { createChildLogger } from "@/server/logger"

const log = createChildLogger({ module: "admin-access-requests" })

const ACCESS_REQUEST_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

export async function listAccessRequestsService(): Promise<
  ActionResult<PendingAccessRequestsDto>
> {
  await ensureMigrated()
  const [rows, profile] = await Promise.all([
    db
      .select()
      .from(access_requests)
      .where(gt(access_requests.expires_at, new Date()))
      .orderBy(asc(access_requests.created_at)),
    resolveAccessRequestProfile(),
  ])

  return success({
    requests: rows.map((request) => ({
      id: request.id,
      email: request.email,
      message: request.message,
      createdAt: request.created_at.toISOString(),
      expiresAt: request.expires_at.toISOString(),
    })),
    profileName: profile?.name ?? null,
  })
}

export async function countPendingAccessRequests(): Promise<number> {
  await ensureMigrated()
  const [row] = await db
    .select({ total: count() })
    .from(access_requests)
    .where(gt(access_requests.expires_at, new Date()))
  return row?.total ?? 0
}

export async function approveAccessRequestService(
  requestId: string,
  createdById: string | undefined,
): Promise<ActionResult<AccessRequestDecisionDto>> {
  const appUrl = configManager.appUrl
  if (!isEmailConfigured()) {
    return error(ErrorCode.EMAIL_NOT_CONFIGURED)
  }
  if (!appUrl) {
    return error(
      ErrorCode.OPERATION_FAILED,
      "Application URL is not configured",
      "errors.applicationUrlNotConfigured",
    )
  }

  await ensureMigrated()
  const profile = await resolveAccessRequestProfile()
  if (!profile) {
    return error(
      ErrorCode.NOT_FOUND,
      "No profile is available for new members",
      "errors.noInviteProfile",
    )
  }

  const now = new Date()
  const expiresAt = new Date(now.getTime() + ACCESS_REQUEST_INVITE_TTL_MS)
  // A single DELETE ... RETURNING claims the row atomically, so exactly one of
  // several concurrent approvals proceeds and the rest see NOT_FOUND.
  const [request] = await db
    .delete(access_requests)
    .where(
      and(
        eq(access_requests.id, requestId),
        gt(access_requests.expires_at, now),
      ),
    )
    .returning()
  if (!request) {
    return error(ErrorCode.NOT_FOUND, "Access request not found")
  }

  const invite = await insertInviteWithGeneratedCode({
    profileId: profile.id,
    email: request.email,
    isDisabled: false,
    useLimit: 1,
    useCount: 0,
    expiresAt,
    createdById: createdById ?? null,
    createdAt: now,
  }).catch(async (err: unknown) => {
    await restoreAccessRequest(request, null)
    throw err
  })
  if (!invite) {
    await restoreAccessRequest(request, null)
    return error(
      ErrorCode.OPERATION_FAILED,
      "Failed to generate unique invite code. Please try again.",
    )
  }

  const locale = configManager.defaultLocale
  try {
    await sendConfiguredEmail(request.email, {
      type: "accessRequestApproved",
      payload: {
        inviteUrl: new URL(`/invite/${invite.code}`, appUrl).toString(),
        expiryDate: formatExpiryEmailDate(expiresAt, locale),
        locale,
      },
    })
  } catch (err) {
    log.error(
      { err, requestId },
      "Failed to email an approved access request; restoring it",
    )
    await restoreAccessRequest(request, invite.id)
    return error(ErrorCode.EMAIL_SERVICE_ERROR)
  }

  log.info(
    { requestId, inviteId: invite.id, profileId: profile.id },
    "Approved access request",
  )
  return success({ requestId })
}

export async function denyAccessRequestService(
  input: DenyAccessRequestInput,
): Promise<ActionResult<AccessRequestDecisionDto>> {
  const parsed = safeParse(denyAccessRequestSchema, input)
  if (!parsed.success) {
    return error(ErrorCode.VALIDATION_FAILED, parsed.error.issues[0]?.message)
  }

  if (parsed.data.notify && !isEmailConfigured()) {
    return error(ErrorCode.EMAIL_NOT_CONFIGURED)
  }

  await ensureMigrated()
  const [request] = await db
    .delete(access_requests)
    .where(eq(access_requests.id, parsed.data.requestId))
    .returning()
  if (!request) {
    return error(ErrorCode.NOT_FOUND, "Access request not found")
  }

  if (parsed.data.notify) {
    try {
      await sendConfiguredEmail(request.email, {
        type: "accessRequestDenied",
        payload: {
          reason: parsed.data.reason || null,
          locale: configManager.defaultLocale,
        },
      })
    } catch (err) {
      log.error(
        { err, requestId: request.id },
        "Failed to email a denied access request; restoring it",
      )
      await restoreAccessRequest(request, null)
      return error(ErrorCode.EMAIL_SERVICE_ERROR)
    }
  }

  log.info(
    { requestId: request.id, notified: parsed.data.notify },
    "Denied access request",
  )
  return success({ requestId: request.id })
}

// The applicant never received the decision, so put the request back for the
// admin to retry. An approval's invite is unused at this point and goes too.
async function restoreAccessRequest(
  request: AccessRequest,
  inviteId: string | null,
): Promise<void> {
  await db
    .transaction(async (tx) => {
      if (inviteId) {
        await tx
          .delete(invites)
          .where(and(eq(invites.id, inviteId), eq(invites.useCount, 0)))
      }
      await tx.insert(access_requests).values(request).onConflictDoNothing()
    })
    .catch((err: unknown) => {
      log.error(
        { err, requestId: request.id, inviteId },
        "Failed to restore an access request after an email failure",
      )
    })
}

async function resolveAccessRequestProfile(): Promise<{
  id: string
  name: string
} | null> {
  const configuredProfileId = configManager.accessRequests.profileId
  if (configuredProfileId) {
    const [configured] = await db
      .select({ id: profiles.id, name: profiles.name })
      .from(profiles)
      .where(eq(profiles.id, configuredProfileId))
    if (configured) {
      return configured
    }
  }

  const [defaultProfile] = await db
    .select({ id: profiles.id, name: profiles.name })
    .from(profiles)
    .where(eq(profiles.isDefault, true))
  return defaultProfile ?? null
}

export async function projectAccessRequestsSettingsDto(): Promise<AccessRequestsSettingsDto> {
  await ensureMigrated()
  const profileOptions = await db
    .select({
      id: profiles.id,
      name: profiles.name,
      isDefault: profiles.isDefault,
    })
    .from(profiles)
    .orderBy(asc(profiles.name))
  const config = configManager.accessRequests

  return {
    enabled: config.enabled,
    profileId: config.profileId ?? null,
    deliveryReady: isAccessRequestDeliveryReady(),
    profiles: profileOptions,
  }
}

export async function updateAccessRequestsSettingsService(
  input: UpdateAccessRequestsSettingsInput,
): Promise<ActionResult<AccessRequestsSettingsDto>> {
  if (input.enabled && !isAccessRequestDeliveryReady()) {
    return error(
      ErrorCode.EMAIL_NOT_CONFIGURED,
      "Access requests need email delivery and an application URL",
      "settings.accessRequestsEmailRequired",
    )
  }

  await ensureMigrated()
  if (input.profileId) {
    const [profile] = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.id, input.profileId))
    if (!profile) {
      return error(ErrorCode.NOT_FOUND, "Profile not found")
    }
  }

  await configManager.setAccessRequests({
    enabled: input.enabled,
    ...(input.profileId ? { profileId: input.profileId } : {}),
  })
  return success(await projectAccessRequestsSettingsDto())
}

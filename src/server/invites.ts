import { and, eq, gt, sql } from "drizzle-orm"
import type { StaticDecode } from "typebox"

import {
  ErrorCode,
  error,
  success,
  type ActionResult,
} from "@/lib/api/contracts/errors"
import { normalizeInviteCode } from "@/lib/invite-codes"
import { isInviteExpired } from "@/lib/invite-status"
import {
  interpolatePlaceholders,
  type PlaceholderValues,
} from "@/lib/placeholders"
import {
  MAX_AVATAR_BYTES,
  normalizeEmail,
  redeemInviteSchema,
} from "@/lib/schemas"
import { configManager } from "@/lib/server/config.server"
import type { SessionData } from "@/lib/session"
import { safeParse } from "@/lib/validation"
import { recordAuditEvent } from "@/server/audit"
import { clearAuthCookies, establishAuthenticatedSession } from "@/server/auth"
import { db, ensureMigrated, getUserByEmail } from "@/server/db"
import {
  inviteUsages,
  invites,
  profiles,
  users,
  type ProfilePolicy,
} from "@/server/db/schema"
import { isEmailConfigured } from "@/server/email"
import { sendConfiguredEmail } from "@/server/email/messages"
import {
  attachPendingRedemptionUser,
  beginPendingRedemption,
  finishPendingRedemption,
  redeemableInviteCondition,
} from "@/server/invite-redemptions"
import {
  authenticateUser,
  changePassword,
  createAdminApi,
  createUser,
  deleteUser,
  getAllUsers,
  isUsernameTaken,
  uploadUserAvatar,
} from "@/server/jellyfin"
import { JellyfinApiError } from "@/server/jellyfin/client"
import { getMediaServerName } from "@/server/jellyfin/display-name"
import { logger } from "@/server/logger"
import {
  applyProfileToUser,
  SeerrProfileSyncError,
} from "@/server/profile-sync"
import { deleteSeerrUser, resolveSeerrUser } from "@/server/seerr"
import { createSeerrUserLookupCache } from "@/server/seerr/users"
import { revokeAllUserSessions } from "@/server/session"
import { getSessionDataForUser } from "@/server/session-resolver"
import {
  createEmailVerificationToken,
  generateSecureToken,
} from "@/server/tokens"

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
const CODE_LENGTH = 8
const MS_PER_DAY = 24 * 60 * 60 * 1000

export function generateInviteCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH))
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("")
}

async function resolveInviteProfile(input: { profileId: string }): Promise<
  ActionResult<{
    profileId: string
    profileName: string
    policy: ProfilePolicy | null
  }>
> {
  const [targetProfile] = await db
    .select({
      id: profiles.id,
      name: profiles.name,
      policy: profiles.policy,
    })
    .from(profiles)
    .where(eq(profiles.id, input.profileId))

  if (!targetProfile) {
    return error(ErrorCode.INVITE_INVALID)
  }

  return success({
    profileId: targetProfile.id,
    profileName: targetProfile.name,
    policy: targetProfile.policy,
  })
}

export async function validateInvite(code: string): Promise<
  ActionResult<{
    valid: boolean
    profileName: string
    error?: string
    accessDurationDays?: number | null
    email?: string
    onboardingSteps?: Array<{ id: string; title: string }>
  }>
> {
  const normalizedCode = normalizeInviteCode(code)
  await ensureMigrated()

  const [invite] = await db
    .select({
      id: invites.id,
      profileId: invites.profileId,
      isDisabled: invites.isDisabled,
      useLimit: invites.useLimit,
      useCount: invites.useCount,
      email: invites.email,
      expiresAt: invites.expiresAt,
      access_duration_days: invites.access_duration_days,
    })
    .from(invites)
    .where(eq(invites.code, normalizedCode))

  if (!invite) {
    return success({
      valid: false,
      profileName: "",
      error: ErrorCode.INVITE_INVALID,
    })
  }

  if (invite.isDisabled) {
    return success({
      valid: false,
      profileName: "",
      error: ErrorCode.INVITE_DISABLED,
    })
  }

  if (isInviteExpired(invite.expiresAt)) {
    return success({
      valid: false,
      profileName: "",
      error: ErrorCode.INVITE_EXPIRED,
    })
  }

  if (invite.useLimit !== null && invite.useCount >= invite.useLimit) {
    return success({
      valid: false,
      profileName: "",
      error: ErrorCode.INVITE_EXHAUSTED,
    })
  }

  const resolvedProfile = await resolveInviteProfile({
    profileId: invite.profileId,
  })

  if (!resolvedProfile.success) {
    return success({
      valid: false,
      profileName: "",
      error: resolvedProfile.code,
    })
  }

  const onboarding = configManager.memberOnboarding
  // Only server-scoped placeholders resolve pre-redemption; user-scoped
  // tokens in titles stay verbatim until the account exists. Values are
  // resolved lazily because jellyfinName may hit the Jellyfin API.
  const titleValues =
    onboarding.enabled && onboarding.pages.length > 0
      ? await getOnboardingPlaceholderValues()
      : undefined
  const onboardingSteps = titleValues
    ? onboarding.pages.map((p) => ({
        id: p.id,
        title: interpolatePlaceholders(p.title, titleValues),
      }))
    : undefined

  // Email-locked invites are only mailed to that address, so the code holder
  // already knows it; prefilling avoids a confusing mismatch error.
  return success({
    valid: true,
    profileName: resolvedProfile.data.profileName,
    accessDurationDays: invite.access_duration_days,
    email: invite.email ?? undefined,
    onboardingSteps,
  })
}

async function getOnboardingPlaceholderValues(user?: {
  username: string
  email: string
}): Promise<PlaceholderValues> {
  return {
    serverName: configManager.app.title,
    appUrl: configManager.appUrl ?? "",
    jellyfinName: await getMediaServerName(),
    jellyfinUrl: configManager.jellyfinExternalUrl,
    seerrUrl: configManager.seerrExternalUrl ?? "",
    ...(user ? { username: user.username, email: user.email } : {}),
  }
}

async function releaseInviteReservation(inviteId: string): Promise<void> {
  try {
    const released = await db
      .update(invites)
      .set({ useCount: sql`${invites.useCount} - 1` })
      .where(and(eq(invites.id, inviteId), gt(invites.useCount, 0)))
      .returning({ id: invites.id })

    if (released.length === 0) {
      logger.warn(
        { inviteId },
        "Invite reservation was already released or reconciled",
      )
      return
    }

    logger.info({ inviteId }, "Released invite slot after failed redemption")
  } catch (err) {
    logger.error(
      { err, inviteId },
      "Failed to release invite slot; startup reconciliation will restore capacity",
    )
  }
}

async function compensateInviteRedemption(input: {
  inviteId: string
  jellyfinUserId: string
  seerrUserId: number | null
  usageRecorded: boolean
  preserveJellyfinUser?: boolean
}): Promise<void> {
  if (input.usageRecorded) {
    try {
      await db
        .delete(inviteUsages)
        .where(
          and(
            eq(inviteUsages.inviteId, input.inviteId),
            eq(inviteUsages.userId, input.jellyfinUserId),
          ),
        )
      logger.info(
        { inviteId: input.inviteId, userId: input.jellyfinUserId },
        "Removed invite usage during compensation",
      )
    } catch (err) {
      logger.error(
        {
          err,
          inviteId: input.inviteId,
          userId: input.jellyfinUserId,
        },
        "Failed to remove invite usage; preserving external users and invite usage for reconciliation",
      )
      return
    }
  }

  await releaseInviteReservation(input.inviteId)
  if (input.preserveJellyfinUser) {
    logger.warn(
      { userId: input.jellyfinUserId },
      "Preserving Jellyfin user and its local record because Seerr outcome is unknown",
    )
    return
  }

  if (input.seerrUserId !== null) {
    try {
      await deleteSeerrUser(input.seerrUserId)
      logger.info(
        {
          userId: input.jellyfinUserId,
          seerrUserId: input.seerrUserId,
        },
        "Deleted Seerr user during invite compensation",
      )
    } catch (err) {
      logger.error(
        {
          err,
          userId: input.jellyfinUserId,
          seerrUserId: input.seerrUserId,
        },
        "Failed to delete Seerr user during invite compensation; preserving Jellyfin user and its local record",
      )
      return
    }
  }

  try {
    await deleteUser(input.jellyfinUserId)
    logger.info(
      { userId: input.jellyfinUserId },
      "Deleted Jellyfin user during invite compensation",
    )
  } catch (err) {
    logger.error(
      { err, userId: input.jellyfinUserId },
      "Failed to delete Jellyfin user during invite compensation; preserving its local record",
    )
    return
  }

  // The local record carries the invite's access expiry, so it may only go
  // once the Jellyfin account is gone. Otherwise login and startup recovery
  // would recreate the surviving account as a non-expiring user.
  try {
    await db.delete(users).where(eq(users.userId, input.jellyfinUserId))
    logger.info(
      { userId: input.jellyfinUserId },
      "Removed local user record during invite compensation",
    )
  } catch (err) {
    logger.error(
      { err, userId: input.jellyfinUserId },
      "Failed to remove local user record after deleting its Jellyfin user",
    )
  }
}

// Jellyfin commits a new account before it responds, so a lost response, a
// timeout or a failure inside Jellyfin after the insert can leave an account
// we never got the ID of. The username check passed just before the create,
// so an account with that name now is ours; adopting it lets the normal
// flow (password change, profile, sign-in or compensation) finish instead
// of leaving the account to squat the username with no local record. A
// 4xx means Jellyfin rejected the request without creating anything.
async function recoverCreatedUser(
  username: string,
  createError: unknown,
): Promise<{ id: string; name: string; isAdmin: boolean } | null> {
  if (createError instanceof JellyfinApiError && createError.statusCode < 500) {
    return null
  }

  try {
    const existing = (await getAllUsers()).find(
      (user) => user.name.toLowerCase() === username.toLowerCase(),
    )
    if (!existing) return null

    logger.warn(
      { err: createError, userId: existing.id, username: existing.name },
      "Jellyfin user creation failed but the account exists; continuing with it",
    )
    return { id: existing.id, name: existing.name, isAdmin: existing.isAdmin }
  } catch (err) {
    logger.error(
      { err, username },
      "Failed to look up the Jellyfin user after a failed creation",
    )
    return null
  }
}

export async function redeemInvite(
  input: StaticDecode<typeof redeemInviteSchema>,
): Promise<
  ActionResult<{
    success: boolean
    user?: { userId: string; name: string }
    session?: SessionData
    onboardingPages?: Array<{ id: string; title: string; markdown: string }>
  }>
> {
  try {
    const parsed = safeParse(redeemInviteSchema, input)
    if (!parsed.success) {
      return error(ErrorCode.VALIDATION_FAILED, parsed.error.issues[0]?.message)
    }

    const code = normalizeInviteCode(parsed.data.code)
    const normalizedEmail = normalizeEmail(parsed.data.email)
    await ensureMigrated()

    const [invite] = await db
      .select({
        id: invites.id,
        profileId: invites.profileId,
        isDisabled: invites.isDisabled,
        useLimit: invites.useLimit,
        useCount: invites.useCount,
        email: invites.email,
        expiresAt: invites.expiresAt,
        access_duration_days: invites.access_duration_days,
      })
      .from(invites)
      .where(eq(invites.code, code))

    if (!invite) {
      return error(ErrorCode.INVITE_INVALID)
    }

    if (invite.isDisabled) {
      return error(ErrorCode.INVITE_DISABLED)
    }

    if (isInviteExpired(invite.expiresAt)) {
      return error(ErrorCode.INVITE_EXPIRED)
    }

    if (invite.useLimit !== null && invite.useCount >= invite.useLimit) {
      return error(ErrorCode.INVITE_EXHAUSTED)
    }

    if (invite.email !== null && invite.email !== normalizedEmail) {
      return error(
        ErrorCode.VALIDATION_FAILED,
        "This invite was issued for a different email address",
        "errors.inviteEmailMismatch",
      )
    }

    if (await getUserByEmail(normalizedEmail)) {
      return error(ErrorCode.EMAIL_TAKEN)
    }

    // The invite link was mailed to the locked address, so following it
    // proves ownership the same way a verification link would.
    const emailVerified = invite.email !== null

    const resolvedProfile = await resolveInviteProfile({
      profileId: invite.profileId,
    })

    if (!resolvedProfile.success) {
      return error(resolvedProfile.code)
    }

    const inviteId = invite.id
    const now = new Date()
    const reserveResult = await db
      .update(invites)
      .set({ useCount: sql`${invites.useCount} + 1` })
      .where(and(eq(invites.id, inviteId), redeemableInviteCondition(now)))
      .returning({ id: invites.id })

    if (reserveResult.length === 0) {
      const [latestInvite] = await db
        .select({
          isDisabled: invites.isDisabled,
          useLimit: invites.useLimit,
          useCount: invites.useCount,
          expiresAt: invites.expiresAt,
        })
        .from(invites)
        .where(eq(invites.id, inviteId))

      if (latestInvite?.isDisabled) {
        return error(ErrorCode.INVITE_DISABLED)
      }

      if (isInviteExpired(latestInvite?.expiresAt ?? null, now)) {
        return error(ErrorCode.INVITE_EXPIRED)
      }

      if (
        latestInvite !== undefined &&
        latestInvite.useLimit !== null &&
        latestInvite.useCount >= latestInvite.useLimit
      ) {
        return error(
          ErrorCode.INVITE_EXHAUSTED,
          "This invite is no longer valid",
        )
      }

      return error(ErrorCode.INVITE_EXHAUSTED, "This invite is no longer valid")
    }

    let inviteAfterReservation: { isDisabled: boolean } | undefined
    try {
      const reservationRows = await db
        .select({ isDisabled: invites.isDisabled })
        .from(invites)
        .where(eq(invites.id, inviteId))
      inviteAfterReservation = reservationRows[0]
    } catch (err) {
      logger.error(
        { err, inviteId },
        "Failed to verify invite after reserving a slot",
      )
      await releaseInviteReservation(inviteId)
      return error(
        ErrorCode.INTERNAL_ERROR,
        "Failed to complete registration. Please try again.",
      )
    }

    if (inviteAfterReservation?.isDisabled) {
      await releaseInviteReservation(inviteId)
      return error(ErrorCode.INVITE_DISABLED)
    }

    // A timed account starts with a throwaway password that is never stored
    // or logged, and only gets the applicant's password once its expiry is
    // recorded. An account left behind by a lost response, a crash or a
    // failed first write therefore can't be signed into, so recovery can't
    // turn it into non-expiring access. Jellyfin itself commits a new account
    // before its password, so a create that fails inside Jellyfin between
    // those writes can still leave an account without one.
    const stagingPassword =
      invite.access_duration_days === null ? null : generateSecureToken()
    let usernameTaken: boolean
    try {
      usernameTaken = await isUsernameTaken(parsed.data.username)
    } catch (err) {
      logger.error(
        { err, username: parsed.data.username },
        "Failed to check whether the username is taken",
      )
      await releaseInviteReservation(inviteId)
      return error(ErrorCode.JELLYFIN_ERROR, "Failed to create user account")
    }
    if (usernameTaken) {
      await releaseInviteReservation(inviteId)
      return error(ErrorCode.USERNAME_TAKEN)
    }

    // Written before the create so an account whose outcome never reaches
    // us (lost response, crash, Jellyfin unreachable) can be found and
    // removed by maintenance instead of being seeded as a permanent user.
    // The row is kept on every failure path and only removed once the
    // local record exists; the sweep decides what a leftover row means.
    let pendingRedemptionId: string
    try {
      pendingRedemptionId = await beginPendingRedemption({
        inviteId,
        username: parsed.data.username,
      })
    } catch (err) {
      logger.error(
        { err, inviteId, username: parsed.data.username },
        "Failed to record the pending invite redemption",
      )
      await releaseInviteReservation(inviteId)
      return error(
        ErrorCode.INTERNAL_ERROR,
        "Failed to complete registration. Please try again.",
      )
    }

    let jellyfinUser: { id: string; name: string; isAdmin: boolean }
    try {
      jellyfinUser = await createUser(
        parsed.data.username,
        stagingPassword ?? parsed.data.password,
      )
      logger.info(
        { userId: jellyfinUser.id, username: jellyfinUser.name },
        "Created Jellyfin user",
      )
    } catch (err) {
      const recoveredUser = await recoverCreatedUser(parsed.data.username, err)
      if (!recoveredUser) {
        logger.error(
          { err, username: parsed.data.username },
          "Failed to create Jellyfin user",
        )
        await releaseInviteReservation(inviteId)
        return error(ErrorCode.JELLYFIN_ERROR, "Failed to create user account")
      }
      jellyfinUser = recoveredUser
    }
    await attachPendingRedemptionUser(pendingRedemptionId, jellyfinUser.id)

    // Record the account with its access expiry before the applicant's
    // password can work. If redemption then fails and the account survives
    // (unknown Seerr outcome, failed cleanup, or a crash), login and startup
    // recovery keep this record instead of recreating the user as
    // non-expiring. Access is counted from here, matching the createdAt the
    // renewal lifetime ceiling is measured from.
    const redeemedAt = new Date()
    const accessExpiresAt =
      invite.access_duration_days === null
        ? null
        : new Date(
            redeemedAt.getTime() + invite.access_duration_days * MS_PER_DAY,
          )
    try {
      await db
        .insert(users)
        .values({
          userId: jellyfinUser.id,
          email: null,
          emailVerified: false,
          locale: null,
          profileId: null,
          inviteId,
          seerrSyncedAt: null,
          expiresAt: accessExpiresAt,
          expiryWarningSentAt: null,
          expiryWarningSentFor: null,
          createdAt: redeemedAt,
        })
        // Startup seeding, an admin edit, or a login on an invite without a
        // duration can record the new account through ensureUserRecord first.
        .onConflictDoUpdate({
          target: users.userId,
          set: {
            inviteId,
            expiresAt: accessExpiresAt,
            createdAt: redeemedAt,
          },
        })
    } catch (err) {
      logger.error(
        { err, inviteId, userId: jellyfinUser.id },
        "Failed to record created Jellyfin user, performing compensation",
      )
      await compensateInviteRedemption({
        inviteId,
        jellyfinUserId: jellyfinUser.id,
        seerrUserId: null,
        usageRecorded: false,
      })
      return error(
        ErrorCode.INTERNAL_ERROR,
        "Failed to complete registration. Please try again.",
      )
    }
    // From here the local record carries the account's outcome, and the
    // existing compensation paths own both the account and the record.
    await finishPendingRedemption(pendingRedemptionId)

    if (stagingPassword !== null) {
      try {
        await changePassword(
          createAdminApi(),
          jellyfinUser.id,
          stagingPassword,
          parsed.data.password,
        )
      } catch (err) {
        logger.error(
          { err, userId: jellyfinUser.id },
          "Failed to set the applicant's password on the created Jellyfin user, performing compensation",
        )
        await compensateInviteRedemption({
          inviteId,
          jellyfinUserId: jellyfinUser.id,
          seerrUserId: null,
          usageRecorded: false,
        })
        return error(ErrorCode.JELLYFIN_ERROR, "Failed to create user account")
      }
    }

    let seerrConfigured: boolean
    try {
      seerrConfigured = configManager.seerr !== undefined
    } catch (err) {
      logger.error(
        { err, userId: jellyfinUser.id },
        "Failed to read Seerr configuration during invite redemption",
      )
      await compensateInviteRedemption({
        inviteId,
        jellyfinUserId: jellyfinUser.id,
        seerrUserId: null,
        usageRecorded: false,
      })
      return error(
        ErrorCode.INTERNAL_ERROR,
        "Failed to complete registration. Please try again.",
      )
    }
    const seerrLookupCache = createSeerrUserLookupCache()
    let rollbackSeerrUserId: number | null = null

    if (seerrConfigured) {
      try {
        const seerrUser = await resolveSeerrUser({
          jellyfinUserId: jellyfinUser.id,
          userName: jellyfinUser.name,
          email: normalizedEmail,
          lookupCache: seerrLookupCache,
        })
        if (!seerrUser) {
          throw new Error("Failed to locate the created user in Seerr")
        }
        rollbackSeerrUserId = seerrUser.id
      } catch (err) {
        logger.error(
          { err, userId: jellyfinUser.id },
          "Failed to create or resolve Seerr user during invite redemption",
        )
        await compensateInviteRedemption({
          inviteId,
          jellyfinUserId: jellyfinUser.id,
          seerrUserId: rollbackSeerrUserId,
          usageRecorded: false,
          preserveJellyfinUser: rollbackSeerrUserId === null,
        })
        return error(
          ErrorCode.SEERR_ERROR,
          "Failed to complete registration with Seerr",
        )
      }
    }

    if (resolvedProfile.data.policy) {
      try {
        const profileSyncResult = await applyProfileToUser({
          userId: jellyfinUser.id,
          userName: jellyfinUser.name,
          email: normalizedEmail,
          policy: resolvedProfile.data.policy,
          isAdmin: jellyfinUser.isAdmin,
          seerrLookupCache,
        })
        rollbackSeerrUserId =
          profileSyncResult.seerrUserId ?? rollbackSeerrUserId
      } catch (err) {
        const profileErrorCode =
          err instanceof SeerrProfileSyncError
            ? ErrorCode.SEERR_ERROR
            : ErrorCode.JELLYFIN_ERROR
        logger.error(
          { err, userId: jellyfinUser.id },
          "Failed to apply invite profile during redemption",
        )
        await compensateInviteRedemption({
          inviteId,
          jellyfinUserId: jellyfinUser.id,
          seerrUserId: rollbackSeerrUserId,
          usageRecorded: false,
        })
        return error(
          profileErrorCode,
          "Failed to apply the invite profile to the account",
        )
      }
    }

    const jellyfinDeviceId = crypto.randomUUID()
    let authResult: {
      accessToken: string
      isAdmin: boolean
      name: string
    }
    try {
      authResult = await authenticateUser(
        parsed.data.username,
        parsed.data.password,
        jellyfinDeviceId,
      )
    } catch (err) {
      logger.error(
        { err, userId: jellyfinUser.id },
        "Failed to authenticate newly created Jellyfin user",
      )
      await compensateInviteRedemption({
        inviteId,
        jellyfinUserId: jellyfinUser.id,
        seerrUserId: rollbackSeerrUserId,
        usageRecorded: false,
      })
      return error(
        ErrorCode.JELLYFIN_ERROR,
        "Failed to authenticate the created account",
      )
    }

    if (parsed.data.avatar) {
      try {
        const dataUrlMatch = parsed.data.avatar.match(
          /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/,
        )

        if (dataUrlMatch) {
          const mimeType = dataUrlMatch[1]
          const base64Data = dataUrlMatch[2]
          const imageBuffer = Buffer.from(base64Data, "base64")

          if (imageBuffer.length <= MAX_AVATAR_BYTES) {
            await uploadUserAvatar(jellyfinUser.id, imageBuffer, mimeType)
          } else {
            logger.warn(
              { userId: jellyfinUser.id },
              "Avatar too large, skipping upload",
            )
          }
        } else {
          logger.warn(
            { userId: jellyfinUser.id },
            "Invalid avatar format, skipping upload",
          )
        }
      } catch (err) {
        logger.warn({ err, userId: jellyfinUser.id }, "Failed to upload avatar")
      }
    }

    try {
      await db.transaction(async (tx) => {
        await tx
          .update(users)
          .set({
            email: normalizedEmail,
            emailVerified,
            profileId: resolvedProfile.data.profileId,
            seerrSyncedAt: seerrConfigured ? new Date() : null,
          })
          .where(eq(users.userId, jellyfinUser.id))

        await tx.insert(inviteUsages).values({
          id: crypto.randomUUID(),
          inviteId,
          userId: jellyfinUser.id,
          usedAt: redeemedAt,
        })
      })

      logger.info(
        { userId: jellyfinUser.id, email: normalizedEmail },
        "Recorded user in database",
      )
    } catch (err) {
      logger.error(
        { err, inviteId, userId: jellyfinUser.id },
        "Failed to record user in database, checking transaction outcome",
      )

      let usageRecorded: boolean
      try {
        const [recordedUsage] = await db
          .select({ id: inviteUsages.id })
          .from(inviteUsages)
          .where(
            and(
              eq(inviteUsages.inviteId, inviteId),
              eq(inviteUsages.userId, jellyfinUser.id),
            ),
          )
          .limit(1)
        usageRecorded = recordedUsage !== undefined
      } catch (reconcileErr) {
        logger.error(
          {
            err: reconcileErr,
            inviteId,
            userId: jellyfinUser.id,
          },
          "Could not determine local transaction outcome; preserving reservation and external users for startup reconciliation",
        )
        return error(
          ErrorCode.INTERNAL_ERROR,
          "Failed to complete registration. Please try again.",
        )
      }

      await compensateInviteRedemption({
        inviteId,
        jellyfinUserId: jellyfinUser.id,
        seerrUserId: rollbackSeerrUserId,
        usageRecorded,
      })
      return error(
        ErrorCode.INTERNAL_ERROR,
        "Failed to complete registration. Please try again.",
      )
    }

    let session: SessionData
    try {
      await establishAuthenticatedSession({
        userId: jellyfinUser.id,
        displayName: authResult.name,
        isAdmin: authResult.isAdmin,
        jellyfinAccessToken: authResult.accessToken,
        jellyfinDeviceId,
      })
      session = await getSessionDataForUser({
        userId: jellyfinUser.id,
        name: authResult.name,
        isAdmin: authResult.isAdmin,
      })
      logger.info(
        { userId: jellyfinUser.id },
        "Created session after registration",
      )
    } catch (err) {
      logger.error(
        { err, userId: jellyfinUser.id },
        "Failed to create session after registration, performing compensation",
      )
      try {
        clearAuthCookies()
      } catch (clearCookieErr) {
        logger.error(
          { err: clearCookieErr, userId: jellyfinUser.id },
          "Failed to clear authentication cookie after session failure",
        )
      }
      try {
        await revokeAllUserSessions(jellyfinUser.id)
      } catch (revokeErr) {
        logger.error(
          { err: revokeErr, userId: jellyfinUser.id },
          "Failed to revoke sessions after invite redemption failure",
        )
      }
      await compensateInviteRedemption({
        inviteId,
        jellyfinUserId: jellyfinUser.id,
        seerrUserId: rollbackSeerrUserId,
        usageRecorded: true,
      })
      return error(
        ErrorCode.INTERNAL_ERROR,
        "Failed to create a session for the new account",
      )
    }

    // Recorded only once nothing can be compensated anymore.
    await recordAuditEvent(
      { type: "user", id: jellyfinUser.id, name: jellyfinUser.name },
      {
        action: "invite.redeemed",
        target: { id: inviteId, label: code },
        details: {
          email: normalizedEmail,
          accessExpiresAt: accessExpiresAt?.toISOString() ?? null,
        },
      },
    )

    try {
      if (!emailVerified && isEmailConfigured()) {
        const token = await createEmailVerificationToken(jellyfinUser.id)
        const appUrl = configManager.appUrl
        if (!appUrl) {
          throw new Error("Application URL is not configured")
        }

        const verifyUrl = `${appUrl}/verify-email/${token}`

        await sendConfiguredEmail(normalizedEmail, {
          type: "verifyEmail",
          payload: {
            username: parsed.data.username,
            verifyUrl,
            locale: configManager.defaultLocale,
          },
        })
        logger.info(
          { userId: jellyfinUser.id, email: normalizedEmail },
          "Sent verification email",
        )
      }
    } catch (err) {
      logger.warn(
        { err, userId: jellyfinUser.id },
        "Failed to send verification email",
      )
    }

    let onboardingPages:
      | Array<{ id: string; title: string; markdown: string }>
      | undefined

    try {
      const memberOnboarding = configManager.memberOnboarding
      if (memberOnboarding.enabled && memberOnboarding.pages.length > 0) {
        const pageValues = await getOnboardingPlaceholderValues({
          username: jellyfinUser.name,
          email: normalizedEmail,
        })
        onboardingPages = memberOnboarding.pages.map((page) => ({
          id: page.id,
          title: interpolatePlaceholders(page.title, pageValues),
          markdown: interpolatePlaceholders(page.markdown, pageValues),
        }))
      }
    } catch (err) {
      logger.warn(
        { err },
        "Failed to load member onboarding pages during invite redemption",
      )
    }

    return success({
      success: true,
      user: {
        userId: jellyfinUser.id,
        name: jellyfinUser.name,
      },
      session,
      onboardingPages,
    })
  } catch (err) {
    logger.error({ err }, "Unexpected failure while redeeming invite")
    return error(ErrorCode.OPERATION_FAILED, "Failed to redeem invite")
  }
}

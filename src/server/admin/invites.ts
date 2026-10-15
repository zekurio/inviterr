import { asc, count, desc, eq, inArray, like, or, type SQL } from "drizzle-orm"
import type { StaticDecode, StaticEncode } from "typebox"

import {
  ErrorCode,
  error,
  success,
  type ActionResult,
} from "@/lib/api/contracts/errors"
import type { AuditActor } from "@/lib/audit"
import { normalizeInviteCode } from "@/lib/invite-codes"
import { deriveInviteStatus, type InviteStatus } from "@/lib/invite-status"
import { createInviteSchema, updateInviteSchema } from "@/lib/schemas"
import { safeParse } from "@/lib/validation"
import {
  bulkInvitesSchema,
  inviteHistoryPageInputSchema,
  invitesPageInputSchema,
  type BulkInviteResultDto,
  type BulkInvitesDto,
} from "@/server/api/schemas/admin-schemas"
import {
  diffAuditFields,
  recordAuditChange,
  recordAuditEvent,
  type AuditScope,
} from "@/server/audit"
import { db, ensureMigrated } from "@/server/db"
import { inviteUsages, invites, profiles, users } from "@/server/db/schema"
import { generateInviteCode } from "@/server/invites"
import { getAllUsers } from "@/server/jellyfin"
import { createChildLogger } from "@/server/logger"

const log = createChildLogger({ module: "admin-invites" })

type InviteListItem = {
  id: string
  code: string
  profileId: string
  profileName: string
  isDisabled: boolean
  useLimit: number | null
  useCount: number
  email: string | null
  expiresAt: string | null
  accessDurationDays: number | null
  createdAt: string
  status: InviteStatus
}

type InviteHistoryItem = {
  id: string
  inviteId: string
  inviteCode: string
  userId: string
  userName: string
  avatarUrl: string | null
  usedAt: string
}

type PagedInviteHistory = {
  items: InviteHistoryItem[]
  page: number
  pageSize: number
  total: number
  pageCount: number
}

type PagedInvites = {
  items: InviteListItem[]
  page: number
  pageSize: number
  total: number
  pageCount: number
}

type InviteRecord = {
  id: string
  code: string
  profileId: string
  profileName?: string | null
  isDisabled: boolean
  useLimit: number | null
  useCount: number
  email: string | null
  expiresAt: Date | null
  access_duration_days: number | null
  createdAt: Date
}

const INVITE_CODE_ATTEMPTS = 10

const inviteListColumns = {
  id: invites.id,
  code: invites.code,
  profileId: invites.profileId,
  profileName: profiles.name,
  isDisabled: invites.isDisabled,
  useLimit: invites.useLimit,
  useCount: invites.useCount,
  email: invites.email,
  expiresAt: invites.expiresAt,
  access_duration_days: invites.access_duration_days,
  createdAt: invites.createdAt,
}

function toInviteListItem(
  invite: InviteRecord,
  profileName?: string | null,
): InviteListItem {
  return {
    id: invite.id,
    code: invite.code,
    profileId: invite.profileId,
    profileName: profileName ?? invite.profileName ?? "Unknown",
    isDisabled: invite.isDisabled,
    useLimit: invite.useLimit,
    useCount: invite.useCount,
    email: invite.email,
    expiresAt: invite.expiresAt?.toISOString() ?? null,
    accessDurationDays: invite.access_duration_days,
    createdAt: invite.createdAt.toISOString(),
    status: deriveInviteStatus(invite),
  }
}

export async function listInvitesService(): Promise<
  ActionResult<InviteListItem[]>
> {
  await ensureMigrated()

  const result = await db
    .select(inviteListColumns)
    .from(invites)
    .leftJoin(profiles, eq(invites.profileId, profiles.id))
    .orderBy(desc(invites.createdAt))

  const items = result.map((invite) =>
    toInviteListItem(invite, invite.profileName),
  )

  return success(items)
}

export async function listInvitesPageService(
  input: StaticEncode<typeof invitesPageInputSchema>,
): Promise<ActionResult<PagedInvites>> {
  const parsed = safeParse(invitesPageInputSchema, input)
  if (!parsed.success) {
    return error(ErrorCode.VALIDATION_FAILED, parsed.error.issues[0]?.message)
  }

  const invitePage = parsed.data
  const offset = (invitePage.page - 1) * invitePage.pageSize
  const searchFilter = getInvitesSearchFilter(invitePage.query?.trim())

  await ensureMigrated()

  const [totalRow] = await db
    .select({ total: count() })
    .from(invites)
    .leftJoin(profiles, eq(invites.profileId, profiles.id))
    .where(searchFilter)
  const total = totalRow?.total ?? 0

  const result = await db
    .select(inviteListColumns)
    .from(invites)
    .leftJoin(profiles, eq(invites.profileId, profiles.id))
    .where(searchFilter)
    .orderBy(getInvitesOrderBy(invitePage.sort, invitePage.direction))
    .limit(invitePage.pageSize)
    .offset(offset)

  return success({
    items: result.map((invite) => toInviteListItem(invite, invite.profileName)),
    page: invitePage.page,
    pageSize: invitePage.pageSize,
    total,
    pageCount: Math.ceil(total / invitePage.pageSize),
  })
}

function getInvitesSearchFilter(query: string | undefined): SQL | undefined {
  if (!query) {
    return undefined
  }

  const pattern = `%${query}%`
  return or(
    like(invites.code, pattern),
    like(profiles.name, pattern),
    like(invites.email, pattern),
  )
}

function getInvitesOrderBy(
  sort: StaticDecode<typeof invitesPageInputSchema>["sort"],
  direction: StaticDecode<typeof invitesPageInputSchema>["direction"],
): SQL {
  if (sort === "code") {
    return direction === "asc" ? asc(invites.code) : desc(invites.code)
  }
  if (sort === "profileName") {
    return direction === "asc" ? asc(profiles.name) : desc(profiles.name)
  }
  return direction === "asc" ? asc(invites.createdAt) : desc(invites.createdAt)
}

export async function createInviteService(
  actor: AuditActor,
  input: StaticDecode<typeof createInviteSchema>,
): Promise<ActionResult<InviteListItem>> {
  await ensureMigrated()
  const parsed = safeParse(createInviteSchema, input)
  if (!parsed.success) {
    return error(ErrorCode.VALIDATION_FAILED, parsed.error.issues[0]?.message)
  }

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, parsed.data.profileId))
  if (!profile) {
    return error(ErrorCode.NOT_FOUND, "Profile not found")
  }

  const code = parsed.data.code ? normalizeInviteCode(parsed.data.code) : null
  if (code) {
    const [existingInvite] = await db
      .select()
      .from(invites)
      .where(eq(invites.code, code))
    if (existingInvite) {
      return error(ErrorCode.ALREADY_EXISTS, "Invite code is already in use")
    }
  }

  const values = {
    profileId: parsed.data.profileId,
    isDisabled: false,
    useLimit: parsed.data.useLimit ?? null,
    useCount: 0,
    expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
    access_duration_days: parsed.data.accessDurationDays ?? null,
    createdById: actor.type === "system" ? null : actor.id,
    createdAt: new Date(),
  }
  const invite = code
    ? (
        await db
          .insert(invites)
          .values({ ...values, id: crypto.randomUUID(), code })
          .returning()
      )[0]
    : await insertInviteWithGeneratedCode(values)
  if (!invite) {
    return error(
      ErrorCode.OPERATION_FAILED,
      "Failed to generate unique invite code. Please try again.",
    )
  }

  await recordAuditEvent(actor, {
    action: "invite.created",
    target: { id: invite.id, label: invite.code },
    details: {
      profile: profile.name,
      useLimit: invite.useLimit,
      expiresAt: invite.expiresAt?.toISOString() ?? null,
      accessDurationDays: invite.access_duration_days,
    },
  })

  return success(toInviteListItem(invite, profile.name))
}

// The unique index on the code decides collisions, so concurrent creators can
// never claim the same generated code. Returns null when every attempt hits an
// existing code.
export async function insertInviteWithGeneratedCode(
  values: Omit<typeof invites.$inferInsert, "id" | "code">,
) {
  for (let attempt = 0; attempt < INVITE_CODE_ATTEMPTS; attempt++) {
    const [invite] = await db
      .insert(invites)
      .values({
        ...values,
        id: crypto.randomUUID(),
        code: generateInviteCode(),
      })
      .onConflictDoNothing({ target: invites.code })
      .returning()
    if (invite) {
      return invite
    }
  }

  return null
}

export async function updateInviteService(
  actor: AuditActor,
  inviteId: string,
  input: StaticDecode<typeof updateInviteSchema>,
): Promise<ActionResult<InviteListItem>> {
  await ensureMigrated()
  const parsed = safeParse(updateInviteSchema, input)
  if (!parsed.success) {
    return error(ErrorCode.VALIDATION_FAILED, parsed.error.issues[0]?.message)
  }

  const existing = await db.query.invites.findFirst({
    where: eq(invites.id, inviteId),
    with: { profile: { columns: { name: true } } },
  })
  if (!existing) {
    return error(ErrorCode.NOT_FOUND, "Invite not found")
  }

  if (parsed.data.profileId !== undefined) {
    const [profile] = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.id, parsed.data.profileId))

    if (!profile) {
      return error(ErrorCode.NOT_FOUND, "Profile not found")
    }
  }

  const updateValues = {
    ...(parsed.data.profileId !== undefined && {
      profileId: parsed.data.profileId,
    }),
    ...(parsed.data.isDisabled !== undefined && {
      isDisabled: parsed.data.isDisabled,
    }),
    ...(parsed.data.useLimit !== undefined && {
      useLimit: parsed.data.useLimit,
    }),
    ...(parsed.data.expiresAt !== undefined && {
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
    }),
    ...(parsed.data.accessDurationDays !== undefined && {
      access_duration_days: parsed.data.accessDurationDays,
    }),
  }

  if (parsed.data.code !== undefined) {
    const normalizedCode = normalizeInviteCode(parsed.data.code)
    const [codeConflict] = await db
      .select({ id: invites.id })
      .from(invites)
      .where(eq(invites.code, normalizedCode))

    if (codeConflict && codeConflict.id !== existing.id) {
      return error(ErrorCode.ALREADY_EXISTS, "Invite code is already in use")
    }

    Object.assign(updateValues, { code: normalizedCode })
  }

  const [updated] = await db
    .update(invites)
    .set(updateValues)
    .where(eq(invites.id, inviteId))
    .returning()

  const [profile] = await db
    .select({ name: profiles.name })
    .from(profiles)
    .where(eq(profiles.id, updated.profileId))

  await recordAuditChange(actor, {
    action: "invite.updated",
    target: { id: updated.id, label: updated.code },
    details: diffAuditFields(
      toInviteAuditFields(existing, existing.profile?.name),
      toInviteAuditFields(updated, profile?.name),
    ),
  })

  return success(toInviteListItem(updated, profile?.name))
}

function toInviteAuditFields(
  invite: Pick<
    InviteRecord,
    | "code"
    | "isDisabled"
    | "useLimit"
    | "expiresAt"
    | "access_duration_days"
    | "email"
  >,
  profileName: string | null | undefined,
) {
  return {
    code: invite.code,
    profile: profileName,
    isDisabled: invite.isDisabled,
    useLimit: invite.useLimit,
    expiresAt: invite.expiresAt,
    accessDurationDays: invite.access_duration_days,
    email: invite.email,
  }
}

export async function deleteInviteService(
  actor: AuditActor,
  inviteId: string,
): Promise<ActionResult<null>> {
  await ensureMigrated()

  const existing = await db.query.invites.findFirst({
    where: eq(invites.id, inviteId),
    with: { profile: { columns: { name: true } } },
  })
  if (!existing) {
    return error(ErrorCode.NOT_FOUND, "Invite not found")
  }

  await deleteInviteWithUsages(
    { actor },
    { ...existing, profileName: existing.profile?.name ?? null },
  )

  return success(null)
}

async function deleteInviteWithUsages(
  audit: AuditScope,
  invite: Pick<InviteRecord, "id" | "code" | "useCount"> & {
    profileName: string | null
  },
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(inviteUsages).where(eq(inviteUsages.inviteId, invite.id))
    await tx.delete(invites).where(eq(invites.id, invite.id))
  })

  await recordAuditEvent(audit.actor, {
    action: "invite.deleted",
    target: { id: invite.id, label: invite.code },
    details: { profile: invite.profileName, useCount: invite.useCount },
    batchId: audit.batchId,
  })
}

type BulkInviteOperation = StaticDecode<typeof bulkInvitesSchema>["operation"]

type BulkInviteRow = InviteRecord & { profileName: string | null }

export async function bulkManageInvitesService(
  actor: AuditActor,
  input: StaticEncode<typeof bulkInvitesSchema>,
): Promise<ActionResult<BulkInvitesDto>> {
  const parsed = safeParse(bulkInvitesSchema, input)
  if (!parsed.success) {
    return error(ErrorCode.VALIDATION_FAILED, parsed.error.issues[0]?.message)
  }

  await ensureMigrated()

  const rows = await db
    .select(inviteListColumns)
    .from(invites)
    .leftJoin(profiles, eq(invites.profileId, profiles.id))
    .where(inArray(invites.id, parsed.data.inviteIds))
  const invitesById = new Map(rows.map((row) => [row.id, row]))
  const batch = { actor, batchId: crypto.randomUUID() }

  const results: BulkInviteResultDto[] = []
  for (const inviteId of parsed.data.inviteIds) {
    results.push(
      await applyBulkInviteOperation(
        inviteId,
        parsed.data.operation,
        invitesById.get(inviteId),
        batch,
      ),
    )
  }

  return success({ results })
}

async function applyBulkInviteOperation(
  inviteId: string,
  operation: BulkInviteOperation,
  existing: BulkInviteRow | undefined,
  batch: AuditScope,
): Promise<BulkInviteResultDto> {
  if (!existing) {
    return {
      inviteId,
      ok: false,
      operation,
      code: ErrorCode.NOT_FOUND,
      message: "Invite not found",
    }
  }

  try {
    if (operation === "delete") {
      await deleteInviteWithUsages(batch, existing)
      return { inviteId, ok: true, operation }
    }

    const nextIsDisabled = operation === "disable"
    if (existing.isDisabled === nextIsDisabled) {
      return {
        inviteId,
        ok: true,
        operation,
        skipped: true,
        reason: nextIsDisabled ? "already_disabled" : "already_enabled",
      }
    }

    const [updated] = await db
      .update(invites)
      .set({ isDisabled: nextIsDisabled })
      .where(eq(invites.id, inviteId))
      .returning()

    await recordAuditEvent(batch.actor, {
      action: "invite.updated",
      target: { id: inviteId, label: existing.code },
      details: {
        isDisabled: { from: existing.isDisabled, to: nextIsDisabled },
      },
      batchId: batch.batchId,
    })

    return {
      inviteId,
      ok: true,
      operation,
      result: toInviteListItem(updated, existing.profileName),
    }
  } catch (err) {
    log.error({ err, inviteId, operation }, "Failed bulk invite operation")
    return {
      inviteId,
      ok: false,
      operation,
      code: ErrorCode.OPERATION_FAILED,
      message:
        operation === "delete"
          ? "Failed to delete invite"
          : "Failed to update invite",
    }
  }
}

export async function getInviteHistoryService(): Promise<
  ActionResult<InviteHistoryItem[]>
> {
  return getUnboundedInviteHistoryService()
}

export async function getInviteHistoryPageService(
  input: StaticEncode<typeof inviteHistoryPageInputSchema>,
): Promise<ActionResult<PagedInviteHistory>> {
  const parsed = safeParse(inviteHistoryPageInputSchema, input)
  if (!parsed.success) {
    return error(ErrorCode.VALIDATION_FAILED, parsed.error.issues[0]?.message)
  }

  const historyPage = parsed.data
  const offset = (historyPage.page - 1) * historyPage.pageSize
  const trimmedQuery = historyPage.query?.trim()
  const searchFilter = getInviteHistorySearchFilter(trimmedQuery)

  await ensureMigrated()

  const [totalRow] = await db
    .select({ total: count() })
    .from(inviteUsages)
    .leftJoin(invites, eq(inviteUsages.inviteId, invites.id))
    .leftJoin(users, eq(inviteUsages.userId, users.userId))
    .where(searchFilter)
  const total = totalRow?.total ?? 0

  const result = await db
    .select({
      id: inviteUsages.id,
      inviteId: inviteUsages.inviteId,
      inviteCode: invites.code,
      userId: inviteUsages.userId,
      localEmail: users.email,
      usedAt: inviteUsages.usedAt,
    })
    .from(inviteUsages)
    .leftJoin(invites, eq(inviteUsages.inviteId, invites.id))
    .leftJoin(users, eq(inviteUsages.userId, users.userId))
    .where(searchFilter)
    .orderBy(
      historyPage.direction === "asc"
        ? asc(inviteUsages.usedAt)
        : desc(inviteUsages.usedAt),
    )
    .limit(historyPage.pageSize)
    .offset(offset)

  const jellyfinUsersById = new Map<
    string,
    { name: string; avatarUrl: string }
  >()
  try {
    const jellyfinUsers = await getAllUsers()
    for (const jellyfinUser of jellyfinUsers) {
      jellyfinUsersById.set(jellyfinUser.id, {
        name: jellyfinUser.name,
        avatarUrl: jellyfinUser.avatarUrl,
      })
    }
  } catch (err) {
    log.warn({ err }, "Failed to fetch Jellyfin users for invite history")
  }

  return success({
    items: result.map((usage) => {
      const jellyfinUser = usage.userId
        ? jellyfinUsersById.get(usage.userId)
        : null
      return {
        id: usage.id,
        inviteId: usage.inviteId ?? "",
        inviteCode: usage.inviteCode ?? "",
        userId: usage.userId,
        userName: jellyfinUser?.name ?? "Unknown",
        avatarUrl: jellyfinUser?.avatarUrl ?? null,
        usedAt: usage.usedAt.toISOString(),
      }
    }),
    page: historyPage.page,
    pageSize: historyPage.pageSize,
    total,
    pageCount: Math.ceil(total / historyPage.pageSize),
  })
}

function getInviteHistorySearchFilter(
  query: string | undefined,
): SQL | undefined {
  if (!query) {
    return undefined
  }

  const pattern = `%${query}%`
  return or(
    like(invites.code, pattern),
    like(inviteUsages.userId, pattern),
    like(users.email, pattern),
  )
}

async function getUnboundedInviteHistoryService(): Promise<
  ActionResult<InviteHistoryItem[]>
> {
  await ensureMigrated()

  const result = await db
    .select({
      id: inviteUsages.id,
      inviteId: inviteUsages.inviteId,
      inviteCode: invites.code,
      userId: inviteUsages.userId,
      usedAt: inviteUsages.usedAt,
    })
    .from(inviteUsages)
    .leftJoin(invites, eq(inviteUsages.inviteId, invites.id))
    .leftJoin(users, eq(inviteUsages.userId, users.userId))
    .orderBy(desc(inviteUsages.usedAt))

  const jellyfinUsersById = new Map<
    string,
    { name: string; avatarUrl: string }
  >()
  try {
    const jellyfinUsers = await getAllUsers()
    for (const jellyfinUser of jellyfinUsers) {
      jellyfinUsersById.set(jellyfinUser.id, {
        name: jellyfinUser.name,
        avatarUrl: jellyfinUser.avatarUrl,
      })
    }
  } catch (err) {
    log.warn({ err }, "Failed to fetch Jellyfin users for invite history")
  }

  return success(
    result.map((usage) => {
      const jellyfinUser = usage.userId
        ? jellyfinUsersById.get(usage.userId)
        : null
      return {
        id: usage.id,
        inviteId: usage.inviteId ?? "",
        inviteCode: usage.inviteCode ?? "",
        userId: usage.userId,
        userName: jellyfinUser?.name ?? "Unknown",
        avatarUrl: jellyfinUser?.avatarUrl ?? null,
        usedAt: usage.usedAt.toISOString(),
      }
    }),
  )
}

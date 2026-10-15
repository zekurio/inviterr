import { writeFile } from "node:fs/promises"

import { createORPCClient } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import type { RouterClient } from "@orpc/server"
import { RPCHandler } from "@orpc/server/fetch"
import { eq } from "drizzle-orm"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { SessionData } from "@/lib/session"
import type { procedures } from "@/server/orpc/procedures"
import { TEST_ADMIN_ACTOR } from "@/test/audit"
import {
  configureTestEnvironment,
  createTestDatabase,
  type TestDatabase,
} from "@/test/db"

let testDatabase: TestDatabase | null = null

const adminSession: SessionData = {
  userId: "admin-1",
  name: "Admin User",
  avatarUrl: "https://app.test/avatar",
  isAdmin: true,
  email: "admin@example.com",
  emailVerified: true,
  locale: null,
  createdAt: new Date(0).toISOString(),
}

async function loadInvitesServiceModules() {
  testDatabase = await createTestDatabase()
  configureTestEnvironment(testDatabase)
  // The config manager is a process-wide singleton bound to the CONFIG_PATH it
  // was first created with, so each temp environment needs a fresh one.
  globalThis.__INVITERR_CONFIG_MANAGER__ = undefined
  vi.resetModules()

  const invitesService = await import("@/server/admin/invites")
  const database = await import("@/server/db")
  const schema = await import("@/server/db/schema")
  const errors = await import("@/lib/api/contracts/errors")

  await database.ensureMigrated()

  return { invitesService, database, schema, errors }
}

// Drives the real admin procedures over the RPC transport as a signed-in admin
// of a configured instance, so input validation runs exactly as in production.
async function createAdminRpcClient(testEnvironment: TestDatabase) {
  await writeFile(
    testEnvironment.configPath,
    JSON.stringify({
      jellyfin: { internalUrl: "http://jellyfin.test", apiKey: "test-key" },
    }),
  )
  const orpc = await import("@/server/orpc/procedures")
  const handler = new RPCHandler(orpc.procedures)
  const link = new RPCLink({
    url: "https://app.test/rpc",
    headers: { origin: "https://app.test" },
    fetch: async (request) => {
      const handled = await handler.handle(request, {
        prefix: "/rpc",
        context: {
          request,
          requestId: "request-1",
          clientIp: null,
          userAgent: null,
          resolveSession: () =>
            Promise.resolve({
              status: "authenticated" as const,
              session: adminSession,
              sessionRecord: null,
            }),
        },
      })

      return handled.matched
        ? handled.response
        : new Response(null, { status: 404 })
    },
  })

  return createORPCClient<RouterClient<typeof procedures>>(link)
}

afterEach(async () => {
  await testDatabase?.cleanup()
  testDatabase = null
  globalThis.__INVITERR_CONFIG_MANAGER__ = undefined
  vi.resetModules()
  vi.clearAllMocks()
})

describe("invite management", () => {
  it("rejects invalid invite creation before persisting and normalizes the corrected code", async () => {
    const setup = await loadInvitesServiceModules()
    const profileId = crypto.randomUUID()
    // Invites reference their creator, who always has a users row.
    await setup.database.db
      .insert(setup.schema.users)
      .values({ userId: TEST_ADMIN_ACTOR.id })
    await setup.database.db.insert(setup.schema.profiles).values({
      id: profileId,
      name: "Members",
      policy: setup.schema.DEFAULT_PROFILE_POLICY,
    })

    expect(
      await setup.invitesService.createInviteService(TEST_ADMIN_ACTOR, {
        profileId,
        code: "bad!",
      }),
    ).toMatchObject({
      success: false,
      code: setup.errors.ErrorCode.VALIDATION_FAILED,
    })
    expect(await setup.database.db.query.invites.findMany()).toEqual([])

    const result = await setup.invitesService.createInviteService(
      TEST_ADMIN_ACTOR,
      {
        profileId,
        code: "  family-2026  ",
      },
    )
    expect(result).toMatchObject({
      success: true,
      data: {
        code: "FAMILY-2026",
        profileName: "Members",
        useLimit: null,
        useCount: 0,
        isDisabled: false,
      },
    })
    expect(await setup.database.db.query.invites.findMany()).toMatchObject([
      { code: "FAMILY-2026", profileId, useLimit: null, useCount: 0 },
    ])
  })

  it("paginates matching invites using URL search values and rejects invalid pages", async () => {
    const setup = await loadInvitesServiceModules()
    const profileId = crypto.randomUUID()
    await setup.database.db.insert(setup.schema.profiles).values({
      id: profileId,
      name: "Members",
      policy: setup.schema.DEFAULT_PROFILE_POLICY,
    })
    await setup.database.db.insert(setup.schema.invites).values([
      { id: crypto.randomUUID(), profileId, code: "FAMILY-01" },
      { id: crypto.randomUUID(), profileId, code: "FAMILY-02" },
      { id: crypto.randomUUID(), profileId, code: "FRIENDS-01" },
    ])
    expect(await setup.invitesService.listInvitesPageService({})).toMatchObject(
      { success: true, data: { page: 1, pageSize: 50, total: 3 } },
    )
    const result = await setup.invitesService.listInvitesPageService({
      page: "2",
      pageSize: "1",
      query: "  FAMILY  ",
      sort: "code",
      direction: "asc",
    })
    expect(result).toMatchObject({
      success: true,
      data: {
        items: [{ code: "FAMILY-02" }],
        page: 2,
        pageSize: 1,
        total: 2,
        pageCount: 2,
      },
    })
    expect(
      await setup.invitesService.listInvitesPageService({ page: "invalid" }),
    ).toMatchObject({
      success: false,
      code: setup.errors.ErrorCode.VALIDATION_FAILED,
    })
  })

  it("allows disabling an invite without letting submitted fields reset its usage counter", async () => {
    const setup = await loadInvitesServiceModules()
    const profileId = crypto.randomUUID()
    const inviteId = crypto.randomUUID()
    await setup.database.db.insert(setup.schema.profiles).values({
      id: profileId,
      name: "Members",
      policy: setup.schema.DEFAULT_PROFILE_POLICY,
    })
    await setup.database.db.insert(setup.schema.invites).values({
      id: inviteId,
      profileId,
      code: "FAMILY-01",
      useLimit: 2,
      useCount: 1,
    })
    expect(
      await setup.invitesService.updateInviteService(
        TEST_ADMIN_ACTOR,
        inviteId,
        {},
      ),
    ).toMatchObject({
      success: false,
      code: setup.errors.ErrorCode.VALIDATION_FAILED,
    })
    const updates = { isDisabled: true, useCount: 0 }
    expect(
      await setup.invitesService.updateInviteService(
        TEST_ADMIN_ACTOR,
        inviteId,
        updates,
      ),
    ).toMatchObject({ success: true, data: { isDisabled: true, useCount: 1 } })
    expect(await setup.database.db.query.invites.findMany()).toMatchObject([
      { id: inviteId, isDisabled: true, useCount: 1 },
    ])
  })

  it("persists an invite access duration without changing the expiry of users who already redeemed it", async () => {
    const setup = await loadInvitesServiceModules()
    const profileId = crypto.randomUUID()
    await setup.database.db.insert(setup.schema.profiles).values({
      id: profileId,
      name: "Trial",
      policy: setup.schema.DEFAULT_PROFILE_POLICY,
    })
    await setup.database.db
      .insert(setup.schema.users)
      .values({ userId: TEST_ADMIN_ACTOR.id })

    const created = await setup.invitesService.createInviteService(
      TEST_ADMIN_ACTOR,
      {
        profileId,
        code: "TRIAL-30",
        accessDurationDays: 30,
      },
    )
    if (!created.success) {
      throw new Error("Expected invite creation to succeed")
    }
    expect(created.data.accessDurationDays).toBe(30)

    const existingExpiry = new Date("2030-01-01T00:00:00.000Z")
    await setup.database.db.insert(setup.schema.users).values({
      userId: "trial-user",
      inviteId: created.data.id,
      expiresAt: existingExpiry,
    })

    expect(
      await setup.invitesService.updateInviteService(
        TEST_ADMIN_ACTOR,
        created.data.id,
        {
          accessDurationDays: 7,
        },
      ),
    ).toMatchObject({ success: true, data: { accessDurationDays: 7 } })
    expect(await setup.invitesService.listInvitesPageService({})).toMatchObject(
      {
        success: true,
        data: { items: [{ code: "TRIAL-30", accessDurationDays: 7 }] },
      },
    )
    const redeemedUser = await setup.database.db.query.users.findFirst({
      where: eq(setup.schema.users.userId, "trial-user"),
    })
    expect(redeemedUser?.expiresAt).toEqual(existingExpiry)

    expect(
      await setup.invitesService.updateInviteService(
        TEST_ADMIN_ACTOR,
        created.data.id,
        {
          accessDurationDays: null,
        },
      ),
    ).toMatchObject({ success: true, data: { accessDurationDays: null } })
    expect(await setup.database.db.query.invites.findMany()).toMatchObject([
      { id: created.data.id, access_duration_days: null },
    ])
  })

  it("rejects out-of-range access durations at the admin RPC boundary without persisting them", async () => {
    const setup = await loadInvitesServiceModules()
    const client = await createAdminRpcClient(testDatabase!)
    const profileId = crypto.randomUUID()
    await setup.database.db.insert(setup.schema.profiles).values({
      id: profileId,
      name: "Trial",
      policy: setup.schema.DEFAULT_PROFILE_POLICY,
    })
    await setup.database.db
      .insert(setup.schema.users)
      .values({ userId: adminSession.userId })

    for (const accessDurationDays of [0, 3651, 1.5]) {
      await expect(
        client.admin.invites.create({ profileId, accessDurationDays }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST", status: 400 })
    }
    expect(await setup.database.db.query.invites.findMany()).toEqual([])

    const invite = await client.admin.invites.create({
      profileId,
      accessDurationDays: 90,
    })
    expect(invite.accessDurationDays).toBe(90)

    await expect(
      client.admin.invites.update({
        inviteId: invite.id,
        updates: { accessDurationDays: -1 },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", status: 400 })
    expect(await setup.database.db.query.invites.findMany()).toMatchObject([
      { id: invite.id, access_duration_days: 90 },
    ])
  })
})

describe("bulkManageInvitesService", () => {
  it("disables invites, skips already-disabled ones, and reports missing invites", async () => {
    const setup = await loadInvitesServiceModules()

    const profileId = crypto.randomUUID()
    await setup.database.db.insert(setup.schema.profiles).values({
      id: profileId,
      name: "Standard",
      isDefault: true,
      policy: setup.schema.DEFAULT_PROFILE_POLICY,
    })

    const enabledInviteId = crypto.randomUUID()
    const disabledInviteId = crypto.randomUUID()
    const missingInviteId = crypto.randomUUID()
    await setup.database.db.insert(setup.schema.invites).values([
      { id: enabledInviteId, code: "ENABLED", profileId, isDisabled: false },
      { id: disabledInviteId, code: "DISABLED", profileId, isDisabled: true },
    ])

    const result = await setup.invitesService.bulkManageInvitesService(
      TEST_ADMIN_ACTOR,
      {
        operation: "disable",
        inviteIds: [enabledInviteId, disabledInviteId, missingInviteId],
      },
    )

    expect(result.success).toBe(true)
    if (!result.success) {
      throw new Error("Expected bulk disable to return a success envelope")
    }

    expect(result.data.results).toEqual([
      expect.objectContaining({
        inviteId: enabledInviteId,
        ok: true,
        operation: "disable",
        result: expect.objectContaining({
          isDisabled: true,
          status: "disabled",
          profileName: "Standard",
        }),
      }),
      {
        inviteId: disabledInviteId,
        ok: true,
        operation: "disable",
        skipped: true,
        reason: "already_disabled",
      },
      expect.objectContaining({
        inviteId: missingInviteId,
        ok: false,
        operation: "disable",
        code: setup.errors.ErrorCode.NOT_FOUND,
      }),
    ])

    const storedInvites = await setup.database.db.query.invites.findMany()
    expect(
      storedInvites.map((invite) => [invite.id, invite.isDisabled]),
    ).toEqual(
      expect.arrayContaining([
        [enabledInviteId, true],
        [disabledInviteId, true],
      ]),
    )
  })

  it("re-enables disabled invites and skips already-enabled ones", async () => {
    const setup = await loadInvitesServiceModules()

    const profileId = crypto.randomUUID()
    await setup.database.db.insert(setup.schema.profiles).values({
      id: profileId,
      name: "Standard",
      isDefault: true,
      policy: setup.schema.DEFAULT_PROFILE_POLICY,
    })

    const disabledInviteId = crypto.randomUUID()
    const enabledInviteId = crypto.randomUUID()
    await setup.database.db.insert(setup.schema.invites).values([
      { id: disabledInviteId, code: "DISABLED", profileId, isDisabled: true },
      { id: enabledInviteId, code: "ENABLED", profileId, isDisabled: false },
    ])

    const result = await setup.invitesService.bulkManageInvitesService(
      TEST_ADMIN_ACTOR,
      {
        operation: "enable",
        inviteIds: [disabledInviteId, enabledInviteId],
      },
    )

    expect(result.success).toBe(true)
    if (!result.success) {
      throw new Error("Expected bulk enable to return a success envelope")
    }

    expect(result.data.results).toEqual([
      expect.objectContaining({
        inviteId: disabledInviteId,
        ok: true,
        operation: "enable",
        result: expect.objectContaining({ isDisabled: false }),
      }),
      {
        inviteId: enabledInviteId,
        ok: true,
        operation: "enable",
        skipped: true,
        reason: "already_enabled",
      },
    ])
  })

  it("deletes invites together with their usage records", async () => {
    const setup = await loadInvitesServiceModules()

    const profileId = crypto.randomUUID()
    await setup.database.db.insert(setup.schema.profiles).values({
      id: profileId,
      name: "Standard",
      isDefault: true,
      policy: setup.schema.DEFAULT_PROFILE_POLICY,
    })

    const usedInviteId = crypto.randomUUID()
    const untouchedInviteId = crypto.randomUUID()
    await setup.database.db.insert(setup.schema.invites).values([
      { id: usedInviteId, code: "USED", profileId, useCount: 1 },
      { id: untouchedInviteId, code: "KEPT", profileId },
    ])
    await setup.database.db
      .insert(setup.schema.users)
      .values({ userId: "invited-user", inviteId: usedInviteId })
    await setup.database.db
      .insert(setup.schema.inviteUsages)
      .values({ inviteId: usedInviteId, userId: "invited-user" })

    const result = await setup.invitesService.bulkManageInvitesService(
      TEST_ADMIN_ACTOR,
      {
        operation: "delete",
        inviteIds: [usedInviteId],
      },
    )

    expect(result.success).toBe(true)
    if (!result.success) {
      throw new Error("Expected bulk delete to return a success envelope")
    }

    expect(result.data.results).toEqual([
      { inviteId: usedInviteId, ok: true, operation: "delete" },
    ])

    const remainingInvites = await setup.database.db.query.invites.findMany()
    expect(remainingInvites.map((invite) => invite.id)).toEqual([
      untouchedInviteId,
    ])
    expect(await setup.database.db.query.inviteUsages.findMany()).toEqual([])
  })

  it("rejects invalid input with a validation error", async () => {
    const setup = await loadInvitesServiceModules()

    const result = await setup.invitesService.bulkManageInvitesService(
      TEST_ADMIN_ACTOR,
      {
        operation: "disable",
        inviteIds: [],
      },
    )

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        code: setup.errors.ErrorCode.VALIDATION_FAILED,
      }),
    )
  })
})

import { writeFile } from "node:fs/promises"

import { createORPCClient } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import type { RouterClient } from "@orpc/server"
import { RPCHandler } from "@orpc/server/fetch"
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import { SYSTEM_AUDIT_ACTOR } from "@/lib/audit"
import type { SessionData } from "@/lib/session"
import type { ORPCContext } from "@/server/orpc/context"
import type { orpcRouter } from "@/server/orpc/router"
import type { ResolveSessionResult } from "@/server/session-resolver"
import {
  configureTestEnvironment,
  createTestDatabase,
  type TestDatabase,
} from "@/test/db"

vi.mock("@/server/jellyfin", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/server/jellyfin")>()

  return {
    ...original,
    getAllUsers: vi.fn<typeof original.getAllUsers>(),
    updateUserPolicy: vi.fn<typeof original.updateUserPolicy>(),
  }
})

vi.mock("@/server/config-validation", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/server/config-validation")>()

  return {
    ...original,
    assertJellyfinConnection: vi.fn<typeof original.assertJellyfinConnection>(),
  }
})

const DAY_MS = 24 * 60 * 60 * 1000
const JELLYFIN_API_KEY = "stored-jellyfin-api-key"

const memberSession: SessionData = {
  userId: "member-1",
  name: "Member User",
  avatarUrl: "https://app.test/avatar",
  isAdmin: false,
  email: "member@example.com",
  emailVerified: true,
  locale: null,
  createdAt: new Date(0).toISOString(),
}

const adminSession: SessionData = {
  ...memberSession,
  userId: "admin-1",
  name: "Admin User",
  email: "admin@example.com",
  isAdmin: true,
}

// The config manager is a process-wide singleton that keeps the first
// CONFIG_PATH it sees, so the whole file shares one config file while each
// test still gets its own database.
let configWorkspace: TestDatabase | null = null
let testDatabase: TestDatabase | null = null

async function loadAuditModules() {
  testDatabase = await createTestDatabase()
  configureTestEnvironment({
    ...testDatabase,
    configPath: configWorkspace!.configPath,
  })
  vi.resetModules()

  const router = await import("@/server/orpc/router")
  const audit = await import("@/server/audit")
  const config = await import("@/lib/server/config.server")
  const database = await import("@/server/db")
  const schema = await import("@/server/db/schema")
  const jellyfin = await import("@/server/jellyfin")
  const userLifecycle = await import("@/server/user-lifecycle")

  await database.ensureMigrated()

  return {
    router,
    audit,
    config,
    database,
    schema,
    jellyfin,
    userLifecycle,
  }
}

type AuditTestModules = Awaited<ReturnType<typeof loadAuditModules>>

function createClient(
  setup: AuditTestModules,
  session: SessionData | null,
): RouterClient<typeof orpcRouter> {
  const handler = new RPCHandler(setup.router.orpcRouter)
  const link = new RPCLink({
    url: "https://app.test/rpc",
    headers: { origin: "https://app.test" },
    fetch: async (request) => {
      const context: ORPCContext = {
        request,
        requestId: crypto.randomUUID(),
        clientIp: "127.0.0.1",
        userAgent: "audit-test",
        resolveSession: () =>
          Promise.resolve<ResolveSessionResult>({
            status: session ? "authenticated" : "unauthenticated",
            session,
            sessionRecord: null,
          }),
      }
      const handled = await handler.handle(request, { prefix: "/rpc", context })

      return handled.matched
        ? handled.response
        : new Response(null, { status: 404 })
    },
  })

  return createORPCClient(link)
}

function listAuditRows(setup: AuditTestModules) {
  return setup.database.db.select().from(setup.schema.audit_events)
}

beforeAll(async () => {
  configWorkspace = await createTestDatabase()
})

beforeEach(async () => {
  await writeFile(
    configWorkspace!.configPath,
    JSON.stringify({
      jellyfin: {
        internalUrl: "http://jellyfin.test",
        apiKey: JELLYFIN_API_KEY,
      },
    }),
  )
})

afterEach(async () => {
  await testDatabase?.cleanup()
  testDatabase = null
  vi.resetModules()
  vi.clearAllMocks()
})

afterAll(async () => {
  await configWorkspace?.cleanup()
  configWorkspace = null
})

describe("audit log", () => {
  it("records admin RPC mutations with the acting admin and target", async () => {
    const setup = await loadAuditModules()
    const profileId = crypto.randomUUID()
    await setup.database.db
      .insert(setup.schema.users)
      .values({ userId: adminSession.userId })
    await setup.database.db.insert(setup.schema.profiles).values({
      id: profileId,
      name: "Members",
      policy: setup.schema.DEFAULT_PROFILE_POLICY,
    })
    const client = createClient(setup, adminSession)

    const first = await client.admin.invites.create({
      profileId,
      code: "family-01",
    })
    const second = await client.admin.invites.create({
      profileId,
      code: "family-02",
    })
    await client.admin.invites.bulk({
      operation: "delete",
      inviteIds: [first.id, second.id],
    })

    const rows = await listAuditRows(setup)
    const admin = {
      actor_type: "admin",
      actor_id: adminSession.userId,
      actor_name: adminSession.name,
      target_type: "invite",
    }
    expect(rows).toHaveLength(4)
    expect(rows).toContainEqual(
      expect.objectContaining({
        ...admin,
        action: "invite.created",
        target_id: first.id,
        target_label: "FAMILY-01",
        batch_id: null,
        details: { profile: "Members", useLimit: null, expiresAt: null },
      }),
    )

    const deleted = rows.filter((row) => row.action === "invite.deleted")
    const batchId = deleted[0]?.batch_id
    expect(batchId).toEqual(expect.any(String))
    expect(deleted).toHaveLength(2)
    expect(deleted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ...admin,
          target_id: first.id,
          batch_id: batchId,
        }),
        expect.objectContaining({
          ...admin,
          target_id: second.id,
          batch_id: batchId,
        }),
      ]),
    )

    const batchPage = await client.admin.audit.page({ batch: batchId! })
    expect(batchPage).toMatchObject({ total: 2, retentionDays: 365 })
    expect(batchPage.items.map((item) => item.action)).toEqual([
      "invite.deleted",
      "invite.deleted",
    ])
  })

  it("matches target searches literally", async () => {
    const setup = await loadAuditModules()
    await Promise.all(
      ["FAMILY_01", "FAMILYX01", "100%"].map((label) =>
        setup.audit.recordAuditEvent(SYSTEM_AUDIT_ACTOR, {
          action: "invite.reconciled",
          target: { id: crypto.randomUUID(), label },
        }),
      ),
    )
    const client = createClient(setup, adminSession)
    const searchLabels = async (target: string) =>
      (await client.admin.audit.page({ target })).items.map(
        (item) => item.targetLabel,
      )

    expect(await searchLabels("family_01")).toEqual(["FAMILY_01"])
    expect(await searchLabels("%")).toEqual(["100%"])
  })

  it("records settings changes without storing secrets", async () => {
    const setup = await loadAuditModules()
    const client = createClient(setup, adminSession)

    await client.admin.settings.updateJellyfin({
      apiKey: "rotated-jellyfin-api-key",
      displayName: "Home Media",
    })

    const rows = await listAuditRows(setup)
    expect(rows).toEqual([
      expect.objectContaining({
        actor_type: "admin",
        actor_id: adminSession.userId,
        action: "settings.updated",
        target_type: "settings",
        target_id: "jellyfin",
        details: {
          apiKey: { changed: true },
          displayName: { from: null, to: "Home Media" },
        },
      }),
    ])
    const serialized = JSON.stringify(rows)
    expect(serialized).not.toContain(JELLYFIN_API_KEY)
    expect(serialized).not.toContain("rotated-jellyfin-api-key")
  })

  it("rejects non-admin sessions on audit procedures", async () => {
    const setup = await loadAuditModules()
    await setup.audit.recordAuditEvent(
      { type: "admin", id: adminSession.userId, name: adminSession.name },
      { action: "invite.deleted", target: { id: crypto.randomUUID() } },
    )
    const member = createClient(setup, memberSession)
    const anonymous = createClient(setup, null)

    await expect(member.admin.audit.page({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    })
    await expect(
      member.admin.audit.updateRetention({ retentionDays: 1 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    await expect(anonymous.admin.audit.page({})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    })

    expect(setup.config.configManager.audit.retentionDays).toBe(365)
    expect(await listAuditRows(setup)).toHaveLength(1)
  })

  it("records a system event when the expiry sweep disables a user", async () => {
    const setup = await loadAuditModules()
    const expiresAt = new Date(Date.now() - DAY_MS)
    await setup.database.db
      .insert(setup.schema.users)
      .values({ userId: "expired-user", expiresAt })
    const jellyfinUser = {
      id: "expired-user",
      name: "Expired User",
      isAdmin: false,
      isDisabled: false,
      lastActivityDate: null,
      hasPassword: true,
      avatarUrl: "",
    }
    vi.mocked(setup.jellyfin.getAllUsers)
      .mockResolvedValueOnce([jellyfinUser])
      .mockResolvedValueOnce([{ ...jellyfinUser, isDisabled: true }])
    vi.mocked(setup.jellyfin.updateUserPolicy).mockResolvedValue()

    await setup.userLifecycle.sweepExpiredUsers()
    // A later sweep over the now-disabled user must not add another row.
    await setup.userLifecycle.sweepExpiredUsers()

    expect(setup.jellyfin.updateUserPolicy).toHaveBeenCalledTimes(1)
    expect(await listAuditRows(setup)).toEqual([
      expect.objectContaining({
        actor_type: "system",
        actor_id: null,
        actor_name: null,
        action: "user.expired",
        target_type: "user",
        target_id: "expired-user",
        target_label: "Expired User",
        details: { expiresAt: expiresAt.toISOString() },
      }),
    ])
  })

  it("prunes events older than the retention window", async () => {
    const setup = await loadAuditModules()
    const now = new Date()
    const insertEvent = async (ageDays: number) => {
      const id = crypto.randomUUID()
      await setup.database.db.insert(setup.schema.audit_events).values({
        id,
        created_at: new Date(now.getTime() - ageDays * DAY_MS),
        actor_type: "system",
        action: "invite.reconciled",
        target_type: "invite",
      })
      return id
    }
    const listIds = async () =>
      (await listAuditRows(setup)).map((row) => row.id).toSorted()

    await insertEvent(31)
    const recent = await insertEvent(29)
    await setup.config.configManager.setAudit({ retentionDays: 30 })
    await setup.audit.pruneAuditEvents(now)

    expect(await listIds()).toEqual([recent])

    // A retention of 0 keeps events forever.
    const ancient = await insertEvent(3650)
    await setup.config.configManager.setAudit({ retentionDays: 0 })
    await setup.audit.pruneAuditEvents(now)

    expect(await listIds()).toEqual([ancient, recent].toSorted())
  })
})

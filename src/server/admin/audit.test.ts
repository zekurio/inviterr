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

  it("pages with a cursor that events recorded meanwhile do not shift", async () => {
    const setup = await loadAuditModules()
    const dayAgo = Date.now() - DAY_MS
    // event-b and event-c share a timestamp, so the id breaks the tie.
    await setup.database.db.insert(setup.schema.audit_events).values(
      [
        { id: "event-a", minutesEarlier: 0 },
        { id: "event-b", minutesEarlier: 1 },
        { id: "event-c", minutesEarlier: 1 },
        { id: "event-d", minutesEarlier: 2 },
        { id: "event-e", minutesEarlier: 3 },
      ].map((event) => ({
        id: event.id,
        created_at: new Date(dayAgo - event.minutesEarlier * 60_000),
        actor_type: "system" as const,
        action: "invite.reconciled" as const,
        target_type: "invite" as const,
      })),
    )
    const client = createClient(setup, adminSession)

    const first = await client.admin.audit.page({ pageSize: 2 })
    // Newer than everything listed so far, so offset paging would repeat a row.
    await setup.audit.recordAuditEvent(SYSTEM_AUDIT_ACTOR, {
      action: "invite.reconciled",
      target: { id: null },
    })
    const second = await client.admin.audit.page({
      pageSize: 2,
      cursor: first.nextCursor!,
    })
    const third = await client.admin.audit.page({
      pageSize: 2,
      cursor: second.nextCursor!,
    })

    expect(
      [first, second, third].flatMap((page) =>
        page.items.map((item) => item.id),
      ),
    ).toEqual(["event-a", "event-c", "event-b", "event-d", "event-e"])
    expect(third).toMatchObject({ nextCursor: null, total: 6 })
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

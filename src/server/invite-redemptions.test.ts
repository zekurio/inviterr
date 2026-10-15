import { eq } from "drizzle-orm"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  configureTestEnvironment,
  createTestDatabase,
  type TestDatabase,
} from "@/test/db"

vi.mock("@/lib/server/config.server", () => ({
  configManager: {
    get seerr() {
      return undefined
    },
    isConfigured: () => true,
  },
}))

vi.mock("@/server/jellyfin", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/server/jellyfin")>()

  return {
    ...original,
    getAllUsers: vi.fn<typeof original.getAllUsers>(),
    deleteUser: vi.fn<typeof original.deleteUser>(),
  }
})

let testDatabase: TestDatabase | null = null

function jellyfinAccount(id: string, name: string, isAdmin = false) {
  return {
    id,
    name,
    isAdmin,
    isDisabled: false,
    lastActivityDate: null,
    hasPassword: true,
    avatarUrl: "",
  }
}

async function loadModules() {
  testDatabase = await createTestDatabase()
  configureTestEnvironment(testDatabase)
  vi.resetModules()

  const redemptions = await import("@/server/invite-redemptions")
  const userLifecycle = await import("@/server/user-lifecycle")
  const database = await import("@/server/db")
  const schema = await import("@/server/db/schema")
  const jellyfin = await import("@/server/jellyfin")

  await database.ensureMigrated()

  // The account list reflects deletions, like the real server would.
  const accounts = new Map<string, ReturnType<typeof jellyfinAccount>>()
  vi.mocked(jellyfin.getAllUsers).mockImplementation(async () => [
    ...accounts.values(),
  ])
  vi.mocked(jellyfin.deleteUser).mockImplementation(async (userId) => {
    accounts.delete(userId)
  })

  const profile = { id: crypto.randomUUID(), name: "Managed" }
  await database.db
    .insert(schema.profiles)
    .values({ ...profile, policy: schema.DEFAULT_PROFILE_POLICY })
  const invite = { id: crypto.randomUUID(), code: "LIMBO123" }
  await database.db
    .insert(schema.invites)
    .values({ ...invite, profileId: profile.id })

  async function seedPending(values: {
    username: string
    user_id?: string | null
    ageMs: number
  }) {
    const id = crypto.randomUUID()
    await database.db.insert(schema.pending_redemptions).values({
      id,
      invite_id: invite.id,
      username: values.username,
      user_id: values.user_id ?? null,
      started_at: new Date(Date.now() - values.ageMs),
    })
    return id
  }

  async function pendingIds() {
    const rows = await database.db
      .select({ id: schema.pending_redemptions.id })
      .from(schema.pending_redemptions)
    return rows.map((row) => row.id)
  }

  async function localUser(userId: string) {
    return database.db.query.users.findFirst({
      where: eq(schema.users.userId, userId),
    })
  }

  return {
    redemptions,
    userLifecycle,
    database,
    schema,
    jellyfin,
    accounts,
    seedPending,
    pendingIds,
    localUser,
  }
}

afterEach(async () => {
  await testDatabase?.cleanup()
  testDatabase = null
  vi.clearAllMocks()
})

describe("abandoned invite redemptions", () => {
  it("removes a limbo account at startup instead of seeding it as a permanent user", async () => {
    const setup = await loadModules()
    setup.accounts.set("jf-admin", jellyfinAccount("jf-admin", "admin", true))
    setup.accounts.set("jf-limbo", jellyfinAccount("jf-limbo", "Limbo-User"))
    // Jellyfin never returned the ID, so only the username identifies it.
    await setup.seedPending({ username: "limbo-user", ageMs: 5_000 })

    await setup.userLifecycle.runUserStartupMaintenance()

    expect(setup.jellyfin.deleteUser).toHaveBeenCalledWith("jf-limbo")
    expect([...setup.accounts.keys()]).toEqual(["jf-admin"])
    expect(await setup.localUser("jf-limbo")).toBeUndefined()
    expect(await setup.localUser("jf-admin")).toBeDefined()
    expect(await setup.pendingIds()).toEqual([])
    expect(
      await setup.database.db.query.audit_events.findMany({
        where: (events, { eq }) => eq(events.action, "user.deleted"),
      }),
    ).toEqual([
      expect.objectContaining({
        actor_type: "system",
        target_id: "jf-limbo",
        target_label: "Limbo-User",
        details: { abandonedRedemption: true, deletedFromJellyfin: true },
      }),
    ])
  })

  it("keeps an account whose redemption completed but whose row was left behind", async () => {
    const setup = await loadModules()
    setup.accounts.set("jf-done", jellyfinAccount("jf-done", "done-user"))
    await setup.database.db
      .insert(setup.schema.users)
      .values({ userId: "jf-done", createdAt: new Date() })
    await setup.seedPending({
      username: "done-user",
      user_id: "jf-done",
      ageMs: 60 * 60 * 1000,
    })

    await setup.redemptions.cleanupAbandonedRedemptions({ olderThanMs: 0 })

    expect(setup.jellyfin.deleteUser).not.toHaveBeenCalled()
    expect(setup.accounts.has("jf-done")).toBe(true)
    expect(await setup.pendingIds()).toEqual([])
  })

  it("drops the row when no account was created", async () => {
    const setup = await loadModules()
    await setup.seedPending({ username: "never-created", ageMs: 60_000 })

    await setup.redemptions.cleanupAbandonedRedemptions({ olderThanMs: 0 })

    expect(setup.jellyfin.deleteUser).not.toHaveBeenCalled()
    expect(await setup.pendingIds()).toEqual([])
  })

  it("keeps the row for another pass when Jellyfin refuses to delete the account", async () => {
    const setup = await loadModules()
    setup.accounts.set("jf-limbo", jellyfinAccount("jf-limbo", "limbo-user"))
    const pendingId = await setup.seedPending({
      username: "limbo-user",
      user_id: "jf-limbo",
      ageMs: 60_000,
    })
    vi.mocked(setup.jellyfin.deleteUser).mockRejectedValueOnce(
      new Error("Jellyfin unavailable"),
    )

    await setup.redemptions.cleanupAbandonedRedemptions({ olderThanMs: 0 })

    expect(await setup.pendingIds()).toEqual([pendingId])
    expect(setup.accounts.has("jf-limbo")).toBe(true)
    expect(await setup.database.db.query.audit_events.findMany()).toEqual([])
  })

  it("leaves a redemption that may still be in flight alone", async () => {
    const setup = await loadModules()
    setup.accounts.set("jf-fresh", jellyfinAccount("jf-fresh", "fresh-user"))
    const pendingId = await setup.seedPending({
      username: "fresh-user",
      user_id: "jf-fresh",
      ageMs: 1_000,
    })

    await setup.redemptions.cleanupAbandonedRedemptions({
      olderThanMs: setup.redemptions.ABANDONED_REDEMPTION_GRACE_MS,
    })

    expect(setup.jellyfin.getAllUsers).not.toHaveBeenCalled()
    expect(setup.jellyfin.deleteUser).not.toHaveBeenCalled()
    expect(await setup.pendingIds()).toEqual([pendingId])
  })
})

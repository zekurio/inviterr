import { afterEach, describe, expect, it, vi } from "vitest"

import type { SessionData } from "@/lib/session"
import type { deleteLinkedSeerrUser } from "@/server/user-lifecycle"
import {
  configureTestEnvironment,
  createTestDatabase,
  type TestDatabase,
} from "@/test/db"

vi.mock("@/server/jellyfin", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/server/jellyfin")>()

  return {
    ...original,
    deleteUser: vi.fn<typeof original.deleteUser>(),
  }
})

vi.mock("@/server/user-lifecycle", async (importOriginal) => {
  const original = await importOriginal<{
    deleteLinkedSeerrUser: typeof deleteLinkedSeerrUser
  }>()

  return {
    ...original,
    deleteLinkedSeerrUser: vi.fn<typeof deleteLinkedSeerrUser>(),
  }
})

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

let testDatabase: TestDatabase | null = null

async function loadMeModules() {
  testDatabase = await createTestDatabase()
  configureTestEnvironment(testDatabase)
  vi.resetModules()

  const me = await import("@/server/me")
  const database = await import("@/server/db")
  const jellyfin = await import("@/server/jellyfin")
  const userLifecycle = await import("@/server/user-lifecycle")

  await database.ensureMigrated()

  return { me, database, jellyfin, userLifecycle }
}

afterEach(async () => {
  await testDatabase?.cleanup()
  testDatabase = null
  vi.resetModules()
  vi.clearAllMocks()
})

describe("deleteMyAccount", () => {
  it("records a deletion that stops after the Seerr account is gone", async () => {
    const setup = await loadMeModules()
    vi.mocked(setup.userLifecycle.deleteLinkedSeerrUser).mockResolvedValue(true)
    vi.mocked(setup.jellyfin.deleteUser).mockRejectedValue(
      new Error("Jellyfin unavailable"),
    )

    await expect(setup.me.deleteMyAccount(memberSession)).rejects.toThrow(
      "Jellyfin unavailable",
    )

    expect(await setup.database.db.query.audit_events.findMany()).toEqual([
      expect.objectContaining({
        actor_type: "user",
        actor_id: memberSession.userId,
        action: "user.deleted",
        target_id: memberSession.userId,
        details: {
          email: memberSession.email,
          deletedFromSeerr: true,
          deletedFromJellyfin: false,
          failedStage: "jellyfin",
        },
      }),
    ])
  })
})

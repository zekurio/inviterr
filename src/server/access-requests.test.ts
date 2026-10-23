import { createORPCClient } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import type { RouterClient } from "@orpc/server"
import { RPCHandler } from "@orpc/server/fetch"
import { eq } from "drizzle-orm"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { SessionData } from "@/lib/session"
import type { ORPCContext } from "@/server/orpc/context"
import type { ResolveSessionResult } from "@/server/session-resolver"
import {
  configureTestEnvironment,
  createTestDatabase,
  type TestDatabase,
} from "@/test/db"

const configState = vi.hoisted(() => ({
  accessRequests: { enabled: true } as { enabled: boolean; profileId?: string },
  emailConfigured: true,
}))

vi.mock("@/lib/server/config.server", () => ({
  configManager: {
    isConfigured: () => true,
    needsOnboarding: () => false,
    hasError: () => false,
    getError: () => null,
    get app() {
      return {
        title: "Inviterr",
        description: "",
        defaultLocale: "en",
        url: "https://app.test",
      }
    },
    get appUrl() {
      return "https://app.test"
    },
    get defaultLocale() {
      return "en"
    },
    get accessRequests() {
      return configState.accessRequests
    },
    setAccessRequests: (values: { enabled: boolean; profileId?: string }) => {
      configState.accessRequests = values
      return Promise.resolve()
    },
    get memberOnboarding() {
      return { enabled: false, pages: [] }
    },
    get seerr() {
      return undefined
    },
  },
}))

vi.mock("@/server/startup", () => ({
  runStartupTasks: vi.fn<() => void>(),
}))

vi.mock("@/server/auth", () => ({
  clearAuthCookies: vi.fn<() => void>(),
  establishAuthenticatedSession: vi.fn<() => Promise<void>>(() =>
    Promise.resolve(),
  ),
}))

vi.mock("@/server/email", () => ({
  EmailApiError: class EmailApiError extends Error {},
  isEmailConfigured: () => configState.emailConfigured,
  sendEmail: vi.fn<() => Promise<void>>(),
}))

vi.mock("@/server/email/messages", () => ({
  sendConfiguredEmail: vi.fn<
    (
      to: string,
      request: import("@/server/email/messages").EmailMessageRequest,
    ) => Promise<void>
  >(() => Promise.resolve()),
}))

vi.mock("@/server/profile-sync", () => ({
  SeerrProfileSyncError: class SeerrProfileSyncError extends Error {},
  applyProfileToUser: vi.fn<() => Promise<{ seerrUserId: number | null }>>(() =>
    Promise.resolve({ seerrUserId: null }),
  ),
}))

vi.mock("@/server/jellyfin", () => ({
  authenticateUser: vi.fn<
    () => Promise<{ accessToken: string; isAdmin: boolean; name: string }>
  >(() =>
    Promise.resolve({
      accessToken: "access-token",
      isAdmin: false,
      name: "new-member",
    }),
  ),
  createUser: vi.fn<
    () => Promise<{ id: string; isAdmin: boolean; name: string }>
  >(() =>
    Promise.resolve({
      id: "jellyfin-new-member",
      isAdmin: false,
      name: "new-member",
    }),
  ),
  deleteUser: vi.fn<() => Promise<void>>(),
  getAllUsers: vi.fn<
    () => Promise<Array<{ id: string; isAdmin: boolean; isDisabled: boolean }>>
  >(() => Promise.resolve([])),
  getUserAvatarUrl: (userId: string) =>
    `https://jellyfin.test/Users/${userId}/Images/Primary`,
  isUsernameTaken: vi.fn<() => Promise<boolean>>(() => Promise.resolve(false)),
  uploadUserAvatar: vi.fn<() => Promise<void>>(),
}))

const memberSession: SessionData = {
  userId: "member-1",
  name: "Member",
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
  name: "Admin",
  isAdmin: true,
}

type Procedures = typeof import("@/server/orpc/procedures").procedures

function buildRouter(procedures: Procedures) {
  return {
    accessRequests: procedures.accessRequests,
    invites: { redeem: procedures.invites.redeem },
    admin: {
      accessRequests: procedures.admin.accessRequests,
      settings: {
        updateAccessRequests: procedures.admin.settings.updateAccessRequests,
      },
    },
  }
}

let testDatabase: TestDatabase | null = null

async function setup() {
  testDatabase = await createTestDatabase()
  configureTestEnvironment(testDatabase)
  vi.resetModules()

  const { procedures } = await import("@/server/orpc/procedures")
  const database = await import("@/server/db")
  const schema = await import("@/server/db/schema")
  const accessRequests = await import("@/server/access-requests")
  const adminAccessRequests = await import("@/server/admin/access-requests")
  const jellyfin = await import("@/server/jellyfin")
  const messages = await import("@/server/email/messages")
  const profileSync = await import("@/server/profile-sync")
  await database.ensureMigrated()
  // Admin sessions always belong to a stored user, and invites reference them.
  await database.db.insert(schema.users).values({
    userId: adminSession.userId,
    email: "admin@example.com",
    emailVerified: true,
  })

  const router = buildRouter(procedures)
  const handler = new RPCHandler(router)

  function client(
    options: { session?: SessionData | null; clientIp?: string } = {},
  ) {
    const link = new RPCLink({
      url: "https://app.test/rpc",
      headers: { origin: "https://app.test" },
      fetch: async (request) => {
        const context: ORPCContext = {
          request,
          requestId: crypto.randomUUID(),
          clientIp: options.clientIp ?? "198.51.100.1",
          userAgent: "access-request-test",
          resolveSession: () =>
            Promise.resolve<ResolveSessionResult>(
              options.session
                ? {
                    status: "authenticated",
                    session: options.session,
                    sessionRecord: null,
                  }
                : {
                    status: "unauthenticated",
                    session: null,
                    sessionRecord: null,
                  },
            ),
        }
        const handled = await handler.handle(request, {
          prefix: "/rpc",
          context,
        })
        return handled.matched
          ? handled.response
          : new Response(null, { status: 404 })
      },
    })

    return createORPCClient<RouterClient<typeof router>>(link)
  }

  async function seedProfile(name: string, isDefault = false) {
    const profile = {
      id: crypto.randomUUID(),
      name,
      isDefault,
      policy: {
        ...schema.DEFAULT_PROFILE_POLICY,
        enableAllFolders: !isDefault,
      },
    }
    await database.db.insert(schema.profiles).values(profile)
    return profile
  }

  async function seedRequest(email: string, expiresAt?: Date) {
    const request = {
      id: crypto.randomUUID(),
      email,
      message: null,
      expires_at: expiresAt ?? new Date(Date.now() + 60 * 60 * 1000),
      created_at: new Date(),
    }
    await database.db.insert(schema.access_requests).values(request)
    return request
  }

  async function listRequests() {
    return database.db.select().from(schema.access_requests)
  }

  async function listInvites() {
    return database.db.select().from(schema.invites)
  }

  return {
    client,
    database,
    schema,
    accessRequests,
    adminAccessRequests,
    jellyfin,
    sendConfiguredEmail: vi.mocked(messages.sendConfiguredEmail),
    applyProfileToUser: vi.mocked(profileSync.applyProfileToUser),
    seedProfile,
    seedRequest,
    listRequests,
    listInvites,
  }
}

afterEach(async () => {
  configState.accessRequests = { enabled: true }
  configState.emailConfigured = true
  await testDatabase?.cleanup()
  testDatabase = null
  vi.resetModules()
  vi.clearAllMocks()
})

describe("access request submission", () => {
  it("stores the request and emails verified Jellyfin admins", async () => {
    const app = await setup()
    vi.mocked(app.jellyfin.getAllUsers).mockResolvedValue(
      [
        { id: "admin-1", isAdmin: true, isDisabled: false },
        { id: "admin-2", isAdmin: true, isDisabled: true },
        { id: "admin-3", isAdmin: true, isDisabled: false },
        { id: "member-1", isAdmin: false, isDisabled: false },
      ].map((user) => ({
        ...user,
        name: user.id,
        lastActivityDate: null,
        hasPassword: true,
        avatarUrl: `https://jellyfin.test/Users/${user.id}/Images/Primary`,
      })),
    )
    await app.database.db.insert(app.schema.users).values([
      { userId: "admin-2", email: "off@example.com", emailVerified: true },
      { userId: "admin-3", email: "unverified@example.com" },
      { userId: "member-1", email: "member@example.com", emailVerified: true },
    ])

    await expect(
      app.client().accessRequests.submit({
        email: "Applicant@Example.com",
        message: "  Friend of Alex  ",
      }),
    ).resolves.toBeNull()

    expect(await app.listRequests()).toMatchObject([
      { email: "applicant@example.com", message: "Friend of Alex" },
    ])
    await vi.waitFor(() => {
      expect(app.sendConfiguredEmail).toHaveBeenCalledOnce()
    })
    expect(app.sendConfiguredEmail).toHaveBeenCalledWith("admin@example.com", {
      type: "accessRequestReceived",
      payload: {
        applicantEmail: "applicant@example.com",
        reviewUrl: "https://app.test/dashboard/users",
        locale: "en",
      },
    })
  })

  it("answers known addresses like new ones without storing or notifying", async () => {
    const app = await setup()
    const profile = await app.seedProfile("Members", true)
    await app.database.db
      .insert(app.schema.users)
      .values({ userId: "member-1", email: "member@example.com" })
    await app.database.db.insert(app.schema.invites).values({
      code: "LOCKED01",
      profileId: profile.id,
      useLimit: 1,
      email: "invited@example.com",
    })
    await app.seedRequest("pending@example.com")
    const client = app.client()

    for (const email of [
      "member@example.com",
      "invited@example.com",
      "pending@example.com",
    ]) {
      await expect(client.accessRequests.submit({ email })).resolves.toBeNull()
    }

    expect(await app.listRequests()).toHaveLength(1)
    expect(app.jellyfin.getAllUsers).not.toHaveBeenCalled()
  })

  it("refuses submissions while the feature is off or email is missing", async () => {
    const app = await setup()
    const client = app.client()

    configState.accessRequests = { enabled: false }
    await expect(
      client.accessRequests.submit({ email: "a@example.com" }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { messageKey: "errors.accessRequestsUnavailable" },
    })

    configState.accessRequests = { enabled: true }
    configState.emailConfigured = false
    await expect(
      client.accessRequests.submit({ email: "b@example.com" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })

    expect(await app.listRequests()).toHaveLength(0)
  })

  it("rejects malformed input before storing anything", async () => {
    const app = await setup()
    const client = app.client()

    await expect(
      client.accessRequests.submit({ email: "not-an-email" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    await expect(
      client.accessRequests.submit({
        email: "long@example.com",
        message: "x".repeat(501),
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })

    expect(await app.listRequests()).toHaveLength(0)
  })

  it("rate limits one client address and one applicant email", async () => {
    const app = await setup()
    const sameClient = app.client({ clientIp: "203.0.113.7" })

    for (const index of [1, 2, 3]) {
      await sameClient.accessRequests.submit({
        email: `ip-${index}@example.com`,
      })
    }
    await expect(
      sameClient.accessRequests.submit({ email: "ip-4@example.com" }),
    ).rejects.toMatchObject({ code: "RATE_LIMITED", status: 429 })

    for (const index of [1, 2, 3]) {
      await app
        .client({ clientIp: `192.0.2.${index}` })
        .accessRequests.submit({ email: "Repeat@example.com" })
    }
    await expect(
      app
        .client({ clientIp: "192.0.2.4" })
        .accessRequests.submit({ email: "repeat@example.com" }),
    ).rejects.toMatchObject({ code: "RATE_LIMITED", status: 429 })

    expect(await app.listRequests()).toHaveLength(4)
  })
})

describe("access request review", () => {
  it("keeps the review endpoints admin-only", async () => {
    const app = await setup()
    await app.seedProfile("Members", true)
    const request = await app.seedRequest("applicant@example.com")

    await expect(
      app.client().admin.accessRequests.approve({ requestId: request.id }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 })
    const member = app.client({ session: memberSession })
    await expect(
      member.admin.accessRequests.approve({ requestId: request.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 })
    await expect(
      member.admin.accessRequests.deny({ requestId: request.id, notify: true }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 })

    expect(await app.listRequests()).toHaveLength(1)
    expect(await app.listInvites()).toHaveLength(0)
    expect(app.sendConfiguredEmail).not.toHaveBeenCalled()
  })

  it("approves into a single-use invite locked to the applicant", async () => {
    const app = await setup()
    await app.seedProfile("Members", true)
    const guests = await app.seedProfile("Guests")
    configState.accessRequests = { enabled: true, profileId: guests.id }
    const request = await app.seedRequest("applicant@example.com")

    await expect(
      app
        .client({ session: adminSession })
        .admin.accessRequests.approve({ requestId: request.id }),
    ).resolves.toEqual({ requestId: request.id })

    const [invite] = await app.listInvites()
    expect(invite).toMatchObject({
      profileId: guests.id,
      email: "applicant@example.com",
      useLimit: 1,
      useCount: 0,
      isDisabled: false,
      createdById: "admin-1",
    })
    expect(invite?.expiresAt?.getTime()).toBeGreaterThan(Date.now())
    expect(await app.listRequests()).toHaveLength(0)
    expect(app.sendConfiguredEmail).toHaveBeenCalledWith(
      "applicant@example.com",
      expect.objectContaining({
        type: "accessRequestApproved",
        payload: expect.objectContaining({
          inviteUrl: `https://app.test/invite/${invite?.code}`,
        }),
      }),
    )
  })

  it("creates the Jellyfin account with the request profile on redemption", async () => {
    const app = await setup()
    const members = await app.seedProfile("Members", true)
    const request = await app.seedRequest("applicant@example.com")
    await app
      .client({ session: adminSession })
      .admin.accessRequests.approve({ requestId: request.id })
    const [invite] = await app.listInvites()
    const applicant = app.client({ clientIp: "198.51.100.9" })
    const registration = {
      code: invite!.code,
      username: "new-member",
      password: "Password1",
    }

    await expect(
      applicant.invites.redeem({
        ...registration,
        email: "someone-else@example.com",
      }),
    ).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      data: { messageKey: "errors.inviteEmailMismatch" },
    })
    expect(app.jellyfin.createUser).not.toHaveBeenCalled()

    const result = await applicant.invites.redeem({
      ...registration,
      email: "applicant@example.com",
    })

    expect(result.session?.emailVerified).toBe(true)
    expect(app.jellyfin.createUser).toHaveBeenCalledWith(
      "new-member",
      "Password1",
    )
    expect(app.applyProfileToUser).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "jellyfin-new-member",
        policy: members.policy,
      }),
    )
    const [user] = await app.database.db
      .select()
      .from(app.schema.users)
      .where(eq(app.schema.users.userId, "jellyfin-new-member"))
    expect(user).toMatchObject({
      email: "applicant@example.com",
      emailVerified: true,
      inviteId: invite!.id,
      profileId: members.id,
    })
    const usages = await app.database.db
      .select()
      .from(app.schema.inviteUsages)
      .where(eq(app.schema.inviteUsages.inviteId, invite!.id))
    expect(usages).toHaveLength(1)
    const [usedInvite] = await app.listInvites()
    expect(usedInvite?.useCount).toBe(1)
    // The approval email already proved ownership of the address.
    expect(app.sendConfiguredEmail).toHaveBeenCalledOnce()
  })

  it("falls back to the default profile when the configured one is gone", async () => {
    const app = await setup()
    const members = await app.seedProfile("Members", true)
    configState.accessRequests = {
      enabled: true,
      profileId: crypto.randomUUID(),
    }
    const request = await app.seedRequest("applicant@example.com")

    await app
      .client({ session: adminSession })
      .admin.accessRequests.approve({ requestId: request.id })

    const [invite] = await app.listInvites()
    expect(invite?.profileId).toBe(members.id)
  })

  it("puts the request back when the approval email cannot be sent", async () => {
    const app = await setup()
    await app.seedProfile("Members", true)
    const request = await app.seedRequest("applicant@example.com")
    app.sendConfiguredEmail.mockRejectedValueOnce(new Error("SMTP down"))

    await expect(
      app
        .client({ session: adminSession })
        .admin.accessRequests.approve({ requestId: request.id }),
    ).rejects.toMatchObject({ code: "EMAIL_SERVICE_ERROR" })

    expect(await app.listRequests()).toMatchObject([{ id: request.id }])
    expect(await app.listInvites()).toHaveLength(0)
  })

  it("lets only one of two concurrent approvals create an invite", async () => {
    const app = await setup()
    await app.seedProfile("Members", true)
    const request = await app.seedRequest("applicant@example.com")
    const admin = app.client({ session: adminSession })

    const results = await Promise.allSettled([
      admin.admin.accessRequests.approve({ requestId: request.id }),
      admin.admin.accessRequests.approve({ requestId: request.id }),
    ])

    expect(results.map((result) => result.status).sort()).toEqual([
      "fulfilled",
      "rejected",
    ])
    expect(
      results.find((result) => result.status === "rejected")?.reason,
    ).toMatchObject({ code: "NOT_FOUND" })
    expect(await app.listInvites()).toHaveLength(1)
    expect(app.sendConfiguredEmail).toHaveBeenCalledOnce()
  })

  it("denies requests and emails the applicant only when asked", async () => {
    const app = await setup()
    const notified = await app.seedRequest("notified@example.com")
    const silent = await app.seedRequest("spam@example.com")
    const admin = app.client({ session: adminSession })

    await admin.admin.accessRequests.deny({
      requestId: notified.id,
      notify: true,
      reason: "  We are full right now.  ",
    })
    await admin.admin.accessRequests.deny({
      requestId: silent.id,
      notify: false,
    })

    expect(await app.listRequests()).toHaveLength(0)
    expect(await app.listInvites()).toHaveLength(0)
    expect(app.sendConfiguredEmail).toHaveBeenCalledOnce()
    expect(app.sendConfiguredEmail).toHaveBeenCalledWith(
      "notified@example.com",
      {
        type: "accessRequestDenied",
        payload: { reason: "We are full right now.", locale: "en" },
      },
    )
  })

  it("records approvals, denials, and settings changes as the acting admin", async () => {
    const app = await setup()
    await app.seedProfile("Members", true)
    const guests = await app.seedProfile("Guests")
    const approved = await app.seedRequest("approved@example.com")
    const denied = await app.seedRequest("denied@example.com")
    const admin = app.client({ session: adminSession })

    await admin.admin.accessRequests.approve({ requestId: approved.id })
    await admin.admin.accessRequests.deny({
      requestId: denied.id,
      notify: false,
    })
    await admin.admin.settings.updateAccessRequests({
      enabled: true,
      profileId: guests.id,
    })

    const [invite] = await app.listInvites()
    const actor = {
      actor_type: "admin",
      actor_id: adminSession.userId,
      actor_name: adminSession.name,
    }
    expect(await app.database.db.query.audit_events.findMany()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ...actor,
          action: "access_request.approved",
          target_type: "access_request",
          target_id: approved.id,
          target_label: "approved@example.com",
          details: expect.objectContaining({
            invite: invite?.code,
            profile: "Members",
          }),
        }),
        expect.objectContaining({
          ...actor,
          action: "access_request.denied",
          target_id: denied.id,
          target_label: "denied@example.com",
          details: { notified: false },
        }),
        expect.objectContaining({
          ...actor,
          action: "settings.updated",
          target_id: "accessRequests",
          details: { profile: { from: null, to: "Guests" } },
        }),
      ]),
    )
  })

  it("only enables the feature when email delivery is ready", async () => {
    const app = await setup()
    const guests = await app.seedProfile("Guests")
    configState.accessRequests = { enabled: false }
    configState.emailConfigured = false
    const admin = app.client({ session: adminSession })

    await expect(
      admin.admin.settings.updateAccessRequests({
        enabled: true,
        profileId: null,
      }),
    ).rejects.toMatchObject({ code: "EMAIL_NOT_CONFIGURED" })
    expect(configState.accessRequests).toEqual({ enabled: false })

    configState.emailConfigured = true
    await expect(
      admin.admin.settings.updateAccessRequests({
        enabled: true,
        profileId: guests.id,
      }),
    ).resolves.toMatchObject({
      enabled: true,
      profileId: guests.id,
      deliveryReady: true,
    })
    expect(configState.accessRequests).toEqual({
      enabled: true,
      profileId: guests.id,
    })
  })
})

describe("access request expiry", () => {
  it("prunes expired requests and refuses to approve them", async () => {
    const app = await setup()
    await app.seedProfile("Members", true)
    const expired = await app.seedRequest(
      "expired@example.com",
      new Date(Date.now() - 1_000),
    )
    const fresh = await app.seedRequest("fresh@example.com")

    const pending = await app.adminAccessRequests.listAccessRequestsService()
    expect(pending).toMatchObject({
      success: true,
      data: { requests: [{ id: fresh.id }] },
    })
    await expect(
      app
        .client({ session: adminSession })
        .admin.accessRequests.approve({ requestId: expired.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" })

    await expect(app.accessRequests.pruneExpiredAccessRequests()).resolves.toBe(
      1,
    )
    expect(await app.listRequests()).toMatchObject([{ id: fresh.id }])
    expect(await app.listInvites()).toHaveLength(0)
  })

  it("prunes expired requests in the expiry sweep while Jellyfin is down", async () => {
    const app = await setup()
    const profile = await app.seedProfile("Members", true)
    await app.seedRequest("expired@example.com", new Date(Date.now() - 1_000))
    // A leftover redemption makes the sweep look its account up in Jellyfin.
    const [invite] = await app.database.db
      .insert(app.schema.invites)
      .values({ code: "LEFTOVER", profileId: profile.id })
      .returning()
    await app.database.db.insert(app.schema.pending_redemptions).values({
      invite_id: invite.id,
      username: "leftover",
      started_at: new Date(0),
    })
    vi.mocked(app.jellyfin.getAllUsers).mockRejectedValueOnce(
      new Error("Jellyfin is down"),
    )

    const userLifecycle = await import("@/server/user-lifecycle")
    await expect(userLifecycle.sweepExpiredUsers()).rejects.toThrow(
      "Jellyfin is down",
    )
    expect(await app.listRequests()).toEqual([])
  })
})

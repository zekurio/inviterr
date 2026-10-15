import { eq } from "drizzle-orm"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { SessionData } from "@/lib/session"
import {
  configureTestEnvironment,
  createTestDatabase,
  type TestDatabase,
} from "@/test/db"

const configMocks = vi.hoisted(() => ({
  seerr: undefined as { hostname: string } | undefined,
}))

vi.mock("@/lib/server/config.server", () => ({
  configManager: {
    get app() {
      return {
        title: "Inviterr",
        description: "",
        defaultLocale: "en",
        url: "http://localhost:5173",
      }
    },
    get memberOnboarding() {
      return { enabled: false, pages: [] }
    },
    get seerr() {
      return configMocks.seerr
    },
    get appUrl() {
      return "http://localhost:5173"
    },
    get defaultLocale() {
      return "en"
    },
    get jellyfin() {
      return { internalUrl: "http://jellyfin.test", apiKey: "jellyfin-key" }
    },
    get jellyfinInternalUrl() {
      return "http://jellyfin.test"
    },
    get jellyfinExternalUrl() {
      return "http://jellyfin.test"
    },
  },
}))

vi.mock("@/server/auth", () => ({
  clearAuthCookies: vi.fn<() => void>(),
  establishAuthenticatedSession: vi.fn<() => Promise<void>>(() =>
    Promise.resolve(),
  ),
}))

vi.mock("@/server/email", () => ({
  isEmailConfigured: vi.fn<() => boolean>(() => false),
  sendEmail: vi.fn<() => Promise<void>>(),
}))

vi.mock("@/server/email/messages", () => ({
  sendConfiguredEmail: vi.fn<() => Promise<void>>(() => Promise.resolve()),
}))

vi.mock("@/server/profile-sync", () => {
  class SeerrProfileSyncError extends Error {}

  return {
    applyProfileToUser: vi.fn<() => Promise<{ seerrUserId: number | null }>>(
      () => Promise.resolve({ seerrUserId: null }),
    ),
    SeerrProfileSyncError,
  }
})

vi.mock("@/server/jellyfin", () => ({
  authenticateUser: vi.fn<
    () => Promise<{
      accessToken: string
      isAdmin: boolean
      name: string
    }>
  >(() =>
    Promise.resolve({
      accessToken: "access-token",
      isAdmin: false,
      name: "test-user",
    }),
  ),
  changePassword: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  createAdminApi: vi.fn<() => { token: string }>(() => ({
    token: "jellyfin-key",
  })),
  createUser: vi.fn<
    () => Promise<{
      id: string
      isAdmin: boolean
      name: string
    }>
  >(() =>
    Promise.resolve({
      id: "jellyfin-user-1",
      isAdmin: false,
      name: "test-user",
    }),
  ),
  deleteUser: vi.fn<() => Promise<void>>(),
  getAllUsers: vi.fn<() => Promise<unknown[]>>(() => Promise.resolve([])),
  isUsernameTaken: vi.fn<() => Promise<boolean>>(() => Promise.resolve(false)),
  uploadUserAvatar: vi.fn<() => Promise<void>>(),
}))

vi.mock("@/server/seerr", () => ({
  deleteSeerrUser: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  getAllSeerrUsers: vi.fn<() => Promise<unknown[]>>(() => Promise.resolve([])),
  resolveSeerrUser: vi.fn<
    () => Promise<{ id: number; jellyfinUserId: string }>
  >(() =>
    Promise.resolve({
      id: 42,
      jellyfinUserId: "jellyfin-user-1",
    }),
  ),
}))

vi.mock("@/server/session", () => ({
  revokeAllUserSessions: vi.fn<() => Promise<void>>(() => Promise.resolve()),
}))

vi.mock("@/server/session-resolver", () => ({
  getSessionDataForUser: vi.fn<
    (input: {
      userId: string
      name: string
      isAdmin: boolean
    }) => Promise<SessionData>
  >(() =>
    Promise.resolve({
      userId: "jellyfin-user-1",
      name: "test-user",
      avatarUrl: "/api/avatar/jellyfin-user-1",
      isAdmin: false,
      email: "user@example.com",
      emailVerified: false,
      locale: null,
      createdAt: new Date(0).toISOString(),
    }),
  ),
}))

let testDatabase: TestDatabase | null = null

async function loadInviteModules() {
  testDatabase = await createTestDatabase()
  configureTestEnvironment(testDatabase)
  vi.resetModules()

  const inviteService = await import("@/server/invites")
  const database = await import("@/server/db")
  const schema = await import("@/server/db/schema")
  const errors = await import("@/lib/api/contracts/errors")
  const jellyfin = await import("@/server/jellyfin")
  const auth = await import("@/server/auth")
  const profileSync = await import("@/server/profile-sync")
  const seerr = await import("@/server/seerr")
  const session = await import("@/server/session")
  const userLifecycle = await import("@/server/user-lifecycle")

  await database.ensureMigrated()

  return {
    inviteService,
    database,
    schema,
    errors,
    auth,
    jellyfin,
    profileSync,
    seerr,
    session,
    userLifecycle,
  }
}

async function seedProfile(
  database: Awaited<ReturnType<typeof loadInviteModules>>["database"],
  schema: Awaited<ReturnType<typeof loadInviteModules>>["schema"],
) {
  const profile = {
    id: crypto.randomUUID(),
    name: "Managed Users",
    policy: schema.DEFAULT_PROFILE_POLICY,
  }
  await database.db.insert(schema.profiles).values(profile)
  return profile
}

async function seedInvite(
  setup: Awaited<ReturnType<typeof loadInviteModules>>,
  values: {
    code: string
    profileId: string
    isDisabled?: boolean
    useLimit?: number | null
    useCount?: number
    expiresAt?: Date | null
    access_duration_days?: number | null
  },
) {
  const invite = {
    id: crypto.randomUUID(),
    code: values.code,
    profileId: values.profileId,
    isDisabled: values.isDisabled ?? false,
    useLimit: values.useLimit ?? null,
    useCount: values.useCount ?? 0,
    expiresAt: values.expiresAt ?? null,
    access_duration_days: values.access_duration_days ?? null,
  }
  await setup.database.db.insert(setup.schema.invites).values(invite)
  return invite
}

async function getInviteUseCount(
  setup: Awaited<ReturnType<typeof loadInviteModules>>,
  inviteId: string,
) {
  const [invite] = await setup.database.db
    .select({ useCount: setup.schema.invites.useCount })
    .from(setup.schema.invites)
    .where(eq(setup.schema.invites.id, inviteId))

  return invite?.useCount
}

// Routes account creation, password changes, sign-in and deletion through the
// real Jellyfin transport to an in-memory server. Its password handling follows
// upstream UserController: an API-key caller skips the current-password check,
// and an account without a password accepts an empty one.
async function connectFakeJellyfin(
  setup: Awaited<ReturnType<typeof loadInviteModules>>,
  faults: {
    lostResponses?: string[]
    failDeletes?: boolean
    onPasswordChange?: () => Promise<void>
  } = {},
) {
  const actualJellyfin =
    await vi.importActual<typeof import("@/server/jellyfin")>(
      "@/server/jellyfin",
    )
  vi.mocked(setup.jellyfin.createUser).mockImplementation(
    actualJellyfin.createUser,
  )
  vi.mocked(setup.jellyfin.createAdminApi).mockImplementation(
    actualJellyfin.createAdminApi,
  )
  vi.mocked(setup.jellyfin.changePassword).mockImplementation(
    actualJellyfin.changePassword,
  )
  vi.mocked(setup.jellyfin.authenticateUser).mockImplementation(
    actualJellyfin.authenticateUser,
  )
  vi.mocked(setup.jellyfin.deleteUser).mockImplementation(
    actualJellyfin.deleteUser,
  )

  const accounts = new Map<
    string,
    { id: string; name: string; password: string | null }
  >()
  const requests: Array<{
    method: string
    path: string
    userId: string | null
    body: Record<string, unknown>
  }> = []

  async function respond(
    request: (typeof requests)[number],
    isAdmin: boolean,
  ): Promise<Response> {
    const account = accounts.get(request.userId ?? "")

    if (request.method === "POST" && request.path === "/Users/New") {
      const created = {
        id: `jellyfin-user-${accounts.size + 1}`,
        name: String(request.body.Name),
        password:
          typeof request.body.Password === "string"
            ? request.body.Password
            : null,
      }
      accounts.set(created.id, created)
      return Response.json({ Id: created.id, Name: created.name })
    }

    if (request.method === "POST" && request.path === "/Users/Password") {
      if (!account) return new Response(null, { status: 404 })
      if (request.body.ResetPassword === true) {
        account.password = null
        return new Response(null, { status: 204 })
      }
      if (!isAdmin && request.body.CurrentPw !== account.password) {
        return new Response(null, { status: 403 })
      }
      await faults.onPasswordChange?.()
      account.password = String(request.body.NewPw ?? "") || null
      return new Response(null, { status: 204 })
    }

    if (
      request.method === "POST" &&
      request.path === "/Users/AuthenticateByName"
    ) {
      const user = [...accounts.values()].find(
        (candidate) =>
          candidate.name.toLowerCase() ===
          String(request.body.Username).toLowerCase(),
      )
      if (!user || (user.password ?? "") !== request.body.Pw) {
        return new Response(null, { status: 401 })
      }
      return Response.json({
        User: { Id: user.id, Name: user.name },
        AccessToken: `${user.id}-token`,
      })
    }

    const deletedId = request.path.match(/^\/Users\/([^/]+)$/)?.[1]
    if (request.method === "DELETE" && deletedId) {
      if (faults.failDeletes) return new Response(null, { status: 500 })
      accounts.delete(deletedId)
      return new Response(null, { status: 204 })
    }

    return new Response(null, { status: 404 })
  }

  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(String(input))
      const request = {
        method: init?.method ?? "GET",
        path: url.pathname,
        userId: url.searchParams.get("userId"),
        body: typeof init?.body === "string" ? JSON.parse(init.body) : {},
      }
      requests.push(request)
      const isAdmin =
        new Headers(init?.headers)
          .get("Authorization")
          ?.includes('Token="jellyfin-key"') ?? false
      const response = await respond(request, isAdmin)
      if (faults.lostResponses?.includes(request.path)) {
        throw new TypeError("fetch failed")
      }
      return response
    }),
  )

  return { accounts, requests }
}

function expectSuccessfulInviteValidation(
  result: Awaited<ReturnType<typeof import("@/server/invites").validateInvite>>,
) {
  if (!result.success) {
    throw new Error("Expected validateInvite to return a successful result")
  }

  return result.data
}

afterEach(async () => {
  vi.unstubAllGlobals()
  configMocks.seerr = undefined
  await testDatabase?.cleanup()
  testDatabase = null
  vi.resetModules()
  vi.resetAllMocks()
})

describe("validateInvite", () => {
  it("returns valid for an enabled unexpired invite below its use limit", async () => {
    const setup = await loadInviteModules()
    const profile = await seedProfile(setup.database, setup.schema)
    await seedInvite(setup, {
      code: "VALID123",
      profileId: profile.id,
      useLimit: 2,
      useCount: 1,
    })

    const result = await setup.inviteService.validateInvite(" valid123 ")
    const data = expectSuccessfulInviteValidation(result)

    expect(data).toMatchObject({
      valid: true,
      profileName: "Managed Users",
    })
  })

  it("returns invalid for disabled, expired, exhausted, and missing invites", async () => {
    const setup = await loadInviteModules()
    const profile = await seedProfile(setup.database, setup.schema)
    await seedInvite(setup, {
      code: "DISABLED1",
      profileId: profile.id,
      isDisabled: true,
    })
    await seedInvite(setup, {
      code: "EXPIRED1",
      profileId: profile.id,
      expiresAt: new Date(Date.now() - 1_000),
    })
    await seedInvite(setup, {
      code: "EXHAUST1",
      profileId: profile.id,
      useLimit: 1,
      useCount: 1,
    })

    const cases = [
      ["DISABLED1", setup.errors.ErrorCode.INVITE_DISABLED],
      ["EXPIRED1", setup.errors.ErrorCode.INVITE_EXPIRED],
      ["EXHAUST1", setup.errors.ErrorCode.INVITE_EXHAUSTED],
      ["MISSING1", setup.errors.ErrorCode.INVITE_INVALID],
    ] as const

    for (const [code, expectedError] of cases) {
      const result = await setup.inviteService.validateInvite(code)
      const data = expectSuccessfulInviteValidation(result)

      expect(data).toMatchObject({
        error: expectedError,
        profileName: "",
        valid: false,
      })
    }
  })
})

describe("redeemInvite", () => {
  const redeemInput = {
    code: "LIMIT123",
    username: "test-user",
    password: "Password1",
    email: "user@example.com",
  }

  it("shows the access duration before sign-up and expires the redeemed user that long after redemption", async () => {
    const setup = await loadInviteModules()
    const profile = await seedProfile(setup.database, setup.schema)
    await seedInvite(setup, {
      code: "LIMIT123",
      profileId: profile.id,
      access_duration_days: 30,
    })

    const validation = expectSuccessfulInviteValidation(
      await setup.inviteService.validateInvite(redeemInput.code),
    )
    expect(validation).toMatchObject({ valid: true, accessDurationDays: 30 })

    const redeemStartedAt = Date.now()
    const result = await setup.inviteService.redeemInvite(redeemInput)
    const redeemFinishedAt = Date.now()
    const localUser = await setup.database.db.query.users.findFirst({
      where: eq(setup.schema.users.userId, "jellyfin-user-1"),
    })

    expect(result).toMatchObject({ success: true })
    if (!localUser?.expiresAt) {
      throw new Error("Expected the redeemed user to have an expiry")
    }
    expect(localUser.createdAt.getTime()).toBeGreaterThanOrEqual(
      redeemStartedAt,
    )
    expect(localUser.createdAt.getTime()).toBeLessThanOrEqual(redeemFinishedAt)
    expect(localUser.expiresAt.getTime() - localUser.createdAt.getTime()).toBe(
      30 * 24 * 60 * 60 * 1000,
    )
  })

  it("keeps users redeemed from an invite without an access duration non-expiring", async () => {
    const setup = await loadInviteModules()
    const profile = await seedProfile(setup.database, setup.schema)
    await seedInvite(setup, { code: "LIMIT123", profileId: profile.id })
    const jellyfin = await connectFakeJellyfin(setup)

    const result = await setup.inviteService.redeemInvite(redeemInput)
    const localUser = await setup.database.db.query.users.findFirst({
      where: eq(setup.schema.users.userId, "jellyfin-user-1"),
    })

    expect(result).toMatchObject({ success: true })
    expect(localUser).toMatchObject({ expiresAt: null })
    expect(
      jellyfin.requests.map((request) => `${request.method} ${request.path}`),
    ).toEqual(["POST /Users/New", "POST /Users/AuthenticateByName"])
    expect(jellyfin.requests[0]?.body).toEqual({
      Name: "test-user",
      Password: redeemInput.password,
    })
  })

  it("creates a timed account with a throwaway password and sets the applicant's password once its expiry is recorded", async () => {
    const setup = await loadInviteModules()
    const profile = await seedProfile(setup.database, setup.schema)
    await seedInvite(setup, {
      code: "LIMIT123",
      profileId: profile.id,
      access_duration_days: 30,
    })
    let expiryWhenPasswordSet: Date | null | undefined
    const jellyfin = await connectFakeJellyfin(setup, {
      onPasswordChange: async () => {
        const localUser = await setup.database.db.query.users.findFirst({
          where: eq(setup.schema.users.userId, "jellyfin-user-1"),
        })
        expiryWhenPasswordSet = localUser?.expiresAt
      },
    })

    const result = await setup.inviteService.redeemInvite(redeemInput)
    const [createRequest, passwordRequest] = jellyfin.requests
    const stagingPassword = createRequest?.body.Password

    expect(result).toMatchObject({ success: true })
    expect(
      jellyfin.requests.map((request) => `${request.method} ${request.path}`),
    ).toEqual([
      "POST /Users/New",
      "POST /Users/Password",
      "POST /Users/AuthenticateByName",
    ])
    expect(createRequest?.body).toEqual({
      Name: "test-user",
      Password: expect.any(String),
    })
    expect(stagingPassword).not.toBe("")
    expect(stagingPassword).not.toBe(redeemInput.password)
    expect(passwordRequest).toMatchObject({
      userId: "jellyfin-user-1",
      body: { CurrentPw: stagingPassword, NewPw: redeemInput.password },
    })
    expect(passwordRequest?.body).not.toHaveProperty("ResetPassword")
    expect(expiryWhenPasswordSet).toBeInstanceOf(Date)
    await expect(
      setup.jellyfin.authenticateUser("test-user", redeemInput.password),
    ).resolves.toMatchObject({ id: "jellyfin-user-1" })
  })

  it.each<{
    failure: string
    code: string
    arrange: (
      setup: Awaited<ReturnType<typeof loadInviteModules>>,
    ) => ReturnType<typeof connectFakeJellyfin>
  }>([
    {
      failure: "the response to the Jellyfin account creation is lost",
      code: "JELLYFIN_ERROR",
      arrange: (setup) =>
        connectFakeJellyfin(setup, { lostResponses: ["/Users/New"] }),
    },
    {
      failure: "recording the account fails and Jellyfin cleanup fails",
      code: "INTERNAL_ERROR",
      arrange: async (setup) => {
        await setup.database.sqlClient.execute(`
          CREATE TRIGGER fail_user_record
          BEFORE INSERT ON users
          BEGIN
            SELECT RAISE(FAIL, 'injected user record failure');
          END
        `)
        return connectFakeJellyfin(setup, { failDeletes: true })
      },
    },
  ])(
    "leaves no usable credentials on a timed account when $failure",
    async ({ code, arrange }) => {
      const setup = await loadInviteModules()
      const profile = await seedProfile(setup.database, setup.schema)
      await seedInvite(setup, {
        code: "LIMIT123",
        profileId: profile.id,
        access_duration_days: 30,
      })
      const jellyfin = await arrange(setup)

      const result = await setup.inviteService.redeemInvite(redeemInput)

      expect(result).toMatchObject({ success: false, code })
      expect([...jellyfin.accounts.keys()]).toEqual(["jellyfin-user-1"])
      expect(
        jellyfin.requests.some((request) => request.path === "/Users/Password"),
      ).toBe(false)
      for (const password of [redeemInput.password, ""]) {
        await expect(
          setup.jellyfin.authenticateUser("test-user", password),
        ).rejects.toMatchObject({ statusCode: 401 })
      }
    },
  )

  it("keeps the access duration when the applicant's password was set but the response is lost and cleanup fails", async () => {
    const setup = await loadInviteModules()
    const profile = await seedProfile(setup.database, setup.schema)
    await seedInvite(setup, {
      code: "LIMIT123",
      profileId: profile.id,
      access_duration_days: 30,
    })
    await connectFakeJellyfin(setup, {
      lostResponses: ["/Users/Password"],
      failDeletes: true,
    })

    const result = await setup.inviteService.redeemInvite(redeemInput)
    const signIn = await setup.jellyfin.authenticateUser(
      "test-user",
      redeemInput.password,
    )
    // Login runs this recovery once the applicant's credentials work.
    const recoveredUser = await setup.userLifecycle.ensureUserRecord(signIn.id)

    expect(result).toMatchObject({
      success: false,
      code: setup.errors.ErrorCode.JELLYFIN_ERROR,
    })
    expect(recoveredUser.expiresAt?.getTime()).toBe(
      recoveredUser.createdAt.getTime() + 30 * 24 * 60 * 60 * 1000,
    )
  })

  it.each<{
    failure: string
    seerr?: { hostname: string }
    arrange: (setup: Awaited<ReturnType<typeof loadInviteModules>>) => void
  }>([
    {
      failure: "the Seerr outcome is uncertain",
      seerr: { hostname: "http://seerr.test" },
      arrange: (setup) => {
        vi.mocked(setup.seerr.resolveSeerrUser).mockRejectedValueOnce(
          new Error("Seerr timed out"),
        )
      },
    },
    {
      failure: "sign-in and Jellyfin cleanup fail",
      arrange: (setup) => {
        vi.mocked(setup.jellyfin.authenticateUser).mockRejectedValueOnce(
          new Error("Jellyfin authentication failed"),
        )
        vi.mocked(setup.jellyfin.deleteUser).mockRejectedValueOnce(
          new Error("Jellyfin cleanup failed"),
        )
      },
    },
    {
      failure: "session and Jellyfin cleanup fail",
      arrange: (setup) => {
        vi.mocked(
          setup.auth.establishAuthenticatedSession,
        ).mockRejectedValueOnce(new Error("Session storage unavailable"))
        vi.mocked(setup.jellyfin.deleteUser).mockRejectedValueOnce(
          new Error("Jellyfin cleanup failed"),
        )
      },
    },
  ])(
    "keeps the access duration on an account that survives when $failure",
    async ({ seerr, arrange }) => {
      configMocks.seerr = seerr
      const setup = await loadInviteModules()
      const profile = await seedProfile(setup.database, setup.schema)
      await seedInvite(setup, {
        code: "LIMIT123",
        profileId: profile.id,
        access_duration_days: 30,
      })
      arrange(setup)

      const result = await setup.inviteService.redeemInvite(redeemInput)
      // Login and startup seeding recover surviving Jellyfin accounts here.
      const recoveredUser =
        await setup.userLifecycle.ensureUserRecord("jellyfin-user-1")

      expect(result.success).toBe(false)
      expect(recoveredUser.expiresAt?.getTime()).toBe(
        recoveredUser.createdAt.getTime() + 30 * 24 * 60 * 60 * 1000,
      )
    },
  )

  it("applies the access duration when recovery records the new account first", async () => {
    const setup = await loadInviteModules()
    const profile = await seedProfile(setup.database, setup.schema)
    await seedInvite(setup, {
      code: "LIMIT123",
      profileId: profile.id,
      access_duration_days: 30,
    })
    vi.mocked(setup.jellyfin.createUser).mockImplementationOnce(async () => {
      await setup.userLifecycle.ensureUserRecord("jellyfin-user-1")
      return {
        id: "jellyfin-user-1",
        isAdmin: false,
        name: "test-user",
        avatarUrl: "/api/avatar/jellyfin-user-1",
      }
    })

    const result = await setup.inviteService.redeemInvite(redeemInput)
    const localUser = await setup.database.db.query.users.findFirst({
      where: eq(setup.schema.users.userId, "jellyfin-user-1"),
    })

    expect(result).toMatchObject({ success: true })
    if (!localUser) {
      throw new Error("Expected the redeemed user to be recorded")
    }
    expect(localUser.expiresAt?.getTime()).toBe(
      localUser.createdAt.getTime() + 30 * 24 * 60 * 60 * 1000,
    )
  })

  it("does not increment an invite that is already at its use limit", async () => {
    const setup = await loadInviteModules()
    const profile = await seedProfile(setup.database, setup.schema)
    const invite = await seedInvite(setup, {
      code: "LIMIT123",
      profileId: profile.id,
      useLimit: 1,
      useCount: 1,
    })

    const result = await setup.inviteService.redeemInvite(redeemInput)

    expect(result).toMatchObject({
      code: setup.errors.ErrorCode.INVITE_EXHAUSTED,
      success: false,
    })
    expect(await getInviteUseCount(setup, invite.id)).toBe(1)
  })

  it("releases a reserved invite slot when Jellyfin user creation fails", async () => {
    const setup = await loadInviteModules()
    const profile = await seedProfile(setup.database, setup.schema)
    const invite = await seedInvite(setup, {
      code: "LIMIT123",
      profileId: profile.id,
      useLimit: 1,
      useCount: 0,
    })

    vi.mocked(setup.jellyfin.createUser).mockRejectedValueOnce(
      new Error("Jellyfin unavailable"),
    )

    const result = await setup.inviteService.redeemInvite(redeemInput)

    expect(result).toMatchObject({
      code: setup.errors.ErrorCode.JELLYFIN_ERROR,
      success: false,
    })
    expect(await getInviteUseCount(setup, invite.id)).toBe(0)
  })

  it("compensates when applying the invite profile fails", async () => {
    const setup = await loadInviteModules()
    const profile = await seedProfile(setup.database, setup.schema)
    const invite = await seedInvite(setup, {
      code: "LIMIT123",
      profileId: profile.id,
      useLimit: 1,
    })
    vi.mocked(setup.profileSync.applyProfileToUser).mockRejectedValueOnce(
      new Error("Jellyfin policy update failed"),
    )

    const result = await setup.inviteService.redeemInvite(redeemInput)

    expect(result).toMatchObject({
      code: setup.errors.ErrorCode.JELLYFIN_ERROR,
      success: false,
    })
    expect(setup.jellyfin.deleteUser).toHaveBeenCalledWith("jellyfin-user-1")
    expect(await getInviteUseCount(setup, invite.id)).toBe(0)
  })

  it("preserves Jellyfin when Seerr creation is uncertain", async () => {
    configMocks.seerr = { hostname: "http://seerr.test" }
    const setup = await loadInviteModules()
    const profile = await seedProfile(setup.database, setup.schema)
    const invite = await seedInvite(setup, {
      code: "LIMIT123",
      profileId: profile.id,
      useLimit: 1,
    })
    vi.mocked(setup.seerr.resolveSeerrUser).mockRejectedValueOnce(
      new Error("Seerr unavailable"),
    )

    const result = await setup.inviteService.redeemInvite(redeemInput)

    expect(result).toMatchObject({
      code: setup.errors.ErrorCode.SEERR_ERROR,
      success: false,
    })
    expect(setup.jellyfin.deleteUser).not.toHaveBeenCalled()
    expect(await getInviteUseCount(setup, invite.id)).toBe(0)
  })

  it("does not return success when authenticating the created user fails", async () => {
    const setup = await loadInviteModules()
    const profile = await seedProfile(setup.database, setup.schema)
    const invite = await seedInvite(setup, {
      code: "LIMIT123",
      profileId: profile.id,
      useLimit: 1,
    })
    vi.mocked(setup.jellyfin.authenticateUser).mockRejectedValueOnce(
      new Error("Jellyfin authentication failed"),
    )

    const result = await setup.inviteService.redeemInvite(redeemInput)

    expect(result).toMatchObject({
      code: setup.errors.ErrorCode.JELLYFIN_ERROR,
      success: false,
    })
    expect(setup.jellyfin.deleteUser).toHaveBeenCalledWith("jellyfin-user-1")
    expect(await getInviteUseCount(setup, invite.id)).toBe(0)
  })

  it("preserves the Jellyfin user when Seerr cleanup fails", async () => {
    configMocks.seerr = { hostname: "http://seerr.test" }
    const setup = await loadInviteModules()
    const profile = await seedProfile(setup.database, setup.schema)
    const invite = await seedInvite(setup, {
      code: "LIMIT123",
      profileId: profile.id,
      useLimit: 1,
    })
    vi.mocked(setup.profileSync.applyProfileToUser).mockRejectedValueOnce(
      new setup.profileSync.SeerrProfileSyncError(
        "Seerr profile update failed",
        new Error("Seerr unavailable"),
      ),
    )
    vi.mocked(setup.seerr.deleteSeerrUser).mockRejectedValueOnce(
      new Error("Seerr cleanup failed"),
    )

    const result = await setup.inviteService.redeemInvite(redeemInput)

    expect(result).toMatchObject({
      code: setup.errors.ErrorCode.SEERR_ERROR,
      success: false,
    })
    expect(setup.seerr.deleteSeerrUser).toHaveBeenCalledWith(42)
    expect(setup.jellyfin.deleteUser).not.toHaveBeenCalled()
    expect(await getInviteUseCount(setup, invite.id)).toBe(0)
  })

  it("compensates when the local redemption transaction fails", async () => {
    const setup = await loadInviteModules()
    const profile = await seedProfile(setup.database, setup.schema)
    const invite = await seedInvite(setup, {
      code: "LIMIT123",
      profileId: profile.id,
      useLimit: 1,
    })
    vi.spyOn(setup.database.db, "transaction").mockRejectedValueOnce(
      new Error("SQLite write failed"),
    )

    const result = await setup.inviteService.redeemInvite(redeemInput)

    expect(result).toMatchObject({
      code: setup.errors.ErrorCode.INTERNAL_ERROR,
      success: false,
    })
    expect(setup.jellyfin.deleteUser).toHaveBeenCalledWith("jellyfin-user-1")
    expect(await getInviteUseCount(setup, invite.id)).toBe(0)
  })

  it("removes committed redemption state when session creation fails", async () => {
    const setup = await loadInviteModules()
    const profile = await seedProfile(setup.database, setup.schema)
    const invite = await seedInvite(setup, {
      code: "LIMIT123",
      profileId: profile.id,
      useLimit: 1,
    })
    vi.mocked(setup.auth.establishAuthenticatedSession).mockRejectedValueOnce(
      new Error("Session storage unavailable"),
    )

    const result = await setup.inviteService.redeemInvite(redeemInput)
    const localUser = await setup.database.db.query.users.findFirst({
      where: eq(setup.schema.users.userId, "jellyfin-user-1"),
    })
    const usages = await setup.database.db
      .select()
      .from(setup.schema.inviteUsages)
      .where(eq(setup.schema.inviteUsages.inviteId, invite.id))

    expect(result).toMatchObject({
      code: setup.errors.ErrorCode.INTERNAL_ERROR,
      success: false,
    })
    expect(setup.auth.clearAuthCookies).toHaveBeenCalledOnce()
    expect(setup.session.revokeAllUserSessions).toHaveBeenCalledWith(
      "jellyfin-user-1",
    )
    expect(setup.jellyfin.deleteUser).toHaveBeenCalledWith("jellyfin-user-1")
    expect(localUser).toBeUndefined()
    expect(usages).toHaveLength(0)
    expect(await getInviteUseCount(setup, invite.id)).toBe(0)
  })

  it("keeps invite capacity recoverable when external cleanup fails", async () => {
    const setup = await loadInviteModules()
    const profile = await seedProfile(setup.database, setup.schema)
    const invite = await seedInvite(setup, {
      code: "LIMIT123",
      profileId: profile.id,
      useLimit: 1,
    })
    vi.mocked(setup.profileSync.applyProfileToUser).mockRejectedValueOnce(
      new Error("Jellyfin policy update failed"),
    )
    vi.mocked(setup.jellyfin.deleteUser).mockRejectedValueOnce(
      new Error("Jellyfin cleanup failed"),
    )

    const result = await setup.inviteService.redeemInvite(redeemInput)
    const validation = expectSuccessfulInviteValidation(
      await setup.inviteService.validateInvite(redeemInput.code),
    )

    expect(result.success).toBe(false)
    expect(validation.valid).toBe(true)
    expect(await getInviteUseCount(setup, invite.id)).toBe(0)
  })

  it("reconciles capacity when releasing a reservation fails", async () => {
    const setup = await loadInviteModules()
    const profile = await seedProfile(setup.database, setup.schema)
    const invite = await seedInvite(setup, {
      code: "LIMIT123",
      profileId: profile.id,
      useLimit: 1,
    })
    await setup.database.sqlClient.execute(`
      CREATE TRIGGER fail_invite_release
      BEFORE UPDATE OF use_count ON invites
      WHEN OLD.use_count = 1 AND NEW.use_count = 0
      BEGIN
        SELECT RAISE(FAIL, 'injected invite release failure');
      END
    `)
    vi.mocked(setup.profileSync.applyProfileToUser).mockRejectedValueOnce(
      new Error("Jellyfin policy update failed"),
    )

    const result = await setup.inviteService.redeemInvite(redeemInput)

    expect(result.success).toBe(false)
    expect(await getInviteUseCount(setup, invite.id)).toBe(1)

    await setup.database.sqlClient.execute("DROP TRIGGER fail_invite_release")
    await setup.userLifecycle.reconcileInviteUseCounts()

    const validation = expectSuccessfulInviteValidation(
      await setup.inviteService.validateInvite(redeemInput.code),
    )
    expect(await getInviteUseCount(setup, invite.id)).toBe(0)
    expect(validation.valid).toBe(true)
  })

  it("restores use counts from recorded invite usages", async () => {
    const setup = await loadInviteModules()
    const profile = await seedProfile(setup.database, setup.schema)
    const invite = await seedInvite(setup, {
      code: "FAMILY12",
      profileId: profile.id,
      useLimit: 10,
    })
    const userIds = ["redeemed-user-1", "redeemed-user-2"]
    await setup.database.db
      .insert(setup.schema.users)
      .values(userIds.map((userId) => ({ userId, inviteId: invite.id })))
    await setup.database.db
      .insert(setup.schema.inviteUsages)
      .values(userIds.map((userId) => ({ inviteId: invite.id, userId })))

    await setup.userLifecycle.reconcileInviteUseCounts()

    expect(await getInviteUseCount(setup, invite.id)).toBe(2)
  })
})

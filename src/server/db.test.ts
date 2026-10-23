import { cp, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"

import {
  configureTestEnvironment,
  createTestDatabase,
  type TestDatabase,
} from "@/test/db"

let testDatabase: TestDatabase | null = null

async function loadDatabaseModules() {
  vi.resetModules()
  const database = await import("@/server/db")
  const schema = await import("@/server/db/schema")

  await database.ensureMigrated()

  return { database, schema }
}

afterEach(async () => {
  delete process.env.MIGRATIONS_PATH
  await testDatabase?.cleanup()
  testDatabase = null
  vi.resetModules()
})

describe("database", () => {
  it("commits statements that run while interactive transactions are open", async () => {
    testDatabase = await createTestDatabase()
    configureTestEnvironment(testDatabase)
    const { database, schema } = await loadDatabaseModules()
    const db = database.db

    const results = await Promise.allSettled(
      Array.from({ length: 3 }, (_, index) => [
        db.transaction(async (tx) => {
          await tx.insert(schema.users).values({ userId: `tx-${index}-a` })
          await tx.insert(schema.users).values({ userId: `tx-${index}-b` })
        }),
        db.insert(schema.users).values({ userId: `run-${index}` }),
        db.batch([
          db.insert(schema.users).values({ userId: `batch-${index}` }),
        ]),
      ]).flat(),
    )

    expect(results.filter((result) => result.status === "rejected")).toEqual([])

    // A fresh client only sees rows that were actually committed.
    const reopened = await loadDatabaseModules()
    const rows = await reopened.database.db
      .select({ userId: reopened.schema.users.userId })
      .from(reopened.schema.users)

    expect(rows).toHaveLength(12)
  })

  it("backfills invite usages recorded before the audit log", async () => {
    testDatabase = await createTestDatabase()
    configureTestEnvironment(testDatabase)

    // Stop one migration short of the backfill to get a pre-audit-log install.
    const migrationsPath = path.join(
      path.dirname(testDatabase.dbPath),
      "migrations",
    )
    await cp("drizzle", migrationsPath, { recursive: true })
    const journalPath = path.join(migrationsPath, "meta", "_journal.json")
    const journal = JSON.parse(await readFile(journalPath, "utf8")) as {
      entries: Array<{ tag: string }>
    }
    await writeFile(
      journalPath,
      JSON.stringify({
        ...journal,
        entries: journal.entries.filter(
          (entry) => entry.tag !== "0006_backfill_invite_redemptions",
        ),
      }),
    )
    process.env.MIGRATIONS_PATH = migrationsPath

    const legacy = await loadDatabaseModules()
    const legacyDb = legacy.database.db
    const legacySchema = legacy.schema
    const [profile] = await legacyDb
      .insert(legacySchema.profiles)
      .values({ name: "Default", policy: legacySchema.DEFAULT_PROFILE_POLICY })
      .returning()
    const [invite] = await legacyDb
      .insert(legacySchema.invites)
      .values({ code: "WELCOME", profileId: profile!.id })
      .returning()
    await legacyDb
      .insert(legacySchema.users)
      .values([
        { userId: "named-user" },
        { userId: "unnamed-user" },
        { userId: "audited-user" },
      ])
    const session = {
      userId: "named-user",
      secretHash: "hash",
      jellyfinAccessToken: "token",
      jellyfinDeviceId: "device",
      isAdminSnapshot: false,
      expiresAt: new Date("2027-01-01T00:00:00.000Z"),
    }
    await legacyDb.insert(legacySchema.sessions).values([
      {
        ...session,
        id: "old-session",
        displayNameSnapshot: "Old Name",
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
      {
        ...session,
        id: "new-session",
        displayNameSnapshot: "Current Name",
        updatedAt: new Date("2026-06-01T00:00:00.000Z"),
      },
    ])
    const namedUsedAt = new Date("2026-02-01T10:00:00.000Z")
    await legacyDb.insert(legacySchema.inviteUsages).values([
      { inviteId: invite!.id, userId: "named-user", usedAt: namedUsedAt },
      {
        inviteId: invite!.id,
        userId: "unnamed-user",
        usedAt: new Date("2026-03-01T10:00:00.000Z"),
      },
      {
        inviteId: invite!.id,
        userId: "audited-user",
        usedAt: new Date("2026-04-01T10:00:00.000Z"),
      },
    ])
    // Redeemed after the audit log shipped, so it already has its event.
    await legacyDb.insert(legacySchema.audit_events).values({
      id: "live-event",
      created_at: new Date("2026-04-01T10:00:00.000Z"),
      actor_type: "user",
      actor_id: "audited-user",
      actor_name: "Audited User",
      action: "invite.redeemed",
      target_type: "invite",
      target_id: invite!.id,
      target_label: "WELCOME",
      details: { email: "audited@example.com", accessExpiresAt: null },
    })

    delete process.env.MIGRATIONS_PATH
    const { database, schema } = await loadDatabaseModules()
    const events = await database.db
      .select()
      .from(schema.audit_events)
      .orderBy(schema.audit_events.created_at)

    expect(events).toEqual([
      {
        id: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        ),
        created_at: namedUsedAt,
        actor_type: "user",
        actor_id: "named-user",
        actor_name: "Current Name",
        action: "invite.redeemed",
        target_type: "invite",
        target_id: invite!.id,
        target_label: "WELCOME",
        batch_id: null,
        details: null,
      },
      expect.objectContaining({
        actor_id: "unnamed-user",
        actor_name: null,
        target_label: "WELCOME",
      }),
      expect.objectContaining({ id: "live-event", actor_id: "audited-user" }),
    ])
  })
})

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
      Array.from({ length: 10 }, (_, index) => [
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

    expect(rows).toHaveLength(40)
  })
})

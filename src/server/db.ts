import "@tanstack/react-start/server-only"
import { AsyncLocalStorage } from "node:async_hooks"
import { mkdirSync } from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { migrate } from "drizzle-orm/libsql/migrator"
import { drizzle } from "drizzle-orm/libsql/node"

import { env } from "@/env"
import { normalizeEmail } from "@/lib/schemas"
import { schema } from "@/server/db/schema"
import { createChildLogger } from "@/server/logger"

const log = createChildLogger({ module: "database" })

function resolveDatabaseUrl(databaseUrl: string): string {
  if (databaseUrl === ":memory:" || databaseUrl === "file::memory:") {
    return "file::memory:"
  }

  if (databaseUrl.startsWith("file:")) {
    if (databaseUrl === "file::memory:") {
      return databaseUrl
    }

    const filePath = databaseUrl.startsWith("file://")
      ? fileURLToPath(databaseUrl)
      : path.resolve(process.cwd(), databaseUrl.slice("file:".length))

    mkdirSync(path.dirname(filePath), { recursive: true })
    return pathToFileURL(filePath).href
  }

  if (databaseUrl.includes("://") && !databaseUrl.startsWith("sqlite://")) {
    throw new Error(
      `DB_PATH must be a SQLite filename/path, "sqlite://...", or "file://...". Received: ${databaseUrl}`,
    )
  }

  const sqlitePath = databaseUrl.startsWith("sqlite://")
    ? databaseUrl.slice("sqlite://".length)
    : databaseUrl

  if (sqlitePath === ":memory:") {
    return "file::memory:"
  }

  const absolutePath = path.isAbsolute(sqlitePath)
    ? sqlitePath
    : path.join(process.cwd(), sqlitePath)

  mkdirSync(path.dirname(absolutePath), { recursive: true })
  return pathToFileURL(absolutePath).href
}

const databaseUrl = resolveDatabaseUrl(env.DB_PATH)
const migrationsFolder = env.MIGRATIONS_PATH
  ? path.resolve(env.MIGRATIONS_PATH)
  : path.join(process.cwd(), "drizzle")

// libsql runs an interactive transaction on a connection of its own and holds
// SQLite's write lock across awaits, while every other statement shares one
// connection without a busy timeout. A shared-connection statement landing in
// that window fails with SQLITE_BUSY, and libsql leaves it in progress on the
// shared connection: from then on batches fail with "cannot commit transaction
// - SQL statements in progress" and plain writes report success without ever
// committing, until the process restarts. So transactions queue behind each
// other and shared-connection statements wait for the running one. Code inside
// a transaction callback skips the queue, so using `db` there cannot deadlock.
const transactionScope = new AsyncLocalStorage<true>()
let transactionsSettled: Promise<void> = Promise.resolve()

function serializeTransactions(database: typeof rawDb): void {
  const client = database.$client
  const execute = client.execute.bind(client)
  const batch = client.batch.bind(client)
  const transaction = database.transaction.bind(database)
  const waitForTransactions = () =>
    transactionScope.getStore() ? undefined : transactionsSettled

  client.execute = (async (...args: Parameters<typeof execute>) => {
    await waitForTransactions()
    return execute(...args)
  }) as typeof client.execute
  client.batch = async (...args) => {
    await waitForTransactions()
    return batch(...args)
  }
  database.transaction = (body, config) => {
    if (transactionScope.getStore()) {
      return transaction(body, config)
    }

    const result = transactionsSettled.then(() =>
      transactionScope.run(true, () => transaction(body, config)),
    )
    transactionsSettled = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }
}

const rawDb = drizzle({
  connection: databaseUrl,
  schema,
})
serializeTransactions(rawDb)

export const db = rawDb
export const sqlClient = rawDb.$client

let migrationPromise: Promise<void> | null = null

export async function ensureMigrated(): Promise<void> {
  if (!migrationPromise) {
    log.info({ path: databaseUrl }, "Initializing database")
    migrationPromise = (async () => {
      log.info("Running database migrations")
      await migrate(rawDb, { migrationsFolder })
      log.info("Database migrations completed")
    })().catch((error: unknown) => {
      migrationPromise = null
      throw error
    })
  }
  await migrationPromise
}

export async function getUserByEmail(email: string) {
  await ensureMigrated()
  const normalizedEmail = normalizeEmail(email)
  return db.query.users.findFirst({
    where: (users, { eq }) => eq(users.email, normalizedEmail),
  })
}

export async function getUserById(userId: string) {
  await ensureMigrated()
  return db.query.users.findFirst({
    where: (users, { eq }) => eq(users.userId, userId),
  })
}

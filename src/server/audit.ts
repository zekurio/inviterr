import "@tanstack/react-start/server-only"
import { lt } from "drizzle-orm"

import {
  getAuditActionTargetType,
  type AuditAction,
  type AuditActor,
  type AuditDetails,
  type AuditScalar,
} from "@/lib/audit"
import { configManager } from "@/lib/server/config.server"
import { db, ensureMigrated } from "@/server/db"
import { audit_events } from "@/server/db/schema"
import { createChildLogger } from "@/server/logger"

const log = createChildLogger({ module: "audit" })

const DAY_MS = 24 * 60 * 60 * 1000

// Who is acting, plus the batch shared by every event of one bulk request.
export type AuditScope = { actor: AuditActor; batchId?: string }

export type AuditEventInput = {
  action: AuditAction
  target: { id: string | null; label?: string | null }
  details?: AuditDetails
  batchId?: string
}

// Audit writes happen after the audited change, which often already reached
// Jellyfin or Seerr and cannot be rolled back, so a failed insert is logged
// instead of turning a completed action into a reported failure.
export async function recordAuditEvent(
  actor: AuditActor,
  event: AuditEventInput,
): Promise<void> {
  try {
    await ensureMigrated()
    await db.insert(audit_events).values({
      id: crypto.randomUUID(),
      created_at: new Date(),
      actor_type: actor.type,
      actor_id: actor.type === "system" ? null : actor.id,
      actor_name: actor.type === "system" ? null : actor.name,
      action: event.action,
      target_type: getAuditActionTargetType(event.action),
      target_id: event.target.id,
      target_label: event.target.label ?? null,
      batch_id: event.batchId ?? null,
      details:
        event.details && Object.keys(event.details).length > 0
          ? event.details
          : null,
    })
  } catch (err) {
    log.error(
      { err, action: event.action, targetId: event.target.id },
      "Failed to record audit event",
    )
  }
}

// Updates that end up changing nothing are not worth an audit row.
export async function recordAuditChange(
  actor: AuditActor,
  event: AuditEventInput & { details: AuditDetails },
): Promise<void> {
  if (Object.keys(event.details).length === 0) {
    return
  }

  await recordAuditEvent(actor, event)
}

const NON_SCALAR = Symbol("non-scalar")

// Returns `{ field: { from, to } }` for every field whose value differs.
// Secret fields and non-scalar values (arrays, objects) are reduced to
// `{ changed: true }`, so neither secrets nor bulky payloads are stored.
export function diffAuditFields(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
  secretFields: readonly string[] = [],
): AuditDetails {
  const details: AuditDetails = {}
  const keys = new Set([
    ...Object.keys(before ?? {}),
    ...Object.keys(after ?? {}),
  ])

  for (const key of keys) {
    if (
      JSON.stringify(before?.[key] ?? null) ===
      JSON.stringify(after?.[key] ?? null)
    ) {
      continue
    }

    const from = toAuditScalar(before?.[key])
    const to = toAuditScalar(after?.[key])
    details[key] =
      secretFields.includes(key) || from === NON_SCALAR || to === NON_SCALAR
        ? { changed: true }
        : { from, to }
  }

  return details
}

function toAuditScalar(value: unknown): AuditScalar | typeof NON_SCALAR {
  if (value === undefined || value === null) {
    return null
  }
  if (value instanceof Date) {
    return value.toISOString()
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value
  }
  return NON_SCALAR
}

export async function pruneAuditEvents(now = new Date()): Promise<void> {
  if (!configManager.isConfigured()) {
    return
  }

  const retentionDays = configManager.audit.retentionDays
  if (retentionDays === 0) {
    return
  }

  await ensureMigrated()
  const result = await db
    .delete(audit_events)
    .where(
      lt(
        audit_events.created_at,
        new Date(now.getTime() - retentionDays * DAY_MS),
      ),
    )

  if (result.rowsAffected > 0) {
    log.info(
      { count: result.rowsAffected, retentionDays },
      "Pruned audit events past retention",
    )
  }
}

export function kickOffAuditPruning(): void {
  void pruneAuditEvents().catch((err: unknown) => {
    log.warn({ err }, "Audit event pruning failed")
  })
}

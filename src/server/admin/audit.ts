import {
  and,
  count,
  desc,
  eq,
  gte,
  lt,
  lte,
  or,
  sql,
  type AnyColumn,
  type SQL,
} from "drizzle-orm"
import type { StaticDecode, StaticEncode } from "typebox"

import {
  ErrorCode,
  error,
  success,
  type ActionResult,
} from "@/lib/api/contracts/errors"
import type { AuditActor } from "@/lib/audit"
import { configManager } from "@/lib/server/config.server"
import { safeParse } from "@/lib/validation"
import {
  auditEventsPageInputSchema,
  updateAuditRetentionSchema,
  type AuditEventDto,
  type PagedAuditEventsDto,
} from "@/server/api/schemas/admin-schemas"
import {
  diffAuditFields,
  kickOffAuditPruning,
  recordAuditChange,
} from "@/server/audit"
import { db, ensureMigrated } from "@/server/db"
import { audit_events, type AuditEvent } from "@/server/db/schema"

export async function listAuditEventsPageService(
  input: StaticEncode<typeof auditEventsPageInputSchema>,
): Promise<ActionResult<PagedAuditEventsDto>> {
  const parsed = safeParse(auditEventsPageInputSchema, input)
  if (!parsed.success) {
    return error(ErrorCode.VALIDATION_FAILED, parsed.error.issues[0]?.message)
  }

  const auditPage = parsed.data
  const filter = getAuditEventsFilter(auditPage)

  await ensureMigrated()

  const [[totalRow], rows] = await Promise.all([
    db.select({ total: count() }).from(audit_events).where(filter),
    // One extra row tells whether another page follows.
    db
      .select()
      .from(audit_events)
      .where(and(filter, getAuditCursorFilter(auditPage.cursor)))
      .orderBy(desc(audit_events.created_at), desc(audit_events.id))
      .limit(auditPage.pageSize + 1),
  ])
  const items = rows.slice(0, auditPage.pageSize)
  const last = items.at(-1)

  return success({
    items: items.map(toAuditEventDto),
    nextCursor:
      rows.length > auditPage.pageSize && last
        ? `${last.created_at.getTime()}:${last.id}`
        : null,
    total: totalRow?.total ?? 0,
    retentionDays: configManager.audit.retentionDays,
  })
}

// Actor and target filters accept either an exact id (used when a row's
// actor or target is clicked) or part of the stored name snapshot.
function getAuditEventsFilter(
  auditPage: StaticDecode<typeof auditEventsPageInputSchema>,
): SQL | undefined {
  return and(
    auditPage.actorType
      ? eq(audit_events.actor_type, auditPage.actorType)
      : undefined,
    auditPage.actor
      ? or(
          eq(audit_events.actor_id, auditPage.actor),
          containsText(audit_events.actor_name, auditPage.actor),
        )
      : undefined,
    auditPage.action ? eq(audit_events.action, auditPage.action) : undefined,
    auditPage.targetType
      ? eq(audit_events.target_type, auditPage.targetType)
      : undefined,
    auditPage.target
      ? or(
          eq(audit_events.target_id, auditPage.target),
          containsText(audit_events.target_label, auditPage.target),
        )
      : undefined,
    auditPage.batch ? eq(audit_events.batch_id, auditPage.batch) : undefined,
    auditPage.from
      ? gte(audit_events.created_at, new Date(auditPage.from))
      : undefined,
    auditPage.to
      ? lte(audit_events.created_at, new Date(auditPage.to))
      : undefined,
  )
}

// Pages continue strictly after the cursor's event in (created_at, id) order,
// so events recorded while an admin scrolls never shift or repeat rows.
function getAuditCursorFilter(cursor: string | undefined): SQL | undefined {
  if (!cursor) {
    return undefined
  }

  // The schema guarantees "<created_at ms>:<id>".
  const separator = cursor.indexOf(":")
  const createdAt = new Date(Number(cursor.slice(0, separator)))
  const id = cursor.slice(separator + 1)
  return or(
    lt(audit_events.created_at, createdAt),
    and(eq(audit_events.created_at, createdAt), lt(audit_events.id, id)),
  )
}

// Matches the text literally: LIKE wildcards in the search are escaped.
function containsText(column: AnyColumn, text: string): SQL {
  const pattern = `%${text.replace(/[\\%_]/g, "\\$&")}%`
  return sql`${column} like ${pattern} escape '\\'`
}

function toAuditEventDto(event: AuditEvent): AuditEventDto {
  return {
    id: event.id,
    createdAt: event.created_at.toISOString(),
    actorType: event.actor_type,
    actorId: event.actor_id,
    actorName: event.actor_name,
    action: event.action,
    targetType: event.target_type,
    targetId: event.target_id,
    targetLabel: event.target_label,
    batchId: event.batch_id,
    details: event.details,
  }
}

export async function updateAuditRetentionService(
  actor: AuditActor,
  input: StaticDecode<typeof updateAuditRetentionSchema>,
): Promise<ActionResult<{ retentionDays: number }>> {
  const parsed = safeParse(updateAuditRetentionSchema, input)
  if (!parsed.success) {
    return error(ErrorCode.VALIDATION_FAILED, parsed.error.issues[0]?.message)
  }

  const previous = configManager.audit
  await configManager.setAudit({ retentionDays: parsed.data.retentionDays })
  await recordAuditChange(actor, {
    action: "settings.updated",
    target: { id: "audit" },
    details: diffAuditFields(previous, configManager.audit),
  })
  // A shorter window applies right away instead of at the next sweep.
  kickOffAuditPruning()

  return success({ retentionDays: parsed.data.retentionDays })
}

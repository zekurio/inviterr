import {
  and,
  count,
  desc,
  eq,
  gte,
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
    db
      .select()
      .from(audit_events)
      .where(filter)
      .orderBy(desc(audit_events.created_at))
      .limit(auditPage.pageSize)
      .offset((auditPage.page - 1) * auditPage.pageSize),
  ])
  const total = totalRow?.total ?? 0

  return success({
    items: rows.map(toAuditEventDto),
    page: auditPage.page,
    pageSize: auditPage.pageSize,
    total,
    pageCount: Math.ceil(total / auditPage.pageSize),
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

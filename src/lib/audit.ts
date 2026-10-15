import type { SessionData } from "@/lib/session"

// 0 keeps events forever.
export const AUDIT_RETENTION_DEFAULT_DAYS = 365
export const AUDIT_RETENTION_MAX_DAYS = 3650

export const AUDIT_ACTOR_TYPES = ["admin", "user", "system"] as const
export const AUDIT_TARGET_TYPES = [
  "invite",
  "user",
  "profile",
  "settings",
] as const

// Every action is prefixed with the target type it applies to, so the target
// type column is derived from the action instead of being passed separately.
export const AUDIT_ACTIONS = [
  "invite.created",
  "invite.updated",
  "invite.deleted",
  "invite.redeemed",
  "invite.reconciled",
  "user.imported",
  "user.updated",
  "user.deleted",
  "user.seerr_synced",
  "user.expired",
  "user.renewed",
  "user.email_verified",
  "user.password_changed",
  "user.password_reset",
  "profile.created",
  "profile.updated",
  "profile.deleted",
  "settings.updated",
  "settings.test_email_sent",
] as const satisfies readonly `${AuditTargetType}.${string}`[]

export type AuditActorType = (typeof AUDIT_ACTOR_TYPES)[number]
export type AuditTargetType = (typeof AUDIT_TARGET_TYPES)[number]
export type AuditAction = (typeof AUDIT_ACTIONS)[number]

export type AuditScalar = string | number | boolean | null
export type AuditDetailValue =
  | AuditScalar
  | { from: AuditScalar; to: AuditScalar }
  | { changed: true }
// Flat, small, and secret-free by construction: values are scalars or
// before/after pairs, and secret or bulky fields are recorded as
// `{ changed: true }` only.
export type AuditDetails = Record<string, AuditDetailValue>

export type AuditActor =
  | { type: "admin" | "user"; id: string; name: string | null }
  | { type: "system" }

export const SYSTEM_AUDIT_ACTOR: AuditActor = { type: "system" }

export function auditActorFromSession(
  session: Pick<SessionData, "userId" | "name" | "isAdmin">,
): AuditActor {
  return {
    type: session.isAdmin ? "admin" : "user",
    id: session.userId,
    name: session.name,
  }
}

export function getAuditActionTargetType(action: AuditAction): AuditTargetType {
  const [targetType] = action.split(".") as [AuditTargetType]
  return targetType
}

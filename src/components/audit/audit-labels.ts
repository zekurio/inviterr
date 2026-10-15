import type { AuditAction, AuditActorType, AuditTargetType } from "@/lib/audit"
import type { MessageKey } from "@/lib/i18n"

export const AUDIT_ACTION_LABEL_KEYS = {
  "invite.created": "audit.actions.inviteCreated",
  "invite.updated": "audit.actions.inviteUpdated",
  "invite.deleted": "audit.actions.inviteDeleted",
  "invite.redeemed": "audit.actions.inviteRedeemed",
  "invite.reconciled": "audit.actions.inviteReconciled",
  "user.imported": "audit.actions.userImported",
  "user.updated": "audit.actions.userUpdated",
  "user.deleted": "audit.actions.userDeleted",
  "user.seerr_synced": "audit.actions.userSeerrSynced",
  "user.expired": "audit.actions.userExpired",
  "user.renewed": "audit.actions.userRenewed",
  "user.email_verified": "audit.actions.userEmailVerified",
  "user.password_changed": "audit.actions.userPasswordChanged",
  "user.password_reset": "audit.actions.userPasswordReset",
  "profile.created": "audit.actions.profileCreated",
  "profile.updated": "audit.actions.profileUpdated",
  "profile.deleted": "audit.actions.profileDeleted",
  "settings.updated": "audit.actions.settingsUpdated",
  "settings.test_email_sent": "audit.actions.settingsTestEmailSent",
} as const satisfies Record<AuditAction, MessageKey>

export const AUDIT_ACTOR_TYPE_LABEL_KEYS = {
  admin: "audit.actorTypeAdmin",
  user: "audit.actorTypeUser",
  system: "audit.actorTypeSystem",
} as const satisfies Record<AuditActorType, MessageKey>

export const AUDIT_TARGET_TYPE_LABEL_KEYS = {
  invite: "audit.targetTypeInvite",
  user: "audit.targetTypeUser",
  profile: "audit.targetTypeProfile",
  settings: "audit.targetTypeSettings",
} as const satisfies Record<AuditTargetType, MessageKey>

// Settings events use the settings tab id (or "audit") as their target id.
const AUDIT_SETTINGS_SECTION_LABEL_KEYS: Partial<Record<string, MessageKey>> = {
  jellyfin: "settings.jellyfinTab",
  seerr: "settings.seerrTab",
  memberOnboarding: "settings.memberOnboardingTab",
  app: "settings.appTab",
  email: "settings.emailTab",
  audit: "audit.retentionTitle",
}

export function getAuditSettingsSectionLabelKey(
  sectionId: string | null,
): MessageKey | undefined {
  return sectionId ? AUDIT_SETTINGS_SECTION_LABEL_KEYS[sectionId] : undefined
}

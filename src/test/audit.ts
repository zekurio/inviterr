import type { AuditActor } from "@/lib/audit"

export const TEST_ADMIN_ACTOR = {
  type: "admin",
  id: "admin-user",
  name: "Admin User",
} as const satisfies AuditActor

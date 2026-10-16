import { createFileRoute } from "@tanstack/react-router"

import { DashboardPageShell } from "@/components/dashboard/dashboard-page-shell"
import type { AuditEventFiltersDto } from "@/lib/api/contracts/admin"
import { getDashboardPageDataFn } from "@/lib/dashboard-page-fns"
import { parse } from "@/lib/validation"
import { auditEventFiltersSchema } from "@/server/api/schemas/admin-schemas"

export const Route = createFileRoute("/dashboard/audit")({
  validateSearch: (search): AuditEventFiltersDto =>
    parse(auditEventFiltersSchema, search),
  // Search params hold the filters, so filtering re-runs the loader; further
  // pages are appended client-side as the admin scrolls.
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) =>
    getDashboardPageDataFn({
      data: {
        activeTab: "audit",
        audit: deps,
      },
    }),
  component: DashboardAuditPage,
})

function DashboardAuditPage() {
  return <DashboardPageShell {...Route.useLoaderData()} />
}

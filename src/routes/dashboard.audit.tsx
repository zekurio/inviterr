import { createFileRoute } from "@tanstack/react-router"

import { DashboardPageShell } from "@/components/dashboard/dashboard-page-shell"
import type { AuditEventsPageInputDto } from "@/lib/api/contracts/admin"
import { getDashboardPageDataFn } from "@/lib/dashboard-page-fns"
import { parse } from "@/lib/validation"
import { auditEventsPageInputSchema } from "@/server/api/schemas/admin-schemas"

export const Route = createFileRoute("/dashboard/audit")({
  validateSearch: (search): AuditEventsPageInputDto =>
    parse(auditEventsPageInputSchema, search),
  // Search params identify the match, so paging and filtering re-run the loader.
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

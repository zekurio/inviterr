import { createFileRoute, redirect } from "@tanstack/react-router"

// Invite usage history now lives in the audit log; keep old links working.
export const Route = createFileRoute("/dashboard/history")({
  beforeLoad: () => {
    throw redirect({
      to: "/dashboard/audit",
      search: { action: "invite.redeemed" },
      replace: true,
    })
  },
})

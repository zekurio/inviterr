"use client"

import { InvitesView } from "@/components/views/invites"
import { Header } from "@/components/header"

export default function InvitesPage() {
  return (
    <div className="bg-background flex min-h-svh flex-col">
      <Header />
      <div className="container mx-auto py-6">
        <div className="space-y-6">
          <InvitesView />
        </div>
      </div>
    </div>
  )
} 
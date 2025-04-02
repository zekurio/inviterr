"use client"

import { ProfilesView } from "@/components/views/profiles"
import { Header } from "@/components/header"

export default function ProfilesPage() {
  return (
    <div className="bg-background flex min-h-svh flex-col">
      <Header />
      <div className="container mx-auto py-6">
        <div className="space-y-6">
          <ProfilesView />
        </div>
      </div>
    </div>
  )
} 
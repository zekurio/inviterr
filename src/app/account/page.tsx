"use client";

import { AccountView } from "@/components/views/account";
import { Header } from "@/components/header";

export default function AccountPage() {
  return (
    <div className="bg-background flex min-h-svh flex-col">
      <Header />
      <div className="container mx-auto max-w-3xl py-8">
        <div className="space-y-6">
          <AccountView />
        </div>
      </div>
    </div>
  );
}

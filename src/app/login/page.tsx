"use client";

import { LoginForm } from "@/components/forms/login"
import { ThemeToggle } from "@/components/theme-dropdown"
import { Logo } from "@/components/logo"

export default function LoginPage() {
  return (
    <div className="bg-background flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="flex w-full max-w-sm flex-col gap-6">
        <a href="#" className="flex items-center gap-2 self-center font-medium">
          <Logo />
        </a>
        <LoginForm />
      </div>
    </div>
  )
}
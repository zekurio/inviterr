"use client";

import Link from "next/link";
import { usePathname, useSelectedLayoutSegment } from "next/navigation";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-dropdown";
import { cn } from "@/lib/utils";

export function Header() {
  const segment = useSelectedLayoutSegment();
  const pathname = usePathname();

  return (
    <header className="border-b relative h-16">
      <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-6">
        <div className="flex items-center gap-2 font-medium">
          <Logo />
        </div>
        
        <nav className="flex items-center gap-4">
          <div className="flex items-center gap-4">
            <Link 
              href="/account" 
              className={cn(
                "text-sm font-medium px-3 py-2 rounded-md transition-colors",
                segment === "account" || (pathname === "/account")
                  ? "bg-primary text-primary-foreground dark:bg-primary dark:text-primary-foreground"
                  : "hover:bg-muted/60 hover:text-foreground/80"  
              )}
            >
              Account
            </Link>
            <Link 
              href="/invites" 
              className={cn(
                "text-sm font-medium px-3 py-2 rounded-md transition-colors",
                segment === "invites" || pathname.startsWith("/invites")
                  ? "bg-primary text-primary-foreground dark:bg-primary dark:text-primary-foreground"
                  : "hover:bg-muted/60 hover:text-foreground/80"
              )}
            >
              Invites
            </Link>
            <Link 
              href="/profiles" 
              className={cn(
                "text-sm font-medium px-3 py-2 rounded-md transition-colors",
                segment === "profiles" || pathname.startsWith("/profiles")
                  ? "bg-primary text-primary-foreground dark:bg-primary dark:text-primary-foreground"
                  : "hover:bg-muted/60 hover:text-foreground/80"
              )}
            >
              Profiles
            </Link>
          </div>
        </nav>
      </div>
      <div className="absolute right-4 top-1/2 -translate-y-1/2">
        <ThemeToggle />
      </div>
    </header>
  );
}
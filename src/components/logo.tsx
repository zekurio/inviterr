import { cn } from "@/lib/utils"
import { LucideTickets } from "lucide-react"

export function Logo({ className }: { className?: string }) {
  return (
    <div className="flex items-center">
      <div className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-md">
        <LucideTickets className={cn("size-4", className)} />
      </div>
      <span className="ml-2 font-mono text-2xl">inviterr</span>
    </div>
  )
}
import {
    Avatar,
    AvatarFallback,
    AvatarImage,
  } from "@/components/ui/avatar"
import { UserRound } from "lucide-react"

  export function AvatarWithFallback({ src, name }: { src: string, name: string }) {
    return (
      <Avatar>
        <AvatarImage src={src} alt={name} className="object-cover" />
        <AvatarFallback>
            <UserRound className="h-4 w-4" />
        </AvatarFallback>
      </Avatar>
    )
  }
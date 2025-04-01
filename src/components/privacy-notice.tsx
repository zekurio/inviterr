import { cn } from "@/lib/utils"

interface PrivacyNoticeProps {
  className?: string
  showTerms?: boolean
  showPrivacy?: boolean
  showCookies?: boolean
  termsUrl?: string
  privacyUrl?: string
  cookiesUrl?: string
}

export function PrivacyNotice({
  className,
  showTerms = true,
  showPrivacy = true,
  showCookies = false,
  termsUrl = "/terms",
  privacyUrl = "/privacy",
  cookiesUrl = "/cookies",
}: PrivacyNoticeProps) {
  return (
    <div className={cn("text-xs text-muted-foreground", className)}>
      <p>
        By {showCookies ? "using this site" : "continuing"}, you agree to
        {showTerms && (
          <>
            {" "}
            our{" "}
            <a
              href={termsUrl}
              className="underline underline-offset-4 hover:text-primary"
            >
              Terms of Service
            </a>
          </>
        )}
        {showTerms && showPrivacy && " and"}
        {showPrivacy && (
          <>
            {" "}
            our{" "}
            <a
              href={privacyUrl}
              className="underline underline-offset-4 hover:text-primary"
            >
              Privacy Policy
            </a>
          </>
        )}
        {showCookies && (
          <>
            {showTerms || showPrivacy ? "," : ""} including our{" "}
            <a
              href={cookiesUrl}
              className="underline underline-offset-4 hover:text-primary"
            >
              Cookie Use
            </a>
          </>
        )}
        .
      </p>
    </div>
  )
} 
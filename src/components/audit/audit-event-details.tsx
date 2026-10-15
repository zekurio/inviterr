"use client"

import type { AuditDetailValue, AuditScalar } from "@/lib/audit"
import { useLocale, useTranslations } from "@/lib/i18n"
import { formatDateTime } from "@/lib/utils"

const ISO_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/

type AuditEventDetailsProps = {
  details: Record<string, AuditDetailValue> | null
}

// Field names are rendered as recorded (camelCase data keys) so the log
// reads the same in every locale; only values are formatted.
export function AuditEventDetails({ details }: AuditEventDetailsProps) {
  const t = useTranslations()
  const locale = useLocale()
  const entries = Object.entries(details ?? {})

  if (entries.length === 0) {
    return <span className="text-muted-foreground">—</span>
  }

  function formatScalar(value: AuditScalar): string {
    if (value === null) {
      return "—"
    }
    if (typeof value === "string" && ISO_DATE_TIME_PATTERN.test(value)) {
      return formatDateTime(value, locale)
    }
    return String(value)
  }

  function formatValue(value: AuditDetailValue): string {
    if (value !== null && typeof value === "object") {
      return "changed" in value
        ? t("audit.changed")
        : `${formatScalar(value.from)} → ${formatScalar(value.to)}`
    }
    return formatScalar(value)
  }

  return (
    <dl className="grid min-w-0 gap-0.5 text-xs">
      {entries.map(([key, value]) => {
        const formatted = formatValue(value)
        return (
          <div key={key} className="flex min-w-0 gap-1.5">
            <dt className="text-muted-foreground shrink-0 font-mono">{key}</dt>
            <dd className="min-w-0 truncate" title={formatted}>
              {formatted}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}

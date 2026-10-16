"use client"

import { endOfDay, startOfDay } from "date-fns"
import { CalendarIcon, Layers, X } from "lucide-react"
import type { ReactNode } from "react"
import type { DateRange } from "react-day-picker"

import {
  AUDIT_ACTION_LABEL_KEYS,
  AUDIT_ACTOR_TYPE_LABEL_KEYS,
  AUDIT_TARGET_TYPE_LABEL_KEYS,
} from "@/components/audit/audit-labels"
import { DashboardTabSearch } from "@/components/dashboard/dashboard-tab-search"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { AuditEventFiltersDto } from "@/lib/api/contracts/admin"
import {
  AUDIT_ACTIONS,
  AUDIT_ACTOR_TYPES,
  AUDIT_TARGET_TYPES,
  getAuditActionTargetType,
  type AuditAction,
  type AuditActorType,
  type AuditTargetType,
} from "@/lib/audit"
import { getDateFnsLocale, useLocale, useTranslations } from "@/lib/i18n"
import { formatDate } from "@/lib/utils"

// Radix Select cannot represent an empty value, so "all" stands for no filter.
const ALL = "all"

const ACTOR_TYPE_VALUES: ReadonlySet<string> = new Set(AUDIT_ACTOR_TYPES)
const TARGET_TYPE_VALUES: ReadonlySet<string> = new Set(AUDIT_TARGET_TYPES)
const ACTION_VALUES: ReadonlySet<string> = new Set(AUDIT_ACTIONS)

type AuditLogFiltersProps = {
  filters: AuditEventFiltersDto
  onChange: (filters: AuditEventFiltersDto) => void
  actions?: ReactNode
}

export function AuditLogFilters({
  filters,
  onChange,
  actions,
}: AuditLogFiltersProps) {
  const t = useTranslations()
  const actionOptions = filters.targetType
    ? AUDIT_ACTIONS.filter(
        (action) => getAuditActionTargetType(action) === filters.targetType,
      )
    : AUDIT_ACTIONS
  const hasFilters = Object.values(filters).some(
    (value) => value !== undefined && value !== "",
  )

  // One wrapping row from sm up. Centering keeps the h-8 searches level with
  // the search on the other dashboard tabs, whose toolbars are h-9 tall.
  return (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
      <DashboardTabSearch
        placeholder={t("audit.actorFilterPlaceholder")}
        value={filters.actor ?? ""}
        onChange={(actor) => onChange({ ...filters, actor })}
        className="col-span-2 sm:w-auto sm:min-w-40 sm:flex-1"
      />
      <DashboardTabSearch
        placeholder={t("audit.targetFilterPlaceholder")}
        value={filters.target ?? ""}
        onChange={(target) => onChange({ ...filters, target })}
        className="col-span-2 sm:w-auto sm:min-w-40 sm:flex-1"
      />

      <Select
        value={filters.actorType ?? ALL}
        onValueChange={(value) =>
          onChange({
            ...filters,
            actorType: ACTOR_TYPE_VALUES.has(value)
              ? (value as AuditActorType)
              : undefined,
          })
        }
      >
        <SelectTrigger aria-label={t("audit.actor")} className="w-full sm:w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t("audit.allActorTypes")}</SelectItem>
          {AUDIT_ACTOR_TYPES.map((actorType) => (
            <SelectItem key={actorType} value={actorType}>
              {t(AUDIT_ACTOR_TYPE_LABEL_KEYS[actorType])}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.targetType ?? ALL}
        onValueChange={(value) => {
          const targetType = TARGET_TYPE_VALUES.has(value)
            ? (value as AuditTargetType)
            : undefined
          onChange({
            ...filters,
            targetType,
            // Keep an action filter only if it still fits the target type.
            action:
              filters.action &&
              targetType &&
              getAuditActionTargetType(filters.action) !== targetType
                ? undefined
                : filters.action,
          })
        }}
      >
        <SelectTrigger
          aria-label={t("audit.target")}
          className="w-full sm:w-36"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t("audit.allTargetTypes")}</SelectItem>
          {AUDIT_TARGET_TYPES.map((targetType) => (
            <SelectItem key={targetType} value={targetType}>
              {t(AUDIT_TARGET_TYPE_LABEL_KEYS[targetType])}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.action ?? ALL}
        onValueChange={(value) =>
          onChange({
            ...filters,
            action: ACTION_VALUES.has(value)
              ? (value as AuditAction)
              : undefined,
          })
        }
      >
        <SelectTrigger
          aria-label={t("audit.action")}
          className="col-span-2 w-full sm:w-44"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t("audit.allActions")}</SelectItem>
          {actionOptions.map((action) => (
            <SelectItem key={action} value={action}>
              {t(AUDIT_ACTION_LABEL_KEYS[action])}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <AuditDateRangeFilter
        from={filters.from}
        to={filters.to}
        onChange={(from, to) => onChange({ ...filters, from, to })}
      />

      {filters.batch && (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onChange({ ...filters, batch: undefined })}
          className="justify-self-start"
        >
          <Layers className="h-4 w-4" />
          {t("audit.bulkAction")}
          <X className="h-3.5 w-3.5" />
        </Button>
      )}

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange({})}
          className="justify-self-start"
        >
          {t("audit.clearFilters")}
        </Button>
      )}

      {actions && <div className="col-span-2 sm:ml-auto">{actions}</div>}
    </div>
  )
}

function AuditDateRangeFilter({
  from,
  to,
  onChange,
}: {
  from: string | undefined
  to: string | undefined
  onChange: (from: string | undefined, to: string | undefined) => void
}) {
  const t = useTranslations()
  const locale = useLocale()
  const selected: DateRange | undefined = from
    ? { from: new Date(from), to: to ? new Date(to) : undefined }
    : undefined

  // Day boundaries come from the browser so the range matches the admin's
  // local calendar; the server only ever sees absolute timestamps.
  function handleSelect(range: DateRange | undefined): void {
    if (!range?.from) {
      onChange(undefined, undefined)
      return
    }
    onChange(
      startOfDay(range.from).toISOString(),
      endOfDay(range.to ?? range.from).toISOString(),
    )
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="col-span-2 w-full justify-start font-normal sm:w-auto"
        >
          <CalendarIcon className="h-4 w-4" />
          <span className="truncate">
            {from
              ? `${formatDate(from, locale)} – ${formatDate(to ?? from, locale)}`
              : t("audit.anyDate")}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          selected={selected}
          onSelect={handleSelect}
          disabled={{ after: new Date() }}
          locale={getDateFnsLocale(locale)}
        />
        {from && (
          <div className="border-t p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => onChange(undefined, undefined)}
            >
              {t("common.clearDate")}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

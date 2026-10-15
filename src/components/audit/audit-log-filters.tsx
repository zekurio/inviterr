"use client"

import { endOfDay, startOfDay } from "date-fns"
import { CalendarIcon, Layers, X } from "lucide-react"
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
}

export function AuditLogFilters({ filters, onChange }: AuditLogFiltersProps) {
  const t = useTranslations()
  const actions = filters.targetType
    ? AUDIT_ACTIONS.filter(
        (action) => getAuditActionTargetType(action) === filters.targetType,
      )
    : AUDIT_ACTIONS
  const hasFilters = Object.values(filters).some(
    (value) => value !== undefined && value !== "",
  )

  return (
    <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
      <div className="grid gap-2 sm:grid-cols-2 lg:flex">
        <DashboardTabSearch
          placeholder={t("audit.actorFilterPlaceholder")}
          value={filters.actor ?? ""}
          onChange={(actor) => onChange({ ...filters, actor })}
        />
        <DashboardTabSearch
          placeholder={t("audit.targetFilterPlaceholder")}
          value={filters.target ?? ""}
          onChange={(target) => onChange({ ...filters, target })}
        />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:flex">
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
          <SelectTrigger
            aria-label={t("audit.actor")}
            className="w-full lg:w-36"
          >
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
            className="w-full lg:w-36"
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
            className="col-span-2 w-full sm:col-span-1 lg:w-56"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("audit.allActions")}</SelectItem>
            {actions.map((action) => (
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
      </div>

      {filters.batch && (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onChange({ ...filters, batch: undefined })}
          className="self-start lg:self-auto"
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
          className="self-start lg:self-auto"
        >
          {t("audit.clearFilters")}
        </Button>
      )}
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
          className="col-span-2 w-full justify-start font-normal sm:col-span-1 lg:w-auto"
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

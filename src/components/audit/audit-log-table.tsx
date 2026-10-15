"use client"

import { useNavigate, useRouter } from "@tanstack/react-router"
import { useStore } from "@tanstack/react-store"
import {
  type ColumnDef,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { Bot, Layers, ShieldCheck, User } from "lucide-react"
import { useCallback, useEffect, useMemo } from "react"

import { AuditEventDetails } from "@/components/audit/audit-event-details"
import {
  AUDIT_ACTION_LABEL_KEYS,
  AUDIT_TARGET_TYPE_LABEL_KEYS,
  getAuditSettingsSectionLabelKey,
} from "@/components/audit/audit-labels"
import { AuditLogFilters } from "@/components/audit/audit-log-filters"
import { AuditRetentionDialog } from "@/components/audit/audit-retention-dialog"
import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/ui/data-table"
import { DataTablePagination } from "@/components/ui/data-table-pagination"
import { RelativeTime } from "@/components/ui/relative-time"
import { createAppStore } from "@/hooks/store-utils"
import { useScopedStore } from "@/hooks/use-scoped-store"
import type {
  AuditEventDto,
  AuditEventFiltersDto,
  PagedAuditEventsDto,
} from "@/lib/api/contracts/admin"
import { useLocale, useTranslations } from "@/lib/i18n"

interface AuditLogTableProps {
  initialPage: PagedAuditEventsDto
  initialFilters: AuditEventFiltersDto
  initialError?: string | null
}

interface AuditLogTableState {
  page: PagedAuditEventsDto
  filters: AuditEventFiltersDto
  error: string | null
  setPage: (page: PagedAuditEventsDto) => void
  setFilters: (filters: AuditEventFiltersDto) => void
  setError: (error: string | null) => void
  setRetentionDays: (retentionDays: number) => void
}

type TranslationFn = ReturnType<typeof useTranslations>
type ApplyFilter = (filters: AuditEventFiltersDto) => void

const ACTOR_ICONS = {
  admin: ShieldCheck,
  user: User,
  system: Bot,
} as const

function getTargetLabel(event: AuditEventDto, t: TranslationFn): string {
  const sectionKey =
    event.targetType === "settings"
      ? getAuditSettingsSectionLabelKey(event.targetId)
      : undefined
  if (sectionKey) {
    return t(sectionKey)
  }
  return event.targetLabel ?? event.targetId ?? "—"
}

function AuditActorButton({
  event,
  onFilter,
}: {
  event: AuditEventDto
  onFilter: ApplyFilter
}) {
  const t = useTranslations()
  const Icon = ACTOR_ICONS[event.actorType]
  const name =
    event.actorType === "system"
      ? t("audit.actorTypeSystem")
      : (event.actorName ?? event.actorId ?? "—")

  return (
    <button
      type="button"
      className="hover:text-primary flex max-w-full min-w-0 items-center gap-2 text-left font-medium"
      title={t("audit.filterByActor", { name })}
      onClick={() =>
        onFilter(
          event.actorId
            ? { actor: event.actorId }
            : { actorType: event.actorType },
        )
      }
    >
      <Icon
        className="text-muted-foreground h-4 w-4 shrink-0"
        aria-hidden="true"
      />
      <span className="truncate">{name}</span>
    </button>
  )
}

function AuditTargetButton({
  event,
  onFilter,
}: {
  event: AuditEventDto
  onFilter: ApplyFilter
}) {
  const t = useTranslations()
  const label = getTargetLabel(event, t)

  return (
    <button
      type="button"
      className="hover:text-primary flex max-w-full min-w-0 items-baseline gap-1.5 text-left"
      title={t("audit.filterByTarget", { name: label })}
      onClick={() =>
        onFilter({
          targetType: event.targetType,
          target: event.targetId ?? undefined,
        })
      }
    >
      <span className="text-muted-foreground shrink-0 text-xs">
        {t(AUDIT_TARGET_TYPE_LABEL_KEYS[event.targetType])}
      </span>
      <span className="truncate">{label}</span>
    </button>
  )
}

function AuditActionLabel({
  event,
  onFilter,
}: {
  event: AuditEventDto
  onFilter: ApplyFilter
}) {
  const t = useTranslations()
  const batchId = event.batchId

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="truncate">
        {t(AUDIT_ACTION_LABEL_KEYS[event.action])}
      </span>
      {batchId && (
        <button
          type="button"
          className="text-muted-foreground hover:text-primary shrink-0"
          title={t("audit.showBulkAction")}
          aria-label={t("audit.showBulkAction")}
          onClick={() => onFilter({ batch: batchId })}
        >
          <Layers className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

function createAuditColumns(
  t: TranslationFn,
  locale: string,
  onFilter: ApplyFilter,
): ColumnDef<AuditEventDto>[] {
  return [
    {
      id: "time",
      header: t("audit.time"),
      size: 130,
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          <RelativeTime date={row.original.createdAt} locale={locale} />
        </span>
      ),
    },
    {
      id: "actor",
      header: t("audit.actor"),
      size: 190,
      cell: ({ row }) => (
        <AuditActorButton event={row.original} onFilter={onFilter} />
      ),
    },
    {
      id: "action",
      header: t("audit.action"),
      size: 230,
      cell: ({ row }) => (
        <AuditActionLabel event={row.original} onFilter={onFilter} />
      ),
    },
    {
      id: "target",
      header: t("audit.target"),
      size: 220,
      cell: ({ row }) => (
        <AuditTargetButton event={row.original} onFilter={onFilter} />
      ),
    },
    {
      id: "details",
      header: t("audit.details"),
      size: 320,
      cell: ({ row }) => <AuditEventDetails details={row.original.details} />,
    },
  ]
}

export function AuditLogTable({
  initialPage,
  initialFilters,
  initialError = null,
}: AuditLogTableProps) {
  const navigate = useNavigate()
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations()
  const scopedStore = useScopedStore(() =>
    createAppStore<AuditLogTableState>((set) => ({
      page: initialPage,
      filters: initialFilters,
      error: initialError,
      setPage: (page) => set({ page }),
      setFilters: (filters) => set({ filters }),
      setError: (error) => set({ error }),
      setRetentionDays: (retentionDays) =>
        set((state) => ({ page: { ...state.page, retentionDays } })),
    })),
  )
  const page = useStore(scopedStore, (state) => state.page)
  const filters = useStore(scopedStore, (state) => state.filters)
  const error = useStore(scopedStore, (state) => state.error)

  useEffect(() => {
    scopedStore.getState().setPage(initialPage)
    scopedStore.getState().setFilters(initialFilters)
    scopedStore.getState().setError(initialError)
  }, [initialError, initialFilters, initialPage, scopedStore])

  // Filters live in the URL so the route loader fetches the page during
  // navigation and intent preloading instead of after render.
  const navigateToAuditPage = useCallback(
    (nextFilters: AuditEventFiltersDto, nextPage: number) => {
      scopedStore.getState().setFilters(nextFilters)
      void navigate({
        to: "/dashboard/audit",
        search: {
          page: nextPage,
          pageSize: scopedStore.getState().page.pageSize,
          actorType: nextFilters.actorType,
          actor: nextFilters.actor || undefined,
          action: nextFilters.action,
          targetType: nextFilters.targetType,
          target: nextFilters.target || undefined,
          batch: nextFilters.batch,
          from: nextFilters.from,
          to: nextFilters.to,
        },
        replace: true,
      })
    },
    [navigate, scopedStore],
  )

  const handleFiltersChange = useCallback(
    (nextFilters: AuditEventFiltersDto) => navigateToAuditPage(nextFilters, 1),
    [navigateToAuditPage],
  )

  // Clicking an actor, target, or bulk marker narrows the current view.
  const handleRowFilter = useCallback(
    (filter: AuditEventFiltersDto) =>
      navigateToAuditPage({ ...scopedStore.getState().filters, ...filter }, 1),
    [navigateToAuditPage, scopedStore],
  )

  const handleRetentionSaved = useCallback(
    (retentionDays: number) => {
      scopedStore.getState().setRetentionDays(retentionDays)
      void router.invalidate()
    },
    [router, scopedStore],
  )

  const columns = useMemo(
    () => createAuditColumns(t, locale, handleRowFilter),
    [handleRowFilter, locale, t],
  )
  const table = useReactTable({
    data: page.items,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  })
  const rows = table.getRowModel().rows

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed p-8">
        <p className="text-muted-foreground text-sm">{error}</p>
        <Button variant="outline" onClick={() => void router.invalidate()}>
          {t("common.tryAgain")}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <AuditLogFilters filters={filters} onChange={handleFiltersChange} />
        <div className="shrink-0">
          <AuditRetentionDialog
            retentionDays={page.retentionDays}
            onSaved={handleRetentionSaved}
          />
        </div>
      </div>

      <div className="space-y-2 md:hidden">
        {rows.length ? (
          rows.map((row) => {
            const event = row.original

            return (
              <div
                key={event.id}
                className="flex flex-col gap-1.5 rounded-lg border px-3 py-2.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 text-sm font-medium">
                    <AuditActionLabel
                      event={event}
                      onFilter={handleRowFilter}
                    />
                  </div>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    <RelativeTime date={event.createdAt} locale={locale} />
                  </span>
                </div>
                <div className="flex min-w-0 flex-col gap-1 text-sm">
                  <AuditActorButton event={event} onFilter={handleRowFilter} />
                  <AuditTargetButton event={event} onFilter={handleRowFilter} />
                </div>
                {event.details && <AuditEventDetails details={event.details} />}
              </div>
            )
          })
        ) : (
          <div className="text-muted-foreground rounded-md border p-6 text-center text-sm">
            {t("audit.empty")}
          </div>
        )}
      </div>

      <DataTable
        table={table}
        emptyLabel={t("audit.empty")}
        getCellClassName={(_row, columnId) =>
          columnId === "details" ? "whitespace-normal py-2" : undefined
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground text-xs">
          {page.total === 1
            ? t("audit.eventCountSingle", { count: page.total })
            : t("audit.eventCountPlural", { count: page.total })}
        </p>
        <DataTablePagination
          page={page.page}
          pageCount={Math.max(page.pageCount, 1)}
          canPrevious={page.page > 1}
          canNext={page.page < page.pageCount}
          onPrevious={() =>
            navigateToAuditPage(filters, Math.max(page.page - 1, 1))
          }
          onNext={() =>
            navigateToAuditPage(
              filters,
              Math.min(page.page + 1, page.pageCount),
            )
          }
        />
      </div>
    </div>
  )
}

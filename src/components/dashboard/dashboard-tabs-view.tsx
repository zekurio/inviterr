"use client"

import { useNavigate } from "@tanstack/react-router"
import {
  Clock3,
  ScrollText,
  Settings2,
  Ticket,
  Tv,
  User,
  type LucideIcon,
} from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { AccessRequestsCard } from "@/components/access-requests/access-requests-card"
import { AuditLogTable } from "@/components/audit/audit-log-table"
import { InviteHistoryTable } from "@/components/invites/invite-history-table"
import { InvitesGrid } from "@/components/invites/invites-grid"
import { ProfilesGrid } from "@/components/profiles/profiles-grid"
import { DashboardSettingsTabs } from "@/components/settings/dashboard-settings-tabs"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { UsersTable } from "@/components/users/users-table"
import type { UsersPayload } from "@/components/users/users-table"
import {
  DashboardSettingsDirtyProvider,
  useDashboardSettingsActiveTabDirty,
} from "@/hooks/use-dashboard-settings-dirty"
import type {
  AuditEventFiltersDto,
  MediaLibraryDto,
  PagedAuditEventsDto,
  PagedInviteHistoryDto,
  PendingAccessRequestsDto,
  PagedInvitesDto,
  ProfileDto,
} from "@/lib/api/contracts/admin"
import type { DashboardSettingsBootstrap } from "@/lib/bootstrap-data"
import {
  getDashboardTabPath,
  isDashboardTab,
  type DashboardSettingsTab,
  type DashboardTab,
} from "@/lib/dashboard-tabs"
import { useTranslations } from "@/lib/i18n"

const DASHBOARD_TABS_BASE_ID = "dashboard-tabs"
const MOBILE_TAB_CLASS_NAME =
  "data-[state=active]:text-primary h-full flex-1 flex-col gap-0.5 px-1 py-1 text-center text-[10px] leading-tight whitespace-normal after:hidden"

const DASHBOARD_TAB_NAV_ITEMS: Array<{
  value: DashboardTab
  labelKey:
    | "nav.invites"
    | "nav.profiles"
    | "nav.history"
    | "nav.users"
    | "nav.audit"
    | "nav.settings"
  Icon: LucideIcon
}> = [
  { value: "invites", labelKey: "nav.invites", Icon: Ticket },
  { value: "profiles", labelKey: "nav.profiles", Icon: Tv },
  { value: "history", labelKey: "nav.history", Icon: Clock3 },
  { value: "users", labelKey: "nav.users", Icon: User },
  { value: "audit", labelKey: "nav.audit", Icon: ScrollText },
  { value: "settings", labelKey: "nav.settings", Icon: Settings2 },
]

function getTabTriggerId(baseId: string, value: string): string {
  return `${baseId}-trigger-${value}`
}

function getTabContentId(baseId: string, value: string): string {
  return `${baseId}-content-${value}`
}

interface DashboardTabsViewProps {
  activeTab: DashboardTab
  activeSettingsTab: DashboardSettingsTab
  pendingAccessRequestCount: number
  settingsData: DashboardSettingsBootstrap
  invitesData: {
    invites: PagedInvitesDto
    profiles: ProfileDto[]
    query: string
    error: string | null
  }
  profilesData: {
    profiles: ProfileDto[]
    libraries: MediaLibraryDto[]
    isSeerrConfigured: boolean
    error: string | null
  }
  usersData: {
    data: UsersPayload
    query: string
    error: string | null
  }
  accessRequestsData: {
    data: PendingAccessRequestsDto
    error: string | null
  }
  historyData: {
    page: PagedInviteHistoryDto
    query: string
    error: string | null
  }
  auditData: {
    page: PagedAuditEventsDto
    filters: AuditEventFiltersDto
    error: string | null
  }
}

function DashboardTabsViewInner({
  activeTab,
  activeSettingsTab,
  pendingAccessRequestCount,
  settingsData,
  invitesData,
  profilesData,
  usersData,
  accessRequestsData,
  historyData,
  auditData,
}: DashboardTabsViewProps) {
  const navigate = useNavigate()
  const t = useTranslations()
  // Each tab is its own route, so this resets from fresh loader data on every
  // tab switch; the Users tab card keeps it current after decisions.
  const [pendingCount, setPendingCount] = useState(pendingAccessRequestCount)
  const pendingLabel = t("accessRequests.pendingCount", { count: pendingCount })
  const activeSettingsTabDirty =
    useDashboardSettingsActiveTabDirty(activeSettingsTab)

  function handleTabChange(value: string): void {
    if (!isDashboardTab(value)) {
      return
    }

    if (value === activeTab) {
      return
    }

    if (activeTab === "settings" && activeSettingsTabDirty) {
      toast.error(t("profile.saveOrResetToSwitchTabs"), {
        id: "dashboard-tab-switch-blocked",
      })
      return
    }

    void navigate({
      to: getDashboardTabPath(value, activeSettingsTab),
      replace: true,
    })
  }

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
      <TabsList className="hidden md:inline-flex">
        {DASHBOARD_TAB_NAV_ITEMS.map(({ value, labelKey }) => (
          <TabsTrigger
            key={value}
            value={value}
            id={getTabTriggerId(DASHBOARD_TABS_BASE_ID, value)}
            aria-controls={getTabContentId(DASHBOARD_TABS_BASE_ID, value)}
          >
            {t(labelKey)}
            {value === "users" && pendingCount > 0 && (
              <>
                <span
                  aria-hidden
                  className="bg-primary text-primary-foreground ml-1.5 min-w-5 rounded-full px-1.5 text-xs leading-5 tabular-nums"
                >
                  {pendingCount}
                </span>
                <span className="sr-only">{pendingLabel}</span>
              </>
            )}
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent
        value="invites"
        id={getTabContentId(DASHBOARD_TABS_BASE_ID, "invites")}
        aria-labelledby={getTabTriggerId(DASHBOARD_TABS_BASE_ID, "invites")}
        className="md:mt-4"
      >
        <InvitesGrid
          initialInvites={invitesData.invites}
          initialQuery={invitesData.query}
          availableProfiles={invitesData.profiles}
          initialError={invitesData.error}
        />
      </TabsContent>

      <TabsContent
        value="users"
        id={getTabContentId(DASHBOARD_TABS_BASE_ID, "users")}
        aria-labelledby={getTabTriggerId(DASHBOARD_TABS_BASE_ID, "users")}
        className="md:mt-4"
      >
        <div className="space-y-4">
          <AccessRequestsCard
            initialData={accessRequestsData.data}
            initialError={accessRequestsData.error}
            onCountChange={setPendingCount}
          />
          <UsersTable
            initialData={usersData.data}
            initialQuery={usersData.query}
            initialError={usersData.error}
          />
        </div>
      </TabsContent>

      <TabsContent
        value="profiles"
        id={getTabContentId(DASHBOARD_TABS_BASE_ID, "profiles")}
        aria-labelledby={getTabTriggerId(DASHBOARD_TABS_BASE_ID, "profiles")}
        className="md:mt-4"
      >
        <ProfilesGrid
          initialProfiles={profilesData.profiles}
          initialLibraries={profilesData.libraries}
          isSeerrConfigured={profilesData.isSeerrConfigured}
          initialError={profilesData.error}
        />
      </TabsContent>

      <TabsContent
        value="history"
        id={getTabContentId(DASHBOARD_TABS_BASE_ID, "history")}
        aria-labelledby={getTabTriggerId(DASHBOARD_TABS_BASE_ID, "history")}
        className="md:mt-4"
      >
        <InviteHistoryTable
          initialPage={historyData.page}
          initialQuery={historyData.query}
          initialError={historyData.error}
        />
      </TabsContent>

      <TabsContent
        value="audit"
        id={getTabContentId(DASHBOARD_TABS_BASE_ID, "audit")}
        aria-labelledby={getTabTriggerId(DASHBOARD_TABS_BASE_ID, "audit")}
        className="md:mt-4"
      >
        <AuditLogTable
          initialPage={auditData.page}
          initialFilters={auditData.filters}
          initialError={auditData.error}
        />
      </TabsContent>

      <TabsContent
        value="settings"
        id={getTabContentId(DASHBOARD_TABS_BASE_ID, "settings")}
        aria-labelledby={getTabTriggerId(DASHBOARD_TABS_BASE_ID, "settings")}
        className="md:mt-4"
      >
        <DashboardSettingsTabs
          activeTab={activeSettingsTab}
          initialData={settingsData}
        />
      </TabsContent>

      <TabsList className="bg-background/95 supports-[backdrop-filter]:bg-background/80 fixed inset-x-0 bottom-0 z-40 h-[calc(4rem+env(safe-area-inset-bottom))] items-stretch justify-between gap-0 border-t border-b-0 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {DASHBOARD_TAB_NAV_ITEMS.map(({ value, labelKey, Icon }) => (
          <TabsTrigger
            key={value}
            value={value}
            className={MOBILE_TAB_CLASS_NAME}
            aria-label={
              value === "users" && pendingCount > 0
                ? `${t(labelKey)}, ${pendingLabel}`
                : t(labelKey)
            }
          >
            <span className="relative">
              <Icon className="h-4 w-4" />
              {value === "users" && pendingCount > 0 && (
                <span
                  aria-hidden
                  className="bg-primary text-primary-foreground absolute -top-1.5 left-2.5 min-w-4 rounded-full px-1 text-[9px] leading-4 tabular-nums"
                >
                  {pendingCount}
                </span>
              )}
            </span>
            {t(labelKey)}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}

export function DashboardTabsView(props: DashboardTabsViewProps) {
  return (
    <DashboardSettingsDirtyProvider>
      <DashboardTabsViewInner {...props} />
    </DashboardSettingsDirtyProvider>
  )
}

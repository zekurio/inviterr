"use client"

import { useStore } from "@tanstack/react-store"
import { Check, X } from "lucide-react"
import { toast } from "sonner"

import { ConfirmAlertShell } from "@/components/shared/confirm-alert-shell"
import { AlertDialog } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { RelativeTime } from "@/components/ui/relative-time"
import { createAppStore } from "@/hooks/store-utils"
import { useDialogAction } from "@/hooks/use-dialog-action"
import { useScopedStore } from "@/hooks/use-scoped-store"
import type {
  AccessRequestDto,
  PendingAccessRequestsDto,
} from "@/lib/api/contracts/admin"
import { getApiErrorMessage } from "@/lib/api/error-message"
import { useLocale, useTranslations } from "@/lib/i18n"
import { getBrowserORPCClient, runApiEffect } from "@/lib/orpc/client"

import { DenyAccessRequestDialog } from "./deny-access-request-dialog"

interface AccessRequestsCardStoreState {
  requests: AccessRequestDto[]
  setRequests: (
    update: (requests: AccessRequestDto[]) => AccessRequestDto[],
  ) => void
}

interface AccessRequestsCardProps {
  initialData: PendingAccessRequestsDto
  initialError: string | null
  onCountChange: (count: number) => void
}

export function AccessRequestsCard({
  initialData,
  initialError,
  onCountChange,
}: AccessRequestsCardProps) {
  const t = useTranslations()
  const locale = useLocale()
  const store = useScopedStore(() =>
    createAppStore<AccessRequestsCardStoreState>((set) => ({
      requests: initialData.requests,
      setRequests: (update) =>
        set((state) => ({ requests: update(state.requests) })),
    })),
  )
  const requests = useStore(store, (state) => state.requests)
  const approveDialog = useDialogAction<AccessRequestDto>()
  const denyDialog = useDialogAction<AccessRequestDto>()

  function updateRequests(
    update: (current: AccessRequestDto[]) => AccessRequestDto[],
  ): void {
    store.getState().setRequests(update)
    onCountChange(store.getState().requests.length)
  }

  // Decisions are optimistic: the row leaves immediately and comes back in
  // its original position if the server rejects the decision.
  async function decide(
    request: AccessRequestDto,
    run: () => Promise<{ error: unknown }>,
    messages: {
      success: string
      failure: "accessRequests.approveFailed" | "accessRequests.denyFailed"
    },
  ): Promise<void> {
    updateRequests((current) =>
      current.filter((item) => item.id !== request.id),
    )
    const result = await run()

    if (result.error !== null) {
      updateRequests((current) =>
        [...current, request].sort((left, right) =>
          left.createdAt.localeCompare(right.createdAt),
        ),
      )
      toast.error(getApiErrorMessage(result.error, t, messages.failure))
      return
    }

    toast.success(messages.success)
  }

  function handleApprove(): void {
    const request = approveDialog.item
    if (!request) {
      return
    }

    approveDialog.close()
    void decide(
      request,
      () =>
        runApiEffect(
          getBrowserORPCClient().admin.accessRequests.approve({
            requestId: request.id,
          }),
        ),
      {
        success: t("accessRequests.approved", { email: request.email }),
        failure: "accessRequests.approveFailed",
      },
    )
  }

  function handleDeny(input: { reason: string; notify: boolean }): void {
    const request = denyDialog.item
    if (!request) {
      return
    }

    denyDialog.close()
    void decide(
      request,
      () =>
        runApiEffect(
          getBrowserORPCClient().admin.accessRequests.deny({
            requestId: request.id,
            notify: input.notify,
            reason: input.notify && input.reason ? input.reason : undefined,
          }),
        ),
      {
        success: t("accessRequests.denied", { email: request.email }),
        failure: "accessRequests.denyFailed",
      },
    )
  }

  const profileDescription = initialData.profileName
    ? t("accessRequests.sectionDescription", {
        profile: initialData.profileName,
      })
    : t("errors.noInviteProfile")

  return (
    <>
      {(requests.length > 0 || initialError) && (
        <section
          aria-labelledby="access-requests-title"
          className="space-y-3 rounded-lg border p-4"
        >
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 id="access-requests-title" className="text-sm font-medium">
                {t("accessRequests.sectionTitle")}
              </h2>
              {requests.length > 0 && (
                <Badge variant="secondary" className="tabular-nums">
                  {requests.length}
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground text-xs">
              {profileDescription}
            </p>
          </div>

          {initialError && (
            <p className="text-destructive text-sm">{initialError}</p>
          )}

          <ul className="divide-y">
            {requests.map((request) => (
              <li
                key={request.id}
                className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <p className="truncate text-sm font-medium">
                    {request.email}
                  </p>
                  {request.message ? (
                    <p className="text-muted-foreground text-sm break-words whitespace-pre-wrap">
                      {request.message}
                    </p>
                  ) : (
                    <p className="text-muted-foreground text-sm italic">
                      {t("accessRequests.noMessage")}
                    </p>
                  )}
                  <p className="text-muted-foreground text-xs">
                    {t("accessRequests.requested")}{" "}
                    <RelativeTime date={request.createdAt} locale={locale} />
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    disabled={!initialData.profileName}
                    onClick={() => approveDialog.open(request)}
                  >
                    <Check />
                    {t("accessRequests.approve")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => denyDialog.open(request)}
                  >
                    <X />
                    {t("accessRequests.deny")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <AlertDialog
        open={approveDialog.isOpen}
        onOpenChange={(open) => !open && approveDialog.close()}
      >
        <ConfirmAlertShell
          title={t("accessRequests.approveTitle")}
          description={t("accessRequests.approveDescription", {
            email: approveDialog.item?.email ?? "",
            profile: initialData.profileName ?? "",
          })}
          cancelLabel={t("common.cancel")}
          confirmLabel={t("accessRequests.approve")}
          onConfirm={handleApprove}
        />
      </AlertDialog>

      <DenyAccessRequestDialog
        open={denyDialog.isOpen}
        request={denyDialog.item}
        onClose={denyDialog.close}
        onDeny={handleDeny}
      />
    </>
  )
}

"use client"

import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import type { AccessRequestDto } from "@/lib/api/contracts/admin"
import { useTranslations } from "@/lib/i18n"
import { ACCESS_REQUEST_TEXT_MAX_LENGTH } from "@/lib/schemas"

interface DenyAccessRequestDialogProps {
  open: boolean
  request: AccessRequestDto | null
  onClose: () => void
  onDeny: (input: { reason: string; notify: boolean }) => void
}

export function DenyAccessRequestDialog({
  open,
  request,
  onClose,
  onDeny,
}: DenyAccessRequestDialogProps) {
  const t = useTranslations()
  const [reason, setReason] = useState("")
  const [notify, setNotify] = useState(true)
  const requestId = request?.id

  useEffect(() => {
    if (!open || !requestId) {
      return
    }

    setReason("")
    setNotify(true)
  }, [open, requestId])

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("accessRequests.denyTitle")}</DialogTitle>
          <DialogDescription>
            {t("accessRequests.denyDescription", {
              email: request?.email ?? "",
            })}
          </DialogDescription>
        </DialogHeader>

        <FieldGroup className="py-2">
          <Field orientation="horizontal">
            <Checkbox
              id="deny-access-request-notify"
              checked={notify}
              onCheckedChange={(checked) => setNotify(checked === true)}
            />
            <div className="grid gap-0.5">
              <FieldLabel
                htmlFor="deny-access-request-notify"
                className="cursor-pointer font-normal"
              >
                {t("accessRequests.denyNotifyLabel")}
              </FieldLabel>
              <FieldDescription>
                {t("accessRequests.denyNotifyDescription")}
              </FieldDescription>
            </div>
          </Field>

          <Field>
            <FieldLabel htmlFor="deny-access-request-reason">
              {t("accessRequests.denyReasonLabel")}
            </FieldLabel>
            <Textarea
              id="deny-access-request-reason"
              value={reason}
              maxLength={ACCESS_REQUEST_TEXT_MAX_LENGTH}
              placeholder={t("accessRequests.denyReasonPlaceholder")}
              disabled={!notify}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
        </FieldGroup>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={() => onDeny({ reason: reason.trim(), notify })}
          >
            {t("accessRequests.deny")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

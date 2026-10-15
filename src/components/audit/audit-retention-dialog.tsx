"use client"

import { History } from "lucide-react"
import { useState, type FormEvent } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { getApiErrorMessage } from "@/lib/api/error-message"
import { AUDIT_RETENTION_MAX_DAYS } from "@/lib/audit"
import { useTranslations } from "@/lib/i18n"
import { getBrowserORPCClient, runApiEffect } from "@/lib/orpc/client"
import { safeParse } from "@/lib/validation"
import { updateAuditRetentionSchema } from "@/server/api/schemas/admin-schemas"

type AuditRetentionDialogProps = {
  retentionDays: number
  onSaved: (retentionDays: number) => void
}

export function AuditRetentionDialog({
  retentionDays,
  onSaved,
}: AuditRetentionDialogProps) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(String(retentionDays))
  const [isInvalid, setIsInvalid] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  function handleOpenChange(nextOpen: boolean): void {
    if (isSaving) {
      return
    }
    if (nextOpen) {
      setValue(String(retentionDays))
      setIsInvalid(false)
    }
    setOpen(nextOpen)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // Number("") is 0, which would silently mean "keep forever".
    const parsed = safeParse(updateAuditRetentionSchema, {
      retentionDays: value.trim() === "" ? Number.NaN : Number(value),
    })
    if (!parsed.success) {
      setIsInvalid(true)
      return
    }

    setIsSaving(true)
    const result = await runApiEffect(
      getBrowserORPCClient().admin.audit.updateRetention(parsed.data),
    )
    setIsSaving(false)
    if (!result.data) {
      toast.error(
        getApiErrorMessage(result.error, t, "audit.retentionSaveFailed"),
      )
      return
    }
    toast.success(t("audit.retentionSaved"))
    setOpen(false)
    onSaved(result.data.retentionDays)
  }

  return (
    <>
      <Button
        variant="outline"
        onClick={() => handleOpenChange(true)}
        className="w-full sm:w-auto"
      >
        <History className="h-4 w-4" />
        {retentionDays === 0
          ? t("audit.retentionForever")
          : t("audit.retentionDays", { count: retentionDays })}
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-sm">
          <form onSubmit={(event) => void handleSubmit(event)}>
            <DialogHeader>
              <DialogTitle>{t("audit.retentionTitle")}</DialogTitle>
              <DialogDescription>
                {t("audit.retentionDescription")}
              </DialogDescription>
            </DialogHeader>

            <Field data-invalid={isInvalid} className="py-4">
              <FieldLabel htmlFor="audit-retention-days">
                {t("audit.retentionLabel")}
              </FieldLabel>
              <Input
                id="audit-retention-days"
                type="number"
                inputMode="numeric"
                min={0}
                max={AUDIT_RETENTION_MAX_DAYS}
                step={1}
                value={value}
                onChange={(event) => {
                  setValue(event.target.value)
                  setIsInvalid(false)
                }}
                aria-invalid={isInvalid}
                disabled={isSaving}
              />
              {isInvalid && (
                <FieldError
                  errors={[
                    t("audit.retentionInvalid", {
                      max: AUDIT_RETENTION_MAX_DAYS,
                    }),
                  ]}
                />
              )}
            </Field>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => handleOpenChange(false)}
                disabled={isSaving}
              >
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? t("common.saving") : t("common.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

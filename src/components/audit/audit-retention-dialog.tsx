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
import { AUDIT_RETENTION_MAX_DAYS } from "@/lib/audit"
import { reportClientError } from "@/lib/client-error"
import { useTranslations } from "@/lib/i18n"
import { getBrowserORPCClient, runApiEffect } from "@/lib/orpc/client"

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
    const nextRetentionDays = Number(value)
    if (
      value.trim() === "" ||
      !Number.isInteger(nextRetentionDays) ||
      nextRetentionDays < 0 ||
      nextRetentionDays > AUDIT_RETENTION_MAX_DAYS
    ) {
      setIsInvalid(true)
      return
    }

    setIsSaving(true)
    try {
      const result = await runApiEffect(
        getBrowserORPCClient().admin.audit.updateRetention({
          retentionDays: nextRetentionDays,
        }),
      )
      if (result.error !== null || !result.data) {
        toast.error(t("audit.retentionSaveFailed"))
        return
      }
      toast.success(t("audit.retentionSaved"))
      setOpen(false)
      onSaved(result.data.retentionDays)
    } catch (err) {
      reportClientError(err)
      toast.error(t("audit.retentionSaveFailed"))
    } finally {
      setIsSaving(false)
    }
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

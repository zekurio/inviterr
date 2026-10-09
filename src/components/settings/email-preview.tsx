"use client"

import { type SyntheticEvent, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import {
  EMAIL_MESSAGE_TYPES,
  type EmailBrandingDraft,
  type EmailMessageType,
} from "@/lib/email"
import { useTranslations } from "@/lib/i18n"
import { getBrowserORPCClient, runApiEffect } from "@/lib/orpc/client"
import { cn } from "@/lib/utils"

interface EmailPreviewSectionProps {
  branding: EmailBrandingDraft
  emailConfigured: boolean
}

export function EmailPreviewSection({
  branding,
  emailConfigured,
}: EmailPreviewSectionProps) {
  const t = useTranslations()
  const [selectedType, setSelectedType] =
    useState<EmailMessageType>("verifyEmail")
  const [previewOpen, setPreviewOpen] = useState(false)
  // Outlives previewOpen so the closing animation keeps showing the last
  // render instead of an emptied (white) iframe.
  const [preview, setPreview] = useState<{
    subject: string
    html: string
    messageType: EmailMessageType
  } | null>(null)
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [testRecipient, setTestRecipient] = useState("")
  const [isSendingTest, setIsSendingTest] = useState(false)

  async function handlePreview(): Promise<void> {
    setIsPreviewing(true)
    const client = getBrowserORPCClient()
    const result = await runApiEffect(
      client.admin.settings.previewEmail({
        messageType: selectedType,
        branding,
      }),
    )
    setIsPreviewing(false)

    if (result.error !== null || !result.data) {
      toast.error(t("settings.emailPreviewFailed"))
      return
    }

    setPreview({ ...result.data, messageType: selectedType })
    setPreviewOpen(true)
  }

  async function handleSendTest(): Promise<void> {
    setIsSendingTest(true)
    const client = getBrowserORPCClient()
    const result = await runApiEffect(
      client.admin.settings.sendTestEmail({
        messageType: selectedType,
        branding,
        recipient: testRecipient.trim(),
      }),
    )
    setIsSendingTest(false)

    if (result.error !== null) {
      toast.error(t("settings.emailTestFailed"))
      return
    }

    toast.success(t("settings.emailTestSent"))
  }

  return (
    <>
      <div>
        <h3 className="text-sm font-medium">
          {t("settings.emailPreviewTitle")}
        </h3>
        <p className="text-muted-foreground text-xs">
          {t("settings.emailPreviewDescription")}
        </p>
      </div>

      <Field>
        <FieldLabel htmlFor="emailMessageType">
          {t("settings.emailMessageType")}
        </FieldLabel>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select
            value={selectedType}
            onValueChange={(value) =>
              setSelectedType(value as EmailMessageType)
            }
          >
            <SelectTrigger id="emailMessageType" className="w-full sm:w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EMAIL_MESSAGE_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {t(`settings.emailMessageTypes.${type}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            disabled={isPreviewing}
            onClick={handlePreview}
            className="w-full sm:w-auto"
          >
            {isPreviewing && <Spinner size="sm" />}
            {t("settings.emailPreview")}
          </Button>
        </div>
      </Field>

      <Field>
        <FieldLabel htmlFor="emailTestRecipient">
          {t("settings.emailTestRecipient")}
        </FieldLabel>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="emailTestRecipient"
            type="email"
            placeholder={t("settings.emailTestRecipientPlaceholder")}
            value={testRecipient}
            onChange={(event) => setTestRecipient(event.target.value)}
            className="w-full sm:w-72"
          />
          <Button
            type="button"
            variant="outline"
            disabled={
              !emailConfigured || !testRecipient.trim() || isSendingTest
            }
            onClick={handleSendTest}
            className="w-full sm:w-auto"
          >
            {isSendingTest && <Spinner size="sm" />}
            {t("settings.emailTestSend")}
          </Button>
        </div>
        {!emailConfigured && (
          <p className="text-muted-foreground text-xs">
            {t("settings.emailTestRequiresSaved")}
          </p>
        )}
      </Field>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl sm:p-0">
          <DialogHeader className="border-b py-4 pr-14 pl-5">
            <DialogTitle className="truncate leading-normal">
              {preview?.subject}
            </DialogTitle>
            <DialogDescription>
              {preview &&
                t(`settings.emailMessageTypes.${preview.messageType}`)}
            </DialogDescription>
          </DialogHeader>
          {preview && (
            <EmailPreviewFrame
              html={preview.html}
              title={t("settings.emailPreview")}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

// Sized to the rendered email so the dialog scrolls instead of a nested
// iframe scrollbar. allow-same-origin (still without allow-scripts) lets the
// parent measure the document; pointer-events-none keeps the fake preview
// links from navigating the frame and keeps focus (and Escape) in the dialog.
function EmailPreviewFrame({ html, title }: { html: string; title: string }) {
  const [height, setHeight] = useState<number | null>(null)
  const observerRef = useRef<ResizeObserver | null>(null)

  useEffect(() => () => observerRef.current?.disconnect(), [])

  function handleLoad(event: SyntheticEvent<HTMLIFrameElement>): void {
    const root = event.currentTarget.contentDocument?.documentElement
    if (!root) {
      return
    }

    const measure = () =>
      setHeight(Math.ceil(root.getBoundingClientRect().height))
    measure()
    observerRef.current?.disconnect()
    observerRef.current = new ResizeObserver(measure)
    observerRef.current.observe(root)
  }

  return (
    <div
      tabIndex={0}
      className="focus-visible:outline-ring relative min-h-48 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)] focus-visible:outline-2 focus-visible:-outline-offset-2 sm:pb-0"
    >
      {height === null && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Spinner />
        </div>
      )}
      <iframe
        title={title}
        sandbox="allow-same-origin"
        srcDoc={html}
        tabIndex={-1}
        onLoad={handleLoad}
        style={{ height: height ?? 0 }}
        className={cn(
          "pointer-events-none block w-full border-0 transition-opacity duration-200 [color-scheme:light]",
          height === null ? "opacity-0" : "opacity-100",
        )}
      />
    </div>
  )
}

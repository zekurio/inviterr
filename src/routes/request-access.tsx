"use client"

import { standardSchemaResolver } from "@hookform/resolvers/standard-schema"
import { Link, createFileRoute } from "@tanstack/react-router"
import { useStore } from "@tanstack/react-store"
import { useForm } from "react-hook-form"

import { CenteredPageShell } from "@/components/layout/centered-page-shell"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { createAppStore } from "@/hooks/store-utils"
import { useScopedStore } from "@/hooks/use-scoped-store"
import { getApiErrorMessage } from "@/lib/api/error-message"
import { useTranslations } from "@/lib/i18n"
import { getBrowserORPCClient, runApiEffect } from "@/lib/orpc/client"
import { enforcePageAccessFn } from "@/lib/page-access-fns"
import {
  ACCESS_REQUEST_TEXT_MAX_LENGTH,
  accessRequestFormSchema,
  normalizeEmail,
  type AccessRequestFormValues,
} from "@/lib/schemas"
import { standardSchema } from "@/lib/validation"

interface RequestAccessPageStoreState {
  isSubmitted: boolean
  setIsSubmitted: (isSubmitted: boolean) => void
}

export const Route = createFileRoute("/request-access")({
  loader: async () => enforcePageAccessFn({ data: "login" }),
  component: RequestAccessPage,
})

function RequestAccessPage() {
  const { bootstrap } = Route.useLoaderData()
  const t = useTranslations()
  const store = useScopedStore(() =>
    createAppStore<RequestAccessPageStoreState>((set) => ({
      isSubmitted: false,
      setIsSubmitted: (isSubmitted) => set({ isSubmitted }),
    })),
  )
  const isSubmitted = useStore(store, (state) => state.isSubmitted)

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<AccessRequestFormValues>({
    resolver: standardSchemaResolver(standardSchema(accessRequestFormSchema)),
    defaultValues: {
      email: "",
      message: "",
    },
  })

  async function onSubmit(data: AccessRequestFormValues): Promise<void> {
    const result = await runApiEffect(
      getBrowserORPCClient().accessRequests.submit({
        email: normalizeEmail(data.email),
        message: data.message || undefined,
      }),
    )

    if (result.error !== null) {
      setError("root", {
        message: getApiErrorMessage(result.error, t, "errors.tryAgain"),
      })
      return
    }

    store.getState().setIsSubmitted(true)
  }

  if (!bootstrap.accessRequestsEnabled) {
    return (
      <RequestAccessNotice
        title={t("accessRequests.unavailableTitle")}
        description={t("accessRequests.unavailableDescription")}
      />
    )
  }

  if (isSubmitted) {
    return (
      <RequestAccessNotice
        title={t("accessRequests.submittedTitle")}
        description={t("accessRequests.submittedDescription")}
      />
    )
  }

  return (
    <CenteredPageShell>
      <Card className="w-full max-w-sm border-0 bg-transparent shadow-none">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-semibold tracking-tight">
            {t("accessRequests.pageTitle")}
          </CardTitle>
          <CardDescription>
            {t("accessRequests.pageDescription", {
              serverName: bootstrap.app?.title ?? "Inviterr",
            })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)}>
            <FieldGroup className="gap-4">
              <Field data-invalid={!!errors.email}>
                <FieldLabel htmlFor="email">
                  {t("accessRequests.emailLabel")}
                </FieldLabel>
                <Input
                  id="email"
                  type="email"
                  placeholder={t("accessRequests.emailPlaceholder")}
                  autoComplete="email"
                  aria-invalid={!!errors.email}
                  {...register("email", {
                    setValueAs: (value: string) => value.trim(),
                  })}
                />
                {errors.email && <FieldError errors={[errors.email]} />}
              </Field>

              <Field data-invalid={!!errors.message}>
                <FieldLabel htmlFor="message">
                  {t("accessRequests.messageLabel")}
                </FieldLabel>
                <Textarea
                  id="message"
                  placeholder={t("accessRequests.messagePlaceholder")}
                  maxLength={ACCESS_REQUEST_TEXT_MAX_LENGTH}
                  aria-invalid={!!errors.message}
                  {...register("message")}
                />
                {errors.message && <FieldError errors={[errors.message]} />}
              </Field>

              {errors.root && <FieldError errors={[errors.root]} />}

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting
                  ? t("accessRequests.submitting")
                  : t("accessRequests.submit")}
              </Button>

              <Link
                to="/login"
                className="text-muted-foreground hover:text-foreground block text-center text-sm"
              >
                {t("auth.backToSignIn")}
              </Link>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </CenteredPageShell>
  )
}

function RequestAccessNotice({
  title,
  description,
}: {
  title: string
  description: string
}) {
  const t = useTranslations()

  return (
    <CenteredPageShell>
      <Card className="w-full max-w-sm border-0 bg-transparent shadow-none">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-semibold tracking-tight">
            {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" className="w-full">
            <Link to="/login">{t("auth.backToSignIn")}</Link>
          </Button>
        </CardContent>
      </Card>
    </CenteredPageShell>
  )
}

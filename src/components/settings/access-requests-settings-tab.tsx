"use client"

import { useStore } from "@tanstack/react-store"
import { toast } from "sonner"

import { FormShell } from "@/components/shared/form-shell"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createAppStore } from "@/hooks/store-utils"
import { useDashboardSettingsTabDirty } from "@/hooks/use-dashboard-settings-dirty"
import { useScopedStore } from "@/hooks/use-scoped-store"
import type { AccessRequestsSettingsDto } from "@/lib/api/contracts/admin"
import { getApiErrorMessage } from "@/lib/api/error-message"
import { useTranslations } from "@/lib/i18n"
import { getBrowserORPCClient, runApiEffect } from "@/lib/orpc/client"

// Radix Select cannot hold an empty value, so "no explicit profile" gets a
// sentinel that maps back to null on save.
const DEFAULT_PROFILE_VALUE = "default"

interface AccessRequestsFormValues {
  enabled: boolean
  profileId: string
}

interface AccessRequestsSettingsStoreState {
  settings: AccessRequestsSettingsDto
  values: AccessRequestsFormValues
  isSaving: boolean
  setSettings: (settings: AccessRequestsSettingsDto) => void
  setValues: (values: Partial<AccessRequestsFormValues>) => void
  setIsSaving: (isSaving: boolean) => void
}

function toFormValues(
  settings: AccessRequestsSettingsDto,
): AccessRequestsFormValues {
  // A deleted profile falls back to the default one on approval, so show it
  // that way instead of an empty select.
  const hasProfile = settings.profiles.some(
    (profile) => profile.id === settings.profileId,
  )
  return {
    enabled: settings.enabled,
    profileId:
      hasProfile && settings.profileId
        ? settings.profileId
        : DEFAULT_PROFILE_VALUE,
  }
}

export function AccessRequestsSettingsTab({
  initialConfig,
}: {
  initialConfig: AccessRequestsSettingsDto
}) {
  const t = useTranslations()
  const store = useScopedStore(() =>
    createAppStore<AccessRequestsSettingsStoreState>((set) => ({
      settings: initialConfig,
      values: toFormValues(initialConfig),
      isSaving: false,
      setSettings: (settings) =>
        set({ settings, values: toFormValues(settings) }),
      setValues: (values) =>
        set((state) => ({ values: { ...state.values, ...values } })),
      setIsSaving: (isSaving) => set({ isSaving }),
    })),
  )
  const settings = useStore(store, (state) => state.settings)
  const values = useStore(store, (state) => state.values)
  const isSaving = useStore(store, (state) => state.isSaving)
  const savedValues = toFormValues(settings)
  const isDirty =
    values.enabled !== savedValues.enabled ||
    values.profileId !== savedValues.profileId
  const defaultProfile = settings.profiles.find((profile) => profile.isDefault)

  useDashboardSettingsTabDirty("accessRequests", isDirty)

  async function handleSave(): Promise<void> {
    store.getState().setIsSaving(true)
    const result = await runApiEffect(
      getBrowserORPCClient().admin.settings.updateAccessRequests({
        enabled: values.enabled,
        profileId:
          values.profileId === DEFAULT_PROFILE_VALUE ? null : values.profileId,
      }),
    )
    store.getState().setIsSaving(false)

    if (result.error !== null || !result.data) {
      toast.error(getApiErrorMessage(result.error, t, "settings.savedError"))
      return
    }

    store.getState().setSettings(result.data)
    toast.success(t("settings.savedSuccess"))
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void handleSave()
      }}
    >
      <FormShell
        title={t("settings.accessRequestsTitle")}
        description={t("settings.accessRequestsDescription")}
        actions={
          <>
            <Button
              type="submit"
              disabled={!isDirty || isSaving}
              className="w-full sm:w-auto"
            >
              {isSaving ? t("common.saving") : t("common.save")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={!isDirty || isSaving}
              onClick={() => store.getState().setValues(savedValues)}
              className="w-full sm:w-auto"
            >
              {t("common.reset")}
            </Button>
          </>
        }
      >
        <FieldGroup>
          {!settings.deliveryReady && (
            <p className="text-muted-foreground rounded-md border border-dashed p-3 text-sm">
              {t("settings.accessRequestsEmailRequired")}
            </p>
          )}

          <Field orientation="horizontal">
            <Checkbox
              id="access-requests-enabled"
              checked={values.enabled}
              // Turning the feature off stays possible after SMTP is removed.
              disabled={
                isSaving || (!settings.deliveryReady && !values.enabled)
              }
              onCheckedChange={(checked) =>
                store.getState().setValues({ enabled: checked === true })
              }
            />
            <div className="grid gap-0.5">
              <FieldLabel
                htmlFor="access-requests-enabled"
                className="cursor-pointer font-normal"
              >
                {t("settings.accessRequestsEnabled")}
              </FieldLabel>
              <p className="text-muted-foreground text-xs">
                {t("settings.accessRequestsEnabledDescription")}
              </p>
            </div>
          </Field>

          <Field>
            <FieldLabel htmlFor="access-requests-profile">
              {t("settings.accessRequestsProfile")}
            </FieldLabel>
            <Select
              value={values.profileId}
              onValueChange={(profileId) =>
                store.getState().setValues({ profileId })
              }
              disabled={isSaving}
            >
              <SelectTrigger
                id="access-requests-profile"
                className="w-full max-w-xs"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={DEFAULT_PROFILE_VALUE}>
                  {defaultProfile
                    ? `${t("settings.accessRequestsDefaultProfile")} (${defaultProfile.name})`
                    : t("settings.accessRequestsDefaultProfile")}
                </SelectItem>
                {settings.profiles.map((profile) => (
                  <SelectItem key={profile.id} value={profile.id}>
                    {profile.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>
              {t("settings.accessRequestsProfileDescription")}
            </FieldDescription>
          </Field>
        </FieldGroup>
      </FormShell>
    </form>
  )
}

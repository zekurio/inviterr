import { Heading, Text } from "@react-email/components"

import { createTranslator } from "@/lib/i18n"
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales"
import {
  EmailLayout,
  type EmailThemeProps,
} from "@/server/email/templates/layout"
import { createEmailTemplateStyles } from "@/server/email/templates/styles"

interface AccessRequestDeniedEmailProps extends EmailThemeProps {
  reason: string | null
  locale?: Locale
}

export function AccessRequestDeniedEmailTemplate({
  reason,
  locale,
  ...themeProps
}: AccessRequestDeniedEmailProps) {
  const t = createTranslator(locale ?? DEFAULT_LOCALE)
  const styles = createEmailTemplateStyles(themeProps.theme)

  return (
    <EmailLayout
      preview={t("emailTemplates.accessRequestDenied.preview", {
        serverName: themeProps.serverName,
      })}
      locale={locale}
      {...themeProps}
    >
      <Heading style={styles.heading}>
        {t("emailTemplates.accessRequestDenied.heading")}
      </Heading>

      <Text style={styles.paragraph}>
        {t("emailTemplates.accessRequestDenied.intro", {
          serverName: themeProps.serverName,
        })}
      </Text>

      {reason ? (
        <Text style={styles.paragraph}>
          {t("emailTemplates.accessRequestDenied.reason", { reason })}
        </Text>
      ) : null}

      <Text style={styles.muted}>
        {t("emailTemplates.accessRequestDenied.footer")}
      </Text>
    </EmailLayout>
  )
}

export function getAccessRequestDeniedEmailSubject(input: {
  serverName?: string
  locale?: Locale
}): string {
  const t = createTranslator(input.locale ?? DEFAULT_LOCALE)
  return t("emailTemplates.accessRequestDenied.subject", {
    serverName: input.serverName ?? "Inviterr",
  })
}

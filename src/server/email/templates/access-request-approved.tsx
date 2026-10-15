import { Button, Heading, Section, Text } from "@react-email/components"

import { createTranslator } from "@/lib/i18n"
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales"
import {
  EmailLayout,
  type EmailThemeProps,
} from "@/server/email/templates/layout"
import { createEmailTemplateStyles } from "@/server/email/templates/styles"

interface AccessRequestApprovedEmailProps extends EmailThemeProps {
  inviteUrl: string
  expiryDate: string
  locale?: Locale
}

export function AccessRequestApprovedEmailTemplate({
  inviteUrl,
  expiryDate,
  locale,
  ...themeProps
}: AccessRequestApprovedEmailProps) {
  const t = createTranslator(locale ?? DEFAULT_LOCALE)
  const styles = createEmailTemplateStyles(themeProps.theme)

  return (
    <EmailLayout
      preview={t("emailTemplates.accessRequestApproved.preview", {
        serverName: themeProps.serverName,
      })}
      locale={locale}
      {...themeProps}
    >
      <Heading style={styles.heading}>
        {t("emailTemplates.accessRequestApproved.heading")}
      </Heading>

      <Text style={styles.paragraph}>
        {t("emailTemplates.accessRequestApproved.intro", {
          serverName: themeProps.serverName,
        })}
      </Text>

      <Section style={styles.buttonSection}>
        <Button style={styles.button} href={inviteUrl}>
          {t("emailTemplates.accessRequestApproved.action")}
        </Button>
      </Section>

      <Text style={styles.centeredMuted}>
        {t("emailTemplates.accessRequestApproved.expiry", { expiryDate })}
      </Text>

      <Text style={styles.muted}>
        {t("emailTemplates.accessRequestApproved.footer", {
          serverName: themeProps.serverName,
        })}
      </Text>
    </EmailLayout>
  )
}

export function getAccessRequestApprovedEmailSubject(input: {
  serverName?: string
  locale?: Locale
}): string {
  const t = createTranslator(input.locale ?? DEFAULT_LOCALE)
  return t("emailTemplates.accessRequestApproved.subject", {
    serverName: input.serverName ?? "Inviterr",
  })
}

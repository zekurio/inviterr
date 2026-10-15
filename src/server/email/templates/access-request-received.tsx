import { Button, Heading, Section, Text } from "@react-email/components"

import { createTranslator } from "@/lib/i18n"
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales"
import {
  EmailLayout,
  type EmailThemeProps,
} from "@/server/email/templates/layout"
import { createEmailTemplateStyles } from "@/server/email/templates/styles"

interface AccessRequestReceivedEmailProps extends EmailThemeProps {
  applicantEmail: string
  reviewUrl: string
  locale?: Locale
}

// The applicant's free-text message is deliberately left out: it is
// unauthenticated input, so admins read it in the dashboard instead of in a
// mail sent from the server's own address.
export function AccessRequestReceivedEmailTemplate({
  applicantEmail,
  reviewUrl,
  locale,
  ...themeProps
}: AccessRequestReceivedEmailProps) {
  const t = createTranslator(locale ?? DEFAULT_LOCALE)
  const styles = createEmailTemplateStyles(themeProps.theme)

  return (
    <EmailLayout
      preview={t("emailTemplates.accessRequestReceived.preview", {
        serverName: themeProps.serverName,
      })}
      locale={locale}
      {...themeProps}
    >
      <Heading style={styles.heading}>
        {t("emailTemplates.accessRequestReceived.heading")}
      </Heading>

      <Text style={styles.paragraph}>
        {t("emailTemplates.accessRequestReceived.intro", {
          serverName: themeProps.serverName,
        })}
      </Text>

      <Text style={styles.highlight}>{applicantEmail}</Text>

      <Section style={styles.buttonSection}>
        <Button style={styles.button} href={reviewUrl}>
          {t("emailTemplates.accessRequestReceived.action")}
        </Button>
      </Section>

      <Text style={styles.muted}>
        {t("emailTemplates.accessRequestReceived.footer")}
      </Text>
    </EmailLayout>
  )
}

export function getAccessRequestReceivedEmailSubject(input: {
  serverName?: string
  locale?: Locale
}): string {
  const t = createTranslator(input.locale ?? DEFAULT_LOCALE)
  return t("emailTemplates.accessRequestReceived.subject", {
    serverName: input.serverName ?? "Inviterr",
  })
}

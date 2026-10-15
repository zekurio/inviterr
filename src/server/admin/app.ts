import type { AppSettingsDto } from "@/lib/api/contracts/admin"
import {
  ErrorCode,
  error,
  success,
  type ActionResult,
} from "@/lib/api/contracts/errors"
import type { AuditActor } from "@/lib/audit"
import { configManager, type AppConfig } from "@/lib/server/config.server"
import type { UpdateAppSettingsInput } from "@/server/api/schemas/common-schemas"
import { diffAuditFields, recordAuditChange } from "@/server/audit"
import { createChildLogger } from "@/server/logger"

const log = createChildLogger({ module: "admin-app" })

export function projectAppSettingsDto(
  appConfig: AppConfig = configManager.app,
): AppSettingsDto {
  return {
    title: appConfig.title,
    description: appConfig.description,
    defaultLocale: appConfig.defaultLocale,
    url: appConfig.url,
  }
}

export async function updateAppSettingsService(
  actor: AuditActor,
  data: UpdateAppSettingsInput,
): Promise<ActionResult<AppSettingsDto>> {
  try {
    if (!configManager.isConfigured()) {
      return error(ErrorCode.CONFIG_NOT_INITIALIZED)
    }

    const updates: Partial<AppConfig> = {}

    if (data.title !== undefined) {
      updates.title = data.title
    }
    if (data.description !== undefined) {
      updates.description = data.description
    }
    if (data.defaultLocale !== undefined) {
      updates.defaultLocale = data.defaultLocale
    }
    if (Object.hasOwn(data, "url")) {
      updates.url = data.url ?? undefined
    }

    const previous = projectAppSettingsDto()
    await configManager.setApp(updates)
    const next = projectAppSettingsDto()

    await recordAuditChange(actor, {
      action: "settings.updated",
      target: { id: "app" },
      details: diffAuditFields(previous, next),
    })

    return success(next)
  } catch (err) {
    log.error({ err }, "Failed to update app settings")
    return error(ErrorCode.OPERATION_FAILED, "Failed to update app settings")
  }
}

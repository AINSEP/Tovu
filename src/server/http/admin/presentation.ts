import type { PresentationSettingsRecord } from "../../../features/presentation";
import type { AdminPresentation } from "../../../headless";

export function toAdminPresentationResponse(
  settings: PresentationSettingsRecord,
  availableThemeIds: string[]
): AdminPresentation {
  return {
    settings: {
      workspaceId: settings.workspaceId,
      activeThemeId: settings.activeThemeId,
      updatedAt: settings.updatedAt,
    },
    availableThemeIds,
  };
}

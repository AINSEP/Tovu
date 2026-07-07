import type { PresentationSettingsRecord, ThemeId } from "../../../features/presentation";
import type { AdminPresentation } from "../../../headless";

export function toAdminPresentationResponse(
  settings: PresentationSettingsRecord,
  availableThemeIds: ThemeId[]
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

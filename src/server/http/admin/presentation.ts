import type { PresentationSettingsRecord } from "../../../features/presentation";
import type { AdminPresentation } from "../../../headless";

export function toAdminPresentationResponse(required: {
  settings: PresentationSettingsRecord;
  availableThemeIds: string[];
}): AdminPresentation {
  const { settings, availableThemeIds } = required;
  return {
    settings: {
      workspaceId: settings.workspaceId,
      activeThemeId: settings.activeThemeId,
      updatedAt: settings.updatedAt,
    },
    availableThemeIds,
  };
}

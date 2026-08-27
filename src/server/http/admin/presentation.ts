import type { PresentationSettingsRecord } from "#src/features/presentation/index";
import type { AdminPresentation, HeadlessThemeSummary } from "#src/contracts/headless/index";

export function toAdminPresentationResponse(required: {
  settings: PresentationSettingsRecord;
  availableThemeIds: string[];
  availableThemes: HeadlessThemeSummary[];
  activeThemeTemplates: string[];
  activeThemeStaticPageIds: string[];
}): AdminPresentation {
  const { settings, availableThemeIds, availableThemes, activeThemeTemplates, activeThemeStaticPageIds } = required;
  return {
    settings: {
      workspaceId: settings.workspaceId,
      activeThemeId: settings.activeThemeId,
      updatedAt: settings.updatedAt,
    },
    availableThemeIds,
    availableThemes,
    activeThemeTemplates,
    activeThemeStaticPageIds,
  };
}

import type { PresentationSettingsRecord } from "#src/features/presentation/index";
import type { AdminPresentation, HeadlessThemeSummary } from "#src/headless/index";

export function toAdminPresentationResponse(required: {
  settings: PresentationSettingsRecord;
  availableThemeIds: string[];
  availableThemes: HeadlessThemeSummary[];
  activeThemePostTemplates: string[];
  activeThemePageTemplates: string[];
  activeThemeStaticPageIds: string[];
}): AdminPresentation {
  const {
    settings,
    availableThemeIds,
    availableThemes,
    activeThemePostTemplates,
    activeThemePageTemplates,
    activeThemeStaticPageIds,
  } = required;
  return {
    settings: {
      workspaceId: settings.workspaceId,
      activeThemeId: settings.activeThemeId,
      updatedAt: settings.updatedAt,
    },
    availableThemeIds,
    availableThemes,
    activeThemePostTemplates,
    activeThemePageTemplates,
    activeThemeStaticPageIds,
  };
}

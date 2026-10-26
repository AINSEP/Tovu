import { setActiveTheme as setPackageActiveTheme, type SetActiveThemeRequired as PackageRequired, type PresentationOptional } from "@jini-ai/cms/presentation";
import type { Tracker } from "@jini-ai/diagnostics/observability";

/** CMS telemetry adapter around the shared theme write owner; no theme discovery or policy lives here. */
export interface SetActiveThemeRequired extends Omit<PackageRequired, "deps"> {
  deps: PackageRequired["deps"] & { tracker?: Tracker };
}

/** Capture a successful actual active-theme change, including assistant callers. Same-value retries
 * retain the shared service response and emit nothing. @complexity O(1), one indexed pre-read. */
export async function setActiveTheme(
  required: SetActiveThemeRequired,
  optional: PresentationOptional & { actorId?: string; source?: "admin" | "assistant" | "service"; capture?: boolean } = {},
) {
  const previous = await required.deps.repo.findByWorkspaceId({ workspaceId: required.input.workspaceId });
  const result = await setPackageActiveTheme(required, optional);
  if (previous?.activeThemeId === result.settings.activeThemeId || optional.capture === false) return result;
  try { required.deps.tracker?.capture({ name: "theme_changed", userId: optional.actorId ?? `system:${required.input.workspaceId}` }, { properties: {
    themeId: result.settings.activeThemeId, source: optional.source ?? "service",
  } }); } catch { /* Analytics cannot undo the committed theme choice. */ }
  return result;
}

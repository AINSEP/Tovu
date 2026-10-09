import { ToolInputError } from "@jini-ai/core";
import type { Clock } from "@jini-ai/core/primitives";

import { setActiveTheme, type PresentationSettingsRepoPort } from "#src/features/presentation/index";

import { NO_THEME_ID } from "./active-theme.js";
import { requestThemePreviewRefresh } from "./preview-refresh.js";
import { findStoredTheme, type DiscoveredTheme } from "./theme.js";
import { syncThemeRoster } from "./theme-roster-sync.js";

/**
 * @file The "did the switch actually take" check behind `theme_set_active` (and `theme_duplicate`'s
 * `activate: true`, which switches through the same `applyActiveTheme`).
 *
 * Why (2026-10-08, luvira): the tool reported success for a theme the web server could not resolve,
 * so the live site quietly rendered the default theme while the assistant believed its work was
 * done. Saving the id proves only that the id is stored. What the owner sees is what the public
 * render of `/` resolves the stored id to — `resolveActiveTheme`, whose step 1 is "the configured
 * theme, when discovered and valid", against a roster the serving process re-reads from the folder
 * (`syncThemeRoster`) on its next request. This check re-reads the folder the same way and applies
 * the same step-1 rule, so "verified" here means the serving process will resolve it too.
 *
 * On a miss the previous theme is restored before the error is thrown: leaving the setting on an id
 * that renders as a fallback is the exact silent state this exists to end, and the agent's remedy (fix
 * the theme, or pick another id) does not need the broken setting in place.
 */

export interface ActiveThemeVerificationDeps {
  themes: DiscoveredTheme[];
  themesDir: string;
  presentationRepo: PresentationSettingsRepoPort;
  clock: Clock;
  workspaceId: string;
}

/**
 * Confirm the site's next render resolves `activeThemeId` itself (no fallback); otherwise restore
 * `previousThemeId` and throw.
 * @throws {ToolInputError} When the stored id would not resolve. A `ToolInputError` so the message
 *   reaches the model rather than the redacted internal-error path.
 * @complexity One roster sync (O(1) unchanged, a full rescan when the folder changed — and the caller
 *   has just bumped the marker, so normally a rescan) plus O(t) to find the theme.
 */
export async function verifyActiveThemeResolves(
  required: { deps: ActiveThemeVerificationDeps; activeThemeId: string; previousThemeId: string },
  _optional: Record<string, never> = {}
): Promise<void> {
  const { deps, activeThemeId, previousThemeId } = required;
  if (activeThemeId === NO_THEME_ID) return;
  syncThemeRoster({ themes: deps.themes, themesDir: deps.themesDir });
  const theme = findStoredTheme({ themes: deps.themes, id: activeThemeId });
  if (theme?.status === "valid") return;

  await setActiveTheme({
    deps: { repo: deps.presentationRepo, clock: deps.clock, availableThemeIds: [previousThemeId] },
    input: { workspaceId: deps.workspaceId, activeThemeId: previousThemeId },
  });
  requestThemePreviewRefresh({ themesDir: deps.themesDir });

  const why = theme
    ? `it fails validation: ${theme.errors.join("; ") || "no detail recorded"}`
    : "its folder is no longer in the site's themes";
  throw new ToolInputError({
    message:
      `theme '${activeThemeId}' was not activated: the public render of / would not resolve it (${why}), so the ` +
      `site would fall back to the default theme. The previous theme '${previousThemeId}' was restored. Fix ` +
      `the theme (theme_read_file / theme_write_file) and activate it again.`,
  });
}

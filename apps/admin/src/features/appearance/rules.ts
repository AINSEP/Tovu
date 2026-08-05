import type { PresentationSettings } from "../../lib/api";

/**
 * @file Pure logic for the `appearance` feature — everything that computes a value rather than
 * rendering one. See `features/posts/rules.ts`'s file header for the standing convention this
 * follows.
 */

/**
 * Whether `themeId` is the site's currently active theme — the status derivation that drives both
 * a theme card's `.active` class and whether it renders the "Active" tag or the Activate button.
 *
 * @complexity Time/space: O(1).
 */
export function isActiveTheme(settings: PresentationSettings, themeId: string): boolean {
  return settings.activeThemeId === themeId;
}

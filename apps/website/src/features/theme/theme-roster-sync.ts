import { statSync } from "node:fs";
import { join } from "node:path";

import { readThemePreviewRefresh } from "./preview-refresh.js";
import { ENGINE_SUBFOLDERS, rescanThemes, type DiscoveredTheme } from "./theme.js";

/**
 * @file Keeps one process's discovered-theme roster in step with the site's themes folder when a
 * DIFFERENT process changed that folder.
 *
 * Why it exists (2026-10-08, luvira): the roster is discovered once at boot, and every in-app theme
 * writer (`theme_duplicate`, `theme_write_file`, `theme_trash`, the admin routes, …) updates only its
 * OWN process's copy. The agent daemon and the web server are two processes with two rosters. The
 * assistant duplicated a theme and activated it from the daemon; the web server never learned the
 * new id, so every public request logged "did not resolve; falling back", the site rendered on the
 * default theme, and the admin Themes page called the active theme "no longer available". Every
 * writer already bumped `.preview-refresh.json`, but the web server's only reader of that marker
 * (`theme-preview-refresh.ts`) re-loaded the themes it ALREADY had — a new folder was never
 * discovered, and a trashed one never dropped.
 *
 * The fingerprint is two signals, because each covers what the other cannot:
 * - the marker revision — every in-app theme write bumps it, in whichever process, including file
 *   edits inside a theme (which change no folder listing);
 * - the mtime of the themes root and of each engine subfolder — a theme folder created, renamed or
 *   removed by ANYTHING (a CLI, a git pull, a copy made by hand) changes its parent's mtime, so the
 *   roster stays right even for writers that never heard of the marker.
 *
 * Roster arrays are keyed by identity: every process holds one site roster, shared by reference by
 * every consumer (`RouteDeps.themes`, the theme tools' deps, the Trash adapter), and
 * {@link rescanThemes} replaces its CONTENTS, never the array — so a sync made through any one
 * consumer is seen by all of them.
 */

/** Last fingerprint each roster was synced at. Weak, so a throwaway test roster is collectable. */
const syncedFingerprints = new WeakMap<DiscoveredTheme[], string>();

/**
 * What the themes folder looks like right now, as a comparable string: the marker revision plus the
 * mtimes of the root and each engine subfolder (`null` for one that does not exist).
 * @complexity O(1) — one small file read and five `stat` calls.
 */
export function themeRosterFingerprint(
  required: { themesDir: string },
  _optional: Record<string, never> = {}
): string {
  const { themesDir } = required;
  const mtimeOf = (sub: string | null): number | null => {
    try {
      return statSync(sub === null ? themesDir : join(themesDir, sub)).mtimeMs;
    } catch {
      return null;
    }
  };
  const revision = readThemePreviewRefresh({ themesDir })?.revision ?? null;
  return JSON.stringify([revision, mtimeOf(null), ...ENGINE_SUBFOLDERS.map(mtimeOf)]);
}

/**
 * Rescan `themes` from `themesDir` when the folder changed since this roster was last synced.
 *
 * The FIRST call for a roster adopts it as current without rescanning: production calls this right
 * after boot discovery (`deps.ts`/`app.ts`), where that is exactly true, and a test that builds a
 * roster by hand (themes that exist on no disk) must not have it replaced by an empty discovery on its
 * first request.
 *
 * The fingerprint is read BEFORE the rescan, so a change landing mid-rescan is picked up by the next
 * call rather than recorded as already seen.
 *
 * @returns `true` when it rescanned.
 * @complexity O(1) when unchanged (see {@link themeRosterFingerprint}); a full
 * {@link rescanThemes} — O(t log t + b) in theme count and theme bytes — when changed.
 */
export function syncThemeRoster(
  required: { themes: DiscoveredTheme[]; themesDir: string },
  _optional: Record<string, never> = {}
): boolean {
  const { themes, themesDir } = required;
  const current = themeRosterFingerprint({ themesDir });
  const previous = syncedFingerprints.get(themes);
  if (previous === current) return false;
  if (previous !== undefined) rescanThemes({ themes, dir: themesDir });
  // Recorded only after a rescan that did not throw, so a failed one is retried on the next call.
  syncedFingerprints.set(themes, current);
  return previous !== undefined;
}

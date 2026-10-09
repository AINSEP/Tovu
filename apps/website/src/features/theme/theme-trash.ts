import { existsSync } from "node:fs";
import type { rename } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";

import type { TrashAdapter } from "@jini-ai/cms/trash";

import { createDirectoryTrashAdapter, THEME_ENTITY_TYPE, type DirectoryTrashLocation } from "#src/features/trash/index";

import { requestThemePreviewRefresh } from "./preview-refresh.js";
import { ENGINE_SUBFOLDERS, findTheme, rescanThemes, type DiscoveredTheme } from "./theme.js";

/**
 * @file Where a whole theme folder goes when it is moved to the Trash, and the Trash adapter built on
 * it (2026-10-08, owner: the agent could not delete a theme at all).
 *
 * A theme is a folder, so it reuses the generic directory adapter `plugin` already uses
 * (`features/trash/adapters/directory.ts`): one atomic rename out of the site's `themes/` into a
 * sibling `themes-trash/`, one rename back on restore, and bytes removed only by the Trash's own
 * human-confirmed purge. Nothing here deletes anything.
 *
 * The parking path keeps the engine subfolder (`static/`, `templated/`, ...) the theme was discovered
 * under — `<themes>-trash/static/nordic/nordic` — because once the folder has left `themes/`, discovery
 * no longer knows where it came from, and restore must put it back in the same place.
 *
 * `__original-themes__/` (the "reset to original" copies) is never touched: it is excluded from
 * discovery, so no discovered theme's folder can resolve into it.
 */

/** Raised when a theme id cannot be addressed as a folder of the site's own themes directory. */
export class ThemeTrashLocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ThemeTrashLocationError";
  }
}

/** The sibling directory trashed themes are parked in — outside `themes/`, so discovery never sees them. */
export function themeTrashRoot(required: { themesDir: string }): string {
  return `${resolve(required.themesDir)}-trash`;
}

function assertThemeIdSegment(themeId: string): void {
  if (themeId === "" || themeId === "." || themeId === ".." || basename(themeId) !== themeId || themeId.includes("\\")) {
    throw new ThemeTrashLocationError(`'${themeId}' is not a theme folder name`);
  }
}

/**
 * Resolves one theme id to the directory adapter's three paths.
 *
 * A theme already parked wins over a live one with the same id: hiding again then reports
 * `ALREADY_IN_TRASH`, and restoring while any live theme claims the id reports a conflict
 * (`version-changed`) instead of creating a second folder with that id.
 *
 * @throws {ThemeTrashLocationError} When the id is not one path segment, or the live theme's folder is
 *   not directly under `themesDir` or one of its {@link ENGINE_SUBFOLDERS} (e.g. a package stock theme).
 * @complexity O(t) in the discovered theme count, plus at most five `existsSync` probes.
 */
export function locateThemeFolder(required: { themes: readonly DiscoveredTheme[]; themesDir: string; themeId: string }): DirectoryTrashLocation {
  const { themes, themeId } = required;
  assertThemeIdSegment(themeId);
  const root = resolve(required.themesDir);
  const trashRoot = themeTrashRoot({ themesDir: root });
  const live = findTheme({ themes: [...themes], id: themeId });

  for (const sub of ["", ...ENGINE_SUBFOLDERS]) {
    const parkedDir = join(trashRoot, sub, themeId);
    if (existsSync(parkedDir)) return { liveParent: join(root, sub), liveNames: live ? [themeId] : [], parkedDir };
  }

  if (!live) return { liveParent: root, liveNames: [], parkedDir: join(trashRoot, themeId) };
  const liveDir = resolve(live.dir);
  const sub = relative(root, dirname(liveDir));
  if (basename(liveDir) !== themeId || !(sub === "" || (ENGINE_SUBFOLDERS as readonly string[]).includes(sub))) {
    throw new ThemeTrashLocationError(`theme '${themeId}' is not a folder of this site's themes directory, so it cannot be moved to the Trash`);
  }
  return { liveParent: dirname(liveDir), liveNames: [themeId], parkedDir: join(trashRoot, sub, themeId) };
}

/**
 * The `theme` Trash adapter: the directory adapter over {@link locateThemeFolder}, plus a rescan of the
 * live theme registry (and a preview refresh) after every move, so a trashed theme disappears from
 * `theme_list` at once and a restored one comes back — whichever surface did the restore.
 *
 * @param required.themes the live, mutable registry `RouteDeps.themes` holds; rescanned in place.
 * @param optional.rename test seam forwarded to the directory adapter.
 * @complexity O(1) to build; each move costs one rename plus one theme rediscovery.
 */
export function createThemeTrashAdapter(
  required: { themes: DiscoveredTheme[]; themesDir: string },
  optional: { readonly rename?: typeof rename } = {}
): TrashAdapter {
  const { themes, themesDir } = required;
  const refresh = async (): Promise<void> => {
    rescanThemes({ themes, dir: themesDir });
    requestThemePreviewRefresh({ themesDir });
  };
  const adapter = createDirectoryTrashAdapter(
    { entityType: THEME_ENTITY_TYPE, locate: ({ entityId }) => locateThemeFolder({ themes, themesDir, themeId: entityId }) },
    optional
  );
  // Not `withFollowUps`: its `afterUnhide` fires only with a stored `priorMarker`, which a directory
  // move never has, so a restore would leave the registry stale.
  return {
    entityType: adapter.entityType,
    async hide(hideRequired, hideOptional) {
      const result = await adapter.hide(hideRequired, hideOptional);
      if (result.ok) await refresh();
      return result;
    },
    async unhide(unhideRequired, unhideOptional) {
      const result = await adapter.unhide(unhideRequired, unhideOptional);
      if (result.ok) await refresh();
      return result;
    },
    purge: (purgeRequired, purgeOptional) => adapter.purge(purgeRequired, purgeOptional),
  };
}

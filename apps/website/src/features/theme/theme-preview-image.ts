import nodeFs, { type Dirent, existsSync } from "node:fs";
import { join } from "node:path";
import { isGeneratedThemePath, MAX_LISTED_FILES, MAX_WALK_DEPTH } from "./theme-files.js";

/** D-22: advertise an existing thumbnail instead of making each browser probe jpg then png. */
export function themePreviewImage(
  { dir, id }: { dir: string; id: string },
  { assetsServed = true }: { assetsServed?: boolean } = {},
): string | null {
  // Public asset middleware mounts static and templated roots; a file in another tier is not a URL.
  if (!assetsServed) return null;
  for (const extension of ["jpg", "png"]) {
    if (existsSync(join(dir, "screenshots", `index.${extension}`))) {
      return `/theme-assets/${encodeURIComponent(id)}/screenshots/index.${extension}`;
    }
  }
  return null;
}

/**
 * When a theme's own files last changed: the newest mtime (ms) across its folder tree, folders
 * included so a deleted file counts too. A capture older than this no longer shows the theme.
 *
 * `screenshots/` and generated output ({@link isGeneratedThemePath}) do not count: neither changes
 * how the theme renders, and a screenshot is exactly what a copied theme inherits from its source
 * (the Editorial Rose cards showed the Tovu Starter's picture because a copy carried it verbatim).
 * A copy, an import or a new theme gets fresh mtimes when its files are written, so it reads as
 * newer than any capture under its id.
 *
 * Unreadable or missing folder: `0`, so any existing capture still counts as current.
 * @complexity O(f) stat calls for f entries, bounded by MAX_LISTED_FILES and MAX_WALK_DEPTH.
 */
export function themeContentVersion(
  { dir }: { dir: string },
  { fs = nodeFs }: { fs?: ContentWalkFs } = {},
): number {
  const walk: ContentWalk = { fs, newest: 0, visited: 0 };
  try {
    walkThemeContent({ walk, absolute: dir, relative: "", depth: 0 });
  } catch {
    // A folder missing or removed mid-walk: report what was seen; `0` keeps any capture current.
  }
  return walk.newest;
}

/** The `node:fs` surface {@link themeContentVersion} reads through (a port, for tests). */
type ContentWalkFs = Pick<typeof nodeFs, "statSync" | "readdirSync">;

/** Running state of one {@link themeContentVersion} walk: the newest mtime so far and entries seen. */
interface ContentWalk {
  fs: ContentWalkFs;
  newest: number;
  visited: number;
}

/**
 * Fold one folder's mtime into the walk, then its entries (stopping past {@link MAX_LISTED_FILES}
 * entries in total) unless the folder sits at {@link MAX_WALK_DEPTH}.
 * @throws Whatever `fs` throws; {@link themeContentVersion} absorbs it.
 * @complexity O(e) in the folder's entry count, plus the recursion.
 */
function walkThemeContent(required: { walk: ContentWalk; absolute: string; relative: string; depth: number }): void {
  const { walk, absolute, depth } = required;
  walk.newest = Math.max(walk.newest, walk.fs.statSync(absolute).mtimeMs);
  if (depth >= MAX_WALK_DEPTH) return;
  for (const entry of walk.fs.readdirSync(absolute, { withFileTypes: true })) {
    walk.visited += 1;
    if (walk.visited > MAX_LISTED_FILES) return;
    visitThemeContentEntry({ ...required, entry });
  }
}

/**
 * One entry of a {@link walkThemeContent} folder: skip `screenshots/` and generated output, recurse
 * into a folder, fold in a regular file's mtime, ignore anything else.
 * @complexity O(1) plus the recursion for a folder.
 */
function visitThemeContentEntry(required: {
  walk: ContentWalk;
  absolute: string;
  relative: string;
  depth: number;
  entry: Dirent;
}): void {
  const { walk, absolute, relative, depth, entry } = required;
  const child = relative ? `${relative}/${entry.name}` : entry.name;
  if (child === "screenshots" || isGeneratedThemePath(child)) return;
  if (entry.isDirectory()) {
    walkThemeContent({ walk, absolute: join(absolute, entry.name), relative: child, depth: depth + 1 });
    return;
  }
  if (entry.isFile()) walk.newest = Math.max(walk.newest, walk.fs.statSync(join(absolute, entry.name)).mtimeMs);
}

/**
 * The image a Themes card shows. With captures on, a static theme's card is a screenshot of its OWN
 * render (`routes/themes/preview.ts`), and the URL carries {@link themeContentVersion} so an edit
 * is a new URL and the browser may cache each one indefinitely. Otherwise (captures off, or a tier
 * the unauthenticated capture cannot render) the theme's shipped `screenshots/` file, as before.
 * @complexity O(f) in the theme's file count when captures are on (one tree walk); else O(1).
 */
export function themeCardPreviewUrl(
  { theme, workspaceId }: { theme: { dir: string; id: string; tier: string }; workspaceId: string },
  { capturesEnabled = false, contentVersion = themeContentVersion }: {
    capturesEnabled?: boolean;
    contentVersion?: (required: { dir: string }) => number;
  } = {},
): string | null {
  if (capturesEnabled && theme.tier === "static") {
    const version = Math.floor(contentVersion({ dir: theme.dir }));
    return `/api/admin/v1/workspaces/${encodeURIComponent(workspaceId)}/themes/${encodeURIComponent(theme.id)}/preview?v=${version}`;
  }
  return themePreviewImage({ dir: theme.dir, id: theme.id }, { assetsServed: theme.tier === "static" || theme.tier === "templated" });
}

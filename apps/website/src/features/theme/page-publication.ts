import { findTheme, isPublishableThemePageCandidate, loadTheme, type DiscoveredTheme } from "./theme.js";
import { readThemeFile, writeThemeFile } from "./theme-files.js";

/** Expected page-publication refusals shared by HTTP and assistant transports. */
export class ThemePagePublicationError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message);
    this.name = "ThemePagePublicationError";
  }
}

/** Computes a deterministic add/remove against the freshly read on-disk allowlist. */
function togglePages(raw: Record<string, unknown>, page: string, published: boolean): string[] {
  const value = raw.publishedPages;
  const current = Array.isArray(value) && value.every(entry => typeof entry === "string") ? value as string[] : [];
  const next = new Set(current);
  if (published) next.add(page);
  else next.delete(page);
  return [...next].sort();
}

/**
 * Publishes or unpublishes one static theme's standalone page and reloads the live theme.
 * Reads theme.json immediately before writing it, preserving edits absent from the boot snapshot.
 * No await is allowed between the read and write: same-process toggles cannot interleave.
 * @param deps - Discovered themes and their containment root; themes is refreshed in place.
 * @param input - Theme id, standalone page id and desired publication state.
 * @returns The page, desired state and resulting publishedPages allowlist.
 * @throws ThemePagePublicationError for a missing theme, wrong tier or ineligible page;
 * ThemePathError for unsafe paths, and filesystem/JSON failures unchanged.
 * @complexity O(n log n + b) time, O(n + b) space for n published pages and b theme bytes loaded.
 * @example setThemePagePublished(deps, { themeId: "plain", page: "about", published: true })
 */
export function setThemePagePublished(
  deps: { themes: DiscoveredTheme[]; themesDir: string },
  input: { themeId: string; page: string; published: boolean },
): { page: string; published: boolean; publishedPages: string[] } {
  const { themeId, page, published } = input;
  const theme = findTheme({ themes: deps.themes, id: themeId });
  if (!theme) throw new ThemePagePublicationError(`theme '${themeId}' was not found. Use content_read.theme to find a theme id.`, 404, "THEME_NOT_FOUND");
  if (theme.manifest.tier !== "static") {
    throw new ThemePagePublicationError(`theme '${theme.manifest.id}' is tier '${theme.manifest.tier}' — publish state only applies to static-tier themes`, 400, "NOT_STATIC_TIER");
  }
  if (!isPublishableThemePageCandidate(theme, page)) {
    throw new ThemePagePublicationError(`'${page}' is not one of this theme's own standalone pages — it does not exist, or is index/404/a declared template shell`, 404, "PAGE_NOT_PUBLISHABLE");
  }
  const raw = JSON.parse(readThemeFile({ themeDir: theme.dir, themesRoot: deps.themesDir, relativePath: "theme.json" })) as Record<string, unknown>;
  const publishedPages = togglePages(raw, page, published);
  raw.publishedPages = publishedPages;
  writeThemeFile({ themeDir: theme.dir, themesRoot: deps.themesDir, relativePath: "theme.json", content: `${JSON.stringify(raw, null, 2)}\n` });
  const index = deps.themes.indexOf(theme);
  deps.themes[index] = loadTheme({ themeDir: theme.dir, id: theme.manifest.id, source: theme.source });
  return { page, published, publishedPages };
}

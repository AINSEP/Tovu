import type { ThemeFileGroup } from "./theme-explore-port.hooks";

/**
 * @file One resolver for Explore's two read-side URL params (`?file=`, `?page=`) plus the one
 * function that writes a selection back into the address bar — split out of
 * `use-theme-explore.hooks.ts` rather than grown inline, so that file (already large enough that
 * its own `initialSelectedPath` predecessor had to be split across small helpers to stay under
 * `apps/admin`'s complexity ceiling) does not have to grow further to hold it.
 *
 * Owner complaint (2026-08-30, verbatim): "Can we fix these URLs, please? They should just be
 * `...?theme=basic&page=signin` or `signin.html`. I click these and have ugly URLs." Every
 * selection used to write the FULL relative path as `?file=render%2Fpages%2Fsignin.html`
 * regardless of what was selected. The fix keeps that full-path form only for what actually needs
 * it — a stylesheet, script, config, or asset, none of which a bare label can uniquely address
 * (filenames repeat across directories) — and writes the short `?page=<label>` form for an
 * ordinary page, which is what the owner actually asked for.
 *
 * A second bug shares the same root cause as the owner's own complaint. `?page=`'s original
 * matcher compared a raw value straight against a page's LABEL (basename minus `.html`) and
 * nothing else, so `?page=about.html` — a value that DOES name a real page, just with the
 * extension a bare `?page=` link never carries — matched nothing at all and silently fell through
 * to the theme's ordinary default selection. For the real `basic` theme (schema v2) that default
 * itself was ALSO broken (see `defaultSelectedPath`'s own doc comment in
 * `use-theme-explore.hooks.ts`), landing on `render/pages/404.html` instead of the index page — so
 * the combined, verified-live symptom was a mistyped/stale link silently opening a different, real
 * page with no indication anything was wrong. `resolveThemeExploreSelectionValue` below is the fix
 * for the matching half: it is the one place a raw value becomes a file, tried in a fixed order —
 * an exact path, then a page label, then a page label with `.html` appended back on — and both
 * `?file=` and `?page=` are read through this SAME function now. The two params only differ in
 * what gets WRITTEN back (see `writeThemeExploreSelectionToUrl`).
 */

/**
 * The subset of `ThemeExploreFile` this module actually reads. Kept as its own narrow interface —
 * rather than importing `ThemeExploreFile` itself from `use-theme-explore.hooks.ts` — so that file
 * can import FROM this one without a circular import; every real `ThemeExploreFile` satisfies this
 * shape structurally, so callers pass their own file lists straight through with no mapping.
 */
export interface ThemeExploreSelectableFile {
  path: string;
  label: string;
  kind: ThemeFileGroup;
}

/** Raw `?file=`/`?page=` values off the address bar, before resolution. */
export interface ThemeExploreSelectionRequest {
  fileId?: string;
  pageId?: string;
}

/** What {@link resolveRequestedThemeExploreSelection} found. */
export interface ThemeExploreSelectionResolution {
  /** The resolved file's path, or `null` if neither param named anything in `files` at all — the
   *  caller falls back to its own ordinary default in that case. */
  path: string | null;
  /**
   * The raw value that named nothing this theme has, so the caller can surface an explicit
   * "not found" state instead of landing on the default in total silence — `null` whenever `path`
   * resolved (an intentional layered fallback, `fileId` failing over to a valid `pageId`, still
   * counts as resolved, not a miss) or when neither param was supplied at all.
   */
  missed: string | null;
}

/**
 * One value → one file, tried in this fixed order:
 * 1. An exact theme-relative path (`render/pages/about.html`, `theme.json`) — the only form that
 *    can address a non-page file at all.
 * 2. A page's own label (`about`) — `?page=`'s original, narrower mechanism.
 * 3. A page label with `.html` appended back on (`about.html`) — a bare page filename typed or
 *    pasted with no directory prefix.
 *
 * Forms 2/3 are restricted to `kind === "page"`: a bare label or filename cannot uniquely address
 * anything else — a stylesheet and a page can share a basename across different directories, so
 * every other file kind stays reachable only through form 1, matching what a bare page id could
 * ever mean today. `basic`'s own file list (13 pages, 3 partials, 5 scripts, 3 config files, 2
 * screenshot assets, one NOTICE.md) has no page label that collides with any other file's basename
 * either, so this ordering never has to arbitrate a real tie — form 1 running first just means a
 * value that happens to equal both a full path and, coincidentally, some other page's label can
 * never occur without one already being a strict extension of the other.
 *
 * @complexity O(n) in `files.length` — up to three independent scans, no nesting.
 */
export function resolveThemeExploreSelectionValue(
  files: readonly ThemeExploreSelectableFile[],
  value: string
): string | null {
  const exact = files.find((f) => f.path === value);
  if (exact) return exact.path;

  const byLabel = files.find((f) => f.kind === "page" && f.label === value);
  if (byLabel) return byLabel.path;

  const bareLabel = value.replace(/\.html$/, "");
  if (bareLabel === value) return null; // No `.html` suffix to strip — form 3 does not apply.
  return files.find((f) => f.kind === "page" && f.label === bareLabel)?.path ?? null;
}

/**
 * Resolve Explore's initial selection from the address bar: `fileId` (`?file=`) first, else
 * `pageId` (`?page=`) — matching this screen's pre-existing priority (`?file=` is this screen's
 * own write-back target for a non-page file, so the URL a user is currently looking at wins over
 * an older `?page=` link) — each tried through {@link resolveThemeExploreSelectionValue}.
 *
 * An empty string is treated the same as absent for either param: `?page=` with no value is a
 * malformed URL, not a request for a file named `""`.
 *
 * @complexity O(n) in `files.length`.
 */
export function resolveRequestedThemeExploreSelection(
  files: readonly ThemeExploreSelectableFile[],
  { fileId, pageId }: ThemeExploreSelectionRequest
): ThemeExploreSelectionResolution {
  for (const value of [fileId, pageId]) {
    if (!value) continue;
    const resolved = resolveThemeExploreSelectionValue(files, value);
    if (resolved) return { path: resolved, missed: null };
  }
  return { path: null, missed: fileId || pageId || null };
}

/**
 * Mirror a selection into the address bar — `?page=<label>` for an ordinary page (the short form
 * the owner asked for), `?file=<full path>` for anything else, since a bare label cannot address a
 * stylesheet/script/config/asset and filenames repeat across directories. Always deletes whichever
 * of the two params it is NOT writing, so the URL never carries two selections that could disagree
 * about which file is actually open.
 *
 * Deliberately plain `window.history.replaceState`, NOT this app's own `navigate()` — `navigate()`
 * dispatches `jini:admin-navigate`, which every mounted screen (`useRouteLocation`) treats as a
 * real navigation and re-renders on. `use-theme-explore.hooks.ts`'s own initial-load effect reads
 * `fileId`/`pageId` as exactly that signal ("the address bar now names a different file/page —
 * resolve it, refetching the whole theme"), so routing every sidebar click back through
 * `navigate()` would make each click re-trigger that effect and refetch the whole theme detail
 * just to reselect the file the click already selected directly. `replaceState` updates what a
 * refresh, a copied link, or an agent's own read of `location.href` sees, without notifying
 * anything already mounted — exactly the one-way write this needs. `replace`, not a new history
 * entry, matching every other in-page control that writes itself into this app's URL
 * (`use-media-tabs.hooks.ts`'s `setActiveTab`): the back button should undo a real navigation, not
 * every file click.
 *
 * @complexity O(1).
 */
export function writeThemeExploreSelectionToUrl(file: ThemeExploreSelectableFile): void {
  const url = new URL(window.location.href);
  if (file.kind === "page") {
    url.searchParams.set("page", file.label);
    url.searchParams.delete("file");
  } else {
    url.searchParams.set("file", file.path);
    url.searchParams.delete("page");
  }
  window.history.replaceState(null, "", url);
}

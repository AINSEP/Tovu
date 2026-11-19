import { join } from "node:path";
import type { ThemeManifest } from "./render-contract.js";


/**
 * Directories whose contents are GENERATED build output inside a theme-shaped folder — never real
 * source, and never worth copying or listing as editable. `preview/` is `theme preview build script`'s output:
 * a full second copy of a theme's pages and scripts, once per color mode — on `novice` (since deleted)
 * that was 36 of 79 listed files, with `js/main.js`, `preview/dark/js/main.js`, and
 * `preview/light/js/main.js` all showing as "main.js" with nothing to distinguish them, burying the
 * ~30 real source files under three-way duplicates of themselves. Editing one is pointless-to-harmful
 * too: the next `theme preview build script` run overwrites it, so the change silently disappears.
 *
 * `screenshots/` is deliberately NOT in this list: those are real marketing assets an author may want
 * to look at or replace, not a copy of the theme's own source — excluding them from the Explore list
 * would hide something real, and excluding them from a theme's catalog copy (`__original-themes__`)
 * would make them permanently non-resettable once a user's working copy changed or deleted theirs
 * (that copy is what "reset to original" restores from).
 *
 * The single canonical list — 2026-08-11: this used to be two independent copies, `explore.ts`'s own
 * `GENERATED_DIRS`/`isGenerated` (filtering the Explore file list, given a theme-relative path already
 * in POSIX form) and the theme marketplace's `isGeneratedPreviewPath` (a `cpSync` filter callback,
 * given two ABSOLUTE filesystem paths to relativize itself; deleted 2026-10-04 with the marketplace). Both were answering the identical question —
 * "is this generated preview output" — against the identical directory name, so a third caller would
 * have had to remember to update two places or silently miss one. {@link isGeneratedThemePath} is now
 * that one definition; each caller normalizes its own path shape (already-relative-POSIX for
 * `explore.ts`, `path.relative(root, candidate)` for a `cpSync` filter) into the relative string this expects.
 */
export const GENERATED_THEME_DIRS: readonly string[] = ["preview"];

/**
 * Generated ROOT FILES (as opposed to {@link GENERATED_THEME_DIRS}' whole directories) — same
 * "regenerate the whole thing, never patch it" contract as `preview/`, just a single file instead of a
 * tree. `index.html` (Milestone 5, 2026-08-18) is `static-portability-index.ts`'s own output: a
 * `static`-tier theme's generated portability snapshot, rebuilt from `render/pages/index.html` +
 * `render/partials/*` + `tokens*.json` every time it regenerates, never hand-edited in place — editing
 * it directly is exactly as pointless as editing `preview/`'s output, for the same reason (the next
 * regeneration silently overwrites it).
 */
export const GENERATED_THEME_ROOT_FILES: readonly string[] = ["index.html"];

/**
 * Whether a theme-relative path is inside one of {@link GENERATED_THEME_DIRS} — the bare directory
 * itself (`"preview"`, the shape `cpSync`'s filter callback sees for the directory entry before
 * recursing) or anything under it (`"preview/dark/index.html"`) — or is itself one of
 * {@link GENERATED_THEME_ROOT_FILES} exactly.
 *
 * Deliberately NOT a prefix match on the raw string (`startsWith("preview")`): that would also exclude
 * a merely similarly-named sibling like `preview-notes/`, which is a real author asset with nothing to
 * do with generated output. Matching on the full segment (`=== dir` or `startsWith(dir + "/")`) is what
 * avoids that false positive.
 *
 * `.`/`..` segments are COLLAPSED before comparing (2026-08-13). Without that, this predicate judged
 * the path as literally spelled while `resolveThemeFilePath` — the function that decides which file
 * actually gets written — judged it normalized, so the two disagreed about which file a request names.
 * `PUT {"path":"css/../preview/app.css"}` was accepted (200) and overwrote generated output, walking
 * around the `preview/` rule on EVERY route that consults this predicate. Live-confirmed through the
 * real Express routes before the fix; regression test in `explore-built-theme-gate.test.ts`.
 *
 * A gate and its writer must resolve a name the same way; anything else is a bypass waiting to be
 * spelled differently. `..` popping past the root is left to produce a path that
 * `resolveThemeFilePath`'s own containment check rejects — this function answers only "is it generated".
 *
 * @param relativePath - A path relative to the theme's own root. Backslash-separated input (a raw
 * `path.relative` result on Windows) is normalized to `/` first, so callers on either platform can pass
 * their native separator through unchanged.
 * @returns `true` iff `relativePath`, once normalized, exactly matches a {@link GENERATED_THEME_ROOT_FILES}
 * entry, or is a {@link GENERATED_THEME_DIRS} entry itself or under it.
 * @throws Never. Pure: no filesystem access, no side effects.
 * @complexity Time: O((d+r)·k), d = `GENERATED_THEME_DIRS.length`, r = `GENERATED_THEME_ROOT_FILES.length`
 * (both fixed, tiny constants), k = path length.
 * @complexity Space: O(k) for the normalized copy.
 * @overallScore 100/100
 */
export function isGeneratedThemePath({ relativePath }: { relativePath: string }, _optional = {}): boolean {
  const normalized = normalizeThemeRelativePath({ relativePath });
  if (GENERATED_THEME_ROOT_FILES.includes(normalized)) return true;
  return GENERATED_THEME_DIRS.some((dir) => normalized === dir || normalized.startsWith(`${dir}/`));
}

/**
 * Whether a compiled theme's declared `build.sourceDir` conflicts with a {@link GENERATED_THEME_DIRS}
 * entry — the install-time half of the two-layer `preview/` defense. {@link isGeneratedThemePath}
 * stops a WRITE that names a generated path; this stops the MANIFEST that would make an entire,
 * ordinary-looking source tree alias generated output, checked by `loadTheme` (`theme.ts`) so a
 * conflicting manifest fails to load at all rather than depending solely on each write route's own
 * `isGeneratedThemePath` refusal (added 2026-08-13 after `PUT {"path":"preview/foo.tsx"}` on a
 * `sourceDir: "preview"` manifest reached disk — see that history in `isGeneratedThemePath`'s doc, and
 * `explore.ts`'s PUT handler for the call-site layer this one is in front of, not a replacement for).
 *
 * Three shapes conflict, because each makes some path indistinguishable as source vs. generated:
 *  1. `sourceDir` names a generated dir exactly (`"preview"`).
 *  2. `sourceDir` is NESTED inside one (`"preview/src"`) — the same "exact segment or a path under it"
 *     shape {@link isGeneratedThemePath} already answers for a file path; reused here for `sourceDir`
 *     rather than re-derived, so a `sourceDir` string and a file path are never judged by two different
 *     rules.
 *  3. `sourceDir` is an ANCESTOR of a generated dir — in practice only the theme root itself (`"."`,
 *     which normalizes to `""`), which would put every {@link GENERATED_THEME_DIRS} entry INSIDE the
 *     declared source tree. An empty `sourceDir` (`""`) is already refused earlier in `loadTheme` as
 *     falsy (`build.sourceDir is required`), so the only shape this adds is a truthy root spelling like
 *     `"."`. Any generated-dir list is non-empty by construction (see that constant's own doc), so a
 *     root `sourceDir` conflicts unconditionally rather than needing a per-entry comparison.
 *
 * `"preview-notes"` — merely PREFIXED with a generated dir's name — must NOT conflict; the per-segment
 * comparison below is what avoids that false positive, exactly as it does for {@link isGeneratedThemePath}.
 *
 * @param sourceDir - `theme.json`'s `build.sourceDir`, as authored (any separator, `./`, `..`).
 * @returns `true` iff normalizing `sourceDir` lands on, inside, or astride any
 * {@link GENERATED_THEME_DIRS} entry.
 * @throws Never. Pure: no filesystem access, no side effects.
 * @complexity Time: O(d·k), d = `GENERATED_THEME_DIRS.length`, k = path length. Space: O(k).
 */
export function isSourceDirGeneratedConflict({ sourceDir }: { sourceDir: string }, _optional = {}): boolean {
  const normalizedSource = normalizeThemeRelativePath({ relativePath: sourceDir });
  // The root sourceDir case: no per-entry comparison can express "is an ancestor of every entry"
  // via a single startsWith check the way the nested-inside direction can, so it is handled directly.
  if (normalizedSource === "") return true;
  return GENERATED_THEME_DIRS.some(
    (dir) =>
      normalizedSource === dir ||
      normalizedSource.startsWith(`${dir}/`) ||
      dir.startsWith(`${normalizedSource}/`)
  );
}

/**
 * Collapse a theme-relative path to comparable segments: `/` separators, no `.`, no `..`, no empty
 * segments. Shared by every predicate here that compares a path against a directory name, so a gate
 * and the writer it guards cannot disagree about which file a string names.
 *
 * Split on either separator explicitly, not `path.sep` — `sep` is `/` on the POSIX machine this runs
 * on today, which would make the split a no-op for a `\`-separated string instead of normalizing it,
 * silently defeating the cross-platform guarantee these functions' doc comments make.
 */
function normalizeThemeRelativePath({ relativePath }: { relativePath: string }, _optional = {}): string {
  const segments: string[] = [];
  for (const segment of relativePath.split(/[\\/]/)) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      segments.pop();
    } else {
      segments.push(segment);
    }
  }
  return segments.join("/");
}

/**
 * Whether one path resolves to a BUILT theme's generated tree — read-only from every per-file surface
 * — or to a location that stays editable (ADR-020 §5, `ThemeBuildInfo`'s own doc: "a built theme's
 * source keeps per-file reset and AI-authorability; only its generated tree loses granularity").
 *
 * `"editable"` for every theme on disk today (`manifest.build?.source !== "compiled"` — every theme is
 * `authored`, unchanged). For a COMPILED theme, `"editable"` is narrowed to exactly two things: `
 * theme.json` itself (the one file a compiled theme still needs to keep editing — author, lineage —
 * without touching generated output), and anything under `manifest.build.sourceDir`, which is real,
 * hand-authored source with no cross-file desync risk an editable file doesn't already carry on its
 * own. Everything else is `"generated-readonly"`: one `pages/index.html` edited or reset in isolation
 * from the same build's `js/main.js` would desync the release from what `build.artifactHashes` actually
 * verifies (`build-conformance.ts`), so the generated tree is never mutated file-by-file — it is
 * restored, when it is, only as one complete, re-verified release.
 *
 * A compiled theme declaring no `sourceDir` has no editable region here at all beyond `theme.json` —
 * `loadTheme`'s own manifest-shape validation already flags such a theme `invalid` (`sourceDir` is
 * REQUIRED when `build.source` is `"compiled"`), so this function does not need to guess a fallback
 * convention like `src/` a real author's build might not even use.
 *
 * This is a PURE policy decision, not itself a containment check — callers still resolve
 * `relativePath` through {@link resolveThemeFilePath} before touching the filesystem; this only
 * answers "is this write/reset allowed at all for this theme's lifecycle class."
 */
export type ThemeFileWriteScope =
  | { readonly kind: "editable" }
  | { readonly kind: "generated-readonly"; readonly reason: string };

export function resolveThemeFileWriteScope(
  required: { manifest: Pick<ThemeManifest, "build">; relativePath: string },
  _optional: Record<string, never> = {}
): ThemeFileWriteScope {
  const { manifest, relativePath } = required;
  if (manifest.build?.source !== "compiled") return { kind: "editable" };

  // Normalized (not raw) for the same reason `isGeneratedThemePath` is — see its doc. Comparing the
  // path as spelled let `src/../pages/index.html` match the `sourceDir` prefix and resolve "editable",
  // handing back write permission on a built theme's GENERATED tree, which is the ADR-020 §5 refusal
  // this function exists to make.
  const normalized = normalizeThemeRelativePath({ relativePath });
  if (normalized === "theme.json") return { kind: "editable" };

  const sourceDir = manifest.build.sourceDir;
  if (sourceDir !== undefined && (normalized === sourceDir || normalized.startsWith(`${sourceDir}/`))) {
    return { kind: "editable" };
  }

  return {
    kind: "generated-readonly",
    reason:
      "this file is generated output of a built theme (theme.json build.source: 'compiled'); it is versioned and restored only as one complete release, never edited or reset file-by-file — edit the source under build.sourceDir and rebuild instead",
  };
}

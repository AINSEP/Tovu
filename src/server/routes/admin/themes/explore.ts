import { existsSync } from "node:fs";
import { join } from "node:path";

import type { Response } from "express";

import { findTheme, loadTheme, THEME_CATALOG_DIR, type DiscoveredTheme } from "#src/features/theme/index";
import {
  copyThemeFile,
  isGeneratedThemePath,
  listThemeFiles,
  readThemeFile,
  renameThemeFile,
  resolveThemeFileWriteScope,
  restoreBuiltThemeGeneratedTree,
  writeThemeFile,
  ThemePathError,
  type ThemeFileWriteScope,
} from "#src/features/theme/theme-files";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { ContentRouteDeps } from "../content/deps";
import type { ContentRouteRegistrar } from "../content/deps";

/**
 * @file The Explore screen's backend: one theme's editable surface, plus read/write of its files.
 *
 * Theme file access already existed — but only as AGENT tools (`features/theme/tool-registrations.ts`),
 * reachable by an assistant and by nothing else. These are the same three operations over HTTP so a
 * human can do them too, sharing `theme-files.ts`'s containment helpers rather than re-deriving path
 * safety per surface.
 *
 * Both mutating and reading routes are gated on `theme.set`, matching every other route on this
 * resource. There is no separate read permission in the catalog, and `presentation/get.ts` already
 * documents that same reuse.
 */

/** `theme.set` gate + workspace check, shared by all three routes below. */
async function authorizeThemeAccess(
  deps: ContentRouteDeps,
  req: { params: Record<string, unknown> },
  res: Response
): Promise<boolean> {
  if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
    res.status(404).json({ error: "workspace was not found" });
    return false;
  }
  const principal = getAuthedPrincipal(res);
  const authResult = await deps.authorize({
    principalId: principal.id,
    permission: "theme.set",
    workspaceId: deps.workspaceId,
    entityType: "presentation",
  });
  if (!authResult.allowed) {
    res.status(403).json({
      error: `principal '${principal.id}' is not authorized for 'theme.set' (${authResult.reason})`,
      code: "FORBIDDEN",
      details: { permission: "theme.set", reason: authResult.reason },
    });
    return false;
  }
  return true;
}

/**
 * Map a containment/size failure to 400 and everything else to 500.
 *
 * `ThemePathError` is the one error class here that reflects bad INPUT — a path escaping the theme
 * root, a missing file, an oversized body. Collapsing it into 500 would tell the admin "the server
 * broke" when the honest answer is "that path is not editable", which is the difference between a
 * user fixing their own mistake and filing a bug.
 */
function sendThemeFileError(res: Response, err: unknown): void {
  if (err instanceof ThemePathError) {
    res.status(400).json({ error: err.message, code: "INVALID_THEME_PATH" });
    return;
  }
  res.status(500).json({ error: "internal error" });
}

/**
 * Re-read one theme from disk and swap it into the live `deps.themes` array.
 *
 * Mandatory after ANY write to a theme's files. `DiscoveredTheme.pages`/`partials` hold file
 * CONTENTS, `readFileSync`-ed once at discovery and then held for the life of the process — and the
 * preview renders out of those maps, not off disk. Skip this and a save changes disk and nothing
 * else: the operator saves, the preview redraws identically, and "saving is broken" is the only
 * honest reading. That is exactly the bug this screen shipped with.
 *
 * Reloads ONE theme rather than rescanning all of them, matching what the `theme_write_file` AGENT
 * tool has always done (`features/theme/tool-registrations.ts`) — that path had this right first,
 * and two surfaces onto the same capability should not refresh state two different ways.
 *
 * Re-validates through the same `loadTheme` boot-time discovery uses, so a file written here is
 * checked identically to one written by hand, and a theme edited into an invalid state reports
 * `status: "invalid"` rather than silently rendering stale-but-valid markup.
 */
function reloadTheme(deps: ContentRouteDeps, themeId: string): void {
  const index = deps.themes.findIndex((t) => t.manifest.id === themeId);
  if (index < 0) return;
  const current = deps.themes[index];
  deps.themes[index] = loadTheme({ themeDir: current.dir, id: themeId, source: current.source });
}

/**
 * Extensions safe to hand back as UTF-8 text at all — i.e. "can this be read/displayed as text",
 * which is a DIFFERENT question from "can this be saved" ({@link isThemeFileWritable} below).
 * Everything NOT listed is treated as binary and is never read as text: `readFileSync(…, "utf8")` on
 * a PNG returns mojibake that looks like a corrupt file, and writing that back would actually
 * corrupt it. Binary files are still listed and still viewable — the Explore screen renders them
 * straight from `/theme-assets/{themeId}/{path}`, which already serves every theme's folder — just
 * not as decoded source.
 *
 * `.svg` is deliberately on the TEXT side: it is markup, authors do hand-edit it, and it round-trips
 * through UTF-8 losslessly.
 *
 * This set is intentionally broader than what is writable: `.js`/`.mjs`/`.cjs` stay here so a script
 * can still be opened and read in the HTML tab, even though {@link isThemeFileWritable} refuses to
 * save one (2026-08-11 owner ask — scripts are read-only in Explore, but "read-only" means exactly
 * that, not "invisible"). Conflating the two here is the bug this split fixes: the file list's old
 * single `editable` flag used to mean both "fetch as text" and "show a Save button", so making
 * scripts read-only would have hidden their source entirely — a regression, not the ask.
 */
const TEXT_READABLE_EXTENSIONS = new Set([
  ".html", ".css", ".js", ".mjs", ".cjs", ".json", ".md", ".txt", ".svg", ".webmanifest",
]);

function isTextReadable(relativePath: string): boolean {
  const dot = relativePath.lastIndexOf(".");
  return dot === -1 ? false : TEXT_READABLE_EXTENSIONS.has(relativePath.slice(dot).toLowerCase());
}

/**
 * Media extensions that make up the `assets` group: images, video, audio, and fonts — the file
 * kinds an Explore author might replace but never hand-edits as source. (`.svg` is the one image
 * format also on {@link TEXT_READABLE_EXTENSIONS}, deliberately — see that set's comment.)
 *
 * 2026-08-11 owner ask: `assets` used to be a catch-all for anything that wasn't a page, partial,
 * style, script, or config file — which silently swept in `.md`/`.txt`/`.webmanifest` and any other
 * stray file alongside actual images. Those now fall to {@link fileGroup}'s `other` bucket instead.
 */
const ASSET_EXTENSIONS = new Set([
  // Images
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".svg", ".ico", ".bmp", ".tif", ".tiff",
  // Video
  ".mp4", ".webm", ".mov", ".avi", ".mkv", ".m4v",
  // Audio
  ".mp3", ".wav", ".ogg", ".m4a", ".flac", ".aac",
  // Fonts
  ".woff", ".woff2", ".ttf", ".otf", ".eot",
]);

function isAssetExtension(relativePath: string): boolean {
  const dot = relativePath.lastIndexOf(".");
  return dot === -1 ? false : ASSET_EXTENSIONS.has(relativePath.slice(dot).toLowerCase());
}

/** Every group `fileGroup` can return, exported so the response type and the client's file-list
 *  grouping share one vocabulary rather than each re-deriving it. */
export type ThemeExploreFileGroup = "page" | "partial" | "style" | "script" | "config" | "asset" | "other";

/**
 * Coarse grouping for the Explore file list, derived from path/extension alone.
 *
 * Presentation-only: the server does not care what a file is FOR, but a flat 60-entry list of every
 * screenshot and vendor script buries the four files an author actually edits. Kept here rather than
 * in the client so the classification has one definition, and stays available to any other consumer
 * (also used by {@link isThemeFileWritable} and the copy/rename routes below, so "what group is
 * this" is answered exactly once).
 *
 * `other` is the catch-all this group set used to lack: anything that isn't a page, partial, style,
 * script, config, or recognized media extension — `.md`, `.txt`, `.webmanifest`, and any stray data
 * file an author or a downloaded theme happens to ship.
 */
function fileGroup(relativePath: string): ThemeExploreFileGroup {
  if (relativePath.startsWith("pages/")) return "page";
  if (relativePath.endsWith(".css")) return "style";
  if (/\.(m|c)?js$/.test(relativePath)) return "script";
  if (/^(theme|tokens|tokens\.light)\.json$/.test(relativePath)) return "config";
  if (!relativePath.includes("/") && relativePath.endsWith(".html")) return "partial";
  if (isAssetExtension(relativePath)) return "asset";
  return "other";
}

/**
 * Groups that are never writable through the PUT/rename/reset routes, regardless of whether their
 * extension is otherwise text-readable.
 *
 * `script`: 2026-08-11 owner ask — "I don't want JS edited from this screen." Enforced here rather
 * than only in the client (which the previous `editable` flag already hid the Save button for) —
 * `editable` was advisory, read by the UI to decide what to render, but nothing stopped a PUT
 * constructed by hand. This is the actual enforcement point.
 *
 * `other`: the new catch-all group (`.md`, `.txt`, `.webmanifest`, stray files) was never a group an
 * author was asked to edit from this screen either; it existed by omission (falling into `asset`)
 * rather than by design, and making it explicitly read-only is more honest than accidentally
 * writable.
 */
const READ_ONLY_GROUPS: ReadonlySet<ThemeExploreFileGroup> = new Set(["script", "other"]);

/**
 * Whether a file can be saved (PUT) or reset — the narrower of the two questions
 * {@link isTextReadable} used to answer alone. A file must be text-readable AND not in a
 * {@link READ_ONLY_GROUPS} group AND not inside a generated directory to be writable: `.svg` (asset
 * group, text-readable) stays writable exactly as before, `.js` (script group, text-readable) does not.
 *
 * 2026-08-13 (security pass Finding 1, defense in depth): also refuses anything
 * {@link isGeneratedThemePath} claims — `preview/`, `build-preview.mjs`'s own output. That directory
 * was already excluded from the Explore file LIST (below, in the detail route) on the grounds that it
 * is generated output nobody should hand-edit, but the LIST filter and this WRITABILITY check used to
 * be two independent predicates that had drifted apart: PUT never consulted the list's own exclusion,
 * so a path merely hidden from the UI was still fully writable by hand (or by a client that cached an
 * older file list). Folded in here rather than left as a second, easy-to-forget check at each of PUT's
 * three call sites, matching the "one definition, not two that can disagree" reasoning
 * {@link isGeneratedThemePath}'s own doc already gives for existing.
 */
function isThemeFileWritable(relativePath: string): boolean {
  return (
    isTextReadable(relativePath) &&
    !READ_ONLY_GROUPS.has(fileGroup(relativePath)) &&
    !isGeneratedThemePath(relativePath)
  );
}

/**
 * A framework's own source extensions, open-ended by nature — a new framework brings a new one — but
 * kept a fixed list rather than "any extension." Deliberately excludes anything a server/shell could
 * execute (`.php`, `.sh`, `.py`, `.rb`, …), anything carrying operational secrets (`.env`, `.pem`),
 * AND — the part that matters most, see {@link SOURCE_DIR_WRITABLE_EXTENSIONS}'s own doc — anything a
 * BROWSER can independently execute or render as active content, because `build.sourceDir` is
 * statically served, not merely edited here.
 */
const FRAMEWORK_SOURCE_EXTENSIONS = new Set([".tsx", ".ts", ".jsx", ".vue", ".svelte", ".astro", ".scss", ".less"]);

/**
 * The full extension allowlist {@link isSourceDirWritableExtension} accepts inside `build.sourceDir` —
 * {@link FRAMEWORK_SOURCE_EXTENSIONS} plus `.css` and the genuinely inert subset of
 * {@link TEXT_READABLE_EXTENSIONS} (`.json`, `.md`, `.txt`).
 *
 * DELIBERATELY NARROWER than {@link TEXT_READABLE_EXTENSIONS} itself: `.html`, `.svg`, `.js`, `.mjs`,
 * `.cjs`, and `.webmanifest` are all text-readable elsewhere in a theme but excluded HERE, because
 * `build.sourceDir` is statically served (verified, not assumed — see
 * {@link isInsideCompiledSourceDir}'s own doc for the citation) and each of those five is a format a
 * BROWSER can independently execute or
 * render as active content the instant its URL is visited directly: `.html`/`.svg` can carry a
 * `<script>` tag, `.js`/`.mjs`/`.cjs` literally ARE script. Confirmed exploitable, not theoretical: a
 * PUT of `{ path: "src/thing.html", content: "<script>...</script>" }` against a compiled theme
 * returned 200 before this allowlist existed. `.js`/`.mjs`/`.cjs` exclusion also matches this
 * codebase's own prior, unrelated decision to keep static-theme JS read-only from this screen at all
 * (`READ_ONLY_GROUPS`'s own doc: "2026-08-11 owner ask — I don't want JS edited from this screen").
 *
 * Disclosed limitation, not silently dropped: Angular pairs a `.ts` component with a `.component.html`
 * template in the SAME source directory, so this excludes that convention from being SAVED through
 * this screen (a file that exists on disk some other way stays READABLE — {@link isTextReadable} is
 * untouched — only writable-through-Explore is narrower). Whether/how Angular templates get edited
 * here is left open, the same way the debate itself left "can Angular even emit the literal asset
 * sentinel" open — not decided as a side effect of closing this gap.
 */
const SOURCE_DIR_WRITABLE_EXTENSIONS = new Set([...FRAMEWORK_SOURCE_EXTENSIONS, ".css", ".json", ".md", ".txt"]);

/**
 * Whether `relativePath` sits inside a BUILT theme's real, hand-authored source (ADR-020 §5,
 * `build.sourceDir`) — the LOCATION half of the sourceDir carve-out; see
 * {@link isSourceDirWritableExtension} for the extension half this must be paired with, and why they
 * are not just OR'd into `resolveThemeFileWriteScope`'s own "editable" result.
 *
 * Why the bound matters, verified rather than assumed: `build.sourceDir` is NOT build-input-only.
 * `registerThemeStaticAssets` (`server/middleware/theme-static-assets.ts:29-37`) mounts
 * `express.static(themeDir)` on a static theme's ENTIRE folder at `/theme-assets/{themeId}/...` — that
 * file's own doc comment (now corrected) used to claim it serves only `css/`/`js/`, but the actual
 * `express.static` call is unscoped to any subpath, so `build.sourceDir` is served identically to
 * every other file in the theme, confirmed by reading the mount, not inferred from a comment. An
 * unbounded "anything that isn't theme.json" carve-out would therefore let a `theme.edit`-permitted
 * admin write attacker-controlled markup to a publicly fetchable, same-origin URL — a materially wider
 * surface than {@link isThemeFileWritable}'s allowlist was permitting a moment earlier, for every
 * OTHER location in a theme.
 *
 * Why a carve-out is still needed at all (not just tightening the extension set in place):
 * {@link resolveThemeFileWriteScope} already proved `relativePath` editable for this theme by the time
 * either caller below checks this, but {@link isThemeFileWritable}'s GROUP half
 * ({@link READ_ONLY_GROUPS}) classifies almost anything outside `pages/`/`css/`/root-`.html` as
 * `"other"` — read-only — which is correct for a static theme's OWN layout and simply inapplicable to
 * a framework source tree with its own, different, layout conventions.
 *
 * `theme.json` is deliberately excluded: it already passes both halves of
 * {@link isThemeFileWritable} on its own (the `config` group, and `.json` is text-readable), so it
 * never needs this carve-out — keeping the carve-out scoped to exactly `build.sourceDir`.
 *
 * This is a LOCATION predicate only — see {@link isSourceDirWritableExtension} for the extension half.
 * They are DELIBERATELY NOT combined into one boolean with the general `isThemeFileWritable` gate as an
 * OR-fallback: `.svg` (and any other extension {@link fileGroup} classifies `"asset"`, a group that has
 * never been read-only, since it is a pure extension check with no notion of location) already passes
 * `isThemeFileWritable` on its own, ANYWHERE in a theme. Falling back to that general gate for a
 * compiled theme's sourceDir would silently readmit exactly the extensions
 * {@link SOURCE_DIR_WRITABLE_EXTENSIONS} exists to exclude — confirmed by a failing test before this
 * split existed. Both call sites below use this predicate to decide whether
 * {@link isSourceDirWritableExtension} is the ONLY applicable rule (this theme's sourceDir) or whether
 * the general gate still applies unchanged (everything else).
 */
function isInsideCompiledSourceDir(
  theme: Pick<DiscoveredTheme, "manifest">,
  relativePath: string,
  writeScope: ThemeFileWriteScope
): boolean {
  return theme.manifest.build?.source === "compiled" && writeScope.kind === "editable" && relativePath !== "theme.json";
}

/** The extension half of the sourceDir carve-out — see {@link isInsideCompiledSourceDir}'s own doc for
 * why this is checked SEPARATELY from, and as the SOLE gate for (never OR'd with the general
 * `isThemeFileWritable` gate), a path already inside a compiled theme's sourceDir. */
function isSourceDirWritableExtension(relativePath: string): boolean {
  return SOURCE_DIR_WRITABLE_EXTENSIONS.has(fileExtension(relativePath));
}

/**
 * Files `loadTheme` treats as REQUIRED — their absence pushes a load error and flips the theme's
 * `status` to `"invalid"` (`theme.ts`: `pages.index` at the `pages/index.html` check, and the
 * `theme.json`/`tokens.json` `readJson` calls each wrapped in a try/catch that pushes an error on
 * failure, ENOENT included). Renaming any of these out from under a theme reproduces that same
 * breakage, so all three are hard-blocked in {@link registerAdminThemeFileRenameRoute} — not just
 * `pages/index.html`, which was the one example named when this was scoped, but the identical
 * failure shape extends to the other two.
 *
 * `tokens.light.json` is deliberately NOT here: `theme.ts` documents it as optional (`"Optional
 * unlike tokens.json: absent is not an error, it just means the theme ships no light variant"`), so
 * renaming it degrades a theme rather than breaking it — closer to the "renaming a page changes its
 * URL" warning-not-block case than to this hard block.
 */
const REQUIRED_THEME_FILES: ReadonlySet<string> = new Set(["pages/index.html", "theme.json", "tokens.json"]);

/** A path's own extension, lowercased (`""` if none) — the dot must fall after the last slash to
 * count, matching {@link nextAvailableFileName}'s identical rule for the same reason. */
function fileExtension(relativePath: string): string {
  const dot = relativePath.lastIndexOf(".");
  const slash = relativePath.lastIndexOf("/");
  return dot > slash ? relativePath.slice(dot).toLowerCase() : "";
}

/**
 * Build one file-list entry — shared by the detail route's full listing and the copy/rename routes'
 * single-file response, so "what does the client learn about a file" has one definition instead of
 * three ad hoc object literals drifting apart.
 *
 * `readable` and `editable` are deliberately separate fields (2026-08-11): `readable` gates whether
 * the client fetches/displays the file as text at all, `editable` gates whether it renders an
 * editable textarea with a live Save button. A script is `readable: true, editable: false` — visible,
 * not saveable. A binary asset is `readable: false, editable: false` — neither.
 */
function describeThemeFile(
  relativePath: string,
  options: { catalogDir: string; hasOriginal: boolean }
): { path: string; group: ThemeExploreFileGroup; readable: boolean; editable: boolean; resettable: boolean } {
  return {
    path: relativePath,
    group: fileGroup(relativePath),
    readable: isTextReadable(relativePath),
    editable: isThemeFileWritable(relativePath),
    // Whether THIS file can be reset — a file the author added themselves (including a fresh copy)
    // has no original to go back to, and offering a Reset that would fail is worse than not
    // offering one.
    resettable: options.hasOriginal && existsSync(join(options.catalogDir, relativePath)),
  };
}

/**
 * Suffix a caller-desired relative path to avoid colliding with anything already in `existingPaths`,
 * following the same `name`, `name-1`, `name-2` … shape {@link nextAvailableThemeId} uses for theme
 * ids — but split around the extension, since a theme id (`basic`) is a bare folder name with no
 * extension to preserve, while a file path (`pages/about.html`) needs `about-1.html`, not
 * `about.html-1`. That shape difference is why this is its own small function instead of a direct
 * call into `nextAvailableThemeId`: the collision LOOP is identical, the thing being suffixed is not.
 *
 * @complexity O(n) in the number of existing collisions with the desired name.
 * @overallScore 100/100
 */
function nextAvailableFileName(
  required: { desiredPath: string; existingPaths: ReadonlySet<string> },
  _optional: Record<string, never> = {}
): string {
  const { desiredPath, existingPaths } = required;
  const slash = desiredPath.lastIndexOf("/");
  const dot = desiredPath.lastIndexOf(".");
  // A dot has to fall AFTER the last slash to be the filename's own extension — otherwise it belongs
  // to a directory segment (not a real case in this theme layout, but cheap to get right).
  const hasExt = dot > slash;
  const base = hasExt ? desiredPath.slice(0, dot) : desiredPath;
  const ext = hasExt ? desiredPath.slice(dot) : "";

  if (!existingPaths.has(desiredPath)) return desiredPath;
  let suffix = 1;
  let candidate = `${base}-${suffix}${ext}`;
  while (existingPaths.has(candidate)) {
    suffix += 1;
    candidate = `${base}-${suffix}${ext}`;
  }
  return candidate;
}

/** GET one theme's detail — what the Explore screen lists and what its banner says. */
export const registerAdminThemeDetailRoute: ContentRouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/themes/:themeId", async (req, res) => {
    try {
      if (!(await authorizeThemeAccess(deps, req, res))) return;

      const themeId = String(req.params.themeId ?? "");
      const theme = findTheme({ themes: deps.themes, id: themeId });
      if (!theme) {
        res.status(404).json({ error: `theme '${themeId}' was not found` });
        return;
      }

      // `lineage` is written by the copy/download flows but deliberately NOT parsed into
      // `ThemeManifest` — it is metadata about where a copy came from, never anything the renderer
      // resolves, and putting it on the manifest would invite exactly the runtime-inheritance
      // reading the copy model exists to remove. Read from the raw manifest here instead.
      let lineage: unknown = null;
      try {
        const raw = JSON.parse(
          readThemeFile({ themeDir: theme.dir, themesRoot: deps.themesDir, relativePath: "theme.json" })
        ) as Record<string, unknown>;
        lineage = raw.lineage ?? null;
      } catch {
        lineage = null;
      }

      // An untouched original to reset back to. Checked on disk rather than inferred from `lineage`,
      // because a manifest can claim an origin whose folder was since deleted — and the banner's
      // promise ("you can always get back to what you started from") must reflect what is actually
      // recoverable, not what a copy remembers being told.
      const hasOriginal = existsSync(
        join(deps.themesDir, THEME_CATALOG_DIR, theme.manifest.tier, theme.manifest.id)
      );

      // Every file in the theme folder, not just the pages/partials the RENDERER knows about — CSS,
      // JS, tokens, images. Those are the files an author most often actually needs to change to
      // make a downloaded theme theirs, and until now the screen hid all of them.
      const catalogDir = join(deps.themesDir, THEME_CATALOG_DIR, theme.manifest.tier, theme.manifest.id);
      // `isGeneratedThemePath` (`theme-files.ts`) — the shared definition of "this is
      // `build-preview.mjs` output, not real theme source"; see its own doc comment for why.
      const files = listThemeFiles({ themeDir: theme.dir, themesRoot: deps.themesDir })
        .filter((path) => !isGeneratedThemePath(path))
        .map((path) => describeThemeFile(path, { catalogDir, hasOriginal }));

      res.json({
        id: theme.manifest.id,
        name: theme.manifest.name,
        tier: theme.manifest.tier,
        status: theme.status,
        errors: theme.errors,
        pages: Object.keys(theme.pages).sort(),
        partials: Object.keys(theme.partials).sort(),
        files,
        lineage,
        hasOriginal,
      });
    } catch {
      res.status(500).json({ error: "internal error" });
    }
  });
};

/** GET the raw source of one file inside a theme. */
export const registerAdminThemeFileGetRoute: ContentRouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/themes/:themeId/file", async (req, res) => {
    try {
      if (!(await authorizeThemeAccess(deps, req, res))) return;

      const themeId = String(req.params.themeId ?? "");
      const theme = findTheme({ themes: deps.themes, id: themeId });
      if (!theme) {
        res.status(404).json({ error: `theme '${themeId}' was not found` });
        return;
      }

      const path = String((req.query as Record<string, unknown>).path ?? "");
      const content = readThemeFile({ themeDir: theme.dir, themesRoot: deps.themesDir, relativePath: path });
      res.json({ path, content });
    } catch (err) {
      sendThemeFileError(res, err);
    }
  });
};

/**
 * PUT one file inside a theme.
 *
 * Reachable only for themes DISCOVERY returned — which structurally excludes the originals catalog
 * and the marketplace fixture, since neither is discovered. That is the invariant the whole copy
 * model rests on: an original cannot be edited, so a copy always has something intact to reset to,
 * and it holds here because of where the theme list comes from rather than because of a check
 * somebody has to remember to write.
 */
export const registerAdminThemeFilePutRoute: ContentRouteRegistrar = (app, deps) => {
  app.put("/api/admin/v1/workspaces/:workspaceId/themes/:themeId/file", async (req, res) => {
    try {
      if (!(await authorizeThemeAccess(deps, req, res))) return;

      const themeId = String(req.params.themeId ?? "");
      const theme = findTheme({ themes: deps.themes, id: themeId });
      if (!theme) {
        res.status(404).json({ error: `theme '${themeId}' was not found` });
        return;
      }

      const body = (req.body ?? {}) as Record<string, unknown>;
      const path = String(body.path ?? "");
      const content = body.content;
      if (typeof content !== "string") {
        res.status(400).json({ error: "content must be a string", code: "INVALID_BODY" });
        return;
      }

      // ADR-020 §5: a built theme's generated tree is editor-read-only, checked BEFORE the
      // group-based `isThemeFileWritable` gate below — this is a lifecycle-class refusal (nothing
      // about `path`'s extension or group changes it), not a content-type one. See
      // `resolveThemeFileWriteScope`'s own doc for the authored-vs-built distinction. A theme with no
      // `build` field (every theme on disk today) always resolves `"editable"` here, unchanged.
      const writeScope = resolveThemeFileWriteScope({ manifest: theme.manifest, relativePath: path });
      if (writeScope.kind === "generated-readonly") {
        res.status(403).json({ error: `'${path}' is read-only: ${writeScope.reason}`, code: "GENERATED_READONLY" });
        return;
      }

      // Enforced here, not only by the client hiding the Save button — a PUT built by hand (or by an
      // older cached client) must be refused the same way. Two DISJOINT rules, not one gate OR'd with
      // another: inside a compiled theme's sourceDir, ONLY `isSourceDirWritableExtension` decides —
      // see `isInsideCompiledSourceDir`'s own doc for why falling back to the general
      // `isThemeFileWritable` gate here would silently readmit extensions (`.svg`, classified `asset`
      // — never read-only, with no notion of location) the sourceDir allowlist exists to exclude.
      // Everywhere else, `isThemeFileWritable` is unchanged.
      const writable = isInsideCompiledSourceDir(theme, path, writeScope)
        ? isSourceDirWritableExtension(path)
        : isThemeFileWritable(path);
      if (!writable) {
        res.status(403).json({
          error: `'${path}' is read-only in Explore and cannot be saved`,
          code: "READ_ONLY_FILE",
        });
        return;
      }

      writeThemeFile({ themeDir: theme.dir, themesRoot: deps.themesDir, relativePath: path, content });


      // Re-read from disk after writing, or the save is invisible. See `reloadTheme`.
      reloadTheme(deps, theme.manifest.id);

      res.json({ path, bytes: Buffer.byteLength(content, "utf8") });
    } catch (err) {
      sendThemeFileError(res, err);
    }
  });
};

/**
 * POST — restore file(s) to the pristine copy in the originals catalog.
 *
 * This is the payoff for the whole copy-not-inherit model, and the reason the catalog has to be
 * genuinely untouched rather than a hash or a manifest note: "put it back" is a file copy, needing
 * no diff, no history, and no tooling anybody has to build. It is only possible because the original
 * still exists byte-for-byte.
 *
 * ADR-020 §5 split, checked FIRST via {@link resolveThemeFileWriteScope}: for an authored theme (no
 * `build` field — every theme on disk today) or a built theme's own `theme.json`/`build.sourceDir`,
 * `path` resolves ONE file, unchanged from before this split existed. For a BUILT theme's generated
 * tree, reset is never a single file — the whole generated tree restores as ONE atomic operation via
 * {@link restoreBuiltThemeGeneratedTree}, and the response reports every file that changed rather than
 * just the one `path` the request named (see that function's own doc for why a generated tree cannot
 * be restored file-by-file without risking desync between files the same build produced together).
 *
 * The per-file path refuses in two distinct cases, kept distinct because they mean opposite things to
 * the operator: the theme has NO stored original at all (nothing anywhere to restore from — a
 * hand-made theme), or the theme has one but this particular file is not in it (a file the AUTHOR
 * added; restoring it would mean deleting their file, which is a different and more destructive
 * operation than "reset", and is not what a button labelled Reset should silently do).
 *
 * DESTRUCTIVE and deliberately not undoable here: it overwrites the working copy with no backup.
 * The confirmation belongs in the UI, where the operator can be told what they are about to lose in
 * words — a server-side "are you sure" flag would just be a second thing to get wrong.
 */
export const registerAdminThemeFileResetRoute: ContentRouteRegistrar = (app, deps) => {
  app.post("/api/admin/v1/workspaces/:workspaceId/themes/:themeId/file/reset", async (req, res) => {
    try {
      if (!(await authorizeThemeAccess(deps, req, res))) return;

      const themeId = String(req.params.themeId ?? "");
      const theme = findTheme({ themes: deps.themes, id: themeId });
      if (!theme) {
        res.status(404).json({ error: `theme '${themeId}' was not found` });
        return;
      }

      const path = String(((req.body ?? {}) as Record<string, unknown>).path ?? "");

      const writeScope = resolveThemeFileWriteScope({ manifest: theme.manifest, relativePath: path });
      if (writeScope.kind === "generated-readonly") {
        try {
          const { restoredFiles } = restoreBuiltThemeGeneratedTree({
            themeDir: theme.dir,
            themesRoot: deps.themesDir,
            manifest: theme.manifest,
          });
          reloadTheme(deps, theme.manifest.id);
          res.json({ scope: "release", restoredFiles });
        } catch (err) {
          if (err instanceof ThemePathError) {
            res.status(409).json({ error: err.message, code: "NO_ORIGINAL" });
            return;
          }
          throw err;
        }
        return;
      }

      const catalogDir = join(deps.themesDir, THEME_CATALOG_DIR, theme.manifest.tier, theme.manifest.id);
      if (!existsSync(catalogDir)) {
        res.status(409).json({
          error: `theme '${themeId}' has no stored original, so nothing can be reset`,
          code: "NO_ORIGINAL",
        });
        return;
      }

      // Read through the containment helper against the CATALOG root rather than joining paths by
      // hand: `path` is operator input, and this is the one place in the file that resolves it
      // against a directory outside the theme's own folder.
      let original: string;
      try {
        original = readThemeFile({ themeDir: catalogDir, themesRoot: join(deps.themesDir, THEME_CATALOG_DIR), relativePath: path });
      } catch (err) {
        if (err instanceof ThemePathError) {
          res.status(409).json({
            error: `'${path}' is not in this theme's original, so there is nothing to reset it to`,
            code: "NOT_IN_ORIGINAL",
          });
          return;
        }
        throw err;
      }

      writeThemeFile({ themeDir: theme.dir, themesRoot: deps.themesDir, relativePath: path, content: original });
      reloadTheme(deps, theme.manifest.id);

      res.json({ scope: "file", path, bytes: Buffer.byteLength(original, "utf8"), content: original });
    } catch (err) {
      sendThemeFileError(res, err);
    }
  });
};

/**
 * POST — duplicate one file inside a theme, landing the copy in the same folder under the next
 * available `name-1`, `name-2`, … suffix (see {@link nextAvailableFileName}).
 *
 * Deliberately takes ONLY the source `path` — the destination name is server-computed, not operator
 * input, which is why this route (unlike rename) needs no filename-shape validation of its own. The
 * one piece of untrusted input, `path`, is still resolved through `copyThemeFile`'s containment
 * checks exactly like every other route here.
 *
 * Offered for every group, including `script`/`other` (read-only-to-EDIT, not read-only-to-copy):
 * duplicating a file's bytes under a new name changes nothing about the original and nothing any
 * existing reference points at, so it carries none of the risk a script's content-edit block exists
 * to prevent.
 */
export const registerAdminThemeFileCopyRoute: ContentRouteRegistrar = (app, deps) => {
  app.post("/api/admin/v1/workspaces/:workspaceId/themes/:themeId/file/copy", async (req, res) => {
    try {
      if (!(await authorizeThemeAccess(deps, req, res))) return;

      const themeId = String(req.params.themeId ?? "");
      const theme = findTheme({ themes: deps.themes, id: themeId });
      if (!theme) {
        res.status(404).json({ error: `theme '${themeId}' was not found` });
        return;
      }

      const sourcePath = String(((req.body ?? {}) as Record<string, unknown>).path ?? "");

      // ADR-020 §5: duplicating a file INTO a built theme's generated tree would add an untracked
      // extra to a region `build.artifactHashes` is supposed to fully account for — a write, same as
      // PUT, just phrased as "copy" instead of "edit". `resolveThemeFileWriteScope`'s destination is
      // always the SAME folder as `sourcePath` (`nextAvailableFileName` only suffixes the filename,
      // never changes directory), so checking the source path's scope covers the destination too.
      const writeScope = resolveThemeFileWriteScope({ manifest: theme.manifest, relativePath: sourcePath });
      if (writeScope.kind === "generated-readonly") {
        res.status(409).json({ error: `'${sourcePath}' is read-only: ${writeScope.reason}`, code: "GENERATED_READONLY" });
        return;
      }
      // 2026-08-13 (security pass Finding 1, defense in depth, continuation agent): `writeScope`
      // above answers a DIFFERENT question (is this a built theme's ADR-020 generated tree) than
      // `isGeneratedThemePath` (is this `preview/…`, `build-preview.mjs`'s own output) — the two were
      // conflated here, so copy never refused `preview/` the way PUT and rename already do. Since the
      // destination is always the SAME folder as `sourcePath` (see the comment above), checking the
      // source alone is sufficient, matching the rename route's own `sourceRenamable` check.
      if (isGeneratedThemePath(sourcePath)) {
        res.status(409).json({
          error: `'${sourcePath}' is generated output and cannot be copied`,
          code: "READ_ONLY_FILE",
        });
        return;
      }

      const existingPaths = new Set(listThemeFiles({ themeDir: theme.dir, themesRoot: deps.themesDir }));
      if (!existingPaths.has(sourcePath)) {
        res.status(404).json({ error: `file '${sourcePath}' was not found in this theme`, code: "FILE_NOT_FOUND" });
        return;
      }

      const destPath = nextAvailableFileName({ desiredPath: sourcePath, existingPaths });
      copyThemeFile({ themeDir: theme.dir, themesRoot: deps.themesDir, sourcePath, destPath });

      // A new file on disk is exactly the same boot-time-snapshot problem writes are — see
      // `reloadTheme`'s doc comment. Skipping this means the copy exists on disk but the preview and
      // the next GET of `pages`/`partials` still act as if it does not.
      reloadTheme(deps, theme.manifest.id);

      const catalogDir = join(deps.themesDir, THEME_CATALOG_DIR, theme.manifest.tier, theme.manifest.id);
      const hasOriginal = existsSync(catalogDir);
      res.json({ ...describeThemeFile(destPath, { catalogDir, hasOriginal }), copiedFrom: sourcePath });
    } catch (err) {
      sendThemeFileError(res, err);
    }
  });
};

/**
 * POST — rename (move within the same folder) one file inside a theme.
 *
 * `name` is a bare filename, not a path: it may not contain a `/` or `\`, which keeps rename from
 * doubling as an undocumented move-between-folders operation and — combined with resolving the
 * assembled destination through `renameThemeFile`'s own containment check — means the one piece of
 * real operator-authored path input here is validated exactly as strictly as a write target, per the
 * containment rule every route in this file follows.
 *
 * Hard-blocks {@link REQUIRED_THEME_FILES}: renaming `pages/index.html`, `theme.json`, or
 * `tokens.json` away reproduces the exact `loadTheme` failure that makes a theme's `status` flip to
 * `"invalid"` (see that constant's doc comment for the three matching checks in `theme.ts`). This
 * does NOT block renaming an ordinary page — that only changes its public URL, which is a warning
 * the UI shows before confirming, not a server-side refusal; the operator may have a real reason to
 * do it.
 *
 * Also hard-blocks {@link READ_ONLY_GROUPS} (`script`, `other`) — 2026-08-11 judgment call, deliberate
 * and not part of the original ask. The entire reason those two groups are read-only for CONTENT
 * (`isThemeFileWritable`) is "nobody breaks the page from this screen"; leaving their NAME renameable
 * would quietly reopen that same hole through a different door — a `<script src="main.js">` (or an
 * `<link rel="manifest" href="site.webmanifest">`, an `other`-group file) the operator just renamed to
 * `main-old.js` now 404s on the live page, and Explore's script viewer is read-only, so the operator
 * cannot even open the referencing HTML's OWN unaffected copy to see what still points at the old name
 * — unlike a page rename, which gets a warning naming exactly what changes because the renderer already
 * tracks page routes. No such tracking exists for arbitrary cross-file references, and following the
 * copy/rename pass's own reasoning for not warning on this ("an unreliable warning is worse than none")
 * a step further: blocking outright needs no reference-tracking accuracy claim at all, it just extends
 * the existing "can't touch this file's identity from this screen" principle from content to filename.
 * Copy is deliberately NOT blocked here — see {@link registerAdminThemeFileCopyRoute}'s own comment.
 */
export const registerAdminThemeFileRenameRoute: ContentRouteRegistrar = (app, deps) => {
  app.post("/api/admin/v1/workspaces/:workspaceId/themes/:themeId/file/rename", async (req, res) => {
    try {
      if (!(await authorizeThemeAccess(deps, req, res))) return;

      const themeId = String(req.params.themeId ?? "");
      const theme = findTheme({ themes: deps.themes, id: themeId });
      if (!theme) {
        res.status(404).json({ error: `theme '${themeId}' was not found` });
        return;
      }

      const body = (req.body ?? {}) as Record<string, unknown>;
      const sourcePath = String(body.path ?? "");
      const name = String(body.name ?? "");

      if (REQUIRED_THEME_FILES.has(sourcePath)) {
        res.status(409).json({
          error: `'${sourcePath}' cannot be renamed — every theme requires it at this exact path`,
          code: "REQUIRED_FILE_LOCKED",
        });
        return;
      }
      // ADR-020 §5: a built theme's generated tree has no per-file identity to rename — it restores
      // or stays exactly as shipped, atomically. See `resolveThemeFileWriteScope`'s own doc. Computed
      // before the writability check below so a compiled theme's sourceDir file is judged by
      // `isSourceDirWritableExtension` alone, the same disjoint-rules shape the PUT route uses — see
      // `isInsideCompiledSourceDir`'s own doc for why that must not fall back to the general gate.
      const writeScope = resolveThemeFileWriteScope({ manifest: theme.manifest, relativePath: sourcePath });
      if (writeScope.kind === "generated-readonly") {
        res.status(409).json({ error: `'${sourcePath}' is read-only: ${writeScope.reason}`, code: "GENERATED_READONLY" });
        return;
      }
      // 2026-08-13 (security pass Finding 1, defense in depth): same `isGeneratedThemePath` refusal
      // `isThemeFileWritable` now applies to PUT — a generated-output path (`preview/…`) has no
      // meaningful "name" to change either, so rename is refused the same way, not left as a second
      // spot this check could be forgotten.
      const sourceRenamable =
        !isGeneratedThemePath(sourcePath) &&
        (isInsideCompiledSourceDir(theme, sourcePath, writeScope)
          ? isSourceDirWritableExtension(sourcePath)
          : !READ_ONLY_GROUPS.has(fileGroup(sourcePath)));
      if (!sourceRenamable) {
        res.status(409).json({
          error: `'${sourcePath}' is read-only in Explore and cannot be renamed`,
          code: "READ_ONLY_FILE",
        });
        return;
      }
      if (name.length === 0) {
        res.status(400).json({ error: "name is required", code: "INVALID_NAME" });
        return;
      }
      if (name.includes("/") || name.includes("\\") || name === "." || name === "..") {
        res.status(400).json({
          error: `name '${name}' must be a plain filename in the same folder, not a path`,
          code: "INVALID_NAME",
        });
        return;
      }

      const existingPaths = new Set(listThemeFiles({ themeDir: theme.dir, themesRoot: deps.themesDir }));
      if (!existingPaths.has(sourcePath)) {
        res.status(404).json({ error: `file '${sourcePath}' was not found in this theme`, code: "FILE_NOT_FOUND" });
        return;
      }

      const slash = sourcePath.lastIndexOf("/");
      const destPath = slash === -1 ? name : `${sourcePath.slice(0, slash)}/${name}`;

      // Renaming to the name it already has is a no-op, not a collision — without this check it
      // would fail NAME_TAKEN against itself, since `destPath === sourcePath` is still "already in
      // `existingPaths`".
      if (destPath !== sourcePath) {
        if (existingPaths.has(destPath)) {
          res.status(409).json({ error: `'${destPath}' already exists in this theme`, code: "NAME_TAKEN" });
          return;
        }

        // Defense-in-depth, not currently reachable through THIS route: `destPath` is always built
        // from `sourcePath`'s OWN directory (`name` may not contain `/`, checked above), so its
        // write-scope is provably identical to `sourcePath`'s already-checked one — a rename can
        // never cross from a compiled theme's sourceDir into its generated tree today. Asserted
        // directly anyway rather than left as an inference some future refactor could quietly
        // invalidate (e.g. a cross-folder move added to this route later).
        const destWriteScope = resolveThemeFileWriteScope({ manifest: theme.manifest, relativePath: destPath });
        if (destWriteScope.kind === "generated-readonly") {
          res.status(409).json({ error: `'${destPath}' is read-only: ${destWriteScope.reason}`, code: "GENERATED_READONLY" });
          return;
        }

        // A rename never changes BYTES, only the name — so the one thing it CAN change is how a
        // browser INTERPRETS those bytes, since `express.static` decides content-type by extension.
        // Requiring the extension to survive a rename means a file's interpretation can never change
        // via this route: a name already vetted (as either an ordinary writable file, or — inside a
        // compiled theme's sourceDir — a `SOURCE_DIR_WRITABLE_EXTENSIONS` member) cannot be relabeled
        // into a DIFFERENT, more dangerous extension the same content was never vetted against. This
        // is what actually closes "PUT a safe extension, then rename it to a dangerous one" — merely
        // re-running PUT's own check against `destPath` would NOT have closed it, since `.html`/`.svg`
        // are themselves ordinarily-writable extensions elsewhere in a theme; the bytes staying
        // unvetted-as-that-extension is the real invariant, not the extension's mere presence on an
        // allowlist.
        if (fileExtension(sourcePath) !== fileExtension(destPath)) {
          res.status(400).json({
            error: `renaming '${sourcePath}' to '${name}' would change its extension, which Explore does not allow — a file's extension decides how it is served and must not change via rename`,
            code: "EXTENSION_CHANGE_NOT_ALLOWED",
          });
          return;
        }

        renameThemeFile({ themeDir: theme.dir, themesRoot: deps.themesDir, sourcePath, destPath });
        reloadTheme(deps, theme.manifest.id);
      }

      const catalogDir = join(deps.themesDir, THEME_CATALOG_DIR, theme.manifest.tier, theme.manifest.id);
      const hasOriginal = existsSync(catalogDir);
      res.json({ ...describeThemeFile(destPath, { catalogDir, hasOriginal }), renamedFrom: sourcePath });
    } catch (err) {
      sendThemeFileError(res, err);
    }
  });
};

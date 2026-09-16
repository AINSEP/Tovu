import { existsSync } from "node:fs";
import { join } from "node:path";

import type { Response } from "express";

import {
  findTheme,
  loadTheme,
  THEME_CATALOG_DIR,
  type DiscoveredTheme,
  copyThemeFile,
  deleteThemeFile,
  isGeneratedThemePath,
  isPageFilePath,
  isPartialFilePath,
  isPublishableThemePageCandidate,
  isStandaloneThemePage,
  listThemeFiles,
  MAX_THEME_FILE_BYTES,
  readThemeFile,
  renameThemeFile,
  resetThemeFileToOriginal,
  resolveThemeFileWriteScope,
  restoreBuiltThemeGeneratedTree,
  themeFileDiffersFromOriginal,
  themeOriginalResetRefusal,
  writeThemeFile,
  ThemePathError,
  readThemeLineageFile,
  type ThemeFileWriteScope,
  // The shared "can this file's identity/content change" gate pieces — extracted (2026-08-30) into
  // `file-identity-lock.ts` so `features/theme/tool-registrations.ts`'s `theme_rename_file`/
  // `theme_delete_file` can call the exact same decision this file's own rename/delete routes call.
  // See that module's own header for why this had to move rather than be reached by a deep import.
  fileGroup,
  fileExtension,
  isInsideCompiledSourceDir,
  isSourceDirWritableExtension,
  isTrashedThemePath,
  validateFileIdentityChange,
  type ThemeFileGroup,
  // Moved to `theme-files.ts` (2026-09-12) so `tool-registrations.ts`'s `theme_copy_file` agent tool
  // can reuse the identical collision-avoidance the HTTP copy route below already relies on — see
  // that function's own doc for why this had to move rather than be reached by a deep import.
  nextAvailableFileName,
} from "#src/features/theme/index";

// Re-exported so `explore-pure-helpers.unit.test.ts`'s existing direct import (`fileExtension` from
// `../explore.js`) keeps working unchanged — this file no longer DEFINES `fileExtension`, it only
// re-publishes the shared one, purely for that test's import path. `nextAvailableFileName` is
// re-exported for the identical reason: `integration/explore.integration.test.ts` still imports it
// directly from this module.
export { fileExtension, nextAvailableFileName };
import { isTrashed, type PostKind, type PostRecord } from "#src/features/post/index";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { ContentRouteDeps } from "../content/deps.js";
import type { ContentRouteRegistrar } from "../content/deps.js";

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

/**
 * The `theme.set` permission check alone — every route on this resource needs this; only the
 * `/api/admin/v1/workspaces/:workspaceId/...` routes below ALSO need {@link authorizeThemeAccess}'s
 * workspace-path-param comparison on top of it. Exported (2026-08-12, `.liquid` Preview-tab fix) so
 * `middleware/theme-page-preview.ts`'s templated-theme preview route can apply the SAME gate — that
 * route has no `:workspaceId` in its own URL (it lives at `/theme-explore/...`, matching its sibling
 * static-preview route's shape, not under `/api/admin/v1/workspaces/...`), so it has nothing to
 * compare a path param against and only needs this half. One definition rather than two independently
 * written permission checks that could drift apart — exactly the class of gap this subsystem's own
 * security passes kept finding.
 */
export async function authorizeThemeSetPermission(
  deps: Pick<ContentRouteDeps, "workspaceId" | "authorize">,
  res: Response
): Promise<boolean> {
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
  return authorizeThemeSetPermission(deps, res);
}

/** Resolves `:themeId` to a discovered theme, or writes the route's standard 404 and returns
 *  `undefined` — every route below starts with this exact `:themeId` -> `DiscoveredTheme` lookup. */
function findThemeOrRespond(
  deps: ContentRouteDeps,
  req: { params: Record<string, unknown> },
  res: Response
): DiscoveredTheme | undefined {
  const themeId = String(req.params.themeId ?? "");
  const theme = findTheme({ themes: deps.themes, id: themeId });
  if (!theme) {
    res.status(404).json({ error: `theme '${themeId}' was not found` });
    return undefined;
  }
  return theme;
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
export function reloadTheme(deps: ContentRouteDeps, themeId: string): void {
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
 *
 * `.liquid` (2026-08-12, owner-reported): a `templated`-tier theme's `templates/*.liquid` files are
 * UTF-8 source same as everything else here — this set predates `.liquid` templates being explorable
 * at all, so it never listed them, and the theme-detail LISTING route reported `readable: false` for
 * every one while the GET-file route (`readThemeFile`, unconditioned on extension) already returned
 * their content correctly. That mismatch was patched client-side first
 * (`use-theme-explore.hooks.ts`'s now-removed `mapDetailFiles` override) as the fastest fix for the
 * reported symptom (a `.liquid` click downloading instead of previewing); moved here once the owner
 * confirmed the server should be the single source of truth, so every consumer of this listing route
 * — not just `ThemeExplore.tsx` — agrees a `.liquid` file is readable. `.liquid` stays OUT of
 * {@link isThemeFileWritable}'s allowlist unchanged: it lands in the `other` group ({@link fileGroup}
 * has no `templates/` case), and `other` is one of {@link CONTENT_EDIT_LOCKED_GROUPS} — this only
 * fixes READABILITY, never PUT.
 */
const TEXT_READABLE_EXTENSIONS = new Set([
  ".html", ".css", ".js", ".mjs", ".cjs", ".json", ".md", ".txt", ".svg", ".webmanifest", ".liquid",
]);

function isTextReadable(relativePath: string): boolean {
  const dot = relativePath.lastIndexOf(".");
  return dot === -1 ? false : TEXT_READABLE_EXTENSIONS.has(relativePath.slice(dot).toLowerCase());
}

/**
 * Every group {@link fileGroup} can return — re-exported under its original name so the response
 * type and the client's file-list grouping keep sharing one vocabulary. The actual definition moved
 * to `features/theme/file-identity-lock.ts` (2026-08-30, as `ThemeFileGroup`) once
 * `tool-registrations.ts`'s `theme_rename_file`/`theme_delete_file` also needed it — see that
 * module's own header for why.
 */
export type ThemeExploreFileGroup = ThemeFileGroup;

/**
 * Groups that are never writable (PUT) or resettable-by-content — as opposed to
 * {@link import("#src/features/theme/index").IDENTITY_LOCKED_GROUPS}, which governs whether a
 * file's NAME or EXISTENCE can change (rename/delete) — regardless of whether their extension is
 * otherwise text-readable.
 *
 * `other`: the catch-all group (`.md`, `.txt`, `.webmanifest`, stray files) was never a group an
 * author was asked to edit from this screen; it existed by omission (falling into `asset`) rather
 * than by design, and making it explicitly read-only is more honest than accidentally writable.
 *
 * `script` is deliberately NOT here (2026-08-29 owner ask, reversing the 2026-08-11 one recorded in
 * this constant's git history: "we need the ability to edit CSS and JS for the themes"). Re-examined
 * rather than just reverted: the 2026-08-11 exclusion was a stated PREFERENCE ("I don't want JS
 * edited from this screen"), not a security boundary — the `theme_write_file` AGENT tool
 * (`tool-registrations.ts`) has always written a `.js` file in an authored theme with zero group-based
 * restriction (only path containment and the size ceiling), and an admin who already holds `theme.set`
 * can already inject arbitrary `<script>` content through any editable page/partial's HTML. Making
 * script content editable here closes that human/agent capability gap rather than opening a new one.
 * A compiled theme's generated-tree `.js` stays locked regardless — {@link resolveThemeFileWriteScope}
 * refuses it before this set is ever consulted — and a compiled theme's `sourceDir` `.js` stays locked
 * too, via `file-identity-lock.ts`'s own, deliberately narrower, `SOURCE_DIR_WRITABLE_EXTENSIONS`
 * allowlist (browser-executable-content risk, unrelated to this group question). See
 * {@link import("#src/features/theme/index").IDENTITY_LOCKED_GROUPS} for why `script`'s NAME still
 * cannot change even though its content now can.
 */
const CONTENT_EDIT_LOCKED_GROUPS: ReadonlySet<ThemeExploreFileGroup> = new Set(["other"]);

/**
 * Whether a file can be saved (PUT) or reset — the narrower of the two questions
 * {@link isTextReadable} used to answer alone. A file must be text-readable AND not in a
 * {@link CONTENT_EDIT_LOCKED_GROUPS} group AND not inside a generated directory to be writable: `.svg`
 * (asset group, text-readable) stays writable exactly as before.
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
 *
 * 2026-08-30 (soft-delete): also refuses anything {@link isTrashedThemePath} claims — a file inside
 * `.trash/` is meant to be inert until `theme_restore_trashed_file` (or a future human restore
 * affordance) moves it back out; writing it in place through PUT would be a second, unaudited way to
 * mutate soft-deleted content, the exact "hidden state nothing else knows about" failure mode the
 * earlier `_unpublished/` convention was removed for.
 */
function isThemeFileWritable(relativePath: string, apiVersion: 2 | undefined): boolean {
  return (
    isTextReadable(relativePath) &&
    !CONTENT_EDIT_LOCKED_GROUPS.has(fileGroup(relativePath, apiVersion)) &&
    !isGeneratedThemePath(relativePath) &&
    !isTrashedThemePath(relativePath)
  );
}

/**
 * The page id a `page`-group path names — its own filename, minus `.html` — matching
 * {@link DiscoveredTheme.pages}' own keys (`theme.ts`: `file.slice(0, -".html".length)` off
 * `readdirSync(pagesDir)`, which never sees a nested path). Not a general basename helper: only ever
 * called on a path {@link fileGroup} already classified `"page"`.
 */
function pageIdForPagePath(relativePath: string): string {
  const base = relativePath.slice(relativePath.lastIndexOf("/") + 1);
  return base.endsWith(".html") ? base.slice(0, -".html".length) : base;
}

/** The live (published, non-trashed) content record occupying a theme page's own slug — the shape
 *  {@link ThemeExploreFile.collidingContent} (admin `use-theme-explore.hooks.ts`) mirrors on the
 *  wire. Named separately from {@link describeThemeFile}'s own inline return type only because
 *  {@link contentRecordsBySlug} below needs the identical shape for its `Map`'s value type, and
 *  respelling it a second time is exactly the drift risk a shared type exists to remove. */
type ThemeFileContentCollision = { id: string; slug: string; title: string; kind: PostKind };

/**
 * One slug -> live content record lookup for an ENTIRE file listing, built from a SINGLE
 * `postRepo.list()` call — never one `findBySlug` per theme page file. That per-file shape is the
 * identical N+1 an `urlFor`-per-row bug was just fixed for elsewhere in this codebase
 * (`platform/routing`); this function exists so `describeThemeFile` never has to repeat it.
 *
 * Mirrors `resolveMarketingPageOrOverride`'s own collision-candidate filter (`server/inbound/
 * public-http/routes/site/pages.ts`, via `getPublishedPostBySlug`): only a PUBLISHED, non-trashed
 * row can ever actually win a slug collision on the live site, so a draft or trashed row at the
 * same slug is deliberately NOT reported here either — surfacing a "collision" the live resolver
 * would never honor would train the operator to distrust a warning that turns out to mean nothing.
 *
 * @complexity O(p) in the workspace's post/page count — one pass, no per-file work.
 */
function contentRecordsBySlug(posts: readonly PostRecord[]): Map<string, ThemeFileContentCollision> {
  const bySlug = new Map<string, ThemeFileContentCollision>();
  for (const post of posts) {
    if (post.status !== "published" || isTrashed(post)) continue;
    bySlug.set(post.slug, { id: post.id, slug: post.slug, title: post.title, kind: post.kind });
  }
  return bySlug;
}

/** Shared by the copy/rename routes' single-file {@link describeThemeFile} call below — neither
 *  response's `collidingContent` is ever read by the client (`ThemeExplorePort.copyThemeFile`/
 *  `renameThemeFile` type only `{ path }`; the hook always refetches the whole detail afterward for
 *  everything else, see that port file's own doc), so those two routes pass this empty map rather
 *  than paying for a `postRepo.list()` call whose result would never be observed. */
const NO_CONTENT_COLLISIONS: ReadonlyMap<string, ThemeFileContentCollision> = new Map();

/**
 * Whether files in `theme` can be compared against, and reset from, its catalog original at all: the
 * catalog folder exists and {@link themeOriginalResetRefusal} accepts it. Computed once per response,
 * never per file, and fed to {@link describeThemeFile} so `resettable`/`modified` agree with what the
 * reset route will actually do.
 *
 * @complexity O(s) in the two `theme.json` sizes.
 */
function originalComparableForReset(theme: DiscoveredTheme, catalogDir: string): boolean {
  return existsSync(catalogDir) && themeOriginalResetRefusal({ themeDir: theme.dir, originalDir: catalogDir }) === null;
}

/**
 * {@link describeThemeFile}'s `modified` field: whether the live file's bytes differ from its catalog
 * original, or `null` when there is no comparable original (see {@link originalComparableForReset}) or
 * the catalog has no regular file at this path. A real byte comparison (`themeFileDiffersFromOriginal`,
 * `theme-files.ts`), so a CRLF-vs-LF difference counts as modified.
 *
 * Nothing is cached: the live side can change from any writer (this screen, an agent tool running in
 * another process, a hand edit), so every detail request re-reads it.
 *
 * Also `null` when the comparison throws for this one file: either side cannot be read (e.g. `EACCES`
 * on a same-size file) or the live path fails its stat. That file then lists as `resettable: false`,
 * and the rest of the listing still returns; before, one unreadable file made the whole list a 500.
 *
 * @complexity O(1) when there is no original or the sizes differ; O(s) in the file size when the sizes
 * match. Across a detail listing that is O(total bytes) of same-size files with an original.
 */
function fileModifiedFromOriginal(
  relativePath: string,
  options: { catalogDir: string; comparableOriginal: boolean; themesDir: string; theme: DiscoveredTheme }
): boolean | null {
  if (!options.comparableOriginal) return null;
  try {
    return themeFileDiffersFromOriginal({
      themeDir: options.theme.dir,
      themesRoot: options.themesDir,
      originalDir: options.catalogDir,
      originalsRoot: join(options.themesDir, THEME_CATALOG_DIR),
      relativePath,
    });
  } catch {
    return null;
  }
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
 *
 * `published` (2026-08-30) is `null` for every file this question does not apply to at all — every
 * non-page file, plus a page-group file that is `index`/`404` or a declared
 * {@link import("#src/features/theme/index").isPublishableThemePageCandidate} shell — so the Explore
 * screen can tell "no publish control for this file" apart from an actual off state. Only a real
 * candidate page gets `true`/`false`, from {@link isStandaloneThemePage} itself, so this can never
 * drift from what public routing actually does.
 *
 * `collidingContent` (2026-08-30) answers a DIFFERENT question that turned out to matter just as
 * much: a page can read `published: true` here and still not be what a visitor gets — or read
 * `published: false` and still resolve to someone ELSE's content — because `resolveMarketingPageOrOverride`
 * (`pages.ts`) lets a live Post/Page row at the same slug win independent of this toggle (see that
 * function's own doc for the exact precedence, which this field only OBSERVES and never changes).
 * Gated on the SAME `isPublishableThemePageCandidate` check as `published` — deliberately NOT
 * combined into one shared local (would need `pageId` re-narrowed past a `boolean` intermediate,
 * trading a one-line duplicate condition for a cast) — so the two fields can never drift on which
 * files the question applies to.
 *
 * `modified` (2026-09-12, owner decision) is whether the live file's bytes differ from its catalog
 * original — see {@link fileModifiedFromOriginal}. It is `null` exactly when `resettable` is false:
 * with no catalog copy of the file there is nothing to compare against, so "modified" has no answer
 * rather than a `false` that would read as "untouched". `resettable` is derived from the same
 * comparison, so it now also requires the catalog entry to be a regular file, not merely a path that
 * exists. Both are also `false`/`null` for every file of a theme whose original the reset route would
 * refuse (`comparableOriginal: false`, e.g. an original saved under another layout version).
 */
function describeThemeFile(
  relativePath: string,
  options: {
    catalogDir: string;
    comparableOriginal: boolean;
    themesDir: string;
    apiVersion: 2 | undefined;
    theme: DiscoveredTheme;
    contentBySlug: ReadonlyMap<string, ThemeFileContentCollision>;
  }
): {
  path: string;
  group: ThemeExploreFileGroup;
  readable: boolean;
  editable: boolean;
  resettable: boolean;
  modified: boolean | null;
  published: boolean | null;
  collidingContent: ThemeFileContentCollision | null;
} {
  const group = fileGroup(relativePath, options.apiVersion);
  const pageId = group === "page" ? pageIdForPagePath(relativePath) : null;
  const modified = fileModifiedFromOriginal(relativePath, options);
  return {
    path: relativePath,
    group,
    readable: isTextReadable(relativePath),
    editable: isThemeFileWritable(relativePath, options.apiVersion),
    // Whether THIS file can be reset — a file the author added themselves (including a fresh copy)
    // has no original to go back to, and offering a Reset that would fail is worse than not
    // offering one. `modified` is `null` for exactly those files.
    resettable: modified !== null,
    modified,
    published:
      pageId !== null && isPublishableThemePageCandidate(options.theme, pageId)
        ? isStandaloneThemePage(options.theme, pageId)
        : null,
    collidingContent:
      pageId !== null && isPublishableThemePageCandidate(options.theme, pageId)
        ? options.contentBySlug.get(pageId) ?? null
        : null,
  };
}

/** A JSON request body coerced to a plain object — `{}` for a missing/`null`/non-object body,
 *  matching every mutating route below's existing lenient handling of an absent body. */
export function bodyRecord(body: unknown): Record<string, unknown> {
  return (body ?? {}) as Record<string, unknown>;
}

/** One string field off a JSON body, defaulting to `""` when the body itself or the field is
 *  missing/non-string — the same coercion `path`/`name`/etc. already applied inline at each call
 *  site below, pulled into one definition so it is applied identically everywhere. */
export function bodyStringField(body: unknown, field: string): string {
  return String(bodyRecord(body)[field] ?? "");
}

/** GET one theme's detail — what the Explore screen lists and what its banner says. */
export const registerAdminThemeDetailRoute: ContentRouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/themes/:themeId", async (req, res) => {
    try {
      if (!(await authorizeThemeAccess(deps, req, res))) return;

      const theme = findThemeOrRespond(deps, req, res);
      if (!theme) return;

      // `lineage` is written by the copy/download flows into its own install-local sidecar file
      // (`theme-lineage.ts`), never into `theme.json`/`ThemeManifest` — it is metadata about where a
      // copy came from, never anything the renderer resolves, and putting it on the manifest would
      // both invite exactly the runtime-inheritance reading the copy model exists to remove AND fail
      // a strict v2 manifest schema's `additionalProperties: false` check (2026-08-18 schema decision).
      const lineage = readThemeLineageFile({ themeDir: theme.dir });

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
      // Once for the whole listing: whether any file here can be reset from that original.
      const comparableOriginal = originalComparableForReset(theme, catalogDir);
      // ONE batched lookup for the WHOLE listing below, not one `findBySlug` per file — see
      // `contentRecordsBySlug`'s own doc for why that per-file shape must never come back.
      const contentBySlug = contentRecordsBySlug(await deps.postRepo.list({ workspaceId: deps.workspaceId }));
      // `isGeneratedThemePath` (`theme-files.ts`) — the shared definition of "this is
      // `build-preview.mjs` output, not real theme source"; see its own doc comment for why.
      // `isTrashedThemePath` (2026-08-30, soft-delete): a file an agent moved into `.trash/` via
      // `theme_trash_file` must not surface as a file-list entry here either — trash is trash for a
      // human operator too, not only for the agent that put it there.
      const files = listThemeFiles({ themeDir: theme.dir, themesRoot: deps.themesDir })
        .filter((path) => !isGeneratedThemePath(path) && !isTrashedThemePath(path))
        .map((path) =>
          describeThemeFile(path, {
            catalogDir,
            comparableOriginal,
            themesDir: deps.themesDir,
            apiVersion: theme.manifest.apiVersion,
            theme,
            contentBySlug,
          })
        );

      res.json({
        id: theme.manifest.id,
        name: theme.manifest.name,
        tier: theme.manifest.tier,
        // 2026-08-19 architecture audit findings 1 & 2 — the admin SPA's own rename-lock check
        // (`use-theme-explore.hooks.ts`) needs this to resolve the SAME apiVersion-aware layout the
        // server just used to build `files` above, via the shared `@tovu/theme-layout` resolver.
        apiVersion: theme.manifest.apiVersion,
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

      const theme = findThemeOrRespond(deps, req, res);
      if (!theme) return;

      const path = String((req.query as Record<string, unknown>).path ?? "");
      const content = readThemeFile({ themeDir: theme.dir, themesRoot: deps.themesDir, relativePath: path });
      res.json({ path, content });
    } catch (err) {
      sendThemeFileError(res, err);
    }
  });
};

/** The PUT body's `path`/`content` fields, validated just enough to know `content` is writable
 *  text — `ok: false` covers only the one shape check this route 400s on (`content` not a string);
 *  every other validation (writability, generated-tree, …) happens once `path`/`content` exist.
 *  `overwriteOversized` is true only for the boolean `true`; any other value, the string "true"
 *  included, keeps `writeThemeFile`'s refusal to replace a file past the read limit. The admin editor
 *  never sends it. */
function parseThemeFilePutBody(
  req: { body: unknown }
): { ok: true; path: string; content: string; overwriteOversized: boolean } | { ok: false } {
  const path = bodyStringField(req.body, "path");
  const body = bodyRecord(req.body);
  if (typeof body.content !== "string") return { ok: false };
  return { ok: true, path, content: body.content, overwriteOversized: body.overwriteOversized === true };
}

/**
 * Whether `path` can be saved (PUT) inside `theme`, given its already-resolved write scope.
 *
 * Enforced here, not only by the client hiding the Save button — a PUT built by hand (or by an
 * older cached client) must be refused the same way. Two DISJOINT rules, not one gate OR'd with
 * another: inside a compiled theme's sourceDir, ONLY `isSourceDirWritableExtension` decides — see
 * `isInsideCompiledSourceDir`'s own doc for why falling back to the general `isThemeFileWritable`
 * gate here would silently readmit extensions (`.svg`, classified `asset` — never read-only, with
 * no notion of location) the sourceDir allowlist exists to exclude. Everywhere else,
 * `isThemeFileWritable` is unchanged.
 *
 * 2026-08-13: `!isGeneratedThemePath` is applied to the sourceDir branch too, NOT folded into
 * `isSourceDirWritableExtension` — the disjointness above is about WHICH EXTENSIONS are writable,
 * and `preview/` is a location refusal that outranks both rules rather than a third opinion OR'd
 * into either. It has to be checked here because the original security-pass fix put this refusal
 * inside `isThemeFileWritable`, reasoning it was better there than "a second, easy-to-forget check
 * at each call site" — but the sourceDir branch deliberately never calls that gate, so a compiled
 * theme's PUT was left with an extension allowlist that knows nothing about `preview/`, and a
 * `sourceDir: "preview"` manifest wrote straight into it (200, on disk). rename/copy/reset each
 * already carry their own explicit refusal; this makes PUT match. The deeper fix — a conformance
 * rule forbidding `build.sourceDir` from naming a GENERATED_THEME_DIRS entry at install time — now
 * exists too: `isSourceDirGeneratedConflict` (`theme-files.ts`), enforced in `loadTheme()`
 * (`theme.ts`, the `build.source === "compiled"` manifest check) so a conflicting manifest is
 * refused at load, not only caught per-write here.
 */
function isPutWritable(theme: DiscoveredTheme, path: string, writeScope: ThemeFileWriteScope): boolean {
  return (
    !isGeneratedThemePath(path) &&
    (isInsideCompiledSourceDir(theme, path, writeScope)
      ? isSourceDirWritableExtension(path)
      : isThemeFileWritable(path, theme.manifest.apiVersion))
  );
}

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

      const theme = findThemeOrRespond(deps, req, res);
      if (!theme) return;

      const parsedBody = parseThemeFilePutBody(req);
      if (!parsedBody.ok) {
        res.status(400).json({ error: "content must be a string", code: "INVALID_BODY" });
        return;
      }
      const { path, content } = parsedBody;

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

      if (!isPutWritable(theme, path, writeScope)) {
        res.status(403).json({
          error: `'${path}' is read-only in Explore and cannot be saved`,
          code: "READ_ONLY_FILE",
        });
        return;
      }

      writeThemeFile(
        { themeDir: theme.dir, themesRoot: deps.themesDir, relativePath: path, content },
        { overwriteOversized: parsedBody.overwriteOversized }
      );

      // Re-read from disk after writing, or the save is invisible. See `reloadTheme`.
      reloadTheme(deps, theme.manifest.id);

      res.json({ path, bytes: Buffer.byteLength(content, "utf8") });
    } catch (err) {
      sendThemeFileError(res, err);
    }
  });
};

/**
 * Handles the reset route's ADR-020 §5 generated-tree branch: a BUILT theme's generated tree
 * restores as ONE atomic operation via {@link restoreBuiltThemeGeneratedTree} rather than
 * file-by-file — see that function's own doc for why a generated tree cannot be restored
 * file-by-file without risking desync between files the same build produced together. Writes the
 * route's full response itself (success or `NO_ORIGINAL`) since the two cases share nothing with
 * the per-file reset path below.
 */
function handleGeneratedTreeReset(deps: ContentRouteDeps, theme: DiscoveredTheme, res: Response): void {
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
}

/**
 * Restores `path` from the originals catalog for the per-file reset path, byte for byte, via
 * {@link resetThemeFileToOriginal}. That call resolves `path` through the containment helper against
 * the CATALOG root before it touches the live side: `path` is operator input, and this is the one
 * place in the file that resolves it against a directory outside the theme's own folder. Writes the
 * route's 409 itself for both of its refusals, so the caller only has to check `ok`:
 * `ORIGINAL_LAYOUT_MISMATCH` when {@link themeOriginalResetRefusal} refuses the whole original (checked
 * first, before any file is looked at), and `NOT_IN_ORIGINAL` when the catalog has no regular file at
 * `path`.
 */
function resetFileFromOriginal(
  deps: ContentRouteDeps,
  theme: DiscoveredTheme,
  catalogDir: string,
  path: string,
  res: Response
): { ok: true; wasModified: boolean; bytes: number } | { ok: false } {
  const refusal = themeOriginalResetRefusal({ themeDir: theme.dir, originalDir: catalogDir });
  if (refusal) {
    res.status(409).json({ error: refusal.message, code: refusal.code });
    return { ok: false };
  }
  const reset = resetThemeFileToOriginal({
    themeDir: theme.dir,
    themesRoot: deps.themesDir,
    originalDir: catalogDir,
    originalsRoot: join(deps.themesDir, THEME_CATALOG_DIR),
    relativePath: path,
  });
  if (!reset) {
    res.status(409).json({
      error: `'${path}' is not in this theme's original, so there is nothing to reset it to`,
      code: "NOT_IN_ORIGINAL",
    });
    return { ok: false };
  }
  return { ok: true, ...reset };
}

/**
 * Builds the per-file reset route's success body from {@link resetFileFromOriginal}'s result.
 *
 * Extracted (2026-09-15) so the route handler itself stays under the 9/9 `complexity` /
 * `sonarjs/cognitive-complexity` ceiling this repo enforces on `src/server` — its two conditional
 * `bytes`/`content` expressions were the last decisions keeping that handler at a complexity of 10.
 * Behaviour is unchanged: `bytes` reports 0 when nothing was written, and `content` is `null` past
 * the {@link MAX_THEME_FILE_BYTES} text-read limit, exactly as inline before.
 */
function buildFileResetResponse(
  deps: ContentRouteDeps,
  theme: DiscoveredTheme,
  path: string,
  reset: { wasModified: boolean; bytes: number }
): { scope: "file"; path: string; wasModified: boolean; bytes: number; content: string | null } {
  return {
    scope: "file",
    path,
    wasModified: reset.wasModified,
    bytes: reset.wasModified ? reset.bytes : 0,
    content:
      reset.bytes > MAX_THEME_FILE_BYTES
        ? null
        : readThemeFile({ themeDir: theme.dir, themesRoot: deps.themesDir, relativePath: path }),
  };
}

/**
 * POST — restore file(s) to the pristine copy in the originals catalog.
 *
 * This is the payoff for the whole copy-not-inherit model, and the reason the catalog has to be
 * genuinely untouched rather than a hash or a manifest note: "put it back" is a file copy, needing
 * no diff, no history, and no tooling anybody has to build. It is only possible because the original
 * still exists byte-for-byte.
 *
 * The per-file reset copies the original's bytes and never decodes them, so binary files and files
 * past the {@link MAX_THEME_FILE_BYTES} text-read limit reset like any other. A file whose bytes
 * already match its original is not written: the response says `wasModified: false` and `bytes: 0`,
 * matching `theme_reset_file`. `bytes` is the number of bytes written. `content` is the restored
 * file's text, the same text GET `/file` returns for it, or `null` past that limit.
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
 * operation than "reset", and is not what a button labelled Reset should silently do). A third
 * refusal, `ORIGINAL_LAYOUT_MISMATCH`, covers every file of a theme whose original was saved under a
 * different layout version or has an unreadable `theme.json` (see {@link themeOriginalResetRefusal}).
 *
 * DESTRUCTIVE and deliberately not undoable here: it overwrites the working copy with no backup.
 * The confirmation belongs in the UI, where the operator can be told what they are about to lose in
 * words — a server-side "are you sure" flag would just be a second thing to get wrong.
 */
export const registerAdminThemeFileResetRoute: ContentRouteRegistrar = (app, deps) => {
  app.post("/api/admin/v1/workspaces/:workspaceId/themes/:themeId/file/reset", async (req, res) => {
    try {
      if (!(await authorizeThemeAccess(deps, req, res))) return;

      const theme = findThemeOrRespond(deps, req, res);
      if (!theme) return;

      const path = bodyStringField(req.body, "path");

      const writeScope = resolveThemeFileWriteScope({ manifest: theme.manifest, relativePath: path });
      if (writeScope.kind === "generated-readonly") {
        handleGeneratedTreeReset(deps, theme, res);
        return;
      }
      // 2026-08-13 (security pass Finding 1, defense in depth, continuation agent): `writeScope`
      // above answers the ADR-020 compiled-tree question, orthogonal to `isGeneratedThemePath` (the
      // `preview/` question PUT/copy/rename already enforce). Without this, a single-file reset would
      // read the theme's own catalog snapshot and write it straight back into `preview/`, unchecked —
      // not attacker-content injection, but still a write outside the "only `build-preview.mjs`
      // regenerates this folder" invariant every other write route here now honors.
      if (isGeneratedThemePath(path)) {
        res.status(409).json({
          error: `'${path}' is generated output and cannot be reset here`,
          code: "READ_ONLY_FILE",
        });
        return;
      }

      const catalogDir = join(deps.themesDir, THEME_CATALOG_DIR, theme.manifest.tier, theme.manifest.id);
      if (!existsSync(catalogDir)) {
        res.status(409).json({
          error: `theme '${theme.manifest.id}' has no stored original, so nothing can be reset`,
          code: "NO_ORIGINAL",
        });
        return;
      }

      const resetResult = resetFileFromOriginal(deps, theme, catalogDir, path, res);
      if (!resetResult.ok) return;
      // Reloaded even when nothing was written, matching `theme_reset_file`: this process's snapshot
      // is stale whenever a different process wrote the theme.
      reloadTheme(deps, theme.manifest.id);

      res.json(buildFileResetResponse(deps, theme, path, resetResult));
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

      const theme = findThemeOrRespond(deps, req, res);
      if (!theme) return;

      const sourcePath = bodyStringField(req.body, "path");

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
      res.json({
        ...describeThemeFile(destPath, {
          catalogDir,
          comparableOriginal: originalComparableForReset(theme, catalogDir),
          themesDir: deps.themesDir,
          apiVersion: theme.manifest.apiVersion,
          theme,
          // `collidingContent` is never read off this response — see `NO_CONTENT_COLLISIONS`'s own
          // doc for why an empty map here is correct, not merely convenient.
          contentBySlug: NO_CONTENT_COLLISIONS,
        }),
        copiedFrom: sourcePath,
      });
    } catch (err) {
      sendThemeFileError(res, err);
    }
  });
};

// `validateFileIdentityChange` (and its `isFileIdentityChangeAllowed`/`IDENTITY_LOCKED_GROUPS`
// dependencies) moved to `features/theme/file-identity-lock.ts` (2026-08-30) and is now imported at
// the top of this file — see that module's own header for why: `tool-registrations.ts`'s new
// `theme_rename_file`/`theme_delete_file` agent tools need to call the exact same gate this file's
// own rename/delete routes call below, and a `features/**` module cannot import anything under
// `server/**` (`feature-no-server-or-framework-imports`, `.dependency-cruiser.mjs`, `error`
// severity) — so the shared decision had to live in `features/theme`, not here.

/**
 * `name` is a bare filename, not a path: it may not contain a `/` or `\`, which keeps rename from
 * doubling as an undocumented move-between-folders operation and — combined with resolving the
 * assembled destination through `renameThemeFile`'s own containment check — means the one piece of
 * real operator-authored path input here is validated exactly as strictly as a write target, per
 * the containment rule every route in this file follows. `null` means `name` is valid.
 */
function validateRenameTargetName(name: string): string | null {
  if (name.length === 0) return "name is required";
  if (name.includes("/") || name.includes("\\") || name === "." || name === "..") {
    return `name '${name}' must be a plain filename in the same folder, not a path`;
  }
  return null;
}

/**
 * Performs the actual rename when `destPath` differs from `sourcePath` — renaming to the name a
 * file already has is a deliberate no-op, not a collision (without this it would fail NAME_TAKEN
 * against itself, since `destPath === sourcePath` is still "already in `existingPaths`").
 *
 * Writes the route's own error response and returns `false` on any of three failures; `true` when
 * the rename succeeded (or was validly skipped as a no-op) and the caller should build its normal
 * response.
 */
export function renameThemeFileIfChanged(
  deps: ContentRouteDeps,
  theme: DiscoveredTheme,
  paths: { sourcePath: string; destPath: string; name: string },
  existingPaths: ReadonlySet<string>,
  res: Response
): boolean {
  const { sourcePath, destPath, name } = paths;
  if (destPath === sourcePath) return true;

  if (existingPaths.has(destPath)) {
    res.status(409).json({ error: `'${destPath}' already exists in this theme`, code: "NAME_TAKEN" });
    return false;
  }

  // Defense-in-depth, not currently reachable through THIS route: `destPath` is always built from
  // `sourcePath`'s OWN directory (`name` may not contain `/`, checked by `validateRenameTargetName`),
  // so its write-scope is provably identical to `sourcePath`'s already-checked one — a rename can
  // never cross from a compiled theme's sourceDir into its generated tree today. Asserted directly
  // anyway rather than left as an inference some future refactor could quietly invalidate (e.g. a
  // cross-folder move added to this route later).
  const destWriteScope = resolveThemeFileWriteScope({ manifest: theme.manifest, relativePath: destPath });
  if (destWriteScope.kind === "generated-readonly") {
    res.status(409).json({ error: `'${destPath}' is read-only: ${destWriteScope.reason}`, code: "GENERATED_READONLY" });
    return false;
  }

  // A rename never changes BYTES, only the name — so the one thing it CAN change is how a browser
  // INTERPRETS those bytes, since `express.static` decides content-type by extension. Requiring the
  // extension to survive a rename means a file's interpretation can never change via this route: a
  // name already vetted (as either an ordinary writable file, or — inside a compiled theme's
  // sourceDir — a `SOURCE_DIR_WRITABLE_EXTENSIONS` member) cannot be relabeled into a DIFFERENT,
  // more dangerous extension the same content was never vetted against. This is what actually
  // closes "PUT a safe extension, then rename it to a dangerous one" — merely re-running PUT's own
  // check against `destPath` would NOT have closed it, since `.html`/`.svg` are themselves
  // ordinarily-writable extensions elsewhere in a theme; the bytes staying unvetted-as-that-extension
  // is the real invariant, not the extension's mere presence on an allowlist.
  if (fileExtension(sourcePath) !== fileExtension(destPath)) {
    res.status(400).json({
      error: `renaming '${sourcePath}' to '${name}' would change its extension, which Explore does not allow — a file's extension decides how it is served and must not change via rename`,
      code: "EXTENSION_CHANGE_NOT_ALLOWED",
    });
    return false;
  }

  renameThemeFile({ themeDir: theme.dir, themesRoot: deps.themesDir, sourcePath, destPath });
  reloadTheme(deps, theme.manifest.id);
  return true;
}

/**
 * POST — rename (move within the same folder) one file inside a theme.
 *
 * `name` is a bare filename, not a path: it may not contain a `/` or `\`, which keeps rename from
 * doubling as an undocumented move-between-folders operation and — combined with resolving the
 * assembled destination through `renameThemeFile`'s own containment check — means the one piece of
 * real operator-authored path input here is validated exactly as strictly as a write target, per the
 * containment rule every route in this file follows.
 *
 * Hard-blocks {@link import("#src/features/theme/index").requiredThemeFiles}: renaming a theme's
 * own index page, `theme.json`, or `tokens.json` away reproduces the exact `loadTheme` failure that
 * makes a theme's `status` flip to `"invalid"` (see that function's doc comment for the three
 * matching checks in `theme.ts`). This does NOT block renaming an ordinary page — that only changes
 * its public URL, which is a warning the UI shows before confirming, not a server-side refusal; the
 * operator may have a real reason to do it.
 *
 * Also hard-blocks {@link import("#src/features/theme/index").IDENTITY_LOCKED_GROUPS} (`script`,
 * `other`) — 2026-08-11 judgment call,
 * deliberate and not part of the original ask, and STILL true even after `script`'s CONTENT became
 * editable (2026-08-29 — see {@link CONTENT_EDIT_LOCKED_GROUPS}'s own doc). Renaming a `script`/`other`
 * file's NAME is a different risk than editing its content: a `<script src="main.js">` (or an
 * `<link rel="manifest" href="site.webmanifest">`, an `other`-group file) the operator just renamed to
 * `main-old.js` now 404s on the live page, and nothing tracks what still points at the old name to warn
 * about it — unlike a page rename, which gets a warning naming exactly what changes because the
 * renderer already tracks page routes. No such tracking exists for arbitrary cross-file references, and
 * following the copy/rename pass's own reasoning for not warning on this ("an unreliable warning is
 * worse than none") a step further: blocking outright needs no reference-tracking accuracy claim at
 * all, it just extends the existing "can't touch this file's identity from this screen" principle from
 * content to filename. Copy is deliberately NOT blocked here — see
 * {@link registerAdminThemeFileCopyRoute}'s own comment. Delete ({@link registerAdminThemeFileDeleteRoute})
 * hard-blocks the same groups for the same reason, only more so — see that route's own doc comment.
 */
export const registerAdminThemeFileRenameRoute: ContentRouteRegistrar = (app, deps) => {
  app.post("/api/admin/v1/workspaces/:workspaceId/themes/:themeId/file/rename", async (req, res) => {
    try {
      if (!(await authorizeThemeAccess(deps, req, res))) return;

      const theme = findThemeOrRespond(deps, req, res);
      if (!theme) return;

      const sourcePath = bodyStringField(req.body, "path");
      const name = bodyStringField(req.body, "name");

      const writeScope = resolveThemeFileWriteScope({ manifest: theme.manifest, relativePath: sourcePath });
      const sourceError = validateFileIdentityChange(theme, sourcePath, writeScope, "renamed");
      if (sourceError) {
        res.status(sourceError.status).json({ error: sourceError.error, code: sourceError.code });
        return;
      }

      const nameError = validateRenameTargetName(name);
      if (nameError) {
        res.status(400).json({ error: nameError, code: "INVALID_NAME" });
        return;
      }

      const existingPaths = new Set(listThemeFiles({ themeDir: theme.dir, themesRoot: deps.themesDir }));
      if (!existingPaths.has(sourcePath)) {
        res.status(404).json({ error: `file '${sourcePath}' was not found in this theme`, code: "FILE_NOT_FOUND" });
        return;
      }

      const slash = sourcePath.lastIndexOf("/");
      const destPath = slash === -1 ? name : `${sourcePath.slice(0, slash)}/${name}`;

      if (!renameThemeFileIfChanged(deps, theme, { sourcePath, destPath, name }, existingPaths, res)) return;

      const catalogDir = join(deps.themesDir, THEME_CATALOG_DIR, theme.manifest.tier, theme.manifest.id);
      res.json({
        ...describeThemeFile(destPath, {
          catalogDir,
          comparableOriginal: originalComparableForReset(theme, catalogDir),
          themesDir: deps.themesDir,
          apiVersion: theme.manifest.apiVersion,
          theme,
          // `collidingContent` is never read off this response — see `NO_CONTENT_COLLISIONS`'s own
          // doc for why an empty map here is correct, not merely convenient.
          contentBySlug: NO_CONTENT_COLLISIONS,
        }),
        renamedFrom: sourcePath,
      });
    } catch (err) {
      sendThemeFileError(res, err);
    }
  });
};

/**
 * POST — delete one file inside a theme.
 *
 * DESTRUCTIVE, and unlike Reset or Rename, not recoverable through this screen at all: this repo
 * keeps no theme-file revision history, so a deleted file's bytes are simply gone (a file that still
 * has a catalog original could in principle be re-copied by hand from there, but nothing on this
 * screen offers that as an undo). The confirmation belongs in the UI (`ThemeExplore.tsx`'s own delete
 * `ConfirmDialog`), the same split Reset already uses — a server-side "are you sure" flag would just
 * be a second thing to get wrong.
 *
 * Shares {@link validateFileIdentityChange} with rename (2026-08-29, now also with the agent-tool
 * `theme_rename_file`/`theme_delete_file` handlers — see `file-identity-lock.ts`'s own header): the
 * same three reasons a rename's source might be locked — a
 * {@link import("#src/features/theme/index").requiredThemeFiles} entry, a built theme's generated
 * tree, or an {@link import("#src/features/theme/index").IDENTITY_LOCKED_GROUPS} member — apply at
 * least as strongly to delete, since
 * delete has no "rename it back" undo path at all. See {@link registerAdminThemeFileRenameRoute}'s own
 * doc comment for the fuller reasoning this reuses. Copy and PUT/reset are unaffected — this route
 * only removes a file, it never creates or overwrites one.
 */
export const registerAdminThemeFileDeleteRoute: ContentRouteRegistrar = (app, deps) => {
  app.post("/api/admin/v1/workspaces/:workspaceId/themes/:themeId/file/delete", async (req, res) => {
    try {
      if (!(await authorizeThemeAccess(deps, req, res))) return;

      const theme = findThemeOrRespond(deps, req, res);
      if (!theme) return;

      const path = bodyStringField(req.body, "path");

      const writeScope = resolveThemeFileWriteScope({ manifest: theme.manifest, relativePath: path });
      const lockError = validateFileIdentityChange(theme, path, writeScope, "deleted");
      if (lockError) {
        res.status(lockError.status).json({ error: lockError.error, code: lockError.code });
        return;
      }

      const existingPaths = new Set(listThemeFiles({ themeDir: theme.dir, themesRoot: deps.themesDir }));
      if (!existingPaths.has(path)) {
        res.status(404).json({ error: `file '${path}' was not found in this theme`, code: "FILE_NOT_FOUND" });
        return;
      }

      deleteThemeFile({ themeDir: theme.dir, themesRoot: deps.themesDir, relativePath: path });

      // Same boot-time-snapshot problem every other write in this file has — see `reloadTheme`'s doc
      // comment. Skipping this means the file is gone from disk but the preview and the next GET of
      // `pages`/`partials` still act as if it exists.
      reloadTheme(deps, theme.manifest.id);

      res.json({ path, deleted: true });
    } catch (err) {
      sendThemeFileError(res, err);
    }
  });
};

/** The publish-toggle body's `page`/`published` fields — `ok: false` covers only the one shape check
 *  this route 400s on (`published` not a boolean); every other validation (tier, page eligibility)
 *  happens once both fields exist, same split {@link parseThemeFilePutBody} uses for PUT. */
function parseThemePagePublishBody(
  req: { body: unknown }
): { ok: true; page: string; published: boolean } | { ok: false } {
  const page = bodyStringField(req.body, "page");
  const published = bodyRecord(req.body).published;
  if (typeof published !== "boolean") return { ok: false };
  return { ok: true, page, published };
}

/**
 * Compute the next `publishedPages` array for one publish/unpublish request.
 *
 * `currentPublishedPages` MUST come from the freshly-read `theme.json` on disk (`raw.publishedPages`),
 * never from `theme.manifest.publishedPages` — see {@link registerAdminThemePagePublishRoute}'s own
 * doc for why: `theme.manifest` is a boot-time (or last-`reloadTheme`) in-memory snapshot, and the
 * agent daemon is a SEPARATE OS process that can write `theme.json` through its own `writeThemeFile`
 * call without ever touching this process's `deps.themes`. Basing the computed array on the stale
 * in-memory value while writing it onto freshly-read disk JSON would silently discard whatever the
 * daemon (or any other writer) had just changed — confirmed by a failing regression test before this
 * fix (`explore-page-publish-route.test.ts`, "a concurrent writer's fresh theme.json is never
 * clobbered...").
 *
 * `currentPublishedPages === undefined` means this theme has never recorded a decision ANYWHERE — not
 * on disk, and therefore not in `theme.manifest` either, since `theme.manifest.publishedPages` is
 * itself only ever populated by parsing `theme.json`, and this route is the sole writer of that field.
 * Because {@link isStandaloneThemePage} already treats an absent array as "nothing published"
 * (2026-08-30 owner correction — see `ThemeManifest.publishedPages`'s own doc), there is nothing to
 * backfill: the base for a never-recorded theme is simply empty, so a theme's first-ever toggle
 * records only the one page this request names. Once a theme HAS a recorded array (on disk), this is
 * a plain add/remove against it, same as every other toggle.
 *
 * Sorted for a deterministic `theme.json` diff — irrelevant to {@link isStandaloneThemePage}'s own
 * `includes` check, which does not care about order.
 *
 * @complexity O(n) in the existing array's length.
 */
function applyPagePublishToggle(
  currentPublishedPages: string[] | undefined,
  page: string,
  published: boolean
): string[] {
  const next = new Set(currentPublishedPages ?? []);
  if (published) next.add(page);
  else next.delete(page);
  return [...next].sort();
}

/** Safely reads `raw.publishedPages` (parsed straight from freshly-read `theme.json`, so its shape is
 *  as untrusted as any other on-disk field) as `string[] | undefined` — `undefined` for anything that
 *  is not literally an array of strings, matching {@link applyPagePublishToggle}'s own "never recorded
 *  a decision" meaning for `undefined` rather than letting a malformed value silently become the
 *  backfill base. */
function rawPublishedPages(raw: Record<string, unknown>): string[] | undefined {
  const value = raw.publishedPages;
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) return undefined;
  return value as string[];
}

/**
 * POST — publish or unpublish one of a static theme's own pages.
 *
 * The real mechanism replacing the `_unpublished/` folder convention an agent invented ad hoc
 * (2026-08-29) — moving a live page's file out of `render/pages/` and dropping it from `theme.json`,
 * outside every audited read/write path, because no publish concept existed yet. See
 * `ThemeManifest.publishedPages` (`theme.ts`) for the full absent-vs-present contract this route is
 * the only writer of.
 *
 * Reads and rewrites `theme.json`'s RAW parsed JSON directly — never `JSON.stringify(theme.manifest)`
 * — so every other field, including any this loader does not itself model, survives byte-for-byte;
 * only `publishedPages` changes. `theme.json` needs no {@link resolveThemeFileWriteScope} gate the way
 * PUT does for an arbitrary path: that function resolves `"editable"` for `theme.json` unconditionally,
 * compiled theme or not (see its own doc), so there is no scope this fixed path could ever fail.
 *
 * `raw` is read FIRST, and {@link applyPagePublishToggle}'s base comes from `raw.publishedPages` (via
 * {@link rawPublishedPages}) rather than `theme.manifest.publishedPages` — the in-memory manifest is a
 * snapshot from this process's last boot/`reloadTheme`, and the agent daemon is a separate OS process
 * that writes `theme.json` through its own tool without ever updating this process's `deps.themes`.
 * Computing the new array from the stale in-memory value and writing it onto the freshly-read disk
 * JSON would silently discard a concurrent daemon edit the instant an operator toggled a page here.
 *
 * Deliberately no `await` between `readThemeFile` and `writeThemeFile` (unchanged from before this
 * fix) — that keeps this block atomic with respect to the event loop, which is the only reason two
 * concurrent toggles cannot lose a page here. This property is currently accidental (a side effect of
 * every call in the span being synchronous), not enforced by any lock — do not add an `await` in this
 * span without re-establishing it some other way.
 */
export const registerAdminThemePagePublishRoute: ContentRouteRegistrar = (app, deps) => {
  app.post("/api/admin/v1/workspaces/:workspaceId/themes/:themeId/page/publish", async (req, res) => {
    try {
      if (!(await authorizeThemeAccess(deps, req, res))) return;

      const theme = findThemeOrRespond(deps, req, res);
      if (!theme) return;

      const parsedBody = parseThemePagePublishBody(req);
      if (!parsedBody.ok) {
        res.status(400).json({ error: "published must be a boolean", code: "INVALID_BODY" });
        return;
      }
      const { page, published } = parsedBody;

      if (theme.manifest.tier !== "static") {
        res.status(400).json({
          error: `theme '${theme.manifest.id}' is tier '${theme.manifest.tier}' — publish state only applies to static-tier themes`,
          code: "NOT_STATIC_TIER",
        });
        return;
      }

      if (!isPublishableThemePageCandidate(theme, page)) {
        res.status(404).json({
          error: `'${page}' is not one of this theme's own standalone pages — it does not exist, or is index/404/a declared template shell`,
          code: "PAGE_NOT_PUBLISHABLE",
        });
        return;
      }

      const raw = JSON.parse(
        readThemeFile({ themeDir: theme.dir, themesRoot: deps.themesDir, relativePath: "theme.json" })
      ) as Record<string, unknown>;
      const publishedPages = applyPagePublishToggle(rawPublishedPages(raw), page, published);
      raw.publishedPages = publishedPages;
      writeThemeFile({
        themeDir: theme.dir,
        themesRoot: deps.themesDir,
        relativePath: "theme.json",
        content: `${JSON.stringify(raw, null, 2)}\n`,
      });

      // Same boot-time-snapshot problem every other write in this file has — see `reloadTheme`'s doc
      // comment. Skipping this means `theme.json` changed on disk but the live site keeps serving (or
      // keeps hiding) the page against the stale in-memory manifest.
      reloadTheme(deps, theme.manifest.id);

      res.json({ page, published, publishedPages });
    } catch (err) {
      sendThemeFileError(res, err);
    }
  });
};

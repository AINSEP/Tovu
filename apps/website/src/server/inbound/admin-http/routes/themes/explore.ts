// Moved to `theme-files.ts` (2026-09-12) so `tool-registrations.ts`'s `theme_copy_file` agent tool
// can reuse the identical collision-avoidance the HTTP copy route below already relies on — see
// that function's own doc for why this had to move rather than be reached by a deep import.
import { renameThemeFile } from "@jini-ai/cms/themes/files/moves";
import { themeFileDiffersFromOriginal } from "@jini-ai/cms/themes/files/originals";
import { resolveThemeOriginalSource, hasThemeOriginalLayoutMismatch, type ThemeOriginalSource } from "@jini-ai/cms/themes/files/original-source";
import { isReservedThemePreviewPath } from "#src/features/theme/preview-policy";
import { requestThemePreviewRefresh } from "@jini-ai/cms/themes/preview/refresh";
import type { Response } from "express";
import { isPageFilePath, isPartialFilePath } from "@jini-ai/cms/themes/layout";

import {
  loadTheme,
  type DiscoveredTheme,
  isGeneratedThemePath,
  isPublishableThemePageCandidate,
  isStandaloneThemePage,
  listThemeFiles,
  MAX_THEME_FILE_BYTES,
  resolveThemeFileWriteScope,
  themeOriginalFilePorts,
  ThemePathError,
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
  type ThemeFileGroup,
  themeFileMovePorts,
} from "#src/features/theme/index";

// Re-exported so `explore-pure-helpers.unit.test.ts`'s existing direct import (`fileExtension` from
// `../explore.js`) keeps working unchanged — this file no longer DEFINES `fileExtension`, it only
// re-publishes the shared one, purely for that test's import path.
export { fileExtension };
import { ROOT_SLUG, type PostKind, type PostRecord } from "#src/features/post/index";
import { isTrashed } from "@jini-ai/core/contracts/site/soft-delete";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import { authorizeDirectOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import type { ContentRouteDeps } from "../content/deps.js";

/**
 * @file Host helpers behind the theme Explore screen's routes. K1 (RT-K1-adm-themes-1): the nine
 * routes are Jini specs (`@jini-ai/cms/admin-http/routes/themes/explore-*`) mounted by
 * `modules/theme-explore.ts`, which binds the helpers below (file description, PUT gate, reload,
 * rename) as the specs' injected deps. Original rationale for the surface follows.
 *
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
 * `/api/admin/v1/workspaces/:workspaceId/...` Explore routes ALSO get the host workspace port's
 * path-param comparison on top of it. Exported (2026-08-12, `.liquid` Preview-tab fix) so
 * `middleware/theme-page-preview.ts`'s templated-theme preview route can apply the SAME gate — that
 * route has no `:workspaceId` in its own URL (it lives at `/theme-explore/...`, matching its sibling
 * static-preview route's shape, not under `/api/admin/v1/workspaces/...`), so it has nothing to
 * compare a path param against and only needs this half. One definition rather than two independently
 * written permission checks that could drift apart — exactly the class of gap this subsystem's own
 * security passes kept finding.
 */
export async function authorizeThemeSetPermission(
  { deps, res }: { deps: Pick<ContentRouteDeps, "workspaceId" | "authorize">; res: Response },
  _optional: Record<string, never> = {}
): Promise<boolean> {
  const principal = getAuthedPrincipal(res);
  const params = { principalId: principal.id, permission: "theme.set", workspaceId: deps.workspaceId, entityType: "presentation" };
  if (!(await authorizeDirectOrRespond({ res, authorize: deps.authorize, params }))) return false;
  return true;
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
export function reloadTheme({ deps, themeId }: { deps: ContentRouteDeps; themeId: string }, _optional = {}): void {
  const index = deps.themes.findIndex((t) => t.manifest.id === themeId);
  if (index < 0) return;
  const current = deps.themes[index];
  deps.themes[index] = loadTheme({ themeDir: current.dir, id: themeId, source: current.source });
  requestThemePreviewRefresh({ themesDir: deps.themesDir, isReservedPath: isReservedThemePreviewPath });
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

function isTextReadable({ relativePath }: { relativePath: string }, _optional = {}): boolean {
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
 * @complexity O(k) time and space for k characters in the relative path; no I/O.
 */
function isThemeFileWritable({ relativePath, apiVersion }: { relativePath: string; apiVersion: 2 | undefined }, _optional = {}): boolean {
  if (!isTextReadable({ relativePath })) return false;
  return (
    // v2's render/pages grouping must not turn the read-only Liquid preview into an edit surface.
    !relativePath.toLowerCase().endsWith(".liquid") &&
    !CONTENT_EDIT_LOCKED_GROUPS.has(fileGroup({ relativePath, apiVersion })) &&
    !isGeneratedThemePath({ relativePath }) &&
    !isTrashedThemePath({ relativePath })
  );
}

/**
 * The page id a `page`-group path names — its own filename, minus `.html` — matching
 * {@link DiscoveredTheme.pages}' own keys (`theme.ts`: `file.slice(0, -".html".length)` off
 * `readdirSync(pagesDir)`, which never sees a nested path). Not a general basename helper: only ever
 * called on a path {@link fileGroup} already classified `"page"`.
 */
function pageIdForPagePath({ relativePath }: { relativePath: string }, _optional = {}): string {
  const base = relativePath.slice(relativePath.lastIndexOf("/") + 1);
  return base.endsWith(".html") ? base.slice(0, -".html".length) : base;
}

/** The live (published, non-trashed) content record occupying a theme page's own slug — the shape
 *  {@link ThemeExploreFile.collidingContent} (admin `use-theme-explore.hooks.ts`) mirrors on the
 *  wire. Named separately from {@link describeThemeFile}'s own inline return type only because
 *  {@link contentRecordsBySlug} below needs the identical shape for its `Map`'s value type, and
 *  respelling it a second time is exactly the drift risk a shared type exists to remove. */
type ThemeFileContentCollision = { id: string; slug: string; title: string; kind: PostRecord["kind"] };

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
 * {@link resolveThemeOriginalSource} bound to this route file's own `deps` shape (Design C,
 * 2026-09-16) — every one of the four call sites below (detail/copy/rename/reset) needs the
 * identical two fields off `deps`, so this is the one place that pairs them rather than four
 * repeated argument objects. `deps.packageThemesDir` is `undefined` for any composition root that
 * predates this field (see that field's own doc) — `resolveThemeOriginalSource` already treats that
 * as "no package fallback," not an error, so this needs no extra branching of its own.
 */
export function originalSourceFor(deps: ContentRouteDeps, theme: DiscoveredTheme): ThemeOriginalSource | null {
  return resolveThemeOriginalSource({
    manifest: theme.manifest,
    siteThemesRoot: deps.themesDir,
    packageThemesRoot: deps.packageThemesDir,
  });
}

/**
 * Whether files in `theme` can be compared against, and reset from, its catalog original at all:
 * {@link originalSourceFor} found ONE (site or, since Design C, package) and
 * {@link hasThemeOriginalLayoutMismatch} accepts it. Computed once per response, never per file, and fed
 * to {@link describeThemeFile} so `resettable`/`modified` agree with what the reset route will
 * actually do.
 *
 * @complexity O(s) in the two `theme.json` sizes, or O(1) when there is no source at all.
 */
function originalComparableForReset({ theme, originalSource }: { theme: DiscoveredTheme; originalSource: ThemeOriginalSource | null }, _optional = {}): boolean {
  return (
    originalSource !== null &&
    !hasThemeOriginalLayoutMismatch({ themeDir: theme.dir, originalDir: originalSource.originalDir, maxManifestBytes: MAX_THEME_FILE_BYTES })
  );
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
 * Invalid paths also return `null`, so that file lists as `resettable: false`. Filesystem failures
 * propagate to the route's error response rather than pretending the original is absent.
 *
 * @complexity O(1) when there is no original or the sizes differ; O(s) in the file size when the sizes
 * match. Across a detail listing that is O(total bytes) of same-size files with an original.
 */
function fileModifiedFromOriginal({ relativePath, options }: { relativePath: string; options: { originalSource: ThemeOriginalSource | null; comparableOriginal: boolean; themesDir: string; theme: DiscoveredTheme } }, _optional = {}): boolean | null {
  if (!options.comparableOriginal || !options.originalSource) return null;
  try {
    return themeFileDiffersFromOriginal({ ports: themeOriginalFilePorts,
      themeDir: options.theme.dir,
      themesRoot: options.themesDir,
      originalDir: options.originalSource.originalDir,
      originalsRoot: options.originalSource.originalsRoot,
      relativePath,
    });
  } catch (err) {
    if (err instanceof ThemePathError) return null;
    throw err;
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
 * Gated on the SAME `isPublishableThemePageCandidate` check as `published`, plus `index` — see
 * {@link themePageCollidingContent} for why the home fallback is the one non-candidate it applies to.
 *
 * `modified` (2026-09-12, owner decision) is whether the live file's bytes differ from its catalog
 * original — see {@link fileModifiedFromOriginal}. It is `null` exactly when `resettable` is false:
 * with no catalog copy of the file there is nothing to compare against, so "modified" has no answer
 * rather than a `false` that would read as "untouched". `resettable` is derived from the same
 * comparison, so it now also requires the catalog entry to be a regular file, not merely a path that
 * exists. Both are also `false`/`null` for every file of a theme whose original the reset route would
 * refuse (`comparableOriginal: false`, e.g. an original saved under another layout version).
 */
function describeThemeFile({ relativePath, options }: { relativePath: string; options: {
    originalSource: ThemeOriginalSource | null;
    comparableOriginal: boolean;
    themesDir: string;
    apiVersion: 2 | undefined;
    theme: DiscoveredTheme;
    contentBySlug: ReadonlyMap<string, ThemeFileContentCollision>;
  } }, _optional = {}): {
  path: string;
  group: ThemeExploreFileGroup;
  readable: boolean;
  editable: boolean;
  resettable: boolean;
  modified: boolean | null;
  published: boolean | null;
  collidingContent: ThemeFileContentCollision | null;
  inherited?: boolean;
} {
  const group = fileGroup({ relativePath, apiVersion: options.apiVersion });
  const pageId = group === "page" ? pageIdForPagePath({ relativePath }) : null;
  const modified = fileModifiedFromOriginal({ relativePath, options });
  return {
    path: relativePath,
    group,
    readable: isTextReadable({ relativePath }),
    editable: isThemeFileWritable({ relativePath, apiVersion: options.apiVersion }),
    // Whether THIS file can be reset — a file the author added themselves (including a fresh copy)
    // has no original to go back to, and offering a Reset that would fail is worse than not
    // offering one. `modified` is `null` for exactly those files.
    resettable: modified !== null,
    modified,
    published:
      pageId !== null && isPublishableThemePageCandidate({ theme: options.theme, pageId })
        ? isStandaloneThemePage({ theme: options.theme, pageId })
        : null,
    collidingContent: themePageCollidingContent({ theme: options.theme, pageId, contentBySlug: options.contentBySlug }),
  };
}

/**
 * {@link describeThemeFile}'s `collidingContent` for one page id: the live content record at the
 * slug that page would be served at, or `null`.
 *
 * `index` is the one non-candidate page asked this question (owner, 2026-10-08: the theme's `index`
 * read as a page owning `/`). It is the HOME FALLBACK, not a page with an address of its own:
 * `GET /` serves a published Page claiming {@link ROOT_SLUG} ahead of it (`pages.ts`'s
 * `resolveHomePageContent`), so that Page is reported here and the admin can show `index` as
 * replaced rather than live at `/`. `404` and declared template shells still report `null` — they
 * have no address for anything to collide with.
 *
 * @complexity O(1) — one `Map` lookup.
 */
function themePageCollidingContent({ theme, pageId, contentBySlug }: { theme: DiscoveredTheme; pageId: string | null; contentBySlug: ReadonlyMap<string, ThemeFileContentCollision> }, _optional = {}): ThemeFileContentCollision | null {
  if (pageId === "index") return contentBySlug.get(ROOT_SLUG) ?? null;
  if (pageId === null || !isPublishableThemePageCandidate({ theme, pageId })) return null;
  return contentBySlug.get(pageId) ?? null;
}

/**
 * The detail route's physical file listing (the K1 spec `themeDetailRoute` adds the inherited
 * virtual sources and the manifest fields itself) plus whether the theme has an original to reset to.
 * Bound by `modules/theme-explore.ts`.
 */
export async function describeThemeDetailFiles({ deps, theme }: { deps: ContentRouteDeps; theme: DiscoveredTheme }, _optional = {}): Promise<{ files: ReturnType<typeof describeThemeFile>[]; hasOriginal: boolean }> {
  // An untouched original to reset back to — the site's own catalog copy, or (Design C,
  // 2026-09-16) the package's own read-only catalog when the site has none at all. The banner's
  // promise ("you can always get back to what you started from") now also covers the seven
  // shipped themes that never had a hand-maintained original on an already-seeded site.
  const originalSource = originalSourceFor(deps, theme);
  const hasOriginal = originalSource !== null;

  // Every file in the theme folder, not just the pages/partials the RENDERER knows about — CSS,
  // JS, tokens, images. Those are the files an author most often actually needs to change to
  // make a downloaded theme theirs, and until now the screen hid all of them.
  // Once for the whole listing: whether any file here can be reset from that original.
  const comparableOriginal = originalComparableForReset({ theme, originalSource });
  // ONE batched lookup for the WHOLE listing below, not one `findBySlug` per file — see
  // `contentRecordsBySlug`'s own doc for why that per-file shape must never come back.
  const contentBySlug = contentRecordsBySlug(await deps.postRepo.list({ workspaceId: deps.workspaceId }));
  // `isGeneratedThemePath` (`theme-files.ts`) — the shared definition of "this is
  // `build-preview.mjs` output, not real theme source"; see its own doc comment for why.
  // `isTrashedThemePath` (2026-08-30, soft-delete): a file an agent moved into `.trash/` via
  // `theme_trash_file` must not surface as a file-list entry here either — trash is trash for a
  // human operator too, not only for the agent that put it there.
  const files = listThemeFiles({ themeDir: theme.dir, themesRoot: deps.themesDir })
    .filter((path) => !isGeneratedThemePath({ relativePath: path }) && !isTrashedThemePath({ relativePath: path }))
    .map((path) =>
      describeThemeFile({ relativePath: path, options: {
        originalSource,
        comparableOriginal,
        themesDir: deps.themesDir,
        apiVersion: theme.manifest.apiVersion,
        theme,
        contentBySlug,
      } })
    );
  return { files, hasOriginal };
}

/**
 * The copy/rename responses' single-file {@link describeThemeFile}, against the theme's original as
 * resolved now (after the move's reload). `collidingContent` is never read off those responses —
 * see `NO_CONTENT_COLLISIONS`'s own doc for why an empty map here is correct, not merely convenient.
 */
export function describeMovedThemeFile({ deps, theme, relativePath }: { deps: ContentRouteDeps; theme: DiscoveredTheme; relativePath: string }, _optional = {}): ReturnType<typeof describeThemeFile> {
  const originalSource = originalSourceFor(deps, theme);
  return describeThemeFile({ relativePath, options: {
    originalSource,
    comparableOriginal: originalComparableForReset({ theme, originalSource }),
    themesDir: deps.themesDir,
    apiVersion: theme.manifest.apiVersion,
    theme,
    contentBySlug: NO_CONTENT_COLLISIONS,
  } });
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
export function isPutWritable({ theme, path, writeScope }: { theme: DiscoveredTheme; path: string; writeScope: ThemeFileWriteScope }, _optional = {}): boolean {
  return (
    !isGeneratedThemePath({ relativePath: path }) &&
    (isInsideCompiledSourceDir({ theme, relativePath: path, writeScope })
      ? isSourceDirWritableExtension({ relativePath: path })
      : isThemeFileWritable({ relativePath: path, apiVersion: theme.manifest.apiVersion }))
  );
}

/**
 * Performs the actual rename when `destPath` differs from `sourcePath` — renaming to the name a
 * file already has is a deliberate no-op, not a collision (without this it would fail NAME_TAKEN
 * against itself, since `destPath === sourcePath` is still "already in `existingPaths`").
 *
 * Returns the refusal (status + flat body fields) on any of three failures; `null` when the rename
 * succeeded (or was validly skipped as a no-op). Bound into the K1 rename spec by
 * `modules/theme-explore.ts`; {@link renameThemeFileIfChanged} is the `Response`-writing form.
 */
export function renameThemeFileOrRefusal({ deps, theme, paths, existingPaths }: { deps: ContentRouteDeps; theme: DiscoveredTheme; paths: { sourcePath: string; destPath: string; name: string }; existingPaths: ReadonlySet<string> }, _optional = {}): { status: number; error: string; code: string } | null {
  const { sourcePath, destPath, name } = paths;
  if (destPath === sourcePath) return null;

  if (existingPaths.has(destPath)) {
    return { status: 409, error: `'${destPath}' already exists in this theme`, code: "NAME_TAKEN" };
  }

  // Defense-in-depth, not currently reachable through THIS route: `destPath` is always built from
  // `sourcePath`'s OWN directory (`name` may not contain `/`, checked by `validateRenameTargetName`),
  // so its write-scope is provably identical to `sourcePath`'s already-checked one — a rename can
  // never cross from a compiled theme's sourceDir into its generated tree today. Asserted directly
  // anyway rather than left as an inference some future refactor could quietly invalidate (e.g. a
  // cross-folder move added to this route later).
  const destWriteScope = resolveThemeFileWriteScope({ manifest: theme.manifest, relativePath: destPath });
  if (destWriteScope.kind === "generated-readonly") {
    return { status: 409, error: `'${destPath}' is read-only: ${destWriteScope.reason}`, code: "GENERATED_READONLY" };
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
  if (fileExtension({ relativePath: sourcePath }) !== fileExtension({ relativePath: destPath })) {
    return { status: 400,
      error: `renaming '${sourcePath}' to '${name}' would change its extension, which Explore does not allow — a file's extension decides how it is served and must not change via rename`,
      code: "EXTENSION_CHANGE_NOT_ALLOWED",
    };
  }

  renameThemeFile({ ports: themeFileMovePorts, themeDir: theme.dir, themesRoot: deps.themesDir, sourcePath, destPath });
  reloadTheme({ deps, themeId: theme.manifest.id });
  return null;
}

/**
 * {@link renameThemeFileOrRefusal}, writing its refusal to `res`: `false` after writing one, `true`
 * when the caller should build its normal response.
 */
export function renameThemeFileIfChanged({ deps, theme, paths, existingPaths, res }: { deps: ContentRouteDeps; theme: DiscoveredTheme; paths: { sourcePath: string; destPath: string; name: string }; existingPaths: ReadonlySet<string>; res: Response }, _optional = {}): boolean {
  const refusal = renameThemeFileOrRefusal({ deps, theme, paths, existingPaths });
  if (!refusal) return true;
  res.status(refusal.status).json({ error: refusal.error, code: refusal.code });
  return false;
}


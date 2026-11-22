import { WORKSPACE_ID } from "@jini-ai/admin/shell/lib/admin-http/config";
import { request } from "../../../lib/admin-http/request";
import { querySuffix } from "@jini-ai/core/admin-runtime";
import type { AdminThemeSummary, PresentationSettings, ThemeFileGroup, ThemeTier } from "./themes-api.types";

/** The admin API calls of the themes feature. */
export const themesApi = {
  getPresentation: (required: { kind?: "post" | "page" } = {}, _optional: Record<string, never> = {}) =>
    request<{
      settings: PresentationSettings;
      availableThemeIds: string[];
      availableThemes: AdminThemeSummary[];
      /** Template-picker feature (2026-08-10, unified 2026-08-11) — ONE list shared by both the
       *  Post editor's and the Pages editor's pickers (was two separate fields,
       *  `activeThemePostTemplates`/`activeThemePageTemplates`, until the unified `content` marker
       *  removed the reason they needed to differ). Editors now request `kind` to filter this
       *  list using the theme's optional `templateFor`; other callers retain the full catalog. */
      activeThemeTemplates: string[];
      activeThemeStaticPageIds: string[];
    }>({ path: `/workspaces/${WORKSPACE_ID}/presentation${querySuffix({ query: required.kind ? "kind=" + required.kind : "" })}` }),
  /**
   * One theme's editable surface: which pages it ships, which root partials, and where it was
   * copied from. Drives the Explore screen's file list and its "you are editing a copy" banner.
   */
  getThemeDetail: ({ themeId }: { themeId: string }, _optional: Record<string, never> = {}) =>
    request<{
      id: string;
      name: string;
      tier: string;
      /** Manifest schema version (`2`, or `undefined` for v1) — see `ThemeExplorePort.getThemeDetail`'s
       *  own doc for why the Explore screen needs this (2026-08-19 architecture audit findings 1 & 2). */
      apiVersion?: 2;
      status: string;
      errors: string[];
      pages: string[];
      partials: string[];
      /**
       * Every file in the theme folder, not just the ones the renderer knows about. `editable` is
       * false for binaries (images, fonts) — those are viewable via `/theme-assets/` but must never
       * be round-tripped through a textarea. `resettable` is false for files the author added
       * themselves, which have no original to go back to.
       */
      files: Array<{
        path: string;
        group: ThemeFileGroup;
        /** Whether the raw source can be fetched/displayed as text at all — false only for binary
         *  assets (images, fonts). Independent of `editable`: a script is readable but not editable. */
        readable: boolean;
        /** Whether the file can be saved (PUT/reset). False for binaries AND for read-only groups
         *  (`script`, `other`) even though those stay `readable`. */
        editable: boolean;
        inherited?: boolean;
        resettable: boolean;
        /** Whether the live file's bytes differ from its catalog original — `null` exactly when
         *  `resettable` is false (no original to compare against). Optional so an older cached client
         *  response (before this field existed) still parses. */
        modified?: boolean | null;
        /** `null` for every file the publish question does not apply to at all — every non-page
         *  file, plus a page that is `index`/`404` or a declared Post/Page template shell. Only a
         *  real standalone page gets `true`/`false`. Optional so an older cached client response
         *  (before this field existed) still parses. */
        published?: boolean | null;
        /** The live content record occupying this page's own slug — `null`/absent for every file
         *  `published` is also `null`/absent for, plus a real candidate page with no such record.
         *  See `ThemeExploreFile.collidingContent` (`use-theme-explore.hooks.ts`) for the full
         *  contract: a page can read `published: true` and still not be what a visitor gets. */
        collidingContent?: { id: string; slug: string; title: string; kind: "post" | "page" } | null;
      }>;
      /** True when an untouched original of this theme exists in the catalog to reset back to. */
      hasOriginal: boolean;
    }>({ path: `/workspaces/${WORKSPACE_ID}/themes/${encodeURIComponent(themeId)}` }),
  /**
   * Restore one file to the pristine copy in the originals catalog, byte for byte. DESTRUCTIVE —
   * overwrites the working copy with no backup, so the caller must confirm with the operator first.
   * A file already identical to its original is not rewritten: `wasModified: false`, `bytes: 0`.
   * `content` is the restored file's text, or `null` past the server's 1 MB text-read limit.
   */
  resetThemeFile: ({ themeId, path }: { themeId: string; path: string }, _optional: Record<string, never> = {}) =>
    request<{ path: string; wasModified: boolean; bytes: number; content: string | null }>(
      { path: `/workspaces/${WORKSPACE_ID}/themes/${encodeURIComponent(themeId)}/file/reset` },
      { init: { method: "POST", body: JSON.stringify({ path }) } }
    ),
  /**
   * Save the theme's CURRENT files as its stored original, in the server's hidden originals catalog
   * (never a visible theme), so Reset has something to restore from. 409 `ORIGINAL_EXISTS` when the
   * theme already has one.
   */
  saveThemeOriginal: ({ themeId }: { themeId: string }, _optional: Record<string, never> = {}) =>
    request<{ themeId: string; saved: true }>({ path: `/workspaces/${WORKSPACE_ID}/themes/${encodeURIComponent(themeId)}/original` }, { init: {
      method: "POST",
      body: JSON.stringify({}),
    } }),
  /** Raw source of one file inside a theme, relative to the theme root (`pages/about.html`). */
  getThemeFile: ({ themeId, path }: { themeId: string; path: string }, _optional: Record<string, never> = {}) =>
    request<{ path: string; content: string }>(
      { path: `/workspaces/${WORKSPACE_ID}/themes/${encodeURIComponent(themeId)}/file?path=${encodeURIComponent(path)}` }
    ),
  /** Overwrite one file inside a theme. Refused for catalog originals — those are never editable —
   *  and for read-only groups (scripts, `other`); see `ApiError.code === "READ_ONLY_FILE"`. */
  putThemeFile: ({ themeId, path, content }: { themeId: string; path: string; content: string }, _optional: Record<string, never> = {}) =>
    request<{ path: string; bytes: number }>(
      { path: `/workspaces/${WORKSPACE_ID}/themes/${encodeURIComponent(themeId)}/file` },
      { init: { method: "PUT", body: JSON.stringify({ path, content }) } }
    ),
  /**
   * Duplicate one file inside a theme. The server computes the destination name (`about.html` ->
   * `about-1.html`, following collisions) — this call takes only the source path, nothing operator-
   * typed. Offered for every group, including read-only-to-edit ones: copying a script's bytes is
   * harmless even though editing one is refused.
   */
  copyThemeFile: ({ themeId, path }: { themeId: string; path: string }, _optional: Record<string, never> = {}) =>
    request<{
      path: string;
      group: ThemeFileGroup;
      readable: boolean;
      editable: boolean;
      resettable: boolean;
      modified: boolean | null;
      copiedFrom: string;
    }>({ path: `/workspaces/${WORKSPACE_ID}/themes/${encodeURIComponent(themeId)}/file/copy` }, { init: {
      method: "POST",
      body: JSON.stringify({ path }),
    } }),
  /**
   * Rename one file within its current folder. `name` is a bare filename (no `/`), so this can never
   * move a file between folders. Refused for `pages/index.html`/`theme.json`/`tokens.json`
   * (`ApiError.code === "REQUIRED_FILE_LOCKED"`) and for a name already taken
   * (`code === "NAME_TAKEN"`).
   */
  renameThemeFile: ({ themeId, path, name }: { themeId: string; path: string; name: string }, _optional: Record<string, never> = {}) =>
    request<{
      path: string;
      group: ThemeFileGroup;
      readable: boolean;
      editable: boolean;
      resettable: boolean;
      modified: boolean | null;
      renamedFrom: string;
    }>({ path: `/workspaces/${WORKSPACE_ID}/themes/${encodeURIComponent(themeId)}/file/rename` }, { init: {
      method: "POST",
      body: JSON.stringify({ path, name }),
    } }),
  /**
   * Delete one file inside a theme, permanently — this repo keeps no theme-file revision history, so
   * there is no server-side undo. Refused for a theme's required files
   * (`ApiError.code === "REQUIRED_FILE_LOCKED"`) and for the same read-only-identity groups
   * (`script`, `other`) rename refuses (`code === "READ_ONLY_FILE"`) — see `explore.ts`'s
   * `validateFileIdentityChange` for the shared reasoning.
   */
  deleteThemeFile: ({ themeId, path }: { themeId: string; path: string }, _optional: Record<string, never> = {}) =>
    request<{ path: string; deleted: boolean }>(
      { path: `/workspaces/${WORKSPACE_ID}/themes/${encodeURIComponent(themeId)}/file/delete` },
      { init: { method: "POST", body: JSON.stringify({ path }) } }
    ),
  /**
   * Publish or unpublish one of a static theme's own pages — the real replacement for the
   * `_unpublished/` folder convention an agent invented ad hoc because no such control existed at the
   * time. Refused for a non-`static`-tier theme (`ApiError.code === "NOT_STATIC_TIER"`) or a page id
   * that isn't one of this theme's own standalone pages — it does not exist, or is `index`/`404`/a
   * declared Post-or-Page template shell — with `code === "PAGE_NOT_PUBLISHABLE"`.
   */
  setThemePagePublished: ({ themeId, page, published }: { themeId: string; page: string; published: boolean }, _optional: Record<string, never> = {}) =>
    request<{ page: string; published: boolean; publishedPages: string[] }>(
      { path: `/workspaces/${WORKSPACE_ID}/themes/${encodeURIComponent(themeId)}/page/publish` },
      { init: { method: "POST", body: JSON.stringify({ page, published }) } }
    ),
  /**
   * Re-run theme discovery server-side. Needed because the server's theme list is built once at
   * boot, so a theme added to disk afterwards (downloaded, copied, pulled in by git, created by the
   * `npm run theme` CLI) does not exist as far as this screen is concerned until someone asks.
   */
  rescanThemes: () =>
    request<{
      added: string[];
      removed: string[];
      total: number;
      availableThemeIds: string[];
      duplicateIds: string[];
    }>({ path: `/workspaces/${WORKSPACE_ID}/themes/rescan` }, { init: { method: "POST" } }),
  /**
   * Copy one theme into a new theme folder (the Themes screen's Duplicate action) — the same
   * server service the `theme_duplicate` agent tool calls. `newId` omitted ⇒ derived from `newName`
   * and suffixed until free. The server rescans before answering, so `availableThemeIds` already
   * includes the copy. Refusals carry `ApiError.code` (`ID_TAKEN`, `SYMLINK`, `TOO_LARGE`, …).
   */
  duplicateTheme: ({ themeId, newName }: { themeId: string; newName: string }, { newId }: { newId?: string } = {}) =>
    request<{
      theme: { id: string; name: string; tier: ThemeTier; status: string; errors: string[] };
      sourceThemeId: string;
      files: number;
      availableThemeIds: string[];
    }>({ path: `/workspaces/${WORKSPACE_ID}/themes/${encodeURIComponent(themeId)}/duplicate` }, { init: {
      method: "POST",
      body: JSON.stringify(newId === undefined ? { newName } : { newName, newId }),
    } }),
  setActiveTheme: ({ activeThemeId }: { activeThemeId: string }, _optional: Record<string, never> = {}) =>
    request<{ settings: PresentationSettings; availableThemeIds: string[] }>(
      { path: `/workspaces/${WORKSPACE_ID}/presentation` },
      { init: { method: "PATCH", body: JSON.stringify({ activeThemeId }) } }
    ),
};

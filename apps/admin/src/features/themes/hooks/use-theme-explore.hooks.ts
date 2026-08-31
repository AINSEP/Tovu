import { useCallback, useEffect, useState } from "react";

import { resolveThemeLayout } from "@tovu/theme-layout";

import { ApiError } from "@/lib/api";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { t as translateThemes } from "../themes-i18n";
import { defaultThemeExplorePort } from "./theme-explore-dependencies.hooks";
import type {
  ThemeExploreFileEntry,
  ThemeExplorePort,
  ThemeExploreSlugCollision,
  ThemeFileGroup,
} from "./theme-explore-port.hooks";
import {
  resolveRequestedThemeExploreSelection,
  writeThemeExploreSelectionToUrl,
} from "./theme-explore-url.hooks";
import type { Translate } from "@/lib/dictionary-translator";

/**
 * @file State for the Explore screen, so `ThemeExplore.tsx` is only markup — same split as
 * `use-themes.hooks.ts` / `Themes.tsx`.
 *
 * `deps.port` is injected (see `theme-explore-port.hooks.ts`) rather than reaching for `lib/api`'s
 * `api` directly. `ApiError` stays a direct import — pure error-classification, no I/O, same
 * reasoning as `redirects-port.hooks.ts`'s own exclusion of `describeApiError`.
 *
 * `deps.t` (standing i18n rule, 2026-08-11 — a component with a hook gets a BOUND `t` from that
 * hook, not its own `useAdminLocale()`/dictionary import, same shape `use-themes.hooks.ts`
 * established): injected so `ThemeExplore.tsx` sources its UI copy from this hook instead of
 * building its own `(key) => translateThemes(locale, key)` closure. This hook's OWN error strings
 * stay hardcoded English (unchanged) — `useAdminLocale()`/`themes-i18n.ts`'s `t` (aliased
 * `translateThemes`) are read only inside {@link useWiredThemeExplore}.
 */

export type ThemeExploreView = "preview" | "html";

export type { ThemeFileGroup, ThemeExploreSlugCollision };

/** One entry in the Explore file list. */
export interface ThemeExploreFile {
  /** Path relative to the theme root, e.g. `pages/about.html` or `css/styles.css`. */
  path: string;
  /** What to show in the list. */
  label: string;
  kind: ThemeFileGroup;
  /** Whether the raw source can be fetched/displayed as text at all. False only for binary assets
   *  (images, fonts) — `readFileSync(…, "utf8")` on those returns mojibake. Independent of
   *  `editable`: a script is readable (you can look at it) but not editable (you can't save it). */
  readable: boolean;
  /** Whether the file can be SAVED — false for binaries (which are also not `readable`) and for
   *  read-only groups (`script`, `other`) even though those stay `readable`. 2026-08-11: this used
   *  to be the same flag as `readable` (`editable`), which meant "make scripts read-only" had no way
   *  to also keep them viewable without a bigger change than the ask called for — splitting the two
   *  concepts is what unblocks that. */
  editable: boolean;
  /** False for files the author added, which have no original to restore from. */
  resettable: boolean;
  /**
   * Whether this file is currently a publicly reachable page — `null` for every file the question
   * does not apply to at all (every non-page file, plus a page that is `index`/`404` or a declared
   * Post/Page template shell), so the publish-row control (`ThemeExplore.tsx`) can tell "no publish
   * state for this file" apart from an actual off state, the same `readable`/`editable` split
   * pattern this file already uses for a different pair of questions. `true`/`false` for a real
   * standalone page, straight from the server's own `isStandaloneThemePage` — this can never drift
   * from what public routing actually does.
   */
  published: boolean | null;
  /**
   * The live content record occupying this page's own slug, or `null` for every file `published`
   * is also `null` for (same candidate-page gate) plus a real candidate page with no such record.
   *
   * A page can read `published: true` here and STILL not be what a visitor gets — or read
   * `published: false` and still resolve to someone ELSE's content — because
   * `resolveMarketingPageOrOverride` (`server/inbound/public-http/routes/site/pages.ts`) lets a live
   * Post/Page row at the same slug win independent of this toggle. `ThemeExplorePublishToggle`
   * surfaces this as its own warning precisely BECAUSE toggling this switch does not, by itself,
   * determine what a visitor sees at this URL.
   */
  collidingContent: ThemeExploreSlugCollision | null;
}

/** Heading order for the file list — most-edited first, generated/vendored/catch-all last. */
export const THEME_FILE_GROUPS: ReadonlyArray<{ key: ThemeFileGroup; label: string }> = [
  { key: "page", label: "Pages" },
  { key: "partial", label: "Partials" },
  { key: "style", label: "Styles" },
  { key: "script", label: "Scripts" },
  { key: "config", label: "Config" },
  { key: "asset", label: "Assets" },
  { key: "other", label: "Other" },
];

export interface ThemeExploreDetail {
  id: string;
  name: string;
  tier: string;
  /** Manifest schema version (`2`, or `undefined` for v1) — feeds {@link lockedRenamePaths} below,
   *  so the rename-lock pre-check resolves the same layout the server used to classify `files`. */
  apiVersion: 2 | undefined;
  status: string;
  errors: string[];
  lineage: { from?: string; tier?: string; version?: string; catalog?: string } | null;
  hasOriginal: boolean;
}

/**
 * Mirrors the server's `requiredThemeFiles` (`explore.ts`) — `loadTheme` fails without any of
 * these (a missing index page, or a `theme.json`/`tokens.json` that no longer parses), so renaming
 * one away reproduces that same breakage. The SERVER is the actual enforcement point (it refuses the
 * rename with `code: "REQUIRED_FILE_LOCKED"` regardless of what the client does); this client-side
 * copy only avoids a pointless round trip for the common case of double-clicking one of these files
 * directly.
 *
 * 2026-08-19 architecture audit findings 1 & 2: this used to be a fixed `Set` naming v1's
 * `pages/index.html` unconditionally, so a v2 theme's `render/pages/index.html` (every real static
 * theme on disk today) was never actually locked client-side — the operator's rename would start
 * inline, then fail with a round trip instead of an immediate inline refusal. Derived from
 * `resolveThemeLayout` (`@tovu/theme-layout` — the SAME resolver `explore.ts`'s server route uses)
 * so the two cannot drift apart again.
 */
function lockedIdentityPaths(apiVersion: 2 | undefined): readonly string[] {
  return resolveThemeLayout(apiVersion).requiredFiles;
}

/**
 * Groups whose files' NAME or EXISTENCE can never change — mirrors the server's own
 * `IDENTITY_LOCKED_GROUPS` rename/delete block in `explore.ts` (see that constant's doc comment for
 * the full reasoning). 2026-08-11 judgment call, still true after `script`'s CONTENT became editable
 * (2026-08-29 — see `explore.ts`'s `CONTENT_EDIT_LOCKED_GROUPS`): a silent rename or delete would
 * reopen the "nobody breaks the page from this screen" hole through a `<script src>` or similar
 * reference this screen has no way to find and fix (unlike a page rename, which gets a URL-change
 * warning because the renderer tracks page routes — nothing tracks arbitrary cross-file references the
 * same way). This client-side copy only avoids a pointless round trip; the server is the real
 * enforcement point. Shared by {@link startRename} and `openDeleteConfirm` (2026-08-29) — one set, not
 * two that could drift apart.
 */
const IDENTITY_LOCKED_GROUPS: ReadonlySet<ThemeFileGroup> = new Set(["script", "other"]);

/** `action`-qualified refusal reason shared by {@link startRename} and `openDeleteConfirm` — same
 *  three checks {@link lockedIdentityPaths}/{@link IDENTITY_LOCKED_GROUPS} answer server-side via
 *  `explore.ts`'s `validateFileIdentityChange`. */
function lockedIdentityChangeReason(
  path: string,
  kind: ThemeFileGroup,
  apiVersion: 2 | undefined,
  action: "renamed" | "deleted"
): string {
  if (path === resolveThemeLayout(apiVersion).indexPagePath) {
    return `${path} can't be ${action} — every theme requires this exact page to load at all.`;
  }
  if (lockedIdentityPaths(apiVersion).includes(path)) {
    return `${path} can't be ${action} — every theme requires this exact file to load at all.`;
  }
  return `${path} can't be ${action} — this file type is read-only in Explore, and ${action === "renamed" ? "renaming" : "deleting"} it could break a page or script that still refers to it by this name.`;
}

export interface ThemeExploreController {
  detail: ThemeExploreDetail | null;
  files: ThemeExploreFile[];
  /** Currently open file's path, or `null` before the first load settles. */
  selected: string | null;
  select: (path: string) => void;
  view: ThemeExploreView;
  setView: (value: ThemeExploreView) => void;
  /** Working copy of the open file — what the HTML tab edits. */
  source: string;
  setSource: (value: string) => void;
  /** True when `source` differs from what was last loaded or saved. */
  dirty: boolean;
  saving: boolean;
  error: string | null;
  /** Manually clear `error` — the toast's own close button, so a dismissed message cannot resurface
   *  on the next unrelated render (the same reason {@link dismissNotice} exists for `notice`). Every
   *  action that CAN fail also clears `error` itself at the start of its own attempt, so this only
   *  matters for the "operator dismissed it and did nothing else yet" path. */
  dismissError: () => void;
  notice: string | null;
  dismissNotice: () => void;
  save: () => Promise<void>;
  /** True while a reset round trip is in flight. */
  resetting: boolean;
  /**
   * Whether the destructive-action confirmation is showing.
   *
   * Held in the controller rather than local component state so the confirmation and the action it
   * guards cannot drift apart — a dialog that closes without the reset running, or a reset that
   * runs with the dialog still open, are both states this makes unrepresentable.
   */
  resetConfirmOpen: boolean;
  openResetConfirm: () => void;
  closeResetConfirm: () => void;
  reset: () => Promise<void>;
  /**
   * Bumped after every successful save. The preview iframe keys off this to force a reload — the
   * rendered page lives on the site server, not in this app's state, so re-rendering the component
   * would otherwise show the pre-save HTML from the browser's cache.
   */
  previewNonce: number;
  /** Path of the file currently in inline-rename edit mode (double-click, or the ⋮ menu's Rename),
   *  or `null` when nothing is being renamed. */
  renamingPath: string | null;
  /** The inline rename input's current text. */
  renameDraft: string;
  setRenameDraft: (value: string) => void;
  /** Begin renaming `path` — refused inline (with `error` set to why) for one of
   *  {@link lockedRenamePaths}. */
  startRename: (path: string) => void;
  /** Abandon the in-progress rename with no server call. */
  cancelRename: () => void;
  /** Commit the current `renameDraft`. A same-name draft is a silent no-op close; a PAGE (other than
   *  the locked index) is diverted into `pageRenameWarning` instead of renaming immediately, since
   *  that changes the page's public URL. */
  commitRename: () => void;
  /** True while a rename round trip is in flight. */
  renaming: boolean;
  /** Set when `commitRename` targets a non-index PAGE — holds enough to actually perform the rename
   *  once the operator confirms past the URL-change warning. */
  pageRenameWarning: { path: string; name: string } | null;
  confirmPageRename: () => Promise<void>;
  cancelPageRenameWarning: () => void;
  /** Path of the file currently being duplicated, or `null`. Copy has no confirmation step — "it'll
   *  just copy it right in the sidebar" — so this only exists to keep a rapid double-select from
   *  firing the request twice. */
  copyingPath: string | null;
  copyFile: (path: string) => Promise<void>;
  /**
   * Path of the file pending delete confirmation, or `null` — held in the controller for the same
   * reason {@link resetConfirmOpen} is: the confirmation and the destructive action it guards cannot
   * drift apart. Unlike Reset (which only ever targets `selected`), Delete is offered from the ⋮ menu
   * on ANY row, so the target has to be its own path rather than a boolean, the same shape
   * {@link pageRenameWarning} uses for the same reason.
   */
  deleteTarget: string | null;
  /** Begin deleting `path` — refused inline (with `error` set to why) for a required file or an
   *  {@link IDENTITY_LOCKED_GROUPS} member, same client-side pre-check shape as {@link startRename}. */
  openDeleteConfirm: (path: string) => void;
  /** Abandon the pending delete with no server call. */
  closeDeleteConfirm: () => void;
  /** True while a delete round trip is in flight. */
  deleting: boolean;
  /** Commit the delete of {@link deleteTarget}. DESTRUCTIVE and, unlike Reset, not recoverable from
   *  this screen at all — see this hook's own `confirmDelete` doc comment. */
  confirmDelete: () => Promise<void>;
  /** True while a publish/unpublish round trip for the selected file is in flight. */
  publishing: boolean;
  /**
   * Publish or unpublish the SELECTED file's page — a no-op if `selected` has no publish state at all
   * (`files.find(...).published` is `null`), matching {@link save}/{@link reset}'s own "acts on
   * `selected` implicitly" shape rather than taking a path argument.
   */
  setPagePublished: (published: boolean) => Promise<void>;
  /** Bound translator — `ThemeExplore.tsx`'s only source of UI copy; see this file's own header. */
  t: Translate;
}

/**
 * `pages/about.html` → `about`; `css/styles.css` → `styles.css`.
 *
 * Pages and partials drop their `.html` because within those groups the extension is redundant —
 * every entry has it. Everything else KEEPS its extension, because `styles` vs `styles.css` vs
 * `styles.min.css` is exactly the distinction an author needs to see in a Styles or Assets list.
 */
function fileLabel(path: string, kind: ThemeFileGroup): string {
  const base = path.slice(path.lastIndexOf("/") + 1);
  return kind === "page" || kind === "partial" ? base.replace(/\.html$/, "") : base;
}

/** The path's own filename segment, extension included — what an inline rename edits. */
function basenameOf(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/**
 * Owner-reported bug (2026-08-12): clicking a `.liquid` template in Explore downloaded it instead of
 * previewing it. Originally patched HERE, client-side (overriding `readable` to `true` for any
 * `.liquid` path regardless of what the listing route reported), because the GET-file route
 * (`readThemeFile`, `theme-files.ts`) already returned ANY file's content as UTF-8 text
 * unconditionally — only the LISTING route's classification (`explore.ts`'s
 * `TEXT_READABLE_EXTENSIONS`) was stale.
 *
 * Moved server-side (2026-08-12, follow-up): `.liquid` is now IN `TEXT_READABLE_EXTENSIONS`, so the
 * listing route itself reports `readable: true` and this function goes back to a plain passthrough —
 * see that constant's own doc for why server-side is the more correct home (every consumer of the
 * listing route agrees, not just this hook). `editable` was never touched by either version of the
 * fix: the server's PUT route still refuses to write a `.liquid` file (`isThemeFileWritable`'s
 * `other`-group gate), so this stays a read-only SOURCE preview, not a new edit surface — matching
 * how `script`/`other`-group files are already readable-but-not-editable.
 *
 * @complexity O(n) in `entries.length` — one pass, each file mapped independently.
 */
function mapDetailFiles(entries: ThemeExploreFileEntry[]): ThemeExploreFile[] {
  return entries.map((f) => ({
    path: f.path,
    label: fileLabel(f.path, f.group),
    kind: f.group,
    readable: f.readable,
    editable: f.editable,
    resettable: f.resettable,
    // `?? null` normalizes an absent/undefined wire value (an older cached response, or a fixture
    // that predates this field) into the same "no publish state" meaning `null` already carries —
    // `ThemeExploreFile.published` is never `undefined`, so every reader gets one two-valued-plus-null
    // contract to check instead of also handling a third, functionally-identical absent case.
    published: f.published ?? null,
    // Same absent/undefined normalization as `published` just above, same reason.
    collidingContent: f.collidingContent ?? null,
  }));
}

/**
 * Fetch one theme's detail and map it into this hook's shapes in one place, so the initial load
 * effect and the post-copy/post-rename refresh (which must NOT also re-run the initial effect's
 * default-selection logic) share one definition of "what does the server say about this theme"
 * instead of two `.map()`s drifting apart.
 */
async function fetchThemeExploreState(
  themeId: string,
  port: ThemeExplorePort
): Promise<{ detail: ThemeExploreDetail; files: ThemeExploreFile[] }> {
  const r = await port.getThemeDetail(themeId);
  return {
    detail: {
      id: r.id,
      name: r.name,
      tier: r.tier,
      apiVersion: r.apiVersion,
      status: r.status,
      errors: r.errors,
      lineage: r.lineage,
      hasOriginal: r.hasOriginal,
    },
    files: mapDetailFiles(r.files),
  };
}

export interface ThemeExploreDependencies {
  port: ThemeExplorePort;
  t: Translate;
}

/** Route-supplied inputs that only steer the FIRST render — everything here is read once, by the
 *  initial-load effect, and never again. Kept out of {@link ThemeExploreDependencies} because these
 *  are not injected collaborators; they are values off the URL. */
export interface ThemeExploreOptions {
  /**
   * Page to open on, from `?page=` — a page id (`about`), its filename (`about.html`), or any other
   * value {@link resolveThemeExploreSelectionValue} (`theme-explore-url.hooks.ts`) accepts.
   *
   * Set by the Pages screen's "Theme Pages" tab, whose rows link straight here (see
   * `features/pages/Pages.tsx`'s `themeStudioHref`), and by this screen's own write-back
   * ({@link writeThemeExploreSelectionToUrl}) whenever the open file is an ordinary page. Absent,
   * unknown, or naming nothing this theme has all degrade to the same default selection an
   * unparameterized visit gets, plus a "not found" toast when something WAS asked for and neither
   * this nor {@link fileId} resolved (see {@link initialSelectedPath}) — a bad `?page=` must never
   * be able to open Explore on nothing, nor silently open a DIFFERENT file with no indication
   * anything was wrong.
   */
  pageId?: string;
  /**
   * File to open on, from `?file=` — the file's own full relative path, extension included (e.g.
   * `render/pages/404.html`, `theme.json`), or any other value the same shared resolver accepts.
   * Takes priority over {@link pageId} when both are present (see {@link initialSelectedPath}):
   * this is the write-back target for a non-page file ({@link writeThemeExploreSelectionToUrl}),
   * so the URL a user is currently looking at wins over an older `?page=` link. Absent, unknown, or
   * naming a file this theme doesn't have all degrade the same way `pageId`'s own doc describes.
   */
  fileId?: string;
}

/**
 * What to open when nothing was asked for (or nothing that WAS asked for could be resolved): the
 * theme's own index page, else the first page, else the first file, else nothing.
 *
 * `apiVersion`-aware via {@link resolveThemeLayout} (2026-08-31, verified live) — this used to
 * hardcode v1's `pages/index.html` unconditionally, the same bug class the 2026-08-19 architecture
 * audit already found and fixed for {@link lockedIdentityPaths} above. A v2 theme's real index page
 * (`render/pages/index.html`) never matched that literal, so this silently fell through to "the
 * first PAGE in server order" instead of the index — and `listThemeFiles` (`theme-files.ts`)
 * returns that order alphabetically sorted, with `"404.html"` sorting before every other page.
 * Confirmed live: `http://localhost:5173/admin/themes/explore?theme=basic` — a real, schema-v2
 * theme — opened on `render/pages/404.html` with NO page/file param at all, before this fix.
 *
 * @complexity Time O(n) in `files.length` — at most three independent scans, no nesting.
 */
function defaultSelectedPath(files: ThemeExploreFile[], apiVersion: 2 | undefined): string | null {
  const indexPagePath = resolveThemeLayout(apiVersion).indexPagePath;
  return (
    files.find((f) => f.path === indexPagePath)?.path ??
    files.find((f) => f.kind === "page")?.path ??
    files[0]?.path ??
    null
  );
}

/**
 * The file to open when the theme's listing first lands, plus whether anything that WAS asked for
 * failed to resolve: `?file=`/`?page=`, tried through the shared
 * {@link resolveRequestedThemeExploreSelection} resolver (`theme-explore-url.hooks.ts` — split out
 * there for the same complexity-drift reason this used to be spread across small helpers here),
 * else the ordinary default. `missed` lets the initial-load effect surface an explicit "not found"
 * toast instead of landing on the default in total silence — the fix for the owner's own
 * `?page=about.html`-opens-a-different-page report (see `theme-explore-url.hooks.ts`'s file header
 * for the full trace).
 *
 * @complexity Time O(n) in `files.length`.
 */
function initialSelectedPath(
  files: ThemeExploreFile[],
  {
    fileId,
    pageId,
    apiVersion,
  }: { fileId: string | undefined; pageId: string | undefined; apiVersion: 2 | undefined }
): { path: string | null; missed: string | null } {
  const requested = resolveRequestedThemeExploreSelection(files, { fileId, pageId });
  if (requested.path !== null) return requested;
  return { path: defaultSelectedPath(files, apiVersion), missed: requested.missed };
}

export function useThemeExplore(
  themeId: string,
  { port, t }: ThemeExploreDependencies,
  { pageId, fileId }: ThemeExploreOptions = {}
): ThemeExploreController {
  const [detail, setDetail] = useState<ThemeExploreDetail | null>(null);
  const [files, setFiles] = useState<ThemeExploreFile[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<ThemeExploreView>("preview");
  const [source, setSource] = useState("");
  const [savedSource, setSavedSource] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [previewNonce, setPreviewNonce] = useState(0);
  const [resetting, setResetting] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [pageRenameWarning, setPageRenameWarning] = useState<{ path: string; name: string } | null>(null);
  const [copyingPath, setCopyingPath] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchThemeExploreState(themeId, port)
      .then(({ detail: nextDetail, files: nextFiles }) => {
        if (cancelled) return;
        setDetail(nextDetail);
        setFiles(nextFiles);
        // `?file=`/`?page=` when the caller named one (through the shared resolver), else the
        // theme's own index page — `loadTheme` requires it, so a valid theme always has one. See
        // {@link initialSelectedPath}. Deliberately does NOT write back to the address bar itself —
        // loading `?theme=basic` bare should not rewrite the URL the instant the default page
        // resolves, the same "only a real user action moves the URL" restraint
        // `use-media-tabs.hooks.ts`'s own `setActiveTab` follows; only {@link select} below does.
        const { path, missed } = initialSelectedPath(nextFiles, {
          fileId,
          pageId,
          apiVersion: nextDetail.apiVersion,
        });
        setSelected(path);
        // Only when something was actually asked for and NEITHER param resolved to a file this
        // theme has — an intentional layered fallback (`fileId` failing over to a valid `pageId`)
        // is not a miss. This is the fix for the owner-reported bug: a stale/mistyped link must
        // never look like it silently opened a different, valid file with nothing amiss.
        if (missed !== null) setError(`"${missed}" isn't a page or file in this theme.`);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "failed to load theme");
      });
    return () => {
      cancelled = true;
    };
    // `fileId`/`pageId` are deps so that changing `?file=`/`?page=` in the address bar reselects, the
    // same way changing `?theme=` reloads. Neither one moves on an ordinary re-render — `pageId` only
    // ever moves on a genuine cross-screen navigation (`Pages.tsx`'s "Theme Pages" links), and `fileId`
    // only via the SAME kind of navigation or a real page load, never as a side effect of this screen's
    // own `select` (see `writeThemeExploreSelectionToUrl`'s own doc, `theme-explore-url.hooks.ts`,
    // for why that write deliberately does not notify this effect) — so this does not refetch on an
    // ordinary click, and re-running the INITIAL-load effect is exactly right on the navigations
    // where it does move.
  }, [themeId, port, pageId, fileId]);

  useEffect(() => {
    if (selected === null) return;
    // Non-text files are never fetched as text. `readFileSync(…, "utf8")` on a PNG returns mojibake,
    // and saving that back would genuinely corrupt the file — so the request is not made at all
    // rather than made and then guarded against in the UI. Gated on `readable`, NOT `editable`: a
    // script is not editable but IS readable, and still needs its source fetched to be viewed.
    if (files.find((f) => f.path === selected)?.readable === false) {
      setSource("");
      setSavedSource("");
      return;
    }
    let cancelled = false;
    port
      .getThemeFile(themeId, selected)
      .then((r) => {
        if (cancelled) return;
        setSource(r.content);
        setSavedSource(r.content);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "failed to read file");
      });
    return () => {
      cancelled = true;
    };
  }, [themeId, selected, files, port]);

  const save = useCallback(async () => {
    if (selected === null) return;
    setSaving(true);
    setError(null);
    try {
      await port.putThemeFile(themeId, selected, source);
      setSavedSource(source);
      setNotice(`Saved ${selected}`);
      setPreviewNonce((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to save file");
    } finally {
      setSaving(false);
    }
  }, [themeId, selected, source, port]);

  /**
   * Restore the open file to its catalog original.
   *
   * Overwrites the working copy with no backup, so the caller is expected to have confirmed with the
   * operator first — `resetConfirmOpen` below is that gate. Deliberately NOT wired to the ⌘S-style
   * convenience path for the same reason.
   */
  const reset = useCallback(async () => {
    if (selected === null) return;
    setResetting(true);
    setError(null);
    try {
      const r = await port.resetThemeFile(themeId, selected);
      // Adopt the server's returned content rather than re-fetching: it is the exact bytes just
      // written, so the editor cannot briefly show the pre-reset source.
      setSource(r.content);
      setSavedSource(r.content);
      setNotice(`Reset ${selected} to the original`);
      setPreviewNonce((n) => n + 1);
      setResetConfirmOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to reset file");
    } finally {
      setResetting(false);
    }
  }, [themeId, selected, port]);

  /**
   * Actually perform a rename against the server and reconcile local state — the one place both the
   * inline-edit fast path and the page-URL-change confirm dialog end up, so the two entry points
   * cannot land on two different post-rename behaviors.
   *
   * Refetches the whole theme detail rather than patching `files` in place: the server is
   * authoritative for the renamed entry's `group`/`editable`/`resettable` (a `.html` renamed to
   * `.txt` would reclassify, for instance), and a targeted patch would have to reproduce that logic
   * a second time to stay correct.
   */
  const performRename = useCallback(
    async (sourcePath: string, name: string) => {
      setRenaming(true);
      setError(null);
      try {
        const r = await port.renameThemeFile(themeId, sourcePath, name);
        const nextSelected = selected === sourcePath ? r.path : selected;
        const { detail: nextDetail, files: nextFiles } = await fetchThemeExploreState(themeId, port);
        setDetail(nextDetail);
        setFiles(nextFiles);
        setSelected(nextSelected);
        setNotice(`Renamed to ${r.path}`);
        setPreviewNonce((n) => n + 1);
      } catch (e) {
        setError(
          e instanceof ApiError && e.code === "NAME_TAKEN"
            ? `'${name}' already exists in this theme`
            : e instanceof Error
              ? e.message
              : "failed to rename file"
        );
      } finally {
        setRenaming(false);
        setRenamingPath(null);
        setRenameDraft("");
      }
    },
    [themeId, selected, port]
  );

  const startRename = useCallback(
    (path: string) => {
      const kind = files.find((f) => f.path === path)?.kind;
      const apiVersion = detail?.apiVersion;
      if (lockedIdentityPaths(apiVersion).includes(path) || (kind !== undefined && IDENTITY_LOCKED_GROUPS.has(kind))) {
        setError(lockedIdentityChangeReason(path, kind ?? "config", apiVersion, "renamed"));
        return;
      }
      setError(null);
      setRenamingPath(path);
      setRenameDraft(basenameOf(path));
    },
    [files, detail]
  );

  const cancelRename = useCallback(() => {
    setRenamingPath(null);
    setRenameDraft("");
  }, []);

  /**
   * Validate and dispatch the current `renameDraft`. A page (other than the locked index, which
   * never reaches here) is diverted to `pageRenameWarning` instead of renaming immediately — renaming
   * it changes its public URL, and that is worth a pause the way Reset's confirm dialog is, even
   * though a rename is not itself destructive to file contents the way Reset is.
   */
  const commitRename = useCallback(() => {
    if (renamingPath === null) return;
    const sourcePath = renamingPath;
    const name = renameDraft.trim();
    const currentBase = basenameOf(sourcePath);

    if (name.length === 0) {
      setError("Name cannot be empty");
      return;
    }
    if (name.includes("/") || name.includes("\\")) {
      setError("Name cannot contain a path separator");
      return;
    }
    if (name === currentBase) {
      cancelRename();
      return;
    }

    const file = files.find((f) => f.path === sourcePath);
    if (file?.kind === "page") {
      setRenamingPath(null);
      setPageRenameWarning({ path: sourcePath, name });
      return;
    }

    setRenamingPath(null);
    void performRename(sourcePath, name);
  }, [renamingPath, renameDraft, files, performRename, cancelRename]);

  const confirmPageRename = useCallback(async () => {
    if (!pageRenameWarning) return;
    const { path, name } = pageRenameWarning;
    setPageRenameWarning(null);
    await performRename(path, name);
  }, [pageRenameWarning, performRename]);

  const cancelPageRenameWarning = useCallback(() => setPageRenameWarning(null), []);

  /**
   * Duplicate a file. No confirmation step by design ("it'll just copy it right in the sidebar" —
   * the owner's own framing) — offered for every group, including read-only-to-edit ones, since
   * copying bytes changes nothing about the source and nothing any existing reference points at.
   */
  const copyFile = useCallback(
    async (path: string) => {
      if (copyingPath !== null) return;
      setCopyingPath(path);
      setError(null);
      try {
        const r = await port.copyThemeFile(themeId, path);
        const { detail: nextDetail, files: nextFiles } = await fetchThemeExploreState(themeId, port);
        setDetail(nextDetail);
        setFiles(nextFiles);
        setSelected(r.path);
        setNotice(`Copied to ${r.path}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "failed to copy file");
      } finally {
        setCopyingPath(null);
      }
    },
    [themeId, copyingPath, port]
  );

  /**
   * Begin deleting `path` — same client-side pre-check shape {@link startRename} uses: a required
   * file or an {@link IDENTITY_LOCKED_GROUPS} member is refused immediately (with `error` set to why)
   * rather than opening the confirmation, avoiding a pointless round trip for the common case. The
   * server (`explore.ts`'s `validateFileIdentityChange`) is the real enforcement point regardless.
   */
  const openDeleteConfirm = useCallback(
    (path: string) => {
      const kind = files.find((f) => f.path === path)?.kind;
      const apiVersion = detail?.apiVersion;
      if (lockedIdentityPaths(apiVersion).includes(path) || (kind !== undefined && IDENTITY_LOCKED_GROUPS.has(kind))) {
        setError(lockedIdentityChangeReason(path, kind ?? "config", apiVersion, "deleted"));
        return;
      }
      setError(null);
      setDeleteTarget(path);
    },
    [files, detail]
  );

  const closeDeleteConfirm = useCallback(() => setDeleteTarget(null), []);

  /**
   * Commit the delete of `deleteTarget`. DESTRUCTIVE and, unlike Reset, not recoverable from this
   * screen at all — there is no backup and no "restore from original" once the file itself is gone.
   * `openDeleteConfirm`'s own confirmation dialog is the only thing standing between a click and this.
   *
   * Refetches the whole theme detail rather than patching `files` in place, matching
   * {@link performRename}/{@link copyFile}'s own reasoning: the server is authoritative for what the
   * theme's file list looks like after the change. If the deleted file was the one open, selection
   * falls back to the theme's default page — the same fallback the initial load effect uses when
   * nothing in particular was requested — rather than pointing at a path that no longer exists.
   */
  const confirmDelete = useCallback(async () => {
    if (deleteTarget === null) return;
    const path = deleteTarget;
    setDeleting(true);
    setError(null);
    try {
      await port.deleteThemeFile(themeId, path);
      const { detail: nextDetail, files: nextFiles } = await fetchThemeExploreState(themeId, port);
      setDetail(nextDetail);
      setFiles(nextFiles);
      setSelected((current) => (current === path ? defaultSelectedPath(nextFiles, nextDetail.apiVersion) : current));
      setNotice(`Deleted ${path}`);
      setDeleteTarget(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to delete file");
    } finally {
      setDeleting(false);
    }
  }, [themeId, deleteTarget, port]);

  /**
   * Select a file, and mirror it into the address bar for shareability — `?page=<label>` for an
   * ordinary page, `?file=<path>` for anything else. See
   * {@link writeThemeExploreSelectionToUrl}'s own doc (`theme-explore-url.hooks.ts`) for why the
   * two forms differ and why that write is a plain `history.replaceState` rather than a round trip
   * through this app's `navigate()`.
   */
  const select = useCallback(
    (path: string) => {
      setSelected(path);
      const file = files.find((f) => f.path === path);
      if (file) writeThemeExploreSelectionToUrl(file);
    },
    [files]
  );

  /**
   * Publish or unpublish the currently SELECTED file's page — a no-op if it has no publish state at
   * all (not a page, or `index`/`404`/a declared template shell), matching {@link save}/{@link reset}'s
   * own "acts on `selected` implicitly" shape.
   *
   * Patches `files` locally rather than refetching the whole theme detail the way rename/copy/delete
   * do: the response already names the exact page and its new state, and — even on a theme's FIRST
   * toggle, when the server backfills every other already-published page into `publishedPages` — every
   * OTHER page's own `isStandaloneThemePage` result is unchanged by that backfill (it only ever
   * records what was already true), so there is nothing a refetch would learn that this response does
   * not already say.
   */
  const setPagePublished = useCallback(
    async (published: boolean) => {
      const file = files.find((f) => f.path === selected);
      if (!file || file.published === null) return;
      const pageId = file.label; // page files' label is already the basename minus `.html` — the page id.
      setPublishing(true);
      setError(null);
      try {
        const r = await port.setPagePublished(themeId, pageId, published);
        setFiles((prev) => prev.map((f) => (f.path === file.path ? { ...f, published: r.published } : f)));
        setNotice(r.published ? `Published ${pageId}` : `Unpublished ${pageId}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "failed to update publish state");
      } finally {
        setPublishing(false);
      }
    },
    [themeId, selected, files, port]
  );

  const dirty = source !== savedSource;

  /**
   * ⌘S / Ctrl+S saves the open file.
   *
   * `preventDefault` is the load-bearing half, and it runs even when there is nothing to save: the
   * browser's own "Save Page As…" dialog is what ⌘S does otherwise, and a text editor that opens a
   * file-download dialog on the universal save chord is worse than one with no shortcut at all. So
   * the key is always swallowed on this screen, and only the SAVE is conditional.
   *
   * Bound to `window` in a capture-phase-free listener rather than to the textarea, because the
   * chord should work from anywhere on the screen — after clicking a file in the sidebar, or with
   * focus in the preview toolbar — not only while the caret happens to be in the editor.
   */
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      if (!dirty || saving || selected === null) return;
      void save();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dirty, saving, selected, save]);

  return {
    detail,
    files,
    selected,
    select,
    view,
    setView,
    source,
    setSource,
    dirty,
    saving,
    error,
    dismissError: () => setError(null),
    notice,
    dismissNotice: () => setNotice(null),
    save,
    resetting,
    resetConfirmOpen,
    openResetConfirm: () => setResetConfirmOpen(true),
    closeResetConfirm: () => setResetConfirmOpen(false),
    reset,
    previewNonce,
    renamingPath,
    renameDraft,
    setRenameDraft,
    startRename,
    cancelRename,
    commitRename,
    renaming,
    pageRenameWarning,
    confirmPageRename,
    cancelPageRenameWarning,
    copyingPath,
    copyFile,
    deleteTarget,
    openDeleteConfirm,
    closeDeleteConfirm,
    deleting,
    confirmDelete,
    publishing,
    setPagePublished,
    t,
  };
}

/**
 * Binds the real `/api/.../themes/:id` file-editing client and a `themes-i18n.ts`-bound
 * translator — see `theme-explore-dependencies.hooks.ts`.
 *
 * The zero-argument-dependencies half of the `useX(dependencies)` / `useWiredX()` pair, so
 * `ThemeExplore.tsx` composes this and a test composes {@link useThemeExplore} with
 * `createFakeThemeExplorePort`.
 */
export function useWiredThemeExplore(themeId: string, options: ThemeExploreOptions = {}): ThemeExploreController {
  const locale = useAdminLocale();
  const t = (key: string): string => translateThemes(locale, key);
  return useThemeExplore(themeId, { port: defaultThemeExplorePort, t }, options);
}

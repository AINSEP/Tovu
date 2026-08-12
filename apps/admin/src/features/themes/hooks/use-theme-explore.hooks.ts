import { useCallback, useEffect, useState } from "react";

import { ApiError } from "../../../lib/api";
import { useAdminLocale } from "../../../hooks/use-admin-locale.hooks";
import { t as translateThemes } from "../themes-i18n";
import { defaultThemeExplorePort } from "./theme-explore-dependencies.hooks";
import type { ThemeExploreFileEntry, ThemeExplorePort, ThemeFileGroup } from "./theme-explore-port.hooks";

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

export type { ThemeFileGroup };

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
  status: string;
  errors: string[];
  lineage: { from?: string; tier?: string; version?: string; catalog?: string } | null;
  hasOriginal: boolean;
}

/**
 * Mirrors the server's `REQUIRED_THEME_FILES` (`explore.ts`) — `loadTheme` fails without any of
 * these (missing `pages/index.html`, or a `theme.json`/`tokens.json` that no longer parses), so
 * renaming one away reproduces that same breakage. The SERVER is the actual enforcement point (it
 * refuses the rename with `code: "REQUIRED_FILE_LOCKED"` regardless of what the client does); this
 * client-side copy only avoids a pointless round trip for the common case of double-clicking one of
 * these three files directly.
 */
const LOCKED_RENAME_PATHS: ReadonlySet<string> = new Set(["pages/index.html", "theme.json", "tokens.json"]);

/**
 * Groups whose files can never be renamed — mirrors the server's own `READ_ONLY_GROUPS` rename block
 * in `explore.ts` (see that constant's doc comment for the full reasoning). 2026-08-11 judgment call:
 * `script`/`other` are already read-only for CONTENT so nobody breaks the page from this screen; a
 * silent rename would reopen the same hole through a `<script src>` or similar reference this screen
 * has no way to find and fix (unlike a page rename, which gets a URL-change warning because the
 * renderer tracks page routes — nothing tracks arbitrary cross-file references the same way). This
 * client-side copy only avoids a pointless round trip; the server is the real enforcement point.
 */
const READ_ONLY_RENAME_GROUPS: ReadonlySet<ThemeFileGroup> = new Set(["script", "other"]);

function lockedRenameReason(path: string, kind: ThemeFileGroup): string {
  if (path === "pages/index.html") {
    return "pages/index.html can't be renamed — every theme requires this exact page to load at all.";
  }
  if (LOCKED_RENAME_PATHS.has(path)) {
    return `${path} can't be renamed — every theme requires this exact file to load at all.`;
  }
  return `${path} can't be renamed — this file type is read-only in Explore, and renaming it could break a page or script that still refers to it by this name.`;
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
  /** Begin renaming `path` — refused inline (with `error` set to why) for `LOCKED_RENAME_PATHS`. */
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
  /** Bound translator — `ThemeExplore.tsx`'s only source of UI copy; see this file's own header. */
  t: (key: string) => string;
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

function mapDetailFiles(entries: ThemeExploreFileEntry[]): ThemeExploreFile[] {
  return entries.map((f) => ({
    path: f.path,
    label: fileLabel(f.path, f.group),
    kind: f.group,
    readable: f.readable,
    editable: f.editable,
    resettable: f.resettable,
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
  t: (key: string) => string;
}

export function useThemeExplore(themeId: string, { port, t }: ThemeExploreDependencies): ThemeExploreController {
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

  useEffect(() => {
    let cancelled = false;
    fetchThemeExploreState(themeId, port)
      .then(({ detail: nextDetail, files: nextFiles }) => {
        if (cancelled) return;
        setDetail(nextDetail);
        setFiles(nextFiles);
        // Open `pages/index.html` by default — the page an author most likely wants first, and
        // `loadTheme` requires it, so a valid theme always has one.
        setSelected(
          nextFiles.find((f) => f.path === "pages/index.html")?.path ??
            nextFiles.find((f) => f.kind === "page")?.path ??
            nextFiles[0]?.path ??
            null
        );
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "failed to load theme");
      });
    return () => {
      cancelled = true;
    };
  }, [themeId, port]);

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
      if (LOCKED_RENAME_PATHS.has(path) || (kind !== undefined && READ_ONLY_RENAME_GROUPS.has(kind))) {
        setError(lockedRenameReason(path, kind ?? "config"));
        return;
      }
      setError(null);
      setRenamingPath(path);
      setRenameDraft(basenameOf(path));
    },
    [files]
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
    select: setSelected,
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
export function useWiredThemeExplore(themeId: string): ThemeExploreController {
  const locale = useAdminLocale();
  const t = (key: string): string => translateThemes(locale, key);
  return useThemeExplore(themeId, { port: defaultThemeExplorePort, t });
}

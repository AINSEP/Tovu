import { useCallback, useEffect, useState } from "react";

import { api } from "../../../lib/api";

/**
 * @file State for the Explore screen, so `ThemeExplore.tsx` is only markup — same split as
 * `use-themes.hooks.ts` / `Themes.tsx`.
 */

export type ThemeExploreView = "preview" | "html";

export type ThemeFileGroup = "page" | "partial" | "style" | "script" | "config" | "asset";

/** One entry in the Explore file list. */
export interface ThemeExploreFile {
  /** Path relative to the theme root, e.g. `pages/about.html` or `css/styles.css`. */
  path: string;
  /** What to show in the list. */
  label: string;
  kind: ThemeFileGroup;
  /** False for binaries — viewable via `/theme-assets/`, never round-tripped through a textarea. */
  editable: boolean;
  /** False for files the author added, which have no original to restore from. */
  resettable: boolean;
}

/** Heading order for the file list — most-edited first, generated/vendored last. */
export const THEME_FILE_GROUPS: ReadonlyArray<{ key: ThemeFileGroup; label: string }> = [
  { key: "page", label: "Pages" },
  { key: "partial", label: "Partials" },
  { key: "style", label: "Styles" },
  { key: "script", label: "Scripts" },
  { key: "config", label: "Config" },
  { key: "asset", label: "Assets" },
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

export function useThemeExplore(themeId: string): ThemeExploreController {
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

  useEffect(() => {
    let cancelled = false;
    api
      .getThemeDetail(themeId)
      .then((r) => {
        if (cancelled) return;
        setDetail({
          id: r.id,
          name: r.name,
          tier: r.tier,
          status: r.status,
          errors: r.errors,
          lineage: r.lineage,
          hasOriginal: r.hasOriginal,
        });
        // Sourced from the server's full folder listing rather than the renderer's pages/partials
        // maps: CSS, JS, tokens and images are exactly what an author changes to make a downloaded
        // theme theirs, and the screen used to hide every one of them.
        const list: ThemeExploreFile[] = r.files.map((f) => ({
          path: f.path,
          label: fileLabel(f.path, f.group),
          kind: f.group,
          editable: f.editable,
          resettable: f.resettable,
        }));
        setFiles(list);
        // Open `pages/index.html` by default — the page an author most likely wants first, and
        // `loadTheme` requires it, so a valid theme always has one.
        setSelected(
          list.find((f) => f.path === "pages/index.html")?.path ??
            list.find((f) => f.kind === "page")?.path ??
            list[0]?.path ??
            null
        );
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "failed to load theme");
      });
    return () => {
      cancelled = true;
    };
  }, [themeId]);

  useEffect(() => {
    if (selected === null) return;
    // Binaries are never fetched as text. `readFileSync(…, "utf8")` on a PNG returns mojibake, and
    // saving that back would genuinely corrupt the file — so the request is not made at all rather
    // than made and then guarded against in the UI.
    if (files.find((f) => f.path === selected)?.editable === false) {
      setSource("");
      setSavedSource("");
      return;
    }
    let cancelled = false;
    api
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
  }, [themeId, selected, files]);

  const save = useCallback(async () => {
    if (selected === null) return;
    setSaving(true);
    setError(null);
    try {
      await api.putThemeFile(themeId, selected, source);
      setSavedSource(source);
      setNotice(`Saved ${selected}`);
      setPreviewNonce((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to save file");
    } finally {
      setSaving(false);
    }
  }, [themeId, selected, source]);

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
      const r = await api.resetThemeFile(themeId, selected);
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
  }, [themeId, selected]);

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
    notice,
    dismissNotice: () => setNotice(null),
    save,
    resetting,
    resetConfirmOpen,
    openResetConfirm: () => setResetConfirmOpen(true),
    closeResetConfirm: () => setResetConfirmOpen(false),
    reset,
    previewNonce,
  };
}

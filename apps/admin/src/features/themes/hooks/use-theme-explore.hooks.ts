import { useCallback, useEffect, useState } from "react";

import { api } from "../../../lib/api";

/**
 * @file State for the Explore screen, so `ThemeExplore.tsx` is only markup — same split as
 * `use-appearance.hooks.ts` / `Appearance.tsx`.
 */

export type ThemeExploreView = "preview" | "html";

/** Files a theme exposes for editing, flattened into one list with their real relative paths. */
export interface ThemeExploreFile {
  /** Path relative to the theme root, e.g. `pages/about.html` or `footer.html`. */
  path: string;
  /** What to show in the list — the page id or partial name, without the folder or extension. */
  label: string;
  kind: "page" | "partial";
}

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
  /**
   * Bumped after every successful save. The preview iframe keys off this to force a reload — the
   * rendered page lives on the site server, not in this app's state, so re-rendering the component
   * would otherwise show the pre-save HTML from the browser's cache.
   */
  previewNonce: number;
}

/** `pages/about.html` → `about`; `footer-minimal.html` → `footer-minimal`. */
function fileLabel(path: string): string {
  const base = path.slice(path.lastIndexOf("/") + 1);
  return base.replace(/\.html$/, "");
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
        const list: ThemeExploreFile[] = [
          ...r.pages.map((p): ThemeExploreFile => ({ path: `pages/${p}.html`, label: p, kind: "page" })),
          ...r.partials.map((p): ThemeExploreFile => ({ path: `${p}.html`, label: p, kind: "partial" })),
        ];
        setFiles(list);
        // Open `index` by default when the theme has one — it is the page an author is most likely
        // to want first, and `loadTheme` requires it, so a valid theme always has one.
        setSelected(list.find((f) => f.label === "index")?.path ?? list[0]?.path ?? null);
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
  }, [themeId, selected]);

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

  return {
    detail,
    files,
    selected,
    select: setSelected,
    view,
    setView,
    source,
    setSource,
    dirty: source !== savedSource,
    saving,
    error,
    notice,
    dismissNotice: () => setNotice(null),
    save,
    previewNonce,
  };
}

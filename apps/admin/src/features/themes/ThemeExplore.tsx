import { useEffect, useRef, useState, type MouseEvent, type SyntheticEvent } from "react";
import { Toast } from "@jini-ai/ui";

import { siteUrl } from "../../lib/site-url";
import { navigate } from "../../lib/router";
import { useAdminLocale } from "../../hooks/use-admin-locale.hooks";
import { PAGE_PREVIEW_WIDTHS, type PagePreviewDevice } from "../pages/hooks/use-page-editor.hooks";
import { useThemeExplore, type ThemeExploreFile, type ThemeExploreView } from "./hooks/use-theme-explore.hooks";
import { t as translateThemes } from "./themes-i18n";

/**
 * @file Explore — edit any theme, active or not, and see it rendered.
 *
 * The screen the copy-not-inherit model needed. Every installed theme is a COPY of an original that
 * still exists untouched in the catalog, so editing here is always safe in the one way that matters:
 * the thing you forked from is still on disk, byte-identical, to reset back to. That is what the
 * banner says, and it is why there is no "are you sure" dialog anywhere on this screen.
 *
 * The preview is an `<iframe src>` pointed at the SITE server, not `srcDoc`. A rendered theme page
 * references `/theme-assets/<id>/css/...`, which only the site server serves — a `srcDoc` iframe
 * resolves those relative URLs against the admin's own origin and every stylesheet 404s. Pointing
 * `src` at the site origin makes the preview load exactly the bytes a visitor would get, which is
 * the entire claim this screen makes. Both pages AND partials render this way now — a partial's own
 * route (`/theme-explore/{id}/partial/{partialId}`, `theme-page-preview.ts`) wraps it in a minimal
 * host document that pulls in the same tokens/stylesheet a full page does (2026-08-11: partials used
 * to have no preview at all — "why wouldn't partials show up? They should ... as long as you have the
 * CSS" was correct, so now they do).
 *
 * The device-width control and fullscreen affordance below reuse `PageEditor.tsx`'s own
 * `PAGE_PREVIEW_WIDTHS` and `.page-preview-frame`/`.page-preview-scaler`/`.page-preview-iframe`
 * classes rather than a parallel set — same widths, same scale-to-fit mechanism, just pointed at a
 * real `src` URL instead of `SrcDocSandbox`'s `srcDoc`.
 */
export interface ThemeExploreProps {
  /** Theme id from `?theme=`. */
  themeId: string;
  /** DI seam for tests — same convention as `Themes.tsx`'s `useThemesHook`. */
  useThemeExploreHook?: typeof useThemeExplore;
}

const VIEWS: ReadonlyArray<{ key: ThemeExploreView; label: string }> = [
  { key: "preview", label: "Preview" },
  { key: "html", label: "HTML" },
];

/** Same three widths `PageEditor.tsx`'s own preview offers — see `PAGE_PREVIEW_WIDTHS`'s doc for why
 *  a fixed rendered width, not the pane's real width, is the point. */
const DEVICES: ReadonlyArray<{ key: PagePreviewDevice; label: string }> = [
  { key: "desktop", label: "Desktop" },
  { key: "tablet", label: "Tablet" },
  { key: "mobile", label: "Mobile" },
];

/** The URL for the currently selected file's preview, or `null` before a file is selected — every
 *  file (page or partial) is previewable now, so the only `null` case left is "nothing chosen yet". */
function previewSrcFor(
  themeId: string,
  file: ThemeExploreFile | undefined,
  previewNonce: number
): string | null {
  if (!file) return null;
  const segment = file.kind === "page" ? encodeURIComponent(file.label) : `partial/${encodeURIComponent(file.label)}`;
  return siteUrl(`/theme-explore/${encodeURIComponent(themeId)}/${segment}?v=${previewNonce}`);
}

export function ThemeExplore({ themeId, useThemeExploreHook = useThemeExplore }: ThemeExploreProps) {
  const locale = useAdminLocale();
  const t = (key: string): string => translateThemes(locale, key);
  const {
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
    notice,
    dismissNotice,
    save,
    previewNonce,
  } = useThemeExploreHook(themeId);

  const [device, setDevice] = useState<PagePreviewDevice>("desktop");
  const [fullscreen, setFullscreen] = useState(false);
  const fullscreenTriggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Same open/close lifecycle `ImagePreviewModal.tsx` established for a native `<dialog>` driven by a
  // boolean prop: `showModal()`/`close()` when supported, an `open` attribute toggle as the jsdom
  // fallback (neither method exists there), guarded so an already-open/closed dialog is a no-op.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (fullscreen) {
      if (typeof dialog.showModal === "function") {
        if (!dialog.open) dialog.showModal();
      } else {
        dialog.setAttribute("open", "");
      }
    } else {
      if (typeof dialog.close === "function") {
        if (dialog.open) dialog.close();
      } else {
        dialog.removeAttribute("open");
      }
    }
  }, [fullscreen]);

  function closeFullscreen() {
    setFullscreen(false);
    // `showModal()` restores focus to the previously-focused element in every current browser, but
    // that UA behavior isn't relied on elsewhere in this codebase (`ImagePreviewModal` doesn't either)
    // — explicit here because "focus returns to the trigger" is a hard requirement for this control,
    // not a nice-to-have, and jsdom's `<dialog>` doesn't implement the restoration at all.
    fullscreenTriggerRef.current?.focus();
  }

  function handleFullscreenCancel(e: SyntheticEvent<HTMLDialogElement>) {
    // Fires on Escape. Prevented and routed through `closeFullscreen` rather than left to the
    // browser's own close, so the `fullscreen` state stays the single source of truth the effect
    // above reads — same pattern `ImagePreviewModal.tsx` uses for the same reason.
    e.preventDefault();
    closeFullscreen();
  }

  function handleFullscreenBackdropClick(e: MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) closeFullscreen();
  }

  if (error && !detail) return <div className="notice error">{error}</div>;
  if (!detail) return <div className="notice">{t("Loading theme…")}</div>;

  const selectedFile = files.find((f) => f.path === selected);
  const previewSrc = previewSrcFor(detail.id, selectedFile, previewNonce);
  const previewWidth = PAGE_PREVIEW_WIDTHS[device];

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">{t("Studio")}</p>
          <h1 className="page-title">{detail.name}</h1>
          <p className="page-description">
            {t("Edit this theme and see it rendered. Nothing here changes your live site until you activate it.")}
          </p>
        </div>
      </div>

      <div className="page-toolbar">
        <a
          href="/admin/themes"
          onClick={(e) => {
            e.preventDefault();
            navigate("/themes");
          }}
        >
          {t("← All themes")}
        </a>
      </div>

      {/* The directions. Deliberately NOT the words "child theme": there is no runtime relationship
          between this theme and the one it came from — it is a fork, and calling it a child would
          teach that changing the original still feeds into this one, which it does not. */}
      {detail.hasOriginal ? (
        <div className="notice theme-explore-directions">
          <strong>{t("You're editing your own copy.")}</strong>{" "}
          {t(
            "An untouched original is kept separately, so you can change anything here without losing what you started from."
          )}
          {detail.lineage?.from ? (
            <>
              {" "}
              {t("Copied from")} <code>{detail.lineage.from}</code>
              {detail.lineage.version ? ` v${detail.lineage.version}` : null}.
            </>
          ) : null}
        </div>
      ) : (
        <div className="notice warning">
          {t(
            "No stored original for this theme, so edits here cannot be reset. Copy it first if you want a fallback."
          )}
        </div>
      )}

      {detail.status !== "valid" ? (
        <div className="notice error">
          {t("This theme is not loading:")} {detail.errors.join("; ")}
        </div>
      ) : null}
      {error ? <div className="notice error">{error}</div> : null}
      {notice ? <Toast message={notice} tone="success" ttlMs={5000} onDismiss={dismissNotice} /> : null}

      <div className="theme-explore">
        {/* Flat page/partial list for now, grouped by kind. A real nested file tree is a separate
            component — this theme's whole editable surface is ~20 entries two folders deep, which a
            tree would not make more legible. */}
        <nav className="theme-explore-files" aria-label={t("Theme files")}>
          {(["page", "partial"] as const).map((kind) => {
            const group = files.filter((f) => f.kind === kind);
            if (group.length === 0) return null;
            return (
              <div key={kind}>
                <p className="theme-explore-files-heading">{kind === "page" ? t("Pages") : t("Partials")}</p>
                <ul>
                  {group.map((file) => (
                    <li key={file.path}>
                      <button
                        type="button"
                        className={selected === file.path ? "is-active" : undefined}
                        aria-current={selected === file.path ? "true" : undefined}
                        onClick={() => select(file.path)}
                      >
                        {file.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </nav>

        <div className="theme-explore-main">
          <div className="page-editor-toolbar">
            <div className="segmented" role="tablist" aria-label={t("Editor view")}>
              {VIEWS.map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  role="tab"
                  aria-selected={view === entry.key}
                  className={view === entry.key ? "is-active" : undefined}
                  onClick={() => setView(entry.key)}
                >
                  {t(entry.label)}
                </button>
              ))}
            </div>
            <div className="theme-explore-toolbar-actions">
              {view === "preview" ? (
                <>
                  <div className="segmented" role="group" aria-label={t("Preview width")}>
                    {DEVICES.map((entry) => (
                      <button
                        key={entry.key}
                        type="button"
                        aria-pressed={device === entry.key}
                        className={device === entry.key ? "is-active" : undefined}
                        onClick={() => setDevice(entry.key)}
                      >
                        {t(entry.label)}
                      </button>
                    ))}
                    <span className="page-editor-width">{previewWidth}px</span>
                  </div>
                  <button
                    type="button"
                    ref={fullscreenTriggerRef}
                    className="theme-explore-fullscreen-trigger"
                    onClick={() => setFullscreen(true)}
                    disabled={previewSrc === null}
                    aria-label={t("View preview fullscreen")}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                      <path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" />
                    </svg>
                  </button>
                </>
              ) : null}
              <button className="btn-primary" disabled={!dirty || saving} onClick={() => void save()}>
                {saving ? t("Saving…") : dirty ? t("Save") : t("Saved")}
              </button>
            </div>
          </div>

          {view === "preview" ? (
            previewSrc ? (
              <ThemeExplorePreview src={previewSrc} width={previewWidth} title={t("Theme preview")} />
            ) : (
              <div className="notice">{t("Select a file to preview.")}</div>
            )
          ) : (
            <textarea
              className="page-html-source"
              value={source}
              spellCheck={false}
              onChange={(e) => setSource(e.target.value)}
              aria-label={t("Theme file source")}
            />
          )}
        </div>
      </div>

      <dialog
        ref={dialogRef}
        className="theme-explore-preview-dialog"
        aria-label={t("Theme preview, fullscreen")}
        onCancel={handleFullscreenCancel}
        onClick={handleFullscreenBackdropClick}
      >
        {/* No device-width control duplicated in here — the docked toolbar's Desktop/Tablet/Mobile
            group already owns that choice (`device` is shared state, so fullscreen just renders at
            whatever was last selected), and a second set of identically-labelled buttons would be a
            real duplicate-tab-target for keyboard/screen-reader users, not just visual clutter. */}
        <button
          type="button"
          className="theme-explore-preview-dialog-close"
          onClick={closeFullscreen}
          aria-label={t("Close fullscreen preview")}
        >
          ×
        </button>
        {/* Only mounted while open — an always-mounted iframe here would fire a second, hidden
            request to the site server on every render alongside the docked preview's own. */}
        {fullscreen && previewSrc ? (
          <iframe
            key={previewSrc}
            className="theme-explore-preview-dialog-iframe"
            title={t("Theme preview, fullscreen")}
            src={previewSrc}
            style={{ width: `${previewWidth}px` }}
          />
        ) : null}
      </dialog>
    </div>
  );
}

/**
 * Renders the live theme-explore iframe at a fixed device width and scales the whole thing down to
 * fit the docked pane — the same mechanism `PageEditor.tsx`'s own `PagePreview` uses (reusing its
 * `.page-preview-frame`/`.page-preview-scaler`/`.page-preview-iframe` classes rather than a parallel
 * set), adapted for a real `src` URL instead of `SrcDocSandbox`'s `srcDoc` — see this file's header
 * comment for why the preview has to be a real URL at all.
 */
function ThemeExplorePreview({ src, width, title }: { src: string; width: number; title: string }) {
  // Same rough reference `PagePreview`'s own comment documents: the pane is roughly this wide with
  // the file list open, and a real measurement (ResizeObserver) is the follow-up, not the prototype.
  const paneWidth = 880;
  const scale = Math.min(1, paneWidth / width);

  return (
    <div className="page-preview-frame" style={{ height: `${900 * scale}px` }}>
      <div
        className="page-preview-scaler"
        style={{ width: `${width}px`, height: "900px", transform: `scale(${scale})` }}
      >
        {/* `key={src}` forces a remount on every save (via `previewNonce` in the URL) or file/device
            change — an iframe does not reliably refetch when only its `src` attribute changes. */}
        <iframe key={src} className="page-preview-iframe" title={title} src={src} />
      </div>
    </div>
  );
}

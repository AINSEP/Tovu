import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type SyntheticEvent } from "react";
import { ConfirmDialog, RowMenu } from "@jini-ai/admin/react";
import { Toast } from "@jini-ai/ui";

import { siteUrl } from "../../lib/site-url";
import { navigate } from "../../lib/router";
import { useAdminLocale } from "../../hooks/use-admin-locale.hooks";
import { PAGE_PREVIEW_WIDTHS, type PagePreviewDevice } from "../pages/hooks/use-page-editor.hooks";
import {
  THEME_FILE_GROUPS,
  useThemeExplore,
  type ThemeExploreFile,
  type ThemeExploreView,
} from "./hooks/use-theme-explore.hooks";
import { t as translateThemes } from "./themes-i18n";

/**
 * @file Explore — edit any theme, active or not, and see it rendered.
 *
 * The screen the copy-not-inherit model needed. Every installed theme is a COPY of an original that
 * still exists untouched in the catalog, so editing here is always safe in the one way that matters:
 * the thing you forked from is still on disk, byte-identical, to reset back to. That is what the
 * banner says, and it is why ordinary editing here needs no confirmation at all.
 *
 * Reset is the one exception, and does confirm: restoring a file to its original overwrites the
 * working copy with no backup, so it is the only action on this screen that can destroy work.
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

/**
 * Whether to label the save chord ⌘ or Ctrl.
 *
 * Reads `navigator.platform` despite it being deprecated, because the replacement
 * (`navigator.userAgentData.platform`) is not in Safari or Firefox — the exact browsers where
 * getting this wrong is most likely. Wrong answer costs a slightly off tooltip, so the deprecated
 * property with a guard beats a feature-detection ladder. Guarded for jsdom/SSR, where `navigator`
 * may be absent entirely.
 */
function isApplePlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /mac|iphone|ipad|ipod/i.test(navigator.platform ?? "");
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

/**
 * The URL for the selected file's preview, or `null` when the file has no meaningful one.
 *
 * Three shapes, because "preview" means three different things here:
 * - a **page** renders through the theme's own shell at `/theme-explore/{theme}/{page}`
 * - a **partial** renders standalone inside a minimal styled host, at `…/partial/{id}`
 * - an **asset** (image, font) is served raw from `/theme-assets/`, the same URL a visitor's browser
 *   would fetch it from — so what the operator sees IS the file, not a re-encoding of it
 *
 * CSS/JS/JSON get `null`: there is nothing to render standalone. Editing those and switching to
 * Preview shows the page that consumes them instead, which is the honest thing to show.
 */
function previewSrcFor(
  themeId: string,
  file: ThemeExploreFile | undefined,
  previewNonce: number
): string | null {
  if (!file) return null;
  const theme = encodeURIComponent(themeId);
  if (file.kind === "page") return siteUrl(`/theme-explore/${theme}/${encodeURIComponent(file.label)}?v=${previewNonce}`);
  if (file.kind === "partial") {
    return siteUrl(`/theme-explore/${theme}/partial/${encodeURIComponent(file.label)}?v=${previewNonce}`);
  }
  // Any non-readable file (not just `asset`-group ones — an unrecognized binary extension can land
  // in the `other` catch-all too) gets served raw rather than shown as nothing: what the operator
  // sees IS the file, not a re-encoding of it.
  if (!file.readable) {
    return siteUrl(`/theme-assets/${theme}/${file.path.split("/").map(encodeURIComponent).join("/")}?v=${previewNonce}`);
  }
  return null;
}

/** Why the HTML tab shows a read-only viewer instead of a textarea, for a file that IS readable but
 *  not editable (`kind === "script"` or `"other"`) — see `ThemeExploreFile.editable`'s doc comment
 *  for the readable/editable split this answers. */
function readOnlyReason(file: ThemeExploreFile): string {
  return file.kind === "script"
    ? "Scripts are read-only in Explore."
    : "This file type is read-only in Explore.";
}

/**
 * Whether the Save button should be offered at all for the selected file — `undefined` (nothing
 * selected yet) defaults to showing it, matching the pre-existing behavior before per-file
 * editability existed. Pulled out to a top-level predicate for the same complexity-drift reason
 * {@link themeExploreHtmlMode} documents, rather than left as an inline `||` in `ThemeExplore`'s own
 * JSX.
 *
 * @complexity O(1).
 * @overallScore 100/100
 */
function canSaveSelectedFile(file: ThemeExploreFile | undefined): boolean {
  return file === undefined || file.editable;
}

/**
 * Which of the HTML tab's three renderings applies to a file — pulled out of `ThemeExplore`'s own
 * render body into a plain top-level function rather than a `useCallback`/inline ternary chain.
 *
 * `apps/admin`'s own complexity-drift check (`npm run check:admin-complexity-drift`) aggregates
 * closures declared INSIDE a component back into that component's count even where ESLint's
 * `complexity`/`sonarjs/cognitive-complexity` rules score a `useCallback` body as its own unit — only
 * a genuinely top-level function moves branch count out of both. `undefined` (nothing selected yet)
 * intentionally maps to `"editable"`, matching the pre-existing fallback behavior: an empty textarea,
 * not a binary notice, is what rendered here before this file/kind concept existed.
 *
 * @complexity O(1) — three independent boolean checks, no iteration.
 * @overallScore 100/100
 */
function themeExploreHtmlMode(file: ThemeExploreFile | undefined): "binary" | "readonly" | "editable" {
  if (!file) return "editable";
  if (!file.readable) return "binary";
  if (!file.editable) return "readonly";
  return "editable";
}

/**
 * The HTML tab's body for the selected file — binary (no source, Preview tab instead), read-only
 * (script/`other`, visible but not saveable), or a normal editable textarea. Extracted to top level
 * for the same complexity-drift reason {@link themeExploreHtmlMode} documents: this was three
 * `ThemeExplore`-body ternaries plus their markup, now one independently-scored component.
 *
 * @complexity O(1) — renders exactly one of three fixed shapes.
 * @overallScore 100/100
 */
function ThemeExploreHtmlPane({
  file,
  source,
  setSource,
  t,
}: {
  file: ThemeExploreFile | undefined;
  source: string;
  setSource: (value: string) => void;
  t: (key: string) => string;
}) {
  const mode = themeExploreHtmlMode(file);

  if (mode === "binary") {
    // Never rendered into a textarea: reading a PNG as UTF-8 gives mojibake, and saving that back
    // would truly corrupt it. The Preview tab shows the real bytes.
    return (
      <div className="notice">
        {t("This is a binary file, so it has no editable source. Use the Preview tab to view it.")}
      </div>
    );
  }

  if (mode === "readonly") {
    // Readable but not editable — a script or an `other`-group file. Shown as source (unlike the
    // binary case above), but `readOnly` and paired with a visible reason: an editable-looking
    // textarea next to a Save button that can never fire would be worse than either showing nothing
    // or being honest about why. `file` is non-null here — `themeExploreHtmlMode` only returns
    // `"readonly"` when it was given one.
    return (
      <>
        <div className="notice">{t(readOnlyReason(file as ThemeExploreFile))}</div>
        <textarea
          className="page-html-source"
          value={source}
          readOnly
          spellCheck={false}
          aria-label={t("Theme file source (read-only)")}
        />
      </>
    );
  }

  return (
    <textarea
      className="page-html-source"
      value={source}
      spellCheck={false}
      onChange={(e) => setSource(e.target.value)}
      aria-label={t("Theme file source")}
    />
  );
}

/**
 * Enter commits the inline rename, Escape abandons it. Blur (clicking away) also abandons it rather
 * than committing — unlike Finder/Explorer's commit-on-blur, this sidesteps the whole double-fire
 * class of bug a commit-on-blur design has to guard against (Enter firing the rename, then the
 * input's own removal from the DOM firing a second blur-triggered attempt): a deliberate Enter, or
 * the ⋮ menu's Rename item, are the two ways to actually commit, and both are equally fast for this
 * screen's stated use case (typing a new name and pressing Enter).
 *
 * Top-level rather than a closure inside {@link ThemeExploreFileRow} for the same complexity-drift
 * reason {@link themeExploreHtmlMode} documents.
 *
 * @complexity O(1).
 * @overallScore 100/100
 */
function handleFileRowRenameKeyDown(
  e: KeyboardEvent<HTMLInputElement>,
  actions: { commitRename: () => void; cancelRename: () => void }
): void {
  if (e.key === "Enter") {
    e.preventDefault();
    actions.commitRename();
  } else if (e.key === "Escape") {
    e.preventDefault();
    actions.cancelRename();
  }
}

/**
 * One sidebar row: the filename control (or its inline-rename replacement) plus the ⋮ overflow menu
 * — 2026-08-11 owner ask (Copy/Rename). Extracted to top level, not a nested closure inside
 * `ThemeExplore`'s `.map()`, for the same complexity-drift reason {@link themeExploreHtmlMode}
 * documents — this was the single largest contributor to that function's complexity growing past
 * the project's 9/9 ceiling when the ⋮ menu and inline rename were added inline.
 *
 * @complexity O(1) per row — the list's own O(n) iteration lives in the caller's `.map()`.
 * @overallScore 100/100
 */
function ThemeExploreFileRow({
  file,
  selected,
  select,
  renamingPath,
  renameDraft,
  setRenameDraft,
  startRename,
  cancelRename,
  commitRename,
  copyingPath,
  copyFile,
  t,
}: {
  file: ThemeExploreFile;
  selected: string | null;
  select: (path: string) => void;
  renamingPath: string | null;
  renameDraft: string;
  setRenameDraft: (value: string) => void;
  startRename: (path: string) => void;
  cancelRename: () => void;
  commitRename: () => void;
  copyingPath: string | null;
  copyFile: (path: string) => Promise<void>;
  t: (key: string) => string;
}) {
  const isSelected = selected === file.path;

  return (
    <li className={isSelected ? "theme-explore-file-row is-active" : "theme-explore-file-row"}>
      {renamingPath === file.path ? (
        <input
          className="theme-explore-rename-input"
          value={renameDraft}
          autoFocus
          onChange={(e) => setRenameDraft(e.target.value)}
          onKeyDown={(e) => handleFileRowRenameKeyDown(e, { commitRename, cancelRename })}
          onBlur={cancelRename}
          aria-label={t("New name for {file}").replace("{file}", file.label)}
        />
      ) : (
        <button
          type="button"
          className={isSelected ? "is-active" : undefined}
          aria-current={isSelected ? "true" : undefined}
          onClick={() => select(file.path)}
          onDoubleClick={() => startRename(file.path)}
          title={file.path}
        >
          {file.label}
        </button>
      )}
      {/* Copy is unconditional — see `previewSrcFor`'s sibling `copyFile` doc comment in the hook for
          why duplicating bytes carries none of the risk editing does. Rename is always offered too: a
          LOCKED file (pages/index.html, theme.json, tokens.json) still shows the item, but selecting
          it surfaces `error` with the reason instead of opening the inline editor — `RowMenu` has no
          built-in disabled-item affordance to hang a tooltip reason off, so the reason is surfaced
          through the same error surface the rest of this screen already uses, rather than silently
          doing nothing. */}
      <RowMenu
        triggerLabel={t("More actions for {file}").replace("{file}", file.label)}
        items={[
          {
            key: "copy",
            label: copyingPath === file.path ? t("Copying…") : t("Copy"),
            onSelect: () => void copyFile(file.path),
          },
          {
            key: "rename",
            label: t("Rename"),
            onSelect: () => startRename(file.path),
          },
        ]}
      />
    </li>
  );
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
    resetting,
    resetConfirmOpen,
    openResetConfirm,
    closeResetConfirm,
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
        {/* Flat list grouped by kind, most-edited groups first. A real nested file tree is a separate
            component — a theme's editable surface is ~20 entries two folders deep, which a tree would
            not make more legible. Assets appear last: there are many of them and they are the ones an
            author is least likely to be looking for. */}
        <nav className="theme-explore-files" aria-label={t("Theme files")}>
          {THEME_FILE_GROUPS.map(({ key: kind, label }) => {
            const group = files.filter((f) => f.kind === kind);
            if (group.length === 0) return null;
            return (
              <div key={kind}>
                <p className="theme-explore-files-heading">{t(label)}</p>
                <ul>
                  {group.map((file) => (
                    <ThemeExploreFileRow
                      key={file.path}
                      file={file}
                      selected={selected}
                      select={select}
                      renamingPath={renamingPath}
                      renameDraft={renameDraft}
                      setRenameDraft={setRenameDraft}
                      startRename={startRename}
                      cancelRename={cancelRename}
                      commitRename={commitRename}
                      copyingPath={copyingPath}
                      copyFile={copyFile}
                      t={t}
                    />
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
              {/* Reset is `.btn-danger` and sits BEFORE Save rather than beside it: it is the only
                  irreversible control on this screen, and the styling is what says so. Hidden
                  entirely (not disabled) when the file has no original — a greyed-out Reset invites
                  "why can't I?", where absence just means the option does not apply here. */}
              {selectedFile?.resettable ? (
                <button
                  type="button"
                  className="btn-danger"
                  disabled={resetting}
                  onClick={openResetConfirm}
                  title={t("Restore this file to the original theme's version")}
                >
                  {resetting ? t("Resetting…") : t("Reset")}
                </button>
              ) : null}
              {/* The ⌘/Ctrl+S hint is a `title` rather than a visible label: the shortcut is worth
                  discovering, but not worth widening a button that changes text three ways already.
                  `isApplePlatform` picks the glyph the operator's own keyboard has — showing a Mac
                  user "Ctrl+S" for a chord that is ⌘S there is worse than showing nothing. */}
              {/* Absent, not disabled, for a read-only file — same "why can't I?" reasoning Reset's
                  own conditional presence above already applies to this screen. `dirty` can never
                  become true for a read-only file (its textarea below has no `onChange`), so this is
                  a belt-and-suspenders hide rather than the only thing standing between the operator
                  and an accidental save. */}
              {canSaveSelectedFile(selectedFile) ? (
                <button
                  className="btn-primary"
                  disabled={!dirty || saving}
                  onClick={() => void save()}
                  title={isApplePlatform() ? t("Save (⌘S)") : t("Save (Ctrl+S)")}
                >
                  {saving ? t("Saving…") : dirty ? t("Save") : t("Saved")}
                </button>
              ) : null}
            </div>
          </div>

          {view === "preview" ? (
            previewSrc ? (
              <ThemeExplorePreview src={previewSrc} width={previewWidth} title={t("Theme preview")} />
            ) : (
              <div className="notice">{t("Select a file to preview.")}</div>
            )
          ) : (
            <ThemeExploreHtmlPane file={selectedFile} source={source} setSource={setSource} t={t} />
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

      {/* The only DESTRUCTIVE confirmation on this screen — Reset is the only thing here that can
          lose work. Names the file explicitly rather than saying "this file": a destructive prompt
          should never be ambiguous about its target. */}
      <ConfirmDialog
        open={resetConfirmOpen}
        title={t("Reset this file to the original?")}
        body={
          <p>
            {t("This replaces")} <code>{selected}</code>{" "}
            {t(
              "with the version from the original theme. Any changes you have made to this file will be lost, and this cannot be undone."
            )}
          </p>
        }
        confirmLabel={t("Reset file")}
        destructive
        pending={resetting}
        onConfirm={() => void reset()}
        onCancel={closeResetConfirm}
      />

      {/* NOT `destructive` — renaming a page loses no data and can be undone by renaming it back.
          It still warrants a pause because it changes something outside this screen's own state: the
          page's public URL, which anything already linking to it will silently stop reaching. */}
      <ConfirmDialog
        open={pageRenameWarning !== null}
        title={t("Rename this page?")}
        body={
          <p>
            {t("Renaming")} <code>{pageRenameWarning?.path}</code> {t("to")}{" "}
            <code>{pageRenameWarning?.name}</code>{" "}
            {t("changes its public URL. Anything already linking to it directly will need updating.")}
          </p>
        }
        confirmLabel={t("Rename page")}
        tone="warning"
        pending={renaming}
        onConfirm={() => void confirmPageRename()}
        onCancel={cancelPageRenameWarning}
      />
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
  const frameRef = useRef<HTMLDivElement>(null);
  // The frame's REAL rendered width, not a guessed constant — the previous flat `880` (copied from
  // `PagePreview`'s own same-shaped placeholder) never tracked the pane actually resizing: no
  // listener of any kind, so the scale computed once and stayed frozen across a window resize, a
  // sidebar collapse, or the assistant dock opening/closing (reported live as "the preview is not
  // responsive"). `880` survives only as the pre-measurement default, so the first paint still has a
  // sane scale instead of `Infinity`/`NaN` from a zero-width ref.
  //
  // jsdom implements no `ResizeObserver` at all (`__tests__/setup.ts`'s own comment — deliberately
  // left unstubbed, so a test can't pass without the measurement ever happening) — guarded exactly
  // like `SeeMore.hooks.tsx`'s own `typeof ResizeObserver !== "function"` check, so this component
  // still renders (at the `880` default) in every existing/new unit test.
  const [paneWidth, setPaneWidth] = useState(880);
  useEffect(() => {
    const el = frameRef.current;
    if (!el || typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setPaneWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const scale = Math.min(1, paneWidth / width);

  return (
    <div ref={frameRef} className="page-preview-frame" style={{ height: `${900 * scale}px` }}>
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

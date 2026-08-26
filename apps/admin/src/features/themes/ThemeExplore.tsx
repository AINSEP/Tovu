import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type RefObject,
  type SyntheticEvent,
} from "react";
import { ConfirmDialog, RowMenu } from "@jini-ai/admin/react";
import { Toast } from "@jini-ai/ui";

import { InfoTip } from "../../components/InfoTip";
import { siteUrl } from "../../lib/site-url";
import { navigate } from "../../lib/router";
import type { Translate } from "../../lib/dictionary-translator";
import { buildAgentListHandles } from "../../lib/agent-list-handles";
import { PAGE_PREVIEW_WIDTHS, type PagePreviewDevice } from "../pages/hooks/use-page-editor.hooks";
import {
  THEME_FILE_GROUPS,
  useWiredThemeExplore,
  type ThemeExploreDetail,
  type ThemeExploreFile,
  type ThemeExploreView,
} from "./hooks/use-theme-explore.hooks";
import { useThemeExplorePreviewFrame } from "./hooks/use-theme-explore-preview-frame.hooks";

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
 *
 * This component's own render body is deliberately thin. Every conditional block that does not need
 * a value straight out of `useThemeExploreHook`'s controller has been pulled out to a top-level
 * function or component below (`ThemeExploreDirectionsNotice`, `ThemeExploreFileList`,
 * `ThemeExploreToolbarButtons`, `ThemeExplorePreviewControls`, `ThemeExploreMainPane`,
 * `ThemeExploreFullscreenDialog`) — `apps/admin`'s complexity-drift check (`npm run
 * check:admin-complexity-drift`) scores a component's OWN cyclomatic/cognitive complexity from every
 * ternary/`&&`/`.map()`-with-branching directly inside its JSX, and this component's markup used to
 * carry roughly a dozen of those inline, landing at 27/29 against a 9/9 ceiling. Each extraction below
 * is a genuinely TOP-LEVEL function, not a `useCallback` or nested closure — a nested closure is still
 * scored as its own unit by ESLint's `complexity`/`sonarjs/cognitive-complexity` rules, but the
 * separate drift tool this repo also gates on aggregates a closure DECLARED INSIDE a component back
 * into that component's own count, so only moving the code to actual module scope lowers both.
 *
 * The `device`/`fullscreen` state below and the preview pane's own width measurement
 * (`use-theme-explore-preview-frame.hooks.ts`) deliberately stay OUTSIDE `useThemeExploreHook`'s
 * controller, unlike everything else this screen reads — see each one's own comment for why. Both
 * are pure view chrome with nothing to inject (constraint: a hook with no I/O gets no port), same as
 * `Posts.tsx`'s own local `updatedSort` state. `device`/`fullscreen` additionally CANNOT move into
 * the injected controller without breaking real interactivity: `ThemeExplore.unit.test.tsx` swaps in
 * a fully static controller fake (spies for every setter, no re-render), which is exactly right for
 * data/mutation state asserted by "was the setter called with X" — but the device-width and
 * fullscreen-dialog tests assert REAL DOM behavior (`aria-pressed` flipping, the dialog's `open`
 * attribute, focus returning to the trigger) that only a live `useState` can drive under that fake.
 */
export interface ThemeExploreProps {
  /** Theme id from `?theme=`. */
  themeId: string;
  /** DI seam for tests — same convention as `Themes.tsx`'s `useThemesHook`. */
  useThemeExploreHook?: typeof useWiredThemeExplore;
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
 * Whether `file` is a `templated`-tier Liquid source file — case-insensitive, matching every other
 * extension check in this screen's server counterpart (`explore.ts`'s
 * `isTextReadable`/`isAssetExtension`). A plain extension check rather than reading `file.kind`:
 * `fileGroup` (`explore.ts`) has no `templates/` case, so every `.liquid` file lands in the generic
 * `"other"` group today — indistinguishable from `NOTICE.md` by `kind` alone, but NOT
 * indistinguishable by what the Preview tab owes the operator (see {@link previewSrcFor}).
 *
 * @complexity O(1).
 */
function isLiquidTemplateFile(file: ThemeExploreFile): boolean {
  return file.path.toLowerCase().endsWith(".liquid");
}

/**
 * The URL for the selected file's preview, or `null` when the file has no meaningful one.
 *
 * Four shapes, because "preview" means four different things here:
 * - a **page** renders through the theme's own shell at `/theme-explore/{theme}/{page}`
 * - a **partial** renders standalone inside a minimal styled host, at `…/partial/{id}`
 * - a **`.liquid` template** (2026-08-12) renders through the real Liquid render pipeline at
 *   `…/template/{id}` — `id` is the filename minus `.liquid` (`file.label` for a non-page/partial
 *   file is the bare basename WITH its extension, see `fileLabel`/`use-theme-explore.hooks.ts`),
 *   matching `theme.ts`'s own `templateId = file.slice(0, -".liquid".length)` derivation
 *   byte-for-byte. The server (`theme-page-preview.ts`) is the single source of truth for whether a
 *   given template id is actually renderable — an id it doesn't recognize (a custom-named template a
 *   third-party theme ships) degrades to that route's own honest plain-text refusal inside the
 *   iframe rather than this function trying to duplicate the route/template-id mapping client-side.
 * - everything else — an asset (image, font), and now also CSS/JS/JSON/`other`-group files whether
 *   or not they're `readable` — is served raw from `/theme-assets/`, the same URL a visitor's browser
 *   would fetch it from. That route (`theme-static-assets.ts`) serves a theme's ENTIRE folder generically
 *   via `express.static`, with the correct `Content-Type` per extension — it was never scoped to
 *   binary/asset-group files only. So the browser's own native viewer does the rendering for free: CSS/JS
 *   show as syntax-colored plain text, JSON gets Chrome's built-in collapsible tree viewer, images/fonts
 *   render as themselves. 2026-08-17 owner ask (verbatim): "Can we get preview to just render everything,
 *   in a simple manner. If it's an image, it renders that. If it's a JavaScript, it just renders like
 *   HTML. If it's JSON same." — every file type should show SOMETHING in Preview, not just images.
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
  if (isLiquidTemplateFile(file)) {
    const templateId = file.label.replace(/\.liquid$/i, "");
    return siteUrl(`/theme-explore/${theme}/template/${encodeURIComponent(templateId)}?v=${previewNonce}`);
  }
  return siteUrl(`/theme-assets/${theme}/${file.path.split("/").map(encodeURIComponent).join("/")}?v=${previewNonce}`);
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
 * The Preview tab's "nothing to show" message when no file is selected.
 *
 * 2026-08-17: `previewSrcFor` now returns a real URL for every file kind (page/partial/template
 * through their own routes, everything else — CSS/JS/JSON/`other`/assets, readable or not — via the
 * raw `/theme-assets/` URL), so `previewSrc === null` only happens for the `!file` case: nothing
 * selected yet. This message is purely the empty-selection state now, not a "nothing to render for
 * this file type" state.
 *
 * @complexity O(1).
 */
function themeExplorePreviewNotice(t: Translate): string {
  return t("Select a file to preview.");
}

/**
 * Whether the Save button should be offered at all for the selected file — `undefined` (nothing
 * selected yet) defaults to showing it, matching the pre-existing behavior before per-file
 * editability existed.
 *
 * @complexity O(1).
 */
function canSaveSelectedFile(file: ThemeExploreFile | undefined): boolean {
  return file === undefined || file.editable;
}

/**
 * Which of the HTML tab's three renderings applies to a file.
 *
 * `undefined` (nothing selected yet) intentionally maps to `"editable"`, matching the pre-existing
 * fallback behavior: an empty textarea, not a binary notice, is what rendered here before this
 * file/kind concept existed.
 *
 * @complexity O(1) — three independent boolean checks, no iteration.
 */
function themeExploreHtmlMode(file: ThemeExploreFile | undefined): "binary" | "readonly" | "editable" {
  if (!file) return "editable";
  if (!file.readable) return "binary";
  if (!file.editable) return "readonly";
  return "editable";
}

/**
 * The HTML tab's body for the selected file — binary (no source, Preview tab instead), read-only
 * (script/`other`, visible but not saveable), or a normal editable textarea.
 *
 * @complexity O(1) — renders exactly one of three fixed shapes.
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
  t: Translate;
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
 * @complexity O(1).
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
 * — 2026-08-11 owner ask (Copy/Rename).
 *
 * `title={file.path}` is the FULL relative path (e.g. `pages/blog-post.html`), not just `file.label`
 * — two files that render the same LABEL under different groups (or, before now, before an ellipsis
 * fix landed, two long names that both got clipped to the same visible prefix) had no way to tell
 * which was which without this. CSS-only per the owner's own instruction ("if CSS can handle that
 * without us having to do tooltips and all that, do it") — this `title` attribute plus
 * `.theme-explore-file-row button:not(.row-menu-trigger) { overflow: hidden; text-overflow: ellipsis;
 * white-space: nowrap; }` (`styles.css`) is the entire truncation implementation, deliberately with
 * no character cap: the sidebar column is resizable, so any fixed count would be wrong at most widths.
 *
 * @complexity O(1) per row — the list's own O(n) iteration lives in the caller's `.map()`.
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
  agentBase,
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
  /** This row's own distinct handle base — computed once, across every file in every group, by
   *  `ThemeExploreFileList` (via `buildAgentListHandles`); see `Users.tsx`'s
   *  `UserRowProps.agentBase` for why a per-instance uniqueness search does not work here. Paths
   *  are globally unique across groups, same reasoning `Taxonomy.tsx`'s `termHandles` documents for
   *  its own flat, cross-group id list. */
  agentBase: string;
  t: Translate;
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
      {/* Copy is unconditional — see the hook's own `copyFile` doc comment for why duplicating bytes
          carries none of the risk editing does. Rename is always offered too: a LOCKED file
          (pages/index.html, theme.json, tokens.json, or any script/`other`-group file) still shows
          the item, but selecting it surfaces the refusal as a toast (`ThemeExplore`'s own `error`
          Toast below) instead of opening the inline editor — `RowMenu` has no built-in disabled-item
          affordance to hang a reason off, and a greyed-out item would explain nothing anyway (owner,
          2026-08-11: "I like the fact that we got the error ... it should be a toast"). */}
      <RowMenu
        triggerLabel={t("More actions for {file}").replace("{file}", file.label)}
        agentHandle={`${agentBase}-menu`}
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

/**
 * The sidebar file list — one flat list grouped by kind, most-edited groups first (assets last: there
 * are many of them and they are the ones an author is least likely to be looking for). A real nested
 * file tree is a separate component a theme's editable surface (~20 entries, two folders deep) does
 * not need.
 *
 * Extracted to top level, not inline in `ThemeExplore`'s own JSX, for the complexity-drift reason this
 * file's own header comment documents: the `.map()` over `THEME_FILE_GROUPS` plus its `if
 * (group.length === 0) return null` guard was contributing branch count to `ThemeExplore` itself even
 * though each row's own rendering was already `ThemeExploreFileRow`.
 *
 * @complexity O(g·n) — `g` fixed group count times `n` files; each row is O(1) of its own.
 */
function ThemeExploreFileList({
  files,
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
  files: ThemeExploreFile[];
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
  t: Translate;
}) {
  // File paths are globally unique across every group (a theme's editable surface is a flat set of
  // relative paths, just displayed grouped by kind), so they disambiguate one row's menu from
  // another's regardless of which group renders it — same reasoning `Taxonomy.tsx`'s `termHandles`
  // documents for its own flat, cross-group id list. Computed once here, before the per-kind
  // filtering below, so a path's handle never depends on which group it lands in.
  const fileMenuHandles = buildAgentListHandles(
    "theme-explore-file",
    files.map((file) => file.path),
  );
  const fileMenuHandleByPath = new Map(files.map((file, index) => [file.path, fileMenuHandles[index]!]));
  return (
    // `.theme-explore-files-wrap` is the actual grid item (see `.theme-explore`'s own CSS comment for
    // why): it has no in-flow content of its own, only this absolutely-positioned `<nav>`, so it
    // contributes NOTHING to the grid row's auto-height calculation and just stretches to match
    // whatever height `.theme-explore-main` naturally ends up being. The `<nav>` then fills that
    // stretched wrapper exactly (`inset: 0`) and scrolls internally if its OWN content — up to ~60
    // files across six groups — is taller than that.
    <div className="theme-explore-files-wrap">
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
                    agentBase={fileMenuHandleByPath.get(file.path)!}
                    t={t}
                  />
                ))}
              </ul>
            </div>
          );
        })}
      </nav>
    </div>
  );
}

/**
 * The no-original warning — the only case with nothing to fall back to if an edit goes wrong.
 * Deliberately NOT folded into `ThemeExploreCopyTip` below even though both start from the same
 * `hasOriginal` check: this is an actionable limitation ("edits here cannot be reset"), not
 * reassurance, so it stays a full, un-collapsed `.notice` rather than being tucked into a tooltip
 * an operator might not open before they start editing.
 *
 * @complexity O(1).
 */
function ThemeExploreDirectionsNotice({
  detail,
  t,
}: {
  detail: ThemeExploreDetail;
  t: Translate;
}) {
  if (detail.hasOriginal) return null;
  return (
    <div className="notice warning">
      {t(
        "No stored original for this theme, so edits here cannot be reset. Copy it first if you want a fallback."
      )}
    </div>
  );
}

/**
 * The "you're editing your own copy" reassurance, collapsed to a single line with an `InfoTip`
 * carrying the explanation (owner feedback, 2026-08-11 — see the JSX comment above this screen's
 * `.page-header` for the full quote and the space-reclaiming reason it now renders in the header's
 * actions column instead of as its own full-width block). Deliberately NOT the words "child theme"
 * in either the visible line or the tooltip — there is no runtime relationship between this theme
 * and the one it came from, and calling it a child would teach that changing the original still
 * feeds into this one, which it does not.
 *
 * Reuses `InfoTip` (`components/InfoTip.tsx`) rather than a second bespoke tooltip — it already
 * opens on hover AND focus and is keyboard-reachable (`tabIndex={0}` + `aria-label`), which is the
 * actual accessibility bar here: the native `title` attribute was rejected for this exact component
 * already (see `InfoTip`'s own doc), and touch devices can't hover at all.
 *
 * The copy-lineage sentence ("Copied from X vY.") folds into the SAME tooltip rather than staying
 * its own visible clause — it's supporting detail for the same reassurance, not a fact the operator
 * needs at a glance, so it doesn't earn a place on the one visible line.
 *
 * @complexity O(1).
 */
function ThemeExploreCopyTip({
  detail,
  t,
}: {
  detail: ThemeExploreDetail;
  t: Translate;
}) {
  if (!detail.hasOriginal) return null;
  const lineage = detail.lineage?.from
    ? ` ${t("Copied from")} ${detail.lineage.from}${detail.lineage.version ? ` v${detail.lineage.version}` : ""}.`
    : "";
  return (
    <p className="theme-explore-copy-tip">
      {t("You're editing your own copy.")}
      <InfoTip
        label={`${t(
          "An untouched original is kept separately, so you can change anything here without losing what you started from."
        )}${lineage}`}
      />
    </p>
  );
}

/**
 * The "this theme is not loading" error banner — `null` when the theme's own `status` is `"valid"`.
 * Extracted to top level for the complexity-drift reason this file's own header comment documents;
 * one guard clause here is one fewer ternary scored against `ThemeExplore` itself.
 *
 * @complexity O(1).
 */
function ThemeExploreStatusNotice({
  detail,
  t,
}: {
  detail: ThemeExploreDetail;
  t: Translate;
}) {
  if (detail.status === "valid") return null;
  return (
    <div className="notice error">
      {t("This theme is not loading:")} {detail.errors.join("; ")}
    </div>
  );
}

/**
 * The page-URL-change warning `ConfirmDialog`'s body — pulled out mainly so the two optional-chain
 * reads of `pageRenameWarning` (only ever non-null while this dialog is open) are scored against a
 * function of their own rather than `ThemeExplore`'s, per this file's own header comment.
 *
 * @complexity O(1).
 */
function PageRenameWarningBody({
  pageRenameWarning,
  t,
}: {
  pageRenameWarning: { path: string; name: string } | null;
  t: Translate;
}) {
  return (
    <p>
      {t("Renaming")} <code>{pageRenameWarning?.path}</code> {t("to")}{" "}
      <code>{pageRenameWarning?.name}</code>{" "}
      {t("changes its public URL. Anything already linking to it directly will need updating.")}
    </p>
  );
}

/**
 * Save button label: filename-qualified whenever a file is selected ("Save about.html"), plain
 * ("Save") when nothing is (matches {@link canSaveSelectedFile}'s own `undefined`-defaults-to-shown
 * behavior). See {@link ThemeExploreToolbarButtons}'s own doc comment for why the label carries the
 * filename at all. A top-level if-chain rather than the nested nested-ternary this replaced
 * (`saving ? … : dirty ? … : …`) — both for the complexity-drift reason this file's own header
 * comment documents, and because sonarjs' cognitive-complexity scoring penalizes NESTED ternaries
 * more heavily than sequential early returns at the same depth.
 *
 * @complexity O(1).
 */
function themeExploreSaveLabel(
  state: { saving: boolean; dirty: boolean; file: ThemeExploreFile | undefined },
  t: Translate
): string {
  if (state.saving) return t("Saving…");
  if (!state.dirty) return t("Saved");
  return state.file ? `${t("Save")} ${state.file.label}` : t("Save");
}

/** Reset button label — same filename-qualified shape as {@link themeExploreSaveLabel}, for the same
 *  reason. @complexity O(1). */
function themeExploreResetLabel(
  state: { resetting: boolean; file: ThemeExploreFile | undefined },
  t: Translate
): string {
  if (state.resetting) return t("Resetting…");
  return state.file ? `${t("Reset")} ${state.file.label}` : t("Reset");
}

/**
 * The outer toolbar's Save/Reset pair — 2026-08-11 toolbar restructure (owner-approved), matching
 * `PageEditor.tsx`'s `[← Pages] [Published ▾] [Save] [Delete]` shape: `← All themes` outline/secondary,
 * Save filled, Reset red-outline-destructive, all in one row above the file list/editor instead of
 * docked to the Preview/HTML tab row below (`.theme-explore-toolbar-actions`, further down this file).
 *
 * Both buttons are labelled with the FILE's own name ("Save about.html", "Reset about.html"), not left
 * bare — the one thing that keeps this move honest. On Pages, Save saves THE PAGE and Delete deletes
 * THE PAGE, so a page-level toolbar reads correctly by itself; here Save saves the SELECTED FILE and
 * Reset resets the SELECTED FILE, and a bare "Save"/"Reset" sitting in the page-level row could read
 * as acting on the whole theme — an operator with edits open in `about.html` who sees an unqualified
 * "Save" in the header could reasonably believe everything they have touched just landed. Naming the
 * file in the label is the chosen fix over the alternative the brief also allowed (visually binding
 * the pair to the editor pane instead) — a label reads correctly from a screenshot, a screen reader's
 * accessible-name announcement, or a glance from across the room, none of which a purely spatial
 * grouping communicates on its own.
 *
 * Extracted to top level for the complexity-drift reason this file's own header comment documents;
 * the label text itself is further delegated to {@link themeExploreSaveLabel}/
 * {@link themeExploreResetLabel} so this component's own body is just two guarded buttons.
 *
 * @complexity O(1).
 */
function ThemeExploreToolbarButtons({
  selectedFile,
  resetting,
  openResetConfirm,
  dirty,
  saving,
  save,
  t,
}: {
  selectedFile: ThemeExploreFile | undefined;
  resetting: boolean;
  openResetConfirm: () => void;
  dirty: boolean;
  saving: boolean;
  save: () => Promise<void>;
  t: Translate;
}) {
  return (
    <>
      {/* Absent, not disabled, for a read-only file — a greyed-out button invites "why can't I?",
          where absence just means the option does not apply to this file. `dirty` can never become
          true for a read-only file (its textarea has no `onChange`), so this is belt-and-suspenders. */}
      {canSaveSelectedFile(selectedFile) ? (
        <button
          className="btn-primary"
          disabled={!dirty || saving}
          onClick={() => void save()}
          title={isApplePlatform() ? t("Save (⌘S)") : t("Save (Ctrl+S)")}
        >
          {themeExploreSaveLabel({ saving, dirty, file: selectedFile }, t)}
        </button>
      ) : null}
      {/* Hidden entirely, not disabled, when the file has no original to restore from — same
          reasoning as Save's own absence above. Reset stays reachable for a read-only file, though:
          it can only ever write back the file's ORIGINAL bytes, never operator-authored content, so
          "read-only" here means "cannot be AUTHORED from this screen," not "cannot be restored" — the
          restriction Save enforces has no bearing on what Reset does. */}
      {selectedFile?.resettable ? (
        <button
          type="button"
          className="btn-danger"
          disabled={resetting}
          onClick={openResetConfirm}
          title={t("Restore this file to the original theme's version")}
        >
          {themeExploreResetLabel({ resetting, file: selectedFile }, t)}
        </button>
      ) : null}
    </>
  );
}

/**
 * The device-width segmented control plus the fullscreen trigger — only ever rendered while the
 * Preview tab is active. Extracted to top level for the complexity-drift reason this file's own
 * header comment documents: `ThemeExplore`'s own JSX now only decides WHETHER to show this
 * (`view === "preview"`), not what is inside it.
 *
 * @complexity O(1) — the `DEVICES` iteration is a fixed-length constant (3), not caller-controlled.
 */
function ThemeExplorePreviewControls({
  device,
  setDevice,
  previewWidth,
  previewSrc,
  fullscreenTriggerRef,
  setFullscreen,
  t,
}: {
  device: PagePreviewDevice;
  setDevice: (value: PagePreviewDevice) => void;
  previewWidth: number;
  previewSrc: string | null;
  fullscreenTriggerRef: RefObject<HTMLButtonElement | null>;
  setFullscreen: (value: boolean) => void;
  t: Translate;
}) {
  return (
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
  );
}

/**
 * The main pane's body: the HTML source view, or the live preview (itself either the rendered iframe
 * or a "select a file" notice, depending on whether the selected file has anything to preview).
 *
 * A flat if-chain rather than a nested ternary directly in `ThemeExplore`'s own return — extracted
 * for the complexity-drift reason this file's own header comment documents, and flattened rather than
 * merely relocated because sonarjs' cognitive-complexity scoring penalizes NESTED conditionals more
 * heavily than sequential ones at the same depth.
 *
 * @complexity O(1) — three mutually exclusive branches, no iteration.
 */
function ThemeExploreMainPane({
  view,
  previewSrc,
  previewWidth,
  selectedFile,
  source,
  setSource,
  t,
}: {
  view: ThemeExploreView;
  previewSrc: string | null;
  previewWidth: number;
  selectedFile: ThemeExploreFile | undefined;
  source: string;
  setSource: (value: string) => void;
  t: Translate;
}) {
  if (view === "html") {
    return <ThemeExploreHtmlPane file={selectedFile} source={source} setSource={setSource} t={t} />;
  }
  if (previewSrc === null) {
    return <div className="notice">{themeExplorePreviewNotice(t)}</div>;
  }
  return <ThemeExplorePreview src={previewSrc} width={previewWidth} title={t("Theme preview")} />;
}

/**
 * Open/close the native `<dialog>` to match `fullscreen` — the same `showModal()`/`close()` with an
 * `open`-attribute jsdom fallback `ImagePreviewModal.tsx` established, extracted to a plain top-level
 * function so the `useEffect` that calls it is a single expression rather than an 8-line nested-if
 * body scored as part of `ThemeExplore` itself (this was the file's second-largest single
 * cognitive-complexity contributor, after the render body's own branching, before this extraction).
 *
 * Flattened relative to the original inline version: an early return once `dialog.open` already
 * matches `fullscreen` replaces two separate nested "only call the native method if not already in
 * that state" checks. This is behavior-preserving for the jsdom fallback branch too — that branch used
 * to call `setAttribute`/`removeAttribute` unconditionally, which is an idempotent no-op when the
 * attribute is already correct, so skipping it changes nothing observable.
 *
 * @complexity O(1) — four independent branches, no iteration, no nesting deeper than one level.
 */
function syncFullscreenDialog(dialog: HTMLDialogElement | null, fullscreen: boolean): void {
  if (!dialog) return;
  if (fullscreen === dialog.open) return;
  const supportsNativeDialog = typeof dialog.showModal === "function" && typeof dialog.close === "function";
  if (fullscreen) {
    if (supportsNativeDialog) dialog.showModal();
    else dialog.setAttribute("open", "");
    return;
  }
  if (supportsNativeDialog) dialog.close();
  else dialog.removeAttribute("open");
}

/**
 * The fullscreen preview `<dialog>` — extracted to top level for the complexity-drift reason this
 * file's own header comment documents: `fullscreen && previewSrc` conditionally mounting the iframe
 * was one more branch scored against `ThemeExplore` itself.
 *
 * No device-width control duplicated in here — the docked toolbar's Desktop/Tablet/Mobile group
 * already owns that choice (`device` is shared state, so fullscreen just renders at whatever was last
 * selected), and a second set of identically-labelled buttons would be a real duplicate-tab-target for
 * keyboard/screen-reader users, not just visual clutter. The iframe is only mounted while `fullscreen`
 * is true — an always-mounted iframe here would fire a second, hidden request to the site server on
 * every render alongside the docked preview's own.
 *
 * @complexity O(1).
 */
function ThemeExploreFullscreenDialog({
  dialogRef,
  fullscreen,
  previewSrc,
  previewWidth,
  onClose,
  onCancel,
  onBackdropClick,
  t,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  fullscreen: boolean;
  previewSrc: string | null;
  previewWidth: number;
  onClose: () => void;
  onCancel: (e: SyntheticEvent<HTMLDialogElement>) => void;
  onBackdropClick: (e: MouseEvent<HTMLDialogElement>) => void;
  t: Translate;
}) {
  return (
    <dialog
      ref={dialogRef}
      className="theme-explore-preview-dialog"
      aria-label={t("Theme preview, fullscreen")}
      onCancel={onCancel}
      onClick={onBackdropClick}
    >
      <button
        type="button"
        className="theme-explore-preview-dialog-close"
        onClick={onClose}
        aria-label={t("Close fullscreen preview")}
      >
        ×
      </button>
      {fullscreen && previewSrc ? (
        <iframe
          key={previewSrc}
          className="theme-explore-preview-dialog-iframe"
          title={t("Theme preview, fullscreen")}
          src={previewSrc}
          sandbox="allow-scripts"
          style={{ width: `${previewWidth}px` }}
        />
      ) : null}
    </dialog>
  );
}

export function ThemeExplore({ themeId, useThemeExploreHook = useWiredThemeExplore }: ThemeExploreProps) {
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
    dismissError,
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
    t,
  } = useThemeExploreHook(themeId);

  // STAYS LOCAL — deliberately not moved into `useThemeExploreHook`'s controller (owner-ratified,
  // 2026-08-14 DI migration sweep). This is interactive DOM chrome, not async/API state: nothing
  // here does I/O, and `ThemeExplore.unit.test.tsx` asserts it through REAL DOM behavior driven by
  // real clicks — `aria-pressed` toggling on Tablet/Mobile, the `<dialog>`'s `open` attribute,
  // focus returning to the trigger on close. Every `useThemeExploreHook` fake in that file is a
  // static object (`() => ctrl`), so a setter moved into the controller would become a `vi.fn()`
  // that changes nothing on screen — proved by making the move and watching those tests fail with
  // "setFullscreen is not a function" before reverting here. Same precedent as `Posts.tsx:64`'s own
  // local `updatedSort`: pure view state with no I/O is allowed to live outside the injected hook.
  // Async/API state (the rest of this controller) is NOT exempt — this carve-out is for DOM-chrome
  // state asserted through real interaction only.
  const [device, setDevice] = useState<PagePreviewDevice>("desktop");
  const [fullscreen, setFullscreen] = useState(false);
  const fullscreenTriggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Same open/close lifecycle `ImagePreviewModal.tsx` established for a native `<dialog>` driven by a
  // boolean prop — see `syncFullscreenDialog`'s own doc comment for the mechanism.
  useEffect(() => {
    syncFullscreenDialog(dialogRef.current, fullscreen);
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
      {/* 2026-08-11: header row matches `PageEditor.tsx`'s own header exactly — `.page-header-text`
          (kicker/title/description) and the actions column as SIBLINGS inside the same
          `.page-header`, not stacked as two separate blocks. `.page-header`'s own `display: flex;
          justify-content: space-between` (shared, styles.css) is what puts the title on the left
          and the actions column on the right of the SAME line — that rule already does the work for
          Pages, so this screen only needed to adopt the same DOM shape, not new CSS.

          The actions column (`.theme-explore-header-actions`) wraps TWO stacked rows now, not one:
          the ← All themes / Save / Reset button row (`.page-actions`, unchanged), and below it the
          collapsed "You're editing your own copy" line. That line used to be its own full-width
          `.notice` block between the header and the file list, up to half the page wide (owner
          feedback, 2026-08-11: "it's taking up too much space... just show 'You're editing your own
          copy' and then a tooltip icon ... put that on the right hand side under the All themes").
          Moving it into the header's own actions column, rather than leaving it as a sibling of
          `.page-header` styled to float right, means the file list below gets ALL of the reclaimed
          vertical space for free — one fewer full-width block in `.page`'s flex column, no
          compensating negative margin needed. */}
      <div className="page-header theme-explore-header">
        <div className="page-header-text">
          <p className="page-kicker">{t("Studio")}</p>
          <h1 className="page-title">{detail.name}</h1>
          <p className="page-description">
            {t("Edit this theme and see it rendered. Nothing here changes your live site until you activate it.")}
          </p>
        </div>
        <div className="theme-explore-header-actions">
          <div className="page-actions">
            <a
              href="/admin/themes"
              onClick={(e) => {
                e.preventDefault();
                navigate("/themes");
              }}
            >
              <button type="button" className="btn-secondary">
                {t("← All themes")}
              </button>
            </a>
            <ThemeExploreToolbarButtons
              selectedFile={selectedFile}
              resetting={resetting}
              openResetConfirm={openResetConfirm}
              dirty={dirty}
              saving={saving}
              save={save}
              t={t}
            />
          </div>
          <ThemeExploreCopyTip detail={detail} t={t} />
        </div>
      </div>

      <ThemeExploreDirectionsNotice detail={detail} t={t} />
      <ThemeExploreStatusNotice detail={detail} t={t} />
      {/* Every error on this screen shares one presentation now — a rename refusal, a name
          collision, a containment rejection, a save/reset failure — rather than the full-width pink
          inline banner this used to be. `placement="top"` + centered (the `Toast` component's own
          styling, `styles.css`) rather than the default bottom placement `notice`/success toasts
          below use, per the owner's own ask: a mid-screen overlay would cover the file list and the
          editor, which is where the operator is looking when an error fires. `ttlMs={0}` pins it open
          (no auto-dismiss timer) — an operator who looked away has no way to recover text that
          vanished on a clock, so the close button is the only way this goes away. `role="alert"` so
          screen readers announce it immediately, matching the "the error is the feature" reasoning
          the owner gave for keeping Rename attemptable everywhere instead of disabling it. */}
      {error ? (
        <Toast message={error} tone="error" role="alert" placement="top" ttlMs={0} onDismiss={dismissError} />
      ) : null}
      {notice ? <Toast message={notice} tone="success" ttlMs={5000} onDismiss={dismissNotice} /> : null}

      <div className="theme-explore">
        <ThemeExploreFileList
          files={files}
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
                <ThemeExplorePreviewControls
                  device={device}
                  setDevice={setDevice}
                  previewWidth={previewWidth}
                  previewSrc={previewSrc}
                  fullscreenTriggerRef={fullscreenTriggerRef}
                  setFullscreen={setFullscreen}
                  t={t}
                />
              ) : null}
            </div>
          </div>

          <ThemeExploreMainPane
            view={view}
            previewSrc={previewSrc}
            previewWidth={previewWidth}
            selectedFile={selectedFile}
            source={source}
            setSource={setSource}
            t={t}
          />
        </div>
      </div>

      <ThemeExploreFullscreenDialog
        dialogRef={dialogRef}
        fullscreen={fullscreen}
        previewSrc={previewSrc}
        previewWidth={previewWidth}
        onClose={closeFullscreen}
        onCancel={handleFullscreenCancel}
        onBackdropClick={handleFullscreenBackdropClick}
        t={t}
      />

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
        body={<PageRenameWarningBody pageRenameWarning={pageRenameWarning} t={t} />}
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
  // The frame's REAL rendered width, not a guessed constant — the previous flat `880` (copied from
  // `PagePreview`'s own same-shaped placeholder) never tracked the pane actually resizing: no
  // listener of any kind, so the scale computed once and stayed frozen across a window resize, a
  // sidebar collapse, or the assistant dock opening/closing (reported live as "the preview is not
  // responsive"). See `use-theme-explore-preview-frame.hooks.ts` for the measurement itself and why
  // it stays a component-scoped hook instead of living in the screen-level one.
  const { frameRef, paneWidth } = useThemeExplorePreviewFrame();
  const scale = Math.min(1, paneWidth / width);

  return (
    <div ref={frameRef} className="page-preview-frame" style={{ height: `${900 * scale}px` }}>
      <div
        className="page-preview-scaler"
        style={{ width: `${width}px`, height: "900px", transform: `scale(${scale})` }}
      >
        {/* `key={src}` forces a remount on every save (via `previewNonce` in the URL) or file/device
            change — an iframe does not reliably refetch when only its `src` attribute changes. */}
        <iframe key={src} className="page-preview-iframe" title={title} src={src} sandbox="allow-scripts" />
      </div>
    </div>
  );
}

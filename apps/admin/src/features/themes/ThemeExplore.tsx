import { themeExplorePreviewMode, useThemeExplorePreview, type ThemeExplorePreviewMode } from "./hooks/use-theme-explore-preview.hooks";
import { WiredThemePreviewReloadButton } from "./ThemePreviewReloadButton";
import { CodeView, CodeWrapToggle } from "../../components/CodeView/CodeView";
import { useCodeWrap } from "../../components/CodeView/use-code-wrap.hooks";
import { type KeyboardEvent, type MouseEvent, type RefObject, type SyntheticEvent } from "react";
import { ConfirmDialog, RowMenu } from "@jini-ai/admin/react";
import { agentHandle } from "@jini-ai/agentic";
import { Icon, Toast } from "@jini-ai/ui";

import { InfoTip } from "@jini-ai/ui/admin-widgets";
import { resolveTabBarTabIndex, useTabBarKeyboard } from "@jini-ai/ui/tab-strip";
import { useDevicePreviewDevice, usePreviewPaneWidth, type DevicePreviewDevice } from "../../components/DevicePreview/DevicePreview.hooks";
import { DevicePreviewFrame } from "../../components/DevicePreview/DevicePreviewFrame";
import { DevicePreviewToggle } from "../../components/DevicePreview/DevicePreviewToggle";
import { siteUrl } from "../../lib/site-url";
import { navigate } from "../../lib/router";
import type { Translate } from "@jini-ai/ui/panel-kit";
import { splitOnPlaceholders } from "@jini-ai/ui/panel-kit";
import { buildAgentListHandles } from "@jini-ai/agentic";
import {
  canResetThemeFile,
  isThemeFileModified,
  publishToggleTipLabel,
  readOnlyReason,
  selectedFileLabel,
  selectedFilePublishState,
  themeExploreHtmlMode,
  useWiredThemeExplore,
  type ThemeExploreDetail,
  type ThemeExploreFile,
  type ThemeFileGroup,
  type ThemeExplorePublishState,
  type ThemeExploreView,
} from "./hooks/use-theme-explore.hooks";
import { useThemeExploreFullscreen } from "./ThemeExplore.hooks";
import { useWiredThemeExploreTheme } from "./hooks/use-theme-explore-theme.hooks";
import { useThemeExploreFileGroups, type ThemeExploreFileGroupsController } from "./hooks/use-theme-explore-file-groups.hooks";

/**
 * @file Explore — edit any theme, active or not, and see it rendered.
 *
 * The screen the copy-not-inherit model needed. Every installed theme is a COPY of an original that
 * still exists untouched in the catalog, so editing here is always safe in the one way that matters:
 * the thing you forked from is still on disk, byte-identical, to reset back to. That is what the
 * banner says, and it is why ordinary editing here needs no confirmation at all.
 *
 * Reset and Delete are the exceptions, and both confirm: restoring a file to its original overwrites
 * the working copy with no backup, and removing a file outright is even more final — this repo keeps
 * no theme-file revision history, so a delete cannot be recovered from at all, not even by re-copying
 * a catalog original the way Reset does. These are the only two actions on this screen that can
 * destroy work (2026-08-29: Delete added to Copy/Rename's ⋮ menu, owner ask).
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
 * The device-width control and scaled frame are the shared `components/DevicePreview` pieces
 * `PageEditor.tsx` and `PostEditor.tsx` also render — same widths, same scale-to-fit mechanism, just
 * pointed at a real `src` URL instead of `SrcDocSandbox`'s `srcDoc`.
 *
 * This component's own render body is deliberately thin. Every conditional block that does not need
 * a value straight out of `useThemeExploreHook`'s controller has been pulled out to a top-level
 * function or component below (`ThemeExploreDirectionsNotice`, `ThemeExploreFileList`,
 * `ThemeExploreToolbarButtons`, `ThemeExplorePreviewControls`, `ThemeExplorePublishToggle`,
 * `ThemeExploreMainPane`, `ThemeExploreFullscreenDialog`) — `apps/admin`'s complexity-drift check (`npm run
 * check:admin-complexity-drift`) scores a component's OWN cyclomatic/cognitive complexity from every
 * ternary/`&&`/`.map()`-with-branching directly inside its JSX, and this component's markup used to
 * carry roughly a dozen of those inline, landing at 27/29 against a 9/9 ceiling. Each extraction below
 * is a genuinely TOP-LEVEL function, not a `useCallback` or nested closure — a nested closure is still
 * scored as its own unit by ESLint's `complexity`/`sonarjs/cognitive-complexity` rules, but the
 * separate drift tool this repo also gates on aggregates a closure DECLARED INSIDE a component back
 * into that component's own count, so only moving the code to actual module scope lowers both.
 *
 * The `device`/`fullscreen` state below and the preview pane's own width measurement
 * (`usePreviewPaneWidth`, `components/DevicePreview`) deliberately stay OUTSIDE `useThemeExploreHook`'s
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
  /**
   * Page id from `?page=`, when the caller named one — the page to open ON, instead of the theme's
   * index. `features/pages/Pages.tsx`'s "Theme Pages" tab is the only thing that sets it today: its
   * rows link straight into this screen, focused on the row's own page.
   *
   * Optional, and a value naming no page of this theme is not an error — see
   * `use-theme-explore.hooks.ts`'s `initialSelectedPath` for the fallback.
   */
  pageId?: string;
  /**
   * File to open on, from `?file=` — the file's own full relative path (e.g.
   * `render/pages/404.html`), not a bare id. Takes priority over `pageId`; see
   * `use-theme-explore.hooks.ts`'s `ThemeExploreOptions.fileId` for the full contract, including why
   * this screen writes it back into the address bar on every selection.
   */
  fileId?: string;
  /** DI seam for tests — same convention as `Themes.tsx`'s `useThemesHook`. */
  useThemeExploreHook?: typeof useWiredThemeExplore;
  useThemeExplorePreviewHook?: typeof useThemeExplorePreview;
}

/**
 * Whether to label the save chord ⌘ or Ctrl.
 *
 * Reads `navigator.platform` despite it being deprecated, because the replacement
 * (`navigator.userAgentData.platform`) is not in Safari or Firefox — the exact browsers where
 * getting this wrong is most likely. Wrong answer costs a slightly off tooltip, so the deprecated
 * property beats a feature-detection ladder. This only runs while rendering the Explore toolbar,
 * i.e. in a browser (or jsdom), where `navigator` and its string-typed `platform` always exist, so
 * no absence guard is needed.
 */
function isApplePlatform(): boolean {
  return /mac|iphone|ipad|ipod/i.test(navigator.platform);
}

const VIEWS: ReadonlyArray<{ key: ThemeExploreView; label: string }> = [
  { key: "preview", label: "Preview" },
  { key: "html", label: "HTML" },
];

/** {@link VIEWS} carrying the `id` that `TabBar.hooks.tsx`'s WAI-ARIA tabs helpers key on, so this
 *  hand-rolled `role="tablist"` row gets the same arrow/Home/End keys and roving tab stop `TabBar`
 *  has (a35ce9f12) without becoming a `<TabBar>` — same treatment `PageEditor.tsx`'s identical
 *  `.segmented` view row takes. `label` is the untranslated key; only `id` is read here. */
const VIEW_TABS = VIEWS.map((entry) => ({ ...entry, id: entry.key }));

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
 * The HTML tab's body for the selected file — binary (no source, Preview tab instead), unloaded (the
 * file's text is not in the buffer), read-only (script/`other`, visible but not saveable), or a normal
 * editable textarea. `themeExploreHtmlMode` (`use-theme-explore.hooks.ts`) picks which.
 *
 * @complexity O(1) — renders exactly one of four fixed shapes.
 */
function ThemeExploreHtmlPane({
  file,
  source,
  sourceLoaded,
  setSource,
  t,
}: {
  file: ThemeExploreFile | undefined;
  source: string;
  sourceLoaded: boolean;
  setSource: (value: string) => void;
  t: Translate;
}) {
  const mode = themeExploreHtmlMode(file, sourceLoaded);

  if (mode === "binary") {
    // Never rendered into a textarea: reading a PNG as UTF-8 gives mojibake, and saving that back
    // would truly corrupt it. The Preview tab shows the real bytes.
    return (
      <div className="notice">
        {t("This is a binary file, so it has no editable source. Use the Preview tab to view it.")}
      </div>
    );
  }

  if (mode === "unloaded") {
    // The open file's text is not in the buffer: its read is in flight or failed (a file past the
    // 1 MB text-read limit), or a reset returned no text. Whatever the buffer holds is not this file,
    // so it is neither shown nor editable. The error toast carries the reason.
    return (
      <textarea
        className="page-html-source"
        value=""
        readOnly
        spellCheck={false}
        aria-label={t("Theme file source (read-only)")}
      />
    );
  }

  if (mode === "readonly") {
    // Readable but not editable — an `other`-group file (2026-08-29: `script` moved to the editable
    // branch below, see `readOnlyReason`'s own doc). Shown as source (unlike the binary case above),
    // but `readOnly` and paired with a visible reason: an editable-looking textarea next to a Save
    // button that can never fire would be worse than either showing nothing or being honest about
    // why.
    return (
      <>
        <div className="notice">{t(readOnlyReason())}</div>
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
 * The file list's modified marker: a dot beside a file whose bytes differ from its catalog original
 * ({@link isThemeFileModified}), nothing for any other file. `role="img"` with an `aria-label` gives
 * the dot an accessible name, so the signal is not colour alone; `title` shows sighted users the same
 * meaning on hover. Rendered as a sibling of the filename button, not inside it, so the button's
 * ellipsis truncation cannot clip it.
 *
 * @complexity O(1).
 */
function ThemeExploreModifiedMarker({ file, t }: { file: ThemeExploreFile; t: Translate }) {
  if (!isThemeFileModified(file)) return null;
  return (
    <span
      className="theme-explore-file-modified"
      role="img"
      aria-label={t("Modified")}
      title={t("Modified from the original")}
    />
  );
}

/**
 * One file chip in the picker tray (a sidebar row until 2026-10-11): the filename control (or its
 * inline-rename replacement) plus the ⋮ overflow menu — 2026-08-11 owner ask (Copy/Rename).
 *
 * `title={file.path}` is the FULL relative path (e.g. `pages/blog-post.html`), not just `file.label`
 * — two files that render the same LABEL under different groups (or, before now, before an ellipsis
 * fix landed, two long names that both got clipped to the same visible prefix) had no way to tell
 * which was which without this. CSS-only per the owner's own instruction ("if CSS can handle that
 * without us having to do tooltips and all that, do it") — this `title` attribute plus
 * `.theme-explore-file-row button:not(.row-menu-trigger) { overflow: hidden; text-overflow: ellipsis;
 * white-space: nowrap; }` (`styles.css`) is the entire truncation implementation, deliberately with
 * no character cap in code: the chip's own `max-width` (CSS) decides where the ellipsis falls.
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
  openDeleteConfirm,
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
  /** Opens the delete confirmation for this row — see `ThemeExplore`'s own `deleteTarget`/
   *  `ConfirmDialog` for the confirmation this defers to, and `use-theme-explore.hooks.ts`'s
   *  `openDeleteConfirm` for the client-side pre-check (a locked file surfaces a toast instead of
   *  opening the dialog, same shape `startRename` already uses). */
  openDeleteConfirm: (path: string) => void;
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
      <ThemeExploreModifiedMarker file={file} t={t} />
      {/* Copy is unconditional — see the hook's own `copyFile` doc comment for why duplicating bytes
          carries none of the risk editing does. Rename and Delete are always offered too: a LOCKED
          file (pages/index.html, theme.json, tokens.json, or any script/`other`-group file — see
          `IDENTITY_LOCKED_GROUPS`) still shows both items, but selecting one surfaces the refusal as
          a toast (`ThemeExplore`'s own `error` Toast below) instead of opening the inline editor or
          the delete confirmation — `RowMenu` has no built-in disabled-item affordance to hang a
          reason off, and a greyed-out item would explain nothing anyway (owner, 2026-08-11: "I like
          the fact that we got the error ... it should be a toast"). Delete additionally opens a
          confirmation dialog rather than acting immediately (2026-08-29 ask) — see `ThemeExplore`'s
          own delete `ConfirmDialog` for why that pause, unlike Rename's, is unconditional whenever
          the file IS eligible: deleting is the one operation here with no undo at all. */}
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
          {
            key: "delete",
            label: t("Delete"),
            tone: "danger",
            onSelect: () => openDeleteConfirm(file.path),
          },
        ]}
      />
    </li>
  );
}

/**
 * The picker's group tabs (Pages, Partials, Styles, ...), one per non-empty group, each with its file
 * count and a dot when any file in it is modified — the per-file dots are only on screen for the
 * group that is showing, so the tab carries the signal for the others. A real ARIA tablist with the
 * same arrow-key handling as the Preview/HTML tabs below it (`useTabBarKeyboard`).
 *
 * @complexity O(g) for the fixed group count.
 */
function ThemeExploreFileGroupTabs({ groups, t }: { groups: ThemeExploreFileGroupsController; t: Translate }) {
  const { tabs, activeGroup, chooseGroup } = groups;
  const activeId = activeGroup ?? "";
  const { onKeyDown } = useTabBarKeyboard({ tabs, activeId, onChange: (id) => chooseGroup(id as ThemeFileGroup) });
  return (
    <div className="theme-explore-groups" role="tablist" aria-label={t("File groups")} onKeyDown={onKeyDown}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          id={`theme-explore-group-${tab.key}`}
          aria-selected={tab.key === activeGroup}
          aria-controls="theme-explore-files-panel"
          className={tab.key === activeGroup ? "theme-explore-group is-active" : "theme-explore-group"}
          tabIndex={resolveTabBarTabIndex({ tabs, activeId, tab })}
          onClick={() => chooseGroup(tab.key)}
          {...agentHandle({ handle: `theme-explore-group-${tab.key}` }, { role: "button", label: `Show this theme's ${tab.label} files` })}
        >
          {t(tab.label)}
          <span className="theme-explore-group-count">{tab.count}</span>
          {tab.modified ? <span className="theme-explore-group-modified" aria-hidden="true" /> : null}
        </button>
      ))}
    </div>
  );
}

/**
 * "Show all (N)" / "Show fewer" under a group longer than the collapsed chip limit (assets, mostly);
 * nothing for a short group.
 *
 * @complexity O(1).
 */
function ThemeExploreShowAllToggle({ groups, t }: { groups: ThemeExploreFileGroupsController; t: Translate }) {
  if (!groups.collapsible) return null;
  return (
    <button
      type="button"
      className="theme-explore-files-more"
      aria-expanded={groups.expanded}
      aria-controls="theme-explore-files-panel"
      onClick={groups.toggleExpanded}
    >
      {groups.expanded ? t("Show fewer") : t("Show all ({count})").replace("{count}", String(groups.groupCount))}
    </button>
  );
}

/**
 * The file picker tray above the preview (owner, 2026-10-11: "the file list that's on the left, make
 * that up top ... it's way too small right now when the assistant chat is open"). Group tabs on top,
 * the active group's files as wrapping chips below; which group shows and whether a long one is
 * collapsed is `useThemeExploreFileGroups`'s job. Groups keep their old order, most-edited first
 * (assets last: there are many of them and they are the ones an author is least likely to be
 * looking for). A real nested file tree is a separate component a theme's editable surface (~20
 * entries, two folders deep) does not need.
 *
 * It used to be a 190px sidebar whose `<nav>` was absolutely positioned inside an empty grid cell so
 * it could borrow the preview column's height and scroll internally. That trick is gone with the
 * column: the tray is in normal flow with its own height, so it has no scroller of its own and the
 * page scrolls past it (the old inner scroller trapped the wheel at its bottom edge).
 *
 * Extracted to top level, not inline in `ThemeExplore`'s own JSX, for the complexity-drift reason this
 * file's own header comment documents; each chip's own rendering is `ThemeExploreFileRow`.
 *
 * @complexity O(n) for `n` files: handle building, the group filter and the chip render are each one pass.
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
  openDeleteConfirm,
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
  openDeleteConfirm: (path: string) => void;
  t: Translate;
}) {
  // File paths are globally unique across every group (a theme's editable surface is a flat set of
  // relative paths, just displayed grouped by kind), so they disambiguate one row's menu from
  // another's regardless of which group renders it — same reasoning `Taxonomy.tsx`'s `termHandles`
  // documents for its own flat, cross-group id list. Computed once here, over ALL files before the
  // group filter, so a path's handle never depends on which group tab is showing.
  const fileMenuHandles = buildAgentListHandles({ prefix: "theme-explore-file", ids: files.map((file) => file.path) }
  );
  const fileMenuHandleByPath = new Map(files.map((file, index) => [file.path, fileMenuHandles[index]!]));
  const groups = useThemeExploreFileGroups({ files, highlightedPath: selected });
  return (
    <nav className="theme-explore-files" aria-label={t("Theme files")}>
      <ThemeExploreFileGroupTabs groups={groups} t={t} />
      <div
        id="theme-explore-files-panel"
        role="tabpanel"
        aria-labelledby={groups.activeGroup ? `theme-explore-group-${groups.activeGroup}` : undefined}
        className="theme-explore-files-panel"
      >
        <ul className="theme-explore-file-chips">
          {groups.visibleFiles.map((file) => (
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
              openDeleteConfirm={openDeleteConfirm}
              agentBase={fileMenuHandleByPath.get(file.path)!}
              t={t}
            />
          ))}
        </ul>
        <ThemeExploreShowAllToggle groups={groups} t={t} />
      </div>
    </nav>
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
  savingOriginal,
  saveOriginal,
  t,
}: {
  detail: ThemeExploreDetail;
  savingOriginal: boolean;
  saveOriginal: () => Promise<void>;
  t: Translate;
}) {
  if (detail.hasOriginal) return null;
  // The action saves the theme's CURRENT files as its hidden original (owner 2026-10-08: "hidden away
  // somewhere where it can't be touched ... then you can just reload each template page from the
  // original") — not a visible copy. No confirm: it overwrites nothing.
  return (
    <div className="notice warning theme-explore-no-original">
      <span>{t("This theme has no stored original, so nothing can be reset.")}</span>
      <span className="theme-explore-no-original-action">
        <button
          type="button"
          className="btn-secondary"
          disabled={savingOriginal}
          aria-busy={savingOriginal}
          onClick={() => void saveOriginal()}
          {...agentHandle(
            { handle: "theme-explore-save-original" },
            { role: "button", label: "Save this theme's current files as its stored original, so Reset can restore from it" }
          )}
        >
          {savingOriginal ? t("Saving…") : t("Save as original")}
        </button>
      </span>
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
 * Reuses `InfoTip` (`@jini-ai/ui/admin-widgets`) rather than a second bespoke tooltip — it already
 * opens on hover AND focus and is keyboard-reachable (`tabIndex={0}` + `aria-label`), which is the
 * actual accessibility bar here: the native `title` attribute was rejected for this exact component
 * already (see `InfoTip`'s own doc), and touch devices can't hover at all.
 *
 * (The tooltip used to append a "Copied from X vY." lineage sentence; that metadata only ever came
 * from the theme marketplace, deleted 2026-10-04.)
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
  return (
    <p className="theme-explore-copy-tip">
      {t("You're editing your own copy.")}
      <InfoTip
        label={t(
          "An untouched original is kept separately, so you can change anything here without losing what you started from."
        )}
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
  // One sentence, not three concatenated fragments (`t("Renaming")` + a `<code>` + `t("to")`
  // + …): each fragment word DID have a per-locale translation, but the fixed English word order
  // around the two `<code>` boundaries can't be reordered for a verb-final language — Japanese's
  // own "に" (to) is a postposition that belongs AFTER the target name, not between "Renaming" and
  // it, so the old fragment order was ungrammatical there regardless of the words being correct.
  // `splitOnPlaceholders` keeps the `<code>` elements as real React nodes while the key itself
  // carries a full, reorderable sentence per locale.
  const [before, between, after] = splitOnPlaceholders({ template: t(
      "Renaming {file} to {name} changes its public URL. Anything already linking to it directly will need updating.",
    ), tokens: ["{file}", "{name}"] }
  );
  return (
    <p>
      {before}
      <code>{pageRenameWarning?.path}</code>
      {between}
      <code>{pageRenameWarning?.name}</code>
      {after}
    </p>
  );
}

/**
 * The delete confirmation `ConfirmDialog`'s body — same "name the exact target" shape
 * {@link PageRenameWarningBody} and the Reset dialog's own body use, for the same reason: a
 * destructive prompt should never be ambiguous about what it acts on. Pulled out to a top level
 * function for the same complexity-drift reason this file's own header comment documents.
 *
 * @complexity O(1).
 */
function DeleteFileWarningBody({ deleteTarget, t }: { deleteTarget: string | null; t: Translate }) {
  // One whole sentence with a `{file}` placeholder — see `PageRenameWarningBody`'s comment for why
  // this replaced two fragments split around the `<code>` element.
  const [before, after] = splitOnPlaceholders({ template: t("Are you sure you want to delete {file}? This permanently removes the file. There is no way to get it back."), tokens: ["{file}"] }
  );
  return (
    <p>
      {before}
      <code>{deleteTarget}</code>
      {/* Deliberately NOT the literal phrase "cannot be undone" — the Reset dialog above already
          owns that exact wording, and both dialogs' body markup renders unconditionally regardless
          of `open` (`ConfirmDialog`'s own behavior), so identical phrasing across two simultaneously-
          mounted dialogs would make `getByText` ambiguous for either one. Same meaning, distinct
          wording — see `ThemeExplore.unit.test.tsx`'s "delete confirmation" describe block. */}
      {after}
    </p>
  );
}

/**
 * The Reset-file `ConfirmDialog`'s body — same "name the exact target" shape as
 * {@link PageRenameWarningBody} and {@link DeleteFileWarningBody}, pulled out to a top-level
 * function to match them (this one used to stay inline, since it only had one `<code>` node, but
 * the `splitOnPlaceholders` call reads better named than nested in JSX).
 *
 * @complexity O(1).
 */
function ResetFileWarningBody({ selected, t }: { selected: string | null; t: Translate }) {
  const [before, after] = splitOnPlaceholders({ template: t(
      "This replaces {file} with the version from the original theme. Any changes you have made to this file will be lost, and this cannot be undone.",
    ), tokens: ["{file}"] }
  );
  return (
    <p>
      {before}
      <code>{selected}</code>
      {after}
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
  state: { resetting: boolean; file: ThemeExploreFile },
  t: Translate
): string {
  // Reset only renders for a file `canResetThemeFile` accepted, so there is always a file to name.
  if (state.resetting) return t("Resetting…");
  return `${t("Reset")} ${state.file.label}`;
}

/**
 * The outer toolbar's Save/Reset pair — 2026-08-11 toolbar restructure (owner-approved), matching
 * `PageEditor.tsx`'s `[← Pages] [Published ▾] [Save] [Delete]` shape: `← All themes` outline/secondary
 * (a plain back arrow at the header's far left since 2026-10-11),
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
      {/* Hidden entirely, not disabled, when the file has no original to restore from, or when its
          bytes still match that original (2026-09-12 owner decision: a reset would change nothing) —
          same reasoning as Save's own absence above. See `canResetThemeFile`. Reset stays reachable
          for a read-only file, though: it can only ever write back the file's ORIGINAL bytes, never
          operator-authored content, so "read-only" here means "cannot be AUTHORED from this screen,"
          not "cannot be restored" — the restriction Save enforces has no bearing on what Reset does. */}
      {canResetThemeFile(selectedFile) ? (
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
 * @complexity O(1).
 */
function ThemeExplorePreviewControls({
  device,
  setDevice,
  previewSrc,
  fullscreenTriggerRef,
  setFullscreen,
  t,
}: {
  device: DevicePreviewDevice;
  setDevice: (value: DevicePreviewDevice) => void;
  previewSrc: string | null;
  fullscreenTriggerRef: RefObject<HTMLButtonElement | null>;
  setFullscreen: (value: boolean) => void;
  t: Translate;
}) {
  return (
    <>
      <DevicePreviewToggle device={device} setDevice={setDevice} t={t} />
      <WiredThemePreviewReloadButton disabled={previewSrc === null} />
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
 * The toolbar's right-hand controls for the active tab: the device/reload/fullscreen group while
 * Preview renders a page, the Wrap toggle while Preview shows a data/style/script file as code
 * (2026-10-10 — a device width means nothing for JSON, see `themeExplorePreviewMode`), and nothing on
 * the HTML tab. Top level for the complexity-drift reason this file's header comment documents.
 *
 * @complexity O(1).
 */
function ThemeExploreToolbarActions({
  view,
  previewMode,
  wrap,
  toggleWrap,
  controls,
  t,
}: {
  view: ThemeExploreView;
  previewMode: ThemeExplorePreviewMode;
  wrap: boolean;
  toggleWrap: () => void;
  controls: Omit<Parameters<typeof ThemeExplorePreviewControls>[0], "t">;
  t: Translate;
}) {
  if (view !== "preview") return null;
  if (previewMode === "code") {
    return <CodeWrapToggle wrap={wrap} onToggle={toggleWrap} t={t} agentHandleId="theme-explore-wrap-toggle" className="btn-secondary" />;
  }
  return <ThemeExplorePreviewControls {...controls} t={t} />;
}

/**
 * The publish toggle for the currently SELECTED page — 2026-08-30 owner ask: a static theme's public
 * routing used to be pure file presence (`isStandaloneThemePage`, `theme.ts`), with no way to take a
 * page down short of moving its file out of `render/pages/` entirely (the `_unpublished/` folder hack
 * this feature replaces). Sits on the toolbar's FIRST row, immediately right of the Preview/HTML tabs
 * (`ThemeExplore`'s own `.theme-explore-toolbar-start` wrapper) — a same-day restyle of what first
 * shipped as its own second row below the toolbar with a two-button Off/Published segmented control:
 * "Can the publish just be a toggle rather than the tab. Toggle is just way smaller... it will be a
 * toggle, a green toggle, Apple style" (owner, verbatim).
 *
 * Renders for every file {@link selectedFilePublishState} returns non-`null` for, in one of two
 * shapes:
 * - `"toggle"` — a real candidate page: an ENABLED switch; `published` both reflects and (via
 *   `setPagePublished`) controls the live publish state.
 * - `"locked"` — a page that exists but can never be independently toggled (`index`/`404`/a declared
 *   template shell, see {@link lockedPublishReason}): a DISABLED switch fixed to whichever position
 *   is actually true, with its reason in the ⓘ tooltip (owner, 2026-10-11: it used to be visible
 *   text beside the switch; the row is now just "Publish [switch] ⓘ"). PRESENT, not absent — the previous "no publish
 *   state, so show nothing" behavior made the control silently vanish for these pages exactly the
 *   same way it correctly vanishes for a stylesheet, and cost real operator confusion (see
 *   {@link selectedFilePublishState}'s own doc).
 *
 * `role="switch"`/`aria-checked`, not the old segmented control's `role="group"` of two
 * `aria-pressed` buttons — one control now represents one boolean, matching the shape the WAI-ARIA
 * switch pattern is actually for. State is never color-only: the knob's own POSITION (left/right) is
 * an independent, shape-based signal a colour-blind reader still sees without needing to resolve the
 * track's hue, the same "distinct shapes, not one shape recolored" reasoning
 * `.deployment-step-marker-done`'s own CSS comment gives for pairing its green fill with a checkmark
 * glyph rather than relying on the fill alone.
 *
 * An `InfoTip` (reused the same way {@link ThemeExploreCopyTip} does — see that component's own doc
 * for why the native `title` attribute was rejected here too) sits right after the switch. A locked
 * switch's tip is its reason; a live switch's tip (`publishToggleTipLabel`) explains what determines
 * whether a page is reachable at its own URL, and that a page is published BY DEFAULT until the
 * first page on a theme is toggled off (owner ask, 2026-08-30) — not the reverse.
 * Getting that direction backwards in the tooltip copy would be worse than shipping no tooltip at all,
 * so its wording was checked against `theme.ts`'s `ThemeManifest.publishedPages` doc and
 * `theme-page-publish.test.ts` rather than assumed. Deliberately silent on the separate Post-vs-page
 * slug-collision override (`resolveMarketingPageOrOverride`, `pages.ts`) — that is a different
 * mechanism (which RECORD wins a shared slug) from this one (whether a theme page has a route at
 * all), and folding both into one bubble would confuse the exact thing this tooltip exists to clarify.
 *
 * @complexity O(1) — one fixed control, no iteration.
 */
function ThemeExplorePublishToggle({
  state,
  publishing,
  setPagePublished,
  fileLabel,
  t,
}: {
  state: ThemeExplorePublishState;
  publishing: boolean;
  setPagePublished: (published: boolean) => Promise<void>;
  fileLabel: string;
  t: Translate;
}) {
  const on = state.kind === "toggle" ? state.published : state.on;
  // Locked forever; a live toggle is additionally disabled for the duration of its own round trip —
  // same "can't act while the very action it's for is in flight" shape `save`/`reset`'s own disabled
  // conditions use elsewhere on this screen.
  const disabled = state.kind === "locked" || publishing;
  const reasonId = state.kind === "locked" ? "theme-explore-publish-reason" : undefined;

  // Guarded on `state.kind` rather than relying solely on the DOM's own "disabled buttons don't fire
  // click" behavior — explicit here so a locked switch can never dispatch a publish call no matter
  // what wraps or simulates the click.
  function handleClick() {
    if (state.kind === "toggle") void setPagePublished(!state.published);
  }

  return (
    <div className="theme-explore-publish-toggle">
      <span className="theme-explore-publish-label">{t("Publish")}</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={`${t("Publish")} ${fileLabel}`}
        aria-describedby={reasonId}
        className={on ? "theme-explore-switch is-on" : "theme-explore-switch"}
        disabled={disabled}
        onClick={handleClick}
      >
        <span className="theme-explore-switch-knob" aria-hidden="true" />
      </button>
      {/* `descriptionId` keeps the locked reason as the switch's `aria-describedby` text: InfoTip
          renders the label in a hidden span with that id, so screen readers still hear why. */}
      <InfoTip label={publishToggleTipLabel(state, t)} descriptionId={reasonId} />
    </div>
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
 * 2026-10-10: a data/style/script file (`previewMode === "code"`) shows its text in the shared
 * read-only `CodeView` at normal size instead of the device-scaled iframe. An unloaded buffer shows
 * as empty, same as the HTML tab's `"unloaded"` case: whatever it holds is not this file.
 *
 * @complexity O(n) for n characters of source in the code branch; O(1) otherwise.
 */
function ThemeExploreMainPane({
  view,
  previewMode,
  wrap,
  previewSrc,
  previewWidth,
  selectedFile,
  source,
  sourceLoaded,
  setSource,
  t,
}: {
  view: ThemeExploreView;
  previewMode: ThemeExplorePreviewMode;
  wrap: boolean;
  previewSrc: string | null;
  previewWidth: number;
  selectedFile: ThemeExploreFile | undefined;
  source: string;
  sourceLoaded: boolean;
  setSource: (value: string) => void;
  t: Translate;
}) {
  if (view === "html") {
    return (
      <ThemeExploreHtmlPane file={selectedFile} source={source} sourceLoaded={sourceLoaded} setSource={setSource} t={t} />
    );
  }
  if (previewMode === "code") {
    return (
      <div className="theme-explore-code-view" role="region" aria-label={t("Theme file source (read-only)")}>
        <CodeView text={sourceLoaded ? source : ""} wrap={wrap} />
      </div>
    );
  }
  if (previewSrc === null) {
    return <div className="notice">{themeExplorePreviewNotice(t)}</div>;
  }
  return <ThemeExplorePreview src={previewSrc} width={previewWidth} title={t("Theme preview")} />;
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

export function ThemeExplore(props: ThemeExploreProps) {
  const resolved = useWiredThemeExploreTheme({ themeId: props.themeId });
  if (resolved.loading) return <div className="notice">{resolved.t("Loading theme…")}</div>;
  if (!resolved.themeId) return (
    <div className={`notice${resolved.error ? " error" : ""}`}>
      <p>{resolved.error ?? resolved.t("No theme is active. Your site renders unstyled so you can supply your own CSS; posts, pages and products still publish normally. Activate a theme below to switch back at any time — nothing was deleted.")}</p>
      <a href={siteUrl("/admin/themes")}>{resolved.t("Themes")}</a>
    </div>
  );
  return <ThemeExploreContent {...props} themeId={resolved.themeId} />;
}

function ThemeExploreContent({
  themeId,
  pageId,
  fileId,
  useThemeExploreHook = useWiredThemeExplore,
  useThemeExplorePreviewHook = useThemeExplorePreview,
}: ThemeExploreProps) {
  const {
    detail,
    files,
    selected,
    select,
    highlightedPath,
    view,
    setView,
    source,
    setSource,
    dirty,
    confirmLeave,
    sourceLoaded,
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
    savingOriginal,
    saveOriginal,
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
  } = useThemeExploreHook(themeId, { pageId, fileId });

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
  const { device, setDevice, width: previewWidth } = useDevicePreviewDevice();
  const {
    fullscreen,
    setFullscreen,
    fullscreenTriggerRef,
    dialogRef,
    closeFullscreen,
    handleFullscreenCancel,
    handleFullscreenBackdropClick,
  } = useThemeExploreFullscreen();
  // Above the early returns below: `use*` has to be called unconditionally for the rules-of-hooks
  // lint even though this one holds no state of its own.
  const { onKeyDown: onViewTabsKeyDown } = useTabBarKeyboard({ tabs: VIEW_TABS, activeId: view, onChange: (id) => setView(id as ThemeExploreView) });

  const previewSrc = useThemeExplorePreviewHook({ themeId, detail, files, selected, previewNonce });
  // Shared by the toolbar's Wrap toggle and the Preview tab's code view; only read for "code" files.
  const { wrap, toggleWrap } = useCodeWrap();

  if (error && !detail) return <div className="notice error">{error}</div>;
  if (!detail) return <div className="notice">{t("Loading theme…")}</div>;

  const selectedFile = files.find((f) => f.path === selected);
  const publishState = selectedFilePublishState(selectedFile, t);
  const previewMode = themeExplorePreviewMode(selectedFile);

  return (
    <div className="page">
      {/* 2026-08-11: header row matches `PageEditor.tsx`'s own header exactly — `.page-header-text`
          (kicker/title/description) and the actions column as SIBLINGS inside the same
          `.page-header`, not stacked as two separate blocks. `.page-header`'s own `display: flex;
          justify-content: space-between` (shared, styles.css) is what puts the title on the left
          and the actions column on the right of the SAME line — that rule already does the work for
          Pages, so this screen only needed to adopt the same DOM shape, not new CSS.

          The actions column (`.theme-explore-header-actions`) wraps TWO stacked rows now, not one:
          the Save / Reset button row (`.page-actions`; ← All themes left it 2026-10-11), and below it the
          collapsed "You're editing your own copy" line. That line used to be its own full-width
          `.notice` block between the header and the file list, up to half the page wide (owner
          feedback, 2026-08-11: "it's taking up too much space... just show 'You're editing your own
          copy' and then a tooltip icon ... put that on the right hand side under the All themes").
          Moving it into the header's own actions column, rather than leaving it as a sibling of
          `.page-header` styled to float right, means the file list below gets ALL of the reclaimed
          vertical space for free — one fewer full-width block in `.page`'s flex column, no
          compensating negative margin needed.

          2026-10-11 (owner: "center the title section ... just make it a back arrow to the left,
          and leave the Saved and Reset buttons where they are"): "← All themes" left the actions
          row and is now a plain back arrow alone at the header's left, the same arrow the Edit
          post/page headers use (`.content-editor-back`). The title block sits centred between it
          and the actions column; the grid that does that is `.theme-explore-header` in styles.css. */}
      <div className="page-header theme-explore-header">
        {/* A plain `<button>`, not a `<button>` nested inside an `<a href>` — that nesting
            (interactive content inside interactive content) is invalid HTML, and a browser
            agent's accessibility-tree read (or a screen reader) sees either a link wrapping a
            button or an ambiguous merge of the two roles, depending on the engine. The 2026-08-11
            toolbar restructure (`ThemeExplore.unit.test.tsx`'s "toolbar restructure" describe
            block) deliberately settled this control as a BUTTON, so the fix here is to drop the
            redundant wrapping anchor rather than the button; `navigate()` is a real client-side
            route change, same as `ThemeGrid`'s own "Explore" button in `Themes.tsx` right above
            this file. Icon-only since 2026-10-11: `aria-label` names it, `title` is the hover tip
            (same pair `ThemePreviewReloadButton` uses). */}
        <button
          type="button"
          className="theme-explore-back"
          aria-label={t("All themes")}
          title={t("All themes")}
          onClick={() => {
            if (confirmLeave()) navigate("/themes");
          }}
        >
          <Icon name="arrow-left" size={22} aria-hidden="true" />
        </button>
        <div className="page-header-text">
          <p className="page-kicker">{t("Studio")}</p>
          <h1 className="page-title">{detail.name}</h1>
          <p className="page-description">
            {t("Edit this theme and see it rendered. Nothing here changes your live site until you activate it.")}
          </p>
        </div>
        <div className="theme-explore-header-actions">
          <div className="page-actions">
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

      <ThemeExploreDirectionsNotice detail={detail} savingOriginal={savingOriginal} saveOriginal={saveOriginal} t={t} />
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

      {/* File picker on top, then the toolbar and preview at full width (owner, 2026-10-11). This
          wrapper is the screen's size container (`container-type` in styles.css), so its layout
          follows the width it actually gets with the side nav and chat dock open, not the
          viewport. The toasts above stay outside it on purpose: containment would make this box
          their containing block instead of the window. */}
      <div className="theme-explore">
        <ThemeExploreFileList
          files={files}
          selected={highlightedPath}
          select={select}
          renamingPath={renamingPath}
          renameDraft={renameDraft}
          setRenameDraft={setRenameDraft}
          startRename={startRename}
          cancelRename={cancelRename}
          commitRename={commitRename}
          copyingPath={copyingPath}
          copyFile={copyFile}
          openDeleteConfirm={openDeleteConfirm}
          t={t}
        />

        <div className="theme-explore-main">
          <div className="page-editor-toolbar">
            <div className="theme-explore-toolbar-start">
              <div className="segmented" role="tablist" aria-label={t("Editor view")} onKeyDown={onViewTabsKeyDown}>
                {VIEW_TABS.map((entry) => (
                  <button
                    key={entry.key}
                    type="button"
                    role="tab"
                    aria-selected={view === entry.key}
                    className={view === entry.key ? "is-active" : undefined}
                    tabIndex={resolveTabBarTabIndex({ tabs: VIEW_TABS, activeId: view, tab: entry })}
                    onClick={() => setView(entry.key)}
                  >
                    {t(entry.label)}
                  </button>
                ))}
              </div>
              {publishState !== null ? (
                <ThemeExplorePublishToggle
                  state={publishState}
                  publishing={publishing}
                  setPagePublished={setPagePublished}
                  fileLabel={selectedFileLabel(selectedFile)}
                  t={t}
                />
              ) : null}
            </div>
            <div className="theme-explore-toolbar-actions">
              <ThemeExploreToolbarActions
                view={view}
                previewMode={previewMode}
                wrap={wrap}
                toggleWrap={toggleWrap}
                controls={{ device, setDevice, previewSrc, fullscreenTriggerRef, setFullscreen }}
                t={t}
              />
            </div>
          </div>

          <ThemeExploreMainPane
            view={view}
            previewMode={previewMode}
            wrap={wrap}
            previewSrc={previewSrc}
            previewWidth={previewWidth}
            selectedFile={selectedFile}
            source={source}
            sourceLoaded={sourceLoaded}
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
        agentHandle="theme-explore-reset-file"
        title={t("Reset this file to the original?")}
        body={<ResetFileWarningBody selected={selected} t={t} />}
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
        agentHandle="theme-explore-rename-page"
        title={t("Rename this page?")}
        body={<PageRenameWarningBody pageRenameWarning={pageRenameWarning} t={t} />}
        confirmLabel={t("Rename page")}
        tone="warning"
        pending={renaming}
        onConfirm={() => void confirmPageRename()}
        onCancel={cancelPageRenameWarning}
      />

      {/* Delete (2026-08-29 owner ask). `destructive`, same as Reset above — unlike Rename or Copy,
          a delete has no undo of any kind once it succeeds (this repo keeps no theme-file revision
          history), so every eligible file gets this pause unconditionally, not only the ones with a
          side effect elsewhere (compare Rename's page-URL warning, which only fires for pages). Names
          the exact file rather than "this file", same reasoning as Reset's own dialog. */}
      <ConfirmDialog
        open={deleteTarget !== null}
        agentHandle="theme-explore-delete-file"
        title={t("Delete this file?")}
        body={<DeleteFileWarningBody deleteTarget={deleteTarget} t={t} />}
        confirmLabel={t("Delete file")}
        destructive
        pending={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={closeDeleteConfirm}
      />
    </div>
  );
}

/**
 * Renders the live theme-explore iframe at a fixed device width and scales the whole thing down to
 * fit the docked pane — the shared `DevicePreviewFrame` `PageEditor.tsx`'s `PagePreview` also uses (its
 * `.page-preview-frame`/`.page-preview-scaler`/`.page-preview-iframe` classes rather than a parallel
 * set), adapted for a real `src` URL instead of `SrcDocSandbox`'s `srcDoc` — see this file's header
 * comment for why the preview has to be a real URL at all.
 */
function ThemeExplorePreview({ src, width, title }: { src: string; width: number; title: string }) {
  // The frame's REAL rendered width, not a guessed constant — see `usePreviewPaneWidth`'s own doc.
  const { frameRef, paneWidth } = usePreviewPaneWidth();

  return (
    <DevicePreviewFrame width={width} frameRef={frameRef} paneWidth={paneWidth}>
      {/* `key={src}` forces a remount on every durable theme revision or file/device
          change — an iframe does not reliably refetch when only its `src` attribute changes. */}
      <iframe key={src} className="page-preview-iframe" title={title} src={src} sandbox="allow-scripts" />
    </DevicePreviewFrame>
  );
}

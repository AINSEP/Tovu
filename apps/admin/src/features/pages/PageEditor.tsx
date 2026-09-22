import type { RefObject } from "react";
import { ConfirmDialog, InteractiveHtmlEditor } from "@jini-ai/admin/react";
import { agentHandle } from "@jini-ai/agentic";

import { resolveTabBarTabIndex, useTabBarKeyboard } from "../../components/TabBar.hooks";
import type { Translate } from "../../lib/dictionary-translator";
import { siteUrl } from "../../lib/site-url";
import type {
  StandingDraftAutosaveSnapshot,
  StandingDraftStaleBasis,
} from "../../hooks/use-standing-draft-autosave.hooks";
import {
  PAGE_PREVIEW_WIDTHS,
  useWiredPageEditor,
  type PagePreviewDevice,
  type PageEditorView,
} from "./hooks/use-page-editor.hooks";
import type { ThemeCanvasStylingState } from "./hooks/use-theme-canvas-styling.hooks";
import {
  isAutosaveDraftStale,
  PAGE_EXTERNAL_CHANGE_MESSAGE,
  pageAutosaveBannerMessage,
  pageAutosaveStaleBasisMessage,
  pageEditorSurface,
  pageLivePreviewPath,
  pagePublicPath,
  pageVersionConflictMessage,
  type PageSaveConflict,
} from "./rules";

/**
 * @file The Pages editor — markup only. State lives in `hooks/use-page-editor.hooks.ts`.
 *
 * **There is no Tiptap here, and there never will be.** A Page is a bespoke HTML document; the
 * editing surfaces are the rendered preview, the raw HTML behind it, and — the "Interactive" tab —
 * a GrapesJS-backed visual surface for clicking into rendered text and editing it in place
 * (`@jini-ai/admin/react`'s `InteractiveHtmlEditor`). GrapesJS does not contradict the "no Tiptap"
 * invariant: it edits and exports raw HTML directly, `html`/`setHtml` above stay the single source
 * of truth, and there is no parallel structured-document format the way Tiptap's `bodyJson` would
 * be — text editing and basic formatting only this pass, not Gutenberg-style block manipulation.
 * Posts keep Tiptap in `features/posts/PostEditor.tsx`, which this screen replaces for `kind:
 * "page"` entries — that screen was previously reached for Pages too, differing only by a
 * `kindLabel === "page"` ternary on its heading while still mounting the Tiptap toolbar over a
 * document Tiptap would silently mangle.
 *
 * The chat that drives generation is NOT in this component. It is the workspace assistant dock,
 * which `App.tsx` renders outside the route switch and ADR-049 pins to never unmount — so it is the
 * same conversation whether the operator is on the Pages list or in here, and an agent can navigate
 * between them mid-turn without losing the thread. Building a second chat pane into this screen
 * would fork that conversation for no gain.
 */
export interface PageEditorProps {
  /** The page's slug, as it appears in the URL. Also accepts a legacy id — see `usePageEditor`. */
  slug: string;
  /** DI seam for tests — same convention as `Pages.tsx`'s `usePagesHook`. */
  usePageEditorHook?: typeof useWiredPageEditor;
}

const DEVICES: ReadonlyArray<{ key: PagePreviewDevice; label: string }> = [
  { key: "desktop", label: "Desktop" },
  { key: "tablet", label: "Tablet" },
  { key: "mobile", label: "Mobile" },
];

const VIEWS: ReadonlyArray<{ key: PageEditorView; label: string }> = [
  { key: "html", label: "HTML" },
  { key: "interactive", label: "Interactive" },
  { key: "preview", label: "Preview" },
];

/** {@link VIEWS} carrying the `id` that `TabBar.hooks.tsx`'s WAI-ARIA tabs helpers key on, so this
 *  hand-rolled `role="tablist"` row gets the same arrow/Home/End keys and roving tab stop `TabBar`
 *  has (a35ce9f12) without becoming a `<TabBar>`: the `.segmented` pill row is a different visual
 *  control, only the keyboard contract is shared. Spread, not rebuilt, so nothing in the JSX below
 *  has to change which field it reads. */
const VIEW_TABS = VIEWS.map((entry) => ({ ...entry, id: entry.key }));

/**
 * The editor header — the back link on the left and the kicker/title/description block, and since
 * the 2026-09-06 layout experiment nothing else: the save status, status select and the
 * publish/save/delete buttons moved out to `PageEditorActions` below the toolbar.
 *
 * That move took this component's branching with it, so the extraction note this doc used to carry
 * now belongs to `PageEditorActions` instead — see there. What is left here is inert markup plus
 * the one unsaved-work guard on the back link, which is why `confirmLeave` is the only prop that
 * stayed.
 *
 * `confirmLeave` (2026-09-06, standing-draft autosave dispatch) replaces what used to be an inline
 * `dirty && !window.confirm(...)` check written directly in this component — the exact
 * logic-in-`.tsx` pattern this codebase's own convention keeps correcting (see
 * `use-post-editor.hooks.ts`'s own `useDirtyGuard` wiring, which `PostEditorHeader` already
 * consumed this same way). The comparison and the `window.confirm` call both now live in
 * `use-dirty-guard.hooks.ts`, tested once there rather than re-verified per screen.
 */
function PageEditorHeader({ confirmLeave, t }: { confirmLeave: () => boolean; t: Translate }) {
  return (
    // `page-header-split` (a modifier on the shared `.page-header`, `styles.css`) is the
    // 2026-09-06 layout experiment: back link alone at the far left, title block centred, and the
    // header's right rail deliberately left EMPTY now that the actions live below the toolbar —
    // see that modifier's own comment for why the empty rail has to stay reserved.
    <div
      className="page-header page-header-split"
      {...agentHandle("page-header", {
        role: "region",
        label:
          "Editor header — the back link and the page's title. Save, Delete and the " +
          "Draft/Published field are NOT here: they are in the action row below the toolbar.",
      })}
    >
      {/* Left rail — the back link on its own, ahead of the title in DOM order as well as
          visually, so tab order and the reading order match what is on screen. */}
      <div className="page-header-lead">
        {/* Guards an in-app navigation away from unsaved work — the same protection the agent's
            own navigation gate is meant to apply, applied here to a human click. */}
        <a
          className="btn-secondary"
          href="/admin/pages"
          onClick={(e) => {
            if (!confirmLeave()) e.preventDefault();
          }}
          {...agentHandle("page-back-to-list", { role: "link", label: "Back to the list of all pages" })}
        >
          ← {t("Pages")}
        </a>
      </div>
      <div className="page-header-text">
        <p className="page-kicker">{t("Content")}</p>
        <h1 className="page-title">{t("Edit page")}</h1>
        <p className="page-description">
          {t("Ask the assistant to build this page, or edit the HTML directly.")}
        </p>
      </div>
    </div>
  );
}

/**
 * The status select, save feedback and the publish/save/delete buttons — their own row, below the
 * view/device toolbar rather than in the header (owner request, 2026-09-06: "put the published save
 * and delete buttons under the gray desktop/tablet/mobile row").
 *
 * This is where `PageEditorHeader`'s branching went when the controls moved: the message/error
 * spans, the publish button's conditional render, the save button's className, and its
 * "Saving…"/"Save •"/"Save" label are five independent decisions, and as a top-level function they
 * are scored in their own scope instead of accumulating onto `PageEditor`'s or the header's.
 *
 * `.editor-action-row` (`styles.css`) is shared with `features/posts/PostEditor.tsx`'s own
 * `PostEditorActions`; the two components are NOT merged, because that one's copy runs through `t`
 * and this screen's doesn't (2026-09-06: both now carry `agentHandle` tags — only the i18n split
 * remains as the reason not to merge them).
 */
function PageEditorActions({
  dirty,
  message,
  error,
  status,
  setStatus,
  saving,
  onPublish,
  onSave,
  onDeleteClick,
  t,
}: {
  dirty: boolean;
  message: string | null;
  error: string | null;
  status: "draft" | "published";
  setStatus: (value: "draft" | "published") => void;
  saving: boolean;
  onPublish: () => void;
  onSave: () => void;
  onDeleteClick: () => void;
  t: Translate;
}) {
  return (
    <div
      className="editor-action-row"
      {...agentHandle("page-actions", {
        role: "region",
        label: "Save status, the Draft/Published field, and the Publish, Save and Delete buttons",
      })}
    >
      {message ? <span className="save-ok">{message}</span> : null}
      {error ? <span className="save-error">{error}</span> : null}
      <select
        value={status}
        onChange={(e) => setStatus(e.target.value as "draft" | "published")}
        {...agentHandle("page-status", {
          role: "field",
          label:
            "Whether this page is a draft or published — set with page.select_option, not click. " +
            "Setting to Draft unpublishes it (content is kept, just hidden from the site); this is " +
            "NOT the same as Delete, which moves the whole entry to the trash.",
        })}
      >
        <option value="draft">{t("Draft")}</option>
        <option value="published">{t("Published")}</option>
      </select>
      {status === "draft" ? (
        <button
          type="button"
          onClick={onPublish}
          disabled={saving}
          {...agentHandle("page-publish", {
            role: "button",
            label:
              "Publish this page immediately — saves the current title, slug and body and sets " +
              "status to Published in one action. Only shown while the page is a draft; once " +
              "published, use Save for further edits.",
          })}
        >
          {t("Publish")}
        </button>
      ) : null}
      <button
        type="button"
        className={status === "draft" ? "btn-secondary" : undefined}
        onClick={onSave}
        disabled={saving}
        {...agentHandle("page-save", { role: "button", label: "Save this page's title, slug, status and body" })}
      >
        {saving ? t("Saving…") : dirty ? `${t("Save")} •` : t("Save")}
      </button>
      <button
        type="button"
        className="btn-danger"
        onClick={onDeleteClick}
        {...agentHandle("page-delete", {
          role: "button",
          label:
            "Move this page to the trash — different from unpublishing (the Draft/Published field " +
            "beside it): the entry disappears from every list and the site. Asks for confirmation " +
            "before deleting.",
        })}
      >
        {t("Delete")}
      </button>
    </div>
  );
}

/**
 * Standing-draft autosave (2026-09-06) — the "restore or discard" recovery banner. Never rendered
 * unless `usePageEditor` found a parked draft on mount (`recoverableDraft`); never applies it on its
 * own — both buttons require an explicit click, per the owner's own worry about silently clobbering
 * a different tab/operator's work. `pageAutosaveBannerMessage`/`isAutosaveDraftStale` (`rules.ts`)
 * own the actual wording decision so this component stays markup only.
 */
function PageAutosaveRecoveryBanner({
  recoverableDraft,
  currentVersion,
  onRestore,
  onDiscard,
  t,
}: {
  recoverableDraft: StandingDraftAutosaveSnapshot;
  currentVersion: number;
  onRestore: () => void;
  onDiscard: () => void;
  t: Translate;
}) {
  const stale = isAutosaveDraftStale(recoverableDraft.baseVersion, currentVersion);
  return (
    <div
      className="notice warning"
      {...agentHandle("page-autosave-recovery", {
        role: "region",
        label: "An unsaved draft from a previous session was found — restore it or discard it",
      })}
    >
      <p>{pageAutosaveBannerMessage(recoverableDraft.savedAt, Date.now(), stale)}</p>
      <button
        type="button"
        className="btn-secondary"
        onClick={onRestore}
        {...agentHandle("page-autosave-restore", { role: "button", label: "Apply the recovered draft into the editor" })}
      >
        {t("Restore")}
      </button>
      <button
        type="button"
        className="btn-secondary"
        onClick={onDiscard}
        {...agentHandle("page-autosave-discard", { role: "button", label: "Discard the recovered draft without applying it" })}
      >
        {t("Discard")}
      </button>
    </div>
  );
}

/**
 * The VERSION-CONFLICT banner (2026-09-07) — an EXPLICIT Save/Publish the server rejected, with a
 * way past it. Mirrors `features/posts/PostEditor.tsx`'s `PostVersionConflictBanner`.
 *
 * Distinct from `PageAutosaveStaleBanner` below, which reports the same collision hitting the
 * BACKGROUND autosave: that one is a state the operator never asked for and gets no buttons, this
 * one is a button they pressed and watched fail, so it owes them an answer. `pageVersionConflict
 * Message` (`rules.ts`) owns the wording so this component stays markup only.
 *
 * "Save anyway" is the only way past the conflict, and that is on purpose: the plain Save button
 * keeps failing until the operator explicitly chooses to replace the other version. Copy is
 * hardcoded English, matching every other string in this file — `PageEditor.tsx` is out of the
 * pages dictionary's declared scope (see `pages-i18n.ts`'s own header).
 */
function PageVersionConflictBanner({
  saveConflict,
  onSaveAnyway,
  onDismiss,
  t,
}: {
  saveConflict: PageSaveConflict;
  onSaveAnyway: () => void;
  onDismiss: () => void;
  t: Translate;
}) {
  return (
    <div
      className="notice error"
      {...agentHandle("page-version-conflict", {
        role: "region",
        label: "Another operator saved this while you were editing — your changes are unsaved and still in the editor",
      })}
    >
      <p>{pageVersionConflictMessage(saveConflict)}</p>
      <button
        type="button"
        className="btn-secondary"
        onClick={onSaveAnyway}
        {...agentHandle("page-version-conflict-overwrite", {
          role: "button",
          label: "Save these changes anyway, replacing the version the other operator saved",
        })}
      >
        {t("Save anyway")}
      </button>
      <button
        type="button"
        className="btn-secondary"
        onClick={onDismiss}
        {...agentHandle("page-version-conflict-dismiss", {
          role: "button",
          label: "Hide this notice and keep editing without saving",
        })}
      >
        {t("Keep editing")}
      </button>
    </div>
  );
}

/**
 * Standing-draft autosave — the STALE-BASIS notice (2026-09-06). The counterpart to
 * `PageAutosaveRecoveryBanner` above and not a duplicate of it: that banner offers work found parked
 * from a PREVIOUS session, this reports that background autosaving has STOPPED for the session
 * happening right now, because another operator's save moved this page's version out from under this
 * tab. Until then the operator had no way to know — the editor looked completely normal while every
 * write it made was being thrown away. `pageAutosaveStaleBasisMessage` (`rules.ts`) owns the wording
 * so this component stays markup only, the same split the recovery banner already uses.
 *
 * NO buttons, deliberately, and this is the one design decision here worth defending:
 * - A "Dismiss" would let the operator silence a warning that is still true, putting them straight
 *   back into the silent data loss this whole path exists to end. The notice clears by itself when
 *   autosaving actually resumes (`usePageEditor`'s `autosaveStaleBasis` goes null once a write is
 *   accepted on a fresh basis) and at no other time, so it can never be lying while it is on screen.
 * - A "Reload" would wipe the operator's typed text out of the editor on their behalf. Their only
 *   remaining copy would then be the shared hook's best-effort browser-storage mirror, which is not
 *   a guarantee this component can make on their behalf (`localStorage` throws outright in some
 *   privacy modes). The message tells them to copy their work first and leaves the choice with them.
 */
function PageAutosaveStaleBanner({ staleBasis }: { staleBasis: StandingDraftStaleBasis }) {
  return (
    <div
      className="notice warning"
      {...agentHandle("page-autosave-stale", {
        role: "region",
        label:
          "Another operator saved this page while you were editing — autosaving has stopped, and your " +
          "unsaved changes are still here in the editor",
      })}
    >
      <p>{pageAutosaveStaleBasisMessage(staleBasis)}</p>
    </div>
  );
}

/**
 * The EXTERNAL-CHANGE notice (2026-09-16) — an assistant tool wrote a newer version of this page
 * while the editor had unsaved edits. A CLEAN editor applies the newer version silently instead (see
 * `use-external-entry-refresh.hooks.ts`); this banner exists only for the case a silent apply could
 * clobber unsaved work — which, on the Interactive tab, is always assumed, because canvas typing can
 * be invisible to `dirty` (see `pageRefreshMayHaveUnsavedEdits`, `rules.ts`).
 *
 * Distinct from `PageVersionConflictBanner` above: that one is a Save the operator pressed and
 * watched fail; this one is a background check that found the row moved before they ever pressed
 * Save. "Load latest" mirrors that banner's "Save anyway" in shape (an explicit, named action) but
 * opposite in effect — it discards the operator's edits rather than the other write.
 */
function PageExternalChangeBanner({ onLoadLatest, onKeepEdits, t }: { onLoadLatest: () => void; onKeepEdits: () => void; t: Translate }) {
  return (
    <div
      className="notice warning"
      {...agentHandle("page-external-change", {
        role: "region",
        label: "This page was changed outside the editor, probably by the assistant — load the latest version or keep your unsaved edits",
      })}
    >
      <p>{PAGE_EXTERNAL_CHANGE_MESSAGE}</p>
      <button
        type="button"
        className="btn-secondary"
        onClick={onLoadLatest}
        {...agentHandle("page-external-change-load-latest", {
          role: "button",
          label: "Load latest version, discarding my unsaved edits",
        })}
      >
        {t("Load latest")}
      </button>
      <button
        type="button"
        className="btn-secondary"
        onClick={onKeepEdits}
        {...agentHandle("page-external-change-keep-edits", {
          role: "button",
          label: "Keep my edits and ignore the outside change",
        })}
      >
        {t("Keep my edits")}
      </button>
    </div>
  );
}

/**
 * The four "something happened to your work" notices, grouped into one component so their four
 * independent render decisions are scored in this scope instead of accumulating onto `PageEditor`'s
 * own complexity — same extraction `features/posts/PostEditor.tsx`'s `PostEditorNotices` already
 * makes, added there for the identical reason (recovery/stale-basis/conflict already put that
 * component over the ceiling; a fourth notice here would do the same to this one).
 *
 * Order: recovery (work from a previous session) first, then the stale-basis notice (a condition
 * still true right now), then the rejected save (the most recent thing the operator personally did),
 * then the external-change notice last (the newest kind, and the only one whose trigger — an
 * assistant write — has nothing to do with what the operator themselves just did). All four can be
 * true at once; none is suppressed in favor of another.
 */
function PageEditorNotices({
  recoverableDraft,
  currentVersion,
  onRestore,
  onDiscard,
  autosaveStaleBasis,
  saveConflict,
  onSaveAnyway,
  onDismissConflict,
  pendingExternalVersion,
  onLoadExternalChange,
  onDismissExternalChange,
  t,
}: {
  recoverableDraft: StandingDraftAutosaveSnapshot | null;
  currentVersion: number;
  onRestore: () => void;
  onDiscard: () => void;
  autosaveStaleBasis: StandingDraftStaleBasis | null;
  saveConflict: PageSaveConflict | null;
  onSaveAnyway: () => void;
  onDismissConflict: () => void;
  pendingExternalVersion: number | null;
  onLoadExternalChange: () => void;
  onDismissExternalChange: () => void;
  t: Translate;
}) {
  return (
    <>
      {recoverableDraft ? (
        <PageAutosaveRecoveryBanner
          recoverableDraft={recoverableDraft}
          currentVersion={currentVersion}
          onRestore={onRestore}
          onDiscard={onDiscard}
          t={t}
        />
      ) : null}
      {autosaveStaleBasis ? <PageAutosaveStaleBanner staleBasis={autosaveStaleBasis} /> : null}
      {saveConflict ? (
        <PageVersionConflictBanner saveConflict={saveConflict} onSaveAnyway={onSaveAnyway} onDismiss={onDismissConflict} t={t} />
      ) : null}
      {pendingExternalVersion !== null ? (
        <PageExternalChangeBanner onLoadLatest={onLoadExternalChange} onKeepEdits={onDismissExternalChange} t={t} />
      ) : null}
    </>
  );
}

/**
 * The toolbar's right-hand group — the device-width control (preview view only) and the template
 * picker. Extracted out of `PageEditor` for the same reason `PageEditorHeader` above was: this is
 * where nearly all of the remaining branching in that component's render lived (the preview-only
 * visibility check, the html-format check, and the has-templates check nested inside it), and as a
 * top-level function its branches are scored in their own scope instead of accumulating onto
 * `PageEditor`'s.
 *
 * Device-width control and template picker share this one row (owner feedback, 2026-08-11: "move the
 * UI for the template dropdown where the desktop tablet mobile is right now ... so it's all one row"
 * — the picker's own standalone row above is gone). `.page-editor-toolbar-end` is a plain grouping
 * wrapper (`pages.css`) so `.page-editor-toolbar`'s existing `justify-content: space-between` still
 * only has to place two things: the view tabs on the left, this group on the right.
 *
 * The template picker mirrors `PostEditor.tsx`'s own `.editor-template-picker` markup/classes
 * verbatim. Rendered only for an `"html"`-format Page: a `"doc"`-format Page (pre-conversion legacy
 * row) has no render path that would honor a template choice yet (`isEligibleForTemplateBranch`
 * requires `bodyFormat: "html"`), so showing the picker on one would let an operator set a value with
 * no visible effect.
 *
 * UNLIKE the Post picker, the selected value is NOT defaulted to the theme's first template when
 * unset — see `use-page-editor.hooks.ts`'s load effect and `isEligibleForTemplateBranch`'s doc for the
 * full reasoning: "no template chosen" is a Page's normal, fully-working state (render its own body),
 * not an absence-of-decision needing a UI default to stay honest.
 */
function PageEditorToolbarEnd({
  view,
  device,
  setDevice,
  bodyFormat,
  availableTemplates,
  templateChoice,
  setTemplateChoice,
  t,
}: {
  view: PageEditorView;
  device: PagePreviewDevice;
  setDevice: (value: PagePreviewDevice) => void;
  bodyFormat: "doc" | "html" | undefined;
  availableTemplates: string[];
  templateChoice: string | null;
  setTemplateChoice: (value: string) => void;
  t: Translate;
}) {
  return (
    <div className="page-editor-toolbar-end">
      {view === "preview" ? (
        <div className="segmented" role="group" aria-label={t("Preview width")}>
          {DEVICES.map((entry) => (
            <button
              key={entry.key}
              type="button"
              aria-pressed={device === entry.key}
              className={device === entry.key ? "is-active" : undefined}
              onClick={() => setDevice(entry.key)}
              {...agentHandle(`page-preview-width-${entry.key}`, { role: "button", label: `Preview at ${entry.label} width` })}
            >
              {entry.label}
            </button>
          ))}
          <span className="page-editor-width">{PAGE_PREVIEW_WIDTHS[device]}px</span>
        </div>
      ) : null}
      {bodyFormat === "html" ? (
        <div className="editor-template-picker">
          <label className="a11y-label-wrap">
            <span className="visually-hidden">{t("Template")}</span>
          </label>
          {availableTemplates.length > 0 ? (
            <select
              value={templateChoice ?? ""}
              // `e.target.value`, not `|| null` — `""` is a legitimate stored value here (though,
              // unlike Posts, it behaves identically to `null` at render time — see
              // `isEligibleForTemplateBranch`'s doc).
              onChange={(e) => setTemplateChoice(e.target.value)}
              {...agentHandle("page-template-choice", {
                role: "field",
                label: "Which theme page template this page renders through on the public site.",
              })}
            >
              {availableTemplates.map((template) => (
                <option key={template} value={template}>
                  {template}
                </option>
              ))}
              <option value="">{t("No template chosen")}</option>
            </select>
          ) : (
            <select
              disabled
              value=""
              {...agentHandle("page-template-choice", {
                role: "field",
                label: "The active theme declares no page templates, so there is nothing to choose here.",
              })}
            >
              <option value="">{t("No templates for this theme")}</option>
            </select>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function PageEditor({ slug: routeSlug, usePageEditorHook = useWiredPageEditor }: PageEditorProps) {
  const {
    page,
    error,
    message,
    title,
    setTitle,
    slug,
    setSlug,
    status,
    setStatus,
    templateChoice,
    setTemplateChoice,
    availableTemplates,
    html,
    setHtml,
    draftHtml,
    setDraftHtml,
    htmlTextareaRef,
    onHtmlScroll,
    onPreviewFrameLoad,
    view,
    setView,
    device,
    setDevice,
    previewExpanded,
    togglePreviewExpanded,
    frameRef,
    paneWidth,
    saving,
    dirty,
    contentDirty,
    templatePreviewUrl,
    previewFormRef,
    previewFormTarget,
    canvasStyling,
    save,
    saveConflict,
    saveOverwritingConflict,
    dismissSaveConflict,
    remove,
    confirmingDelete,
    setConfirmingDelete,
    deleting,
    confirmLeave,
    recoverableDraft,
    restoreRecoveredDraft,
    discardRecoveredDraft,
    autosaveStaleBasis,
    pendingExternalVersion,
    loadExternalChange,
    dismissExternalChange,
    contentRevision,
    t,
  } = usePageEditorHook(routeSlug);
  // Above the early returns below: `use*` has to be called unconditionally for the rules-of-hooks
  // lint even though this one holds no state of its own.
  const { onKeyDown: onViewTabsKeyDown } = useTabBarKeyboard(VIEW_TABS, view, (id) => setView(id as PageEditorView));

  if (error && !page) return <div className="notice error">{error}</div>;
  if (!page) return <div className="notice">{t("Loading editor…")}</div>;

  return (
    <div className="page">
      <PageEditorHeader confirmLeave={confirmLeave} t={t} />

      <PageEditorNotices
        recoverableDraft={recoverableDraft}
        currentVersion={page.version}
        onRestore={restoreRecoveredDraft}
        onDiscard={discardRecoveredDraft}
        autosaveStaleBasis={autosaveStaleBasis}
        saveConflict={saveConflict}
        onSaveAnyway={() => void saveOverwritingConflict()}
        onDismissConflict={dismissSaveConflict}
        pendingExternalVersion={pendingExternalVersion}
        onLoadExternalChange={() => void loadExternalChange()}
        onDismissExternalChange={dismissExternalChange}
        t={t}
      />

      {/* `editor-title`/`editor-slug` are the existing editor chrome from `styles/editor.css`,
          reused verbatim so a Page's header looks and behaves exactly like the screen it replaces.
          The chrome was never the problem — the Tiptap body under it was.

          Owner feedback (2026-08-11): "Cap the title input at half the page and then put the
          hacker news slug and view. Right justify it as the other half of that line of the
          title." — title and slug now share one row instead of stacking on two. `.page-title-row`
          is a new, Pages-only wrapper class (`styles/pages.css`, scoped as `.page-title-row
          .editor-title` — see that rule's own comment for why the width cap has to target the
          input directly rather than a class on this `display: contents` label) that constrains
          widths without changing `.editor-title`/`.editor-slug` themselves, so `PostEditor.tsx`'s
          own full-width title row is unaffected. */}
      <div className="page-title-row">
        <label className="a11y-label-wrap">
          <span className="visually-hidden">{t("Page title")}</span>
          <input
            className="editor-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("Untitled")}
            {...agentHandle("page-title", { role: "field", label: "This page's title" })}
          />
        </label>

        <div className="editor-slug">
          <span>/</span>
          <label className="a11y-label-wrap">
            <span className="visually-hidden">{t("URL slug")}</span>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              {...agentHandle("page-slug", { role: "field", label: "URL slug this page is published at" })}
            />
          </label>
          <a
            href={siteUrl(pagePublicPath(slug))}
            target="_blank"
            rel="noreferrer"
            {...agentHandle("page-view-live", { role: "link", label: "Open this page on the public site in a new tab" })}
          >
            {t("view ↗")}
          </a>
        </div>
      </div>

      <div className="page-editor-toolbar">
        <div className="segmented" role="tablist" aria-label={t("Editor view")} onKeyDown={onViewTabsKeyDown}>
          {VIEW_TABS.map((entry) => (
            <button
              key={entry.key}
              type="button"
              role="tab"
              aria-selected={view === entry.key}
              className={view === entry.key ? "is-active" : undefined}
              tabIndex={resolveTabBarTabIndex(VIEW_TABS, view, entry)}
              onClick={() => setView(entry.key)}
              {...agentHandle(`page-view-${entry.key}`, { role: "button", label: `Switch to the ${entry.label} view` })}
            >
              {entry.label}
            </button>
          ))}
        </div>
        {/* Device-width control and template picker share the toolbar's right-hand side — see
            `PageEditorToolbarEnd`'s own doc for the layout history and the template-picker's rules. */}
        <PageEditorToolbarEnd
          view={view}
          device={device}
          setDevice={setDevice}
          bodyFormat={page.bodyFormat}
          availableTemplates={availableTemplates}
          templateChoice={templateChoice}
          setTemplateChoice={setTemplateChoice}
          t={t}
        />
      </div>

      {/* Directly under the toolbar, not in the header — see `PageEditorActions`' own doc. */}
      <PageEditorActions
        dirty={dirty}
        message={message}
        error={error}
        status={status}
        setStatus={setStatus}
        saving={saving}
        onPublish={() => save("published")}
        onSave={() => save()}
        onDeleteClick={() => setConfirmingDelete(true)}
        t={t}
      />

      <PageEditorPane
        view={view}
        canvasStyling={canvasStyling}
        html={html}
        setHtml={setHtml}
        draftHtml={draftHtml}
        setDraftHtml={setDraftHtml}
        htmlTextareaRef={htmlTextareaRef}
        onHtmlScroll={onHtmlScroll}
        onPreviewFrameLoad={onPreviewFrameLoad}
        device={device}
        slug={slug}
        version={page.version}
        contentRevision={contentRevision}
        status={status}
        dirty={dirty}
        contentDirty={contentDirty}
        templatePreviewUrl={templatePreviewUrl}
        previewFormRef={previewFormRef}
        previewFormTarget={previewFormTarget}
        frameRef={frameRef}
        paneWidth={paneWidth}
        previewExpanded={previewExpanded}
        onTogglePreviewExpanded={togglePreviewExpanded}
        t={t}
      />

      <ConfirmDialog
        open={confirmingDelete}
        agentHandle="page-delete-confirm"
        title={t("Move to trash?")}
        body={<p>{t("Move")} &quot;{title}&quot; {t("to trash? It will disappear from the site and from this list.")}</p>}
        confirmLabel={t("Move to trash")}
        destructive
        pending={deleting}
        onConfirm={remove}
        onCancel={() => setConfirmingDelete(false)}
      />
    </div>
  );
}

/**
 * The editor's main pane — one of four surfaces, chosen by {@link pageEditorSurface}.
 *
 * Extracted from `PageEditor` in the 2026-09-06 complexity-ceiling pass. This was a chain of nested
 * ternaries inline in that component's JSX, worth 6 of its 10 cognitive-complexity points against a
 * ceiling of 9 (plus two `sonarjs/no-nested-conditional` warnings). The DECISION did not move here —
 * it moved to `rules.ts`, where it is pure and directly testable, per this feature's own "everything
 * that computes a value rather than rendering one" rule; what is left below is markup dispatch and
 * nothing else, one early return per surface, scored in its own scope.
 *
 * The Interactive tab remounts with fresh `html` on every tab switch — see `InteractiveHtmlEditor`'s
 * own file header for why it reads `html` once at mount rather than reacting to later prop changes.
 * `canvasStyling` is read once at mount for that same reason, which is why `interactive-pending` is
 * its own surface rather than a skipped loading flash: mounting an unstyled canvas could never pick
 * the theme up afterwards. The wait is normally invisible — `preview` is this screen's default tab,
 * so the theme's token files have already loaded by the time anyone clicks Interactive.
 */
function PageEditorPane({
  view,
  canvasStyling,
  html,
  setHtml,
  draftHtml,
  setDraftHtml,
  htmlTextareaRef,
  onHtmlScroll,
  onPreviewFrameLoad,
  device,
  slug,
  version,
  contentRevision,
  status,
  dirty,
  contentDirty,
  templatePreviewUrl,
  previewFormRef,
  previewFormTarget,
  frameRef,
  paneWidth,
  previewExpanded,
  onTogglePreviewExpanded,
  t,
}: {
  view: PageEditorView;
  canvasStyling: ThemeCanvasStylingState;
  html: string;
  setHtml: (value: string) => void;
  draftHtml: string;
  setDraftHtml: (value: string) => void;
  /** Per-tab scroll memory — see `PageEditorController.htmlTextareaRef`'s own doc. */
  htmlTextareaRef: (node: HTMLTextAreaElement | null) => void;
  onHtmlScroll: (scrollTop: number) => void;
  /** Per-tab scroll memory, Preview half — see `PageEditorController.onPreviewFrameLoad`'s own doc.
   *  Threaded straight through to `PagePreview` below; this dispatcher does not call it itself. */
  onPreviewFrameLoad: (iframe: HTMLIFrameElement) => void;
  device: PagePreviewDevice;
  slug: string;
  /** The loaded row's current version — see `PagePreviewFrame`'s own doc for why the live-site src
   *  is cache-busted with it. */
  version: number;
  /** Content refresh (2026-09-16) — `usePageEditor`'s `contentRevision`, keyed onto the Interactive
   *  surface below so an assistant write the operator loads (Load latest, while on this tab) remounts
   *  GrapesJS with the new body, the same way switching tabs already does. */
  contentRevision: number;
  status: "draft" | "published";
  dirty: boolean;
  contentDirty: boolean;
  templatePreviewUrl: string;
  previewFormRef: RefObject<HTMLFormElement | null>;
  previewFormTarget: string;
  frameRef: (node: HTMLDivElement | null) => void;
  paneWidth: number;
  /** Preview fullscreen (2026-09-16) — `usePageEditor`'s `previewExpanded` / `togglePreviewExpanded`.
   *  Only the `preview` surface below reads them: the fab is part of the preview, not of this
   *  dispatcher, so switching to HTML/Interactive takes it out of the DOM entirely (and the hook's
   *  own effect collapses the state at the same time). */
  previewExpanded: boolean;
  onTogglePreviewExpanded: () => void;
  t: Translate;
}) {
  const surface = pageEditorSurface(view, canvasStyling);
  if (surface.kind === "preview") {
    return (
      <PagePreview
        html={html}
        width={PAGE_PREVIEW_WIDTHS[device]}
        slug={slug}
        version={version}
        status={status}
        dirty={dirty}
        contentDirty={contentDirty}
        templatePreviewUrl={templatePreviewUrl}
        previewFormRef={previewFormRef}
        previewFormTarget={previewFormTarget}
        frameRef={frameRef}
        paneWidth={paneWidth}
        expanded={previewExpanded}
        onToggleExpanded={onTogglePreviewExpanded}
        onFrameLoad={onPreviewFrameLoad}
        t={t}
      />
    );
  }
  if (surface.kind === "html") {
    return (
      <textarea
        ref={htmlTextareaRef}
        className="page-html-source"
        value={draftHtml}
        onChange={(e) => {
          // Raw pass-through, same as before this tab had any formatting — an edit made on top of
          // the pretty-printed baseline becomes the new working copy verbatim, not reformatted
          // again mid-keystroke (which would fight the operator's cursor position).
          setDraftHtml(e.target.value);
          setHtml(e.target.value);
        }}
        onScroll={(e) => onHtmlScroll(e.currentTarget.scrollTop)}
        spellCheck={false}
        aria-label={t("Page HTML")}
        placeholder={t("This page has no HTML yet. Ask the assistant to build it, or write some here.")}
        {...agentHandle("page-html-source", { role: "field", label: "This page's raw HTML source" })}
      />
    );
  }
  if (surface.kind === "interactive-pending") {
    return <div className="notice">{t("Loading the theme's styles…")}</div>;
  }
  return <InteractiveHtmlEditor key={contentRevision} html={html} onChange={setHtml} canvasStyling={surface.styling} />;
}

/**
 * Renders the page at a fixed viewport width and scales the whole thing down to fit the pane.
 *
 * The scale is a CSS transform on a fixed-width box, not a responsive iframe, and that difference is
 * the entire point — see `PAGE_PREVIEW_WIDTHS`. The wrapper's height is scaled to match so the
 * transformed content does not leave a gap or overflow underneath it. Both branches below fill this
 * same scaled box identically (`.page-preview-iframe` sets `width/height: 100%` on either element),
 * so `3ac885e`'s live pane-width tracking and the toolbar-to-preview spacing are unaffected by which
 * branch renders.
 *
 * **What this shows, and why (2026-08-11 — the theme-CSS gap was diagnosed, not assumed a
 * regression)**: this component previously fed the page's raw stored body HTML into
 * `SrcDocSandbox` — a sandboxed `srcdoc` iframe with no template wrapper, no nav/footer, and no
 * theme stylesheet, regardless of the page's template choice. That was never wired to the real
 * render path; it cannot have regressed, because it never rendered themed. Rather than reimplement
 * that whole server-side render pipeline a second time in the admin (a second source of truth that
 * would drift from `src/server/routes/site/pages.ts`'s real one), it shares the real pipeline
 * instead of one, through two branches:
 *
 * 1. **Live site** (`status === "published" && !dirty`, i.e. nothing pending at all): iframes the
 *    real public URL (`siteUrl`) directly — the exact same response a visitor gets.
 * 2. **Template preview** (everything else — a draft, or a published page with a pending
 *    `templateChoice` and/or edited content): a hidden `<form method="post" target="{iframe name}">`
 *    POSTs the working-copy `html` into `templatePreviewUrl` (`usePageEditor`'s pre-built URL,
 *    `port.templatePreviewUrl`/`lib/api.ts`'s own `templatePreviewUrl` — the admin-only render
 *    through the SAME pipeline as branch 1: `renderViaTemplate`,
 *    `routes/admin/posts/template-preview.ts`, looked up by id instead of by public slug), landing
 *    the response inside a same-named `<iframe>`. `POST`, not the plain `GET` `<iframe src>` this
 *    branch used before 2026-09-09, because a `GET` can only carry `templateChoice` on the query
 *    string — it cannot hand the endpoint this page's own PENDING, possibly-unsaved `html`, which is
 *    exactly what a draft (or a published-but-dirty page) needs previewed. The debounced auto-submit
 *    effect (`usePageEditor`'s `schedulePendingHtmlPreviewSubmit`) fires this on template-choice
 *    change, body change, and switching into this tab — see that function's own doc for the "why a
 *    form submit, not `fetch`" reasoning, which mirrors `use-post-editor.hooks.ts`'s identical
 *    mechanism for Posts almost exactly (a `bodyHtml` field here where that one sends `bodyJson`).
 *
 *    Once a genuine per-id `bodyHtml` override existed server-side (`template-preview.ts`'s
 *    `pendingBodyHtml`, 2026-09-09 — see that file's own header), this branch no longer needs
 *    `status === "published"`: `findPublishedPostById`'s visibility guard on a draft's own
 *    `{"type":"content"}` slot is bypassed for exactly the one id this authenticated caller already
 *    fetched and authorized, the same way the PRE-EXISTING `bodyJson` override already did for a
 *    Post — see `resolveHtmlFormatContentMarkers`'s own doc for the full reasoning. That is what
 *    retired the THIRD branch this function used to have (a raw `SrcDocSandbox` fallback for a
 *    draft, or a published-and-dirty page): branch 2 is now simply "not the live site", so the two
 *    branches are exhaustive by construction and the fallback had become dead code, not merely rare
 *    — removed rather than left unreachable. This is also why only `canShowLiveSite` is computed
 *    below: its negation needs no name of its own. (`draftHtml`'s own textarea
 *    still exists on the HTML tab for hand-editing raw markup; nothing about that tab changed here.)
 *
 * The public URL and the template-preview endpoint are both cross-origin from the admin in dev
 * (`:5173` vs. `:3000`) — by design for branch 1 (it has to be the real site, not a re-hosted copy);
 * branch 2 goes through the SAME `/api` dev-proxy rule (`apps/admin/vite.config.ts`) every other
 * admin API call already uses, so the `tovu_session` cookie (`SameSite=Strict`) travels with it the
 * same way — see `template-preview.ts`'s own file header for why a real URL (not `srcDoc`) is
 * required for the theme's `/theme-assets/...` CSS to resolve at all. `<iframe src>`/a form's
 * `target` navigation does not require CORS (only script-driven cross-origin reads do), and this
 * codebase sets no `X-Frame-Options`/`frame-ancestors` anywhere that would block it (checked
 * `src/server/app.ts`). The cross-origin document's `contentDocument` is therefore unreachable from
 * here — nothing in this component depends on reaching into it.
 *
 * Preview fullscreen (2026-09-16). Expanding widens the PANE, never the previewed page: the
 * Desktop/Tablet/Mobile choice (`PAGE_PREVIEW_WIDTHS`, the `page-preview-width-*` buttons) is the
 * operator's statement about which viewport they are inspecting, so it is carried into the expanded
 * panel unchanged rather than overridden to Desktop. Overriding would silently discard a selection
 * they just made and would make the single most useful thing this control can do — look at the
 * mobile layout properly — impossible. It also pays off arithmetically: `scale` is
 * `min(1, paneWidth / width)`, so a 390px Mobile preview that a narrow pane was scaling DOWN
 * renders at a true 1:1 once the pane is wide enough, and Desktop on a narrow pane keeps the
 * scaled-down behavior it already had. `pages.css`'s `.page-preview-expanded .page-preview-scaler`
 * centres it; see that rule for why `auto` margins are the right tool for both regimes.
 */
function PagePreview({
  html,
  width,
  slug,
  version,
  status,
  dirty,
  contentDirty,
  templatePreviewUrl,
  previewFormRef,
  previewFormTarget,
  frameRef,
  paneWidth,
  expanded,
  onToggleExpanded,
  onFrameLoad,
  t,
}: {
  html: string;
  width: number;
  slug: string;
  /** Cache-busts the live-site branch's `src` — see `PagePreviewFrame`'s own doc. */
  version: number;
  status: "draft" | "published";
  dirty: boolean;
  contentDirty: boolean;
  /** Pre-built by `usePageEditor` — see this function's own doc, branch 2. */
  templatePreviewUrl: string;
  /** Owned by `usePageEditor` — see `PageEditorController.previewFormRef`'s own doc for why the
   *  debounced auto-submit effect that reaches through this ref lives there, not here. */
  previewFormRef: RefObject<HTMLFormElement | null>;
  /** The hidden form's `target` and the iframe's `name` it submits into — must match at submit time. */
  previewFormTarget: string;
  /** Frame element to measure and its live-measured width — both owned by `usePageEditor`
   *  (`hooks/use-page-editor.hooks.ts`), not local state, so they survive this component's own
   *  mount/unmount as the operator switches tabs. `frameRef` is a CALLBACK ref, not a `RefObject` —
   *  see that hook's own comment on why the measuring effect there is keyed on the frame node itself
   *  rather than `view` or an empty dependency array. */
  frameRef: (node: HTMLDivElement | null) => void;
  paneWidth: number;
  /** Preview fullscreen (2026-09-16) — see `PageEditorController.previewExpanded`'s own doc for the
   *  state's lifetime, and this component's own doc for what expanding does and does NOT change. */
  expanded: boolean;
  /** `usePageEditor`'s `togglePreviewExpanded`, bound to the single `.page-preview-fab` this
   *  component renders in BOTH states. Nothing in `PageEditor`'s toolbar toggles it. */
  onToggleExpanded: () => void;
  /** Per-tab scroll memory — see `PageEditorController.onPreviewFrameLoad`'s own doc. Wired to both
   *  `PagePreviewFrame` branches' `<iframe onLoad>` below. */
  onFrameLoad: (iframe: HTMLIFrameElement) => void;
  t: Translate;
}) {
  // Floored above zero, not just capped at 1: `paneWidth` is whatever `ResizeObserver` last reported
  // for the frame, and a zero-width observation (the frame measured during a paint where its column
  // has no width yet) would make the expanded scaler's height `calc(100% / 0)` — not a big number
  // but an INVALID declaration, which CSS drops entirely, silently reverting the height to `auto`.
  // The floor keeps that expression well-formed. It cannot affect the ordinary path: any real
  // measurement is orders of magnitude above it.
  const scale = Math.max(0.01, Math.min(1, paneWidth / width));
  const canShowLiveSite = status === "published" && !dirty;

  const pane = (
    <>
      {canShowLiveSite ? null : (
        <p className="page-preview-notice">
          {pagePreviewNotice({ status, contentDirty })}
        </p>
      )}
      {/* Collapsed the frame is a fixed `900 * scale` box, exactly as it has always been. Expanded
          it takes its height from the flex column instead (`pages.css`'s
          `.page-preview-expanded .page-preview-frame`), so no inline height is written at all —
          an inline height would beat that rule and pin the panel back to 900px.

          The scaler's own height follows from that: `calc(100% / scale)` of a frame that is `H`
          tall renders, after `scale(scale)`, as exactly `H` — i.e. the previewed viewport gets
          TALLER as the panel does, which is the whole point of going full screen. Collapsed it
          stays the literal `900px` it has always been (which is the same number this formula
          would produce there, since `H` is `900 * scale` — written as a constant anyway so the
          collapsed pane cannot drift on a rounding change). No measurement is needed for either:
          the percentage resolves against the flex item's own used height. */}
      <div
        ref={frameRef}
        className="page-preview-frame"
        style={expanded ? undefined : { height: `${900 * scale}px` }}
      >
        <div
          className="page-preview-scaler"
          style={{ width: `${width}px`, height: expanded ? `calc(100% / ${scale})` : "900px", transform: `scale(${scale})` }}
        >
          <PagePreviewFrame
            canShowLiveSite={canShowLiveSite}
            slug={slug}
            version={version}
            html={html}
            templatePreviewUrl={templatePreviewUrl}
            previewFormRef={previewFormRef}
            previewFormTarget={previewFormTarget}
            onFrameLoad={onFrameLoad}
            t={t}
          />
        </div>
      </div>
    </>
  );

  const fab = <PagePreviewFab expanded={expanded} onToggle={onToggleExpanded} t={t} />;

  // Collapsed: the pane plus the control, wrapped in `.page-preview-surface` — that wrapper is the
  // `position: relative` ancestor the fab's `position: absolute` resolves against (`pages.css`), so
  // the fab must stay inside it. Same wrapper in the expanded branch below, for the same reason.
  if (!expanded) return <div className="page-preview-surface">{pane}{fab}</div>;

  // Expanded: `.page-preview-expanded` (`styles/pages.css`) is `position: absolute; inset: 0`
  // against `.admin-main-col` — see `styles/editor.css`'s `.post-preview-expanded` comment for the
  // full containment argument (why this covers only the admin content column, never
  // `.admin-chat-dock`); Pages reuses the geometry and the `z-index`, not the rule.
  return (
    <div className="page-preview-expanded">
      <div className="page-preview-surface">
        {pane}
        {fab}
      </div>
    </div>
  );
}

/**
 * The one control that toggles the preview between its normal pane and the full-screen panel,
 * rendered in the SAME place in both states so the way out is always visible on screen — the
 * failure that killed an earlier overlay attempt was an operator who could not see how to get back.
 * A top-level component rather than inline JSX so its three state ternaries score in their own
 * scope, the same reason `PagePreviewFrame` below is one.
 *
 * The glyph is `aria-hidden`, so `aria-label` is the ONLY thing naming this button for a screen
 * reader; keep the two directions' names distinct. `data-agent-label` is a SEPARATE string and is
 * NOT an accessible description — `agentHandle` emits only `data-agent-element/-role/-label/-page`
 * (`handle.ts`), never `aria-label`/`aria-describedby`, so widening it carries no a11y consequence
 * and nobody should "fix" a11y by editing it.
 */
function PagePreviewFab({ expanded, onToggle, t }: { expanded: boolean; onToggle: () => void; t: Translate }) {
  return (
    <button
      type="button"
      className="page-preview-fab"
      onClick={onToggle}
      title={expanded ? t("Exit full screen (Esc)") : t("Show full screen")}
      aria-label={expanded ? t("Exit full screen") : t("Show full screen")}
      {...agentHandle("page-preview-expand", {
        role: "button",
        // These labels read redundantly ON PURPOSE. `page.find_elements`'s `query` is a plain
        // case-insensitive SUBSTRING match over handle and label only — no stemming, no synonyms,
        // no ranking, and `role` is not searched at all (`@jini-ai/agentic`'s `dom-page-driver.ts`,
        // `findElements`) — so a word that is not literally here retrieves NOTHING, and an
        // assistant that gets an empty list abandons the route rather than broadening its query.
        // That is not hypothetical: the Posts twin's label once read "Show the preview big, filling
        // the admin content area" while the button said "Show full screen", and on a recorded demo
        // an assistant asked to show the preview full screen called
        // `page.find_elements({query:"full"})`, got `{"elements":[]}`, and gave up.
        //
        // The durable rule that came out of that, and which both editors now follow: every word of
        // the button's own `aria-label` must appear in the label published to agents, and both
        // spellings — "full screen" and "fullscreen" — must be present, since they are different
        // substrings. Both directions also carry the OPPOSITE direction's vocabulary: a model that
        // asks for "fullscreen" while it is ALREADY full screen must find this control and read
        // "Exit full screen" off it, which tells it the state. Returning nothing instead teaches it
        // the feature does not exist. Direction is communicated by what the label SAYS, never by
        // being absent from the index. Prose, not a keyword dump — every synonym is worked into a
        // real sentence a person can read. Kept under `normalizeAgentLabel`'s 200-character
        // truncation (`handle.ts`), past which text is still matchable but invisible in a listing;
        // the agent-drive test pins both the vocabulary and that length.
        label: expanded
          ? "Exit full screen: exit fullscreen to collapse or close the expanded preview, putting it back to its normal, smaller size. Already maximized, so if the ask was to show it big, it already is."
          : "Show the preview full screen: fullscreen this page preview to maximize or expand it and show it big across the admin content area, at the Desktop, Tablet or Mobile width already chosen.",
      })}
    >
      <span aria-hidden="true">{expanded ? "\u2921" : "\u2922"}</span>
    </button>
  );
}

/**
 * The two-way surface choice from `PagePreview`'s own doc comment (live site / template preview), as
 * a top-level function so its branching scores independently of `PagePreview`'s own complexity — same
 * pattern `PageEditorToolbarEnd` above uses for `PageEditor`'s own render branches.
 */
function PagePreviewFrame({
  canShowLiveSite,
  slug,
  version,
  html,
  templatePreviewUrl,
  previewFormRef,
  previewFormTarget,
  onFrameLoad,
  t,
}: {
  canShowLiveSite: boolean;
  slug: string;
  /**
   * Cache-busts the live-site `src` (2026-09-16): the public route serves
   * `Cache-Control: public, max-age=60, stale-while-revalidate=300`
   * (`apps/website/src/server/inbound/public-http/routes/site/pages.ts`), so an unchanged `src`
   * after an assistant write can keep showing the pre-write HTML for up to a minute. `_v` is never
   * read server-side — it exists purely to change the URL. See `pageLivePreviewPath` (`rules.ts`).
   */
  version: number;
  html: string;
  /** Pre-built by `usePageEditor` — see `PagePreview`'s own doc, branch 2. */
  templatePreviewUrl: string;
  previewFormRef: RefObject<HTMLFormElement | null>;
  previewFormTarget: string;
  /** Per-tab scroll memory — see `PageEditorController.onPreviewFrameLoad`'s own doc. Wired to both
   *  branches' `onLoad` below: cross-origin (the live-site branch) it silently does nothing. */
  onFrameLoad: (iframe: HTMLIFrameElement) => void;
  t: Translate;
}) {
  if (canShowLiveSite) {
    return (
      <iframe
        src={siteUrl(pageLivePreviewPath(slug, version))}
        title={t("Page preview")}
        className="page-preview-iframe"
        referrerPolicy="no-referrer"
        onLoad={(e) => onFrameLoad(e.currentTarget)}
      />
    );
  }
  return (
    <>
      {/* `hidden`, not left out of the DOM — a hidden form still submits fine, and this keeps it
          out of layout without relying on CSS. Posts to the same `templatePreviewUrl` a plain `GET`
          used to point this iframe's `src` at directly — `templateChoice` rides that URL's own query
          string exactly as it did there, so a pending template choice AND a pending body are both
          honored by one submit. Mirrors `PostEditor.tsx`'s identical `PostPreviewFrame` branch 3
          almost exactly (a `bodyHtml` field here where that one sends `bodyJson`). */}
      <form ref={previewFormRef} method="post" target={previewFormTarget} action={templatePreviewUrl} hidden>
        <input type="hidden" name="bodyHtml" value={html} />
      </form>
      <iframe
        name={previewFormTarget}
        title={t("Page preview")}
        className="page-preview-iframe"
        referrerPolicy="no-referrer"
        onLoad={(e) => onFrameLoad(e.currentTarget)}
      />
    </>
  );
}

/**
 * The notice text above a preview that isn't the live site (`PagePreview` skips calling this for the
 * live-site branch, which shows no notice at all).
 *
 * Rendered BEFORE `.page-preview-frame` in `PagePreview`, not after (visibility fix — the frame is up
 * to 900px tall before scaling, `pages.css`'s `.page-preview-frame`; a notice placed below it needed a
 * scroll past that height to ever be seen, which is exactly the gap `ADS-memory/reports/implementation/
 * 2026-08-11-template-preview-render-bug.md` flagged and explicitly left unfixed — "not a missing
 * feature, a visibility gap").
 *
 * Three phrasings, not two, even though `PagePreviewFrame` only has two branches: `contentDirty`
 * covers title/slug/status/body edits regardless of `status` (a draft that has never been touched at
 * all has `contentDirty === false`, so it gets its own, less alarming wording rather than reusing the
 * "newly selected template" phrasing written for an actually-pending `templateChoice`).
 */
function pagePreviewNotice({ status, contentDirty }: { status: "draft" | "published"; contentDirty: boolean }): string {
  if (contentDirty) {
    return "Previewing your unsaved edits through the live template — this updates a moment after you stop typing.";
  }
  if (status === "draft") {
    return "Previewing this draft through the live template — publish to make it visible on the site.";
  }
  return "Previewing your saved content through the newly selected template — save to update the live page.";
}

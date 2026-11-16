import { PostEditorNotices } from "./editor/notices/PostEditorNotices";
import { PostEditorTemplateModalGate } from "./editor/template/PostEditorTemplateModalGate";
import { PostEditorToolbarEnd } from "./editor/header/PostEditorToolbarEnd";
import { PostEditorSlugCollisionWarning } from "./editor/notices/PostEditorSlugCollisionWarning";
import { PostEditorActions } from "./editor/header/PostEditorActions";
import { PostEditorHeader } from "./editor/header/PostEditorHeader";
import { useThemePreviewFrame } from "../themes/hooks/use-theme-preview-refresh.hooks";
import type { ReactNode } from "react";
import { EditorContent, type Editor } from "@tiptap/react";
import DragHandle from "@tiptap/extension-drag-handle-react";
import { agentHandle } from "@jini-ai/core/agent-handles";
import { ConfirmDialog } from "@jini-ai/admin/react";

import { usePreviewPaneWidth, useDevicePreviewDevice } from "../../components/DevicePreview/DevicePreview.hooks";
import { DevicePreviewFrame } from "../../components/DevicePreview/DevicePreviewFrame";
import { DevicePreviewToggle } from "../../components/DevicePreview/DevicePreviewToggle";
import { resolveTabBarTabIndex, useTabBarKeyboard } from "@jini-ai/ui/tab-strip";
import type { AdminPost } from "../../lib/api";

import { useWiredPostEditor, type PostEditorView } from "./hooks/use-post-editor.hooks";
import { usePostPreviewIframeEscape, usePostSettingsDialog } from "./hooks/use-post-editor-ui.hooks";
import { TermPicker } from "../taxonomy/TermPicker";
import { PAGE_PREVIEW_IFRAME_SANDBOX } from "../pages/rules";
import { ContentAnalysisCard } from "../content-analysis/ContentAnalysisCard";
import { PostCoverImage } from "./PostCoverImage";
import { PostSettingsDialog } from "./PostSettingsDialog";
import { PostUrlDialog } from "./PostUrlDialog";
import { Toolbar } from "./editor/toolbar/Toolbar";
import { BubbleFormattingMenu } from "./editor/bubble-menu/BubbleFormattingMenu";
import { usePostUrlDialog } from "./hooks/use-post-url-dialog.hooks";
import { resolvePostPreviewBranches } from "./rules";

import { type Translate } from '@jini-ai/core/text';
/**
 * @file The post/page editor screen — markup only.
 *
 * State, the TipTap instance, the load effect, save, delete, and the dirty guard all live in
 * `hooks/use-post-editor.hooks.ts`. The drop handler and the `data:` URL reader moved to `rules.ts`
 * as pure functions, where they can be driven with a fake `EditorView` instead of a real editor and
 * a real drag gesture.
 *
 * What stays: `Toolbar`, which is a genuinely inert render of editor commands, and the page markup.
 *
 * Shared between posts and pages via the same `/admin/posts/{id}` route — see `Pages.tsx`'s file
 * header. `post.kind` drives the display copy and the back-link target only.
 */

/** Product-facing labels, not library ones — "Tiptap" never appears in the UI; an author reads
 *  these as "the editor" and "how it looks on the site". */
const VIEWS: ReadonlyArray<{ key: PostEditorView; label: string; handle: string; agentLabel: string }> = [
  // "Editor", not "Edit" (owner, 2026-08-11): the pair names two VIEWS of the same post, so both
  // labels should be nouns. "Edit" alongside "Preview" reads as a verb next to a noun, and collides
  // with the post-list row menu's own "Edit" ACTION (`rules.ts`), which does something different.
  //
  // `handle`/`agentLabel` (2026-09-15, preview-fullscreen dispatch) — these two tabs previously
  // carried no `agentHandle` at all, so `page.find_elements` never reported them and the assistant
  // could open a post's editor but never switch it to Preview. `agentLabel` names what each view
  // SHOWS (an agent reads it, never sees the tab), not the library ("Tiptap" never appears here
  // either) — same "product-facing, not implementation-facing" rule this file's own doc comment
  // states for `label`.
  { key: "edit", label: "Editor", handle: "post-view-edit", agentLabel: "Switch to the rich-text editor for this post" },
  { key: "preview", label: "Preview", handle: "post-view-preview", agentLabel: "Switch to a rendered preview of how this post looks on the site" },
];

/** {@link VIEWS} carrying the `id` that `TabBar.hooks.tsx`'s WAI-ARIA tabs helpers key on, so this
 *  hand-rolled `role="tablist"` row gets the same arrow/Home/End keys and roving tab stop `TabBar`
 *  and the Page editor's own view row have (a35ce9f12, 3da7686cc) without becoming a `<TabBar>`:
 *  the `.segmented` pill row is a different visual control, only the keyboard contract is shared.
 *  Spread, not rebuilt, so nothing in the JSX below has to change which field it reads. */
const VIEW_TABS = VIEWS.map((entry) => ({ ...entry, id: entry.key }));

/**
 * The Edit-view pane — formatting toolbar, bubble menu, drag handle, and the TipTap body itself.
 * Extracted out of `PostEditor` (complexity-ceiling pass, 2026-08-20) as the `view === "preview"`
 * ternary's alternate branch: three independent `editor ? ... : null` gates (the toolbar, the
 * bubble menu, and the drag handle all wait on the same "has TipTap mounted yet" condition) were the
 * last cluster of `PostEditor`'s own branching once the toolbar-end/slug-collision blocks above were
 * pulled out — same "top-level function scores its own branches independently" reasoning those two
 * already state.
 */
function PostEditorBody({
  editor,
  mentionablePosts,
  currentPostId,
  cover,
  t,
}: {
  editor: Editor | null;
  mentionablePosts: AdminPost[];
  currentPostId: string;
  /** The cover-image slot (`PostCoverImage`), drawn in the content column above the title node. */
  cover: ReactNode;
  t: Translate;
}) {
  const urlDialog = usePostUrlDialog({ editor });
  return (
    <div
      className="editor-shell post-editor-pane"
      {...agentHandle({ handle: "post-editor-shell" }, {
        role: "region",
        label: "Formatting toolbar and the post body editor",
      })}
    >
      {editor ? <Toolbar editor={editor} mentionablePosts={mentionablePosts} currentPostId={currentPostId} urlDialog={urlDialog} t={t} /> : null}
      {editor ? <BubbleFormattingMenu editor={editor} urlDialog={urlDialog} t={t} /> : null}
      <PostUrlDialog dialog={urlDialog} t={t} />
      {/* Drag handle (owner, 2026-08-11: "anything and everything") — a grip icon that appears
          beside whichever top-level block the cursor is hovering, letting an author reorder
          blocks by dragging instead of cut/paste. `nested` left at its `false` default: this is
          the "quickest thing that works" pass every other plain-toggle-button addition this
          dispatch made follows, not a stated requirement for reordering INSIDE a list/table/etc. */}
      {editor ? (
        <DragHandle editor={editor}>
          <div className="editor-drag-handle" title={t("Drag to reorder")} aria-hidden="true">
            <svg viewBox="0 0 18 18" fill="currentColor">
              <circle cx="6" cy="4" r="1.3" />
              <circle cx="12" cy="4" r="1.3" />
              <circle cx="6" cy="9" r="1.3" />
              <circle cx="12" cy="9" r="1.3" />
              <circle cx="6" cy="14" r="1.3" />
              <circle cx="12" cy="14" r="1.3" />
            </svg>
          </div>
        </DragHandle>
      ) : null}
      {/* Outside `.editor-body` so the `post-body` field's text stays the post's own text. */}
      {cover}
      {/* `role: "field"` rather than `region`: this is a TipTap `contenteditable`, which the
          page driver treats as a fillable rich-text surface (see its `isEditableRegion`), so an
          agent can read and write the body through the same field verbs it uses for an input. */}
      <div
        className="editor-body"
        {...agentHandle({ handle: "post-body" }, { role: "field", label: "The post's rich-text body content" })}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

/**
 * Delete-confirmation presentation, including local discard before first Save. This owner keeps
 * the title, consequence and action label together; a local working copy has no server row to trash.
 * Jini's ConfirmDialog continues to own the dialog lifecycle and confirmation behavior.
 */
function PostDeleteConfirmDialog({
  kindLabel,
  post,
  open,
  pending,
  onConfirm,
  onCancel,
  t,
}: {
  kindLabel: "post" | "page";
  post: Pick<AdminPost, "id" | "title">;
  open: boolean;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  t: Translate;
}) {
  return (
    <ConfirmDialog
      open={open}
      agentHandle="post-delete-confirm"
      title={t(post.id ? "Move to trash?" : "Discard post?")}
      body={post.id ? (
        <p>
          {t(kindLabel === "page" ? "Move this page" : "Move this post")} (&quot;{post.title}&quot;){" "}
          {t(
            kindLabel === "page"
              ? "to trash? It will disappear from the site and from the pages list."
              : "to trash? It will disappear from the site and from the posts list.",
          )}
        </p>
      ) : <p>{t("Discard this unsaved post?")}</p>}
      confirmLabel={t(post.id ? "Move to trash" : "Discard")}
      destructive
      pending={pending}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

export interface PostEditorProps {
  /** Persisted id/slug, or an empty string for the local working copy before first Save. */
  postId: string;
  /**
   * Dependency injection seam for tests — same convention as `Posts.tsx`'s `usePostsHook` and
   * `@jini-ai/ui`'s `useCustomSelect`.
   *
   * Defaulted to the real hook, so `panels.tsx` passes nothing. A stub lets a test render the
   * header, the status select, the Publish/Save branch and the confirm dialog without mounting
   * TipTap or serving a post — the existing suite currently has to stand up both.
   */
  usePostEditorHook?: typeof useWiredPostEditor;
}

export function PostEditor({ postId, usePostEditorHook = useWiredPostEditor }: PostEditorProps) {
  const {
    post,
    editor,
    title,
    setTitle,
    slug,
    setSlug,
    status,
    setStatus,
    templateChoice,
    setTemplateChoice,
    availableTemplates,
    mentionablePosts,
    activeThemeId,
    activeThemeTier,
    activeThemeApiVersion,
    overridesThemePage,
    setOverridesThemePage,
    publishAtInput,
    setPublishAtInput,
    scheduled,
    featuredMediaId,
    setFeaturedMediaId,
    author,
    setAuthor,
    showAuthor,
    setShowAuthor,
    hideCoverImageInBody,
    setHideCoverImageInBody,
    hasSlugCollision,
    view,
    setView,
    previewExpanded,
    togglePreviewExpanded,
    message,
    error,
    saving,
    confirmingDelete,
    confirmingUnchangedSave,
    deleting,
    confirmLeave,
    dirty,
    contentDirty,
    templatePreviewUrl,
    bodyJson,
    showTemplateModal,
    previewFormRef,
    previewFormTarget,
    remove,
    t,
    onPublish,
    onSave,
    onDeleteClick,
    onDeleteCancel,
    onUnchangedSaveConfirm,
    onUnchangedSaveCancel,
    onViewTemplateClick,
    onCloseTemplateModal,
    recoverableDraft,
    restoreRecoveredDraft,
    discardRecoveredDraft,
    saveConflict,
    saveOverwritingConflict,
    dismissSaveConflict,
    autosaveStaleBasis,
    pendingExternalVersion,
    loadExternalChange,
    dismissExternalChange,
  } = usePostEditorHook({ postId });
  // Above the early returns below: `use*` has to be called unconditionally for the rules-of-hooks
  // lint even though this one holds no state of its own.
  const { onKeyDown: onViewTabsKeyDown } = useTabBarKeyboard({ tabs: VIEW_TABS, activeId: view, onChange: (id) => setView(id as PostEditorView) });
  // Preview width (2026-09-22) — pure view chrome with nothing to inject, kept out of the injected
  // controller the same way `ThemeExplore.tsx`'s own `device` is.
  const { device, setDevice, width: previewWidth } = useDevicePreviewDevice();
  const settingsDialog = usePostSettingsDialog();

  if (error && !post) return <div className="notice error">{error}</div>;
  if (!post) return <div className="notice">{t("Loading editor…")}</div>;

  const kindLabel = post.kind === "page" ? "page" : "post";

  return (
    <div className="page content-editor-page">
      <PostEditorHeader
        kindLabel={kindLabel}
        confirmLeave={confirmLeave}
        title={title}
        setTitle={setTitle}
        slug={slug}
        setSlug={setSlug}
        post={post}
        t={t}
      />

      <PostEditorNotices
        recoverableDraft={recoverableDraft}
        serverUpdatedAt={post.updatedAt}
        restoreRecoveredDraft={restoreRecoveredDraft}
        discardRecoveredDraft={discardRecoveredDraft}
        autosaveStaleBasis={autosaveStaleBasis}
        saveConflict={saveConflict}
        saveOverwritingConflict={saveOverwritingConflict}
        dismissSaveConflict={dismissSaveConflict}
        pendingExternalVersion={pendingExternalVersion}
        loadExternalChange={loadExternalChange}
        dismissExternalChange={dismissExternalChange}
        t={t}
      />
      {/* Edit/Preview toolbar (2026-08-11, owner: "Let's have a preview button... a tab that shows
          either tiptap so they can edit, or how it looks when it's rendered" + "Keeping the template
          chooser on the right... that's how the others work"). Deliberately the SAME structure as
          the Pages editor's `.page-editor-toolbar` (`features/pages/PageEditor.tsx`) — tabs left,
          `.page-editor-toolbar-end` right — reusing its classes directly (`styles/pages.css`) rather
          than parallel Post-only ones: those classes already have a second consumer beyond Pages
          (`ThemeExplore.tsx`), so this is a third, not a fork. The template picker moved into
          `.page-editor-toolbar-end` verbatim from the old `.editor-slug-row` below it — only its
          MARKUP location changed; where its options/value come from is untouched (a concurrent
          agent owns that wiring). */}
      <div className="page-editor-toolbar">
        <div className="content-editor-toolbar-start">
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
                {...agentHandle({ handle: entry.handle }, { role: "button", label: entry.agentLabel })}
              >
                {t(entry.label)}
              </button>
            ))}
          </div>
          {view === "preview" ? (
            <DevicePreviewToggle device={device} setDevice={setDevice} t={t} handlePrefix="post-preview-width" />
          ) : null}
        </div>
        {/* Preview fullscreen, Level 1 (2026-09-15) — no expand toggle lives in this toolbar. It was
            here until `a380c716` and is now ONE control floating on the preview itself
            (`.post-preview-fab`, `PostPreview` below), rendered in the same place both collapsed and
            expanded so the way out is always visible: the expanded surface is a `position: absolute;
            inset: 0` panel that would cover anything in this toolbar anyway. */}
        {/* Template picker (Post-template-picker feature, 2026-08-10) — see `PostEditorToolbarEnd`'s
            own doc for the full eligibility/ordering/empty-theme rules this extracts. */}
        <PostEditorToolbarEnd
          view={view}
          bodyFormat={post.bodyFormat}
          availableTemplates={availableTemplates}
          templateChoice={templateChoice}
          setTemplateChoice={setTemplateChoice}
          onViewTemplateClick={onViewTemplateClick}
          t={t}
        />
      </div>

      {/* Directly under the toolbar, not in the header — see `PostEditorActions`' own doc. Placed
          ABOVE the slug-collision warning so the row keeps the position the owner asked for
          (immediately below the toolbar) whether or not that conditional notice is showing. */}
      <PostEditorActions
        message={message}
        error={error}
        status={status}
        setStatus={setStatus}
        saving={saving}
        onPublish={onPublish}
        onSave={onSave}
        onDeleteClick={onDeleteClick}
        onOpenSettings={settingsDialog.openDialog}
        kindLabel={kindLabel}
        t={t}
      />
      {/* Author, scheduled publishing and featured image (2026-10-05) used to be two rows here; they
          moved into the gear's modal (owner, 2026-10-10). The featured image left the modal again
          for the cover slot above the title (owner, 2026-10-11). */}
      <PostSettingsDialog
        dialog={settingsDialog}
        kindLabel={kindLabel}
        author={author}
        setAuthor={setAuthor}
        showAuthor={showAuthor}
        setShowAuthor={setShowAuthor}
        publishAtInput={publishAtInput}
        setPublishAtInput={setPublishAtInput}
        scheduled={scheduled}
        t={t}
      />
      {/* Slug-collision override — see `PostEditorSlugCollisionWarning`'s own doc for the tri-state
          contract and history this extracts. */}
      <PostEditorSlugCollisionWarning
        hasSlugCollision={hasSlugCollision}
        overridesThemePage={overridesThemePage}
        setOverridesThemePage={setOverridesThemePage}
        t={t}
      />
      {view === "preview" ? (
        // `bodyJson`/`templatePreviewUrl`/`previewFormRef`/`previewFormTarget` come straight off the
        // hook now (2026-08-14) — see `use-post-editor.hooks.ts`'s own docs on each for why they
        // moved out of this component. `editor` itself is no longer needed here (2026-09-11 — the
        // raw editor-buffer fallback that used to read `editor.getHTML()` was removed, see
        // `PostPreview`'s own doc).
        <PostPreview
          postId={post.id}
          bodyJson={bodyJson}
          slug={slug}
          status={status}
          scheduled={scheduled}
          dirty={dirty}
          contentDirty={contentDirty}
          templatePreviewUrl={templatePreviewUrl}
          previewFormRef={previewFormRef}
          previewFormTarget={previewFormTarget}
          t={t}
          width={previewWidth}
          expanded={previewExpanded}
          onToggleExpanded={togglePreviewExpanded}
        />
      ) : (
        <PostEditorBody
          editor={editor}
          mentionablePosts={mentionablePosts}
          currentPostId={post.id}
          cover={
            <PostCoverImage
              bodyFormat={post.bodyFormat}
              featuredMediaId={featuredMediaId}
              setFeaturedMediaId={setFeaturedMediaId}
              kind={kindLabel}
              hideCoverImageInBody={hideCoverImageInBody}
              setHideCoverImageInBody={setHideCoverImageInBody}
              t={t}
            />
          }
          t={t}
        />
      )}
      {/* Content analysis (AW-7 Tier 2) — renders nothing unless the `content-analyzer` plugin is
          enabled. Gets the live `title`/`bodyJson` so "Analyze now" covers unsaved edits, and `post`
          so a save's freshly stored analysis replaces it. */}
      {/* Categories & Tags — the same box the collection-entry editor mounts; it saves on its own
          button, separately from the post's Save/Publish. Both panels need a saved identity. */}
      {post.id ? <>
        <ContentAnalysisCard post={post} title={title} bodyJson={bodyJson} />
        <TermPicker contentType={post.kind} contentId={post.id} />
      </> : null}
      {/* Save with nothing changed (owner, 2026-10-10): a warning, not a disabled button. "Save anyway"
          still sends the content; the server writes nothing if it really is identical. */}
      <ConfirmDialog
        open={confirmingUnchangedSave}
        agentHandle="post-save-unchanged-confirm"
        title={t("Nothing changed")}
        body={<p>{t("Nothing has changed since the last save. Save anyway?")}</p>}
        confirmLabel={t("Save anyway")}
        pending={saving}
        onConfirm={onUnchangedSaveConfirm}
        onCancel={onUnchangedSaveCancel}
      />
      <PostDeleteConfirmDialog
        open={confirmingDelete}
        post={post}
        kindLabel={kindLabel}
        t={t}
        pending={deleting}
        onConfirm={remove}
        onCancel={onDeleteCancel}
      />
      {/* See `PostEditorTemplateModalGate`'s own doc for why this is conditionally mounted rather
          than always-mounted-with-`open`, and why all three conditions are re-checked here. */}
      <PostEditorTemplateModalGate
        show={showTemplateModal}
        templateChoice={templateChoice}
        activeThemeId={activeThemeId}
        activeThemeTier={activeThemeTier}
        activeThemeApiVersion={activeThemeApiVersion}
        onClose={onCloseTemplateModal}
        confirmLeave={confirmLeave}
        t={t}
      />
    </div>
  );
}

/**
 * Renders the post the way the Preview tab shows it — mirrors `features/pages/PageEditor.tsx`'s
 * `PagePreview` for branches 1 and 2 (see that function's own doc for the full explanation;
 * `ADS-memory/reports/implementation/2026-08-11-html-view-and-preview.md` has the original decision
 * record this repeats, and `2026-08-11-template-preview-render-bug.md` has the template-preview fix
 * below). Three branches, evaluated in this order:
 *
 * 1. **Saved content** (`status === "published" && !dirty`): GETs the authenticated preview URL.
 *    The shared renderer keeps theme CSS/nav/footer/widgets; consent is excluded because the
 *    opaque-origin sandbox cannot save a choice.
 * 2. **Template preview** (2026-08-11 fix) (`status === "published" && !contentDirty`, i.e.
 *    title/slug/status/body/`overridesThemePage` all match what's saved and the post IS published —
 *    only `templateChoice` is pending): `GET`s `templatePreviewUrl` — `usePostEditor`'s pre-built URL
 *    (`port.templatePreviewUrl`, `post-editor-port.hooks.ts`; the real binding calls `lib/api.ts`'s
 *    own `templatePreviewUrl`), the SAME real render pipeline as branch 1, looked up by id instead of
 *    by public slug.
 * 3. **Pending-content preview** (2026-08-12 fix — the owner's own reported bug: formatting text on
 *    an already-published post used to drop the preview straight to a raw, unstyled editor-buffer
 *    fallback the instant `contentDirty` went true, even though the post was still live at its public
 *    URL; widened 2026-09-09 to also cover a DIRTY draft; widened again 2026-09-11 to be the plain
 *    negation of branches 1/2 — see immediately below). Same `template-preview` endpoint as branch 2,
 *    but `POST`ed instead of `GET`ted so the request can carry a BODY: a hidden `<form method="post"
 *    target="{iframe's name}">` submits `bodyJson` — the live, UNSAVED `editor.getJSON()` — into the
 *    targeted iframe, landing a real navigated document instead of a `srcDoc` string. `srcDoc` is
 *    rejected here for the same reason `template-preview.ts`'s own file header gives: the rendered
 *    HTML's asset paths are root-relative to `/theme-assets/{themeId}/...`, which only resolves once
 *    the browser believes it is looking at a real navigated page. Debounced 500ms trailing — a form
 *    submit is a full iframe navigation, not a `fetch`, so firing one per keystroke would be
 *    unusable; the debounce effect itself, and the `formRef`/`previewFormTarget` it needs, now live
 *    in `usePostEditor` (moved 2026-08-14, complexity-ceiling pass — see
 *    `PostEditorController.previewFormRef`'s own doc), so this component only attaches them to the
 *    `<form>`/`<iframe>` pair below.
 *
 *    No longer gated on `status === "published"` (2026-09-09): `template-preview.ts`'s
 *    `pendingBodyJson` override (`resolveHtmlPageEmbeds`'s `pendingContentOverride`) is checked
 *    BEFORE `findPublishedPostById`'s visibility guard, so it already bypassed that guard for a
 *    DRAFT's own id too — the `status === "published"` check here was never load-bearing for
 *    correctness, only inherited from branch 2's (which genuinely does need it, for the
 *    un-overridden `GET` case). Confirmed by a direct backend test before relying on it
 *    (`admin-post-template-preview.test.ts`'s "a DRAFT doc-format post's own body renders via a
 *    POSTed bodyJson override" case) rather than assumed.
 *
 *    No longer gated on `contentDirty` either (2026-09-11, owner-reported: "the preview should always
 *    show the css and template and all that properly" — a CLEAN draft, which is what an operator sees
 *    the instant they open a brand-new post, previously matched none of branches 1/2/3 and fell
 *    through to a fourth branch that rendered `editor.getHTML()` — TipTap's own client-side
 *    serializer, not the server's `renderDocNode` — into a sandboxed `SrcDocSandbox` iframe with no
 *    theme CSS, no nav/footer, and no media resolution at all; autosave clears `contentDirty` within
 *    moments of any edit, so in practice a post spent almost its entire draft lifetime on that raw
 *    branch). `canShowPendingContentPreview` is now simply "neither of the two branches above" —
 *    `!canShowLiveSite && !canShowTemplatePreview` — which makes it the exhaustive fallback for
 *    everything branches 1/2 don't cover, not just the `contentDirty` subset of that. This is the
 *    exact same retirement `features/pages/PageEditor.tsx`'s `PagePreview` already did to its own
 *    third (raw-fallback) branch on 2026-09-09 — see that function's own doc, "That is what retired
 *    the THIRD branch this function used to have" — applied here one branch later, since Posts kept
 *    the GET/POST split (branch 2 vs. 3) Pages collapsed into one. The POST body is still whatever
 *    `bodyJson` is at the moment (`null` before TipTap mounts): `template-preview.ts`'s
 *    `extractPendingBodyJson` already degrades a non-object/unparseable value to `undefined`, which
 *    falls back to rendering the post's last-SAVED body through the real template — never a crash,
 *    and never worse than the raw fallback it replaces.
 *
 * The raw editor-buffer fallback (`SrcDocSandbox` fed `editor.getHTML()`) is deleted, not left as an
 * unreachable last-resort branch: with branch 3 now the unconditional negation of 1 and 2, nothing
 * can reach it any more for a `"doc"`-format post — same "exhaustive by construction, so the
 * fallback had become dead code, not merely rare — removed rather than left unreachable" reasoning
 * `PagePreview`'s own doc gives for its own equivalent removal. `degradeUnplayableEmbedsForRawPreview`
 * (`rules.ts`) existed only to patch that raw branch's own YouTube-embed bug and is removed alongside
 * it, along with its now-fully-unused `SrcDocSandbox` import (grep confirms no other admin caller).
 *
 * Device-width scaling (2026-09-22 owner ask): all three branches render inside the shared
 * `DevicePreviewFrame`, at the toolbar's Desktop/Tablet/Mobile width scaled to fit the pane — the
 * same mechanism as `PagePreview`.
 */
function PostPreview({
  postId,
  bodyJson,
  slug,
  status,
  scheduled,
  dirty,
  contentDirty,
  templatePreviewUrl,
  previewFormRef,
  previewFormTarget,
  t,
  width,
  expanded,
  onToggleExpanded,
}: {
  /** Empty until first Save; server previews require a persisted post. */
  postId: string;
  /** Loosely typed like `PostFormState.bodyJson` (`use-post-editor.hooks.ts`) for the same stated
   *  reason: this only ever gets `JSON.stringify`'d into a hidden form field below, never read for
   *  its shape. `null` means the editor hasn't mounted yet — see the call site's own comment; a
   *  `null` submits as the literal string `"null"`, which `template-preview.ts`'s
   *  `extractPendingBodyJson` degrades to `undefined` (falls back to the last-saved body), not a
   *  crash — see this function's own doc for why that degrade is an acceptable, deliberate choice. */
  bodyJson: unknown;
  slug: string;
  status: "draft" | "published";
  /** `usePostEditor`'s `scheduled`: a scheduled published post previews like a draft (no live URL yet). */
  scheduled: boolean;
  dirty: boolean;
  contentDirty: boolean;
  /** Pre-built by `usePostEditor` — see this function's own doc, branch 2. Used as both the branch-2
   *  iframe `src` and the branch-3 hidden form's `action` (same endpoint, `GET` vs `POST`). */
  templatePreviewUrl: string;
  /** Owned by `usePostEditor` — see `PostEditorController.previewFormRef`'s own doc for why the
   *  debounced auto-submit effect that reaches through this ref lives there, not here. */
  previewFormRef: (node: HTMLFormElement | null) => void;
  /** The hidden form's `target` and the iframe's `name` it submits into — must match at submit time. */
  previewFormTarget: string;
  /** The selected device's viewport width (`DEVICE_PREVIEW_WIDTHS`) the iframe renders at. */
  width: number;
  /** Preview fullscreen, Level 1 (2026-09-15) — `usePostEditor`'s `previewExpanded`. See
   *  `PostEditorController.previewExpanded`'s own doc for the full lifetime/containment reasoning;
   *  this component only decides what to render given the value. */
  expanded: boolean;
  /** `usePostEditor`'s `togglePreviewExpanded`, bound to the single `.post-preview-fab` control
   *  below, which this component renders in BOTH states. Nothing in `PostEditor`'s own toolbar
   *  toggles this any more (since `a380c716`) — this is the only control that does. */
  onToggleExpanded: () => void;
  t: Translate;
}) {
  // The same decision `usePostEditor` gates its auto-submit on — one shared copy in `rules.ts`, see
  // `resolvePostPreviewBranches`. `PostPreviewFrame` needs only the first two flags: the
  // pending-content surface is its unconditional final case.
  const { canShowLiveSite, canShowTemplatePreview } = resolvePostPreviewBranches({ status, scheduled, dirty, contentDirty });
  // Component-scoped like `ThemeExplorePreview`'s: the frame mounts/unmounts with this tab.
  const { frameRef, paneWidth } = usePreviewPaneWidth();

  // Keep the guard in the preview owner, after hooks so first Save can reveal the server frame.
  if (!postId) return <p className="notice" role="status">{t("Save this post to preview it.")}</p>;

  const pane = (
    <>
      <div className="editor-shell post-editor-pane">
        {/* Keep the note inside the pane: its negative top margin would cover a preceding sibling. */}
        <p className="field-hint editor-preview-note">{t("Cookie banner hidden in preview. Embedded videos may not play here; open the page to check.")}</p>
        <DevicePreviewFrame width={width} frameRef={frameRef} paneWidth={paneWidth} expanded={expanded}>
          <PostPreviewFrame
            canShowLiveSite={canShowLiveSite}
            canShowTemplatePreview={canShowTemplatePreview}
            bodyJson={bodyJson}
            slug={slug}
            templatePreviewUrl={templatePreviewUrl}
            previewFormRef={previewFormRef}
            previewFormTarget={previewFormTarget}
            expanded={expanded}
            onCollapse={onToggleExpanded}
            t={t}
          />
        </DevicePreviewFrame>
      </div>
    </>
  );

  // ONE control for both directions, in the same place either way — the way out of the expanded
  // panel must always be visible on screen (the earlier overlay attempt died on an operator who
  // could not find it). The glyph is `aria-hidden`, so `aria-label` is the ONLY thing telling a
  // screen reader or `page.find_elements` which way this goes; keep the two names distinct.
  const fab = (
    <button
      type="button"
      className="post-preview-fab"
      onClick={onToggleExpanded}
      title={t(expanded ? "Exit full screen (Esc)" : "Show full screen")}
      aria-label={t(expanded ? "Exit full screen" : "Show full screen")}
      {...agentHandle({ handle: "post-preview-expand" }, {
        role: "button",
        // These labels read redundantly ON PURPOSE. `page.find_elements`'s `query` is a plain
        // case-insensitive SUBSTRING match over handle and label — no stemming, no synonyms, no
        // ranking (`@jini-ai/agentic`'s `dom-page-driver.ts`, `findElements`) — so a word that is not
        // literally here retrieves NOTHING, and an assistant that gets an empty list abandons the
        // route rather than broadening its query. That is not hypothetical: this label once read
        // "Show the preview big, filling the admin content area" while the button said "Show full
        // screen", and on a recorded demo an assistant asked to show the preview full screen called
        // `page.find_elements({query:"full"})`, got `{"elements":[]}`, and gave up.
        //
        // So both directions carry the whole vocabulary, including the opposite direction's: a model
        // that asks for "fullscreen" while it is ALREADY full screen must find this control and read
        // "Exit full screen" off it, which tells it the state. Returning nothing instead teaches it
        // the feature does not exist. Direction is communicated by what the label SAYS, never by
        // being absent from the index. Keep in step with `aria-label`/`title` above —
        // `post-editor-agent-drive.unit.test.tsx` pins both the vocabulary and that agreement.
        // Prose, not a keyword dump — every synonym below is worked into a real sentence a person
        // can read. Note this string is NOT the accessible description: `agentHandle` emits it as
        // the plain data attribute `data-agent-label` (`handle.ts`), never `aria-label` or
        // `aria-describedby`, so no screen reader reads it. The accessible name is the `aria-label`
        // above, and the two are kept in agreement by test, not by sharing a string.
        label: expanded
          ? "Exit full screen: exit fullscreen to collapse or close the expanded preview, putting it back to its normal, smaller size. Already maximized, so if the ask was to show it big, it already is."
          : "Show the preview full screen: fullscreen the panel to maximize or expand it, and show it big across the whole admin content area.",
      })}
    >
      <span aria-hidden="true">{expanded ? "\u2921" : "\u2922"}</span>
    </button>
  );

  // Collapsed: the pane plus the control, wrapped in `.post-preview-surface` — that wrapper is the
  // `position: relative` ancestor the fab's `position: absolute` resolves against (`editor.css`), so
  // the fab must stay inside it. Same wrapper in the expanded branch below, for the same reason.
  if (!expanded) return <div className="post-preview-surface">{pane}{fab}</div>;

  // Expanded: `.post-preview-expanded` (`styles/editor.css`) is `position: absolute; inset: 0`
  // against `.admin-main-col` — see that rule's own comment for the full containment argument (why
  // this covers only the admin content column, never `.admin-chat-dock`). The same `fab` rides along
  // inside the panel, in the same corner of the same surface, as the always-visible way back out.
  return (
    <div className="post-preview-expanded">
      <div className="post-preview-surface">
        {pane}
        {fab}
      </div>
    </div>
  );
}

/**
 * The three-way surface choice from `PostPreview`'s own doc comment (live site / template preview /
 * pending-content preview), as a top-level function so its branching scores independently of
 * `PostPreview`'s own complexity — same pattern `features/pages/PageEditor.tsx`'s `PagePreviewFrame`
 * uses for its own equivalent. Only `canShowLiveSite`/`canShowTemplatePreview` are named booleans;
 * the pending-content case is this function's own unconditional final `return`, needing no name of
 * its own — the exact same "its negation needs no name" collapse `PagePreviewFrame` already applies
 * to its own two-branch equivalent (see `PagePreview`'s own doc for that precedent), one branch later
 * here since Posts keep the GET/POST split Pages collapsed into one.
 */
function PostPreviewFrame({
  canShowLiveSite,
  canShowTemplatePreview,
  bodyJson,
  slug,
  templatePreviewUrl,
  previewFormRef,
  previewFormTarget,
  expanded,
  onCollapse,
  t,
}: {
  canShowLiveSite: boolean;
  canShowTemplatePreview: boolean;
  /** See `PostPreview`'s own `bodyJson` prop doc — only ever `JSON.stringify`'d into the hidden
   *  form field below. */
  bodyJson: unknown;
  slug: string;
  /** Pre-built by `usePostEditor` — see `PostPreview`'s own doc, branch 2. */
  templatePreviewUrl: string;
  previewFormRef: (node: HTMLFormElement | null) => void;
  previewFormTarget: string;
  expanded: boolean;
  onCollapse: () => void;
  t: Translate;
}) {
  const iframeRef = usePostPreviewIframeEscape({ expanded: expanded, onCollapse: onCollapse });
  const fresh = useThemePreviewFrame({
    // Reuse the authenticated route's consent exclusion; keep the sandbox opaque.
    liveUrl: templatePreviewUrl,
    templateUrl: templatePreviewUrl,
    canShowLiveSite,
  }, { navigation: "entry" });
  if (fresh.canShowLiveSite) {
    return (
      <iframe
        ref={iframeRef}
        key={`${fresh.liveUrl}-${slug}`}
        src={fresh.liveUrl}
        title={t("Post preview")}
        className="page-preview-iframe"
        sandbox={PAGE_PREVIEW_IFRAME_SANDBOX}
        referrerPolicy="no-referrer"
      />
    );
  }
  if (canShowTemplatePreview) {
    return (
      <iframe
        ref={iframeRef}
        key={fresh.templateUrl}
        src={fresh.templateUrl}
        title={t("Post preview")}
        className="page-preview-iframe"
        sandbox={PAGE_PREVIEW_IFRAME_SANDBOX}
        referrerPolicy="no-referrer"
      />
    );
  }
  return (
    <>
      {/* `hidden`, not left out of the DOM — a hidden form still submits fine, and this keeps it
          out of layout without relying on CSS. Posts to the SAME endpoint the branch above's iframe
          `src` points `GET` at; `templateChoice` rides the query string exactly as it does there, so
          a pending template choice AND pending content are both honored by one submit. */}
      <form key={`form-${fresh.templateUrl}`} ref={previewFormRef} method="post" target={previewFormTarget} action={fresh.templateUrl} hidden>
        <input type="hidden" name="bodyJson" value={JSON.stringify(bodyJson)} />
      </form>
      <iframe
        ref={iframeRef}
        key={fresh.templateUrl}
        name={previewFormTarget}
        title={t("Post preview")}
        className="page-preview-iframe"
        sandbox={PAGE_PREVIEW_IFRAME_SANDBOX}
        referrerPolicy="no-referrer"
      />
    </>
  );
}

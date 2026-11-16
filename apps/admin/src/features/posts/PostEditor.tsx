import { VIEW_TABS } from "./editor/view-bar/view-tabs";
import { PostEditorNotices } from "./editor/notices/PostEditorNotices";
import { PostPreview } from "./editor/preview/PostPreview";
import { PostDeleteConfirmDialog } from "./editor/PostDeleteConfirmDialog";
import { PostEditorBody } from "./editor/PostEditorBody";
import { PostEditorTemplateModalGate } from "./editor/template/PostEditorTemplateModalGate";
import { PostEditorToolbarEnd } from "./editor/header/PostEditorToolbarEnd";
import { PostEditorSlugCollisionWarning } from "./editor/notices/PostEditorSlugCollisionWarning";
import { PostEditorActions } from "./editor/header/PostEditorActions";
import { PostEditorHeader } from "./editor/header/PostEditorHeader";
import { type Editor } from "@tiptap/react";
import { agentHandle } from "@jini-ai/core/agent-handles";
import { ConfirmDialog } from "@jini-ai/admin/react";

import { useDevicePreviewDevice } from "../../components/DevicePreview/DevicePreview.hooks";
import { DevicePreviewToggle } from "../../components/DevicePreview/DevicePreviewToggle";
import { resolveTabBarTabIndex, useTabBarKeyboard } from "@jini-ai/ui/tab-strip";

import { useWiredPostEditor, type PostEditorView } from "./hooks/use-post-editor.hooks";
import { usePostSettingsDialog } from "./hooks/use-post-editor-ui.hooks";
import { TermPicker } from "../taxonomy/TermPicker";
import { ContentAnalysisCard } from "../content-analysis/ContentAnalysisCard";
import { PostCoverImage } from "./PostCoverImage";
import { PostSettingsDialog } from "./PostSettingsDialog";
import { Toolbar } from "./editor/toolbar/Toolbar";

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

  // ONE control for both directions, in the same place either way — the way out of the expanded
  // panel must always be visible on screen (the earlier overlay attempt died on an operator who
  // could not find it). The glyph is `aria-hidden`, so `aria-label` is the ONLY thing telling a
  // screen reader or `page.find_elements` which way this goes; keep the two names distinct.


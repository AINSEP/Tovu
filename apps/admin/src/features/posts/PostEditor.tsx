import { ConfirmDialog } from "@jini-ai/admin/react";

import { PostEditorActions } from "./editor/header/PostEditorActions";
import { PostEditorHeader } from "./editor/header/PostEditorHeader";
import { PostEditorSlugCollisionWarning } from "./editor/notices/PostEditorSlugCollisionWarning";
import { PostEditorNotices } from "./editor/notices/PostEditorNotices";
import { PostPreview } from "./editor/preview/PostPreview";
import { PostEditorTemplateModalGate } from "./editor/template/PostEditorTemplateModalGate";
import { PostEditorViewBar } from "./editor/view-bar/PostEditorViewBar";
import { PostDeleteConfirmDialog } from "./editor/PostDeleteConfirmDialog";
import { PostEditorBody } from "./editor/PostEditorBody";
import { PostSavedPanels } from "./editor/PostSavedPanels";
import { useWiredPostEditor } from "./hooks/use-post-editor.hooks";
import { usePostEditorScreen } from "./hooks/use-post-editor-screen.hooks";
import { PostCoverImage } from "./PostCoverImage";
import { PostSettingsDialog } from "./PostSettingsDialog";

/**
 * @file The post/page editor screen — markup only.
 *
 * State, the TipTap instance, the load effect, save, delete, and the dirty guard all live in
 * `hooks/use-post-editor.hooks.ts`. The drop handler and the `data:` URL reader moved to `rules.ts`
 * as pure functions, where they can be driven with a fake `EditorView` instead of a real editor and
 * a real drag gesture.
 *
 * What stays: the root composition — the regions in their on-screen order. The hooks and the per-region
 * prop bundles live in `hooks/use-post-editor-screen.hooks.ts`; each region is a component under `editor/`.
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
  /**
   * The root composition's own hook (state → per-region prop bundles), injected like `usePostEditorHook`
   * so a test can hand the root a ready-made screen state without driving the controller beneath it.
   * Defaulted to the real hook; `usePostEditorHook` is still forwarded into it.
   */
  usePostEditorScreenHook?: typeof usePostEditorScreen;
}

export function PostEditor({ postId, usePostEditorHook = useWiredPostEditor, usePostEditorScreenHook = usePostEditorScreen }: PostEditorProps) {
  const screen = usePostEditorScreenHook({ postId, usePostEditorHook });
  if (screen.status === "error") return <div className="notice error">{screen.error}</div>;
  if (screen.status === "loading") return <div className="notice">{screen.t("Loading editor…")}</div>;
  const { view, t } = screen;

  return (
    <div className="page content-editor-page">
      <PostEditorHeader {...screen.header} />

      <PostEditorNotices {...screen.notices} />
      {/* Edit/Preview toolbar and the template picker — see `PostEditorViewBar`. */}
      <PostEditorViewBar {...screen.viewBar} />

      {/* Directly under the toolbar, not in the header — see `PostEditorActions`' own doc. Placed
          ABOVE the slug-collision warning so the row keeps the position the owner asked for
          (immediately below the toolbar) whether or not that conditional notice is showing. */}
      <PostEditorActions {...screen.actions} />
      {/* Author, scheduled publishing and featured image (2026-10-05) used to be two rows here; they
          moved into the gear's modal (owner, 2026-10-10). The featured image left the modal again
          for the cover slot above the title (owner, 2026-10-11). */}
      <PostSettingsDialog {...screen.settings} />
      {/* Slug-collision override — see `PostEditorSlugCollisionWarning`'s own doc for the tri-state
          contract and history this extracts. */}
      <PostEditorSlugCollisionWarning {...screen.slugCollision} />
      {view === "preview" ? (
        // `bodyJson`/`templatePreviewUrl`/`previewFormRef`/`previewFormTarget` come straight off the
        // hook now (2026-08-14) — see `use-post-editor.hooks.ts`'s own docs on each for why they
        // moved out of this component. `editor` itself is no longer needed here (2026-09-11 — the
        // raw editor-buffer fallback that used to read `editor.getHTML()` was removed, see
        // `PostPreview`'s own doc).
        <PostPreview {...screen.preview} />
      ) : (
        <PostEditorBody {...screen.body} cover={<PostCoverImage {...screen.cover} />} />
      )}
      <PostSavedPanels {...screen.savedPanels} />
      {/* Save with nothing changed (owner, 2026-10-10): a warning, not a disabled button. "Save anyway"
          still sends the content; the server writes nothing if it really is identical. */}
      <ConfirmDialog
        open={screen.unchangedSave.open}
        agentHandle="post-save-unchanged-confirm"
        title={t("Nothing changed")}
        body={<p>{t("Nothing has changed since the last save. Save anyway?")}</p>}
        confirmLabel={t("Save anyway")}
        pending={screen.unchangedSave.pending}
        onConfirm={screen.unchangedSave.onConfirm}
        onCancel={screen.unchangedSave.onCancel}
      />
      <PostDeleteConfirmDialog {...screen.deleteDialog} />
      {/* See `PostEditorTemplateModalGate`'s own doc for why this is conditionally mounted rather
          than always-mounted-with-`open`, and why all three conditions are re-checked here. */}
      <PostEditorTemplateModalGate {...screen.templateGate} />
    </div>
  );
}

import type { ComponentProps } from "react";
import type { Translate } from "@jini-ai/core/text";
import { useTabBarKeyboard } from "@jini-ai/ui/tab-strip";

import { useDevicePreviewDevice } from "@jini-ai/admin/shell/components/DevicePreview/DevicePreview.hooks";
import type { AdminPost } from "@/features/posts/api/posts-api.types";
import type { PostDeleteConfirmDialog } from "../editor/PostDeleteConfirmDialog";
import type { PostEditorBody } from "../editor/PostEditorBody";
import type { PostSavedPanels } from "../editor/PostSavedPanels";
import type { PostEditorActions } from "../editor/header/PostEditorActions";
import type { PostEditorHeader } from "../editor/header/PostEditorHeader";
import type { PostEditorNotices } from "../editor/notices/PostEditorNotices";
import type { PostEditorSlugCollisionWarning } from "../editor/notices/PostEditorSlugCollisionWarning";
import type { PostPreview } from "../editor/preview/PostPreview";
import type { PostEditorTemplateModalGate } from "../editor/template/PostEditorTemplateModalGate";
import { VIEW_TABS } from "../editor/view-bar/view-tabs";
import type { PostEditorViewBar } from "../editor/view-bar/PostEditorViewBar";
import type { PostCoverImage } from "../PostCoverImage";
import type { PostSettingsDialog } from "../PostSettingsDialog";
import { usePostSettingsDialog, type PostSettingsDialogController } from "./use-post-editor-ui.hooks";
import type { PostEditorController, PostEditorView, useWiredPostEditor } from "./use-post-editor.hooks";

/**
 * @file The wiring half of the post/page editor screen: every hook `PostEditor` calls, in the order
 * it called them, and the per-region prop bundles the root spreads onto its section components. No
 * JSX here — the root owns the markup and its order.
 */

/** What the screen needs: the post to edit and the controller hook (injectable for tests). */
export interface PostEditorScreenInput {
  postId: string;
  usePostEditorHook: typeof useWiredPostEditor;
}

/** The props the root hands each region, one bundle per region, named after the region. */
export interface PostEditorReadyScreen {
  status: "ready";
  view: PostEditorView;
  t: Translate;
  header: ComponentProps<typeof PostEditorHeader>;
  notices: ComponentProps<typeof PostEditorNotices>;
  viewBar: ComponentProps<typeof PostEditorViewBar>;
  actions: ComponentProps<typeof PostEditorActions>;
  settings: ComponentProps<typeof PostSettingsDialog>;
  slugCollision: ComponentProps<typeof PostEditorSlugCollisionWarning>;
  preview: ComponentProps<typeof PostPreview>;
  body: Omit<ComponentProps<typeof PostEditorBody>, "cover">;
  cover: ComponentProps<typeof PostCoverImage>;
  savedPanels: ComponentProps<typeof PostSavedPanels>;
  unchangedSave: { open: boolean; pending: boolean; onConfirm: () => void; onCancel: () => void };
  deleteDialog: ComponentProps<typeof PostDeleteConfirmDialog>;
  templateGate: ComponentProps<typeof PostEditorTemplateModalGate>;
}

/** The screen's three states: nothing yet, a load failure with no post to show, or the editor. */
export type PostEditorScreen =
  | { status: "loading"; t: Translate }
  | { status: "error"; error: string }
  | PostEditorReadyScreen;

interface ReadyInput {
  ctrl: PostEditorController;
  post: AdminPost;
  kindLabel: "post" | "page";
  onViewTabsKeyDown: ComponentProps<typeof PostEditorViewBar>["onViewTabsKeyDown"];
  device: ReturnType<typeof useDevicePreviewDevice>;
  settingsDialog: PostSettingsDialogController;
}

function headerBundle({ ctrl, post, kindLabel }: ReadyInput): PostEditorReadyScreen["header"] {
  const { confirmLeave, title, setTitle, slug, setSlug, t } = ctrl;
  return { kindLabel, confirmLeave, title, setTitle, slug, setSlug, post, t };
}

function noticesBundle({ ctrl, post }: ReadyInput): PostEditorReadyScreen["notices"] {
  return {
    recoverableDraft: ctrl.recoverableDraft,
    serverUpdatedAt: post.updatedAt,
    restoreRecoveredDraft: ctrl.restoreRecoveredDraft,
    discardRecoveredDraft: ctrl.discardRecoveredDraft,
    autosaveStaleBasis: ctrl.autosaveStaleBasis,
    saveConflict: ctrl.saveConflict,
    saveOverwritingConflict: ctrl.saveOverwritingConflict,
    dismissSaveConflict: ctrl.dismissSaveConflict,
    pendingExternalVersion: ctrl.pendingExternalVersion,
    loadExternalChange: ctrl.loadExternalChange,
    dismissExternalChange: ctrl.dismissExternalChange,
    t: ctrl.t,
  };
}

function viewBarBundle({ ctrl, post, onViewTabsKeyDown, device }: ReadyInput): PostEditorReadyScreen["viewBar"] {
  return {
    view: ctrl.view,
    setView: ctrl.setView,
    onViewTabsKeyDown,
    device: device.device,
    setDevice: device.setDevice,
    bodyFormat: post.bodyFormat,
    availableTemplates: ctrl.availableTemplates,
    templateChoice: ctrl.templateChoice,
    setTemplateChoice: ctrl.setTemplateChoice,
    onViewTemplateClick: ctrl.onViewTemplateClick,
    t: ctrl.t,
  };
}

function actionsBundle({ ctrl, kindLabel, settingsDialog }: ReadyInput): PostEditorReadyScreen["actions"] {
  return {
    message: ctrl.message,
    error: ctrl.error,
    status: ctrl.status,
    setStatus: ctrl.setStatus,
    saving: ctrl.saving,
    onPublish: ctrl.onPublish,
    onSave: ctrl.onSave,
    onDeleteClick: ctrl.onDeleteClick,
    onOpenSettings: settingsDialog.openDialog,
    kindLabel,
    t: ctrl.t,
  };
}

function settingsBundle({ ctrl, kindLabel, settingsDialog }: ReadyInput): PostEditorReadyScreen["settings"] {
  return {
    dialog: settingsDialog,
    kindLabel,
    author: ctrl.author,
    setAuthor: ctrl.setAuthor,
    showAuthor: ctrl.showAuthor,
    setShowAuthor: ctrl.setShowAuthor,
    publishAtInput: ctrl.publishAtInput,
    setPublishAtInput: ctrl.setPublishAtInput,
    scheduled: ctrl.scheduled,
    t: ctrl.t,
  };
}

function slugCollisionBundle({ ctrl }: ReadyInput): PostEditorReadyScreen["slugCollision"] {
  return {
    hasSlugCollision: ctrl.hasSlugCollision,
    overridesThemePage: ctrl.overridesThemePage,
    setOverridesThemePage: ctrl.setOverridesThemePage,
    t: ctrl.t,
  };
}

function previewBundle({ ctrl, post, device }: ReadyInput): PostEditorReadyScreen["preview"] {
  return {
    postId: post.id,
    bodyJson: ctrl.bodyJson,
    slug: ctrl.slug,
    status: ctrl.status,
    scheduled: ctrl.scheduled,
    dirty: ctrl.dirty,
    contentDirty: ctrl.contentDirty,
    templatePreviewUrl: ctrl.templatePreviewUrl,
    previewFormRef: ctrl.previewFormRef,
    previewFormTarget: ctrl.previewFormTarget,
    t: ctrl.t,
    width: device.width,
    expanded: ctrl.previewExpanded,
    onToggleExpanded: ctrl.togglePreviewExpanded,
  };
}

function bodyBundles({ ctrl, post, kindLabel }: ReadyInput): Pick<PostEditorReadyScreen, "body" | "cover"> {
  return {
    body: { editor: ctrl.editor, mentionablePosts: ctrl.mentionablePosts, currentPostId: post.id, t: ctrl.t },
    cover: {
      bodyFormat: post.bodyFormat,
      featuredMediaId: ctrl.featuredMediaId,
      setFeaturedMediaId: ctrl.setFeaturedMediaId,
      kind: kindLabel,
      hideCoverImageInBody: ctrl.hideCoverImageInBody,
      setHideCoverImageInBody: ctrl.setHideCoverImageInBody,
      t: ctrl.t,
    },
  };
}

function dialogBundles({ ctrl, post, kindLabel }: ReadyInput): Pick<PostEditorReadyScreen, "unchangedSave" | "deleteDialog" | "templateGate"> {
  return {
    unchangedSave: {
      open: ctrl.confirmingUnchangedSave,
      pending: ctrl.saving,
      onConfirm: ctrl.onUnchangedSaveConfirm,
      onCancel: ctrl.onUnchangedSaveCancel,
    },
    deleteDialog: {
      open: ctrl.confirmingDelete,
      post,
      kindLabel,
      t: ctrl.t,
      pending: ctrl.deleting,
      onConfirm: ctrl.remove,
      onCancel: ctrl.onDeleteCancel,
    },
    templateGate: {
      show: ctrl.showTemplateModal,
      templateChoice: ctrl.templateChoice,
      activeThemeId: ctrl.activeThemeId,
      activeThemeTier: ctrl.activeThemeTier,
      activeThemeApiVersion: ctrl.activeThemeApiVersion,
      onClose: ctrl.onCloseTemplateModal,
      confirmLeave: ctrl.confirmLeave,
      t: ctrl.t,
    },
  };
}

function buildReadyScreen(input: ReadyInput): PostEditorReadyScreen {
  return {
    status: "ready",
    view: input.ctrl.view,
    t: input.ctrl.t,
    header: headerBundle(input),
    notices: noticesBundle(input),
    viewBar: viewBarBundle(input),
    actions: actionsBundle(input),
    settings: settingsBundle(input),
    slugCollision: slugCollisionBundle(input),
    preview: previewBundle(input),
    ...bodyBundles(input),
    savedPanels: { post: input.post, title: input.ctrl.title, bodyJson: input.ctrl.bodyJson },
    ...dialogBundles(input),
  };
}

/**
 * Calls the controller hook and the screen's own view-chrome hooks unconditionally and in the order
 * `PostEditor` always did — above the loading/error branch, because `use*` has to run on every render
 * for the rules-of-hooks lint even though `useTabBarKeyboard` holds no state — then returns the
 * screen's state: loading, load error with no post to show, or the ready region bundles.
 *
 * @param required `postId` and the controller hook to call with it.
 * @returns A discriminated screen state; the root renders markup from it and never touches `post`
 *   before `status === "ready"`.
 */
export function usePostEditorScreen({ postId, usePostEditorHook }: PostEditorScreenInput, _optional = {}): PostEditorScreen {
  const ctrl = usePostEditorHook({ postId });
  // Above the early returns below: `use*` has to be called unconditionally for the rules-of-hooks
  // lint even though this one holds no state of its own.
  const { onKeyDown: onViewTabsKeyDown } = useTabBarKeyboard({ tabs: VIEW_TABS, activeId: ctrl.view, onChange: (id) => ctrl.setView(id as PostEditorView) });
  // Preview width (2026-09-22) — pure view chrome with nothing to inject, kept out of the injected
  // controller the same way `ThemeExplore.tsx`'s own `device` is.
  const device = useDevicePreviewDevice();
  const settingsDialog = usePostSettingsDialog();

  const { post, error, t } = ctrl;
  if (error && !post) return { status: "error", error };
  if (!post) return { status: "loading", t };

  const kindLabel = post.kind === "page" ? "page" : "post";
  return buildReadyScreen({ ctrl, post, kindLabel, onViewTabsKeyDown, device, settingsDialog });
}

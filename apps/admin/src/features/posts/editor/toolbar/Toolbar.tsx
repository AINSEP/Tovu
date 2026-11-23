import { useEditorState, type Editor } from "@tiptap/react";
import type { Translate } from "@jini-ai/core/text";

import type { AdminPost } from "@jini-ai/admin/posts/api/posts-api.types";
import { useToolbarOverflow } from "@jini-ai/admin/posts/hooks/use-post-editor-ui.hooks";
import type { PostUrlDialogController } from "../../hooks/use-post-url-dialog.hooks";
import { ToolbarColorGroup } from "./ToolbarColorGroup";
import { ToolbarCharacterCount } from "./ToolbarCharacterCount";
import { ToolbarAlignGroup, ToolbarBlockGroup, ToolbarHeadingGroup, ToolbarHistoryGroup, ToolbarMarksGroup } from "./ToolbarFormattingGroup";
import { ToolbarInsertControls } from "./insert-controls";
import { ToolbarOverflowMenu } from "@jini-ai/admin/posts/editor/toolbar/ToolbarOverflowMenu";
import { ToolbarTypographyGroup } from "./ToolbarTypographyGroup";
import { probeToolbar } from "./toolbar-state";

/** Formatting toolbar wired to the live editor. Active state stays in sync via useEditorState. */
export function Toolbar({
  editor,
  mentionablePosts,
  currentPostId,
  urlDialog,
  t,
  useEditorStateHook = useEditorState,
  useToolbarOverflowHook = useToolbarOverflow,
}: {
  editor: Editor;
  /** Mention feature (2026-08-11) — every other post/page this workspace has, unfiltered (this
   *  component excludes `currentPostId` at render time). See `use-post-editor.hooks.ts`'s own
   *  field doc for why an empty array here means "loading or fetch failed", not "no other posts". */
  mentionablePosts: AdminPost[];
  currentPostId: string;
  urlDialog: PostUrlDialogController;
  t: Translate;
  useEditorStateHook?: typeof useEditorState;
  useToolbarOverflowHook?: typeof useToolbarOverflow;
}) {
  const s = useEditorStateHook({
    editor,
    selector: ({ editor }) => probeToolbar({ editor }),
  });

  const overflow = useToolbarOverflowHook();

  return (
    <div ref={overflow.toolbarRef} className="editor-toolbar" role="toolbar" aria-label={t("Formatting")} data-more-open={overflow.open}>
      <ToolbarMarksGroup editor={editor} state={s} t={t} overflow={overflow} urlDialog={urlDialog} />
      <ToolbarHeadingGroup editor={editor} state={s} t={t} overflow={overflow} />
      <ToolbarBlockGroup editor={editor} state={s} t={t} overflow={overflow} />
      <ToolbarAlignGroup editor={editor} state={s} t={t} />
      <ToolbarHistoryGroup editor={editor} state={s} t={t} />
      <ToolbarColorGroup editor={editor} state={s} t={t} />
      <ToolbarTypographyGroup editor={editor} state={s} t={t} />
      <ToolbarInsertControls editor={editor} mentionablePosts={mentionablePosts} currentPostId={currentPostId} urlDialog={urlDialog} t={t} />
      <ToolbarOverflowMenu overflow={overflow} t={t} />
      <ToolbarCharacterCount state={s} t={t} />
    </div>
  );
}

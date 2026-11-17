import type { AdminPost } from "@/features/posts/api/posts-api.types";
import { PostUrlDialog } from "../PostUrlDialog";
import { BubbleFormattingMenu } from "./bubble-menu/BubbleFormattingMenu";
import { Toolbar } from "./toolbar/Toolbar";
import { usePostUrlDialog } from "../hooks/use-post-url-dialog.hooks";
import { agentHandle } from "@jini-ai/core/agent-handles";
import { type Translate } from "@jini-ai/core/text";
import DragHandle from "@tiptap/extension-drag-handle-react";
import { type Editor, EditorContent } from "@tiptap/react";
import type { ReactNode } from "react";

/**
 * The Edit-view pane — formatting toolbar, bubble menu, drag handle, and the TipTap body itself.
 * Extracted out of `PostEditor` (complexity-ceiling pass, 2026-08-20) as the `view === "preview"`
 * ternary's alternate branch: three independent `editor ? ... : null` gates (the toolbar, the
 * bubble menu, and the drag handle all wait on the same "has TipTap mounted yet" condition) were the
 * last cluster of `PostEditor`'s own branching once the toolbar-end/slug-collision blocks above were
 * pulled out — same "top-level function scores its own branches independently" reasoning those two
 * already state.
 */
export function PostEditorBody({
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

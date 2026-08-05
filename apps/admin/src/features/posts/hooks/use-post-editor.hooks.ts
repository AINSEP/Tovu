import { useEffect, useState } from "react";
import { useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";

import { api, type AdminPost } from "../../../lib/api";
import { WidgetEmbed } from "../../../lib/widget-embed-extension";
import { navigate } from "../../../lib/router";
import { useDirtyGuard } from "../../../hooks/use-dirty-guard.hooks";
import { handleImageDrop } from "../rules";

/**
 * @file Everything the post/page EDITOR does, so `PostEditor.tsx` is only markup.
 *
 * Extracted verbatim — same state, same effect keys, same error strings, same `original`
 * re-baselining. The doc comments moved with the code they describe; several are decision records
 * (why the delete copy refuses to promise recoverability, why `original` is captured from
 * `editor.getJSON()` rather than the server payload) and a comment parted from its code stops being
 * read.
 *
 * Naming follows `src/hooks/use-settings-slice.hooks.ts`. Feature-local: nothing outside
 * `features/posts` needs it.
 */

/** What `useDirtyGuard` compares — every field this editor lets an operator change. `bodyJson` is
 *  typed loosely (not TipTap's `JSONContent`) since the guard only ever serializes it for
 *  comparison, never reads its shape. */
export interface PostFormState {
  title: string;
  slug: string;
  status: "draft" | "published";
  bodyJson: unknown;
}

export interface PostEditorController {
  /** `null` until the post loads — the caller renders a loading state. */
  post: AdminPost | null;
  /** `null` until TipTap has mounted; the toolbar and `EditorContent` both gate on it. */
  editor: Editor | null;
  title: string;
  setTitle: (title: string) => void;
  slug: string;
  setSlug: (slug: string) => void;
  status: "draft" | "published";
  setStatus: (status: "draft" | "published") => void;
  message: string | null;
  error: string | null;
  confirmingDelete: boolean;
  setConfirmingDelete: (open: boolean) => void;
  deleting: boolean;
  /** `false` when the operator declined to discard unsaved edits — the caller must then
   *  `preventDefault()` the navigation. */
  confirmLeave: () => boolean;
  save: (statusOverride?: "draft" | "published") => Promise<void>;
  remove: () => Promise<void>;
}

export function usePostEditor(postId: string): PostEditorController {
  const [post, setPost] = useState<AdminPost | null>(null);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [status, setStatus] = useState<"draft" | "published">("draft");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // TipTap's content lives in the editor's own imperative state, not React state, so nothing here
  // re-renders when the body changes on its own — `onUpdate` below exists solely to force one, so
  // `current.bodyJson` (read fresh via `editor.getJSON()` every render) actually gets re-evaluated
  // after a keystroke. The counter's value itself is never read.
  const [, setBodyVersion] = useState(0);
  // Snapshot of the last loaded-or-saved state for `useDirtyGuard` to diff against (audit finding:
  // no editor screen tracks this at all today — confirmed live losing an edit on this exact
  // screen). `null` until the post has loaded AND the editor has actually applied that content —
  // see the load effect below for why both conditions matter.
  const [original, setOriginal] = useState<PostFormState | null>(null);
  // Drives `ConfirmDialog`'s `open` prop for the Delete action — replaces the previous
  // `window.confirm` gate. `deleting` is the dialog's `pending` (in-flight) flag, separate from
  // `confirmingDelete` itself so the dialog can stay open, disabled, mid-request rather than
  // closing before the request resolves.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const editor = useEditor({
    extensions: [StarterKit, Image, WidgetEmbed],
    content: "",
    editorProps: {
      handleDrop: (view, event, _slice, moved) => handleImageDrop(view, event, moved),
    },
    onUpdate: () => setBodyVersion((v) => v + 1),
  });

  useEffect(() => {
    setPost(null);
    setError(null);
    api
      .getPost(postId)
      .then(({ post }) => {
        setPost(post);
        setTitle(post.title);
        setSlug(post.slug);
        setStatus(post.status);
        if (editor) {
          editor.commands.setContent(post.bodyJson as never);
          // Captured via `editor.getJSON()` right after `setContent`, not `post.bodyJson` as
          // loaded — both sides of the later dirty comparison are then produced by the exact same
          // serialization, so a schema-normalization difference between the server's stored JSON
          // and TipTap's own round-trip can never register as a false "unsaved change" on a
          // freshly-opened, untouched post.
          setOriginal({ title: post.title, slug: post.slug, status: post.status, bodyJson: editor.getJSON() });
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : "failed to load post"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId, editor === null]);

  const { confirmLeave } = useDirtyGuard<PostFormState>(
    { title, slug, status, bodyJson: editor?.getJSON() ?? null },
    original,
  );

  /**
   * Persists title/slug/body, optionally forcing `status` to a specific value first —
   * `statusOverride` is omitted for the plain Save button (keeps whatever the status select is
   * currently set to) and passed `"published"` by the Publish button, so publishing is one click
   * ("save this draft and put it live") instead of "flip the dropdown to Published, then remember
   * to also click Save" — two actions an operator can do out of order or forget the second half of.
   * Re-baselines `original` either way, so a publish also clears the dirty guard, same as an
   * ordinary save.
   */
  async function save(statusOverride?: "draft" | "published") {
    if (!editor) return;
    setMessage(null);
    setError(null);
    const nextStatus = statusOverride ?? status;
    try {
      const bodyJson = editor.getJSON() as Record<string, unknown>;
      const { post: saved } = await api.updatePost({ id: postId }, { title, slug, status: nextStatus, bodyJson });
      setPost(saved);
      setStatus(nextStatus);
      setMessage(`${statusOverride === "published" ? "Published" : "Saved"} · version ${saved.version}`);
      setOriginal({ title, slug, status: nextStatus, bodyJson });
    } catch (e) {
      setError(e instanceof Error ? e.message : statusOverride === "published" ? "publish failed" : "save failed");
    }
  }

  /**
   * Soft delete — distinct from the Draft/Published status select, and the copy in the view says so
   * explicitly: the select changes `status` (unpublish — content stays, drops off the site, still
   * editable here); this moves the whole row to the trash (server/routes/admin/posts/delete.ts's
   * soft-delete route).
   *
   * The `ConfirmDialog` body and the `post-delete` agentHandle label state only the observable
   * consequence and deliberately do NOT claim the delete is "recoverable" or "not permanent", even
   * though the server route genuinely is a soft, revertible delete. There is no restore path an
   * operator can reach from this product today: no change-set-revert UI, no `api.ts` method for it,
   * and `Recovery.tsx` is a different, much heavier whole-database snapshot restore (not a per-row
   * undo). Promising a recovery the operator cannot perform would be worse than promising nothing.
   * Equally, do not swap it for "permanently delete" / "cannot be undone" — that overcorrects into
   * the opposite lie, since the row genuinely is recoverable server-side, just not from here. Do
   * not add either claim back in without first building/removing the corresponding capability.
   *
   * Calls `api.deletePost` (kind-blind), not `api.deletePage`, matching every other call this
   * editor already makes (`getPost`/`updatePost`) — this component is shared between posts and
   * pages via the same `/admin/posts/{id}` route (Pages.tsx's own file header), so it deletes
   * whatever row `postId` names rather than assuming its kind. `post.kind` (loaded from the server
   * response) is used only for display copy and for choosing which list to return to.
   *
   * Only `deleting`/`confirmingDelete` are reset on failure, not success — a successful delete
   * navigates away, and the original code never touched post-navigation state either.
   */
  async function remove() {
    if (!post) return;
    setMessage(null);
    setError(null);
    setDeleting(true);
    try {
      await api.deletePost(postId);
      navigate(post.kind === "page" ? "/pages" : "/posts");
    } catch (e) {
      setError(e instanceof Error ? e.message : "delete failed");
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  return {
    post,
    editor,
    title,
    setTitle,
    slug,
    setSlug,
    status,
    setStatus,
    message,
    error,
    confirmingDelete,
    setConfirmingDelete,
    deleting,
    confirmLeave,
    save,
    remove,
  };
}

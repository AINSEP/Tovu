import { useEffect, useState } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import type { EditorView } from "@tiptap/pm/view";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { agentHandle } from "@jini-ai/agentic";
import { api, type AdminPost } from "../lib/api";
import { WidgetEmbed, WidgetEmbedInsertControl } from "../lib/widget-embed-extension";
import { siteUrl } from "../lib/site-url";
import { navigate } from "../lib/router";
import { useDirtyGuard } from "../hooks/use-dirty-guard.hooks";

/** Reads a browser `File` into a full `data:` URL (mirrors Media.tsx's upload helper, but keeps the prefix). */
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("failed to read file"));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });
}

/**
 * Drag-and-drop image support: a dropped local file is inlined as a `data:` URL (no media-library
 * serving route exists yet to reference instead — see PostEditor's file header note); a dropped
 * image URL (e.g. dragged from another browser tab) is inserted directly.
 */
function handleImageDrop(view: EditorView, event: DragEvent, moved: boolean): boolean {
  if (moved) return false; // internal content reorder, not an external drop
  const insertAt = () => view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? view.state.selection.to;

  const files = Array.from(event.dataTransfer?.files ?? []).filter((f) => f.type.startsWith("image/"));
  if (files.length > 0) {
    event.preventDefault();
    const pos = insertAt();
    for (const file of files) {
      readFileAsDataUrl(file).then((src) => {
        const node = view.state.schema.nodes.image.create({ src, alt: file.name });
        view.dispatch(view.state.tr.insert(pos, node));
      });
    }
    return true;
  }

  const uri = (event.dataTransfer?.getData("text/uri-list") || event.dataTransfer?.getData("text/plain") || "").trim();
  if (/^https?:\/\//i.test(uri)) {
    event.preventDefault();
    const node = view.state.schema.nodes.image.create({ src: uri });
    view.dispatch(view.state.tr.insert(insertAt(), node));
    return true;
  }

  return false;
}

/** Formatting toolbar wired to the live editor. Active state stays in sync via useEditorState. */
function Toolbar({ editor }: { editor: Editor }) {
  const s = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor?.isActive("bold") ?? false,
      italic: editor?.isActive("italic") ?? false,
      strike: editor?.isActive("strike") ?? false,
      code: editor?.isActive("code") ?? false,
      h1: editor?.isActive("heading", { level: 1 }) ?? false,
      h2: editor?.isActive("heading", { level: 2 }) ?? false,
      h3: editor?.isActive("heading", { level: 3 }) ?? false,
      bullet: editor?.isActive("bulletList") ?? false,
      ordered: editor?.isActive("orderedList") ?? false,
      quote: editor?.isActive("blockquote") ?? false,
      codeBlock: editor?.isActive("codeBlock") ?? false,
      canUndo: editor?.can().undo() ?? false,
      canRedo: editor?.can().redo() ?? false,
    }),
  });

  const chain = () => editor.chain().focus();

  return (
    <div className="editor-toolbar" role="toolbar" aria-label="Formatting">
      <div className="grp">
        <button className={`tb-btn${s.bold ? " on" : ""}`} title="Bold (⌘B)" aria-pressed={s.bold} onClick={() => chain().toggleBold().run()}><b>B</b></button>
        <button className={`tb-btn${s.italic ? " on" : ""}`} title="Italic (⌘I)" aria-pressed={s.italic} onClick={() => chain().toggleItalic().run()}><i>I</i></button>
        <button className={`tb-btn${s.strike ? " on" : ""}`} title="Strikethrough" aria-pressed={s.strike} onClick={() => chain().toggleStrike().run()}><s>S</s></button>
        <button className={`tb-btn${s.code ? " on" : ""}`} title="Inline code" aria-pressed={s.code} onClick={() => chain().toggleCode().run()}>&lt;/&gt;</button>
      </div>
      <div className="grp">
        <button className={`tb-btn${s.h1 ? " on" : ""}`} title="Heading 1" aria-pressed={s.h1} onClick={() => chain().toggleHeading({ level: 1 }).run()}>H1</button>
        <button className={`tb-btn${s.h2 ? " on" : ""}`} title="Heading 2" aria-pressed={s.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()}>H2</button>
        <button className={`tb-btn${s.h3 ? " on" : ""}`} title="Heading 3" aria-pressed={s.h3} onClick={() => chain().toggleHeading({ level: 3 }).run()}>H3</button>
      </div>
      <div className="grp">
        <button className={`tb-btn${s.bullet ? " on" : ""}`} title="Bullet list" aria-pressed={s.bullet} onClick={() => chain().toggleBulletList().run()}>• List</button>
        <button className={`tb-btn${s.ordered ? " on" : ""}`} title="Numbered list" aria-pressed={s.ordered} onClick={() => chain().toggleOrderedList().run()}>1. List</button>
        <button className={`tb-btn${s.quote ? " on" : ""}`} title="Quote" aria-pressed={s.quote} onClick={() => chain().toggleBlockquote().run()}>&ldquo; Quote</button>
        <button className={`tb-btn${s.codeBlock ? " on" : ""}`} title="Code block" aria-pressed={s.codeBlock} onClick={() => chain().toggleCodeBlock().run()}>{"{ }"}</button>
        <button className="tb-btn" title="Divider" onClick={() => chain().setHorizontalRule().run()}>―</button>
      </div>
      <div className="grp">
        <button className="tb-btn" title="Undo (⌘Z)" disabled={!s.canUndo} onClick={() => chain().undo().run()}>↺</button>
        <button className="tb-btn" title="Redo (⌘⇧Z)" disabled={!s.canRedo} onClick={() => chain().redo().run()}>↻</button>
      </div>
      <div className="grp">
        <button
          className="tb-btn"
          title="Insert image by URL"
          onClick={() => {
            const src = window.prompt("Image URL:");
            if (!src) return;
            const alt = window.prompt("Alt text (optional):") ?? "";
            chain().setImage({ src, alt: alt || undefined }).run();
          }}
        >
          Img
        </button>
      </div>
      <div className="grp">
        <WidgetEmbedInsertControl editor={editor} />
      </div>
    </div>
  );
}

/** What `useDirtyGuard` compares — every field this editor lets an operator change. `bodyJson` is
 *  typed loosely (not TipTap's `JSONContent`) since the guard only ever serializes it for
 *  comparison, never reads its shape. */
interface PostFormState {
  title: string;
  slug: string;
  status: "draft" | "published";
  bodyJson: unknown;
}

export function PostEditor(props: { postId: string }) {
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
      .getPost(props.postId)
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
  }, [props.postId, editor === null]);

  const { confirmLeave } = useDirtyGuard<PostFormState>(
    { title, slug, status, bodyJson: editor?.getJSON() ?? null },
    original
  );

  async function save() {
    if (!editor) return;
    setMessage(null);
    setError(null);
    try {
      const bodyJson = editor.getJSON() as Record<string, unknown>;
      const { post: saved } = await api.updatePost({ id: props.postId }, { title, slug, status, bodyJson });
      setPost(saved);
      setMessage(`Saved · version ${saved.version}`);
      // A saved edit is no longer "unsaved" — re-baseline what the dirty check compares against.
      setOriginal({ title, slug, status, bodyJson });
    } catch (e) {
      setError(e instanceof Error ? e.message : "save failed");
    }
  }

  /**
   * Soft delete — distinct from the Draft/Published status select above, and the copy below says
   * so explicitly: the select changes `status` (unpublish — content stays, drops off the site,
   * still editable here); this moves the whole row to the trash (server/routes/admin/posts/
   * delete.ts's soft-delete route).
   *
   * The confirm copy and the `post-delete` agentHandle label below state only the observable
   * consequence and deliberately do NOT claim the delete is "recoverable" or "not permanent",
   * even though the server route genuinely is a soft, revertible delete. There is no restore path
   * an operator can reach from this product today: no change-set-revert UI, no `api.ts` method
   * for it, and `Recovery.tsx` is a different, much heavier whole-database snapshot restore (not
   * a per-row undo). Promising a recovery the operator cannot perform would be worse than
   * promising nothing. Equally, do not swap it for "permanently delete" / "cannot be undone" —
   * that overcorrects into the opposite lie, since the row genuinely is recoverable server-side,
   * just not from here. Do not add either claim back in without first building/removing the
   * corresponding capability.
   *
   * Calls `api.deletePost` (kind-blind), not `api.deletePage`, matching every other call this
   * editor already makes (`getPost`/`updatePost`) — this component is shared between posts and
   * pages via the same `/admin/posts/{id}` route (Pages.tsx's own file header), so it deletes
   * whatever row `props.postId` names rather than assuming its kind. `post.kind` (loaded from the
   * server response) is used only for display copy and for choosing which list to return to.
   */
  async function remove() {
    if (!post) return;
    setMessage(null);
    setError(null);
    const kindLabel = post.kind === "page" ? "page" : "post";
    if (
      !window.confirm(
        `Move this ${kindLabel} ("${post.title}") to trash? It will disappear from the site and from the ${kindLabel}s list.`
      )
    ) {
      return;
    }
    try {
      await api.deletePost(props.postId);
      navigate(post.kind === "page" ? "/pages" : "/posts");
    } catch (e) {
      setError(e instanceof Error ? e.message : "delete failed");
    }
  }

  if (error && !post) return <div className="notice error">{error}</div>;
  if (!post) return <div className="notice">Loading editor…</div>;

  return (
    <div className="editor-page">
      <div
        className="editor-header"
        {...agentHandle("post-header", {
          role: "region",
          label: "Editor header — back link, save status, publish state and the Save button",
        })}
      >
        {/* Audit finding: no editor screen warns before an in-app navigation discards unsaved
            edits — confirmed live on this exact screen (edit the title, click this link, the
            edit is gone with no dialog). `preventDefault()` here also stops `router.ts`'s
            document-level click interceptor from firing `navigate()`, since that listener's
            first check is `event.defaultPrevented` — no change to `router.ts` needed. */}
        <a
          href="/admin/posts"
          onClick={(e) => {
            if (!confirmLeave()) e.preventDefault();
          }}
          {...agentHandle("post-back-to-list", { role: "link", label: "Back to the list of all posts" })}
        >
          ← Posts
        </a>
        <div className="editor-actions">
          {message ? <span className="save-ok">{message}</span> : null}
          {error ? <span className="save-error">{error}</span> : null}
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as "draft" | "published")}
            {...agentHandle("post-status", {
              role: "field",
              label:
                "Whether this post is a draft or published — set with page.select_option, not click. " +
                "Setting to Draft unpublishes it (content is kept, just hidden from the site); this is " +
                "NOT the same as Delete, which moves the whole entry to the trash.",
            })}
          >
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
          <button
            onClick={save}
            {...agentHandle("post-save", { role: "button", label: "Save this post's title, slug, status and body" })}
          >
            Save
          </button>
          <button
            type="button"
            className="btn-danger"
            onClick={remove}
            {...agentHandle("post-delete", {
              role: "button",
              label:
                "Move this post/page to the trash — different from unpublishing (the Draft/Published " +
                "field above): the entry disappears from every list and the site. Asks for confirmation " +
                "before deleting.",
            })}
          >
            Delete
          </button>
        </div>
      </div>
      <input
        className="editor-title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Post title"
        {...agentHandle("post-title", { role: "field", label: "This post's title" })}
      />
      <div className="editor-slug">
        /{" "}
        <input
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          {...agentHandle("post-slug", { role: "field", label: "URL slug this post is published at" })}
        />
        <a
          href={siteUrl(`/${post.slug}`)}
          target="_blank"
          rel="noreferrer"
          {...agentHandle("post-view-live", { role: "link", label: "Open this post on the public site in a new tab" })}
        >
          view ↗
        </a>
      </div>
      <div
        className="editor-shell"
        {...agentHandle("post-editor-shell", {
          role: "region",
          label: "Formatting toolbar and the post body editor",
        })}
      >
        {editor ? <Toolbar editor={editor} /> : null}
        {/* `role: "field"` rather than `region`: this is a TipTap `contenteditable`, which the
            page driver treats as a fillable rich-text surface (see its `isEditableRegion`), so an
            agent can read and write the body through the same field verbs it uses for an input. */}
        <div
          className="editor-body"
          {...agentHandle("post-body", { role: "field", label: "The post's rich-text body content" })}
        >
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}

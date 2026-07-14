import { useEffect, useState } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import type { EditorView } from "@tiptap/pm/view";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { api, type AdminPost } from "../lib/api";

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
    </div>
  );
}

export function PostEditor(props: { postId: string }) {
  const [post, setPost] = useState<AdminPost | null>(null);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [status, setStatus] = useState<"draft" | "published">("draft");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const editor = useEditor({
    extensions: [StarterKit, Image],
    content: "",
    editorProps: {
      handleDrop: (view, event, _slice, moved) => handleImageDrop(view, event, moved),
    },
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
        editor?.commands.setContent(post.bodyJson as never);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "failed to load post"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.postId, editor === null]);

  async function save() {
    if (!editor) return;
    setMessage(null);
    setError(null);
    try {
      const { post: saved } = await api.updatePost(props.postId, {
        title,
        slug,
        status,
        bodyJson: editor.getJSON() as Record<string, unknown>,
      });
      setPost(saved);
      setMessage(`Saved · version ${saved.version}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "save failed");
    }
  }

  if (error && !post) return <div className="notice error">{error}</div>;
  if (!post) return <div className="notice">Loading editor…</div>;

  return (
    <div className="editor-page">
      <div className="editor-header">
        <a href="#/posts">← Posts</a>
        <div className="editor-actions">
          {message ? <span className="save-ok">{message}</span> : null}
          {error ? <span className="save-error">{error}</span> : null}
          <select value={status} onChange={(e) => setStatus(e.target.value as "draft" | "published")}>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
          <button onClick={save}>Save</button>
        </div>
      </div>
      <input className="editor-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Post title" />
      <div className="editor-slug">
        /{" "}
        <input value={slug} onChange={(e) => setSlug(e.target.value)} />
        <a href={`/${post.slug}`} target="_blank" rel="noreferrer">
          view ↗
        </a>
      </div>
      <div className="editor-shell">
        {editor ? <Toolbar editor={editor} /> : null}
        <div className="editor-body">
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}

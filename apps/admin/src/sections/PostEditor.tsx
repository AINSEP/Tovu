import { useEffect, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { api, type AdminPost } from "../lib/api";

export function PostEditor(props: { postId: string }) {
  const [post, setPost] = useState<AdminPost | null>(null);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [status, setStatus] = useState<"draft" | "published">("draft");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const editor = useEditor({ extensions: [StarterKit], content: "" });

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
      <div className="editor-body">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

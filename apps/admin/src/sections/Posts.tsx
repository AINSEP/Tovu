import { useEffect, useState } from "react";
import { api, type AdminPost } from "../lib/api";
import { siteUrl } from "../lib/site-url";
import { formatTimestamp } from "../lib/format-timestamp";
import { navigate } from "../lib/router";
import { ConfirmButton } from "../components/ConfirmButton";

export function Posts() {
  const [posts, setPosts] = useState<AdminPost[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    api
      .listPosts()
      .then((r) => setPosts(r.posts.map((entry) => entry.post)))
      .catch((e) => setError(e instanceof Error ? e.message : "failed to load posts"));
  }, []);

  async function createPost() {
    setCreating(true);
    setError(null);
    try {
      const { post } = await api.createPost("Untitled");
      navigate(`/posts/${post.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to create post");
      setCreating(false);
    }
  }

  /** Soft delete — see Pages.tsx's `removePage` (the twin of this function) for the full
   * rationale behind the confirm copy: it states only the observable consequence and
   * deliberately does not claim recoverability, because no restore path is reachable from this
   * product today even though the underlying route is a genuine soft delete. Do not add
   * "recoverable"/"not permanent" (unreachable promise) or "permanently"/"cannot be undone"
   * (the opposite lie) without first changing what's actually true.
   *
   * Confirmation now gates via `ConfirmButton`'s two-click in-place control, not `window.confirm`
   * — a straight upgrade (MSG-03), not the "don't mass-migrate an already-guarded screen" churn:
   * this screen's row of per-post Delete buttons was the exact "wall of red" the makeover pass
   * flagged, since every row rendered full `.btn-danger` styling at rest, before any decision was
   * made. The disclosure that used to live only in the `window.confirm` dialog text now lives in
   * the button's `aria-label`, so it reaches the operator up front rather than only after they've
   * already clicked Delete once. */
  async function removePost(post: AdminPost) {
    setDeletingId(post.id);
    setError(null);
    try {
      await api.deletePost(post.id);
      setPosts((prev) => (prev ? prev.filter((p) => p.id !== post.id) : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to delete post");
    } finally {
      setDeletingId(null);
    }
  }

  // `error && !posts` (not just `error`): once the list has loaded, a later failure (create,
  // delete) surfaces as an inline banner above the table instead of blanking the whole screen —
  // matches Pages.tsx/Media.tsx/Comments.tsx.
  if (error && !posts) return <div className="notice error">{error}</div>;
  if (!posts) return <div className="notice">Loading posts…</div>;

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">Content</p>
          <h1 className="page-title">Posts</h1>
          <p className="page-description">Manage and publish every post on this site.</p>
        </div>
        <div className="page-actions">
          <button onClick={createPost} disabled={creating}>
            {creating ? "Creating…" : "New Post"}
          </button>
        </div>
      </div>
      {error ? <div className="notice error">{error}</div> : null}
      {posts.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <p>No posts yet.</p>
            <p className="page-description">Create your first post to get started.</p>
          </div>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="list-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Slug</th>
                <th>Status</th>
                <th>Updated</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {posts.map((post) => (
                <tr key={post.id}>
                  <td>
                    <a href={`/admin/posts/${post.id}`}>{post.title}</a>
                  </td>
                  <td>
                    <a href={siteUrl(`/${post.slug}`)} target="_blank" rel="noreferrer">
                      /{post.slug}
                    </a>
                  </td>
                  <td>
                    <span className={`status status-${post.status}`}>{post.status}</span>
                  </td>
                  <td>{formatTimestamp(post.updatedAt)}</td>
                  <td>
                    <ConfirmButton
                      label="Delete"
                      confirmLabel="Confirm delete"
                      destructive
                      pending={deletingId === post.id}
                      onConfirm={() => removePost(post)}
                      ariaLabel={`Move "${post.title}" to trash — it will disappear from the site and from this list`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { api, type AdminPost } from "../lib/api";
import { siteUrl } from "../lib/site-url";
import { formatTimestamp } from "../lib/format-timestamp";
import { navigate } from "../lib/router";
import { RowMenu, type RowMenuItem } from "../components/RowMenu";
import { ConfirmDialog } from "../components/ConfirmDialog";

export function Posts() {
  const [posts, setPosts] = useState<AdminPost[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  // In-flight row action (Disable or the confirmed Delete) — one at a time, same `rowSavingId`
  // convention `Roles.tsx`'s `onDeleteRole` already uses, per `ConfirmButton`'s own doc comment.
  const [rowSavingId, setRowSavingId] = useState<string | null>(null);
  // The post a `RowMenu` "Delete" selection is asking to confirm — `null` when the dialog is
  // closed. `ConfirmDialog` stays mounted unconditionally below (see its own doc comment on why);
  // this is what drives its `open` prop.
  const [pendingDelete, setPendingDelete] = useState<AdminPost | null>(null);

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

  /** Unpublishes so the row is no longer publicly viewable — a reversible, access-affecting
   *  action (not destructive: no `ConfirmDialog`, matching `ConfirmButton`'s own warning-vs-
   *  destructive distinction). Only ever called for a `status === "published"` row — `RowMenu`'s
   *  item list below omits "Disable" entirely once a post is already a draft, rather than
   *  rendering it disabled with no explanation. */
  async function disablePost(post: AdminPost) {
    setRowSavingId(post.id);
    setError(null);
    try {
      const { post: updated } = await api.updatePost({ id: post.id }, { status: "draft" });
      setPosts((prev) => (prev ? prev.map((p) => (p.id === updated.id ? updated : p)) : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to disable post");
    } finally {
      setRowSavingId(null);
    }
  }

  /** Soft delete — see Pages.tsx's `removePage` (the twin of this function) for the full
   * rationale behind the confirm copy: it states only the observable consequence and
   * deliberately does not claim recoverability, because no restore path is reachable from this
   * product today even though the underlying route is a genuine soft delete. Do not add
   * "recoverable"/"not permanent" (unreachable promise) or "permanently"/"cannot be undone"
   * (the opposite lie) without first changing what's actually true.
   *
   * Confirmation now gates via a `ConfirmDialog` modal, reached through `RowMenu`'s "Delete" item,
   * rather than `ConfirmButton`'s in-place two-click control or `window.confirm` — a further
   * upgrade over MSG-03's `ConfirmButton` pass: that component was itself chosen at the time
   * because `styles.css` was locked to a concurrently-editing agent and a modal needed new markup/
   * CSS this pass could not add (see `ConfirmButton.tsx`'s own file header). Neither constraint
   * holds for this dispatch, and a modal disclosure ("Move "X" to trash? It will disappear from
   * the site and from this list.") reads as a deliberate decision point rather than a label change
   * on a button already sitting in a menu the operator just opened. */
  async function removePost() {
    if (!pendingDelete) return;
    const post = pendingDelete;
    setRowSavingId(post.id);
    setError(null);
    try {
      await api.deletePost(post.id);
      setPosts((prev) => (prev ? prev.filter((p) => p.id !== post.id) : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to delete post");
    } finally {
      setRowSavingId(null);
      setPendingDelete(null);
    }
  }

  function rowMenuItems(post: AdminPost): RowMenuItem[] {
    const items: RowMenuItem[] = [{ key: "edit", label: "Edit", onSelect: () => navigate(`/posts/${post.id}`) }];
    if (post.status === "published") {
      items.push({ key: "disable", label: "Disable", onSelect: () => disablePost(post) });
    }
    items.push({ key: "delete", label: "Delete", destructive: true, onSelect: () => setPendingDelete(post) });
    return items;
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
                <th>More</th>
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
                    <RowMenu triggerLabel={`Actions for "${post.title}"`} items={rowMenuItems(post)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Move to trash?"
        body={
          pendingDelete ? (
            <p>
              Move &quot;{pendingDelete.title}&quot; to trash? It will disappear from the site and from this list.
            </p>
          ) : null
        }
        confirmLabel="Move to trash"
        destructive
        pending={pendingDelete !== null && rowSavingId === pendingDelete.id}
        onConfirm={removePost}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

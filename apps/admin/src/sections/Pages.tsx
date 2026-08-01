import { useEffect, useState } from "react";
import { api, type AdminPost } from "../lib/api";
import { siteUrl } from "../lib/site-url";
import { formatTimestamp } from "../lib/format-timestamp";
import { navigate } from "../lib/router";
import { ConfirmButton } from "../components/ConfirmButton";

/**
 * Pages admin screen — same shape as `Posts.tsx`, backed by the pages-filtered
 * endpoints (`GET/POST .../pages`). A page is a `post` row with `kind: "page"`
 * (see `features/post/post.ts`), so it's edited through the same `PostEditor`
 * reached via `/admin/posts/{id}`.
 */
export function Pages() {
  const [pages, setPages] = useState<AdminPost[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    api
      .listPages()
      .then((r) => setPages(r.posts.map((entry) => entry.post)))
      .catch((e) => setError(e instanceof Error ? e.message : "failed to load pages"));
  }, []);

  async function createPage() {
    setCreating(true);
    setError(null);
    try {
      const { post } = await api.createPage("Untitled");
      navigate(`/posts/${post.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to create page");
      setCreating(false);
    }
  }

  /** Soft delete: `api.deletePage` does hit a soft-delete route that is genuinely revertible
   * server-side (see api.ts's own doc on deletePage) — but the confirm copy below states only the
   * observable consequence and does NOT claim recoverability. There is no restore path an
   * operator can reach from this product today (no change-set-revert UI, no api.ts method for it;
   * `Recovery.tsx` is a different, much heavier whole-database snapshot restore, not a per-row
   * undo). Promising an undo the operator cannot actually perform would be worse than promising
   * nothing. Equally, do not swap it for "permanently delete" / "cannot be undone" — that
   * overcorrects into the opposite lie, since the row genuinely is recoverable server-side, just
   * not from here. On success the row is dropped from local state rather than a full reload,
   * matching this screen's existing preference for optimistic-from-response local updates.
   *
   * Confirmation now gates via `ConfirmButton`'s two-click in-place control, not `window.confirm`
   * (MSG-03) — this screen's per-page Delete column was the same "wall of red" problem as
   * `Posts.tsx`'s twin (full `.btn-danger` styling on every row at rest, before any decision was
   * made). The disclosure that used to live only in the `window.confirm` dialog text now lives in
   * the button's `aria-label`, reaching the operator up front rather than only after they've
   * already clicked Delete once. */
  async function removePage(page: AdminPost) {
    setDeletingId(page.id);
    setError(null);
    try {
      await api.deletePage(page.id);
      setPages((prev) => (prev ? prev.filter((p) => p.id !== page.id) : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to delete page");
    } finally {
      setDeletingId(null);
    }
  }

  // `error && !pages` (not just `error`), matching Media.tsx/Comments.tsx: once the list has
  // loaded, a later failure (create, delete) surfaces as an inline banner above the table instead
  // of blanking out the whole screen behind it.
  if (error && !pages) return <div className="notice error">{error}</div>;
  if (!pages) return <div className="notice">Loading pages…</div>;

  return (
    <div>
      <div className="editor-header">
        <h1>Pages</h1>
        <button onClick={createPage} disabled={creating}>
          {creating ? "Creating…" : "New Page"}
        </button>
      </div>
      {error ? <div className="notice error">{error}</div> : null}
      {pages.length === 0 ? (
        // Previously an empty `<table>` — headers, zero rows, no message at all (audit Minor
        // finding: this screen shares `Posts.tsx`'s exact data shape but had drifted from its
        // sibling's empty-state treatment). Reuses the already-existing `.card`/`.empty-state`
        // classes `Posts.tsx` established for this same situation, rather than adding new ones —
        // `styles.css` is locked to a concurrently-editing agent for this dispatch. Only the
        // empty-state block is ported, not the rest of `Posts.tsx`'s newer `.page`/`.table-scroll`
        // layout — that broader restyle belongs with the shell's own in-flight visual pass.
        <div className="card">
          <div className="empty-state">
            <p>No pages yet.</p>
            <p className="page-description">Create your first page to get started.</p>
          </div>
        </div>
      ) : (
        <table className="list-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Slug</th>
              <th>Status</th>
              <th>Updated</th>
              <th>v</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pages.map((page) => (
              <tr key={page.id}>
                <td>
                  <a href={`/admin/posts/${page.id}`}>{page.title}</a>
                </td>
                <td>
                  <a href={siteUrl(`/${page.slug}`)} target="_blank" rel="noreferrer">
                    /{page.slug}
                  </a>
                </td>
                <td>
                  <span className={`status status-${page.status}`}>{page.status}</span>
                </td>
                <td>{formatTimestamp(page.updatedAt)}</td>
                <td>{page.version}</td>
                <td>
                  <ConfirmButton
                    label="Delete"
                    confirmLabel="Confirm delete"
                    destructive
                    pending={deletingId === page.id}
                    onConfirm={() => removePage(page)}
                    ariaLabel={`Move "${page.title}" to trash — it will disappear from the site and from this list`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

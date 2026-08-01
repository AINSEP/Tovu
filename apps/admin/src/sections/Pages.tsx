import { useEffect, useState } from "react";
import { api, type AdminPost } from "../lib/api";
import { siteUrl } from "../lib/site-url";
import { formatTimestamp } from "../lib/format-timestamp";
import { navigate } from "../lib/router";
import { RowMenu, type RowMenuItem } from "../components/RowMenu";
import { ConfirmDialog } from "../components/ConfirmDialog";

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
  // In-flight row action (Disable or the confirmed Delete) — one at a time, same `rowSavingId`
  // convention `Roles.tsx`'s `onDeleteRole` already uses, per `ConfirmButton`'s own doc comment.
  const [rowSavingId, setRowSavingId] = useState<string | null>(null);
  // The page a `RowMenu` "Delete" selection is asking to confirm — `null` when the dialog is
  // closed. `ConfirmDialog` stays mounted unconditionally below (see its own doc comment on why);
  // this is what drives its `open` prop.
  const [pendingDelete, setPendingDelete] = useState<AdminPost | null>(null);

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

  /** Unpublishes so the row is no longer publicly viewable — a reversible, access-affecting
   *  action (not destructive: no `ConfirmDialog`, matching `ConfirmButton`'s own warning-vs-
   *  destructive distinction). Only ever called for a `status === "published"` row — `RowMenu`'s
   *  item list below omits "Disable" entirely once a page is already a draft, rather than
   *  rendering it disabled with no explanation. */
  async function disablePage(page: AdminPost) {
    setRowSavingId(page.id);
    setError(null);
    try {
      const { post: updated } = await api.updatePost({ id: page.id }, { status: "draft" });
      setPages((prev) => (prev ? prev.map((p) => (p.id === updated.id ? updated : p)) : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to disable page");
    } finally {
      setRowSavingId(null);
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
   * Confirmation now gates via a `ConfirmDialog` modal, reached through `RowMenu`'s "Delete" item,
   * rather than `ConfirmButton`'s in-place two-click control or `window.confirm` — a further
   * upgrade over MSG-03's `ConfirmButton` pass on this same screen's twin (`Posts.tsx`): that
   * component was itself chosen at the time because `styles.css` was locked to a concurrently-
   * editing agent and a modal needed new markup/CSS this pass could not add (see
   * `ConfirmButton.tsx`'s own file header). Neither constraint holds for this dispatch, and a
   * modal disclosure ("Move "X" to trash? It will disappear from the site and from this list.")
   * reads as a deliberate decision point rather than a label change on a button already sitting in
   * a menu the operator just opened. */
  async function removePage() {
    if (!pendingDelete) return;
    const page = pendingDelete;
    setRowSavingId(page.id);
    setError(null);
    try {
      await api.deletePage(page.id);
      setPages((prev) => (prev ? prev.filter((p) => p.id !== page.id) : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to delete page");
    } finally {
      setRowSavingId(null);
      setPendingDelete(null);
    }
  }

  function rowMenuItems(page: AdminPost): RowMenuItem[] {
    const items: RowMenuItem[] = [{ key: "edit", label: "Edit", onSelect: () => navigate(`/posts/${page.id}`) }];
    if (page.status === "published") {
      items.push({ key: "disable", label: "Disable", onSelect: () => disablePage(page) });
    }
    items.push({ key: "delete", label: "Delete", destructive: true, onSelect: () => setPendingDelete(page) });
    return items;
  }

  // `error && !pages` (not just `error`), matching Media.tsx/Comments.tsx: once the list has
  // loaded, a later failure (create, delete) surfaces as an inline banner above the table instead
  // of blanking out the whole screen behind it.
  if (error && !pages) return <div className="notice error">{error}</div>;
  if (!pages) return <div className="notice">Loading pages…</div>;

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">Content</p>
          <h1 className="page-title">Pages</h1>
          <p className="page-description">Manage every standalone page on this site.</p>
        </div>
        <div className="page-actions">
          <button onClick={createPage} disabled={creating}>
            {creating ? "Creating…" : "New Page"}
          </button>
        </div>
      </div>
      {error ? <div className="notice error">{error}</div> : null}
      {pages.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <p>No pages yet.</p>
            <p className="page-description">Create your first page to get started.</p>
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
                  <td>
                    <RowMenu triggerLabel={`Actions for "${page.title}"`} items={rowMenuItems(page)} />
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
        onConfirm={removePage}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

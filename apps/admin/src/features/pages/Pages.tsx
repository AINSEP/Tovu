import { DataTable, RowMenu, ConfirmDialog } from "@jini-ai/admin/react";

import { siteUrl } from "../../lib/site-url";
import { formatTimestamp } from "../../lib/format-timestamp";
import { navigate } from "../../lib/router";
import { pageRowMenuItems } from "./rules";
import { usePages } from "./hooks/use-pages.hooks";

/**
 * @file The Pages list screen — markup only.
 *
 * State and API calls live in `hooks/use-pages.hooks.ts`; the row-menu logic lives in `rules.ts`.
 * What stays here is what actually renders: column definitions, the empty state, and the confirm
 * copy. Mirrors `features/posts/Posts.tsx` exactly, since this screen is `Posts.tsx`'s twin,
 * backed by the pages-filtered endpoints (`GET/POST .../pages`). A page is a `post` row with
 * `kind: "page"` (see `features/post/post.ts`), so it's edited through the same `PostEditor`
 * reached via `/admin/posts/{id}`.
 */
export interface PagesProps {
  /**
   * Dependency injection seam for tests — the same convention `@jini-ai/ui`'s `CustomSelect` uses
   * for `useCustomSelect`, and `features/posts/Posts.tsx`'s `usePostsHook`.
   *
   * Defaulted to the real hook, so production callers (`panels.tsx`) pass nothing and behave
   * exactly as before. A test supplies a stub and drives this component through any state —
   * mid-delete, load failure, empty list — without module mocking, a fake `fetch`, or waiting on a
   * real request. That matters here specifically: this screen has no unit test today.
   */
  usePagesHook?: typeof usePages;
}

export function Pages({ usePagesHook = usePages }: PagesProps = {}) {
  const {
    pages,
    error,
    creating,
    rowSavingId,
    pendingDelete,
    setPendingDelete,
    createPage,
    disablePage,
    removePage,
  } = usePagesHook();

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
      <DataTable
        rows={pages}
        rowKey={(page) => page.id}
        empty={
          <div className="card">
            <div className="empty-state">
              <p>No pages yet.</p>
              <p className="page-description">Create your first page to get started.</p>
            </div>
          </div>
        }
        columns={[
          { key: "title", header: "Title", cell: (page) => <a href={`/admin/pages/${page.id}`}>{page.title}</a> },
          {
            key: "slug",
            header: "Slug",
            cell: (page) => (
              <a href={siteUrl(`/${page.slug}`)} target="_blank" rel="noreferrer">
                /{page.slug}
              </a>
            ),
          },
          {
            key: "status",
            header: "Status",
            cell: (page) => <span className={`status status-${page.status}`}>{page.status}</span>,
          },
          { key: "updated", header: "Updated", cell: (page) => formatTimestamp(page.updatedAt) },
          {
            key: "actions",
            header: "More",
            cell: (page) => (
              <RowMenu
                triggerLabel={`Actions for "${page.title}"`}
                items={pageRowMenuItems(page, {
                  onEdit: (p) => navigate(`/pages/${p.id}`),
                  onDisable: disablePage,
                  onDelete: setPendingDelete,
                })}
              />
            ),
          },
        ]}
      />
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

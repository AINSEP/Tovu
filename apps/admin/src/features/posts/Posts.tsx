import { DataTable, RowMenu, ConfirmDialog } from "@jini-ai/admin/react";

import { siteUrl } from "../../lib/site-url";
import { formatTimestamp } from "../../lib/format-timestamp";
import { navigate } from "../../lib/router";
import { postRowMenuItems } from "./rules";
import { usePosts } from "./hooks/use-posts.hooks";

/**
 * @file The Posts list screen — markup only.
 *
 * State and API calls live in `hooks/use-posts.hooks.ts`; the row-menu logic lives in `rules.ts`.
 * What stays here is what actually renders: column definitions, the empty state, and the confirm
 * copy.
 */
export interface PostsProps {
  /**
   * Dependency injection seam for tests — the same convention `@jini-ai/ui`'s `CustomSelect` uses
   * for `useCustomSelect`.
   *
   * Defaulted to the real hook, so production callers (`panels.tsx`) pass nothing and behave
   * exactly as before. A test supplies a stub and drives this component through any state —
   * mid-delete, load failure, empty list — without module mocking, a fake `fetch`, or waiting on a
   * real request. That matters here specifically: this screen has no unit test today, and the
   * reason it is awkward to write one is that every state is behind an un-substitutable `api` call.
   */
  usePostsHook?: typeof usePosts;
}

export function Posts({ usePostsHook = usePosts }: PostsProps = {}) {
  const {
    posts,
    error,
    creating,
    rowSavingId,
    pendingDelete,
    setPendingDelete,
    createPost,
    disablePost,
    removePost,
  } = usePostsHook();

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
      <DataTable
        rows={posts}
        rowKey={(post) => post.id}
        empty={
          <div className="card">
            <div className="empty-state">
              <p>No posts yet.</p>
              <p className="page-description">Create your first post to get started.</p>
            </div>
          </div>
        }
        columns={[
          { key: "title", header: "Title", cell: (post) => <a href={`/admin/posts/${post.id}`}>{post.title}</a> },
          {
            key: "slug",
            header: "Slug",
            cell: (post) => (
              <a href={siteUrl(`/${post.slug}`)} target="_blank" rel="noreferrer">
                /{post.slug}
              </a>
            ),
          },
          {
            key: "status",
            header: "Status",
            cell: (post) => <span className={`status status-${post.status}`}>{post.status}</span>,
          },
          { key: "updated", header: "Updated", cell: (post) => formatTimestamp(post.updatedAt) },
          {
            key: "actions",
            header: "More",
            cell: (post) => (
              <RowMenu
                triggerLabel={`Actions for "${post.title}"`}
                items={postRowMenuItems(post, {
                  onEdit: (p) => navigate(`/posts/${p.id}`),
                  onDisable: disablePost,
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
        onConfirm={removePost}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

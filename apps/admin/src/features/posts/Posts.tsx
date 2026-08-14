import { DataTable, RowMenu, ConfirmDialog } from "@jini-ai/admin/react";
import { useState, type ReactNode } from "react";

import type { AdminPost } from "../../lib/api";
import { siteUrl } from "../../lib/site-url";
import { formatTimestamp } from "../../lib/format-timestamp";
import { navigate } from "../../lib/router";
import { postRowMenuItems, sortPostsByUpdated, updatedSortButtonLabel, type PostUpdatedSortDirection } from "./rules";
import { useWiredPosts } from "./hooks/use-posts.hooks";
import { useWiredAdminLocale } from "../../hooks/use-admin-locale.hooks";
import { POSTS_DICT } from "./posts-i18n";

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
  usePostsHook?: typeof useWiredPosts;
}

/**
 * The loading/error guard shown before the table has anything to render — pulled out of `Posts`
 * (2026-08-06, complexity pass, fourth pass) so its two early-return checks collapse into one
 * `if` at the call site. `error && !posts` (not just `error`): once the list has loaded, a later
 * failure (create, delete) surfaces as an inline banner above the table instead of blanking the
 * whole screen — matches Pages.tsx/Media.tsx/Comments.tsx. Mirrors `Pages.tsx`'s identical
 * `pagesListNotice`.
 */
export function postsListNotice(posts: AdminPost[] | null, error: string | null): ReactNode {
  if (error && !posts) return <div className="notice error">{error}</div>;
  if (!posts) return <div className="notice">Loading posts…</div>;
  return null;
}

export function Posts({ usePostsHook = useWiredPosts }: PostsProps) {
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
  const locale = useWiredAdminLocale();
  const t = (key: string): string => POSTS_DICT[locale]?.[key] ?? key;
  // Owner ruling (2026-08-14): pure interactive DOM-chrome state — a client-side sort toggle with
  // no I/O behind it — stays LOCAL rather than moving into `use-posts.hooks.ts`, unlike every other
  // piece of state on this screen. The line to draw: async/API/data state always moves into the
  // hook; view-only chrome (active tab, expanded/collapsed, dialog open, sort direction) stays here
  // UNLESS a test needs to observe it. `Posts.tsx` is the file everyone else copies this pattern
  // from (this file's own `PostsProps` doc comment) — this is the canonical example of the
  // exception, not an oversight to "finish" later.
  const [updatedSort, setUpdatedSort] = useState<PostUpdatedSortDirection>("newest");

  const notice = postsListNotice(posts, error);
  if (notice) return notice;
  // Unreachable in practice — `postsListNotice` already returns a non-null notice whenever `posts`
  // is null — but restores the narrowing TS lost by moving that check behind a function call, so
  // `rows={posts}` below type-checks as `AdminPost[]` without an `as`/`!` assertion.
  if (!posts) return null;

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">{t("Content")}</p>
          <h1 className="page-title">{t("Posts")}</h1>
          <p className="page-description">{t("Manage and publish every post on this site.")}</p>
        </div>
        <div className="page-actions">
          <button onClick={createPost} disabled={creating}>
            {creating ? t("Creating…") : t("New Post")}
          </button>
        </div>
      </div>
      {error ? <div className="notice error">{error}</div> : null}
      <DataTable
        rows={sortPostsByUpdated(posts, updatedSort)}
        rowKey={(post) => post.id}
        empty={
          <div className="card">
            <div className="empty-state">
              <p>{t("No posts yet.")}</p>
              <p className="page-description">{t("Create your first post to get started.")}</p>
            </div>
          </div>
        }
        columns={[
          { key: "title", header: t("Title"), cell: (post) => <a href={`/admin/posts/${post.slug}`}>{post.title}</a> },
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
            header: t("Status"),
            cell: (post) => <span className={`status status-${post.status}`}>{post.status}</span>,
          },
          {
            key: "updated",
            // Sortable header (2026-08-10): a plain button toggling `updatedSort` between newest-
            // and oldest-first, defaulting to newest — `DataTable`'s `<th>` doesn't expose an
            // `aria-sort` prop (see its own file header: "no sorting" was a deliberate scope cut for
            // that shared component), so the accessible state lives on this button's own
            // `aria-label` instead (`updatedSortButtonLabel`), not just the ▲/▼ glyph, which is
            // `aria-hidden`.
            header: (
              <button
                type="button"
                className="sortable-column-header"
                onClick={() => setUpdatedSort((d) => (d === "newest" ? "oldest" : "newest"))}
                aria-label={updatedSortButtonLabel(updatedSort)}
              >
                {t("Updated")}
                <span aria-hidden="true">{updatedSort === "newest" ? " ▼" : " ▲"}</span>
              </button>
            ),
            cell: (post) => formatTimestamp(post.updatedAt),
          },
          {
            key: "actions",
            header: t("More"),
            cell: (post) => (
              <RowMenu
                triggerLabel={`Actions for "${post.title}"`}
                items={postRowMenuItems(
                  post,
                  {
                    onEdit: (p) => navigate(`/posts/${p.slug}`),
                    onDisable: disablePost,
                    onDelete: setPendingDelete,
                  },
                  locale,
                )}
              />
            ),
          },
        ]}
      />
      <ConfirmDialog
        open={pendingDelete !== null}
        title={t("Move to trash?")}
        body={
          pendingDelete ? (
            <p>
              {t("Move")} &quot;{pendingDelete.title}&quot; {t("to trash? It will disappear from the site and from this list.")}
            </p>
          ) : null
        }
        confirmLabel={t("Move to trash")}
        destructive
        pending={pendingDelete !== null && rowSavingId === pendingDelete.id}
        onConfirm={removePost}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
